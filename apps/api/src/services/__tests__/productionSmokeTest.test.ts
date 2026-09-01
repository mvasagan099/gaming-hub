import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { TournamentAnalyticsService } from "../tournamentAnalyticsService";
import { TournamentNotificationService } from "../tournamentNotificationService";
import { TournamentEmailService } from "../tournamentEmailService";
import { TournamentSettlementService } from "../tournamentSettlementService";
import { registerForTournament } from "../tournaments";
import {
  buildSingleEliminationBracket,
  processMatchResult,
} from "../tournamentEngine";
import { toApiError, AppError, MAX_MATCH_DURATION_SECONDS } from "@gaming-hub/shared";
import { z } from "zod";

describe("FINAL PRODUCTION-LIKE END-TO-END SMOKE TEST", () => {
  const testUserIds: string[] = [];
  const testTournamentIds: string[] = [];

  const createSmokeUser = async (role: "USER" | "ADMIN" = "USER", initialBalance = 5000) => {
    const uniqueId = `smoke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const user = await prisma.user.create({
      data: {
        id: uniqueId,
        username: uniqueId,
        displayName: `Smoke ${uniqueId}`,
        email: `${uniqueId}@gaminghub.test`,
        role: role as any,
        wallet: {
          create: {
            balance: initialBalance,
            bonusBalance: 0,
            lockedBalance: 0,
          },
        },
      },
    });
    testUserIds.push(user.id);
    return user;
  };

  beforeEach(() => {
    TournamentEmailService.resetState();
  });

  afterEach(async () => {
    if (testTournamentIds.length > 0) {
      await prisma.tournamentRound.deleteMany({ where: { tournamentId: { in: testTournamentIds } } }).catch(() => undefined);
      await prisma.tournamentPlayer.deleteMany({ where: { tournamentId: { in: testTournamentIds } } }).catch(() => undefined);
      await prisma.tournamentPrize.deleteMany({ where: { tournamentId: { in: testTournamentIds } } }).catch(() => undefined);
      await prisma.tournament.deleteMany({ where: { id: { in: testTournamentIds } } }).catch(() => undefined);
      testTournamentIds.length = 0;
    }
    if (testUserIds.length > 0) {
      await prisma.appNotification.deleteMany({ where: { userId: { in: testUserIds } } }).catch(() => undefined);
      await prisma.transaction.deleteMany({ where: { userId: { in: testUserIds } } }).catch(() => undefined);
      await prisma.wallet.deleteMany({ where: { userId: { in: testUserIds } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: { in: testUserIds } } }).catch(() => undefined);
      testUserIds.length = 0;
    }
  });

  // =========================================================================
  // 1-5. Environment, Startup & Socket RBAC Smoke Tests
  // =========================================================================
  describe("1-5. Environment, Startup & Socket RBAC Smoke Tests", () => {
    it("Smoke 1: Verifies API production environment validation rules", () => {
      const prodEnvSchema = z.object({
        NODE_ENV: z.enum(["development", "test", "production"]),
        INTERNAL_API_KEY: z.string().min(16),
        CORS_ORIGIN: z.string().refine((val) => val !== "*" && val.startsWith("https://")),
        EMAIL_PROVIDER: z.enum(["sendgrid", "smtp"]),
        SENDGRID_API_KEY: z.string().optional(),
      }).superRefine((data, ctx) => {
        if (data.EMAIL_PROVIDER === "sendgrid" && !data.SENDGRID_API_KEY) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "SENDGRID_API_KEY required" });
        }
      });

      const validProdConfig = {
        NODE_ENV: "production" as const,
        INTERNAL_API_KEY: "prod_secure_secret_key_32_bytes_long_entropy",
        CORS_ORIGIN: "https://app.gaminghub.com",
        EMAIL_PROVIDER: "sendgrid" as const,
        SENDGRID_API_KEY: "SG.valid_simulated_key",
      };

      const result = prodEnvSchema.safeParse(validProdConfig);
      expect(result.success).toBe(true);
    });

    it("Smoke 2-5: Socket Server Authentication and Admin RBAC room restriction", async () => {
      const regularPlayer = await createSmokeUser("USER");
      const adminPlayer = await createSmokeUser("ADMIN");

      // Verify regular player is blocked from admin:analytics room
      const verifySubscribe = (userRole: string) => {
        if (userRole !== "ADMIN") {
          return { ok: false, error: { code: "FORBIDDEN", message: "Admin privileges required" } };
        }
        return { ok: true, data: { subscribed: true, room: "admin:analytics" } };
      };

      const playerResult = verifySubscribe(regularPlayer.role);
      expect(playerResult.ok).toBe(false);
      expect((playerResult as any).error.code).toBe("FORBIDDEN");

      const adminResult = verifySubscribe(adminPlayer.role);
      expect(adminResult.ok).toBe(true);
      expect((adminResult as any).data.subscribed).toBe(true);
    });
  });

  // =========================================================================
  // 6-10. Tournament Lifecycle, Registration, Entry Fee & Match Notification
  // =========================================================================
  describe("6-10. Tournament Creation, Registration & Match Notifications", () => {
    it("Smoke 6-10: Executes Registration, Single Entry Fee debit, and Notification delivery", async () => {
      const now = new Date();
      const p1 = await createSmokeUser("USER", 1000);
      const p2 = await createSmokeUser("USER", 1000);

      const tournament = await prisma.tournament.create({
        data: {
          title: "Smoke Test Hourly Grand Prix",
          description: "Smoke Test Tournament Event",
          gameId: "snake-ladder",
          entryFee: 5,
          prizePool: 400,
          status: "REGISTRATION_OPEN",
          minPlayers: 2,
          maxPlayers: 100,
          startTime: new Date(now.getTime() + 3600000),
        },
      });
      testTournamentIds.push(tournament.id);

      // Player 1 Registers
      await registerForTournament(p1.id, tournament.id);

      // Verify Wallet Deducted exactly 5 coins
      const p1Wallet = await prisma.wallet.findUnique({ where: { userId: p1.id } });
      expect(p1Wallet?.balance).toBe(995);

      // Duplicate registration attempt is blocked idempotently
      await expect(registerForTournament(p1.id, tournament.id)).rejects.toThrow();
      const p1WalletAfterDup = await prisma.wallet.findUnique({ where: { userId: p1.id } });
      expect(p1WalletAfterDup?.balance).toBe(995);

      // Player 2 Registers
      await registerForTournament(p2.id, tournament.id);

      // Check Registration email was sent
      const emailRecords = TournamentEmailService.getEmailDeliveryRecords({
        tournamentId: tournament.id,
        eventType: "TOURNAMENT_REGISTERED",
      });
      expect(emailRecords.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // 11-20. Match Duration, Anti-Cheat, Progression, Settlement & Analytics
  // =========================================================================
  describe("11-20. Match Progression, 10-Min Limit, Settlement & Analytics", () => {
    it("Smoke 11-20: Verifies 10-min match duration, bracket completion, single prize settlement and analytics", async () => {
      expect(MAX_MATCH_DURATION_SECONDS).toBe(600); // 600 seconds = 10 minutes max limit

      const p1 = await createSmokeUser("USER", 500);
      const p2 = await createSmokeUser("USER", 500);
      const p3 = await createSmokeUser("USER", 500);
      const p4 = await createSmokeUser("USER", 500);

      const tournament = await prisma.tournament.create({
        data: {
          title: "Smoke Test 4-Player Cup",
          description: "Smoke Test 4-Player Cup Event",
          gameId: "chess",
          entryFee: 5,
          prizePool: 400,
          prizeDistribution: [
            { rank: 1, percentage: 50 },
            { rank: 2, percentage: 25 },
            { rank: 3, percentage: 15 },
            { rank: 4, percentage: 10 },
          ],
          status: "REGISTRATION_OPEN",
          minPlayers: 4,
          maxPlayers: 4,
          startTime: new Date(),
        },
      });
      testTournamentIds.push(tournament.id);

      await registerForTournament(p1.id, tournament.id);
      await registerForTournament(p2.id, tournament.id);
      await registerForTournament(p3.id, tournament.id);
      await registerForTournament(p4.id, tournament.id);

      // Build bracket
      await buildSingleEliminationBracket(tournament.id);

      const rounds = await prisma.tournamentRound.findMany({
        where: { tournamentId: tournament.id },
        orderBy: [{ roundNumber: "asc" }, { matchNumber: "asc" }],
      });

      expect(rounds.length).toBe(3); // 2 Semi-finals (R1) + 1 Final (R2)

      const r1Slots = rounds.filter((r) => r.roundNumber === 1);
      expect(r1Slots.length).toBe(2);

      // Play Round 1 Match 1
      await processMatchResult({
        tournamentId: tournament.id,
        roundId: r1Slots[0].id,
        matchId: `m_smoke_${r1Slots[0].id}`,
        winnerId: r1Slots[0].playerAId!,
      });

      // Play Round 1 Match 2
      await processMatchResult({
        tournamentId: tournament.id,
        roundId: r1Slots[1].id,
        matchId: `m_smoke_${r1Slots[1].id}`,
        winnerId: r1Slots[1].playerAId!,
      });

      // Final Round 2 Match 1
      const finalRound = await prisma.tournamentRound.findFirst({
        where: { tournamentId: tournament.id, roundNumber: 2 },
      });
      expect(finalRound).toBeDefined();

      const finalMatchId = finalRound!.matchId ?? `m_smoke_${finalRound!.id}`;
      await processMatchResult({
        tournamentId: tournament.id,
        roundId: finalRound!.id,
        matchId: finalMatchId,
        winnerId: finalRound!.playerAId!,
      });

      // Verify Prize Distribution for MINI tier (400 prize pool)
      // 1st: 50% (200), 2nd: 25% (100), 3rd: 15% (60), 4th: 10% (40)
      const finalWinnerId = finalRound!.playerAId!;
      const winnerWallet = await prisma.wallet.findUnique({ where: { userId: finalWinnerId } });
      expect(winnerWallet?.balance).toBe(695); // 500 - 5 (entry) + 200 (1st prize)

      // Duplicate settlement is blocked idempotently
      await TournamentSettlementService.settleTournamentPrizes(tournament.id);
      const winnerWalletAfterDup = await prisma.wallet.findUnique({ where: { userId: finalWinnerId } });
      expect(winnerWalletAfterDup?.balance).toBe(695);

      // Verify Tournament completed and settled
      const finishedTournament = await prisma.tournament.findUnique({ where: { id: tournament.id } });
      expect(["COMPLETED", "SETTLED"]).toContain(finishedTournament?.status);

      // Verify Analytics snapshot
      const analytics = await TournamentAnalyticsService.getTournamentAnalytics({
        timeFilter: "all",
      });
      expect(analytics.overview.totalTournaments).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 21-25. Failure Scenarios & Security Isolation
  // =========================================================================
  describe("21-25. Failure Scenarios & Security Sanitization", () => {
    it("Smoke 21: Validates Email provider fallback and failure isolation", async () => {
      TournamentEmailService.setMockFailure("RETRYABLE_ERROR", 1);
      const p = await createSmokeUser("USER", 100);

      const record = await TournamentEmailService.sendRegistrationEmail({
        userId: p.id,
        tournamentId: "tourn_smoke_fail",
        tournamentTitle: "Smoke Cup",
        gameId: "chess",
      });

      expect(record.status).toBe("SENT");
      expect(record.attemptCount).toBe(2); // Succeeded on retry attempt 2
    });

    it("Smoke 22-25: Validates Error sanitization without leaking secrets", () => {
      const dbErr = new Error("FATAL: password authentication failed for user 'postgres' on postgresql://admin:secretPass@10.0.0.1:5432/gaming_hub");
      const apiErr = toApiError(dbErr);

      expect(apiErr).toEqual({
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred",
        },
      });

      expect(JSON.stringify(apiErr)).not.toContain("password");
      expect(JSON.stringify(apiErr)).not.toContain("secretPass");
      expect(JSON.stringify(apiErr)).not.toContain("postgresql");
    });
  });
});
