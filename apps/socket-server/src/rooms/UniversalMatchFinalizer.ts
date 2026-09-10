import { prisma } from "@gaming-hub/db";
import {
  AppError,
  type GameId,
  type StandardMatchResult,
  type UniversalResultReason,
} from "@gaming-hub/shared";
import { GameResultAdapterRegistry } from "@gaming-hub/game-engine";
import { GameEventBus } from "../events/GameEventBus";
import { GameStateSyncManager } from "../sync/GameStateSyncManager";
import { MatchTimeoutMonitoringService } from "./MatchTimeoutMonitoringService";
import { settleMatch, reportTournamentMatchResult } from "../apiClient";
import type { RoomRuntime } from "./types";
import type { Server } from "socket.io";

export interface FinalizeMatchOptions {
  triggerReason?: UniversalResultReason;
  winnerSeats?: number[];
  forfeitedUserId?: string;
  disconnectedUserId?: string;
  adminId?: string;
  now?: number;
}

export interface FinalizationAuditRecord {
  matchId: string;
  gameId: GameId;
  previousState: string;
  result: "WIN" | "LOSS" | "DRAW" | "FORFEIT";
  resultReason: UniversalResultReason;
  winnerId: string | null;
  loserId: string | null;
  scores: Record<string, number>;
  durationSec: number;
  finalizedAt: number;
}

export class UniversalMatchFinalizer {
  private static readonly finalizingMatches = new Set<string>();
  private static readonly finalizedResults = new Map<string, StandardMatchResult>();
  private static readonly auditLogs: FinalizationAuditRecord[] = [];

