/**
 * Synchronization Manager
 * 
 * Manages state synchronization between server and clients.
 * Handles broadcasting, direct messaging, and state reconciliation.
 * 
 * Key features:
 * - Instant state synchronization
 * - Server-authoritative state
 * - Immutable state updates
 * - No refresh required
 * - Duplicate packet prevention
 * - Packet ordering
 * - Event acknowledgement
 * - Latency compensation
 * - Connection quality indicator
 * - Ping monitoring
 */

import type { MultiplayerFramework } from "../framework";
import type {
  RoomRuntime,
  RoomId,
  PlayerId,
  PlayerRuntime,
  StateSyncPacket,
  ConnectionQuality,
} from "../types";
import type { JsonObject, RoomFull } from "@gaming-hub/shared";
import type { EngineEvent, EngineInstance } from "@gaming-hub/game-engine";
import type { Socket } from "socket.io";

export class SyncManager {
  private readonly framework: MultiplayerFramework;
  private readonly sequenceNumbers = new Map<string, number>(); // roomId -> sequence number
  private readonly acknowledgedSequences = new Map<string, Set<number>>(); // roomId:playerId -> bounded acknowledged sequences
  private readonly connectionQuality = new Map<PlayerId, ConnectionQuality>();
  private readonly pingIntervals = new Map<PlayerId, NodeJS.Timeout>();
  
  constructor(framework: MultiplayerFramework) {
    this.framework = framework;
  }
  
  async initialize(): Promise<void> {
    this.framework.log("SyncManager initialized");
  }
  
  async shutdown(): Promise<void> {
    for (const interval of this.pingIntervals.values()) {
      clearInterval(interval);
    }
    this.pingIntervals.clear();
    this.sequenceNumbers.clear();
    this.acknowledgedSequences.clear();
    this.connectionQuality.clear();
  }
  
  private readonly statePayloadBytes = new Map<string, number>();

  getMemoryStats() { return { statePayloadBytes: Object.fromEntries(this.statePayloadBytes), syncRooms: this.sequenceNumbers.size, ackScopes: this.acknowledgedSequences.size, syncPingIntervals: this.pingIntervals.size }; }

  releaseRoom(roomId: string): void {
    this.sequenceNumbers.delete(roomId);
    for (const key of this.acknowledgedSequences.keys()) if (key.startsWith(`${roomId}:`)) this.acknowledgedSequences.delete(key);
  }
  releasePlayer(playerId: string): void {
    this.stopPingMonitoring(playerId);
    this.connectionQuality.delete(playerId);
  }

  /**
   * Broadcast a room update to all participants.
   */
  async broadcastRoomUpdate(room: RoomRuntime): Promise<void> {
    const roomUpdate = this.serializeRoom(room);
    
    this.broadcastToRoom(room, "room:update", roomUpdate);
    
    this.framework.log(`Broadcasted room update for ${room.id}`);
  }
  
  /**
   * Broadcast match start.
   */
  async broadcastMatchStart(room: RoomRuntime): Promise<void> {
    if (!room.match) return;
    
    const payload = {
      roomId: room.id,
      matchId: room.match.matchId,
      gameId: room.config.gameId,
      players: [...room.players.values()].map(p => ({
        id: p.id,
        username: p.username,
        displayName: p.displayName,
        seat: p.seat,
        avatarUrl: p.avatarUrl,
      })),
      startedAt: room.match.startedAt,
    };
    
    this.broadcastToRoom(room, "match:started", payload);
    
    // Send initial game state
    await this.broadcastGameState(room, [{ type: "match_started" }]);
  }
  
  /**
   * Broadcast game state update.
   */
  async broadcastGameState(room: RoomRuntime, events: EngineEvent[]): Promise<void> {
    if (!room.match) return;
    
    const engine = room.match.engine as EngineInstance;
    const state = engine.serialize() as any;
    const sequenceNumber = this.getNextSequenceNumber(room.id);
    
    const packet: StateSyncPacket = {
      roomId: room.id,
      matchId: room.match.matchId,
      turnNumber: room.match.turnNumber,
      state,
      // Carrom's settled state already carries the authoritative trajectory.
      // Sending it in both shot events as well triples the largest payload.
      events: events.map(e => {
        const event: EngineEvent & { timestamp: number } = { ...e, timestamp: Date.now() };
        if (room.config.gameId === 'carrom' && Array.isArray(state.lastTrajectory) &&
            e.shotId === state.lastActionAtMs && ['shot-trajectory', 'carrom:shot-start'].includes(e.type)) {
          delete event.keyframes;
        }
        return event;
      }),
      timestamp: Date.now(),
      checksum: this.calculateChecksum(state, room.config.gameId),
      sequenceNumber,
    };
    
    // A realtime rally broadcasts 60 times a second. Logging every packet
    // creates hundreds of log writes per room and delays the physics loop.
    if (!["table-tennis", "snake-vs-worms", "fruit-ninja"].includes(room.config.gameId) || events.length > 0) {
      this.framework.log(`Game state: ${room.config.gameId}, room ${room.id}, seq ${sequenceNumber}, events: ${events.map(e => e.type).join(", ")}`);
    }

    this.broadcastToRoom(room, "game:state", packet);
    
  }
  
