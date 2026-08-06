import { randomUUID } from "node:crypto";
import type { Server, Socket } from "socket.io";
import {
  AppError,
  getGameDefinition,
  isGameId,
} from "@gaming-hub/shared";
import type {
  ChatEmoji,
  ChatMessage,
  ChessTimeControlConfig,
  GameId,
  JsonObject,
  MatchSettings,
  RoomFull,
  RoomPlayer,
} from "@gaming-hub/shared";
import type { GameActionResult } from "@gaming-hub/socket";
import { createEngine, isGameEngineAvailable } from "@gaming-hub/game-engine";
import { prisma } from "@gaming-hub/db";
import type { AuthenticatedUser } from "../auth";
import type { RoomPlayerRuntime, RoomRuntime } from "./types";
import { generateRoomCode } from "../roomCode";
import { secureRandomSource } from "../games/rng";
import { GameSession } from "../games/GameSession";
import { holdWagers, settleMatch } from "../apiClient";
import { assertGameEnabled } from "../settings";

const DISCONNECT_GRACE_MS = 90_000;

export interface CreateMatchInput {
  gameId: GameId;
  isPrivate: boolean;
  stake: number;
  maxPlayers: number;
  settings?: MatchSettings;
}

export class RoomManager {
  private readonly rooms = new Map<string, RoomRuntime>();
  private readonly roomsByCode = new Map<string, RoomRuntime>();
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly clockTimers = new Map<string, NodeJS.Timeout>();
  private readonly io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  // ------------------------------------------------------------------ lookups

  getRoomById(roomId: string): RoomRuntime | undefined {
    return this.rooms.get(roomId);
  }

  getRoomByCode(code: string): RoomRuntime | undefined {
    return this.roomsByCode.get(code.trim().toUpperCase());
  }

  private getRoomOrThrow(roomId: string): RoomRuntime {
    const room = this.rooms.get(roomId);
    if (!room) throw new AppError("ROOM_NOT_FOUND", "Room not found", 404);
    return room;
  }

  private getPlayerOrThrow(room: RoomRuntime, userId: string): RoomPlayerRuntime {
    const player = room.players.get(userId);
    if (!player) throw new AppError("NOT_IN_ROOM", "You are not in this room");
    return player;
  }

  private assertHost(room: RoomRuntime, userId: string) {
    if (room.hostId !== userId) {
      throw new AppError("NOT_HOST", "Only the host can do this", 403);
    }
  }

  // ------------------------------------------------------------- serialization

  private toRoomPlayer(player: RoomPlayerRuntime): RoomPlayer {
    return {
      id: player.userId,
      username: player.username,
      displayName: player.displayName,
      avatarUrl: player.avatarUrl,
      seat: player.seat,
      isReady: player.isReady,
      isHost: player.isHost,
      isSpectator: player.isSpectator,
      connectionStatus: player.connectionStatus,
      joinedAt: new Date(player.joinedAt).toISOString(),
    };
  }

  private toRoomFull(room: RoomRuntime): RoomFull {
    const all = [...room.players.values()];
    return {
      id: room.id,
      code: room.code,
      gameId: room.gameId,
      hostId: room.hostId,
      status: room.status,
      isPrivate: room.isPrivate,
      stake: room.stake,
      minPlayers: room.minPlayers,
      maxPlayers: room.maxPlayers,
      hasStarted: room.status !== "waiting",
      createdAt: new Date(room.createdAt).toISOString(),
      players: all.filter((p) => !p.isSpectator).map((p) => this.toRoomPlayer(p)),
      spectators: all.filter((p) => p.isSpectator).map((p) => this.toRoomPlayer(p)),
      settings: room.settings,
      matchId: room.match?.matchId ?? null,
    };
  }

  // ------------------------------------------------------------------ helpers

  private socketIdsOf(room: RoomRuntime): string[] {
    const ids: string[] = [];
    for (const player of room.players.values()) {
      ids.push(...player.socketIds);
    }
    return ids;
  }

