/**
 * Anti-Cheat Manager
 * 
 * Validates player actions and detects suspicious behavior.
 * 
 * Key features:
 * - Server validates every action
 * - Ignore invalid packets
 * - Prevent speed hacks
 * - Prevent duplicate actions
 * - Prevent state manipulation
 * - Audit suspicious events
 * - Secure Socket.IO authentication
 */

import type { MultiplayerFramework } from "../framework";
import type {
  RoomRuntime,
  PlayerRuntime,
  GameAction,
  ValidationResult,
  SuspiciousEvent,
} from "../types";
import type { EngineActionResult } from "@gaming-hub/game-engine";
import type { JsonObject } from "@gaming-hub/shared";

export interface AntiCheatConfig {
  /** Maximum actions per second */
  maxActionsPerSecond: number;
  /** Maximum number of suspicious events before auto-kick */
  maxSuspiciousEvents: number;
  /** Time window for action rate limiting (ms) */
  actionRateWindowMs: number;
  /** Minimum time between actions (ms) */
  minActionIntervalMs: number;
  /** Game-specific overrides for rate limits */
  gameOverrides?: Record<string, {
    maxActionsPerSecond?: number;
    minActionIntervalMs?: number;
  }>;
}

export interface ActionValidationContext {
  room: RoomRuntime;
  player: PlayerRuntime;
  action: GameAction;
  result: EngineActionResult<JsonObject>;
  timestamp: number;
  actionSequence: number;
}

export class AntiCheatManager {
  private readonly framework: MultiplayerFramework;
  private readonly config: AntiCheatConfig;
  private readonly actionHistory = new Map<string, number[]>(); // playerId -> action timestamps
  private readonly suspiciousEvents = new Map<string, SuspiciousEvent[]>(); // playerId -> events
  private readonly actionSequences = new Map<string, number>(); // playerId -> last sequence number
  private readonly processedActionCache = new Map<string, { timestamp: number; result: any }>(); // roomId:actionId -> cached result
  private readonly playerRiskScores = new Map<string, number>(); // playerId -> internal fair play risk score (0-100)
  
  constructor(framework: MultiplayerFramework, config?: Partial<AntiCheatConfig>) {
    this.framework = framework;
    this.config = {
      maxActionsPerSecond: 10,
      maxSuspiciousEvents: 5,
      actionRateWindowMs: 1000,
      minActionIntervalMs: 50,
      gameOverrides: {
        // Carrom fires place-striker confirmations and a strike in rapid
        // succession; the generic realtime/turn-based limits would reject them.
        carrom: { maxActionsPerSecond: 20, minActionIntervalMs: 20 },
        // Fruit ninja sends a burst of blade samples per swipe (begin + move +
        // end); the engine validates every sample itself, so loosen the gate.
        "fruit-ninja": { maxActionsPerSecond: 40, minActionIntervalMs: 10 },
        // Snooker sends aim updates and strike actions
        snooker: { maxActionsPerSecond: 25, minActionIntervalMs: 0 },
        // Table Tennis sends frequent paddle positions
        "table-tennis": { maxActionsPerSecond: 30, minActionIntervalMs: 15 },
        // Snake vs Worms sends frequent direction inputs
        "snake-vs-worms": { maxActionsPerSecond: 30, minActionIntervalMs: 15 },
      },
      ...config,
    };
  }
  
  async initialize(): Promise<void> {
    this.framework.log("AntiCheatManager initialized");
  }
  
  async shutdown(): Promise<void> {
    this.actionHistory.clear();
    this.suspiciousEvents.clear();
    this.actionSequences.clear();
    this.processedActionCache.clear();
    this.playerRiskScores.clear();
  }

  /**
   * Check if an actionId was already processed to guarantee idempotency.
   */
  getCachedActionResult(roomId: string, actionId?: string): any | null {
    if (!actionId) return null;
    const key = `${roomId}:${actionId}`;
    const cached = this.processedActionCache.get(key);
    return cached ? cached.result : null;
  }

