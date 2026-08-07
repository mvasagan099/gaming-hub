/**
 * Room Manager
 * 
 * Manages room lifecycle, creation, joining, leaving, and all room-related operations.
 * Key features:
 * - One room per match enforcement
 * - Duplicate room prevention
 * - Host transfer on owner leave
 * - Room locking and password protection
 * - Room expiration handling
 * - Maximum player validation
 * - Spectator slot management
 * - Reconnect reservation
 */

import { randomUUID } from "node:crypto";
import type { MultiplayerFramework } from "../framework";
import type {
  RoomId,
  RoomRuntime,
  RoomConfig,
  RoomSettings,
  RoomSummary,
  PlayerRuntime,
  PlayerId,
  SocketId,
} from "../types";
import type { GameId } from "@gaming-hub/shared";
import type { Socket } from "socket.io";

export interface CreateRoomOptions {
  gameId: GameId;
  hostId: PlayerId;
  hostSocket: Socket;
  isPrivate?: boolean;
  stake?: number;
  maxPlayers?: number;
  password?: string | null;
  settings?: RoomSettings;
}

export interface JoinRoomOptions {
  roomId?: RoomId;
  code?: string;
  playerId: PlayerId;
  socket: Socket;
  asSpectator?: boolean;
  password?: string | null;
}

export class RoomManager {
  private readonly framework: MultiplayerFramework;
  private readonly rooms = new Map<RoomId, RoomRuntime>();
  private readonly roomsByCode = new Map<string, RoomRuntime>();
  private readonly playerRoomMap = new Map<PlayerId, RoomId>();
  private readonly roomExpirationTimers = new Map<RoomId, NodeJS.Timeout>();
  
  constructor(framework: MultiplayerFramework) {
    this.framework = framework;
  }
  
  async initialize(): Promise<void> {
    this.framework.log("RoomManager initialized");
  }
  
  async shutdown(): Promise<void> {
    // Clean up all rooms
    for (const roomId of this.rooms.keys()) {
      this.closeRoom(roomId, "server_shutdown");
    }
    this.rooms.clear();
    this.roomsByCode.clear();
    this.playerRoomMap.clear();
    this.roomExpirationTimers.clear();
  }
  
  /**
   * Create a new room.
   * Automatically ejects the player from any existing room.
   */
  async createRoom(options: CreateRoomOptions): Promise<RoomRuntime> {
    const { gameId, hostId, hostSocket, isPrivate = false, stake = 0, maxPlayers = 4, password = null, settings = {} } = options;
    
    // Validate game ID
    const { getGameDefinition } = await import("@gaming-hub/shared");
    const gameDef = getGameDefinition(gameId);
    
    // Validate max players
    const actualMaxPlayers = Math.min(Math.max(maxPlayers, gameDef.minPlayers), gameDef.maxPlayers);
    
    // Eject host from any existing room
    await this.ejectPlayerFromAllRooms(hostId, hostSocket);
    
    // Generate unique room ID and code
    const roomId = randomUUID();
    const code = this.generateUniqueRoomCode();
    
    // Create room configuration
    const config: RoomConfig = {
      gameId,
      isPrivate,
      stake,
      maxPlayers: actualMaxPlayers,
      minPlayers: gameDef.minPlayers,
      password: password || null,
      allowSpectators: true,
      maxSpectators: this.framework.config.maxSpectators,
      settings: {
        rated: settings.rated ?? true,
        turnTimerDurationMs: settings.turnTimerDurationMs ?? 30_000,
        matchTimerDurationMs: settings.matchTimerDurationMs ?? 600_000,
        reconnectGracePeriodMs: settings.reconnectGracePeriodMs ?? this.framework.config.reconnectGracePeriodMs,
        afkTimeoutMs: settings.afkTimeoutMs ?? this.framework.config.afkTimeoutMs,
        allowRematch: settings.allowRematch ?? true,
        ...settings,
      },
    };
    
    // Create host player
    const hostPlayer = this.framework.playerManager.createPlayer({
      id: hostId,
      userId: hostId,
      username: (hostSocket.data as { user?: { username?: string } }).user?.username ?? "Player",
      displayName: (hostSocket.data as { user?: { displayName?: string } }).user?.displayName ?? "Player",
      avatarUrl: (hostSocket.data as { user?: { avatarUrl?: string | null } }).user?.avatarUrl ?? null,
      seat: 0,
      isReady: true,
      isHost: true,
      isSpectator: false,
    }, hostSocket.id);
    
    // Create room
    const now = Date.now();
    const room: RoomRuntime = {
      id: roomId,
      code,
      ioName: `room:${roomId}`,
      config,
      hostId,
      status: "waiting",
      players: new Map([[hostId, hostPlayer]]),
      spectators: new Map(),
      createdAt: now,
      expiresAt: now + this.framework.config.roomExpirationMs,
      locked: false,
      match: null,
      rematch: null,
      chatHistory: [],
      eventLog: [{ type: "room_created", timestamp: now, playerId: hostId }],
    };
    
    // Store room
    this.rooms.set(roomId, room);
    this.roomsByCode.set(code, room);
    this.playerRoomMap.set(hostId, roomId);
    
    // Join host to room socket channel
    hostSocket.join(room.ioName);
    
    // Set room expiration timer
    this.scheduleRoomExpiration(roomId);
    
    this.framework.log(`Room created: ${roomId} (${code}) by ${hostId}`);
    
    // Notify managers
    await this.framework.syncManager.broadcastRoomUpdate(room);
    
    return room;
  }
  
