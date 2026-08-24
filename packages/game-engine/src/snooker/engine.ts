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
import { createInitialSnookerSetup, simulateSnookerShot } from "./physics";
import { SnookerRulesEngine } from "./rules";

export class SnookerEngine implements EngineInstance {
  readonly gameId: GameId = "snooker";
  public state: SnookerState;
  private rng: RandomSource = Math.random;

  constructor(
    players: EnginePlayer[],
    rng?: RandomSource,
    options?: { bestOf?: number; totalFrames?: number; matchId?: string }
  ) {
    if (rng) this.rng = rng;

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

    this.state = {
      gameId: "snooker",
      matchId: options?.matchId || `snooker-match-${Date.now()}`,
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
      lastActionAtMs: Date.now(),
      keyframes: [],
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

  public seatOf(userId: string): number | null {
    const p = this.state.players.find((player) => player.userId === userId);
    return p ? p.seat : null;
  }

  public serialize(): JsonObject {
    return this.state as unknown as JsonObject;
  }

  public setRandomSource(rng: RandomSource): void {
    this.rng = rng;
  }

  public apply(action: GameAction, seat: number): EngineActionResult<JsonObject> {
    const a = action as SnookerAction;
    const events: EngineEvent[] = [];

    // ── 1. Duplicate Shot Protection (Idempotency) ─────────────────────────
    if (a.type === "strike" && a.shotId && a.shotId === this.state.lastProcessedShotId) {
      return {
        ok: true,
        state: this.state as unknown as JsonObject,
        events,
        finished: this.state.finished,
        winnerSeats: this.state.winnerSeats,
      };
    }

    // ── 2. Match Completion Check ──────────────────────────────────────────
    if (this.state.finished && a.type !== "aim") {
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

        const simResult = simulateSnookerShot(this.state.balls, {
          angle: a.angle,
          power: a.power,
          spinX: a.spinX,
          spinY: a.spinY,
        });

        const { nextState, foulReason, foulPenalty, pointsEarned } = SnookerRulesEngine.evaluateShot(
          this.state,
          simResult,
          seat,
          a.shotId
        );

        this.state = nextState;

        events.push({
          type: "SNOOKER_SHOT_RESOLVED",
          seat,
          shotId: a.shotId,
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

      case "concede": {
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

  public handleTimeout(_reason?: string): EngineActionResult<JsonObject> {
    const timedOutSeat = this.state.currentPlayer;
    const opponentSeat = 1 - timedOutSeat;
    const opponent = this.state.players.find((p) => p.seat === opponentSeat) || this.state.players[0];
    const timedOutPlayer = this.state.players.find((p) => p.seat === timedOutSeat) || this.state.players[1];

    // Standard 4-point penalty on turn timeout
    opponent.score += 4;
    if (opponentSeat === 0) this.state.player1Score += 4;
    else this.state.player2Score += 4;

    timedOutPlayer.fouls += 1;
    timedOutPlayer.currentBreak = 0;

    this.state.currentPlayer = opponentSeat;
    this.state.currentSeat = opponentSeat;
    this.state.currentTurnPlayerId = opponent.userId;
    this.state.currentBreak = 0;
    this.state.player1Break = 0;
    this.state.player2Break = 0;
    this.state.lastFoul = "Turn timeout (4 points awarded to opponent)";
    this.state.foulPoints = 4;
    this.state.cueBallInHand = true;
    this.state.inBaulkOnly = false;
    this.state.turnNumber += 1;
    this.state.stateVersion += 1;
    this.state.lastActionAtMs = Date.now();

    const events: EngineEvent[] = [
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
    this.state = SnookerRulesEngine.startNextFrame(this.state);
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
