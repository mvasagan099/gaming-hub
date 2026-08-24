import {
  SNOOKER_SPOTS,
  SNOOKER_BALL_VALUES,
  SNOOKER_BALL_RADIUS,
  COLOR_CLEARANCE_ORDER,
  type SnookerBall,
  type SnookerBallType,
  type SnookerTarget,
  type SnookerFrameStatus,
  type SnookerState,
  type SnookerPlayer,
  type SnookerFrameHistoryItem,
} from "./types";
import type { SnookerSimulationResult } from "./physics";
import { createInitialSnookerSetup } from "./physics";

export class SnookerRulesEngine {
  /**
   * Returns list of ball types that are legal to contact first for the given target state.
   */
  public static getLegalBallTypes(
    target: SnookerTarget,
    freeBall = false,
    nominatedColor: SnookerBallType | null = null
  ): SnookerBallType[] {
    if (freeBall && nominatedColor) {
      return [nominatedColor];
    }
    if (target === "RED") {
      return ["red"];
    }
    if (target === "COLOR") {
      return nominatedColor
        ? [nominatedColor]
        : ["yellow", "green", "brown", "blue", "pink", "black"];
    }
    if (target === "YELLOW") return ["yellow"];
    if (target === "GREEN") return ["green"];
    if (target === "BROWN") return ["brown"];
    if (target === "BLUE") return ["blue"];
    if (target === "PINK") return ["pink"];
    if (target === "BLACK") return ["black"];
    return ["red"];
  }

  /**
   * Respots a colored ball to its home spot, or highest vacant spot in priority order.
   */
  public static respotColor(colorBall: SnookerBall, allBalls: SnookerBall[]): void {
    if (colorBall.type === "red" || colorBall.type === "cue") return;

    colorBall.pocketed = false;
    colorBall.pocketIndex = null;
    colorBall.vx = 0;
    colorBall.vy = 0;

    const r = SNOOKER_BALL_RADIUS;
    const isOccupied = (spot: { x: number; y: number }) => {
      return allBalls.some(
        (b) => !b.pocketed && b.id !== colorBall.id && Math.hypot(b.x - spot.x, b.y - spot.y) < r * 2
      );
    };

    // 1. Try home spot
    const home = colorBall.homeSpot || SNOOKER_SPOTS[colorBall.type as keyof typeof SNOOKER_SPOTS];
    if (home && !isOccupied(home)) {
      colorBall.x = home.x;
      colorBall.y = home.y;
      return;
    }

    // 2. Try highest vacant spot in priority order: Black, Pink, Blue, Brown, Green, Yellow
    const prioritySpots = [
      SNOOKER_SPOTS.black,
      SNOOKER_SPOTS.pink,
      SNOOKER_SPOTS.blue,
      SNOOKER_SPOTS.brown,
      SNOOKER_SPOTS.green,
      SNOOKER_SPOTS.yellow,
    ];

    for (const spot of prioritySpots) {
      if (!isOccupied(spot)) {
        colorBall.x = spot.x;
        colorBall.y = spot.y;
        return;
      }
    }

    // 3. Fallback: Place along the center line offset
    colorBall.x = (home ? home.x : 480) + r * 2.5;
    colorBall.y = home ? home.y : 240;
  }

  /**
   * Gets the current color on in color clearance sequence.
   */
  public static getNextClearanceTarget(balls: SnookerBall[]): SnookerTarget {
    for (const colorType of COLOR_CLEARANCE_ORDER) {
      const b = balls.find((ball) => ball.type === colorType && !ball.pocketed);
      if (b) {
        return colorType.toUpperCase() as SnookerTarget;
      }
    }
    return "BLACK";
  }

