import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import {
  getTournamentControlCenterData,
  overrideTournamentMatchResult,
} from "../tournamentAdminControlCenter";
import {
  buildSingleEliminationBracket,
  processMatchResult,
} from "../tournamentEngine";

describe("TOURNAMENT ADMIN CONTROL CENTER", () => {
  const createdTournamentIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdMatchIds: string[] = [];

  async function createTestPlayer(displayName: string, emailPrefix: string) {
    const id = `u_cc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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
        wallet: { create: { balance: 10000 } },
      },
    });

    return user;
  }

  async function createTestTournament(params: {
    title: string;
    gameId: string;
    playerCount: number;
    maxPlayers?: number;
  }) {
    const tournamentId = `tourn_cc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    createdTournamentIds.push(tournamentId);

    const tournament = await prisma.tournament.create({
      data: {
        id: tournamentId,
        title: params.title,
        description: `${params.title} description`,
        gameId: params.gameId,
        format: "SINGLE_ELIMINATION",
        seedMethod: "ADMIN_DEFINED",
        status: "IN_PROGRESS",
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
      const p = await createTestPlayer(`Player ${i + 1}`, `cc_p${i + 1}`);
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
  // 1. Control Center Overview & KPI Aggregates
  // ===========================================================================
  describe("1. Tournament Overview & KPI Aggregates", () => {
    it("returns accurate summary metrics, available slots, rounds, and match counts", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Snooker Control Center Cup",
        gameId: "snooker",
        playerCount: 4,
        maxPlayers: 8,
      });

      await buildSingleEliminationBracket(tournament.id);

      const data = await getTournamentControlCenterData(tournament.id);

      expect(data.tournament.id).toBe(tournament.id);
      expect(data.tournament.title).toBe("Snooker Control Center Cup");
      expect(data.tournament.gameId).toBe("snooker");
      expect(data.summary.maxPlayers).toBe(8);
      expect(data.summary.registeredPlayers).toBe(4);
      expect(data.summary.availableSlots).toBe(4); // 8 - 4 = 4
      expect(data.summary.minPlayers).toBe(2);
      expect(data.summary.totalRounds).toBe(2);
      expect(data.summary.remainingPlayers).toBe(4);
      expect(data.summary.eliminatedPlayers).toBe(0);
      expect(data.summary.healthStatus).toBe("HEALTHY");
      expect(data.matches.length).toBe(3); // 2 in R1, 1 in R2
    });
  });

  // ===========================================================================
  // 2. Authoritative Registration Sequence Order
  // ===========================================================================
  describe("2. Authoritative Registration Sequence Order", () => {
    it("returns registered players in exact registration order (#1, #2, #3, ...) without client timestamp dependency", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Chess Registration Order Test",
        gameId: "chess",
        playerCount: 3,
        maxPlayers: 4,
      });

      const data = await getTournamentControlCenterData(tournament.id);

      expect(data.players).toHaveLength(3);
      expect(data.players[0].registrationSequence).toBe(1);
      expect(data.players[0].userId).toBe(players[0].id);

      expect(data.players[1].registrationSequence).toBe(2);
      expect(data.players[1].userId).toBe(players[1].id);

      expect(data.players[2].registrationSequence).toBe(3);
      expect(data.players[2].userId).toBe(players[2].id);
    });
  });

  // ===========================================================================
  // 3. Emergency Administrative Match Result Override
  // ===========================================================================
  describe("3. Emergency Match Result Override", () => {
    it("applies audited result override, advances winner, and eliminates loser", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Carrom Override Test",
        gameId: "carrom",
        playerCount: 2,
      });

      await buildSingleEliminationBracket(tournament.id);
      const dataBefore = await getTournamentControlCenterData(tournament.id);
      const r1Slot = dataBefore.matches[0];

      const adminUser = await createTestPlayer("Super Admin", "admin_cc");

      // Execute emergency override
      await overrideTournamentMatchResult({
        tournamentId: tournament.id,
        slotId: r1Slot.slotId,
        winnerId: players[1].id, // Pick Player 2
        reason: "Player 1 experienced verified disconnect during power outage",
        adminId: adminUser.id,
      });

      // Verify slot is updated
      const dataAfter = await getTournamentControlCenterData(tournament.id);
      const updatedSlot = dataAfter.matches.find((m) => m.slotId === r1Slot.slotId);

      expect(updatedSlot?.status).toBe("COMPLETED");
      expect(updatedSlot?.winnerId).toBe(players[1].id);

      // Verify loser is eliminated
      const p1 = dataAfter.players.find((p) => p.userId === players[0].id);
      expect(p1?.eliminated).toBe(true);

      // Verify audit trail entry was recorded
      expect(dataAfter.auditLogs.some((l) => l.action === "tournament.admin_result_override")).toBe(true);
    });

    it("rejects result override when reason is invalid or winner is not in the slot", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Cricket Override Reject Test",
        gameId: "cricket",
        playerCount: 2,
      });

      await buildSingleEliminationBracket(tournament.id);
      const data = await getTournamentControlCenterData(tournament.id);
      const r1Slot = data.matches[0];

      const adminUser = await createTestPlayer("Super Admin", "admin_reject");

      // Short reason rejection
      await expect(
        overrideTournamentMatchResult({
          tournamentId: tournament.id,
          slotId: r1Slot.slotId,
          winnerId: players[0].id,
          reason: "no",
          adminId: adminUser.id,
        }),
      ).rejects.toThrow("valid reason of at least 5 characters");

      // Invalid player rejection
      await expect(
        overrideTournamentMatchResult({
          tournamentId: tournament.id,
          slotId: r1Slot.slotId,
          winnerId: "fake_user_id",
          reason: "Testing invalid player",
          adminId: adminUser.id,
        }),
      ).rejects.toThrow("Winner must be one of the assigned players");
    });
  });

  // ===========================================================================
  // 4. Time-Limit Cap Analytics Calculation
  // ===========================================================================
  describe("4. Time-Limit Cap Analytics", () => {
    it("computes accurate time limit vs normal completion percentages", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Snooker Time Limit Analytics",
        gameId: "snooker",
        playerCount: 4,
      });

      await buildSingleEliminationBracket(tournament.id);
      const data = await getTournamentControlCenterData(tournament.id);
      const r1Slot1 = data.matches[0];

      // Simulate a completed match with MATCH_TIME_EXPIRED
      const match = await prisma.match.create({
        data: {
          gameId: "snooker",
          status: "FINISHED",
          winnerIds: [players[0].id],
          resultReason: "MATCH_TIME_EXPIRED",
        },
      });
      createdMatchIds.push(match.id);

      await prisma.tournamentRound.update({
        where: { id: r1Slot1.slotId },
        data: { matchId: match.id, status: "COMPLETED", winnerId: players[0].id },
      });

      const updatedData = await getTournamentControlCenterData(tournament.id);
      expect(updatedData.timeLimitMetrics.timeLimitCount).toBe(1);
      expect(updatedData.timeLimitMetrics.timeLimitPercentage).toBe(100);
    });
  });
});
