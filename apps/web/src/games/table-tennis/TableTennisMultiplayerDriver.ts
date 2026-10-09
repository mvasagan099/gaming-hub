import { useMultiplayerStore, type WinnerInfo } from "../../store/multiplayerStore";
import type { TableTennisState, TableTennisBall } from "@gaming-hub/game-engine";

export interface TableTennisRemoteState extends TableTennisState {}

interface TableTennisRemoteEvent {
  type: string;
  [key: string]: unknown;
}

export default class TableTennisMultiplayerDriver {
  private readonly mySeat: number | null;
  private readonly names: string[];
  private readonly matchId?: string;
  private readonly roomId?: string;
  
  private lastState: TableTennisRemoteState | null = null;
  private destroyed = false;
  private restoreInput = true;
  private awaitingReconnect = false;
  private pendingServe = false;
  private completed = false;
  private deliveredPoint = -1;
  private moveRequest = 0;
  // Reliable ordered actions may overlap RTT, but a stalled link cannot grow the queue.
  // IDs remain unique across reconnects so old ACKs cannot release current slots.
  private inFlightMoves = new Set<number>();
  private readonly maxInFlightMoves = 8;
  private unsubscribe: (() => void) | null = null;
  private physicsInterval: ReturnType<typeof setInterval> | null = null;
  private onStateUpdate: ((state: TableTennisRemoteState, restoreInput: boolean) => void) | null = null;
  private onServeNeeded: (() => void) | null = null;
  private onPointScored: ((winnerSeat: number, reason: string) => void) | null = null;
  private onMatchComplete: ((winnerSeat: number | null) => void) | null = null;
  
  private pendingPaddleMove: { y: number; velocity: number } | null = null;
  private lastPaddleSent: number = 0;
  private lastSentY: number = -999;
  private readonly paddleSendInterval: number = 40;

  constructor(mySeat: number | null, names: string[], matchId?: string, roomId?: string) {
    this.mySeat = mySeat;
    this.names = names;
    this.matchId = matchId;
    this.roomId = roomId;
  }
  
  start(): void {
    if (this.destroyed || this.unsubscribe) return;
    
    this.unsubscribe = useMultiplayerStore.subscribe((state, prev) => {
      if (this.destroyed) return;
      
      if ((this.matchId && state.matchId !== this.matchId) || (this.roomId && state.room?.id !== this.roomId)) return;
      if (state.status !== prev.status && state.status !== 'connected') {
        this.awaitingReconnect = true;
        this.moveRequest++;
        this.inFlightMoves.clear();
        this.pendingPaddleMove = null;
      }
      if (state.status === 'connected' && prev.status !== 'connected') {
        this.restoreInput = true;
        this.moveRequest++;
        this.inFlightMoves.clear();
        this.pendingServe = false;
        this.pendingPaddleMove = null;
        void state.requestFullStateSync?.().catch(() => undefined);
      }
      if (state.renderKey !== prev.renderKey || state.winner !== prev.winner) {
        this.applyState(state.gameState as unknown as TableTennisRemoteState | null, state.lastEvents, state.winner);
      }
    });
    
    this.physicsInterval = setInterval(() => {
      if (this.pendingPaddleMove && !this.destroyed && this.inFlightMoves.size < this.maxInFlightMoves) {
        const now = Date.now();
        if (now - this.lastPaddleSent >= this.paddleSendInterval && this.inFlightMoves.size < this.maxInFlightMoves) {
          const move = this.pendingPaddleMove;
          this.pendingPaddleMove = null;
          this.sendPaddleMoveImmediate(move.y, move.velocity);
          this.lastPaddleSent = now;
        }
      }
    }, 10);
    
    const current = useMultiplayerStore.getState();
    if ((!this.matchId || current.matchId === this.matchId) && (!this.roomId || current.room?.id === this.roomId)) {
      this.applyState(current.gameState as unknown as TableTennisRemoteState | null, [], current.winner);
    }
  }
  
