/**
 * Match Manager
 * 
 * Manages match lifecycle, game state, actions, and match resolution.
 * Works in coordination with game engines from @gaming-hub/game-engine.
 * 
 * Key features:
 * - Match lifecycle (lobby -> ready check -> countdown -> gameplay -> end)
 * - Server-authoritative state
 * - Game action handling
 * - Pause/Resume support
 * - Match abort handling
 * - Forfeit handling
 * - Winner determination
 */

import { randomUUID } from "node:crypto";
import type { MultiplayerFramework } from "../framework";
import type {
  RoomRuntime,
  RoomId,
  PlayerRuntime,
  MatchRuntime,
  GameAction,
} from "../types";
import type { EngineInstance, EngineActionResult, EnginePlayer, EngineEvent } from "@gaming-hub/game-engine";
import type { JsonObject } from "@gaming-hub/shared";
import { getGameDefinition } from "@gaming-hub/shared";

export interface StartMatchOptions {
  roomId: RoomId;
  startedBy: string;
}

export interface GameActionOptions {
  roomId: RoomId;
  playerId: string;
  action: GameAction;
}

export class MatchManager {
  private readonly framework: MultiplayerFramework;
  private readonly activeMatches = new Map<string, MatchRuntime>();
  
  constructor(framework: MultiplayerFramework) {
    this.framework = framework;
  }
  
  async initialize(): Promise<void> {
    this.framework.log("MatchManager initialized");
  }
  
  async shutdown(): Promise<void> {
    // End all active matches
    for (const match of this.activeMatches.values()) {
      // Clean up any resources
    }
    this.activeMatches.clear();
  }
  
  /**
   * Start a match in a room.
   */
  async startMatch(options: StartMatchOptions): Promise<MatchRuntime> {
    const { roomId, startedBy } = options;
    
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room) throw new Error("Room not found");
    
    // Verify starter is host
    if (startedBy !== room.hostId) {
      throw new Error("Only host can start the match");
    }
    
    // Check if already started
    if (room.status !== "waiting") {
      throw new Error("Match already started");
    }
    
    // Get all participants (non-spectators)
    const participants = [...room.players.values()].filter(p => !p.isSpectator);
    
    // Check minimum players
    if (participants.length < room.config.minPlayers) {
      throw new Error(`Need at least ${room.config.minPlayers} players`);
    }
    
    // Check all players ready
    const notReady = participants.filter(p => !p.isReady);
    if (notReady.length > 0) {
      throw new Error(`${notReady[0]?.displayName || "A player"} is not ready`);
    }
    
    // Check all players connected
    const disconnected = participants.filter(p => p.connectionStatus !== "connected");
    if (disconnected.length > 0) {
      throw new Error(`${disconnected[0]?.displayName || "A player"} is disconnected`);
    }
    
    // Get game definition
    const gameDef = getGameDefinition(room.config.gameId);
    
