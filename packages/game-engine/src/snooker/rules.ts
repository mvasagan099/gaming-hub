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

    // 3. Fallback: Place along the center line offset towards top cushion
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
   * Exact WPBSA raycasting with diameter (radius * 2.0) tangent clearance.
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
    return Math.hypot(circle.x - projX, circle.y - projY) < radius * 2.0;
  }

  /**
   * Evaluates a completed shot simulation against official WPBSA snooker rules.
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
    const player0 = (state.players || []).find((p) => p.seat === 0) || {
      seat: 0,
      userId: "player-1",
      score: state.player1Score || 0,
      framesWon: state.player1FramesWon || 0,
      currentBreak: 0,
      highestBreak: state.player1HighestBreak || 0,
      fouls: 0,
    };
    const player1 = (state.players || []).find((p) => p.seat === 1) || {
      seat: 1,
      userId: "player-2",
      score: state.player2Score || 0,
      framesWon: state.player2FramesWon || 0,
      currentBreak: 0,
      highestBreak: state.player2HighestBreak || 0,
      fouls: 0,
    };

    const players: SnookerPlayer[] = [
      {
        ...player0,
        score: state.player1Score ?? player0.score ?? 0,
        framesWon: state.player1FramesWon ?? player0.framesWon ?? 0,
        highestBreak: state.player1HighestBreak ?? player0.highestBreak ?? 0,
      },
      {
        ...player1,
        score: state.player2Score ?? player1.score ?? 0,
        framesWon: state.player2FramesWon ?? player1.framesWon ?? 0,
        highestBreak: state.player2HighestBreak ?? player1.highestBreak ?? 0,
      },
    ];

    const shooter = shooterSeat === 0 ? players[0] : players[1];
    const opponent = shooterSeat === 0 ? players[1] : players[0];

    shooter.currentBreak = (shooterSeat === 0 ? state.player1Break : state.player2Break) || 0;

    let foulReason: string | null = null;
    let foulPenalty = 0;
    let pointsEarned = 0;
    let turnContinues = false;

    const effectiveTarget = state.targetBall;
    const legalTypes = this.getLegalBallTypes(
      effectiveTarget,
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
      foulReason = `No ball contacted (Target was ${effectiveTarget})`;
      foulPenalty = 4;
    } else if (!legalTypes.includes(simResult.firstBallHit.type)) {
      const hitValue = SNOOKER_BALL_VALUES[simResult.firstBallHit.type] || 4;
      const targetValue =
        effectiveTarget === "RED"
          ? 1
          : effectiveTarget === "COLOR"
          ? 7
          : SNOOKER_BALL_VALUES[effectiveTarget.toLowerCase()] || 4;
      foulPenalty = Math.max(4, hitValue, targetValue);
      foulReason = `Hit ${simResult.firstBallHit.type.toUpperCase()} first when ${effectiveTarget} was on`;
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
      if (effectiveTarget !== "RED" || nonReds.length > 0) {
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

      const redsCount = balls.filter((b) => b.type === "red" && !b.pocketed).length;
      const nextTarget = redsCount > 0 ? "RED" : this.getNextClearanceTarget(balls);

      // Check for WPBSA Final Black Foul / Respotted Black rule
      const remainingObjectBalls = balls.filter((b) => b.type !== "cue" && !b.pocketed);
      let isFrameOverOnFoul = false;
      let triggerRespottedBlackOnFoul = false;

      if (remainingObjectBalls.length === 1 && remainingObjectBalls[0].type === "black") {
        if (players[0].score === players[1].score) {
          triggerRespottedBlackOnFoul = true;
        } else {
          isFrameOverOnFoul = true;
        }
      }

      // Only place cue ball in hand inside the D if it was pocketed (In-off foul) or on respotted black
      if (cueBallPocketed || triggerRespottedBlackOnFoul) {
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

      // Check if opponent is snookered on all legal targets -> Award Free Ball
      const cueBall = balls.find((b) => b.type === "cue")!;
      const legalTargets = balls.filter((b) => !b.pocketed && (redsCount > 0 ? b.type === "red" : b.type === nextTarget.toLowerCase()));
      const obstacles = balls.filter((b) => !b.pocketed && !legalTargets.some((lt) => lt.id === b.id));
      const freeBall = !isFrameOverOnFoul && this.isPlayerSnookered(cueBall, legalTargets, obstacles);

      let nextFrameStatus: SnookerFrameStatus = freeBall
        ? "FREE_BALL"
        : redsCount > 0
        ? "RED_PHASE"
        : "COLOR_CLEARANCE";

      if (triggerRespottedBlackOnFoul) {
        // Respot black on spot
        const black = balls.find((b) => b.type === "black");
        if (black) this.respotColor(black, balls);
        nextFrameStatus = "COLOR_CLEARANCE";
      } else if (isFrameOverOnFoul) {
        nextFrameStatus = "FRAME_END";
      }

      let finished = state.finished;
      let matchStatus = state.matchStatus;
      let winnerSeats = state.winnerSeats;
      let winnerIds = state.winnerIds;
      let frameWinnerSeats = state.frameWinnerSeats;
      const frameHistory = [...(state.frameHistory || [])];

      if (isFrameOverOnFoul) {
        let winningSeat: number | null = null;
        if (players[0].score > players[1].score) {
          players[0].framesWon += 1;
          winningSeat = 0;
          frameWinnerSeats = [0];
        } else if (players[1].score > players[0].score) {
          players[1].framesWon += 1;
          winningSeat = 1;
          frameWinnerSeats = [1];
        }

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
          nextFrameStatus = "MATCH_END";
          winnerSeats = [0];
          winnerIds = [players[0].userId];
        } else if (players[1].framesWon >= framesToWin) {
          finished = true;
          matchStatus = "FINISHED";
          nextFrameStatus = "MATCH_END";
          winnerSeats = [1];
          winnerIds = [players[1].userId];
        }
      }

      const nextState: SnookerState = {
        ...state,
        balls,
        players,
        currentPlayer: 1 - shooterSeat,
        currentSeat: 1 - shooterSeat,
        currentTurnPlayerId: opponent.userId,
        frameStatus: nextFrameStatus,
        matchStatus,
        targetBall: freeBall ? "FREE_BALL" : nextTarget,
        freeBallTarget: freeBall ? nextTarget : null,
        isRespottedBlack: triggerRespottedBlackOnFoul,
        isColorAfterFinalRed: false,
        redsRemaining: redsCount,
        player1Score: players[0].score,
        player2Score: players[1].score,
        player1Break: 0,
        player2Break: 0,
        currentBreak: 0,
        cueBallInHand: cueBallPocketed || triggerRespottedBlackOnFoul,
        inBaulkOnly: cueBallPocketed || triggerRespottedBlackOnFoul,
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
        turnStartedAtMs: Date.now(),
        finished,
        winnerSeats,
        winnerIds,
        frameWinnerSeats,
        frameHistory,
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
    let isColorAfterFinalRed = state.isColorAfterFinalRed || false;

    if (legalPocketed.length > 0) {
      turnContinues = true;

      if (state.targetBall === "RED" || (state.frameStatus === "FREE_BALL" && state.freeBallTarget === "RED")) {
        // Red(s) potted (or free ball on red)
        const isFreeBallOnRed = state.frameStatus === "FREE_BALL" && state.freeBallTarget === "RED";
        const pts = isFreeBallOnRed ? 1 : legalPocketed.length;
        pointsEarned += pts;
        shooter.score += pts;
        shooter.currentBreak += pts;

        // If free ball color was potted, respot it
        if (isFreeBallOnRed) {
          for (const pb of legalPocketed) {
            if (pb.type !== "red") this.respotColor(pb, balls);
          }
        }

        if (redsCount === 0 && !isFreeBallOnRed) {
          isColorAfterFinalRed = true;
        }

        nextTarget = "COLOR";
        nextFrameStatus = "COLOR_PHASE";
      } else if (state.frameStatus === "FREE_BALL" && state.freeBallTarget) {
        // Free ball on a clearance color (e.g. Yellow)
        const origTargetValue = SNOOKER_BALL_VALUES[state.freeBallTarget.toLowerCase()] || 2;
        pointsEarned += origTargetValue;
        shooter.score += origTargetValue;
        shooter.currentBreak += origTargetValue;

        // Respot nominated color
        for (const pb of legalPocketed) {
          if (pb.type !== "red") this.respotColor(pb, balls);
        }

        nextTarget = state.freeBallTarget;
        nextFrameStatus = "COLOR_CLEARANCE";
      } else if (state.targetBall === "COLOR" || state.frameStatus === "COLOR_PHASE") {
        // Color potted while reds remain OR color after final red
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
          isColorAfterFinalRed = false;
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

      if (isColorAfterFinalRed) {
        isColorAfterFinalRed = false;
        nextTarget = "YELLOW";
        nextFrameStatus = "COLOR_CLEARANCE";
      } else if (redsCount > 0) {
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
    let triggerRespottedBlack = false;
    const frameHistory = [...(state.frameHistory || [])];

    const remainingBallsOnTable = balls.filter((b) => b.type !== "cue" && !b.pocketed);

    // Frame ends when all balls are cleared (including final Black)
    if (remainingBallsOnTable.length === 0) {
      if (players[0].score === players[1].score) {
        // WPBSA Respotted Black Procedure on Tied Score
        triggerRespottedBlack = true;
        const black = balls.find((b) => b.type === "black");
        if (black) this.respotColor(black, balls);

        // Place cue ball in hand in D
        const cue = balls.find((b) => b.type === "cue");
        if (cue) {
          cue.pocketed = false;
          cue.pocketIndex = null;
          cue.x = SNOOKER_SPOTS.brown.x - 30;
          cue.y = SNOOKER_SPOTS.brown.y;
          cue.vx = 0;
          cue.vy = 0;
        }

        nextTarget = "BLACK";
        frameStatus = "COLOR_CLEARANCE";
      } else {
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
      freeBallTarget: null,
      isRespottedBlack: triggerRespottedBlack,
      isColorAfterFinalRed,
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
      cueBallInHand: triggerRespottedBlack,
      inBaulkOnly: triggerRespottedBlack,
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
      stateVersion: state.stateVersion + 1,
      lastProcessedShotId: shotId || null,
      turnNumber: state.turnNumber + 1,
      shotNumber: state.shotNumber + 1,
      lastActionAtMs: Date.now(),
      turnStartedAtMs: Date.now(),
      finished,
      winnerSeats,
      winnerIds,
      frameWinnerSeats,
      frameHistory,
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
   * Advances match to the next frame with fresh 22-ball setup and alternating break-off seat.
   */
  public static startNextFrame(state: SnookerState): SnookerState {
    const nextFrameNumber = state.frameNumber + 1;
    const breakOffSeat = (nextFrameNumber - 1) % 2; // Alternate break-off seat
    const nextPlayer = state.players.find((p) => p.seat === breakOffSeat) || state.players[0];

    const resetPlayers = state.players.map((p) => ({
      ...p,
      score: 0,
      currentBreak: 0,
      fouls: 0,
    }));

    return {
      ...state,
      frameNumber: nextFrameNumber,
      currentPlayer: breakOffSeat,
      currentSeat: breakOffSeat,
      currentTurnPlayerId: nextPlayer.userId,
      frameStatus: "BREAK",
      player1Score: 0,
      player2Score: 0,
      player1Break: 0,
      player2Break: 0,
      currentBreak: 0,
      redsRemaining: 15,
      targetBall: "RED",
      freeBallAvailable: false,
      freeBallTarget: null,
      isRespottedBlack: false,
      isColorAfterFinalRed: false,
      nominatedBall: null,
      balls: createInitialSnookerSetup(),
      players: resetPlayers,
      lastShot: null,
      lastFoul: null,
      foulPoints: 0,
      cueBallInHand: false,
      inBaulkOnly: false,
      stateVersion: state.stateVersion + 1,
      turnNumber: 0,
      shotNumber: 0,
      lastActionAtMs: Date.now(),
      keyframes: [],
    };
  }
}
