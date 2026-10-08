import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { WalletTransactionService } from "./walletTransactionService";
import { IdempotencyService } from "./idempotencyService";
import { audit } from "./audit";

export interface AdminAdjustParams {
  adminId: string;
  targetUserId: string;
  amount: number;
  reason: string;
  idempotencyKey?: string;
}

export class AdminWalletService {
  /**
   * 1. Get detailed user wallet breakdown for administrators.
   */
  static async getUserWalletDetails(targetUserId: string) {
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        wallet: true,
        profile: true,
      },
    });

    if (!user || !user.wallet) {
      throw new AppError("NOT_FOUND", "User or user wallet not found", 404);
    }

    const [transactions, creditAgg, debitAgg, count] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: targetUserId },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.transaction.aggregate({
        where: { userId: targetUserId, type: "CREDIT" },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { userId: targetUserId, type: "DEBIT" },
        _sum: { amount: true },
      }),
      prisma.transaction.count({
        where: { userId: targetUserId },
      }),
    ]);

    return {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        isOnline: user.isOnline,
        isFrozen: user.wallet.isFrozen,
      },
      wallet: {
        balance: user.wallet.balance,
        bonusBalance: user.wallet.bonusBalance,
        lockedBalance: user.wallet.lockedBalance,
        rewardBalance: user.wallet.rewardBalance,
        cashbackBalance: user.wallet.cashbackBalance,
        updatedAt: user.wallet.updatedAt.toISOString(),
      },
      stats: {
        totalCredits: creditAgg._sum.amount ?? 0,
        totalDebits: debitAgg._sum.amount ?? 0,
        transactionCount: count,
      },
      recentTransactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        referenceType: t.referenceType,
        referenceId: t.referenceId,
        balanceBefore: t.balanceBefore,
        balanceAfter: t.balanceAfter,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  }

  /**
   * 2. Adjust user wallet balance with strict idempotency and audit logs.
   */
  static async adjustWallet(params: AdminAdjustParams) {
    if (!params.reason || params.reason.trim().length < 3) {
      throw new AppError("VALIDATION_ERROR", "A valid reason (minimum 3 characters) is required for manual adjustments", 400);
    }
    if (params.amount === 0) {
      throw new AppError("VALIDATION_ERROR", "Adjustment amount cannot be zero", 400);
    }

    const trimmedReason = params.reason.trim();
    const key = params.idempotencyKey
      ? `ADMIN_ADJUST:${params.adminId}:${params.idempotencyKey}`
      : `ADMIN_ADJUST:${params.adminId}:${params.targetUserId}:${Date.now()}`;

    return IdempotencyService.executeOnce({
      key,
      operation: "ADMIN_ADJUSTMENT",
      userId: params.adminId,
      referenceId: params.targetUserId,
      handler: async (tx) => {
        let wallet = await tx.wallet.findUnique({
          where: { userId: params.targetUserId },
        });

        if (!wallet) {
          const userExists = await tx.user.findUnique({
            where: { id: params.targetUserId },
          });
          if (!userExists) {
            throw new AppError("NOT_FOUND", "Target user not found", 404);
          }
          wallet = await tx.wallet.create({
            data: { userId: params.targetUserId, balance: 0 },
          });
        }

        // Guard against negative balance on debit
        if (params.amount < 0 && wallet.balance < Math.abs(params.amount)) {
          throw new AppError(
            "INSUFFICIENT_BALANCE",
            `Cannot debit ${Math.abs(params.amount)} coins: User only has ${wallet.balance} coins`,
            400,
          );
        }

        const updatedWallet = await WalletTransactionService.createAdminAdjustment(tx, {
          userId: params.targetUserId,
          amount: params.amount,
          reason: trimmedReason,
          adminId: params.adminId,
        });

        audit({
          actorType: "user",
          actorId: params.adminId,
          action: "admin.wallet.adjust",
          category: "admin",
          targetType: "user",
          targetId: params.targetUserId,
          meta: {
            amount: params.amount,
            reason: trimmedReason,
            balanceBefore: wallet.balance,
            balanceAfter: updatedWallet.balance,
          },
        });

        return {
          ok: true,
          userId: params.targetUserId,
          amount: params.amount,
          direction: params.amount > 0 ? "CREDIT" : "DEBIT",
          balanceBefore: wallet.balance,
          balanceAfter: updatedWallet.balance,
          reason: trimmedReason,
          adjustedBy: params.adminId,
        };
      },
    });
  }

  /**
   * 3. Search transactions platform-wide.
   */
  static async searchAllTransactions(params: {
    query?: string;
    userId?: string;
    referenceType?: string;
    type?: "CREDIT" | "DEBIT";
    dateFrom?: Date | string;
    dateTo?: Date | string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, params.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};

    if (params.userId) {
      where.userId = params.userId;
    }
    if (params.type) {
      where.type = params.type;
    }
    if (params.referenceType) {
      where.referenceType = params.referenceType;
    }
    if (params.dateFrom || params.dateTo) {
      const createdAtFilter: Record<string, Date> = {};
      if (params.dateFrom) createdAtFilter.gte = new Date(params.dateFrom);
      if (params.dateTo) createdAtFilter.lte = new Date(params.dateTo);
      where.createdAt = createdAtFilter;
    }
    if (params.query) {
      where.OR = [
        { id: { contains: params.query } },
        { referenceId: { contains: params.query } },
        { user: { username: { contains: params.query } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: { user: { select: { username: true, displayName: true } } },
      }),
      prisma.transaction.count({ where }),
    ]);

    return {
      items: items.map((t) => ({
        id: t.id,
        userId: t.userId,
        username: t.user.username,
        displayName: t.user.displayName,
        type: t.type,
        amount: t.amount,
        referenceType: t.referenceType,
        referenceId: t.referenceId,
        balanceBefore: t.balanceBefore,
        balanceAfter: t.balanceAfter,
        createdAt: t.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
