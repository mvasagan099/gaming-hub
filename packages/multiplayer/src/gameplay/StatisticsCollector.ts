/**
 * Statistics Collector
 *
 * Tracks per-player match statistics (moves, actions, turn time, disconnect
 * and reconnect counts) for every active match and persists aggregate game
 * stats best-effort when a match finishes.
 */

import type { MultiplayerFramework } from "../framework";
import type { PlayerRuntime, RoomRuntime, GameAction } from "../types";
import type { MatchResult, PlayerMatchResult, PlayerMatchStats } from "./types";

const BASE_ACTIONS: ReadonlySet<string> = new Set([
  "resign",
  "draw-offer",
  "draw-accept",
  "draw-decline",
  "pause",
  "resume",
  "rematch",
  "chat",
  "emoji",
]);

export class StatisticsCollector {
  private readonly framework: MultiplayerFramework;
  private readonly statsByRoom = new Map<string, Map<string, PlayerMatchStats>>();

  constructor(framework: MultiplayerFramework) {
    this.framework = framework;
  }

  async initialize(): Promise<void> {
    this.framework.log("StatisticsCollector initialized");
  }

  async shutdown(): Promise<void> {
    this.statsByRoom.clear();
  }

  getMatchStats(roomId: string, playerId: string): PlayerMatchStats | null {
    return this.statsByRoom.get(roomId)?.get(playerId) ?? null;
  }

  /** Record an applied action (or base action) for a player. */
  recordAction(room: RoomRuntime, player: PlayerRuntime, action: GameAction): void {
    if (player.seat === null) return;
    const stats = this.ensureStats(room, player);
    stats.actionsTaken++;
    stats.actionTypes[action.type] = (stats.actionTypes[action.type] ?? 0) + 1;
    if (!BASE_ACTIONS.has(action.type)) {
      stats.movesMade++;
    }
    this.framework.playerManager.updateStatistics(player.id, {
      movesMade: stats.movesMade,
    });
  }

  recordTurnTime(roomId: string, playerId: string, ms: number): void {
    const stats = this.statsByRoom.get(roomId)?.get(playerId);
    if (stats) stats.timeOnTurnMs += Math.max(0, ms);
  }

  recordDisconnect(roomId: string, playerId: string): void {
    const stats = this.statsByRoom.get(roomId)?.get(playerId);
    if (stats) stats.disconnections++;
  }

  recordReconnect(roomId: string, playerId: string): void {
    const stats = this.statsByRoom.get(roomId)?.get(playerId);
    if (stats) stats.reconnections++;
  }

  recordAfkWarning(roomId: string, playerId: string): void {
    const stats = this.statsByRoom.get(roomId)?.get(playerId);
    if (stats) stats.afkWarnings++;
  }

  /**
   * Finalize a finished match: update session statistics, persist aggregate
   * game stats best-effort, and release per-match state.
   */
  async finalize(room: RoomRuntime, result: MatchResult): Promise<void> {
    const durationMs = room.match ? Date.now() - room.match.startedAt : 0;
    for (const playerResult of result.players) {
      const stats = this.statsByRoom.get(room.id)?.get(playerResult.playerId);
      if (stats) {
        this.framework.playerManager.updateStatistics(playerResult.playerId, {
          timeSpentMs: durationMs,
        });
        await this.persistGameStats(room, playerResult, durationMs);
      }
    }
    this.statsByRoom.delete(room.id);
  }

  private ensureStats(room: RoomRuntime, player: PlayerRuntime): PlayerMatchStats {
    let byPlayer = this.statsByRoom.get(room.id);
    if (!byPlayer) {
      byPlayer = new Map<string, PlayerMatchStats>();
      this.statsByRoom.set(room.id, byPlayer);
    }
    let stats = byPlayer.get(player.id);
    if (!stats) {
      stats = {
        playerId: player.id,
        seat: player.seat ?? -1,
        movesMade: 0,
        actionsTaken: 0,
        actionTypes: {},
        timeOnTurnMs: 0,
        disconnections: 0,
        reconnections: 0,
        afkWarnings: 0,
      };
      byPlayer.set(player.id, stats);
    }
    return stats;
  }

  private async persistGameStats(
    room: RoomRuntime,
    playerResult: PlayerMatchResult,
    durationMs: number,
  ): Promise<void> {
    try {
      const { prisma } = await import("@gaming-hub/db");
      const wins = playerResult.outcome === "won" ? 1 : 0;
      const losses = playerResult.outcome === "lost" ? 1 : 0;
      const draws = playerResult.outcome === "draw" ? 1 : 0;
      const finished = playerResult.outcome !== "aborted";

      await prisma.playerGameStats.upsert({
        where: {
          userId_gameId: { userId: playerResult.playerId, gameId: room.config.gameId },
        },
        create: {
          userId: playerResult.playerId,
          gameId: room.config.gameId,
          totalMatches: finished ? 1 : 0,
          wins,
          losses,
          draws,
          winRate: finished ? wins / Math.max(1, wins + losses + draws) : 0,
          averageMatchDuration: Math.floor(durationMs / 1000),
        },
        update: {
          totalMatches: finished ? { increment: 1 } : undefined,
          wins: wins ? { increment: wins } : undefined,
          losses: losses ? { increment: losses } : undefined,
          draws: draws ? { increment: draws } : undefined,
          averageMatchDuration: Math.floor(durationMs / 1000),
        },
      });
    } catch (error) {
      this.framework.error(`Failed to persist game stats for ${playerResult.playerId}`, error);
    }
  }
}
