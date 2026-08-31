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
import { getFeatureFlags } from "./featureFlags";

const BALANCE_FIELD: Record<WalletBalanceType, keyof Pick<Wallet, "balance" | "bonusBalance" | "lockedBalance" | "rewardBalance" | "cashbackBalance">> = {
  MAIN: "balance",
  BONUS: "bonusBalance",
  LOCKED: "lockedBalance",
  REWARD: "rewardBalance",
  CASHBACK: "cashbackBalance",
};

/**
 * Zeroes out balance types whose feature flag is disabled so users cannot see
 * bonus/locked/cashback balances once an admin turns those features off.
 */
async function maskWalletBalances(wallet: Wallet): Promise<Wallet> {
  const flags = await getFeatureFlags();
  return {
    ...wallet,
    bonusBalance: flags["payments.bonusWallet"] === false ? 0 : wallet.bonusBalance,
    lockedBalance: flags["payments.lockedWallet"] === false ? 0 : wallet.lockedBalance,
    cashbackBalance: flags["payments.cashback"] === false ? 0 : wallet.cashbackBalance,
  };
}

export async function getWallet(userId: string): Promise<Wallet> {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    throw new AppError("NOT_FOUND", "Wallet not found", 404);
  }
  return maskWalletBalances(wallet);
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
    items: items.map((t) => {
      const metaObj = (t.meta && typeof t.meta === "object" ? t.meta : {}) as Record<string, unknown>;
      const isDebit = t.type === "DEBIT";
      const balanceBefore = typeof metaObj.balanceBefore === "number"
        ? metaObj.balanceBefore
        : isDebit
          ? t.balanceAfter + t.amount
          : t.balanceAfter - t.amount;

      return {
        id: t.id,
        userId: t.userId,
        type: t.type,
        direction: (isDebit ? "DEBIT" : "CREDIT") as "CREDIT" | "DEBIT",
        amount: t.amount,
        balanceBefore,
        balanceAfter: t.balanceAfter,
        walletType: t.walletType,
        referenceType: t.referenceType,
        referenceId: t.referenceId,
        meta: t.meta,
        createdAt: t.createdAt.toISOString(),
      };
    }),
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
  const balanceAfter = wallet[field];
  const balanceBefore = balanceAfter - amount;

  const transactionMeta = {
    balanceBefore,
    balanceAfter,
    direction: isDebit ? "DEBIT" : "CREDIT",
    ...meta,
  };

  await tx.transaction.create({
    data: {
      userId,
      type: (isDebit ? "DEBIT" : "CREDIT") as TransactionType,
      amount: Math.abs(amount),
      balanceAfter,
      walletType,
      referenceType,
      referenceId,
      meta: transactionMeta as Prisma.InputJsonValue,
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
      balanceBefore,
      balanceAfter,
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
  _gameId: string,
): Promise<PracticeRewardResult> {
  const wallet = await getWallet(userId);
  return {
    claimed: false,
    amount: 0,
    balance: wallet.balance,
    remainingToday: 0,
  };
}

export async function getWalletSummary(userId: string) {
  const [wallet, deposited, withdrawn, spent, won] = await Promise.all([
    getWallet(userId),
    prisma.transaction.aggregate({
      where: { userId, referenceType: { in: ["DEPOSIT", "COUPON", "BONUS"] }, type: "CREDIT" },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, referenceType: "WITHDRAWAL" },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, referenceType: "MATCH_WAGER" },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, referenceType: "MATCH_PAYOUT" },
      _sum: { amount: true },
    }),
  ]);

  return {
    balance: wallet.balance,
    bonusBalance: wallet.bonusBalance,
    lockedBalance: wallet.lockedBalance,
    rewardBalance: wallet.rewardBalance,
    cashbackBalance: wallet.cashbackBalance,
    totalDeposited: deposited._sum.amount ?? 0,
    totalWithdrawn: withdrawn._sum.amount ?? 0,
    totalSpent: spent._sum.amount ?? 0,
    totalWon: won._sum.amount ?? 0,
  };
}

export async function transferToCouponWallet(userId: string, amount: number) {
  if (amount < 50) {
    throw new AppError("VALIDATION_ERROR", "Minimum transfer amount is 50 coins", 400);
  }

  const updatedWallet = await prisma.$transaction(async (tx) => {
    return applyTransaction(tx, userId, -amount, "WITHDRAWAL", null, {
      destination: "COUPON_WALLET",
    });
  });

  return {
    ok: true,
    transferredAmount: amount,
    newBalance: updatedWallet.balance,
  };
}