  /**
   * Sync match state to a specific player (for reconnections).
   */
  syncMatchStateToPlayer(room: RoomRuntime, playerId: PlayerId, socket: Socket): void {
    if (!room.match) return;
    
    const engine = room.match.engine as EngineInstance;
    const state = engine.serialize();
    const sequenceNumber = this.getNextSequenceNumber(room.id);
    
    const packet: StateSyncPacket = {
      roomId: room.id,
      matchId: room.match.matchId,
      turnNumber: room.match.turnNumber,
      state,
      events: [{ type: "sync", timestamp: Date.now() }],
      timestamp: Date.now(),
      checksum: this.calculateChecksum(state, room.config.gameId),
      sequenceNumber,
    };
    
    this.publish(room, "game:state", packet, socket.id);
  }
  
  /**
   * Sync full room state to a player (for reconnections).
   */
  async syncFullStateToPlayer(room: RoomRuntime, playerId: PlayerId, socket: Socket): Promise<void> {
    // Room state
    const roomUpdate = this.serializeRoom(room);
    this.publish(room, "room:update", roomUpdate, socket.id);
    
    // If match is active, sync match state
    if (room.match) {
      this.syncMatchStateToPlayer(room, playerId, socket);
    }
    
    // Send chat history
    this.publish(room, "chat:history", {
      roomId: room.id,
      messages: room.chatHistory,
    }, socket.id);
    
    // Start ping monitoring
    this.startPingMonitoring(playerId, socket);
  }
  
  /**
   * Broadcast game over.
   */
  async broadcastGameOver(room: RoomRuntime): Promise<void> {
    if (!room.match) return;
    
    const payload = {
      roomId: room.id,
      matchId: room.match.matchId,
      winnerSeats: room.match.winnerSeats,
      winnerIds: room.match.winnerIds,
      state: (room.match.engine as EngineInstance).serialize(),
      finishedAt: room.match.finishedAt,
    };
    
    this.broadcastToRoom(room, "game:over", payload);
    
    // Stop ping monitoring for all players
    for (const playerId of room.players.keys()) {
      this.stopPingMonitoring(playerId);
    }
    
    this.framework.log(`Broadcasted game over for room ${room.id}`);
  }
  
  /**
   * Broadcast to all room participants (players + spectators).
   */
  broadcastToRoom(room: RoomRuntime, event: string, payload: unknown): void {
    this.publish(room, event, payload, room.ioName);
  }

  private publish(room: RoomRuntime, event: string, payload: unknown, destination: string): void {
    if (this.framework.config?.publish) this.framework.config?.publish(room, event, payload, destination);
    else this.framework.io.to(destination).emit(event, payload);
  }

  restoreStateVersion(roomId: string, version: number): void { this.sequenceNumbers.set(roomId, version); }
  
  /**
   * Send to a specific player.
   */
  sendToPlayer(player: PlayerRuntime, event: string, payload: unknown): void {
    if (this.framework.config?.publish) {
      const room = this.framework.roomManager.getPlayerRoom(player.id);
      if (room) for (const socketId of player.socketIds) this.publish(room, event, payload, socketId);
      return;
    }
    for (const socketId of player.socketIds) {
      const socket = this.framework.io.sockets.sockets.get(socketId);
      if (socket && socket.connected) {
        socket.emit(event, payload);
      }
    }
  }
  
