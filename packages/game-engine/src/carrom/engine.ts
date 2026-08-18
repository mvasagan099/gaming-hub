import type { EngineActionResult, EngineEvent, EnginePlayer, RandomSource } from "../types";
import { MultiplayerGameEngine } from "../base/MultiplayerGameEngine";
import {
  BASE_LINE_Y,
  type CarromState,
  type CarromAction,
  type CarromEngineOptions,
  type CarromEvent,
  type CarromCoin,
  type CarromPlayer,
  type CarromStriker,
  type CoinType,
} from "./types";
import {
  createInitialCoins,
  createInitialStriker,
  isValidStrikerPlacement,
  simulatePhysics,
  calculateScore,
  checkWinCondition,
  returnOneOwnCoin,
  placeCoinSafelyNearCenter,
} from "./physics";

export class CarromEngine extends MultiplayerGameEngine<CarromState, CarromAction> {
  readonly gameId = "carrom" as const;

  constructor(players: EnginePlayer[], rng?: RandomSource, options?: CarromEngineOptions) {
    const turnTimer = options?.turnTimer ?? { turnDurationMs: 30000, warningThresholdMs: 10000 };
    // Carrom matches are score/board based, so matchTimer is optional and not forced to 10 mins
    const matchTimer = options?.matchTimer;
    super(players, rng, {
      turnTimer,
      matchTimer,
      enableResign: options?.enableResign ?? true,
      enableDraw: options?.enableDraw ?? true,
      enablePause: options?.enablePause ?? true,
      enableRematch: options?.enableRematch ?? true,
      now: options?.now,
    });
  }

  override get currentMatchDeadline(): number | null {
    return null;
  }

  protected override onMatchTimerExpired(state: CarromState): EngineActionResult<CarromState> {
    return {
      ok: true,
      state,
      events: [{ type: "match-timer-tick" }],
      finished: false,
      winnerSeats: [],
    };
  }

  protected onTurnTimerExpired(seat: number, state: CarromState): EngineActionResult<CarromState> {
    console.log("[CARROM TIMER] TURN_TIMEOUT", {
      turnNumber: state.turnNumber,
      playerId: state.currentTurnPlayerId,
    });

    const next = this.cloneState(state);
    const player = next.players.find(p => p.seat === seat);
    if (player) {
      player.fouls++;
      player.consecutiveFouls++;
    }

    const events: EngineEvent[] = [];

    // If player had a pending queen cover attempt and timed out, cover fails and queen returns
    if (next.queenState === "PENDING_COVER" && next.pendingQueenOwner === seat) {
      next.queenState = "ON_BOARD";
      next.pendingQueenOwner = null;
      if (player) {
        player.queenPocketed = false;
        player.queenCovered = false;
      }
      const queenCoin = next.coins.find((c) => c.type === "queen");
      if (queenCoin) {
        queenCoin.pocketed = false;
        queenCoin.pocketedBy = null;
        queenCoin.pocketedAtTurn = null;
        placeCoinSafelyNearCenter(queenCoin, next.coins);
      }
      events.push({ type: "queen-returned", seat, reason: "cover-timeout" });
    }

    // Turn timeout: cancel positioning, reset striker for next player, start 30s timer.
    // Carrom matches never auto-forfeit; the turn simply passes to the opponent.
    const now = this.now();
    const nextSeat = seat === 0 ? 1 : 0;
    const nextPlayerId = this.players.find(p => p.seat === nextSeat)?.userId ?? `seat-${nextSeat}`;
    const prevPlayerId = state.currentTurnPlayerId;
    next.turnNumber++;
    next.currentSeat = nextSeat;
    next.currentTurnPlayerId = nextPlayerId;
    next.turnStartedAt = now;
    next.turnStartedAtMs = now;
    next.turnExpiresAt = now + 30000;
    next.isShotInProgress = false;
    next.strikerPlacementPhase = true;
    next.strikerPlacementSeat = nextSeat;
    next.striker = createInitialStriker(nextSeat);
    next.lastTrajectory = null;
    next.strikerAtShotStart = null;
    next.queenOnBoard = next.queenState === "ON_BOARD" && next.coins.some(c => !c.pocketed && c.type === "queen");

    console.log("[CARROM TIMER] TURN_CHANGED", {
      previousPlayerId: prevPlayerId,
      nextPlayerId,
      turnNumber: next.turnNumber,
    });
    console.log("[CARROM TIMER] TURN_STARTED", {
      turnNumber: next.turnNumber,
      playerId: nextPlayerId,
      startedAt: next.turnStartedAt,
      expiresAt: next.turnExpiresAt,
    });

    events.push({ type: "turn-timeout", seat, nextSeat, turnNumber: next.turnNumber });

    return {
      ok: true,
      state: next,
      events,
      finished: false,
      winnerSeats: [],
    };
  }

