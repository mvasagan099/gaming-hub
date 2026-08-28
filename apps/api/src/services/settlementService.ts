import { prisma } from "@gaming-hub/db";
import type { Prisma } from "@gaming-hub/db";
import {
  AppError,
  canTransitionTournamentStatus,
  defaultPrizeDistribution,
  calculatePrizes,
} from "@gaming-hub/shared";
import type { GameId, TournamentStatus, TournamentFormat, PrizeDistributionEntry } from "@gaming-hub/shared";
import { WalletTransactionService } from "./walletTransactionService";
import { IdempotencyService } from "./idempotencyService";
import { recordMatchResult } from "./stats";
import { AchievementService } from "./achievementService";
import { ReferralService } from "./referrals";
import { createNotification } from "./notifications";
import { audit } from "./audit";
import { GameConfigService } from "./gameConfigService";

export interface SettlementSummary {
  matchId: string;
  gameId: string;
  status: "SETTLED" | "ALREADY_SETTLED";
  totalPot: number;
  prizePool: number;
  winners: string[];
  payouts: { userId: string; amount: number; type: "PRIZE" | "REFUND" | "NONE" }[];
  scores: Record<string, number>;
  newlyUnlocked: { code: string; title: string; icon: string }[];
}

export class SettlementService {
  /**
   * 1. Authoritative Reward Calculation based on server configuration snapshot.
   */
  static calculateReward(
    snapshot: import("@gaming-hub/shared").MatchConfigSnapshot,
    playerCount: number,
    winnerIds: string[],
  ) {
    return GameConfigService.calculatePrizeSettlement(snapshot, playerCount, winnerIds);
  }

