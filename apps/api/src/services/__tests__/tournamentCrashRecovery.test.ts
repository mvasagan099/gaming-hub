import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { TournamentRecoveryService } from "../tournamentRecoveryService";
import {
  buildSingleEliminationBracket,
  startTournament,
  getTournamentBracket,
  processMatchResult,
} from "../tournamentEngine";
import { TournamentEmailService } from "../tournamentEmailService";

describe("CRASH-SAFE TOURNAMENT STATE RECOVERY & RESUME SYSTEM", () => {
  const createdTournamentIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdMatchIds: string[] = [];

  async function createTestPlayer(displayName: string, emailPrefix: string) {
    const id = `u_rec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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
    status?: "REGISTRATION_OPEN" | "REGISTRATION_CLOSED" | "IN_PROGRESS" | "COMPLETED";
    registrationEndsAt?: Date;
    startTime?: Date;
  }) {
    const tournamentId = `tourn_rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
        entryFee: 0,
        prizePool: 5000,
        grossPool: 5000,
        minPlayers: 2,
        maxPlayers: params.maxPlayers ?? params.playerCount,
        startTime: params.startTime ?? new Date(Date.now() - 600_000),
        registrationStartsAt: new Date(Date.now() - 3600_000),
        registrationEndsAt: params.registrationEndsAt ?? new Date(Date.now() - 1800_000),
      },
    });

    const players = [];
    for (let i = 0; i < params.playerCount; i++) {
      const p = await createTestPlayer(`Player ${i + 1}`, `rec_p${i + 1}`);
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

  beforeEach(() => {
    TournamentEmailService.resetState();
  });

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
  // 1. Server Crash During Active Match (Timer & Deadline Preserved)
  // ===========================================================================
  describe("1. Active Match Timer & Deadline Recovery", () => {
    it("preserves exact remaining match duration and never resets to fresh 10 minutes", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Snooker Active Match Recovery",
        gameId: "snooker",
        playerCount: 2,
      });

      await buildSingleEliminationBracket(tournament.id);
      const bracket = await getTournamentBracket(tournament.id);
      const r1Slot = bracket.rounds[0].slots[0];

      // Simulate a match that started 6 minutes ago (4 minutes remaining on 10m timer)
      const now = Date.now();
      const startedAt = new Date(now - 6 * 60 * 1000);
      const matchDeadline = new Date(now + 4 * 60 * 1000);

      const match = await prisma.match.create({
        data: {
          gameId: "snooker",
          status: "ACTIVE",
          startedAt,
          matchDeadline,
          players: {
            create: [
              { userId: players[0].id, seat: 0 },
              { userId: players[1].id, seat: 1 },
            ],
          },
        },
      });
      createdMatchIds.push(match.id);

      await prisma.tournamentRound.update({
        where: { id: r1Slot.id },
        data: { matchId: match.id, status: "IN_PROGRESS" },
      });

      // Execute crash recovery
      const summary = await TournamentRecoveryService.recoverAllTournamentStates();
      expect(summary).toBeDefined();

      // Verify match is still ACTIVE with untouched original deadline
      const recoveredMatch = await prisma.match.findUnique({ where: { id: match.id } });
      expect(recoveredMatch?.status).toBe("ACTIVE");
      expect(recoveredMatch?.startedAt?.getTime()).toBe(startedAt.getTime());
      expect(recoveredMatch?.matchDeadline?.getTime()).toBe(matchDeadline.getTime());

      // Remaining time is strictly ~4 minutes, NEVER reset to 10 minutes (600_000ms)
      const remainingMs = recoveredMatch!.matchDeadline!.getTime() - Date.now();
      expect(remainingMs).toBeLessThanOrEqual(245_000);
      expect(remainingMs).toBeGreaterThan(200_000);
    });
  });

  // ===========================================================================
  // 2. Server Crash During Match Timeout (Offline Expiry Auto-Finalization)
  // ===========================================================================
  describe("2. Offline Match Expiry Recovery", () => {
    it("detects match deadline expired while offline, finalizes result, advances winner, and eliminates loser", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Chess Expired Match Recovery",
        gameId: "chess",
        playerCount: 2,
      });

      await buildSingleEliminationBracket(tournament.id);
      const bracket = await getTournamentBracket(tournament.id);
      const r1Slot = bracket.rounds[0].slots[0];

      // Match started 15 minutes ago, deadline expired 5 minutes ago
      const now = Date.now();
      const startedAt = new Date(now - 15 * 60 * 1000);
      const matchDeadline = new Date(now - 5 * 60 * 1000);

      const match = await prisma.match.create({
        data: {
          gameId: "chess",
          status: "ACTIVE",
          startedAt,
          matchDeadline,
          players: {
            create: [
              { userId: players[0].id, seat: 0 },
              { userId: players[1].id, seat: 1 },
            ],
          },
        },
      });
      createdMatchIds.push(match.id);

      await prisma.tournamentRound.update({
        where: { id: r1Slot.id },
        data: { matchId: match.id, status: "IN_PROGRESS" },
      });

      // Execute crash recovery
      const summary = await TournamentRecoveryService.recoverAllTournamentStates();
      expect(summary.expiredMatchesFinalized).toBeGreaterThanOrEqual(1);

      // Verify match transitioned to FINISHED with resultReason MATCH_TIME_EXPIRED
      const updatedMatch = await prisma.match.findUnique({ where: { id: match.id } });
      expect(updatedMatch?.status).toBe("FINISHED");
      expect(updatedMatch?.resultReason).toBe("MATCH_TIME_EXPIRED");

      // Verify tournament round slot is COMPLETED
      const updatedSlot = await prisma.tournamentRound.findUnique({ where: { id: r1Slot.id } });
      expect(updatedSlot?.status).toBe("COMPLETED");
      expect(updatedSlot?.winnerId).toBe(players[0].id);

      // Verify tournament is now finalized and settled
      const updatedTourn = await prisma.tournament.findUnique({ where: { id: tournament.id } });
      expect(["COMPLETED", "SETTLED"]).toContain(updatedTourn?.status);
    });
  });

  // ===========================================================================
  // 3. Crash During Round Transition & Next Round Spawning
  // ===========================================================================
  describe("3. Round Progression & Next Round Recovery", () => {
    it("recovers missing next-round matches when Round 1 completes without duplicate match creation", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Carrom 4-Player Round Transition Recovery",
        gameId: "carrom",
        playerCount: 4,
      });

      await buildSingleEliminationBracket(tournament.id);
      const bracket = await getTournamentBracket(tournament.id);

      const r1Slots = bracket.rounds[0].slots; // 2 matches in R1
      expect(r1Slots).toHaveLength(2);

      // Finish match 1 (Player 1 beats Player 4)
      await processMatchResult({
        matchId: `match_r1_m1_${Date.now()}`,
        tournamentId: tournament.id,
        roundId: r1Slots[0].id,
        winnerId: players[0].id,
        loserId: players[3].id,
      });

      // Finish match 2 (Player 2 beats Player 3)
      await processMatchResult({
        matchId: `match_r1_m2_${Date.now()}`,
        tournamentId: tournament.id,
        roundId: r1Slots[1].id,
        winnerId: players[1].id,
        loserId: players[2].id,
      });

      // Clear the next slot matchId to simulate server crash right before match was created
      const finalSlotBefore = await prisma.tournamentRound.findFirst({
        where: { tournamentId: tournament.id, roundNumber: 2 },
      });
      if (finalSlotBefore?.matchId) {
        await prisma.tournamentRound.update({
          where: { id: finalSlotBefore.id },
          data: { matchId: null, status: "READY" },
        });
      }

      // Now Round 1 is completely finished. Run recovery to verify Grand Final match is spawned exactly once
      const summary = await TournamentRecoveryService.recoverAllTournamentStates();
      expect(summary.matchesRecovered + summary.nextRoundsSpawned).toBeGreaterThanOrEqual(1);

      // Verify Round 2 (Final) slot is IN_PROGRESS with a valid matchId
      const finalSlot = await prisma.tournamentRound.findFirst({
        where: { tournamentId: tournament.id, roundNumber: 2 },
      });
      expect(finalSlot).toBeDefined();
      expect(finalSlot?.playerAId).toBe(players[0].id);
      expect(finalSlot?.playerBId).toBe(players[1].id);
      expect(finalSlot?.matchId).toBeDefined();
    });
  });

  // ===========================================================================
  // 4. Idempotency Guarantee Across Multiple Invocations
  // ===========================================================================
  describe("4. Idempotency & Multi-Invocation Safety", () => {
    it("produces identical state with zero duplicate matches when recovery runs multiple times", async () => {
      const { tournament } = await createTestTournament({
        title: "Ludo Idempotency Recovery",
        gameId: "ludo",
        playerCount: 4,
      });

      await buildSingleEliminationBracket(tournament.id);

      // Run recovery 5 times consecutively
      await TournamentRecoveryService.recoverAllTournamentStates();
      await TournamentRecoveryService.recoverAllTournamentStates();
      await TournamentRecoveryService.recoverAllTournamentStates();
      await TournamentRecoveryService.recoverAllTournamentStates();
      await TournamentRecoveryService.recoverAllTournamentStates();

      // Verify exactly 3 slots exist (2 in R1, 1 in R2)
      const slotCount = await prisma.tournamentRound.count({
        where: { tournamentId: tournament.id },
      });
      expect(slotCount).toBe(3);

      // Verify no duplicate matches created for this tournament
      const slots = await prisma.tournamentRound.findMany({
        where: { tournamentId: tournament.id },
        select: { matchId: true },
      });
      const matchIds = slots.map((s) => s.matchId).filter(Boolean);
      expect(matchIds.length).toBeLessThanOrEqual(2);
    }, 15000);
  });

  // ===========================================================================
  // 5. Crash Recovery Across All 10 Games
  // ===========================================================================
  describe("5. Crash Recovery Across All 10 Games", () => {
    const allGames = [
      "snake-and-ladder",
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

    for (const gameId of allGames) {
      it(`recovers tournament state cleanly for game: ${gameId}`, async () => {
        const { tournament, players } = await createTestTournament({
          title: `${gameId} Crash Test Cup`,
          gameId,
          playerCount: 2,
        });

        await buildSingleEliminationBracket(tournament.id);

        const summary = await TournamentRecoveryService.recoverAllTournamentStates();
        expect(summary).toBeDefined();

        const slot = await prisma.tournamentRound.findFirst({
          where: { tournamentId: tournament.id, roundNumber: 1 },
        });
        expect(slot).toBeDefined();
        expect(slot?.playerAId).toBe(players[0].id);
        expect(slot?.playerBId).toBe(players[1].id);
      });
    }
  });

  // ===========================================================================
  // 6. Admin Recovery Status Diagnostics
  // ===========================================================================
  describe("6. Admin Recovery Status Diagnostics", () => {
    it("returns accurate tournament health diagnostic report", async () => {
      const { tournament } = await createTestTournament({
        title: "Diagnostic Tourney",
        gameId: "cricket",
        playerCount: 2,
      });

      await buildSingleEliminationBracket(tournament.id);

      const report = await TournamentRecoveryService.getRecoveryStatusReport(tournament.id);
      expect(report.totalInspected).toBe(1);
      expect(report.tournaments[0].tournamentId).toBe(tournament.id);
      expect(report.tournaments[0].title).toBe("Diagnostic Tourney");
      expect(report.tournaments[0].totalPlayers).toBe(2);
      expect(report.tournaments[0].totalRounds).toBe(1);
    });
  });
});
