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
  private readonly matchType: CricketMatchType;
  private readonly totalOvers: number;

  constructor(players: EnginePlayer[], rng?: RandomSource, options?: CricketEngineOptions) {
    const turnTimer = options?.turnTimer ?? { turnDurationMs: 30000, warningThresholdMs: 5000 };
    const matchTimer = options?.matchTimer ?? { matchDurationMs: 1200000, warningThresholdMs: 60000 };
    super(players, rng, {
      turnTimer,
      matchTimer,
      enableResign: options?.enableResign ?? true,
      enableDraw: options?.enableDraw ?? true,
      enablePause: options?.enablePause ?? true,
      enableRematch: options?.enableRematch ?? true,
      now: options?.now,
    });

    this.matchType = options?.matchType ?? "5-overs";
    this.totalOvers = CRICKET_OVERS[this.matchType];
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
    return {
      matchType: this.matchType,
      totalOvers: this.totalOvers,
      currentOver: 0,
      currentBall: 0,
      inning: 1,
      battingTeam: 0,
      bowlingTeam: 0,
      battingFirst: 0,
      currentActor: "toss",
      target: null,
      pendingDelivery: null,
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
    if (state.finished) return "Match is finished";
    if (state.paused) return "Match is paused";
    if (action.type === "toss-call") {
      if (state.currentActor !== "toss") return "Toss already completed";
      if (state.tossWinner != null) return "Toss already completed";
      return null;
    }
    if (state.currentActor === "toss") return "Toss in progress";
    if (seat !== state.currentSeat) return "Not your turn";

    switch (action.type) {
      case "bowl":
        if (state.currentActor !== "bowler") return "The batsman is at the crease";
        if (seat !== state.bowlingTeam) return "Only the bowling side can bowl";
        if (!CRICKET_DELIVERIES.includes(action.delivery)) return "Invalid delivery";
        if (
          action.power != null &&
          (typeof action.power !== "number" || action.power < 0 || action.power > 1)
        ) {
          return "Invalid power";
        }
        return null;
      case "bat":
        if (state.currentActor !== "batsman") return "The bowler is at the crease";
        if (seat !== state.battingTeam) return "Only the batting side can bat";
        if (!CRICKET_SHOTS.includes(action.shot)) return "Invalid shot";
        if (action.timing && !["early", "good", "late"].includes(action.timing)) {
          return "Invalid timing";
        }
        return null;
      default:
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
        const battingFirst = this.random() < 0.5 ? tossWinner : (1 - tossWinner);
        next.battingFirst = battingFirst;
        next.battingTeam = battingFirst;
        next.bowlingTeam = 1 - battingFirst;
        next.currentBatsman = battingFirst;
        next.currentBowler = 1 - battingFirst;
        next.currentActor = "bowler";
        next.currentSeat = next.bowlingTeam;
        events.push({
          type: "toss-result",
          tossResult: state.tossResult!,
          tossCall: action.call,
          tossWinner,
          battingFirst,
        });
        return this.advanceTurn(next, now, events);
      }
      case "bowl": {
        const next = this.cloneState(state);
        const power = clamp(action.power ?? 0.5, 0, 1);
        next.pendingDelivery = { 
          delivery: action.delivery, 
          power, 
          line: action.line ?? null, 
          length: action.length ?? null 
        };
        next.currentActor = "batsman";
        next.currentSeat = next.battingTeam;
        events.push({ type: "ball-bowled", seat, delivery: action.delivery, power, line: action.line, length: action.length });
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

  protected override onTurnTimerExpired(seat: number, state: CricketState): EngineActionResult<CricketState> {
    const now = this.now();
    const events: EngineEvent[] = [{ type: "turn-timeout", seat }];

    if (state.currentActor === "batsman") {
      const shot = CRICKET_SHOTS[this.randomInt(0, CRICKET_SHOTS.length - 1)];
      return this.resolveShot(state, shot, "late", now, events);
    }

    const delivery = CRICKET_DELIVERIES[this.randomInt(0, CRICKET_DELIVERIES.length - 1)];
    const next = this.cloneState(state);
    next.pendingDelivery = { delivery, power: 0.5, line: null, length: null };
    next.currentActor = "batsman";
    next.currentSeat = next.battingTeam;
    events.push({ type: "ball-bowled", seat, delivery, power: 0.5, auto: true });
    return this.advanceTurn(next, now, events);
  }

  private resolveShot(
    state: CricketState,
    shot: CricketShot,
    timing: CricketTiming,
    now: number,
    events: EngineEvent[],
  ): EngineActionResult<CricketState> {
    const next = this.cloneState(state);
    const delivery: CricketPendingDelivery = next.pendingDelivery ?? { delivery: "fast", power: 0.5, line: null, length: null };

    const weights = this.outcomeWeights(delivery.delivery, shot, timing, delivery.power);
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

    batsman.runs += runs;
    batsman.balls += 1;
    if (runs === 4) batsman.fours += 1;
    if (runs === 6) batsman.sixes += 1;
    if (isWicket) {
      batsman.wickets += 1;
      bowler.wickets += 1;
    }

    bowler.oversBowled.balls += 1;
    if (bowler.oversBowled.balls >= 6) {
      bowler.oversBowled.overs += 1;
      bowler.oversBowled.balls = 0;
      const maidenRuns = next.balls.slice(-6).reduce((sum, b) => sum + b.runs, 0);
      if (maidenRuns === 0 && next.balls.slice(-6).every(b => !b.wicket)) {
        bowler.maidens += 1;
      }
    }
    bowler.overs = bowler.oversBowled.overs + bowler.oversBowled.balls / 6;
    bowler.runsConceded += runs;
    bowler.extras += extras;

    const teamScore = next.inning === 1 ? "team1Score" : "team2Score";
    const teamWickets = next.inning === 1 ? "team1Wickets" : "team2Wickets";
    const teamExtras = next.inning === 1 ? "team1Extras" : "team2Extras";
    (next as any)[teamScore] += runs + extras;
    (next as any)[teamExtras] += extras;
    if (isWicket) (next as any)[teamWickets] += 1;

    const ball: CricketBall = {
      over: next.currentOver,
      ball: next.currentBall + 1,
      runs,
      extras,
      extraType,
      wicket: isWicket,
      wicketType: isWicket ? wicketType : null,
      comment: this.generateCommentary(runs, isWicket, wicketType, extraType, extras),
    };
    next.balls.push(ball);

    events.push(
      {
        type: "shot-played",
        seat: next.battingTeam,
        shot,
        timing,
        delivery: delivery.delivery,
      },
      {
        type: "ball-result",
        seat: next.battingTeam,
        over: ball.over,
        ball: ball.ball,
        runs,
        wicket: isWicket,
        wicketType,
        comment: ball.comment,
      },
    );

    next.currentBall += 1;
    if (next.currentBall >= 6) {
      next.currentOver += 1;
      next.currentBall = 0;
      events.push({ type: "over-complete", over: next.currentOver });
    }
    next.pendingDelivery = null;

    const totalBalls = next.currentOver * 6 + next.currentBall;
    if (totalBalls > 0) {
      next.runRate = ((next.inning === 1 ? next.team1Score : next.team2Score) / totalBalls) * 6;
    }
    if (next.inning === 2 && next.target != null && totalBalls > 0) {
      const remaining = next.target - next.team2Score;
      const remainingOvers = next.totalOvers - (totalBalls / 6);
      if (remainingOvers > 0 && remaining > 0) {
        next.requiredRunRate = remaining / remainingOvers;
      }
    }

    const battingScore = next.inning === 1 ? next.team1Score : next.team2Score;

    // The chasing side wins the moment its score reaches the target.
    if (next.inning === 2 && battingScore >= (next.target ?? 0)) {
      next.finished = true;
      next.gameOver = true;
      next.endReason = "target-chased";
      next.endReasonState = "target-chased";
      next.winnerSeats = [next.battingTeam];
      next.winner = next.battingTeam;
      events.push({ type: "target-chased", seat: next.battingTeam });
      return this.finishState(next, events, now);
    }

    // The batting side is all out (one player per side) or its overs are up.
    if (isWicket || next.currentOver >= next.totalOvers) {
      if (next.inning === 1) {
        next.inning = 2;
        next.currentOver = 0;
        next.currentBall = 0;
        next.target = next.team1Score + 1;
        const prevBatting = next.battingTeam;
        const prevBowling = next.bowlingTeam;
        next.battingTeam = prevBowling;
        next.bowlingTeam = prevBatting;
        next.currentBatsman = next.battingTeam;
        next.currentBowler = next.bowlingTeam;
        events.push(
          { type: "inning-change", inning: 2, battingTeam: next.battingTeam, bowlingTeam: next.bowlingTeam },
          { type: "swap-roles", battingTeam: next.battingTeam, bowlingTeam: next.bowlingTeam },
        );
        next.currentSeat = next.bowlingTeam;
        next.currentActor = "bowler";
        return this.advanceTurn(next, now, events);
      }

      next.finished = true;
      next.gameOver = true;
      if (next.team1Score > next.team2Score) {
        next.endReason = "overs-complete";
        next.endReasonState = "overs-complete";
        next.winnerSeats = [next.battingFirst];
        next.winner = next.battingFirst;
      } else if (next.team2Score > next.team1Score) {
        next.endReason = "overs-complete";
        next.endReasonState = "overs-complete";
        next.winnerSeats = [1 - next.battingFirst];
        next.winner = 1 - next.battingFirst;
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

  private outcomeWeights(delivery: CricketDelivery, shot: CricketShot, timing: CricketTiming, power: number): OutcomeWeights {
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
}

export type CricketActionType = CricketAction["type"];
