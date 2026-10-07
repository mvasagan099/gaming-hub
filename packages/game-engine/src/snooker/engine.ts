import type { GameId, JsonObject } from "@gaming-hub/shared";
import type {
  EngineActionResult,
  EngineEvent,
  EngineInstance,
  EnginePlayer,
  GameAction,
  RandomSource,
} from "../types";
import {
  SNOOKER_SPOTS,
  SNOOKER_BAULK_X,
  SNOOKER_D_RADIUS,
  SNOOKER_TABLE_CENTER_Y,
  SNOOKER_BALL_RADIUS,
  SNOOKER_PLAYABLE_LEFT,
  SNOOKER_PLAYABLE_RIGHT,
  SNOOKER_PLAYABLE_TOP,
  SNOOKER_PLAYABLE_BOTTOM,
  type SnookerState,
  type SnookerPlayer,
  type SnookerAction,
  type SnookerBallType,
  type SnookerFrameHistoryItem,
} from "./types";
import { createInitialSnookerSetup, simulateSnookerShot, snookerShotDuration } from "./physics";
import { SnookerRulesEngine } from "./rules";

export class SnookerEngine implements EngineInstance {
  readonly gameId: GameId = "snooker";
  public state: SnookerState;
  private rng: RandomSource = Math.random;
  private turnDurationMs: number = 20_000;
  private matchDurationMs: number = 600_000;
  private matchStartedAtMs: number = Date.now();

  constructor(
    players: EnginePlayer[],
    rng?: RandomSource,
    options?: {
      bestOf?: number;
      totalFrames?: number;
      matchId?: string;
      turnDurationMs?: number;
      turnTimer?: { turnDurationMs: number };
      matchDurationMs?: number;
      matchTimer?: { matchDurationMs: number };
    }
  ) {
    if (rng) this.rng = rng;
    if (options?.turnDurationMs) this.turnDurationMs = options.turnDurationMs;
    else if (options?.turnTimer?.turnDurationMs) this.turnDurationMs = options.turnTimer.turnDurationMs;

    if (options?.matchDurationMs) this.matchDurationMs = options.matchDurationMs;
    else if (options?.matchTimer?.matchDurationMs) this.matchDurationMs = options.matchTimer.matchDurationMs;

    const p1 = players.find((p) => p.seat === 0) || { userId: "player-1", seat: 0 };
    const p2 = players.find((p) => p.seat === 1) || { userId: "player-2", seat: 1 };

    const snookerPlayers: SnookerPlayer[] = [
      {
        seat: 0,
        userId: p1.userId,
        score: 0,
        framesWon: 0,
        currentBreak: 0,
        highestBreak: 0,
        fouls: 0,
      },
      {
        seat: 1,
        userId: p2.userId,
        score: 0,
        framesWon: 0,
        currentBreak: 0,
        highestBreak: 0,
        fouls: 0,
      },
    ];

    const totalFrames = options?.totalFrames || options?.bestOf || 1;
    const now = Date.now();

    this.state = {
      gameId: "snooker",
      matchId: options?.matchId || `snooker-match-${now}`,
      frameNumber: 1,
      totalFrames,
      currentPlayer: 0,
      currentSeat: 0,
      currentTurnPlayerId: p1.userId,
      frameStatus: "BREAK",
      matchStatus: "IN_PROGRESS",
      player1Score: 0,
      player2Score: 0,
      player1Break: 0,
      player2Break: 0,
      player1FramesWon: 0,
      player2FramesWon: 0,
      player1HighestBreak: 0,
      player2HighestBreak: 0,
      redsRemaining: 15,
      targetBall: "RED",
      freeBallAvailable: false,
      freeBallTarget: null,
      isRespottedBlack: false,
      isColorAfterFinalRed: false,
      nominatedBall: null,
      balls: createInitialSnookerSetup(),
      players: snookerPlayers,
      lastShot: null,
      lastFoul: null,
      foulPoints: 0,
      cueBallInHand: false,
      inBaulkOnly: false,
      frameHistory: [],
      stateVersion: 1,
      lastProcessedShotId: null,
      frameWinnerSeats: [],
      finished: false,
      winnerSeats: [],
      winnerIds: [],
      turnNumber: 0,
      shotNumber: 0,
      lastActionAtMs: now,
      turnStartedAtMs: now,
      keyframes: [],
      shotPlaybackEndsAtMs: 0,
      serverTimestamp: 0,
      turnDeadlineMs: null,
      turnDurationMs: this.turnDurationMs,
      paused: false,
      pausedAtMs: null,
    };
  }

