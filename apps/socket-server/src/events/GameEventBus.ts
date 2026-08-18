import { randomBytes } from "node:crypto";
import type { Server } from "socket.io";
import type {
  GameId,
  GameEventEnvelope,
  InGameNotification,
  AnyGameEventType,
  NotificationPriority,
  JsonObject,
} from "@gaming-hub/shared";
import type { RoomRuntime } from "../rooms/types";
import type { ClientToServerEvents, ServerToClientEvents, InterServerEvents } from "@gaming-hub/socket";

export type TypedIoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents>;

export class GameEventBus {
  private static matchStateVersions = new Map<string, number>();

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
   * Resets match version tracking upon match completion
   */
  public static cleanupMatch(matchId: string): void {
    this.matchStateVersions.delete(matchId);
  }

  /**
   * Creates a standard GameEventEnvelope with unique eventId and bumped stateVersion
   */
  public static createEnvelope<TPayload = unknown>(
    eventType: AnyGameEventType,
    matchId: string,
    gameId: GameId,
    payload: TPayload,
    customStateVersion?: number,
  ): GameEventEnvelope<TPayload> {
    const stateVersion = customStateVersion ?? this.nextStateVersion(matchId);
    return {
      eventId: this.generateEventId(),
      eventType,
      matchId,
      gameId,
      stateVersion,
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
      stateVersion: envelope.stateVersion,
    });

    // 1. Emit standard envelope to the room
    const isolatedMatchRoom = `game:${room.gameId}:match:${envelope.matchId}`;
    io.to(room.ioName).emit("game:event", envelope as any);
    io.to(isolatedMatchRoom).emit("game:event", envelope as any);

    // 2. Generate and dispatch player notifications if relevant
    this.dispatchNotificationsFromEvent(io, room, envelope);
  }

  /**
   * Dispatches user-friendly in-game notifications with priority levels (HIGH, MEDIUM, LOW)
   */
  private static dispatchNotificationsFromEvent(
    io: TypedIoServer,
    room: RoomRuntime,
    envelope: GameEventEnvelope<any>,
  ): void {
    const { eventType, payload, matchId, gameId } = envelope;

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
            priority: "MEDIUM",
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
        const nextPlayer = room.players.get(payload.nextPlayerId);
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
              socket.emit("game:notification", notification);
            }
          }
        }
        break;
      }

      case "PLAYER_DISCONNECTED": {
        const player = room.players.get(payload.playerId);
        this.emitNotification(io, room, {
          priority: "HIGH",
          title: "Opponent Disconnected",
          message: `${player?.displayName ?? "Opponent"} disconnected. Waiting for reconnection...`,
          eventType,
          matchId,
          gameId,
          ephemeralMs: 5000,
        });
        break;
      }

      case "PLAYER_RECONNECTED": {
        const player = room.players.get(payload.playerId);
        this.emitNotification(io, room, {
          priority: "MEDIUM",
          title: "Opponent Reconnected",
          message: `${player?.displayName ?? "Opponent"} has rejoined the match!`,
          eventType,
          matchId,
          gameId,
          ephemeralMs: 4000,
        });
        break;
      }

      case "PLAYER_FORFEITED": {
        this.emitNotification(io, room, {
          priority: "HIGH",
          title: "Match Forfeited",
          message: "Player did not reconnect in time. Match forfeited.",
          eventType,
          matchId,
          gameId,
          ephemeralMs: 6000,
        });
        break;
      }

      case "SETTLEMENT_COMPLETED": {
        this.emitNotification(io, room, {
          priority: "HIGH",
          title: "Match Settled",
          message: payload.isDraw
            ? "Match resulted in a draw. Stakes refunded."
            : `Winner awarded ${payload.winnerPayout} coins!`,
          eventType,
          matchId,
          gameId,
          ephemeralMs: 6000,
        });
        break;
      }

      case "REMATCH_REQUESTED": {
        const requester = room.players.get(payload.playerId);
        this.emitNotification(io, room, {
          priority: "MEDIUM",
          title: "Rematch Requested",
          message: `${requester?.displayName ?? "Opponent"} wants a rematch!`,
          eventType,
          matchId,
          gameId,
          ephemeralMs: 5000,
        });
        break;
      }
    }
  }

  /**
   * Helper to broadcast InGameNotification to all sockets in a room
   */
  public static emitNotification(
    io: TypedIoServer,
    room: RoomRuntime,
    data: Omit<InGameNotification, "id" | "timestamp">,
  ): void {
    const notification: InGameNotification = {
      ...data,
      id: this.generateEventId(),
      timestamp: Date.now(),
    };
    io.to(room.ioName).emit("game:notification", notification);
  }
}
