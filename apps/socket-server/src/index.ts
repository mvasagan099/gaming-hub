import { SharedMatchmaking } from "./distributed/matchmaking";
import { provisionTournamentRoom } from "./distributed/provision";
import { DistributedRoomCoordinator } from "./distributed/coordinator";
import { createCommandDispatcher, DISTRIBUTED_ROOM_EVENTS } from "./distributed/commands";
import { PostgresMatchStore } from "./distributed/store";
import { GameResultOutboxWorker } from "./distributed/outbox";
import type { MatchResult } from "@gaming-hub/multiplayer";
import { registerSnookerPreviewHandler } from "./snookerHandlers";
import { authenticatedEngineStateSync } from "./currentEngineStateSync";
import { createServer, type Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { Redis } from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";
import { AppError, getGameDefinition, isGameId } from "@gaming-hub/shared";
import type { RoomStatus } from "@gaming-hub/shared";
import type { ErrorCode } from "@gaming-hub/shared";
import { matchmakingJoinSchema } from "@gaming-hub/shared";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketErrorPayload,
} from "@gaming-hub/socket";
import { MultiplayerFramework } from "@gaming-hub/multiplayer";
import pino from "pino";
import { env } from "./env";
import { authenticateToken, type AuthenticatedUser } from "./auth";
import { assertFeatureEnabled } from "./settings";
import { requestSocketRematch, declineSocketRematch } from "./rematch";
import { applySocketGameAction } from "./gameActions";
import { registerRoomLifecycleHandlers } from "./roomHandlers";
import { registerCarromPreviewHandler } from "./carromHandlers";
import { GameEventBus } from "./events/GameEventBus";
import { createAndFundRoomMatch, settleMatch, cancelMatch, reportTournamentMatchResult } from "./apiClient";
import { checkInternalApiAuth } from "./internalApiCheck";
import { runStartupStep } from "./startupStep";

const logger = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
});

function parseOrigins(value: string): boolean | string[] {
  if (value === "*") return true;
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function toErrorPayload(error: unknown): SocketErrorPayload {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message };
  }
  const message = error instanceof Error ? error.message : "An unexpected error occurred";
  return { code: "INTERNAL_ERROR", message };
}

let io!: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents>;

