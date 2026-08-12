import { useMultiplayerStore, type WinnerInfo } from "../../store/multiplayerStore";
import type { CarromState, CarromCoin, CarromStriker } from "@gaming-hub/game-engine";

export interface CarromRemoteState extends CarromState {}

interface CarromRemoteEvent {
  type: string;
  [key: string]: unknown;
}

export default class CarromMultiplayerDriver {
  private readonly mySeat: number | null;
  private readonly names: string[];
  
  public lastState: CarromRemoteState | null = null;
  private destroyed = false;
  private unsubscribe: (() => void) | null = null;
  private onStateUpdate: ((state: CarromRemoteState) => void) | null = null;
  private onTurnChange: ((currentSeat: number) => void) | null = null;
  private onCoinPocketed: ((coinId: string, coinType: string, pocketIndex: number) => void) | null = null;
  private onStrikerPlaced: ((x: number, y: number, seat: number) => void) | null = null;
  private onStrikerShot: ((x: number, y: number, vx: number, vy: number) => void) | null = null;
  private onFoul: ((reason: string) => void) | null = null;
  private onWin: ((winnerSeat: number) => void) | null = null;
  private onStrikerPlacementPhase: ((isPlacement: boolean, seat: number) => void) | null = null;
  private onCoinReturned: ((coinId: string, coinType: string) => void) | null = null;
  private onQueenReturned: ((reason: string) => void) | null = null;
  private winFired = false; // Prevent duplicate win callbacks
  
  constructor(mySeat: number | null, names: string[]) {
    this.mySeat = mySeat;
    this.names = names;
  }
  
  start(): void {
    console.log("[CarromMultiplayerDriver] Starting driver, mySeat:", this.mySeat);
    
    this.unsubscribe = useMultiplayerStore.subscribe((state, prev) => {
      if (this.destroyed) return;
      
      if (state.renderKey !== prev.renderKey || state.winner !== prev.winner) {
        this.applyState(state.gameState as unknown as CarromRemoteState | null, state.lastEvents, state.winner);
      }
    });
    
    const current = useMultiplayerStore.getState();
    this.applyState(current.gameState as unknown as CarromRemoteState | null, current.lastEvents, current.winner);
  }
  
