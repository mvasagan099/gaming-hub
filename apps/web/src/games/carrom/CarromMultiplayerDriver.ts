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
import { useAuthStore } from "../../store/authStore";
import type { CarromState, CarromCoin, CarromStriker, CarromTrajectoryKeyframe } from "@gaming-hub/game-engine";

// ─── Public types ────────────────────────────────────────────────────────────

export interface CarromRemoteState extends CarromState {}

export interface ClientPoint {
  x: number;
  y: number;
}

export interface PocketEventInfo {
  coinId: string;
  coinType: string;
  pocketIndex: number;
}

export interface StrikeInfo {
  isNew: boolean;
  shotId: number | null;
  angle: number;
  power: number;
  bySeat: number;
  strikerPos: CarromStriker | null;
  pocketedCoinIds: string[];
  pocketEvents: PocketEventInfo[];
  keyframes?: CarromTrajectoryKeyframe[] | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Server board size */
export const SERVER_SIZE = 600;
/** Client canvas size used by CarromMultiplayer */
export const CLIENT_SIZE = 500;
/** Scale factor: server → client */
export const SCALE = CLIENT_SIZE / SERVER_SIZE; // 5/6

// ─── Single Authoritative Coordinate Transforms ──────────────────────────────

export function worldToView(
  worldX: number,
  worldY: number,
  mySeat: number
): ClientPoint {
  if (mySeat === 1) {
    return {
      x: (SERVER_SIZE - worldX) * SCALE,
      y: (SERVER_SIZE - worldY) * SCALE,
    };
  }
  return { x: worldX * SCALE, y: worldY * SCALE };
}

export function viewToWorld(
  viewX: number,
  viewY: number,
  mySeat: number
): ClientPoint {
  if (mySeat === 1) {
    return {
      x: SERVER_SIZE - viewX / SCALE,
      y: SERVER_SIZE - viewY / SCALE,
    };
  }
  return { x: viewX / SCALE, y: viewY / SCALE };
}

// Aliases for backwards compatibility
export const mapToClient = worldToView;
export const mapToServer = viewToWorld;

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

  private strikerSeq = 0;
  private lastReceivedStrikerSeq = -1;
  public onStrikerPositionUpdate?: (data: { seat: number; x: number; sequence: number }) => void;

  private handleRemoteStrikerPosition = (data: {
    seat: number;
    x: number;
    sequence: number;
  }) => {
    if (data.seat === this.mySeat) return;
    if (data.sequence <= this.lastReceivedStrikerSeq) return;
    this.lastReceivedStrikerSeq = data.sequence;
    this.onStrikerPositionUpdate?.(data);
  };

  start(): void {
    // Apply current state immediately so the board renders on mount.
    const s = useMultiplayerStore.getState();
    this._apply(
      s.gameState as CarromRemoteState | null,
      s.lastEvents,
      s.winner
    );

    // Attach socket listener for live striker position
    const socket = s.socket;
    if (socket) {
      socket.on("carrom:striker-position", this.handleRemoteStrikerPosition);
    }

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
    const socket = useMultiplayerStore.getState().socket;
    if (socket) {
      socket.off("carrom:striker-position", this.handleRemoteStrikerPosition);
    }
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
    return s.currentSeat === this.mySeat;
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
   * Send a live striker position update via low-latency socket event.
   * @param clientX  X in client canvas coordinates (0–500).
   */
  sendLiveStrikerPosition(clientX: number): void {
    this.strikerSeq++;
    const serverX = mapToServer(clientX, 0, this.mySeat).x;
    const socket = useMultiplayerStore.getState().socket;
    const room = useMultiplayerStore.getState().room;
    const user = useAuthStore.getState().user;
    if (socket && socket.connected && room) {
      socket.emit("carrom:striker-position", {
        roomId: room.id,
        matchId: room.matchId ?? undefined,
        playerId: user?.id,
        x: serverX,
        sequence: this.strikerSeq,
        timestamp: Date.now(),
      });
    }
  }

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
   * @param clientX     Optional striker X in client coordinates.
   */
  async sendStrike(
    localAngle: number,
    power: number,
    clientX?: number
  ): Promise<{ ok: boolean; error?: string }> {
    const serverAngle = localAngleToServer(localAngle, this.mySeat);
    const serverX = clientX !== undefined ? mapToServer(clientX, 0, this.mySeat).x : undefined;
    const action: { type: "strike"; angle: number; power: number; x?: number } = {
      type: "strike",
      angle: serverAngle,
      power,
    };
    if (serverX !== undefined) {
      action.x = serverX;
    }
    const res = await useMultiplayerStore
      .getState()
      .sendGameAction(action);
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
    this.lastEvents = events;

    // Notify UI with full state and events.
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

  public lastEvents: { type: string }[] = [];

  /**
   * Returns authoritative strike information if the latest state contains a
   * strike action that we have NOT yet animated. Marks it as seen so subsequent
   * calls return isNew: false.
   */
  consumeNewStrike(): StrikeInfo {
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

      // Extract all pocketed coins in authoritative state
      const pocketedCoinIds = s?.coins.filter((c) => c.pocketed).map((c) => c.id) ?? [];

      // Extract all pocket events
      const pocketEvents: PocketEventInfo[] = [];
      for (const ev of this.lastEvents) {
        const e = ev as Record<string, unknown>;
        if (
          (e.type === "coin-pocketed" || e.type === "coin-scored" || e.type === "striker-pocketed") &&
          (e.coinId || e.type === "striker-pocketed")
        ) {
          pocketEvents.push({
            coinId: String(e.coinId ?? "striker"),
            coinType: String(e.coinType ?? "striker"),
            pocketIndex: Number(e.pocketIndex ?? 0),
          });
        }
      }

      // Extract trajectory keyframes from lastTrajectory or events
      let keyframes = s?.lastTrajectory;
      if (!keyframes) {
        const trajEv = this.lastEvents.find(
          (e) =>
            (e as Record<string, unknown>).type === "shot-trajectory" ||
            (e as Record<string, unknown>).type === "carrom:shot-start"
        ) as { keyframes?: CarromTrajectoryKeyframe[] } | undefined;
        if (trajEv?.keyframes) keyframes = trajEv.keyframes;
      }

      return {
        isNew: true,
        shotId: actionAt,
        angle: action.angle ?? 0,
        power: action.power ?? 1,
        bySeat: s?.lastActionSeat ?? 0,
        strikerPos: s?.strikerAtShotStart ?? s?.striker ?? null,
        pocketedCoinIds,
        pocketEvents,
        keyframes,
      };
    }

    return {
      isNew: false,
      shotId: null,
      angle: 0,
      power: 0,
      bySeat: 0,
      strikerPos: null,
      pocketedCoinIds: [],
      pocketEvents: [],
    };
  }
}