  /**
   * Universal Match Finalization Entry Point:
   * Validates state, locks mutex atomically, extracts authoritative result via game adapter,
   * commits DB updates, triggers mode-specific handoffs, emits events, and persists replay/history.
   */
  public static async finalizeMatch(
    io: Server,
    room: RoomRuntime,
    options: FinalizeMatchOptions = {},
  ): Promise<StandardMatchResult | null> {
    if (!room.match) return null;
    const matchId = room.match.matchId;
    const now = options.now ?? Date.now();

    // 1. Exactly-Once Idempotency Guard: Mutex & memory cache check
    if (this.finalizingMatches.has(matchId)) {
      console.log(`[UniversalMatchFinalizer] Match ${matchId} is already finalizing. Waiting/Returning cached.`);
      return this.finalizedResults.get(matchId) ?? null;
    }

    if (this.finalizedResults.has(matchId)) {
      console.log(`[UniversalMatchFinalizer] Match ${matchId} is already completed. Returning cached result.`);
      return this.finalizedResults.get(matchId)!;
    }

    if (room.match.matchStatus === "FINALIZING" || room.match.matchStatus === "COMPLETED") {
      console.log(`[UniversalMatchFinalizer] Match ${matchId} status is already ${room.match.matchStatus}`);
      return this.finalizedResults.get(matchId) ?? null;
    }

    // 2. Atomic Transition: LIVE -> FINALIZING
    const previousStatus = room.match.matchStatus ?? "LIVE";
    this.finalizingMatches.add(matchId);
    room.match.matchStatus = "FINALIZING";

    try {
      const participants = [...room.players.values()].filter(
        (p) => !p.isSpectator && p.seat !== null,
      );

      const playerParticipants = participants.map((p) => ({
        seat: p.seat as number,
        userId: p.userId,
        username: p.username,
        displayName: p.displayName,
      }));

      const player1 = playerParticipants[0]?.userId ?? "";
      const player2 = playerParticipants[1]?.userId ?? "";

      // 3. Resolve Game-Specific Adapter
      const gameId = room.gameId;
      const adapter = GameResultAdapterRegistry.getAdapter(gameId);
      const engineState = adapter.getAuthoritativeState(room.match.engine);

      // 4. Calculate Authoritative Winner & Scores
      let resolvedWinnerSeats: number[] = [];
      let resolvedScores: Record<string, number> = {};
      let resultReason: UniversalResultReason = options.triggerReason ?? "NORMAL";

      if (options.triggerReason === "TIME_LIMIT") {
        const timeResult = adapter.calculateTimeLimitResult(engineState, playerParticipants);
        resolvedWinnerSeats = timeResult.winnerSeats;
        resolvedScores = timeResult.scores;
        resultReason = "TIME_LIMIT";
      } else if (options.forfeitedUserId) {
        resultReason = "FORFEIT";
        const remaining = playerParticipants.find((p) => p.userId !== options.forfeitedUserId);
        resolvedWinnerSeats = remaining ? [remaining.seat] : [];
        resolvedScores = adapter.getAllScores(engineState, playerParticipants);
      } else if (options.disconnectedUserId) {
        resultReason = "DISCONNECT";
        const remaining = playerParticipants.find((p) => p.userId !== options.disconnectedUserId);
        resolvedWinnerSeats = remaining ? [remaining.seat] : [];
        resolvedScores = adapter.getAllScores(engineState, playerParticipants);
      } else {
        // Normal completion: use passed winnerSeats or engine winnerSeats
        resolvedWinnerSeats = options.winnerSeats ?? room.match.engine.winnerSeats ?? [];
        resolvedScores = adapter.getAllScores(engineState, playerParticipants);
      }

      const winnerIds = resolvedWinnerSeats
        .map((seat) => playerParticipants.find((p) => p.seat === seat)?.userId)
        .filter((id): id is string => Boolean(id));

      const isDraw = winnerIds.length === 0;
      const hasForfeit = resultReason === "FORFEIT" || participants.some((p) => p.connectionStatus === "forfeited");
      const resultType: "WIN" | "LOSS" | "DRAW" | "FORFEIT" = hasForfeit
        ? "FORFEIT"
        : isDraw
          ? "DRAW"
          : "WIN";

      const winnerId = winnerIds[0] ?? null;
      const loserId = isDraw
        ? null
        : playerParticipants.find((p) => !winnerIds.includes(p.userId))?.userId ?? null;

      const startedAt = room.match.startedAt ?? now;
      const endedAt = now;
      const durationSec = Math.max(0, Math.round((endedAt - startedAt) / 1000));

      const authoritativeResult: StandardMatchResult = {
        matchId,
        gameType: gameId,
        player1,
        player2,
        winner: winnerId,
        loser: loserId,
        finalScore: resolvedScores,
        resultReason,
        startedAt,
        endedAt,
        duration: durationSec,
        stateVersion: room.stateVersion ?? 1,
        winnerSeats: resolvedWinnerSeats,
        isDraw,
        resultType,
        finalState: engineState,
        validatedAt: now,
      };

      // 5. Result Validation: Verify against engine state
      const validation = adapter.validateFinalResult(engineState, playerParticipants, authoritativeResult);
      if (!validation.valid) {
        console.warn(`[UniversalMatchFinalizer] Validation warning for match ${matchId}:`, validation.reason);
      }

      // 6. DB Update (Idempotent update to FINISHED)
      await prisma.match.update({
        where: { id: matchId },
        data: {
          winnerIds,
          status: "FINISHED",
          endedAt: new Date(endedAt),
          resultReason,
        },
      }).catch((err) => {
        console.error(`[UniversalMatchFinalizer] Database update failed for match ${matchId}:`, err);
      });

      // Update room state
      room.status = "ended";
      room.match.matchStatus = "COMPLETED";
      room.match.endedAt = endedAt;
      room.match.resultReason = resultReason;

      // 7. Authoritative Events Broadcast
      const ioRoom = io.to(room.ioName);
      ioRoom.emit("game:finished", authoritativeResult);
      ioRoom.emit("game:over", {
        matchId,
        winnerSeats: resolvedWinnerSeats,
        winnerIds,
        state: engineState,
      });

      GameEventBus.broadcastEvent(
        io,
        room,
        GameEventBus.createEnvelope("GAME_FINISHED", matchId, gameId, authoritativeResult),
      );

      GameEventBus.broadcastEvent(
        io,
        room,
        GameEventBus.createEnvelope("MATCH_COMPLETED", matchId, gameId, authoritativeResult),
      );

      // 8. Mode-Specific Downstream Handoff
      const roomSettings = (room.settings || {}) as Record<string, unknown>;
      const isTournament = Boolean((room as any).mode === "tournament" || roomSettings.tournamentId);

      if (isTournament) {
        // TOURNAMENT HANDOFF: Report to Tournament Engine
        const tournamentId = (roomSettings.tournamentId as string) || "";
        const tournamentRoundId = (roomSettings.tournamentRoundId as string) || "";
        if (tournamentId && tournamentRoundId && winnerId && !isDraw) {
          console.log("[UniversalMatchFinalizer] TOURNAMENT_HANDOFF", {
            matchId,
            tournamentId,
            roundId: tournamentRoundId,
            winnerId,
          });
          reportTournamentMatchResult({
            matchId,
            tournamentId,
            roundId: tournamentRoundId,
            winnerId,
            loserId: loserId ?? undefined,
            scores: resolvedScores,
          }).catch((err) =>
            console.error(`[UniversalMatchFinalizer] Tournament result report failed for match ${matchId}:`, err),
          );
        }
      } else {
        // ONLINE HANDOFF: Casual / Ranked Settlement & Stats
        try {
          const settlement = await settleMatch(matchId, {
            winnerIds,
            scores: resolvedScores,
            resultType,
            rated: room.settings?.rated !== false,
            reason: resultReason,
          });

          const winnerPayout =
            settlement?.result?.payouts?.find((p) => p.userId === winnerId)?.amount ?? 0;

          ioRoom.emit("game:settlement-completed", {
            matchId,
            resultType,
            coinsWon: winnerPayout,
            isDraw,
            refundPerPlayer: isDraw ? room.stake : 0,
            payouts: settlement?.result?.payouts ?? [],
          });

          GameEventBus.broadcastEvent(
            io,
            room,
            GameEventBus.createEnvelope("SETTLEMENT_COMPLETED", matchId, gameId, {
              matchId,
              prizePool: settlement?.result?.pot ?? (room.stake * participants.length),
              winnerPayout,
              refundPerPlayer: isDraw ? room.stake : 0,
              isDraw,
              winnerIds,
            }),
          );
        } catch (error) {
          console.error(`[UniversalMatchFinalizer] Settlement failed for match ${matchId}:`, error);
          MatchTimeoutMonitoringService.recordSettlementFailure();
        }
      }

      // 9. Replay & State Manager Finalization
      const configSnapshot = (room.settings as Record<string, unknown>)?.configSnapshot as any;
      GameStateSyncManager.finalizeMatch(matchId, engineState, {
        winnerIds,
        resultReason: resultReason as any,
        finalScores: resolvedScores,
        entryFee: room.stake,
        configurationVersion: configSnapshot?.version,
      });

      MatchTimeoutMonitoringService.recordCompletion({
        gameId,
        resultReason: (resultReason === "TIME_LIMIT" ? "TIME_LIMIT" : resultReason === "NORMAL" ? "NORMAL" : "TIMEOUT") as any,
        durationSec,
        success: true,
      });

      // 10. Audit Logging
      const auditRecord: FinalizationAuditRecord = {
        matchId,
        gameId,
        previousState: previousStatus,
        result: resultType,
        resultReason,
        winnerId,
        loserId,
        scores: resolvedScores,
        durationSec,
        finalizedAt: endedAt,
      };
      this.auditLogs.push(auditRecord);
      if (this.auditLogs.length > 500) {
        this.auditLogs.shift();
      }

      console.log("[UniversalMatchFinalizer] MATCH_FINALIZED_SUCCESSFULLY", auditRecord);

      // Cache authoritative result for repeat / idempotent queries
      this.finalizedResults.set(matchId, authoritativeResult);
      return authoritativeResult;
    } finally {
      this.finalizingMatches.delete(matchId);
    }
  }

  /**
   * Retrieves cached final result if match has already been finalized
   */
  public static getFinalizedResult(matchId: string): StandardMatchResult | null {
    return this.finalizedResults.get(matchId) ?? null;
  }

  /**
   * Returns audit history logs
   */
  public static getAuditLogs(): FinalizationAuditRecord[] {
    return [...this.auditLogs];
  }

  /**
   * Clears in-memory state (useful for testing)
   */
  public static clearState(): void {
    this.finalizingMatches.clear();
    this.finalizedResults.clear();
    this.auditLogs.length = 0;
  }
}
