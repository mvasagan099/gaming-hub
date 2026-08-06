import { prisma } from "@gaming-hub/db";
import type { Prisma, Wallet } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type {
  TransactionReferenceType,
  TransactionType,
  WalletBalanceType,
} from "@gaming-hub/shared";
import { audit } from "./audit";
import { getCategorySettings } from "./settings";

const BALANCE_FIELD: Record<WalletBalanceType, keyof Pick<Wallet, "balance" | "bonusBalance" | "lockedBalance" | "rewardBalance" | "cashbackBalance">> = {
  MAIN: "balance",
  BONUS: "bonusBalance",
  LOCKED: "lockedBalance",
  REWARD: "rewardBalance",
  CASHBACK: "cashbackBalance",
};

export async function getWallet(userId: string): Promise<Wallet> {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    throw new AppError("NOT_FOUND", "Wallet not found", 404);
  }
  return wallet;
}

export async function listTransactions(
  userId: string,
  page: number,
  pageSize: number,
  walletType?: WalletBalanceType,
  referenceType?: TransactionReferenceType,
) {
  const where = {
    userId,
    ...(walletType ? { walletType } : {}),
    ...(referenceType ? { referenceType } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    items: items.map((t) => ({
      id: t.id,
      userId: t.userId,
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      walletType: t.walletType,
      referenceType: t.referenceType,
      referenceId: t.referenceId,
      meta: t.meta,
      createdAt: t.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}

/**
 * Atomic balance mutation on a specific wallet balance. Returns the updated
 * wallet. `amount` is positive for credits and negative for debits.
 *
 * Uses a guarded `updateMany` so concurrent debits cannot double-spend: only
 * one in-flight transaction can satisfy the balance guard, the rest fail with
 * INSUFFICIENT_BALANCE.
 */
export async function applyTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  referenceType: TransactionReferenceType,
  referenceId: string | null,
  meta: Record<string, unknown> = {},
  walletType: WalletBalanceType = "MAIN",
): Promise<Wallet> {
  const isDebit = amount < 0;
  const field = BALANCE_FIELD[walletType];

  if (referenceType === "ADMIN" && !isDebit && walletType === "MAIN") {
    const walletLimits = await getCategorySettings("wallet");
    const absAmount = Math.abs(amount);
    if (absAmount < walletLimits.minDeposit) {
      throw new AppError(
        "WALLET_LIMIT_EXCEEDED",
        `Minimum deposit is ${walletLimits.minDeposit}`,
        400,
      );
    }
    if (walletLimits.maxDeposit > 0 && absAmount > walletLimits.maxDeposit) {
      throw new AppError(
        "WALLET_LIMIT_EXCEEDED",
        `Maximum deposit is ${walletLimits.maxDeposit}`,
        400,
      );
    }
  }

  if (referenceType === "ADMIN" && isDebit && walletType === "MAIN") {
    const walletLimits = await getCategorySettings("wallet");
    const absAmount = Math.abs(amount);
    if (absAmount < walletLimits.minWithdrawal) {
      throw new AppError(
        "WALLET_LIMIT_EXCEEDED",
        `Minimum withdrawal is ${walletLimits.minWithdrawal}`,
        400,
      );
    }
    if (walletLimits.maxWithdrawal > 0 && absAmount > walletLimits.maxWithdrawal) {
      throw new AppError(
        "WALLET_LIMIT_EXCEEDED",
        `Maximum withdrawal is ${walletLimits.maxWithdrawal}`,
        400,
      );
    }
  }

  const result = await tx.wallet.updateMany({
    where: { userId, ...(isDebit ? { [field]: { gte: -amount } } : {}) },
    data: { [field]: { increment: amount } },
  });

  if (result.count === 0) {
    const exists = await tx.wallet.findUnique({ where: { userId }, select: { userId: true } });
    if (!exists) {
      throw new AppError("NOT_FOUND", "Wallet not found", 404);
    }
    audit({
      actorType: "user",
      actorId: userId,
      action: "wallet.transaction.rejected",
      category: "wallet",
      targetType: "user",
      targetId: userId,
      meta: {
        amount,
        walletType,
        referenceType,
        referenceId,
        reason: "insufficient_balance",
      },
    });
    throw new AppError("INSUFFICIENT_BALANCE", "Insufficient balance");
  }

  const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

  await tx.transaction.create({
    data: {
      userId,
      type: (isDebit ? "DEBIT" : "CREDIT") as TransactionType,
      amount: Math.abs(amount),
      balanceAfter: wallet[field],
      walletType,
      referenceType,
      referenceId,
      meta: meta as Prisma.InputJsonValue,
    },
  });

  audit({
    actorType: "user",
    actorId: userId,
    action: "wallet.transaction.created",
    category: "wallet",
    targetType: "user",
    targetId: userId,
    meta: {
      type: isDebit ? "DEBIT" : "CREDIT",
      amount: Math.abs(amount),
      walletType,
      balanceAfter: wallet[field],
      referenceType,
      referenceId,
      ...meta,
    },
  });

  return wallet;
}

export async function assertSufficientBalance(userId: string, stake: number): Promise<void> {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet || wallet.balance < stake) {
    throw new AppError("INSUFFICIENT_BALANCE", "Insufficient balance to join this match");
  }
}

export interface PracticeRewardResult {
  claimed: boolean;
  amount: number;
  balance: number;
  remainingToday: number;
}

export async function claimPracticeReward(
  userId: string,
  gameId: string,
): Promise<PracticeRewardResult> {
  const gameSettings = await getCategorySettings("game");

  if (!gameSettings.practiceModeEnabled) {
    throw new AppError("FEATURE_DISABLED", "Practice mode is currently disabled", 403);
  }

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const daily = await prisma.transaction.aggregate({
    where: { userId, referenceType: "PRACTICE", createdAt: { gte: todayStart } },
    _sum: { amount: true },
  });
  const earned = daily._sum.amount ?? 0;

  if (earned >= gameSettings.practiceDailyLimit) {
    return {
      claimed: false,
      amount: 0,
      balance: (await getWallet(userId)).balance,
      remainingToday: 0,
    };
  }

  const wallet = await prisma.$transaction(async (tx) => {
    return applyTransaction(tx, userId, gameSettings.practiceRewardAmount, "PRACTICE", null, { gameId });
  });

  return {
    claimed: true,
    amount: gameSettings.practiceRewardAmount,
    balance: wallet.balance,
    remainingToday: Math.max(0, gameSettings.practiceDailyLimit - earned - gameSettings.practiceRewardAmount),
  };
}
