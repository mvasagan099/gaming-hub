import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { WalletTransactionService } from "./walletTransactionService";
import { IdempotencyService } from "./idempotencyService";
import { audit } from "./audit";
import { createNotification } from "./notifications";

export interface RefundResult {
  ok: boolean;
  userId: string;
  referenceId: string;
  referenceType: "MATCH" | "TOURNAMENT";
  status: "REFUNDED" | "ALREADY_REFUNDED" | "NO_FEE" | "NOT_ELIGIBLE";
  refundAmount: number;
  reason: string;
  transactionId?: string;
}

export class RefundService {
  /**
   * 1. Idempotently refund a paid game / match entry.
   * Derives refund amount strictly from the authoritative database debit transaction.
   */
  static async refundGameEntry(params: {
    matchId: string;
    userId: string;
    reason?: string;
    adminId?: string;
    force?: boolean;
  }): Promise<RefundResult> {
    const reason = params.reason ?? (params.adminId ? "admin_manual_refund" : "match_cancelled");
    const idempotencyKey = `REFUND:MATCH:${params.matchId}:${params.userId}`;

    return IdempotencyService.executeOnce({
      key: idempotencyKey,
      operation: "REFUND_GAME_ENTRY",
      userId: params.userId,
      referenceId: params.matchId,
      handler: async (tx) => {
        const match = await tx.match.findUnique({
          where: { id: params.matchId },
          include: { players: true },
        });

        if (!match) {
          throw new AppError("NOT_FOUND", "Match not found", 404);
        }

        // Verify player membership
        const isPlayer = match.players.some((p) => p.userId === params.userId);
        if (!isPlayer && !params.force) {
          throw new AppError("FORBIDDEN", "User is not a participant in this match", 403);
        }

        // Verify match state eligibility
        if (match.status === "FINISHED" && !params.force) {
          const winnerIds = (match.winnerIds as string[]) || [];
          if (winnerIds.length > 0) {
            throw new AppError(
              "INVALID_ACTION",
              "Cannot refund a match that has already finished with determined winners",
              409,
            );
          }
        }

        // Authoritative check on original debit transaction
        const debitTx = await tx.transaction.findFirst({
          where: {
            userId: params.userId,
            referenceId: params.matchId,
            referenceType: "MATCH_WAGER",
            type: "DEBIT",
          },
        });

        if (!debitTx || debitTx.amount <= 0) {
          return {
            ok: true,
            userId: params.userId,
            referenceId: params.matchId,
            referenceType: "MATCH" as const,
            status: "NO_FEE" as const,
            refundAmount: 0,
            reason,
          };
        }

        // Check if already refunded in ledger
        const existingRefund = await tx.transaction.findFirst({
          where: {
            userId: params.userId,
            referenceId: params.matchId,
            referenceType: "WAGER_REFUND",
            type: "CREDIT",
          },
        });

        if (existingRefund) {
          return {
            ok: true,
            userId: params.userId,
            referenceId: params.matchId,
            referenceType: "MATCH" as const,
            status: "ALREADY_REFUNDED" as const,
            refundAmount: existingRefund.amount,
            reason,
            transactionId: existingRefund.id,
          };
        }

        // Execute atomic credit refund in wallet ledger
        const refundAmount = debitTx.amount;
        const wallet = await WalletTransactionService.createGameRefund(tx, {
          userId: params.userId,
          matchId: match.id,
          gameId: match.gameId,
          refundAmount,
          reason,
          meta: {
            adminId: params.adminId ?? null,
            originalTransactionId: debitTx.id,
          },
        });

        if (params.adminId) {
          audit({
            actorType: "user",
            actorId: params.adminId,
            action: "admin.refund.match",
            category: "admin",
            targetType: "match",
            targetId: match.id,
            meta: { userId: params.userId, refundAmount, reason },
          });
        }

        await createNotification(
          params.userId,
          "WALLET",
          "Match Refund Credited",
          `You have received a refund of ${refundAmount} coins for your ${match.gameId} match (${reason}).`,
          { matchId: match.id, amount: refundAmount },
        );

        return {
          ok: true,
          userId: params.userId,
          referenceId: params.matchId,
          referenceType: "MATCH" as const,
          status: "REFUNDED" as const,
          refundAmount,
          reason,
        };
      },
    });
  }