async function main(): Promise<void> {
  if (!await checkInternalApiAuth(env.API_URL, env.INTERNAL_API_KEY, logger) && env.distributedMatches) {
    throw new Error("INTERNAL_API_AUTH_REQUIRED_FOR_DURABLE_MATCHES");
  }
  // Create Socket.IO server first so it's available for internal API handlers
  io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents>(undefined as any, {
    cors: { origin: parseOrigins(env.CORS_ORIGIN), credentials: true },
    transports: ["websocket", "polling"],
    maxHttpBufferSize: 32 * 1024,
  });

  const httpServer: HttpServer = createServer((req, res) => {
    if (req.url === "/health/live" || req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (req.url === "/health/ready") {
      // Check framework health
      const framework = MultiplayerFramework.getInstance({ io });
      const health = framework.isInitialized() && (!distributed || distributed.isReady()) ? { status: "ok" } : { status: "not_ready" };
      res.writeHead(health.status === "ok" ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify(health));
      return;
    }
    if (req.method === "POST" && req.url === "/internal/notify") {
      // Internal push channel used by the API to synchronize wallet events to
      // a user's live sockets. Guarded by the shared INTERNAL_API_KEY.
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk;
        if (body.length > 32 * 1024) req.destroy();
      });
      req.on("end", () => {
        try {
          if (req.headers["x-internal-key"] !== env.INTERNAL_API_KEY) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "UNAUTHORIZED" }));
            return;
          }
          const parsed = JSON.parse(body) as {
            userId?: unknown;
            event?: unknown;
            payload?: unknown;
          };
          const userId = typeof parsed.userId === "string" ? parsed.userId : "";
          const event = typeof parsed.event === "string" ? parsed.event : "";
          if (!userId || !event) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "VALIDATION_ERROR" }));
            return;
          }
          const emitted = io.to(`user:${userId}`).emit(event as any, parsed.payload);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, emitted: Boolean(emitted) }));
        } catch {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "INTERNAL_ERROR" }));
        }
      });
      return;
    }

    if (req.method === "POST" && req.url === "/internal/broadcast") {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk;
        if (body.length > 64 * 1024) req.destroy();
      });
      req.on("end", () => {
        try {
          if (req.headers["x-internal-key"] !== env.INTERNAL_API_KEY) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "UNAUTHORIZED" }));
            return;
          }
          const parsed = JSON.parse(body) as {
            room?: string;
            event?: string;
            payload?: unknown;
          };
          const event = typeof parsed.event === "string" ? parsed.event : "";
          const targetRoom = typeof parsed.room === "string" && parsed.room ? parsed.room : "admin:analytics";
          if (!event) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "VALIDATION_ERROR" }));
            return;
          }
          const emitted = io.to(targetRoom).emit(event as any, parsed.payload);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, emitted: Boolean(emitted) }));
        } catch {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "INTERNAL_ERROR" }));
        }
      });
      return;
    }

    if (req.method === "POST" && req.url === "/internal/tournament/create-match") {
      // Internal endpoint for creating tournament matches with metadata
      if (req.headers["x-internal-key"] !== env.INTERNAL_API_KEY) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "UNAUTHORIZED" }));
        return;
      }
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk;
        if (body.length > 32 * 1024) req.destroy();
      });
      req.on("end", async () => {
        try {
          const parsed = JSON.parse(body) as {
            matchId?: string;
            playerIds?: string[];
            gameId?: string;
            tournamentId?: string;
            tournamentRoundId?: string;
            tournamentMatchNumber?: number;
          };
          const playerIds = Array.isArray(parsed.playerIds) ? parsed.playerIds : [];
          const gameId = typeof parsed.gameId === "string" ? parsed.gameId : "";
          const tournamentId = typeof parsed.tournamentId === "string" ? parsed.tournamentId : "";
          const tournamentRoundId = typeof parsed.tournamentRoundId === "string" ? parsed.tournamentRoundId : "";
          const tournamentMatchNumber = typeof parsed.tournamentMatchNumber === "number" ? parsed.tournamentMatchNumber : 0;

          if (playerIds.length !== 2 || !gameId || !tournamentId || !tournamentRoundId) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "VALIDATION_ERROR: playerIds (2), gameId, tournamentId, tournamentRoundId required" }));
            return;
          }

          if (!isGameId(gameId)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "VALIDATION_ERROR: Invalid gameId" }));
            return;
          }

          if (distributed) {
            const result = await provisionTournamentRoom(framework, distributed, { matchId: String(parsed.matchId ?? ""),
              playerIds, gameId, tournamentId, tournamentRoundId, tournamentMatchNumber });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, ...result }));
            return;
          }

          // Get users and their sockets
          const users: AuthenticatedUser[] = [];
          const sockets: Socket[] = [];
          for (const playerId of playerIds) {
            // Find socket for user
            let foundSocket: Socket | null = null;
            for (const s of io.sockets.sockets.values()) {
              if ((s.data as { userId?: string }).userId === playerId) {
                foundSocket = s;
                break;
              }
            }
            if (!foundSocket) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: `Player ${playerId} not connected` }));
              return;
            }
            const token = (foundSocket.handshake.auth as { token?: string })?.token ?? "";
            const user = await authenticateToken(token);
            users.push(user);
            sockets.push(foundSocket);
          }

          // Create tournament match directly with prisma
          const { prisma } = await import("@gaming-hub/db");
          const { getGameDefinition } = await import("@gaming-hub/shared");
          const { randomUUID } = await import("node:crypto");
          const { createEngine, secureRandomSource } = await import("@gaming-hub/game-engine");
          const { holdWagers } = await import("./apiClient");

          const def = getGameDefinition(gameId);
          const maxPlayers = def.maxPlayers;

          // Leave any existing rooms
          for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const socket = sockets[i];
            // Eject from existing rooms
            const existingRoom = framework.roomManager.getPlayerRoom(user.userId);
            if (existingRoom) {
              await framework.roomManager.leaveRoom(existingRoom.id, user.userId, socket);
            }
          }

          const roomId = randomUUID();
          const code = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
          const now = Date.now();

          // Tournament matches have 0 stake - entry fee already handled
          const stake = 0;

          // Include tournament metadata in room settings
          const settings = {
            tournamentId,
            tournamentRoundId,
            tournamentMatchNumber,
            tournamentEntryHandled: true,
          };

          // Create room in database
          await prisma.room.create({
            data: {
              id: roomId,
              code,
              gameId,
              hostId: users[0].userId,
              status: "WAITING",
              isPrivate: true,
              stake,
              minPlayers: def.minPlayers,
              maxPlayers,
              settings: settings as any,
            },
          });
          await prisma.roomPlayer.createMany({
            data: users.map((user, index) => ({
              roomId,
              userId: user.userId,
              seat: index,
              isHost: index === 0,
              isReady: true,
              isSpectator: false,
              connectionStatus: "CONNECTED",
            })),
          });

          const matchId = randomUUID();

          // Create match in database
          await prisma.match.create({
            data: {
              id: matchId,
              roomId,
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

          // Create engine
          const enginePlayers = users.map((user, index) => ({
            userId: user.userId,
            seat: index,
          }));
          const engine = createEngine(gameId, enginePlayers, secureRandomSource(), {});

          // Create room config
          const roomConfig = {
            gameId,
            isPrivate: true,
            stake,
            maxPlayers,
            minPlayers: def.minPlayers,
            password: null,
            allowSpectators: true,
            maxSpectators: framework.config.maxSpectators,
            settings: {
              rated: true,
              turnTimerDurationMs: 0,
              matchTimerDurationMs: 0,
              reconnectGracePeriodMs: framework.config.reconnectGracePeriodMs,
              afkTimeoutMs: framework.config.afkTimeoutMs,
              allowRematch: false,
              ...settings,
            },
          };

          // Create room runtime
          const roomRuntime = {
            id: roomId,
            code,
            ioName: `room:${roomId}`,
            config: roomConfig,
            hostId: users[0].userId,
            status: "waiting" as RoomStatus,
            players: new Map(),
            spectators: new Map(),
            createdAt: now,
            expiresAt: now + framework.config.roomExpirationMs,
            locked: false,
            match: {
              matchId,
              engine,
              turnNumber: 0,
              startedAt: now,
              pausedAt: null,
              pausedBy: null,
              finishedAt: null,
              winnerIds: [],
              winnerSeats: [],
              stateSnapshots: [{ turnNumber: 0, timestamp: now, state: engine.serialize() }],
              actionHistory: [],
            },
            rematch: null,
            chatHistory: [],
            eventLog: [],
          };

          // Add players to room runtime
          users.forEach((user, index) => {
            const player = framework.playerManager.createPlayer({
              id: user.userId,
              userId: user.userId,
              username: user.username,
              displayName: user.displayName,
              avatarUrl: user.avatarUrl,
              seat: index,
              isReady: true,
              isHost: index === 0,
              isSpectator: false,
            }, sockets[index].id);
            roomRuntime.players.set(user.userId, player);
            sockets[index].join(roomRuntime.ioName);
          });

          // Store room
          framework.roomManager.registerRoom(roomRuntime);

          // Join sockets to room
          sockets.forEach((socket) => socket.join(roomRuntime.ioName));

          console.log("[TOURNAMENT] MATCH_CREATED", {
            matchId,
            tournamentId,
            roundId: tournamentRoundId,
            matchNumber: tournamentMatchNumber,
            players: users.map((u) => u.userId),
          });

          // Emit match found event
          framework.syncManager.broadcastToRoom(roomRuntime, "game:match-found", {
            matchId,
            roomId,
            gameId,
            entryFee: 0,
            players: users.map((u, i) => ({
              playerId: u.userId,
              seat: i,
              ready: true,
            })),
            status: "ready",
          });
          await framework.syncManager.broadcastRoomUpdate(roomRuntime);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, roomId, matchId }));
        } catch (error: any) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: error?.message || "INTERNAL_ERROR" }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  // Attach Socket.IO to HTTP server
  io.attach(httpServer);

  if (env.REDIS_URL) {
    const pub = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        return Math.min(times * 100, 3000);
      },
    });
    const sub = pub.duplicate();

    pub.on("error", (err) => {
      logger.warn({ err: err?.message || String(err) }, "Redis publisher error");
    });
    sub.on("error", (err) => {
      logger.warn({ err: err?.message || String(err) }, "Redis subscriber error");
    });

    io.adapter(createAdapter(pub, sub));
    logger.info("Redis adapter attached with fault-tolerant reconnects");
  }

  let distributed: DistributedRoomCoordinator | null = null;
  let sharedMatchmaking: SharedMatchmaking | null = null;
  let matchmakingRecovery: ReturnType<typeof setInterval> | null = null;
  let coordinationRedis: Redis | null = null;
  let resultWorker: GameResultOutboxWorker | null = null;
  const durableStore = new PostgresMatchStore();

  // Initialize Multiplayer Framework
  const framework = MultiplayerFramework.getInstance({
    io: io,
    ...(env.distributedMatches ? {
      countdownDurationMs: 3000,
      requireGameLoadAck: true,
      executeRoomTask: <T>(roomId: string, task: () => Promise<T>) => distributed!.local(roomId, task),
      publish: (room: import("@gaming-hub/multiplayer").RoomRuntime, event: string, payload: unknown, destination: string) => distributed!.publish(room, event, payload, destination),
      persistFinalResult: (room: import("@gaming-hub/multiplayer").RoomRuntime, result: MatchResult) => distributed!.finalResult(room, result),
      persistAbortedResult: (room: import("@gaming-hub/multiplayer").RoomRuntime, reason: string) => distributed!.abortedResult(room, reason),
      closeRoom: (room: import("@gaming-hub/multiplayer").RoomRuntime, reason: string) => distributed!.close(room, reason),
    } : {}),
    reconnectGracePeriodMs: 90_000,
    afkTimeoutMs: 60_000,
    roomExpirationMs: 30 * 60 * 1000,
    maxSpectators: 10,
    enableAntiCheat: true,
    enableReplay: true,
    debug: env.LOG_LEVEL === "debug",
    onMatchStarting: async (room, matchId) => {
      if (distributed) await distributed.prepareFunding(room, matchId);
      if (env.distributedMatches || room.config.stake > 0) {
        await createAndFundRoomMatch(room, matchId);
      }
    },
    onMatchFinished: async (room, matchResult) => {
      const scores: Record<string, number> = {};
      for (const p of matchResult.players) {
        if (p.score !== undefined && p.score !== null) {
          scores[p.playerId] = p.score;
        }
      }
      const isDraw = matchResult.draw || matchResult.winnerIds.length === 0;
      const resultType = isDraw ? "DRAW" : "WIN";

      try {
        const settlement = await settleMatch(matchResult.matchId, {
          winnerIds: matchResult.winnerIds,
          scores,
          resultType,
          rated: room.config.settings.rated !== false,
          reason: matchResult.endReason || "NORMAL",
        });

        io.to(room.ioName).emit("game:settlement-completed" as any, {
          matchId: matchResult.matchId,
          resultType,
          coinsWon: settlement?.result?.payouts?.find((p) => matchResult.winnerIds.includes(p.userId))?.amount ?? 0,
          isDraw,
          refundPerPlayer: isDraw ? room.config.stake : 0,
          payouts: settlement?.result?.payouts ?? [],
        });
      } catch (err) {
        logger.error({ err, matchId: matchResult.matchId }, "Failed to settle match via internal API");
      }
    },
    onMatchAborted: async (room, reason) => {
      if (room.match?.matchId) {
        try {
          await cancelMatch(room.match.matchId, reason);
        } catch (err) {
          logger.error({ err, matchId: room.match.matchId }, "Failed to cancel match via internal API");
        }
      }
    },
  });

  await framework.initialize();
  logger.info("Multiplayer Framework initialized");

  if (env.distributedMatches) {
    coordinationRedis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, commandTimeout: 2000, enableOfflineQueue: false });
    coordinationRedis.on("error", () => logger.error({ msg: "Coordination Redis unavailable" }));
    await runStartupStep("coordination_redis_connect", () => coordinationRedis!.connect(), logger);
    distributed = new DistributedRoomCoordinator(framework, coordinationRedis, durableStore);
    await runStartupStep("distributed_room_start", () => distributed!.start(createCommandDispatcher(framework, distributed!, assertFeatureEnabled)), logger);
    sharedMatchmaking = new SharedMatchmaking(framework, distributed);
    matchmakingRecovery = setInterval(() => { void sharedMatchmaking!.recover().catch(() => logger.error("MATCHMAKING_RECOVERY_UNAVAILABLE")); }, 2000);
    resultWorker = new GameResultOutboxWorker(async event => {
      const payload = event.result as { kind?: string; reason?: string; matchResult?: MatchResult; rated?: boolean; stake?: number; tournamentId?: string; tournamentRoundId?: string };
      if (payload.kind === "CANCEL") { await cancelMatch(event.matchId, payload.reason); return; }
      const result = payload.matchResult;
      if (!result || result.matchId !== event.matchId) throw new Error("INVALID_DURABLE_RESULT");
      const scores = Object.fromEntries(result.players.filter(p => p.score != null).map(p => [p.playerId, p.score!]));
      const settled = await settleMatch(event.matchId, { winnerIds: result.winnerIds, scores,
        resultType: result.draw ? "DRAW" : "WIN", rated: payload.rated, reason: result.endReason ?? "NORMAL" });
      if (payload.tournamentId && payload.tournamentRoundId && result.winnerIds.length === 1) {
        await reportTournamentMatchResult({ matchId: event.matchId, tournamentId: payload.tournamentId,
          roundId: payload.tournamentRoundId, winnerId: result.winnerIds[0]!, loserId: result.players.find(p => !result.winnerIds.includes(p.playerId))?.playerId });
      }
      io.to(`room:${event.roomId}`).emit("game:settlement-completed" as any, {
        matchId: event.matchId, resultType: result.draw ? "DRAW" : "WIN", payouts: settled.result.payouts,
        coinsWon: settled.result.payouts.find(p => result.winnerIds.includes(p.userId))?.amount ?? 0,
        isDraw: result.draw, refundPerPlayer: result.draw ? payload.stake ?? 0 : 0,
      });
    });
    resultWorker.start();
  }

  // ---- Authentication -------------------------------------------------------
  io.use(async (socket, next) => {
    const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
    if (!token) {
      return next(new Error("UNAUTHORIZED"));
    }
    try {
      const user = await authenticateToken(token);
      socket.data.userId = user.userId;
      socket.data.username = user.username;
      (socket.data as { user: AuthenticatedUser }).user = user;
      next();
    } catch (err: any) {
      const msg = err?.message || "UNAUTHORIZED";
      next(new Error(msg));
    }
  });

  io.on("connection", (socket) => {
    const user = (socket.data as { user: AuthenticatedUser }).user;
    socket.data.tokenHash = user.tokenHash;


    if (distributed) {
      socket.use((packet, next) => {
        const [event, payload, ack] = packet;
        const queueEvent = ["matchmaking:join", "game:join-queue", "matchmaking:leave", "game:leave-queue"].includes(event);
        if (!DISTRIBUTED_ROOM_EVENTS.has(event) && !queueEvent) { next(); return; }
        const command = { event, payload: payload ?? {}, playerId: user.userId, socketId: socket.id,
          user: { username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl },
          roomId: payload?.roomId, code: payload?.code };
        void (async () => {
          if (event.startsWith("game:rematch")) {
            const refreshed = await authenticateToken(socket.handshake.auth.token);
            if (refreshed.userId !== user.userId) throw new Error("UNAUTHORIZED");
          }
          if (queueEvent) return event.endsWith("join") || event.endsWith("join-queue")
            ? sharedMatchmaking!.join(command) : sharedMatchmaking!.leave(user.userId);
          return distributed!.route(command);
        })().then(data => {
          if (data && typeof data === "object" && "id" in data) socket.data.distributedRoomId = (data as { id: string }).id;
          if (typeof ack === "function") ack({ ok: true, data });
        }, error => { if (typeof ack === "function") ack({ ok: false, error: toErrorPayload(error) }); });
      });
      void durableStore.findPlayer(user.userId).then(room => room ? distributed!.route({ event: "room:join",
        roomId: room.id, playerId: user.userId, socketId: socket.id,
        user: { username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl }, payload: {} }) : undefined)
        .catch(() => logger.info({ userId: user.userId }, "Reconnect recovery waiting for owner lease"));
    }

    // Single-active-session: Evict any existing socket for this user that has an older/different tokenHash
    const userSockets = io.sockets.adapter.rooms.get(`user:${user.userId}`);
    if (userSockets) {
      for (const socketId of userSockets) {
        if (socketId !== socket.id) {
          const oldSocket = io.sockets.sockets.get(socketId);
          if (oldSocket && (oldSocket.data as any)?.tokenHash !== user.tokenHash) {
            oldSocket.emit("auth:session-revoked", { reason: "NEW_LOGIN" });
            oldSocket.disconnect(true);
          }
        }
      }
    }

    // Join a personal room so internal services can target a single user.
    socket.join(`user:${user.userId}`);

    // Handle reconnection - check if user is in an active room
    const activeRoom = framework.roomManager.getPlayerRoom(user.userId);
    if (activeRoom && !distributed) {
      void framework.playerManager.handleReconnect(user.userId, activeRoom.id, socket).catch(() => {
        // No active room to reconnect to
      });
    }


    // Admin Real-Time Analytics Subscription
    socket.on("admin:analytics:subscribe", (ack) => {
      if (user.role !== "ADMIN") {
        if (ack) {
          ack({
            ok: false,
            error: {
              code: "FORBIDDEN",
              message: "Admin authorization required for analytics subscription",
            },
          });
        }
        return;
      }
      socket.join("admin:analytics");
      if (ack) ack({ ok: true, data: { subscribed: true } });
    });

    socket.on("admin:analytics:unsubscribe", () => {
      socket.leave("admin:analytics");
    });

    // Tournament Subscription
    socket.on("tournament:subscribe", (payload, ack) => {
      if (payload?.tournamentId) {
        socket.join(`tournament:${payload.tournamentId}`);
      }
      if (ack) ack({ ok: true, data: { subscribed: true } });
    });

    socket.on("tournament:unsubscribe", (payload) => {
      if (payload?.tournamentId) {
        socket.leave(`tournament:${payload.tournamentId}`);
      }
    });

    const guard = async (
      ack: ((res: { ok: false; error: SocketErrorPayload }) => void) | undefined,
      fn: () => Promise<void>,
    ) => {
      try {
        await fn();
      } catch (error) {
        logger.error({ err: error }, "[SOCKET GUARD ERROR]");
        const payload = toErrorPayload(error);
        if (ack) ack({ ok: false, error: payload });
        else socket.emit("error", payload);
      }
    };

    // Room Management
    registerRoomLifecycleHandlers(socket, framework, user.userId, guard, assertFeatureEnabled, (roomId) => {
      logger.info(`[CARROM JOIN] User ${user.userId} joined room ${roomId}`);
      const roomSockets = io.sockets.adapter.rooms.get(`room:${roomId}`);
      logger.info(`[CARROM JOIN] Room room:${roomId} now has ${roomSockets?.size ?? 0} sockets`);
    });

    socket.on("room:leave", (payload, ack) =>
      void guard(ack, async () => {
        await framework.roomManager.leaveRoom(payload.roomId, user.userId, socket);
        ack?.({ ok: true, data: { roomId: payload.roomId } });
      }),
    );

    socket.on("room:kick", (payload, ack) =>
      void guard(ack, async () => {
        await framework.roomManager.kickPlayer(payload.roomId, payload.targetUserId, user.userId);
        ack?.({ ok: true, data: { roomId: payload.roomId, kickedUserId: payload.targetUserId } });
      }),
    );

    // Universal Match Room Handlers
    socket.on("match:join" as any, (payload: { matchId: string; roomId?: string }, ack: any) =>
      void guard(ack, async () => {
        const matchId = String(payload?.matchId || "").trim();
        const roomId = String(payload?.roomId || matchId).trim();
        if (!roomId && !matchId) throw new AppError("VALIDATION_ERROR", "matchId or roomId is required");
        
        let room = framework.roomManager.getRoom(roomId) || framework.roomManager.getPlayerRoom(user.userId);
        if (room) {
          const joinedRoom = await framework.roomManager.joinRoom({ roomId: room.id, playerId: user.userId, socket });
          ack?.({ ok: true, data: { room: framework.syncManager.serializeRoom(joinedRoom), status: joinedRoom.status } });
        } else {
          ack?.({ ok: true, data: { matchId, roomId, status: "waiting" } });
        }
      }),
    );

    socket.on("match:ready" as any, (payload: { roomId: string; ready?: boolean }, ack: any) =>
      void guard(ack, async () => {
        const ready = payload.ready !== false;
        await framework.roomManager.setPlayerReady(payload.roomId, user.userId, ready);
        const room = framework.roomManager.getRoom(payload.roomId);
        if (!room) throw new AppError("ROOM_NOT_FOUND", "Room not found");
        ack?.({ ok: true, data: framework.syncManager.serializeRoom(room) });
      }),
    );

    socket.on("match:ping" as any, (payload: { timestamp?: number }, ack: any) => {
      ack?.({ ok: true, data: { clientTimestamp: payload?.timestamp, serverTimestamp: Date.now() } });
    });

    // Game Actions
    socket.on("game:action", (payload, ack) =>
      void guard(ack, async () => {
        await assertFeatureEnabled("games.enabled", "Games");
        logger.info(`[CARROM ACTION] game:action received from user ${user.userId} (socket: ${socket.id}) in room ${payload.roomId}`);
        logger.info(`[CARROM ACTION] Action type: ${payload.action?.type}`);
        
        const roomSockets = io.sockets.adapter.rooms.get(`room:${payload.roomId}`);
        logger.info(`[CARROM ACTION] Room room:${payload.roomId} has ${roomSockets?.size ?? 0} sockets before action`);
        
        const result = await applySocketGameAction(framework, user.userId, payload);

        logger.info(`[CARROM ACTION] game:action processed for user ${user.userId}, result: ${result.ok}`);
        
        ack?.({ 
          ok: true, 
          data: {
            ok: result.ok,
            error: result.error,
            events: result.events,
            state: result.state,
            finished: result.finished,
            winnerSeats: result.winnerSeats,
          } 
        });
      }),
    );

    socket.on("game:state:ack", (payload) => {
      framework.syncManager.handleStateAck(user.userId, payload.roomId, payload.timestamp);
    });

    socket.on("game:event:ack", (payload) => {
      // Client event acknowledgement
      console.log(`[GAME_EVENT_ACK] match: ${payload.matchId}, event: ${payload.eventId}, version: ${payload.stateVersion}`);
    });

    socket.on("game:sync", (payload, ack) =>
      void guard(ack, async () => {
        const snapshot = authenticatedEngineStateSync(framework, user.userId, payload?.matchId);
        ack?.({ ok: true, data: { stateVersion: snapshot.stateVersion, fullState: snapshot.fullState.gameState } });
      }),
    );

    socket.on("game:state-sync", (payload, ack) =>
      void guard(ack, async () => {
        ack?.({ ok: true, data: authenticatedEngineStateSync(framework, user.userId, payload?.matchId) });
      }),
    );

    registerCarromPreviewHandler(socket, io, framework, user.userId);

    registerSnookerPreviewHandler(socket, io, framework, user.userId);

    // Rematch
    const handleRematchConsent = async (roomId: string) => {
      const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
      return requestSocketRematch(framework, roomId, user.userId, token);
    };

    // Older clients use the same authoritative consent/funding flow.
    socket.on("game:rematch", (payload, ack) =>
      void guard(ack, async () => {
        const data = await handleRematchConsent(payload.roomId);
        ack?.({ ok: true, data });
      }),
    );

    socket.on("game:rematch-request", (payload, ack) =>
      void guard(ack, async () => {
        const data = await handleRematchConsent(payload.roomId);
        ack?.({ ok: true, data });
      }),
    );

    socket.on("game:rematch-accept", (payload, ack) =>
      void guard(ack, async () => {
        const data = await handleRematchConsent(payload.roomId);
        ack?.({ ok: true, data });
      }),
    );

    socket.on("game:rematch-decline", (payload, ack) =>
      void guard(ack, async () => {
        const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
        const data = await declineSocketRematch(framework, payload.roomId, user.userId, token);
        ack?.({ ok: true, data });
      }),
    );

    // Chat
    socket.on("chat:message", (payload, ack) =>
      void guard(ack, async () => {
        const room = framework.roomManager.getRoom(payload.roomId);
        if (!room) throw new Error("Room not found");
        
        const player = room.players.get(user.userId) || room.spectators.get(user.userId);
        if (!player) throw new Error("Not in room");
        
        const message = {
          id: `${Date.now()}_${user.userId}`,
          roomId: payload.roomId,
          userId: user.userId,
          senderName: player.displayName,
          body: payload.text.slice(0, 500),
          isSystem: false,
          createdAt: new Date().toISOString(),
        };
        
        room.chatHistory.push(message);
        
        // Keep only last 100 messages
        if (room.chatHistory.length > 100) {
          room.chatHistory.shift();
        }
        
        framework.syncManager.broadcastToRoom(room, "chat:message", message);
        
        ack?.({ ok: true, data: message });
      }),
    );

    socket.on("chat:emoji", (payload, ack) =>
      void guard(ack, async () => {
        const room = framework.roomManager.getRoom(payload.roomId);
        if (!room) throw new Error("Room not found");
        
        const player = room.players.get(user.userId) || room.spectators.get(user.userId);
        if (!player) throw new Error("Not in room");
        
        framework.syncManager.broadcastToRoom(room, "chat:emoji", {
          roomId: payload.roomId,
          userId: user.userId,
          senderName: player.displayName,
          emoji: payload.emoji,
          createdAt: new Date().toISOString(),
        });
        
        ack?.({ ok: true, data: { sent: true } });
      }),
    );

    socket.on("chat:typing", (payload, ack) =>
      void guard(ack, async () => {
        const room = framework.roomManager.getRoom(payload.roomId);
        if (!room) throw new Error("Room not found");
        
        const player = room.players.get(user.userId) || room.spectators.get(user.userId);
        if (!player) throw new Error("Not in room");
        
        framework.syncManager.broadcastToRoom(room, "chat:typing", {
          roomId: payload.roomId,
          userId: user.userId,
          senderName: player.displayName,
          typing: true,
        });
        
        ack?.({ ok: true, data: { sent: true } });
      }),
    );

    // Matchmaking
    socket.on("matchmaking:join", (payload, ack) =>
      void guard(ack, async () => {
        const parsed = matchmakingJoinSchema.safeParse(payload);
        if (!parsed.success) {
          throw new AppError("VALIDATION_ERROR", "Invalid matchmaking request");
        }

        await assertFeatureEnabled("games.matchmaking", "Matchmaking");
        if (parsed.data.stake > 0) {
          await assertFeatureEnabled("games.realMoney", "Real-money play");
        } else {
          await assertFeatureEnabled("games.practice", "Practice mode");
        }

        const mode = parsed.data.gameMode || (parsed.data.gameId.includes("ranked") ? "ranked" : "casual");
        const result = await framework.matchmakingManager.joinQueue({
          playerId: user.userId,
          gameId: parsed.data.gameId,
          stake: parsed.data.stake,
          socket,
          settings: parsed.data.settings,
          mode,
        });
        
        if (!result.success) {
          throw new AppError("MATCHMAKING_ERROR", result.error || "Failed to join matchmaking");
        }
        
        // Pairing can complete inside joinQueue before this handler resumes.
        // Never put a matched player back into the searching UI.
        if (framework.matchmakingManager.isInQueue(user.userId)) {
          (socket as any).emit("game:queue-joined", {
            position: framework.matchmakingManager.getQueuePosition(user.userId) ?? 1,
            gameId: parsed.data.gameId,
            entryFee: parsed.data.stake,
            mode,
          });
        }

        ack?.({ ok: true, data: { position: result.position ?? 0 } });
      }),
    );

    socket.on("game:join-queue" as any, (payload: unknown, ack: any) =>
      void guard(ack, async () => {
        const parsed = matchmakingJoinSchema.safeParse(payload);
        if (!parsed.success) {
          throw new AppError("VALIDATION_ERROR", "Invalid matchmaking request");
        }

        await assertFeatureEnabled("games.matchmaking", "Matchmaking");
        const mode = parsed.data.gameMode || "casual";
        const result = await framework.matchmakingManager.joinQueue({
          playerId: user.userId,
          gameId: parsed.data.gameId,
          stake: parsed.data.stake,
          socket,
          settings: parsed.data.settings,
          mode,
        });

        if (!result.success) {
          throw new AppError("MATCHMAKING_ERROR", result.error || "Failed to join matchmaking");
        }

        // Pairing can complete inside joinQueue before this handler resumes.
        // Never put a matched player back into the searching UI.
        if (framework.matchmakingManager.isInQueue(user.userId)) {
          (socket as any).emit("game:queue-joined", {
            position: framework.matchmakingManager.getQueuePosition(user.userId) ?? 1,
            gameId: parsed.data.gameId,
            entryFee: parsed.data.stake,
            mode,
          });
        }

        ack?.({ ok: true, data: { position: result.position ?? 0 } });
      }),
    );

    socket.on("matchmaking:leave", (_payload, ack) =>
      void guard(ack, async () => {
        const left = framework.matchmakingManager.removeFromQueue(user.userId);
        (socket as any).emit("game:queue-cancelled", { playerId: user.userId });
        ack?.({ ok: true, data: { left } });
      }),
    );

    socket.on("game:cancel-queue" as any, (_payload: unknown, ack: any) =>
      void guard(ack, async () => {
        const left = framework.matchmakingManager.removeFromQueue(user.userId);
        (socket as any).emit("game:queue-cancelled", { playerId: user.userId });
        ack?.({ ok: true, data: { left } });
      }),
    );

    // Disconnect
    socket.on("disconnect", () => {
      // Remove from matchmaking
      framework.matchmakingManager.removeFromQueue(user.userId);
      
      if (distributed) {
        void durableStore.findPlayer(user.userId).then(room => room ? distributed!.route({ event: "disconnect", roomId: room.id,
          playerId: user.userId, socketId: socket.id, user: {}, payload: {} }) : undefined)
          .catch(() => logger.warn({ userId: user.userId }, "Disconnect awaiting owner recovery"));
        return;
      }
      // Handle disconnect from room
      const room = framework.roomManager.getPlayerRoom(user.userId);
      if (room) {
        void framework.playerManager.handleDisconnect(user.userId, room.id, socket);
      }
    });

    // Ping/pong for latency
    socket.on("ping", (_data, callback) => {
      if (callback) callback();
    });
  });

  httpServer.listen(env.PORT, "0.0.0.0", () => {
    logger.info(`Socket server listening on port ${env.PORT}`);
  });

  const shutdown = async () => {
    logger.info("Shutting down socket server…");
    resultWorker?.stop();
    if (matchmakingRecovery) clearInterval(matchmakingRecovery);
    await framework.shutdown();
    await distributed?.stop();
    await coordinationRedis?.quit();
    io.close();
    httpServer.close();
    await new Promise((resolve) => setTimeout(resolve, 300));
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  logger.error({ err: error }, "Fatal error starting socket server");
  process.exit(1);
});
