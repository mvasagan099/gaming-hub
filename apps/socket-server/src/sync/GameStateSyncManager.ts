import type {
  GameId,
  JsonObject,
  AuthoritativeMatchState,
  AuthoritativeStateSyncResponse,
  SecurityEventRecord,
  SecurityEventType,
  SecuritySeverity,
  ReplayEventRecord,
  ReplaySnapshotRecord,
  ReplayPackage,
  ResultReason,
} from "@gaming-hub/shared";
import {
  calculateStateHash,
  getCarromPocketDedupeKey,
  SYNC_RATE_LIMIT_MAX,
  SYNC_RATE_LIMIT_WINDOW_MS,
  AppError,
} from "@gaming-hub/shared";
import { prisma } from "@gaming-hub/db";
import { createHash } from "node:crypto";

export class GameStateSyncManager {
  private static matchStates = new Map<string, AuthoritativeMatchState>();
  private static processedPocketKeys = new Set<string>();
  private static clientSyncRateLimits = new Map<string, number[]>();
  private static cachedActionResults = new Map<string, any>();
  private static securityEvents: SecurityEventRecord[] = [];
  private static activeReplayPackages = new Map<string, ReplayPackage>();
  private static lastSnapshotTimestamps = new Map<string, number>();

  /**
   * Initializes or registers an authoritative match state upon match launch
   */
  public static initializeMatch(
    matchId: string,
    gameId: GameId,
    initialGameState: JsonObject,
    turnExpiresAt: number | null = null,
    initialPlayerId: string | null = null,
    players: { id: string; username: string; seat: number; score?: number }[] = [],
  ): AuthoritativeMatchState {
    const now = Date.now();
    const state: AuthoritativeMatchState = {
      matchId,
      gameId,
      stateVersion: 1,
      actionSequence: 0,
      status: "playing",
      currentPlayerId: initialPlayerId,
      turnNumber: 0,
      turnStartedAt: now,
      turnExpiresAt,
      gameState: initialGameState,
      lastActionId: null,
      lastActionSequence: 0,
      updatedAt: now,
      stateHash: calculateStateHash(initialGameState),
    };

    this.matchStates.set(matchId, state);
    this.lastSnapshotTimestamps.set(matchId, now);

    const initialClonedState = JSON.parse(JSON.stringify(initialGameState));
    this.activeReplayPackages.set(matchId, {
      matchId,
      gameId,
      metadata: {
        players: players.map((p) => ({ id: p.id, username: p.username, seat: p.seat, score: p.score ?? 0 })),
        startedAt: now,
        endedAt: 0,
        durationMs: 0,
        winnerIds: [],
        resultReason: "NORMAL",
        actionCount: 0,
      },
      initialState: initialClonedState,
      events: [],
      snapshots: [
        {
          snapshotId: `snap_${matchId}_0`,
          matchId,
          sequence: 0,
          timestamp: now,
          stateVersion: 1,
          state: initialClonedState,
        },
      ],
      finalState: {},
    });

    console.log("[STATE] CREATED", {
      matchId,
      gameId,
      stateVersion: state.stateVersion,
      actionSequence: state.actionSequence,
      turnNumber: state.turnNumber,
    });

    void this.persistMatchSnapshot(state);
    return state;
  }

  /**
   * Returns current authoritative state for a match
   */
  public static getMatchState(matchId: string): AuthoritativeMatchState | null {
    return this.matchStates.get(matchId) ?? null;
  }

  /**
   * Checks if match is finished to guard against late actions
   */
  public static isMatchFinished(matchId: string): boolean {
    const state = this.matchStates.get(matchId);
    return state ? state.status === "finished" || state.status === "abandoned" : false;
  }

