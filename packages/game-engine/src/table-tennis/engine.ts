import type { EngineActionResult, EngineEvent, EnginePlayer, RandomSource } from "../types";
import { MultiplayerGameEngine, type BaseState } from "../base/MultiplayerGameEngine";
import type {
  TableTennisState,
  TableTennisAction,
  TableTennisBall,
  TableTennisPlayer,
  TableTennisEngineOptions,
  TableTennisPhase,
} from "./types";

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 400;
const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = 80;
const BALL_RADIUS = 6;
const PADDLE_MARGIN = 20;
const MAX_PADDLE_SPEED = 8;
const BALL_SPEED_INCREMENT = 1.05;
const MAX_BALL_SPEED = 12;

type InternalState = TableTennisState & BaseState;

export class TableTennisEngine extends MultiplayerGameEngine<InternalState, TableTennisAction> {
  readonly gameId = "table-tennis" as const;

  private readonly rules = {
    pointsPerSet: 11,
    setsToWin: 3,
    winByTwo: true,
    maxSpeed: MAX_BALL_SPEED,
    minSpeed: 5,
  };

  private physicsInterval: ReturnType<typeof setInterval> | null = null;

  constructor(players: EnginePlayer[], rng?: RandomSource, options?: TableTennisEngineOptions) {
    const turnTimer = options?.turnTimer ?? { turnDurationMs: 30000, warningThresholdMs: 5000 };
    const matchTimer = options?.matchTimer ?? { matchDurationMs: 600000, warningThresholdMs: 60000 };
    super(players, rng, {
      turnTimer,
      matchTimer,
      enableResign: options?.enableResign ?? true,
      enableDraw: false,
      enablePause: options?.enablePause ?? true,
      enableRematch: true,
      now: options?.now,
    });

    if (options?.rules) {
      if (options.rules.pointsPerSet) this.rules.pointsPerSet = options.rules.pointsPerSet;
      if (options.rules.setsToWin) this.rules.setsToWin = options.rules.setsToWin;
    }
  }

  protected getInitialSeat(): number {
    return 0;
  }

  protected initBaseState(): Omit<InternalState, keyof BaseState> {
    const players: TableTennisPlayer[] = this.players.map((p, idx) => ({
      seat: idx,
      name: `Player ${idx + 1}`,
      score: 0,
      setsWon: 0,
      paddleY: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
      paddleVelocity: 0,
      pointsWon: 0,
      isReady: false,
    }));

    const firstServer = this.randomInt(0, 1);

    return {
      phase: "waiting",
      servingSeat: firstServer,
      players,
      rules: this.rules,
      currentSet: 1,
      setScores: [0, 0],
      ball: null,
      rallyCount: 0,
      pointHistory: [],
      lastPointWinner: null,
      lastPointReason: null,
      matchPointSeat: null,
      deuce: false,
      totalPointsPlayed: 0,
      serverCount: 0,
      countdownValue: null,
      canServe: false,
      waitingForServe: true,
      pointStartTime: null,
    };
  }

  protected validateGameAction(action: TableTennisAction, seat: number, state: InternalState): string | null {
    if (state.finished) return "Match is finished";
    if (state.paused && action.type !== "resume" && action.type !== "ready") return "Match is paused";

    switch (action.type) {
      case "paddle-move": {
        if (seat !== 0 && seat !== 1) return "Invalid seat";
        const y = action.y;
        if (typeof y !== "number" || isNaN(y)) return "Invalid paddle position";
        if (y < 0 || y > CANVAS_HEIGHT - PADDLE_HEIGHT) return "Paddle out of bounds";
        const player = state.players[seat];
        const maxMove = MAX_PADDLE_SPEED;
        const currentY = player.paddleY;
        if (Math.abs(y - currentY) > maxMove * 2) {
          return "Paddle movement too fast";
        }
        return null;
      }
      case "serve": {
        if (state.phase !== "serve" && state.phase !== "waiting") return "Cannot serve now";
        if (seat !== state.servingSeat) return "Not your serve";
        if (state.ball && state.ball.inPlay) return "Ball already in play";
        return null;
      }
      case "ready": {
        return null;
      }
      default:
        return null;
    }
  }

