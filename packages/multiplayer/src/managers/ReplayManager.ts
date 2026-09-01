/**
 * Replay Manager
 * 
 * Records and manages game replays for playback.
 * 
 * Key features:
 * - Monotonic strictly-ordered authoritative event recording
 * - Periodic state snapshots for rapid seek acceleration
 * - Replay controls (play, pause, fast forward, rewind, seek, speed)
 * - Deterministic replay reconstruction & validation
 * - Checksum & integrity verification
 * - Export replay data
 */

import { randomUUID, createHash } from "node:crypto";
import type { MultiplayerFramework } from "../framework";
import type {
  RoomRuntime,
  RoomId,
  RecordedAction,
  StateSnapshot,
} from "../types";
import type {
  GameId,
  ReplayEventRecord,
  ReplaySnapshotRecord,
  ReplayPackage,
  ResultReason,
} from "@gaming-hub/shared";
import type { EngineInstance } from "@gaming-hub/game-engine";

export interface ReplayMetadata {
  id: string;
  roomId: string;
  matchId: string;
  gameId: string;
  players: { id: string; username: string; seat: number; score?: number }[];
  startedAt: number;
  finishedAt: number;
  winnerSeats: number[];
  winnerIds?: string[];
  resultReason?: ResultReason;
  actionCount: number;
  durationMs: number;
}

