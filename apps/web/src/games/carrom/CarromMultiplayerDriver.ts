/**
 * CarromMultiplayerDriver
 *
 * Bridges the authoritative server state (via multiplayerStore) to the
 * CarromMultiplayer UI component.  All game logic stays on the server;
 * this class is purely a thin adaptor / event bus.
 *
 * Coordinate systems
 * ------------------
 *  Server  : 600 × 600  (always stored / sent in this space)
 *  Client  : 500 × 500  (canvas size used by CarromMultiplayer)
 *
 * Seat-1 players see the board rotated 180° so the striker always appears
 * at the bottom of the canvas.  mapToClient() handles the flip.
 */

import { useMultiplayerStore, type WinnerInfo } from "../../store/multiplayerStore";
import type { CarromState, CarromCoin, CarromStriker } from "@gaming-hub/game-engine";

// ─── Public types ────────────────────────────────────────────────────────────

export interface CarromRemoteState extends CarromState {}

export interface ClientPoint {
  x: number;
  y: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Server board size */
export const SERVER_SIZE = 600;
/** Client canvas size used by CarromMultiplayer */
export const CLIENT_SIZE = 500;
/** Scale factor: server → client */
export const SCALE = CLIENT_SIZE / SERVER_SIZE; // 5/6

// ─── Coordinate helpers (exported for CarromMultiplayer) ─────────────────────

export function mapToClient(
  sx: number,
  sy: number,
  mySeat: number
): ClientPoint {
  if (mySeat === 1) {
    return {
      x: (SERVER_SIZE - sx) * SCALE,
      y: (SERVER_SIZE - sy) * SCALE,
    };
  }
  return { x: sx * SCALE, y: sy * SCALE };
}

export function mapToServer(
  cx: number,
  cy: number,
  mySeat: number
): ClientPoint {
  if (mySeat === 1) {
    return {
      x: SERVER_SIZE - cx / SCALE,
      y: SERVER_SIZE - cy / SCALE,
    };
  }
  return { x: cx / SCALE, y: cy / SCALE };
}

/** Convert a local aim angle to a server angle (flip 180° for seat-1). */
export function localAngleToServer(localAngle: number, mySeat: number): number {
  const TWO_PI = Math.PI * 2;
  const normalized = ((localAngle % TWO_PI) + TWO_PI) % TWO_PI;
  if (mySeat === 1) return (normalized + Math.PI) % TWO_PI;
  return normalized;
}

// ─── Driver ──────────────────────────────────────────────────────────────────

export default class CarromMultiplayerDriver {
  public readonly mySeat: number;
  public readonly playerNames: string[];

  public lastState: CarromRemoteState | null = null;

  // Callbacks set by the UI component
  public onStateUpdate: ((s: CarromRemoteState) => void) | null = null;
  public onCoinPocketed:
    | ((coinId: string, coinType: string, pocketIndex: number) => void)
    | null = null;
  public onCoinReturned:
    | ((coinId: string, coinType: string) => void)
    | null = null;
  public onQueenReturned: ((reason: string) => void) | null = null;
  public onFoul: ((reason: string) => void) | null = null;
  public onTurnEnd: ((nextSeat: number) => void) | null = null;
  public onWin: ((winnerSeat: number) => void) | null = null;

  private destroyed = false;
  private unsubscribe: (() => void) | null = null;
  private winFired = false;

  // Tracks the lastActionAtMs of the most recently animated strike so we
  // only animate each delivery once.
  private lastAnimatedMs: number | null = null;

  constructor(mySeat: number, playerNames: string[]) {
    this.mySeat = mySeat;
    this.playerNames = playerNames;
  }

  start(): void {
    // Apply current state immediately so the board renders on mount.
    const s = useMultiplayerStore.getState();
    this._apply(
      s.gameState as CarromRemoteState | null,
      s.lastEvents,
      s.winner
    );

    // Subscribe to future updates.
    this.unsubscribe = useMultiplayerStore.subscribe((state, prev) => {
      if (this.destroyed) return;
      if (state.renderKey !== prev.renderKey || state.winner !== prev.winner) {
        this._apply(
          state.gameState as CarromRemoteState | null,
          state.lastEvents,
          state.winner
        );
      }
    });
  }

