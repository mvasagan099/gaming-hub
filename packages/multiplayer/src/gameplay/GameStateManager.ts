/**
 * Game State Manager
 *
 * Owns the authoritative game state for every active match. It provides a
 * serial execution queue so concurrent client actions can never interleave
 * and corrupt an engine, plus snapshot/history bookkeeping that powers
 * reconnection, replay and integrity verification.
 */

import type { MultiplayerFramework } from "../framework";
import type {
  RoomRuntime,
  GameAction,
  GameEvent,
  RecordedAction,
  StateSnapshot,
} from "../types";
import type { EngineActionResult, EngineInstance } from "@gaming-hub/game-engine";
import type { JsonObject } from "@gaming-hub/shared";
import { StateValidator } from "../utils/StateValidator";

export class GameStateManager {
  private readonly framework: MultiplayerFramework;
  private readonly queues = new Map<string, Promise<void>>();

  constructor(framework: MultiplayerFramework) {
    this.framework = framework;
  }

  async initialize(): Promise<void> {
    this.framework.log("GameStateManager initialized");
  }

  async shutdown(): Promise<void> {
    this.queues.clear();
  }

  /**
   * Run a task after every previously queued task for the same room has
   * settled, guaranteeing per-room serial execution of state mutations.
   */
  enqueue<T>(roomId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(roomId) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.queues.set(
      roomId,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  /** The authoritative engine for a room, if a match is running. */
  getEngine(room: RoomRuntime): EngineInstance | null {
    return room.match ? (room.match.engine as EngineInstance) : null;
  }

  /** Serialized authoritative state for a room. */
  getState(room: RoomRuntime): JsonObject {
    return this.getEngine(room)?.serialize() ?? {};
  }

  getTurnNumber(room: RoomRuntime): number {
    return room.match?.turnNumber ?? 0;
  }

  isFinished(room: RoomRuntime): boolean {
    return this.getEngine(room)?.finished ?? false;
  }

  /** The winner seats reported by the engine, when finished. */
  getWinnerSeats(room: RoomRuntime): number[] {
    return this.getEngine(room)?.winnerSeats ?? [];
  }

  getSnapshot(room: RoomRuntime, turnNumber: number): StateSnapshot | undefined {
    return room.match?.stateSnapshots.find((s) => s.turnNumber === turnNumber);
  }

  getLatestSnapshot(room: RoomRuntime): StateSnapshot | undefined {
    const snapshots = room.match?.stateSnapshots;
    if (!snapshots || snapshots.length === 0) return undefined;
    return snapshots[snapshots.length - 1];
  }

  /**
   * Record a successful engine transition: bumps the turn counter, appends
   * the action to the match history and stores a state snapshot. Returns the
   * recorded action for replay persistence.
   */
  recordResult(
    room: RoomRuntime,
    result: EngineActionResult<JsonObject>,
    playerId: string,
    seat: number,
    action: GameAction,
    events: GameEvent[],
  ): RecordedAction {
    if (!room.match) throw new Error("No active match");

    room.match.turnNumber++;
    const recordedAction: RecordedAction = {
      turnNumber: room.match.turnNumber,
      timestamp: Date.now(),
      playerId,
      seat,
      action,
      events,
    };
    room.match.actionHistory.push(recordedAction);
    room.match.stateSnapshots.push({
      turnNumber: room.match.turnNumber,
      timestamp: recordedAction.timestamp,
      state: result.state,
      action: recordedAction,
    });
    return recordedAction;
  }

  /**
   * Verify the integrity of the recorded state history: snapshots must be
   * contiguous and the latest snapshot must match the current authoritative
   * engine state.
   */
  verifyReplay(room: RoomRuntime): { valid: boolean; error?: string } {
    const match = room.match;
    if (!match) return { valid: false, error: "No active match" };

    const snapshots = match.stateSnapshots;
    if (snapshots.length === 0) return { valid: true };

    for (let i = 1; i < snapshots.length; i++) {
      if (snapshots[i].turnNumber !== snapshots[i - 1].turnNumber + 1) {
        return { valid: false, error: `Snapshot gap at turn ${snapshots[i].turnNumber}` };
      }
    }

    const latest = snapshots[snapshots.length - 1];
    const current = this.getState(room);
    if (StateValidator.calculateHash(latest.state) !== StateValidator.calculateHash(current)) {
      return { valid: false, error: "Final snapshot does not match authoritative state" };
    }

    return { valid: true };
  }
}