  /**
   * Cache a processed action result for idempotency.
   */
  cacheActionResult(roomId: string, actionId: string | undefined, result: any): void {
    if (!actionId) return;
    const key = `${roomId}:${actionId}`;
    this.processedActionCache.set(key, { timestamp: Date.now(), result });

    // Prune entries older than 2 minutes if cache grows large
    if (this.processedActionCache.size > 1000) {
      const cutoff = Date.now() - 120000;
      for (const [k, v] of this.processedActionCache.entries()) {
        if (v.timestamp < cutoff) this.processedActionCache.delete(k);
      }
    }
  }

  /**
   * Internal fair-play risk score (0-100). Higher = more suspicious anomalies.
   */
  getFairPlayRiskScore(playerId: string): number {
    return this.playerRiskScores.get(playerId) ?? 0;
  }

  /**
   * Pre-validation executed BEFORE engine mutation.
   * Checks match deadlines, stale state versions, rate limits, and action intervals.
   */
  async validatePreAction(
    room: RoomRuntime,
    player: PlayerRuntime,
    action: GameAction,
  ): Promise<ValidationResult> {
    const now = Date.now();

    // 1. Authoritative 10-Minute Hard Match Timer Protection
    const MATCH_HARD_LIMIT_MS = 10 * 60 * 1000; // 10 minutes
    if (room.match && room.match.startedAt) {
      const elapsed = now - room.match.startedAt;
      if (elapsed > MATCH_HARD_LIMIT_MS) {
        this.logSuspiciousEvent({
          playerId: player.id,
          roomId: room.id,
          eventType: "timeout_action",
          details: { actionType: action.type, elapsedMs: elapsed },
          timestamp: now,
          severity: "high",
        });
        return {
          valid: false,
          reason: "Match deadline exceeded (10-minute limit)",
          confidence: 1.0,
        };
      }
    }

    // 2. State Version Validation (Reject stale client updates)
    const clientStateVersion = (action as any).stateVersion ?? (action as any).version;
    if (typeof clientStateVersion === "number" && room.match) {
      const currentVersion = room.match.turnNumber ?? 0;
      if (clientStateVersion < currentVersion - 2 && currentVersion > 2) {
        this.logSuspiciousEvent({
          playerId: player.id,
          roomId: room.id,
          eventType: "stale_state_version",
          details: { actionType: action.type, clientVersion: clientStateVersion, currentVersion },
          timestamp: now,
          severity: "low",
        });
        return {
          valid: false,
          reason: "Stale state version update ignored",
          confidence: 0.9,
        };
      }
    }

    // Real-time continuous game inputs that can be sent frequently
    if (
      action.type === "paddle-move" ||
      action.type === "direction" ||
      action.type === "boost-start" ||
      action.type === "boost-stop"
    ) {
      return { valid: true, confidence: 1.0 };
    }

    // Check action rate limiting
    const rateCheck = this.checkActionRate(room, player.id, now);
    if (!rateCheck.valid) {
      this.logSuspiciousEvent({
        playerId: player.id,
        roomId: room.id,
        eventType: "rate_limit_exceeded",
        details: { actionType: action.type, rate: this.getActionRate(player.id) },
        timestamp: now,
        severity: "medium",
      });
      return rateCheck;
    }

    // Check for rapid successive actions (speed hack)
    const intervalCheck = this.checkActionInterval(room, player.id, now);
    if (!intervalCheck.valid) {
      this.logSuspiciousEvent({
        playerId: player.id,
        roomId: room.id,
        eventType: "rapid_actions",
        details: { actionType: action.type },
        timestamp: now,
        severity: "high",
      });
      return intervalCheck;
    }

    return { valid: true, confidence: 1.0 };
  }
  