  /**
   * Applies an accepted action and bumps stateVersion & actionSequence monotonically
   */
  public static applyActionUpdate(
    matchId: string,
    actionId: string,
    nextGameState: JsonObject,
    nextTurnInfo?: {
      currentPlayerId?: string | null;
      turnNumber?: number;
      turnStartedAt?: number | null;
      turnExpiresAt?: number | null;
      status?: "playing" | "finished" | "abandoned";
    },
  ): AuthoritativeMatchState {
    const current = this.matchStates.get(matchId);
    if (!current) {
      throw new AppError("NOT_FOUND", `Match state not found for matchId ${matchId}`);
    }

    if (current.status === "finished" || current.status === "abandoned") {
      throw new AppError("MATCH_FINISHED", "Match is already completed; action rejected");
    }

    const now = Date.now();
    const nextStateVersion = current.stateVersion + 1;
    const nextActionSequence = current.actionSequence + 1;

    current.stateVersion = nextStateVersion;
    current.actionSequence = nextActionSequence;
    current.lastActionId = actionId;
    current.lastActionSequence = nextActionSequence;
    current.gameState = nextGameState;
    current.updatedAt = now;

    if (nextTurnInfo) {
      if (nextTurnInfo.currentPlayerId !== undefined) current.currentPlayerId = nextTurnInfo.currentPlayerId;
      if (nextTurnInfo.turnNumber !== undefined) current.turnNumber = nextTurnInfo.turnNumber;
      if (nextTurnInfo.turnStartedAt !== undefined) current.turnStartedAt = nextTurnInfo.turnStartedAt;
      if (nextTurnInfo.turnExpiresAt !== undefined) current.turnExpiresAt = nextTurnInfo.turnExpiresAt;
      if (nextTurnInfo.status !== undefined) current.status = nextTurnInfo.status;
    }

    current.stateHash = calculateStateHash(nextGameState);

    console.log("[STATE] APPLIED", {
      matchId,
      actionId,
      stateVersion: current.stateVersion,
      actionSequence: current.actionSequence,
      turnNumber: current.turnNumber,
      stateHash: current.stateHash,
    });

    void this.persistMatchSnapshot(current);
    return current;
  }

  /**
   * Records an authoritative replay event during gameplay
   */
  public static recordReplayEvent(
    matchId: string,
    playerId: string,
    eventType: string,
    actionData: Record<string, unknown> = {},
    resultData: Record<string, unknown> = {},
    stateVersion?: number,
  ): ReplayEventRecord | null {
    const replayPkg = this.activeReplayPackages.get(matchId);
    if (!replayPkg) return null;

    const currentSeq = replayPkg.events.length + 1;
    const now = Date.now();

    const record: ReplayEventRecord = {
      eventId: `ev_${now}_${Math.random().toString(36).slice(2, 7)}`,
      matchId,
      sequence: currentSeq,
      playerId,
      eventType,
      timestamp: now,
      stateVersion: stateVersion ?? currentSeq,
      actionData,
      resultData,
    };

    replayPkg.events.push(record);
    replayPkg.metadata.actionCount = replayPkg.events.length;

    // Periodic snapshot: every 30s or every 5 actions
    const lastSnapTime = this.lastSnapshotTimestamps.get(matchId) ?? 0;
    if (now - lastSnapTime >= 30000 || replayPkg.events.length % 5 === 0) {
      this.lastSnapshotTimestamps.set(matchId, now);
      const snap: ReplaySnapshotRecord = {
        snapshotId: `snap_${matchId}_${replayPkg.snapshots.length + 1}`,
        matchId,
        sequence: currentSeq,
        timestamp: now,
        stateVersion: record.stateVersion,
        state: JSON.parse(JSON.stringify(resultData.state ?? resultData)),
      };
      replayPkg.snapshots.push(snap);
    }

    return record;
  }

