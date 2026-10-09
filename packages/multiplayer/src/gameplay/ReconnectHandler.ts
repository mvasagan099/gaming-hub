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

    // Auto-resume a match paused by this disconnect once everyone is back.
    if (room.match.pausedAt && room.match.pauseReason !== "player" && await this.allParticipantsConnected(room)) {
      await this.framework.matchManager.resumeMatch(room.id, player.id, true);
    } else if (room.match.pausedAt == null) {
      this.framework.playerManager.startAfkMonitoring(player.id, room.id);
    }
  }

  private async allParticipantsConnected(room: RoomRuntime): Promise<boolean> {
    const players = [...room.players.values()].filter(p => !p.isSpectator);
    // Socket identities are intentionally excluded from durable checkpoints.
    // Resolve empty recovered connection sets through the shared Socket.IO
    // adapter; a persisted "connected" flag alone cannot restart the clocks.
    if (players.some(p => p.connectionStatus === "connected" && p.socketIds.size === 0)) {
      const operator = this.framework.io.in(room.ioName);
      if (typeof operator.fetchSockets === "function") {
        try {
          const live = await operator.fetchSockets();
          for (const socket of live) {
            const player = room.players.get(socket.data.userId);
            if (player && !player.isSpectator) { player.socketIds.add(socket.id); player.connectionStatus = "connected"; }
          }
        } catch {
          this.framework.error("Recovered socket presence unavailable", "RECONNECT_PRESENCE_UNAVAILABLE");
          return false;
        }
      }
      for (const player of players) {
        if (player.connectionStatus === "connected" && player.socketIds.size === 0) {
          player.connectionStatus = "disconnected";
          if (!this.framework.timerManager.getTimerInfo(`${room.id}:reconnect:${player.id}`)) {
            await this.framework.disconnectHandler.handleDisconnect(room, player);
          }
        }
      }
    }
    return players.every(p => p.connectionStatus === "connected" && p.socketIds.size > 0);
  }
}
