/**
 * Action Validator
 *
 * The server-side gate every player action passes through before it reaches
 * the game engine. It rejects actions from spectators, actions sent when no
 * match is running, out-of-turn moves in turn-based games, and floods of
 * too-frequent actions in realtime games.
 */

import type { MultiplayerFramework } from "../framework";
import type { PlayerRuntime, RoomRuntime, GameAction } from "../types";
import { getGamePlayConfig } from "./gameConfigs";

export interface ActionValidation {
  ok: boolean;
  error?: string;
}

export class ActionValidator {
  private readonly framework: MultiplayerFramework;
  private readonly lastActionTimes = new Map<string, number>();

  constructor(framework: MultiplayerFramework) {
    this.framework = framework;
  }

  async initialize(): Promise<void> {
    this.framework.log("ActionValidator initialized");
  }

  async shutdown(): Promise<void> {
    this.lastActionTimes.clear();
  }

  /**
   * Validate an action before it is applied to the engine. The engine still
   * performs its own final validation; this is the fast, framework-level gate.
   */
  validate(room: RoomRuntime, player: PlayerRuntime, action: GameAction): ActionValidation {
    if (!room.match || room.status !== "playing") {
      return { ok: false, error: "Game is not in progress" };
    }

    if (player.isSpectator || player.seat === null) {
      return { ok: false, error: "Spectators cannot play" };
    }

    if (!this.framework.turnManager.canAct(room, player, action)) {
      return { ok: false, error: "It is not your turn" };
    }

    const config = getGamePlayConfig(room.config.gameId);
    const cooldownMs = config?.actionCooldownMs ?? 0;
    const now = Date.now();
    const last = this.lastActionTimes.get(player.id) ?? 0;
    if (cooldownMs > 0 && now - last < cooldownMs) {
      return { ok: false, error: "Action too frequent" };
    }

    return { ok: true };
  }

  /** Record a successfully applied action to enforce the cooldown. */
  recordAction(playerId: string): void {
    this.lastActionTimes.set(playerId, Date.now());
  }

  /** Record a rejected action so spam floods are also throttled. */
  recordRejected(playerId: string): void {
    this.lastActionTimes.set(playerId, Date.now());
  }

  /** Reset cooldown state, e.g. when a player reconnects. */
  resetPlayer(playerId: string): void {
    this.lastActionTimes.delete(playerId);
  }
}