  /**
   * Determines if incoming player is snookered on all balls-on (for Free Ball detection).
   */
  public static isPlayerSnookered(
    cueBall: SnookerBall,
    targetBalls: SnookerBall[],
    obstacleBalls: SnookerBall[]
  ): boolean {
    if (targetBalls.length === 0) return false;

    const r = SNOOKER_BALL_RADIUS;

    for (const target of targetBalls) {
      const dx = target.x - cueBall.x;
      const dy = target.y - cueBall.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.001) continue;

      const nx = -dy / dist;
      const ny = dx / dist;

      let leftObstructed = false;
      let rightObstructed = false;

      const pLeft = { x: target.x + nx * r, y: target.y + ny * r };
      const pRight = { x: target.x - nx * r, y: target.y - ny * r };

      for (const obs of obstacleBalls) {
        if (obs.id === target.id || obs.id === cueBall.id || obs.pocketed) continue;

        if (this.intersectsSegment(cueBall, pLeft, obs, r)) leftObstructed = true;
        if (this.intersectsSegment(cueBall, pRight, obs, r)) rightObstructed = true;
      }

      if (!leftObstructed || !rightObstructed) {
        return false;
      }
    }

    return true;
  }

  private static intersectsSegment(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    circle: { x: number; y: number },
    radius: number
  ): boolean {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return false;

    const u = ((circle.x - p1.x) * dx + (circle.y - p1.y) * dy) / (len * len);
    if (u < 0 || u > 1) return false;

    const projX = p1.x + u * dx;
    const projY = p1.y + u * dy;
    return Math.hypot(circle.x - projX, circle.y - projY) < radius * 1.8;
  }

  /**
   * Evaluates a completed shot simulation against official snooker rules.
   */
  public static evaluateShot(
    state: SnookerState,
    simResult: SnookerSimulationResult,
    shooterSeat: number,
    shotId?: string
  ): {
    nextState: SnookerState;
    foulPenalty: number;
    foulReason: string | null;
    pointsEarned: number;
  } {
    const balls = simResult.balls.map((b) => ({ ...b }));
    const players = state.players.map((p) => ({
      ...p,
      score: p.seat === 0 ? state.player1Score : state.player2Score,
      framesWon: p.seat === 0 ? state.player1FramesWon : state.player2FramesWon,
      highestBreak: p.seat === 0 ? state.player1HighestBreak : state.player2HighestBreak,
    }));

    const shooter = players.find((p) => p.seat === shooterSeat) || players[0];
    const opponent = players.find((p) => p.seat !== shooterSeat) || players[1];

    shooter.currentBreak = (shooterSeat === 0 ? state.player1Break : state.player2Break) || 0;

    let foulReason: string | null = null;
    let foulPenalty = 0;
    let pointsEarned = 0;
    let turnContinues = false;

    const legalTypes = this.getLegalBallTypes(
      state.targetBall,
      state.freeBallAvailable,
      state.nominatedBall
    );

    const pocketedBalls = balls.filter((b) => simResult.pocketedBallIds.includes(b.id));
    const cueBallPocketed = simResult.cueBallPocketed;

    // ── 1. Check Foul Conditions ─────────────────────────────────────────────
    if (cueBallPocketed) {
      foulReason = "Cue ball pocketed (In-off)";
      foulPenalty = 4;
    } else if (!simResult.firstBallHit) {
      foulReason = `No ball contacted (Target was ${state.targetBall})`;
      foulPenalty = 4;
    } else if (!legalTypes.includes(simResult.firstBallHit.type)) {
      const hitValue = SNOOKER_BALL_VALUES[simResult.firstBallHit.type] || 4;
      const targetValue =
        state.targetBall === "RED"
          ? 1
          : state.targetBall === "COLOR"
          ? 7
          : SNOOKER_BALL_VALUES[state.targetBall.toLowerCase()] || 4;
      foulPenalty = Math.max(4, hitValue, targetValue);
      foulReason = `Hit ${simResult.firstBallHit.type.toUpperCase()} first when ${state.targetBall} was on`;
    }

    // Check if any illegal balls were pocketed
    for (const pb of pocketedBalls) {
      if (pb.type === "cue") continue;
      if (!legalTypes.includes(pb.type)) {
        const val = SNOOKER_BALL_VALUES[pb.type] || 4;
        foulPenalty = Math.max(foulPenalty, 4, val);
        foulReason = `Pocketed ${pb.type.toUpperCase()} illegally`;
      }
    }

    // Check if multiple balls were pocketed illegally (only multiple REDs on a RED shot are legal)
    if (!foulReason && pocketedBalls.length > 1) {
      const nonReds = pocketedBalls.filter((b) => b.type !== "red");
      if (state.targetBall !== "RED" || nonReds.length > 0) {
        foulPenalty = Math.max(foulPenalty, 4, ...pocketedBalls.map((b) => SNOOKER_BALL_VALUES[b.type] || 4));
        foulReason = "Multiple balls pocketed illegally";
      }
    }

    // ── 2. Handle Foul Resolution ────────────────────────────────────────────
    if (foulReason) {
      foulPenalty = Math.max(4, foulPenalty);
      opponent.score += foulPenalty;
      shooter.fouls += 1;
      shooter.currentBreak = 0;

      // Respot any illegally pocketed colors
      for (const pb of pocketedBalls) {
        if (pb.type !== "red" && pb.type !== "cue") {
          this.respotColor(pb, balls);
        }
      }

      // If cue ball was pocketed, place in hand in the D
      if (cueBallPocketed) {
        const cue = balls.find((b) => b.type === "cue");
        if (cue) {
          cue.pocketed = false;
          cue.pocketIndex = null;
          cue.x = SNOOKER_SPOTS.brown.x - 30;
          cue.y = SNOOKER_SPOTS.brown.y;
          cue.vx = 0;
          cue.vy = 0;
        }
      }

      const redsCount = balls.filter((b) => b.type === "red" && !b.pocketed).length;
      const nextTarget = redsCount > 0 ? "RED" : this.getNextClearanceTarget(balls);

      // Check if opponent is snookered on all legal targets -> Award Free Ball
      const cueBall = balls.find((b) => b.type === "cue")!;
      const legalTargets = balls.filter((b) => !b.pocketed && (redsCount > 0 ? b.type === "red" : b.type === nextTarget.toLowerCase()));
      const obstacles = balls.filter((b) => !b.pocketed && !legalTargets.some((lt) => lt.id === b.id));
      const freeBall = this.isPlayerSnookered(cueBall, legalTargets, obstacles);

      const nextFrameStatus = freeBall
        ? "FREE_BALL"
        : redsCount > 0
        ? "RED_PHASE"
        : "COLOR_CLEARANCE";

      const nextState: SnookerState = {
        ...state,
        balls,
        players,
        currentPlayer: 1 - shooterSeat,
        currentSeat: 1 - shooterSeat,
        currentTurnPlayerId: opponent.userId,
        frameStatus: nextFrameStatus,
        targetBall: freeBall ? "FREE_BALL" : nextTarget,
        redsRemaining: redsCount,
        player1Score: players[0].score,
        player2Score: players[1].score,
        player1Break: 0,
        player2Break: 0,
        currentBreak: 0,
        cueBallInHand: cueBallPocketed,
        inBaulkOnly: cueBallPocketed,
        freeBallAvailable: freeBall,
        nominatedBall: null,
        lastFoul: foulReason,
        foulPoints: foulPenalty,
        lastShot: {
          shotId: shotId || String(Date.now()),
          shooterSeat,
          angle: 0,
          power: 0,
          pointsEarned: 0,
          foulReason,
          foulPenalty,
        },
        stateVersion: state.stateVersion + 1,
        lastProcessedShotId: shotId || null,
        turnNumber: state.turnNumber + 1,
        shotNumber: state.shotNumber + 1,
        lastActionAtMs: Date.now(),
        keyframes: simResult.keyframes,
      };

      return {
        nextState,
        foulPenalty,
        foulReason,
        pointsEarned: 0,
      };
    }

    // ── 3. Handle Legal Shot Scoring ──────────────────────────────────────────
    const legalPocketed = pocketedBalls.filter((b) => legalTypes.includes(b.type));
    let redsCount = balls.filter((b) => b.type === "red" && !b.pocketed).length;
    let nextTarget: SnookerTarget = state.targetBall;
    let nextFrameStatus: SnookerFrameStatus = state.frameStatus;

    if (legalPocketed.length > 0) {
      turnContinues = true;

      if (state.targetBall === "RED" || (state.frameStatus === "FREE_BALL" && state.nominatedBall)) {
        // Red(s) potted (or free ball on red)
        const redPts = legalPocketed.length; // 1 pt per red
        pointsEarned += redPts;
        shooter.score += redPts;
        shooter.currentBreak += redPts;

        // If free ball color was potted, respot it
        if (state.frameStatus === "FREE_BALL") {
          for (const pb of legalPocketed) {
            if (pb.type !== "red") this.respotColor(pb, balls);
          }
        }

        nextTarget = "COLOR";
        nextFrameStatus = "COLOR_PHASE";
      } else if (state.targetBall === "COLOR" || state.frameStatus === "COLOR_PHASE") {
        // Color potted while reds remain
        const colorBall = legalPocketed[0];
        const colorPts = SNOOKER_BALL_VALUES[colorBall.type];
        pointsEarned += colorPts;
        shooter.score += colorPts;
        shooter.currentBreak += colorPts;

        // Respot the color ball to its spot
        this.respotColor(colorBall, balls);

        redsCount = balls.filter((b) => b.type === "red" && !b.pocketed).length;
        if (redsCount > 0) {
          nextTarget = "RED";
          nextFrameStatus = "RED_PHASE";
        } else {
          nextTarget = "YELLOW";
          nextFrameStatus = "COLOR_CLEARANCE";
        }
      } else {
        // Color potted during Color Clearance
        const colorBall = legalPocketed[0];
        const colorPts = SNOOKER_BALL_VALUES[colorBall.type];
        pointsEarned += colorPts;
        shooter.score += colorPts;
        shooter.currentBreak += colorPts;

        // Ball remains pocketed (NOT respotted in clearance)
        nextTarget = this.getNextClearanceTarget(balls);
        nextFrameStatus = "COLOR_CLEARANCE";
      }

      if (shooter.currentBreak > shooter.highestBreak) {
        shooter.highestBreak = shooter.currentBreak;
      }
    } else {
      // Missed pot without foul -> Pass turn to opponent
      turnContinues = false;
      shooter.currentBreak = 0;
      redsCount = balls.filter((b) => b.type === "red" && !b.pocketed).length;
      if (redsCount > 0) {
        nextTarget = "RED";
        nextFrameStatus = "RED_PHASE";
      } else {
        nextTarget = this.getNextClearanceTarget(balls);
        nextFrameStatus = "COLOR_CLEARANCE";
      }
    }

    // ── 4. Frame & Match Completion Evaluation ───────────────────────────────
    let frameStatus: SnookerFrameStatus = nextFrameStatus;
    let matchStatus = state.matchStatus;
    let frameWinnerSeats = state.frameWinnerSeats;
    let finished = state.finished;
    let winnerSeats = state.winnerSeats;
    let winnerIds = state.winnerIds;
    const frameHistory = [...(state.frameHistory || [])];

    const remainingBallsOnTable = balls.filter((b) => b.type !== "cue" && !b.pocketed);

    // Frame ends when all balls are cleared (including final Black)
    if (remainingBallsOnTable.length === 0) {
      frameStatus = "FRAME_END";
      let winningSeat: number | null = null;

      if (players[0].score > players[1].score) {
        players[0].framesWon += 1;
        winningSeat = 0;
        frameWinnerSeats = [0];
      } else if (players[1].score > players[0].score) {
        players[1].framesWon += 1;
        winningSeat = 1;
        frameWinnerSeats = [1];
      } else {
        winningSeat = null;
        frameWinnerSeats = [0, 1];
      }

      // Record completed frame to history
      const frameRecord: SnookerFrameHistoryItem = {
        frameNumber: state.frameNumber,
        player1Score: players[0].score,
        player2Score: players[1].score,
        winnerSeat: winningSeat,
        highestBreak: Math.max(players[0].highestBreak, players[1].highestBreak),
        durationSeconds: Math.round((Date.now() - state.lastActionAtMs) / 1000),
        completedAt: new Date().toISOString(),
      };
      frameHistory.push(frameRecord);

      const framesToWin = Math.ceil(state.totalFrames / 2);
      if (players[0].framesWon >= framesToWin) {
        finished = true;
        matchStatus = "FINISHED";
        frameStatus = "MATCH_END";
        winnerSeats = [0];
        winnerIds = [players[0].userId];
      } else if (players[1].framesWon >= framesToWin) {
        finished = true;
        matchStatus = "FINISHED";
        frameStatus = "MATCH_END";
        winnerSeats = [1];
        winnerIds = [players[1].userId];
      }
    }

    const nextSeat = turnContinues ? shooterSeat : 1 - shooterSeat;
    const nextPlayer = players.find((p) => p.seat === nextSeat) || players[0];

    const nextState: SnookerState = {
      ...state,
      balls,
      players,
      currentPlayer: nextSeat,
      currentSeat: nextSeat,
      currentTurnPlayerId: nextPlayer.userId,
      frameStatus,
      matchStatus,
      targetBall: nextTarget,
      redsRemaining: redsCount,
      player1Score: players[0].score,
      player2Score: players[1].score,
      player1Break: shooterSeat === 0 ? shooter.currentBreak : 0,
      player2Break: shooterSeat === 1 ? shooter.currentBreak : 0,
      player1FramesWon: players[0].framesWon,
      player2FramesWon: players[1].framesWon,
      player1HighestBreak: players[0].highestBreak,
      player2HighestBreak: players[1].highestBreak,
      currentBreak: turnContinues ? shooter.currentBreak : 0,
      cueBallInHand: false,
      inBaulkOnly: false,
      freeBallAvailable: false,
      nominatedBall: null,
      lastFoul: null,
      foulPoints: 0,
      lastShot: {
        shotId: shotId || String(Date.now()),
        shooterSeat,
        angle: 0,
        power: 0,
        pointsEarned,
        foulReason: null,
        foulPenalty: 0,
      },
      frameHistory,
      frameWinnerSeats,
      finished,
      winnerSeats,
      winnerIds,
      stateVersion: state.stateVersion + 1,
      lastProcessedShotId: shotId || null,
      turnNumber: state.turnNumber + 1,
      shotNumber: state.shotNumber + 1,
      lastActionAtMs: Date.now(),
      keyframes: simResult.keyframes,
    };

    return {
      nextState,
      foulPenalty: 0,
      foulReason: null,
      pointsEarned,
    };
  }

  /**
   * Creates a new frame state, racking a fresh 22-ball setup while preserving match frames and history.
   */
  public static startNextFrame(state: SnookerState): SnookerState {
    const balls = createInitialSnookerSetup();
    const players: SnookerPlayer[] = state.players.map((p) => ({
      ...p,
      score: 0,
      currentBreak: 0,
      fouls: 0,
    }));

    const nextBreakSeat = state.frameNumber % 2; // Alternate break-off between frames

    return {
      ...state,
      balls,
      players,
      currentPlayer: nextBreakSeat,
      currentSeat: nextBreakSeat,
      currentTurnPlayerId: players[nextBreakSeat]?.userId || players[0].userId,
      frameStatus: "BREAK",
      matchStatus: "IN_PROGRESS",
      targetBall: "RED",
      redsRemaining: 15,
      player1Score: 0,
      player2Score: 0,
      player1Break: 0,
      player2Break: 0,
      currentBreak: 0,
      cueBallInHand: false,
      inBaulkOnly: false,
      freeBallAvailable: false,
      nominatedBall: null,
      lastFoul: null,
      foulPoints: 0,
      frameNumber: state.frameNumber + 1,
      frameWinnerSeats: [],
      stateVersion: state.stateVersion + 1,
      turnNumber: 0,
      shotNumber: 0,
      lastActionAtMs: Date.now(),
      keyframes: [],
    };
  }
}
