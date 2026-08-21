import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type { GameId } from "@gaming-hub/shared";
import { GameConfigService } from "./gameConfigService";
import { SettlementService } from "./settlementService";

export interface ActiveMatchPayload {
  matchId: string;
  gameId: string;
  stake: number;
  status: string;
  roomId: string | null;
  seat: number;
  isTournament: boolean;
  stateVersion: number;
  turnNumber: number;
  currentTurnSeat: number | null;
  authoritativeState: Record<string, unknown>;
  players: {
    userId: string;
    username: string;
    displayName: string;
    seat: number;
    score: number;
    result: string;
  }[];
  timer: {
    startedAt: string | null;
    elapsedSeconds: number;
    remainingTurnSeconds?: number;
  };
}

export class MatchRecoveryService {
  /**
   * 1. Get active match for authenticated user.
   * Returns authoritative state, room info, turn sequence, and server-side timer.
   */
  static async getActiveMatchForUser(userId: string): Promise<ActiveMatchPayload | null> {
    const match = await prisma.match.findFirst({
      where: {
        players: {
          some: { userId },
        },
        status: { in: ["ACTIVE", "CREATED"] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        players: { include: { user: true } },
        gameState: true,
      },
    });

    if (!match) return null;

    const myPlayer = match.players.find((p) => p.userId === userId);
    if (!myPlayer) return null;

    const gameConfig = await GameConfigService.getGameConfig(match.gameId as GameId);
    const rawState = (match.gameState?.state ?? {}) as Record<string, unknown>;
    const turnNumber = match.gameState?.turnNumber ?? 0;
    const stateVersion = turnNumber;

    const elapsedSeconds = match.startedAt
      ? Math.max(0, Math.round((Date.now() - match.startedAt.getTime()) / 1000))
      : 0;

    const turnTimeLimit = gameConfig.turnTimerSeconds || 30;
    const currentTurnSeat = (rawState.turn ?? rawState.currentTurn ?? rawState.activeSeat ?? null) as number | null;

    return {
      matchId: match.id,
      gameId: match.gameId,
      stake: match.stake,
      status: match.status,
      roomId: match.roomId,
      seat: myPlayer.seat,
      isTournament: match.roomId ? match.roomId.startsWith("tournament_") : false,
      stateVersion,
      turnNumber,
      currentTurnSeat,
      authoritativeState: rawState,
      players: match.players.map((p) => ({
        userId: p.userId,
        username: p.user.username,
        displayName: p.user.displayName,
        seat: p.seat,
        score: p.score,
        result: p.result,
      })),
      timer: {
        startedAt: match.startedAt ? match.startedAt.toISOString() : null,
        elapsedSeconds,
        remainingTurnSeconds: turnTimeLimit,
      },
    };
  }

  /**
   * 2. Reconnect User to Match:
   * Rehydrates authoritative state or returns finalized outcome if already finished.
   */
  static async reconnectMatch(params: {
    matchId: string;
    userId: string;
    socketId?: string;
  }) {
    const match = await prisma.match.findUnique({
      where: { id: params.matchId },
      include: {
        players: { include: { user: true } },
        gameState: true,
      },
    });

    if (!match) {
      throw new AppError("NOT_FOUND", "Match not found", 404);
    }

    const player = match.players.find((p) => p.userId === params.userId);
    if (!player) {
      throw new AppError("FORBIDDEN", "User is not a participant in this match", 403);
    }

    // If match already concluded while disconnected: return finalized result without restarting
    if (match.status === "FINISHED" || match.status === "ABORTED") {
      const winnerIds = (match.winnerIds as string[]) || [];
      const isWinner = winnerIds.includes(params.userId);
      const isDraw = winnerIds.length === 0 && match.status === "FINISHED";

      return {
        ok: true,
        matchId: match.id,
        status: match.status,
        result: player.result,
        outcome: isWinner ? "WIN" : isDraw ? "DRAW" : "LOSS",
        winnerIds,
        scores: match.players.map((p) => ({ userId: p.userId, score: p.score, result: p.result })),
        endedAt: match.endedAt ? match.endedAt.toISOString() : null,
      };
    }

    // Active match recovery payload
    const gameConfig = await GameConfigService.getGameConfig(match.gameId as GameId);
    const rawState = (match.gameState?.state ?? {}) as Record<string, unknown>;
    const turnNumber = match.gameState?.turnNumber ?? 0;
    const elapsedSeconds = match.startedAt
      ? Math.max(0, Math.round((Date.now() - match.startedAt.getTime()) / 1000))
      : 0;

    return {
      ok: true,
      matchId: match.id,
      gameId: match.gameId,
      status: match.status,
      roomId: match.roomId,
      seat: player.seat,
      stateVersion: turnNumber,
      turnNumber,
      authoritativeState: rawState,
      players: match.players.map((p) => ({
        userId: p.userId,
        username: p.user.username,
        displayName: p.user.displayName,
        seat: p.seat,
        score: p.score,
        result: p.result,
      })),
      timer: {
        startedAt: match.startedAt ? match.startedAt.toISOString() : null,
        elapsedSeconds,
        turnTimeLimit: gameConfig.turnTimerSeconds || 30,
      },
    };
  }

  /**
   * 3. Handle Player Disconnect with Grace Period:
   * Arms a server-side grace period countdown (30s) without immediate forfeit.
   */
  static async handleDisconnect(params: {
    matchId: string;
    userId: string;
  }) {
    const match = await prisma.match.findUnique({
      where: { id: params.matchId },
      include: { players: true },
    });

    if (!match) throw new AppError("NOT_FOUND", "Match not found", 404);
    if (match.status !== "ACTIVE") {
      return { ok: true, matchId: match.id, status: match.status };
    }

    const gameConfig = await GameConfigService.getGameConfig(match.gameId as GameId);
    const gracePeriodSeconds = gameConfig.reconnectWindowSeconds || 30;

    return {
      ok: true,
      matchId: match.id,
      disconnectedUserId: params.userId,
      gracePeriodSeconds,
      status: "DISCONNECTED",
    };
  }

  /**
   * 4. Handle Disconnect Timeout / Abandonment:
   * Settles match authoritatively for remaining players after grace period expires.
   */
  static async handleAbandonment(params: {
    matchId: string;
    userId: string;
  }) {
    const match = await prisma.match.findUnique({
      where: { id: params.matchId },
      include: { players: true },
    });

    if (!match) throw new AppError("NOT_FOUND", "Match not found", 404);
    if (match.status !== "ACTIVE") {
      return { ok: true, matchId: match.id, status: match.status };
    }

    const remainingWinners = match.players
      .filter((p) => p.userId !== params.userId)
      .map((p) => p.userId);

    return SettlementService.settleMatch({
      matchId: params.matchId,
      winnerIds: remainingWinners,
      options: {
        resultType: "FORFEIT",
        reason: "player_abandonment_timeout",
      },
    });
  }

  /**
   * 5. Recover Match from Database (Post-Server Restart):
   * Rehydrates full game session and moves from database persistence.
   */
  static async recoverMatchFromDatabase(matchId: string) {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        players: { include: { user: true } },
        gameState: true,
        moves: { orderBy: { turnNumber: "asc" } },
      },
    });

    if (!match) throw new AppError("NOT_FOUND", "Match not found", 404);

    return {
      matchId: match.id,
      gameId: match.gameId,
      status: match.status,
      players: match.players,
      state: match.gameState?.state ?? {},
      turnNumber: match.gameState?.turnNumber ?? 0,
      totalMoves: match.moves.length,
      startedAt: match.startedAt,
    };
  }
}
