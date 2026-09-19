import type { EngineActionResult, EngineEvent, EnginePlayer, RandomSource } from "../types";
import { MultiplayerGameEngine } from "../base/MultiplayerGameEngine";
import type {
  CricketBall,
  CricketDelivery,
  CricketMatchType,
  CricketPendingDelivery,
  CricketPlayer,
  CricketShot,
  CricketState,
  CricketTiming,
  CricketWicketType,
  CricketAction,
  CricketEngineOptions,
  CricketExtraType,
  CricketPitchTarget,
  CricketLine,
  CricketLength,
} from "./types";
import { CRICKET_OVERS, CRICKET_DELIVERIES, CRICKET_SHOTS } from "./types";

const COMMENTARY = [
  "Beautiful shot!",
  "What a delivery!",
  "That was a ripper!",
  "Great fielding!",
  "That's a boundary!",
  "SIX! What a hit!",
  "Clean bowled!",
  "Caught behind!",
  "LBW appeal!",
  "Run out chance!",
];

type OutcomeKey = "0" | "1" | "2" | "4" | "6" | "W";
type OutcomeWeights = Record<OutcomeKey, number>;

const OUTCOME_KEYS: readonly OutcomeKey[] = ["0", "1", "2", "4", "6", "W"];

const GOOD_TIMING: Record<CricketDelivery, Record<CricketShot, OutcomeWeights>> = {
  fast: {
    straight: { 0: 10, 1: 25, 2: 15, 4: 25, 6: 0, W: 3 },
    left: { 0: 15, 1: 25, 2: 15, 4: 15, 6: 0, W: 5 },
    right: { 0: 15, 1: 25, 2: 15, 4: 15, 6: 0, W: 5 },
    up: { 0: 5, 1: 10, 2: 15, 4: 30, 6: 20, W: 8 },
  },
  slow: {
    straight: { 0: 20, 1: 30, 2: 20, 4: 10, 6: 0, W: 2 },
    left: { 0: 20, 1: 25, 2: 20, 4: 15, 6: 0, W: 3 },
    right: { 0: 20, 1: 25, 2: 20, 4: 15, 6: 0, W: 3 },
    up: { 0: 10, 1: 15, 2: 15, 4: 20, 6: 15, W: 10 },
  },
  spin: {
    straight: { 0: 30, 1: 30, 2: 15, 4: 5, 6: 0, W: 5 },
    left: { 0: 25, 1: 25, 2: 20, 4: 10, 6: 0, W: 5 },
    right: { 0: 25, 1: 25, 2: 20, 4: 10, 6: 0, W: 5 },
    up: { 0: 10, 1: 15, 2: 15, 4: 25, 6: 15, W: 8 },
  },
  yorker: {
    straight: { 0: 40, 1: 35, 2: 10, 4: 5, 6: 0, W: 15 },
    left: { 0: 35, 1: 30, 2: 20, 4: 5, 6: 0, W: 12 },
    right: { 0: 35, 1: 30, 2: 20, 4: 5, 6: 0, W: 12 },
    up: { 0: 25, 1: 25, 2: 20, 4: 10, 6: 5, W: 18 },
  },
  bouncer: {
    straight: { 0: 25, 1: 20, 2: 10, 4: 15, 6: 10, W: 15 },
    left: { 0: 30, 1: 25, 2: 15, 4: 10, 6: 5, W: 12 },
    right: { 0: 30, 1: 25, 2: 15, 4: 10, 6: 5, W: 12 },
    up: { 0: 15, 1: 15, 2: 15, 4: 25, 6: 20, W: 10 },
  },
  swing: {
    straight: { 0: 20, 1: 25, 2: 15, 4: 15, 6: 5, W: 10 },
    left: { 0: 25, 1: 25, 2: 20, 4: 10, 6: 0, W: 8 },
    right: { 0: 25, 1: 25, 2: 20, 4: 10, 6: 0, W: 8 },
    up: { 0: 15, 1: 15, 2: 15, 4: 20, 6: 15, W: 12 },
  },
};

/** Multipliers applied to each outcome weight when the shot is mistimed. */
const BAD_TIMING: Record<OutcomeKey, number> = {
  "0": 1.5,
  "1": 0.6,
  "2": 0.5,
  "4": 0.4,
  "6": 0.2,
  W: 3,
};

