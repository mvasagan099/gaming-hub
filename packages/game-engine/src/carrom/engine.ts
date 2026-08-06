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
} from "./physics";

export class CarromEngine extends MultiplayerGameEngine<CarromState, CarromAction> {
  readonly gameId = "carrom" as const;

  constructor(players: EnginePlayer[], rng?: RandomSource, options?: CarromEngineOptions) {
    const turnTimer = options?.turnTimer ?? { turnDurationMs: 30000, warningThresholdMs: 5000 };
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

  protected getInitialSeat(): number {
    return 0;
  }

  protected initBaseState(): Omit<CarromState, keyof import("../base/MultiplayerGameEngine").BaseState> {
    const coins = createInitialCoins();
    const striker = createInitialStriker();
    const carromPlayers: CarromPlayer[] = this.players.map((p, index) => ({
      seat: p.seat,
      color: index === 0 ? "white" : "black",
      score: 0,
      queenPocketed: false,
      queenCovered: false,
      fouls: 0,
      consecutiveFouls: 0,
    }));

    return {
      coins,
      striker,
      players: carromPlayers,
      lastAction: null,
      lastActionSeat: null,
      lastActionAtMs: null,
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
        if (!state.strikerPlacementPhase) return "Not in striker placement phase";
        if (state.strikerPlacementSeat !== seat) return "Not your turn to place striker";
        if (state.currentSeat !== seat) return "Not your turn";
        if (typeof action.x !== "number") return "Invalid x coordinate";
        if (!isValidStrikerPlacement(action.x, seat)) return "Invalid striker placement position";
        return null;
      }

      case "strike": {
        if (state.strikerPlacementPhase) return "Must place striker first";
        if (state.currentSeat !== seat) return "Not your turn";
        if (typeof action.angle !== "number" || typeof action.power !== "number") return "Invalid strike parameters";
        if (action.power < 0 || action.power > 1) return "Power must be between 0 and 1";
        if (action.angle < 0 || action.angle > Math.PI * 2) return "Angle must be between 0 and 2π";
        const playerStriker = state.striker;
        if (!playerStriker.placed) return "Striker not placed";
        if (playerStriker.pocketed) return "Striker was pocketed, place again";
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
    next.striker.y = BASE_LINE_Y;
    next.striker.placed = true;
    next.striker.placedBy = seat;
    next.strikerPlacementPhase = false;
    next.lastAction = action;
    next.lastActionSeat = seat;
    next.lastActionAtMs = now;
    next.turnNumber++;
    next.turnStartedAtMs = now;

    if (next.matchStartedAtMs === null) {
      next.matchStartedAtMs = now;
    }

    events.push({
      type: "striker-placed",
      seat,
      x: action.x,
      y: BASE_LINE_Y,
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
    action: CarromAction & { type: "strike"; angle: number; power: number },
    seat: number,
    state: CarromState,
    now: number,
    events: EngineEvent[],
  ): EngineActionResult<CarromState> {
    const next = this.cloneState(state);
    const player = next.players.find(p => p.seat === seat)!;

    const maxSpeed = 600;
    const speed = action.power * maxSpeed;
    next.striker.vx = Math.cos(action.angle) * speed;
    next.striker.vy = Math.sin(action.angle) * speed;
    next.striker.placed = false;

    const { pocketedCoins, pocketedStriker, events: physicsEvents } = simulatePhysics(
      next.coins,
      next.striker,
    );

    for (const physicsEvent of physicsEvents) {
      events.push({ ...physicsEvent, seat });
    }

    let foul = false;
    let scoreThisTurn = 0;
    let queenPocketedThisTurn = false;
    let queenCoveredThisTurn = false;

    if (pocketedStriker) {
      foul = true;
      player.fouls++;
      player.consecutiveFouls++;
      events.push({ type: "foul", seat, reason: "striker-pocketed" });
    } else if (pocketedCoins.length === 0) {
      foul = true;
      player.fouls++;
      player.consecutiveFouls++;
      events.push({ type: "foul", seat, reason: "no-coin-pocketed" });
    } else {
      player.consecutiveFouls = 0;
      const playerColor: CoinType = seat === 0 ? "white" : "black";
      const result = calculateScore(
        pocketedCoins,
        playerColor,
        player.queenPocketed,
        player.queenCovered,
      );
      scoreThisTurn = result.score;
      player.score += scoreThisTurn;
      queenPocketedThisTurn = result.queenPocketed && !player.queenPocketed;
      queenCoveredThisTurn = result.queenCovered && !player.queenCovered;
      player.queenPocketed = result.queenPocketed;
      player.queenCovered = result.queenCovered;

      for (const coin of pocketedCoins) {
        coin.pocketedBy = seat;
        coin.pocketedAtTurn = next.turnNumber;
        events.push({
          type: "coin-scored",
          seat,
          coinId: coin.id,
          coinType: coin.type,
          points: coin.type === "queen" ? 3 : 1,
        });
      }

      if (queenPocketedThisTurn) {
        events.push({ type: "queen-pocketed", seat });
      }
      if (queenCoveredThisTurn) {
        events.push({ type: "queen-covered", seat });
      }
    }

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
    } else if (!foul) {
      next.currentSeat = seat === 0 ? 1 : 0;
      next.turnStartedAtMs = now;
      next.strikerPlacementPhase = true;
      next.strikerPlacementSeat = next.currentSeat;
      next.striker = createInitialStriker();
      events.push({ type: "turn-end", seat, nextSeat: next.currentSeat });
    } else {
      next.turnStartedAtMs = now;
      next.striker = createInitialStriker();
      next.strikerPlacementPhase = true;
      next.strikerPlacementSeat = seat;
      events.push({ type: "foul-turn-end", seat });
    }

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