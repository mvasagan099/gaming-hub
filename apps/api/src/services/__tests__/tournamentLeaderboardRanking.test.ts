import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@gaming-hub/db";
import { TournamentLeaderboardService } from "../tournamentLeaderboardService";
import {
  startTournament,
  finalizeTournament,
} from "../tournamentEngine";

describe("TOURNAMENT LEADERBOARD & PLAYER RANKING SYSTEM", () => {
  const createdUserIds: string[] = [];
  const createdTournamentIds: string[] = [];

  const ALL_10_GAMES = [
    "snake_and_ladder",
    "ludo",
    "chess",
    "fruit_ninja",
    "bubble_shooter",
    "table_tennis",
    "snake_vs_worms",
    "cricket",
    "carrom",
    "snooker",
  ];

  async function createTestUser(prefix = "lb_user") {
    const id = `u_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const username = `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
    const user = await prisma.user.create({
      data: {
        id,
        username,
        displayName: `Player ${username}`,
        email: `${username}@gaminghub.test`,
        role: "USER",
        profile: {
          create: {
            coins: 50000,
          },
        },
        wallet: {
          create: {
            balance: 50000,
          },
        },
      },
      include: { profile: true, wallet: true },
    });
    createdUserIds.push(user.id);
    return user;
  }

  async function createTestTournament(params: {
    title?: string;
    gameId?: string;
    prizePool?: number;
    entryFee?: number;
    playerCount?: number;
  }) {
    const {
      title = "Championship Leaderboard Cup",
      gameId = "chess",
      prizePool = 10000,
      entryFee = 100,
      playerCount = 4,
    } = params;

    const id = `tourn_lb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tournament = await prisma.tournament.create({
      data: {
        id,
        title,
        description: "Competitive Tournament for Leaderboard Verification",
        gameId,
        format: "SINGLE_ELIMINATION",
        status: "REGISTRATION_CLOSED",
        prizePool,
        grossPool: prizePool,
        entryFee,
        minPlayers: 2,
        maxPlayers: 128,
        startTime: new Date(Date.now() + 60000),
        prizeDistribution: [
          { rank: 1, percentage: 60 },
          { rank: 2, percentage: 30 },
          { rank: 3, percentage: 10 },
        ],
      },
    });
    createdTournamentIds.push(tournament.id);

    const players = [];
    for (let i = 0; i < playerCount; i++) {
      const user = await createTestUser(`p${i + 1}`);
      const tp = await prisma.tournamentPlayer.create({
        data: {
          tournamentId: tournament.id,
          userId: user.id,
          seed: i + 1,
          liveStatus: "REGISTERED",
          currentRound: 1,
        },
      });
      players.push({ user, tp });
    }

    return { tournament, players };
  }

  afterEach(async () => {
    for (const tId of createdTournamentIds) {
      await prisma.tournamentRound.deleteMany({ where: { tournamentId: tId } }).catch(() => undefined);
      await prisma.tournamentPlayer.deleteMany({ where: { tournamentId: tId } }).catch(() => undefined);
      await prisma.tournamentPrize.deleteMany({ where: { tournamentId: tId } }).catch(() => undefined);
      await prisma.tournamentDispute.deleteMany({ where: { tournamentId: tId } }).catch(() => undefined);
      await prisma.tournamentResultSnapshot.deleteMany({ where: { tournamentId: tId } }).catch(() => undefined);
      await prisma.tournamentResultIdempotency.deleteMany({ where: { tournamentId: tId } }).catch(() => undefined);
      await prisma.tournament.delete({ where: { id: tId } }).catch(() => undefined);
    }
    for (const uId of createdUserIds) {
      await prisma.playerGameStats.deleteMany({ where: { userId: uId } }).catch(() => undefined);
      await prisma.playerStatistic.deleteMany({ where: { userId: uId } }).catch(() => undefined);
      await prisma.transaction.deleteMany({ where: { userId: uId } }).catch(() => undefined);
      await prisma.wallet.deleteMany({ where: { userId: uId } }).catch(() => undefined);
      await prisma.profile.deleteMany({ where: { userId: uId } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: uId } }).catch(() => undefined);
    }
  });

  // =========================================================================
  // 1. Authoritative Match Completion & Leaderboard Stats Update
  // =========================================================================
  describe("1. Authoritative Match Completion & Leaderboard Stats Update", () => {
    it("updates matches played, wins, losses, points, score differential, and statuses on match complete", async () => {
      const { tournament, players } = await createTestTournament({ playerCount: 4 });
      await startTournament(tournament.id);

      const round1Slot = await prisma.tournamentRound.findFirst({
        where: { tournamentId: tournament.id, roundNumber: 1 },
      });
      expect(round1Slot).toBeDefined();

      const winner = players[0].user;
      const loser = players[1].user;
      const matchId = `match-lb-${Date.now()}`;

      await TournamentLeaderboardService.updateOnMatchComplete({
        tournamentId: tournament.id,
        matchId,
        roundId: round1Slot!.id,
        roundNumber: 1,
        winnerId: winner.id,
        loserId: loser.id,
        winnerScore: 100,
        loserScore: 40,
      });

      // Verify winner player stats
      const updatedWinner = await prisma.tournamentPlayer.findUnique({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: winner.id } },
      });
      expect(updatedWinner?.wins).toBe(1);
      expect(updatedWinner?.losses).toBe(0);
      expect(updatedWinner?.matchesPlayed).toBe(1);
      expect(updatedWinner?.points).toBe(3);
      expect(updatedWinner?.scoreFor).toBe(100);
      expect(updatedWinner?.scoreAgainst).toBe(40);
      expect(updatedWinner?.liveStatus).toBe("ADVANCED");
      expect(updatedWinner?.currentRound).toBe(2);

      // Verify loser player stats
      const updatedLoser = await prisma.tournamentPlayer.findUnique({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: loser.id } },
      });
      expect(updatedLoser?.wins).toBe(0);
      expect(updatedLoser?.losses).toBe(1);
      expect(updatedLoser?.matchesPlayed).toBe(1);
      expect(updatedLoser?.points).toBe(0);
      expect(updatedLoser?.scoreFor).toBe(40);
      expect(updatedLoser?.scoreAgainst).toBe(100);
      expect(updatedLoser?.liveStatus).toBe("ELIMINATED");
      expect(updatedLoser?.eliminated).toBe(true);
      expect(updatedLoser?.eliminatedInRound).toBe(1);
    });
  });

  // =========================================================================
  // 2. Idempotent Match Processing
  // =========================================================================
  describe("2. Idempotency & Protection Against Replays", () => {
    it("does not mutate leaderboard standings if tournament is already finalized", async () => {
      const { tournament, players } = await createTestTournament({ playerCount: 2 });
      await startTournament(tournament.id);

      const p1 = players[0].user;
      const p2 = players[1].user;

      const slot = await prisma.tournamentRound.findFirst({
        where: { tournamentId: tournament.id, roundNumber: 1 },
      });

      // Match 1
      await TournamentLeaderboardService.updateOnMatchComplete({
        tournamentId: tournament.id,
        matchId: `m-final-${Date.now()}`,
        roundId: slot!.id,
        roundNumber: 1,
        winnerId: p1.id,
        loserId: p2.id,
        winnerScore: 50,
        loserScore: 20,
      });

      // Complete round slot in DB
      await prisma.tournamentRound.update({
        where: { id: slot!.id },
        data: { winnerId: p1.id, status: "COMPLETED" },
      });

      // Finalize tournament
      await finalizeTournament(tournament.id);

      const postFinalWinner = await prisma.tournamentPlayer.findUnique({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: p1.id } },
      });
      expect(postFinalWinner?.finalRank).toBe(1);
      expect(postFinalWinner?.liveStatus).toBe("CHAMPION");

      // Attempt replay after tournament finished
      await TournamentLeaderboardService.updateOnMatchComplete({
        tournamentId: tournament.id,
        matchId: `m-final-replay-${Date.now()}`,
        roundId: slot!.id,
        roundNumber: 1,
        winnerId: p1.id,
        loserId: p2.id,
        winnerScore: 50,
        loserScore: 20,
      });

      const afterReplayWinner = await prisma.tournamentPlayer.findUnique({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: p1.id } },
      });
      // Standings and stats must remain untouched
      expect(afterReplayWinner?.wins).toBe(1);
      expect(afterReplayWinner?.points).toBe(3);
    });
  });

  // =========================================================================
  // 3. Knockout Tie-Breaking & Multi-Round Standings
  // =========================================================================
  describe("3. Knockout Standings & Tie-Breaking", () => {
    it("orders standings by round reached, points, score differential, and seed", async () => {
      const { tournament, players } = await createTestTournament({ playerCount: 4 });
      await startTournament(tournament.id);

      const [p1, p2, p3, p4] = players.map((p) => p.user);

      const slots = await prisma.tournamentRound.findMany({
        where: { tournamentId: tournament.id, roundNumber: 1 },
        orderBy: { matchNumber: "asc" },
      });

      // Semifinal 1: P1 beats P2 (Score: 100 - 80)
      await TournamentLeaderboardService.updateOnMatchComplete({
        tournamentId: tournament.id,
        matchId: `m-semi-1-${Date.now()}`,
        roundId: slots[0].id,
        roundNumber: 1,
        winnerId: p1.id,
        loserId: p2.id,
        winnerScore: 100,
        loserScore: 80,
      });

      // Semifinal 2: P3 beats P4 (Score: 100 - 30)
      await TournamentLeaderboardService.updateOnMatchComplete({
        tournamentId: tournament.id,
        matchId: `m-semi-2-${Date.now()}`,
        roundId: slots[1].id,
        roundNumber: 1,
        winnerId: p3.id,
        loserId: p4.id,
        winnerScore: 100,
        loserScore: 30,
      });

      const leaderboard = await TournamentLeaderboardService.getTournamentLeaderboard(tournament.id, {
        page: 1,
        pageSize: 10,
      });

      expect(leaderboard.standings.length).toBe(4);

      // P1 and P3 advanced (Rank 1 and 2)
      const top2 = leaderboard.standings.slice(0, 2);
      expect(top2.map((s) => s.userId)).toContain(p1.id);
      expect(top2.map((s) => s.userId)).toContain(p3.id);

      // P2 and P4 eliminated: P2 has diff -20, P4 has diff -70 -> P2 ranks ahead of P4
      const bottom2 = leaderboard.standings.slice(2, 4);
      expect(bottom2[0].userId).toBe(p2.id);
      expect(bottom2[1].userId).toBe(p4.id);
    });
  });

  // =========================================================================
  // 4. "My Rank", Search & Pagination
  // =========================================================================
  describe("4. 'My Rank', Search & Pagination", () => {
    it("returns viewer rank, supports player name search and pagination", async () => {
      const { tournament, players } = await createTestTournament({ playerCount: 4 });
      await startTournament(tournament.id);

      const viewer = players[2].user;

      // 1. Viewer Rank
      const res = await TournamentLeaderboardService.getTournamentLeaderboard(tournament.id, {
        viewerId: viewer.id,
        page: 1,
        pageSize: 2,
      });

      expect(res.myRank).toBeDefined();
      expect(res.myRank?.rank).toBeGreaterThanOrEqual(1);
      expect(res.standings.length).toBe(2);
      expect(res.total).toBe(4);

      // 2. Search by player username
      const searchRes = await TournamentLeaderboardService.getTournamentLeaderboard(tournament.id, {
        search: viewer.username,
      });
      expect(searchRes.standings.length).toBe(1);
      expect(searchRes.standings[0].userId).toBe(viewer.id);
    });
  });

  // =========================================================================
  // 5. Admin Result Correction & Recalculation
  // =========================================================================
  describe("5. Admin Result Correction & Recalculation", () => {
    it("corrects match winner and recalculates standings authoritatively with audit log", async () => {
      const { tournament, players } = await createTestTournament({ playerCount: 2 });
      await startTournament(tournament.id);

      const [p1, p2] = players.map((p) => p.user);
      const matchId = `match-corr-${Date.now()}`;

      const slot = await prisma.tournamentRound.findFirst({
        where: { tournamentId: tournament.id, roundNumber: 1 },
      });

      // Update match with p1 as initial winner
      await prisma.tournamentRound.update({
        where: { id: slot!.id },
        data: { matchId, winnerId: p1.id, status: "COMPLETED" },
      });

      await TournamentLeaderboardService.updateOnMatchComplete({
        tournamentId: tournament.id,
        matchId,
        roundId: slot!.id,
        roundNumber: 1,
        winnerId: p1.id,
        loserId: p2.id,
        winnerScore: 50,
        loserScore: 30,
      });

      // Admin corrects result in favor of p2
      const correctionResult = await TournamentLeaderboardService.correctMatchAndRecalculate({
        tournamentId: tournament.id,
        matchId,
        adminId: "admin-super-1",
        reason: "Opponent connection cheat confirmed by referee logs",
        newWinnerId: p2.id,
        newScores: { [p2.id]: 60 },
      });

      expect(correctionResult.ok).toBe(true);

      const p2Player = await prisma.tournamentPlayer.findUnique({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: p2.id } },
      });
      expect(p2Player?.eliminated).toBe(false);
      expect(p2Player?.liveStatus).toBe("ADVANCED");

      const p1Player = await prisma.tournamentPlayer.findUnique({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: p1.id } },
      });
      expect(p1Player?.eliminated).toBe(true);
      expect(p1Player?.liveStatus).toBe("ELIMINATED");
    });
  });

  // =========================================================================
  // 6. Player Career Profile Statistics
  // =========================================================================
  describe("6. Player Career Profile Statistics", () => {
    it("aggregates tournament wins, appearances, finals, top 3, and win rate from completed tournaments", async () => {
      const user = await createTestUser("career_hero");

      // Tournament 1: Won Champion (#1)
      const t1 = await createTestTournament({ playerCount: 2 });
      const tp1 = await prisma.tournamentPlayer.create({
        data: {
          tournamentId: t1.tournament.id,
          userId: user.id,
          finalRank: 1,
          matchesPlayed: 3,
          wins: 3,
          losses: 0,
          points: 9,
        },
      });
      await prisma.tournamentPrize.create({
        data: {
          tournamentId: t1.tournament.id,
          userId: user.id,
          playerId: tp1.id,
          rank: 1,
          amount: 6000,
          status: "COMPLETED",
        },
      });
      await prisma.tournament.update({
        where: { id: t1.tournament.id },
        data: { status: "COMPLETED" },
      });

      // Tournament 2: Runner-up (#2)
      const t2 = await createTestTournament({ playerCount: 2 });
      const tp2 = await prisma.tournamentPlayer.create({
        data: {
          tournamentId: t2.tournament.id,
          userId: user.id,
          finalRank: 2,
          matchesPlayed: 3,
          wins: 2,
          losses: 1,
          points: 6,
        },
      });
      await prisma.tournamentPrize.create({
        data: {
          tournamentId: t2.tournament.id,
          userId: user.id,
          playerId: tp2.id,
          rank: 2,
          amount: 3000,
          status: "COMPLETED",
        },
      });
      await prisma.tournament.update({
        where: { id: t2.tournament.id },
        data: { status: "COMPLETED" },
      });

      // Fetch career stats
      const career = await TournamentLeaderboardService.getPlayerCareerStats(user.id);

      expect(career.tournamentAppearances).toBe(2);
      expect(career.tournamentWins).toBe(1);
      expect(career.finalsReached).toBe(2);
      expect(career.topThreeFinishes).toBe(2);
      expect(career.winRate).toBe(50.0); // 1 win / 2 tournaments = 50%
      expect(career.totalPrizesWon).toBe(9000);
      expect(career.bestRank).toBe(1);
    });
  });

  // =========================================================================
  // 7. All 10 Competitive Multiplayer Games Compatibility
  // =========================================================================
  describe("7. Game-Specific Isolation Across All 10 Games", () => {
    ALL_10_GAMES.forEach((gameId) => {
      it(`tracks and isolates game rankings for: ${gameId}`, async () => {
        const { tournament, players } = await createTestTournament({ gameId, playerCount: 2 });
        await startTournament(tournament.id);

        const champ = players[0].user;

        const slot = await prisma.tournamentRound.findFirst({
          where: { tournamentId: tournament.id, roundNumber: 1 },
        });

        await prisma.tournamentRound.update({
          where: { id: slot!.id },
          data: { winnerId: champ.id, status: "COMPLETED" },
        });

        await finalizeTournament(tournament.id);

        const gameRankings = await TournamentLeaderboardService.getGameTournamentRankings(gameId, {
          page: 1,
          pageSize: 10,
        });

        expect(gameRankings.items.length).toBeGreaterThanOrEqual(1);
        const topRank = gameRankings.items.find((it) => it.userId === champ.id);
        expect(topRank).toBeDefined();
        expect(topRank?.gameId).toBe(gameId);
        expect(topRank?.tournamentsWon).toBe(1);
      });
    });
  });
});
