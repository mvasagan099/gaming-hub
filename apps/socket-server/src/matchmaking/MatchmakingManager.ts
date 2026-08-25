import type { Server, Socket } from "socket.io";
import { prisma } from "@gaming-hub/db";
import { AppError, getGameDefinition, MATCHMAKING_CONFIG } from "@gaming-hub/shared";
import type { GameId, MatchSettings, MatchmakingMode, MatchFoundNotificationPayload } from "@gaming-hub/shared";
import type { AuthenticatedUser } from "../auth";
import type { RoomManager } from "../rooms/RoomManager";
import { assertGameEnabled, getMatchmakingTimeoutSeconds } from "../settings";

interface QueuedPlayer {
  user: AuthenticatedUser;
  socket: Socket;
  queuedAt: number;
  disconnectTimer?: NodeJS.Timeout | null;
}

interface MatchmakingBucket {
  key: string;
  gameId: GameId;
  stake: number;
  mode: MatchmakingMode;
  settings: MatchSettings;
  players: QueuedPlayer[];
}

const MAX_QUEUE_SIZE = MATCHMAKING_CONFIG.MAX_BUCKET_SIZE;
const SWEEP_INTERVAL_MS = 15_000;
const DISCONNECT_GRACE_MS = MATCHMAKING_CONFIG.DISCONNECT_GRACE_SECONDS * 1000;

/**
 * Server-Authoritative Matchmaking Manager
 * Manages isolated (game, stake, mode, time-control) FIFO queues.
 * Handles atomic pair creation, disconnect grace periods, and timeout sweeps.
 */
export class MatchmakingManager {
  private readonly queues = new Map<string, MatchmakingBucket>();
  private readonly userBucketMap = new Map<string, string>(); // userId -> bucketKey
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly io: Server;
  private readonly roomManager: RoomManager;

  constructor(io: Server, roomManager: RoomManager) {
    this.io = io;
    this.roomManager = roomManager;
    const sweep = setInterval(() => {
      this.sweepExpired().catch(() => undefined);
    }, SWEEP_INTERVAL_MS);
    sweep.unref?.();
  }

  private bucketKey(
    gameId: GameId,
    stake: number,
    mode: MatchmakingMode = "casual",
    settings?: MatchSettings,
  ): string {
    const tc = settings?.timeControl;
    const tcKey =
      tc && tc.baseSeconds > 0
        ? `${tc.baseSeconds}+${tc.incrementSeconds}/${tc.delaySeconds}`
        : "unlimited";
    const pcKey = settings?.playerCount ? `p${settings.playerCount}` : "default";
    return `${gameId}:${stake}:${mode}:${tcKey}:${pcKey}`;
  }

  private bucketOf(userId: string): { bucket: MatchmakingBucket; index: number } | null {
    const bucketKey = this.userBucketMap.get(userId);
    if (bucketKey) {
      const bucket = this.queues.get(bucketKey);
      if (bucket) {
        const index = bucket.players.findIndex((q) => q.user.userId === userId);
        if (index !== -1) return { bucket, index };
      }
    }
    for (const bucket of this.queues.values()) {
      const index = bucket.players.findIndex((q) => q.user.userId === userId);
      if (index !== -1) {
        this.userBucketMap.set(userId, bucket.key);
        return { bucket, index };
      }
    }
    return null;
  }

  /**
   * Removes user from queue immediately and cancels in database.
   */
  async removeUser(userId: string): Promise<boolean> {
    this.clearDisconnectTimer(userId);
    const entry = this.bucketOf(userId);
    if (!entry) return false;

    entry.bucket.players.splice(entry.index, 1);
    this.userBucketMap.delete(userId);
    if (entry.bucket.players.length === 0) {
      this.queues.delete(entry.bucket.key);
    }

    await prisma.matchmakingQueue.updateMany({
      where: { userId, status: "WAITING" },
      data: { status: "CANCELLED" },
    }).catch(() => undefined);

    console.log("[MATCHMAKING] QUEUE_CANCELLED", { userId });
    return true;
  }

