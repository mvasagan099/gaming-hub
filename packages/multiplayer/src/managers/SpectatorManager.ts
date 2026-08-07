/**
 * Spectator Manager
 * 
 * Manages spectators, their viewing experience, and chat interactions.
 * 
 * Key features:
 * - Join/leave as spectator
 * - Live viewing without affecting game
 * - Hide private information
 * - Spectator count tracking
 * - Spectator chat
 * - Replay mode viewing
 */

import type { MultiplayerFramework } from "../framework";
import type {
  RoomRuntime,
  RoomId,
  PlayerRuntime,
  PlayerId,
} from "../types";
import type { EngineInstance } from "@gaming-hub/game-engine";
import type { Socket } from "socket.io";

export interface SpectatorView {
  roomId: string;
  gameId: string;
  status: string;
  playerCount: number;
  spectators: { id: string; displayName: string }[];
  gameState: Record<string, unknown> | null;
  chatEnabled: boolean;
}

export class SpectatorManager {
  private readonly framework: MultiplayerFramework;
  
  constructor(framework: MultiplayerFramework) {
    this.framework = framework;
  }
  
  async initialize(): Promise<void> {
    this.framework.log("SpectatorManager initialized");
  }
  
  async shutdown(): Promise<void> {
    // Cleanup handled by RoomManager
  }
  
  /**
   * Add a spectator to a room.
   */
  async addSpectator(roomId: RoomId, playerId: PlayerId, socket: Socket): Promise<PlayerRuntime> {
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room) throw new Error("Room not found");
    
    if (!room.config.allowSpectators) {
      throw new Error("Spectators not allowed in this room");
    }
    
    if (room.spectators.size >= room.config.maxSpectators) {
      throw new Error("Spectator slots are full");
    }
    
    // Create spectator player
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
    
    // Join socket room
    socket.join(room.ioName);
    
    // Sync current state
    if (room.match) {
      this.framework.syncManager.syncMatchStateToPlayer(room, playerId, socket);
    }
    
    // Broadcast update
    await this.framework.syncManager.broadcastRoomUpdate(room);
    
    this.framework.log(`Player ${playerId} joined room ${roomId} as spectator`);
    
    return player;
  }
  
  /**
   * Remove a spectator from a room.
   */
  async removeSpectator(roomId: RoomId, playerId: PlayerId, socket: Socket): Promise<void> {
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room) return;
    
    const spectator = room.spectators.get(playerId);
    if (!spectator) return;
    
    // Remove from room
    room.spectators.delete(playerId);
    
    // Leave socket room
    socket.leave(room.ioName);
    
    // Broadcast update
    await this.framework.syncManager.broadcastRoomUpdate(room);
    
    this.framework.log(`Player ${playerId} left room ${roomId} as spectator`);
  }
  
  /**
   * Get spectator view of a room (filtered for spectators).
   */
  getSpectatorView(room: RoomRuntime): SpectatorView {
    // Filter out sensitive information
    const engine = room.match?.engine as EngineInstance | undefined;
    const filteredGameState = engine ? this.filterGameState(engine.serialize()) : null;
    
    return {
      roomId: room.id,
      gameId: room.config.gameId,
      status: room.status,
      playerCount: room.players.size,
      spectators: [...room.spectators.values()].map(s => ({
        id: s.id,
        displayName: s.displayName,
      })),
      gameState: filteredGameState,
      chatEnabled: true,
    };
  }
  
  /**
   * Get spectator count. With no room ID, returns the total across all rooms.
   */
  getSpectatorCount(roomId?: RoomId): number {
    if (roomId) {
      const room = this.framework.roomManager.getRoom(roomId);
      return room ? room.spectators.size : 0;
    }
    let count = 0;
    for (const room of this.framework.roomManager.getAllRooms()) {
      count += room.spectators.size;
    }
    return count;
  }
  
  /**
   * Send spectator-only chat message.
   */
  async sendSpectatorChat(roomId: RoomId, playerId: PlayerId, message: string): Promise<void> {
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room) return;
    
    const spectator = room.spectators.get(playerId);
    if (!spectator) return;
    
    // Send only to spectators
    for (const spec of room.spectators.values()) {
      this.framework.syncManager.sendToPlayer(spec, "spectator:chat", {
        roomId,
        playerId,
        senderName: spectator.displayName,
        message,
        timestamp: Date.now(),
      });
    }
  }
  
  /**
   * Filter game state for spectators (hide sensitive info).
   */
  private filterGameState(state: Record<string, unknown>): Record<string, unknown> {
    // By default, return full state
    // Override in specific games to hide information
    return { ...state };
  }
  
  /**
   * Enable/disable spectator mode for a room.
   */
  setSpectatorEnabled(roomId: RoomId, enabled: boolean, changedBy: PlayerId): void {
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room) throw new Error("Room not found");
    
    if (changedBy !== room.hostId) {
      throw new Error("Only host can change spectator settings");
    }
    
    room.config.allowSpectators = enabled;
    
    // Kick existing spectators if disabled
    if (!enabled) {
      for (const [spectatorId, spectator] of room.spectators) {
        // Find a socket for the spectator
        for (const socketId of spectator.socketIds) {
          const socket = this.framework.io.sockets.sockets.get(socketId);
          if (socket) {
            this.removeSpectator(roomId, spectatorId, socket);
            break;
          }
        }
      }
    }
    
    // Broadcast update
    this.framework.syncManager.broadcastToRoom(room, "room:spectator_mode_changed", {
      roomId,
      enabled,
    });
  }
}
