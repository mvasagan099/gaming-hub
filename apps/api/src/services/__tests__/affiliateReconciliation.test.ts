import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { ReferralService } from "../referrals";
import { AffiliateService } from "../affiliateService";
import { WalletTransactionService } from "../walletTransactionService";
import { updateCategorySettings } from "../settings";

describe("Affiliate Reconciliation & Ledger Integrity", () => {
  const createdUserIds: string[] = [];
  const createdCommissionIds: string[] = [];

  async function createTestUser(prefix: string, initialMain = 0, initialBonus = 0) {
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
            balance: initialMain,
            bonusBalance: initialBonus,
          },
        },
        profile: {
          create: {
            xp: 100,
            level: 1,
          },
        },
      },
    });

    return userId;
  }

  async function simulateDeposit(userId: string, amount: number) {
    let txRecord: any;
    await prisma.$transaction(async (tx) => {
      const wallet = await WalletTransactionService.createDeposit(tx, {
        userId,
        amount,
        meta: { paymentMethod: "CARD" },
      });
      txRecord = (wallet as any)._transaction;
    });
    await WalletTransactionService.onDepositCompleted({
      userId,
      amount,
      transactionId: txRecord.id,
    });
    return txRecord;
  }

  afterEach(async () => {
    await updateCategorySettings("referral", {
      enabled: true,
      affiliateEnabled: true,
      affiliateMode: "CONTINUOUS",
      affiliateDepositPercent: 5,
      referrerFirstDepositBonus: 0,
      referrerSignupBonus: 0,
      refereeSignupBonus: 0,
      referrerReward: 0,
      referredReward: 0,
      maxAffiliateCommissionPerDeposit: 0,
      affiliateDailyCommissionCap: 0,
      affiliateMonthlyCommissionCap: 0,
      minDepositEligible: 0,
      affiliateCommissionHoldMinutes: 0,
      qualificationRule: "FIRST_DEPOSIT",
      affiliateOnFirstDeposit: true,
    }).catch(() => undefined);

    if (createdCommissionIds.length > 0) {
      await prisma.affiliateCommission
        .deleteMany({ where: { id: { in: createdCommissionIds } } })
        .catch(() => undefined);
      createdCommissionIds.length = 0;
    }

    if (createdUserIds.length > 0) {
      await prisma.referralRiskEvent
        .deleteMany({ where: { userId: { in: createdUserIds } } })
        .catch(() => undefined);
      await prisma.affiliateCommission
        .deleteMany({
          where: {
            OR: [
              { referrerId: { in: createdUserIds } },
              { referredUserId: { in: createdUserIds } },
            ],
          },
        })
        .catch(() => undefined);
      await prisma.appNotification
        .deleteMany({ where: { userId: { in: createdUserIds } } })
        .catch(() => undefined);
      await prisma.transaction
        .deleteMany({ where: { userId: { in: createdUserIds } } })
        .catch(() => undefined);
      await prisma.referral
        .deleteMany({
          where: {
            OR: [
              { referrerId: { in: createdUserIds } },
              { referredUserId: { in: createdUserIds } },
            ],
          },
        })
        .catch(() => undefined);
      await prisma.profile
        .deleteMany({ where: { userId: { in: createdUserIds } } })
        .catch(() => undefined);
      await prisma.wallet
        .deleteMany({ where: { userId: { in: createdUserIds } } })
        .catch(() => undefined);
      await prisma.user
        .deleteMany({ where: { id: { in: createdUserIds } } })
        .catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  it("TEST 1: Normal ledger has zero missing commissions and zero duplicates", async () => {
    const userA = await createTestUser("reconcile-a", 0, 0);
    const userB = await createTestUser("reconcile-b", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);
    await ReferralService.applyReferral(userB, codeA);

    // Process a regular deposit
    await simulateDeposit(userB, 1000);

    const result = await AffiliateService.reconcileCommissions({
      dryRun: true,
      userId: userB,
    });
    expect(result.dryRun).toBe(true);
    expect(result.missing).toBe(0);
    expect(result.duplicates).toBe(0);
    expect(result.repaired).toBe(0);
  });

  it("TEST 2: Dry-run reconciliation detects missing commissions without modifying the database", async () => {
    const userA = await createTestUser("recon-dry-a", 0, 0);
    const userB = await createTestUser("recon-dry-b", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);
    await ReferralService.applyReferral(userB, codeA);

    // Create a qualifying deposit transaction
    await simulateDeposit(userB, 1000);

    // Simulate an anomaly where commission record was lost
    const comm = await prisma.affiliateCommission.findFirst({
      where: { referrerId: userA },
    });
    expect(comm).not.toBeNull();
    await prisma.affiliateCommission.delete({
      where: { id: comm!.id },
    });

    // Run reconciliation in dryRun mode
    const dryRunResult = await AffiliateService.reconcileCommissions({
      dryRun: true,
      userId: userB,
    });
    expect(dryRunResult.dryRun).toBe(true);
    expect(dryRunResult.missing).toBe(1);
    expect(dryRunResult.repaired).toBe(0);

    // Verify DB was NOT modified: commission record is still missing
    const commCheck = await prisma.affiliateCommission.findFirst({
      where: { referrerId: userA },
    });
    expect(commCheck).toBeNull();
  });

  it("TEST 3: Active repair reconciliation repairs missing commission exactly once", async () => {
    const userA = await createTestUser("recon-live-a", 0, 0);
    const userB = await createTestUser("recon-live-b", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);
    await ReferralService.applyReferral(userB, codeA);

    // Process qualifying deposit
    await simulateDeposit(userB, 1000);

    // Delete commission and reset referrer's wallet to simulate missing record
    const comm = await prisma.affiliateCommission.findFirst({
      where: { referrerId: userA },
    });
    expect(comm).not.toBeNull();
    await prisma.affiliateCommission.delete({
      where: { id: comm!.id },
    });
    await prisma.wallet.update({
      where: { userId: userA },
      data: { bonusBalance: 0 },
    });

    // Run active repair
    const repairResult = await AffiliateService.reconcileCommissions({
      dryRun: false,
      userId: userB,
    });
    expect(repairResult.dryRun).toBe(false);
    expect(repairResult.missing).toBe(1);
    expect(repairResult.repaired).toBe(1);

    // Verify commission was recreated
    const restoredComm = await prisma.affiliateCommission.findFirst({
      where: { referrerId: userA },
    });
    expect(restoredComm).not.toBeNull();
    expect(restoredComm?.status).toBe("COMPLETED");

    // Subsequent dry-run finds 0 missing
    const postCheck = await AffiliateService.reconcileCommissions({
      dryRun: true,
      userId: userB,
    });
    expect(postCheck.missing).toBe(0);
  });
});
