import { prisma } from "@gaming-hub/db";
import type { Prisma, Wallet } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type { TransactionReferenceType, TransactionType } from "@gaming-hub/shared";

export async function getWallet(userId: string): Promise<Wallet> {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    throw new AppError("NOT_FOUND", "Wallet not found", 404);
  }
  return wallet;
}

export async function listTransactions(userId: string, page: number, pageSize: number) {
  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where: { userId } }),
  ]);

  return {
    items: items.map((t) => ({
      id: t.id,
      userId: t.userId,
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
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
 * Atomic balance mutation. Returns the updated wallet.
 * `amount` is positive for credits and negative for debits.
 *
 * Uses a guarded `updateMany` (`balance + amount` with `balance >= -amount`)
 * so concurrent debits cannot double-spend: only one in-flight transaction
 * can satisfy the balance guard, the rest fail with INSUFFICIENT_BALANCE.
 */
export async function applyTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  referenceType: TransactionReferenceType,
  referenceId: string | null,
  meta: Record<string, unknown> = {},
): Promise<Wallet> {
  const isDebit = amount < 0;
  const result = await tx.wallet.updateMany({
    where: { userId, ...(isDebit ? { balance: { gte: -amount } } : {}) },
    data: { balance: { increment: amount } },
  });

  if (result.count === 0) {
    const exists = await tx.wallet.findUnique({ where: { userId }, select: { userId: true } });
    if (!exists) {
      throw new AppError("NOT_FOUND", "Wallet not found", 404);
    }
    throw new AppError("INSUFFICIENT_BALANCE", "Insufficient balance");
  }

  const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });

  await tx.transaction.create({
    data: {
      userId,
      type: (isDebit ? "DEBIT" : "CREDIT") as TransactionType,
      amount: Math.abs(amount),
      balanceAfter: wallet.balance,
      referenceType,
      referenceId,
      meta: meta as Prisma.InputJsonValue,
    },
  });

  return { userId, balance: wallet.balance, updatedAt: wallet.updatedAt };
}

export async function assertSufficientBalance(userId: string, stake: number): Promise<void> {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet || wallet.balance < stake) {
    throw new AppError("INSUFFICIENT_BALANCE", "Insufficient balance to join this match");
  }
}

export const PRACTICE_REWARD_AMOUNT = 50;
export const PRACTICE_DAILY_LIMIT = 200;

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
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const daily = await prisma.transaction.aggregate({
    where: { userId, referenceType: "PRACTICE", createdAt: { gte: todayStart } },
    _sum: { amount: true },
  });
  const earned = daily._sum.amount ?? 0;

  if (earned >= PRACTICE_DAILY_LIMIT) {
    return {
      claimed: false,
      amount: 0,
      balance: (await getWallet(userId)).balance,
      remainingToday: 0,
    };
  }

  const wallet = await prisma.$transaction(async (tx) => {
    return applyTransaction(tx, userId, PRACTICE_REWARD_AMOUNT, "PRACTICE", null, { gameId });
  });

  return {
    claimed: true,
    amount: PRACTICE_REWARD_AMOUNT,
    balance: wallet.balance,
    remainingToday: Math.max(0, PRACTICE_DAILY_LIMIT - earned - PRACTICE_REWARD_AMOUNT),
  };
}