    // Create engine players
    const enginePlayers: EnginePlayer[] = participants
      .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0))
      .map((p, index) => ({
        userId: p.id,
        seat: p.seat ?? index,
      }));
    
    // Create match ID
    const matchId = randomUUID();
    
    // Import and create game engine
    const { createEngine, secureRandomSource } = await import("@gaming-hub/game-engine");
    
    const engineOptions: Record<string, unknown> = {};
    
    // Add time control if configured
    if (room.config.settings.turnTimerDurationMs) {
      engineOptions.turnTimer = {
        turnDurationMs: room.config.settings.turnTimerDurationMs,
        warningThresholdMs: Math.floor(room.config.settings.turnTimerDurationMs * 0.25),
      };
    }
    
    if (room.config.settings.matchTimerDurationMs) {
      engineOptions.matchTimer = {
        matchDurationMs: room.config.settings.matchTimerDurationMs,
        warningThresholdMs: Math.floor(room.config.settings.matchTimerDurationMs * 0.1),
      };
    }
    
    // Create engine
    const engine = createEngine(
      room.config.gameId,
      enginePlayers,
      secureRandomSource(),
      engineOptions
    );
    
    // Create match runtime
    const now = Date.now();
    const match: MatchRuntime = {
      matchId,
      engine,
      turnNumber: 0,
      startedAt: now,
      pausedAt: null,
      pausedBy: null,
      finishedAt: null,
      winnerIds: [],
      winnerSeats: [],
      stateSnapshots: [],
      actionHistory: [],
    };
    
    // Store initial state snapshot
    match.stateSnapshots.push({
      turnNumber: 0,
      timestamp: now,
      state: engine.serialize(),
    });
    
    // Update room
    room.match = match;
    room.status = "playing";
    
    // Store in active matches
    this.activeMatches.set(matchId, match);
    
    // Start AFK monitoring for all players
    for (const player of participants) {
      this.framework.playerManager.startAfkMonitoring(player.id, roomId);
    }
    
    // Schedule clock check
    this.scheduleClockCheck(room);
    
    // Broadcast match start
    await this.framework.syncManager.broadcastMatchStart(room);
    
    this.framework.log(`Match ${matchId} started in room ${roomId}`);
    
    return match;
  }
  
  /**
   * Apply a game action.
   */
  async applyAction(options: GameActionOptions): Promise<EngineActionResult<JsonObject>> {
    const { roomId, playerId, action } = options;
    
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room) {
      return this.createErrorResult(null, "Room not found");
    }
    
    if (room.status !== "playing" || !room.match) {
      return this.createErrorResult(null, "Game not started");
    }
    
    const player = room.players.get(playerId);
    if (!player) {
      return this.createErrorResult(null, "Player not in room");
    }
    
    // Serialize state mutations per room so concurrent actions never corrupt
    // the authoritative engine.
    return this.framework.gameStateManager.enqueue(roomId, async () => {
      // Framework-level pre-validation (turn, spectator, rate limiting).
      const validation = this.framework.actionValidator.validate(room!, player, action);
      if (!validation.ok) {
        this.framework.actionValidator.recordRejected(player.id);
        return this.createErrorResult(null, validation.error ?? "Action rejected");
      }
      
      // Record activity
      this.framework.playerManager.recordActivity(playerId);
      
      // Apply action to engine
      const engine = room!.match!.engine as EngineInstance;
      const seat = player.seat as number;
      const result = engine.apply(action as { type: string }, seat);
      
      // Validate action with anti-cheat
      if (this.framework.config.enableAntiCheat) {
        const validation = await this.framework.antiCheatManager.validateAction(
          room!,
          player,
          action,
          result
        );
        
        if (!validation.valid) {
          this.framework.antiCheatManager.logSuspiciousEvent({
            playerId,
            roomId,
            eventType: "invalid_action",
            details: {
              actionType: action.type,
              reason: validation.reason ?? "Action rejected",
              confidence: validation.confidence,
            },
            timestamp: Date.now(),
            severity: "medium",
          });
          
          return this.createErrorResult(engine.serialize(), validation.reason || "Action rejected");
        }
      }
      
      if (result.ok) {
        // Normalize engine events and append to the room event log.
        const events = this.framework.eventDispatcher.toGameEvents(room!, result.events);
        this.framework.eventDispatcher.appendToLog(room!, events);
        
        // Record snapshot + history and bump the turn counter.
        const recorded = this.framework.gameStateManager.recordResult(
          room!,
          result,
          player.id,
          seat,
          action,
          events
        );
        
        this.framework.actionValidator.recordAction(player.id);
        this.framework.statisticsCollector.recordAction(room!, player, action);
        
        // Record for replay
        if (this.framework.config.enableReplay) {
          this.framework.replayManager.recordAction(room!, recorded);
        }
        
        // Broadcast state update
        await this.framework.syncManager.broadcastGameState(room!, result.events);
        
        // Check if match finished
        if (result.finished) {
          await this.finishMatch(room!, result);
        } else {
          // Reschedule clock check
          this.scheduleClockCheck(room!);
        }
      }
      
      return result;
    });
  }
  
  /**
   * Pause a match.
   */
  async pauseMatch(roomId: RoomId, playerId: string): Promise<void> {
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room || !room.match) throw new Error("Match not found");
    
    if (room.match.pausedAt) {
      throw new Error("Match already paused");
    }
    
    room.match.pausedAt = Date.now();
    room.match.pausedBy = playerId;
    
    // Stop AFK monitoring
    for (const player of room.players.values()) {
      this.framework.playerManager.stopAfkMonitoring(player.id, roomId);
    }
    
    // Broadcast pause
    await this.framework.syncManager.broadcastToRoom(room, "match:paused", {
      roomId,
      pausedBy: playerId,
      pausedAt: room.match.pausedAt,
    });
    
    this.framework.log(`Match paused in room ${roomId} by ${playerId}`);
  }
  
  /**
   * Resume a match. `system` bypasses the player authorization check and is
   * used by the reconnect handler to resume a match that was auto-paused when
   * a player disconnected.
   */
  async resumeMatch(roomId: RoomId, playerId: string, system = false): Promise<void> {
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room || !room.match) throw new Error("Match not found");
    
    if (!room.match.pausedAt) {
      throw new Error("Match not paused");
    }
    
    // Only host or player who paused can resume
    if (!system && playerId !== room.hostId && playerId !== room.match.pausedBy) {
      throw new Error("Not authorized to resume");
    }
    
    room.match.pausedAt = null;
    room.match.pausedBy = null;
    
    // Restart AFK monitoring
    for (const player of room.players.values()) {
      this.framework.playerManager.startAfkMonitoring(player.id, roomId);
    }
    
    // Reschedule clock check
    this.scheduleClockCheck(room);
    
    // Broadcast resume
    await this.framework.syncManager.broadcastToRoom(room, "match:resumed", {
      roomId,
      resumedBy: playerId,
    });
    
    this.framework.log(`Match resumed in room ${roomId} by ${playerId}`);
  }
  
  /**
   * Finish a match and resolve the final result.
   */
  async finishMatch(room: RoomRuntime, result: EngineActionResult<JsonObject>): Promise<void> {
    if (!room.match) return;
    
    // Resolve winner ids, per-player outcomes and scores.
    const matchResult = this.framework.winnerCalculator.calculate(room, result);
    
    room.match.finishedAt = matchResult.finishedAt;
    room.match.winnerSeats = matchResult.winnerSeats;
    room.match.winnerIds = matchResult.winnerIds;
    
    // Update room status
    room.status = "ended";
    
    // Stop AFK monitoring
    for (const player of room.players.values()) {
      this.framework.playerManager.stopAfkMonitoring(player.id, room.id);
    }
    
    // Finalize replay
    if (this.framework.config.enableReplay) {
      await this.framework.replayManager.finalizeReplay(room);
    }
    
    // Persist match statistics.
    await this.framework.statisticsCollector.finalize(room, matchResult);
    
    // Broadcast game over
    await this.framework.syncManager.broadcastGameOver(room);
    
    this.framework.log(`Match ${room.match.matchId} finished in room ${room.id}. Winners: ${matchResult.winnerIds.join(", ")}`);
  }
  
  /**
   * Abort a match.
   */
  async abortMatch(room: RoomRuntime, reason: string): Promise<void> {
    if (!room.match) return;
    
    room.match.finishedAt = Date.now();
    room.match.winnerIds = [];
    room.match.winnerSeats = [];
    
    // Update room status
    room.status = "ended";
    
    // Stop AFK monitoring
    for (const player of room.players.values()) {
      this.framework.playerManager.stopAfkMonitoring(player.id, room.id);
    }
    
    // Broadcast abort
    await this.framework.syncManager.broadcastToRoom(room, "match:aborted", {
      roomId: room.id,
      reason,
    });
    
    this.framework.log(`Match ${room.match.matchId} aborted in room ${room.id}: ${reason}`);
  }
  
  /**
   * Handle player disconnect during match.
   */
  async handlePlayerDisconnect(room: RoomRuntime, player: PlayerRuntime): Promise<void> {
    if (!room.match) return;
    
    this.framework.log(`Player ${player.id} disconnected during match in room ${room.id}`);
    
    // Give grace period for reconnection before forfeit
    // The actual forfeit is handled by the disconnect timer in PlayerManager
  }
  
  /**
   * Handle player forfeit.
   */
  async handlePlayerForfeit(room: RoomRuntime, player: PlayerRuntime, reason: string): Promise<void> {
    if (!room.match) return;
    
    if (player.seat === null) return;
    
    this.framework.log(`Player ${player.id} forfeited in room ${room.id}: ${reason}`);
    
    // If the match was auto-paused (e.g. by this player's disconnect), resume
    // it first so the engine accepts the resign action.
    if (room.match.pausedAt) {
      const engine = room.match.engine as EngineInstance;
      const resumeResult = engine.apply({ type: "resume" }, player.seat);
      if (resumeResult.ok) {
        room.match.pausedAt = null;
        room.match.pausedBy = null;
        await this.framework.syncManager.broadcastGameState(room, resumeResult.events);
      }
    }
    
    // Apply forfeit action
    const forfeitAction: GameAction = {
      type: "resign",
      reason,
    };
    
    await this.applyAction({
      roomId: room.id,
      playerId: player.id,
      action: forfeitAction,
    });
  }
  
  /**
   * Get active match count.
   */
  getActiveMatchCount(): number {
    return [...this.activeMatches.values()].filter(m => !m.finishedAt).length;
  }
  
  /**
   * Get match by ID.
   */
  getMatch(matchId: string): MatchRuntime | undefined {
    return this.activeMatches.get(matchId);
  }
  
  /**
   * Schedule clock check for timer-based games.
   */
  private scheduleClockCheck(room: RoomRuntime): void {
    if (!room.match) return;
    
    this.framework.timerManager.scheduleClockCheck(room, () => {
      this.handleClockExpiry(room);
    });
  }
  
  /**
   * Handle clock expiry.
   */
  private async handleClockExpiry(room: RoomRuntime): Promise<void> {
    if (!room.match || room.status !== "playing") return;
    
    const engine = room.match.engine as EngineInstance & { handleTimeout?: (kind: "turn" | "match", seat?: number) => EngineActionResult<JsonObject> };
    
    if (!engine.handleTimeout) return;
    
    // Check for turn timeout
    const currentSeat = engine.currentSeat;
    const turnDeadline = engine.currentClockDeadline;
    
    if (turnDeadline && turnDeadline <= Date.now()) {
      const result = engine.handleTimeout("turn", currentSeat);
      
      if (result.ok) {
        await this.framework.syncManager.broadcastGameState(room, result.events);
        
        if (result.finished) {
          await this.finishMatch(room, result);
        } else {
          this.scheduleClockCheck(room);
        }
      }
    }
    
    // Check for match timeout
    const matchDeadline = engine.currentMatchDeadline;
    
    if (matchDeadline && matchDeadline <= Date.now()) {
      const result = engine.handleTimeout("match");
      
      if (result.ok) {
        await this.finishMatch(room, result);
      }
    }
  }
  
  /**
   * Create error result.
   */
  private createErrorResult(state: JsonObject | null, error: string): EngineActionResult<JsonObject> {
    return {
      ok: false,
      error,
      state: state ?? {},
      events: [],
      finished: false,
      winnerSeats: [],
    };
  }
}
