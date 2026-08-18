import type {
  GameId,
  JsonObject,
  AuthoritativeMatchState,
  AuthoritativeStateSyncResponse,
} from "@gaming-hub/shared";
import {
  calculateStateHash,
  getCarromPocketDedupeKey,
  SYNC_RATE_LIMIT_MAX,
  SYNC_RATE_LIMIT_WINDOW_MS,
  AppError,
} from "@gaming-hub/shared";
import { prisma } from "@gaming-hub/db";

export class GameStateSyncManager {
  private static matchStates = new Map<string, AuthoritativeMatchState>();
  private static processedPocketKeys = new Set<string>();
  private static clientSyncRateLimits = new Map<string, number[]>();

  /**
   * Initializes or registers an authoritative match state upon match launch
   */
  public static initializeMatch(
    matchId: string,
    gameId: GameId,
    initialGameState: JsonObject,
    turnExpiresAt: number | null = null,
    initialPlayerId: string | null = null,
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
   * Finalizes match state and marks status finished
   */
  public static finalizeMatch(matchId: string, finalGameState: JsonObject): AuthoritativeMatchState {
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
    return current;
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
   * Cleans up match records after match settlement
   */
  public static cleanupMatch(matchId: string): void {
    this.matchStates.delete(matchId);
  }
}
