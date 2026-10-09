/**
 * Timer Manager
 * 
 * Manages all timers including turn timers, match timers, reconnect timers,
 * AFK timers, lobby timers, and pause timers.
 * 
 * Key features:
 * - Centralized timer management
 * - Multiple timer types
 * - Pause/resume support
 * - Timer expiration callbacks
 * - Clock synchronization
 */

import type { MultiplayerFramework } from "../framework";
import type {
  RoomRuntime,
  RoomId,
  PlayerId,
  TimerState,
  TimerConfig,
} from "../types";

export type TimerType = "turn" | "match" | "reconnect" | "afk" | "lobby" | "pause";

export interface TimerInfo {
  type: TimerType;
  roomId: RoomId;
  playerId?: PlayerId;
  startedAt: number;
  expiresAt: number;
  remainingMs: number;
  isPaused: boolean;
}

export class TimerManager {
  private readonly framework: MultiplayerFramework;
  private readonly timers = new Map<string, TimerState>();
  private readonly timerCallbacks = new Map<string, () => void>();
  private readonly timerHandles = new Map<string, NodeJS.Timeout>();
  
  constructor(framework: MultiplayerFramework) {
    this.framework = framework;
  }
  
  async initialize(): Promise<void> {
    this.framework.log("TimerManager initialized");
  }
  
  async shutdown(): Promise<void> {
    // Clear all timers
    for (const handle of this.timerHandles.values()) {
      clearTimeout(handle);
    }
    this.timerHandles.clear();
    this.timers.clear();
    this.timerCallbacks.clear();
  }
  
  getMemoryStats() { return { matchTimers: this.timerHandles.size }; }

  /**
   * Start a timer.
   */
  startTimer(
    roomId: RoomId,
    type: TimerType,
    durationMs: number,
    callback: () => void,
    playerId?: PlayerId
  ): string {
    const timerId = this.getTimerId(roomId, type, playerId);
    
    // Clear existing timer
    this.clearTimer(timerId);
    
    const now = Date.now();
    const timer: TimerState = {
      type,
      startedAt: now,
      expiresAt: now + durationMs,
      pausedAt: null,
      remainingWhenPaused: null,
      ownerSeat: playerId ? this.getPlayerSeat(roomId, playerId) : null,
    };
    
    const scheduledRoom = this.framework.roomManager.getRoom(roomId);
    this.timers.set(timerId, timer);
    this.timerCallbacks.set(timerId, this.framework.config.executeRoomTask
      ? () => { void this.framework.config.executeRoomTask!(roomId, async () => { if (this.framework.roomManager.getRoom(roomId) === scheduledRoom) await callback(); }, true)
        .catch(error => this.framework.error('Timer owner unavailable', error)); }
      : callback);
    
    // Schedule expiration
    const handle = setTimeout(() => {
      this.handleTimerExpiry(timerId);
    }, durationMs);
    
    this.timerHandles.set(timerId, handle);
    
    this.framework.log(`Started ${type} timer for room ${roomId}${playerId ? ` player ${playerId}` : ""} (${durationMs}ms)`);
    
    return timerId;
  }
  
  /**
   * Pause a timer.
   */
  pauseTimer(timerId: string): void {
    const timer = this.timers.get(timerId);
    if (!timer || timer.pausedAt) return;
    
    timer.pausedAt = Date.now();
    timer.remainingWhenPaused = timer.expiresAt - Date.now();
    
    // Clear the timeout
    const handle = this.timerHandles.get(timerId);
    if (handle) {
      clearTimeout(handle);
      this.timerHandles.delete(timerId);
    }
    
    this.framework.log(`Paused timer ${timerId}`);
  }
  
  /**
   * Resume a timer.
   */
  resumeTimer(timerId: string): void {
    const timer = this.timers.get(timerId);
    if (!timer || !timer.pausedAt || !timer.remainingWhenPaused) return;
    
    const remainingMs = timer.remainingWhenPaused;
    timer.expiresAt = Date.now() + remainingMs;
    timer.pausedAt = null;
    timer.remainingWhenPaused = null;
    
    // Reschedule
    const callback = this.timerCallbacks.get(timerId);
    if (callback) {
      const handle = setTimeout(() => {
        this.handleTimerExpiry(timerId);
      }, remainingMs);
      
      this.timerHandles.set(timerId, handle);
    }
    
    this.framework.log(`Resumed timer ${timerId} (${remainingMs}ms remaining)`);
  }
  
  /**
   * Clear a timer.
   */
  clearTimer(timerId: string): void {
    const handle = this.timerHandles.get(timerId);
    if (handle) {
      clearTimeout(handle);
      this.timerHandles.delete(timerId);
    }
    
    this.timers.delete(timerId);
    this.timerCallbacks.delete(timerId);
  }
  
  /**
   * Clear all timers for a room.
   */
  clearRoomTimers(roomId: RoomId): void {
    for (const timerId of new Set([...this.timers.keys(), ...this.timerHandles.keys()])) {
      if (timerId.startsWith(`${roomId}:`)) {
        this.clearTimer(timerId);
      }
    }
  }
  
  /**
   * Clear all timers for a player in a room.
   */
  clearPlayerTimers(roomId: RoomId, playerId: PlayerId): void {
    for (const [timerId, timer] of this.timers) {
      if (timerId.startsWith(`${roomId}:`) && timerId.includes(`:${playerId}`)) {
        this.clearTimer(timerId);
      }
    }
  }
  
