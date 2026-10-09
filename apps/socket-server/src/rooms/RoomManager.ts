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
  UniversalMatchRoomState,
  UniversalMatchState,
  UniversalMatchPlayer,
} from "@gaming-hub/shared";
import type { GameActionResult, RematchUpdate } from "@gaming-hub/socket";
import { createEngine, isGameEngineAvailable } from "@gaming-hub/game-engine";
import { prisma } from "@gaming-hub/db";
import type { AuthenticatedUser } from "../auth";
import type { RoomPlayerRuntime, RoomRuntime } from "./types";
import { generateRoomCode } from "../roomCode";
import { secureRandomSource } from "../games/rng";
import { GameSession } from "../games/GameSession";
import { holdWagers, settleMatch, cancelMatch, reportTournamentMatchResult, createAndFundMatch } from "../apiClient";
import { assertGameEnabled, createMatchConfigSnapshot } from "../settings";
import { GameEventBus } from "../events/GameEventBus";
import { GameStateSyncManager } from "../sync/GameStateSyncManager";
import { MatchTimeoutMonitoringService } from "./MatchTimeoutMonitoringService";
import { UniversalMatchFinalizer } from "./UniversalMatchFinalizer";

const DISCONNECT_GRACE_MS = 30_000;
const MATCH_READY_TIMEOUT_MS = 30_000;

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
  private readonly readyTimers = new Map<string, NodeJS.Timeout>();
  private readonly clockTimers = new Map<string, NodeJS.Timeout>();
  private readonly warningTimers = new Map<string, NodeJS.Timeout>();
  private readonly scheduledWarnings = new Set<string>();
  private readonly activeTurnTimerKeys = new Map<string, string>();
  private readonly processedForfeits = new Set<string>();
  private readonly finalizingMatches = new Set<string>();
  private readonly roomLocks = new Map<string, Promise<void>>();
  private readonly io: Server;
  private backgroundTimeoutInterval?: NodeJS.Timeout;

  constructor(io: Server) {
    this.io = io;
    this.startBackgroundWorker();
  }

  public startBackgroundWorker(): void {
    if (this.backgroundTimeoutInterval) return;
    this.backgroundTimeoutInterval = setInterval(() => {
      void this.checkAllMatchesTimeout();
    }, 2000);
    this.backgroundTimeoutInterval.unref?.();
  }

  public stopBackgroundWorker(): void {
    if (this.backgroundTimeoutInterval) {
      clearInterval(this.backgroundTimeoutInterval);
      this.backgroundTimeoutInterval = undefined;
    }
  }

  /**
   * Background Timeout Worker:
   * Periodically checks all playing rooms for 10-minute deadline expiration.
   * Ensures disconnected/abandoned matches are authoritatively finalized on time.
   */
  public async checkAllMatchesTimeout(): Promise<void> {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (room.status === "playing" && room.match && room.match.matchDeadline) {
        // Operational alert for stuck matches past grace window (> 15s past deadline)
        if (
          room.match.matchStatus === "ACTIVE" &&
          now > room.match.matchDeadline + 15_000
        ) {
          console.error(`[OPERATIONAL ALERT] TIMEOUT_PROCESSING_ERROR: Stuck match detected in Room ${room.id} (${room.gameId}), Match ${room.match.matchId}, overdue by ${now - room.match.matchDeadline}ms`);
        }

        if (
          room.match.matchStatus === "ACTIVE" &&
          !this.finalizingMatches.has(room.match.matchId) &&
          now >= room.match.matchDeadline
        ) {
          console.log(`[BACKGROUND TIMEOUT WORKER] Expiring match ${room.match.matchId} in room ${room.id}`);
          void this.handleClockDeadline(room.id, "match");
        }
      }
    }
  }

  public auditMatches() {
    return MatchTimeoutMonitoringService.auditActiveMatches(this.rooms);
  }

  public getMetrics() {
    return MatchTimeoutMonitoringService.getMetricsSummary(this.rooms);
  }

  public getLiveMatches() {
    return MatchTimeoutMonitoringService.getAdminLiveMatches(this.rooms);
  }

  /**
   * Server Startup Recovery:
   * Finds any active matches in the database that exceeded their deadline during server downtime,
   * and finalizes their settlement with TIME_LIMIT.
   */
  public async recoverActiveMatches(): Promise<void> {
    try {
      const activeMatches = await prisma.match.findMany({
        where: { status: "ACTIVE" },
      });
      const now = Date.now();
      for (const m of activeMatches) {
        if (m.matchDeadline && m.matchDeadline.getTime() <= now) {
          console.log(`[STARTUP RECOVERY] Finalizing expired orphan match ${m.id}`);
          try {
            await settleMatch(m.id, {
              winnerIds: (m.winnerIds as string[]) || [],
              reason: "TIME_LIMIT",
            });
          } catch (err) {
            console.error(`[STARTUP RECOVERY] Failed to settle orphan match ${m.id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error("[STARTUP RECOVERY] Error during active match recovery:", err);
    }
  }

  /**
   * Executes an async task exclusively under a per-room lock.
   * Eliminates race conditions on concurrent joins, leaves, and match launches.
   */
  async withRoomLock<T>(roomId: string, task: () => Promise<T>): Promise<T> {
    while (this.roomLocks.has(roomId)) {
      try {
        await this.roomLocks.get(roomId);
      } catch {
        // Ignore previous task rejection
      }
    }

    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.roomLocks.set(roomId, lockPromise);

    try {
      return await task();
    } finally {
      this.roomLocks.delete(roomId);
      resolveLock();
    }
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

  private startReadyTimeout(room: RoomRuntime): void {
    if (room.status !== "waiting") return;
    this.clearReadyTimeout(room.id);
    const expiresAt = Date.now() + MATCH_READY_TIMEOUT_MS;
    room.readyExpiresAt = expiresAt;
    const timer = setTimeout(() => {
      void this.handleReadyTimeout(room.id);
    }, MATCH_READY_TIMEOUT_MS);
    this.readyTimers.set(room.id, timer);
    room.readyTimer = timer;
  }

  private clearReadyTimeout(roomId: string): void {
    const timer = this.readyTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.readyTimers.delete(roomId);
    }
    const room = this.rooms.get(roomId);
    if (room) {
      room.readyTimer = null;
      room.readyExpiresAt = null;
    }
  }

  private async handleReadyTimeout(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room || room.status === "playing" || room.status === "ended") return;

    const participants = [...room.players.values()].filter((p) => !p.isSpectator);
    const unready = participants.filter((p) => !p.isReady || p.connectionStatus !== "connected");
    if (unready.length > 0 || participants.length < room.minPlayers) {
      console.log("[MATCHMAKING] READY_TIMEOUT", { roomId: room.id, pendingMatchId: room.pendingMatchId });
      await this.cancelRoomDueToUnready(room, "READY_TIMEOUT");
    }
  }

  private async cancelRoomDueToUnready(room: RoomRuntime, reason: string): Promise<void> {
    const matchId = room.pendingMatchId ?? room.match?.matchId ?? room.id;
    this.clearReadyTimeout(room.id);
    if (room.countdownTimer) {
      clearTimeout(room.countdownTimer);
      room.countdownTimer = null;
    }
    room.countdownStarted = false;

    // Refund entry wagers if match was funded/created
    if (room.pendingMatchId || room.match) {
      try {
        await cancelMatch(matchId, reason);
      } catch (err) {
        console.error("[cancelMatch error on ready timeout]", err);
      }
    }

    this.emitToRoom(room, "game:match-cancelled", {
      matchId,
      roomId: room.id,
      reason: "MATCH_READY_TIMEOUT",
      message: "Match cancelled: required players did not ready up within 30 seconds",
    });
    GameEventBus.broadcastEvent(
      this.io,
      room,
      GameEventBus.createEnvelope("MATCH_CANCELLED", matchId, room.gameId, {
        reason: "MATCH_READY_TIMEOUT",
        message: "Match cancelled: required players did not ready up within 30 seconds",
      }),
    );

    this.closeRoom(room, "MATCH_READY_TIMEOUT");
  }

  /** Validates that the player is not currently in another active playing match. */
  assertNotInActiveMatch(userId: string): void {
    for (const room of this.rooms.values()) {
      if ((room.status === "playing" || room.status === "starting") && room.players.has(userId)) {
        const player = room.players.get(userId);
        if (player && !player.isSpectator) {
          throw new AppError(
            "ALREADY_IN_ACTIVE_MATCH",
            "You are already active in another match. Please finish or leave that match first.",
          );
        }
      }
    }
  }

  private cleanupMatchRuntime(room: RoomRuntime): void {
    if (!room.match) return;
    const matchId = room.match.matchId;
    GameStateSyncManager.cleanupMatch(matchId);
    GameEventBus.cleanupMatch(matchId);

    // Prevent unbounded memory growth
    this.finalizingMatches.delete(matchId);
    
    for (const key of this.processedForfeits.keys()) {
      if (key.startsWith(`${matchId}:`)) {
        this.processedForfeits.delete(key);
      }
    }
    for (const key of this.scheduledWarnings.keys()) {
      if (key.startsWith(`${matchId}:`)) {
        this.scheduledWarnings.delete(key);
      }
    }
  }

  private closeRoom(room: RoomRuntime, reason: string) {
    this.cleanupMatchRuntime(room);
    this.emitToRoom(room, "room:closed", { roomId: room.id, reason });
    this.io.in(room.ioName).socketsLeave(room.ioName);
    this.rooms.delete(room.id);
    this.roomsByCode.delete(room.code);
    this.clearClockTimer(room.id);
    this.clearReadyTimeout(room.id);
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
    await assertGameEnabled(input.gameId, input.stake);
    const def = getGameDefinition(input.gameId);
    const maxPlayers = input.maxPlayers ?? def.maxPlayers;
    if (maxPlayers < def.minPlayers || maxPlayers > def.maxPlayers) {
      throw new AppError("VALIDATION_ERROR", `This game supports ${def.minPlayers}-${def.maxPlayers} players`);
    }
    if (input.stake < 0) {
      throw new AppError("VALIDATION_ERROR", "Stake cannot be negative");
    }

    this.assertNotInActiveMatch(user.userId);

    if (input.stake > 0) {
      const wallet = await prisma.wallet.findUnique({ where: { userId: user.userId } });
      if (!wallet || wallet.balance < input.stake) {
        throw new AppError("INSUFFICIENT_BALANCE", `You need at least ${input.stake} coins to create a room with this entry fee`);
      }
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
      rematch: null,
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

    this.startReadyTimeout(room);
    this.broadcastRoomUpdate(room);
    return this.toRoomFull(room);
  }

  async joinRoom(user: AuthenticatedUser, input: { roomId?: string; code?: string; asSpectator: boolean }, socket: Socket): Promise<RoomFull> {
    const room = input.roomId ? this.getRoomOrThrow(input.roomId) : input.code ? this.getRoomByCode(input.code) : undefined;
    if (!room) throw new AppError("ROOM_NOT_FOUND", "Room not found", 404);

    return this.withRoomLock(room.id, async () => {
      if (room.status !== "waiting") {
        throw new AppError("ROOM_CLOSED", "This room has already started");
      }

      if (!input.asSpectator) {
        this.assertNotInActiveMatch(user.userId);
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
      if (!input.asSpectator) {
        await assertGameEnabled(room.gameId, room.stake);
      }

      if (!input.asSpectator && room.stake > 0) {
        const wallet = await prisma.wallet.findUnique({ where: { userId: user.userId } });
        if (!wallet || wallet.balance < room.stake) {
          throw new AppError("INSUFFICIENT_BALANCE", `You need at least ${room.stake} coins to join this room`);
        }
      }

      const seat = input.asSpectator ? null : this.nextFreeSeat(room);
      const player = this.makePlayer(user, seat, false, false, input.asSpectator);
      player.socketIds.add(socket.id);
      room.players.set(user.userId, player);
      socket.join(room.ioName);

      await prisma.roomPlayer.upsert({
        where: { roomId_userId: { roomId: room.id, userId: user.userId } },
        create: {
          roomId: room.id,
          userId: user.userId,
          seat,
          isHost: false,
          isReady: false,
          isSpectator: input.asSpectator,
          connectionStatus: "CONNECTED",
        },
        update: {
          seat,
          isSpectator: input.asSpectator,
          connectionStatus: "CONNECTED",
        },
      });

      this.startReadyTimeout(room);
      this.emitToRoom(room, "player:joined", { roomId: room.id, player: this.toRoomPlayer(player) });
      this.broadcastRoomUpdate(room);
      return this.toRoomFull(room);
    });
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

    if (room.rematch && !player.isSpectator) {
      this.clearRematch(room);
    }

    if (room.countdownTimer) {
      clearTimeout(room.countdownTimer);
      room.countdownTimer = null;
    }
    room.countdownStarted = false;
    if (room.status === "starting") {
      room.status = "waiting";
    }
    if (room.pendingMatchId) {
      void cancelMatch(room.pendingMatchId, "player_left_lobby");
      room.pendingMatchId = null;
      this.emitToRoom(room, "game:match-cancelled", { roomId: room.id, reason: "player_left_lobby" });
    }

    // Abort an in-progress match when a participant quits.
    if (wasPlaying && room.match && player.seat !== null) {
      await this.abortMatch(room, "player_left");
      return;
    }

    this.broadcastRoomUpdate(room);
  }

  private emitLobbyState(room: RoomRuntime) {
    const participants = [...room.players.values()].filter((p) => !p.isSpectator);
    const payload = {
      matchId: room.match?.matchId ?? room.pendingMatchId ?? room.id,
      roomId: room.id,
      gameId: room.gameId,
      entryFee: room.stake,
      status: room.status === "starting" ? "countdown" : room.status,
      players: participants.map((p) => ({
        playerId: p.userId,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        seat: p.seat,
        isHost: p.isHost,
        ready: p.isReady,
        connected: p.connectionStatus === "connected",
        entryReserved: room.stake === 0 || Boolean(room.pendingMatchId || room.match),
      })),
    };
    this.emitToRoom(room, "game:lobby-state", payload);
  }

  async setReady(user: AuthenticatedUser, roomId: string, ready: boolean, socket: Socket): Promise<RoomFull> {
    const room = this.getRoomOrThrow(roomId);
    const player = this.getPlayerOrThrow(room, user.userId);
    if (player.isSpectator) {
      throw new AppError("INVALID_ACTION", "Spectators cannot ready up");
    }
    if (room.status === "starting") {
      throw new AppError("INVALID_ACTION", "Countdown already started, ready state is locked");
    }
    if (room.status !== "waiting") {
      throw new AppError("INVALID_ACTION", "Game already started");
    }

    if (player.isReady === ready) {
      return this.toRoomFull(room);
    }

    player.isReady = ready;
    await prisma.roomPlayer.update({
      where: { roomId_userId: { roomId: room.id, userId: user.userId } },
      data: { isReady: ready },
    });

    const matchId = room.pendingMatchId ?? room.id;
    this.emitToRoom(room, ready ? "game:player-ready" : "game:player-unready", {
      roomId: room.id,
      matchId,
      playerId: user.userId,
    });
    GameEventBus.broadcastEvent(
      this.io,
      room,
      GameEventBus.createEnvelope(ready ? "PLAYER_READY" : "PLAYER_UNREADY", matchId, room.gameId, {
        playerId: user.userId,
        ready,
      })
    );
    this.broadcastRoomUpdate(room);
    this.emitLobbyState(room);

    // Auto-start countdown once every participant is ready and connected.
    if (ready) {
      this.maybeStartCountdown(room, socket);
    }

    return this.toRoomFull(room);
  }

  /** Launches the 3-2-1 countdown when everyone is ready and connected. */
  private maybeStartCountdown(room: RoomRuntime, socket: Socket): void {
    if (room.status !== "waiting" || room.countdownStarted) return;
    const participants = [...room.players.values()].filter((p) => !p.isSpectator);
    if (participants.length < room.minPlayers) return;
    if (participants.some((p) => !p.isReady)) return;
    if (participants.some((p) => p.connectionStatus !== "connected")) return;

    room.countdownStarted = true;
    room.status = "starting";
    this.broadcastRoomUpdate(room);
    this.emitLobbyState(room);

    const matchId = room.match?.matchId ?? room.pendingMatchId ?? room.id;
    console.log("[MATCHMAKING] COUNTDOWN_STARTED", { matchId, roomId: room.id });

    this.emitToRoom(room, "game:countdown", { matchId, countdown: 3 });
    GameEventBus.broadcastEvent(
      this.io,
      room,
      GameEventBus.createEnvelope("COUNTDOWN_STARTED", matchId, room.gameId, {
        value: 3,
        countdown: 3,
      })
    );

    const step2 = setTimeout(() => {
      if (room.status !== "starting") return;
      this.emitToRoom(room, "game:countdown", { matchId, countdown: 2 });
      GameEventBus.broadcastEvent(
        this.io,
        room,
        GameEventBus.createEnvelope("COUNTDOWN_UPDATED", matchId, room.gameId, {
          value: 2,
          countdown: 2,
        })
      );

      const step1 = setTimeout(() => {
        if (room.status !== "starting") return;
        this.emitToRoom(room, "game:countdown", { matchId, countdown: 1 });
        GameEventBus.broadcastEvent(
          this.io,
          room,
          GameEventBus.createEnvelope("COUNTDOWN_UPDATED", matchId, room.gameId, {
            value: 1,
            countdown: 1,
          })
        );

        const step0 = setTimeout(async () => {
          if (room.status !== "starting") return;
          this.emitToRoom(room, "game:countdown", { matchId, countdown: 0 });
          GameEventBus.broadcastEvent(
            this.io,
            room,
            GameEventBus.createEnvelope("COUNTDOWN_UPDATED", matchId, room.gameId, {
              value: 0,
              countdown: 0,
            })
          );
          room.countdownTimer = null;
          try {
            await this.launchMatch(room, { userId: room.hostId }, socket);
          } catch (err) {
            console.error("Failed to launch match after countdown", err);
          }
        }, 1000);
        room.countdownTimer = step0;
      }, 1000);
      room.countdownTimer = step1;
    }, 1000);
    room.countdownTimer = step2;
  }

  async startGame(user: AuthenticatedUser, roomId: string, socket: Socket): Promise<RoomFull> {
    const room = this.getRoomOrThrow(roomId);
    this.assertHost(room, user.userId);

    return this.withRoomLock(roomId, async () => {
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

      this.maybeStartCountdown(room, socket);
      return this.toRoomFull(room);
    });
  }

  /**
   * Kicks a player (or spectator) out of the room. Only the host may kick, and
   * only while the room has not started. The target's own socket(s) get a
   * dedicated "player:kicked" event so they can show a notice.
   */
  async kickPlayer(
    user: AuthenticatedUser,
    roomId: string,
    targetUserId: string,
    socket: Socket,
  ): Promise<{ roomId: string; kickedUserId: string }> {
    const room = this.getRoomOrThrow(roomId);
    this.assertHost(room, user.userId);
    const target = room.players.get(targetUserId);
    if (!target) throw new AppError("NOT_IN_ROOM", "Player is not in this room");
    if (targetUserId === room.hostId) throw new AppError("INVALID_ACTION", "You cannot kick the host");
    if (room.status === "playing") {
      throw new AppError("INVALID_ACTION", "You cannot kick players during a match");
    }

    this.clearDisconnectTimer(room.id, targetUserId);
    for (const socketId of target.socketIds) {
      const targetSocket = this.io.sockets.sockets.get(socketId);
      targetSocket?.emit("player:kicked", {
        roomId: room.id,
        playerId: targetUserId,
        byUserId: user.userId,
        reason: "kicked",
      });
      targetSocket?.leave(room.ioName);
    }

    room.players.delete(targetUserId);
    if (room.rematch && !target.isSpectator) this.clearRematch(room);
    await prisma.roomPlayer.deleteMany({
      where: { roomId: room.id, userId: targetUserId },
    });

    if (room.players.size === 0) {
      this.closeRoom(room, "all players left");
      return { roomId: room.id, kickedUserId: targetUserId };
    }

    if (!target.isSpectator) {
      this.emitToRoom(room, "player:left", { roomId: room.id, playerId: targetUserId });
    }
    this.emitToRoom(room, "player:kicked", {
      roomId: room.id,
      playerId: targetUserId,
      byUserId: user.userId,
      reason: "kicked",
    });
    this.broadcastRoomUpdate(room);
    return { roomId: room.id, kickedUserId: targetUserId };
  }

  private participantIds(room: RoomRuntime): string[] {
    return [...room.players.values()]
      .filter((p) => !p.isSpectator)
      .map((p) => p.userId);
  }

  private rematchUpdateOf(room: RoomRuntime): RematchUpdate {
    return {
      roomId: room.id,
      requestedBy: room.rematch?.requestedBy ?? [],
      active: room.rematch !== null && room.rematch.requestedBy.length > 0,
    };
  }

  private emitRematchUpdate(room: RoomRuntime) {
    this.emitToRoom(room, "rematch:update", this.rematchUpdateOf(room));
  }

  private clearRematch(room: RoomRuntime) {
    room.rematch = null;
    this.emitRematchUpdate(room);
  }

  /** Backwards-compatible alias kept for the legacy "game:rematch" event. */
  async rematch(user: AuthenticatedUser, roomId: string, socket: Socket): Promise<RematchUpdate> {
    return this.requestRematch(user, roomId, socket);
  }

  /**
   * A participant asks to play again. Once every participant has asked, the
   * match restarts immediately and the room flips back to playing.
   */
  async requestRematch(user: AuthenticatedUser, roomId: string, socket: Socket): Promise<RematchUpdate> {
    const room = this.getRoomOrThrow(roomId);
    if (room.status !== "ended") {
      throw new AppError("INVALID_ACTION", "Room is not over yet");
    }
    const player = this.getPlayerOrThrow(room, user.userId);
    if (player.isSpectator) {
      throw new AppError("INVALID_ACTION", "Spectators cannot request a rematch");
    }

    room.rematch ??= { requestedBy: [] };
    if (!room.rematch.requestedBy.includes(user.userId)) {
      room.rematch.requestedBy.push(user.userId);
      await this.logSystemMessage(room, `${player.displayName} wants a rematch`);
    }

    const started = await this.tryStartRematch(room, socket);
    if (!started) this.emitRematchUpdate(room);
    return this.rematchUpdateOf(room);
  }

  /** Confirms a rematch offer. The match restarts once everyone has confirmed. */
  async acceptRematch(user: AuthenticatedUser, roomId: string, socket: Socket): Promise<RematchUpdate> {
    const room = this.getRoomOrThrow(roomId);
    if (room.status !== "ended") {
      throw new AppError("INVALID_ACTION", "Room is not over yet");
    }
    const player = this.getPlayerOrThrow(room, user.userId);
    if (player.isSpectator) {
      throw new AppError("INVALID_ACTION", "Spectators cannot accept a rematch");
    }
    if (!room.rematch || room.rematch.requestedBy.length === 0) {
      throw new AppError("INVALID_ACTION", "Nobody has requested a rematch");
    }
    if (!room.rematch.requestedBy.includes(user.userId)) {
      room.rematch.requestedBy.push(user.userId);
    }

    const started = await this.tryStartRematch(room, socket);
    if (!started) this.emitRematchUpdate(room);
    return this.rematchUpdateOf(room);
  }

  /** Cancels the rematch offer for everyone. */
  async declineRematch(user: AuthenticatedUser, roomId: string, socket: Socket): Promise<RematchUpdate> {
    const room = this.getRoomOrThrow(roomId);
    if (room.status !== "ended") {
      throw new AppError("INVALID_ACTION", "Room is not over yet");
    }
    const player = this.getPlayerOrThrow(room, user.userId);
    this.clearRematch(room);
    await this.logSystemMessage(room, `${player.displayName} declined the rematch`);
    return this.rematchUpdateOf(room);
  }

  private async tryStartRematch(room: RoomRuntime, socket: Socket): Promise<boolean> {
    if (room.status !== "ended" || !room.rematch) return false;
    const participants = this.participantIds(room);
    if (participants.length < room.minPlayers) return false;
    const allRequested = participants.every((id) => room.rematch!.requestedBy.includes(id));
    if (!allRequested) return false;

    // Everyone confirmed: reset back to the lobby and relaunch immediately.
    room.rematch = null;
    this.cleanupMatchRuntime(room);
    room.match = null;
    this.clearClockTimer(room.id);
    room.status = "waiting";
    for (const player of room.players.values()) {
      if (!player.isSpectator) player.isReady = false;
    }
    await prisma.room.update({
      where: { id: room.id },
      data: { status: "WAITING" },
    });
    await this.launchMatch(room, { userId: room.hostId }, socket);
    return true;
  }

  async launchRematch(room: RoomRuntime, starter: Pick<AuthenticatedUser, "userId">, socket: Socket): Promise<RoomFull> {
    room.status = "waiting";
    this.cleanupMatchRuntime(room);
    room.match = null;
    room.rematch = null;
    let seat = 0;
    for (const player of room.players.values()) {
      if (!player.isSpectator) {
        player.seat = seat++;
      }
    }
    return this.launchMatch(room, starter, socket);
  }

  /**
   * Persists a match row, debits entry stakes, spins up the authoritative
   * engine and flips the room to playing. Called by both host "start" and
   * matchmaking auto-start.
   */
  private async launchMatch(room: RoomRuntime, starter: Pick<AuthenticatedUser, "userId">, socket: Socket): Promise<RoomFull> {
    return this.withRoomLock(room.id, async () => {
      if (room.status === "playing" && room.match) {
        return this.toRoomFull(room);
      }

      const participants = [...room.players.values()]
        .filter((p) => !p.isSpectator)
        .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));

    // Assign missing seats deterministically.
    participants.forEach((p, index) => {
      if (p.seat === null) p.seat = index;
    });

    const matchId = room.pendingMatchId ?? randomUUID();
    room.pendingMatchId = null;

    const engine = createEngine(
      room.gameId,
      participants.map((p) => ({ userId: p.userId, seat: p.seat! })),
      secureRandomSource(),
      this.engineOptions(room),
    );

    const existingMatch = await prisma.match.findUnique({ where: { id: matchId } });
    if (!existingMatch) {
      console.log("[MATCHMAKING] MATCH_FOUND", {
        matchId,
        gameId: room.gameId,
        entryFee: room.stake,
        players: participants.map((p) => p.userId),
      });
      console.log("[MATCHMAKING] RESERVATION_STARTED", {
        matchId,
        entryFee: room.stake,
      });

      try {
        await createAndFundMatch({
          matchId,
          roomId: room.id,
          gameId: room.gameId,
          stake: room.stake,
          players: participants.map((p) => ({ userId: p.userId, seat: p.seat! })),
        });
        console.log("[MATCHMAKING] RESERVATION_SUCCESS", {
          matchId,
          entryFee: room.stake,
        });
        console.log("[MATCHMAKING] MATCH_READY", { matchId });
      } catch (error: any) {
        console.error("[createAndFundMatch error]", error);
        room.status = "waiting";
        this.broadcastRoomUpdate(room);
        const message = error?.message || "One or more players do not have enough coins for this stake";
        this.emitToRoom(room, "error", { code: "INSUFFICIENT_BALANCE", message });
        throw new AppError("INSUFFICIENT_BALANCE", message);
      }
    }

    const snapshot = await createMatchConfigSnapshot(room.gameId, room.stake);
    room.settings = { ...room.settings, configSnapshot: snapshot };

    const startedAt = Date.now();
    const matchDurationSeconds = Math.min(snapshot.matchDurationSeconds || 600, 600);
    const matchDeadline = startedAt + (matchDurationSeconds * 1000);

    room.match = {
      matchId,
      engine,
      turnNumber: 0,
      startedAt,
      matchStartedAt: startedAt,
      matchDeadline,
      matchStatus: "ACTIVE",
      endedAt: null,
      resultReason: null,
      timeExpired: false,
    };
    room.status = "playing";
    await prisma.room.update({
      where: { id: room.id },
      data: { status: "PLAYING", settings: room.settings as object },
    });
    await prisma.match.update({
      where: { id: matchId },
      data: {
        startedAt: new Date(startedAt),
        matchDeadline: new Date(matchDeadline),
        status: "ACTIVE",
      },
    }).catch((err) => {
      console.error(`[MATCH] Failed to set ACTIVE status on match ${matchId}:`, err);
    });

    console.log("[MATCHMAKING] MATCH_STARTED", {
      matchId,
      gameId: room.gameId,
      configVersion: snapshot.configVersion,
      startedAt,
      matchDeadline,
      matchDurationSeconds,
    });

    const matchStartedPayload = {
      matchId,
      gameId: room.gameId,
      entryFee: room.stake,
      configSnapshot: snapshot,
      players: participants.map((p) => ({
        playerId: p.userId,
        seat: p.seat!,
        displayName: p.displayName,
      })),
      startedAt,
      matchDeadline,
      matchDurationSeconds,
    };

    this.emitToRoom(room, "game:match-started", matchStartedPayload);
    GameEventBus.broadcastEvent(
      this.io,
      room,
      GameEventBus.createEnvelope("MATCH_STARTED", matchId, room.gameId, matchStartedPayload)
    );

    const initialSeat = engine.currentSeat ?? 0;
    const initialPlayer = participants.find((p) => p.seat === initialSeat) ?? participants[0];
    const turnStartedAtMs = Date.now();
    const turnExpiresAtMs = engine.currentClockDeadline ?? (turnStartedAtMs + (snapshot.turnTimerSeconds * 1000));

    // Initialize Authoritative State in GameStateSyncManager
    const authoritativeState = GameStateSyncManager.initializeMatch(
      matchId,
      room.gameId,
      engine.serialize(),
      turnExpiresAtMs,
      initialPlayer?.userId ?? null,
      participants.map((p) => ({ id: p.userId, username: p.username, seat: p.seat ?? 0 })),
    );
    this.io.to(room.ioName).emit("game:state:authoritative", authoritativeState as any);
    GameEventBus.setStateVersion(matchId, authoritativeState.stateVersion);

    GameEventBus.broadcastEvent(
      this.io,
      room,
      GameEventBus.createEnvelope("TURN_STARTED", matchId, room.gameId, {
        playerId: initialPlayer?.userId ?? "",
        turnNumber: 0,
        turnStartedAtMs,
        turnExpiresAtMs,
      }, authoritativeState.stateVersion)
    );

    const startedBy = room.players.get(starter.userId);
    if (startedBy && !startedBy.isSpectator) {
      startedBy.isReady = false;
    }

    void this.logSystemMessage(room, `${room.gameId} match started`);
    this.broadcastRoomUpdate(room);
    this.emitGameState(room, []);
    this.scheduleClockCheck(room);
    return this.toRoomFull(room);
    });
  }

  private engineOptions(room: RoomRuntime): { timeControl?: ChessTimeControlConfig } | undefined {
    const timeControl = room.settings.timeControl as ChessTimeControlConfig | undefined;
    if (timeControl && timeControl.baseSeconds > 0) return { timeControl };
    if (room.gameId === "chess") {
      return { timeControl: { baseSeconds: 300, incrementSeconds: 0, delaySeconds: 0 } };
    }
    return undefined;
  }

  // ------------------------------------------------------------------- games

  private emitGameState(room: RoomRuntime, events: { type: string }[]) {
    if (!room.match) return;
    const state = room.match.engine.serialize();
    const stateVersion = GameStateSyncManager.getMatchState(room.match.matchId)?.stateVersion ?? (GameEventBus.getStateVersion(room.match.matchId) || 1);
    const payload = {
      roomId: room.id,
      matchId: room.match.matchId,
      state,
      events,
      sequenceNumber: stateVersion,
      turnNumber: room.match.turnNumber ?? 0,
      timestamp: Date.now(),
      seat: null,
    };

    // Broadcast standard envelope aligned with authoritative stateVersion
    GameEventBus.broadcastEvent(
      this.io,
      room,
      GameEventBus.createEnvelope("GAME_STATE_UPDATED", room.match.matchId, room.gameId, {
        matchId: room.match.matchId,
        state,
        events,
      }, stateVersion)
    );

    // Broadcast state once to all connected players in the room
    this.io.to(room.ioName).emit("game:state", payload as any);
    console.log(`[RoomManager] game:state broadcast to room ${room.ioName} for match ${room.match.matchId} at version ${stateVersion}`);
  }

  // ---------------------------------------------------------------- clock flag

  /**
   * Schedules the authoritative flag timer for the current seat and/or the
   * whole-match deadline. Only clock-capable engines expose deadlines; for
   * every other game this is a no-op. The timer is re-armed after every
   * accepted action and cleared when the match ends.
   */
  private scheduleClockCheck(room: RoomRuntime) {
    this.clearClockTimer(room.id);
    if (!room.match) return;
    const engine = room.match.engine;

    const deadlines: { at: number; kind: "turn" | "match"; seat?: number }[] = [];
    const turn = engine.currentClockDeadline;
    if (turn != null) deadlines.push({ at: turn, kind: "turn", seat: engine.currentSeat });
    const matchDeadline = room.match.matchDeadline ?? engine.currentMatchDeadline;
    if (matchDeadline != null) {
      deadlines.push({ at: matchDeadline, kind: "match" });

      // Schedule warning thresholds: 5m (300s), 2m (120s), 1m (60s), 30s, 10s
      const warningThresholds = [300_000, 120_000, 60_000, 30_000, 10_000];
      const now = Date.now();
      const remainingMs = matchDeadline - now;
      const matchId = room.match.matchId;

      for (const threshold of warningThresholds) {
        if (remainingMs > threshold) {
          const warningDelay = remainingMs - threshold;
          const warningKey = `${matchId}:warn:${threshold}`;
          if (!this.scheduledWarnings.has(warningKey)) {
            this.scheduledWarnings.add(warningKey);
            const wTimer = setTimeout(() => {
              this.scheduledWarnings.delete(warningKey);
              if (room.status !== "playing" || !room.match || room.match.timeExpired) return;
              const curRemaining = Math.max(0, (room.match.matchDeadline ?? matchDeadline) - Date.now());
              const remainingSec = Math.round(curRemaining / 1000);
              console.log(`[MATCH TIMER WARNING] Room ${room.id} (${room.gameId}): ${remainingSec}s remaining`);
              this.emitToRoom(room, "match:timer-warning", {
                matchId,
                remainingSeconds: remainingSec,
                remainingMs: curRemaining,
              });
              GameEventBus.broadcastEvent(
                this.io,
                room,
                GameEventBus.createEnvelope("MATCH_TIMER_WARNING", matchId, room.gameId, {
                  matchId,
                  remainingSeconds: remainingSec,
                  remainingMs: curRemaining,
                }),
              );
            }, warningDelay);
            wTimer.unref?.();
            this.warningTimers.set(warningKey, wTimer);
          }
        }
      }
    }

    if (deadlines.length === 0) return;
    const next = deadlines.reduce((a, b) => (b.at < a.at ? b : a));
    const delay = Math.max(0, next.at - Date.now());

    const rawState = (engine as any).state;
    const matchId = room.match.matchId;
    const turnNumber = rawState?.turnNumber ?? 0;
    const currentSeat = rawState?.currentSeat ?? engine.currentSeat;
    const timerKey = `${matchId}:${turnNumber}:${currentSeat}:${next.kind}`;

    this.activeTurnTimerKeys.set(room.id, timerKey);
    console.log("[CARROM TIMER] TIMER_CREATED", {
      timerKey,
      turnNumber,
      seat: currentSeat,
      kind: next.kind,
      expiresAt: next.at,
    });

    const timer = setTimeout(() => {
      const activeKey = this.activeTurnTimerKeys.get(room.id);
      const currentRawState = (room.match?.engine as any)?.state;
      const currentTurn = currentRawState?.turnNumber ?? 0;
      const currentSeatNow = currentRawState?.currentSeat ?? room.match?.engine.currentSeat;

      console.log("[CARROM TIMER] TIMEOUT_CHECK", {
        timerKey,
        expectedTurn: turnNumber,
        expectedSeat: currentSeat,
        currentTurn,
        currentSeat: currentSeatNow,
        activeTimerKey: activeKey,
      });

      if (
        activeKey !== timerKey ||
        (next.kind === "turn" && (currentTurn !== turnNumber || currentSeatNow !== currentSeat)) ||
        currentRawState?.finished
      ) {
        console.log("[CARROM TIMER] STALE_TIMEOUT_IGNORED", {
          timerKey,
          activeKey,
          currentTurn,
          currentSeat: currentSeatNow,
        });
        return;
      }

      console.log("[CARROM TIMER] TIMEOUT_ACCEPTED", { timerKey });
      this.activeTurnTimerKeys.delete(room.id);
      void this.handleClockDeadline(room.id, next.kind, next.seat);
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
    const previousKey = this.activeTurnTimerKeys.get(roomId);
    if (previousKey) {
      console.log("[CARROM TIMER] TIMER_CANCELLED", { previousKey });
      this.activeTurnTimerKeys.delete(roomId);
    }
    const room = this.rooms.get(roomId);
    const matchId = room?.match?.matchId;
    if (matchId) {
      for (const [key, wTimer] of this.warningTimers.entries()) {
        if (key.startsWith(matchId)) {
          clearTimeout(wTimer);
          this.warningTimers.delete(key);
          this.scheduledWarnings.delete(key);
        }
      }
    }
  }

  private async handleClockDeadline(roomId: string, kind: "turn" | "match" = "turn", seat?: number) {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== "playing" || !room.match) return;
    if (this.finalizingMatches.has(room.match.matchId) || room.match.matchStatus === "FINALIZING" || room.match.matchStatus === "COMPLETED") {
      return;
    }
    const engine = room.match.engine;

    if (kind === "match") {
      room.match.timeExpired = true;
      room.match.matchStatus = "TIME_EXPIRED";
      console.log(`[MATCH TIME EXPIRED] Room ${room.id} (${room.gameId}), Match ${room.match.matchId}`);
      this.emitToRoom(room, "match:time-expired", {
        matchId: room.match.matchId,
        expiredAt: Date.now(),
      });
      GameEventBus.broadcastEvent(
        this.io,
        room,
        GameEventBus.createEnvelope("MATCH_TIME_EXPIRED", room.match.matchId, room.gameId, {
          matchId: room.match.matchId,
          expiredAt: Date.now(),
        }),
      );
      await this.finishMatch(room, [], "TIME_LIMIT");
      return;
    }

    let result;
    if (engine.handleTimeout) {
      result = engine.handleTimeout(kind, seat);
    } else if (kind === "turn" && seat != null) {
      const entry = [...room.players.values()].find((p) => p.seat === seat && !p.isSpectator);
      if (!entry) return;
      const session = new GameSession(room.match);
      result = await session.apply(entry.userId, seat, { type: "flag" });
    } else {
      return;
    }

    if (result.ok) {
      this.emitGameState(room, result.events);
      if (result.finished) {
        await this.finishMatch(room, result.winnerSeats, "TIMEOUT");
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
    console.log(`[RoomManager] applyGameAction: User ${user.userId}, Room ${roomId}, Action`, action);
    const room = this.getRoomOrThrow(roomId);
    if (room.status !== "playing" || !room.match) {
      console.log(`[RoomManager] applyGameAction rejected: Game not started, status: ${room.status}`);
      throw new AppError("GAME_NOT_STARTED", "The game has not started");
    }
    const player = this.getPlayerOrThrow(room, user.userId);
    if (player.isSpectator || player.seat === null) {
      console.log(`[RoomManager] applyGameAction rejected: User is spectator or has no seat`);
      throw new AppError("FORBIDDEN", "Spectators cannot play");
    }

    if (
      GameStateSyncManager.isMatchFinished(room.match.matchId) ||
      room.match.matchStatus === "FINALIZING" ||
      room.match.matchStatus === "COMPLETED"
    ) {
      console.log(`[RoomManager] applyGameAction rejected: Match is already finished`);
      throw new AppError("MATCH_FINISHED", "Match is already finished; late action rejected");
    }

    if (
      room.match.timeExpired ||
      room.match.matchStatus === "TIME_EXPIRED" ||
      (room.match.matchDeadline && Date.now() >= room.match.matchDeadline)
    ) {
      console.log(`[RoomManager] applyGameAction rejected: Match time limit expired`);
      void this.finishMatch(room, [], "TIME_LIMIT");
      throw new AppError("MATCH_TIME_EXPIRED", "Match time limit expired; action rejected");
    }

    // 1. Anti-Cheat: Reject or sanitize forged client score/winner/state payloads
    const forgedKeys = ["score", "winner", "winnerId", "winnerSeats", "coins", "reward", "pocketedCoins", "runs", "points", "kills"];
    let detectedForgery = false;
    for (const key of forgedKeys) {
      if (key in action) {
        detectedForgery = true;
        delete (action as any)[key];
      }
    }
    if (detectedForgery) {
      GameStateSyncManager.logSecurityEvent({
        userId: user.userId,
        matchId: room.match.matchId,
        roomId: room.id,
        gameId: room.gameId,
        eventType: "SCORE_TAMPERING_ATTEMPT",
        severity: "HIGH",
        details: { actionType: action.type },
        actionTaken: "REJECT_ACTION",
      });
    }

    // 2. Anti-Cheat: Validate numeric sanity (no NaN, Infinity, or impossible negative values)
    for (const [k, v] of Object.entries(action)) {
      if (typeof v === "number") {
        if (!isFinite(v) || isNaN(v)) {
          GameStateSyncManager.logSecurityEvent({
            userId: user.userId,
            matchId: room.match.matchId,
            roomId: room.id,
            gameId: room.gameId,
            eventType: "IMPOSSIBLE_ACTION",
            severity: "HIGH",
            details: { field: k, value: v, actionType: action.type },
            actionTaken: "REJECT_ACTION",
          });
          return {
            ok: false,
            error: `Invalid numeric value for ${k}`,
            events: [],
            state: (room.match.engine.serialize?.() ?? {}) as JsonObject,
            finished: false,
            winnerSeats: [],
          };
        }
      }
    }
    if ("power" in action && typeof (action as any).power === "number") {
      const power = (action as any).power;
      if (power < 0 || power > 100) {
        GameStateSyncManager.logSecurityEvent({
          userId: user.userId,
          matchId: room.match.matchId,
          roomId: room.id,
          gameId: room.gameId,
          eventType: "IMPOSSIBLE_ACTION",
          severity: "HIGH",
          details: { power, actionType: action.type },
          actionTaken: "REJECT_ACTION",
        });
        return {
          ok: false,
          error: "Power is out of allowed bounds",
          events: [],
          state: (room.match.engine.serialize?.() ?? {}) as JsonObject,
          finished: false,
          winnerSeats: [],
        };
      }
    }

    // 3. Action Idempotency: Return cached result for duplicated action IDs
    const actionId = (action as any).actionId ?? GameEventBus.generateEventId();
    const cachedResult = GameStateSyncManager.getCachedActionResult(room.match.matchId, actionId);
    if (cachedResult) {
      console.log(`[RoomManager] Duplicate actionId ${actionId} received - returning cached result`);
      return cachedResult;
    }

    // 4. Anti-Cheat: State version check (reject stale actions and prompt client resync)
    const clientStateVersion = (action as any).stateVersion ?? (action as any).clientStateVersion;
    const versionCheck = GameStateSyncManager.validateStateVersion(room.match.matchId, clientStateVersion);
    if (!versionCheck.valid) {
      GameStateSyncManager.logSecurityEvent({
        userId: user.userId,
        matchId: room.match.matchId,
        roomId: room.id,
        gameId: room.gameId,
        eventType: "STALE_ACTION_SPAM",
        severity: "LOW",
        details: { clientStateVersion, serverStateVersion: versionCheck.currentStateVersion },
        actionTaken: "REJECT_ACTION",
      });
      return {
        ok: false,
        error: "STALE_GAME_STATE",
        events: [],
        state: (GameStateSyncManager.getMatchState(room.match.matchId)?.gameState ?? room.match.engine.serialize?.() ?? {}) as JsonObject,
        finished: false,
        winnerSeats: [],
      };
    }

    // 5. Anti-Cheat: Turn order check for turn-based games
    const engine = room.match.engine as any;
    if (engine && typeof engine.currentSeat === "number" && action.type !== "resign" && action.type !== "chat") {
      if (player.seat !== engine.currentSeat) {
        GameStateSyncManager.logSecurityEvent({
          userId: user.userId,
          matchId: room.match.matchId,
          roomId: room.id,
          gameId: room.gameId,
          eventType: "WRONG_TURN",
          severity: "MEDIUM",
          details: { playerSeat: player.seat, currentSeat: engine.currentSeat, actionType: action.type },
          actionTaken: "REJECT_ACTION",
        });
        return {
          ok: false,
          error: "It is not your turn",
          events: [],
          state: (room.match.engine.serialize?.() ?? {}) as JsonObject,
          finished: false,
          winnerSeats: [],
        };
      }
    }

    const session = new GameSession(room.match);
    console.log(`[RoomManager] Applying action via GameSession for user ${user.userId}, seat ${player.seat}`);
    const result = await session.apply(user.userId, player.seat, action);

    // Cache result for idempotency
    if (result.ok) {
      GameStateSyncManager.setCachedActionResult(room.match.matchId, actionId, result);
    }
    if (!result.ok) {
      console.log(`[RoomManager] Action rejected:`, result.error);
      GameEventBus.broadcastEvent(
        this.io,
        room,
        GameEventBus.createEnvelope("GAME_ACTION_REJECTED", room.match.matchId, room.gameId, {
          actionId,
          actionType: action.type,
          playerId: user.userId,
          reason: result.error ?? "Action rejected",
        })
      );
      return {
        ok: false,
        error: result.error ?? "Action rejected",
        events: result.events,
        state: result.state,
        finished: result.finished,
        winnerSeats: result.winnerSeats,
      };
    }

    // Update and broadcast authoritative match state first so all sub-events share this action's stateVersion
    const currentSeat = room.match.engine.currentSeat;
    const activePlayer = [...room.players.values()].find((p) => p.seat === currentSeat && !p.isSpectator);
    const turnStartedAtMs = Date.now();
    const turnExpiresAtMs = room.match.engine.currentClockDeadline ?? (turnStartedAtMs + 30000);

    const authoritativeState = GameStateSyncManager.applyActionUpdate(
      room.match.matchId,
      actionId,
      result.state,
      {
        currentPlayerId: activePlayer?.userId ?? null,
        turnNumber: room.match.turnNumber,
        turnStartedAt: turnStartedAtMs,
        turnExpiresAt: turnExpiresAtMs,
        status: result.finished ? "finished" : "playing",
      },
    );
    const actionStateVersion = authoritativeState.stateVersion;
    GameEventBus.setStateVersion(room.match.matchId, actionStateVersion);

    this.io.to(room.ioName).emit("game:state:authoritative", authoritativeState as any);

    console.log(`[RoomManager] Action accepted, emitting game:state with ${result.events.length} events at version ${actionStateVersion}`);
    GameEventBus.broadcastEvent(
      this.io,
      room,
      GameEventBus.createEnvelope("GAME_ACTION_ACCEPTED", room.match.matchId, room.gameId, {
        actionId,
        actionType: action.type,
        playerId: user.userId,
      }, actionStateVersion)
    );

    // Broadcast individual game-specific events with Carrom pocket deduplication
    for (const ev of result.events) {
      if (ev.type === "coin-pocketed" || ev.type === "CARROM_COIN_POCKETED") {
        const shotId = (ev as any).shotId ?? (result.state as any)?.lastActionAtMs ?? Date.now();
        const coinId = (ev as any).coinId ?? (ev as any).coin?.id ?? "unknown";
        const isFirst = GameStateSyncManager.checkAndMarkCarromPocket(shotId, coinId, room.match.matchId);
        if (!isFirst) {
          console.log(`[CARROM] COIN_POCKETED_DEDUPLICATED (Ignored duplicate): ${shotId}:${coinId}`);
          continue;
        }
        console.log(`[CARROM] COIN_POCKETED: ${shotId}:${coinId}`);
      }

      GameEventBus.broadcastEvent(
        this.io,
        room,
        GameEventBus.createEnvelope(ev.type, room.match.matchId, room.gameId, ev, actionStateVersion)
      );
    }

    this.emitGameState(room, result.events);

    // If active turn player changed, emit TURN_CHANGED
    if (currentSeat !== undefined && !result.finished) {
      GameEventBus.broadcastEvent(
        this.io,
        room,
        GameEventBus.createEnvelope("TURN_CHANGED", room.match.matchId, room.gameId, {
          previousPlayerId: user.userId,
          nextPlayerId: activePlayer?.userId ?? "",
          reason: (result.events[0] as any)?.reason ?? "NORMAL_MOVE",
          turnNumber: room.match.turnNumber,
          turnStartedAtMs,
          turnExpiresAtMs,
        }, actionStateVersion)
      );
    }

    if (result.finished) {
      await this.finishMatch(room, result.winnerSeats, "NORMAL");
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

  private async finishMatch(
    room: RoomRuntime,
    winnerSeats: number[] = [],
    resultReason: "NORMAL" | "TIME_LIMIT" | "TIMEOUT" | "ABANDONED" | "FORFEIT" | "DISCONNECT" | "DRAW" = "NORMAL",
  ) {
    if (!room.match) return;
    this.clearClockTimer(room.id);
    await UniversalMatchFinalizer.finalizeMatch(this.io, room, {
      winnerSeats,
      triggerReason: resultReason,
    });
    this.broadcastRoomUpdate(room);
  }

  private async abortMatch(room: RoomRuntime, reason: string) {
    if (!room.match) return;
    this.clearClockTimer(room.id);
    const matchId = room.match.matchId;

    console.log("[MATCHMAKING] MATCH_CANCELLED", { matchId, reason });

    try {
      await cancelMatch(matchId, reason);
    } catch (error) {
      console.error(`Cancel failed for aborted match ${matchId}`, error);
    }

    this.cleanupMatchRuntime(room);
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

  /** Fire-and-forget typing indicator; the client stops it after a short idle. */
  async typingIndicator(user: AuthenticatedUser, roomId: string, socket: Socket): Promise<void> {
    const room = this.getRoomOrThrow(roomId);
    const player = this.getPlayerOrThrow(room, user.userId);
    this.emitToRoom(room, "chat:typing", {
      roomId,
      userId: user.userId,
      senderName: player.displayName,
      typing: true,
    });
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
      player.reconnectExpiresAt = null;

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

      const matchId = room.match?.matchId ?? room.pendingMatchId ?? room.id;
      console.log("[MATCH] PLAYER_RECONNECTED", { matchId, playerId: user.userId });

      this.emitToRoom(room, "game:player-reconnected", {
        matchId,
        roomId: room.id,
        playerId: user.userId,
        connectionStatus: "CONNECTED",
      });

      GameEventBus.broadcastEvent(
        this.io,
        room,
        GameEventBus.createEnvelope("PLAYER_RECONNECTED", matchId, room.gameId, {
          playerId: user.userId,
        })
      );

      this.emitToRoom(room, "player:connection", {
        roomId: room.id,
        playerId: user.userId,
        status: "connected",
      });
      this.broadcastRoomUpdate(room);
      reconnected = this.toRoomFull(room);

      // Re-emit the full live game state snapshot to the rejoining player's socket only.
      if (room.match) {
        const userSocket = this.io.sockets.sockets.get(socket.id);
        if (userSocket) {
          const payload = {
            roomId: room.id,
            matchId: room.match.matchId,
            state: room.match.engine.serialize(),
            matchDeadline: room.match.matchDeadline,
            matchStartedAt: room.match.matchStartedAt ?? room.match.startedAt,
            matchStatus: room.match.matchStatus ?? (room.match.timeExpired ? "TIME_EXPIRED" : "ACTIVE"),
            events: [{ type: "reconnected" }],
          };
          userSocket.emit("game:state", payload);
          console.log(`[RoomManager] Emitted full game state snapshot to reconnected user ${user.userId} in room ${room.id}`);
        } else {
          console.error(`[RoomManager] Failed to find socket for reconnected user ${user.userId}`);
        }
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
      const matchId = room.match?.matchId ?? room.pendingMatchId ?? room.id;
      const reconnectExpiresAt = Date.now() + DISCONNECT_GRACE_MS;
      player.reconnectExpiresAt = reconnectExpiresAt;

      console.log("[MATCH] PLAYER_DISCONNECTED", {
        matchId,
        playerId: user.userId,
        reconnectExpiresAt,
      });

      if (room.status === "playing") {
        player.connectionStatus = "reconnecting";
        await prisma.roomPlayer.update({
          where: { roomId_userId: { roomId: room.id, userId: user.userId } },
          data: { connectionStatus: "RECONNECTING" },
        });

        this.emitToRoom(room, "game:player-disconnected", {
          matchId,
          roomId: room.id,
          playerId: user.userId,
          reconnectExpiresAt,
        });

        GameEventBus.broadcastEvent(
          this.io,
          room,
          GameEventBus.createEnvelope("PLAYER_DISCONNECTED", matchId, room.gameId, {
            playerId: user.userId,
            reconnectExpiresAt,
          })
        );

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
      } else if (room.status === "waiting" || room.status === "starting") {
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
    const matchId = room.match?.matchId ?? room.pendingMatchId ?? room.id;

    console.log("[MATCH] RECONNECT_EXPIRED", { matchId, playerId: userId });

    const forfeitKey = `${matchId}:${userId}`;
    if (this.processedForfeits.has(forfeitKey)) {
      return;
    }
    this.processedForfeits.add(forfeitKey);

    player.connectionStatus = "forfeited";
    player.reconnectExpiresAt = null;

    await prisma.roomPlayer.update({
      where: { roomId_userId: { roomId, userId } },
      data: { connectionStatus: "DISCONNECTED" },
    });
    this.emitToRoom(room, "player:connection", {
      roomId,
      playerId: userId,
      status: "disconnected",
    });

    if (room.status === "playing" && room.match) {
      const remainingPlayers = [...room.players.values()].filter(
        (p) => p.userId !== userId && !p.isSpectator && p.seat !== null,
      );
      if (remainingPlayers.length > 0) {
        const winnerId = remainingPlayers[0].userId;
        console.log("[MATCH] PLAYER_FORFEITED", {
          matchId: room.match.matchId,
          playerId: userId,
          winnerId,
        });
        console.log("[MATCH] FORFEIT_SETTLEMENT_STARTED", {
          matchId: room.match.matchId,
        });

        this.emitToRoom(room, "game:forfeit", {
          matchId: room.match.matchId,
          roomId: room.id,
          forfeitedPlayerId: userId,
          winnerId,
        });

        GameEventBus.broadcastEvent(
          this.io,
          room,
          GameEventBus.createEnvelope("PLAYER_FORFEITED", room.match.matchId, room.gameId, {
            playerId: userId,
            winnerId,
            reason: "RECONNECT_EXPIRED",
          })
        );

        await this.finishMatch(room, remainingPlayers.map((p) => p.seat!));

        console.log("[MATCH] FORFEIT_SETTLEMENT_COMPLETED", {
          matchId: room.match.matchId,
        });
      } else {
        await this.abortMatch(room, "player_timeout");
      }
    } else {
      room.players.delete(userId);
      if (room.players.size === 0) {
        this.closeRoom(room, "all players left");
      } else {
        this.broadcastRoomUpdate(room);
      }
    }
  }

  syncState(roomId: string, matchId: string, lastStateVersion: number, clientKey = "default"): { stateVersion: number; fullState: JsonObject; actionSequence: number; stateHash?: string } {
    const room = this.rooms.get(roomId);
    if (!room || !room.match || room.match.matchId !== matchId) {
      throw new AppError("NOT_FOUND", "Match not found for state sync");
    }
    const syncRes = GameStateSyncManager.handleStateSyncRequest(clientKey, matchId, lastStateVersion);
    return {
      stateVersion: syncRes.stateVersion,
      actionSequence: syncRes.actionSequence,
      fullState: syncRes.fullState as any,
      stateHash: syncRes.stateHash,
    };
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

    // Verify none of the users are in an active match
    for (const user of users) {
      this.assertNotInActiveMatch(user.userId);
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
      rematch: null,
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

      const matchId = randomUUID();
      room.pendingMatchId = matchId;

      await prisma.match.create({
        data: {
          id: matchId,
          roomId: id,
          gameId,
          status: "CREATED",
          winnerIds: [],
          stake,
        },
      });
      await prisma.matchPlayer.createMany({
        data: users.map((user, index) => ({
          matchId,
          userId: user.userId,
          seat: index,
          result: "PENDING",
        })),
      });

      console.log("[MATCHMAKING] MATCH_FOUND", {
        matchId,
        gameId,
        entryFee: stake,
        players: users.map((u) => u.userId),
      });
      console.log("[MATCHMAKING] RESERVATION_STARTED", {
        matchId,
        entryFee: stake,
      });

      try {
        await holdWagers(matchId);
        console.log("[MATCHMAKING] RESERVATION_SUCCESS", {
          matchId,
          entryFee: stake,
        });
        console.log("[MATCHMAKING] MATCH_READY", { matchId });
      } catch (error: any) {
        console.error("[holdWagers error]", error);
        await prisma.match.delete({ where: { id: matchId } }).catch(() => undefined);
        const message = error?.message || "One or more players do not have enough coins for this stake";
        throw new AppError("INSUFFICIENT_BALANCE", message);
      }

      this.emitToRoom(room, "game:match-found", {
        matchId,
        roomId: id,
        gameId,
        entryFee: stake,
        players: users.map((u, i) => ({
          playerId: u.userId,
          seat: i,
          ready: true,
        })),
        status: "ready",
      });
      this.emitLobbyState(room);

      this.maybeStartCountdown(room, sockets[0]);
      return this.toRoomFull(room);
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

  /**
   * Creates a pre-filled room for a tournament match.
   * Tournament matches have 0 stake (entry fee already paid during registration).
   * Settings include tournament metadata for bracket advancement.
   */
  async createTournamentMatch(
    users: AuthenticatedUser[],
    sockets: Socket[],
    gameId: GameId,
    tournamentMetadata: {
      tournamentId: string;
      tournamentRoundId: string;
      tournamentMatchNumber: number;
    }
  ): Promise<RoomFull> {
    const def = getGameDefinition(gameId);
    if (users.length < def.minPlayers || users.length > def.maxPlayers) {
      throw new AppError("INVALID_ACTION", "Wrong number of tournament match players");
    }
    if (sockets.length !== users.length) {
      throw new AppError("INVALID_ACTION", "Tournament match players are not connected");
    }

    // Verify none of the tournament players are already in an active match
    for (const user of users) {
      this.assertNotInActiveMatch(user.userId);
    }

    // Leave any existing rooms
    await Promise.all(users.map((user, index) => this.ejectFromAllRooms(user, sockets[index])));

    const id = randomUUID();
    const code = this.uniqueCode();
    const now = Date.now();

    // Tournament matches have 0 stake - entry fee already handled
    const stake = 0;

    // Include tournament metadata in room settings
    const settings = {
      tournamentId: tournamentMetadata.tournamentId,
      tournamentRoundId: tournamentMetadata.tournamentRoundId,
      tournamentMatchNumber: tournamentMetadata.tournamentMatchNumber,
      tournamentEntryHandled: true,
    };

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
      settings,
      rematch: null,
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
          settings: settings as object,
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

      const matchId = randomUUID();
      room.pendingMatchId = matchId;

      await prisma.match.create({
        data: {
          id: matchId,
          roomId: id,
          gameId,
          status: "CREATED",
          winnerIds: [],
          stake,
        },
      });
      await prisma.matchPlayer.createMany({
        data: users.map((user, index) => ({
          matchId,
          userId: user.userId,
          seat: index,
          result: "PENDING",
        })),
      });

      console.log("[TOURNAMENT] MATCH_CREATED", {
        matchId,
        tournamentId: tournamentMetadata.tournamentId,
        roundId: tournamentMetadata.tournamentRoundId,
        matchNumber: tournamentMetadata.tournamentMatchNumber,
        players: users.map((u) => u.userId),
      });

      this.emitToRoom(room, "game:match-found", {
        matchId,
        roomId: id,
        gameId,
        entryFee: 0,
        players: users.map((u, i) => ({
          playerId: u.userId,
          seat: i,
          ready: true,
        })),
        status: "ready",
      });
      this.emitLobbyState(room);

      this.maybeStartCountdown(room, sockets[0]);
      return this.toRoomFull(room);
    } catch (error) {
      // Roll back
      for (const socket of sockets) socket.leave(room.ioName);
      this.rooms.delete(id);
      this.roomsByCode.delete(code);
      for (const player of room.players.values()) {
        this.clearDisconnectTimer(id, player.userId);
      }
      if (room.status === "waiting") {
        await prisma.roomPlayer.deleteMany({ where: { roomId: id } }).catch(() => undefined);
        await prisma.room.delete({ where: { id } }).catch(() => undefined);
      }
      throw error;
    }
  }

  /**
   * Universal Match Room: Joins an authenticated user to a match room.
   * Works identically for Tournament matches and Casual/Ranked matchmaking matches.
   * - Authorizes user as a registered participant in the match
   * - Prevents 3rd-party users (ROOM_FULL)
   * - Handles multi-tab duplicate joins cleanly without creating duplicate player slots
   * - Sets online presence and emits PLAYER_CONNECTED
   * - Returns RoomFull and authoritative UniversalMatchRoomState
   */
  async joinMatch(
    user: AuthenticatedUser,
    matchId: string,
    socket: Socket,
  ): Promise<{ room: RoomFull; matchRoomState: UniversalMatchRoomState }> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        players: {
          include: { user: { include: { profile: true } } },
          orderBy: { seat: "asc" },
        },
        room: {
          include: {
            players: {
              include: { user: { include: { profile: true } } },
              orderBy: { seat: "asc" },
            },
          },
        },
      },
    });

    if (!match) {
      throw new AppError("NOT_FOUND", "Match not found", 404);
    }

    if (match.status === "FINISHED" || match.status === "ABORTED") {
      throw new AppError("MATCH_FINISHED", "Match has already concluded", 400);
    }

    const assignedPlayer = match.players.find((p) => p.userId === user.userId);
    if (!assignedPlayer) {
      throw new AppError("ROOM_FULL", "You are not an authorized player for this match", 403);
    }

    // Locate existing room in memory or restore from DB
    const roomId = match.roomId || match.id;
    let room = this.rooms.get(roomId);

    if (!room) {
      const def = getGameDefinition(match.gameId as GameId);
      const code = match.room?.code || this.uniqueCode();
      const settings = (match.room?.settings as Record<string, unknown>) || {};

      room = {
        id: roomId,
        code,
        ioName: `room:${roomId}`,
        gameId: match.gameId as GameId,
        hostId: match.players[0]?.userId || user.userId,
        status: match.status === "ACTIVE" ? "playing" : "waiting",
        isPrivate: true,
        stake: match.stake,
        minPlayers: def.minPlayers,
        maxPlayers: def.maxPlayers,
        players: new Map(),
        match: null,
        createdAt: match.createdAt.getTime(),
        settings,
        rematch: null,
        pendingMatchId: match.id,
        stateVersion: 1,
      };

      // Populate players from DB match
      for (const p of match.players) {
        const authUser: AuthenticatedUser = {
          userId: p.userId,
          username: p.user.username,
          displayName: p.user.displayName,
          avatarUrl: p.user.avatarUrl,
          role: p.user.role,
        };
        const rPlayer = this.makePlayer(authUser, p.seat, p.seat === 0, false, false);
        rPlayer.connectionStatus = "disconnected";
        room.players.set(p.userId, rPlayer);
      }

      this.rooms.set(roomId, room);
      this.roomsByCode.set(code, room);
    }

    // Attach current player
    let player = room.players.get(user.userId);
    if (!player) {
      player = this.makePlayer(user, assignedPlayer.seat, assignedPlayer.seat === 0, false, false);
      room.players.set(user.userId, player);
    }

    player.socketIds.add(socket.id);
    player.connectionStatus = "connected";
    socket.join(room.ioName);
    this.clearDisconnectTimer(room.id, user.userId);

    // Broadcast presence update
    const matchRoomState = this.toUniversalMatchRoomState(room, match);

    this.emitToRoom(room, "PLAYER_CONNECTED", {
      roomId: room.id,
      matchId: match.id,
      playerId: user.userId,
      presence: "ONLINE",
    });

    GameEventBus.broadcastEvent(
      this.io,
      room,
      GameEventBus.createEnvelope("PLAYER_CONNECTED", match.id, room.gameId, {
        playerId: user.userId,
        presence: "ONLINE",
      })
    );

    this.emitToRoom(room, "MATCH_STATE_SYNC", matchRoomState);
    this.broadcastRoomUpdate(room);
    this.emitLobbyState(room);

    return {
      room: this.toRoomFull(room),
      matchRoomState,
    };
  }

  /**
   * Constructs the universal authoritative match room state.
   */
  public toUniversalMatchRoomState(room: RoomRuntime, matchRecord?: any): UniversalMatchRoomState {
    const matchId = room.match?.matchId ?? room.pendingMatchId ?? matchRecord?.id ?? room.id;
    const isTournament = Boolean((room.settings as any)?.tournamentId);
    const mode = isTournament ? "tournament" : (room.settings as any)?.rated === false ? "casual" : "ranked";

    let status: UniversalMatchState = "CREATED";
    if (room.status === "waiting") {
      const participants = [...room.players.values()].filter((p) => !p.isSpectator);
      if (participants.length < room.minPlayers) {
        status = "WAITING_FOR_PLAYERS";
      } else {
        status = "READY_CHECK";
      }
    } else if (room.status === "starting") {
      status = "COUNTDOWN";
    } else if (room.status === "playing") {
      status = "LIVE";
    } else if (room.status === "ended") {
      status = room.match?.resultReason === "TIME_LIMIT" ? "TIME_EXPIRED" : "COMPLETED";
    }

    const players: UniversalMatchPlayer[] = [...room.players.values()]
      .filter((p) => !p.isSpectator)
      .map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        seat: p.seat ?? 0,
        isReady: p.isReady,
        isHost: p.isHost,
        isOnline: p.connectionStatus === "connected" && p.socketIds.size > 0,
        connectionQuality:
          p.connectionStatus === "connected" && p.socketIds.size > 0
            ? "excellent"
            : p.connectionStatus === "reconnecting"
            ? "unstable"
            : "disconnected",
        rating: 1000,
      }));

    const prizePool = isTournament ? 0 : Math.round(room.stake * 2 * 0.9);

    return {
      matchId,
      roomId: room.id,
      gameId: room.gameId,
      mode,
      tournamentInfo: isTournament
        ? {
            tournamentId: (room.settings as any).tournamentId,
            roundId: (room.settings as any).tournamentRoundId,
            roundNumber: (room.settings as any).tournamentRoundNumber ?? 1,
            matchNumber: (room.settings as any).tournamentMatchNumber ?? 1,
          }
        : null,
      status,
      entryFee: room.stake,
      prizePool,
      players,
      countdown: room.countdownStarted ? 3 : null,
      startedAt: room.match?.startedAt ? new Date(room.match.startedAt).toISOString() : null,
      matchDeadline: room.match?.matchDeadline ? new Date(room.match.matchDeadline).toISOString() : null,
      stateVersion: room.stateVersion || 1,
      configurationSnapshot: room.settings,
    };
  }
}