  get currentSeat(): number {
    return this.state.currentPlayer;
  }

  get finished(): boolean {
    return this.state.finished;
  }

  get winnerSeats(): number[] {
    return this.state.winnerSeats;
  }

  get currentClockDeadline(): number | null {
    if (this.state.finished || this.state.paused) return null;
    if (this.state.frameStatus === "FRAME_END" || this.state.frameStatus === "MATCH_END") return null;
    const started = this.state.turnStartedAtMs || this.state.lastActionAtMs || Date.now();
    return started + this.turnDurationMs;
  }

  get currentMatchDeadline(): number | null {
    if (this.state.finished || this.state.paused) return null;
    return this.matchStartedAtMs + this.matchDurationMs;
  }

  public seatOf(userId: string): number | null {
    const p = this.state.players.find((player) => player.userId === userId);
    return p ? p.seat : null;
  }

  public serialize(): JsonObject {
    const pausedRemaining = this.state.pausedAtMs == null ? null : Math.max(0,
      this.state.turnStartedAtMs + this.turnDurationMs - this.state.pausedAtMs);
    return { ...structuredClone(this.state), serverTimestamp: Date.now(),
      turnDeadlineMs: pausedRemaining == null ? this.currentClockDeadline : Date.now() + pausedRemaining,
      turnDurationMs: this.turnDurationMs };
  }

  public pauseClocks(): void {
    if (this.state.paused || this.state.finished) return;
    this.state.paused = true; this.state.pausedAtMs = Date.now();
  }

  public resumeClocks(): void {
    if (!this.state.paused || this.state.pausedAtMs == null) return;
    const elapsed = Math.max(0, Date.now() - this.state.pausedAtMs);
    this.matchStartedAtMs += elapsed;
    this.state.turnStartedAtMs += elapsed;
    if (this.state.shotPlaybackEndsAtMs) this.state.shotPlaybackEndsAtMs += elapsed;
    this.state.paused = false; this.state.pausedAtMs = null;
  }

  public restoreState(state: SnookerState): void { this.state = structuredClone(state); }

  public startMatchClock(): void {
    this.matchStartedAtMs = Date.now();
    this.state.turnStartedAtMs = this.matchStartedAtMs;
  }

  public setRandomSource(rng: RandomSource): void {
    this.rng = rng;
  }

