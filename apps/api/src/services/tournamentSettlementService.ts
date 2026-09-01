import { prisma } from "@gaming-hub/db";
import type { Prisma } from "@gaming-hub/db";
import {
  AppError,
  canTransitionTournamentStatus,
  defaultPrizeDistribution,
  calculatePrizes,
  validatePrizeConfiguration,
} from "@gaming-hub/shared";
import type {
  TournamentStatus,
  TournamentFormat,
  PrizeDistributionEntry,
  TournamentPrizeConfigSnapshot,
  TournamentSettlementRecord,
  TournamentSettlementSummary,
  TournamentSettlementStatusType,
} from "@gaming-hub/shared";
import { WalletTransactionService } from "./walletTransactionService";
import { IdempotencyService } from "./idempotencyService";
import { TournamentNotificationService } from "./tournamentNotificationService";
import { TournamentEmailService } from "./tournamentEmailService";
import { audit } from "./audit";
import { broadcastAdminAnalytics } from "./socketBridge";
import { TournamentAnalyticsCache } from "./tournamentAnalyticsCache";

export class TournamentSettlementService {
  /**
   * 1. Validate & Snapshot Prize Configuration at Tournament Start.
   * Freezes prize distribution rules into `tournament.configSnapshot` so already-running
   * and settling tournaments are completely insulated from subsequent admin modifications.
   */
  static async validateAndSnapshotPrizeConfig(
    tournamentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TournamentPrizeConfigSnapshot> {
    const client = tx ?? prisma;
    const tournament = await client.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) throw new AppError("NOT_FOUND", "Tournament not found", 404);

    const grossPool = tournament.grossPool > 0 ? tournament.grossPool : tournament.prizePool;
    const rawDistribution = (tournament.prizeDistribution as unknown as PrizeDistributionEntry[]) || [];
    const distribution = rawDistribution.length > 0
      ? rawDistribution
      : defaultPrizeDistribution(tournament.format as TournamentFormat);

    // Validate prize configuration rules
    const validation = validatePrizeConfiguration(grossPool, distribution);
    if (!validation.valid) {
      throw new AppError(
        "VALIDATION_ERROR",
        validation.error ?? "Invalid prize distribution configuration",
        400,
        { validation },
      );
    }

    const calculatedPrizes = calculatePrizes(grossPool, distribution);

    // Validate sum of calculated prizes equals the prize pool (50% + 25% + 15% + 10% = 100% = prizePool)
    const totalPrizeSum = calculatedPrizes.reduce((sum, p) => sum + p.amount, 0);
    if (totalPrizeSum !== grossPool && grossPool > 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Prize distribution sum (${totalPrizeSum}) must exactly equal configured prize pool (${grossPool})`,
        400,
      );
    }

    // Explicit Platform/Operating Amount Calculation
    const maxEntryCollection = tournament.entryFee * (tournament.maxPlayers || 0);
    const platformShare = Math.max(0, maxEntryCollection - tournament.prizePool);

    const prizesByRank: Record<number, { percentage: number; amount: number }> = {};
    for (const dist of distribution) {
      const calc = calculatedPrizes.find((c) => c.rank === dist.rank);
      prizesByRank[dist.rank] = {
        percentage: dist.percentage ?? 0,
        amount: calc?.amount ?? dist.amount ?? 0,
      };
    }

    const snapshot: TournamentPrizeConfigSnapshot = {
      entryFee: tournament.entryFee,
      prizePool: tournament.prizePool,
      grossPool,
      platformShare,
      prizeDistribution: distribution,
      calculatedPrizes: calculatedPrizes.map((p) => {
        const d = distribution.find((x) => x.rank === p.rank);
        return {
          rank: p.rank,
          amount: p.amount,
          percentage: d?.percentage,
        };
      }),
      prizesByRank,
      currency: "coins",
      format: tournament.format as TournamentFormat,
      gameId: tournament.gameId,
      stateVersion: tournament.stateVersion,
      snapshottedAt: new Date().toISOString(),
    };

    await client.tournament.update({
      where: { id: tournamentId },
      data: {
        configSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    return snapshot;
  }

  /**
   * 2. Retrieve authoritative prize snapshot (or create on-the-fly for legacy/un-snapshotted tournaments).
   */
  static async getAuthoritativePrizeSnapshot(
    tournamentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<TournamentPrizeConfigSnapshot> {
    const client = tx ?? prisma;
    const tournament = await client.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        entryFee: true,
        prizePool: true,
        grossPool: true,
        prizeDistribution: true,
        format: true,
        gameId: true,
        stateVersion: true,
        configSnapshot: true,
      },
    });
    if (!tournament) throw new AppError("NOT_FOUND", "Tournament not found", 404);

    if (tournament.configSnapshot && typeof tournament.configSnapshot === "object") {
      const snap = tournament.configSnapshot as Record<string, unknown>;
      if (Array.isArray(snap.calculatedPrizes) && snap.calculatedPrizes.length > 0) {
        return snap as unknown as TournamentPrizeConfigSnapshot;
      }
    }

    // Fallback: generate and persist snapshot
    return this.validateAndSnapshotPrizeConfig(tournamentId, tx);
  }

  /**
   * 3. Settle Tournament Prizes:
   * Enforces exact-once settlement across all winning positions (1st, 2nd, 3rd...).
   * Validates final match completion, authoritative winner, active dispute gating,
   * ledger-only wallet credits, failed settlement recovery, and post-credit notifications.
   */
  static async settleTournamentPrizes(
    tournamentId: string,
    options?: {
      adminId?: string;
      reason?: string;
      force?: boolean;
    },
  ): Promise<{
    ok: true;
    tournamentId: string;
    completedCount: number;
    failedCount: number;
    prizesPaid: { userId: string; rank: number; amount: number; transactionId?: string }[];
  }> {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        players: {
          include: {
            user: { select: { id: true, username: true, displayName: true, email: true } },
          },
        },
        rounds: { orderBy: [{ roundNumber: "asc" }, { matchNumber: "asc" }] },
        prizes: true,
      },
    });
    if (!tournament) throw new AppError("NOT_FOUND", "Tournament not found", 404);

    // If tournament was cancelled, never distribute rank prizes
    if (tournament.status === "CANCELLED") {
      throw new AppError("INVALID_ACTION", "Cannot distribute rank prizes for a cancelled tournament", 400);
    }

    // If already fully settled, return existing completed records
    if (tournament.settledAt && tournament.status === "SETTLED") {
      const paidPrizes = tournament.prizes
        .filter((p) => p.status === "COMPLETED" || p.status === "PAID")
        .map((p) => ({
          userId: p.userId,
          rank: p.rank,
          amount: p.amount,
          transactionId: p.transactionId ?? undefined,
        }));
      return {
        ok: true,
        tournamentId,
        completedCount: paidPrizes.length,
        failedCount: 0,
        prizesPaid: paidPrizes,
      };
    }

    // Determine total rounds and final slot
    const maxRound = tournament.rounds.length > 0
      ? Math.max(...tournament.rounds.map((r) => r.roundNumber))
      : 1;
    const finalSlot = tournament.rounds.find((r) => r.roundNumber === maxRound);

    // Dispute Protection: Halt settlement if final match is under active dispute review
    if (finalSlot?.matchId) {
      const activeDispute = await prisma.tournamentDispute.findFirst({
        where: {
          tournamentId,
          matchId: finalSlot.matchId,
          status: { in: ["OPEN", "UNDER_REVIEW"] },
        },
      });

      if (activeDispute) {
        console.error(`[SETTLEMENT_PAUSED] Tournament ${tournamentId} final match is under active dispute (${activeDispute.disputeId}).`);
        throw new AppError(
          "RESULT_REVIEW_REQUIRED",
          `Final match is under active dispute review (${activeDispute.disputeId}). Prize settlement halted.`,
          400,
          { disputeId: activeDispute.disputeId },
        );
      }

      // Check snapshot reviewStatus
      const snapshot = await prisma.tournamentResultSnapshot.findUnique({
        where: { matchId: finalSlot.matchId },
      });
      if (snapshot && snapshot.reviewStatus === "RESULT_REVIEW_REQUIRED") {
        throw new AppError(
          "RESULT_REVIEW_REQUIRED",
          "Final match result is flagged as review required. Prize settlement halted.",
          400,
        );
      }
    }

    // Transition status to SETTLING if allowed
    const currentStatus = tournament.status as TournamentStatus;
    if (canTransitionTournamentStatus(currentStatus, "SETTLING")) {
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: "SETTLING", stateVersion: { increment: 1 } },
      });
    }

    // Retrieve authoritative snapshot
    const prizeSnapshot = await this.getAuthoritativePrizeSnapshot(tournamentId);

    // Pre-settlement validation: Verify 1st + 2nd + 3rd + 4th === prizePool (sum must match exactly)
    const sumOfPrizes = prizeSnapshot.calculatedPrizes.reduce((sum, p) => sum + p.amount, 0);
    const expectedPool = prizeSnapshot.grossPool > 0 ? prizeSnapshot.grossPool : prizeSnapshot.prizePool;
    if (sumOfPrizes !== expectedPool && expectedPool > 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Prize distribution sum validation failed: Sum of prizes (${sumOfPrizes}) does not match configured prize pool (${expectedPool}). Settlement halted for review.`,
        400,
      );
    }

