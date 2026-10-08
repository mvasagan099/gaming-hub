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
import { getGamePlayConfig } from "../gameplay/gameConfigs";

export interface StartMatchOptions {
  roomId: RoomId;
  startedBy: string;
}

export interface GameActionOptions {
  roomId: RoomId;
  /** Required at the socket boundary; optional for trusted internal callers. */
  matchId?: string;
  playerId: string;
  action: GameAction;
}

export class MatchManager {
  private readonly framework: MultiplayerFramework;
  private readonly activeMatches = new Map<string, MatchRuntime>();
  private tableTennisTicks = new Set<string>();
  private physicsIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private countdownTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly PHYSICS_TICK_MS = 16;
  private loadTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private physicsLastAt = new Map<string, number>();
  
  constructor(framework: MultiplayerFramework) {
    this.framework = framework;
  }
  
  async initialize(): Promise<void> {
    this.framework.log("MatchManager initialized");
  }
  
  async shutdown(): Promise<void> {
    for (const timer of this.countdownTimers.values()) clearTimeout(timer);
    this.countdownTimers.clear();
    for (const timer of this.loadTimers.values()) clearTimeout(timer);
    this.loadTimers.clear();
    this.physicsLastAt.clear();
    for (const intervalId of this.physicsIntervals.values()) {
      clearInterval(intervalId);
    }
    this.physicsIntervals.clear();
    for (const match of this.activeMatches.values()) {
    }
    this.activeMatches.clear();
  }
  
  startPhysicsLoop(room: RoomRuntime): void {
    const matchId = room.match?.matchId;
    if (!matchId || this.physicsIntervals.has(matchId)) return;
    
    const gameId = room.config.gameId;
    if (gameId !== "table-tennis" && gameId !== "fruit-ninja" && gameId !== "snake-vs-worms") return;
    
    this.physicsLastAt.set(matchId, Date.now());
    const intervalId = setInterval(() => {
      this.runPhysicsTick(room);
    }, gameId === "table-tennis" ? 33 : gameId === "snake-vs-worms" ? 50 : this.PHYSICS_TICK_MS);
    
    this.physicsIntervals.set(matchId, intervalId);
    this.framework.log(`Physics loop started for match ${matchId} (${gameId})`);
  }
  
  stopPhysicsLoop(matchId: string): void {
    this.physicsLastAt.delete(matchId);
    const intervalId = this.physicsIntervals.get(matchId);
    if (intervalId) {
      clearInterval(intervalId);
      this.physicsIntervals.delete(matchId);
      this.framework.log(`Physics loop stopped for match ${matchId}`);
    }
  }
  
  private async runPhysicsTick(room: RoomRuntime): Promise<void> {
    if (!room.match || room.status !== "playing") return;
    
    const engine = room.match.engine as any;
    if (typeof engine.tick !== "function") return;
    if (room.config.gameId === "table-tennis" &&
        (!engine.state.ball?.inPlay || engine.state.phase !== "rally" || engine.state.paused)) return;
    
    const matchId = room.match.matchId;
    const tick = async () => {
      if (this.framework.config.executeRoomTask && this.framework.roomManager.getRoom(room.id) !== room) return;
      if (room.status !== "playing" || room.match?.matchId !== matchId || room.match.engine !== engine) return;
      const now = Date.now();
      const elapsed = Math.min(250, Math.max(0, now - (this.physicsLastAt.get(matchId) ?? now - 1000 / 60)));
      this.physicsLastAt.set(matchId, now);
      const result = ["table-tennis", "snake-vs-worms"].includes(room.config.gameId) ? engine.tick(elapsed) : engine.tick();
      if (result && result.ok) {
        const hasEvents = result.events && result.events.length > 0;
        const isPhysicsActive = room.config.gameId === "table-tennis"
          ? Boolean(result.state?.ball?.inPlay) : true;
        if (hasEvents || isPhysicsActive) {
          await this.framework.syncManager.broadcastGameState(room, result.events ?? []);
        }
        if (result.state?.finished) {
          this.stopPhysicsLoop(matchId);
          await this.finishMatch(room, result);
        }
      }
    };
    const serialized = ["table-tennis", "snake-vs-worms", "fruit-ninja"].includes(room.config.gameId);
    if (serialized && this.tableTennisTicks.has(matchId)) return;
    if (serialized) this.tableTennisTicks.add(matchId);
    try {
      // Share the action queue so anti-cheat rollback cannot undo an overlapping
      // physics tick. Coalesce pending ticks instead of building a stale backlog.
      if (serialized) await this.framework.gameStateManager.enqueue(room.id, tick);
      else await tick();
    } catch (error) {
      this.framework.error("Physics tick error", error);
    } finally {
      if (serialized) this.tableTennisTicks.delete(matchId);
    }
  }

