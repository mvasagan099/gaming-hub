/**
 * Reconnect Handler
 *
 * Restores a reconnecting player to an active match: cancels the forfeit grace
 * timer, rehydrates the authoritative state onto the fresh socket, resumes AFK
 * monitoring and auto-resumes a match that was paused by this player's
 * disconnect once every participant is connected again.
 */

import type { MultiplayerFramework } from "../framework";
import type { PlayerRuntime, RoomRuntime } from "../types";
import type { Socket } from "socket.io";

export class ReconnectHandler {
  private readonly framework: MultiplayerFramework;

  constructor(framework: MultiplayerFramework) {
    this.framework = framework;
  }

  async initialize(): Promise<void> {
    this.framework.log("ReconnectHandler initialized");
  }

  async shutdown(): Promise<void> {
    // No long-lived state to release.
  }

  /** Handle a player reconnecting to an active match. */
  async handleReconnect(room: RoomRuntime, player: PlayerRuntime, socket: Socket): Promise<void> {
    if (!room.match || room.status !== "playing") return;
    if (player.seat === null) return;

    // Cancel the forfeit grace timer armed by the disconnect handler.
    this.framework.timerManager.clearTimer(`${room.id}:reconnect:${player.id}`);

    this.framework.statisticsCollector.recordReconnect(room.id, player.id);

    // Rehydrate authoritative state, chat history and ping monitoring.
    await this.framework.syncManager.syncFullStateToPlayer(room, player.id, socket);

    // Resume AFK monitoring for the reconnected player.
    this.framework.playerManager.startAfkMonitoring(player.id, room.id);

    // Auto-resume a match paused by this disconnect once everyone is back.
    if (room.match.pausedAt && this.allParticipantsConnected(room)) {
      await this.framework.matchManager.resumeMatch(room.id, player.id, true);
    }
  }

  private allParticipantsConnected(room: RoomRuntime): boolean {
    return [...room.players.values()]
      .filter((p) => !p.isSpectator)
      .every((p) => p.connectionStatus === "connected");
  }
}
