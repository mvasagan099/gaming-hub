/**
 * Event Dispatcher
 *
 * Converts engine events into framework game events (adding timestamps and
 * resolving seats to player ids) and keeps a bounded, ordered event log per
 * room. This is the single place where game events are normalized for
 * broadcasting, replay and audit.
 */

import type { MultiplayerFramework } from "../framework";
import type { RoomRuntime, GameEvent } from "../types";
import type { EngineEvent } from "@gaming-hub/game-engine";

export class EventDispatcher {
  private readonly framework: MultiplayerFramework;
  private readonly maxEventLogSize = 500;

  constructor(framework: MultiplayerFramework) {
    this.framework = framework;
  }

  async initialize(): Promise<void> {
    this.framework.log("EventDispatcher initialized");
  }

  async shutdown(): Promise<void> {
    // Room event logs are owned by the room.
  }

  /** Normalize engine events into timestamped framework events. */
  toGameEvents(room: RoomRuntime, events: EngineEvent[]): GameEvent[] {
    const timestamp = Date.now();
    return events.map((e) => {
      const gameEvent: GameEvent = { ...e, timestamp };
      if (typeof e.seat === "number") {
        for (const player of room.players.values()) {
          if (player.seat === e.seat) {
            gameEvent.playerId = player.id;
            break;
          }
        }
      }
      return gameEvent;
    });
  }

  /** Append events to the room's bounded event log. */
  appendToLog(room: RoomRuntime, events: GameEvent[]): void {
    if (events.length === 0) return;
    room.eventLog.push(...events);
    if (room.eventLog.length > this.maxEventLogSize) {
      room.eventLog.splice(0, room.eventLog.length - this.maxEventLogSize);
    }
  }

  /** Snapshot of a room's event log. */
  getRoomEventLog(roomId: string): GameEvent[] {
    const room = this.framework.roomManager.getRoom(roomId);
    return room ? [...room.eventLog] : [];
  }
}