  async declineRematch(roomId: RoomId, playerId: string) {
    return this.framework.gameStateManager.enqueue(roomId, async () => {
      const room = this.framework.roomManager.getRoom(roomId);
      if (!room) throw new Error("Room not found");
      const player = room.players.get(playerId);
      if (!player || player.isSpectator) throw new Error("UNAUTHORIZED");
      if (room.status !== "ended") throw new Error("The rematch has already started");
      room.rematch = null;
      const update = { roomId, requestedBy: [], active: false };
      this.framework.syncManager.broadcastToRoom(room, "rematch:update", update);
      return update;
    });
  }

  /** Rematches need unanimous consent and go through the normal funding hook. */
  async requestRematch(roomId: RoomId, playerId: string) {
    return this.framework.gameStateManager.enqueue(roomId, async () => {
      const room = this.framework.roomManager.getRoom(roomId);
      if (!room) throw new Error("Room not found");
      const player = room.players.get(playerId);
      if (!player || player.isSpectator) throw new Error("UNAUTHORIZED");
      if (room.status !== "ended" || !room.match?.finishedAt) {
        throw new Error("Rematch is available only after the match has ended");
      }
      if (room.config.settings.tournamentId) {
        throw new Error("Tournament matches cannot be rematched in this room");
      }
      const participants = [...room.players.values()].filter(p => !p.isSpectator);
      if (participants.length < room.config.minPlayers || participants.some(p => p.connectionStatus !== "connected")) {
        throw new Error("All players must be present and connected for a rematch");
      }
      if (!room.rematch || room.rematch.expiresAt <= Date.now()) {
        room.rematch = { requestedBy: [], active: true, expiresAt: Date.now() + 60_000 };
      }
      if (!room.rematch.requestedBy.includes(playerId)) room.rematch.requestedBy.push(playerId);
      const publish = () => {
        const update = { roomId, requestedBy: [...(room.rematch?.requestedBy ?? [])], active: !!room.rematch?.active };
        this.framework.syncManager.broadcastToRoom(room, "rematch:update", update);
        return update;
      };
      if (!participants.every(p => room.rematch!.requestedBy.includes(p.id))) return publish();

      const previousMatch = room.match;
      const readiness = participants.map(p => p.isReady);
      room.status = "waiting";
      participants.forEach(p => { p.isReady = true; });
      try {
        await this.startMatch({ roomId, startedBy: room.hostId });
      } catch (error) {
        // Failed funding leaves the original result available and no new game.
        if (room.match === previousMatch) {
          room.status = "ended";
          participants.forEach((p, index) => { p.isReady = readiness[index]; });
        }
        room.rematch = null;
        publish();
        await this.framework.syncManager.broadcastRoomUpdate(room);
        throw error;
      }
      room.rematch = null;
      return publish();
    });
  }

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
    // Tournament creation has already linked this identity to its bracket round.
    // Ordinary starts and rematches must still receive a fresh identity.
    const matchId = room.pendingMatchId ?? (room.config.settings.tournamentId && room.match && !room.match.finishedAt
      ? room.match.matchId
      : randomUUID());
    
