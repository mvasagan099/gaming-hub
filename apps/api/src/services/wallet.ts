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
 */
export async function applyTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  referenceType: TransactionReferenceType,
  referenceId: string | null,
  meta: Record<string, unknown> = {},
): Promise<Wallet> {
  const wallet = await tx.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    throw new AppError("NOT_FOUND", "Wallet not found", 404);
  }

  const newBalance = wallet.balance + amount;
  if (newBalance < 0) {
    throw new AppError("INSUFFICIENT_BALANCE", "Insufficient balance");
  }

  await tx.wallet.update({
    where: { userId },
    data: { balance: newBalance },
  });

  await tx.transaction.create({
    data: {
      userId,
      type: (amount < 0 ? "DEBIT" : "CREDIT") as TransactionType,
      amount: Math.abs(amount),
      balanceAfter: newBalance,
      referenceType,
      referenceId,
      meta: meta as Prisma.InputJsonValue,
    },
  });

  return { userId, balance: newBalance, updatedAt: wallet.updatedAt };
}

export async function assertSufficientBalance(userId: string, stake: number): Promise<void> {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet || wallet.balance < stake) {
    throw new AppError("INSUFFICIENT_BALANCE", "Insufficient balance to join this match");
  }
}
