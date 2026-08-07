/**
 * Replay Manager
 * 
 * Records and manages game replays for playback.
 * 
 * Key features:
 * - Record every event
 * - Store game state snapshots
 * - Replay controls (play, pause, fast forward, rewind)
 * - Export replay data
 * - Resume from replay
 */

import { randomUUID } from "node:crypto";
import type { MultiplayerFramework } from "../framework";
import type {
  RoomRuntime,
  RoomId,
  RecordedAction,
  GameEvent,
  StateSnapshot,
} from "../types";
import type { EngineInstance } from "@gaming-hub/game-engine";

export interface ReplayMetadata {
  id: string;
  roomId: string;
  gameId: string;
  players: { id: string; username: string; seat: number }[];
  startedAt: number;
  finishedAt: number;
  winnerSeats: number[];
  actionCount: number;
  durationMs: number;
}

export interface ReplayData {
  metadata: ReplayMetadata;
  initialState: Record<string, unknown>;
  actions: RecordedAction[];
  snapshots: StateSnapshot[];
}

export interface ReplaySession {
  replayId: string;
  currentTurn: number;
  isPlaying: boolean;
  playbackSpeed: number;
  lastUpdateAt: number;
}

export class ReplayManager {
  private readonly framework: MultiplayerFramework;
  private readonly replays = new Map<string, ReplayData>();
  private readonly activeReplays = new Map<string, ReplaySession>();
  private readonly replayTimers = new Map<string, NodeJS.Timeout>();
  
  constructor(framework: MultiplayerFramework) {
    this.framework = framework;
  }
  
  async initialize(): Promise<void> {
    this.framework.log("ReplayManager initialized");
  }
  
  async shutdown(): Promise<void> {
    // Clear all replay timers
    for (const timer of this.replayTimers.values()) {
      clearTimeout(timer);
    }
    this.replayTimers.clear();
    this.activeReplays.clear();
    this.replays.clear();
  }
  
  /**
   * Start recording a replay for a room.
   */
  startRecording(room: RoomRuntime): string {
    const replayId = randomUUID();
    
    const metadata: ReplayMetadata = {
      id: replayId,
      roomId: room.id,
      gameId: room.config.gameId,
      players: [...room.players.values()].map(p => ({
        id: p.id,
        username: p.username,
        seat: p.seat ?? 0,
      })),
      startedAt: Date.now(),
      finishedAt: 0,
      winnerSeats: [],
      actionCount: 0,
      durationMs: 0,
    };
    
    const replayData: ReplayData = {
      metadata,
      initialState: (room.match?.engine as EngineInstance | undefined)?.serialize() ?? {},
      actions: [],
      snapshots: [],
    };
    
    this.replays.set(replayId, replayData);
    
    this.framework.log(`Started recording replay ${replayId} for room ${room.id}`);
    
    return replayId;
  }
  
  /**
   * Record an action in the replay.
   */
  recordAction(room: RoomRuntime, action: RecordedAction): void {
    if (!this.framework.config.enableReplay) return;
    
    // Find or create replay for this room
    let replay = [...this.replays.values()].find(r => r.metadata.roomId === room.id);
    
    if (!replay) {
      // Auto-start recording if not exists
      const replayId = this.startRecording(room);
      replay = this.replays.get(replayId)!;
    }
    
    // Record action
    replay.actions.push(action);
    replay.metadata.actionCount = replay.actions.length;
  }
  
  /**
   * Record a state snapshot.
   */
  recordSnapshot(room: RoomRuntime, snapshot: StateSnapshot): void {
    if (!this.framework.config.enableReplay) return;
    
    const replay = [...this.replays.values()].find(r => r.metadata.roomId === room.id);
    if (!replay) return;
    
    replay.snapshots.push(snapshot);
  }
  
  /**
   * Finalize a replay when match ends.
   */
  async finalizeReplay(room: RoomRuntime): Promise<string | null> {
    const replay = [...this.replays.values()].find(r => r.metadata.roomId === room.id);
    if (!replay) return null;
    
    replay.metadata.finishedAt = Date.now();
    replay.metadata.durationMs = replay.metadata.finishedAt - replay.metadata.startedAt;
    replay.metadata.winnerSeats = room.match?.winnerSeats ?? [];
    
    this.framework.log(`Finalized replay ${replay.metadata.id} with ${replay.metadata.actionCount} actions`);
    
    // In a real implementation, this would persist to database
    // await persistReplay(replay);
    
    return replay.metadata.id;
  }
  
  /**
   * Get replay data by ID.
   */
  getReplay(replayId: string): ReplayData | undefined {
    return this.replays.get(replayId);
  }
  