  /**
   * Join an existing room.
   */
  async joinRoom(options: JoinRoomOptions): Promise<RoomRuntime> {
    const { roomId, code, playerId, socket, asSpectator = false, password = null } = options;
    
    // Find room
    const room = roomId ? this.rooms.get(roomId) : code ? this.roomsByCode.get(code.toUpperCase()) : undefined;
    
    if (!room) {
      throw new Error("Room not found");
    }
    
    // Check if room is locked
    if (room.locked) {
      throw new Error("Room is locked");
    }
    
    // Check password if required
    if (room.config.password && room.config.password !== password) {
      throw new Error("Invalid password");
    }
    
    // Check if already in room
    if (room.players.has(playerId) || room.spectators.has(playerId)) {
      // Reconnect existing player
      return this.handleRejoin(room, playerId, socket);
    }
    
    // Eject from any existing room
    await this.ejectPlayerFromAllRooms(playerId, socket);
    
    if (asSpectator) {
      // Join as spectator
      if (room.spectators.size >= room.config.maxSpectators) {
        throw new Error("Spectator slots are full");
      }
      
      const player = this.framework.playerManager.createPlayer({
        id: playerId,
        userId: playerId,
        username: (socket.data as { user?: { username?: string } }).user?.username ?? "Spectator",
        displayName: (socket.data as { user?: { displayName?: string } }).user?.displayName ?? "Spectator",
        avatarUrl: (socket.data as { user?: { avatarUrl?: string | null } }).user?.avatarUrl ?? null,
        seat: null,
        isReady: false,
        isHost: false,
        isSpectator: true,
      }, socket.id);
      
      room.spectators.set(playerId, player);
      this.playerRoomMap.set(playerId, room.id);
      socket.join(room.ioName);
      
      this.framework.log(`Player ${playerId} joined room ${room.id} as spectator`);
    } else {
      // Join as player
      if (room.status !== "waiting") {
        throw new Error("Game has already started");
      }
      
      if (room.players.size >= room.config.maxPlayers) {
        throw new Error("Room is full");
      }
      
      // Find next available seat
      const takenSeats = new Set([...room.players.values()].map(p => p.seat).filter((s): s is number => s !== null));
      let seat = 0;
      while (takenSeats.has(seat) && seat < room.config.maxPlayers) {
        seat++;
      }
      
      const player = this.framework.playerManager.createPlayer({
        id: playerId,
        userId: playerId,
        username: (socket.data as { user?: { username?: string } }).user?.username ?? "Player",
        displayName: (socket.data as { user?: { displayName?: string } }).user?.displayName ?? "Player",
        avatarUrl: (socket.data as { user?: { avatarUrl?: string | null } }).user?.avatarUrl ?? null,
        seat,
        isReady: false,
        isHost: false,
        isSpectator: false,
      }, socket.id);
      
      room.players.set(playerId, player);
      this.playerRoomMap.set(playerId, room.id);
      socket.join(room.ioName);
      
      this.framework.log(`Player ${playerId} joined room ${room.id} as player (seat ${seat})`);
    }
    
    // Reset expiration timer
    this.scheduleRoomExpiration(room.id);
    
    // Broadcast update
    await this.framework.syncManager.broadcastRoomUpdate(room);
    
    // If there's an active match, sync state to new participant
    if (room.match) {
      this.framework.syncManager.syncMatchStateToPlayer(room, playerId, socket);
    }
    
    return room;
  }
  
