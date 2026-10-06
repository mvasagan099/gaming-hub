/**
 * Client-side Multiplayer Client
 * 
 * Client-side interface for the multiplayer framework.
 */

import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  GameActionResult,
} from "@gaming-hub/socket";
import type { JsonObject } from "@gaming-hub/shared";
import type { RoomFull } from "@gaming-hub/shared";

export interface MultiplayerClientConfig {
  serverUrl: string;
  authToken: string | (() => string | null);
  autoReconnect?: boolean;
  reconnectionDelay?: number;
  reconnectionAttempts?: number;
}

export interface ConnectionState {
  connected: boolean;
  reconnecting: boolean;
  latencyMs: number;
  lastPingAt: number | null;
}

export type GameStateListener = (state: JsonObject, events: { type: string }[]) => void;
export type RoomUpdateListener = (room: RoomFull) => void;
export type GameOverListener = (payload: {
  winnerSeats: number[];
  winnerIds: string[];
  state: JsonObject;
}) => void;

export class MultiplayerClient {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private readonly matchIds = new Map<string, string>();
  private config: MultiplayerClientConfig;
  private connectionState: ConnectionState = {
    connected: false,
    reconnecting: false,
    latencyMs: 0,
    lastPingAt: null,
  };
  
  // Event listeners
  private gameStateListeners: GameStateListener[] = [];
  private roomUpdateListeners: RoomUpdateListener[] = [];
  private gameOverListeners: GameOverListener[] = [];
  private disconnectListeners: (() => void)[] = [];
  private reconnectListeners: (() => void)[] = [];
  
  constructor(config: MultiplayerClientConfig) {
    this.config = {
      autoReconnect: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      ...config,
    };
  }
  
  /**
   * Connect to the multiplayer server.
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }
      
      this.socket = io(this.config.serverUrl, {
        transports: ["websocket", "polling"],
        autoConnect: false,
        reconnection: this.config.autoReconnect,
        reconnectionDelay: this.config.reconnectionDelay,
        reconnectionAttempts: this.config.reconnectionAttempts,
        auth: (cb) => {
          const token = typeof this.config.authToken === "function"
            ? this.config.authToken()
            : this.config.authToken;
          cb({ token: token ?? undefined });
        },
      });
      
      this.setupEventHandlers();
      
      this.socket.connect();
      
      this.socket.on("connect", () => {
        this.connectionState.connected = true;
        this.connectionState.reconnecting = false;
        this.startPingMonitoring();
        resolve();
      });
      
      this.socket.on("connect_error", (error) => {
        reject(error);
      });
    });
  }
  
  /**
   * Disconnect from the server.
   */
  disconnect(): void {
    this.matchIds.clear();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connectionState.connected = false;
  }
  
