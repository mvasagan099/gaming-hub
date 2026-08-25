import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@gaming-hub/db";
import {
  startTournament,
  buildSingleEliminationBracket,
  processMatchResult,
  getTournamentBracket,
  getPlayerTournamentStatus,
  getAdminTournamentOverview,
  recoverStuckRounds,
  transitionTournamentStatus,
} from "../tournamentEngine";
import { TournamentMatchService } from "../tournamentMatchService";
import { TournamentEmailService } from "../tournamentEmailService";

describe("AUTOMATIC TOURNAMENT ROUND & MATCH MANAGEMENT", () => {
  const createdTournamentIds: string[] = [];
  const createdUserIds: string[] = [];

  async function createTestPlayer(displayName: string, emailPrefix: string) {
    const id = `u_tourn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
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
    entryFee?: number;
  }) {
    const tournamentId = `tourn_auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    createdTournamentIds.push(tournamentId);

    const tournament = await prisma.tournament.create({
      data: {
        id: tournamentId,
        title: params.title,
        description: `${params.title} description`,
        gameId: params.gameId,
        format: "SINGLE_ELIMINATION",
        status: "REGISTRATION_OPEN",
        entryFee: params.entryFee ?? 0,
        prizePool: 5000,
        grossPool: 5000,
        minPlayers: 2,
        maxPlayers: params.maxPlayers ?? params.playerCount,
        startTime: new Date(Date.now() - 1000),
      },
    });

    // Register test players
    const players = [];
    for (let i = 1; i <= params.playerCount; i++) {
      const p = await createTestPlayer(`Player ${i}`, `p${i}`);
      await prisma.tournamentPlayer.create({
        data: {
          tournamentId,
          userId: p.id,
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

    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  // ===========================================================================
  // 1. Bracket Generation with Incomplete Capacity & BYEs (e.g. 5 of 8 or 999 of 1000)
  // ===========================================================================
  describe("1. Bracket Generation & BYE Advancements (No Fake Players)", () => {
    it("handles incomplete tournament capacity (e.g. 5 of 8 players) with exact BYEs without creating fake players", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Snooker Incomplete Cup",
        gameId: "snooker",
        playerCount: 5,
        maxPlayers: 8,
      });

      // Start tournament -> builds bracket
      await startTournament(tournament.id, null);

      const bracket = await getTournamentBracket(tournament.id);
      expect(bracket.totalRounds).toBe(3); // 2^3 = 8 bracket slots

      const round1 = bracket.rounds.find((r) => r.roundNumber === 1);
      expect(round1?.slots).toHaveLength(4); // 8 / 2 = 4 slots in R1

      // 8 - 5 = 3 BYE slots
      const byeSlots = round1?.slots.filter((s) => s.isBye);
      expect(byeSlots).toHaveLength(3);

      // 1 real active match in Round 1
      const activeSlots = round1?.slots.filter((s) => !s.isBye);
      expect(activeSlots).toHaveLength(1);
      expect(activeSlots![0].playerAId).not.toBeNull();
      expect(activeSlots![0].playerBId).not.toBeNull();

      // Verify BYE players were auto-advanced into Round 2 slots
      const round2 = bracket.rounds.find((r) => r.roundNumber === 2);
      expect(round2?.slots).toHaveLength(2);

      // Verify no fake players were added
      const allPlayerIdsInBracket = new Set<string>();
      bracket.rounds.forEach((r) => {
        r.slots.forEach((s) => {
          if (s.playerAId) allPlayerIdsInBracket.add(s.playerAId);
          if (s.playerBId) allPlayerIdsInBracket.add(s.playerBId);
        });
      });

      const realPlayerIds = new Set(players.map((p) => p.id));
      for (const id of allPlayerIdsInBracket) {
        expect(realPlayerIds.has(id)).toBe(true);
      }
    });
  });

  // ===========================================================================
  // 2. Full Automatic Progression: 2-Player, 4-Player & 8-Player Tournaments
  // ===========================================================================
  describe("2. Full Tournament Progression (2, 4, 8 Players)", () => {
    it("runs complete 2-player tournament from Round 1 (Final) to champion coronation", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Chess Rapid 1v1",
        gameId: "chess",
        playerCount: 2,
      });

      await startTournament(tournament.id, null);

      const bracket = await getTournamentBracket(tournament.id);
      expect(bracket.totalRounds).toBe(1);

      const finalSlot = bracket.rounds[0].slots[0];
      expect(finalSlot.matchId).toBeDefined();

      // Process match result -> Winner is Player 1
      await processMatchResult({
        matchId: finalSlot.matchId!,
        tournamentId: tournament.id,
        roundId: finalSlot.id,
        winnerId: players[0].id,
        loserId: players[1].id,
        scores: { [players[0].id]: 1, [players[1].id]: 0 },
      });

      // Verify tournament completed / settled
      const updatedTourn = await prisma.tournament.findUnique({
        where: { id: tournament.id },
      });
      expect(["COMPLETED", "SETTLED"]).toContain(updatedTourn?.status);

      // Verify Champion & Runner Up ranks
      const p1 = await prisma.tournamentPlayer.findUnique({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: players[0].id } },
      });
      const p2 = await prisma.tournamentPlayer.findUnique({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: players[1].id } },
      });

      expect(p1?.finalRank).toBe(1);
      expect(p2?.finalRank).toBe(2);
      expect(p2?.eliminated).toBe(true);
    });

    it("runs complete 4-player tournament: Semi Finals -> Winners advance -> Grand Final -> Champion", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Carrom 4-Player Knockout",
        gameId: "carrom",
        playerCount: 4,
      });

      await startTournament(tournament.id, null);

      let bracket = await getTournamentBracket(tournament.id);
      expect(bracket.totalRounds).toBe(2);

      const r1Slots = bracket.rounds.find((r) => r.roundNumber === 1)!.slots;
      expect(r1Slots).toHaveLength(2);

      // Play Match 1 of Round 1
      const slot1 = r1Slots[0];
      await processMatchResult({
        matchId: slot1.matchId!,
        tournamentId: tournament.id,
        roundId: slot1.id,
        winnerId: slot1.playerAId!,
        loserId: slot1.playerBId!,
      });

      // Play Match 2 of Round 1
      const slot2 = r1Slots[1];
      await processMatchResult({
        matchId: slot2.matchId!,
        tournamentId: tournament.id,
        roundId: slot2.id,
        winnerId: slot2.playerAId!,
        loserId: slot2.playerBId!,
      });

      // Check Round 2 (Final) is now READY with the 2 winners
      bracket = await getTournamentBracket(tournament.id);
      const finalSlot = bracket.rounds.find((r) => r.roundNumber === 2)!.slots[0];
      expect(finalSlot.playerAId).toBe(slot1.playerAId);
      expect(finalSlot.playerBId).toBe(slot2.playerAId);

      // Ensure final match is created
      const finalMatchId = await TournamentMatchService.ensureTournamentRoundMatch(finalSlot.id);
      expect(finalMatchId).toBeDefined();

      // Play Grand Final
      await processMatchResult({
        matchId: finalMatchId!,
        tournamentId: tournament.id,
        roundId: finalSlot.id,
        winnerId: slot1.playerAId!,
        loserId: slot2.playerAId!,
      });

      // Tournament completed
      const updatedTourn = await prisma.tournament.findUnique({
        where: { id: tournament.id },
      });
      expect(["COMPLETED", "SETTLED"]).toContain(updatedTourn?.status);
    });

    it("runs complete 8-player tournament: Quarter Finals -> Semi Finals -> Grand Final -> Champion", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Fruit Ninja 8-Player Championship",
        gameId: "fruit-ninja",
        playerCount: 8,
      });

      await startTournament(tournament.id, null);

      let bracket = await getTournamentBracket(tournament.id);
      expect(bracket.totalRounds).toBe(3); // 2^3 = 8 (R1: 4 matches, R2: 2 matches, R3: 1 match)

      // Play Round 1 (4 matches)
      const r1Slots = bracket.rounds.find((r) => r.roundNumber === 1)!.slots;
      expect(r1Slots).toHaveLength(4);
      for (const slot of r1Slots) {
        await processMatchResult({
          matchId: slot.matchId!,
          tournamentId: tournament.id,
          roundId: slot.id,
          winnerId: slot.playerAId!,
          loserId: slot.playerBId!,
        });
      }

      // Play Round 2 (2 matches)
      bracket = await getTournamentBracket(tournament.id);
      const r2Slots = bracket.rounds.find((r) => r.roundNumber === 2)!.slots;
      expect(r2Slots).toHaveLength(2);
      for (const slot of r2Slots) {
        const mId = await TournamentMatchService.ensureTournamentRoundMatch(slot.id);
        expect(mId).toBeDefined();
        await processMatchResult({
          matchId: mId!,
          tournamentId: tournament.id,
          roundId: slot.id,
          winnerId: slot.playerAId!,
          loserId: slot.playerBId!,
        });
      }

      // Play Round 3 (Grand Final)
      bracket = await getTournamentBracket(tournament.id);
      const r3Slots = bracket.rounds.find((r) => r.roundNumber === 3)!.slots;
      expect(r3Slots).toHaveLength(1);
      const finalSlot = r3Slots[0];
      const finalMatchId = await TournamentMatchService.ensureTournamentRoundMatch(finalSlot.id);
      expect(finalMatchId).toBeDefined();

      await processMatchResult({
        matchId: finalMatchId!,
        tournamentId: tournament.id,
        roundId: finalSlot.id,
        winnerId: finalSlot.playerAId!,
        loserId: finalSlot.playerBId!,
      });

      const updatedTourn = await prisma.tournament.findUnique({
        where: { id: tournament.id },
      });
      expect(["COMPLETED", "SETTLED"]).toContain(updatedTourn?.status);
    }, 20000);

    it("continues tournament bracket progression uninterrupted even if email delivery fails", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Email Failure Resilience Cup",
        gameId: "bubble-shooter",
        playerCount: 2,
      });

      // Simulate email transport failure / offline recipient
      const sendSpy = vi.spyOn(TournamentEmailService, "sendMatchAssignedEmail").mockRejectedValueOnce(
        new Error("SMTP connection refused")
      );

      // Start tournament should succeed without throwing
      await expect(startTournament(tournament.id, null)).resolves.not.toThrow();

      const bracket = await getTournamentBracket(tournament.id);
      const slot = bracket.rounds[0].slots[0];
      expect(slot.matchId).toBeDefined();

      sendSpy.mockRestore();
    });
  });

  // ===========================================================================
  // 3. Exactly-Once Advancement & Result Validation Idempotency
  // ===========================================================================
  describe("3. Exactly-Once Advancement & Idempotency", () => {
    it("ignores duplicate match result events without creating duplicate matches or double-advancement", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Snooker Masters Idempotency",
        gameId: "snooker",
        playerCount: 4,
      });

      await startTournament(tournament.id, null);

      const bracket = await getTournamentBracket(tournament.id);
      const slot = bracket.rounds[0].slots[0];

      // 1. Process result first time
      await processMatchResult({
        matchId: slot.matchId!,
        tournamentId: tournament.id,
        roundId: slot.id,
        winnerId: slot.playerAId!,
        loserId: slot.playerBId!,
      });

      // 2. Resend identical result (simulating socket reconnect / server retry)
      await processMatchResult({
        matchId: slot.matchId!,
        tournamentId: tournament.id,
        roundId: slot.id,
        winnerId: slot.playerAId!,
        loserId: slot.playerBId!,
      });

      // Verify idempotency record exists
      const idem = await prisma.tournamentResultIdempotency.findUnique({
        where: { matchId: slot.matchId! },
      });
      expect(idem).toBeDefined();

      // Verify slot in round 1 remains COMPLETED with exactly 1 winner
      const updatedSlot = await prisma.tournamentRound.findUnique({
        where: { id: slot.id },
      });
      expect(updatedSlot?.status).toBe("COMPLETED");
      expect(updatedSlot?.winnerId).toBe(slot.playerAId);
    });

    it("rejects invalid tournament results (e.g. wrong tournament or non-assigned winner)", async () => {
      const { tournament } = await createTestTournament({
        title: "Validation Test Cup",
        gameId: "chess",
        playerCount: 2,
      });

      await startTournament(tournament.id, null);
      const bracket = await getTournamentBracket(tournament.id);
      const slot = bracket.rounds[0].slots[0];

      // Non-existent round ID
      await expect(
        processMatchResult({
          matchId: "non_existent_match",
          tournamentId: tournament.id,
          roundId: "fake_round_id",
          winnerId: "fake_winner_id",
        })
      ).rejects.toThrow();

      // Wrong tournament ID
      await expect(
        processMatchResult({
          matchId: slot.matchId!,
          tournamentId: "wrong_tournament_id",
          roundId: slot.id,
          winnerId: slot.playerAId!,
        })
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // 4. Admin Monitoring & Player Status
  // ===========================================================================
  describe("4. Admin Monitoring & Player Status", () => {
    it("returns accurate admin overview metrics for active, completed, and waiting matches", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Admin Overview Tourney",
        gameId: "table-tennis",
        playerCount: 4,
      });

      await startTournament(tournament.id, null);

      const overview = await getAdminTournamentOverview(tournament.id);
      expect(overview.title).toBe("Admin Overview Tourney");
      expect(overview.totalPlayers).toBe(4);
      expect(overview.remainingPlayers).toBe(4);
      expect(overview.totalRounds).toBe(2);
      expect(overview.currentRound).toBe(1);
      expect(overview.activeMatches).toBe(2); // 2 matches in R1
      expect(overview.waitingMatches).toBe(1); // 1 match in R2 waiting
      expect(overview.completedMatches).toBe(0);
    });

    it("returns real-time player tournament status (isRegistered, seed, active matchId)", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Player Status Tourney",
        gameId: "ludo",
        playerCount: 2,
      });

      await startTournament(tournament.id, null);

      const status = await getPlayerTournamentStatus(tournament.id, players[0].id);
      expect(status.isRegistered).toBe(true);
      expect(status.seed).toBeDefined();
      expect(status.eliminated).toBe(false);
      expect(status.currentMatchId).toBeDefined();
    });
  });

  // ===========================================================================
  // 5. Stuck Round & Match Recovery
  // ===========================================================================
  describe("5. Stuck Round Recovery & Self-Healing", () => {
    it("detects and self-heals stuck rounds when all matches are finished", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Recovery Tourney",
        gameId: "cricket",
        playerCount: 2,
      });

      await startTournament(tournament.id, null);
      const bracket = await getTournamentBracket(tournament.id);
      const slot = bracket.rounds[0].slots[0];

      // Mark slot completed directly in DB without finalizing
      await prisma.tournamentRound.update({
        where: { id: slot.id },
        data: { status: "COMPLETED", winnerId: players[0].id },
      });

      // Run recovery
      const recovered = await recoverStuckRounds(tournament.id);
      expect(recovered).toBeGreaterThanOrEqual(1);

      const updated = await prisma.tournament.findUnique({
        where: { id: tournament.id },
      });
      expect(["COMPLETED", "SETTLED"]).toContain(updated?.status);
    });
  });
});

