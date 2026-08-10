import { useMultiplayerStore, type WinnerInfo } from "../../store/multiplayerStore";
import type { TableTennisState, TableTennisBall, TableTennisAction } from "@gaming-hub/game-engine";

export interface TableTennisRemoteState extends TableTennisState {}

interface TableTennisRemoteEvent {
  type: string;
  [key: string]: unknown;
}

export default class TableTennisMultiplayerDriver {
  private readonly mySeat: number | null;
  private readonly names: string[];
  
  private lastState: TableTennisRemoteState | null = null;
  private destroyed = false;
  private unsubscribe: (() => void) | null = null;
  private physicsInterval: ReturnType<typeof setInterval> | null = null;
  private onStateUpdate: ((state: TableTennisRemoteState) => void) | null = null;
  private onServeNeeded: (() => void) | null = null;
  private onPointScored: ((winnerSeat: number, reason: string) => void) | null = null;
  private onMatchComplete: ((winnerSeat: number) => void) | null = null;
  
  private pendingPaddleMove: { y: number; velocity: number } | null = null;
  private lastPaddleSent: number = 0;
  private readonly paddleSendInterval: number = 16;

  constructor(mySeat: number | null, names: string[]) {
    this.mySeat = mySeat;
    this.names = names;
  }
  
  start(): void {
    console.log("[TableTennisMultiplayerDriver] Starting driver, mySeat:", this.mySeat);
    
    this.unsubscribe = useMultiplayerStore.subscribe((state, prev) => {
      if (this.destroyed) return;
      
      if (state.renderKey !== prev.renderKey || state.winner !== prev.winner) {
        this.applyState(state.gameState as unknown as TableTennisRemoteState | null, state.lastEvents, state.winner);
      }
    });
    
    setInterval(() => {
      if (this.pendingPaddleMove && !this.destroyed) {
        const now = Date.now();
        if (now - this.lastPaddleSent >= this.paddleSendInterval) {
          this.sendPaddleMoveImmediate(this.pendingPaddleMove.y, this.pendingPaddleMove.velocity);
          this.lastPaddleSent = now;
        }
      }
    }, 16);
    
    const current = useMultiplayerStore.getState();
    this.applyState(current.gameState as unknown as TableTennisRemoteState | null, current.lastEvents, current.winner);
  }
  