  /**
   * 2. Idempotently refund a tournament entry fee.
   * Derives refund amount strictly from the authoritative database debit transaction.
   */
  static async refundTournamentEntry(params: {
    tournamentId: string;
    userId: string;
    reason?: string;
    adminId?: string;
    force?: boolean;
  }): Promise<RefundResult> {
    const reason = params.reason ?? (params.adminId ? "admin_manual_refund" : "tournament_cancelled");
    const idempotencyKey = `REFUND:TOURNAMENT:${params.tournamentId}:${params.userId}`;

    return IdempotencyService.executeOnce({
      key: idempotencyKey,
      operation: "REFUND_TOURNAMENT_ENTRY",
      userId: params.userId,
      referenceId: params.tournamentId,
      handler: async (tx) => {
        const tournament = await tx.tournament.findUnique({
          where: { id: params.tournamentId },
        });

        if (!tournament) {
          throw new AppError("NOT_FOUND", "Tournament not found", 404);
        }

        // Authoritative check on original debit transaction
        const debitTx = await tx.transaction.findFirst({
          where: {
            userId: params.userId,
            referenceId: params.tournamentId,
            referenceType: "TOURNAMENT_ENTRY",
            type: "DEBIT",
          },
        });

        if (!debitTx || debitTx.amount <= 0) {
          return {
            ok: true,
            userId: params.userId,
            referenceId: params.tournamentId,
            referenceType: "TOURNAMENT" as const,
            status: "NO_FEE" as const,
            refundAmount: 0,
            reason,
          };
        }

        // Check if already refunded in ledger
        const existingRefund = await tx.transaction.findFirst({
          where: {
            userId: params.userId,
            referenceId: params.tournamentId,
            referenceType: "TOURNAMENT_ENTRY",
            type: "CREDIT",
          },
        });

        if (existingRefund) {
          return {
            ok: true,
            userId: params.userId,
            referenceId: params.tournamentId,
            referenceType: "TOURNAMENT" as const,
            status: "ALREADY_REFUNDED" as const,
            refundAmount: existingRefund.amount,
            reason,
            transactionId: existingRefund.id,
          };
        }

        // Execute atomic credit refund in wallet ledger
        const refundAmount = debitTx.amount;
        await WalletTransactionService.createTournamentRefund(tx, {
          userId: params.userId,
          tournamentId: tournament.id,
          tournamentTitle: tournament.title,
          refundAmount,
          reason,
          meta: {
            adminId: params.adminId ?? null,
            originalTransactionId: debitTx.id,
          },
        });

        if (params.adminId) {
          audit({
            actorType: "user",
            actorId: params.adminId,
            action: "admin.refund.tournament",
            category: "admin",
            targetType: "tournament",
            targetId: tournament.id,
            meta: { userId: params.userId, refundAmount, reason },
          });
        }

        await createNotification(
          params.userId,
          "WALLET",
          "Tournament Refund Credited",
          `You have received a refund of ${refundAmount} coins for ${tournament.title} (${reason}).`,
          { tournamentId: tournament.id, amount: refundAmount },
        );

        return {
          ok: true,
          userId: params.userId,
          referenceId: params.tournamentId,
          referenceType: "TOURNAMENT" as const,
          status: "REFUNDED" as const,
          refundAmount,
          reason,
        };
      },
    });
  }

  /**
   * 3. Batch refund all paying participants of a cancelled / aborted match.
   */
  static async refundCancelledMatch(params: {
    matchId: string;
    reason?: string;
    adminId?: string;
  }): Promise<{
    ok: true;
    matchId: string;
    status: "CANCELLED";
    refunds: RefundResult[];
  }> {
    const match = await prisma.match.findUnique({
      where: { id: params.matchId },
      include: { players: true },
    });

    if (!match) {
      throw new AppError("NOT_FOUND", "Match not found", 404);
    }

    // Find all users who were debited for this match
    const debits = await prisma.transaction.findMany({
      where: {
        referenceId: params.matchId,
        referenceType: "MATCH_WAGER",
        type: "DEBIT",
      },
    });

    const refunds: RefundResult[] = [];
    for (const debit of debits) {
      const res = await this.refundGameEntry({
        matchId: params.matchId,
        userId: debit.userId,
        reason: params.reason ?? "match_cancelled",
        adminId: params.adminId,
      });
      refunds.push(res);
    }

    await prisma.match.update({
      where: { id: params.matchId },
      data: {
        status: "ABORTED",
        endedAt: new Date(),
      },
    });

    return {
      ok: true,
      matchId: params.matchId,
      status: "CANCELLED",
      refunds,
    };
  }

  /**
   * 4. Batch refund all registered players of a cancelled tournament.
   */
  static async refundCancelledTournament(params: {
    tournamentId: string;
    reason?: string;
    adminId?: string;
  }): Promise<{
    ok: true;
    tournamentId: string;
    status: "CANCELLED";
    refunds: RefundResult[];
  }> {
    const tournament = await prisma.tournament.findUnique({
      where: { id: params.tournamentId },
      include: { players: true },
    });

    if (!tournament) {
      throw new AppError("NOT_FOUND", "Tournament not found", 404);
    }

    // Find all users who paid entry fee
    const debits = await prisma.transaction.findMany({
      where: {
        referenceId: params.tournamentId,
        referenceType: "TOURNAMENT_ENTRY",
        type: "DEBIT",
      },
    });

    const refunds: RefundResult[] = [];
    for (const debit of debits) {
      const res = await this.refundTournamentEntry({
        tournamentId: params.tournamentId,
        userId: debit.userId,
        reason: params.reason ?? "tournament_cancelled",
        adminId: params.adminId,
      });
      refunds.push(res);
    }

    await prisma.tournament.update({
      where: { id: params.tournamentId },
      data: {
        status: "CANCELLED",
        stateVersion: { increment: 1 },
      },
    });

    return {
      ok: true,
      tournamentId: params.tournamentId,
      status: "CANCELLED",
      refunds,
    };
  }

  /**
   * 5. Admin-authorized refund dispatch.
   */
  static async processAdminRefund(params: {
    referenceType: "MATCH" | "TOURNAMENT";
    referenceId: string;
    userId: string;
    reason: string;
    adminId: string;
  }): Promise<RefundResult> {
    if (!params.adminId) {
      throw new AppError("FORBIDDEN", "Admin authorization required", 403);
    }
    if (!params.reason || params.reason.trim().length === 0) {
      throw new AppError("VALIDATION_ERROR", "A valid refund reason is required", 400);
    }

    if (params.referenceType === "MATCH") {
      return this.refundGameEntry({
        matchId: params.referenceId,
        userId: params.userId,
        reason: params.reason,
        adminId: params.adminId,
        force: true,
      });
    }

    return this.refundTournamentEntry({
      tournamentId: params.referenceId,
      userId: params.userId,
      reason: params.reason,
      adminId: params.adminId,
      force: true,
    });
  }
}