  /**
   * Handles client socket disconnection with a 30-second grace period.
   */
  handleSocketDisconnect(userId: string): void {
    const entry = this.bucketOf(userId);
    if (!entry) return;

    this.clearDisconnectTimer(userId);
    const timer = setTimeout(() => {
      void this.removeUser(userId);
      this.disconnectTimers.delete(userId);
    }, DISCONNECT_GRACE_MS);

    this.disconnectTimers.set(userId, timer);
    timer.unref?.();
  }

  private clearDisconnectTimer(userId: string): void {
    const timer = this.disconnectTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(userId);
    }
  }

  /**
   * Enters an authenticated player into matchmaking.
   */
  async join(
    user: AuthenticatedUser,
    gameId: GameId,
    stake: number,
    socket: Socket,
    settings?: MatchSettings,
    mode: MatchmakingMode = "casual",
  ): Promise<number> {
    await assertGameEnabled(gameId, stake);
    this.roomManager.assertNotInActiveMatch(user.userId);

    // Cancel any disconnect grace timer upon reconnect/rejoin
    this.clearDisconnectTimer(user.userId);

    // Idempotent reconnection check: if already queued in same bucket, update socket & return position
    const existing = this.bucketOf(user.userId);
    const key = this.bucketKey(gameId, stake, mode, settings);

    if (existing) {
      if (existing.bucket.key === key) {
        existing.bucket.players[existing.index].socket = socket;
        const position = existing.index + 1;
        socket.emit("matchmaking:queued", { position, gameId, stake, mode });
        socket.emit("game:queue-joined", { position, gameId, entryFee: stake, mode });
        return position;
      } else {
        // Switched queue: remove old entry first
        await this.removeUser(user.userId);
      }
    }

    if (stake > 0) {
      const wallet = await prisma.wallet.findUnique({ where: { userId: user.userId } });
      if (!wallet || wallet.balance < stake) {
        throw new AppError(
          "INSUFFICIENT_BALANCE",
          `You need at least ${stake} coins to join matchmaking with this entry fee`,
        );
      }
    }

    const bucket = this.queues.get(key) ?? {
      key,
      gameId,
      stake,
      mode,
      settings: settings ?? {},
      players: [],
    };

    if (bucket.players.length >= MAX_QUEUE_SIZE) {
      throw new AppError("MATCHMAKING_OFFLINE", "The matchmaking queue is full right now");
    }

    const timeoutSec = await getMatchmakingTimeoutSeconds();
    const expiresAt = new Date(Date.now() + timeoutSec * 1000);

    // Create DB queue record
    await prisma.matchmakingQueue.create({
      data: {
        userId: user.userId,
        gameId,
        entryFee: stake,
        gameMode: mode,
        status: "WAITING",
        socketId: socket.id,
        expiresAt,
      },
    }).catch(() => undefined);

    const position = bucket.players.length + 1;
    bucket.players.push({ user, socket, queuedAt: Date.now() });
    this.queues.set(key, bucket);
    this.userBucketMap.set(user.userId, key);

    console.log("[MATCHMAKING] QUEUE_JOINED", {
      playerId: user.userId,
      gameId,
      entryFee: stake,
      mode,
      position,
    });

    socket.emit("matchmaking:queued", { position, gameId, stake, mode });
    socket.emit("game:queue-joined", { position, gameId, entryFee: stake, mode });

    return position;
  }

  /**
   * Triggers pair matching for a bucket.
   */
  pair(gameId: GameId, stake: number, mode: MatchmakingMode = "casual", settings?: MatchSettings): Promise<void> {
    return this.tryPair(this.bucketKey(gameId, stake, mode, settings));
  }

  private async tryPair(key: string): Promise<void> {
    const bucket = this.queues.get(key);
    if (!bucket) return;

    // Prune sockets that are disconnected past grace period
    bucket.players = bucket.players.filter((p) => {
      if (!p.socket.connected && !this.disconnectTimers.has(p.user.userId)) {
        this.userBucketMap.delete(p.user.userId);
        return false;
      }
      return true;
    });

    const def = getGameDefinition(bucket.gameId);
    const requiredSize = (bucket.settings?.playerCount as number | undefined) ?? def.minPlayers;
    if (bucket.players.length < requiredSize) return;

    const group = bucket.players.splice(0, requiredSize);
    for (const q of group) {
      this.userBucketMap.delete(q.user.userId);
      this.clearDisconnectTimer(q.user.userId);
    }
    if (bucket.players.length === 0) this.queues.delete(key);

    try {
      const room = await this.roomManager.createMatchmakingRoom(
        group.map((q) => q.user),
        group.map((q) => q.socket),
        bucket.gameId,
        bucket.stake,
        bucket.settings,
      );

      const matchFoundPayload: MatchFoundNotificationPayload = {
        matchId: room.matchId ?? room.id,
        roomId: room.id,
        gameId: bucket.gameId,
        entryFee: bucket.stake,
        players: group.map((q, idx) => ({
          userId: q.user.userId,
          displayName: q.user.displayName || q.user.username,
          avatarUrl: q.user.avatarUrl,
          seat: idx,
          ready: true,
        })),
        status: "ready",
        configurationSnapshot: {
          gameId: bucket.gameId,
          stake: bucket.stake,
          mode: bucket.mode,
        },
      };

      // Mark status in DB as MATCHED
      await prisma.matchmakingQueue.updateMany({
        where: {
          userId: { in: group.map((q) => q.user.userId) },
          status: "WAITING",
        },
        data: {
          status: "MATCHED",
          matchedAt: new Date(),
          matchedWith: group.map((q) => q.user.userId).join(","),
          roomId: room.id,
          matchId: room.matchId ?? room.id,
        },
      }).catch(() => undefined);

      console.log("[MATCHMAKING] MATCH_FOUND", {
        roomId: room.id,
        matchId: room.matchId,
        gameId: bucket.gameId,
        stake: bucket.stake,
        players: group.map((q) => q.user.userId),
      });

      for (const queued of group) {
        queued.socket.emit("matchmaking:found", { roomId: room.id, matchId: room.matchId });
        queued.socket.emit("game:match-found", matchFoundPayload);
      }
    } catch (error: any) {
      console.error("[Matchmaking Error]", error);
      const code = error?.code || "MATCHMAKING_OFFLINE";
      const message = error?.message || "Could not start a match, please try again";
      for (const queued of group) {
        queued.socket.emit("error", {
          code,
          message,
        });
      }
    }
  }

  /**
   * Sweeps expired entries periodically.
   */
  private async sweepExpired(): Promise<void> {
    const timeoutMs = (await getMatchmakingTimeoutSeconds()) * 1000;
    const now = Date.now();

    for (const bucket of this.queues.values()) {
      const expired = bucket.players.filter((q) => now - q.queuedAt >= timeoutMs);
      if (expired.length === 0) continue;

      bucket.players = bucket.players.filter((q) => now - q.queuedAt < timeoutMs);
      for (const q of expired) {
        this.userBucketMap.delete(q.user.userId);
        this.clearDisconnectTimer(q.user.userId);
      }
      if (bucket.players.length === 0) this.queues.delete(bucket.key);

      const expiredUserIds = expired.map((q) => q.user.userId);
      await prisma.matchmakingQueue.updateMany({
        where: {
          userId: { in: expiredUserIds },
          status: "WAITING",
        },
        data: { status: "EXPIRED" },
      }).catch(() => undefined);

      console.log("[MATCHMAKING] QUEUE_EXPIRED", { count: expired.length, userIds: expiredUserIds });

      for (const queued of expired) {
        queued.socket.emit("matchmaking:timeout", {
          message: "No opponent found — please try searching again.",
        });
        queued.socket.emit("game:queue-expired", {
          message: "No opponent found — please try searching again.",
        });
        queued.socket.emit("error", {
          code: "MATCHMAKING_TIMEOUT",
          message: "No opponent found — please try searching again.",
        });
      }
    }
  }
}
