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
  public onStateUpdate: ((s: CarromRemoteState, stateVersion?: number) => void) | null = null;
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
  private previewSocket: ReturnType<typeof useMultiplayerStore.getState>["socket"] = null;
  private unsubscribe: (() => void) | null = null;
  private winFired = false;

  // Each accepted strike advances the authoritative turn, even for an extra
  // turn. Timestamps can collide and cannot identify a delivery reliably.
  private lastAnimatedTurn = 0;
  private appliedVersion = -1;
  private matchId: string | null = null;
  private roomId: string | null = null;

  constructor(mySeat: number, playerNames: string[]) {
    this.mySeat = mySeat;
    this.playerNames = playerNames;
  }

  private strikerSeq = 0;
  private lastReceivedSequenceByTurn = new Map<string, number>();
  public onStrikerPositionUpdate?: (data: {
    seat: number;
    x: number;
    sequence: number;
    turnNumber?: number;
  }) => void;

  private handleRemoteStrikerPosition = (data: {
    matchId?: string;
    roomId?: string;
    seat: number;
    x: number;
    sequence: number;
    turnNumber?: number;
  }) => {
    const current = useMultiplayerStore.getState();
    if (data.matchId && data.matchId !== current.matchId) return;
    if (data.roomId && data.roomId !== current.room?.id) return;
    if (data.seat === this.mySeat || data.seat !== this.lastState?.currentSeat) return;
    if (!Number.isFinite(data.x) || !Number.isSafeInteger(data.sequence) || data.sequence < 0) return;
    const currentTurn = this.lastState?.turnNumber ?? 0;
    if (typeof data.turnNumber === "number" && data.turnNumber !== currentTurn) {
      return;
    }
    const turnKey = `${current.matchId}:${data.seat}:${data.turnNumber ?? currentTurn}`;
    const lastSeq = this.lastReceivedSequenceByTurn.get(turnKey) ?? -1;
    if (typeof data.sequence === "number" && data.sequence <= lastSeq) return;
    if (typeof data.sequence === "number") {
      this.lastReceivedSequenceByTurn.set(turnKey, data.sequence);
    }
    this.onStrikerPositionUpdate?.(data);
  };

  start(): void {
    if (this.destroyed || this.unsubscribe) return;
    // Apply current state immediately so the board renders on mount.
    const s = useMultiplayerStore.getState();
    // Mounts and reconnects should render the settled board immediately.
    const initial = s.gameState as CarromRemoteState | null;
    this.matchId = s.matchId;
    this.roomId = s.room?.id ?? null;
    if (initial?.lastAction?.type === "strike") this.lastAnimatedTurn = initial.turnNumber;
    this._apply(
      s.gameState as CarromRemoteState | null,
      [], // A restored board must not replay historical effects.
      s.winner,
      s.lastStateVersion
    );

    // Attach socket listener for live striker position
    this.bindPreviewSocket(s.socket);

    // Subscribe to future updates.
    this.unsubscribe = useMultiplayerStore.subscribe((state, prev) => {
      if (this.destroyed || state.room?.id !== this.roomId) return;
      if (state.matchId !== this.matchId) {
        this.matchId = state.matchId;
        this.lastAnimatedTurn = 0;
        this.appliedVersion = -1;
        this.lastState = null;
        this.processedEventIds.clear();
        this.winFired = false;
      }
      if (state.status === 'connected' && prev.status !== 'connected') void this.requestStateSync();
      if (state.socket !== prev.socket) this.bindPreviewSocket(state.socket);
      if (
        state.renderKey !== prev.renderKey ||
        state.winner !== prev.winner ||
        state.lastStateVersion !== prev.lastStateVersion
      ) {
        this._apply(
          state.gameState as CarromRemoteState | null,
          state.lastEvents !== prev.lastEvents ? state.lastEvents : [],
          state.winner,
          state.lastStateVersion
        );
      }
    });
  }

  private bindPreviewSocket(socket: ReturnType<typeof useMultiplayerStore.getState>["socket"]): void {
    if (socket === this.previewSocket) return;
    this.previewSocket?.off("carrom:striker-position", this.handleRemoteStrikerPosition);
    this.previewSocket = socket;
    socket?.on("carrom:striker-position", this.handleRemoteStrikerPosition);
  }

  stop(): void {
    this.destroyed = true;
    this.bindPreviewSocket(null);
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
    const currentTurn = this.lastState?.turnNumber ?? 0;
    if (socket && socket.connected && room) {
      socket.emit("carrom:striker-position", {
        roomId: room.id,
        matchId: room.matchId ?? undefined,
        playerId: user?.id,
        turnNumber: currentTurn,
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
  async sendPlaceStriker(clientX: number): Promise<{ ok: boolean; error?: string }> {
    const serverX = mapToServer(clientX, 0, this.mySeat).x;
    try {
      const res = await useMultiplayerStore
        .getState()
        .sendGameAction({ type: "place-striker", x: serverX });
      if (!res.ok) {
        return { ok: false, error: res.error ?? "Failed to place striker" };
      }
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || "Failed to place striker" };
    }
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
  ): Promise<{ ok: boolean; error?: string; uncertain?: boolean }> {
    const beforeTurn = this.lastState?.turnNumber;
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
    try {
      const res = await useMultiplayerStore.getState().sendGameAction(action);
      if (!res.ok) {
        return { ok: false, error: res.error ?? "Shot rejected" };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, uncertain: true, error: error instanceof Error ? error.message : "Could not send shot" };
    }
  }

  async requestStateSync(): Promise<void> {
    const current = useMultiplayerStore.getState();
    if (current.matchId !== this.matchId || current.room?.id !== this.roomId) return;
    try { await current.requestFullStateSync?.(this.matchId ?? undefined); } catch { /* reconnect retries */ }
  }

  // ── Internal state application ───────────────────────────────────────────────

  private processedEventIds = new Set<string>();

  private _apply(
    state: CarromRemoteState | null,
    events: { type: string }[] = [],
    winner: WinnerInfo | null = null,
    stateVersion?: number
  ): void {
    if (!state || this.destroyed) return;
    // Reject stale state before any animation or event side effects.
    if (stateVersion != null && stateVersion < this.appliedVersion) return;
    if (this.lastState && state.turnNumber < this.lastState.turnNumber) return;
    if (stateVersion != null) this.appliedVersion = stateVersion;
    this.lastState = state;
    this.lastEvents = events;

    // Notify UI with full state, events, and stateVersion.
    this.onStateUpdate?.(state, stateVersion);

    // Process events idempotently.
    for (const ev of events) {
      const e = ev as Record<string, unknown>;
      const evId = String(
        e["id"] ??
        `${state.lastActionAtMs ?? state.version}:${e["type"]}:${e["coinId"] ?? e["seat"] ?? e["reason"] ?? ""}`
      );
      if (this.processedEventIds.has(evId)) {
        console.warn("[CARROM] DUPLICATE_EVENT_IGNORED", evId);
        continue;
      }
      this.processedEventIds.add(evId);

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
      !(s as CarromState & { trajectoryOmitted?: boolean })?.trajectoryOmitted &&
      actionAt !== null &&
      s!.turnNumber > this.lastAnimatedTurn
    ) {
      this.lastAnimatedTurn = s!.turnNumber;

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
        shotId: s!.turnNumber,
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
