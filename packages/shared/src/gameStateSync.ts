import type { GameId } from "./games";
import type { JsonObject } from "./json";

// ============================================================================
// 1. Authoritative State Data Contract
// ============================================================================

export type MatchLifecycleStatus = "waiting" | "starting" | "playing" | "finished" | "abandoned";

export interface AuthoritativeMatchState<TGameState = JsonObject> {
  matchId: string;
  gameId: GameId;

  stateVersion: number;
  actionSequence: number;

  status: MatchLifecycleStatus;

  currentPlayerId: string | null;
  turnNumber: number;

  turnStartedAt: number | null;
  turnExpiresAt: number | null;

  gameState: TGameState;

  lastActionId: string | null;
  lastActionSequence: number;

  updatedAt: number;
  stateHash?: string;
}

// ============================================================================
// 2. State Sync Request & Response
// ============================================================================

export interface AuthoritativeStateSyncRequest {
  matchId: string;
  lastStateVersion: number;
  roomId?: string;
}

export interface AuthoritativeStateSyncResponse {
  matchId: string;
  stateVersion: number;
  actionSequence: number;
  fullState: AuthoritativeMatchState;
  stateHash?: string;
}

// ============================================================================
// 3. Carrom Authoritative State Model
// ============================================================================

export interface CarromAuthoritativeCoin {
  id: string;
  type: "white" | "black" | "queen";
  x: number;
  y: number;
  vx: number;
  vy: number;
  pocketed: boolean;
}

export interface CarromAuthoritativeStriker {
  x: number;
  y: number;
  vx: number;
  vy: number;
  pocketed: boolean;
}

export interface CarromAuthoritativeState {
  coins: CarromAuthoritativeCoin[];
  striker: CarromAuthoritativeStriker;
  currentPlayerId: string;
  turnNumber: number;
  score: Record<string, number>;
  queenPocketed: boolean;
  queenCovered: boolean;
  queenNeedsReturn: boolean;
  shotStatus: "idle" | "in-progress" | "resolved";
  shotId: string | number | null;
}

// ============================================================================
// 4. Rate Limiting Constants
// ============================================================================

export const SYNC_RATE_LIMIT_MAX = 5;
export const SYNC_RATE_LIMIT_WINDOW_MS = 10_000;

// ============================================================================
// 5. Version Reconciliation & Validation Helpers
// ============================================================================

/**
 * Checks if an incoming state version is stale or duplicate (should be dropped)
 */
export function isStaleStateVersion(incomingVersion: number, currentVersion: number): boolean {
  return incomingVersion <= currentVersion;
}

/**
 * Checks if an incoming state version is the exact next consecutive sequence (should be applied)
 */
export function isSequentialStateVersion(incomingVersion: number, currentVersion: number): boolean {
  return incomingVersion === currentVersion + 1;
}

/**
 * Checks if there is a gap in versions indicating dropped packets (triggers full sync)
 */
export function isStateVersionGap(incomingVersion: number, currentVersion: number): boolean {
  return currentVersion > 0 && incomingVersion > currentVersion + 1;
}

/**
 * Generates a unique deduplication key for Carrom coin pocketing events
 */
export function getCarromPocketDedupeKey(shotId: string | number, coinId: string): string {
  return `carrom-pocket:${shotId}:${coinId}`;
}

// ============================================================================
// 6. Deterministic State Hashing (Cybr53 / FNV-1a JSON Hash)
// ============================================================================

function canonicalize(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(canonicalize);
  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const res: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    res[key] = canonicalize((obj as Record<string, unknown>)[key]);
  }
  return res;
}

/**
 * Creates a deterministic fast string hash of canonical JSON state for desync detection
 */
export function calculateStateHash(state: unknown): string {
  if (state === null || state === undefined) return "0";
  const json = JSON.stringify(canonicalize(state));
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < json.length; i++) {
    const ch = json.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}