  checkpointReconnectTimers(roomId: string): Array<{ playerId: string; expiresAt: number }> {
    return [...this.timers.entries()].filter(([id, t]) => id.startsWith(`${roomId}:`) && t.type === 'reconnect')
      .map(([id, t]) => ({ playerId: id.split(':')[2]!, expiresAt: t.expiresAt }));
  }

  /**
   * Get remaining time for a timer.
   */
  getRemainingTime(timerId: string): number {
    const timer = this.timers.get(timerId);
    if (!timer) return 0;
    
    if (timer.pausedAt && timer.remainingWhenPaused) {
      return timer.remainingWhenPaused;
    }
    
    return Math.max(0, timer.expiresAt - Date.now());
  }
  
  /**
   * Get timer info.
   */
  getTimerInfo(timerId: string): TimerInfo | null {
    const timer = this.timers.get(timerId);
    if (!timer) return null;
    
    return {
      type: timer.type,
      roomId: timerId.split(":")[0] ?? "",
      playerId: timerId.split(":")[2],
      startedAt: timer.startedAt,
      expiresAt: timer.expiresAt,
      remainingMs: this.getRemainingTime(timerId),
      isPaused: !!timer.pausedAt,
    };
  }
  
  /**
   * Schedule clock check for a room.
   */
  scheduleClockCheck(room: RoomRuntime, callback: () => void): void {
    if (!room.match) return;
    
    const engine = room.match.engine as { currentClockDeadline?: number | null; currentMatchDeadline?: number | null };
    
    if (!engine.currentClockDeadline && !engine.currentMatchDeadline) return;
    
    const now = Date.now();
    let nextDeadline = Infinity;
    let deadlineType: "turn" | "match" = "turn";
    
    const turnDeadline = engine.currentClockDeadline;
    if (turnDeadline != null && turnDeadline > 0 && turnDeadline < nextDeadline) {
      nextDeadline = turnDeadline;
      deadlineType = "turn";
    }
    
    const matchDeadline = engine.currentMatchDeadline;
    if (matchDeadline != null && matchDeadline > 0 && matchDeadline < nextDeadline) {
      nextDeadline = matchDeadline;
      deadlineType = "match";
    }
    
    if (nextDeadline === Infinity) return;
    
    // Clamp so an already-passed deadline still fires immediately instead of
    // being dropped (the handler re-validates against the engine's state).
    const delay = Math.max(0, nextDeadline - now);
    
    // Clear existing clock timer
    this.clearTimer(`${room.id}:clock`);
    
    const timer = setTimeout(() => {
      callback();
    }, delay + 50); // Add small buffer
    
    this.timerHandles.set(`${room.id}:clock`, timer);
    
    this.framework.log(`Scheduled clock check for room ${room.id} in ${delay}ms (${deadlineType})`);
  }
  
  /**
   * Get turn timer config.
   */
  getTurnTimerConfig(roomId: RoomId): TimerConfig | null {
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room) return null;
    
    return {
      durationMs: room.config.settings.turnTimerDurationMs ?? 30000,
      warningThresholdMs: Math.floor((room.config.settings.turnTimerDurationMs ?? 30000) * 0.25),
      autoExecuteOnExpiry: false,
    };
  }
  
  /**
   * Get match timer config.
   */
  getMatchTimerConfig(roomId: RoomId): TimerConfig | null {
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room) return null;
    
    return {
      durationMs: room.config.settings.matchTimerDurationMs ?? 600000,
      warningThresholdMs: Math.floor((room.config.settings.matchTimerDurationMs ?? 600000) * 0.1),
      autoExecuteOnExpiry: false,
    };
  }
  
  /**
   * Start reconnect timer.
   */
  startReconnectTimer(roomId: RoomId, playerId: PlayerId, callback: () => void): string {
    const room = this.framework.roomManager.getRoom(roomId);
    const gracePeriod = room?.config.settings.reconnectGracePeriodMs ?? this.framework.config.reconnectGracePeriodMs;
    
    return this.startTimer(roomId, "reconnect", gracePeriod, callback, playerId);
  }
  
  /**
   * Start AFK timer.
   */
  startAfkTimer(roomId: RoomId, playerId: PlayerId, callback: () => void): string {
    const room = this.framework.roomManager.getRoom(roomId);
    const afkTimeout = room?.config.settings.afkTimeoutMs ?? this.framework.config.afkTimeoutMs;
    
    return this.startTimer(roomId, "afk", afkTimeout, callback, playerId);
  }
  
  /**
   * Handle timer expiry.
   */
  private handleTimerExpiry(timerId: string): void {
    const callback = this.timerCallbacks.get(timerId);
    if (callback) {
      try {
        callback();
      } catch (error) {
        this.framework.error(`Timer callback error for ${timerId}`, error);
      }
    }
    
    // Clean up
    this.timers.delete(timerId);
    this.timerCallbacks.delete(timerId);
    this.timerHandles.delete(timerId);
    
    this.framework.log(`Timer expired: ${timerId}`);
  }
  
  /**
   * Get player seat in room.
   */
  private getPlayerSeat(roomId: RoomId, playerId: PlayerId): number | null {
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room) return null;
    
    const player = room.players.get(playerId);
    return player?.seat ?? null;
  }
  
  /**
   * Get timer ID.
   */
  private getTimerId(roomId: RoomId, type: TimerType, playerId?: PlayerId): string {
    return playerId ? `${roomId}:${type}:${playerId}` : `${roomId}:${type}`;
  }
}
