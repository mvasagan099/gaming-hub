/**
 * Turn Manager
 *
 * Centralizes whose turn it is for a match. Turn-based games are gated by the
 * engine's authoritative `currentSeat`; realtime games allow every participant
 * to act at any time. Base actions (resign, draw, pause, chat, …) are never
 * turn-gated.
 */

import type { MultiplayerFramework } from "../framework";
import type { PlayerRuntime, RoomRuntime, GameAction } from "../types";
import type { EngineInstance } from "@gaming-hub/game-engine";
import { getGamePlayConfig } from "./gameConfigs";

/** Actions that any participant may send regardless of whose turn it is. */
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

export class TurnManager {
  private readonly framework: MultiplayerFramework;

  constructor(framework: MultiplayerFramework) {
    this.framework = framework;
  }

  async initialize(): Promise<void> {
    this.framework.log("TurnManager initialized");
  }

  async shutdown(): Promise<void> {
    // No long-lived state to release.
  }

  isTurnBased(room: RoomRuntime): boolean {
    return Boolean(getGamePlayConfig(room.config.gameId)?.turnBased);
  }

  /** The engine-authoritative seat that may act next, or null if finished. */
  getCurrentSeat(room: RoomRuntime): number | null {
    const engine = room.match ? (room.match.engine as EngineInstance) : null;
    if (!engine || engine.finished) return null;
    return engine.currentSeat;
  }

  /** The player id currently entitled to act, or null. */
  getCurrentPlayerId(room: RoomRuntime): string | null {
    const seat = this.getCurrentSeat(room);
    if (seat === null) return null;
    for (const player of room.players.values()) {
      if (!player.isSpectator && player.seat === seat) return player.id;
    }
    return null;
  }

  /**
   * Whether a player may submit the given action right now. Base actions are
   * always allowed; realtime games are never turn-gated.
   */
  canAct(room: RoomRuntime, player: PlayerRuntime, action: GameAction): boolean {
    if (BASE_ACTIONS.has(action.type)) return true;
    if (room.config.gameId === "snooker" && ["concede", "next-frame"].includes(action.type)) return true;
    if (!this.isTurnBased(room)) return true;
    const currentSeat = this.getCurrentSeat(room);
    if (currentSeat === null) return false;
    return player.seat === currentSeat;
  }
}