  /**
   * Leave a room.
   */
  async leaveRoom(roomId: RoomId, playerId: PlayerId, socket: Socket): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;
    
    const player = room.players.get(playerId) || room.spectators.get(playerId);
    if (!player) return;
    
    // Remove player from room
    room.players.delete(playerId);
    room.spectators.delete(playerId);
    this.playerRoomMap.delete(playerId);
    
    // Leave socket room
    socket.leave(room.ioName);
    
    // Handle host transfer
    if (playerId === room.hostId && room.players.size > 0) {
      const newHost = [...room.players.values()].find(p => !p.isSpectator) ?? [...room.players.values()][0];
      if (newHost) {
        room.hostId = newHost.id;
        newHost.isHost = true;
        this.framework.log(`Host transferred from ${playerId} to ${newHost.id} in room ${roomId}`);
      }
    }
    
    // Handle player leaving during match
    if (room.status === "playing" && room.match && player.seat !== null) {
      await this.framework.matchManager.handlePlayerDisconnect(room, player);
    }
    
    // Close room if empty
    if (room.players.size === 0 && room.spectators.size === 0) {
      this.closeRoom(roomId, "all_players_left");
      return;
    }
    
    // Broadcast update
    await this.framework.syncManager.broadcastRoomUpdate(room);
    
