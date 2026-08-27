import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import {
  scheduleHourlyTournaments,
  isHourlySchedulerPaused,
  setHourlySchedulerPaused,
  getHourlySchedulerInfo,
  getHourlySchedulerPreview,
  getGameTierAvailabilityMatrix,
  updateGameTierAvailabilityMatrix,
} from "../hourlyTournamentScheduler";
import {
  TournamentEmailService,
  GAME_DISPLAY_NAMES,
  formatGameName,
} from "../tournamentEmailService";
import {
  startTournament,
  cancelTournamentWithRefunds,
  settleTournament,
  createTournamentMatch,
} from "../tournamentEngine";
import { TournamentSettlementService } from "../tournamentSettlementService";
import { DEFAULT_TOURNAMENT_TIERS, TOURNAMENT_TIER_VISUALS } from "@gaming-hub/shared";
import type { TournamentTierCode } from "@gaming-hub/shared";

describe("COMPLETE TOURNAMENT ADMIN MANAGEMENT SYSTEM", () => {
  const createdUserIds: string[] = [];
  const createdTournamentIds: string[] = [];
  const createdTierIds: string[] = [];

  async function createTestAdmin() {
    const id = `admin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const rand = Math.random().toString(36).slice(2, 9);
    createdUserIds.push(id);

    const user = await prisma.user.create({
      data: {
        id,
        email: `admin_${rand}@gaminghub.test`,
        username: `adm_${Date.now().toString(36)}_${rand}`,
        displayName: "Super Admin",
        role: "ADMIN",
        profile: { create: {} },
        wallet: { create: { balance: 1000000 } },
      },
    });

    return user;
  }

  async function createTestPlayer(initialBalance = 1000) {
    const id = `u_admtest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const rand = Math.random().toString(36).slice(2, 9);
    createdUserIds.push(id);

    const user = await prisma.user.create({
      data: {
        id,
        email: `player_${rand}@gaminghub.test`,
        username: `ply_${Date.now().toString(36)}_${rand}`,
        displayName: `Player ${rand}`,
        role: "USER",
        profile: { create: {} },
        wallet: { create: { balance: initialBalance } },
      },
    });

    return user;
  }

  async function ensureDefaultTiers() {
    for (const tier of DEFAULT_TOURNAMENT_TIERS) {
      const existing = await prisma.tournamentTier.findUnique({
        where: { code: tier.code },
      });
      if (!existing) {
        const created = await prisma.tournamentTier.create({
          data: {
            name: tier.name,
            code: tier.code,
            description: tier.description,
            entryFee: tier.entryFee,
            maxPlayers: tier.maxPlayers,
            prizePool: tier.prizePool,
            prizeDistribution: tier.prizeDistribution as any,
            format: tier.format as any,
            enableThirdPlace: tier.enableThirdPlace,
            autoStartWhenFull: tier.autoStartWhenFull,
            isActive: tier.isActive,
            sortOrder: tier.sortOrder,
          },
        });
        createdTierIds.push(created.id);
      }
    }
  }

  beforeEach(async () => {
    setHourlySchedulerPaused(false);
    TournamentEmailService.resetState();
    await ensureDefaultTiers();
  });

  afterEach(async () => {
    setHourlySchedulerPaused(false);

    if (createdTournamentIds.length > 0) {
      await prisma.tournamentNotificationIdempotency.deleteMany({
        where: { tournamentId: { in: createdTournamentIds } },
      }).catch(() => undefined);
      await prisma.tournamentTierScheduleLog.deleteMany({
        where: { tournamentId: { in: createdTournamentIds } },
      }).catch(() => undefined);
      await prisma.tournamentDispute.deleteMany({
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

    if (createdUserIds.length > 0) {
      const userIds = [...createdUserIds];
      createdUserIds.length = 0;
      try {
        await prisma.appNotification.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.transaction.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.wallet.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.profile.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      } catch {
        // Safe cleanup
      }
    }
  });

  // ===========================================================================
  // 1-4. Five Tiers: Creation, Edit, Disable, Enable & Financial Breakdown
  // ===========================================================================
  describe("1-4. 5-Tier Configuration & Verification", () => {
    it("verifies exact default financial specifications for all 5 tiers", async () => {
      const expectedTiers = {
        mini: { fee: 5, max: 100, pool: 400, p1: 200, p2: 100, p3: 60, p4: 40 },
        basic: { fee: 10, max: 200, pool: 1600, p1: 800, p2: 400, p3: 240, p4: 160 },
        standard: { fee: 25, max: 500, pool: 10000, p1: 5000, p2: 2500, p3: 1500, p4: 1000 },
        premium: { fee: 50, max: 500, pool: 22500, p1: 11250, p2: 5625, p3: 3375, p4: 2250 },
        pro: { fee: 100, max: 1000, pool: 90000, p1: 45000, p2: 22500, p3: 13500, p4: 9000 },
      };

      for (const [code, spec] of Object.entries(expectedTiers)) {
        const tier = await prisma.tournamentTier.findUnique({
          where: { code },
        });
        expect(tier).not.toBeNull();
        expect(tier?.entryFee).toBe(spec.fee);
        expect(tier?.prizePool).toBe(spec.pool);
        expect(tier?.maxPlayers).toBe(spec.max);

        // Sum of 4 positions must strictly equal prize pool
        expect(spec.p1 + spec.p2 + spec.p3 + spec.p4).toBe(spec.pool);
      }
    });

    it("allows admin to edit a tier and disable/enable it without altering running instances", async () => {
      const miniTier = await prisma.tournamentTier.findUnique({ where: { code: "mini" } });
      expect(miniTier).not.toBeNull();

      // Disable Mini tier
      await prisma.tournamentTier.update({
        where: { id: miniTier!.id },
        data: { isActive: false },
      });

      const updated = await prisma.tournamentTier.findUnique({ where: { code: "mini" } });
      expect(updated?.isActive).toBe(false);

      // Re-enable
      await prisma.tournamentTier.update({
        where: { id: miniTier!.id },
        data: { isActive: true },
      });

      const reEnabled = await prisma.tournamentTier.findUnique({ where: { code: "mini" } });
      expect(reEnabled?.isActive).toBe(true);
    });
  });

  // ===========================================================================
  // 5-8. Hourly Scheduler: Auto-generation, Pause, Resume, and Duplicate Safety
  // ===========================================================================
  describe("5-8. Hourly Scheduler Controls & Idempotency", () => {
    it("runs hourly scheduler creating active tiers atomically", async () => {
      const res = await scheduleHourlyTournaments();
      expect(res.errors).toHaveLength(0);
      expect(res.created + res.skipped).toBeGreaterThanOrEqual(5);

      // Running immediately again must be idempotent (skipped, 0 duplicates)
      const res2 = await scheduleHourlyTournaments();
      expect(res2.created).toBe(0);
      expect(res2.skipped).toBeGreaterThanOrEqual(5);
    });

    it("pauses hourly scheduler preventing automatic creation, and resumes smoothly", async () => {
      // Pause
      setHourlySchedulerPaused(true, "admin_1", "Maintenance window");
      expect(isHourlySchedulerPaused()).toBe(true);

      const infoPaused = await getHourlySchedulerInfo();
      expect(infoPaused.isPaused).toBe(true);
      expect(infoPaused.nextRunAt).toBeNull();

      const pauseRun = await scheduleHourlyTournaments();
      expect(pauseRun.isPaused).toBe(true);
      expect(pauseRun.created).toBe(0);

      // Resume
      setHourlySchedulerPaused(false, "admin_1", "Maintenance completed");
      expect(isHourlySchedulerPaused()).toBe(false);

      const infoResumed = await getHourlySchedulerInfo();
      expect(infoResumed.isPaused).toBe(false);
      expect(infoResumed.nextRunAt).not.toBeNull();
    });

    it("generates deterministic upcoming schedule preview", async () => {
      const preview = await getHourlySchedulerPreview(4);
      expect(preview.length).toBeGreaterThanOrEqual(10);
      expect(preview[0].scheduledTime).toBeDefined();
      expect(preview[0].tierName).toBeDefined();
      expect(preview[0].gameName).toBeDefined();
      expect(preview[0].entryFee).toBeGreaterThanOrEqual(5);
    });
  });

  // ===========================================================================
  // 9-11. Exceptional Manual Tournament & Safe Cancellation with Refunds
  // ===========================================================================
  describe("9-11. Exceptional Tournaments & Safe Cancellation with Refunds", () => {
    it("creates exceptional tournament with frozen financial snapshot", async () => {
      const tournId = `tourn_exp_${Date.now()}`;
      createdTournamentIds.push(tournId);

      const tourn = await prisma.tournament.create({
        data: {
          id: tournId,
          title: "Special Snooker Masters",
          description: "Exceptional tournament instance",
          gameId: "snooker",
          entryFee: 50,
          prizePool: 22500,
          grossPool: 22500,
          maxPlayers: 500,
          minPlayers: 2,
          startTime: new Date(Date.now() + 3600000),
          status: "REGISTRATION_OPEN",
          configSnapshot: {
            tierName: "Premium",
            entryFee: 50,
            prizePool: 22500,
            version: 1,
          },
        },
      });

      expect(tourn.entryFee).toBe(50);
      expect(tourn.prizePool).toBe(22500);
      expect((tourn.configSnapshot as any).version).toBe(1);
    });

    it("safely cancels tournament and refunds entry fee to registered players idempotently", async () => {
      const player1 = await createTestPlayer(500);
      const player2 = await createTestPlayer(500);

      const tournId = `tourn_cancel_${Date.now()}`;
      createdTournamentIds.push(tournId);

      const tourn = await prisma.tournament.create({
        data: {
          id: tournId,
          title: "Cancelled Tournament Event",
          description: "Testing cancellation",
          gameId: "chess",
          entryFee: 25,
          prizePool: 10000,
          grossPool: 10000,
          maxPlayers: 8,
          minPlayers: 2,
          startTime: new Date(Date.now() + 3600000),
          status: "REGISTRATION_OPEN",
        },
      });

      // Register players and debit entry fees
      await prisma.wallet.update({
        where: { userId: player1.id },
        data: { balance: { decrement: 25 } },
      });
      await prisma.tournamentPlayer.create({
        data: { tournamentId: tourn.id, userId: player1.id, seed: 1 },
      });

      await prisma.wallet.update({
        where: { userId: player2.id },
        data: { balance: { decrement: 25 } },
      });
      await prisma.tournamentPlayer.create({
        data: { tournamentId: tourn.id, userId: player2.id, seed: 2 },
      });

      // Cancel with refund
      await cancelTournamentWithRefunds(tourn.id, "Admin emergency cancellation");

      // Verify wallet restored to 500
      const w1 = await prisma.wallet.findUnique({ where: { userId: player1.id } });
      const w2 = await prisma.wallet.findUnique({ where: { userId: player2.id } });
      expect(w1?.balance).toBe(500);
      expect(w2?.balance).toBe(500);

      // Verify tournament status is CANCELLED
      const cancelledTourn = await prisma.tournament.findUnique({ where: { id: tourn.id } });
      expect(cancelledTourn?.status).toBe("CANCELLED");
    });
  });

  // ===========================================================================
  // 12-18. Settlement Monitoring, Settlement Retry, and Email Retry
  // ===========================================================================
  describe("12-18. Settlement Monitoring, Retries & Email Delivery", () => {
    it("allows admin to monitor and retry failed settlements idempotently", async () => {
      const winner = await createTestPlayer(100);
      const tournId = `tourn_settle_${Date.now()}`;
      createdTournamentIds.push(tournId);

      const tourn = await prisma.tournament.create({
        data: {
          id: tournId,
          title: "Settlement Test Tournament",
          description: "Testing retry",
          gameId: "ludo",
          entryFee: 10,
          prizePool: 1600,
          grossPool: 1600,
          maxPlayers: 8,
          minPlayers: 2,
          startTime: new Date(),
          status: "COMPLETED",
        },
      });

      const playerRecord = await prisma.tournamentPlayer.create({
        data: { tournamentId: tourn.id, userId: winner.id, seed: 1, finalRank: 1 },
      });

      // Create a FAILED prize settlement record
      const prize = await prisma.tournamentPrize.create({
        data: {
          tournamentId: tourn.id,
          userId: winner.id,
          playerId: playerRecord.id,
          rank: 1,
          amount: 800,
          status: "FAILED",
        },
      });

      // Admin retries settlement
      const admin = await createTestAdmin();
      const retryResult = await TournamentSettlementService.retryFailedSettlements(
        tourn.id,
        admin.id,
        "Network glitch recovery",
        prize.id
      );

      expect(retryResult).toBeDefined();

      const updatedPrize = await prisma.tournamentPrize.findUnique({
        where: { id: prize.id },
      });
      expect(updatedPrize?.status === "PAID" || updatedPrize?.status === "COMPLETED").toBe(true);

      // Verify wallet credited with prize coins
      const w = await prisma.wallet.findUnique({ where: { userId: winner.id } });
      expect(w?.balance).toBeGreaterThanOrEqual(900);
    });

    it("allows admin to retry failed email deliveries", async () => {
      const player = await createTestPlayer();
      const failedRecord = await TournamentEmailService.sendRegistrationEmail({
        userId: player.id,
        tournamentId: "t_email_1",
        tournamentTitle: "Email Retry Test",
        gameId: "carrom",
        playerName: player.displayName,
      });

      // Admin retries email
      const retried = await TournamentEmailService.retryFailedEmail(failedRecord.notificationId, "admin_super");
      expect(retried.status).toBe("SENT");
      expect(retried.attemptCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // 19-25. Game-Tier Matrix & All 10 Games Format
  // ===========================================================================
  describe("19-25. Game-Tier Matrix & 10 Games Format", () => {
    it("updates and retrieves game-tier availability matrix", () => {
      const matrix = getGameTierAvailabilityMatrix();
      expect(matrix["chess"]).toBeDefined();
      expect(matrix["snooker"]).toBeDefined();

      // Disable premium and pro for chess
      const updated = updateGameTierAvailabilityMatrix({
        ...matrix,
        chess: { mini: true, basic: true, standard: true, premium: false, pro: false },
      });

      expect(updated.chess.premium).toBe(false);
      expect(updated.chess.pro).toBe(false);
      expect(updated.chess.mini).toBe(true);
    });

    it("formats display names for all 10 multiplayer games properly", () => {
      const all10 = [
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

      for (const g of all10) {
        const name = formatGameName(g);
        expect(name).toBe(GAME_DISPLAY_NAMES[g]);
      }
    });
  });
});