    // Import and create game engine
    const { createEngine, secureRandomSource } = await import("@gaming-hub/game-engine");
    // A second request can enter while the import yields. Recheck before the
    // synchronous engine setup and the starting transition/funding hook.
    if (room.status !== "waiting") {
      throw new Error("Match already started");
    }
    
    const engineOptions: Record<string, unknown> = { matchId };
    
    // Add time control if configured for turn-based games
    const isTurnBased = getGamePlayConfig(room.config.gameId)?.turnBased ?? false;
    if (isTurnBased && room.config.settings.turnTimerDurationMs && room.config.settings.turnTimerDurationMs > 0) {
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
    
    // Pass the chess time control through so clock-capable engines run
    // authoritative timers (untimed modes omit it entirely).
    const timeControl = room.config.settings.timeControl;
    if (timeControl && timeControl.baseSeconds > 0) {
      engineOptions.timeControl = timeControl;
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
      participants: enginePlayers,
      engine,
      turnNumber: 0,
      startConfirmationRequired: !!this.framework.config.requireGameLoadAck && ["carrom", "snake-vs-worms"].includes(room.config.gameId),
      loadedPlayerIds: [], loadDeadline: null, gameplayStartedAt: null,
      startedAt: now,
      pausedAt: null,
      pausedBy: null,
      finishedAt: null,
      winnerIds: [],
      winnerSeats: [],
      stateSnapshots: [],
      actionHistory: [],
      ...(room.config.gameId === "carrom" ? { replayInitialState: structuredClone(engine.serialize()) } : {}),
    };
    
    // Store initial state snapshot
    match.stateSnapshots.push({
      turnNumber: 0,
      timestamp: now,
      state: engine.serialize(),
    });
    
    // Keep the room unavailable to actions or another start until funding is
    // confirmed. Failed funding must not register an active match or timers.
    room.status = "starting";
    try {
      if (this.framework.config.onMatchStarting) {
        await this.framework.config.onMatchStarting(room, matchId);
      }
    } catch (error) {
      room.status = "waiting";
      throw error;
    }

    // Release the previous runtime only after the new match is funded.
    if (room.match?.finishedAt) {
      this.stopPhysicsLoop(room.match.matchId);
      this.activeMatches.delete(room.match.matchId);
      this.framework.timerManager.clearRoomTimers(room.id);
      room.eventLog = [];
    }
    room.match = match;
    room.pendingMatchId = null;
    for (const player of room.players.values()) player.packetSequenceNumber = 0;
    if ((this.framework.config.countdownDurationMs ?? 0) > 0) {
      room.status = "starting";
      room.lifecyclePhase = "COUNTDOWN";
      room.countdownEndsAt = Date.now() + this.framework.config.countdownDurationMs!;
      match.startedAt = room.countdownEndsAt;
      this.scheduleCountdown(room);
      await this.framework.syncManager.broadcastRoomUpdate(room);
      return match;
    }
    await this.activateMatch(room);
    return match;
  }