  public apply(action: GameAction, seat: number): EngineActionResult<JsonObject> {
    const a = action as SnookerAction;
    const events: EngineEvent[] = [];
    const reject = (error: string): EngineActionResult<JsonObject> => ({
      ok: false, error, state: this.state, events: [], finished: this.finished, winnerSeats: this.winnerSeats,
    });
    if (!this.state.players.some(p => p.seat === seat)) return reject("Invalid seat");
    if (!a || typeof a.type !== "string") return reject("Malformed action");
    if (this.state.paused && a.type !== "resign") return reject("Match is paused while a player reconnects");

    // ── 1. Duplicate Shot Protection (Idempotency) ─────────────────────────
    if (a.type === "strike" && a.shotId && a.shotId === this.state.lastProcessedShotId
      && this.state.lastShot?.shooterSeat === seat) {
      return {
        ok: true,
        state: this.state as unknown as JsonObject,
        events,
        finished: this.state.finished,
        winnerSeats: this.state.winnerSeats,
      };
    }

    // ── 2. Match Completion Check ──────────────────────────────────────────
    if (this.state.finished) {
      return {
        ok: false,
        error: "Match has already finished",
        state: this.state as unknown as JsonObject,
        events,
        finished: true,
        winnerSeats: this.state.winnerSeats,
      };
    }

    // ── 3. Stale State Protection ──────────────────────────────────────────
    if (
      a.expectedStateVersion !== undefined &&
      a.expectedStateVersion !== this.state.stateVersion
    ) {
      return {
        ok: false,
        error: "STALE_GAME_STATE",
        state: this.state as unknown as JsonObject,
        events,
        finished: this.state.finished,
        winnerSeats: this.state.winnerSeats,
      };
    }

    if (["strike", "place-cue-ball", "nominate-color"].includes(a.type)
      && ["FRAME_END", "MATCH_END"].includes(this.state.frameStatus)) return reject("Frame has already concluded");
    if (["strike", "place-cue-ball", "nominate-color", "next-frame", "timeout"].includes(a.type)
      && (this.state.shotPlaybackEndsAtMs ?? 0) > Date.now()) return reject("Wait for the balls to settle");

    switch (a.type) {
      case "strike": {
        // Turn Validation
        if (this.state.currentPlayer !== seat) {
          return {
            ok: false,
            error: "NOT_YOUR_TURN",
            state: this.state as unknown as JsonObject,
            events,
            finished: this.state.finished,
            winnerSeats: this.state.winnerSeats,
          };
        }

        // In-hand Check
        if (this.state.cueBallInHand) {
          return {
            ok: false,
            error: "Must place cue ball before shooting",
            state: this.state as unknown as JsonObject,
            events,
            finished: this.state.finished,
            winnerSeats: this.state.winnerSeats,
          };
        }

        if (![a.angle, a.power, a.spinX ?? 0, a.spinY ?? 0].every(Number.isFinite)) return reject("Invalid shot parameters");
        const angle = a.angle;
        const power = Math.max(0.05, Math.min(1.0, a.power));
        const spinX = Math.max(-1, Math.min(1, a.spinX ?? 0));
        const spinY = Math.max(-1, Math.min(1, a.spinY ?? 0));
        const shotId = typeof a.shotId === "string" ? a.shotId : `shot-${Date.now()}`;

        const simResult = simulateSnookerShot(this.state.balls, {
          angle,
          power,
          spinX,
          spinY,
        });

        const { nextState, foulReason, foulPenalty, pointsEarned } = SnookerRulesEngine.evaluateShot(
          this.state,
          simResult,
          seat,
          shotId
        );

        this.state = nextState;
        nextState.lastShot!.angle = angle;
        nextState.lastShot!.power = power;
        nextState.lastActionAtMs = Date.now();
        nextState.shotPlaybackEndsAtMs = nextState.lastActionAtMs + snookerShotDuration(simResult.keyframes);
        nextState.turnStartedAtMs = nextState.shotPlaybackEndsAtMs;

        events.push({
          type: "SNOOKER_SHOT_RESOLVED",
          seat,
          shotId,
          pointsEarned,
          foulReason,
          foulPenalty,
          targetBall: nextState.targetBall,
          frameStatus: nextState.frameStatus,
          player1Score: nextState.player1Score,
          player2Score: nextState.player2Score,
          currentBreak: nextState.currentBreak,
        });

        return {
          ok: true,
          state: this.state as unknown as JsonObject,
          events,
          finished: this.state.finished,
          winnerSeats: this.state.winnerSeats,
        };
      }

      case "place-cue-ball": {
        if (!this.state.cueBallInHand) return reject("Cue ball is not in hand");
        if (![a.x, a.y].every(Number.isFinite)) return reject("Invalid cue ball position");
        if (this.state.currentPlayer !== seat) {
          return {
            ok: false,
            error: "NOT_YOUR_TURN",
            state: this.state as unknown as JsonObject,
            events,
            finished: this.state.finished,
            winnerSeats: this.state.winnerSeats,
          };
        }

        let { x, y } = a;
        x = Math.max(SNOOKER_PLAYABLE_LEFT, Math.min(SNOOKER_PLAYABLE_RIGHT, x));
        y = Math.max(SNOOKER_PLAYABLE_TOP, Math.min(SNOOKER_PLAYABLE_BOTTOM, y));

        // If in-baulk rule applies, placement must be within the "D"
        if (this.state.inBaulkOnly) {
          const dx = x - SNOOKER_BAULK_X;
          const dy = y - SNOOKER_TABLE_CENTER_Y;
          const dist = Math.hypot(dx, dy);

          if (x > SNOOKER_BAULK_X || dist > SNOOKER_D_RADIUS) {
            return {
              ok: false,
              error: "Cue ball must be placed within the 'D'",
              state: this.state as unknown as JsonObject,
              events,
              finished: this.state.finished,
              winnerSeats: this.state.winnerSeats,
            };
          }
        }

        // Ensure not overlapping another active ball
        const overlap = this.state.balls.some(
          (b) => b.type !== "cue" && !b.pocketed && Math.hypot(b.x - x, b.y - y) < SNOOKER_BALL_RADIUS * 2
        );
        if (overlap) {
          return {
            ok: false,
            error: "Cannot place cue ball overlapping another ball",
            state: this.state as unknown as JsonObject,
            events,
            finished: this.state.finished,
            winnerSeats: this.state.winnerSeats,
          };
        }

        const cue = this.state.balls.find((b) => b.type === "cue");
        if (cue) {
          cue.x = x;
          cue.y = y;
          cue.pocketed = false;
          cue.pocketIndex = null;
          cue.vx = 0;
          cue.vy = 0;
        }

        this.state.cueBallInHand = false;
        this.state.inBaulkOnly = false;
        this.state.stateVersion += 1;
        this.state.lastActionAtMs = Date.now();
        this.state.keyframes = [];

        events.push({
          type: "SNOOKER_BALL_PLACED",
          seat,
          x,
          y,
        });

        return {
          ok: true,
          state: this.state as unknown as JsonObject,
          events,
          finished: this.state.finished,
          winnerSeats: this.state.winnerSeats,
        };
      }

      case "nominate-color": {
        if (!["yellow", "green", "brown", "blue", "pink", "black"].includes(a.color)
          || !this.state.balls.some(b => b.type === a.color && !b.pocketed)) return reject("Invalid color nomination");
        if (this.state.currentPlayer !== seat) {
          return {
            ok: false,
            error: "NOT_YOUR_TURN",
            state: this.state as unknown as JsonObject,
            events,
            finished: this.state.finished,
            winnerSeats: this.state.winnerSeats,
          };
        }
        if (this.state.frameStatus !== "COLOR_PHASE" && this.state.frameStatus !== "FREE_BALL") {
          return {
            ok: false,
            error: "Color nomination only valid in COLOR_PHASE or FREE_BALL",
            state: this.state as unknown as JsonObject,
            events,
            finished: this.state.finished,
            winnerSeats: this.state.winnerSeats,
          };
        }

        this.state.nominatedBall = a.color as SnookerBallType;
        this.state.stateVersion += 1;
        this.state.lastActionAtMs = Date.now();
        this.state.keyframes = [];

        events.push({
          type: "SNOOKER_COLOR_NOMINATED",
          seat,
          color: a.color,
        });

        return {
          ok: true,
          state: this.state as unknown as JsonObject,
          events,
          finished: this.state.finished,
          winnerSeats: this.state.winnerSeats,
        };
      }

      case "next-frame": {
        return this.startNextFrame();
      }

      case "resign": {
        this.state.finished = true;
        this.state.matchStatus = "FINISHED";
        this.state.frameStatus = "MATCH_END";
        this.state.winnerSeats = [1 - seat];
        this.state.winnerIds = [this.state.players[1 - seat].userId];
        this.state.stateVersion++;
        this.state.keyframes = [];
        return { ok: true, state: this.state, events: [{ type: "SNOOKER_MATCH_RESIGNED", seat }],
          finished: true, winnerSeats: this.state.winnerSeats };
      }

      case "concede": {
        if (this.state.frameStatus === "FRAME_END" || this.state.frameStatus === "MATCH_END" || this.state.finished) {
          return {
            ok: false,
            error: "Frame has already concluded",
            state: this.state as unknown as JsonObject,
            events,
            finished: this.state.finished,
            winnerSeats: this.state.winnerSeats,
          };
        }

        const opponentSeat = 1 - seat;
        const opponent = this.state.players.find((p) => p.seat === opponentSeat) || this.state.players[0];

        opponent.framesWon += 1;
        if (opponentSeat === 0) this.state.player1FramesWon += 1;
        else this.state.player2FramesWon += 1;

        const frameRecord: SnookerFrameHistoryItem = {
          frameNumber: this.state.frameNumber,
          player1Score: this.state.player1Score,
          player2Score: this.state.player2Score,
          winnerSeat: opponentSeat,
          highestBreak: Math.max(this.state.player1HighestBreak, this.state.player2HighestBreak),
          durationSeconds: Math.round((Date.now() - this.state.lastActionAtMs) / 1000),
          completedAt: new Date().toISOString(),
        };
        this.state.frameHistory.push(frameRecord);

        const framesToWin = Math.ceil(this.state.totalFrames / 2);
        if (opponent.framesWon >= framesToWin) {
          this.state.finished = true;
          this.state.matchStatus = "FINISHED";
          this.state.frameStatus = "MATCH_END";
          this.state.winnerSeats = [opponentSeat];
          this.state.winnerIds = [opponent.userId];
        } else {
          this.state.frameStatus = "FRAME_END";
          this.state.frameWinnerSeats = [opponentSeat];
        }

        this.state.stateVersion += 1;
        this.state.lastActionAtMs = Date.now();
        this.state.keyframes = [];

        events.push({
          type: "SNOOKER_FRAME_CONCEDED",
          concedingSeat: seat,
          winnerSeat: opponentSeat,
          player1FramesWon: this.state.player1FramesWon,
          player2FramesWon: this.state.player2FramesWon,
        });

        return {
          ok: true,
          state: this.state as unknown as JsonObject,
          events,
          finished: this.state.finished,
          winnerSeats: this.state.winnerSeats,
        };
      }

      case "timeout":
        if (seat !== this.currentSeat || !this.currentClockDeadline || Date.now() < this.currentClockDeadline) return reject("Turn has not timed out");
        return this.handleTimeout("turn", seat);

      default:
        return {
          ok: false,
          error: `Unsupported action: ${(a as any).type}`,
          state: this.state as unknown as JsonObject,
          events,
          finished: this.state.finished,
          winnerSeats: this.state.winnerSeats,
        };
    }
  }