  stop(): void {
    console.log("[TableTennisMultiplayerDriver] Stop called");
    this.destroyed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.physicsInterval) {
      clearInterval(this.physicsInterval);
      this.physicsInterval = null;
    }
  }
  
  setOnStateUpdate(handler: (state: TableTennisRemoteState) => void): void {
    this.onStateUpdate = handler;
  }
  
  setOnServeNeeded(handler: () => void): void {
    this.onServeNeeded = handler;
  }
  
  setOnPointScored(handler: (winnerSeat: number, reason: string) => void): void {
    this.onPointScored = handler;
  }
  
  setOnMatchComplete(handler: (winnerSeat: number) => void): void {
    this.onMatchComplete = handler;
  }
  
  public getLatestState(): TableTennisRemoteState | null {
    return this.lastState;
  }
  
  public applyState(
    state: TableTennisRemoteState | null,
    events: { type: string }[] | undefined = [],
    winner: WinnerInfo | null = null,
  ): void {
    if (!state || this.destroyed) return;
    
    const s = state as TableTennisRemoteState;
    this.lastState = s;
    
    console.log("[TableTennisMultiplayerDriver] State updated:", {
      phase: s.phase,
      servingSeat: s.servingSeat,
      scores: s.players?.map(p => p.score),
      rallyCount: s.rallyCount,
      ball: s.ball ? { x: s.ball.x, y: s.ball.y, inPlay: s.ball.inPlay } : null,
    });
    
    if (this.onStateUpdate) {
      this.onStateUpdate(s);
    }
    
    for (const event of events) {
      if (event.type === "point-scored") {
        const winnerSeat = (event as any).winnerSeat;
        const reason = (event as any).reason || "miss";
        if (this.onPointScored) {
          this.onPointScored(winnerSeat, reason);
        }
      }
    }
    
    if (s.waitingForServe && s.servingSeat === this.mySeat && this.onServeNeeded) {
      this.onServeNeeded();
    }
    
    if (s.finished || winner) {
      const winnerSeat = winner?.winnerSeats?.[0] ?? s.winnerSeats?.[0];
      if (winnerSeat !== undefined && this.onMatchComplete) {
        this.onMatchComplete(winnerSeat);
      }
    }
  }
  
  sendPaddleMove(y: number, velocity: number): void {
    this.pendingPaddleMove = { y, velocity };
  }
  
  private sendPaddleMoveImmediate(y: number, velocity: number): void {
    if (this.mySeat == null || this.destroyed) return;
    
    useMultiplayerStore.getState().sendGameAction({
      type: "paddle-move",
      y,
      velocity,
    }).catch(err => {
      console.error("[TableTennisMultiplayerDriver] Paddle move failed:", err);
    });
  }
  
  sendServe(angle: number = 0, power: number = 5): void {
    console.log("[TableTennisMultiplayerDriver] sendServe:", { angle, power, mySeat: this.mySeat });
    
    if (this.mySeat == null) {
      console.error("[TableTennisMultiplayerDriver] Cannot serve: no seat assigned");
      return;
    }
    
    useMultiplayerStore.getState().sendGameAction({
      type: "serve",
      angle,
      power,
    }).then(res => {
      if (!res.ok && res.error) {
        console.error("[TableTennisMultiplayerDriver] Serve failed:", res.error);
      }
    });
  }
  
  sendReady(): void {
    if (this.mySeat == null) return;
    
    useMultiplayerStore.getState().sendGameAction({
      type: "ready",
    });
  }
  
  canServe(): boolean {
    if (this.mySeat == null || this.destroyed) return false;
    const s = this.lastState;
    if (!s) return false;
    return s.waitingForServe && s.servingSeat === this.mySeat && !s.finished;
  }
  
  isMyTurn(): boolean {
    return this.canServe();
  }
  
  getOpponentName(): string {
    if (this.mySeat == null) return "Opponent";
    const opponentSeat = 1 - this.mySeat;
    return this.names[opponentSeat] ?? `Player ${opponentSeat + 1}`;
  }
  
  getPlayerName(seat: number): string {
    return this.names[seat] ?? `Player ${seat + 1}`;
  }
  
  getMyPaddleY(): number {
    if (this.mySeat == null || !this.lastState) return 160;
    return this.lastState.players[this.mySeat]?.paddleY ?? 160;
  }
  
  getOpponentPaddleY(): number {
    if (this.mySeat == null || !this.lastState) return 160;
    const opponentSeat = 1 - this.mySeat;
    return this.lastState.players[opponentSeat]?.paddleY ?? 160;
  }
  
  getBall(): TableTennisBall | null {
    return this.lastState?.ball ?? null;
  }
  
  getScores(): { player1: number; player2: number } {
    if (!this.lastState) return { player1: 0, player2: 0 };
    return {
      player1: this.lastState.players[0]?.score ?? 0,
      player2: this.lastState.players[1]?.score ?? 0,
    };
  }
  
  getSets(): { player1: number; player2: number } {
    if (!this.lastState) return { player1: 0, player2: 0 };
    return {
      player1: this.lastState.players[0]?.setsWon ?? 0,
      player2: this.lastState.players[1]?.setsWon ?? 0,
    };
  }
  
  getCurrentServer(): number {
    return this.lastState?.servingSeat ?? 0;
  }
  
  getPhase(): string {
    return this.lastState?.phase ?? "waiting";
  }
  
  isMatchPoint(): boolean {
    return this.lastState?.matchPointSeat !== null;
  }
  
  isDeuce(): boolean {
    return this.lastState?.deuce ?? false;
  }
}