  private async activateMatch(room: RoomRuntime): Promise<void> {
    const match = room.match!;
    const engine = match.engine as EngineInstance;
    if (this.isAwaitingGameLoad(room)) {
      room.status = "playing";
      room.lifecyclePhase = "READY_CHECK";
      room.countdownEndsAt = null;
      match.loadDeadline ??= Date.now() + (this.framework.config.gameLoadTimeoutMs ?? 30000);
      this.scheduleGameLoadTimeout(room);
      await this.framework.syncManager.broadcastRoomUpdate(room);
      await this.framework.syncManager.broadcastMatchStart(room);
      return;
    }
    const plannedStart = match.startConfirmationRequired ? Date.now() : room.countdownEndsAt;
    match.gameplayStartedAt = plannedStart ?? Date.now();
    match.loadDeadline = null;
    const loadTimer = this.loadTimers.get(room.id);
    if (loadTimer) clearTimeout(loadTimer);
    this.loadTimers.delete(room.id);
    if (typeof (engine as EngineInstance & { startMatchClock?: () => void }).startMatchClock === "function") {
      (engine as EngineInstance & { startMatchClock: () => void }).startMatchClock();
      match.startedAt = Date.now();
      match.stateSnapshots[0] = { turnNumber: 0, timestamp: match.startedAt, state: engine.serialize() };
    }
    // Update room only after the lifecycle prerequisite succeeds.
    room.status = "playing";
    if (this.framework.config.countdownDurationMs) {
      room.lifecyclePhase = "PLAYING";
      // A replacement that wakes after the deadline preserves the scheduled
      // start, rather than granting extra match/turn time after an outage.
      if (plannedStart) {
        const state = engine.persistenceState();
        if ('matchStartedAtMs' in state) state.matchStartedAtMs = plannedStart;
        if ('turnStartedAtMs' in state) state.turnStartedAtMs = plannedStart;
        if ('turnStartedAt' in state) state.turnStartedAt = plannedStart;
        if ('turnExpiresAt' in state) state.turnExpiresAt = plannedStart + 30000;
        if (state.clocks) for (const clock of Object.values(state.clocks as Record<string, { startedAtMs: number | null }>)) {
          if (clock.startedAtMs != null) clock.startedAtMs = plannedStart;
        }
        if (room.config.gameId === 'fruit-ninja') { state.phase = 'playing'; state.countdownEndsAtMs = null; }
        engine.restoreState(state);
        if (room.config.gameId === 'snooker') (engine as EngineInstance & { restoreMatchEpoch(epoch: number): void }).restoreMatchEpoch(plannedStart);
        match.startedAt = plannedStart;
      }
      room.countdownEndsAt = null;
    }
    
    // Store in active matches
    this.activeMatches.set(match.matchId, match);
    
    // Start AFK monitoring for all players
    for (const player of room.players.values()) {
      this.framework.playerManager.startAfkMonitoring(player.id, room.id);
    }
    
    // Schedule clock check
    this.scheduleClockCheck(room);
    
    // Broadcast match start (includes the room update so every client sees the
    // room transition to "playing" and can navigate into the game page).
    await this.framework.syncManager.broadcastRoomUpdate(room);
    await this.framework.syncManager.broadcastMatchStart(room);
    
    this.startPhysicsLoop(room);
    
    this.framework.log(`Match ${match.matchId} started in room ${room.id}`);
  }

  isAwaitingGameLoad(room: RoomRuntime): boolean {
    const match = room.match;
    return !!match?.startConfirmationRequired && match.gameplayStartedAt == null && !match.finishedAt;
  }

  async confirmGameLoaded(roomId: string, playerId: string, matchId: string): Promise<{ started: boolean }> {
    const room = this.framework.roomManager.getRoom(roomId);
    if (!room?.match || room.match.matchId !== matchId || room.status !== "playing") throw new Error("Match is not loading");
    const player = room.players.get(playerId);
    if (!player || player.isSpectator || player.seat == null || player.connectionStatus !== "connected") throw new Error("Not a connected participant");
    if (!this.isAwaitingGameLoad(room)) return { started: true };
    if (room.match.loadDeadline != null && Date.now() >= room.match.loadDeadline) {
      await this.abortMatch(room, "game_initialization_timeout");
      return { started: false };
    }
    room.match.loadedPlayerIds ??= [];
    if (!room.match.loadedPlayerIds.includes(playerId)) room.match.loadedPlayerIds.push(playerId);
    const participants = room.match.participants ?? [...room.players.values()].filter(p => !p.isSpectator).map(p => ({ userId: p.id }));
    if (!participants.every(p => room.match!.loadedPlayerIds!.includes(p.userId) && room.players.get(p.userId)?.connectionStatus === "connected")) return { started: false };
    // Only the serial owner accepts all board-loaded receipts and arms clocks/physics.
    room.match.gameplayStartedAt = Date.now();
    await this.activateMatch(room);
    return { started: true };
  }

