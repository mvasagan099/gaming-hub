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
import type { EngineInstance } from "@gaming-hub/game-engine";

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
    const match = room.match;
    const pause = async () => {
      if (!room.match || room.match !== match || room.status !== "playing") return;
      if (room.config.gameId === "snake-vs-worms") {
        const result = (room.match.engine as EngineInstance).apply({ type: "boost-stop" }, player.seat!);
        if (result.ok) await this.framework.syncManager.broadcastGameState(room, result.events);
      }
      if (config?.turnBased && config?.pauseOnDisconnect && !room.match.pausedAt) {
        room.match.pausedAt = Date.now();
        room.match.pausedBy = player.id;
        if (room.config.gameId === "snooker") {
          (room.match.engine as unknown as { pauseClocks(): void }).pauseClocks();
          await this.framework.syncManager.broadcastGameState(room, []);
        }

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
    };
    if (["snooker", "snake-vs-worms"].includes(room.config.gameId)) await this.framework.gameStateManager.enqueue(room.id, pause);
    else await pause();

    // Arm the reconnect grace timer that forfeits on expiry.
    if (config.forfeitOnDisconnect) {
      this.framework.timerManager.startReconnectTimer(room.id, player.id, () => {
        return this.framework.matchManager.handlePlayerForfeit(room, player, "disconnect_timeout");
      });
    }
  }
}