  protected getInitialSeat(): number {
    return 0;
  }

  protected initBaseState(): Omit<CarromState, keyof import("../base/MultiplayerGameEngine").BaseState> {
    const coins = createInitialCoins();
    const striker = createInitialStriker(0);
    const carromPlayers: CarromPlayer[] = this.players.map((p) => ({
      seat: p.seat,
      color: p.seat === 0 ? "white" : "black",
      score: 0,
      queenPocketed: false,
      queenCovered: false,
      fouls: 0,
      consecutiveFouls: 0,
    }));

    const now = this.now();
    const currentTurnPlayerId = this.players.find(p => p.seat === 0)?.userId ?? "seat-0";
    const turnStartedAt = now;
    const turnExpiresAt = now + 30000;

    console.log("[CARROM TIMER] TURN_STARTED", {
      turnNumber: 1,
      playerId: currentTurnPlayerId,
      startedAt: turnStartedAt,
      expiresAt: turnExpiresAt,
    });

    console.log("[CarromEngine] INITIAL_MATCH_STATE created", {
      totalCoins: coins.length,
      coins: coins.map(c => ({ id: c.id, type: c.type, x: Math.round(c.x), y: Math.round(c.y) })),
    });

    return {
      coins,
      striker,
      players: carromPlayers,
      currentTurnPlayerId,
      turnStartedAt,
      turnExpiresAt,
      isShotInProgress: false,
      lastAction: null,
      lastActionSeat: null,
      lastActionAtMs: null,
      strikerAtShotStart: null,
      lastTrajectory: null,
      strikerPlacementPhase: true,
      strikerPlacementSeat: 0,
      foulThisTurn: false,
      queenOnBoard: true,
      queenState: "ON_BOARD",
      pendingQueenOwner: null,
    };
  }

  protected validateGameAction(action: CarromAction, seat: number, state: CarromState): string | null {
    if (state.finished) return "Game is finished";
    if (state.paused) return "Game is paused";

    switch (action.type) {
      case "place-striker": {
        if (state.currentSeat !== seat) return "Not your turn";
        if (state.isShotInProgress) return "Shot in progress";
        const now = this.now();
        if (state.turnExpiresAt && now > state.turnExpiresAt + 1000) return "Turn expired";
        if (typeof action.x !== "number") return "Invalid x coordinate";
        if (!isValidStrikerPlacement(action.x, seat, state.coins)) return "Invalid striker placement position";
        return null;
      }

      case "strike": {
        if (state.currentSeat !== seat) return "Not your turn";
        if (state.isShotInProgress) return "Shot in progress";
        const now = this.now();
        if (state.turnExpiresAt && now > state.turnExpiresAt + 1000) return "Turn expired";
        if (state.striker.pocketed) return "Striker was pocketed, place again";
        if (!state.striker.placed && action.x === undefined) return "Place the striker first";
        if (typeof action.angle !== "number" || typeof action.power !== "number") return "Invalid strike parameters";
        if (action.power < 0 || action.power > 1) return "Power must be between 0 and 1";
        // Math.atan2 returns [-π, π]; after seat-1 flip it can reach [-2π, 2π]
        if (Math.abs(action.angle) > Math.PI * 2) return "Angle must be between -2π and 2π";
        if (action.x !== undefined && !isValidStrikerPlacement(action.x, seat, state.coins)) {
          return "Invalid striker placement position";
        }
        return null;
      }

      default:
        return "Unknown action for Carrom";
    }
  }

