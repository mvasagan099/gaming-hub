import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@gaming-hub/db";
import {
  registerForTournament,
  cancelRegistration,
  getRegistrationInfo,
  getAdminTournamentRegistrationSummary,
} from "../tournaments";
import { TournamentEmailService } from "../tournamentEmailService";

describe("TOURNAMENT REGISTRATION, ELIGIBILITY & ANTI-ABUSE SYSTEM", () => {
  const createdTournamentIds: string[] = [];
  const createdUserIds: string[] = [];

  async function createTestPlayer(displayName: string, emailPrefix: string, balance = 10000, isSuspended = false, role = "USER") {
    const id = `u_reg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const rand = Math.random().toString(36).slice(2, 10);
    createdUserIds.push(id);

    const user = await prisma.user.create({
      data: {
        id,
        email: `${emailPrefix}_${Date.now().toString(36)}_${rand}@gaminghub.test`,
        username: `usr_${Date.now().toString(36)}_${rand}`,
        displayName,
        role: role as any,
        profile: { create: {} },
        wallet: { create: { balance } },
        ...(isSuspended
          ? {
              penalties: {
                create: {
                  type: "CHEATING",
                  reason: "Suspended for cheating",
                  status: "ACTIVE",
                  expiresAt: new Date(Date.now() + 86400_000),
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
    maxPlayers: number;
    entryFee?: number;
    status?: "REGISTRATION_OPEN" | "DRAFT" | "REGISTRATION_CLOSED" | "IN_PROGRESS" | "CANCELLED";
    registrationStartsAt?: Date;
    registrationEndsAt?: Date;
  }) {
    const tournamentId = `tourn_reg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    createdTournamentIds.push(tournamentId);

    const tournament = await prisma.tournament.create({
      data: {
        id: tournamentId,
        title: params.title,
        description: `${params.title} description`,
        gameId: params.gameId,
        format: "SINGLE_ELIMINATION",
        status: params.status ?? "REGISTRATION_OPEN",
        entryFee: params.entryFee ?? 0,
        prizePool: 5000,
        grossPool: 5000,
        minPlayers: 2,
        maxPlayers: params.maxPlayers,
        startTime: new Date(Date.now() + 3600_000), // 1 hour in future
        registrationStartsAt: params.registrationStartsAt ?? new Date(Date.now() - 3600_000),
        registrationEndsAt: params.registrationEndsAt ?? new Date(Date.now() + 1800_000),
      },
    });

    return tournament;
  }

  beforeEach(() => {
    TournamentEmailService.resetState();
  });

  afterEach(async () => {
    if (createdTournamentIds.length > 0) {
      await prisma.tournamentPlayer.deleteMany({
        where: { tournamentId: { in: createdTournamentIds } },
      }).catch(() => undefined);
      await prisma.tournament.deleteMany({
        where: { id: { in: createdTournamentIds } },
      }).catch(() => undefined);
      createdTournamentIds.length = 0;
    }

    if (createdUserIds.length > 0) {
      await prisma.playerPenalty.deleteMany({
        where: { userId: { in: createdUserIds } },
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
  // 1. Normal Registration & Eligibility
  // ===========================================================================
  describe("1. Normal Registration & Eligibility", () => {
    it("successfully registers eligible player and returns authoritative metadata & confirmation", async () => {
      const tournament = await createTestTournament({
        title: "Snooker Open 2026",
        gameId: "snooker",
        maxPlayers: 16,
        entryFee: 100,
      });
      const player = await createTestPlayer("Snooker Pro", "snooker_pro", 1000);

      const res = await registerForTournament(player.id, tournament.id);
      expect(res.ok).toBe(true);
      expect(res.tournamentId).toBe(tournament.id);
      expect(res.gameId).toBe("snooker");
      expect(res.registeredPlayers).toBe(1);
      expect(res.maximumPlayers).toBe(16);
      expect(res.status).toBe("REGISTERED");

      // Verify wallet debit
      const wallet = await prisma.wallet.findUnique({ where: { userId: player.id } });
      expect(wallet?.balance).toBe(900); // 1000 - 100

      // Verify registration record
      const reg = await prisma.tournamentPlayer.findUnique({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: player.id } },
      });
      expect(reg).toBeDefined();
    });

    it("prevents duplicate registration on both backend and database uniqueness level", async () => {
      const tournament = await createTestTournament({
        title: "Chess Rapid Cup",
        gameId: "chess",
        maxPlayers: 8,
      });
      const player = await createTestPlayer("Grand Master", "gm", 1000);

      // First registration succeeds
      await registerForTournament(player.id, tournament.id);

      // Second registration fails with TOURNAMENT_ALREADY_REGISTERED
      await expect(registerForTournament(player.id, tournament.id)).rejects.toThrow("already registered");

      const count = await prisma.tournamentPlayer.count({
        where: { tournamentId: tournament.id, userId: player.id },
      });
      expect(count).toBe(1);
    });
  });

  // ===========================================================================
  // 2. Maximum Capacity, Race Condition Protection & Atomic Slot Allocation
  // ===========================================================================
  describe("2. Maximum Capacity & Race Condition Safety", () => {
    it("closes registration when maximum capacity is reached and rejects subsequent requests", async () => {
      const tournament = await createTestTournament({
        title: "Table Tennis 2-Player Final",
        gameId: "table-tennis",
        maxPlayers: 2,
      });

      const p1 = await createTestPlayer("Player 1", "tt1");
      const p2 = await createTestPlayer("Player 2", "tt2");
      const p3 = await createTestPlayer("Player 3", "tt3");

      // Register player 1 -> 1 / 2
      await registerForTournament(p1.id, tournament.id);

      // Register player 2 -> 2 / 2 (reaches max capacity)
      await registerForTournament(p2.id, tournament.id);

      // Register player 3 -> Rejected with TOURNAMENT_FULL
      await expect(registerForTournament(p3.id, tournament.id)).rejects.toThrow();

      // Verify count in database is strictly 2, never 3
      const totalCount = await prisma.tournamentPlayer.count({
        where: { tournamentId: tournament.id },
      });
      expect(totalCount).toBe(2);
    });

    it("handles simultaneous registrations on the last available slot race condition safely", async () => {
      const tournament = await createTestTournament({
        title: "Ludo 2-Player Race Test",
        gameId: "ludo",
        maxPlayers: 2,
      });

      const p1 = await createTestPlayer("Player 1", "ludo1");
      const p2 = await createTestPlayer("Player 2", "ludo2");
      const p3 = await createTestPlayer("Player 3", "ludo3");

      // Slot 1 filled
      await registerForTournament(p1.id, tournament.id);

      // Now exactly 1 slot remains. Player 2 and Player 3 register concurrently
      const results = await Promise.allSettled([
        registerForTournament(p2.id, tournament.id),
        registerForTournament(p3.id, tournament.id),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Exactly ONE must succeed and ONE must fail
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // Final player count must be strictly 2 / 2
      const finalCount = await prisma.tournamentPlayer.count({
        where: { tournamentId: tournament.id },
      });
      expect(finalCount).toBe(2);
    });
  });

  // ===========================================================================
  // 3. Entry Fee & Insufficient Balance Rollback
  // ===========================================================================
  describe("3. Financial Integrity & Rollback", () => {
    it("rolls back registration atomically if player has insufficient balance", async () => {
      const tournament = await createTestTournament({
        title: "High Stakes Carrom",
        gameId: "carrom",
        maxPlayers: 8,
        entryFee: 500,
      });
      const poorPlayer = await createTestPlayer("Poor Player", "poor", 200); // only 200 coins

      await expect(registerForTournament(poorPlayer.id, tournament.id)).rejects.toThrow("Insufficient");

      // Verify wallet balance is unchanged
      const wallet = await prisma.wallet.findUnique({ where: { userId: poorPlayer.id } });
      expect(wallet?.balance).toBe(200);

      // Verify no registration record was created
      const reg = await prisma.tournamentPlayer.findUnique({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: poorPlayer.id } },
      });
      expect(reg).toBeNull();
    });
  });

  // ===========================================================================
  // 4. Registration Window & Account Restrictions
  // ===========================================================================
  describe("4. Registration Window & Account Restrictions", () => {
    it("rejects registration when registration starts in the future", async () => {
      const futureStart = new Date(Date.now() + 3600_000); // 1 hr from now
      const tournament = await createTestTournament({
        title: "Future Cup",
        gameId: "chess",
        maxPlayers: 8,
        registrationStartsAt: futureStart,
      });
      const player = await createTestPlayer("Future Player", "future");

      await expect(registerForTournament(player.id, tournament.id)).rejects.toThrow("not started");
    });

    it("rejects registration when registration deadline has passed", async () => {
      const pastEnd = new Date(Date.now() - 3600_000); // 1 hr ago
      const tournament = await createTestTournament({
        title: "Expired Cup",
        gameId: "chess",
        maxPlayers: 8,
        registrationEndsAt: pastEnd,
      });
      const player = await createTestPlayer("Late Player", "late");

      await expect(registerForTournament(player.id, tournament.id)).rejects.toThrow("closed");
    });

    it("blocks registration for banned or suspended accounts", async () => {
      const tournament = await createTestTournament({
        title: "Fair Play Cup",
        gameId: "fruit-ninja",
        maxPlayers: 8,
      });
      const bannedPlayer = await createTestPlayer("Banned Cheater", "cheater", 1000, true); // suspended

      await expect(registerForTournament(bannedPlayer.id, tournament.id)).rejects.toThrow("restricted");
    });
  });

  // ===========================================================================
  // 5. Withdrawal & Atomic Refund
  // ===========================================================================
  describe("5. Player Withdrawal & Atomic Refund", () => {
    it("allows withdrawal before tournament starts, refunds entry fee, and frees slot for other players", async () => {
      const tournament = await createTestTournament({
        title: "Refundable Tournament",
        gameId: "bubble-shooter",
        maxPlayers: 2,
        entryFee: 150,
      });

      const p1 = await createTestPlayer("Player 1", "p1_ref", 500);
      const p2 = await createTestPlayer("Player 2", "p2_ref", 500);
      const p3 = await createTestPlayer("Player 3", "p3_ref", 500);

      // P1 and P2 register -> Full (2/2)
      await registerForTournament(p1.id, tournament.id);
      await registerForTournament(p2.id, tournament.id);

      // P1 wallet is 350
      let p1Wallet = await prisma.wallet.findUnique({ where: { userId: p1.id } });
      expect(p1Wallet?.balance).toBe(350);

      // P1 cancels registration
      await cancelRegistration(p1.id, tournament.id);

      // P1 wallet refunded back to 500
      p1Wallet = await prisma.wallet.findUnique({ where: { userId: p1.id } });
      expect(p1Wallet?.balance).toBe(500);

      // Slot is now freed (1/2), so P3 can now register!
      const p3Reg = await registerForTournament(p3.id, tournament.id);
      expect(p3Reg.ok).toBe(true);
      expect(p3Reg.registeredPlayers).toBe(2);
    });
  });

  // ===========================================================================
  // 6. Registration Info & Admin Summary
  // ===========================================================================
  describe("6. Registration Info & Admin Summary", () => {
    it("returns complete registration info and eligibility for frontend button states", async () => {
      const tournament = await createTestTournament({
        title: "Eligibility Summary Tourney",
        gameId: "ludo",
        maxPlayers: 10,
        entryFee: 50,
      });
      const player = await createTestPlayer("Ludo Fan", "ludo", 200);

      // Before registration
      let info = await getRegistrationInfo(tournament.id, player.id);
      expect(info.isRegistered).toBe(false);
      expect(info.canRegister).toBe(true);
      expect(info.userBalance).toBe(200);
      expect(info.balanceAfterRegistration).toBe(150);
      expect(info.availableSlots).toBe(10);

      // Register
      await registerForTournament(player.id, tournament.id);

      // After registration
      info = await getRegistrationInfo(tournament.id, player.id);
      expect(info.isRegistered).toBe(true);
      expect(info.canRegister).toBe(false);
      expect(info.ineligibilityReason).toBe("Already registered");
      expect(info.availableSlots).toBe(9);
    });

    it("returns admin registration summary with player list and sequence numbers", async () => {
      const tournament = await createTestTournament({
        title: "Admin Registration Breakdown",
        gameId: "snake-vs-worms",
        maxPlayers: 4,
      });

      const p1 = await createTestPlayer("Worm 1", "w1");
      const p2 = await createTestPlayer("Worm 2", "w2");

      await registerForTournament(p1.id, tournament.id);
      await registerForTournament(p2.id, tournament.id);

      const summary = await getAdminTournamentRegistrationSummary(tournament.id);
      expect(summary.title).toBe("Admin Registration Breakdown");
      expect(summary.maxPlayers).toBe(4);
      expect(summary.registeredPlayers).toBe(2);
      expect(summary.availableSlots).toBe(2);
      expect(summary.players).toHaveLength(2);
      expect(summary.players[0].sequence).toBe(1);
      expect(summary.players[1].sequence).toBe(2);
    });
  });
});
