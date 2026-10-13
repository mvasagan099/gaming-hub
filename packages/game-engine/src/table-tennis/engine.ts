import type { EngineActionResult, EngineEvent, EnginePlayer, RandomSource } from "../types";
import { MultiplayerGameEngine, type BaseState, type PlayerAction } from "../base/MultiplayerGameEngine";
import type {
  TableTennisState,
  TableTennisAction,
  TableTennisBall,
  TableTennisPlayer,
  TableTennisEngineOptions,
  TableTennisPhase,
} from "./types";

import {
  tableTennisShot,
  NET_X,
  NET_HEIGHT,
  PADDLE_CONTACT_Z,
  TABLE_SURFACE_Z,
  GRAVITY,
  BOUNCE_RESTITUTION,
  computeRallyLaunchVz,
  computeServeLaunchVz,
} from "./shots";

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
    maxSpeed: 10.0,
    minSpeed: 5.0,
    speedIncreasePerTouch: 0.35,
  };

  private physicsInterval: ReturnType<typeof setInterval> | null = null;

  override persistenceOptions() { return { ...super.persistenceOptions(), rules: { ...this.rules } }; }

  constructor(players: EnginePlayer[], rng?: RandomSource, options?: TableTennisEngineOptions) {
    // Both players move continuously; resuming must not arm a turn forfeiture clock.
    const turnTimer = undefined;
    const matchTimer = { matchDurationMs: 180000, warningThresholdMs: 30000 };
    super(players, rng, {
      turnTimer,
      matchTimer,
      enableResign: options?.enableResign ?? true,
      enableDraw: true,
      enablePause: options?.enablePause ?? true,
      enableRematch: true,
      now: options?.now,
    });

    if (options?.rules) {
      if (options.rules.pointsPerSet) this.rules.pointsPerSet = options.rules.pointsPerSet;
      if (options.rules.setsToWin) this.rules.setsToWin = options.rules.setsToWin;
    }
  }

  protected override initState(): InternalState {
    const state = super.initState();
    this.startMatchTimer(state);
    return state;
  }

  /** Called once funding is confirmed, before the room becomes playable. */
  startMatchClock(): void {
    if (this.state.phase === "waiting" && this.state.totalPointsPlayed === 0 && !this.state.finished) {
      this.startMatchTimer(this.state);
    }
  }

  override serialize() {
    const copy = super.serialize();
    if (this.state.paused && this.state.matchStartedAtMs !== null && this.state.pausedAtMs !== null) {
      copy.matchRemainingMs = Math.max(0, 180000 - (this.state.pausedAtMs - this.state.matchStartedAtMs));
    }
    return { ...copy, serverTimestamp: this.now() };
  }

  protected override validateAction(action: TableTennisAction, seat: number): string | null {
    // Match controls remain available while rally movement is paused.
    if (!this.state.finished && this.state.paused
      && ["resign", "draw-offer", "draw-accept", "draw-decline"].includes(action.type)) {
      return this.validateBaseAction(action as PlayerAction, seat, this.state);
    }
    return super.validateAction(action, seat);
  }

  protected override applyBaseAction(action: PlayerAction, seat: number, state: InternalState) {
    const result = super.applyBaseAction(action, seat, state);
    if (result?.ok && action.type === "resume" && state.pausedAtMs !== null
      && state.matchStartedAtMs !== null) {
      result.state.matchStartedAtMs = state.matchStartedAtMs + Math.max(0, this.now() - state.pausedAtMs);
    }
    if (result?.ok && result.finished) {
      result.state.phase = "finished";
      result.state.ball = null;
      result.state.canServe = false;
      result.state.waitingForServe = false;
    }
    return result;
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
      currentRallyState: "serve",
    };
  }

  protected validateGameAction(action: TableTennisAction, seat: number, state: InternalState): string | null {
    if (state.finished) return "Match is finished";
    if (state.paused && action.type !== "resume" && action.type !== "ready") return "Match is paused";

    switch (action.type) {
      case "paddle-move": {
        if (seat !== 0 && seat !== 1) return "Invalid seat";
        const y = action.y;
        if (typeof y !== "number" || !Number.isFinite(y)) return "Invalid paddle position";
        return null;
      }
      case "serve": {
        if (state.phase !== "serve" || !state.players.every(p => p.isReady)) return "Wait for both players to be ready";
        if (seat !== state.servingSeat) return "Not your serve";
        if (state.ball && state.ball.inPlay) return "Ball already in play";
        if (!Number.isFinite(action.angle)) return "Invalid serve angle";
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
        const angle = Math.max(-15, Math.min(15, action.angle)) * Math.PI / 180;
        const direction: 1 | -1 = seat === 0 ? 1 : -1;
        const shot = tableTennisShot(startX, paddleCenterY, direction, baseSpeed, Math.tan(angle));
        const vz = computeServeLaunchVz(startX, shot.vx, direction);
        
        next.ball = {
          x: startX,
          y: paddleCenterY,
          z: PADDLE_CONTACT_Z,
          vx: shot.vx,
          vy: shot.vy,
          vz,
          speed: baseSpeed,
          touchCount: 0,
          served: true,
          servedBySeat: seat,
          lastHitSeat: seat,
          bounceCount: 0,
          inPlay: true,
          spin: 0,
          lastHitter: seat,
          ballSide: seat as 0 | 1,
          netCrossed: false,
          bounceCountAfterHit: 0,
          currentRallyState: "serve",
        };

        next.phase = "rally";
        next.currentRallyState = "serve";
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

  tick(elapsedMs: number = 1000 / 60): EngineActionResult<InternalState> {
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

    const previousPoints = this.state.totalPointsPlayed;
    // Persistence and packet processing can delay callbacks. Advance in fixed,
    // collision-safe steps using elapsed time, rather than slowing the rally.
    const frameMs = 1000 / 60;
    const remainder = (this.state as InternalState & { physicsRemainderMs?: number }).physicsRemainderMs ?? 0;
    const available = remainder + (Number.isFinite(elapsedMs) ? Math.max(0, Math.min(250, elapsedMs)) : frameMs);
    const steps = Math.floor((available + 1e-7) / frameMs);
    let nextState = this.cloneState(this.state);
    for (let i = 0; i < steps && !nextState.finished && nextState.ball?.inPlay; i++) nextState = this.advancePhysics(nextState);
    (nextState as InternalState & { physicsRemainderMs?: number }).physicsRemainderMs = available - steps * frameMs;
    this.updateState(nextState);

    const events: EngineEvent[] = [];
    if (nextState.totalPointsPlayed > previousPoints) {
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

    return this.advancePhysics(this.cloneState(state));
  }

  // Catch-up owns one detached working state; reuse it across fixed steps.
  private advancePhysics(next: InternalState): InternalState {
    const ball = next.ball!;

    const prevX = ball.x;
    const prevY = ball.y;
    const prevZ = ball.z ?? PADDLE_CONTACT_Z;

    // Default tracking fields if missing from snapshot/mock
    if (ball.z === undefined) ball.z = PADDLE_CONTACT_Z;
    if (ball.vz === undefined) ball.vz = 0;
    const hitter: number = typeof ball.lastHitSeat === "number"
      ? ball.lastHitSeat
      : typeof ball.lastHitter === "number"
        ? ball.lastHitter
        : (ball.servedBySeat ?? 0);
    ball.lastHitter = hitter;

    if (ball.ballSide === undefined) {
      ball.ballSide = (ball.x < NET_X ? 0 : 1) as 0 | 1;
    }
    if (ball.currentRallyState === undefined) {
      ball.currentRallyState = (ball.served && (ball.touchCount ?? 0) === 0) ? "serve" : "rally";
    }
    if (ball.bounceCountAfterHit === undefined) {
      ball.bounceCountAfterHit = ball.bounceCount ?? 0;
    }
    if (ball.netCrossed === undefined) {
      ball.netCrossed = ball.lastHitter === 0 ? prevX >= NET_X : prevX <= NET_X;
    }

    // 1. Advance position & apply vertical gravity
    ball.x += ball.vx;
    ball.y += ball.vy;
    ball.vz -= GRAVITY;
    ball.z += ball.vz;

    // 2. Net crossing & net collision check
    const crossedNet = (prevX < NET_X && ball.x >= NET_X) || (prevX > NET_X && ball.x <= NET_X);
    if (crossedNet) {
      const frac = Math.abs(ball.x - prevX) > 1e-6 ? Math.abs(NET_X - prevX) / Math.abs(ball.x - prevX) : 0.5;
      const zAtNet = prevZ + (ball.z - prevZ) * frac;

      if (zAtNet <= NET_HEIGHT) {
        // Hit the net! Cannot clear net
        ball.inPlay = false;
        ball.x = NET_X;
        ball.z = Math.min(NET_HEIGHT, zAtNet);
        return this.awardPoint(next, 1 - hitter, "net");
      }
      ball.netCrossed = true;
    }

    // Update current table side
    ball.ballSide = (ball.x < NET_X ? 0 : 1) as 0 | 1;

    // 3. Side exits (lateral out-of-bounds)
    if (ball.y < 0 || ball.y > CANVAS_HEIGHT) {
      ball.inPlay = false;
      return this.awardPoint(next, 1 - hitter, "out");
    }

    // 4. Table bounce collision (ball.z <= TABLE_SURFACE_Z)
    if (ball.z <= TABLE_SURFACE_Z) {
      const frac = Math.abs(ball.z - prevZ) > 1e-6
        ? Math.max(0, Math.min(1, (TABLE_SURFACE_Z - prevZ) / (ball.z - prevZ)))
        : 1;
      const bounceX = prevX + (ball.x - prevX) * frac;
      const bounceY = prevY + (ball.y - prevY) * frac;
      const bounceSide = (bounceX < NET_X ? 0 : 1) as 0 | 1;
      const isOnTable = bounceX >= 0 && bounceX <= CANVAS_WIDTH && bounceY >= 0 && bounceY <= CANVAS_HEIGHT;

      if (isOnTable) {
        ball.z = TABLE_SURFACE_Z;
        if (ball.currentRallyState === "serve") {
          if (ball.bounceCountAfterHit === 0) {
            // First bounce of serve: MUST be on server's half
            if (bounceSide === hitter) {
              ball.bounceCountAfterHit = 1;
              ball.bounceCount = (ball.bounceCount || 0) + 1;
              const distToNet = Math.max(1, Math.abs(NET_X - bounceX));
              const tNet = distToNet / Math.max(0.1, Math.abs(ball.vx));
              ball.vz = (50 + 0.5 * GRAVITY * tNet * tNet) / tNet;
            } else {
              // Fault: Serve failed to bounce on server's side first
              ball.inPlay = false;
              return this.awardPoint(next, 1 - hitter, "miss");
            }
          } else if (ball.bounceCountAfterHit === 1) {
            // Second bounce of serve: MUST have crossed net and land on receiver's half
            if (ball.netCrossed && bounceSide === (1 - hitter)) {
              ball.bounceCountAfterHit = 2;
              ball.bounceCount = (ball.bounceCount || 0) + 1;
              ball.currentRallyState = "rally";
              ball.vz = Math.max(2.0, Math.abs(ball.vz) * BOUNCE_RESTITUTION);
            } else {
              // Fault: Did not cross net or hit server's side again
              ball.inPlay = false;
              return this.awardPoint(next, 1 - hitter, "miss");
            }
          } else {
            // 3rd bounce on table without receiver returning it -> Receiver missed!
            ball.inPlay = false;
            return this.awardPoint(next, hitter, "miss");
          }
        } else {
          // Normal rally shot!
          if (!ball.netCrossed || bounceSide === hitter) {
            // Rule 7: Bounced on shooter's half before crossing net! Invalid rally shot
            ball.inPlay = false;
            return this.awardPoint(next, 1 - hitter, "miss");
          }

          // Landed on opponent's half
          if (ball.bounceCountAfterHit === 0) {
            // Legal first bounce on opponent's side!
            ball.bounceCountAfterHit = 1;
            ball.bounceCount = (ball.bounceCount || 0) + 1;
            ball.vz = Math.max(1.8, Math.abs(ball.vz) * BOUNCE_RESTITUTION);
          } else {
            // Double bounce on opponent's half without returning -> Opponent missed!
            ball.inPlay = false;
            return this.awardPoint(next, hitter, "miss");
          }
        }
      } else {
        // Landed below table level outside table bounds
        ball.inPlay = false;
        if (ball.bounceCountAfterHit === 0) {
          return this.awardPoint(next, 1 - hitter, "out");
        } else {
          return this.awardPoint(next, hitter, "miss");
        }
      }
    }

    // 5. Paddle Collision Handling
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
        const maxAngle = Math.PI / 9;
        const angle = Math.max(-1, Math.min(1, hitPosition)) * maxAngle;

        const touchCount = (ball.touchCount || 0) + 1;
        const newSpeed = Math.min(ball.speed + this.rules.speedIncreasePerTouch, this.rules.maxSpeed);

        ball.x = isLeftPaddle ? paddleRight + BALL_RADIUS + 1 : paddleLeft - BALL_RADIUS - 1;
        const direction: 1 | -1 = isLeftPaddle ? 1 : -1;
        const shot = tableTennisShot(
          ball.x,
          ball.y,
          direction,
          newSpeed,
          Math.tan(angle) + Math.max(-0.06, Math.min(0.06, player.paddleVelocity * 0.02))
        );

        ball.touchCount = touchCount;
        ball.speed = newSpeed;
        ball.vx = shot.vx;
        ball.vy = shot.vy;
        ball.z = PADDLE_CONTACT_Z;
        ball.vz = computeRallyLaunchVz(ball.x, shot.vx, direction, newSpeed);

        ball.lastHitSeat = player.seat;
        ball.lastHitter = player.seat;
        ball.ballSide = player.seat as 0 | 1;
        ball.netCrossed = false;
        ball.bounceCountAfterHit = 0;
        ball.bounceCount = 0;
        ball.currentRallyState = "rally";
        next.rallyCount++;
      }
    }

    if (ball.x < -BALL_RADIUS * 2) {
      ball.inPlay = false;
      return this.awardPoint(next, 1, "miss");
    }
    if (ball.x > CANVAS_WIDTH + BALL_RADIUS * 2) {
      ball.inPlay = false;
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

    next.matchPointSeat = null;
    next.deuce = next.players.every(p => p.score >= this.rules.pointsPerSet - 1);
    next.setScores = next.players.map(p => p.score);
    for (let i = 0; i < 2; i++) {
      if (next.players[i].setsWon === this.rules.setsToWin - 1
        && next.players[i].score >= this.rules.pointsPerSet - 1
        && next.players[i].score > next.players[1 - i].score) {
        next.matchPointSeat = i;
      }
    }

    next.ball = null;
    next.phase = "serve";
    next.waitingForServe = true;
    next.canServe = true;
    next.rallyCount = 0;
    next.pointStartTime = null;
    next.currentRallyState = "serve";

    return next;
  }

  protected onTurnTimerExpired(seat: number, state: InternalState): EngineActionResult<InternalState> {
    const winnerSeat = seat === 0 ? 1 : 0;
    const next = this.awardPoint(state, winnerSeat, "timeout");
    return { ok: true, state: next, events: [{ type: "point-scored", winnerSeat, reason: "timeout" }], finished: next.finished, winnerSeats: next.winnerSeats };
  }

  protected override onMatchTimerExpired(state: InternalState): EngineActionResult<InternalState> {
    const winnerSeats = this.resolveTimeoutWinner(state);
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

  /**
   * Deterministic timeout winner resolution for Table Tennis:
   * 1. Player with most sets won.
   * 2. If tied, player with most points in the current set.
   * 3. If tied, draw across leaders.
   */
  protected override resolveTimeoutWinner(state: InternalState): number[] {
    if (!state.players || state.players.length === 0) return [state.currentSeat];

    type PlayerRank = { seat: number; sets: number; score: number };
    const ranks: PlayerRank[] = state.players.map((p) => ({
      seat: p.seat,
      sets: Number(p.setsWon ?? 0),
      score: Number((p as any).score ?? 0),
    }));

    ranks.sort((a, b) => {
      if (b.sets !== a.sets) return b.sets - a.sets;
      return b.score - a.score;
    });

    const best = ranks[0];
    if (!best) return [0];
    const topTied = ranks.filter((r) => r.sets === best.sets && r.score === best.score);
    if (topTied.length > 1) return [];
    return [best.seat];
  }
}

export type TableTennisEngineInstance = InstanceType<typeof TableTennisEngine>;