  /**
   * 2. Universal Match Settlement:
   * Validates result -> determines winners -> calculates reward -> atomic wallet credit -> updates ledger -> marks settled.
   * Fully idempotent across socket, HTTP, and background retries.
   */
  static async settleMatch(params: {
    matchId: string;
    winnerIds: string[];
    options?: {
      rated?: boolean;
      reason?: string;
      scores?: Record<string, number>;
      resultType?: "WIN" | "LOSS" | "DRAW" | "FORFEIT";
      adminId?: string;
    };
  }): Promise<SettlementSummary> {
    const idempotencyKey = `SETTLEMENT:MATCH:${params.matchId}`;

    const result = await IdempotencyService.executeOnce<SettlementSummary>({
      key: idempotencyKey,
      operation: "UNIVERSAL_MATCH_SETTLEMENT",
      referenceId: params.matchId,
      handler: async (tx) => {
        const match = await tx.match.findUnique({
          where: { id: params.matchId },
          include: { players: true, room: true },
        });

        if (!match) {
          throw new AppError("NOT_FOUND", "Match not found", 404);
        }

        // Idempotency: return existing result if already finished
        if (match.status === "FINISHED") {
          const totalPot = match.stake * match.players.length;
          const winners = (match.winnerIds as string[]) || params.winnerIds;
          return {
            matchId: match.id,
            gameId: match.gameId,
            status: "ALREADY_SETTLED" as const,
            totalPot,
            prizePool: Math.round(totalPot * 0.9),
            winners,
            payouts: [],
            scores: params.options?.scores ?? {},
            newlyUnlocked: [],
          };
        }

        if (match.status !== "ACTIVE" && match.status !== "CREATED") {
          throw new AppError("INVALID_ACTION", `Cannot settle match with status ${match.status}`, 409);
        }

        // Retrieve or generate match config snapshot
        const roomSettings = (match.room?.settings ?? {}) as Record<string, unknown>;
        let snapshot = roomSettings.configSnapshot as import("@gaming-hub/shared").MatchConfigSnapshot | undefined;
        if (!snapshot) {
          snapshot = await GameConfigService.createSnapshot(match.gameId as GameId, match.stake);
        }

        const settlement = GameConfigService.calculatePrizeSettlement(
          snapshot,
          match.players.length,
          params.winnerIds,
        );

        const rated = params.options?.rated !== false;
        const winnerSet = new Set(params.winnerIds);
        const isDraw = winnerSet.size === 0;
        const totalPot = settlement.totalPot;
        const prizePool = settlement.prizePool;
        const winnerPayout = settlement.winnerPayout;
        const refundPerPlayer = settlement.refundPerPlayer;
        const resultType = params.options?.resultType ?? (isDraw ? "DRAW" : "WIN");

        const payouts: { userId: string; amount: number; type: "PRIZE" | "REFUND" | "NONE" }[] = [];

        for (const player of match.players) {
          let result: "win" | "loss" | "draw";

          if (isDraw) {
            result = "draw";
            if (refundPerPlayer > 0) {
              payouts.push({ userId: player.userId, amount: refundPerPlayer, type: "REFUND" });
              await WalletTransactionService.createGameRefund(tx, {
                userId: player.userId,
                matchId: match.id,
                gameId: match.gameId,
                refundAmount: refundPerPlayer,
                reason: params.options?.reason ?? "draw_refund",
              });
            } else {
              payouts.push({ userId: player.userId, amount: 0, type: "NONE" });
            }
          } else if (winnerSet.has(player.userId)) {
            result = "win";
            if (winnerPayout > 0) {
              payouts.push({ userId: player.userId, amount: winnerPayout, type: "PRIZE" });
              await WalletTransactionService.createGamePrize(tx, {
                userId: player.userId,
                matchId: match.id,
                gameId: match.gameId,
                prizeAmount: winnerPayout,
                reason: params.options?.reason ?? "winner_payout",
              });
            } else {
              payouts.push({ userId: player.userId, amount: 0, type: "NONE" });
            }
          } else {
            result = "loss";
            payouts.push({ userId: player.userId, amount: 0, type: "NONE" });
          }

          const playerScore = params.options?.scores?.[player.userId] ?? player.score ?? 0;

          await tx.matchPlayer.update({
            where: { id: player.id },
            data: {
              result: result.toUpperCase() as "WIN" | "LOSS" | "DRAW",
              score: playerScore,
            },
          });

          await recordMatchResult(tx, {
            userId: player.userId,
            gameId: match.gameId,
            result,
            score: playerScore,
            rated,
          });
        }

        const durationSeconds = match.startedAt
          ? Math.max(0, Math.round((Date.now() - match.startedAt.getTime()) / 1000))
          : 0;

        await tx.matchStatistics.upsert({
          where: { matchId: params.matchId },
          create: {
            matchId: params.matchId,
            durationSeconds,
            startedAt: match.startedAt ?? new Date(),
            endedAt: new Date(),
            coinsAwarded: { totalPot, prizePool, winnerPayout },
          },
          update: {
            durationSeconds,
            endedAt: new Date(),
            coinsAwarded: { totalPot, prizePool, winnerPayout },
          },
        }).catch(() => undefined);

        const rawReason = params.options?.reason ?? "NORMAL";
        const resultReason = rawReason.toUpperCase().includes("TIME")
          ? "TIME_LIMIT"
          : rawReason.toUpperCase().includes("FORFEIT")
            ? "TIMEOUT"
            : rawReason.toUpperCase().includes("ABANDON")
              ? "ABANDONED"
              : rawReason;

        await tx.match.update({
          where: { id: params.matchId },
          data: {
            status: "FINISHED",
            winnerIds: Array.from(winnerSet),
            endedAt: new Date(),
            resultReason,
          },
        });

        if (match.roomId) {
          await tx.room.update({
            where: { id: match.roomId },
            data: { status: "ENDED" },
          });
        }

        if (params.options?.adminId) {
          audit({
            actorType: "user",
            actorId: params.options.adminId,
            action: "admin.settle.match",
            category: "admin",
            targetType: "match",
            targetId: match.id,
            meta: { winners: Array.from(winnerSet), totalPot, prizePool, winnerPayout },
          });
        }

        return {
          matchId: match.id,
          gameId: match.gameId,
          status: "SETTLED" as const,
          totalPot,
          prizePool,
          winners: Array.from(winnerSet),
          payouts,
          scores: params.options?.scores ?? {},
          newlyUnlocked: [] as { code: string; title: string; icon: string }[],
          playerList: match.players.map((p) => ({ userId: p.userId, won: winnerSet.has(p.userId) })),
          isDraw,
          winnerPayout,
        };
      },
    });

    // Execute asynchronous post-commit side effects after transaction commit
    if (result && (result as any).playerList) {
      const { playerList, isDraw, winnerPayout, matchId, gameId } = result as any;
      for (const player of playerList) {
        try {
          const unlocked = await AchievementService.evaluateAchievements(player.userId, {
            userId: player.userId,
            matchResult: { won: player.won, gameId, isDraw },
          });
          for (const achievement of unlocked) {
            result.newlyUnlocked.push({
              code: achievement.code,
              title: achievement.title,
              icon: achievement.icon,
            });
          }
        } catch {
          // Non-critical
        }

        try {
          await ReferralService.evaluateQualification(
            player.userId,
            player.won ? "FIRST_WIN" : "FIRST_GAME",
            { matchId, gameId },
          );
        } catch {
          // Non-critical
        }

        createNotification(
          player.userId,
          "MATCH_RESULT",
          player.won ? "Victory!" : isDraw ? "Match drawn" : "Defeat",
          player.won
            ? `You won ${winnerPayout} coins!`
            : isDraw
              ? "Match was a draw. Wagers refunded."
              : "Better luck next time!",
          { matchId, gameId, payout: player.won ? winnerPayout : 0 },
        ).catch(() => undefined);
      }
    }

    return result;
  }