  private socketOf(socketId: string): Socket | undefined {
    return this.io.sockets.sockets.get(socketId);
  }

  private emitToRoom(room: RoomRuntime, event: string, payload: unknown) {
    this.io.to(room.ioName).emit(event, payload);
  }

  private broadcastRoomUpdate(room: RoomRuntime) {
    this.emitToRoom(room, "room:update", this.toRoomFull(room));
  }

  private makePlayer(user: AuthenticatedUser, seat: number | null, isHost: boolean, isReady: boolean, isSpectator: boolean): RoomPlayerRuntime {
    return {
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      seat,
      isReady,
      isHost,
      isSpectator,
      connectionStatus: "connected",
      socketIds: new Set(),
      joinedAt: Date.now(),
    };
  }

  private uniqueCode(): string {
    for (let i = 0; i < 10; i++) {
      const code = generateRoomCode();
      if (!this.roomsByCode.has(code)) return code;
    }
    return generateRoomCode() + Date.now().toString(36).slice(-2).toUpperCase();
  }

  private clearDisconnectTimer(roomId: string, userId: string) {
    const key = `${roomId}:${userId}`;
    const timer = this.disconnectTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(key);
    }
  }

  private closeRoom(room: RoomRuntime, reason: string) {
    this.emitToRoom(room, "room:closed", { roomId: room.id, reason });
    this.io.in(room.ioName).socketsLeave(room.ioName);
    this.rooms.delete(room.id);
    this.roomsByCode.delete(room.code);
    this.clearClockTimer(room.id);
    for (const player of room.players.values()) {
      this.clearDisconnectTimer(room.id, player.userId);
    }
    void prisma.room
      .update({ where: { id: room.id }, data: { status: "ENDED" } })
      .catch(() => undefined);
  }

  /** Moves a user out of every room they are currently in. */
  private async ejectFromAllRooms(user: AuthenticatedUser, socket: Socket) {
    for (const room of [...this.rooms.values()]) {
      if (room.players.has(user.userId)) {
        await this.leaveRoomInternal(user, room, socket, true);
      }
    }
  }

  // ------------------------------------------------------------------- rooms

  async createRoom(user: AuthenticatedUser, input: CreateMatchInput, socket: Socket): Promise<RoomFull> {
    if (!isGameId(input.gameId)) {
      throw new AppError("VALIDATION_ERROR", "Unknown game");
    }
    if (!isGameEngineAvailable(input.gameId)) {
      throw new AppError("INVALID_ACTION", "This game is not playable online yet");
    }
    await assertGameEnabled(input.gameId);
    const def = getGameDefinition(input.gameId);
    const maxPlayers = input.maxPlayers ?? def.maxPlayers;
    if (maxPlayers < def.minPlayers || maxPlayers > def.maxPlayers) {
      throw new AppError("VALIDATION_ERROR", `This game supports ${def.minPlayers}-${def.maxPlayers} players`);
    }
    if (input.stake < 0) {
      throw new AppError("VALIDATION_ERROR", "Stake cannot be negative");
    }

    await this.ejectFromAllRooms(user, socket);

    const id = randomUUID();
    const code = this.uniqueCode();
    const now = Date.now();

    const room: RoomRuntime = {
      id,
      code,
      ioName: `room:${id}`,
      gameId: input.gameId,
      hostId: user.userId,
      status: "waiting",
      isPrivate: input.isPrivate,
      stake: input.stake,
      minPlayers: def.minPlayers,
      maxPlayers,
      players: new Map([
        [user.userId, this.makePlayer(user, 0, true, true, false)],
      ]),
      match: null,
      createdAt: now,
      settings: input.settings ?? {},
    };

    this.rooms.set(id, room);
    this.roomsByCode.set(code, room);
    socket.join(room.ioName);
    room.players.get(user.userId)!.socketIds.add(socket.id);

    await prisma.room.create({
      data: {
        id,
        code,
        gameId: input.gameId,
        hostId: user.userId,
        status: "WAITING",
        isPrivate: input.isPrivate,
        stake: input.stake,
        minPlayers: def.minPlayers,
        maxPlayers,
        settings: (input.settings ?? {}) as object,
      },
    });
    await prisma.roomPlayer.create({
      data: {
        roomId: id,
        userId: user.userId,
        seat: 0,
        isHost: true,
        isReady: true,
        isSpectator: false,
        connectionStatus: "CONNECTED",
      },
    });

    this.broadcastRoomUpdate(room);
    return this.toRoomFull(room);
  }

  async joinRoom(user: AuthenticatedUser, input: { roomId?: string; code?: string; asSpectator: boolean }, socket: Socket): Promise<RoomFull> {
    const room = input.roomId ? this.getRoomOrThrow(input.roomId) : input.code ? this.getRoomByCode(input.code) : undefined;
    if (!room) throw new AppError("ROOM_NOT_FOUND", "Room not found", 404);
    if (room.status !== "waiting") {
      throw new AppError("ROOM_CLOSED", "This room has already started");
    }

    await this.ejectFromAllRooms(user, socket);

    const existing = room.players.get(user.userId);
    if (existing) {
      existing.socketIds.add(socket.id);
      socket.join(room.ioName);
      return this.toRoomFull(room);
    }

    const participants = [...room.players.values()].filter((p) => !p.isSpectator).length;
    if (!input.asSpectator && participants >= room.maxPlayers) {
      throw new AppError("ROOM_FULL", "The room is full", 409);
    }
    if (room.isPrivate && !input.asSpectator) {
      throw new AppError("FORBIDDEN", "This room is private");
    }

    const seat = input.asSpectator ? null : this.nextFreeSeat(room);
    const player = this.makePlayer(user, seat, false, false, input.asSpectator);
    player.socketIds.add(socket.id);
    room.players.set(user.userId, player);
    socket.join(room.ioName);

    await prisma.roomPlayer.create({
      data: {
        roomId: room.id,
        userId: user.userId,
        seat,
        isHost: false,
        isReady: false,
        isSpectator: input.asSpectator,
        connectionStatus: "CONNECTED",
      },
    });

    this.emitToRoom(room, "player:joined", { roomId: room.id, player: this.toRoomPlayer(player) });
    this.broadcastRoomUpdate(room);
    return this.toRoomFull(room);
  }

  private nextFreeSeat(room: RoomRuntime): number {
    const taken = new Set(
      [...room.players.values()]
        .filter((p) => !p.isSpectator && p.seat !== null)
        .map((p) => p.seat),
    );
    for (let seat = 0; seat < room.maxPlayers; seat++) {
      if (!taken.has(seat)) return seat;
    }
    return room.maxPlayers - 1;
  }

  async leaveRoom(user: AuthenticatedUser, roomId: string, socket: Socket): Promise<void> {
    const room = this.getRoomOrThrow(roomId);
    await this.leaveRoomInternal(user, room, socket, false);
  }

  private async leaveRoomInternal(user: AuthenticatedUser, room: RoomRuntime, socket: Socket, silent: boolean) {
    const player = room.players.get(user.userId);
    if (!player) return;

    player.socketIds.delete(socket.id);
    socket.leave(room.ioName);

    const stillConnected = player.socketIds.size > 0;
    if (stillConnected) return;

    room.players.delete(user.userId);
    this.clearDisconnectTimer(room.id, user.userId);

    const wasPlaying = room.status === "playing";

    if (room.players.size === 0) {
      this.closeRoom(room, "all players left");
      return;
    }

    if (player.isHost) {
      const nextHost = [...room.players.values()].find((p) => !p.isSpectator) ?? [...room.players.values()][0];
      if (nextHost) {
        room.hostId = nextHost.userId;
        nextHost.isHost = true;
        await prisma.room.update({
          where: { id: room.id },
          data: { hostId: nextHost.userId },
        });
        await prisma.roomPlayer.update({
          where: { roomId_userId: { roomId: room.id, userId: nextHost.userId } },
          data: { isHost: true },
        });
      }
    }

    if (room.status !== "ended") {
      await prisma.roomPlayer.deleteMany({
        where: { roomId: room.id, userId: user.userId },
      });
    }

    if (!silent) {
      this.emitToRoom(room, "player:left", { roomId: room.id, playerId: user.userId });
    }

    // Abort an in-progress match when a participant quits.
    if (wasPlaying && room.match && player.seat !== null) {
      await this.abortMatch(room, "player_left");
      return;
    }

    this.broadcastRoomUpdate(room);
  }

  async setReady(user: AuthenticatedUser, roomId: string, ready: boolean, socket: Socket): Promise<RoomFull> {
    const room = this.getRoomOrThrow(roomId);
    const player = this.getPlayerOrThrow(room, user.userId);
    if (player.isSpectator) {
      throw new AppError("INVALID_ACTION", "Spectators cannot ready up");
    }
    if (room.status !== "waiting") {
      throw new AppError("INVALID_ACTION", "Game already started");
    }
    player.isReady = ready;
    await prisma.roomPlayer.update({
      where: { roomId_userId: { roomId: room.id, userId: user.userId } },
      data: { isReady: ready },
    });
    this.broadcastRoomUpdate(room);
    return this.toRoomFull(room);
  }

  async startGame(user: AuthenticatedUser, roomId: string, socket: Socket): Promise<RoomFull> {
    const room = this.getRoomOrThrow(roomId);
    this.assertHost(room, user.userId);
    if (room.status !== "waiting") {
      throw new AppError("CANNOT_START", "Game already started");
    }

    const participants = [...room.players.values()].filter((p) => !p.isSpectator);
    if (participants.length < room.minPlayers) {
      throw new AppError("CANNOT_START", `Need at least ${room.minPlayers} players`);
    }
    const notReady = participants.filter((p) => !p.isReady);
    if (notReady.length > 0) {
      throw new AppError("CANNOT_START", `${notReady[0].displayName} is not ready`);
    }
    for (const p of participants) {
      if (p.connectionStatus !== "connected") {
        throw new AppError("CANNOT_START", `${p.displayName} is disconnected`);
      }
    }

    return this.launchMatch(room, user, socket);
  }

  async rematch(user: AuthenticatedUser, roomId: string, socket: Socket): Promise<RoomFull> {
    const room = this.getRoomOrThrow(roomId);
    if (room.status !== "ended") {
      throw new AppError("INVALID_ACTION", "Room is not over yet");
    }

    // Reset every participant back to the lobby.
    room.match = null;
    this.clearClockTimer(room.id);
    room.status = "waiting";
    for (const player of room.players.values()) {
      if (player.isSpectator) continue;
      player.isReady = false;
    }
    await prisma.room.update({
      where: { id: room.id },
      data: { status: "WAITING" },
    });

    const participants = [...room.players.values()].filter((p) => !p.isSpectator);
    const participantsRemain = participants.length >= room.minPlayers;

    if (participantsRemain) {
      const host = room.players.get(room.hostId);
      if (host) {
        await this.launchMatch(room, { userId: host.userId }, socket);
      } else {
        this.broadcastRoomUpdate(room);
      }
    } else {
      this.broadcastRoomUpdate(room);
    }

    return this.toRoomFull(room);
  }

  /**
   * Persists a match row, debits entry stakes, spins up the authoritative
   * engine and flips the room to playing. Called by both host "start" and
   * matchmaking auto-start.
   */
  private async launchMatch(room: RoomRuntime, starter: Pick<AuthenticatedUser, "userId">, socket: Socket): Promise<RoomFull> {
    const participants = [...room.players.values()]
      .filter((p) => !p.isSpectator)
      .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));

    // Assign missing seats deterministically.
    participants.forEach((p, index) => {
      if (p.seat === null) p.seat = index;
    });

    const matchId = randomUUID();
    const engine = createEngine(
      room.gameId,
      participants.map((p) => ({ userId: p.userId, seat: p.seat! })),
      secureRandomSource(),
      this.engineOptions(room),
    );

    // Persist the match row and players first; hold-wagers then moves it to ACTIVE.
    const dbMatch = await prisma.match.create({
      data: {
        id: matchId,
        roomId: room.id,
        gameId: room.gameId,
        status: "CREATED",
        winnerIds: [],
        stake: room.stake,
      },
    });
    await prisma.matchPlayer.createMany({
      data: participants.map((p) => ({
        matchId,
        userId: p.userId,
        seat: p.seat!,
        result: "PENDING",
      })),
    });

    try {
      await holdWagers(matchId);
    } catch (error: any) {
      console.error("[holdWagers error]", error);
      await prisma.match.delete({ where: { id: matchId } }).catch(() => undefined);
      const message = error?.message || "One or more players do not have enough coins for this stake";
      throw new AppError("INSUFFICIENT_BALANCE", message);
    }

    room.match = { matchId, engine, turnNumber: 0 };
    room.status = "playing";
    await prisma.room.update({
      where: { id: room.id },
      data: { status: "PLAYING" },
    });

    const startedBy = room.players.get(starter.userId);
    if (startedBy && !startedBy.isSpectator) {
      startedBy.isReady = false;
    }

    void this.logSystemMessage(room, `${room.gameId} match started`);
    this.broadcastRoomUpdate(room);
    this.emitGameState(room, []);
    this.scheduleClockCheck(room);
    return this.toRoomFull(room);
  }

  private engineOptions(room: RoomRuntime): { timeControl?: ChessTimeControlConfig } | undefined {
    const timeControl = room.settings.timeControl as ChessTimeControlConfig | undefined;
    if (!timeControl || timeControl.baseSeconds <= 0) return undefined;
    return { timeControl };
  }

  // ------------------------------------------------------------------- games

  private emitGameState(room: RoomRuntime, events: { type: string }[]) {
    if (!room.match) return;
    const state = room.match.engine.serialize();
    this.io.to(room.ioName).emit("game:state", {
      roomId: room.id,
      matchId: room.match.matchId,
      state,
      events,
    });
  }

  // ---------------------------------------------------------------- clock flag

  /**
   * Schedules the authoritative flag timer for the current seat. Only
   * clock-capable engines (chess with a time control) expose a deadline; for
   * every other game this is a no-op. The timer is re-armed after every
   * accepted action and cleared when the match ends.
   */
  private scheduleClockCheck(room: RoomRuntime) {
    this.clearClockTimer(room.id);
    if (!room.match) return;
    const deadline = room.match.engine.currentClockDeadline;
    if (deadline == null) return;
    const delay = Math.max(0, deadline - Date.now());
    const timer = setTimeout(() => {
      void this.handleClockDeadline(room.id);
    }, delay + 50);
    timer.unref?.();
    this.clockTimers.set(room.id, timer);
  }

  private clearClockTimer(roomId: string) {
    const timer = this.clockTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.clockTimers.delete(roomId);
    }
  }

  private async handleClockDeadline(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== "playing" || !room.match) return;
    const seat = room.match.engine.currentSeat;
    const entry = [...room.players.values()].find((p) => p.seat === seat && !p.isSpectator);
    if (!entry) return;

    const session = new GameSession(room.match);
    const result = await session.apply(entry.userId, seat, { type: "flag" });

    if (result.ok) {
      this.emitGameState(room, result.events);
      if (result.finished) {
        await this.finishMatch(room, result.winnerSeats);
      } else {
        this.scheduleClockCheck(room);
      }
    } else {
      this.scheduleClockCheck(room);
    }
  }

  async applyGameAction(
    user: AuthenticatedUser,
    roomId: string,
    action: { type: string } & JsonObject,
    socket: Socket,
  ): Promise<GameActionResult> {
    const room = this.getRoomOrThrow(roomId);
    if (room.status !== "playing" || !room.match) {
      throw new AppError("GAME_NOT_STARTED", "The game has not started");
    }
    const player = this.getPlayerOrThrow(room, user.userId);
    if (player.isSpectator || player.seat === null) {
      throw new AppError("FORBIDDEN", "Spectators cannot play");
    }

    const session = new GameSession(room.match);
    const result = await session.apply(user.userId, player.seat, action);

    if (!result.ok) {
      const firstEvent = result.events[0];
      return {
        ok: false,
        error: result.error ?? "Action rejected",
        events: result.events,
        state: result.state,
        finished: result.finished,
        winnerSeats: result.winnerSeats,
      };
    }

    this.emitGameState(room, result.events);

    if (result.finished) {
      await this.finishMatch(room, result.winnerSeats);
    } else {
      this.scheduleClockCheck(room);
    }

    return {
      ok: true,
      events: result.events,
      state: result.state,
      finished: result.finished,
      winnerSeats: result.winnerSeats,
    };
  }

  private async finishMatch(room: RoomRuntime, winnerSeats: number[]) {
    if (!room.match) return;
    this.clearClockTimer(room.id);
    const matchId = room.match.matchId;
    const winnerIds = winnerSeats
      .map((seat) => {
        const entry = [...room.players.values()].find((p) => p.seat === seat && !p.isSpectator);
        return entry?.userId;
      })
      .filter((id): id is string => Boolean(id));

    await prisma.match.update({
      where: { id: matchId },
      data: { winnerIds },
    });

    try {
      await settleMatch(matchId, room.settings.rated !== false);
    } catch (error) {
      console.error(`Settlement failed for match ${matchId}`, error);
    }

    const finalState = room.match.engine.serialize();
    room.match = null;
    room.status = "ended";
    await prisma.room.update({ where: { id: room.id }, data: { status: "ENDED" } });

    this.emitToRoom(room, "game:over", {
      roomId: room.id,
      matchId,
      winnerSeats,
      winnerIds,
      state: finalState,
    });
    this.broadcastRoomUpdate(room);
  }

  private async abortMatch(room: RoomRuntime, reason: string) {
    if (!room.match) return;
    this.clearClockTimer(room.id);
    const matchId = room.match.matchId;
    const state = room.match.engine.serialize();

    // Empty winners = draw => refunds via settlement.
    await prisma.match.update({
      where: { id: matchId },
      data: { winnerIds: [] },
    });
    try {
      await settleMatch(matchId, room.settings.rated !== false);
    } catch (error) {
      console.error(`Settlement failed for aborted match ${matchId}`, error);
    }

    room.match = null;
    room.status = "ended";
    await prisma.room.update({ where: { id: room.id }, data: { status: "ENDED" } });
    this.emitToRoom(room, "room:closed", { roomId: room.id, reason });
    this.io.in(room.ioName).socketsLeave(room.ioName);
    this.rooms.delete(room.id);
    this.roomsByCode.delete(room.code);
  }

  // -------------------------------------------------------------------- chat

  async sendChat(user: AuthenticatedUser, roomId: string, text: string, socket: Socket): Promise<ChatMessage> {
    const room = this.getRoomOrThrow(roomId);
    const player = this.getPlayerOrThrow(room, user.userId);
    const cleaned = text.trim().slice(0, 500);
    if (!cleaned) throw new AppError("VALIDATION_ERROR", "Message cannot be empty");

    const message = await prisma.chatMessage.create({
      data: {
        roomId,
        userId: user.userId,
        senderName: player.displayName,
        body: cleaned,
      },
    });

    const payload: ChatMessage = {
      id: message.id,
      roomId: message.roomId,
      userId: message.userId,
      senderName: message.senderName,
      body: message.body,
      isSystem: message.isSystem,
      createdAt: message.createdAt.toISOString(),
    };
    this.emitToRoom(room, "chat:message", payload);
    return payload;
  }

  async sendEmoji(user: AuthenticatedUser, roomId: string, emoji: string, socket: Socket): Promise<void> {
    const room = this.getRoomOrThrow(roomId);
    const player = this.getPlayerOrThrow(room, user.userId);
    if (!/^\p{Extended_Pictographic}$/u.test(emoji)) {
      throw new AppError("VALIDATION_ERROR", "Not a valid emoji");
    }
    const payload: ChatEmoji = {
      roomId,
      userId: user.userId,
      senderName: player.displayName,
      emoji,
      createdAt: new Date().toISOString(),
    };
    this.emitToRoom(room, "chat:emoji", payload);
  }

  private async logSystemMessage(room: RoomRuntime, body: string) {
    const message = await prisma.chatMessage.create({
      data: {
        roomId: room.id,
        userId: null,
        senderName: "System",
        body,
        isSystem: true,
      },
    });
    const payload: ChatMessage = {
      id: message.id,
      roomId: message.roomId,
      userId: message.userId,
      senderName: message.senderName,
      body: message.body,
      isSystem: message.isSystem,
      createdAt: message.createdAt.toISOString(),
    };
    this.emitToRoom(room, "chat:message", payload);
  }

  // ---------------------------------------------------- connection lifecycle

  /**
   * Called when a socket authenticates. Rejoins the user's active room (a
   * running match is resumed with the latest state and the seat reseated).
   */
  async onSocketConnect(user: AuthenticatedUser, socket: Socket): Promise<RoomFull | null> {
    let reconnected: RoomFull | null = null;

    for (const room of this.rooms.values()) {
      if (room.status === "ended") continue;
      const player = room.players.get(user.userId);
      if (!player) continue;

      this.clearDisconnectTimer(room.id, user.userId);
      player.socketIds.add(socket.id);
      socket.join(room.ioName);
      player.connectionStatus = "connected";

      await prisma.roomPlayer.upsert({
        where: { roomId_userId: { roomId: room.id, userId: user.userId } },
        create: {
          roomId: room.id,
          userId: user.userId,
          seat: player.seat,
          isHost: player.isHost,
          isReady: player.isReady,
          isSpectator: player.isSpectator,
          connectionStatus: "CONNECTED",
        },
        update: { connectionStatus: "CONNECTED" },
      });

      this.emitToRoom(room, "player:connection", {
        roomId: room.id,
        playerId: user.userId,
        status: "connected",
      });
      this.broadcastRoomUpdate(room);
      reconnected = this.toRoomFull(room);

      // Re-emit the live game state to the rejoining player's socket only.
      if (room.match) {
        this.emitGameState(room, [{ type: "reconnected" }]);
        this.scheduleClockCheck(room);
      }
    }

    return reconnected;
  }

  /**
   * Called when a socket disconnects. The player is flagged RECONNECTING and
   * gets a grace window before the match is aborted or the seat is released.
   */
  async onSocketDisconnect(user: AuthenticatedUser, socket: Socket): Promise<void> {
    for (const room of this.rooms.values()) {
      if (room.status === "ended") continue;
      const player = room.players.get(user.userId);
      if (!player) continue;

      player.socketIds.delete(socket.id);
      if (player.socketIds.size > 0) continue;

      this.clearDisconnectTimer(room.id, user.userId);

      if (room.status === "playing") {
        player.connectionStatus = "reconnecting";
        await prisma.roomPlayer.update({
          where: { roomId_userId: { roomId: room.id, userId: user.userId } },
          data: { connectionStatus: "RECONNECTING" },
        });
        this.emitToRoom(room, "player:connection", {
          roomId: room.id,
          playerId: user.userId,
          status: "reconnecting",
        });
        this.broadcastRoomUpdate(room);

        const timer = setTimeout(() => {
          void this.handleDisconnectTimeout(room.id, user.userId);
        }, DISCONNECT_GRACE_MS);
        this.disconnectTimers.set(`${room.id}:${user.userId}`, timer);
      } else if (room.status === "waiting") {
        await this.leaveRoomInternal(user, room, socket, false);
      }
    }
  }

  private async handleDisconnectTimeout(roomId: string, userId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const player = room.players.get(userId);
    if (!player) return;
    if (player.socketIds.size > 0) return;

    this.clearDisconnectTimer(roomId, userId);
    player.connectionStatus = "disconnected";
    await prisma.roomPlayer.update({
      where: { roomId_userId: { roomId, userId } },
      data: { connectionStatus: "DISCONNECTED" },
    });
    this.emitToRoom(room, "player:connection", {
      roomId,
      playerId: userId,
      status: "disconnected",
    });

    if (room.status === "playing") {
      await this.abortMatch(room, "player_timeout");
    } else {
      room.players.delete(userId);
      if (room.players.size === 0) {
        this.closeRoom(room, "all players left");
      } else {
        this.broadcastRoomUpdate(room);
      }
    }
  }

  /** Creates a pre-filled, auto-starting room for matchmaking. */
  async createMatchmakingRoom(
    users: AuthenticatedUser[],
    sockets: Socket[],
    gameId: GameId,
    stake: number,
    settings?: MatchSettings,
  ): Promise<RoomFull> {
    const def = getGameDefinition(gameId);
    if (users.length < def.minPlayers || users.length > def.maxPlayers) {
      throw new AppError("INVALID_ACTION", "Wrong number of matchmaking players");
    }
    if (sockets.length !== users.length) {
      throw new AppError("INVALID_ACTION", "Matchmaking players are not connected");
    }

    // Leave any lobby room a player may still be in before locking them in.
    await Promise.all(users.map((user, index) => this.ejectFromAllRooms(user, sockets[index])));

    const id = randomUUID();
    const code = this.uniqueCode();
    const now = Date.now();

    const room: RoomRuntime = {
      id,
      code,
      ioName: `room:${id}`,
      gameId,
      hostId: users[0].userId,
      status: "waiting",
      isPrivate: true,
      stake,
      minPlayers: def.minPlayers,
      maxPlayers: def.maxPlayers,
      players: new Map(),
      match: null,
      createdAt: now,
      settings: settings ?? {},
    };

    users.forEach((user, index) => {
      const player = this.makePlayer(user, index, index === 0, true, false);
      player.socketIds.add(sockets[index].id);
      room.players.set(user.userId, player);
      sockets[index].join(room.ioName);
    });

    this.rooms.set(id, room);
    this.roomsByCode.set(code, room);

    try {
      await prisma.room.create({
        data: {
          id,
          code,
          gameId,
          hostId: users[0].userId,
          status: "WAITING",
          isPrivate: true,
          stake,
          minPlayers: def.minPlayers,
          maxPlayers: def.maxPlayers,
          settings: (settings ?? {}) as object,
        },
      });
      await prisma.roomPlayer.createMany({
        data: users.map((user, index) => ({
          roomId: id,
          userId: user.userId,
          seat: index,
          isHost: index === 0,
          isReady: true,
          isSpectator: false,
          connectionStatus: "CONNECTED",
        })),
      });

      return await this.launchMatch(room, users[0], sockets[0]);
    } catch (error) {
      // Roll back a room that never reached ACTIVE so nobody gets stuck.
      for (const socket of sockets) socket.leave(room.ioName);
      this.rooms.delete(id);
      this.roomsByCode.delete(code);
      for (const player of room.players.values()) {
        this.clearDisconnectTimer(id, player.userId);
      }
      if (room.status === "waiting") {
        await prisma.roomPlayer
          .deleteMany({ where: { roomId: id } })
          .catch(() => undefined);
        await prisma.room.delete({ where: { id } }).catch(() => undefined);
      }
      throw error;
    }
  }
}
