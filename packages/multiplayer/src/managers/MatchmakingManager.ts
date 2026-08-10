/**
 * Matchmaking Manager
 * 
 * Manages matchmaking queues and player pairing.
 * 
 * Key features:
 * - Quick match
 * - Ranked matchmaking
 * - Casual matchmaking
 * - Private room creation
 * - Invite friend
 * - Skill-based matchmaking
 * - Region-based matchmaking
 * - Reconnect to active match
 */

import { randomUUID } from "node:crypto";
import type { MultiplayerFramework } from "../framework";
import type {
  RoomRuntime,
  PlayerId,
  MatchmakingEntry,
  MatchmakingBucket,
  RoomSettings,
} from "../types";
import type { GameId } from "@gaming-hub/shared";
import type { Socket } from "socket.io";

export interface JoinMatchmakingOptions {
  playerId: PlayerId;
  gameId: GameId;
  stake: number;
  socket: Socket;
  skillRating?: number;
  region?: string;
  settings?: RoomSettings;
  mode: "quick" | "ranked" | "casual";
}

export interface MatchmakingResult {
  success: boolean;
  roomId?: string;
  position?: number;
  estimatedWaitMs?: number;
  error?: string;
}

export class MatchmakingManager {
  private readonly framework: MultiplayerFramework;
  private readonly buckets = new Map<string, MatchmakingBucket>();
  private readonly playerQueueMap = new Map<PlayerId, string>(); // playerId -> bucketKey
  private readonly sweepInterval: NodeJS.Timeout;
  
  // Constants
  private readonly SWEEP_INTERVAL_MS = 30_000;
  private readonly MAX_QUEUE_SIZE = 50;
  private readonly MATCHMAKING_TIMEOUT_MS = 120_000; // 2 minutes
  
  constructor(framework: MultiplayerFramework) {
    this.framework = framework;
    this.sweepInterval = setInterval(() => {
      this.sweepExpired();
    }, this.SWEEP_INTERVAL_MS);
  }
  
  async initialize(): Promise<void> {
    this.framework.log("MatchmakingManager initialized");
  }
  
  async shutdown(): Promise<void> {
    clearInterval(this.sweepInterval);
    
    // Remove all players from queue
    for (const playerId of this.playerQueueMap.keys()) {
      this.removeFromQueue(playerId);
    }
    
    this.buckets.clear();
    this.playerQueueMap.clear();
  }
  
  /**
   * Join matchmaking queue.
   */
  async joinQueue(options: JoinMatchmakingOptions): Promise<MatchmakingResult> {
    const { playerId, gameId, stake, socket, skillRating = 1000, region = "default", settings = {}, mode } = options;
    
    // Check if already in queue
    if (this.playerQueueMap.has(playerId)) {
      return { success: false, error: "Already in matchmaking queue" };
    }
    
    // Generate bucket key based on game, stake, and settings
    const bucketKey = this.generateBucketKey(gameId, stake, settings, mode);
    
    // Get or create bucket
    let bucket = this.buckets.get(bucketKey);
    if (!bucket) {
      bucket = {
        key: bucketKey,
        gameId,
        stake,
        settings,
        entries: [],
      };
      this.buckets.set(bucketKey, bucket);
    }
    
    // Check queue size
    if (bucket.entries.length >= this.MAX_QUEUE_SIZE) {
      return { success: false, error: "Queue is full, please try again later" };
    }
    
    // Create entry
    const entry: MatchmakingEntry = {
      playerId,
      gameId,
      stake,
      skillRating,
      region,
      queuedAt: Date.now(),
      socket,
      settings,
    };
    
    // Add to bucket
    bucket.entries.push(entry);
    this.playerQueueMap.set(playerId, bucketKey);
    
    // Calculate position
    const position = bucket.entries.length;
    
    // Notify player
    socket.emit("matchmaking:queued", { position, gameId, stake });
    
    this.framework.log(`Player ${playerId} joined matchmaking queue for ${gameId} (${mode})`);
    
    // Try to pair immediately
    const paired = await this.tryPair(bucket);
    
    if (paired) {
      return { success: true };
    }
    
    // Calculate estimated wait
    const estimatedWaitMs = this.calculateEstimatedWait(bucket);
    
    return {
      success: true,
      position,
      estimatedWaitMs,
    };
  }
  