  /**
   * Create a room.
   */
  async createRoom(options: {
    gameId: string;
    isPrivate: boolean;
    stake: number;
    maxPlayers?: number;
    settings?: Record<string, unknown>;
  }): Promise<RoomFull> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("Not connected"));
        return;
      }
      
      this.socket.emit("room:create", {
        gameId: options.gameId as import("@gaming-hub/shared").GameId,
        isPrivate: options.isPrivate,
        stake: options.stake,
        maxPlayers: options.maxPlayers ?? 4,
        settings: options.settings,
      }, (response) => {
        if (response.ok) {
          resolve(response.data);
        } else {
          reject(new Error(response.error.message));
        }
      });
    });
  }
  
  /**
   * Join a room.
   */
  async joinRoom(options: {
    roomId?: string;
    code?: string;
    asSpectator?: boolean;
  }): Promise<RoomFull> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("Not connected"));
        return;
      }
      
      this.socket.emit("room:join", {
        roomId: options.roomId,
        code: options.code,
        asSpectator: options.asSpectator ?? false,
      }, (response) => {
        if (response.ok) {
          resolve(response.data);
        } else {
          reject(new Error(response.error.message));
        }
      });
    });
  }
  
  /**
   * Leave a room.
   */
  async leaveRoom(roomId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("Not connected"));
        return;
      }
      
      this.socket.emit("room:leave", { roomId }, (response) => {
        if (response.ok) {
          this.matchIds.delete(roomId);
          resolve();
        } else {
          reject(new Error(response.error.message));
        }
      });
    });
  }
  
  /**
   * Set ready status.
   */
  async setReady(roomId: string, ready: boolean): Promise<RoomFull> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("Not connected"));
        return;
      }
      
      this.socket.emit("room:ready", { roomId, ready }, (response) => {
        if (response.ok) {
          resolve(response.data);
        } else {
          reject(new Error(response.error.message));
        }
      });
    });
  }
  
  /**
   * Start the game.
   */
  async startGame(roomId: string): Promise<RoomFull> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("Not connected"));
        return;
      }
      
      this.socket.emit("room:start", { roomId }, (response) => {
        if (response.ok) {
          resolve(response.data);
        } else {
          reject(new Error(response.error.message));
        }
      });
    });
  }
  
  /**
   * Send a game action.
   */
  async sendAction(roomId: string, action: { type: string } & JsonObject): Promise<GameActionResult> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("Not connected"));
        return;
      }
      
      const matchId = this.matchIds.get(roomId);
      if (!matchId) { reject(new Error("No active match state")); return; }
      this.socket.emit("game:action", { roomId, matchId, action }, (response) => {
        if (response.ok) {
          resolve(response.data);
        } else {
          reject(new Error(response.error.message));
        }
      });
    });
  }
  
  /**
   * Send a chat message.
   */
  async sendChat(roomId: string, text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("Not connected"));
        return;
      }
      
      this.socket.emit("chat:message", { roomId, text }, (response) => {
        if (response.ok) {
          resolve();
        } else {
          reject(new Error(response.error.message));
        }
      });
    });
  }
  
  /**
   * Send an emoji.
   */
  async sendEmoji(roomId: string, emoji: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("Not connected"));
        return;
      }
      
      this.socket.emit("chat:emoji", { roomId, emoji }, (response) => {
        if (response.ok) {
          resolve();
        } else {
          reject(new Error(response.error.message));
        }
      });
    });
  }
  
  /**
   * Request rematch.
   */
  async requestRematch(roomId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("Not connected"));
        return;
      }
      
      this.socket.emit("game:rematch-request", { roomId }, (response) => {
        if (response.ok) {
          resolve();
        } else {
          reject(new Error(response.error.message));
        }
      });
    });
  }
  
  /**
   * Accept rematch.
   */
  async acceptRematch(roomId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("Not connected"));
        return;
      }
      
      this.socket.emit("game:rematch-accept", { roomId }, (response) => {
        if (response.ok) {
          resolve();
        } else {
          reject(new Error(response.error.message));
        }
      });
    });
  }
  
  /**
   * Decline rematch.
   */
  async declineRematch(roomId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("Not connected"));
        return;
      }
      
      this.socket.emit("game:rematch-decline", { roomId }, (response) => {
        if (response.ok) {
          resolve();
        } else {
          reject(new Error(response.error.message));
        }
      });
    });
  }
  
  /**
   * Join matchmaking.
   */
  async joinMatchmaking(options: {
    gameId: string;
    stake: number;
    settings?: Record<string, unknown>;
  }): Promise<{ position: number }> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("Not connected"));
        return;
      }
      
      this.socket.emit("matchmaking:join", {
        gameId: options.gameId as import("@gaming-hub/shared").GameId,
        stake: options.stake,
        settings: options.settings,
      }, (response) => {
        if (response.ok) {
          resolve(response.data);
        } else {
          reject(new Error(response.error.message));
        }
      });
    });
  }
  
  /**
   * Leave matchmaking.
   */
  async leaveMatchmaking(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("Not connected"));
        return;
      }
      
      this.socket.emit("matchmaking:leave", {}, (response) => {
        if (response.ok) {
          resolve();
        } else {
          reject(new Error(response.error.message));
        }
      });
    });
  }
  
  /**
   * Subscribe to game state updates.
   */
  onGameState(listener: GameStateListener): () => void {
    this.gameStateListeners.push(listener);
    return () => {
      const index = this.gameStateListeners.indexOf(listener);
      if (index !== -1) {
        this.gameStateListeners.splice(index, 1);
      }
    };
  }
  
  /**
   * Subscribe to room updates.
   */
  onRoomUpdate(listener: RoomUpdateListener): () => void {
    this.roomUpdateListeners.push(listener);
    return () => {
      const index = this.roomUpdateListeners.indexOf(listener);
      if (index !== -1) {
        this.roomUpdateListeners.splice(index, 1);
      }
    };
  }
  
  /**
   * Subscribe to game over events.
   */
  onGameOver(listener: GameOverListener): () => void {
    this.gameOverListeners.push(listener);
    return () => {
      const index = this.gameOverListeners.indexOf(listener);
      if (index !== -1) {
        this.gameOverListeners.splice(index, 1);
      }
    };
  }
  
  /**
   * Subscribe to disconnect events.
   */
  onDisconnect(listener: () => void): () => void {
    this.disconnectListeners.push(listener);
    return () => {
      const index = this.disconnectListeners.indexOf(listener);
      if (index !== -1) {
        this.disconnectListeners.splice(index, 1);
      }
    };
  }
  
  /**
   * Subscribe to reconnect events.
   */
  onReconnect(listener: () => void): () => void {
    this.reconnectListeners.push(listener);
    return () => {
      const index = this.reconnectListeners.indexOf(listener);
      if (index !== -1) {
        this.reconnectListeners.splice(index, 1);
      }
    };
  }
  
  /**
   * Get connection state.
   */
  getConnectionState(): ConnectionState {
    return { ...this.connectionState };
  }
  
  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.connectionState.connected;
  }
  
  /**
   * Setup Socket.IO event handlers.
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;
    
    // Game state updates
    this.socket.on("game:state", (payload) => {
      this.matchIds.set(payload.roomId, payload.matchId);
      for (const listener of this.gameStateListeners) {
        listener(payload.state, payload.events);
      }
    });
    
    // Room updates
    this.socket.on("room:update", (room) => {
      if (room.matchId) this.matchIds.set(room.id, room.matchId);
      else this.matchIds.delete(room.id);
      for (const listener of this.roomUpdateListeners) {
        listener(room);
      }
    });
    this.socket.on("room:closed", ({ roomId }) => { this.matchIds.delete(roomId); });
    
    // Game over
    this.socket.on("game:over", (payload) => {
      for (const listener of this.gameOverListeners) {
        listener({
          winnerSeats: payload.winnerSeats,
          winnerIds: payload.winnerIds,
          state: payload.state,
        });
      }
    });
    
    // Matchmaking found
    this.socket.on("matchmaking:found", (payload) => {
      // This will trigger a room update when joined
    });
    
    // Errors
    this.socket.on("error", (error) => {
      console.error("Socket error:", error);
    });
    
    // Disconnect
    this.socket.on("disconnect", () => {
      this.connectionState.connected = false;
      for (const listener of this.disconnectListeners) {
        listener();
      }
    });
    
    // Reconnect (manager-level reconnection events)
    this.socket.io.on("reconnect", () => {
      this.connectionState.reconnecting = false;
      for (const listener of this.reconnectListeners) {
        listener();
      }
    });

    this.socket.io.on("reconnect_attempt", () => {
      this.connectionState.reconnecting = true;
    });
  }

  /**
   * Start ping monitoring.
   */
  private startPingMonitoring(): void {
    if (!this.socket) return;

    // Respond to server pings
    this.socket.on("latency:ping", (data: { timestamp: number }, callback: () => void) => {
      this.connectionState.lastPingAt = Date.now();
      if (callback) callback();
    });
  }
}