  /**
   * Handle state acknowledgment from client.
   */
  handleStateAck(playerId: PlayerId, roomId: RoomId, sequenceNumber: number): void {
    if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber < 0) return;
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room || (!room.players.has(playerId) && !room.spectators.has(playerId))) return;
    const key = `${roomId}:${playerId}`;
    const acks = this.acknowledgedSequences.get(key) ?? new Set<number>();
    acks.add(sequenceNumber);
    while (acks.size > 128) acks.delete(acks.values().next().value!);
    this.acknowledgedSequences.set(key, acks);
    
    this.framework.log(`Player ${playerId} acknowledged state ${sequenceNumber} for room ${roomId}`);
  }
  
  /**
   * Check if a sequence is acknowledged by all players.
   */
  isSequenceAcknowledgedByAll(room: RoomRuntime, sequenceNumber: number): boolean {
    const connectedPlayers = [...room.players.values()].filter(
      p => p.connectionStatus === "connected" && !p.isSpectator
    );
    
    for (const player of connectedPlayers) {
      const acks = this.acknowledgedSequences.get(`${room.id}:${player.id}`);
      if (!acks || !acks.has(sequenceNumber)) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Start ping monitoring for a player.
   */
  startPingMonitoring(playerId: PlayerId, socket: Socket): void {
    // Clear existing interval
    this.stopPingMonitoring(playerId);
    
    let lastPingTime = Date.now();
    
    const interval = setInterval(() => {
      if (!socket.connected) {
        this.stopPingMonitoring(playerId);
        return;
      }
      
      const pingStart = Date.now();
      
      socket.emit("latency:ping", { timestamp: pingStart }, () => {
        const latency = Date.now() - pingStart;
        
        // Update connection quality
        const current = this.connectionQuality.get(playerId);
        const newQuality: ConnectionQuality = {
          latencyMs: current ? (current.latencyMs * 0.8 + latency * 0.2) : latency,
          packetLoss: 0, // TODO: Calculate actual packet loss
          jitterMs: current ? Math.abs(latency - current.latencyMs) : 0,
          lastPingAt: Date.now(),
        };
        
        this.connectionQuality.set(playerId, newQuality);
        this.framework.playerManager.updatePing(playerId, latency);
      });
    }, 5000); // Ping every 5 seconds
    
    this.pingIntervals.set(playerId, interval);
  }
  
  /**
   * Stop ping monitoring for a player.
   */
  stopPingMonitoring(playerId: PlayerId): void {
    const interval = this.pingIntervals.get(playerId);
    if (interval) {
      clearInterval(interval);
      this.pingIntervals.delete(playerId);
    }
  }
  
  /**
   * Get connection quality for a player.
   */
  getConnectionQuality(playerId: PlayerId): ConnectionQuality | null {
    return this.connectionQuality.get(playerId) ?? null;
  }
  
  /**
   * Get next sequence number for a room.
   */
  private getNextSequenceNumber(roomId: RoomId): number {
    const current = this.sequenceNumbers.get(roomId) ?? 0;
    const next = current + 1;
    this.sequenceNumbers.set(roomId, next);
    return next;
  }

  getStateVersion(roomId: RoomId): number {
    return this.sequenceNumbers.get(roomId) ?? 1;
  }
  
  /**
   * Calculate simple checksum for state validation.
   */
  private calculateChecksum(state: JsonObject, gameId: string): string {
    // Simple hash for state validation
    const str = JSON.stringify(state);
    this.statePayloadBytes.set(gameId, Buffer.byteLength(str));
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
  
  /**
   * Serialize room for transmission.
   */
  serializeRoom(room: RoomRuntime): RoomFull {
    return {
      id: room.id,
      code: room.code,
      gameId: room.config.gameId,
      hostId: room.hostId,
      status: room.status,
      isPrivate: room.config.isPrivate,
      stake: room.config.stake,
      minPlayers: room.config.minPlayers,
      maxPlayers: room.config.maxPlayers,
      hasStarted: room.match?.gameplayStartedAt != null ||
        (room.match?.gameplayStartedAt === undefined && ["playing", "ended"].includes(room.status) &&
          !this.framework.matchManager?.isAwaitingGameLoad(room)),
      awaitingGameLoad: this.framework.matchManager?.isAwaitingGameLoad(room) ?? false,
      createdAt: new Date(room.createdAt).toISOString(),
      ...(room.lifecyclePhase ? { lifecyclePhase: room.lifecyclePhase, countdownEndsAt: room.countdownEndsAt ?? null, serverTimeMs: Date.now() } : {}),
      players: [...room.players.values()].map(p => ({
        id: p.id,
        username: p.username,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        seat: p.seat,
        isReady: p.isReady,
        isHost: p.isHost,
        isSpectator: p.isSpectator,
        connectionStatus: p.connectionStatus,
        joinedAt: new Date(p.joinedAt).toISOString(),
        ...(this.framework.config?.executeRoomTask ? { lastAcceptedActionSequence: p.packetSequenceNumber } : {}),
      })),
      spectators: [...room.spectators.values()].map(p => ({
        id: p.id,
        username: p.username,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        seat: p.seat,
        isReady: p.isReady,
        isHost: p.isHost,
        isSpectator: true,
        connectionStatus: p.connectionStatus,
        joinedAt: new Date(p.joinedAt).toISOString(),
      })),
      settings: room.config.settings,
      matchId: room.match?.matchId ?? null,
    };
  }
}
