import { prisma } from "@gaming-hub/db";
import type { Prisma, Transaction, Wallet } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type {
  TransactionReferenceType,
  TransactionType,
  WalletBalanceType,
} from "@gaming-hub/shared";
import { applyTransaction, getWallet } from "./wallet";
import { audit } from "./audit";

export interface TransactionRecordDto {
  id: string;
  userId: string;
  type: TransactionType;
  direction: "CREDIT" | "DEBIT";
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  walletType: string;
  referenceType: TransactionReferenceType;
  referenceId: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface LedgerQueryFilters {
  userId?: string;
  walletType?: WalletBalanceType;
  referenceType?: TransactionReferenceType;
  type?: TransactionType;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Centralized Wallet Transaction Ledger Service.
 * Immutably records, queries, and reconciles all financial coin movements.
 */
export class WalletTransactionService {
  /**
   * Helper to format a DB transaction into a normalized DTO with direction and balanceBefore.
   */
  static formatTransaction(t: Transaction): TransactionRecordDto {
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
      direction: isDebit ? "DEBIT" : "CREDIT",
      amount: t.amount,
      balanceBefore,
      balanceAfter: t.balanceAfter,
      walletType: t.walletType,
      referenceType: t.referenceType,
      referenceId: t.referenceId,
      meta: metaObj,
      createdAt: t.createdAt.toISOString(),
    };
  }

  /**
   * Standardized debit method.
   */
  static async createDebit(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      amount: number;
      referenceType: TransactionReferenceType;
      referenceId: string | null;
      meta?: Record<string, unknown>;
      walletType?: WalletBalanceType;
    },
  ): Promise<Wallet> {
    if (params.amount <= 0) {
      throw new AppError("VALIDATION_ERROR", "Debit amount must be positive", 400);
    }
    const updatedWallet = await applyTransaction(
      tx,
      params.userId,
      -params.amount,
      params.referenceType,
      params.referenceId,
      params.meta ?? {},
      params.walletType ?? "MAIN",
    );

    const { WalletSyncService } = await import("./walletSyncService");
    WalletSyncService.emitWalletUpdate({
      userId: params.userId,
      balance: updatedWallet.balance,
      bonusBalance: updatedWallet.bonusBalance,
      lockedBalance: updatedWallet.lockedBalance,
      rewardBalance: updatedWallet.rewardBalance,
      cashbackBalance: updatedWallet.cashbackBalance,
      transactionId: (params.meta?.transactionId as string) ?? undefined,
      type: "DEBIT",
      amount: params.amount,
    });

    return updatedWallet;
  }