  stop(): void {

    this.destroyed = true;
    this.inFlightMoves.clear();
    this.pendingPaddleMove = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.physicsInterval) {
      clearInterval(this.physicsInterval);
      this.physicsInterval = null;
    }
  }
  
  setOnStateUpdate(handler: (state: TableTennisRemoteState, restoreInput: boolean) => void): void {
    this.onStateUpdate = handler;
  }
  
  setOnServeNeeded(handler: () => void): void {
    this.onServeNeeded = handler;
  }
  
  setOnPointScored(handler: (winnerSeat: number, reason: string) => void): void {
    this.onPointScored = handler;
  }
  
  setOnMatchComplete(handler: (winnerSeat: number | null) => void): void {
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
    const restoreInput = this.restoreInput;
    if (restoreInput) this.lastSentY = this.mySeat == null ? -999 : s.players[this.mySeat]?.paddleY ?? -999;
    this.restoreInput = false;
    this.awaitingReconnect = false;
    if (s.phase !== "serve" || s.ball?.inPlay || s.finished) this.pendingServe = false;
    
    if (this.onStateUpdate) {
      this.onStateUpdate(s, restoreInput);
    }
    
    for (const event of events) {
      if (event.type === "point-scored" && s.totalPointsPlayed > this.deliveredPoint) {
        this.deliveredPoint = s.totalPointsPlayed;
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
    
    if ((s.finished || winner) && !this.completed) {
      this.completed = true;
      const winnerSeat = winner?.winnerSeats?.[0] ?? s.winnerSeats?.[0];
      if (this.onMatchComplete) {
        this.onMatchComplete(winnerSeat ?? null);
      }
    }
  }
  
  sendPaddleMove(y: number, velocity: number): void {
    if (this.mySeat == null || this.destroyed || this.awaitingReconnect || this.lastState?.paused || this.lastState?.finished) return;
    if (Math.abs(y - this.lastSentY) < 0.5) {
      this.pendingPaddleMove = null;
      return;
    }
    this.pendingPaddleMove = { y, velocity };
    const now = Date.now();
    if (now - this.lastPaddleSent >= this.paddleSendInterval && this.inFlightMoves.size < this.maxInFlightMoves) {
      this.pendingPaddleMove = null;
      this.sendPaddleMoveImmediate(y, velocity);
      this.lastPaddleSent = now;
    }
  }

  private sendPaddleMoveImmediate(y: number, velocity: number): void {
    if (this.mySeat == null || this.destroyed || this.awaitingReconnect || this.lastState?.paused || this.lastState?.finished) return;
    if (Math.abs(y - this.lastSentY) < 0.5) return;
    this.lastSentY = y;
    const request = ++this.moveRequest;
    this.inFlightMoves.add(request);
    const retry = () => { if (!this.destroyed && this.moveRequest === request) this.lastSentY = -999; };
    useMultiplayerStore.getState().sendGameAction({
      type: "paddle-move",
      y,
      velocity,
    }).then(result => { if (!result.ok) retry(); }).catch(retry).finally(() => { this.inFlightMoves.delete(request); });
  }
  
  sendServe(angle: number = 0, power: number = 5.25): void {
    if (!this.canServe() || this.pendingServe) return;
    this.pendingServe = true;
    useMultiplayerStore.getState().sendGameAction({ type: "serve", angle, power })
      .then(result => { if (!result.ok) this.pendingServe = false; })
      .catch(() => { this.pendingServe = false; });
  }

  sendReady(): void {
    if (this.mySeat == null || this.destroyed || this.lastState?.finished) return;
    void useMultiplayerStore.getState().sendGameAction({ type: "ready" }).catch(() => undefined);
  }
  
  canServe(): boolean {
    if (this.mySeat == null || this.destroyed) return false;
    const s = this.lastState;
    if (!s) return false;
    return s.phase === "serve" && s.waitingForServe && s.servingSeat === this.mySeat
      && !s.finished && !s.paused && !this.awaitingReconnect && s.players.every(p => p.isReady);
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
    return this.lastState?.matchPointSeat != null;
  }
  
  isDeuce(): boolean {
    return this.lastState?.deuce ?? false;
  }
}
