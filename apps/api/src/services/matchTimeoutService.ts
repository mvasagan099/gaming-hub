import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type { GameId } from "@gaming-hub/shared";
import { IdempotencyService } from "./idempotencyService";
import { GameConfigService } from "./gameConfigService";
import { SettlementService } from "./settlementService";
import { RefundService } from "./refundService";
import { processMatchResult } from "./tournamentEngine";

export class MatchTimeoutService {
  /**
   * 1. Authoritative Turn Timeout Check & Resolution:
   * Evaluates server deadline for the active player turn. If expired, settles match as forfeit.
   */
  static async checkTurnTimeout(params: {
    matchId: string;
    currentTurnSeat: number;
    turnStartedAt: Date;
    maxTurnSeconds?: number;
  }): Promise<{
    expired: boolean;
    remainingSeconds: number;
    status?: string;
    timedOutSeat?: number;
    winners?: string[];
  }> {
    const match = await prisma.match.findUnique({
      where: { id: params.matchId },
      include: { players: true },
    });

    if (!match) {
      throw new AppError("NOT_FOUND", "Match not found", 404);
    }

    if (match.status !== "ACTIVE") {
      return { expired: false, remainingSeconds: 0, status: match.status };
    }

    const gameConfig = await GameConfigService.getGameConfig(match.gameId as GameId);
    const turnLimit = params.maxTurnSeconds ?? (gameConfig.turnTimerSeconds || 30);
    const deadlineMs = params.turnStartedAt.getTime() + turnLimit * 1000;
    const now = Date.now();

    if (now < deadlineMs) {
      return {
        expired: false,
        remainingSeconds: Math.ceil((deadlineMs - now) / 1000),
      };
    }

    // Turn has expired: execute forfeit settlement
    const timedOutPlayer = match.players.find((p) => p.seat === params.currentTurnSeat);
    const winners = match.players
      .filter((p) => p.seat !== params.currentTurnSeat)
      .map((p) => p.userId);

    const summary = await SettlementService.settleMatch({
      matchId: params.matchId,
      winnerIds: winners,
      options: {
        resultType: "FORFEIT",
        reason: `turn_timeout_seat_${params.currentTurnSeat}`,
      },
    });

    return {
      expired: true,
      remainingSeconds: 0,
      status: summary.status,
      timedOutSeat: params.currentTurnSeat,
      winners,
    };
  }

  /**
   * 2. Authoritative Match Preparation / Join Timeout:
   * Cancels unfilled match lobbies after deadline and refunds 100% of player entry fees.
   */
  static async checkJoinTimeout(params: {
    matchId: string;
    createdDeadlineSeconds?: number;
  }): Promise<{
    expired: boolean;
    remainingSeconds: number;
    status: string;
    refunded: boolean;
  }> {
    const match = await prisma.match.findUnique({
      where: { id: params.matchId },
      include: { players: true },
    });

    if (!match) {
      throw new AppError("NOT_FOUND", "Match not found", 404);
    }

    if (match.status !== "CREATED") {
      return { expired: false, remainingSeconds: 0, status: match.status, refunded: false };
    }

    const gameConfig = await GameConfigService.getGameConfig(match.gameId as GameId);
    const deadlineSeconds = params.createdDeadlineSeconds ?? 60;
    const deadlineMs = match.createdAt.getTime() + deadlineSeconds * 1000;
    const now = Date.now();

    if (now < deadlineMs) {
      return {
        expired: false,
        remainingSeconds: Math.ceil((deadlineMs - now) / 1000),
        status: match.status,
        refunded: false,
      };
    }

    // Expired: cancel match and refund all joined players
    await RefundService.refundCancelledMatch({
      matchId: params.matchId,
      reason: "match_join_timeout",
    });

    return {
      expired: true,
      remainingSeconds: 0,
      status: "ABORTED",
      refunded: true,
    };
  }