  protected applyGameAction(action: CarromAction, seat: number, state: CarromState): EngineActionResult<CarromState> {
    const now = this.now();
    const events: EngineEvent[] = [];

    switch (action.type) {
      case "place-striker":
        return this.applyPlaceStriker(action, seat, state, now, events);

      case "strike":
        return this.applyStrike(action, seat, state, now, events);

      default:
        return {
          ok: false,
          error: "Unknown action for Carrom",
          state,
          events: [],
          finished: state.finished,
          winnerSeats: state.winnerSeats,
        };
    }
  }

  private applyPlaceStriker(
    action: CarromAction & { type: "place-striker"; x: number },
    seat: number,
    state: CarromState,
    now: number,
    events: EngineEvent[],
  ): EngineActionResult<CarromState> {
    const next = this.cloneState(state);
    next.striker.x = action.x;
    // Player 0 places at bottom (y=507), Player 1 places at top (y=93)
    next.striker.y = seat === 0 ? BASE_LINE_Y : 93;
    next.striker.placed = true;
    next.striker.placedBy = seat;
    next.strikerPlacementPhase = false;
    next.lastAction = action;
    next.lastActionSeat = seat;
    next.lastActionAtMs = now;

    const player = next.players.find((p) => p.seat === seat);
    if (player) {
      player.consecutiveFouls = 0;
    }

    if (next.matchStartedAtMs === null) {
      next.matchStartedAtMs = now;
    }

    events.push({
      type: "striker-placed",
      seat,
      x: action.x,
      y: next.striker.y,
    });

    return {
      ok: true,
      state: next,
      events,
      finished: false,
      winnerSeats: [],
    };
  }