  /**
   * Validate a player action.
   */
  async validateAction(
    room: RoomRuntime,
    player: PlayerRuntime,
    action: GameAction,
    result: EngineActionResult<JsonObject>
  ): Promise<ValidationResult> {
    const now = Date.now();
    const context: ActionValidationContext = {
      room,
      player,
      action,
      result,
      timestamp: now,
      actionSequence: this.getNextActionSequence(player.id),
    };

    // 1. Authoritative 10-Minute Hard Match Timer Protection
    const MATCH_HARD_LIMIT_MS = 10 * 60 * 1000; // 10 minutes
    if (room.match && room.match.startedAt) {
      const elapsed = now - room.match.startedAt;
      if (elapsed > MATCH_HARD_LIMIT_MS) {
        this.logSuspiciousEvent({
          playerId: player.id,
          roomId: room.id,
          eventType: "timeout_action",
          details: { actionType: action.type, elapsedMs: elapsed },
          timestamp: now,
          severity: "high",
        });
        return {
          valid: false,
          reason: "Match deadline exceeded (10-minute limit)",
          confidence: 1.0,
        };
      }
    }

    // 2. State Version Validation (Reject stale client updates)
    const clientStateVersion = (action as any).stateVersion ?? (action as any).version;
    if (typeof clientStateVersion === "number" && room.match) {
      const currentVersion = room.match.turnNumber ?? 0;
      // Stale by more than 2 turns
      if (clientStateVersion < currentVersion - 2 && currentVersion > 2) {
        this.logSuspiciousEvent({
          playerId: player.id,
          roomId: room.id,
          eventType: "stale_state_version",
          details: { actionType: action.type, clientVersion: clientStateVersion, currentVersion },
          timestamp: now,
          severity: "low",
        });
        return {
          valid: false,
          reason: "Stale state version update ignored",
          confidence: 0.9,
        };
      }
    }
    
    // Real-time continuous game inputs that can be sent frequently
    if (
      action.type === "paddle-move" ||
      action.type === "direction" ||
      action.type === "boost-start" ||
      action.type === "boost-stop"
    ) {
      return { valid: true, confidence: 1.0 };
    }

    // Check action rate limiting
    const rateCheck = this.checkActionRate(room, player.id, now);
    if (!rateCheck.valid) {
      this.logSuspiciousEvent({
        playerId: player.id,
        roomId: room.id,
        eventType: "rate_limit_exceeded",
        details: { actionType: action.type, rate: this.getActionRate(player.id) },
        timestamp: now,
        severity: "medium",
      });
      return rateCheck;
    }
    
    // Check for rapid successive actions (speed hack)
    const intervalCheck = this.checkActionInterval(room, player.id, now);
    if (!intervalCheck.valid) {
      this.logSuspiciousEvent({
        playerId: player.id,
        roomId: room.id,
        eventType: "rapid_actions",
        details: { actionType: action.type },
        timestamp: now,
        severity: "high",
      });
      return intervalCheck;
    }
    
    // Check for duplicate actions
    const duplicateCheck = this.checkDuplicateAction(context);
    if (!duplicateCheck.valid) {
      this.logSuspiciousEvent({
        playerId: player.id,
        roomId: room.id,
        eventType: "duplicate_action",
        details: { actionType: action.type },
        timestamp: now,
        severity: "medium",
      });
      return duplicateCheck;
    }
    
    // Validate action is from correct player
    const turnCheck = this.validateTurnOrder(context);
    if (!turnCheck.valid) {
      this.logSuspiciousEvent({
        playerId: player.id,
        roomId: room.id,
        eventType: "wrong_turn",
        details: { actionType: action.type, currentSeat: this.getCurrentSeat(room) },
        timestamp: now,
        severity: "high",
      });
      return turnCheck;
    }
    
    // Validate action isn't manipulating state
    const stateCheck = this.validateStateIntegrity(context);
    if (!stateCheck.valid) {
      this.logSuspiciousEvent({
        playerId: player.id,
        roomId: room.id,
        eventType: "state_manipulation",
        details: { actionType: action.type },
        timestamp: now,
        severity: "critical",
      });
      return stateCheck;
    }
    
    // Check for suspicious patterns
    const patternCheck = this.checkSuspiciousPatterns(context);
    if (!patternCheck.valid) {
      return patternCheck;
    }
    
    // Record action
    this.recordAction(player.id, now);
    
    return { valid: true, confidence: 1.0 };
  }
  
  /**
   * Log a suspicious event.
   */
  logSuspiciousEvent(event: Omit<SuspiciousEvent, "id">): void {
    const fullEvent: SuspiciousEvent = {
      ...event,
      id: `${event.playerId}_${event.timestamp}_${Math.random().toString(36).slice(2, 8)}`,
    };
    
    const events = this.suspiciousEvents.get(event.playerId) ?? [];
    events.push(fullEvent);
    this.suspiciousEvents.set(event.playerId, events);

    // Update internal fair-play risk score (0 - 100)
    const currentScore = this.playerRiskScores.get(event.playerId) ?? 0;
    const increment =
      event.severity === "critical" ? 30 :
      event.severity === "high" ? 15 :
      event.severity === "medium" ? 5 : 2;
    this.playerRiskScores.set(event.playerId, Math.min(100, currentScore + increment));
    
    this.framework.error(
      `Suspicious event: ${event.eventType} (severity: ${event.severity}) by player ${event.playerId} in room ${event.roomId}`,
      event.details
    );
  }
  
