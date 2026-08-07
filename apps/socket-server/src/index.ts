import { createServer, type Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { Redis } from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";
import { AppError } from "@gaming-hub/shared";
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

const logger = pino({ level: env.LOG_LEVEL, transport: { target: "pino-pretty" } });

function parseOrigins(value: string): boolean | string[] {
  if (value === "*") return true;
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function toErrorPayload(error: unknown): SocketErrorPayload {
  if (error instanceof AppError) {
    return { code: error.code, message: error.message };
  }
  return { code: "INTERNAL_ERROR", message: "An unexpected error occurred" };
}

async function main(): Promise<void> {
  const httpServer: HttpServer = createServer((req, res) => {
    if (req.url === "/health/live" || req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (req.url === "/health/ready") {
      // Check framework health
      const framework = MultiplayerFramework.getInstance({ io: null as unknown as Server });
      const health = framework.isInitialized() ? { status: "ok" } : { status: "not_ready" };
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
          const emitted = io.to(`user:${userId}`).emit(event, parsed.payload);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, emitted: emitted > 0 }));
        } catch {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "INTERNAL_ERROR" }));
        }
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents>(httpServer, {
    cors: { origin: parseOrigins(env.CORS_ORIGIN), credentials: true },
    transports: ["websocket", "polling"],
    maxHttpBufferSize: 32 * 1024,
  });

  if (env.REDIS_URL) {
    const pub = new Redis(env.REDIS_URL);
    const sub = pub.duplicate();
    io.adapter(createAdapter(pub, sub));
    logger.info("Redis adapter attached");
  }

  // Initialize Multiplayer Framework
  const framework = MultiplayerFramework.getInstance({
    io,
    reconnectGracePeriodMs: 90_000,
    afkTimeoutMs: 60_000,
    roomExpirationMs: 30 * 60 * 1000,
    maxSpectators: 10,
    enableAntiCheat: true,
    enableReplay: true,
    debug: env.LOG_LEVEL === "debug",
  });

  await framework.initialize();
  logger.info("Multiplayer Framework initialized");

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
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  io.on("connection", (socket) => {
    const user = (socket.data as { user: AuthenticatedUser }).user;

    // Join a personal room so internal services can target a single user.
    socket.join(`user:${user.userId}`);

    // Handle reconnection - check if user is in an active room
    const activeRoom = framework.roomManager.getPlayerRoom(user.userId);
    if (activeRoom) {
      void framework.playerManager.handleReconnect(user.userId, activeRoom.id, socket).catch(() => {
        // No active room to reconnect to
      });
    }

    const guard = async (
      ack: ((res: { ok: false; error: SocketErrorPayload }) => void) | undefined,
      fn: () => Promise<void>,
    ) => {
      try {
        await fn();
      } catch (error) {
        const payload = toErrorPayload(error);
        if (ack) ack({ ok: false, error: payload });
        else socket.emit("error", payload);
      }
    };

    // Room Management
    socket.on("room:create", (payload, ack) =>
      void guard(ack, async () => {
        // Remove from matchmaking if in queue
        framework.matchmakingManager.removeFromQueue(user.userId);
        
        const room = await framework.roomManager.createRoom({
          gameId: payload.gameId,
          hostId: user.userId,
          hostSocket: socket,
          isPrivate: payload.isPrivate,
          stake: payload.stake,
          maxPlayers: payload.maxPlayers ?? 4,
          settings: payload.settings,
        });
        
        ack?.({ ok: true, data: room as unknown as import("@gaming-hub/shared").RoomFull });
      }),
    );

    socket.on("room:join", (payload, ack) =>
      void guard(ack, async () => {
        // Remove from matchmaking if in queue
        framework.matchmakingManager.removeFromQueue(user.userId);
        
        const room = await framework.roomManager.joinRoom({
          roomId: payload.roomId,
          code: payload.code,
          playerId: user.userId,
          socket,
          asSpectator: payload.asSpectator,
        });
        
        ack?.({ ok: true, data: room as unknown as import("@gaming-hub/shared").RoomFull });
      }),
    );

    socket.on("room:leave", (payload, ack) =>
      void guard(ack, async () => {
        await framework.roomManager.leaveRoom(payload.roomId, user.userId, socket);
        ack?.({ ok: true, data: { roomId: payload.roomId } });
      }),
    );

    socket.on("room:ready", (payload, ack) =>
      void guard(ack, async () => {
        await framework.roomManager.setPlayerReady(payload.roomId, user.userId, payload.ready);
        const room = framework.roomManager.getRoom(payload.roomId);
        ack?.({ ok: true, data: room as unknown as import("@gaming-hub/shared").RoomFull });
      }),
    );

    socket.on("room:start", (payload, ack) =>
      void guard(ack, async () => {
        await framework.matchManager.startMatch({
          roomId: payload.roomId,
          startedBy: user.userId,
        });
        const room = framework.roomManager.getRoom(payload.roomId);
        ack?.({ ok: true, data: room as unknown as import("@gaming-hub/shared").RoomFull });
      }),
    );

    socket.on("room:kick", (payload, ack) =>
      void guard(ack, async () => {
        await framework.roomManager.kickPlayer(payload.roomId, payload.targetUserId, user.userId);
        ack?.({ ok: true, data: { roomId: payload.roomId, kickedUserId: payload.targetUserId } });
      }),
    );

    // Game Actions
    socket.on("game:action", (payload, ack) =>
      void guard(ack, async () => {
        logger.info(`[SocketServer] game:action received from user ${user.userId} in room ${payload.roomId}`);
        
        const result = await framework.matchManager.applyAction({
          roomId: payload.roomId,
          playerId: user.userId,
          action: payload.action,
        });
        
        logger.info(`[SocketServer] game:action processed for user ${user.userId}, result: ${result.ok}`);
        
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

    // Rematch
    socket.on("game:rematch", (payload, ack) =>
      void guard(ack, async () => {
        // Deprecated - use rematch-request instead
        const room = framework.roomManager.getRoom(payload.roomId);
        if (!room) throw new Error("Room not found");
        
        // Clear rematch state
        room.rematch = null;
        
        framework.syncManager.broadcastToRoom(room, "rematch:update", {
          roomId: payload.roomId,
          requestedBy: [],
          active: false,
        });
        
        ack?.({ ok: true, data: { roomId: payload.roomId, requestedBy: [], active: false } });
      }),
    );

    socket.on("game:rematch-request", (payload, ack) =>
      void guard(ack, async () => {
        const room = framework.roomManager.getRoom(payload.roomId);
        if (!room) throw new Error("Room not found");
        
        if (!room.rematch) {
          room.rematch = {
            requestedBy: [],
            active: true,
            expiresAt: Date.now() + 60000,
          };
        }
        
        if (!room.rematch.requestedBy.includes(user.userId)) {
          room.rematch.requestedBy.push(user.userId);
        }
        
        framework.syncManager.broadcastToRoom(room, "rematch:update", {
          roomId: payload.roomId,
          requestedBy: room.rematch.requestedBy,
          active: room.rematch.active,
        });
        
        ack?.({ ok: true, data: { roomId: payload.roomId, requestedBy: room.rematch.requestedBy, active: room.rematch.active } });
      }),
    );

    socket.on("game:rematch-accept", (payload, ack) =>
      void guard(ack, async () => {
        const room = framework.roomManager.getRoom(payload.roomId);
        if (!room) throw new Error("Room not found");
        if (!room.rematch) throw new Error("No rematch requested");
        
        if (!room.rematch.requestedBy.includes(user.userId)) {
          room.rematch.requestedBy.push(user.userId);
        }
        
        // Snapshot rematch state before it may be cleared below
        const requestedBy = [...room.rematch.requestedBy];
        const active = room.rematch.active;
        
        // Check if everyone accepted
        const participants = [...room.players.values()].filter(p => !p.isSpectator).map(p => p.id);
        const allAccepted = participants.every(id => room.rematch?.requestedBy.includes(id));
        
        if (allAccepted) {
          // Reset room for rematch
          room.status = "waiting";
          room.match = null;
          room.rematch = null;
          
          for (const player of room.players.values()) {
            player.isReady = false;
            player.seat = null;
          }
          
          // Reassign seats
          let seat = 0;
          for (const player of room.players.values()) {
            if (!player.isSpectator) {
              player.seat = seat++;
            }
          }
        }
        
        framework.syncManager.broadcastToRoom(room, "rematch:update", {
          roomId: payload.roomId,
          requestedBy,
          active,
        });
        
        ack?.({ ok: true, data: { roomId: payload.roomId, requestedBy, active } });
      }),
    );

    socket.on("game:rematch-decline", (payload, ack) =>
      void guard(ack, async () => {
        const room = framework.roomManager.getRoom(payload.roomId);
        if (!room) throw new Error("Room not found");
        
        room.rematch = null;
        
        framework.syncManager.broadcastToRoom(room, "rematch:update", {
          roomId: payload.roomId,
          requestedBy: [],
          active: false,
        });
        
        ack?.({ ok: true, data: { roomId: payload.roomId, requestedBy: [], active: false } });
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
        
        const result = await framework.matchmakingManager.joinQueue({
          playerId: user.userId,
          gameId: parsed.data.gameId,
          stake: parsed.data.stake,
          socket,
          settings: parsed.data.settings,
          mode: parsed.data.gameId.includes("ranked") ? "ranked" : "casual",
        });
        
        if (!result.success) {
          throw new AppError("MATCHMAKING_ERROR", result.error || "Failed to join matchmaking");
        }
        
        ack?.({ ok: true, data: { position: result.position ?? 0 } });
      }),
    );

    socket.on("matchmaking:leave", (_payload, ack) =>
      void guard(ack, async () => {
        const left = framework.matchmakingManager.removeFromQueue(user.userId);
        ack?.({ ok: true, data: { left } });
      }),
    );

    // Disconnect
    socket.on("disconnect", () => {
      // Remove from matchmaking
      framework.matchmakingManager.removeFromQueue(user.userId);
      
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
    await framework.shutdown();
    io.close();
    httpServer.close();
    await new Promise((resolve) => setTimeout(resolve, 300));
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  logger.error({ error }, "Fatal error starting socket server");
  process.exit(1);
});
