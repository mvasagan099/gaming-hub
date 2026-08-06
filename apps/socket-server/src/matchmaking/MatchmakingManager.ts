import type { Server, Socket } from "socket.io";
import { AppError, getGameDefinition } from "@gaming-hub/shared";
import type { GameId, MatchSettings } from "@gaming-hub/shared";
import type { AuthenticatedUser } from "../auth";
import type { RoomManager } from "../rooms/RoomManager";
import { assertGameEnabled, getMatchmakingTimeoutSeconds } from "../settings";

interface QueuedPlayer {
  user: AuthenticatedUser;
  socket: Socket;
  queuedAt: number;
}

interface MatchmakingBucket {
  key: string;
  gameId: GameId;
  stake: number;
  settings: MatchSettings;
  players: QueuedPlayer[];
}

const MAX_QUEUE_SIZE = 50;
const SWEEP_INTERVAL_MS = 30_000;

/**
 * Per-(game, stake, time-control) FIFO queues. When a bucket reaches the
 * game's required player count the group is pulled out and an auto-starting
 * room is created. Settings are part of the bucket key so different chess time
 * controls (or rated/casual pools) never pair together.
 */
export class MatchmakingManager {
  private readonly queues = new Map<string, MatchmakingBucket>();
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

  private bucketKey(gameId: GameId, stake: number, settings: MatchSettings | undefined): string {
    const tc = settings?.timeControl;
    const tcKey =
      tc && tc.baseSeconds > 0
        ? `${tc.baseSeconds}+${tc.incrementSeconds}/${tc.delaySeconds}`
        : "unlimited";
    const rated = settings?.rated === false ? "casual" : "rated";
    return `${gameId}:${stake}:${tcKey}:${rated}`;
  }

  private bucketOf(userId: string): { bucket: MatchmakingBucket; index: number } | null {
    for (const bucket of this.queues.values()) {
      const index = bucket.players.findIndex((q) => q.user.userId === userId);
      if (index !== -1) return { bucket, index };
    }
    return null;
  }

  removeUser(userId: string): boolean {
    const entry = this.bucketOf(userId);
    if (!entry) return false;
    entry.bucket.players.splice(entry.index, 1);
    if (entry.bucket.players.length === 0) {
      this.queues.delete(entry.bucket.key);
    }
    return true;
  }

  async join(
    user: AuthenticatedUser,
    gameId: GameId,
    stake: number,
    socket: Socket,
    settings?: MatchSettings,
  ): Promise<number> {
    await assertGameEnabled(gameId);
    if (this.bucketOf(user.userId)) {
      throw new AppError("ALREADY_QUEUED", "You are already in the queue");
    }

    const key = this.bucketKey(gameId, stake, settings);
    const bucket = this.queues.get(key) ?? {
      key,
      gameId,
      stake,
      settings: settings ?? {},
      players: [],
    };
    if (bucket.players.length >= MAX_QUEUE_SIZE) {
      throw new AppError("MATCHMAKING_OFFLINE", "The queue is full right now");
    }

    const position = bucket.players.length + 1;
    bucket.players.push({ user, socket, queuedAt: Date.now() });
    this.queues.set(key, bucket);

    socket.emit("matchmaking:queued", { position });
    return position;
  }

  /**
   * Pulls a full group out of a bucket and auto-starts a match. Invoked by the
   * event handler after the joining client has been acked, so queued/found
   * arrive in order and every client has an up-to-date socket to be wired into
   * the room.
   */
  pair(gameId: GameId, stake: number, settings?: MatchSettings): Promise<void> {
    return this.tryPair(this.bucketKey(gameId, stake, settings));
  }

  private async tryPair(key: string) {
    const bucket = this.queues.get(key);
    if (!bucket) return;

    const size = getGameDefinition(bucket.gameId).minPlayers;
    if (bucket.players.length < size) return;

    const group = bucket.players.splice(0, size);
    if (bucket.players.length === 0) this.queues.delete(key);

    try {
      const room = await this.roomManager.createMatchmakingRoom(
        group.map((q) => q.user),
        group.map((q) => q.socket),
        bucket.gameId,
        bucket.stake,
        bucket.settings,
      );
      for (const queued of group) {
        queued.socket.emit("matchmaking:found", { roomId: room.id });
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

  /** Evicts players who have been waiting longer than the configured timeout. */
  private async sweepExpired() {
    const timeoutMs = (await getMatchmakingTimeoutSeconds()) * 1000;
    const now = Date.now();

    for (const bucket of this.queues.values()) {
      const expired = bucket.players.filter((q) => now - q.queuedAt >= timeoutMs);
      if (expired.length === 0) continue;

      bucket.players = bucket.players.filter((q) => now - q.queuedAt < timeoutMs);
      if (bucket.players.length === 0) this.queues.delete(bucket.key);

      for (const queued of expired) {
        queued.socket.emit("error", {
          code: "MATCHMAKING_TIMEOUT",
          message: "Timed out waiting for opponents — please try again",
        });
      }
    }
  }
}