    // Ranked players sorted by finalRank (1st, 2nd, 3rd...)
    const rankedPlayers = tournament.players
      .filter((p) => p.finalRank !== null && p.finalRank > 0)
      .sort((a, b) => (a.finalRank ?? 999) - (b.finalRank ?? 999));

    // Verify champion
    const champion = rankedPlayers.find((p) => p.finalRank === 1);
    if (finalSlot && finalSlot.winnerId && champion && champion.userId !== finalSlot.winnerId && !options?.force) {
      throw new AppError(
        "INVALID_ACTION",
        `Declared champion (${champion.userId}) does not match final match winner (${finalSlot.winnerId})`,
        400,
      );
    }

    const completedPrizes: { userId: string; rank: number; amount: number; transactionId?: string }[] = [];
    const failedPrizes: { userId: string; rank: number; amount: number; error: string }[] = [];

    for (const prize of prizeSnapshot.calculatedPrizes) {
      const player = rankedPlayers.find((p) => p.finalRank === prize.rank);
      if (!player || prize.amount <= 0) continue;

      // Find or create settlement record idempotently
      let prizeRecord = await prisma.tournamentPrize.findUnique({
        where: { tournamentId_userId: { tournamentId, userId: player.userId } },
      });

      if (!prizeRecord) {
        try {
          prizeRecord = await prisma.tournamentPrize.create({
            data: {
              tournamentId,
              userId: player.userId,
              playerId: player.id,
              rank: prize.rank,
              amount: prize.amount,
              status: "PENDING",
            },
          });
        } catch (e: any) {
          if (e?.code === "P2002") {
            prizeRecord = await prisma.tournamentPrize.findUniqueOrThrow({
              where: { tournamentId_userId: { tournamentId, userId: player.userId } },
            });
          } else {
            throw e;
          }
        }
      }

      // Exactly-once check: skip if already COMPLETED / PAID
      if (prizeRecord.status === "COMPLETED" || prizeRecord.status === "PAID") {
        completedPrizes.push({
          userId: player.userId,
          rank: prize.rank,
          amount: prize.amount,
          transactionId: prizeRecord.transactionId ?? undefined,
        });
        continue;
      }

      const idempotencyKey = `SETTLEMENT:TOURNAMENT_PRIZE:${tournamentId}:${player.userId}:${prize.rank}`;

      try {
        await prisma.tournamentPrize.update({
          where: { id: prizeRecord.id },
          data: { status: "PROCESSING", lastAttemptAt: new Date() },
        });

        await IdempotencyService.executeOnce({
          key: idempotencyKey,
          operation: "TOURNAMENT_PRIZE_SETTLEMENT",
          referenceId: prizeRecord.id,
          userId: player.userId,
          handler: async (tx) => {
            const transactionId = `tournament-prize-${tournamentId}-${player.userId}-${prize.rank}`;

            // Authoritative ledger credit via WalletTransactionService
            await WalletTransactionService.createTournamentPrize(tx, {
              userId: player.userId,
              tournamentId,
              tournamentTitle: tournament.title,
              rank: prize.rank,
              prizeAmount: prize.amount,
              settlementId: prizeRecord.id,
              meta: {
                settlementId: prizeRecord.id,
                position: prize.rank,
                transactionId,
              },
            });

            // Mark prize record COMPLETED
            await tx.tournamentPrize.update({
              where: { id: prizeRecord.id },
              data: {
                status: "COMPLETED",
                transactionId,
                paidAt: new Date(),
                failureReason: null,
              },
            });

            return { transactionId };
          },
        });

        // Audit Log
        audit({
          actorType: options?.adminId ? "user" : "system",
          actorId: options?.adminId ?? "system",
          action: "tournament.prize.credited",
          category: "wallet",
          targetType: "tournament_prize",
          targetId: prizeRecord.id,
          meta: {
            tournamentId,
            userId: player.userId,
            position: prize.rank,
            rank: prize.rank,
            amount: prize.amount,
            settlementId: prizeRecord.id,
            transactionId: `tournament-prize-${tournamentId}-${player.userId}-${prize.rank}`,
            reason: options?.reason,
            timestamp: new Date().toISOString(),
          },
        });

        // Dispatched strictly AFTER authoritative transaction succeeds
        await TournamentNotificationService.notifyPrizeCredited({
          tournamentId,
          tournamentTitle: tournament.title,
          playerId: player.userId,
          rank: prize.rank,
          amount: prize.amount,
        }).catch(() => undefined);

        await TournamentEmailService.sendPrizeCreditedEmail({
          userId: player.userId,
          tournamentId,
          tournamentTitle: tournament.title,
          rank: prize.rank,
          amount: prize.amount,
          transactionId: `tournament-prize-${tournamentId}-${player.userId}-${prize.rank}`,
        }).catch(() => undefined);

        completedPrizes.push({
          userId: player.userId,
          rank: prize.rank,
          amount: prize.amount,
          transactionId: `tournament-prize-${tournamentId}-${player.userId}-${prize.rank}`,
        });

        void broadcastAdminAnalytics("admin:analytics:settlement-updated", {
          tournamentId,
          prizeId: prizeRecord.id,
          status: "PAID",
          amount: prize.amount,
          userId: player.userId,
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        const errorMessage = err?.message || String(err);
        console.error(`[PRIZE_SETTLEMENT_FAILED] Tournament ${tournamentId} Player ${player.userId} Rank ${prize.rank}:`, errorMessage);

        await prisma.tournamentPrize.update({
          where: { id: prizeRecord.id },
          data: {
            status: "FAILED",
            failureReason: errorMessage,
            retryCount: { increment: 1 },
          },
        }).catch(() => undefined);

        audit({
          actorType: options?.adminId ? "user" : "system",
          actorId: options?.adminId ?? "system",
          action: "tournament.prize.failed",
          category: "wallet",
          targetType: "tournament_prize",
          targetId: prizeRecord.id,
          meta: {
            tournamentId,
            userId: player.userId,
            rank: prize.rank,
            error: errorMessage,
          },
        });

        void broadcastAdminAnalytics("admin:analytics:settlement-updated", {
          tournamentId,
          prizeId: prizeRecord.id,
          status: "FAILED",
          amount: prize.amount,
          userId: player.userId,
          timestamp: new Date().toISOString(),
        });

        failedPrizes.push({
          userId: player.userId,
          rank: prize.rank,
          amount: prize.amount,
          error: errorMessage,
        });
      }
    }

    // If ALL expected prizes succeeded, transition tournament to SETTLED
    if (failedPrizes.length === 0 && completedPrizes.length > 0) {
      await prisma.tournament.update({
        where: { id: tournamentId },
        data: {
          status: "SETTLED",
          settledAt: new Date(),
          stateVersion: { increment: 1 },
        },
      });
    }

    TournamentAnalyticsCache.invalidateSettlements(tournamentId);

    return {
      ok: true,
      tournamentId,
      completedCount: completedPrizes.length,
      failedCount: failedPrizes.length,
      prizesPaid: completedPrizes,
    };
  }

  /**
   * 4. List Tournament Settlements with Summary KPIs (Admin & Audit View).
   */
  static async listTournamentSettlements(
    tournamentId: string,
    filters?: { status?: TournamentSettlementStatusType },
  ): Promise<TournamentSettlementSummary> {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        prizes: {
          include: {
            player: {
              include: {
                user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
              },
            },
          },
          orderBy: { rank: "asc" },
        },
      },
    });
    if (!tournament) throw new AppError("NOT_FOUND", "Tournament not found", 404);

    const grossPool = tournament.grossPool > 0 ? tournament.grossPool : tournament.prizePool;
    const maxEntryCollection = tournament.entryFee * (tournament.maxPlayers || 0);
    const platformShare = Math.max(0, maxEntryCollection - tournament.prizePool);
    const allPrizes = tournament.prizes;

    const completedCount = allPrizes.filter((p) => p.status === "COMPLETED" || p.status === "PAID").length;
    const pendingCount = allPrizes.filter((p) => p.status === "PENDING" || p.status === "PROCESSING").length;
    const failedCount = allPrizes.filter((p) => p.status === "FAILED").length;

    const totalPaidAmount = allPrizes
      .filter((p) => p.status === "COMPLETED" || p.status === "PAID")
      .reduce((sum, p) => sum + p.amount, 0);

    const totalUnpaidAmount = allPrizes
      .filter((p) => p.status !== "COMPLETED" && p.status !== "PAID")
      .reduce((sum, p) => sum + p.amount, 0);

    let overallSettlementStatus: "NOT_STARTED" | "PROCESSING" | "PARTIALLY_SETTLED" | "SETTLED" | "SETTLEMENT_FAILED" = "NOT_STARTED";
    if (tournament.settledAt || (allPrizes.length > 0 && completedCount === allPrizes.length && failedCount === 0)) {
      overallSettlementStatus = "SETTLED";
    } else if (completedCount > 0 && failedCount > 0) {
      overallSettlementStatus = "PARTIALLY_SETTLED";
    } else if (failedCount > 0 && completedCount === 0) {
      overallSettlementStatus = "SETTLEMENT_FAILED";
    } else if (pendingCount > 0 || tournament.status === "SETTLING") {
      overallSettlementStatus = "PROCESSING";
    } else {
      overallSettlementStatus = "NOT_STARTED";
    }

    const filtered = filters?.status
      ? allPrizes.filter((p) => p.status === filters.status)
      : allPrizes;

    const settlements: TournamentSettlementRecord[] = filtered.map((p) => ({
      id: p.id,
      settlementId: p.id,
      tournamentId: p.tournamentId,
      tournamentTitle: tournament.title,
      userId: p.userId,
      playerId: p.playerId,
      username: p.player?.user?.username,
      displayName: p.player?.user?.displayName,
      avatarUrl: p.player?.user?.avatarUrl,
      position: p.rank,
      rank: p.rank,
      prizeAmount: p.amount,
      status: p.status as TournamentSettlementStatusType,
      transactionId: p.transactionId,
      failureReason: p.failureReason,
      retryCount: p.retryCount,
      lastAttemptAt: p.lastAttemptAt?.toISOString() ?? null,
      paidAt: p.paidAt?.toISOString() ?? null,
      completedAt: p.paidAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));

    return {
      tournamentId: tournament.id,
      tournamentTitle: tournament.title,
      status: tournament.status as TournamentStatus,
      overallSettlementStatus,
      prizePool: tournament.prizePool,
      grossPool,
      platformShare,
      totalPrizesCount: allPrizes.length,
      completedCount,
      pendingCount,
      failedCount,
      totalPaidAmount,
      totalUnpaidAmount,
      settledAt: tournament.settledAt?.toISOString() ?? null,
      settlements,
    };
  }

  /**
   * 5. Retry Failed Settlements (Admin Recovery Action).
   * Safely retries failed or pending settlements without duplicating already completed prizes.
   */
  static async retryFailedSettlements(
    tournamentId: string,
    adminId: string,
    reason: string,
    prizeId?: string,
  ) {
    if (!adminId) throw new AppError("FORBIDDEN", "Admin authorization required", 403);
    if (!reason || reason.trim().length < 3) {
      throw new AppError("VALIDATION_ERROR", "A valid justification reason is required for retry", 400);
    }

    const whereClause: Prisma.TournamentPrizeWhereInput = {
      tournamentId,
      status: { in: ["FAILED", "PENDING", "PROCESSING"] },
      ...(prizeId ? { id: prizeId } : {}),
    };

    const targetPrizes = await prisma.tournamentPrize.findMany({
      where: whereClause,
    });

    if (targetPrizes.length === 0) {
      return { ok: true, message: "No failed or pending settlements to retry", retriedCount: 0 };
    }

    audit({
      actorType: "user",
      actorId: adminId,
      action: "admin.tournament.settlement.retry",
      category: "admin",
      targetType: "tournament",
      targetId: tournamentId,
      meta: {
        reason,
        targetPrizesCount: targetPrizes.length,
        prizeIds: targetPrizes.map((p) => p.id),
      },
    });

    return this.settleTournamentPrizes(tournamentId, {
      adminId,
      reason,
      force: true,
    });
  }

  /**
   * 6. Get Current Player Settlement Details.
   */
  static async getPlayerSettlement(
    tournamentId: string,
    userId: string,
  ): Promise<TournamentSettlementRecord | null> {
    const prize = await prisma.tournamentPrize.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
      include: {
        tournament: { select: { title: true } },
      },
    });
    if (!prize) return null;

    return {
      id: prize.id,
      settlementId: prize.id,
      tournamentId: prize.tournamentId,
      tournamentTitle: prize.tournament.title,
      userId: prize.userId,
      playerId: prize.playerId,
      position: prize.rank,
      rank: prize.rank,
      prizeAmount: prize.amount,
      status: prize.status as TournamentSettlementStatusType,
      transactionId: prize.transactionId,
      failureReason: prize.failureReason,
      retryCount: prize.retryCount,
      lastAttemptAt: prize.lastAttemptAt?.toISOString() ?? null,
      paidAt: prize.paidAt?.toISOString() ?? null,
      completedAt: prize.paidAt?.toISOString() ?? null,
      createdAt: prize.createdAt.toISOString(),
      updatedAt: prize.updatedAt.toISOString(),
    };
  }
}
