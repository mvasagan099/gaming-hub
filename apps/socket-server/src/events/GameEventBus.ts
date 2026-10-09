import { randomBytes } from "node:crypto";
import type { Server } from "socket.io";
import {
  type GameId,
  type GameEventEnvelope,
  type InGameNotification,
  type AnyGameEventType,
  type EventPriority,
  getEventPriority,
} from "@gaming-hub/shared";
import type { RoomRuntime } from "../rooms/types";
import type { ClientToServerEvents, ServerToClientEvents, InterServerEvents } from "@gaming-hub/socket";

export type TypedIoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents>;

export class GameEventBus {
  private static matchStateVersions = new Map<string, number>();
  private static matchEventSequences = new Map<string, number>();

  /**
   * Generates a unique event ID with timestamp prefix
   */
  public static generateEventId(): string {
    return `evt_${Date.now()}_${randomBytes(6).toString("hex")}`;
  }

  /**
   * Gets or initializes the current state version for a match
   */
  public static getStateVersion(matchId: string): number {
    return this.matchStateVersions.get(matchId) ?? 0;
  }

  /**
   * Increments and returns the next authoritative state version for a match
   */
  public static nextStateVersion(matchId: string): number {
    const current = this.getStateVersion(matchId);
    const next = current + 1;
    this.matchStateVersions.set(matchId, next);
    return next;
  }

  /**
   * Explicitly sets authoritative state version for a match to keep event envelopes
   * synchronized with GameStateSyncManager.
   */
  public static setStateVersion(matchId: string, version: number): void {
    this.matchStateVersions.set(matchId, version);
  }

  /**
   * Increments and returns the next authoritative monotonic sequence for a match
   */
  public static nextSequence(matchId: string): number {
    const current = this.matchEventSequences.get(matchId) ?? 0;
    const next = current + 1;
    this.matchEventSequences.set(matchId, next);
    return next;
  }

  /**
   * Resets match version & sequence tracking upon match completion
   */
  public static cleanupMatch(matchId: string): void {
    this.matchStateVersions.delete(matchId);
    this.matchEventSequences.delete(matchId);
  }

  /**
   * Creates a standard GameEventEnvelope with unique eventId, monotonic sequence, and priority
   */
  public static createEnvelope<TPayload = unknown>(
    eventType: AnyGameEventType,
    matchId: string,
    gameId: GameId,
    payload: TPayload,
    customStateVersion?: number,
  ): GameEventEnvelope<TPayload> {
    const stateVersion = customStateVersion ?? this.nextStateVersion(matchId);
    const sequence = this.nextSequence(matchId);
    const priority: EventPriority = getEventPriority(eventType);

    return {
      eventId: this.generateEventId(),
      eventType,
      matchId,
      gameId,
      sequence,
      stateVersion,
      priority,
      timestamp: Date.now(),
      payload,
    };
  }

  /**
   * Validates and broadcasts a game event envelope to the isolated match room
   */
  public static broadcastEvent<TPayload>(
    io: TypedIoServer,
    room: RoomRuntime,
    envelope: GameEventEnvelope<TPayload>,
  ): void {
    // Security check: Match & Game isolation
    if (room.match && envelope.matchId !== room.match.matchId) {
      console.error("[GAME_EVENT_ERROR] Match ID mismatch", {
        roomMatchId: room.match.matchId,
        envelopeMatchId: envelope.matchId,
        eventId: envelope.eventId,
      });
      return;
    }
    if (envelope.gameId !== room.gameId) {
      console.error("[GAME_EVENT_ERROR] Game ID mismatch", {
        roomGameId: room.gameId,
        envelopeGameId: envelope.gameId,
        eventId: envelope.eventId,
      });
      return;
    }

    // Observability Logging
    console.log("[GAME_EVENT]", {
      eventId: envelope.eventId,
      eventType: envelope.eventType,
      matchId: envelope.matchId,
      gameId: envelope.gameId,
      sequence: envelope.sequence,
      stateVersion: envelope.stateVersion,
      priority: envelope.priority,
    });

    // 1. Emit standard envelope to the room
    const isolatedMatchRoom = `game:${room.gameId}:match:${envelope.matchId}`;
    io.to(room.ioName).emit("game:event", envelope as any);
    io.to(isolatedMatchRoom).emit("game:event", envelope as any);

    // 2. Generate and dispatch player notifications if relevant
    this.dispatchNotificationsFromEvent(io, room, envelope);
  }