  stop(): void {
    console.log("[CarromMultiplayerDriver] Stop called");
    this.destroyed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
  
  setOnStateUpdate(handler: (state: CarromRemoteState) => void): void {
    this.onStateUpdate = handler;
  }
  
  setOnTurnChange(handler: (currentSeat: number) => void): void {
    this.onTurnChange = handler;
  }
  
  setOnCoinPocketed(handler: (coinId: string, coinType: string, pocketIndex: number) => void): void {
    this.onCoinPocketed = handler;
  }
  
  setOnStrikerPlaced(handler: (x: number, y: number, seat: number) => void): void {
    this.onStrikerPlaced = handler;
  }
  
  setOnStrikerShot(handler: (x: number, y: number, vx: number, vy: number) => void): void {
    this.onStrikerShot = handler;
  }
  
  setOnFoul(handler: (reason: string) => void): void {
    this.onFoul = handler;
  }
  
  setOnWin(handler: (winnerSeat: number) => void): void {
    this.onWin = handler;
  }
  
  setOnStrikerPlacementPhase(handler: (isPlacement: boolean, seat: number) => void): void {
    this.onStrikerPlacementPhase = handler;
  }

  setOnCoinReturned(handler: (coinId: string, coinType: string) => void): void {
    this.onCoinReturned = handler;
  }

  setOnQueenReturned(handler: (reason: string) => void): void {
    this.onQueenReturned = handler;
  }
  
  public getLatestState(): CarromRemoteState | null {
    return this.lastState;
  }
  
  public applyState(
    state: CarromRemoteState | null,
    events: { type: string }[] | undefined = [],
    winner: WinnerInfo | null = null,
  ): void {
    if (!state || this.destroyed) return;
    
    const s = state as CarromRemoteState;
    this.lastState = s;
    
    console.log("[CARROM TURN] Driver received currentSeat:", s.currentSeat);
    console.log("[CARROM TURN] My seat:", this.mySeat);
    console.log("[CARROM TURN] Is my turn:", s.currentSeat === this.mySeat);
    console.log("[CarromMultiplayerDriver] State updated:", {
      currentSeat: s.currentSeat,
      strikerPlacementPhase: s.strikerPlacementPhase,
      strikerPlacementSeat: s.strikerPlacementSeat,
      finished: s.finished,
    });
    
    if (this.onStateUpdate) {
      this.onStateUpdate(s);
    }
    
    for (const event of events) {
      console.log("[CarromMultiplayerDriver] Event:", event.type, event);
      
      if (event.type === "coin-scored" || event.type === "coin-pocketed") {
        const coinId = (event as any).coinId;
        const coinType = (event as any).coinType;
        const pocketIndex = (event as any).pocketIndex;
        if (this.onCoinPocketed && coinId) {
          this.onCoinPocketed(coinId, coinType, pocketIndex);
        }
      }
      
      if (event.type === "striker-placed") {
        const x = (event as any).x;
        const y = (event as any).y;
        const seat = (event as any).seat;
        if (this.onStrikerPlaced) {
          this.onStrikerPlaced(x, y, seat);
        }
      }
      
      if (event.type === "foul") {
        const reason = (event as any).reason || "unknown";
        if (this.onFoul) {
          this.onFoul(reason);
        }
      }

      if (event.type === "coin-returned") {
        const coinId = (event as any).coinId;
        const coinType = (event as any).coinType;
        if (this.onCoinReturned) {
          this.onCoinReturned(coinId, coinType);
        }
      }

      if (event.type === "queen-returned") {
        const reason = (event as any).reason || "not-covered";
        if (this.onQueenReturned) {
          this.onQueenReturned(reason);
        }
      }
      
      if (event.type === "win") {
        const winnerSeat = (event as any).seat;
        if (this.onWin && !this.winFired) {
          this.winFired = true;
          this.onWin(winnerSeat);
        }
      }
      
      if (event.type === "turn-end" || event.type === "foul-turn-end") {
        const nextSeat = (event as any).nextSeat ?? s.currentSeat;
        if (nextSeat !== s.currentSeat) {
          console.error(`[CARROM TURN ERROR] event.nextSeat (${nextSeat}) !== state.currentSeat (${s.currentSeat})`);
        }
        if (this.onTurnChange) {
          this.onTurnChange(nextSeat);
        }
      }
    }
    
    if (this.onStrikerPlacementPhase) {
      this.onStrikerPlacementPhase(s.strikerPlacementPhase, s.strikerPlacementSeat ?? 0);
    }
    
    // Fallback: if the game is finished but no win event arrived, fire win once
    if ((s.finished || winner) && !this.winFired) {
      const winnerSeat = winner?.winnerSeats?.[0] ?? s.winnerSeats?.[0];
      if (winnerSeat !== undefined && this.onWin) {
        this.winFired = true;
        this.onWin(winnerSeat);
      }
    }
  }
  
  sendPlaceStriker(x: number): void {
    console.log("[CarromMultiplayerDriver] sendPlaceStriker:", x, "mySeat:", this.mySeat);
    
    if (this.mySeat == null) {
      console.error("[CarromMultiplayerDriver] Cannot place striker: no seat assigned");
      return;
    }
    
    let serverX = (x / 400) * 600;
    if (this.mySeat === 1) {
      serverX = 600 - serverX;
    }
    
    useMultiplayerStore.getState().sendGameAction({
      type: "place-striker",
      x: serverX,
    }).then(res => {
      if (!res.ok && res.error) {
        console.error("[CarromMultiplayerDriver] Place striker failed:", res.error);
      }
    });
  }
  
  async sendStrike(angle: number, power: number): Promise<{ ok: boolean; error?: string }> {
    console.log("[CarromMultiplayerDriver] sendStrike:", { angle, power, mySeat: this.mySeat });
    
    if (this.mySeat == null) {
      console.error("[CarromMultiplayerDriver] Cannot strike: no seat assigned");
      return { ok: false, error: "No seat assigned" };
    }
    
    const TWO_PI = Math.PI * 2;
    // Normalize to [0, 2π) so the engine's |angle| ≤ 2π check always passes
    let serverAngle = ((angle % TWO_PI) + TWO_PI) % TWO_PI;
    if (this.mySeat === 1) {
      // Seat 1 shoots from the opposite side — flip the angle
      serverAngle = (serverAngle + Math.PI) % TWO_PI;
    }
    
    // NOTE: no auto place-striker here. The pointer-down gesture in the game
    // component already sends the current placement with the correct local→server
    // coordinate mapping. Re-using lastState.striker here would (a) treat server
    // coordinates as local coordinates, and (b) overwrite a freshly confirmed
    // placement with a stale position — both would corrupt the shot.
    
    const res = await useMultiplayerStore.getState().sendGameAction({
      type: "strike",
      angle: serverAngle,
      power,
    });
    
    if (!res.ok && res.error) {
      console.error("[CarromMultiplayerDriver] Strike failed:", res.error);
    }
    return res;
  }
  
  canPlaceStriker(): boolean {
    if (this.mySeat == null || this.destroyed) return false;
    const s = this.lastState;
    if (!s) return false;
    return s.strikerPlacementPhase && s.strikerPlacementSeat === this.mySeat && !s.finished;
  }
  
  canStrike(): boolean {
    if (this.mySeat == null || this.destroyed) return false;
    const s = this.lastState;
    if (!s) return false;
    return !s.strikerPlacementPhase && s.currentSeat === this.mySeat && !s.finished;
  }
  
  isMyTurn(): boolean {
    if (this.mySeat == null || this.destroyed) return false;
    const s = this.lastState;
    if (!s || s.finished) return false;
    return s.currentSeat === this.mySeat;
  }
  
  getOpponentName(): string {
    if (this.mySeat == null) return "Opponent";
    const opponentSeat = 1 - this.mySeat;
    return this.names[opponentSeat] ?? `Player ${opponentSeat + 1}`;
  }
  
  getPlayerName(seat: number): string {
    return this.names[seat] ?? `Player ${seat + 1}`;
  }
  
  getCoins(): CarromCoin[] {
    return this.lastState?.coins ?? [];
  }
  
  getStriker(): CarromStriker | null {
    return this.lastState?.striker ?? null;
  }
  
  getScore(seat: number): number {
    if (!this.lastState) return 0;
    const player = this.lastState.players.find(p => p.seat === seat);
    return player?.score ?? 0;
  }
  
  getCurrentSeat(): number {
    return this.lastState?.currentSeat ?? 0;
  }
  
  isStrikerPlacementPhase(): boolean {
    return this.lastState?.strikerPlacementPhase ?? true;
  }
  
  getStrikerPlacementSeat(): number {
    return this.lastState?.strikerPlacementSeat ?? 0;
  }
  
  getMyColor(): "white" | "black" {
    return this.mySeat === 0 ? "white" : "black";
  }
  
  getOpponentColor(): "white" | "black" {
    return this.mySeat === 0 ? "black" : "white";
  }
  
  getPhase(): string {
    if (this.lastState?.finished) return "finished";
    if (this.lastState?.strikerPlacementPhase) return "placement";
    return "aiming";
  }
}
