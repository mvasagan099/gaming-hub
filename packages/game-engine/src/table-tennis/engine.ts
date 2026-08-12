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
const MAX_BALL_SPEED = 12.6;

type InternalState = TableTennisState & BaseState;

export class TableTennisEngine extends MultiplayerGameEngine<InternalState, TableTennisAction> {
  readonly gameId = "table-tennis" as const;

  private readonly rules = {
    pointsPerSet: 5,
    setsToWin: 1,
    winByTwo: true,
    maxSpeed: 12.0,
    minSpeed: 5.0,
    speedIncreasePerTouch: 0.5,
  };

  private physicsInterval: ReturnType<typeof setInterval> | null = null;

  constructor(players: EnginePlayer[], rng?: RandomSource, options?: TableTennisEngineOptions) {
    const turnTimer = options?.turnTimer ?? { turnDurationMs: 30000, warningThresholdMs: 5000 };
    const matchTimer = options?.matchTimer ?? { matchDurationMs: 180000, warningThresholdMs: 30000 };
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
        
        const baseSpeed = 5.0;
        const angle = (action.angle * Math.PI) / 180;
        
        next.ball = {
          x: startX,
          y: paddleCenterY,
          vx: seat === 0 ? baseSpeed * Math.cos(angle) : -baseSpeed * Math.cos(angle),
          vy: baseSpeed * Math.sin(angle),
          speed: baseSpeed,
          touchCount: 0,
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

  tick(): EngineActionResult<InternalState> {
    if (this.state.finished || this.state.paused) {
      return {
        ok: true,
        state: this.state,
        events: [],
        finished: this.state.finished,
        winnerSeats: this.state.winnerSeats,
      };
    }

    if (!this.state.ball || !this.state.ball.inPlay || this.state.phase !== "rally") {
      return {
        ok: true,
        state: this.state,
        events: [],
        finished: false,
        winnerSeats: [],
      };
    }

    const prevWinner = this.state.lastPointWinner;
    const nextState = this.simulatePhysics(this.state);
    this.updateState(nextState);

    const events: EngineEvent[] = [];
    if (nextState.lastPointWinner !== null && nextState.lastPointWinner !== prevWinner) {
      events.push({
        type: "point-scored",
        winnerSeat: nextState.lastPointWinner,
        reason: nextState.lastPointReason ?? "miss",
      });
    }

    if (nextState.finished) {
      events.push({
        type: "match-complete",
        winnerSeats: nextState.winnerSeats,
      });
    }

    return {
      ok: true,
      state: nextState,
      events,
      finished: nextState.finished,
      winnerSeats: nextState.winnerSeats,
    };
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
        
        const touchCount = (ball.touchCount || 0) + 1;
        const newSpeed = Math.min(ball.speed + this.rules.speedIncreasePerTouch, this.rules.maxSpeed);
        
        const rawVx = (isLeftPaddle ? 1 : -1) * Math.cos(angle);
        const rawVy = Math.sin(angle) + player.paddleVelocity * 0.05;
        const len = Math.sqrt(rawVx * rawVx + rawVy * rawVy) || 1;
        
        ball.touchCount = touchCount;
        ball.speed = newSpeed;
        ball.vx = (rawVx / len) * newSpeed;
        ball.vy = (rawVy / len) * newSpeed;
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
      
      if (next.players[winnerSeat].setsWon >= this.rules.setsToWin) {
        next.finished = true;
        next.gameOver = true;
        next.phase = "finished";
        next.endReason = "SCORE_LIMIT_REACHED";
        next.winnerSeats = [winnerSeat];
        next.ball = null;
        return next;
      }

      for (const p of next.players) {
        p.score = 0;
      }
      
      next.servingSeat = 1 - next.servingSeat;
      next.serverCount = 0;
    } else {
      next.serverCount++;
      const isDeuce = next.players[0].score >= (this.rules.pointsPerSet - 1) && next.players[1].score >= (this.rules.pointsPerSet - 1);
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
    const p1Score = state.players[0].score;
    const p2Score = state.players[1].score;
    let winnerSeats: number[] = [];
    if (p1Score > p2Score) {
      winnerSeats = [0];
    } else if (p2Score > p1Score) {
      winnerSeats = [1];
    } else {
      winnerSeats = [];
    }
    
    const next = this.cloneState(state);
    next.finished = true;
    next.gameOver = true;
    next.endReason = "TIME_EXPIRED";
    next.winnerSeats = winnerSeats;
    next.phase = "finished";
    next.ball = null;
    
    return { ok: true, state: next, events: [{ type: "match-complete", reason: "TIME_EXPIRED", winnerSeats }], finished: true, winnerSeats };
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