  private applyStrike(
    action: CarromAction & { type: "strike"; angle: number; power: number; x?: number },
    seat: number,
    state: CarromState,
    now: number,
    events: EngineEvent[],
  ): EngineActionResult<CarromState> {
    const next = this.cloneState(state);
    const player = next.players.find((p) => p.seat === seat)!;

    const remaining = Math.max(0, (next.turnExpiresAt ?? (next.turnStartedAtMs ? next.turnStartedAtMs + 30000 : now + 30000)) - now);
    console.log("[CARROM TIMER] SHOT_ACCEPTED", {
      turnNumber: next.turnNumber,
      playerId: next.currentTurnPlayerId,
      remaining,
    });

    next.isShotInProgress = true;

    if (action.x !== undefined) {
      next.striker.x = action.x;
    }
    next.striker.y = seat === 0 ? BASE_LINE_Y : 93;
    next.strikerAtShotStart = { ...next.striker };

    const maxSpeed = 27;
    const speed = action.power * maxSpeed;
    next.striker.vx = Math.cos(action.angle) * speed;
    next.striker.vy = Math.sin(action.angle) * speed;
    next.striker.placed = true;
    next.strikerPlacementPhase = false;

    // 600 steps = 10 s of simulated physics — fully settles all realistic shots
    const { pocketedCoins, pocketedStriker, events: physicsEvents, keyframes } = simulatePhysics(
      next.coins,
      next.striker,
      1 / 60,
      600,
    );

    next.lastTrajectory = keyframes;

    console.log("[CarromEngine] SHOT_START_WORLD", {
      shotId: now,
      shooterSeat: seat,
      strikerStartWorld: next.strikerAtShotStart,
      power: action.power,
      angle: action.angle,
    });
    console.log("[CarromEngine] SHOT_KEYFRAMES_WORLD", {
      shotId: now,
      totalKeyframes: keyframes.length,
      firstKeyframe: keyframes[0],
      lastKeyframe: keyframes[keyframes.length - 1],
    });
    console.log("[CarromEngine] SHOT_RESULT_WORLD", {
      shotId: now,
      pocketedCoins: pocketedCoins.map((c) => ({ id: c.id, type: c.type, x: c.x, y: c.y })),
      pocketedStriker,
    });

    events.push({
      type: "carrom:shot-start",
      shotId: now,
      shooterId: `seat-${seat}`,
      shooterSeat: seat,
      serverTimestamp: now,
      strikerStartWorld: next.strikerAtShotStart,
      strikerVelocityWorld: { vx: next.striker.vx, vy: next.striker.vy },
      shotPower: action.power,
      shotDirectionWorld: action.angle,
      keyframes,
    });

    events.push({
      type: "shot-trajectory",
      shotId: now,
      shooterSeat: seat,
      keyframes,
      pocketEvents: physicsEvents.filter((e) => e.type === "coin-pocketed" || e.type === "striker-pocketed"),
    });

    for (const physicsEvent of physicsEvents) {
      events.push({ ...physicsEvent, seat });
    }

    if (player) {
      player.consecutiveFouls = 0;
    }

    if (next.matchStartedAtMs === null) {
      next.matchStartedAtMs = now;
    }

    let foul = pocketedStriker;
    let earnedExtraTurn = false;
    let queenPocketed = false;
    let queenCovered = false;
    let queenReturned = false;

    // Reset striker after shot
    next.striker.placed = false;
    next.striker.pocketed = false;
    next.striker.vx = 0;
    next.striker.vy = 0;

    const playerColor: CoinType = seat === 0 ? "white" : "black";
    const result = calculateScore(pocketedCoins, playerColor);
    const opponentSeat = seat === 0 ? 1 : 0;
    const opponentPlayer = next.players.find((p) => p.seat === opponentSeat);

    const queenPocketedThisShot = pocketedCoins.some((c) => c.type === "queen");
    const ownCoinPocketedThisShot = pocketedCoins.some((c) => c.type === playerColor);
    const queenCoveredThisShot = queenPocketedThisShot && ownCoinPocketedThisShot;

    console.log("[CARROM] QUEEN_RESULT", {
      seat,
      pocketedCoins: pocketedCoins.map((c) => ({
        id: c.id,
        type: c.type,
        pocketed: c.pocketed,
      })),
      playerColor,
      queenPocketedThisShot,
      ownCoinPocketedThisShot,
      queenCoveredThisShot,
      queenStateBefore: next.queenState,
      pendingQueenOwnerBefore: next.pendingQueenOwner,
      result,
    });

    if (foul) {
      player.fouls++;
      events.push({ type: "foul", seat, reason: "striker-pocketed" });
      const returned = returnOneOwnCoin(next.coins, seat);
      if (returned) {
        player.score = Math.max(0, player.score - 1);
        events.push({ type: "coin-returned", seat, coinId: returned.id, coinType: returned.type });
      }

      // If queen was in pending cover or pocketed this shot, foul cancels it and queen returns to center
      if (next.queenState === "PENDING_COVER" || queenPocketedThisShot) {
        next.queenState = "ON_BOARD";
        next.pendingQueenOwner = null;
        player.queenPocketed = false;
        player.queenCovered = false;
        const qc = next.coins.find((c) => c.type === "queen");
        if (qc) {
          qc.pocketed = false;
          qc.pocketedBy = null;
          qc.pocketedAtTurn = null;
          placeCoinSafelyNearCenter(qc, next.coins);
          queenReturned = true;
          events.push({ type: "queen-returned", seat, reason: "foul" });
        }
      }
      earnedExtraTurn = false;
    } else if (queenPocketedThisShot && ownCoinPocketedThisShot) {
      // 1. Immediate cover: Queen + own coin in the same shot
      next.queenState = "COVERED";
      next.pendingQueenOwner = null;
      player.queenPocketed = true;
      player.queenCovered = true;
      queenPocketed = true;
      queenCovered = true;
      player.score = Math.min(9, player.score + 3 + result.score);
      const queenCoin = next.coins.find((c) => c.type === "queen");
      if (queenCoin) {
        queenCoin.pocketed = true;
        queenCoin.pocketedBy = seat;
        queenCoin.pocketedAtTurn = next.turnNumber;
      }
      events.push({ type: "queen-pocketed", seat });
      events.push({ type: "queen-covered", seat });
      earnedExtraTurn = true;
    } else if (queenPocketedThisShot && !ownCoinPocketedThisShot) {
      // 2. Queen captured alone: enters PENDING_COVER (remains off-board, same player gets follow-up cover shot)
      next.queenState = "PENDING_COVER";
      next.pendingQueenOwner = seat;
      player.queenPocketed = true;
      player.queenCovered = false;
      queenPocketed = true;
      queenCovered = false;
      const queenCoin = next.coins.find((c) => c.type === "queen");
      if (queenCoin) {
        queenCoin.pocketed = true;
        queenCoin.pocketedBy = seat;
        queenCoin.pocketedAtTurn = next.turnNumber;
      }
      events.push({ type: "queen-pocketed", seat });
      events.push({ type: "queen-pending-cover", seat });
      earnedExtraTurn = true;
    } else if (
      next.queenState === "PENDING_COVER" &&
      next.pendingQueenOwner === seat &&
      ownCoinPocketedThisShot
    ) {
      // 3. Cover completed on follow-up shot
      next.queenState = "COVERED";
      next.pendingQueenOwner = null;
      player.queenPocketed = true;
      player.queenCovered = true;
      queenPocketed = true;
      queenCovered = true;
      player.score = Math.min(9, player.score + 3 + result.score);
      const queenCoin = next.coins.find((c) => c.type === "queen");
      if (queenCoin) {
        queenCoin.pocketed = true;
        queenCoin.pocketedBy = seat;
        queenCoin.pocketedAtTurn = next.turnNumber;
      }
      events.push({ type: "queen-covered", seat });
      earnedExtraTurn = true;
    } else if (
      next.queenState === "PENDING_COVER" &&
      next.pendingQueenOwner === seat
    ) {
      // 4. Cover attempt failed on follow-up shot (no own coin pocketed)
      next.queenState = "ON_BOARD";
      next.pendingQueenOwner = null;
      player.queenPocketed = false;
      player.queenCovered = false;
      queenReturned = true;
      const queenCoin = next.coins.find((c) => c.type === "queen");
      if (queenCoin) {
        queenCoin.pocketed = false;
        queenCoin.pocketedBy = null;
        queenCoin.pocketedAtTurn = null;
        placeCoinSafelyNearCenter(queenCoin, next.coins);
      }
      events.push({ type: "queen-returned", seat, reason: "cover-failed" });
      player.score = Math.min(9, player.score + result.score);
      earnedExtraTurn = false;
    } else if (ownCoinPocketedThisShot) {
      // 5. Normal own coin pocketed
      player.score = Math.min(9, player.score + result.score);
      earnedExtraTurn = true;
    } else {
      // 6. Normal miss / opponent coin only
      player.score = Math.min(9, player.score + result.score);
      earnedExtraTurn = false;
    }

    if (opponentPlayer && result.opponentScore > 0) {
      opponentPlayer.score = Math.min(9, opponentPlayer.score + result.opponentScore);
    }

    for (const coin of pocketedCoins) {
      if (coin.type === "queen") continue;
      coin.pocketedBy = seat;
      coin.pocketedAtTurn = next.turnNumber;
      events.push({
        type: "coin-scored",
        seat,
        coinId: coin.id,
        coinType: coin.type,
        points: coin.type === playerColor ? 1 : 0,
      });
    }

    next.turnNumber++;
    next.foulThisTurn = foul;
    next.queenOnBoard = next.queenState === "ON_BOARD" && next.coins.some((c) => !c.pocketed && c.type === "queen");
    next.lastAction = action;
    next.lastActionSeat = seat;
    next.lastActionAtMs = now;

    const winCheck = checkWinCondition(next.coins, next.players);
    if (winCheck.winner !== null) {
      next.finished = true;
      next.gameOver = true;
      next.winnerSeats = [winCheck.winner];
      next.endReason = "win";
      next.turnStartedAt = null;
      next.turnExpiresAt = null;
      next.turnStartedAtMs = null;
      next.isShotInProgress = false;
      events.push({ type: "win", seat: winCheck.winner, score: next.players[winCheck.winner].score });
    } else if (winCheck.isDraw) {
      next.finished = true;
      next.gameOver = true;
      next.winnerSeats = [];
      next.endReason = "draw";
      next.turnStartedAt = null;
      next.turnExpiresAt = null;
      next.turnStartedAtMs = null;
      next.isShotInProgress = false;
      events.push({ type: "draw", reason: "all-coins-pocketed" });
    } else {
      const opponentSeat = seat === 0 ? 1 : 0;
      const nextSeat = (earnedExtraTurn && !foul) ? seat : opponentSeat;
      const turnReason = foul
        ? "STRIKER_FOUL"
        : earnedExtraTurn
          ? "OWN_COIN_POCKETED"
          : pocketedCoins.length > 0
            ? "OPPONENT_OR_QUEEN_ONLY"
            : "NOTHING_POCKETED";

      const nextPlayerId = this.players.find((p) => p.seat === nextSeat)?.userId ?? `seat-${nextSeat}`;
      const prevPlayerId = next.currentTurnPlayerId;

      next.currentSeat = nextSeat;
      next.currentTurnPlayerId = nextPlayerId;
      next.turnStartedAt = now;
      next.turnStartedAtMs = now;
      next.turnExpiresAt = now + 30000;
      next.isShotInProgress = false;
      next.strikerPlacementPhase = true;
      next.strikerPlacementSeat = nextSeat;
      next.striker = createInitialStriker(nextSeat);

      const playerColor = seat === 0 ? "white" : "black";
      const ownCoinPocketed = pocketedCoins.some((c) => c.type === playerColor);
      const queenPocketedThisShot = pocketedCoins.some((c) => c.type === "queen");

      console.log("[CARROM] TURN_DECISION", {
        shotSeat: seat,
        turnNumber: next.turnNumber,
        ownCoinPocketed,
        queenPocketed: queenPocketedThisShot,
        queenCovered,
        queenReturned,
        foul,
        earnedExtraTurn,
        nextSeat,
      });

      console.log("[CARROM TIMER] TURN_CHANGED", {
        previousPlayerId: prevPlayerId,
        nextPlayerId,
        turnNumber: next.turnNumber,
      });
      console.log("[CARROM TIMER] TURN_STARTED", {
        turnNumber: next.turnNumber,
        playerId: nextPlayerId,
        startedAt: next.turnStartedAt,
        expiresAt: next.turnExpiresAt,
      });

      events.push({
        type: "turn-change",
        shotId: now,
        stateVersion: next.turnNumber,
        previousSeat: seat,
        currentSeat: nextSeat,
        currentTurnPlayerId: nextPlayerId,
        turnNumber: next.turnNumber,
        turnStartedAt: next.turnStartedAt,
        turnExpiresAt: next.turnExpiresAt,
        earnedExtraTurn,
        reason: turnReason,
        foul,
      });

      if (foul) {
        events.push({ type: "foul-turn-end", seat, nextSeat, turnNumber: next.turnNumber, earnedExtraTurn: false });
      } else {
        events.push({ type: "turn-end", seat, nextSeat, turnNumber: next.turnNumber, earnedExtraTurn });
      }
    }

    events.push({
      type: "carrom:shot-result",
      shotId: now,
      stateVersion: next.turnNumber,
      finalStrikerWorld: { ...next.striker },
      finalCoinsWorld: next.coins.map((c) => ({ ...c })),
      pocketedCoinIds: pocketedCoins.map((c) => c.id),
      pocketEvents: physicsEvents.filter((e) => e.type === "coin-pocketed" || e.type === "striker-pocketed"),
      turnPlayerId: `seat-${next.currentSeat}`,
      currentTurnPlayerId: next.currentTurnPlayerId,
      turnNumber: next.turnNumber,
      turnStartedAt: next.turnStartedAt,
      turnExpiresAt: next.turnExpiresAt,
    });

    return {
      ok: true,
      state: next,
      events,
      finished: next.finished,
      winnerSeats: next.winnerSeats,
    };
  }
}

export type CarromActionType = CarromAction["type"];