  /**
   * Remove player from matchmaking queue.
   */
  removeFromQueue(playerId: PlayerId): boolean {
    const bucketKey = this.playerQueueMap.get(playerId);
    if (!bucketKey) return false;
    
    const bucket = this.buckets.get(bucketKey);
    if (!bucket) return false;
    
    // Remove from bucket
    const index = bucket.entries.findIndex(e => e.playerId === playerId);
    if (index !== -1) {
      bucket.entries.splice(index, 1);
    }
    
    // Remove from map
    this.playerQueueMap.delete(playerId);
    
    // Clean up empty bucket
    if (bucket.entries.length === 0) {
      this.buckets.delete(bucketKey);
    }
    
    this.framework.log(`Player ${playerId} left matchmaking queue`);
    
    return true;
  }
  
  /**
   * Check if player is in queue.
   */
  isInQueue(playerId: PlayerId): boolean {
    return this.playerQueueMap.has(playerId);
  }
  
  /**
   * Get player's queue position.
   */
  getQueuePosition(playerId: PlayerId): number | null {
    const bucketKey = this.playerQueueMap.get(playerId);
    if (!bucketKey) return null;
    
    const bucket = this.buckets.get(bucketKey);
    if (!bucket) return null;
    
    const index = bucket.entries.findIndex(e => e.playerId === playerId);
    return index !== -1 ? index + 1 : null;
  }
  
  /**
   * Get queue length.
   */
  getQueueLength(): number {
    let total = 0;
    for (const bucket of this.buckets.values()) {
      total += bucket.entries.length;
    }
    return total;
  }
  
  /**
   * Get queue stats.
   */
  getQueueStats(): { totalPlayers: number; activeBuckets: number; averageWaitMs: number } {
    let totalPlayers = 0;
    let totalWaitMs = 0;
    const now = Date.now();
    
    for (const bucket of this.buckets.values()) {
      totalPlayers += bucket.entries.length;
      for (const entry of bucket.entries) {
        totalWaitMs += now - entry.queuedAt;
      }
    }
    
    return {
      totalPlayers,
      activeBuckets: this.buckets.size,
      averageWaitMs: totalPlayers > 0 ? totalWaitMs / totalPlayers : 0,
    };
  }
  
  /**
   * Reconnect to active match.
   */
  async reconnectToMatch(playerId: PlayerId, socket: Socket): Promise<RoomRuntime | null> {
    // Find if player is in any active room
    const room = this.framework.roomManager.getPlayerRoom(playerId);
    if (!room) return null;
    
    // Check if match is active
    if (room.status !== "playing") return null;
    
    // Handle reconnection
    await this.framework.playerManager.handleReconnect(playerId, room.id, socket);
    
    return room;
  }
  
  /**
   * Create private room.
   */
  async createPrivateRoom(
    playerId: PlayerId,
    gameId: GameId,
    socket: Socket,
    options: { isPrivate?: boolean; stake?: number; password?: string | null; settings?: RoomSettings }
  ): Promise<RoomRuntime> {
    const room = await this.framework.roomManager.createRoom({
      gameId,
      hostId: playerId,
      hostSocket: socket,
      isPrivate: options.isPrivate ?? true,
      stake: options.stake ?? 100,
      password: options.password,
      settings: options.settings,
    });
    
    return room;
  }
  
  /**
   * Invite friend to private room.
   */
  async inviteFriend(roomId: string, inviterId: PlayerId, inviteeId: PlayerId): Promise<void> {
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room) throw new Error("Room not found");
    
    if (room.hostId !== inviterId) {
      throw new Error("Only host can invite friends");
    }
    