    this.framework.log(`Player ${playerId} left room ${roomId}`);
  }
  
  /**
   * Handle player rejoining (reconnection).
   */
  private async handleRejoin(room: RoomRuntime, playerId: PlayerId, socket: Socket): Promise<RoomRuntime> {
    const player = room.players.get(playerId) || room.spectators.get(playerId);
    if (!player) {
      throw new Error("Player not found in room");
    }
    
    // Update socket ID
    player.socketIds.add(socket.id);
    player.connectionStatus = "connected";
    player.lastActivityAt = Date.now();
    
    // Join socket room
    socket.join(room.ioName);
    
    // Clear any disconnect timers
    this.framework.timerManager.clearPlayerTimers(room.id, playerId);
    
    // Sync full state to reconnected player
    await this.framework.syncManager.syncFullStateToPlayer(room, playerId, socket);
    
    this.framework.log(`Player ${playerId} rejoined room ${room.id}`);
    
    return room;
  }
  
  /**
   * Kick a player from the room.
   */
  async kickPlayer(roomId: RoomId, targetPlayerId: PlayerId, kickedById: PlayerId): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");
    
    // Verify kicker is host
    if (kickedById !== room.hostId) {
      throw new Error("Only host can kick players");
    }
    
    // Cannot kick during active match
    if (room.status === "playing") {
      throw new Error("Cannot kick players during active match");
    }
    
    const player = room.players.get(targetPlayerId);
    if (!player) throw new Error("Player not in room");
    
    // Cannot kick host
    if (player.isHost) {
      throw new Error("Cannot kick host");
    }
    
    // Remove player
    room.players.delete(targetPlayerId);
    this.playerRoomMap.delete(targetPlayerId);
    
    // Disconnect player's sockets
    for (const socketId of player.socketIds) {
      const socket = this.framework.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.leave(room.ioName);
        socket.emit("player:kicked", {
          roomId,
          playerId: targetPlayerId,
          byUserId: kickedById,
          reason: "kicked_by_host",
        });
      }
    }
    
    // Broadcast update
    await this.framework.syncManager.broadcastRoomUpdate(room);
    
    this.framework.log(`Player ${targetPlayerId} kicked from room ${roomId} by ${kickedById}`);
  }
  
  /**
   * Lock or unlock a room.
   */
  setRoomLock(roomId: RoomId, locked: boolean, lockedBy: PlayerId): void {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");
    
    if (lockedBy !== room.hostId) {
      throw new Error("Only host can lock/unlock room");
    }
    
    room.locked = locked;
    
    this.framework.syncManager.broadcastToRoom(room, "room:lock_changed", { locked });
  }
  
  /**
   * Set player ready status.
   */
  async setPlayerReady(roomId: RoomId, playerId: PlayerId, ready: boolean): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");
    
    if (room.status !== "waiting") {
      throw new Error("Game has already started");
    }
    
    const player = room.players.get(playerId);
    if (!player) throw new Error("Player not in room");
    
    if (player.isSpectator) {
      throw new Error("Spectators cannot ready up");
    }
    
    player.isReady = ready;
    
    // Broadcast update
    await this.framework.syncManager.broadcastRoomUpdate(room);
    
    this.framework.log(`Player ${playerId} ready status: ${ready} in room ${roomId}`);
  }
  
  /**
   * Get room by ID.
   */
  getRoom(roomId: RoomId): RoomRuntime | undefined {
    return this.rooms.get(roomId);
  }
  
  /**
   * Get room by code.
   */
  getRoomByCode(code: string): RoomRuntime | undefined {
    return this.roomsByCode.get(code.toUpperCase());
  }
  
  /**
   * Get room containing a player.
   */
  getPlayerRoom(playerId: PlayerId): RoomRuntime | undefined {
    const roomId = this.playerRoomMap.get(playerId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }
  
  /**
   * Get all active rooms.
   */
  getAllRooms(): RoomRuntime[] {
    return [...this.rooms.values()];
  }
  
  /**
   * Get public room listings.
   */
  getPublicRooms(): RoomSummary[] {
    return [...this.rooms.values()]
      .filter(r => !r.config.isPrivate && r.status === "waiting")
      .map(r => this.toRoomSummary(r));
  }
  
  /**
   * Get room count.
   */
  getRoomCount(): number {
    return this.rooms.size;
  }
  
  /**
   * Close a room.
   */
  closeRoom(roomId: RoomId, reason: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    
    // Cancel expiration timer
    const timer = this.roomExpirationTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.roomExpirationTimers.delete(roomId);
    }
    
    // End match if active
    if (room.match) {
      this.framework.matchManager.abortMatch(room, reason);
    }
    
    // Notify all players
    this.framework.syncManager.broadcastToRoom(room, "room:closed", { roomId, reason });
    
    // Remove all sockets from room
    this.framework.io.in(room.ioName).socketsLeave(room.ioName);
    
    // Clean up player mappings
    for (const playerId of room.players.keys()) {
      this.playerRoomMap.delete(playerId);
    }
    for (const playerId of room.spectators.keys()) {
      this.playerRoomMap.delete(playerId);
    }
    
    // Remove room
    this.rooms.delete(roomId);
    this.roomsByCode.delete(room.code);
    
    this.framework.log(`Room ${roomId} closed: ${reason}`);
  }
  
  /**
   * Eject a player from all rooms they're in.
   */
  private async ejectPlayerFromAllRooms(playerId: PlayerId, socket: Socket): Promise<void> {
    const roomId = this.playerRoomMap.get(playerId);
    if (roomId) {
      await this.leaveRoom(roomId, playerId, socket);
    }
  }
  
  /**
   * Schedule room expiration.
   */
  private scheduleRoomExpiration(roomId: RoomId): void {
    // Clear existing timer
    const existingTimer = this.roomExpirationTimers.get(roomId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    const room = this.rooms.get(roomId);
    if (!room) return;
    
    // Don't expire rooms with active matches
    if (room.status === "playing") return;
    
    const timer = setTimeout(() => {
      this.closeRoom(roomId, "expired");
    }, this.framework.config.roomExpirationMs);
    
    this.roomExpirationTimers.set(roomId, timer);
  }
  
  /**
   * Generate a unique 6-character room code.
   */
  private generateUniqueRoomCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excludes confusing chars like 0, O, 1, I
    
    for (let attempts = 0; attempts < 100; attempts++) {
      let code = "";
      for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      
      if (!this.roomsByCode.has(code)) {
        return code;
      }
    }
    
    // Fallback with timestamp
    const timestamp = Date.now().toString(36).slice(-4).toUpperCase();
    return `R${timestamp}${chars[Math.floor(Math.random() * chars.length)]}${chars[Math.floor(Math.random() * chars.length)]}`;
  }
  
  /**
   * Convert room to summary format.
   */
  private toRoomSummary(room: RoomRuntime): RoomSummary {
    return {
      id: room.id,
      code: room.code,
      gameId: room.config.gameId,
      hostId: room.hostId,
      status: room.status,
      isPrivate: room.config.isPrivate,
      stake: room.config.stake,
      playerCount: room.players.size,
      maxPlayers: room.config.maxPlayers,
      spectatorCount: room.spectators.size,
      createdAt: new Date(room.createdAt).toISOString(),
      hasPassword: !!room.config.password,
    };
  }
}