  /**
   * Start replay playback.
   */
  startPlayback(replayId: string, startTurn = 0): ReplaySession {
    const replay = this.replays.get(replayId);
    if (!replay) throw new Error("Replay not found");
    
    const session: ReplaySession = {
      replayId,
      currentTurn: startTurn,
      isPlaying: false,
      playbackSpeed: 1,
      lastUpdateAt: Date.now(),
    };
    
    this.activeReplays.set(replayId, session);
    
    return session;
  }
  
  /**
   * Play replay.
   */
  play(replayId: string): void {
    const session = this.activeReplays.get(replayId);
    if (!session) return;
    
    session.isPlaying = true;
    this.scheduleReplayTick(replayId);
  }
  
  /**
   * Pause replay.
   */
  pause(replayId: string): void {
    const session = this.activeReplays.get(replayId);
    if (!session) return;
    
    session.isPlaying = false;
    
    const timer = this.replayTimers.get(replayId);
    if (timer) {
      clearTimeout(timer);
      this.replayTimers.delete(replayId);
    }
  }
  
  /**
   * Fast forward replay.
   */
  fastForward(replayId: string, turns: number): void {
    const session = this.activeReplays.get(replayId);
    if (!session) return;
    
    const replay = this.replays.get(replayId);
    if (!replay) return;
    
    session.currentTurn = Math.min(
      session.currentTurn + turns,
      replay.actions.length
    );
  }
  
  /**
   * Rewind replay.
   */
  rewind(replayId: string, turns: number): void {
    const session = this.activeReplays.get(replayId);
    if (!session) return;
    
    session.currentTurn = Math.max(0, session.currentTurn - turns);
  }
  
  /**
   * Seek to specific turn in replay.
   */
  seek(replayId: string, turn: number): void {
    const session = this.activeReplays.get(replayId);
    if (!session) return;
    
    const replay = this.replays.get(replayId);
    if (!replay) return;
    
    session.currentTurn = Math.max(0, Math.min(turn, replay.actions.length));
  }
  
  /**
   * Set playback speed.
   */
  setPlaybackSpeed(replayId: string, speed: number): void {
    const session = this.activeReplays.get(replayId);
    if (!session) return;
    
    session.playbackSpeed = Math.max(0.25, Math.min(4, speed));
  }
  
  /**
   * Get current replay state.
   */
  getCurrentState(replayId: string): { turn: number; state: Record<string, unknown> | null } {
    const replay = this.replays.get(replayId);
    const session = this.activeReplays.get(replayId);
    
    if (!replay || !session) {
      return { turn: 0, state: null };
    }
    
    // Find snapshot closest to current turn
    const snapshot = replay.snapshots
      .filter(s => s.turnNumber <= session.currentTurn)
      .sort((a, b) => b.turnNumber - a.turnNumber)[0];
    
    return {
      turn: session.currentTurn,
      state: snapshot?.state ?? replay.initialState,
    };
  }
  
  /**
   * Export replay data.
   */
  exportReplay(replayId: string): string {
    const replay = this.replays.get(replayId);
    if (!replay) throw new Error("Replay not found");
    
    return JSON.stringify(replay, null, 2);
  }
  
  /**
   * Get all replays for a room.
   */
  getReplaysForRoom(roomId: RoomId): ReplayData[] {
    return [...this.replays.values()].filter(r => r.metadata.roomId === roomId);
  }
  
  /**
   * Schedule replay tick.
   */
  private scheduleReplayTick(replayId: string): void {
    const session = this.activeReplays.get(replayId);
    if (!session || !session.isPlaying) return;
    
    const replay = this.replays.get(replayId);
    if (!replay) return;
    
    if (session.currentTurn >= replay.actions.length) {
      // End of replay
      session.isPlaying = false;
      return;
    }
    
    // Calculate delay based on actual action timestamps
    const currentAction = replay.actions[session.currentTurn];
    const nextAction = replay.actions[session.currentTurn + 1];
    
    let delayMs = 1000; // Default 1 second
    
    if (currentAction && nextAction) {
      delayMs = (nextAction.timestamp - currentAction.timestamp) / session.playbackSpeed;
    }
    
    const timer = setTimeout(() => {
      session.currentTurn++;
      this.scheduleReplayTick(replayId);
    }, Math.max(100, delayMs));
    
    this.replayTimers.set(replayId, timer);
  }
  
  /**
   * Delete a replay.
   */
  deleteReplay(replayId: string): void {
    // Stop playback if active
    this.pause(replayId);
    this.activeReplays.delete(replayId);
    this.replays.delete(replayId);
  }
}