  /**
   * 3. Tournament Bracket Match Settlement:
   * Concludes individual bracket match and advances bracket without paying final tournament prizes.
   */
  static async settleTournamentMatch(params: {
    matchId: string;
    tournamentId: string;
    winnerId: string;
    loserId: string;
    roundNumber?: number;
    scores?: Record<string, number>;
  }) {
    return this.settleMatch({
      matchId: params.matchId,
      winnerIds: [params.winnerId],
      options: {
        scores: params.scores,
        resultType: "WIN",
        reason: "tournament_bracket_match",
      },
    });
  }

  /**
   * 4. Universal Final Tournament Settlement:
   * Distributes ranked tournament prizes idempotently when tournament completes.
   */
  static async settleTournament(tournamentId: string, adminId?: string): Promise<{
    ok: true;
    tournamentId: string;
    prizesPaid: { userId: string; rank: number; amount: number }[];
  }> {
    const { TournamentSettlementService } = await import("./tournamentSettlementService");
    const result = await TournamentSettlementService.settleTournamentPrizes(tournamentId, { adminId });
    return {
      ok: true,
      tournamentId,
      prizesPaid: result.prizesPaid.map((p) => ({
        userId: p.userId,
        rank: p.rank,
        amount: p.amount,
      })),
    };
  }

  /**
   * 5. Admin Settlement Dispatch
   */
  static async processAdminSettlement(params: {
    referenceType: "MATCH" | "TOURNAMENT";
    referenceId: string;
    winnerIds?: string[];
    reason: string;
    adminId: string;
  }) {
    if (!params.adminId) {
      throw new AppError("FORBIDDEN", "Admin authorization required", 403);
    }

    if (params.referenceType === "MATCH") {
      return this.settleMatch({
        matchId: params.referenceId,
        winnerIds: params.winnerIds ?? [],
        options: {
          reason: params.reason,
          adminId: params.adminId,
        },
      });
    }

    return this.settleTournament(params.referenceId, params.adminId);
  }
}
