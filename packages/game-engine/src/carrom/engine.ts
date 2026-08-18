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
    const turnTimer = options?.turnTimer ?? { turnDurationMs: 60000, warningThresholdMs: 10000 };
    const matchTimer = options?.matchTimer ?? { matchDurationMs: 600000, warningThresholdMs: 30000 };
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

  protected onTurnTimerExpired(seat: number, state: CarromState): EngineActionResult<CarromState> {
    const next = this.cloneState(state);
    const player = next.players.find(p => p.seat === seat);
    if (player) {
      player.fouls++;
      player.consecutiveFouls++;
    }

    // Only forfeit if a player accumulates 3 consecutive AFK timeouts
    if (player && player.consecutiveFouls >= 3) {
      next.finished = true;
      next.gameOver = true;
      next.endReason = "afk-forfeit";
      const winnerSeats = [seat === 0 ? 1 : 0];
      next.winnerSeats = winnerSeats;
      return {
        ok: true,
        state: next,
        events: [{ type: "afk-forfeit", seat, winnerSeat: winnerSeats[0] }],
        finished: true,
        winnerSeats,
      };
    }

    // Regular turn timeout: pass the turn to opponent without ending the match
    const nextSeat = seat === 0 ? 1 : 0;
    next.currentSeat = nextSeat;
    next.turnStartedAtMs = this.now();
    next.strikerPlacementPhase = true;
    next.strikerPlacementSeat = nextSeat;
    next.striker = createInitialStriker(nextSeat);

    return {
      ok: true,
      state: next,
      events: [{ type: "turn-timeout", seat, nextSeat }],
      finished: false,
      winnerSeats: [],
    };
  }

  protected getInitialSeat(): number {
    return 0;
  }

  protected initBaseState(): Omit<CarromState, keyof import("../base/MultiplayerGameEngine").BaseState> {
    const coins = createInitialCoins();
    const striker = createInitialStriker();
    const carromPlayers: CarromPlayer[] = this.players.map((p) => ({
      seat: p.seat,
      color: p.seat === 0 ? "white" : "black",
      score: 0,
      queenPocketed: false,
      queenCovered: false,
      fouls: 0,
      consecutiveFouls: 0,
    }));

    console.log("[CarromEngine] INITIAL_MATCH_STATE created", {
      totalCoins: coins.length,
      coins: coins.map(c => ({ id: c.id, type: c.type, x: Math.round(c.x), y: Math.round(c.y) })),
    });

    return {
      coins,
      striker,
      players: carromPlayers,
      lastAction: null,
      lastActionSeat: null,
      lastActionAtMs: null,
      strikerAtShotStart: null,
      lastTrajectory: null,
      strikerPlacementPhase: true,
      strikerPlacementSeat: 0,
      foulThisTurn: false,
      queenOnBoard: true,
    };
  }

  protected validateGameAction(action: CarromAction, seat: number, state: CarromState): string | null {
    if (state.finished) return "Game is finished";
    if (state.paused) return "Game is paused";

    switch (action.type) {
      case "place-striker": {
        if (state.currentSeat !== seat) return "Not your turn";
        if (typeof action.x !== "number") return "Invalid x coordinate";
        if (!isValidStrikerPlacement(action.x, seat, state.coins)) return "Invalid striker placement position";
        return null;
      }

      case "strike": {
        if (state.currentSeat !== seat) return "Not your turn";
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

    let foul = false;
    let earnedExtraTurn = false;
    let queenPocketedThisTurn = false;
    let queenCoveredThisTurn = false;
    let queenReturnedThisTurn = false;

    if (pocketedStriker) {
      // ── FOUL: striker pocketed ──────────────────────────────────────────────
      foul = true;
      player.fouls++;
      // Player actively took a shot, so reset consecutive AFK timeout counter
      player.consecutiveFouls = 0;
      events.push({ type: "foul", seat, reason: "striker-pocketed" });

      // A foul voids any pending queen cover — the queen returns to the board.
      if (player.queenPocketed && !player.queenCovered) {
        player.queenPocketed = false;
        queenReturnedThisTurn = true;
        const queenCoin = next.coins.find(c => c.type === "queen");
        if (queenCoin) {
          queenCoin.pocketed = false;
          placeCoinSafelyNearCenter(queenCoin, next.coins);
          queenCoin.vx = 0;
          queenCoin.vy = 0;
          queenCoin.pocketedBy = null;
          queenCoin.pocketedAtTurn = null;
        }
        events.push({ type: "queen-returned", seat, reason: "foul" });
      }

      // Due owed: one of the fouler's own pocketed coins returns to the board
      // (and the corresponding point is taken back).
      const returnedCoin = returnOneOwnCoin(next.coins, seat);
      if (returnedCoin) {
        player.score = Math.max(0, player.score - 1);
        events.push({ type: "coin-returned", seat, coinId: returnedCoin.id, coinType: returnedCoin.type });
      }
    } else {
      player.consecutiveFouls = 0;

      // Always evaluate the pending-cover state, even when this shot pocketed nothing.
      const hasPendingCover = player.queenPocketed && !player.queenCovered;
      if (pocketedCoins.length > 0 || hasPendingCover) {
        const playerColor: CoinType = seat === 0 ? "white" : "black";
        const result = calculateScore(
          pocketedCoins,
          playerColor,
          player.queenPocketed,
          player.queenCovered,
        );

        earnedExtraTurn = result.earnedExtraTurn;
        player.score += result.score;
        const opponentSeat = seat === 0 ? 1 : 0;
        const opponentPlayer = next.players.find(p => p.seat === opponentSeat);
        if (opponentPlayer && result.opponentScore > 0) {
          opponentPlayer.score += result.opponentScore;
        }
        queenPocketedThisTurn = result.queenPocketed && !player.queenPocketed;
        queenCoveredThisTurn  = result.queenCovered  && !player.queenCovered;
        player.queenPocketed  = result.queenPocketed;
        player.queenCovered   = result.queenCovered;

        if (result.queenNeedsReturn) {
          // Queen pocketed without cover → restore queen to board center
          queenReturnedThisTurn = true;
          const queenCoin = next.coins.find(c => c.type === "queen");
          if (queenCoin) {
            queenCoin.pocketed = false;
            placeCoinSafelyNearCenter(queenCoin, next.coins);
            queenCoin.vx = 0;
            queenCoin.vy = 0;
            queenCoin.pocketedBy = null;
            queenCoin.pocketedAtTurn = null;
          }
          events.push({ type: "queen-returned", seat, reason: "not-covered" });
        }

        // Emit scored events for own/opponent coins only (queen handled above)
        for (const coin of pocketedCoins) {
          if (coin.type === "queen") continue; // already handled
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

        if (queenPocketedThisTurn && !queenReturnedThisTurn) {
          // Queen was permanently pocketed (covered)
          const queenCoin = next.coins.find(c => c.type === "queen");
          if (queenCoin) {
            queenCoin.pocketedBy = seat;
            queenCoin.pocketedAtTurn = next.turnNumber;
          }
          events.push({ type: "queen-pocketed", seat });
        }
        if (queenCoveredThisTurn) {
          events.push({ type: "queen-covered", seat });
        }
      }
    }

    next.turnNumber++;
    next.foulThisTurn = foul;
    next.queenOnBoard = next.coins.some(c => !c.pocketed && c.type === "queen");
    next.lastAction = action;
    next.lastActionSeat = seat;
    next.lastActionAtMs = now;

    const winCheck = checkWinCondition(next.coins, next.players);
    if (winCheck.winner !== null) {
      next.finished = true;
      next.gameOver = true;
      next.winnerSeats = [winCheck.winner];
      next.endReason = "win";
      next.turnStartedAtMs = null;
      next.matchStartedAtMs = null;
      events.push({ type: "win", seat: winCheck.winner, score: next.players[winCheck.winner].score });
    } else if (winCheck.isDraw) {
      next.finished = true;
      next.gameOver = true;
      next.winnerSeats = [];
      next.endReason = "draw";
      next.turnStartedAtMs = null;
      next.matchStartedAtMs = null;
      events.push({ type: "draw", reason: "all-coins-pocketed" });
    } else {
      // ── Determine next player (calculated ONCE after complete shot resolution) ──
      // Extra turn ONLY if player pocketed at least one own-color coin and did NOT foul.
      // Foul, opponent coin only, queen alone, or miss always passes turn to opponent.
      const opponentSeat = seat === 0 ? 1 : 0;
      const nextSeat = (earnedExtraTurn && !foul) ? seat : opponentSeat;
      const turnReason = foul
        ? "STRIKER_FOUL"
        : earnedExtraTurn
          ? "OWN_COIN_POCKETED"
          : pocketedCoins.length > 0
            ? "OPPONENT_OR_QUEEN_ONLY"
            : "NOTHING_POCKETED";

      next.currentSeat = nextSeat;
      next.turnStartedAtMs = now;
      next.strikerPlacementPhase = true;
      next.strikerPlacementSeat = nextSeat;
      next.striker = createInitialStriker(nextSeat);

      const playerColor = seat === 0 ? "white" : "black";
      const pocketedOwnCoin = pocketedCoins.some(c => c.type === playerColor);
      const pocketedOpponentCoin = pocketedCoins.some(c => c.type !== playerColor && c.type !== "queen");

      console.log("[CarromEngine] TURN_CALCULATION", {
        shotId: now,
        stateVersion: next.turnNumber,
        shooterId: `seat-${seat}`,
        previousTurnPlayerId: `seat-${seat}`,
        pocketedCoinIds: pocketedCoins.map((c) => c.id),
        pocketedOwnCoin,
        pocketedOpponentCoin,
        pocketedStriker,
        foul,
        earnedExtraTurn,
        nextTurnPlayerId: `seat-${nextSeat}`,
        reason: turnReason,
      });

      events.push({
        type: "turn-change",
        shotId: now,
        stateVersion: next.turnNumber,
        previousSeat: seat,
        currentSeat: nextSeat,
        reason: turnReason,
        foul,
      });

      if (foul) {
        events.push({ type: "foul-turn-end", seat, nextSeat });
      } else {
        events.push({ type: "turn-end", seat, nextSeat });
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