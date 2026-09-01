import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import {
  seedPlayers,
  assignManualSeeds,
  buildSingleEliminationBracket,
  getTournamentBracket,
  getAdminTournamentBracketDetails,
  getPlayerMatchView,
  startTournament,
} from "../tournamentEngine";
import { TournamentEmailService } from "../tournamentEmailService";

describe("TOURNAMENT SEEDING & FAIR BRACKET GENERATION", () => {
  const createdTournamentIds: string[] = [];
  const createdUserIds: string[] = [];

  async function createTestPlayer(params: {
    displayName: string;
    emailPrefix: string;
    rating?: number;
  }) {
    const id = `u_seed_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const rand = Math.random().toString(36).slice(2, 10);
    createdUserIds.push(id);

    const user = await prisma.user.create({
      data: {
        id,
        email: `${params.emailPrefix}_${Date.now().toString(36)}_${rand}@gaminghub.test`,
        username: `usr_${Date.now().toString(36)}_${rand}`,
        displayName: params.displayName,
        role: "USER",
        profile: { create: {} },
        wallet: { create: { balance: 10000 } },
        ...(params.rating
          ? {
              competitiveRanks: {
                create: {
                  gameId: "chess",
                  rating: params.rating,
                  tier: "GOLD",
                  peakRating: params.rating,
                  wins: 10,
                  losses: 2,
                  draws: 0,
                  winStreak: 3,
                  longestWinStreak: 5,
                },
              },
            }
          : {}),
      },
    });

    return user;
  }

  async function createTestTournament(params: {
    title: string;
    gameId: string;
    playerCount: number;
    maxPlayers?: number;
    seedMethod?: "ADMIN_DEFINED" | "RATING" | "RANDOM";
    playersData?: { displayName: string; emailPrefix: string; rating?: number }[];
  }) {
    const tournamentId = `tourn_seed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    createdTournamentIds.push(tournamentId);

    const tournament = await prisma.tournament.create({
      data: {
        id: tournamentId,
        title: params.title,
        description: `${params.title} description`,
        gameId: params.gameId,
        format: "SINGLE_ELIMINATION",
        seedMethod: params.seedMethod ?? "ADMIN_DEFINED",
        status: "REGISTRATION_OPEN",
        entryFee: 0,
        prizePool: 5000,
        grossPool: 5000,
        minPlayers: 2,
        maxPlayers: params.maxPlayers ?? params.playerCount,
        startTime: new Date(Date.now() + 3600_000),
      },
    });

    const players = [];
    const count = params.playersData ? params.playersData.length : params.playerCount;

    for (let i = 0; i < count; i++) {
      const pData = params.playersData ? params.playersData[i] : {
        displayName: `Player ${i + 1}`,
        emailPrefix: `p${i + 1}`,
      };
      const p = await createTestPlayer(pData);
      // Give staggered registration time
      const registeredAt = new Date(Date.now() - (count - i) * 1000);
      await prisma.tournamentPlayer.create({
        data: {
          tournamentId,
          userId: p.id,
          registeredAt,
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
      await prisma.competitiveRank.deleteMany({
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
  // 1. Seeding Strategies: REGISTRATION_ORDER, RATING, RANDOM, MANUAL
  // ===========================================================================
  describe("1. Deterministic Seeding Strategies", () => {
    it("assigns seeds based on REGISTRATION_ORDER (earliest registered -> Seed 1)", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Registration Order Cup",
        gameId: "chess",
        playerCount: 4,
        seedMethod: "ADMIN_DEFINED",
      });

      const seededUserIds = await seedPlayers(tournament.id);
      expect(seededUserIds[0]).toBe(players[0].id); // 1st registered
      expect(seededUserIds[1]).toBe(players[1].id); // 2nd registered
      expect(seededUserIds[2]).toBe(players[2].id); // 3rd registered
      expect(seededUserIds[3]).toBe(players[3].id); // 4th registered

      // Verify seeds in database
      const dbPlayers = await prisma.tournamentPlayer.findMany({
        where: { tournamentId: tournament.id },
        orderBy: { seed: "asc" },
      });
      expect(dbPlayers[0].userId).toBe(players[0].id);
      expect(dbPlayers[0].seed).toBe(1);
      expect(dbPlayers[3].userId).toBe(players[3].id);
      expect(dbPlayers[3].seed).toBe(4);
    });

    it("assigns seeds based on RATING (highest competitive rating -> Seed 1)", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Rating Seeded Championship",
        gameId: "chess",
        playerCount: 3,
        seedMethod: "RATING",
        playersData: [
          { displayName: "Beginner", emailPrefix: "beg", rating: 1200 },
          { displayName: "Master", emailPrefix: "mas", rating: 2400 },
          { displayName: "Intermediate", emailPrefix: "inter", rating: 1800 },
        ],
      });

      const seededUserIds = await seedPlayers(tournament.id);
      expect(seededUserIds[0]).toBe(players[1].id); // Master (2400) -> Seed 1
      expect(seededUserIds[1]).toBe(players[2].id); // Intermediate (1800) -> Seed 2
      expect(seededUserIds[2]).toBe(players[0].id); // Beginner (1200) -> Seed 3
    });

    it("supports ADMIN_DEFINED / MANUAL seeding with full validation & auditing", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Manual Seeded Cup",
        gameId: "carrom",
        playerCount: 3,
      });

      // Admin assigns manual seeds: Player 3 -> Seed 1, Player 1 -> Seed 2, Player 2 -> Seed 3
      const assignments = [
        { userId: players[2].id, seed: 1 },
        { userId: players[0].id, seed: 2 },
        { userId: players[1].id, seed: 3 },
      ];

      await assignManualSeeds(tournament.id, assignments, "admin_user_123");

      const seededUserIds = await seedPlayers(tournament.id);
      expect(seededUserIds[0]).toBe(players[2].id);
      expect(seededUserIds[1]).toBe(players[0].id);
      expect(seededUserIds[2]).toBe(players[1].id);

      // Rejects duplicate seed assignment
      await expect(
        assignManualSeeds(
          tournament.id,
          [
            { userId: players[0].id, seed: 1 },
            { userId: players[1].id, seed: 1 }, // duplicate seed 1
          ],
          "admin_user_123"
        )
      ).rejects.toThrow("Duplicate seed");
    });
  });

  // ===========================================================================
  // 2. Incomplete Bracket Handling (e.g. 5 of 8 or 999 of 1000)
  // ===========================================================================
  describe("2. Incomplete Bracket & Explicit BYEs", () => {
    it("generates power-of-2 bracket with exact BYE slots without creating fake participants", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Snooker 5-Player Tournament",
        gameId: "snooker",
        playerCount: 5,
        maxPlayers: 8,
        seedMethod: "ADMIN_DEFINED",
      });

      await buildSingleEliminationBracket(tournament.id);
      const bracket = await getTournamentBracket(tournament.id);

      // 5 players -> 8 bracket slots, 3 BYEs
      expect(bracket.totalRounds).toBe(3);
      const r1Slots = bracket.rounds[0].slots;
      expect(r1Slots).toHaveLength(4);

      // Top seeded players receive BYEs
      const byeSlots = r1Slots.filter((s) => s.isBye);
      expect(byeSlots).toHaveLength(3);

      for (const slot of byeSlots) {
        expect(slot.playerAId).not.toBeNull();
        expect(slot.playerBId).toBeNull(); // explicitly null, no fake player!
      }

      // 1 real active match in Round 1
      const realMatches = r1Slots.filter((s) => !s.isBye);
      expect(realMatches).toHaveLength(1);
      expect(realMatches[0].playerAId).not.toBeNull();
      expect(realMatches[0].playerBId).not.toBeNull();
    });
  });

  // ===========================================================================
  // 3. Deterministic Bracket Pairings (2, 4, 8, 16 Players)
  // ===========================================================================
  describe("3. Deterministic Bracket Pairings (2, 4, 8, 16 Players)", () => {
    it("correctly pairs 4 players: Seed 1 vs Seed 4, Seed 2 vs Seed 3", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Table Tennis 4-Player Final",
        gameId: "table-tennis",
        playerCount: 4,
        seedMethod: "ADMIN_DEFINED",
      });

      await buildSingleEliminationBracket(tournament.id);
      const bracket = await getTournamentBracket(tournament.id);

      const r1Slots = bracket.rounds[0].slots;
      expect(r1Slots).toHaveLength(2);

      // Match 0: Seed 1 (Player 1) vs Seed 4 (Player 4)
      expect(r1Slots[0].playerAId).toBe(players[0].id);
      expect(r1Slots[0].playerBId).toBe(players[3].id);

      // Match 1: Seed 2 (Player 2) vs Seed 3 (Player 3)
      expect(r1Slots[1].playerAId).toBe(players[1].id);
      expect(r1Slots[1].playerBId).toBe(players[2].id);
    });

    it("correctly pairs 8 players: Seed 1 vs Seed 8, Seed 2 vs Seed 7, etc.", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Fruit Ninja 8-Player Bracket",
        gameId: "fruit-ninja",
        playerCount: 8,
        seedMethod: "ADMIN_DEFINED",
      });

      await buildSingleEliminationBracket(tournament.id);
      const bracket = await getTournamentBracket(tournament.id);

      const r1Slots = bracket.rounds[0].slots;
      expect(r1Slots).toHaveLength(4);

      expect(r1Slots[0].playerAId).toBe(players[0].id);
      expect(r1Slots[0].playerBId).toBe(players[7].id);

      expect(r1Slots[1].playerAId).toBe(players[1].id);
      expect(r1Slots[1].playerBId).toBe(players[6].id);

      expect(r1Slots[2].playerAId).toBe(players[2].id);
      expect(r1Slots[2].playerBId).toBe(players[5].id);

      expect(r1Slots[3].playerAId).toBe(players[3].id);
      expect(r1Slots[3].playerBId).toBe(players[4].id);
    });
  });

  // ===========================================================================
  // 4. Player View ("MY MATCH") & Admin Bracket View
  // ===========================================================================
  describe("4. Player & Admin Bracket Views", () => {
    it("returns dedicated player view with seed, round, opponent, and match status", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Ludo 1v1 View Test",
        gameId: "ludo",
        playerCount: 2,
        seedMethod: "ADMIN_DEFINED",
      });

      await startTournament(tournament.id, null);

      const p1View = await getPlayerMatchView(tournament.id, players[0].id);
      expect(p1View.tournamentTitle).toBe("Ludo 1v1 View Test");
      expect(p1View.mySeed).toBe(1);
      expect(p1View.currentRound).toBe(1);
      expect(p1View.opponent).toBeDefined();
      expect(p1View.opponent?.userId).toBe(players[1].id);
      expect(p1View.opponent?.seed).toBe(2);
      expect(p1View.matchStatus).toBeDefined();
    });

    it("returns detailed admin bracket view with all rounds, match slots, and paired player seeds", async () => {
      const { tournament, players } = await createTestTournament({
        title: "Admin Bracket Breakdown",
        gameId: "cricket",
        playerCount: 4,
        seedMethod: "ADMIN_DEFINED",
      });

      await buildSingleEliminationBracket(tournament.id);

      const adminView = await getAdminTournamentBracketDetails(tournament.id);
      expect(adminView.title).toBe("Admin Bracket Breakdown");
      expect(adminView.totalPlayers).toBe(4);
      expect(adminView.totalRounds).toBe(2);
      expect(adminView.rounds).toHaveLength(2);

      const r1 = adminView.rounds[0];
      expect(r1.matches).toHaveLength(2);
      expect(r1.matches[0].playerA?.seed).toBe(1);
      expect(r1.matches[0].playerB?.seed).toBe(4);
    });
  });

  // ===========================================================================
  // 5. Large Tournaments (16 Players & 999 / 1000 Incomplete Bracket)
  // ===========================================================================
  describe("5. Large Tournaments & 999 / 1000 Incomplete Bracket Handling", () => {
    it("handles 16-player tournament bracket structure deterministically", async () => {
      const { tournament, players } = await createTestTournament({
        title: "16-Player Mega Bracket",
        gameId: "chess",
        playerCount: 16,
        seedMethod: "ADMIN_DEFINED",
      });

      await buildSingleEliminationBracket(tournament.id);
      const bracket = await getTournamentBracket(tournament.id);

      expect(bracket.totalRounds).toBe(4); // log2(16) = 4
      const r1Slots = bracket.rounds[0].slots;
      expect(r1Slots).toHaveLength(8);

      // Verify exact pairings: Seed 1 vs Seed 16, Seed 2 vs Seed 15, etc.
      expect(r1Slots[0].playerAId).toBe(players[0].id);
      expect(r1Slots[0].playerBId).toBe(players[15].id);

      expect(r1Slots[1].playerAId).toBe(players[1].id);
      expect(r1Slots[1].playerBId).toBe(players[14].id);
    });

    it("verifies 999 / 1000 player tournament bracket generation: exactly 999 real players, 25 BYEs, 0 fake players", async () => {
      const { generateFullBracketStructure } = await import("../tournamentEngine");

      // Generate 999 simulated real player IDs
      const realUserIds = Array.from({ length: 999 }, (_, i) => `u_real_player_${i + 1}`);

      // Bracket generation
      const structure = generateFullBracketStructure(realUserIds);

      // 999 players -> 1024 power-of-2 size -> 10 rounds
      expect(structure).toHaveLength(10);

      // Round 1 has 512 match slots (1024 / 2)
      const r1 = structure[0];
      expect(r1.slots).toHaveLength(512);

      // 1024 - 999 = 25 BYEs in Round 1
      const byeSlots = r1.slots.filter((s) => s.isBye);
      expect(byeSlots).toHaveLength(25);

      // All 25 BYEs have playerAId populated from real users and playerBId strictly null (no fake player)
      for (const slot of byeSlots) {
        expect(slot.playerAId).not.toBeNull();
        expect(realUserIds).toContain(slot.playerAId);
        expect(slot.playerBId).toBeNull();
      }

      // 512 - 25 = 487 active 1v1 matches in Round 1
      const activeMatches = r1.slots.filter((s) => !s.isBye);
      expect(activeMatches).toHaveLength(487);

      for (const slot of activeMatches) {
        expect(slot.playerAId).not.toBeNull();
        expect(slot.playerBId).not.toBeNull();
        expect(slot.playerAId).not.toBe(slot.playerBId);
      }

      // Verify all 999 real user IDs are placed in Round 1 exactly once
      const assignedIds = new Set<string>();
      for (const slot of r1.slots) {
        if (slot.playerAId) assignedIds.add(slot.playerAId);
        if (slot.playerBId) assignedIds.add(slot.playerBId);
      }
      expect(assignedIds.size).toBe(999);
      for (const id of realUserIds) {
        expect(assignedIds.has(id)).toBe(true);
      }
    });
  });
});

