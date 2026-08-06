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
import pino from "pino";
import { env } from "./env";
import { authenticateToken, type AuthenticatedUser } from "./auth";
import { RoomManager } from "./rooms/RoomManager";
import { MatchmakingManager } from "./matchmaking/MatchmakingManager";

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
    res.writeHead(404);
    res.end();
  });

  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents>(httpServer, {
    cors: { origin: parseOrigins(env.CORS_ORIGIN), credentials: true },
    transports: ["websocket", "polling"],
    // Chat and game actions are small; cap incoming packets to limit abuse.
    maxHttpBufferSize: 32 * 1024,
  });

  if (env.REDIS_URL) {
    const pub = new Redis(env.REDIS_URL);
    const sub = pub.duplicate();
    io.adapter(createAdapter(pub, sub));
    logger.info("Redis adapter attached");
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
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  const roomManager = new RoomManager(io);
  const matchmaking = new MatchmakingManager(io, roomManager);

  io.on("connection", (socket) => {
    const user = (socket.data as { user: AuthenticatedUser }).user;

    void roomManager.onSocketConnect(user, socket).catch((error) => {
      logger.error({ error, userId: user.userId }, "Reconnect failed");
    });

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

    socket.on("room:create", (payload, ack) =>
      void guard(ack, async () => {
        matchmaking.removeUser(user.userId);
        const room = await roomManager.createRoom(
          user,
          {
            gameId: payload.gameId,
            isPrivate: payload.isPrivate,
            stake: payload.stake,
            maxPlayers: payload.maxPlayers ?? 4,
            settings: payload.settings,
          },
          socket,
        );
        ack?.({ ok: true, data: room });
      }),
    );

    socket.on("room:join", (payload, ack) =>
      void guard(ack, async () => {
        matchmaking.removeUser(user.userId);
        const room = await roomManager.joinRoom(
          user,
          { roomId: payload.roomId, code: payload.code, asSpectator: payload.asSpectator },
          socket,
        );
        ack?.({ ok: true, data: room });
      }),
    );

    socket.on("room:leave", (payload, ack) =>
      void guard(ack, async () => {
        await roomManager.leaveRoom(user, payload.roomId, socket);
        ack?.({ ok: true, data: { roomId: payload.roomId } });
      }),
    );

    socket.on("room:ready", (payload, ack) =>
      void guard(ack, async () => {
        const room = await roomManager.setReady(user, payload.roomId, payload.ready, socket);
        ack?.({ ok: true, data: room });
      }),
    );

    socket.on("room:start", (payload, ack) =>
      void guard(ack, async () => {
        const room = await roomManager.startGame(user, payload.roomId, socket);
        ack?.({ ok: true, data: room });
      }),
    );

    socket.on("game:action", (payload, ack) =>
      void guard(ack, async () => {
        console.log(`[SocketServer] game:action received from user ${user.userId} in room ${payload.roomId} with action:`, payload.action);
        const result = await roomManager.applyGameAction(user, payload.roomId, payload.action, socket);
        console.log(`[SocketServer] game:action processed for user ${user.userId}, result:`, result.ok, result.error);
        ack?.({ ok: true, data: result });
      }),

    socket.on("game:state:ack", (payload) => {
      console.log(`[SocketServer] game:state:ack received from user ${user.userId} for match ${payload.matchId}`);
    }),
    );

    socket.on("game:rematch", (payload, ack) =>
      void guard(ack, async () => {
        const room = await roomManager.rematch(user, payload.roomId, socket);
        ack?.({ ok: true, data: room });
      }),
    );

    socket.on("chat:message", (payload, ack) =>
      void guard(ack, async () => {
        const message = await roomManager.sendChat(user, payload.roomId, payload.text, socket);
        ack?.({ ok: true, data: message });
      }),
    );

    socket.on("chat:emoji", (payload, ack) =>
      void guard(ack, async () => {
        await roomManager.sendEmoji(user, payload.roomId, payload.emoji, socket);
        ack?.({ ok: true, data: { sent: true } });
      }),
    );

    socket.on("matchmaking:join", (payload, ack) =>
      void guard(ack, async () => {
        const parsed = matchmakingJoinSchema.safeParse(payload);
        if (!parsed.success) {
          throw new AppError("VALIDATION_ERROR", "Invalid matchmaking request");
        }
        const position = await matchmaking.join(
          user,
          parsed.data.gameId,
          parsed.data.stake,
          socket,
          parsed.data.settings,
        );
        ack?.({ ok: true, data: { position } });
        // Pair after the ack so queued/found always arrive in order.
        await matchmaking.pair(parsed.data.gameId, parsed.data.stake, parsed.data.settings);
      }),
    );

    socket.on("matchmaking:leave", (_payload, ack) =>
      void guard(ack, async () => {
        const left = matchmaking.removeUser(user.userId);
        ack?.({ ok: true, data: { left } });
      }),
    );

    socket.on("disconnect", () => {
      matchmaking.removeUser(user.userId);
      void roomManager.onSocketDisconnect(user, socket);
    });
  });

  httpServer.listen(env.PORT, () => {
    logger.info(`Socket server listening on port ${env.PORT}`);
  });

  const shutdown = async () => {
    logger.info("Shutting down socket server…");
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
