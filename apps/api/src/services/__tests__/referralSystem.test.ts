import { describe, it, expect, afterEach } from "vitest";
import { prisma, NotificationType } from "@gaming-hub/db";
import { ReferralService } from "../referrals";
import { updateCategorySettings } from "../settings";
import { RateLimitService } from "../rateLimitService";
import { SuspiciousActivityService } from "../suspiciousActivityService";
import { AppError } from "@gaming-hub/shared";

describe("Feature 32: Secure Referral & Invite System", () => {
  const createdUserIds: string[] = [];
  const createdReferralIds: string[] = [];

  async function createTestUser(prefix: string, initialBalance = 1000) {
    const suffix = Math.random().toString(36).slice(2, 7);
    const userId = `${prefix}-${Date.now()}-${suffix}`;
    createdUserIds.push(userId);

    await prisma.user.create({
      data: {
        id: userId,
        username: `u_${prefix.replace(/[^a-zA-Z0-9]/g, "")}_${suffix}`.slice(0, 24),
        displayName: `Player ${prefix}`,
        email: `${userId}@test.com`,
        wallet: {
          create: {
            balance: initialBalance,
            bonusBalance: 0,
          },
        },
        profile: {
          create: {
            xp: 100,
            level: 1,
            wins: 0,
            losses: 0,
            draws: 0,
          },
        },
      },
    });

    return userId;
  }

  afterEach(async () => {
    // Reset settings to default if changed
    await updateCategorySettings("referral", {
      enabled: true,
      referrerReward: 500,
      referredReward: 250,
      qualificationRule: "FIRST_GAME",
      maxRewardsPerUser: 0,
      campaignStartDate: null,
      campaignEndDate: null,
    }).catch(() => undefined);

    if (createdReferralIds.length > 0) {
      await prisma.referral.deleteMany({ where: { id: { in: createdReferralIds } } }).catch(() => undefined);
      createdReferralIds.length = 0;
    }

    if (createdUserIds.length > 0) {
      await prisma.appNotification.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.transaction.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.referral.deleteMany({ where: { OR: [{ referrerId: { in: createdUserIds } }, { referredUserId: { in: createdUserIds } }] } }).catch(() => undefined);
      await prisma.profile.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.wallet.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Valid Referral Code Generation & Lookup
  // ---------------------------------------------------------------------------
  it("1. Referral code: generates a stable, unique, non-sensitive referral code", async () => {
    const referrerId = await createTestUser("u-ref-gen");

    const code = await ReferralService.ensureReferralCode(referrerId);
    expect(code).toBeDefined();
    expect(code.length).toBeGreaterThanOrEqual(6);
    expect(code).not.toContain("@");

    // Calling again returns the exact same code (idempotent & stable)
    const secondCode = await ReferralService.ensureReferralCode(referrerId);
    expect(secondCode).toBe(code);

    const summary = await ReferralService.getReferralSummary(referrerId);
    expect(summary.code).toBe(code);
    expect(summary.shareUrl).toContain(`ref=${code}`);
  });

  // ---------------------------------------------------------------------------
  // 2. Self-Referral Prevention
  // ---------------------------------------------------------------------------
  it("2. Self-referral: strictly rejects user attempting to refer themselves", async () => {
    const userId = await createTestUser("u-self-ref");
    const code = await ReferralService.ensureReferralCode(userId);

    await expect(
      ReferralService.applyReferral(userId, code)
    ).rejects.toThrowError(/own referral code/i);

    const alerts = await SuspiciousActivityService.listAlerts({ userId, type: "REFERRAL_ABUSE" });
    expect(alerts.items.length).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // 3. Duplicate Referral Code Application
  // ---------------------------------------------------------------------------
  it("3. Duplicate application: prevents applying referral code multiple times for same account", async () => {
    const referrerId = await createTestUser("u-ref-referrer");
    const refereeId = await createTestUser("u-ref-referee");
    const code = await ReferralService.ensureReferralCode(referrerId);

    const result = await ReferralService.applyReferral(refereeId, code);
    expect(result.applied).toBe(true);

    // Second apply must be rejected
    await expect(
      ReferralService.applyReferral(refereeId, code)
    ).rejects.toThrowError(/already been referred/i);
  });

  // ---------------------------------------------------------------------------
  // 4. Multiple Referrers Rejection
  // ---------------------------------------------------------------------------
  it("4. Multiple referrers: enforces exactly one referrer per account", async () => {
    const referrerA = await createTestUser("u-ref-a");
    const referrerB = await createTestUser("u-ref-b");
    const refereeId = await createTestUser("u-ref-c");

    const codeA = await ReferralService.ensureReferralCode(referrerA);
    const codeB = await ReferralService.ensureReferralCode(referrerB);

    await ReferralService.applyReferral(refereeId, codeA);

    // Attempting to change or apply a second referrer must fail
    await expect(
      ReferralService.applyReferral(refereeId, codeB)
    ).rejects.toThrowError(/already been referred/i);
  });

  // ---------------------------------------------------------------------------
  // 5. Qualification Rule Evaluation on First Game
  // ---------------------------------------------------------------------------
  it("5. Qualification: qualifies referral when referee finishes their first game", async () => {
    const referrerId = await createTestUser("u-qual-r");
    const refereeId = await createTestUser("u-qual-e");
    const code = await ReferralService.ensureReferralCode(referrerId);

    await ReferralService.applyReferral(refereeId, code);

    let refRecord = await prisma.referral.findUnique({ where: { referredUserId: refereeId } });
    expect(refRecord?.status).toBe("PENDING");

    // Referee plays first game
    await ReferralService.evaluateQualification(refereeId, "FIRST_GAME", { gameId: "chess" });

    refRecord = await prisma.referral.findUnique({ where: { referredUserId: refereeId } });
    expect(refRecord?.status).toBe("REWARDED");
    expect(refRecord?.qualifiedAt).toBeDefined();
    expect(refRecord?.rewardedAt).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 6. Qualification Rule on First Win
  // ---------------------------------------------------------------------------
  it("6. Qualification: supports configurable qualification rule for FIRST_WIN", async () => {
    await updateCategorySettings("referral", {
      qualificationRule: "FIRST_WIN",
    });

    const referrerId = await createTestUser("u-win-r");
    const refereeId = await createTestUser("u-win-e");
    const code = await ReferralService.ensureReferralCode(referrerId);

    await ReferralService.applyReferral(refereeId, code);

    // First game (loss) does NOT qualify
    await ReferralService.evaluateQualification(refereeId, "FIRST_GAME");
    let refRecord = await prisma.referral.findUnique({ where: { referredUserId: refereeId } });
    expect(refRecord?.status).toBe("PENDING");

    // First win qualifies
    await ReferralService.evaluateQualification(refereeId, "FIRST_WIN");
    refRecord = await prisma.referral.findUnique({ where: { referredUserId: refereeId } });
    expect(refRecord?.status).toBe("REWARDED");
  });

  // ---------------------------------------------------------------------------
  // 7. Duplicate Qualification Idempotency
  // ---------------------------------------------------------------------------
  it("7. Duplicate qualification: processes qualification event only once without duplicate rewards", async () => {
    const referrerId = await createTestUser("u-dupq-r");
    const refereeId = await createTestUser("u-dupq-e");
    const code = await ReferralService.ensureReferralCode(referrerId);

    await ReferralService.applyReferral(refereeId, code);

    // 1st qualification
    await ReferralService.evaluateQualification(refereeId, "FIRST_GAME");

    const referrerWalletAfter1 = await prisma.wallet.findUnique({ where: { userId: referrerId } });
    expect(referrerWalletAfter1?.bonusBalance).toBe(500);

    // 2nd qualification attempt on same referral
    await ReferralService.evaluateQualification(refereeId, "FIRST_GAME");

    const referrerWalletAfter2 = await prisma.wallet.findUnique({ where: { userId: referrerId } });
    expect(referrerWalletAfter2?.bonusBalance).toBe(500); // Unchanged, no duplicate bonus
  });

  // ---------------------------------------------------------------------------
  // 8. Reward Distribution Through Wallet Ledger
  // ---------------------------------------------------------------------------
  it("8. Reward ledger: accurately records bonus transactions for referrer and referee", async () => {
    const referrerId = await createTestUser("u-rw-r");
    const refereeId = await createTestUser("u-rw-e");
    const code = await ReferralService.ensureReferralCode(referrerId);

    await ReferralService.applyReferral(refereeId, code);
    await ReferralService.evaluateQualification(refereeId, "FIRST_GAME");

    const referrerTx = await prisma.transaction.findFirst({
      where: { userId: referrerId, referenceType: "REFERRAL" },
    });
    expect(referrerTx).toBeDefined();
    expect(referrerTx?.amount).toBe(500);

    const refereeTx = await prisma.transaction.findFirst({
      where: { userId: refereeId, referenceType: "REFERRAL" },
    });
    expect(refereeTx).toBeDefined();
    expect(refereeTx?.amount).toBe(250);
  });

  // ---------------------------------------------------------------------------
  // 9. Referral Reversal Workflow
  // ---------------------------------------------------------------------------
  it("9. Reversal: executes compensating transaction when referral reward is reversed", async () => {
    const adminId = await createTestUser("u-rev-admin");
    const referrerId = await createTestUser("u-rev-r");
    const refereeId = await createTestUser("u-rev-e");
    const code = await ReferralService.ensureReferralCode(referrerId);

    await ReferralService.applyReferral(refereeId, code);
    await ReferralService.evaluateQualification(refereeId, "FIRST_GAME");

    const ref = await prisma.referral.findUnique({ where: { referredUserId: refereeId } });
    expect(ref?.status).toBe("REWARDED");

    // Admin reverses referral
    await ReferralService.reverseReferral(ref!.id, adminId, "Disqualified referee due to multi-account abuse");

    const updatedRef = await prisma.referral.findUnique({ where: { id: ref!.id } });
    expect(updatedRef?.status).toBe("REVERSED");
    expect(updatedRef?.reversalReason).toContain("multi-account abuse");

    // Check compensating transaction
    const reversalTx = await prisma.transaction.findFirst({
      where: { userId: referrerId, referenceType: "REVERSAL" },
    });
    expect(reversalTx).toBeDefined();
    expect(reversalTx?.type).toBe("DEBIT");
    expect(reversalTx?.amount).toBe(500);

    const auditEntry = await prisma.auditLog.findFirst({
      where: { actorId: adminId, action: "referral.reversed" },
    });
    expect(auditEntry).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 10. Rate Limiting Enforcement
  // ---------------------------------------------------------------------------
  it("10. Rate limiting: enforces sliding window throttling on excessive referral attempts", async () => {
    const userId = await createTestUser("u-rl-user");

    // Consume all tokens
    for (let i = 0; i < 10; i++) {
      RateLimitService.checkRateLimit(userId, "REFERRAL");
    }

    // 11th request must be rate limited
    await expect(
      ReferralService.applyReferral(userId, "SOMECODE")
    ).rejects.toThrowError(/Too many referral attempts/i);
  });

  // ---------------------------------------------------------------------------
  // 11. Suspicious Referral Fraud Signal Detection
  // ---------------------------------------------------------------------------
  it("11. Fraud signal: triggers security alert on abnormal referral velocity", async () => {
    const referrerId = await createTestUser("u-fraud-r");
    const code = await ReferralService.ensureReferralCode(referrerId);

    // Create 10 referrals rapidly in the database for this referrer
    for (let i = 0; i < 10; i++) {
      const dummyId = await createTestUser(`u-bot-${i}`);
      await prisma.referral.create({
        data: {
          code,
          referrerId,
          referredUserId: dummyId,
          status: "PENDING",
          commission: 500,
        },
      });
    }

    const nextReferee = await createTestUser("u-next-ref");
    await ReferralService.applyReferral(nextReferee, code);

    const alerts = await SuspiciousActivityService.listAlerts({
      userId: referrerId,
      type: "REFERRAL_VELOCITY",
    });
    expect(alerts.items.length).toBeGreaterThanOrEqual(1);
    expect(alerts.items[0].severity).toBe("HIGH");
  });

  // ---------------------------------------------------------------------------
  // 12. Admin Dashboard Statistics Aggregation
  // ---------------------------------------------------------------------------
  it("12. Admin stats: aggregates referrals, conversion rates, and top referrers", async () => {
    const referrerId = await createTestUser("u-stat-r");
    const refereeId = await createTestUser("u-stat-e");
    const code = await ReferralService.ensureReferralCode(referrerId);

    await ReferralService.applyReferral(refereeId, code);
    await ReferralService.evaluateQualification(refereeId, "FIRST_GAME");

    const stats = await ReferralService.getAdminReferralStats();
    expect(stats).toBeDefined();
    expect(stats.totalReferrals).toBeGreaterThanOrEqual(1);
    expect(stats.rewardedReferrals).toBeGreaterThanOrEqual(1);
    expect(stats.totalRewardsDistributed).toBeGreaterThanOrEqual(500);
    expect(typeof stats.conversionRate).toBe("number");
  });

  // ---------------------------------------------------------------------------
  // 13. Admin Configuration Update with RBAC and Audit Trail
  // ---------------------------------------------------------------------------
  it("13. Admin config: updates campaign settings and logs audit trail", async () => {
    const adminId = await createTestUser("u-cfg-admin");

    const updated = await ReferralService.adminUpdateSettings(
      {
        referrerReward: 800,
        referredReward: 400,
        qualificationRule: "FIRST_WIN",
      },
      adminId
    );

    expect(updated.referrerReward).toBe(800);
    expect(updated.referredReward).toBe(400);
    expect(updated.qualificationRule).toBe("FIRST_WIN");

    const auditEntry = await prisma.auditLog.findFirst({
      where: { actorId: adminId, action: "referral.settings_updated" },
    });
    expect(auditEntry).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 14. Real-time Notification Delivery
  // ---------------------------------------------------------------------------
  it("14. Notifications: dispatches real-time notification to referrer upon qualification", async () => {
    const referrerId = await createTestUser("u-notif-r");
    const refereeId = await createTestUser("u-notif-e");
    const code = await ReferralService.ensureReferralCode(referrerId);

    await ReferralService.applyReferral(refereeId, code);
    await ReferralService.evaluateQualification(refereeId, "FIRST_GAME");

    const notifs = await prisma.appNotification.findMany({
      where: { userId: referrerId, type: NotificationType.REFERRAL },
    });
    expect(notifs.length).toBeGreaterThanOrEqual(1);
    expect(notifs[0].title).toContain("Referral Reward Earned");
  });
});