/** Power-bar modifiers: aggressive bowling concedes more but takes wickets. */
const POWER_MODS: Record<"low" | "medium" | "high", Partial<OutcomeWeights>> = {
  low: { "0": 1.15, "4": 0.75, "6": 0.5, W: 1.1 },
  medium: {},
  high: { "0": 0.85, "4": 1.2, "6": 1.35, W: 1.2 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class CricketEngine extends MultiplayerGameEngine<CricketState, CricketAction> {
  readonly gameId = "cricket" as const;
  private readonly options?: CricketEngineOptions;
  private readonly matchType: CricketMatchType;
  private readonly totalOvers: number;
  private readonly pitchTargetRevealMs: number;

  constructor(players: EnginePlayer[], rng?: RandomSource, options?: CricketEngineOptions) {
    const turnTimer = options?.turnTimer ?? { turnDurationMs: 30000, warningThresholdMs: 5000 };
    const matchTimer = options?.matchTimer ?? { matchDurationMs: 600000, warningThresholdMs: 30000 };
    const matchType = options?.matchType ?? "1-over";
    const totalOvers = CRICKET_OVERS[matchType] ?? 1;

    super(players, rng, {
      turnTimer,
      matchTimer,
      enableResign: options?.enableResign ?? true,
      enableDraw: options?.enableDraw ?? true,
      enablePause: options?.enablePause ?? true,
      enableRematch: options?.enableRematch ?? true,
      now: options?.now,
    });

    this.options = options;
    this.matchType = matchType;
    this.totalOvers = totalOvers;
    this.state.matchType = matchType;
    this.state.totalOvers = totalOvers;

    this.pitchTargetRevealMs =
      options?.pitchTargetRevealMs !== undefined
        ? options.pitchTargetRevealMs
        : (globalThis as { process?: { env?: Record<string, string> } }).process?.env?.NODE_ENV === "test"
          ? 0
          : 800;
  }

  protected getInitialSeat(): number {
    return 0;
  }

  protected override initBaseState(): Omit<CricketState, keyof import("../base/MultiplayerGameEngine").BaseState> {
    const players: CricketPlayer[] = this.players.map((p) => ({
      seat: p.seat,
      name: `Player ${p.seat + 1}`,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      wickets: 0,
      overs: 0,
      oversBowled: { overs: 0, balls: 0 },
      maidens: 0,
      runsConceded: 0,
      extras: 0,
    }));

    const tossCoin = this.random() < 0.5 ? "heads" : "tails";
    const matchType = this.matchType ?? this.options?.matchType ?? "1-over";
    const totalOvers = this.totalOvers ?? CRICKET_OVERS[matchType] ?? 1;
    return {
      matchType,
      totalOvers,
      currentOver: 0,
      currentBall: 0,
      inning: 1,
      battingTeam: 0,
      bowlingTeam: 0,
      battingFirst: 0,
      currentActor: "toss",
      target: null,
      pendingDelivery: null,
      isProcessingDelivery: false,
      activeDeliveryId: null,
      deliverySequence: 0,
      pitchTarget: null,
      bowlingPhase: "TARGETING",
      pitchTargetSequence: 0,
      batterCreaseX: 0,
      movementLocked: false,
      lastBatterMoveAtMs: null,
      team1Score: 0,
      team2Score: 0,
      team1Wickets: 0,
      team2Wickets: 0,
      team1Extras: 0,
      team2Extras: 0,
      balls: [],
      players,
      currentBatsman: 0,
      currentBowler: 0,
      winner: null,
      endReason: null,
      endReasonState: null,
      runRate: null,
      requiredRunRate: null,
      tossResult: tossCoin,
      tossWinner: null,
    };
  }

  protected override initState(): CricketState {
    const state = super.initState();
    if (state.currentActor === "toss") {
      state.currentSeat = 0;
    } else {
      state.currentSeat = state.bowlingTeam;
      this.startTurnTimer(state);
      this.startMatchTimer(state);
    }
    return state;
  }

  protected validateGameAction(action: CricketAction, seat: number, state: CricketState): string | null {
    if (state.finished) return "MATCH_FINISHED";
    if (state.paused) return "Match is paused";

    if (action.type === "toss-call") {
      if (state.currentActor !== "toss") return "Toss already completed";
      if (state.tossWinner != null) return "Toss already completed";
      if (seat !== state.currentSeat) return "NOT_YOUR_TOSS";
      return null;
    }

    if (action.type === "toss-choice") {
      if (state.currentActor !== "toss-choice") return "NOT_TOSS_CHOICE";
      if (seat !== state.currentSeat) return "NOT_YOUR_TOSS_CHOICE";
      if (action.choice !== "bat" && action.choice !== "bowl") return "INVALID_TOSS_CHOICE";
      return null;
    }

    if (state.currentActor === "toss" || state.currentActor === "toss-choice") return "Toss in progress";

    switch (action.type) {
      case "set-pitch-target":
        if (state.finished) return "MATCH_FINISHED";
        if (state.currentActor !== "bowler") return "NOT_BOWLER_TURN";
        if (seat !== state.bowlingTeam || seat !== state.currentSeat) return "NOT_YOUR_TURN";
        if (state.isProcessingDelivery) return "DELIVERY_IN_PROGRESS";
        if (typeof action.lateral !== "number" || isNaN(action.lateral)) return "INVALID_LATERAL";
        if (typeof action.length !== "number" || isNaN(action.length)) return "INVALID_LENGTH";
        return null;
      case "move-batter":
        if (state.finished) return "MATCH_FINISHED";
        if (seat !== state.battingTeam) return "NOT_YOUR_TURN";
        if (state.movementLocked) return "MOVEMENT_LOCKED";
        if (typeof action.x !== "number" || isNaN(action.x)) return "INVALID_CREASE_X";
        return null;
      case "lock-batter-movement":
        if (state.finished) return "MATCH_FINISHED";
        if (seat !== state.battingTeam && seat !== state.bowlingTeam) return "NOT_YOUR_TURN";
        return null;
      case "bowl":
        if (state.finished) return "MATCH_FINISHED";
        if (state.isProcessingDelivery) return "DELIVERY_IN_PROGRESS";
        if (state.currentActor !== "bowler") return "NOT_BOWLER_TURN";
        if (seat !== state.bowlingTeam) return "Only the bowling side can bowl";
        if (seat !== state.currentSeat) return "Not your turn";
        if (!CRICKET_DELIVERIES.includes(action.delivery)) return "INVALID_DELIVERY";
        if (
          action.power != null &&
          (typeof action.power !== "number" || action.power < 0 || action.power > 1)
        ) {
          return "Invalid power";
        }
        if (!state.pitchTarget || state.bowlingPhase !== "TARGET_LOCKED") {
          return "NO_PITCH_TARGET";
        }
        if (
          !action.pitchTargetId ||
          action.pitchTargetId !== state.pitchTarget.targetId ||
          state.pitchTarget.turnNumber !== state.turnNumber
        ) {
          return "STALE_PITCH_TARGET";
        }
        if (this.pitchTargetRevealMs > 0) {
          const now = this.now();
          if (now < state.pitchTarget.lockedAtMs + this.pitchTargetRevealMs) {
            return "REVEAL_IN_PROGRESS";
          }
        }
        return null;
      case "bat":
        if (state.currentActor !== "batsman") return "The bowler is at the crease";
        if (seat !== state.currentSeat) return "Not your turn";
        if (seat !== state.battingTeam) return "Only the batting side can bat";
        if (!state.pendingDelivery || !state.isProcessingDelivery || !state.activeDeliveryId) {
          return "NO_ACTIVE_DELIVERY";
        }
        if (action.deliveryId && action.deliveryId !== state.activeDeliveryId) {
          return "STALE_DELIVERY";
        }
        if (!CRICKET_SHOTS.includes(action.shot)) return "Invalid shot";
        if (action.timing && !["early", "good", "late"].includes(action.timing)) {
          return "Invalid timing";
        }
        return null;
      default:
        if (seat !== state.currentSeat) return "Not your turn";
        return null;
    }
  }

  protected applyGameAction(
    action: CricketAction,
    seat: number,
    state: CricketState,
  ): EngineActionResult<CricketState> {
    const now = this.now();
    const events: EngineEvent[] = [];

    switch (action.type) {
      case "toss-call": {
        const next = this.cloneState(state);
        const won = action.call === state.tossResult;
        const tossWinner = won ? seat : (1 - seat);
        next.tossWinner = tossWinner;
        next.currentActor = "toss-choice";
        next.currentSeat = tossWinner;
        events.push({
          type: "toss-result",
          tossResult: state.tossResult!,
          tossCall: action.call,
          tossWinner,
        });
        return this.advanceTurn(next, now, events);
      }
      case "toss-choice": {
        const next = this.cloneState(state);
        const tossWinner = state.tossWinner ?? seat;
        const battingFirst = action.choice === "bat" ? tossWinner : (1 - tossWinner);
        next.battingFirst = battingFirst;
        next.battingTeam = battingFirst;
        next.bowlingTeam = 1 - battingFirst;
        next.currentBatsman = battingFirst;
        next.currentBowler = 1 - battingFirst;
        next.currentActor = "bowler";
        next.currentSeat = next.bowlingTeam;
        next.pitchTarget = null;
        next.bowlingPhase = "TARGETING";
        next.batterCreaseX = 0;
        next.movementLocked = false;
        next.lastBatterMoveAtMs = null;
        this.startTurnTimer(next);
        this.startMatchTimer(next);
        events.push({
          type: "toss-choice",
          tossWinner,
          choice: action.choice,
          battingFirst,
          battingTeam: next.battingTeam,
          bowlingTeam: next.bowlingTeam,
        });
        return this.advanceTurn(next, now, events);
      }
      case "set-pitch-target": {
        const next = this.cloneState(state);
        const lateral = Math.max(-0.85, Math.min(0.85, action.lateral));
        const length = Math.max(0.08, Math.min(0.82, action.length));

        const line: CricketLine =
          lateral < -0.28 ? "off" : lateral > 0.28 ? "leg" : "middle";

        const lengthZone: CricketLength =
          length < 0.25 ? "full" : length < 0.58 ? "good" : "short";

        const sequence = (next.pitchTargetSequence ?? 0) + 1;
        next.pitchTargetSequence = sequence;
        const targetId = `pitch-${next.turnNumber}-${sequence}`;

        const pitchTarget: CricketPitchTarget = {
          targetId,
          turnNumber: next.turnNumber,
          lateral,
          length,
          line,
          lengthZone,
          lockedAtMs: now,
        };

        next.pitchTarget = pitchTarget;
        next.bowlingPhase = "TARGET_LOCKED";

        events.push({
          type: "pitch-target-set",
          targetId,
          turnNumber: next.turnNumber,
          lateral,
          length,
          line,
          lengthZone,
          bowlingSeat: seat,
          lockedAtMs: now,
        });

        return {
          ok: true,
          state: next,
          events,
          finished: next.finished,
          winnerSeats: next.winnerSeats,
        };
      }
      case "move-batter": {
        const next = this.cloneState(state);
        let targetX = Math.max(-0.75, Math.min(0.75, action.x));
        const BATTER_MAX_MOVE_SPEED = 1.5; // normalized units per second

        if (next.lastBatterMoveAtMs != null) {
          const elapsedSec = Math.max(0.001, (now - next.lastBatterMoveAtMs) / 1000);
          const maxAllowedDelta = BATTER_MAX_MOVE_SPEED * elapsedSec + 0.15;
          const delta = targetX - next.batterCreaseX;
          if (Math.abs(delta) > maxAllowedDelta) {
            targetX = next.batterCreaseX + Math.sign(delta) * maxAllowedDelta;
            targetX = Math.max(-0.75, Math.min(0.75, targetX));
          }
        }
        next.batterCreaseX = targetX;
        next.lastBatterMoveAtMs = now;
        events.push({
          type: "batter-moved",
          seat,
          x: targetX,
          timestamp: now,
        });
        return {
          ok: true,
          state: next,
          events,
          finished: next.finished,
          winnerSeats: next.winnerSeats,
        };
      }
      case "lock-batter-movement": {
        const next = this.cloneState(state);
        next.movementLocked = true;
        events.push({
          type: "movement-locked",
          seat,
          x: next.batterCreaseX,
          timestamp: now,
        });
        return {
          ok: true,
          state: next,
          events,
          finished: next.finished,
          winnerSeats: next.winnerSeats,
        };
      }
      case "bowl": {
        const currentBattingScore = state.battingTeam === 0 ? state.team1Score : state.team2Score;
        console.log("[CricketEngine] DELIVERY_REQUEST_RECEIVED", {
          matchId: this.gameId,
          delivery: action.delivery,
          seat,
          inning: state.inning,
          battingTeam: state.battingTeam,
          bowlingTeam: state.bowlingTeam,
          currentActor: state.currentActor,
          score: currentBattingScore,
          balls: state.currentBall,
          overs: state.currentOver,
          isProcessingDelivery: state.isProcessingDelivery,
        });

        if (state.isProcessingDelivery) {
          console.log("[CricketEngine] DELIVERY_REJECTED_ALREADY_ACTIVE", {
            matchId: this.gameId,
            activeDeliveryId: state.activeDeliveryId,
            seat,
          });
        }

        const next = this.cloneState(state);
        const pitchTarget = next.pitchTarget!;
        const power = clamp(action.power ?? 0.5, 0, 1);
        const sequence = state.deliverySequence + 1;
        const deliveryId = `delivery-${sequence}`;

        next.isProcessingDelivery = true;
        next.activeDeliveryId = deliveryId;
        next.deliverySequence = sequence;
        next.bowlingPhase = "DELIVERY";

        console.log("[CricketEngine] DELIVERY_LOCK_ACQUIRED", {
          matchId: this.gameId,
          deliveryId,
          sequence,
          seat,
        });

        next.pendingDelivery = { 
          delivery: action.delivery, 
          power, 
          line: pitchTarget.line, 
          length: pitchTarget.lengthZone,
          pitchTarget,
          deliveryId,
          deliverySequence: sequence,
        };
        next.currentActor = "batsman";
        next.currentSeat = next.battingTeam;
        this.startTurnTimer(next);
        
        console.log("[CricketEngine] DELIVERY_STARTED", {
          matchId: this.gameId,
          deliveryId,
          sequence,
          bowlerId: seat,
          delivery: action.delivery,
          power,
          pitchTarget,
        });

        events.push({
          type: "delivery-start",
          matchId: this.gameId,
          deliveryId,
          deliverySequence: sequence,
          bowlerId: seat,
          delivery: action.delivery,
          power,
          line: pitchTarget.line,
          length: pitchTarget.lengthZone,
          pitchTarget,
          timestamp: now,
        });
        events.push({
          type: "ball-bowled",
          seat,
          delivery: action.delivery,
          power,
          line: pitchTarget.line,
          length: pitchTarget.lengthZone,
          pitchTarget,
          deliveryId,
          deliverySequence: sequence,
          timestamp: now,
        });
        return this.advanceTurn(next, now, events);
      }
      case "bat":
        return this.resolveShot(state, action.shot, action.timing ?? "good", now, events);
      default:
        return {
          ok: false,
          error: "Unknown action for Cricket",
          state,
          events: [],
          finished: state.finished,
          winnerSeats: state.winnerSeats,
        };
    }
  }

  protected override onTurnTimerExpired(
    seat: number = this.state.currentSeat,
    state: CricketState = this.state,
  ): EngineActionResult<CricketState> {
    const now = this.now();
    const events: EngineEvent[] = [{ type: "turn-timeout", seat }];

    if (state.currentActor === "toss") {
      return this.applyGameAction({ type: "toss-call", call: "heads" }, seat, state);
    }
    if (state.currentActor === "toss-choice") {
      return this.applyGameAction({ type: "toss-choice", choice: "bat" }, seat, state);
    }

    if (state.currentActor === "batsman") {
      const shot = CRICKET_SHOTS[this.randomInt(0, CRICKET_SHOTS.length - 1)];
      return this.resolveShot(state, shot, "late", now, events);
    }

    const delivery = CRICKET_DELIVERIES[this.randomInt(0, CRICKET_DELIVERIES.length - 1)];
    const next = this.cloneState(state);
    const sequence = state.deliverySequence + 1;
    const deliveryId = `delivery-${sequence}`;

    let pitchTarget = next.pitchTarget;
    if (!pitchTarget || next.bowlingPhase !== "TARGET_LOCKED") {
      const targetSeq = (next.pitchTargetSequence ?? 0) + 1;
      next.pitchTargetSequence = targetSeq;
      const targetId = `pitch-${next.turnNumber}-${targetSeq}`;
      const lateral = (this.random() - 0.5) * 0.5; // safe middle zone (-0.25 to 0.25)
      const length = 0.45; // safe good length
      pitchTarget = {
        targetId,
        turnNumber: next.turnNumber,
        lateral,
        length,
        line: lateral < -0.28 ? "off" : lateral > 0.28 ? "leg" : "middle",
        lengthZone: "good",
        lockedAtMs: now,
      };
      next.pitchTarget = pitchTarget;
      events.push({
        type: "pitch-target-set",
        targetId,
        turnNumber: next.turnNumber,
        lateral: pitchTarget.lateral,
        length: pitchTarget.length,
        line: pitchTarget.line,
        lengthZone: pitchTarget.lengthZone,
        bowlingSeat: seat,
        lockedAtMs: now,
        auto: true,
      });
    }

    next.isProcessingDelivery = true;
    next.activeDeliveryId = deliveryId;
    next.deliverySequence = sequence;
    next.bowlingPhase = "DELIVERY";
    next.pendingDelivery = { 
      delivery, 
      power: 0.5, 
      line: pitchTarget.line, 
      length: pitchTarget.lengthZone,
      pitchTarget,
      deliveryId,
      deliverySequence: sequence,
    };
    next.currentActor = "batsman";
    next.currentSeat = next.battingTeam;
    events.push({ 
      type: "delivery-start", 
      matchId: this.gameId,
      deliveryId,
      deliverySequence: sequence,
      bowlerId: seat,
      delivery,
      power: 0.5,
      line: pitchTarget.line,
      length: pitchTarget.lengthZone,
      pitchTarget,
      auto: true,
      timestamp: now,
    });
    events.push({ 
      type: "ball-bowled", 
      seat, 
      delivery, 
      power: 0.5, 
      line: pitchTarget.line,
      length: pitchTarget.lengthZone,
      pitchTarget,
      auto: true,
      deliveryId,
      deliverySequence: sequence,
      timestamp: now,
    });
    return this.advanceTurn(next, now, events);
  }

  private resolveShot(
    state: CricketState,
    shot: CricketShot,
    timing: CricketTiming,
    now: number,
    events: EngineEvent[],
  ): EngineActionResult<CricketState> {
    if (!state.pendingDelivery || !state.isProcessingDelivery || !state.activeDeliveryId) {
      return {
        ok: false,
        error: "NO_ACTIVE_DELIVERY",
        state,
        events: [],
        finished: state.finished,
        winnerSeats: state.winnerSeats,
      };
    }

    const next = this.cloneState(state);
    const activeDeliveryId = state.activeDeliveryId;
    const activeSequence = state.deliverySequence;
    const delivery: CricketPendingDelivery = next.pendingDelivery!;
    const weights = this.outcomeWeights(delivery.delivery, shot, timing, delivery.power, delivery.pitchTarget, next.batterCreaseX);
    const outcome = this.rollOutcome(weights);
    const runs = outcome === "W" ? 0 : parseInt(outcome, 10);
    const isWicket = outcome === "W";
    const wicketType = isWicket ? this.rollWicketType(shot) : null;

    const batsman = next.players[next.currentBatsman];
    const bowler = next.players[next.currentBowler];

    let extraType: import("./types").CricketExtraType | null = null;
    let extras = 0;
    const extraRoll = this.random();
    if (!isWicket && extraRoll < 0.03) {
      extraType = "no-ball";
      extras = 1;
    } else if (!isWicket && extraRoll < 0.06) {
      extraType = "wide";
      extras = 1;
    } else if (!isWicket && extraRoll < 0.08) {
      extraType = "bye";
      extras = this.randomInt(1, 2);
    } else if (!isWicket && extraRoll < 0.10) {
      extraType = "leg-bye";
      extras = this.randomInt(1, 2);
    }

    const isLegalDelivery = extraType !== "wide" && extraType !== "no-ball";

    batsman.runs += runs;
    if (isLegalDelivery) {
      batsman.balls += 1;
    }
    if (runs === 4) batsman.fours += 1;
    if (runs === 6) batsman.sixes += 1;
    if (isWicket) {
      batsman.wickets += 1;
      bowler.wickets += 1;
    }

    // Bowler extra accounting: wide and no-ball are charged to bowler; bye and leg-bye are not
    const bowlerExtras = (extraType === "wide" || extraType === "no-ball") ? extras : 0;
    bowler.runsConceded += runs + bowlerExtras;
    bowler.extras += bowlerExtras;

    // Team score ownership: team1 belongs strictly to seat 0, team2 belongs strictly to seat 1
    const battingSeat = next.battingTeam;
    const teamScoreKey = battingSeat === 0 ? "team1Score" : "team2Score";
    const teamWicketsKey = battingSeat === 0 ? "team1Wickets" : "team2Wickets";
    const teamExtrasKey = battingSeat === 0 ? "team1Extras" : "team2Extras";

    (next as any)[teamScoreKey] += runs + extras;
    (next as any)[teamExtrasKey] += extras;
    if (isWicket) (next as any)[teamWicketsKey] += 1;

    const completedOver = next.currentOver;
    const ballNumberInOver = isLegalDelivery ? next.currentBall + 1 : next.currentBall;

    const ball: CricketBall = {
      over: completedOver,
      ball: ballNumberInOver,
      runs,
      extras,
      extraType,
      wicket: isWicket,
      wicketType: isWicket ? wicketType : null,
      comment: this.generateCommentary(runs, isWicket, wicketType, extraType, extras),
    };
    next.balls.push(ball);

    console.log("[CricketEngine] DELIVERY_RESULT", {
      matchId: this.gameId,
      deliveryId: activeDeliveryId,
      sequence: activeSequence,
      runs,
      isWicket,
      wicketType,
      comment: ball.comment,
    });

    if (isLegalDelivery) {
      bowler.oversBowled.balls += 1;
      next.currentBall += 1;

      if (bowler.oversBowled.balls >= 6) {
        bowler.oversBowled.overs += 1;
        bowler.oversBowled.balls = 0;
        // Maiden calculation on the 6 legal deliveries of completed over
        const overBalls = next.balls.filter(b => b.over === completedOver);
        const overRunsConceded = overBalls.reduce(
          (sum, b) => sum + b.runs + (b.extraType === "wide" || b.extraType === "no-ball" ? b.extras : 0),
          0
        );
        if (overRunsConceded === 0) {
          bowler.maidens += 1;
        }
      }

      if (next.currentBall >= 6) {
        next.currentOver += 1;
        next.currentBall = 0;
        events.push({ type: "over-complete", over: next.currentOver });
      }
    }
    bowler.overs = bowler.oversBowled.overs + bowler.oversBowled.balls / 6;

    const currentBattingScore = battingSeat === 0 ? next.team1Score : next.team2Score;
    const currentBattingWickets = battingSeat === 0 ? next.team1Wickets : next.team2Wickets;
    const totalLegalBalls = next.currentOver * 6 + next.currentBall;

    events.push(
      {
        type: "shot-played",
        seat: next.battingTeam,
        shot,
        timing,
        delivery: delivery.delivery,
        deliveryId: activeDeliveryId,
        deliverySequence: activeSequence,
      },
      {
        type: "ball-result",
        seat: next.battingTeam,
        deliveryId: activeDeliveryId,
        deliverySequence: activeSequence,
        over: ball.over,
        ball: ball.ball,
        runs,
        extras,
        extraType,
        wicket: isWicket,
        wicketType,
        comment: ball.comment,
        score: currentBattingScore,
        wickets: currentBattingWickets,
        balls: totalLegalBalls,
        overs: next.currentOver,
        battingPlayerId: next.battingTeam,
        bowlingPlayerId: next.bowlingTeam,
      },
    );

    next.pendingDelivery = null;

    console.log("[CricketEngine] BALL_COUNT_UPDATED", {
      matchId: this.gameId,
      over: next.currentOver,
      ball: next.currentBall,
      totalBalls: totalLegalBalls,
    });

    if (totalLegalBalls > 0) {
      next.runRate = (currentBattingScore / totalLegalBalls) * 6;
    }
    if (next.inning === 2 && next.target != null && totalLegalBalls > 0) {
      const remaining = next.target - currentBattingScore;
      const remainingOvers = next.totalOvers - (totalLegalBalls / 6);
      if (remainingOvers > 0 && remaining > 0) {
        next.requiredRunRate = remaining / remainingOvers;
      }
    }

    // Release delivery lock upon completing delivery calculation
    next.isProcessingDelivery = false;
    next.activeDeliveryId = null;
    next.pitchTarget = null;
    next.bowlingPhase = "TARGETING";
    next.batterCreaseX = 0;
    next.movementLocked = false;
    next.lastBatterMoveAtMs = null;
    console.log("[CricketEngine] DELIVERY_COMPLETED", {
      matchId: this.gameId,
      deliveryId: activeDeliveryId,
      sequence: activeSequence,
    });
    events.push({
      type: "delivery-complete",
      deliveryId: activeDeliveryId,
      deliverySequence: activeSequence,
    });

    const chasingScore = next.battingTeam === 0 ? next.team1Score : next.team2Score;

    // The chasing side wins the moment its score reaches the target.
    if (next.inning === 2 && next.target != null && chasingScore >= next.target) {
      next.finished = true;
      next.gameOver = true;
      next.pitchTarget = null;
      next.bowlingPhase = "TARGETING";
      next.endReason = "target-chased";
      next.endReasonState = "target-chased";
      next.winnerSeats = [next.battingTeam];
      next.winner = next.battingTeam;
      events.push({ type: "target-chased", seat: next.battingTeam });
      events.push({
        type: "match-complete",
        winner: next.winner,
        winnerSeats: next.winnerSeats,
        endReason: next.endReason,
      });
      return this.finishState(next, events, now);
    }

    // The batting side is all out (one player per side) or its overs are up.
    if (isWicket || next.currentOver >= next.totalOvers) {
      if (next.inning === 1) {
        next.inning = 2;
        next.currentOver = 0;
        next.currentBall = 0;
        const previousBattingTeam = next.battingTeam;
        const firstInningsScore = previousBattingTeam === 0 ? next.team1Score : next.team2Score;
        next.target = firstInningsScore + 1;

        const prevBatting = next.battingTeam;
        const prevBowling = next.bowlingTeam;
        next.battingTeam = prevBowling;
        next.bowlingTeam = prevBatting;
        next.currentBatsman = next.battingTeam;
        next.currentBowler = next.bowlingTeam;
        next.pitchTarget = null;
        next.bowlingPhase = "TARGETING";
        next.batterCreaseX = 0;
        next.movementLocked = false;
        next.lastBatterMoveAtMs = null;

        console.log("[CricketEngine] INNINGS_TRANSITION", {
          matchId: this.gameId,
          newInning: 2,
          newBattingTeam: next.battingTeam,
          newBowlingTeam: next.bowlingTeam,
          target: next.target,
        });

        events.push(
          { type: "inning-change", inning: 2, battingTeam: next.battingTeam, bowlingTeam: next.bowlingTeam },
          { type: "swap-roles", battingTeam: next.battingTeam, bowlingTeam: next.bowlingTeam },
          { type: "role-change", innings: 2, battingTeam: next.battingTeam, bowlingTeam: next.bowlingTeam, target: next.target },
          { type: "innings-ending", inning: 1, team1Score: next.team1Score, team1Wickets: next.team1Wickets, score: firstInningsScore },
          { type: "innings-break", durationMs: 2000, target: next.target },
          { type: "innings-start", inning: 2, battingTeam: next.battingTeam, bowlingTeam: next.bowlingTeam, target: next.target },
        );
        next.currentSeat = next.bowlingTeam;
        next.currentActor = "bowler";
        console.log("[CricketEngine] NEXT_DELIVERY_READY", {
          matchId: this.gameId,
          inning: next.inning,
          battingTeam: next.battingTeam,
          bowlingTeam: next.bowlingTeam,
          currentActor: next.currentActor,
          currentSeat: next.currentSeat,
        });
        return this.advanceTurn(next, now, events);
      }

      next.finished = true;
      next.gameOver = true;
      next.pitchTarget = null;
      next.bowlingPhase = "TARGETING";
      const reason = isWicket ? "all-out" : "overs-complete";
      if (next.team1Score > next.team2Score) {
        next.endReason = reason;
        next.endReasonState = reason;
        next.winnerSeats = [0];
        next.winner = 0;
      } else if (next.team2Score > next.team1Score) {
        next.endReason = reason;
        next.endReasonState = reason;
        next.winnerSeats = [1];
        next.winner = 1;
      } else {
        next.endReason = "tie";
        next.endReasonState = "tie";
        next.winnerSeats = [];
        next.winner = null;
      }
      events.push({
        type: "match-complete",
        winner: next.winner,
        winnerSeats: next.winnerSeats,
        endReason: next.endReason,
      });
      return this.finishState(next, events, now);
    }

    // Next ball: the bowling side opens.
    next.currentSeat = next.bowlingTeam;
    next.currentActor = "bowler";

    console.log("[CricketEngine] NEXT_DELIVERY_READY", {
      matchId: this.gameId,
      inning: next.inning,
      battingTeam: next.battingTeam,
      bowlingTeam: next.bowlingTeam,
      currentActor: next.currentActor,
      currentSeat: next.currentSeat,
    });

    return this.advanceTurn(next, now, events);
  }

  private advanceTurn(
    next: CricketState,
    now: number,
    events: EngineEvent[],
  ): EngineActionResult<CricketState> {
    next.turnNumber += 1;
    next.turnStartedAtMs = now;
    return { ok: true, state: next, events, finished: next.finished, winnerSeats: next.winnerSeats };
  }

  private finishState(
    next: CricketState,
    _events: EngineEvent[],
    _now: number,
  ): EngineActionResult<CricketState> {
    next.turnStartedAtMs = null;
    next.matchStartedAtMs = null;
    return { ok: true, state: next, events: _events, finished: true, winnerSeats: next.winnerSeats };
  }

  private outcomeWeights(
    delivery: CricketDelivery,
    shot: CricketShot,
    timing: CricketTiming,
    power: number,
    target?: CricketPitchTarget | null,
    batterCreaseX: number = 0,
  ): OutcomeWeights {
    const weights = { ...GOOD_TIMING[delivery][shot] };
    if (timing !== "good") {
      for (const key of OUTCOME_KEYS) {
        weights[key] = Math.round(weights[key] * BAD_TIMING[key]);
      }
    }
    const level = power < 0.35 ? "low" : power > 0.65 ? "high" : "medium";
    const mods = POWER_MODS[level];
    for (const key of OUTCOME_KEYS) {
      const mod = mods[key];
      if (mod != null) weights[key] = Math.round(weights[key] * mod);
    }

    // Line and lengthZone modifiers based on pitch targeting
    if (target) {
      if (target.lengthZone === "full") {
        if (shot === "up") {
          weights["4"] = Math.round(weights["4"] * 1.25);
          weights["6"] = Math.round(weights["6"] * 1.2);
          if (timing !== "good") {
            weights["W"] = Math.round(weights["W"] * 1.3);
          }
        } else if (shot === "straight") {
          weights["4"] = Math.round(weights["4"] * 1.15);
        }
      } else if (target.lengthZone === "short") {
        if (shot === "straight") {
          weights["W"] = Math.round(weights["W"] * 1.25);
          weights["0"] = Math.round(weights["0"] * 1.2);
        } else if (shot === "up") {
          // Bouncer hooked/pulled
          weights["6"] = Math.round(weights["6"] * 1.15);
          weights["W"] = Math.round(weights["W"] * 1.2);
        }
      }

      if (target.line === "off") {
        if (shot === "left") {
          weights["4"] = Math.round(weights["4"] * 1.2);
        }
      } else if (target.line === "leg") {
        if (shot === "right") {
          weights["4"] = Math.round(weights["4"] * 1.2);
        }
      }
    }

    // Alignment calculation: arrival lateral line vs batter crease position
    let ballArrivalX = target ? target.lateral : 0;
    if (delivery === "spin") {
      ballArrivalX += 0.12; // lateral turn after bounce
    } else if (delivery === "swing") {
      ballArrivalX -= 0.08; // curve in flight
    }
    ballArrivalX = Math.max(-0.85, Math.min(0.85, ballArrivalX));

    const BAT_REACH = 0.35;
    const lateralDiff = Math.abs(ballArrivalX - batterCreaseX);
    const alignmentScore = Math.max(0, Math.min(1, 1 - lateralDiff / BAT_REACH));

    const timingScore = timing === "good" ? 1.0 : 0.4;
    let shotSuitability = 0.6;
    if (target) {
      if (target.lengthZone === "full" && (shot === "straight" || shot === "up")) shotSuitability = 1.0;
      else if (target.lengthZone === "short" && shot === "up") shotSuitability = 1.0;
      else if (target.line === "off" && (shot === "right" || shot === "straight")) shotSuitability = 0.9;
      else if (target.line === "leg" && (shot === "left" || shot === "up")) shotSuitability = 0.9;
    }

    const shotQuality = timingScore * 0.45 + alignmentScore * 0.35 + shotSuitability * 0.20;

    if (alignmentScore >= 0.75 && shotQuality >= 0.7) {
      weights["4"] = Math.round(weights["4"] * (1 + 0.3 * alignmentScore));
      weights["6"] = Math.round(weights["6"] * (1 + 0.35 * alignmentScore));
      weights["W"] = Math.max(1, Math.round(weights["W"] * 0.65));
    } else if (alignmentScore < 0.35) {
      weights["0"] = Math.round(weights["0"] * 1.6);
      weights["W"] = Math.round(weights["W"] * 1.5);
      weights["4"] = Math.max(1, Math.round(weights["4"] * 0.4));
      weights["6"] = Math.max(0, Math.round(weights["6"] * 0.2));
    }

    return weights;
  }

  private rollOutcome(weights: OutcomeWeights): OutcomeKey {
    const total = OUTCOME_KEYS.reduce((sum, key) => sum + weights[key], 0);
    let roll = this.random() * total;
    for (const key of OUTCOME_KEYS) {
      roll -= weights[key];
      if (roll < 0) return key;
    }
    return "0";
  }

  private rollWicketType(shot: CricketShot): CricketWicketType {
    const pool: CricketWicketType[] =
      shot === "up"
        ? ["caught", "caught", "caught", "bowled", "lbw", "runout", "stumped"]
        : ["bowled", "bowled", "caught", "caught", "lbw", "runout", "stumped"];
    return pool[this.randomInt(0, pool.length - 1)];
  }

  private generateCommentary(
    runs: number,
    wicket: boolean,
    wicketType: CricketWicketType | null,
    extraType?: CricketExtraType | null,
    extras?: number,
  ): string {
    if (extraType) {
      const extraNames: Record<CricketExtraType, string> = {
        "no-ball": "NO BALL",
        wide: "WIDE",
        bye: "BYE",
        "leg-bye": "LEG BYE",
      };
      const base = `${extraNames[extraType]}! ${extras} extra run${extras !== 1 ? "s" : ""}.`;
      if (runs > 0) return `${base} Plus ${runs} from the bat.`;
      return base;
    }
    if (wicket) {
      return wicketType
        ? `${wicketType.toUpperCase()}! ${COMMENTARY[this.randomInt(0, COMMENTARY.length - 1)]}`
        : "WICKET!";
    }
    if (runs === 6) return "SIX! Incredible shot!";
    if (runs === 4) return "FOUR! Beautiful timing!";
    if (runs > 0) return `${runs} runs scored!`;
    return "Dot ball.";
  }

  /**
   * Deterministic timeout winner resolution for Cricket:
   * 1. Team with higher total runs scored.
   * 2. If tied on runs, team with fewest wickets lost.
   * 3. If tied, draw across teams.
   */
  protected override resolveTimeoutWinner(state: CricketState): number[] {
    const s0 = state.team1Score;
    const s1 = state.team2Score;
    if (s0 > s1) return [0];
    if (s1 > s0) return [1];

    // Tied on runs: compare wickets lost (fewer is better)
    const w0 = state.team1Wickets;
    const w1 = state.team2Wickets;
    if (w0 < w1) return [0];
    if (w1 < w0) return [1];

    return [0, 1];
  }
}

export type CricketActionType = CricketAction["type"];