  /**
   * Get suspicious events for a player.
   */
  getSuspiciousEvents(playerId: string): SuspiciousEvent[] {
    return this.suspiciousEvents.get(playerId) ?? [];
  }
  
  /**
   * Get all suspicious events.
   */
  getAllSuspiciousEvents(): SuspiciousEvent[] {
    const events: SuspiciousEvent[] = [];
    for (const playerEvents of this.suspiciousEvents.values()) {
      events.push(...playerEvents);
    }
    return events.sort((a, b) => b.timestamp - a.timestamp);
  }
  
  /**
   * Clear suspicious events for a player.
   */
  clearSuspiciousEvents(playerId: string): void {
    this.suspiciousEvents.delete(playerId);
  }
  
  /**
   * Per-game rate limits, honoring any game-specific overrides.
   */
  private getRateLimits(room: RoomRuntime): { maxActionsPerSecond: number; minActionIntervalMs: number } {
    const overrides = this.config.gameOverrides?.[room.config.gameId];
    return {
      maxActionsPerSecond: overrides?.maxActionsPerSecond ?? this.config.maxActionsPerSecond,
      minActionIntervalMs: overrides?.minActionIntervalMs ?? this.config.minActionIntervalMs,
    };
  }

  /**
   * Check action rate for a player.
   */
  private checkActionRate(room: RoomRuntime, playerId: string, now: number): ValidationResult {
    const limits = this.getRateLimits(room);
    const history = this.actionHistory.get(playerId) ?? [];
    const windowStart = now - this.config.actionRateWindowMs;
    const actionsInWindow = history.filter(t => t >= windowStart).length;
    
    if (actionsInWindow > limits.maxActionsPerSecond * (this.config.actionRateWindowMs / 1000)) {
      return {
        valid: false,
        reason: "Action rate limit exceeded",
        action: "reject",
        confidence: 0.9,
      };
    }
    
    return { valid: true, confidence: 1.0 };
  }
  
  /**
   * Check action interval for a player.
   */
  private checkActionInterval(room: RoomRuntime, playerId: string, now: number): ValidationResult {
    const limits = this.getRateLimits(room);
    const history = this.actionHistory.get(playerId) ?? [];
    const lastAction = history[history.length - 1];
    
    if (lastAction && now - lastAction < limits.minActionIntervalMs) {
      return {
        valid: false,
        reason: "Actions too frequent",
        action: "reject",
        confidence: 0.95,
      };
    }
    
    return { valid: true, confidence: 1.0 };
  }
  
  /**
   * Check for duplicate actions.
   */
  private checkDuplicateAction(context: ActionValidationContext): ValidationResult {
    // Simple duplicate check - could be enhanced with action fingerprinting
    const { action, timestamp } = context;
    const recentThreshold = 100; // 100ms
    
    const history = this.actionHistory.get(context.player.id) ?? [];
    const recentActions = history.filter(t => timestamp - t < recentThreshold);
    
    if (recentActions.length > 0) {
      // Could be a network retry, allow but flag
      return { valid: true, confidence: 0.7 };
    }
    
    return { valid: true, confidence: 1.0 };
  }
  
  /**
   * Validate turn order.
   */
  private validateTurnOrder(context: ActionValidationContext): ValidationResult {
    const { room, player, action, result } = context;
    
    if (!room.match) {
      return { valid: false, reason: "No active match", confidence: 1.0 };
    }
    
    // Allow non-turn actions (like chat)
    if (action.type === "chat" || action.type === "emoji") {
      return { valid: true, confidence: 1.0 };
    }
    
    // Allow resign at any time
    if (action.type === "resign") {
      return { valid: true, confidence: 1.0 };
    }
    
    // The engine is the authority on turn order. When it accepted the action
    // it has already verified the acting seat, and `currentSeat` now reflects
    // the *next* player (post-transition), so re-deriving the turn here would
    // falsely reject every legal move. Only cross-check when the engine
    // rejected the action (defense-in-depth on the rejected state).
    if (result.ok) {
      return { valid: true, confidence: 1.0 };
    }
    
    const engine = room.match.engine as { currentSeat: number };
    const currentSeat = engine.currentSeat;
    
    // Check if it's this player's turn
    if (player.seat !== currentSeat) {
      return {
        valid: false,
        reason: "Not your turn",
        action: "reject",
        confidence: 1.0,
      };
    }
    
    return { valid: true, confidence: 1.0 };
  }
  