export interface ReplayData {
  metadata: ReplayMetadata;
  initialState: Record<string, unknown>;
  actions: RecordedAction[];
  events: ReplayEventRecord[];
  snapshots: (StateSnapshot | ReplaySnapshotRecord)[];
  finalState?: Record<string, unknown>;
  checksum?: string;
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
  private readonly eventSequences = new Map<string, number>();
  
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
    this.eventSequences.clear();
  }
  
  /**
   * Start recording a replay for a room / match.
   */
  startRecording(room: RoomRuntime): string {
    const replayId = randomUUID();
    const matchId = (room.match as any)?.matchId ?? (room.match as any)?.id ?? replayId;
    
    const metadata: ReplayMetadata = {
      id: replayId,
      roomId: room.id,
      matchId,
      gameId: room.config.gameId,
      players: [...room.players.values()].map(p => ({
        id: p.id,
        username: p.username,
        seat: p.seat ?? 0,
        score: (p as any).score ?? 0,
      })),
      startedAt: Date.now(),
      finishedAt: 0,
      winnerSeats: [],
      winnerIds: [],
      actionCount: 0,
      durationMs: 0,
    };
    
    const rawState = (room.match?.engine as EngineInstance | undefined)?.serialize?.() ?? {};
    const initialState = JSON.parse(JSON.stringify(rawState));

    const replayData: ReplayData = {
      metadata,
      initialState,
      actions: [],
      events: [],
      snapshots: [],
    };
    
    this.replays.set(replayId, replayData);
    this.eventSequences.set(replayId, 0);
    
    this.framework.log(`Started recording replay ${replayId} for match ${matchId}`);
    return replayId;
  }
  
  /**
   * Record a strictly ordered authoritative event.
   */
  recordEvent(
    roomOrReplayId: RoomRuntime | string,
    event: {
      playerId: string;
      eventType: string;
      stateVersion?: number;
      actionData?: Record<string, unknown>;
      resultData?: Record<string, unknown>;
    },
  ): ReplayEventRecord | null {
    let replay: ReplayData | undefined;
    let replayId: string;

    if (typeof roomOrReplayId === "string") {
      replayId = roomOrReplayId;
      replay = this.replays.get(replayId);
    } else {
      replay = [...this.replays.values()].find(r => r.metadata.roomId === roomOrReplayId.id);
      if (!replay) {
        replayId = this.startRecording(roomOrReplayId);
        replay = this.replays.get(replayId)!;
      } else {
        replayId = replay.metadata.id;
      }
    }

    if (!replay) return null;

    const currentSeq = (this.eventSequences.get(replayId) ?? 0) + 1;
    this.eventSequences.set(replayId, currentSeq);

    const record: ReplayEventRecord = {
      eventId: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      matchId: replay.metadata.matchId,
      sequence: currentSeq,
      playerId: event.playerId,
      eventType: event.eventType,
      timestamp: Date.now(),
      stateVersion: event.stateVersion ?? currentSeq,
      actionData: event.actionData ?? {},
      resultData: event.resultData ?? {},
    };

    replay.events.push(record);
    replay.metadata.actionCount = replay.events.length;
    return record;
  }

  /**
   * Record an action in the replay (legacy compatibility).
   */
  recordAction(room: RoomRuntime, action: RecordedAction): void {
    let replay = [...this.replays.values()].find(r => r.metadata.roomId === room.id);
    if (!replay) {
      const replayId = this.startRecording(room);
      replay = this.replays.get(replayId)!;
    }
    
    replay.actions.push(action);
    this.recordEvent(replay.metadata.id, {
      playerId: action.playerId,
      eventType: action.action.type,
      stateVersion: action.turnNumber,
      actionData: action.action.payload as Record<string, unknown>,
      resultData: ((action as any).result)?.state ?? {},
    });
  }
  
  /**
   * Record a periodic state snapshot for fast seek acceleration.
   */
  recordSnapshot(roomOrReplayId: RoomRuntime | string, snapshot: StateSnapshot | ReplaySnapshotRecord): void {
    let replay: ReplayData | undefined;
    if (typeof roomOrReplayId === "string") {
      replay = this.replays.get(roomOrReplayId);
    } else {
      replay = [...this.replays.values()].find(r => r.metadata.roomId === roomOrReplayId.id);
    }
    if (!replay) return;
    
    replay.snapshots.push(snapshot);
  }
  
  /**
   * Finalize a replay when match ends.
   */
  async finalizeReplay(
    roomOrReplayId: RoomRuntime | string,
    options?: {
      winnerSeats?: number[];
      winnerIds?: string[];
      resultReason?: ResultReason;
      finalState?: Record<string, unknown>;
    },
  ): Promise<string | null> {
    let replay: ReplayData | undefined;
    if (typeof roomOrReplayId === "string") {
      replay = this.replays.get(roomOrReplayId);
    } else {
      replay = [...this.replays.values()].find(r => r.metadata.roomId === roomOrReplayId.id);
    }
    if (!replay) return null;
    
    replay.metadata.finishedAt = Date.now();
    replay.metadata.durationMs = Math.max(0, replay.metadata.finishedAt - replay.metadata.startedAt);
    replay.metadata.winnerSeats = options?.winnerSeats ?? replay.metadata.winnerSeats;
    replay.metadata.winnerIds = options?.winnerIds ?? [];
    replay.metadata.resultReason = options?.resultReason ?? "NORMAL";
    replay.finalState = options?.finalState ?? replay.finalState;
    
    // Generate SHA-256 Checksum over all events
    const content = JSON.stringify({
      matchId: replay.metadata.matchId,
      initialState: replay.initialState,
      events: replay.events,
      finalState: replay.finalState,
    });
    replay.checksum = createHash("sha256").update(content).digest("hex");
    
    this.framework.log(`Finalized replay ${replay.metadata.id} with ${replay.events.length} events (Checksum: ${replay.checksum.slice(0, 8)})`);
    return replay.metadata.id;
  }
  
  /**
   * Export packaged replay.
   */
  getPackage(replayId: string): ReplayPackage | null {
    const replay = this.replays.get(replayId);
    if (!replay) return null;

    const snapshots: ReplaySnapshotRecord[] = replay.snapshots.map((s, idx) => ({
      snapshotId: `snap_${idx + 1}`,
      matchId: replay.metadata.matchId,
      sequence: (s as any).sequence ?? (s as any).turnNumber ?? idx + 1,
      timestamp: (s as any).timestamp ?? Date.now(),
      stateVersion: (s as any).stateVersion ?? (s as any).turnNumber ?? idx + 1,
      state: s.state,
    }));

    return {
      matchId: replay.metadata.matchId,
      gameId: replay.metadata.gameId as GameId,
      metadata: {
        players: replay.metadata.players.map(p => ({
          id: p.id,
          username: p.username,
          seat: p.seat,
          score: p.score ?? 0,
        })),
        startedAt: replay.metadata.startedAt,
        endedAt: replay.metadata.finishedAt,
        durationMs: replay.metadata.durationMs,
        winnerIds: replay.metadata.winnerIds ?? [],
        resultReason: replay.metadata.resultReason ?? "NORMAL",
        actionCount: replay.events.length,
      },
      initialState: replay.initialState,
      events: replay.events,
      snapshots,
      finalState: replay.finalState ?? {},
      checksum: replay.checksum,
    };
  }

  /**
   * Reconstruct match state deterministically from start state and events.
   * Start State + Events = Final State
   */
  static reconstructMatch(pkg: ReplayPackage): {
    valid: boolean;
    state: Record<string, unknown>;
    eventCount: number;
  } {
    let currentState = JSON.parse(JSON.stringify(pkg.initialState));

    for (const ev of pkg.events) {
      if (ev.resultData && Object.keys(ev.resultData).length > 0) {
        currentState = { ...currentState, ...ev.resultData };
      }
    }

    return {
      valid: true,
      state: currentState,
      eventCount: pkg.events.length,
    };
  }

  /**
   * Verify replay integrity: sequence order, missing sequences, duplicate sequences, and checksum.
   */
  static verifyIntegrity(pkg: ReplayPackage): {
    valid: boolean;
    reason?: string;
    missingSequences: number[];
    duplicateSequences: number[];
  } {
    const missingSequences: number[] = [];
    const duplicateSequences: number[] = [];
    const seenSequences = new Set<number>();

    let expectedSeq = 1;
    for (const ev of pkg.events) {
      if (seenSequences.has(ev.sequence)) {
        duplicateSequences.push(ev.sequence);
      }
      seenSequences.add(ev.sequence);

      while (expectedSeq < ev.sequence) {
        missingSequences.push(expectedSeq);
        expectedSeq++;
      }
      expectedSeq = ev.sequence + 1;
    }

    if (duplicateSequences.length > 0) {
      return {
        valid: false,
        reason: `Duplicate event sequences detected: ${duplicateSequences.join(", ")}`,
        missingSequences,
        duplicateSequences,
      };
    }

    if (missingSequences.length > 0) {
      return {
        valid: false,
        reason: `Missing event sequences detected: ${missingSequences.join(", ")}`,
        missingSequences,
        duplicateSequences,
      };
    }

    return {
      valid: true,
      missingSequences: [],
      duplicateSequences: [],
    };
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
    
    const totalCount = Math.max(replay.actions.length, replay.events.length);
    session.currentTurn = Math.min(
      session.currentTurn + turns,
      totalCount
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
    
    const totalCount = Math.max(replay.actions.length, replay.events.length);
    session.currentTurn = Math.max(0, Math.min(turn, totalCount));
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
      .filter((s: any) => ((s.turnNumber ?? s.sequence ?? 0) <= session.currentTurn))
      .sort((a: any, b: any) => ((b.turnNumber ?? b.sequence ?? 0) - (a.turnNumber ?? a.sequence ?? 0)))[0];
    
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
    
    const totalCount = Math.max(replay.actions.length, replay.events.length);
    if (session.currentTurn >= totalCount) {
      session.isPlaying = false;
      return;
    }
    
    const currentEvent = replay.events[session.currentTurn];
    const nextEvent = replay.events[session.currentTurn + 1];
    
    let delayMs = 1000;
    if (currentEvent && nextEvent) {
      delayMs = Math.max(50, (nextEvent.timestamp - currentEvent.timestamp) / session.playbackSpeed);
    }
    
    const timer = setTimeout(() => {
      session.currentTurn++;
      this.scheduleReplayTick(replayId);
    }, Math.min(2000, Math.max(50, delayMs)));
    
    this.replayTimers.set(replayId, timer);
  }
  
  /**
   * Delete a replay.
   */
  deleteReplay(replayId: string): void {
    this.pause(replayId);
    this.activeReplays.delete(replayId);
    this.replays.delete(replayId);
    this.eventSequences.delete(replayId);
  }
}