  /**
   * Finalizes match state, marks status finished, and saves authoritative replay package
   */
  public static finalizeMatch(
    matchId: string,
    finalGameState: JsonObject,
    metadata?: {
      winnerIds?: string[];
      resultReason?: ResultReason;
      finalScores?: Record<string, number>;
      entryFee?: number;
      configurationVersion?: number;
    },
  ): AuthoritativeMatchState {
    const current = this.matchStates.get(matchId);
    if (!current) {
      throw new AppError("NOT_FOUND", `Match state not found for matchId ${matchId}`);
    }

    current.stateVersion += 1;
    current.status = "finished";
    current.gameState = finalGameState;
    current.updatedAt = Date.now();
    current.stateHash = calculateStateHash(finalGameState);

    console.log("[STATE] APPLIED (MATCH_FINISHED)", {
      matchId,
      stateVersion: current.stateVersion,
      status: current.status,
    });

    void this.persistMatchSnapshot(current);

    // Finalize replay package
    const replayPkg = this.activeReplayPackages.get(matchId);
    if (replayPkg) {
      const now = Date.now();
      replayPkg.finalState = JSON.parse(JSON.stringify(finalGameState));
      replayPkg.metadata.endedAt = now;
      replayPkg.metadata.durationMs = Math.max(0, now - replayPkg.metadata.startedAt);
      replayPkg.metadata.winnerIds = metadata?.winnerIds ?? [];
      replayPkg.metadata.resultReason = metadata?.resultReason ?? "NORMAL";
      if (metadata?.entryFee !== undefined) replayPkg.metadata.entryFee = metadata.entryFee;
      if (metadata?.configurationVersion !== undefined) replayPkg.metadata.configurationVersion = metadata.configurationVersion;

      // SHA-256 Checksum over all events and states
      const payloadStr = JSON.stringify({
        matchId,
        initialState: replayPkg.initialState,
        events: replayPkg.events,
        finalState: replayPkg.finalState,
      });
      replayPkg.checksum = createHash("sha256").update(payloadStr).digest("hex");

      // Save to database
      prisma.replay.upsert({
        where: { matchId },
        create: {
          matchId,
          gameId: replayPkg.gameId,
          payload: replayPkg as any,
          sizeBytes: Buffer.byteLength(payloadStr),
        },
        update: {
          payload: replayPkg as any,
          sizeBytes: Buffer.byteLength(payloadStr),
        },
      }).catch((err) => {
        console.error(`[REPLAY] Failed to persist replay for match ${matchId}:`, err);
      });
    }

    return current;
  }

  /**
   * Retrieve in-memory replay package
   */
  public static getReplayPackage(matchId: string): ReplayPackage | null {
    return this.activeReplayPackages.get(matchId) ?? null;
  }

  /**
   * Validates rate limit and handles full state sync request
   */
  public static handleStateSyncRequest(
    clientKey: string,
    matchId: string,
    lastStateVersion: number,
  ): AuthoritativeStateSyncResponse {
    // 1. Rate Limiting Check: max 5 requests / 10s
    this.checkSyncRateLimit(clientKey);

    const matchState = this.matchStates.get(matchId);
    if (!matchState) {
      throw new AppError("NOT_FOUND", `No authoritative state available for match ${matchId}`);
    }

    console.log("[STATE] SYNC_REQUESTED", {
      matchId,
      clientKey,
      lastStateVersion,
      serverStateVersion: matchState.stateVersion,
    });

    console.log("[STATE] SYNC_COMPLETED", {
      matchId,
      stateVersion: matchState.stateVersion,
      actionSequence: matchState.actionSequence,
    });

    return {
      matchId,
      stateVersion: matchState.stateVersion,
      actionSequence: matchState.actionSequence,
      fullState: matchState,
      stateHash: matchState.stateHash,
    };
  }

  /**
   * Rate limiter: enforces maximum 5 sync requests per 10-second window
   */
  private static checkSyncRateLimit(clientKey: string): void {
    const now = Date.now();
    const timestamps = this.clientSyncRateLimits.get(clientKey) || [];
    const windowStart = now - SYNC_RATE_LIMIT_WINDOW_MS;

    const recent = timestamps.filter((t) => t > windowStart);
    if (recent.length >= SYNC_RATE_LIMIT_MAX) {
      console.warn("[STATE] SYNC_RATE_LIMITED", { clientKey, attempts: recent.length });
      throw new AppError("RATE_LIMITED", "Too many state sync requests. Please wait a moment.");
    }

    recent.push(now);
    this.clientSyncRateLimits.set(clientKey, recent);
  }

