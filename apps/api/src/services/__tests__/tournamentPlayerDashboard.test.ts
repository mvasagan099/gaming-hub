import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import {
  getPlayerTournamentsList,
  getPlayerTournamentDashboard,
} from "../tournamentPlayerDashboard";
import {
  buildSingleEliminationBracket,
  processMatchResult,
} from "../tournamentEngine";

describe("COMPLETE PLAYER-SIDE TOURNAMENT DASHBOARD", () => {
  const createdTournamentIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdMatchIds: string[] = [];

  async function createTestPlayer(displayName: string, emailPrefix: string) {
    const id = `u_pd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const rand = Math.random().toString(36).slice(2, 10);
    createdUserIds.push(id);

    const user = await prisma.user.create({
      data: {
        id,
        email: `${emailPrefix}_${Date.now().toString(36)}_${rand}@gaminghub.test`,
        username: `usr_${Date.now().toString(36)}_${rand}`,
        displayName,
        role: "USER",
        profile: { create: {} },
        wallet: { create: { balance: 5000 } },
      },
    });

    return user;
  }

  async function createTestTournament(params: {
    title: string;
    gameId: string;
    playerCount: number;
    maxPlayers?: number;
    status?: "DRAFT" | "REGISTRATION_OPEN" | "IN_PROGRESS" | "COMPLETED";
  }) {
    const tournamentId = `tourn_pd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    createdTournamentIds.push(tournamentId);

    const tournament = await prisma.tournament.create({
      data: {
        id: tournamentId,
        title: params.title,
        description: `${params.title} description`,
        gameId: params.gameId,
        format: "SINGLE_ELIMINATION",
        seedMethod: "ADMIN_DEFINED",
        status: params.status ?? "IN_PROGRESS",
        entryFee: 50,
        prizePool: 5000,
        grossPool: 5000,
        minPlayers: 2,
        maxPlayers: params.maxPlayers ?? params.playerCount,
        startTime: new Date(Date.now() - 600_000),
        registrationStartsAt: new Date(Date.now() - 3600_000),
        registrationEndsAt: new Date(Date.now() - 1800_000),
      },
    });

    const players = [];
    for (let i = 0; i < params.playerCount; i++) {
      const p = await createTestPlayer(`Player ${i + 1}`, `pd_p${i + 1}`);
      await prisma.tournamentPlayer.create({
        data: {
          tournamentId,
          userId: p.id,
          seed: i + 1,
          registeredAt: new Date(Date.now() - (params.playerCount - i) * 1000),
        },
      });
      players.push(p);
    }

    return { tournament, players };
  }

  afterEach(async () => {
    if (createdTournamentIds.length > 0) {
      await prisma.tournamentResultIdempotency.deleteMany({
        where: { tournamentId: { in: createdTournamentIds } },
      }).catch(() => undefined);
      await prisma.tournamentPrize.deleteMany({
        where: { tournamentId: { in: createdTournamentIds } },
      }).catch(() => undefined);
      await prisma.tournamentRound.deleteMany({
        where: { tournamentId: { in: createdTournamentIds } },
      }).catch(() => undefined);
      await prisma.tournamentPlayer.deleteMany({
        where: { tournamentId: { in: createdTournamentIds } },
      }).catch(() => undefined);
      await prisma.tournament.deleteMany({
        where: { id: { in: createdTournamentIds } },
      }).catch(() => undefined);
      createdTournamentIds.length = 0;
    }

    if (createdMatchIds.length > 0) {
      await prisma.matchPlayer.deleteMany({
        where: { matchId: { in: createdMatchIds } },
      }).catch(() => undefined);
      await prisma.match.deleteMany({
        where: { id: { in: createdMatchIds } },
      }).catch(() => undefined);
      createdMatchIds.length = 0;
    }

    if (createdUserIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { actorId: { in: createdUserIds } },
      }).catch(() => undefined);
      await prisma.transaction.deleteMany({
        where: { userId: { in: createdUserIds } },
      }).catch(() => undefined);
      await prisma.wallet.deleteMany({
        where: { userId: { in: createdUserIds } },
      }).catch(() => undefined);
      await prisma.profile.deleteMany({
        where: { userId: { in: createdUserIds } },
      }).catch(() => undefined);
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  // ===========================================================================
  // 1. Player My Tournaments List
  // ===========================================================================
  describe("1. Player My Tournaments List", () => {
    it("returns player's registered tournaments with exact sequence order, seed, and match state", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Snooker Masters Cup",
        gameId: "snooker",
        playerCount: 4,
        status: "IN_PROGRESS",
      });

      await buildSingleEliminationBracket(tournament.id);

      const list = await getPlayerTournamentsList(players[0].id);

      expect(list.length).toBeGreaterThanOrEqual(1);
      const myTourn = list.find((t) => t.tournamentId === tournament.id);

      expect(myTourn).toBeDefined();
      expect(myTourn?.title).toBe("Snooker Masters Cup");
      expect(myTourn?.gameId).toBe("snooker");
      expect(myTourn?.myRegistrationSequence).toBe(1);
      expect(myTourn?.mySeed).toBe(1);
      expect(myTourn?.registeredPlayers).toBe(4);
      expect(myTourn?.totalRounds).toBe(2);
      expect(myTourn?.myCurrentMatch).toBeDefined();
      expect(myTourn?.myCurrentMatch?.roundNumber).toBe(1);
      expect(myTourn?.myStatus).toBe("MATCH_READY");
    });
  });

  // ===========================================================================
  // 2. Detailed Tournament Dashboard
  // ===========================================================================
  describe("2. Detailed Player Tournament Dashboard", () => {
    it("returns comprehensive dashboard with round progression, opponent info, and match history", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Carrom Championship Cup",
        gameId: "carrom",
        playerCount: 2,
        status: "IN_PROGRESS",
      });

      await buildSingleEliminationBracket(tournament.id);

      const dashboard = await getPlayerTournamentDashboard(tournament.id, players[0].id);

      expect(dashboard.tournament.id).toBe(tournament.id);
      expect(dashboard.tournament.title).toBe("Carrom Championship Cup");
      expect(dashboard.tournament.gameId).toBe("carrom");
      expect(dashboard.player.userId).toBe(players[0].id);
      expect(dashboard.player.seed).toBe(1);
      expect(dashboard.player.registrationSequence).toBe(1);
      expect(dashboard.myCurrentMatch).toBeDefined();
      expect(dashboard.myCurrentMatch?.roundNumber).toBe(1);
      expect(dashboard.myCurrentMatch?.opponent?.userId).toBe(players[1].id);
      expect(dashboard.roundProgress).toHaveLength(1);
      expect(dashboard.roundProgress[0].name).toBe("Final");
      expect(dashboard.myPathSlotIds.length).toBeGreaterThan(0);
    });

    it("rejects non-registered player with FORBIDDEN error", async () => {
      const { tournament } = await createTestTournament({
        title: "Chess Closed Cup",
        gameId: "chess",
        playerCount: 2,
        status: "IN_PROGRESS",
      });

      const outsider = await createTestPlayer("Outsider Player", "outsider");

      await expect(
        getPlayerTournamentDashboard(tournament.id, outsider.id),
      ).rejects.toThrow("You are not registered in this tournament");
    });
  });

  // ===========================================================================
  // 3. Match Progression & History in Dashboard
  // ===========================================================================
  describe("3. Match Progression & History", () => {
    it("captures completed match history, duration, winner celebration, and tournament statistics", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Fruit Ninja Finals",
        gameId: "fruit-ninja",
        playerCount: 2,
        status: "IN_PROGRESS",
      });

      await buildSingleEliminationBracket(tournament.id);
      const initialDash = await getPlayerTournamentDashboard(tournament.id, players[0].id);
      const slotId = initialDash.myCurrentMatch!.slotId;

      // Complete the match with player 0 winning
      const match = await prisma.match.create({
        data: {
          gameId: "fruit-ninja",
          status: "FINISHED",
          winnerIds: [players[0].id],
          resultReason: "NORMAL",
          startedAt: new Date(Date.now() - 300_000),
          endedAt: new Date(Date.now() - 60_000),
        },
      });
      createdMatchIds.push(match.id);

      await prisma.tournamentRound.update({
        where: { id: slotId },
        data: {
          matchId: match.id,
          status: "COMPLETED",
          winnerId: players[0].id,
          playerAScore: 150,
          playerBScore: 120,
        },
      });

      await prisma.tournamentPlayer.update({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: players[0].id } },
        data: { finalRank: 1 },
      });
      await prisma.tournamentPlayer.update({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: players[1].id } },
        data: { eliminated: true, eliminatedInRound: 1, finalRank: 2 },
      });
      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { status: "COMPLETED" },
      });

      // Fetch dashboard for winner
      const winnerDash = await getPlayerTournamentDashboard(tournament.id, players[0].id);
      expect(winnerDash.player.status).toBe("WINNER");
      expect(winnerDash.stats.wins).toBe(1);
      expect(winnerDash.stats.winRate).toBe(100);
      expect(winnerDash.myMatchHistory).toHaveLength(1);
      expect(winnerDash.myMatchHistory[0].result).toBe("WIN");
      expect(winnerDash.myMatchHistory[0].myScore).toBe(150);
      expect(winnerDash.myMatchHistory[0].opponentScore).toBe(120);

      // Fetch dashboard for eliminated loser
      const loserDash = await getPlayerTournamentDashboard(tournament.id, players[1].id);
      expect(loserDash.player.status).toBe("ELIMINATED");
      expect(loserDash.stats.losses).toBe(1);
      expect(loserDash.myMatchHistory[0].result).toBe("LOSS");
    });
  });
});
