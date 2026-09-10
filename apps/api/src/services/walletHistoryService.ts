import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type { TransactionReferenceType, TransactionType } from "@gaming-hub/shared";

export type WalletHistoryCategory =
  | "ALL"
  | "ENTRY_FEES"
  | "WINNINGS"
  | "REFUNDS"
  | "TOURNAMENT_PRIZES"
  | "BONUS"
  | "ADMIN_ADJUSTMENTS";

const CATEGORY_MAP: Record<WalletHistoryCategory, TransactionReferenceType[] | null> = {
  ALL: null,
  ENTRY_FEES: ["MATCH_WAGER", "TOURNAMENT_ENTRY"],
  WINNINGS: ["MATCH_PAYOUT"],
  REFUNDS: ["WAGER_REFUND"],
  TOURNAMENT_PRIZES: ["TOURNAMENT_PRIZE"],
  BONUS: ["BONUS", "LOCKED_CREDIT", "REWARD_CREDIT", "CASHBACK_CREDIT", "PRACTICE"],
  ADMIN_ADJUSTMENTS: ["ADMIN"],
};

export class WalletHistoryService {
  /**
   * 1. List Complete User Wallet History:
   * Provides rich, filtered, and sorted transactions with strict user isolation.
   */
  static async listUserWalletHistory(params: {
    userId: string;
    category?: WalletHistoryCategory | string;
    direction?: "CREDIT" | "DEBIT";
    dateFrom?: Date | string;
    dateTo?: Date | string;
    referenceType?: TransactionReferenceType;
    referenceId?: string;
    walletType?: string;
    sortBy?: "createdAt" | "amount";
    sortOrder?: "asc" | "desc";
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, params.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      userId: params.userId,
    };

    if (params.direction) {
      where.type = params.direction as TransactionType;
    }

    if (params.walletType) {
      where.walletType = params.walletType;
    }

    if (params.referenceId) {
      where.referenceId = params.referenceId;
    }

    // Category or referenceType filtering
    if (params.referenceType) {
      where.referenceType = params.referenceType;
    } else if (params.category && params.category !== "ALL") {
      const catRefs = CATEGORY_MAP[params.category as WalletHistoryCategory];
      if (catRefs && catRefs.length > 0) {
        where.referenceType = { in: catRefs };
      }
    }

    // Date range filtering
    if (params.dateFrom || params.dateTo) {
      const createdAtFilter: Record<string, Date> = {};
      if (params.dateFrom) {
        createdAtFilter.gte = new Date(params.dateFrom);
      }
      if (params.dateTo) {
        createdAtFilter.lte = new Date(params.dateTo);
      }
      where.createdAt = createdAtFilter;
    }

    const sortBy = params.sortBy ?? "createdAt";
    const sortOrder = params.sortOrder ?? "desc";

    const [items, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: pageSize,
      }),
      prisma.transaction.count({ where }),
    ]);

    const formattedItems = items.map((t) => {
      const metaObj = (t.meta && typeof t.meta === "object" ? t.meta : {}) as Record<string, unknown>;
      const isDebit = t.type === "DEBIT";
      const balanceBefore = typeof metaObj.balanceBefore === "number"
        ? metaObj.balanceBefore
        : isDebit
          ? t.balanceAfter + t.amount
          : t.balanceAfter - t.amount;

      // Human-readable titles & descriptions
      let title = "Wallet Transaction";
      let icon = "🪙";

      switch (t.referenceType) {
        case "MATCH_WAGER":
          title = `${metaObj.gameId ? String(metaObj.gameId).toUpperCase() : "Game"} Entry Fee`;
          icon = "♟️";
          break;
        case "MATCH_PAYOUT":
          title = `${metaObj.gameId ? String(metaObj.gameId).toUpperCase() : "Game"} Winning`;
          icon = "🏆";
          break;
        case "WAGER_REFUND":
          title = "Match Refund";
          icon = "↩️";
          break;
        case "TOURNAMENT_ENTRY":
          title = "Tournament Entry Fee";
          icon = "🎫";
          break;
        case "TOURNAMENT_PRIZE":
          title = "Tournament Prize";
          icon = "🥇";
          break;
        case "ADMIN":
          title = "Admin Balance Adjustment";
          icon = "⚙️";
          break;
        case "BONUS":
        case "PRACTICE":
          title = "Bonus Coins";
          icon = "🎁";
          break;
      }

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
        title,
        icon,
        meta: t.meta,
        createdAt: t.createdAt.toISOString(),
      };
    });

    return {
      items: formattedItems,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 2. Authoritative Wallet Summary:
   * Aggregates live balances and historical turnover without trusting client state.
   */
  static async getUserWalletSummary(userId: string) {
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new AppError("NOT_FOUND", "Wallet not found", 404);
    }

    const transactions = await prisma.transaction.findMany({
      where: { userId },
      select: {
        type: true,
        amount: true,
        referenceType: true,
      },
    });

    let totalCredits = 0;
    let totalDebits = 0;
    let totalWinnings = 0;
    let totalEntryFees = 0;
    let totalRefunds = 0;
    let totalDeposited = 0;
    let totalWithdrawn = 0;
    let totalSpent = 0;
    let totalWon = 0;

    for (const t of transactions) {
      if (t.type === "CREDIT") {
        totalCredits += t.amount;
        if (t.referenceType === "MATCH_PAYOUT" || t.referenceType === "TOURNAMENT_PRIZE") {
          totalWinnings += t.amount;
          totalWon += t.amount;
        } else if (t.referenceType === "WAGER_REFUND") {
          totalRefunds += t.amount;
        } else if (t.referenceType === "DEPOSIT" || t.referenceType === "COUPON" || t.referenceType === "BONUS") {
          totalDeposited += t.amount;
        }
      } else if (t.type === "DEBIT") {
        totalDebits += t.amount;
        if (t.referenceType === "MATCH_WAGER" || t.referenceType === "TOURNAMENT_ENTRY") {
          totalEntryFees += t.amount;
          totalSpent += t.amount;
        } else if (t.referenceType === "WITHDRAWAL") {
          totalWithdrawn += t.amount;
        }
      }
    }

    return {
      balance: wallet.balance,
      bonusBalance: wallet.bonusBalance,
      lockedBalance: wallet.lockedBalance,
      rewardBalance: wallet.rewardBalance,
      cashbackBalance: wallet.cashbackBalance,
      totalCredits,
      totalDebits,
      totalWinnings,
      totalEntryFees,
      totalRefunds,
      totalDeposited,
      totalWithdrawn,
      totalSpent,
      totalWon,
      transactionCount: transactions.length,
    };
  }

  /**
   * 3. Single Transaction Details:
   * Returns individual transaction with verified ownership and linked game / tournament navigation data.
   */
  static async getTransactionDetails(userId: string, transactionId: string) {
    const t = await prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!t || t.userId !== userId) {
      throw new AppError("NOT_FOUND", "Transaction not found", 404);
    }

    const metaObj = (t.meta && typeof t.meta === "object" ? t.meta : {}) as Record<string, unknown>;
    const isDebit = t.type === "DEBIT";
    const balanceBefore = typeof metaObj.balanceBefore === "number"
      ? metaObj.balanceBefore
      : isDebit
        ? t.balanceAfter + t.amount
        : t.balanceAfter - t.amount;

    let referenceData: Record<string, unknown> | null = null;

    if (t.referenceId && (t.referenceType === "MATCH_WAGER" || t.referenceType === "MATCH_PAYOUT" || t.referenceType === "WAGER_REFUND")) {
      const match = await prisma.match.findUnique({
        where: { id: t.referenceId },
        select: { id: true, gameId: true, status: true, startedAt: true, endedAt: true },
      });
      if (match) referenceData = { match };
    } else if (t.referenceId && (t.referenceType === "TOURNAMENT_ENTRY" || t.referenceType === "TOURNAMENT_PRIZE")) {
      const tournament = await prisma.tournament.findUnique({
        where: { id: t.referenceId },
        select: { id: true, title: true, status: true, format: true },
      });
      if (tournament) referenceData = { tournament };
    }

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
      referenceData,
      meta: t.meta,
      createdAt: t.createdAt.toISOString(),
    };
  }
}
