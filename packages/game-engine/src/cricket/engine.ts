import type { EngineActionResult, EngineEvent, EnginePlayer, RandomSource } from "../types";
import { MultiplayerGameEngine } from "../base/MultiplayerGameEngine";
import type { CricketState, CricketAction, CricketEngineOptions, CricketBall, CricketPlayer, CricketMatchType } from "./types";
import { CRICKET_OVERS } from "./types";

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

  protected initBaseState(): Omit<CricketState, keyof import("../base/MultiplayerGameEngine").BaseState> {
    const players: CricketPlayer[] = this.players.map((p, index) => ({
      seat: p.seat,
      name: `Player ${p.seat + 1}`,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      wickets: 0,
      overs: 0,
      runsConceded: 0,
    }));

    return {
      matchType: this.matchType,
      totalOvers: this.totalOvers,
      currentOver: 0,
      currentBall: 0,
      inning: 1,
      battingTeam: 0,
      bowlingTeam: 1,
      team1Score: 0,
      team2Score: 0,
      team1Wickets: 0,
      team2Wickets: 0,
      balls: [],
      players,
      currentBatsman: 0,
      currentBowler: 1,
      winner: null,
      endReason: null,
    };
  }

  protected validateGameAction(action: CricketAction, seat: number, state: CricketState): string | null {
    if (state.finished) return "Match is finished";
    if (state.paused) return "Match is paused";
    if (seat !== state.currentSeat) return "Not your turn";

    switch (action.type) {
      case "play-ball":
        if (typeof action.runs !== "number" || action.runs < 0 || action.runs > 6) {
          return "Invalid runs (0-6)";
        }
        if (action.wicket && !action.wicketType) {
          return "Wicket type required";
        }
        return null;
      default:
        return null;
    }
  }

  protected applyGameAction(action: CricketAction, seat: number, state: CricketState): EngineActionResult<CricketState> {
    const now = this.now();
    const events: EngineEvent[] = [];

    switch (action.type) {
      case "play-ball":
        return this.applyPlayBall(action, seat, state, now, events);
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

  private applyPlayBall(
    action: { type: "play-ball"; runs?: number; wicket?: boolean; wicketType?: string },
    seat: number,
    state: CricketState,
    now: number,
    events: EngineEvent[],
  ): EngineActionResult<CricketState> {
    const next = this.cloneState(state);
    const runs = action.runs ?? 0;
    const isWicket = action.wicket ?? false;
    const wicketType = action.wicketType ?? null;

    const batsman = next.players[next.currentBatsman];
    const bowler = next.players[next.currentBowler];

    batsman.runs += runs;
    batsman.balls += 1;
    if (runs === 4) batsman.fours += 1;
    if (runs === 6) batsman.sixes += 1;

    if (isWicket) {
      batsman.wickets += 1;
      bowler.wickets += 1;
    }

    bowler.overs = Math.floor((bowler.overs * 6 + 1) / 6);
    bowler.runsConceded += runs;

    const teamScore = next.inning === 1 ? "team1Score" : "team2Score";
    const teamWickets = next.inning === 1 ? "team1Wickets" : "team2Wickets";
    (next as any)[teamScore] += runs;
    if (isWicket) (next as any)[teamWickets] += 1;

    const ball: CricketBall = {
      over: next.currentOver,
      ball: next.currentBall + 1,
      runs,
      wicket: isWicket,
      wicketType: isWicket ? (wicketType as any) : null,
      comment: this.generateCommentary(runs, isWicket, wicketType),
    };
    next.balls.push(ball);

    events.push({
      type: "ball-played",
      seat,
      over: next.currentOver,
      ball: next.currentBall + 1,
      runs,
      wicket: isWicket,
      wicketType,
      comment: ball.comment,
    });

    next.currentBall += 1;

    if (next.currentBall >= 6) {
      next.currentOver += 1;
      next.currentBall = 0;
      next.currentBowler = (next.currentBowler + 1) % next.players.length;
      next.currentBatsman = (next.currentBatsman + 1) % next.players.length;
    }

    if (isWicket && (next as any)[teamWickets] >= 2) {
      next.finished = true;
      next.gameOver = true;
      next.endReason = "all-out";
      next.endReasonState = "all-out";
      next.winnerSeats = [next.bowlingTeam];
      next.winner = next.bowlingTeam;
      events.push({ type: "all-out", seat: next.bowlingTeam });
    } else if (next.currentOver >= next.totalOvers) {
      if (next.inning === 1) {
        next.inning = 2;
        next.currentOver = 0;
        next.currentBall = 0;
        next.battingTeam = 1;
        next.bowlingTeam = 0;
        next.currentBatsman = 1;
        next.currentBowler = 0;
        events.push({ type: "inning-change", inning: 2 });
      } else {
        next.finished = true;
        next.gameOver = true;
        next.endReason = "overs-complete";
        next.endReasonState = "overs-complete";

        if (next.team1Score > next.team2Score) {
          next.winnerSeats = [0];
          next.winner = 0;
        } else if (next.team2Score > next.team1Score) {
          next.winnerSeats = [1];
          next.winner = 1;
        } else {
          next.winnerSeats = [];
          next.winner = null;
        }
        events.push({ type: "match-complete", winner: next.winner });
      }
    } else if (next.inning === 2 && (next as any)[teamScore] > (next.inning === 2 ? next.team1Score : next.team2Score)) {
      next.finished = true;
      next.gameOver = true;
      next.endReason = "target-chased";
      next.endReasonState = "target-chased";
      next.winnerSeats = [next.battingTeam];
      next.winner = next.battingTeam;
      events.push({ type: "target-chased", seat: next.battingTeam });
    }

    next.turnNumber++;
    next.turnStartedAtMs = now;
    next.currentSeat = next.battingTeam;

    return {
      ok: true,
      state: next,
      events,
      finished: next.finished,
      winnerSeats: next.winnerSeats,
    };
  }

  private generateCommentary(runs: number, wicket: boolean, wicketType: string | null): string {
    if (wicket) {
      return wicketType ? `${wicketType.toUpperCase()}! ${COMMENTARY[Math.floor(Math.random() * COMMENTARY.length)]}` : "WICKET!";
    }
    if (runs === 6) return "SIX! Incredible shot!";
    if (runs === 4) return "FOUR! Beautiful timing!";
    if (runs > 0) return `${runs} runs scored!`;
    return "Dot ball.";
  }
}

export type CricketActionType = CricketAction["type"];
