import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { AppError, hasPermission, ROLE_PERMISSIONS } from "@gaming-hub/shared";
import {
  recordLoginSession,
  listSessions,
  revokeSession,
  hashToken,
} from "../sessions";
import {
  cancelTournamentWithRefunds,
  settleTournament,
} from "../tournamentEngine";
import { registerForTournament } from "../tournaments";
import { scheduleHourlyTournaments } from "../hourlyTournamentScheduler";

import { applyTransaction } from "../wallet";
import { toApiError } from "@gaming-hub/shared";

describe("COMPREHENSIVE SECURITY ATTACK SIMULATION & PRODUCTION AUDIT", () => {
  const runId = Math.random().toString(36).slice(2, 8);
  const attackerId = `sec_attacker_${runId}`;
  const victimId = `sec_victim_${runId}`;
  const adminId = `sec_admin_${runId}`;
  const modId = `sec_mod_${runId}`;

  let testTournamentId: string;

  beforeAll(async () => {
    // Create isolated test user fixtures
    await prisma.user.createMany({
      data: [
        {
          id: attackerId,
          email: `${attackerId}@security.test`,
          username: `attacker_${runId}`,
          displayName: "Malicious Attacker",
          role: "USER",
        },
        {
          id: victimId,
          email: `${victimId}@security.test`,
          username: `victim_${runId}`,
          displayName: "Innocent Victim",
          role: "USER",
        },
        {
          id: adminId,
          email: `${adminId}@security.test`,
          username: `admin_${runId}`,
          displayName: "System Admin",
          role: "ADMIN",
        },
        {
          id: modId,
          email: `${modId}@security.test`,
          username: `mod_${runId}`,
          displayName: "Community Moderator",
          role: "MODERATOR",
        },
      ],
    });

    // Create test wallets
    await prisma.wallet.createMany({
      data: [
        { userId: attackerId, balance: 100 },
        { userId: victimId, balance: 500 },
        { userId: adminId, balance: 10000 },
        { userId: modId, balance: 100 },
      ],
    });
  });

  afterAll(async () => {
    // Cleanup isolated test fixtures
    await prisma.tournamentPlayer.deleteMany({
      where: { userId: { in: [attackerId, victimId, adminId, modId] } },
    });
    await prisma.transaction.deleteMany({
      where: { userId: { in: [attackerId, victimId, adminId, modId] } },
    });
    await prisma.loginSession.deleteMany({
      where: { userId: { in: [attackerId, victimId, adminId, modId] } },
    });
    if (testTournamentId) {
      await prisma.tournamentRound.deleteMany({ where: { tournamentId: testTournamentId } });
      await prisma.tournamentPrize.deleteMany({ where: { tournamentId: testTournamentId } });
      await prisma.tournament.deleteMany({ where: { id: testTournamentId } });
    }
    await prisma.wallet.deleteMany({
      where: { userId: { in: [attackerId, victimId, adminId, modId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [attackerId, victimId, adminId, modId] } },
    });
  });

  beforeEach(async () => {
    // Create fresh test tournament for each attack test
    const startTime = new Date(Date.now() + 1000 * 60 * 30); // 30 mins in future
    const registrationEndsAt = new Date(Date.now() + 1000 * 60 * 25);
    const tournament = await prisma.tournament.create({
      data: {
        gameId: "carrom",
        title: `Security Test Tournament ${runId}`,
        description: "Isolated security test fixture",
        entryFee: 10,
        prizePool: 100,
        grossPool: 100,
        minPlayers: 4,
        maxPlayers: 8,
        startTime,
        registrationEndsAt,
        status: "REGISTRATION_OPEN",
        format: "SINGLE_ELIMINATION",
      },
    });
    testTournamentId = tournament.id;
  });

  // =========================================================================
  // 1. AUTHENTICATION & SESSION ATTACKS
  // =========================================================================
  describe("1. Authentication & Session Attack Tests", () => {
    it("rejects revoked sessions and enforces single active session", async () => {
      const token1 = `jwt_token_1_${runId}`;
      const token2 = `jwt_token_2_${runId}`;

      // Attacker logs in on Device 1
      await recordLoginSession({
        userId: attackerId,
        token: token1,
        ip: "127.0.0.1",
        userAgent: "Browser 1",
      });

      // Attacker logs in on Device 2 -> Device 1 revoked atomically
      await recordLoginSession({
        userId: attackerId,
        token: token2,
        ip: "127.0.0.1",
        userAgent: "Browser 2",
      });

      const s1 = await prisma.loginSession.findUnique({
        where: { tokenHash: hashToken(token1) },
      });
      const s2 = await prisma.loginSession.findUnique({
        where: { tokenHash: hashToken(token2) },
      });

      expect(s1?.revokedAt).not.toBeNull();
      expect(s1?.isCurrent).toBe(false);
      expect(s2?.revokedAt).toBeNull();
      expect(s2?.isCurrent).toBe(true);

      // Active sessions listing returns only 1 session
      const activeList = await listSessions(attackerId, hashToken(token2));
      expect(activeList.length).toBe(1);
    });

    it("prevents session hijacking / IDOR on session revocation", async () => {
      const victimToken = `victim_session_token_${runId}`;
      const victimSession = await recordLoginSession({
        userId: victimId,
        token: victimToken,
        ip: "127.0.0.1",
        userAgent: "Victim Device",
      });

      // Attacker attempts to revoke victim's session
      await expect(revokeSession(attackerId, victimSession.id)).rejects.toThrow("Session not found");

      // Victim session remains intact
      const check = await prisma.loginSession.findUnique({ where: { id: victimSession.id } });
      expect(check?.revokedAt).toBeNull();
    });
  });

  // =========================================================================
  // 2. AUTHORIZATION / RBAC ATTACKS
  // =========================================================================
  describe("2. Authorization & RBAC Attack Tests", () => {
    it("enforces strict RBAC: normal player cannot perform admin actions", () => {
      expect(hasPermission("USER", "admin:users:manage")).toBe(false);
      expect(hasPermission("USER", "admin:wallet:adjust")).toBe(false);
      expect(hasPermission("USER", "admin:tournaments:manage")).toBe(false);
      expect(hasPermission("USER", "admin:settings:edit")).toBe(false);
    });

    it("enforces strict RBAC: moderator cannot perform financial wallet adjustments", () => {
      expect(hasPermission("MODERATOR", "admin:wallet:adjust")).toBe(false);
      expect(hasPermission("MODERATOR", "admin:settings:edit")).toBe(false);
      expect(hasPermission("MODERATOR", "admin:roles:create")).toBe(false);
    });

    it("enforces strict RBAC: admin has authorized privileges", () => {
      expect(hasPermission("ADMIN", "admin:users:view")).toBe(true);
      expect(hasPermission("ADMIN", "admin:tournaments:manage")).toBe(true);
    });
  });

  // =========================================================================
  // 3. TOURNAMENT ABUSE & RACE CONDITIONS
  // =========================================================================
  describe("3. Tournament Abuse & Concurrency Attacks", () => {
    it("blocks duplicate registration and duplicate fee deduction", async () => {
      // Register attacker once
      const reg1 = await registerForTournament(attackerId, testTournamentId);
      expect(reg1.ok).toBe(true);
      expect(reg1.status).toBe("REGISTERED");

      const balBefore = (await prisma.wallet.findUnique({ where: { userId: attackerId } }))?.balance ?? 0;

      // Attempt second registration for same tournament
      await expect(registerForTournament(attackerId, testTournamentId)).rejects.toThrow(
        /already registered/i
      );

      const balAfter = (await prisma.wallet.findUnique({ where: { userId: attackerId } }))?.balance ?? 0;
      expect(balAfter).toBe(balBefore); // No duplicate deduction
    });

    it("prevents registration with insufficient balance", async () => {
      // Drain attacker balance to 0
      await prisma.wallet.update({ where: { userId: attackerId }, data: { balance: 0 } });

      await expect(registerForTournament(attackerId, testTournamentId)).rejects.toThrow(
        /insufficient balance/i
      );

      // Restore balance
      await prisma.wallet.update({ where: { userId: attackerId }, data: { balance: 100 } });
    });

    it("prevents registration after capacity is reached", async () => {
      // Set maxPlayers = 1 to simulate full tournament
      await prisma.tournament.update({
        where: { id: testTournamentId },
        data: { maxPlayers: 1 },
      });

      await registerForTournament(victimId, testTournamentId);

      // Attacker attempts to register into full tournament
      await expect(registerForTournament(attackerId, testTournamentId)).rejects.toThrow(
        /Tournament is not accepting registrations|Tournament is full/i
      );
    });

    it("prevents registration after registration has closed or tournament cancelled", async () => {
      await prisma.tournament.update({
        where: { id: testTournamentId },
        data: { status: "CANCELLED" },
      });

      await expect(registerForTournament(attackerId, testTournamentId)).rejects.toThrow(
        /Tournament is not accepting registrations/i
      );
    });

    it("handles concurrent registration race condition safely via idempotency (exactly 1 deduction and 1 player record)", async () => {
      // Reset wallet
      await prisma.wallet.update({ where: { userId: attackerId }, data: { balance: 50 } });

      // Clean any existing registration
      await prisma.tournamentPlayer.deleteMany({ where: { tournamentId: testTournamentId, userId: attackerId } });
      await prisma.idempotencyRecord.deleteMany({ where: { userId: attackerId } });

      // Fire 5 simultaneous registration requests for the same user
      const results = await Promise.allSettled([
        registerForTournament(attackerId, testTournamentId),
        registerForTournament(attackerId, testTournamentId),
        registerForTournament(attackerId, testTournamentId),
        registerForTournament(attackerId, testTournamentId),
        registerForTournament(attackerId, testTournamentId),
      ]);

      // All requests resolve safely via idempotency without unhandled crash
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      // Verify exact single deduction of 10 coins: 50 -> 40
      const finalBal = (await prisma.wallet.findUnique({ where: { userId: attackerId } }))?.balance;
      expect(finalBal).toBe(40);

      // Exactly 1 tournament player row created
      const playerCount = await prisma.tournamentPlayer.count({
        where: { tournamentId: testTournamentId, userId: attackerId },
      });
      expect(playerCount).toBe(1);
    });
  });

  // =========================================================================
  // 4. FINANCIAL INTEGRITY & IDEMPOTENCY
  // =========================================================================
  describe("4. Financial Abuse, Idempotency & Ledger Integrity", () => {
    it("guarantees idempotency on double refund requests", async () => {
      // Register victim in tournament
      await prisma.wallet.update({ where: { userId: victimId }, data: { balance: 100 } });
      await registerForTournament(victimId, testTournamentId);

      const balAfterReg = (await prisma.wallet.findUnique({ where: { userId: victimId } }))?.balance;
      expect(balAfterReg).toBe(90);

      // 1. Cancel tournament with refunds
      await cancelTournamentWithRefunds(testTournamentId, "MINIMUM_PLAYERS_NOT_REACHED", "SYSTEM");

      const balAfterRefund1 = (await prisma.wallet.findUnique({ where: { userId: victimId } }))?.balance;
      expect(balAfterRefund1).toBe(100);

      // 2. Attempt duplicate refund call for same tournament
      await cancelTournamentWithRefunds(testTournamentId, "MINIMUM_PLAYERS_NOT_REACHED", "SYSTEM").catch(
        () => undefined
      );

      const balAfterRefund2 = (await prisma.wallet.findUnique({ where: { userId: victimId } }))?.balance;
      expect(balAfterRefund2).toBe(100); // Balance remains exactly 100, no double refund
    });

    it("prevents negative wager / balance manipulation", async () => {
      // Direct debit exceeding balance or invalid params
      await prisma.wallet.update({ where: { userId: attackerId }, data: { balance: 10 } });
      await expect(
        prisma.$transaction(async (tx) => {
          return applyTransaction(tx, attackerId, -500, "ADMIN", "ref_attack");
        })
      ).rejects.toThrow(/insufficient balance/i);
    });




    it("verifies authoritative server ledger records for every financial event", async () => {
      const txs = await prisma.transaction.findMany({
        where: { userId: victimId },
      });
      expect(txs.length).toBeGreaterThanOrEqual(1);
      for (const tx of txs) {
        expect(tx.amount).toBeGreaterThan(0);
        expect(["ENTRY_FEE", "REFUND", "PRIZE_PAYOUT", "DEPOSIT", "WITHDRAWAL", "ADJUSTMENT", "DEBIT", "CREDIT"]).toContain(
          tx.type
        );
      }
    });
  });


  // =========================================================================
  // 5. SCHEDULER IDEMPOTENCY & CONCURRENCY
  // =========================================================================
  describe("5. Scheduler Abuse & Concurrency Attacks", () => {
    it("guarantees scheduler idempotency: running concurrently generates 0 duplicate slots", async () => {
      // Run two scheduler runs simultaneously
      const [res1, res2] = await Promise.all([
        scheduleHourlyTournaments(),
        scheduleHourlyTournaments(),
      ]);

      expect(res1.errors.length).toBe(0);
      expect(res2.errors.length).toBe(0);

      // Second immediate run creates 0 duplicates
      const res3 = await scheduleHourlyTournaments();
      expect(res3.created).toBe(0);
    });
  });

  // =========================================================================
  // 6. ERROR HANDLING & SECRET LEAK PREVENTION
  // =========================================================================
  describe("6. Error Handling & Information Leak Prevention", () => {
    it("never exposes internal stack traces or database schema in public error responses", () => {
      const rawDbError = new Error("Unique constraint failed on the fields: (email)");
      const safeError = toApiError(rawDbError);

      expect(safeError.error.code).toBe("INTERNAL_ERROR");
      expect(safeError.error.message).toBe("An unexpected error occurred");
      expect((safeError as any).stack).toBeUndefined();
      expect((safeError as any).error?.stack).toBeUndefined();
    });

    it("formats AppError cleanly with authoritative error code", () => {
      const appErr = new AppError("UNAUTHORIZED", "Invalid token signature", 401);
      const safeErr = toApiError(appErr);

      expect(safeErr.error.code).toBe("UNAUTHORIZED");
      expect(safeErr.error.message).toBe("Invalid token signature");
    });
  });
});
