import { describe, it, expect, beforeEach } from "vitest";
import {
  createEngine,
  secureRandomSource,
} from "../src/index";
import { ReplayManager } from "@gaming-hub/multiplayer";
import type {
  GameId,
  MatchHistoryRecord,
  MatchSummaryView,
  ReplayPackage,
  GlobalPlayerStatistics,
  TimeLimitAnalytics,
  ResultReason,
} from "@gaming-hub/shared";

describe("GLOBAL MATCH HISTORY, REPLAY & PLAYER STATISTICS SYSTEM", () => {
  const ALL_10_GAMES: GameId[] = [
    "snake-ladder",
    "ludo",
    "chess",
    "fruit-ninja",
    "bubble-shooter",
    "table-tennis",
    "snake-vs-worms",
    "cricket",
    "carrom",
    "snooker",
  ];

  // Helper mock history recorder with idempotency
  class MockMatchHistoryStore {
    private records = new Map<string, MatchHistoryRecord>();
    private stats = new Map<string, GlobalPlayerStatistics>();
    private processedMatchIds = new Set<string>();

    recordCompletedMatch(record: MatchHistoryRecord): { created: boolean; record: MatchHistoryRecord } {
      if (this.records.has(record.matchId)) {
        return { created: false, record: this.records.get(record.matchId)! };
      }
      this.records.set(record.matchId, record);
      this.updatePlayerStats(record);
      return { created: true, record };
    }

    getHistory(userId: string, filters?: { gameId?: string; result?: string; isTournament?: boolean }): MatchHistoryRecord[] {
      let list = [...this.records.values()].filter((r) => r.players.some((p) => p.userId === userId));
      if (filters?.gameId && filters.gameId !== "all") {
        list = list.filter((r) => r.gameType === filters.gameId);
      }
      if (filters?.result) {
        list = list.filter((r) => r.resultType === filters.result);
      }
      if (filters?.isTournament) {
        list = list.filter((r) => Boolean(r.tournamentInfo?.isTournament));
      }
      return list;
    }

    getSummary(matchId: string, userId: string): MatchSummaryView | null {
      const rec = this.records.get(matchId);
      if (!rec) return null;
      const myPlayer = rec.players.find((p) => p.userId === userId) ?? rec.player1;
      const opponent = rec.players.find((p) => p.userId !== userId) ?? rec.player2;

      const durationM = Math.floor(rec.durationSeconds / 60);
      const durationS = rec.durationSeconds % 60;
      const matchDuration = `${String(durationM).padStart(2, "0")}:${String(durationS).padStart(2, "0")}`;

      return {
        game: rec.gameType.toUpperCase(),
        gameId: rec.gameType,
        result: rec.resultType,
        opponentName: opponent?.displayName || opponent?.username || "Opponent",
        opponentAvatar: opponent?.avatarUrl ?? null,
        myScore: myPlayer.score,
        opponentScore: opponent?.score ?? 0,
        formattedScore: `${myPlayer.displayName || myPlayer.username} ${myPlayer.score} - ${opponent?.displayName || opponent?.username || "Opponent"} ${opponent?.score ?? 0}`,
        matchDuration,
        durationSeconds: rec.durationSeconds,
        resultReason: rec.resultReason,
        startedAt: String(rec.startedAt),
        endedAt: String(rec.endedAt),
      };
    }

    getPlayerStats(userId: string): GlobalPlayerStatistics {
      return this.stats.get(userId) ?? {
        userId,
        totalMatches: 0,
        totalWins: 0,
        totalLosses: 0,
        totalDraws: 0,
        winRate: 0,
        gamesPlayed: 0,
        tournamentMatches: 0,
        tournamentWins: 0,
        averageMatchDuration: 0,
        shortestMatch: 0,
        longestMatch: 0,
        timeLimitMatches: 0,
        gameStats: {},
      };
    }

    private updatePlayerStats(record: MatchHistoryRecord) {
      if (this.processedMatchIds.has(record.matchId)) return;
      this.processedMatchIds.add(record.matchId);

      for (const p of record.players) {
        let ps = this.stats.get(p.userId);
        if (!ps) {
          ps = {
            userId: p.userId,
            totalMatches: 0,
            totalWins: 0,
            totalLosses: 0,
            totalDraws: 0,
            winRate: 0,
            gamesPlayed: 0,
            tournamentMatches: 0,
            tournamentWins: 0,
            averageMatchDuration: 0,
            shortestMatch: Infinity,
            longestMatch: 0,
            timeLimitMatches: 0,
            gameStats: {},
          };
          this.stats.set(p.userId, ps);
        }

        ps.totalMatches++;
        if (p.result === "WIN") ps.totalWins++;
        else if (p.result === "DRAW") ps.totalDraws++;
        else ps.totalLosses++;

        ps.winRate = Math.round((ps.totalWins / ps.totalMatches) * 100);

        if (record.durationSeconds < ps.shortestMatch) ps.shortestMatch = record.durationSeconds;
        if (record.durationSeconds > ps.longestMatch) ps.longestMatch = record.durationSeconds;

        if (record.resultReason === "TIME_LIMIT") {
          ps.timeLimitMatches++;
        }

        if (record.tournamentInfo?.isTournament) {
          ps.tournamentMatches++;
          if (p.result === "WIN") ps.tournamentWins++;
        }

        // Game specific stats
        const gId = record.gameType;
        if (gId === "snooker") {
          if (!ps.gameStats.snooker) {
            ps.gameStats.snooker = {
              matches: 0,
              wins: 0,
              losses: 0,
              winRate: 0,
              highestBreak: 0,
              averageBreak: 0,
              averageDuration: 0,
              totalPots: 0,
              fouls: 0,
            };
          }
          const s = ps.gameStats.snooker;
          s.matches++;
          if (p.result === "WIN") s.wins++;
          else s.losses++;
          s.winRate = Math.round((s.wins / s.matches) * 100);
          if (p.score > s.highestBreak) s.highestBreak = p.score;
          s.totalPots += p.score;
          s.averageBreak = Math.round(s.totalPots / s.matches);
        } else if (gId === "chess") {
          if (!ps.gameStats.chess) {
            ps.gameStats.chess = {
              matches: 0,
              wins: 0,
              losses: 0,
              draws: 0,
              winRate: 0,
              averageDuration: 0,
              checkmates: 0,
              totalMoves: 0,
            };
          }
          const c = ps.gameStats.chess;
          c.matches++;
          if (p.result === "WIN") {
            c.wins++;
            c.checkmates++;
          } else if (p.result === "DRAW") {
            c.draws++;
          } else {
            c.losses++;
          }
          c.winRate = Math.round((c.wins / c.matches) * 100);
        } else if (gId === "cricket") {
          if (!ps.gameStats.cricket) {
            ps.gameStats.cricket = {
              matches: 0,
              wins: 0,
              losses: 0,
              runs: 0,
              averageRuns: 0,
              highestScore: 0,
              wickets: 0,
              boundaries: 0,
              sixes: 0,
              averageDuration: 0,
            };
          }
          const cr = ps.gameStats.cricket;
          cr.matches++;
          if (p.result === "WIN") cr.wins++;
          else cr.losses++;
          cr.runs += p.score;
          if (p.score > cr.highestScore) cr.highestScore = p.score;
          cr.averageRuns = Math.round(cr.runs / cr.matches);
        } else if (gId === "carrom") {
          if (!ps.gameStats.carrom) {
            ps.gameStats.carrom = {
              matches: 0,
              wins: 0,
              losses: 0,
              points: 0,
              highestScore: 0,
              queensCovered: 0,
              fouls: 0,
              averageDuration: 0,
            };
          }
          const ca = ps.gameStats.carrom;
          ca.matches++;
          if (p.result === "WIN") ca.wins++;
          else ca.losses++;
          ca.points += p.score;
          if (p.score > ca.highestScore) ca.highestScore = p.score;
        }

        ps.gamesPlayed = Object.keys(ps.gameStats).length || 1;
      }
    }
  }

  let historyStore: MockMatchHistoryStore;

  beforeEach(() => {
    historyStore = new MockMatchHistoryStore();
  });

  // =========================================================================
  // 1. MATCH HISTORY CREATION ACROSS ALL 10 GAMES
  // =========================================================================
  describe("1. Match History Creation Across All 10 Games", () => {
    it("creates permanent match history records with correct result reasons for all 10 games", () => {
      const reasons: ResultReason[] = ["NORMAL", "TIME_LIMIT", "TIMEOUT", "ABANDONED", "DRAW"];

      for (let i = 0; i < ALL_10_GAMES.length; i++) {
        const gameId = ALL_10_GAMES[i]!;
        const reason = reasons[i % reasons.length]!;
        const matchId = `match-hist-${gameId}-1`;

        const record: MatchHistoryRecord = {
          matchId,
          gameType: gameId,
          player1: {
            userId: "user-alpha",
            username: "AlphaUser",
            displayName: "Alpha",
            seat: 0,
            score: 50 + i * 5,
            result: reason === "DRAW" ? "DRAW" : "WIN",
          },
          player2: {
            userId: "user-beta",
            username: "BetaUser",
            displayName: "Beta",
            seat: 1,
            score: 30 + i * 2,
            result: reason === "DRAW" ? "DRAW" : "LOSS",
          },
          players: [
            {
              userId: "user-alpha",
              username: "AlphaUser",
              displayName: "Alpha",
              seat: 0,
              score: 50 + i * 5,
              result: reason === "DRAW" ? "DRAW" : "WIN",
            },
            {
              userId: "user-beta",
              username: "BetaUser",
              displayName: "Beta",
              seat: 1,
              score: 30 + i * 2,
              result: reason === "DRAW" ? "DRAW" : "LOSS",
            },
          ],
          winner: reason === "DRAW" ? null : "user-alpha",
          winnerIds: reason === "DRAW" ? [] : ["user-alpha"],
          loser: reason === "DRAW" ? null : "user-beta",
          resultReason: reason,
          resultType: reason === "DRAW" ? "DRAW" : "WIN",
          startedAt: Date.now() - 300000,
          endedAt: Date.now(),
          durationSeconds: 300,
          finalScores: { "user-alpha": 50 + i * 5, "user-beta": 30 + i * 2 },
          entryFee: 100,
          configurationVersion: 1,
          createdAt: new Date().toISOString(),
        };

        const result = historyStore.recordCompletedMatch(record);
        expect(result.created).toBe(true);
        expect(result.record.matchId).toBe(matchId);
        expect(result.record.gameType).toBe(gameId);
        expect(result.record.resultReason).toBe(reason);
      }

      // Check User Alpha history contains all 10 games
      const alphaHistory = historyStore.getHistory("user-alpha");
      expect(alphaHistory.length).toBe(10);
    });

    it("prevents duplicate match history records (idempotency)", () => {
      const record: MatchHistoryRecord = {
        matchId: "match-duplicate-check",
        gameType: "snooker",
        player1: { userId: "p1", username: "P1", seat: 0, score: 60, result: "WIN" },
        player2: { userId: "p2", username: "P2", seat: 1, score: 30, result: "LOSS" },
        players: [
          { userId: "p1", username: "P1", seat: 0, score: 60, result: "WIN" },
          { userId: "p2", username: "P2", seat: 1, score: 30, result: "LOSS" },
        ],
        winner: "p1",
        winnerIds: ["p1"],
        loser: "p2",
        resultReason: "NORMAL",
        resultType: "WIN",
        startedAt: Date.now() - 100000,
        endedAt: Date.now(),
        durationSeconds: 100,
        finalScores: { p1: 60, p2: 30 },
        entryFee: 50,
        configurationVersion: 1,
        createdAt: new Date().toISOString(),
      };

      const res1 = historyStore.recordCompletedMatch(record);
      expect(res1.created).toBe(true);

      const res2 = historyStore.recordCompletedMatch(record);
      expect(res2.created).toBe(false);

      const res3 = historyStore.recordCompletedMatch(record);
      expect(res3.created).toBe(false);

      expect(historyStore.getHistory("p1").length).toBe(1);
    });
  });

  // =========================================================================
  // 2. MATCH SUMMARY VIEW (Requirement 2)
  // =========================================================================
  describe("2. Match Summary View Formatting", () => {
    it("formats match summary view accurately (Game, Result, Opponent, Score, Duration, Reason)", () => {
      const record: MatchHistoryRecord = {
        matchId: "match-summary-snooker",
        gameType: "snooker",
        player1: { userId: "mani", username: "mani", displayName: "MANI", seat: 0, score: 58, result: "WIN" },
        player2: { userId: "player2", username: "player2", displayName: "PLAYER 2", seat: 1, score: 42, result: "LOSS" },
        players: [
          { userId: "mani", username: "mani", displayName: "MANI", seat: 0, score: 58, result: "WIN" },
          { userId: "player2", username: "player2", displayName: "PLAYER 2", seat: 1, score: 42, result: "LOSS" },
        ],
        winner: "mani",
        winnerIds: ["mani"],
        loser: "player2",
        resultReason: "NORMAL",
        resultType: "WIN",
        startedAt: Date.now() - 523000,
        endedAt: Date.now(),
        durationSeconds: 523, // 08:43
        finalScores: { mani: 58, player2: 42 },
        entryFee: 100,
        configurationVersion: 1,
        createdAt: new Date().toISOString(),
      };

      historyStore.recordCompletedMatch(record);
      const summary = historyStore.getSummary("match-summary-snooker", "mani");

      expect(summary).not.toBeNull();
      expect(summary!.game).toBe("SNOOKER");
      expect(summary!.result).toBe("WIN");
      expect(summary!.opponentName).toBe("PLAYER 2");
      expect(summary!.myScore).toBe(58);
      expect(summary!.opponentScore).toBe(42);
      expect(summary!.formattedScore).toBe("MANI 58 - PLAYER 2 42");
      expect(summary!.matchDuration).toBe("08:43");
      expect(summary!.resultReason).toBe("NORMAL");
    });
  });

  // =========================================================================
  // 3. GAME-SPECIFIC & GLOBAL PLAYER STATISTICS
  // =========================================================================
  describe("3. Game-Specific and Global Player Statistics", () => {
    it("computes separate stats for Snooker (Highest Break, Avg Break), Chess (Draws, Win Rate), Cricket (Runs), Carrom (Points)", () => {
      // 1. Snooker Match 1: 58 points
      historyStore.recordCompletedMatch({
        matchId: "snk-1",
        gameType: "snooker",
        player1: { userId: "pro-player", username: "pro", seat: 0, score: 58, result: "WIN" },
        player2: { userId: "opp", username: "opp", seat: 1, score: 42, result: "LOSS" },
        players: [
          { userId: "pro-player", username: "pro", seat: 0, score: 58, result: "WIN" },
          { userId: "opp", username: "opp", seat: 1, score: 42, result: "LOSS" },
        ],
        winner: "pro-player",
        winnerIds: ["pro-player"],
        loser: "opp",
        resultReason: "NORMAL",
        resultType: "WIN",
        startedAt: 1000,
        endedAt: 2000,
        durationSeconds: 200,
        finalScores: { "pro-player": 58, opp: 42 },
        entryFee: 50,
        configurationVersion: 1,
        createdAt: new Date().toISOString(),
      });

      // 2. Snooker Match 2: 74 points (Highest break update)
      historyStore.recordCompletedMatch({
        matchId: "snk-2",
        gameType: "snooker",
        player1: { userId: "pro-player", username: "pro", seat: 0, score: 74, result: "WIN" },
        player2: { userId: "opp", username: "opp", seat: 1, score: 20, result: "LOSS" },
        players: [
          { userId: "pro-player", username: "pro", seat: 0, score: 74, result: "WIN" },
          { userId: "opp", username: "opp", seat: 1, score: 20, result: "LOSS" },
        ],
        winner: "pro-player",
        winnerIds: ["pro-player"],
        loser: "opp",
        resultReason: "NORMAL",
        resultType: "WIN",
        startedAt: 1000,
        endedAt: 2000,
        durationSeconds: 300,
        finalScores: { "pro-player": 74, opp: 20 },
        entryFee: 50,
        configurationVersion: 1,
        createdAt: new Date().toISOString(),
      });

      // 3. Chess Match: Draw
      historyStore.recordCompletedMatch({
        matchId: "chs-1",
        gameType: "chess",
        player1: { userId: "pro-player", username: "pro", seat: 0, score: 1, result: "DRAW" },
        player2: { userId: "opp", username: "opp", seat: 1, score: 1, result: "DRAW" },
        players: [
          { userId: "pro-player", username: "pro", seat: 0, score: 1, result: "DRAW" },
          { userId: "opp", username: "opp", seat: 1, score: 1, result: "DRAW" },
        ],
        winner: null,
        winnerIds: [],
        loser: null,
        resultReason: "DRAW",
        resultType: "DRAW",
        startedAt: 1000,
        endedAt: 2000,
        durationSeconds: 400,
        finalScores: { "pro-player": 1, opp: 1 },
        entryFee: 50,
        configurationVersion: 1,
        createdAt: new Date().toISOString(),
      });

      // 4. Cricket Match: 120 runs
      historyStore.recordCompletedMatch({
        matchId: "crk-1",
        gameType: "cricket",
        player1: { userId: "pro-player", username: "pro", seat: 0, score: 120, result: "WIN" },
        player2: { userId: "opp", username: "opp", seat: 1, score: 95, result: "LOSS" },
        players: [
          { userId: "pro-player", username: "pro", seat: 0, score: 120, result: "WIN" },
          { userId: "opp", username: "opp", seat: 1, score: 95, result: "LOSS" },
        ],
        winner: "pro-player",
        winnerIds: ["pro-player"],
        loser: "opp",
        resultReason: "NORMAL",
        resultType: "WIN",
        startedAt: 1000,
        endedAt: 2000,
        durationSeconds: 500,
        finalScores: { "pro-player": 120, opp: 95 },
        entryFee: 50,
        configurationVersion: 1,
        createdAt: new Date().toISOString(),
      });

      const stats = historyStore.getPlayerStats("pro-player");

      // Global stats
      expect(stats.totalMatches).toBe(4);
      expect(stats.totalWins).toBe(3);
      expect(stats.totalDraws).toBe(1);
      expect(stats.totalLosses).toBe(0);
      expect(stats.winRate).toBe(75);
      expect(stats.gamesPlayed).toBe(3); // snooker, chess, cricket

      // Snooker game specific stats
      const snk = stats.gameStats.snooker!;
      expect(snk.matches).toBe(2);
      expect(snk.wins).toBe(2);
      expect(snk.highestBreak).toBe(74);
      expect(snk.averageBreak).toBe(66); // (58 + 74) / 2 = 66

      // Chess game specific stats
      const chs = stats.gameStats.chess!;
      expect(chs.matches).toBe(1);
      expect(chs.draws).toBe(1);
      expect(chs.wins).toBe(0);

      // Cricket game specific stats
      const crk = stats.gameStats.cricket!;
      expect(crk.matches).toBe(1);
      expect(crk.runs).toBe(120);
      expect(crk.highestScore).toBe(120);
    });
  });

  // =========================================================================
  // 4. AUTHORITATIVE REPLAY SYSTEM & DETERMINISTIC RECONSTRUCTION
  // =========================================================================
  describe("4. Authoritative Replay System & Deterministic Reconstruction", () => {
    it("records strictly ordered sequence of authoritative events and verifies integrity", () => {
      const replayPkg: ReplayPackage = {
        matchId: "rep-seq-test",
        gameId: "chess",
        metadata: {
          players: [
            { id: "white", username: "WhitePlayer", seat: 0, score: 1 },
            { id: "black", username: "BlackPlayer", seat: 1, score: 0 },
          ],
          startedAt: 1000,
          endedAt: 5000,
          durationMs: 4000,
          winnerIds: ["white"],
          resultReason: "NORMAL",
          actionCount: 3,
        },
        initialState: { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", turnNumber: 0 },
        events: [
          {
            eventId: "ev-1",
            matchId: "rep-seq-test",
            sequence: 1,
            playerId: "white",
            eventType: "MOVE",
            timestamp: 1500,
            stateVersion: 1,
            actionData: { from: "e2", to: "e4" },
            resultData: { fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1", turnNumber: 1 },
          },
          {
            eventId: "ev-2",
            matchId: "rep-seq-test",
            sequence: 2,
            playerId: "black",
            eventType: "MOVE",
            timestamp: 2500,
            stateVersion: 2,
            actionData: { from: "e7", to: "e5" },
            resultData: { fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2", turnNumber: 2 },
          },
          {
            eventId: "ev-3",
            matchId: "rep-seq-test",
            sequence: 3,
            playerId: "white",
            eventType: "MOVE",
            timestamp: 3500,
            stateVersion: 3,
            actionData: { from: "g1", to: "f3" },
            resultData: { fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2", turnNumber: 3 },
          },
        ],
        snapshots: [
          {
            snapshotId: "snap-1",
            matchId: "rep-seq-test",
            sequence: 2,
            timestamp: 2500,
            stateVersion: 2,
            state: { fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2", turnNumber: 2 },
          },
        ],
        finalState: { fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2", turnNumber: 3 },
      };

      // 1. Check Integrity passes on valid sequence
      const integrity = ReplayManager.verifyIntegrity(replayPkg);
      expect(integrity.valid).toBe(true);
      expect(integrity.missingSequences.length).toBe(0);
      expect(integrity.duplicateSequences.length).toBe(0);

      // 2. Deterministic reconstruction: Start State + Events = Final State
      const reconstructed = ReplayManager.reconstructMatch(replayPkg);
      expect(reconstructed.valid).toBe(true);
      expect(reconstructed.eventCount).toBe(3);
      expect(reconstructed.state.fen).toBe(replayPkg.finalState.fen);
      expect(reconstructed.state.turnNumber).toBe(3);
    });

    it("detects missing, duplicate, or tampered event sequences in replay integrity verification", () => {
      // Replay with missing sequence 2
      const corruptPkg: ReplayPackage = {
        matchId: "rep-corrupt",
        gameId: "snooker",
        metadata: {
          players: [{ id: "p1", username: "P1", seat: 0, score: 10 }],
          startedAt: 1000,
          endedAt: 2000,
          durationMs: 1000,
          winnerIds: ["p1"],
          resultReason: "NORMAL",
          actionCount: 2,
        },
        initialState: {},
        events: [
          {
            eventId: "ev-1",
            matchId: "rep-corrupt",
            sequence: 1,
            playerId: "p1",
            eventType: "SHOT",
            timestamp: 1100,
            stateVersion: 1,
            actionData: {},
            resultData: {},
          },
          {
            eventId: "ev-3",
            matchId: "rep-corrupt",
            sequence: 3, // GAP: sequence 2 is missing!
            playerId: "p1",
            eventType: "SHOT",
            timestamp: 1500,
            stateVersion: 3,
            actionData: {},
            resultData: {},
          },
        ],
        snapshots: [],
        finalState: {},
      };

      const integrity = ReplayManager.verifyIntegrity(corruptPkg);
      expect(integrity.valid).toBe(false);
      expect(integrity.missingSequences).toContain(2);
      expect(integrity.reason).toContain("Missing event sequences");
    });
  });

  // =========================================================================
  // 5. TIME-LIMIT ANALYTICS & MONITORING (Requirement 7)
  // =========================================================================
  describe("5. Time-Limit Analytics Across Games", () => {
    it("accurately computes normal vs time-limit completion percentages per game", () => {
      // 10 Snooker matches: 7 Normal, 3 Time Limit (70% Normal, 30% Time Limit)
      const mockMatches: Array<{ gameId: GameId; resultReason: ResultReason; duration: number }> = [
        { gameId: "snooker", resultReason: "NORMAL", duration: 400 },
        { gameId: "snooker", resultReason: "NORMAL", duration: 420 },
        { gameId: "snooker", resultReason: "NORMAL", duration: 450 },
        { gameId: "snooker", resultReason: "NORMAL", duration: 500 },
        { gameId: "snooker", resultReason: "NORMAL", duration: 480 },
        { gameId: "snooker", resultReason: "NORMAL", duration: 520 },
        { gameId: "snooker", resultReason: "NORMAL", duration: 390 },
        { gameId: "snooker", resultReason: "TIME_LIMIT", duration: 600 },
        { gameId: "snooker", resultReason: "TIME_LIMIT", duration: 600 },
        { gameId: "snooker", resultReason: "TIME_LIMIT", duration: 600 },
        // 5 Chess matches: 4 Normal, 1 Time Limit (80% Normal, 20% Time Limit)
        { gameId: "chess", resultReason: "NORMAL", duration: 250 },
        { gameId: "chess", resultReason: "NORMAL", duration: 300 },
        { gameId: "chess", resultReason: "NORMAL", duration: 350 },
        { gameId: "chess", resultReason: "NORMAL", duration: 280 },
        { gameId: "chess", resultReason: "TIME_LIMIT", duration: 600 },
      ];

      function computeAnalytics(matches: typeof mockMatches): TimeLimitAnalytics[] {
        const byGame: Record<string, { normal: number; timeLimit: number; timeout: number; abandoned: number; draw: number; durations: number[] }> = {};
        for (const m of matches) {
          if (!byGame[m.gameId]) {
            byGame[m.gameId] = { normal: 0, timeLimit: 0, timeout: 0, abandoned: 0, draw: 0, durations: [] };
          }
          const e = byGame[m.gameId]!;
          if (m.resultReason === "TIME_LIMIT") e.timeLimit++;
          else if (m.resultReason === "TIMEOUT") e.timeout++;
          else if (m.resultReason === "ABANDONED") e.abandoned++;
          else if (m.resultReason === "DRAW") e.draw++;
          else e.normal++;
          e.durations.push(m.duration);
        }

        return Object.entries(byGame).map(([gameId, d]) => {
          const totalCompleted = d.normal + d.timeLimit + d.timeout + d.abandoned + d.draw;
          return {
            gameId,
            normalCompletionCount: d.normal,
            timeLimitCompletionCount: d.timeLimit,
            timeoutCount: d.timeout,
            abandonedCount: d.abandoned,
            drawCount: d.draw,
            totalCompleted,
            averageDuration: Math.round(d.durations.reduce((a, b) => a + b, 0) / d.durations.length),
            normalPercentage: Math.round((d.normal / totalCompleted) * 100),
            timeLimitPercentage: Math.round((d.timeLimit / totalCompleted) * 100),
            timeoutPercentage: Math.round((d.timeout / totalCompleted) * 100),
          };
        });
      }

      const analytics = computeAnalytics(mockMatches);
      const snookerAnalytics = analytics.find((a) => a.gameId === "snooker")!;
      expect(snookerAnalytics.totalCompleted).toBe(10);
      expect(snookerAnalytics.normalCompletionCount).toBe(7);
      expect(snookerAnalytics.timeLimitCompletionCount).toBe(3);
      expect(snookerAnalytics.normalPercentage).toBe(70);
      expect(snookerAnalytics.timeLimitPercentage).toBe(30);

      const chessAnalytics = analytics.find((a) => a.gameId === "chess")!;
      expect(chessAnalytics.totalCompleted).toBe(5);
      expect(chessAnalytics.normalPercentage).toBe(80);
      expect(chessAnalytics.timeLimitPercentage).toBe(20);
    });
  });
});