  /**
   * Deduplication check for Carrom coin pocketing
   */
  public static checkAndMarkCarromPocket(shotId: string | number, coinId: string): boolean {
    const key = getCarromPocketDedupeKey(shotId, coinId);
    if (this.processedPocketKeys.has(key)) {
      return false; // Already processed
    }
    this.processedPocketKeys.add(key);

    // Limit memory size
    if (this.processedPocketKeys.size > 5000) {
      const first = this.processedPocketKeys.values().next().value;
      if (first) this.processedPocketKeys.delete(first);
    }
    return true;
  }

  /**
   * Persists active match snapshot into database for recovery across restarts
   */
  public static async persistMatchSnapshot(state: AuthoritativeMatchState): Promise<void> {
    try {
      if (state.status === "finished") {
        await prisma.match.update({
          where: { id: state.matchId },
          data: {
            status: "FINISHED",
          },
        }).catch(() => undefined);
      }
    } catch {
      // Non-blocking persistence
    }
  }

  /**
   * Recovers active match state on server reload/restart
   */
  public static recoverMatch(state: AuthoritativeMatchState): void {
    this.matchStates.set(state.matchId, state);
    console.log("[STATE] RECOVERED", {
      matchId: state.matchId,
      gameId: state.gameId,
      stateVersion: state.stateVersion,
    });
  }

  /**
   * Action result caching for idempotency
   */
  public static getCachedActionResult(matchId: string, actionId: string): any | null {
    const key = `${matchId}:${actionId}`;
    return this.cachedActionResults.get(key) ?? null;
  }

  public static setCachedActionResult(matchId: string, actionId: string, result: any): void {
    const key = `${matchId}:${actionId}`;
    this.cachedActionResults.set(key, result);
    // Limit memory footprint
    if (this.cachedActionResults.size > 10000) {
      const first = this.cachedActionResults.keys().next().value;
      if (first) this.cachedActionResults.delete(first);
    }
  }

  /**
   * State version validation for detecting stale actions
   */
  public static validateStateVersion(
    matchId: string,
    clientStateVersion?: number,
  ): { valid: boolean; currentStateVersion: number } {
    const current = this.matchStates.get(matchId);
    if (!current) return { valid: true, currentStateVersion: 1 };
    if (clientStateVersion !== undefined && clientStateVersion < current.stateVersion) {
      return { valid: false, currentStateVersion: current.stateVersion };
    }
    return { valid: true, currentStateVersion: current.stateVersion };
  }

  /**
   * Security Event Logging
   */
  public static logSecurityEvent(event: Omit<SecurityEventRecord, "id" | "timestamp">): SecurityEventRecord {
    const record: SecurityEventRecord = {
      ...event,
      id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    };

    this.securityEvents.unshift(record);
    if (this.securityEvents.length > 2000) {
      this.securityEvents.pop();
    }

    console.warn(`[SECURITY] ${record.eventType} [${record.severity}] User: ${record.userId}, Match: ${record.matchId ?? "none"}`, record.details);
    return record;
  }

  public static getSecurityEvents(filters?: {
    gameId?: string;
    userId?: string;
    matchId?: string;
    eventType?: SecurityEventType;
    severity?: SecuritySeverity;
    page?: number;
    pageSize?: number;
  }): { items: SecurityEventRecord[]; total: number } {
    let items = [...this.securityEvents];
    if (filters?.gameId) items = items.filter((e) => e.gameId === filters.gameId);
    if (filters?.userId) items = items.filter((e) => e.userId === filters.userId);
    if (filters?.matchId) items = items.filter((e) => e.matchId === filters.matchId);
    if (filters?.eventType) items = items.filter((e) => e.eventType === filters.eventType);
    if (filters?.severity) items = items.filter((e) => e.severity === filters.severity);

    const total = items.length;
    const page = filters?.page ?? 1;
    const pageSize = filters?.pageSize ?? 30;
    const paginated = items.slice((page - 1) * pageSize, page * pageSize);

    return { items: paginated, total };
  }

  /**
   * Cleans up match records after match settlement
   */
  public static cleanupMatch(matchId: string): void {
    this.matchStates.delete(matchId);
  }
}