  public handleTimeout(kind: "turn" | "match" = "turn", seat?: number): EngineActionResult<JsonObject> {
    if (this.state.paused) return { ok: false, error: "Match is paused", state: this.state,
      events: [], finished: this.finished, winnerSeats: this.winnerSeats };
    if (this.state.finished) {
      return {
        ok: false,
        error: "Match already finished",
        state: this.state as unknown as JsonObject,
        events: [],
        finished: true,
        winnerSeats: this.state.winnerSeats,
      };
    }

    if (kind === "match") {
      const p1Score = this.state.player1Score;
      const p2Score = this.state.player2Score;
      let winnerSeats: number[] = [];
      if (p1Score > p2Score) {
        winnerSeats = [0];
      } else if (p2Score > p1Score) {
        winnerSeats = [1];
      } else {
        // Frame score is tied: tiebreaker by highest break
        if (this.state.player1HighestBreak > this.state.player2HighestBreak) {
          winnerSeats = [0];
        } else if (this.state.player2HighestBreak > this.state.player1HighestBreak) {
          winnerSeats = [1];
        } else {
          winnerSeats = [];
        }
      }

      this.state.finished = true;
      this.state.matchStatus = "FINISHED";
      this.state.frameStatus = "MATCH_END";
      this.state.keyframes = [];
      this.state.winnerSeats = winnerSeats;
      this.state.winnerIds = winnerSeats.map((s) => this.state.players[s]?.userId).filter(Boolean) as string[];

      const events: EngineEvent[] = [
        {
          type: "match-timeout",
          winnerSeats,
          player1Score: p1Score,
          player2Score: p2Score,
        },
        {
          type: "SNOOKER_MATCH_ENDED",
          winnerSeats,
          winnerIds: this.state.winnerIds,
          scores: { 0: p1Score, 1: p2Score },
        },
      ];

      return {
        ok: true,
        state: this.state as unknown as JsonObject,
        events,
        finished: true,
        winnerSeats,
      };
    }

    const timedOutSeat = seat !== undefined ? seat : this.state.currentPlayer;
    const opponentSeat = 1 - timedOutSeat;
    const opponent = this.state.players.find((p) => p.seat === opponentSeat) || this.state.players[opponentSeat] || { userId: `player-${opponentSeat + 1}`, seat: opponentSeat, score: 0, framesWon: 0, currentBreak: 0, highestBreak: 0, fouls: 0 };
    const timedOutPlayer = this.state.players.find((p) => p.seat === timedOutSeat) || this.state.players[timedOutSeat] || { userId: `player-${timedOutSeat + 1}`, seat: timedOutSeat, score: 0, framesWon: 0, currentBreak: 0, highestBreak: 0, fouls: 0 };

    // Standard 4-point penalty on turn timeout
    opponent.score += 4;
    if (opponentSeat === 0) this.state.player1Score += 4;
    else this.state.player2Score += 4;

    timedOutPlayer.fouls += 1;
    timedOutPlayer.currentBreak = 0;

    const now = Date.now();
    this.state.currentPlayer = opponentSeat;
    this.state.currentSeat = opponentSeat;
    this.state.currentTurnPlayerId = opponent.userId;
    this.state.currentBreak = 0;
    this.state.player1Break = 0;
    this.state.player2Break = 0;
    this.state.lastFoul = "Turn timeout (4 points awarded to opponent)";
    this.state.foulPoints = 4;
    this.state.redsRemaining = this.state.balls.filter(b => b.type === "red" && !b.pocketed).length;
    this.state.targetBall = this.state.redsRemaining > 0 ? "RED" : SnookerRulesEngine.getNextClearanceTarget(this.state.balls);
    this.state.frameStatus = this.state.redsRemaining > 0 ? "RED_PHASE" : "COLOR_CLEARANCE";
    this.state.nominatedBall = null;
    this.state.freeBallAvailable = false;
    this.state.freeBallTarget = null;
    this.state.isColorAfterFinalRed = false;
    this.state.cueBallInHand = true;
    this.state.inBaulkOnly = true;
    this.state.turnNumber += 1;
    this.state.stateVersion += 1;
    this.state.lastActionAtMs = now;
    this.state.turnStartedAtMs = now;

    this.state.keyframes = [];

    const events: EngineEvent[] = [
      {
        type: "turn-timeout",
        seat: timedOutSeat,
        nextSeat: opponentSeat,
        foulPenalty: 4,
        timestamp: now,
      },
      {
        type: "SNOOKER_FOUL",
        seat: timedOutSeat,
        foulReason: "Turn timeout",
        foulPenalty: 4,
      },
    ];

    return {
      ok: true,
      state: this.state as unknown as JsonObject,
      events,
      finished: this.state.finished,
      winnerSeats: this.state.winnerSeats,
    };
  }

  public startNextFrame(): EngineActionResult<JsonObject> {
    if (this.state.frameStatus !== "FRAME_END") {
      return { ok: false, error: "Current frame is not over", state: this.state,
        events: [], finished: this.finished, winnerSeats: this.winnerSeats };
    }
    if (this.state.finished) {
      return {
        ok: false,
        error: "Match already complete",
        state: this.state as unknown as JsonObject,
        events: [],
        finished: true,
        winnerSeats: this.state.winnerSeats,
      };
    }
    const now = Date.now();
    this.state = SnookerRulesEngine.startNextFrame(this.state);
    this.state.turnStartedAtMs = now;
    this.state.lastActionAtMs = now;
    return {
      ok: true,
      state: this.state as unknown as JsonObject,
      events: [{ type: "SNOOKER_FRAME_STARTED", frameNumber: this.state.frameNumber }],
      finished: false,
      winnerSeats: [],
    };
  }

  public getState(): SnookerState {
    return this.state;
  }

  public isGameOver(): boolean {
    return this.state.finished;
  }

  public getWinners(): number[] {
    return this.state.winnerSeats;
  }
}