  stop(): void {
    this.destroyed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  isMyTurn(): boolean {
    return !this.lastState?.finished && this.lastState?.currentSeat === this.mySeat;
  }

  canPlaceStriker(): boolean {
    const s = this.lastState;
    if (!s || s.finished) return false;
    return s.strikerPlacementPhase && s.strikerPlacementSeat === this.mySeat;
  }

  canStrike(): boolean {
    const s = this.lastState;
    if (!s || s.finished) return false;
    return s.currentSeat === this.mySeat;
  }

  isPlacementPhase(): boolean {
    return this.lastState?.strikerPlacementPhase ?? true;
  }

  getScore(seat: number): number {
    const p = this.lastState?.players.find((pl) => pl.seat === seat);
    return p?.score ?? 0;
  }

  getPlayerName(seat: number): string {
    return this.playerNames[seat] ?? `Player ${seat + 1}`;
  }

  getMyColor(): "white" | "black" {
    return this.mySeat === 0 ? "white" : "black";
  }

  getOpponentColor(): "white" | "black" {
    return this.mySeat === 0 ? "black" : "white";
  }

  getCoins(): CarromCoin[] {
    return this.lastState?.coins ?? [];
  }

  getStriker(): CarromStriker | null {
    return this.lastState?.striker ?? null;
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  /**
   * Send a place-striker action.
   * @param clientX  X in client canvas coordinates (0–500).
   */
  async sendPlaceStriker(clientX: number): Promise<void> {
    const serverX = mapToServer(clientX, 0, this.mySeat).x;
    await useMultiplayerStore
      .getState()
      .sendGameAction({ type: "place-striker", x: serverX })
      .catch(() => {/* ignore */});
  }

  /**
   * Send a strike action.
   * @param localAngle  Angle in client/canvas space (radians).
   * @param power       0–1.
   */
  async sendStrike(
    localAngle: number,
    power: number
  ): Promise<{ ok: boolean; error?: string }> {
    const serverAngle = localAngleToServer(localAngle, this.mySeat);
    const res = await useMultiplayerStore
      .getState()
      .sendGameAction({ type: "strike", angle: serverAngle, power });
    if (!res.ok && res.error) {
      return { ok: false, error: res.error };
    }
    return { ok: true };
  }

  // ── Internal state application ───────────────────────────────────────────────

  private _apply(
    state: CarromRemoteState | null,
    events: { type: string }[] = [],
    winner: WinnerInfo | null = null
  ): void {
    if (!state || this.destroyed) return;
    this.lastState = state;

    // Notify UI with full state first.
    this.onStateUpdate?.(state);

    // Process events.
    for (const ev of events) {
      const e = ev as Record<string, unknown>;
      switch (e["type"]) {
        case "coin-scored":
        case "coin-pocketed":
          if (this.onCoinPocketed && e["coinId"]) {
            this.onCoinPocketed(
              String(e["coinId"]),
              String(e["coinType"] ?? ""),
              Number(e["pocketIndex"] ?? 0)
            );
          }
          break;
        case "coin-returned":
          this.onCoinReturned?.(
            String(e["coinId"] ?? ""),
            String(e["coinType"] ?? "")
          );
          break;
        case "queen-returned":
          this.onQueenReturned?.(String(e["reason"] ?? "not-covered"));
          break;
        case "foul":
          this.onFoul?.(String(e["reason"] ?? "unknown"));
          break;
        case "turn-end":
        case "foul-turn-end": {
          const nextSeat = e["nextSeat"] !== undefined
            ? Number(e["nextSeat"])
            : state.currentSeat;
          this.onTurnEnd?.(nextSeat);
          break;
        }
        case "win":
          if (!this.winFired) {
            this.winFired = true;
            this.onWin?.(Number(e["seat"] ?? 0));
          }
          break;
      }
    }

    // Fallback win from finished flag or winner object.
    if ((state.finished || winner) && !this.winFired) {
      const seat =
        winner?.winnerSeats?.[0] ?? state.winnerSeats?.[0];
      if (seat !== undefined) {
        this.winFired = true;
        this.onWin?.(seat);
      }
    }
  }

  /**
   * Returns true if the latest state contains a strike action that we have NOT
   * yet animated.  Marks it as seen so subsequent calls return false.
   */
  consumeNewStrike(): {
    isNew: boolean;
    angle: number;
    power: number;
    bySeat: number;
    strikerPos: CarromStriker | null;
  } {
    const s = this.lastState;
    const action = s?.lastAction as
      | { type?: string; angle?: number; power?: number }
      | null
      | undefined;
    const actionAt = s?.lastActionAtMs ?? null;

    if (
      action?.type === "strike" &&
      actionAt !== null &&
      actionAt !== this.lastAnimatedMs
    ) {
      this.lastAnimatedMs = actionAt;
      return {
        isNew: true,
        angle: action.angle ?? 0,
        power: action.power ?? 1,
        bySeat: s?.lastActionSeat ?? 0,
        strikerPos: s?.strikerAtShotStart ?? s?.striker ?? null,
      };
    }
    return { isNew: false, angle: 0, power: 0, bySeat: 0, strikerPos: null };
  }
}