  /**
   * Standardized credit method.
   */
  static async createCredit(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      amount: number;
      referenceType: TransactionReferenceType;
      referenceId: string | null;
      meta?: Record<string, unknown>;
      walletType?: WalletBalanceType;
    },
  ): Promise<Wallet> {
    if (params.amount <= 0) {
      throw new AppError("VALIDATION_ERROR", "Credit amount must be positive", 400);
    }
    const updatedWallet = await applyTransaction(
      tx,
      params.userId,
      params.amount,
      params.referenceType,
      params.referenceId,
      params.meta ?? {},
      params.walletType ?? "MAIN",
    );

    const { WalletSyncService } = await import("./walletSyncService");
    WalletSyncService.emitWalletUpdate({
      userId: params.userId,
      balance: updatedWallet.balance,
      bonusBalance: updatedWallet.bonusBalance,
      lockedBalance: updatedWallet.lockedBalance,
      rewardBalance: updatedWallet.rewardBalance,
      cashbackBalance: updatedWallet.cashbackBalance,
      transactionId: (params.meta?.transactionId as string) ?? undefined,
      type: "CREDIT",
      amount: params.amount,
    });

    return updatedWallet;
  }

  /**
   * Game Match Entry Fee Debit.
   */
  static async createGameEntry(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      matchId: string;
      gameId: string;
      entryFee: number;
      meta?: Record<string, unknown>;
    },
  ): Promise<Wallet> {
    const transactionId = `entry-${params.matchId}-${params.userId}`;
    return this.createDebit(tx, {
      userId: params.userId,
      amount: params.entryFee,
      referenceType: "MATCH_WAGER",
      referenceId: params.matchId,
      meta: {
        transactionId,
        gameId: params.gameId,
        entryFee: params.entryFee,
        status: "COMPLETED",
        description: `Entry fee for ${params.gameId} match`,
        ...params.meta,
      },
    });
  }

  /**
   * Game Match Winnings Credit.
   */
  static async createGamePrize(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      matchId: string;
      gameId: string;
      prizeAmount: number;
      reason?: string;
      meta?: Record<string, unknown>;
    },
  ): Promise<Wallet> {
    const transactionId = `payout-${params.matchId}-${params.userId}`;
    return this.createCredit(tx, {
      userId: params.userId,
      amount: params.prizeAmount,
      referenceType: "MATCH_PAYOUT",
      referenceId: params.matchId,
      meta: {
        transactionId,
        gameId: params.gameId,
        reason: params.reason ?? "winner_payout",
        status: "COMPLETED",
        description: `Winnings from ${params.gameId} match`,
        ...params.meta,
      },
    });
  }

  /**
   * Game Match Refund Credit (draw, cancel, abort).
   */
  static async createGameRefund(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      matchId: string;
      gameId: string;
      refundAmount: number;
      reason?: string;
      meta?: Record<string, unknown>;
    },
  ): Promise<Wallet> {
    const transactionId = `refund-${params.matchId}-${params.userId}`;
    return this.createCredit(tx, {
      userId: params.userId,
      amount: params.refundAmount,
      referenceType: "WAGER_REFUND",
      referenceId: params.matchId,
      meta: {
        transactionId,
        gameId: params.gameId,
        reason: params.reason ?? "match_refund",
        status: "REFUNDED",
        description: `Refund for ${params.gameId} match (${params.reason ?? "draw"})`,
        ...params.meta,
      },
    });
  }

  /**
   * Tournament Entry Fee Debit.
   */
  static async createTournamentEntry(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      tournamentId: string;
      tournamentTitle: string;
      entryFee: number;
      meta?: Record<string, unknown>;
    },
  ): Promise<Wallet> {
    const transactionId = `tournament-entry-${params.tournamentId}-${params.userId}`;
    return this.createDebit(tx, {
      userId: params.userId,
      amount: params.entryFee,
      referenceType: "TOURNAMENT_ENTRY",
      referenceId: params.tournamentId,
      meta: {
        transactionId,
        tournamentTitle: params.tournamentTitle,
        entryFee: params.entryFee,
        status: "COMPLETED",
        description: `Registration fee for ${params.tournamentTitle}`,
        ...params.meta,
      },
    });
  }

  /**
   * Tournament Prize Credit.
   */
  static async createTournamentPrize(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      tournamentId: string;
      tournamentTitle: string;
      prizeAmount: number;
      rank: number;
      meta?: Record<string, unknown>;
    },
  ): Promise<Wallet> {
    const transactionId = `tournament-prize-${params.tournamentId}-${params.userId}-${params.rank}`;
    return this.createCredit(tx, {
      userId: params.userId,
      amount: params.prizeAmount,
      referenceType: "TOURNAMENT_PRIZE",
      referenceId: params.tournamentId,
      meta: {
        transactionId,
        tournamentTitle: params.tournamentTitle,
        rank: params.rank,
        status: "COMPLETED",
        description: `Rank #${params.rank} prize in ${params.tournamentTitle}`,
        ...params.meta,
      },
    });
  }

  /**
   * Tournament Cancellation / Unregister Refund.
   */
  static async createTournamentRefund(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      tournamentId: string;
      tournamentTitle: string;
      refundAmount: number;
      reason?: string;
      meta?: Record<string, unknown>;
    },
  ): Promise<Wallet> {
    const transactionId = `tournament-refund-${params.tournamentId}-${params.userId}`;
    return this.createCredit(tx, {
      userId: params.userId,
      amount: params.refundAmount,
      referenceType: "TOURNAMENT_ENTRY",
      referenceId: params.tournamentId,
      meta: {
        transactionId,
        tournamentTitle: params.tournamentTitle,
        refund: true,
        reason: params.reason ?? "tournament_cancelled",
        status: "REFUNDED",
        description: `Refund for ${params.tournamentTitle} (${params.reason ?? "cancelled"})`,
        ...params.meta,
      },
    });
  }

  /**
   * Admin Manual Adjustment.
   */
  static async createAdminAdjustment(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      amount: number;
      reason: string;
      adminId: string;
      meta?: Record<string, unknown>;
    },
  ): Promise<Wallet> {
    const isDebit = params.amount < 0;
    const absAmount = Math.abs(params.amount);
    const transactionId = `admin-adjust-${Date.now()}-${params.userId}`;
    const updatedWallet = await applyTransaction(
      tx,
      params.userId,
      params.amount,
      "ADMIN",
      null,
      {
        transactionId,
        reason: params.reason,
        adjustedBy: params.adminId,
        status: "COMPLETED",
        description: `Admin adjustment: ${params.reason}`,
        ...params.meta,
      },
      "MAIN",
    );

    const { WalletSyncService } = await import("./walletSyncService");
    WalletSyncService.emitWalletUpdate({
      userId: params.userId,
      balance: updatedWallet.balance,
      bonusBalance: updatedWallet.bonusBalance,
      lockedBalance: updatedWallet.lockedBalance,
      rewardBalance: updatedWallet.rewardBalance,
      cashbackBalance: updatedWallet.cashbackBalance,
      transactionId,
      type: isDebit ? "DEBIT" : "CREDIT",
      amount: absAmount,
    });

    return updatedWallet;
  }

  /**
   * Query user ledger with pagination, filters, and computed balance snapshots.
   */
  static async listUserTransactions(
    userId: string,
    filters: LedgerQueryFilters,
    page: number,
    pageSize: number,
  ): Promise<{ items: TransactionRecordDto[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.TransactionWhereInput = {
      userId,
      ...(filters.walletType ? { walletType: filters.walletType } : {}),
      ...(filters.referenceType ? { referenceType: filters.referenceType } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.startDate || filters.endDate
        ? {
            createdAt: {
              ...(filters.startDate ? { gte: filters.startDate } : {}),
              ...(filters.endDate ? { lte: filters.endDate } : {}),
            },
          }
        : {}),
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
      items: items.map((t) => this.formatTransaction(t)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Admin ledger query across all users with filters.
   */
  static async adminListTransactions(
    filters: LedgerQueryFilters & { referenceId?: string },
    page: number,
    pageSize: number,
  ): Promise<{ items: TransactionRecordDto[]; total: number; page: number; pageSize: number }> {
    const where: Prisma.TransactionWhereInput = {
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.walletType ? { walletType: filters.walletType } : {}),
      ...(filters.referenceType ? { referenceType: filters.referenceType } : {}),
      ...(filters.referenceId ? { referenceId: filters.referenceId } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.startDate || filters.endDate
        ? {
            createdAt: {
              ...(filters.startDate ? { gte: filters.startDate } : {}),
              ...(filters.endDate ? { lte: filters.endDate } : {}),
            },
          }
        : {}),
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
      items: items.map((t) => this.formatTransaction(t)),
      total,
      page,
      pageSize,
    };
  }
}