  private scheduleGameLoadTimeout(room: RoomRuntime): void {
    const old = this.loadTimers.get(room.id);
    if (old) clearTimeout(old);
    if (!this.isAwaitingGameLoad(room) || room.match!.loadDeadline == null) return;
    const timer = setTimeout(() => {
      this.loadTimers.delete(room.id);
      void this.framework.gameStateManager.enqueue(room.id, async () => {
        const current = this.framework.roomManager.getRoom(room.id);
        if (current !== room || !this.isAwaitingGameLoad(current)) return;
        await this.abortMatch(current, "game_initialization_timeout");
      }).catch(error => this.framework.error("Game load cancellation requires recovery", error));
    }, Math.max(0, room.match!.loadDeadline! - Date.now()));
    this.loadTimers.set(room.id, timer);
  }

  scheduleCountdown(room: RoomRuntime): void {
    const old = this.countdownTimers.get(room.id);
    if (old) clearTimeout(old);
    if (room.status !== 'starting' || room.countdownEndsAt == null) return;
    const timer = setTimeout(() => {
      this.countdownTimers.delete(room.id);
      void this.framework.gameStateManager.enqueue(room.id, async () => {
        const current = this.framework.roomManager.getRoom(room.id);
        if (!current || current.status !== 'starting' || !current.match || current.match.finishedAt) return;
        if ([...current.players.values()].some(p => !p.isSpectator && (!p.isReady || p.connectionStatus !== 'connected'))) {
          current.lifecyclePhase = 'READY_CHECK'; current.countdownEndsAt = null;
          await this.framework.syncManager.broadcastRoomUpdate(current);
          return;
        }
        await this.activateMatch(current);
      }).catch(error => this.framework.error('Countdown owner unavailable; recovery required', error));
    }, Math.max(0, room.countdownEndsAt - Date.now()));
    this.countdownTimers.set(room.id, timer);
  }

