/**
 * Player Manager
 * 
 * Manages player lifecycle, connection status, AFK detection,
 * statistics tracking, and role management.
 * 
 * Key features:
 * - Ready state management
 * - AFK detection with warnings
 * - Disconnect detection
 * - Reconnect detection
 * - Player status tracking
 * - Online indicator
 * - Role assignment and swapping
 * - Player statistics
 * - Achievement tracking
 */

import type { MultiplayerFramework } from "../framework";
import type {
  PlayerId,
  PlayerRuntime,
  MultiplayerPlayer,
  PlayerSessionStatistics,
  RoomId,
} from "../types";
import type { Socket } from "socket.io";

export interface CreatePlayerOptions {
  id: PlayerId;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  seat: number | null;
  isReady?: boolean;
  isHost?: boolean;
  isSpectator?: boolean;
}

export interface PlayerStatus {
  id: PlayerId;
  connectionStatus: "connected" | "disconnected" | "reconnecting";
  isReady: boolean;
  isHost: boolean;
  seat: number | null;
  lastActivityAt: number;
  afkTimeMs: number;
  pingMs: number | null;
}

export class PlayerManager {
  private readonly framework: MultiplayerFramework;
  private readonly players = new Map<PlayerId, PlayerRuntime>();
  private readonly afkTimers = new Map<string, NodeJS.Timeout>(); // roomId:playerId
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>(); // roomId:playerId
  private readonly pingIntervals = new Map<PlayerId, NodeJS.Timeout>();
  private readonly activityLog = new Map<PlayerId, number[]>(); // playerId -> timestamps
  
  // Statistics
  private readonly playerStats = new Map<PlayerId, PlayerSessionStatistics>();
  
  constructor(framework: MultiplayerFramework) {
    this.framework = framework;
  }
  
  async initialize(): Promise<void> {
    this.framework.log("PlayerManager initialized");
  }
  
  async shutdown(): Promise<void> {
    // Clean up all timers
    for (const timer of this.afkTimers.values()) {
      clearTimeout(timer);
    }
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    for (const timer of this.pingIntervals.values()) {
      clearInterval(timer);
    }
    
    this.afkTimers.clear();
    this.disconnectTimers.clear();
    this.pingIntervals.clear();
    this.players.clear();
    this.playerStats.clear();
    this.activityLog.clear();
  }
  
  /**
   * Create a new player runtime instance.
   */
  createPlayer(options: CreatePlayerOptions, socketId: string): PlayerRuntime {
    const now = Date.now();
    
    const player: PlayerRuntime = {
      id: options.id,
      userId: options.userId,
      username: options.username,
      displayName: options.displayName,
      avatarUrl: options.avatarUrl,
      seat: options.seat ?? null,
      isReady: options.isReady ?? false,
      isHost: options.isHost ?? false,
      isSpectator: options.isSpectator ?? false,
      connectionStatus: "connected",
      socketIds: new Set([socketId]),
      joinedAt: now,
      lastActivityAt: now,
      afkWarnings: 0,
      pendingActions: [],
      reconnectionAttempts: 0,
      lastPingMs: null,
      packetSequenceNumber: 0,
      statistics: this.createInitialStats(),
    };
    
    this.players.set(options.id, player);
    
    return player;
  }
  
  /**
   * Get a player by ID.
   */
  getPlayer(playerId: PlayerId): PlayerRuntime | undefined {
    return this.players.get(playerId);
  }
  
  /**
   * Get all players.
   */
  getAllPlayers(): PlayerRuntime[] {
    return [...this.players.values()];
  }
  
  /**
   * Get connected player count.
   */
  getConnectedPlayerCount(): number {
    return [...this.players.values()].filter(p => p.connectionStatus === "connected").length;
  }
  
  /**
   * Update player activity timestamp.
   */
  recordActivity(playerId: PlayerId): void {
    const player = this.players.get(playerId);
    if (!player) return;
    
    const now = Date.now();
    player.lastActivityAt = now;
    player.afkWarnings = 0;
    
    // Log activity
    const log = this.activityLog.get(playerId) ?? [];
    log.push(now);
    // Keep only last 100 entries
    if (log.length > 100) {
      log.shift();
    }
    this.activityLog.set(playerId, log);
  }
  
