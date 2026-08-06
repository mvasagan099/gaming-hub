import type { Server, Socket } from "socket.io";
import { AppError, getGameDefinition } from "@gaming-hub/shared";
import type { GameId } from "@gaming-hub/shared";
import type { AuthenticatedUser } from "../auth";
import type { RoomManager } from "../rooms/RoomManager";
import { assertGameEnabled, getMatchmakingTimeoutSeconds } from "../settings";

interface QueuedPlayer {
  user: AuthenticatedUser;
  socket: Socket;
  queuedAt: number;
}

const MAX_QUEUE_SIZE = 50;
const SWEEP_INTERVAL_MS = 30_000;

/**
 * Per-(game, stake) FIFO queues. When a bucket reaches the game's required
 * player count the group is pulled out and an auto-starting room is created.
 */
export class MatchmakingManager {
  private readonly queues = new Map<string, QueuedPlayer[]>();
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

  private bucketKey(gameId: GameId, stake: number): string {
    return `${gameId}:${stake}`;
  }

  private bucketOf(userId: string): { key: string; index: number } | null {
    for (const [key, bucket] of this.queues) {
      const index = bucket.findIndex((q) => q.user.userId === userId);
      if (index !== -1) return { key, index };
    }
    return null;
  }

  removeUser(userId: string): boolean {
    const entry = this.bucketOf(userId);
    if (!entry) return false;
    this.queues.get(entry.key)!.splice(entry.index, 1);
    if (this.queues.get(entry.key)!.length === 0) {
      this.queues.delete(entry.key);
    }
    return true;
  }

  async join(user: AuthenticatedUser, gameId: GameId, stake: number, socket: Socket): Promise<number> {
    await assertGameEnabled(gameId);
    if (this.bucketOf(user.userId)) {
      throw new AppError("ALREADY_QUEUED", "You are already in the queue");
    }

    const key = this.bucketKey(gameId, stake);
    const bucket = this.queues.get(key) ?? [];
    if (bucket.length >= MAX_QUEUE_SIZE) {
      throw new AppError("MATCHMAKING_OFFLINE", "The queue is full right now");
    }

    const position = bucket.length + 1;
    bucket.push({ user, socket, queuedAt: Date.now() });
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
  pair(gameId: GameId, stake: number): Promise<void> {
    return this.tryPair(this.bucketKey(gameId, stake));
  }

  private async tryPair(key: string) {
    const bucket = this.queues.get(key);
    if (!bucket) return;

    const [gameId, stakeRaw] = key.split(":");
    const stake = Number(stakeRaw);
    const size = getGameDefinition(gameId).minPlayers;
    if (bucket.length < size) return;

    const group = bucket.splice(0, size);
    if (bucket.length === 0) this.queues.delete(key);

    try {
      const room = await this.roomManager.createMatchmakingRoom(
        group.map((q) => q.user),
        group.map((q) => q.socket),
        gameId as GameId,
        stake,
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

    for (const [key, bucket] of this.queues) {
      const expired = bucket.filter((q) => now - q.queuedAt >= timeoutMs);
      if (expired.length === 0) continue;

      const remaining = bucket.filter((q) => now - q.queuedAt < timeoutMs);
      if (remaining.length === 0) this.queues.delete(key);
      else this.queues.set(key, remaining);

      for (const queued of expired) {
        queued.socket.emit("error", {
          code: "MATCHMAKING_TIMEOUT",
          message: "Timed out waiting for opponents — please try again",
        });
      }
    }
  }

}