  async resumeReadyCountdown(room: RoomRuntime): Promise<void> {
    if (room.status !== 'starting' || room.lifecyclePhase !== 'READY_CHECK') return;
    if ([...room.players.values()].some(p => !p.isSpectator && (!p.isReady || p.connectionStatus !== 'connected'))) return;
    room.lifecyclePhase = 'COUNTDOWN';
    room.countdownEndsAt = Date.now() + (this.framework.config.countdownDurationMs ?? 3000);
    this.scheduleCountdown(room);
    await this.framework.syncManager.broadcastRoomUpdate(room);
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
    
    if (room.status !== "playing" || !room.match || this.isAwaitingGameLoad(room)) {
      return this.createErrorResult(null, "Game not started");
    }
    if (options.matchId && options.matchId !== room.match.matchId) {
      return this.createErrorResult(null, "Action belongs to a different match");
    }
    
    const player = room.players.get(playerId);
    if (!player) {
      return this.createErrorResult(null, "Player not in room");
    }

    if (player.isSpectator || player.seat === null || player.seat === undefined) {
      return this.createErrorResult(null, "Spectators are not authorized to perform game actions");
    }

    const actionId = (action as any).actionId as string | undefined;
    const match = room.match;
    // Action identities belong to one match and one authenticated player.
    const actionScope = JSON.stringify([roomId, match.matchId, playerId]);
    
    // Serialize state mutations per room so concurrent actions never corrupt
    // the authoritative engine.
    return this.framework.gameStateManager.enqueue(roomId, async () => {
      if (this.framework.roomManager.getRoom(roomId) !== room || room.match !== match ||
          room.status !== "playing" || room.players.get(playerId) !== player) {
        return this.createErrorResult(null, "Match or room membership changed");
      }
      // Recheck inside the queue: simultaneous retries can arrive before the
      // first action has finished and populated its cache entry.
      const cached = this.framework.antiCheatManager.getCachedActionResult(actionScope, actionId);
      if (cached) return cached;
      if (actionId && match.actionHistory.some(record => record.playerId === playerId && record.action.actionId === actionId)) {
        const engine = match.engine as EngineInstance;
        return { ok: true, state: engine.serialize(), events: [], finished: engine.finished, winnerSeats: engine.winnerSeats };
      }
      const clientSequence = action.clientSequence;
      if (this.framework.config.executeRoomTask && clientSequence !== undefined &&
        (!Number.isSafeInteger(clientSequence) || Number(clientSequence) <= player.packetSequenceNumber)) {
        return this.createErrorResult((match.engine as EngineInstance).serialize(), "Stale or invalid action sequence");
      }
      // 10-Minute Hard Match Timer Limit
      const MATCH_LIMIT_MS = 10 * 60 * 1000;
      const deadline = ["snooker", "snake-vs-worms"].includes(room.config.gameId)
        ? (room.match.engine as EngineInstance).currentMatchDeadline
        : room.match.startedAt ? room.match.startedAt + MATCH_LIMIT_MS : null;
      if (!(["snooker", "snake-vs-worms"].includes(room.config.gameId) && action.type === "resign") && deadline && Date.now() > deadline) {
        return this.createErrorResult(null, "Match deadline exceeded (10-minute limit)");
      }

      // Framework-level pre-validation (turn, spectator, rate limiting).
      const validation = this.framework.actionValidator.validate(room!, player, action);
      if (!validation.ok) {
        this.framework.actionValidator.recordRejected(player.id);
        return this.createErrorResult(null, validation.error ?? "Action rejected");
      }
      
      // Pre-validate action with anti-cheat before mutating engine state
      if (this.framework.config.enableAntiCheat) {
        const preValidation = await this.framework.antiCheatManager.validatePreAction(
          room!,
          player,
          action,
        );
        if (!preValidation.valid) {
          return this.createErrorResult(
            (room!.match!.engine as EngineInstance).serialize(),
            preValidation.reason || "Action rejected",
          );
        }
      }

      // Record activity
      this.framework.playerManager.recordActivity(playerId);
      
      // Snapshot previous state for rollback if downstream validation fails
      const engine = room!.match!.engine as EngineInstance;
      const previousState = (engine as any).state ? structuredClone((engine as any).state) : null;
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
          // Authoritative rollback: restore pre-action engine state so state is never corrupted
          if (previousState && typeof (engine as any).restoreState === "function") {
            (engine as any).restoreState(previousState);
          }

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
        if (this.framework.config.executeRoomTask && clientSequence !== undefined) player.packetSequenceNumber = Number(clientSequence);
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

        // Cache action result for idempotency
        this.framework.antiCheatManager.cacheActionResult(actionScope, actionId, result);
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
    
    const match = room.match;
    const resume = async () => {
      if (!room.match || room.match !== match || room.status !== "playing") return;
      if (room.config.gameId === "snooker") {
        (room.match.engine as unknown as { resumeClocks(): void }).resumeClocks();
        await this.framework.syncManager.broadcastGameState(room, []);
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
    };
    if (room.config.gameId === "snooker") await this.framework.gameStateManager.enqueue(roomId, resume);
    else await resume();
  }
  
  /**
   * Finish a match and resolve the final result.
   */
  async finishMatch(room: RoomRuntime, result: EngineActionResult<JsonObject>): Promise<void> {
    if (!room.match) return;
    if (room.status !== "playing" || this.isAwaitingGameLoad(room)) {
      await this.abortMatch(room, "game_not_started");
      return;
    }
    
    // Idempotency guard: the engine can finish via both the physics tick and
    // the scheduled clock check, so never finalize a match twice.
    if (room.match.finishedAt) return;
    
    this.stopPhysicsLoop(room.match.matchId);
    
    const matchResult = this.framework.winnerCalculator.calculate(room, result);
    
    room.match.finishedAt = matchResult.finishedAt;
    room.match.winnerSeats = matchResult.winnerSeats;
    room.match.winnerIds = matchResult.winnerIds;
    
    // Update room status
    room.status = "ended";

    // Distributed hosts persist the final checkpoint and outbox before any
    // result announcement. Failure propagates; it must never become a log-only loss.
    if (this.framework.config.persistFinalResult) {
      await this.framework.config.persistFinalResult(room, matchResult);
    }
    
    // Stop AFK monitoring
    for (const player of room.players.values()) {
      this.framework.playerManager.stopAfkMonitoring(player.id, room.id);
    }
    
    // Finalize replay
    if (!this.framework.config.persistFinalResult && this.framework.config.enableReplay) {
      await this.framework.replayManager.finalizeReplay(room);
    }
    
    // Persist match statistics.
    if (!this.framework.config.persistFinalResult) await this.framework.statisticsCollector.finalize(room, matchResult);
    
    // Invoke settlement hook if configured
    if (!this.framework.config.persistFinalResult && this.framework.config.onMatchFinished) {
      try {
        await this.framework.config.onMatchFinished(room, matchResult);
      } catch (err) {
        this.framework.log(`Error in onMatchFinished hook: ${err}`);
      }
    }

    // Broadcast game over
    await this.framework.syncManager.broadcastGameOver(room);
    
    // Keep the room around briefly for rematch, then close it so it can't leak.
    this.framework.roomManager.scheduleRoomCleanup(room.id);
    
    this.framework.log(`Match ${room.match.matchId} finished in room ${room.id}. Winners: ${matchResult.winnerIds.join(", ")}`);
  }
  
  /**
   * Abort a match.
   */
  async abortMatch(room: RoomRuntime, reason: string): Promise<void> {
    if (!room.match) return;
    this.detachRoom(room);
    if (room.match.finishedAt) return;
    
    room.match.finishedAt = Date.now();
    room.match.winnerIds = [];
    room.match.winnerSeats = [];
    
    // Update room status
    room.status = "ended";
    if (this.framework.config.persistAbortedResult) await this.framework.config.persistAbortedResult(room, reason);
    
    // Stop AFK monitoring
    for (const player of room.players.values()) {
      this.framework.playerManager.stopAfkMonitoring(player.id, room.id);
    }
    
    await this.framework.syncManager.broadcastRoomUpdate(room);
    // Broadcast abort
    await this.framework.syncManager.broadcastToRoom(room, "match:aborted", {
      roomId: room.id,
      matchId: room.match.matchId,
      reason,
    });
    
    if (!this.framework.config.persistAbortedResult && this.framework.config.onMatchAborted) {
      try {
        await this.framework.config.onMatchAborted(room, reason);
      } catch (err) {
        this.framework.log(`Error in onMatchAborted hook: ${err}`);
      }
    }
    
    // Close the room after a short linger so the abort isn't followed by a leak.
    this.framework.roomManager.scheduleRoomCleanup(room.id);
    
    this.framework.log(`Match ${room.match.matchId} aborted in room ${room.id}: ${reason}`);
  }
  
  /**
   * Handle player disconnect during match.
   */
  async handlePlayerDisconnect(room: RoomRuntime, player: PlayerRuntime): Promise<void> {
    if (!room.match) return;
    if (this.isAwaitingGameLoad(room)) room.match.loadedPlayerIds = room.match.loadedPlayerIds?.filter(id => id !== player.id);
    
    this.framework.log(`Player ${player.id} disconnected during match in room ${room.id}`);
    
    // Give grace period for reconnection before forfeit
    // The actual forfeit is handled by the disconnect timer in PlayerManager
  }
  
  /**
   * Handle player forfeit.
   */
  async handlePlayerForfeit(room: RoomRuntime, player: PlayerRuntime, reason: string): Promise<void> {
    const match = room.match;
    if (!match || match.finishedAt || player.isSpectator || player.seat === null) return;
    await this.framework.gameStateManager.enqueue(room.id, async () => {
      if (room.match !== match || match.finishedAt) return;
      if (room.status === "starting" || this.isAwaitingGameLoad(room)) {
        await this.abortMatch(room, "game_initialization_failed");
        return;
      }
      if (room.status !== "playing" || room.players.get(player.id) !== player) return;
      this.framework.log(`Player ${player.id} forfeited in room ${room.id}: ${reason}`);
      const engine = match.engine as EngineInstance;
      // Server-owned forfeits must not depend on turn, input cooldown, packet
      // sequence, or client anti-cheat checks. Keep engine mutations serialized.
      if (match.pausedAt) {
        engine.apply({ type: "resume" }, player.seat!);
        match.pausedAt = null;
        match.pausedBy = null;
      }
      if (engine.finished) {
        await this.finishMatch(room, { ok: true, state: engine.serialize(), events: [], finished: true, winnerSeats: engine.winnerSeats });
        return;
      }
      const action: GameAction = { type: "resign", reason };
      const result = engine.apply(action, player.seat!);
      if (!result.ok || !result.finished) throw new Error(`Unable to finalize forfeit for ${room.config.gameId}`);
      const events = this.framework.eventDispatcher.toGameEvents(room, result.events);
      this.framework.eventDispatcher.appendToLog(room, events);
      const recorded = this.framework.gameStateManager.recordResult(room, result, player.id, player.seat!, action, events);
      if (this.framework.config.enableReplay) this.framework.replayManager.recordAction(room, recorded);
      await this.framework.syncManager.broadcastGameState(room, result.events);
      await this.finishMatch(room, result);
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

  detachRoom(room: RoomRuntime): void {
    const loadTimer = this.loadTimers.get(room.id);
    if (loadTimer) clearTimeout(loadTimer);
    this.loadTimers.delete(room.id);
    const countdown = this.countdownTimers.get(room.id);
    if (countdown) clearTimeout(countdown);
    this.countdownTimers.delete(room.id);
    if (room.match) { this.stopPhysicsLoop(room.match.matchId); this.activeMatches.delete(room.match.matchId); }
  }

  restoreRuntime(room: RoomRuntime): void {
    if (room.status === 'starting') { this.scheduleCountdown(room); return; }
    if (this.isAwaitingGameLoad(room)) { this.scheduleGameLoadTimeout(room); return; }
    if (room.match?.finishedAt) {
      this.framework.roomManager.scheduleRoomCleanup(room.id,
        Math.max(0, room.match.finishedAt + this.framework.config.endedRoomLingerMs - Date.now()));
      return;
    }
    if (!room.match || room.match.finishedAt || room.status !== "playing") return;
    this.activeMatches.set(room.match.matchId, room.match);
    for (const player of room.players.values()) this.framework.playerManager.startAfkMonitoring(player.id, room.id);
    this.startPhysicsLoop(room);
    this.scheduleClockCheck(room);
  }
  
  /**
   * Schedule clock check for timer-based games.
   */
  private scheduleClockCheck(room: RoomRuntime): void {
    if (!room.match) return;
    
    this.framework.timerManager.scheduleClockCheck(room, () => this.handleClockExpiry(room));
  }
  
  /**
   * Handle clock expiry.
   */
  private async handleClockExpiry(room: RoomRuntime): Promise<void> {
    const matchId = room.match?.matchId;
    const expire = async () => {
      if (this.framework.config.executeRoomTask && this.framework.roomManager.getRoom(room.id) !== room) return;
      if (!room.match || room.match.matchId !== matchId || room.status !== "playing") return;

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
    };
    if (this.framework.config.executeRoomTask || ["table-tennis", "snooker", "snake-vs-worms"].includes(room.config.gameId)) await this.framework.gameStateManager.enqueue(room.id, expire);
    else await expire();
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