  /**
   * 3. Disconnect Grace Period Expiration:
   * Forfeits match in favor of active participants if disconnected player fails to return within window.
   */
  static async handleDisconnectGraceTimeout(params: {
    matchId: string;
    disconnectedUserId: string;
    disconnectedAt: Date;
    graceWindowSeconds?: number;
  }) {
    const match = await prisma.match.findUnique({
      where: { id: params.matchId },
      include: { players: true },
    });

    if (!match) throw new AppError("NOT_FOUND", "Match not found", 404);
    if (match.status !== "ACTIVE") {
      return { expired: false, status: match.status };
    }

    const gameConfig = await GameConfigService.getGameConfig(match.gameId as GameId);
    const graceLimit = params.graceWindowSeconds ?? (gameConfig.reconnectWindowSeconds || 30);
    const deadlineMs = params.disconnectedAt.getTime() + graceLimit * 1000;
    const now = Date.now();

    if (now < deadlineMs) {
      return {
        expired: false,
        remainingSeconds: Math.ceil((deadlineMs - now) / 1000),
        status: "GRACE_ACTIVE",
      };
    }

    const remainingWinners = match.players
      .filter((p) => p.userId !== params.disconnectedUserId)
      .map((p) => p.userId);

    const summary = await SettlementService.settleMatch({
      matchId: params.matchId,
      winnerIds: remainingWinners,
      options: {
        resultType: "FORFEIT",
        reason: "disconnect_grace_timeout",
      },
    });

    return {
      expired: true,
      remainingSeconds: 0,
      status: summary.status,
      winners: remainingWinners,
    };
  }

  /**
   * 4. Tournament Bracket Match Timeout:
   * Advances opponent in tournament bracket when a participant times out.
   */
  static async handleTournamentMatchTimeout(params: {
    tournamentId: string;
    matchId: string;
    roundId: string;
    timedOutUserId: string;
  }) {
    const match = await prisma.match.findUnique({
      where: { id: params.matchId },
      include: { players: true },
    });

    if (!match) throw new AppError("NOT_FOUND", "Match not found", 404);

    const opponent = match.players.find((p) => p.userId !== params.timedOutUserId);
    if (!opponent) throw new AppError("NOT_FOUND", "Opponent not found in tournament match", 404);

    return processMatchResult({
      matchId: params.matchId,
      tournamentId: params.tournamentId,
      roundId: params.roundId,
      winnerId: opponent.userId,
      loserId: params.timedOutUserId,
    });
  }

  /**
   * 5. Admin Timeout Status & Diagnostics:
   * Provides full visibility into server deadlines, turn owners, and match state.
   */
  static async getAdminTimeoutStatus(matchId: string) {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        players: { include: { user: true } },
        gameState: true,
      },
    });

    if (!match) throw new AppError("NOT_FOUND", "Match not found", 404);

    const gameConfig = await GameConfigService.getGameConfig(match.gameId as GameId);
    const elapsedSeconds = match.startedAt
      ? Math.max(0, Math.round((Date.now() - match.startedAt.getTime()) / 1000))
      : 0;

    const rawState = (match.gameState?.state ?? {}) as Record<string, unknown>;
    const currentTurnSeat = (rawState.turn ?? rawState.currentTurn ?? rawState.activeSeat ?? 0) as number;
    const currentTurnPlayer = match.players.find((p) => p.seat === currentTurnSeat);

    return {
      matchId: match.id,
      gameId: match.gameId,
      status: match.status,
      startedAt: match.startedAt?.toISOString() ?? null,
      elapsedSeconds,
      turnTimerSeconds: gameConfig.turnTimerSeconds || 30,
      reconnectWindowSeconds: gameConfig.reconnectWindowSeconds || 30,
      currentTurnSeat,
      currentTurnPlayer: currentTurnPlayer
        ? { userId: currentTurnPlayer.userId, username: currentTurnPlayer.user.username }
        : null,
      players: match.players.map((p) => ({
        seat: p.seat,
        userId: p.userId,
        username: p.user.username,
        result: p.result,
      })),
    };
  }
}