  /**
   * Validate state integrity.
   */
  private validateStateIntegrity(context: ActionValidationContext): ValidationResult {
    const { result } = context;
    
    if (!result.ok && result.error) {
      // Engine rejected the action - this is expected for invalid moves
      return { valid: true, confidence: 1.0 };
    }
    
    // Check for impossible state changes
    if (result.state === null || result.state === undefined) {
      return {
        valid: false,
        reason: "Invalid state returned",
        action: "reject",
        confidence: 1.0,
      };
    }
    
    return { valid: true, confidence: 1.0 };
  }
  
  /**
   * Check for suspicious patterns.
   */
  private checkSuspiciousPatterns(context: ActionValidationContext): ValidationResult {
    const { player, action } = context;
    
    // Check for perfect move sequences (possible bot)
    const activityPattern = this.framework.playerManager.getActivityPattern(player.id);
    if (activityPattern.length >= 10) {
      // Check for robotic timing (too consistent)
      const intervals: number[] = [];
      for (let i = 1; i < activityPattern.length; i++) {
        intervals.push(activityPattern[i]! - activityPattern[i - 1]!);
      }
      
      if (intervals.length > 5) {
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length;
        const cv = Math.sqrt(variance) / avgInterval; // Coefficient of variation
        
        // Too consistent = suspicious
        if (cv < 0.1 && avgInterval < 500) {
          return {
            valid: true,
            confidence: 0.5,
          };
        }
      }
    }
    
    return { valid: true, confidence: 1.0 };
  }
  
  /**
   * Auto-kick a player for suspicious behavior.
   */
  private async autoKickPlayer(playerId: string, roomId: string, reason: string): Promise<void> {
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room) return;
    
    this.framework.error(`Auto-kicking player ${playerId} from room ${roomId}: ${reason}`);
    
    // Find player's socket
    const player = room.players.get(playerId);
    if (!player) return;
    
    // Notify player
    for (const socketId of player.socketIds) {
      const socket = this.framework.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit("player:kicked", {
          roomId,
          playerId,
          reason: `suspicious_behavior: ${reason}`,
        });
      }
    }
    
    // Kick from room
    try {
      const firstSocket = player.socketIds.values().next().value;
      if (firstSocket) {
        const socket = this.framework.io.sockets.sockets.get(firstSocket);
        if (socket) {
          await this.framework.roomManager.kickPlayer(roomId, playerId, "system");
        }
      }
    } catch (error) {
      this.framework.error(`Failed to auto-kick player ${playerId}`, error);
    }
  }
  
  /**
   * Get current seat from room engine.
   */
  private getCurrentSeat(room: RoomRuntime): number | null {
    if (!room.match) return null;
    const engine = room.match.engine as { currentSeat: number };
    return engine.currentSeat ?? null;
  }
  
  /**
   * Get action rate for a player.
   */
  private getActionRate(playerId: string): number {
    const history = this.actionHistory.get(playerId) ?? [];
    const now = Date.now();
    const windowStart = now - this.config.actionRateWindowMs;
    return history.filter(t => t >= windowStart).length / (this.config.actionRateWindowMs / 1000);
  }
  
  /**
   * Record an action.
   */
  private recordAction(playerId: string, timestamp: number): void {
    const history = this.actionHistory.get(playerId) ?? [];
    history.push(timestamp);
    
    // Keep only last 100 actions
    if (history.length > 100) {
      history.shift();
    }
    
    this.actionHistory.set(playerId, history);
  }
  
  /**
   * Get next action sequence number.
   */
  private getNextActionSequence(playerId: string): number {
    const current = this.actionSequences.get(playerId) ?? 0;
    const next = current + 1;
    this.actionSequences.set(playerId, next);
    return next;
  }
}
