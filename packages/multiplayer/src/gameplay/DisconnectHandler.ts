/**
 * Disconnect Handler
 *
 * Centralizes what happens when a participant drops out of an active match:
 * stats are recorded, turn-based matches auto-pause so the absent player is
 * not flag-timed, and a reconnect grace timer is armed that forfeits the
 * player (resigning on their behalf) when it expires.
 */

import type { MultiplayerFramework } from "../framework";
import type { PlayerRuntime, RoomRuntime } from "../types";
import { getGamePlayConfig } from "./gameConfigs";

export class DisconnectHandler {
  private readonly framework: MultiplayerFramework;

  constructor(framework: MultiplayerFramework) {
    this.framework = framework;
  }

  async initialize(): Promise<void> {
    this.framework.log("DisconnectHandler initialized");
  }

  async shutdown(): Promise<void> {
    // Grace timers are owned by TimerManager.
  }

  /** Handle a participant dropping out of an active match. */
  async handleDisconnect(room: RoomRuntime, player: PlayerRuntime): Promise<void> {
    if (!room.match || room.status !== "playing") return;
    if (player.seat === null) return;

    const config = getGamePlayConfig(room.config.gameId);
    this.framework.statisticsCollector.recordDisconnect(room.id, player.id);

    // Auto-pause turn-based matches so the disconnected player's turn clock
    // does not run out while they are trying to reconnect.
    if (config.turnBased && config.pauseOnDisconnect && !room.match.pausedAt) {
      room.match.pausedAt = Date.now();
      room.match.pausedBy = player.id;

      for (const p of room.players.values()) {
        this.framework.playerManager.stopAfkMonitoring(p.id, room.id);
      }

      await this.framework.syncManager.broadcastToRoom(room, "match:paused", {
        roomId: room.id,
        pausedBy: player.id,
        pausedAt: room.match.pausedAt,
        reason: "player_disconnected",
      });

      this.framework.log(
        `Match auto-paused in room ${room.id} because ${player.id} disconnected`,
      );
    }

    // Arm the reconnect grace timer that forfeits on expiry.
    if (config.forfeitOnDisconnect) {
      this.framework.timerManager.startReconnectTimer(room.id, player.id, () => {
        void this.framework.matchManager.handlePlayerForfeit(room, player, "disconnect_timeout");
      });
    }
  }
}