    // In a real implementation, this would send a notification to the invitee
    // For now, just emit an event
    this.framework.syncManager.broadcastToRoom(room, "room:invite_sent", {
      roomId,
      inviterId,
      inviteeId,
      code: room.code,
    });
  }
  
  /**
   * Try to pair players in a bucket.
   */
  private async tryPair(bucket: MatchmakingBucket): Promise<boolean> {
    const { getGameDefinition } = await import("@gaming-hub/shared");
    const gameDef = getGameDefinition(bucket.gameId);
    
    const requiredPlayers = (bucket.settings.playerCount as number | undefined) ?? gameDef.minPlayers;
    
    if (bucket.entries.length < requiredPlayers) {
      return false;
    }
    
    if (bucket.key.includes(":ranked:")) {
      bucket.entries.sort((a, b) => a.skillRating - b.skillRating);
    }
    
    const group = bucket.entries.splice(0, requiredPlayers);
    
    for (const entry of group) {
      this.playerQueueMap.delete(entry.playerId);
    }
    
    try {
      const room = await this.createMatchmakingRoom(group, bucket);
      
      for (const entry of group) {
        entry.socket.emit("matchmaking:found", {
          roomId: room.id,
          code: room.code,
        });
      }
      
      this.framework.log(`Created matchmaking room ${room.id} with ${group.length} players`);
      
      return true;
    } catch (error) {
      this.framework.error("Failed to create matchmaking room", error);
      
      for (const entry of group) {
        bucket.entries.push(entry);
        this.playerQueueMap.set(entry.playerId, bucket.key);
      }
      
      return false;
    }
  }
  
  /**
   * Create room from matchmaking group.
   */
  private async createMatchmakingRoom(
    group: MatchmakingEntry[],
    bucket: MatchmakingBucket
  ): Promise<RoomRuntime> {
    const firstEntry = group[0]!;
    const maxPlayers = (bucket.settings.playerCount as number | undefined) ?? group.length;
    
    const room = await this.framework.roomManager.createRoom({
      gameId: bucket.gameId,
      hostId: firstEntry.playerId,
      hostSocket: firstEntry.socket,
      isPrivate: true,
      stake: bucket.stake,
      maxPlayers,
      settings: bucket.settings,
    });
    
    try {
      // Add remaining players
      for (let i = 1; i < group.length; i++) {
        const entry = group[i]!;
        await this.framework.roomManager.joinRoom({
          roomId: room.id,
          playerId: entry.playerId,
          socket: entry.socket,
          asSpectator: false,
        });
      }
      
      // Matchmaking players skip the manual ready check, so mark everyone ready.
      for (const player of room.players.values()) {
        player.isReady = true;
      }
      
      // Auto-start match
      await this.framework.matchManager.startMatch({
        roomId: room.id,
        startedBy: firstEntry.playerId,
      });
      
      return room;
    } catch (error) {
      // Never leave a half-created matchmaking room behind: close it so the
      // players' sockets are released and the room doesn't leak in "waiting".
      this.framework.roomManager.closeRoom(room.id, "matchmaking_failed");
      throw error;
    }
  }
  
  /**
   * Sweep expired entries.
   */
  private sweepExpired(): void {
    const now = Date.now();
    
    for (const [bucketKey, bucket] of this.buckets) {
      const expired = bucket.entries.filter(
        e => now - e.queuedAt >= this.MATCHMAKING_TIMEOUT_MS
      );
      
      if (expired.length > 0) {
        // Remove expired entries
        bucket.entries = bucket.entries.filter(
          e => now - e.queuedAt < this.MATCHMAKING_TIMEOUT_MS
        );
        
        // Notify expired players
        for (const entry of expired) {
          this.playerQueueMap.delete(entry.playerId);
          entry.socket.emit("matchmaking:timeout", {
            message: "Matchmaking timed out - please try again",
          });
        }
        
        this.framework.log(`Removed ${expired.length} expired entries from bucket ${bucketKey}`);
      }
      
      // Clean up empty buckets
      if (bucket.entries.length === 0) {
        this.buckets.delete(bucketKey);
      }
    }
  }
  
  /**
   * Generate bucket key.
   */
  private generateBucketKey(
    gameId: GameId,
    stake: number,
    settings: RoomSettings,
    mode: "quick" | "ranked" | "casual"
  ): string {
    const timeControl = settings.timeControl
      ? `${settings.timeControl.baseSeconds}+${settings.timeControl.incrementSeconds}`
      : "unlimited";
    
    const rated = settings.rated !== false ? "rated" : "casual";
    
    const playerCount = settings.playerCount ? `:p${settings.playerCount}` : "";
    
    return `${gameId}:${stake}:${timeControl}:${rated}:${mode}${playerCount}`;
  }
  
  /**
   * Calculate estimated wait time.
   */
  private calculateEstimatedWait(bucket: MatchmakingBucket): number {
    if (bucket.entries.length === 0) return 0;
    
    const now = Date.now();
    const waitTimes = bucket.entries.map(e => now - e.queuedAt);
    const averageWait = waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length;
    
    return Math.round(averageWait);
  }
}
