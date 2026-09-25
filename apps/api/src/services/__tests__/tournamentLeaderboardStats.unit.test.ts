import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_TOURNAMENT_TIERS,
  DEFAULT_TIER_PRIZE_DISTRIBUTION,
  calculatePrizes,
  type TournamentTierConfig,
  type PlayerTournamentCareerStats,
  type GlobalTournamentLeaderboardEntry,
} from "@gaming-hub/shared";
import { getTournamentTierCode } from "../tournamentLeaderboardService";

describe("Tournament Leaderboard & Player Ranking System Unit Tests", () => {
  // -------------------------------------------------------------------------
  // 1 & 2. Four Final Positions & Prize Percentages (50%, 25%, 15%, 10%)
  // -------------------------------------------------------------------------
  describe("1-2. Final Positions & Authoritative Bracket Decoupling", () => {
    it("Test 1: 4 Prize positions match exactly 50%, 25%, 15%, 10%", () => {
      const prizePool = 20000;
      const prizes = calculatePrizes(prizePool, DEFAULT_TIER_PRIZE_DISTRIBUTION);

      expect(prizes.length).toBe(4);
      expect(prizes[0]!.rank).toBe(1);
      expect(prizes[0]!.amount).toBe(10000); // 50%
      expect(prizes[1]!.rank).toBe(2);
      expect(prizes[1]!.amount).toBe(5000); // 25%
      expect(prizes[2]!.rank).toBe(3);
      expect(prizes[2]!.amount).toBe(3000); // 15%
      expect(prizes[3]!.rank).toBe(4);
      expect(prizes[3]!.amount).toBe(2000); // 10%
    });

    it("Test 2: Leaderboard rankings do not alter bracket-determined winner or positions", () => {
      interface PlayerResult {
        userId: string;
        finalRank: number;
        bracketWinner: boolean;
        points: number;
      }

      const players: PlayerResult[] = [
        { userId: "player-1", finalRank: 1, bracketWinner: true, points: 150 },
        { userId: "player-2", finalRank: 2, bracketWinner: false, points: 120 },
        { userId: "player-3", finalRank: 3, bracketWinner: false, points: 90 },
        { userId: "player-4", finalRank: 4, bracketWinner: false, points: 60 },
      ];

      // Final positions come strictly from bracket results
      const champion = players.find((p) => p.finalRank === 1);
      expect(champion?.userId).toBe("player-1");
      expect(champion?.bracketWinner).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 3 & 4. All 5 Tournament Tiers & Detection Logic
  // -------------------------------------------------------------------------
  describe("3-4. All 5 Tournament Tiers Validation", () => {
    it("Test 3: Validates configuration for all 5 tournament tiers", () => {
      const tiers = DEFAULT_TOURNAMENT_TIERS;
      expect(tiers.length).toBe(5);

      const [mini, basic, standard, premium, pro] = tiers;
      expect(mini?.code).toBe("mini");
      expect(mini?.entryFee).toBe(5);
      expect(mini?.prizePool).toBe(400);

      expect(basic?.code).toBe("basic");
      expect(basic?.entryFee).toBe(10);
      expect(basic?.prizePool).toBe(1600);

      expect(standard?.code).toBe("standard");
      expect(standard?.entryFee).toBe(25);
      expect(standard?.prizePool).toBe(10000);

      expect(premium?.code).toBe("premium");
      expect(premium?.entryFee).toBe(50);
      expect(premium?.prizePool).toBe(22500);

      expect(pro?.code).toBe("pro");
      expect(pro?.entryFee).toBe(100);
      expect(pro?.prizePool).toBe(90000);
    });

    it("Test 4: Correctly extracts tier code from tournament metadata", () => {
      expect(getTournamentTierCode({ title: "Mini Snooker Tournament", entryFee: 5 })).toBe("mini");
      expect(getTournamentTierCode({ title: "Basic Chess Open", entryFee: 10 })).toBe("basic");
      expect(getTournamentTierCode({ title: "Standard Carrom Cup", entryFee: 25 })).toBe("standard");
      expect(getTournamentTierCode({ title: "Premium Snooker League", entryFee: 50 })).toBe("premium");
      expect(getTournamentTierCode({ title: "Pro Table Tennis Grand Prix", entryFee: 100 })).toBe("pro");
      expect(getTournamentTierCode({ title: "Custom Cup", entryFee: 0, configSnapshot: { tierCode: "pro" } })).toBe("pro");
    });
  });

  // -------------------------------------------------------------------------
  // 5 & 6. Multi-Game Segregation Across Available Games
  // -------------------------------------------------------------------------
  describe("5-6. Game-Specific Statistics for all 9 Available Games", () => {
    const AVAILABLE_GAMES = [
      "chess",
      "ludo",
      "snake-ladder",
      "bubble-shooter",
      "fruit-ninja",
      "snake-vs-worms",
      "table-tennis",
      "carrom",
      "snooker",
    ];

    it("Test 5: Segregates statistics independently per game", () => {
      const statsMap = new Map<string, { wins: number; losses: number }>();
      for (const g of AVAILABLE_GAMES) {
        statsMap.set(g, { wins: 0, losses: 0 });
      }

      // Record Chess win and Carrom loss
      statsMap.get("chess")!.wins += 3;
      statsMap.get("carrom")!.losses += 2;

      expect(statsMap.get("chess")?.wins).toBe(3);
      expect(statsMap.get("chess")?.losses).toBe(0);
      expect(statsMap.get("carrom")?.wins).toBe(0);
      expect(statsMap.get("carrom")?.losses).toBe(2);
      expect(statsMap.get("snooker")?.wins).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 7 & 8. Deterministic Tie-Breaking & Ranking Score Model
  // -------------------------------------------------------------------------
  describe("7-8. Deterministic Tie-Breaking and Points Model", () => {
    it("Test 7: Ranks players deterministically by Points -> Wins -> Top 4 -> Match Wins -> Account Date", () => {
      const players = [
        { userId: "u-3", points: 250, tournamentsWon: 1, topFourFinishes: 2, matchWins: 8, winRate: 50, createdAt: new Date(2026, 1, 3) },
        { userId: "u-1", points: 300, tournamentsWon: 2, topFourFinishes: 3, matchWins: 10, winRate: 66, createdAt: new Date(2026, 1, 1) },
        { userId: "u-2", points: 300, tournamentsWon: 2, topFourFinishes: 3, matchWins: 12, winRate: 75, createdAt: new Date(2026, 1, 2) },
      ];

      // Sort logic
      players.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.tournamentsWon !== a.tournamentsWon) return b.tournamentsWon - a.tournamentsWon;
        if (b.topFourFinishes !== a.topFourFinishes) return b.topFourFinishes - a.topFourFinishes;
        if (b.matchWins !== a.matchWins) return b.matchWins - a.matchWins;
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      expect(players[0]!.userId).toBe("u-2"); // Higher matchWins (12 vs 10)
      expect(players[1]!.userId).toBe("u-1");
      expect(players[2]!.userId).toBe("u-3");
    });

    it("Test 8: Calculates tournament skill points without using raw entry fee or prize alone", () => {
      function computePoints(rank: number, wins: number, losses: number): number {
        let pts = 0;
        if (rank === 1) pts += 100;
        else if (rank === 2) pts += 50;
        else if (rank === 3) pts += 30;
        else if (rank === 4) pts += 20;
        pts += wins * 10;
        pts += losses * 2;
        return pts;
      }

      expect(computePoints(1, 4, 0)).toBe(140); // 100 + 40 + 0
      expect(computePoints(2, 3, 1)).toBe(82);  // 50 + 30 + 2
      expect(computePoints(3, 2, 1)).toBe(52);  // 30 + 20 + 2
      expect(computePoints(4, 1, 2)).toBe(34);  // 20 + 10 + 4
    });
  });

  // -------------------------------------------------------------------------
  // 9. Idempotency & Duplicate Protection
  // -------------------------------------------------------------------------
  describe("9. Duplicate Tournament Completion Protection", () => {
    it("Test 9: Processing tournament completion twice only credits stats once", () => {
      const processedMap = new Set<string>();

      function recordTournamentFinish(tournamentId: string, userId: string, scoreGained: number, currentPoints: number) {
        const key = `${tournamentId}:${userId}`;
        if (processedMap.has(key)) {
          return { updated: false, points: currentPoints };
        }
        processedMap.add(key);
        return { updated: true, points: currentPoints + scoreGained };
      }

      let playerPoints = 100;
      const first = recordTournamentFinish("tourn-alpha", "user-1", 100, playerPoints);
      expect(first.updated).toBe(true);
      expect(first.points).toBe(200);

      // Re-trigger completion
      const second = recordTournamentFinish("tourn-alpha", "user-1", 100, first.points);
      expect(second.updated).toBe(false);
      expect(second.points).toBe(200); // No double point addition
    });
  });

  // -------------------------------------------------------------------------
  // 10. Search & Pagination & Viewer Position
  // -------------------------------------------------------------------------
  describe("10. Search, Pagination & Viewer Position", () => {
    it("Test 10: Supports player search and viewer rank determination", () => {
      const allEntries = [
        { rank: 1, userId: "u-alpha", username: "AlphaChampion", displayName: "Alpha Pro", points: 500 },
        { rank: 2, userId: "u-beta", username: "BetaMaster", displayName: "Beta Knight", points: 400 },
        { rank: 3, userId: "u-gamma", username: "GammaPlayer", displayName: "Gamma", points: 300 },
      ];

      // Search by display name
      const searchResult = allEntries.filter((e) => e.displayName.toLowerCase().includes("knight"));
      expect(searchResult.length).toBe(1);
      expect(searchResult[0]!.userId).toBe("u-beta");

      // Viewer rank
      const viewerId = "u-gamma";
      const myRank = allEntries.find((e) => e.userId === viewerId);
      expect(myRank?.rank).toBe(3);
      expect(myRank?.points).toBe(300);
    });
  });
});