  /**
   * Dispatches user-friendly in-game notifications with priority levels (CRITICAL, HIGH, NORMAL, LOW)
   */
  private static dispatchNotificationsFromEvent(
    io: TypedIoServer,
    room: RoomRuntime,
    envelope: GameEventEnvelope<any>,
  ): void {
    const { eventType, payload, matchId, gameId, priority } = envelope;

    switch (eventType) {
      case "MATCH_FOUND": {
        this.emitNotification(io, room, {
          priority: "HIGH",
          title: "Match Found!",
          message: "Opponent located. Preparing game lobby...",
          eventType,
          matchId,
          gameId,
          ephemeralMs: 4000,
        });
        break;
      }

      case "PLAYER_READY": {
        const player = room.players.get(payload.playerId);
        if (player) {
          this.emitNotification(io, room, {
            priority: "NORMAL",
            title: "Player Ready",
            message: `${player.displayName} is ready to play!`,
            eventType,
            matchId,
            gameId,
            ephemeralMs: 3000,
          });
        }
        break;
      }

      case "COUNTDOWN_STARTED": {
        this.emitNotification(io, room, {
          priority: "HIGH",
          title: "Get Ready!",
          message: `Match starting in ${payload.seconds ?? 3} seconds...`,
          eventType,
          matchId,
          gameId,
          ephemeralMs: 3000,
        });
        break;
      }

      case "MATCH_STARTED": {
        this.emitNotification(io, room, {
          priority: "HIGH",
          title: "Match Started",
          message: "The game has begun. Good luck!",
          eventType,
          matchId,
          gameId,
          ephemeralMs: 3000,
        });
        break;
      }

      case "TURN_CHANGED": {
        const nextPlayerId = payload.currentPlayerId || payload.nextPlayerId;
        const nextPlayer = room.players.get(nextPlayerId);
        if (nextPlayer) {
          // Send specific "Your turn" notification to the active player
          for (const socketId of nextPlayer.socketIds) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
              const notification: InGameNotification = {
                id: this.generateEventId(),
                priority: "HIGH",
                title: "Your Turn",
                message: "It's your turn to make a move!",
                eventType,
                matchId,
                gameId,
                timestamp: Date.now(),
                targetUserId: nextPlayer.userId,
                ephemeralMs: 3000,
              };
              socket.emit("game:notification", notification as any);
            }
          }
        }
        break;
      }

      case "FOUL_OCCURRED":
      case "FOUL":
      case "CARROM_FOUL":
      case "SNOOKER_FOUL": {
        const player = room.players.get(payload.playerId);
        const name = player?.displayName || "Player";
        this.emitNotification(io, room, {
          priority: "NORMAL",
          title: "Foul!",
          message: `${name}: ${payload.reason || "Foul committed"}`,
          eventType,
          matchId,
          gameId,
          ephemeralMs: 4000,
        });
        break;
      }

      case "TIME_WARNING":
      case "MATCH_TIMER_WARNING": {
        const remaining = payload.remainingSeconds ?? 60;
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        const timeStr = mins > 0 ? `${mins}m ${secs > 0 ? `${secs}s` : ""}` : `${secs}s`;

        this.emitNotification(io, room, {
          priority: "NORMAL",
          title: "Time Warning",
          message: `Only ${timeStr} remaining in this match!`,
          eventType,
          matchId,
          gameId,
          ephemeralMs: 4000,
        });
        break;
      }

      case "TIME_EXPIRED":
      case "MATCH_TIME_EXPIRED": {
        this.emitNotification(io, room, {
          priority: "CRITICAL",
          title: "Time Expired!",
          message: "Match deadline reached. Finalizing results...",
          eventType,
          matchId,
          gameId,
          ephemeralMs: 5000,
        });
        break;
      }

      case "PLAYER_DISCONNECTED": {
        const player = room.players.get(payload.playerId);
        const name = player?.displayName || "Opponent";
        this.emitNotification(io, room, {
          priority: "HIGH",
          title: "Player Disconnected",
          message: `${name} lost connection. Grace period active...`,
          eventType,
          matchId,
          gameId,
          ephemeralMs: 6000,
        });
        break;
      }

      case "PLAYER_RECONNECTED": {
        const player = room.players.get(payload.playerId);
        const name = player?.displayName || "Player";
        this.emitNotification(io, room, {
          priority: "HIGH",
          title: "Player Reconnected",
          message: `${name} has rejoined the match.`,
          eventType,
          matchId,
          gameId,
          ephemeralMs: 3000,
        });
        break;
      }

      case "MATCH_COMPLETED":
      case "GAME_FINISHED": {
        this.emitNotification(io, room, {
          priority: "CRITICAL",
          title: "Match Finished",
          message: `Match finished (${payload.resultReason ?? "NORMAL"}).`,
          eventType,
          matchId,
          gameId,
          ephemeralMs: 6000,
        });
        break;
      }

      default:
        break;
    }
  }

  /**
   * Emits in-game notification packet to the room
   */
  private static emitNotification(
    io: TypedIoServer,
    room: RoomRuntime,
    params: {
      priority: EventPriority;
      title: string;
      message: string;
      eventType: AnyGameEventType;
      matchId: string;
      gameId: GameId;
      targetUserId?: string;
      ephemeralMs?: number;
    },
  ): void {
    const notification: InGameNotification = {
      id: this.generateEventId(),
      priority: params.priority,
      title: params.title,
      message: params.message,
      eventType: params.eventType,
      matchId: params.matchId,
      gameId: params.gameId,
      timestamp: Date.now(),
      targetUserId: params.targetUserId,
      ephemeralMs: params.ephemeralMs ?? 3500,
    };

    io.to(room.ioName).emit("game:notification", notification as any);
  }
}