  protected applyGameAction(action: TableTennisAction, seat: number, state: InternalState): EngineActionResult<InternalState> {
    const now = this.now();
    const events: EngineEvent[] = [];

    switch (action.type) {
      case "paddle-move": {
        const next = this.cloneState(state);
        const player = next.players[seat];
        const prevY = player.paddleY;
        player.paddleY = Math.max(0, Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, action.y));
        player.paddleVelocity = (player.paddleY - prevY) / 16.67;
        return { ok: true, state: next, events: [], finished: next.finished, winnerSeats: next.winnerSeats };
      }

      case "serve": {
        const next = this.cloneState(state);
        if (next.phase === "waiting") {
          next.phase = "serve";
        }
        
        const serverPlayer = next.players[seat];
        const paddleCenterY = serverPlayer.paddleY + PADDLE_HEIGHT / 2;
        const startX = seat === 0 
          ? PADDLE_MARGIN + PADDLE_WIDTH + BALL_RADIUS + 5 
          : CANVAS_WIDTH - PADDLE_MARGIN - PADDLE_WIDTH - BALL_RADIUS - 5;
        
        const baseSpeed = this.rules.minSpeed;
        const angle = (action.angle * Math.PI) / 180;
        
        next.ball = {
          x: startX,
          y: paddleCenterY,
          vx: seat === 0 ? baseSpeed * Math.cos(angle) : -baseSpeed * Math.cos(angle),
          vy: baseSpeed * Math.sin(angle),
          speed: baseSpeed,
          served: true,
          servedBySeat: seat,
          lastHitSeat: seat,
          bounceCount: 0,
          inPlay: true,
          spin: 0,
        };

        next.phase = "rally";
        next.rallyCount = 0;
        next.waitingForServe = false;
        next.pointStartTime = now;

        events.push({ type: "serve-begin", seat, ball: next.ball });

        return { ok: true, state: next, events, finished: next.finished, winnerSeats: next.winnerSeats };
      }

      case "ready": {
        const next = this.cloneState(state);
        next.players[seat].isReady = true;
        const allReady = next.players.every(p => p.isReady);
        if (allReady && next.phase === "waiting") {
          next.phase = "serve";
          next.canServe = true;
          events.push({ type: "match-ready" });
        }
        return { ok: true, state: next, events, finished: next.finished, winnerSeats: next.winnerSeats };
      }

      default:
        return { ok: false, error: "Unknown action", state, events: [], finished: state.finished, winnerSeats: state.winnerSeats };
    }
  }

  simulatePhysics(state: InternalState): InternalState {
    if (state.paused || state.finished) return state;
    if (!state.ball || !state.ball.inPlay || state.phase !== "rally") return state;

    const next = this.cloneState(state);
    const ball = next.ball!;

    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.y <= BALL_RADIUS) {
      ball.y = BALL_RADIUS;
      ball.vy = Math.abs(ball.vy);
      ball.bounceCount++;
    }
    if (ball.y >= CANVAS_HEIGHT - BALL_RADIUS) {
      ball.y = CANVAS_HEIGHT - BALL_RADIUS;
      ball.vy = -Math.abs(ball.vy);
      ball.bounceCount++;
    }

    for (const player of next.players) {
      const isLeftPaddle = player.seat === 0;
      const paddleX = isLeftPaddle ? PADDLE_MARGIN : CANVAS_WIDTH - PADDLE_MARGIN - PADDLE_WIDTH;
      
      const paddleLeft = paddleX;
      const paddleRight = paddleX + PADDLE_WIDTH;
      const paddleTop = player.paddleY;
      const paddleBottom = player.paddleY + PADDLE_HEIGHT;

      const ballLeft = ball.x - BALL_RADIUS;
      const ballRight = ball.x + BALL_RADIUS;
      const ballTop = ball.y - BALL_RADIUS;
      const ballBottom = ball.y + BALL_RADIUS;

      const ballMovingTowardPaddle = isLeftPaddle ? ball.vx < 0 : ball.vx > 0;
      
      if (
        ballMovingTowardPaddle &&
        ballRight >= paddleLeft &&
        ballLeft <= paddleRight &&
        ballBottom >= paddleTop &&
        ballTop <= paddleBottom
      ) {
        const hitPosition = (ball.y - (player.paddleY + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
        const maxAngle = Math.PI / 3;
        const angle = hitPosition * maxAngle;
        
        ball.speed = Math.min(ball.speed * BALL_SPEED_INCREMENT, MAX_BALL_SPEED);
        ball.vx = (isLeftPaddle ? 1 : -1) * ball.speed * Math.cos(angle);
        ball.vy = ball.speed * Math.sin(angle) + player.paddleVelocity * 0.3;
        
        if (Math.abs(ball.vy) < 0.5) {
          ball.vy = (Math.random() - 0.5) * 2;
        }
        
        ball.lastHitSeat = player.seat;
        next.rallyCount++;
        ball.bounceCount = 0;
        
        if (isLeftPaddle) {
          ball.x = paddleRight + BALL_RADIUS + 1;
        } else {
          ball.x = paddleLeft - BALL_RADIUS - 1;
        }
      }
    }

    if (ball.x < -BALL_RADIUS * 2) {
      return this.awardPoint(next, 1, "miss");
    }
    if (ball.x > CANVAS_WIDTH + BALL_RADIUS * 2) {
      return this.awardPoint(next, 0, "miss");
    }

    next.ball = ball;
    return next;
  }

  private awardPoint(state: InternalState, winnerSeat: number, reason: string): InternalState {
    const now = this.now();
    const next = this.cloneState(state);
    
    next.players[winnerSeat].score++;
    next.players[winnerSeat].pointsWon++;
    next.totalPointsPlayed++;
    next.lastPointWinner = winnerSeat;
    next.lastPointReason = reason;

    next.pointHistory.push({
      pointNumber: next.totalPointsPlayed,
      winnerSeat,
      reason: reason as "miss" | "out" | "net" | "timeout" | "forfeit",
      rallyLength: next.rallyCount,
      timestamp: now,
    });

    const winnerScore = next.players[winnerSeat].score;
    const loserScore = next.players[1 - winnerSeat].score;

    next.setScores = [next.players[0].score, next.players[1].score];

    if (winnerScore >= this.rules.pointsPerSet && winnerScore - loserScore >= 2) {
      next.players[winnerSeat].setsWon++;
      next.currentSet++;
      
      for (const p of next.players) {
        p.score = 0;
      }
      
      if (next.players[winnerSeat].setsWon >= this.rules.setsToWin) {
        next.finished = true;
        next.gameOver = true;
        next.phase = "finished";
        next.endReason = "win-by-sets";
        next.winnerSeats = [winnerSeat];
        return next;
      }
      
      next.servingSeat = 1 - next.servingSeat;
      next.serverCount = 0;
    } else {
      next.serverCount++;
      const isDeuce = next.players[0].score >= 10 && next.players[1].score >= 10;
      next.deuce = isDeuce;
      
      if (isDeuce) {
        next.servingSeat = next.servingSeat === 0 ? 1 : 0;
      } else if (next.serverCount >= 2) {
        next.servingSeat = next.servingSeat === 0 ? 1 : 0;
        next.serverCount = 0;
      }
    }

    for (let i = 0; i < 2; i++) {
      if (next.players[i].setsWon === this.rules.setsToWin - 1 && next.players[1 - i].setsWon < this.rules.setsToWin - 1) {
        if (next.players[i].score >= this.rules.pointsPerSet - 1) {
          next.matchPointSeat = i;
          break;
        }
      }
    }

    next.ball = null;
    next.phase = "serve";
    next.waitingForServe = true;
    next.canServe = true;
    next.rallyCount = 0;
    next.pointStartTime = null;

    return next;
  }

  protected onTurnTimerExpired(seat: number, state: InternalState): EngineActionResult<InternalState> {
    const winnerSeat = seat === 0 ? 1 : 0;
    const next = this.awardPoint(state, winnerSeat, "timeout");
    return { ok: true, state: next, events: [{ type: "point-scored", winnerSeat, reason: "timeout" }], finished: next.finished, winnerSeats: next.winnerSeats };
  }

  protected onMatchTimerExpired(state: InternalState): EngineActionResult<InternalState> {
    const p1Sets = state.players[0].setsWon;
    const p2Sets = state.players[1].setsWon;
    const winnerSeat = p1Sets > p2Sets ? 0 : p2Sets > p1Sets ? 1 : state.servingSeat;
    
    const next = this.cloneState(state);
    next.finished = true;
    next.gameOver = true;
    next.endReason = "match-timeout";
    next.winnerSeats = [winnerSeat];
    next.phase = "finished";
    
    return { ok: true, state: next, events: [{ type: "match-timeout" }], finished: true, winnerSeats: [winnerSeat] };
  }

  tick(): { state: InternalState; events: EngineEvent[] } {
    let state = this.state as InternalState;
    const events: EngineEvent[] = [];
    
    if (!state.paused && !state.finished && state.ball && state.ball.inPlay && state.phase === "rally") {
      state = this.simulatePhysics(state);
      if (state.lastPointWinner !== null) {
        events.push({ type: "point-scored", winnerSeat: state.lastPointWinner, reason: state.lastPointReason });
        state.lastPointWinner = null;
        state.lastPointReason = null;
      }
      (this as unknown as { _state: InternalState })._state = state;
    }
    
    return { state, events };
  }

  getStateSnapshot(): InternalState {
    return this.cloneState(this.state as InternalState);
  }

  getBallState(): TableTennisBall | null {
    return (this.state as InternalState).ball;
  }

  getPaddleStates(): { seat: number; y: number; velocity: number }[] {
    const state = this.state as InternalState;
    return state.players.map(p => ({ seat: p.seat, y: p.paddleY, velocity: p.paddleVelocity }));
  }

  isWaitingForServe(): boolean {
    return (this.state as InternalState).waitingForServe;
  }

  getCurrentServer(): number {
    return (this.state as InternalState).servingSeat;
  }

  canPlayerServe(seat: number): boolean {
    const state = this.state as InternalState;
    return state.waitingForServe && state.servingSeat === seat && !state.finished;
  }
}

export type TableTennisEngineInstance = InstanceType<typeof TableTennisEngine>;