  /**
   * Handle socket disconnect for a player.
   */
  async handleDisconnect(playerId: PlayerId, roomId: RoomId, socket: Socket): Promise<void> {
    const player = this.players.get(playerId);
    if (!player) return;
    
    // Remove socket ID
    player.socketIds.delete(socket.id);
    
    // If still has other sockets, player is still connected
    if (player.socketIds.size > 0) {
      return;
    }
    
    // Mark as reconnecting
    player.connectionStatus = "reconnecting";
    player.reconnectionAttempts++;
    
    // Update stats
    if (player.statistics) {
      player.statistics.disconnections++;
    }
    
    // Get room
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room) return;
    
    // Broadcast status change
    this.framework.syncManager.broadcastToRoom(room, "player:connection", {
      roomId,
      playerId,
      status: "reconnecting",
    });
    
    // Start disconnect timer for active matches
    if (room.status === "playing") {
      const timerKey = `${roomId}:${playerId}`;
      const timer = setTimeout(() => {
        this.handleDisconnectTimeout(roomId, playerId);
      }, this.framework.config.reconnectGracePeriodMs);
      
      this.disconnectTimers.set(timerKey, timer);
      
      this.framework.log(`Player ${playerId} disconnected, grace period started (${this.framework.config.reconnectGracePeriodMs}ms)`);
    } else {
      // For waiting rooms, remove player immediately
      await this.framework.roomManager.leaveRoom(roomId, playerId, socket);
    }
  }
  
  /**
   * Handle socket connect for a player (reconnection).
   */
  async handleReconnect(playerId: PlayerId, roomId: RoomId, socket: Socket): Promise<void> {
    const player = this.players.get(playerId);
    if (!player) return;
    
    // Clear disconnect timer
    const timerKey = `${roomId}:${playerId}`;
    const timer = this.disconnectTimers.get(timerKey);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(timerKey);
    }
    
    // Update player
    player.socketIds.add(socket.id);
    player.connectionStatus = "connected";
    player.lastActivityAt = Date.now();
    
    // Update stats
    if (player.statistics) {
      player.statistics.reconnections++;
    }
    
    // Join socket room
    socket.join(`room:${roomId}`);
    
    // Get room
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room) return;
    
    // Broadcast status change
    this.framework.syncManager.broadcastToRoom(room, "player:connection", {
      roomId,
      playerId,
      status: "connected",
    });
    
    this.framework.log(`Player ${playerId} reconnected to room ${roomId}`);
  }
  
  /**
   * Set player ready status.
   */
  setReady(playerId: PlayerId, ready: boolean): void {
    const player = this.players.get(playerId);
    if (!player) return;
    
    player.isReady = ready;
    this.recordActivity(playerId);
  }
  
  /**
   * Swap player seats.
   */
  swapSeats(playerId1: PlayerId, playerId2: PlayerId, roomId: RoomId): void {
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room) throw new Error("Room not found");
    
    const player1 = room.players.get(playerId1);
    const player2 = room.players.get(playerId2);
    
    if (!player1 || !player2) {
      throw new Error("Both players must be in the room");
    }
    
    if (player1.isSpectator || player2.isSpectator) {
      throw new Error("Spectators cannot swap seats");
    }
    
    const tempSeat = player1.seat;
    player1.seat = player2.seat;
    player2.seat = tempSeat;
    
    this.recordActivity(playerId1);
    this.recordActivity(playerId2);
  }
  
  /**
   * Assign a new seat to a player.
   */
  assignSeat(playerId: PlayerId, newSeat: number, roomId: RoomId): void {
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room) throw new Error("Room not found");
    
    const player = room.players.get(playerId);
    if (!player) throw new Error("Player not in room");
    
    // Check if seat is taken
    const existing = [...room.players.values()].find(p => p.seat === newSeat && p.id !== playerId);
    if (existing) {
      throw new Error("Seat is already taken");
    }
    
    player.seat = newSeat;
    this.recordActivity(playerId);
  }
  
  /**
   * Start AFK monitoring for a player.
   */
  startAfkMonitoring(playerId: PlayerId, roomId: RoomId): void {
    const timerKey = `${roomId}:${playerId}`;
    
    // Clear existing timer
    this.clearAfkTimer(roomId, playerId);
    
    const timer = setInterval(() => {
      this.checkAfkStatus(playerId, roomId);
    }, 5000); // Check every 5 seconds
    
    this.afkTimers.set(timerKey, timer);
  }
  
  /**
   * Stop AFK monitoring for a player.
   */
  stopAfkMonitoring(playerId: PlayerId, roomId: RoomId): void {
    this.clearAfkTimer(roomId, playerId);
  }
  
  /**
   * Get player status.
   */
  getPlayerStatus(playerId: PlayerId): PlayerStatus | null {
    const player = this.players.get(playerId);
    if (!player) return null;
    
    const now = Date.now();
    const afkTimeMs = player.connectionStatus === "connected" 
      ? now - player.lastActivityAt 
      : 0;
    
    return {
      id: player.id,
      connectionStatus: player.connectionStatus,
      isReady: player.isReady,
      isHost: player.isHost,
      seat: player.seat,
      lastActivityAt: player.lastActivityAt,
      afkTimeMs,
      pingMs: player.lastPingMs,
    };
  }
  
  /**
   * Update player ping.
   */
  updatePing(playerId: PlayerId, pingMs: number): void {
    const player = this.players.get(playerId);
    if (!player) return;
    
    player.lastPingMs = pingMs;
  }
  
  /**
   * Get player statistics.
   */
  getPlayerStatistics(playerId: PlayerId): PlayerSessionStatistics | null {
    const player = this.players.get(playerId);
    return player?.statistics ?? null;
  }
  
  /**
   * Update player statistics.
   */
  updateStatistics(playerId: PlayerId, updates: Partial<PlayerSessionStatistics>): void {
    const player = this.players.get(playerId);
    if (!player || !player.statistics) return;
    
    Object.assign(player.statistics, updates);
  }
  
  /**
   * Get activity pattern for a player (for anti-cheat).
   */
  getActivityPattern(playerId: PlayerId): number[] {
    return this.activityLog.get(playerId) ?? [];
  }
  
  /**
   * Check if player is AFK.
   */
  private checkAfkStatus(playerId: PlayerId, roomId: RoomId): void {
    const player = this.players.get(playerId);
    if (!player || player.connectionStatus !== "connected") return;
    
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room || room.status !== "playing") return;
    
    const afkTime = Date.now() - player.lastActivityAt;
    const afkTimeout = room.config.settings.afkTimeoutMs ?? this.framework.config.afkTimeoutMs;
    
    // Send warning at 75% of timeout
    if (afkTime > afkTimeout * 0.75 && player.afkWarnings === 0) {
      player.afkWarnings = 1;
      
      // Notify player
      this.framework.syncManager.sendToPlayer(player, "player:afk_warning", {
        roomId,
        timeRemainingMs: afkTimeout - afkTime,
      });
    }
    
    // Mark AFK and potentially auto-resign
    if (afkTime > afkTimeout) {
      this.framework.log(`Player ${playerId} marked AFK in room ${roomId}`);
      
      // Forfeit if in active match
      if (room.match && player.seat !== null) {
        // This would trigger a forfeit action
        this.framework.matchManager.handlePlayerForfeit(room, player, "afk");
      }
    }
  }
  
  /**
   * Handle disconnect timeout (player didn't reconnect in time).
   */
  private async handleDisconnectTimeout(roomId: RoomId, playerId: PlayerId): Promise<void> {
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room) return;
    
    const player = room.players.get(playerId) || room.players.get(playerId);
    if (!player) return;
    
    player.connectionStatus = "disconnected";
    
    this.framework.log(`Player ${playerId} disconnect timeout in room ${roomId}`);
    
    // Handle match forfeit if playing
    if (room.status === "playing" && room.match && player.seat !== null) {
      await this.framework.matchManager.handlePlayerForfeit(room, player, "disconnect_timeout");
    }
  }
  
  /**
   * Clear AFK timer.
   */
  private clearAfkTimer(roomId: RoomId, playerId: PlayerId): void {
    const timerKey = `${roomId}:${playerId}`;
    const timer = this.afkTimers.get(timerKey);
    if (timer) {
      clearInterval(timer);
      this.afkTimers.delete(timerKey);
    }
  }
  
  /**
   * Create initial statistics.
   */
  private createInitialStats(): PlayerSessionStatistics {
    return {
      movesMade: 0,
      timeSpentMs: 0,
      afkTimeMs: 0,
      disconnections: 0,
      reconnections: 0,
    };
  }
}
