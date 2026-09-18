import { describe, it, expect, afterEach } from "vitest";
import { prisma, PenaltyType, PenaltyStatus } from "@gaming-hub/db";
import { ReferralService } from "../referrals";
import { AffiliateService } from "../affiliateService";
import { WalletTransactionService } from "../walletTransactionService";
import { updateCategorySettings } from "../settings";

describe("Affiliate Fraud Protection, Risk Controls & Operational Limits", () => {
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
    // Reset referral / affiliate settings
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
      affiliateMinEligibleDeposit: 0,
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
      await prisma.playerPenalty
        .deleteMany({ where: { userId: { in: createdUserIds } } })
        .catch(() => undefined);
      await prisma.loginSession
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

  // TEST 1: Self-referral protection
  it("TEST 1: Self-referral is strictly rejected with 400 SELF_REFERRAL_NOT_ALLOWED and risk event recorded", async () => {
    const userA = await createTestUser("self-ref", 0, 0);
    const codeA = await ReferralService.ensureReferralCode(userA);

    let errorThrown: any = null;
    try {
      await ReferralService.applyReferral(
        userA,
        codeA,
        { ip: "192.168.1.100", userAgent: "Mozilla/5.0 TestBrowser" }
      );
    } catch (err) {
      errorThrown = err;
    }

    expect(errorThrown).not.toBeNull();
    expect(errorThrown.code).toBe("SELF_REFERRAL_NOT_ALLOWED");

    // Verify no referral record created
    const refCount = await prisma.referral.count({
      where: { referredUserId: userA },
    });
    expect(refCount).toBe(0);

    // Verify ReferralRiskEvent recorded
    const riskEvent = await prisma.referralRiskEvent.findFirst({
      where: {
        userId: userA,
        type: "SELF_REFERRAL_ATTEMPT",
      },
    });
    expect(riskEvent).not.toBeNull();
    expect(riskEvent?.severity).toBe("MEDIUM");
  });

  // TEST 2: One referrer per user rule
  it("TEST 2: User can only have one referrer; second attempt fails with ALREADY_REFERRED", async () => {
    const userA = await createTestUser("ref-a", 0, 0);
    const userB = await createTestUser("ref-b", 0, 0);
    const userC = await createTestUser("ref-c", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);
    const codeC = await ReferralService.ensureReferralCode(userC);

    // B applies A's code -> succeeds
    const ref1 = await ReferralService.applyReferral(userB, codeA, { ip: "192.168.1.101" });
    expect(ref1.applied).toBe(true);

    const currentRef = await prisma.referral.findUnique({
      where: { referredUserId: userB },
    });
    expect(currentRef?.referrerId).toBe(userA);

    // B attempts to apply C's code -> rejected
    let errorThrown: any = null;
    try {
      await ReferralService.applyReferral(userB, codeC, { ip: "192.168.1.101" });
    } catch (err) {
      errorThrown = err;
    }

    expect(errorThrown).not.toBeNull();
    expect(errorThrown.code).toBe("ALREADY_REFERRED");

    // Verify existing relationship unchanged
    const afterRef = await prisma.referral.findUnique({
      where: { referredUserId: userB },
    });
    expect(afterRef?.referrerId).toBe(userA);

    // Verify MULTIPLE_REFERRER_ATTEMPT risk event logged
    const risk = await prisma.referralRiskEvent.findFirst({
      where: {
        userId: userB,
        type: "MULTIPLE_REFERRER_ATTEMPT",
      },
    });
    expect(risk).not.toBeNull();
  });

  // TEST 3: Privacy-conscious hashed IP & device detection
  it("TEST 3: Same IP or device flags risk events with privacy-conscious SHA256 hashes", async () => {
    const userA = await createTestUser("shared-net-a", 0, 0);
    const userB = await createTestUser("shared-net-b", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);

    // A signs in / creates record with IP and device
    await prisma.loginSession.create({
      data: {
        userId: userA,
        ip: "203.0.113.42",
        deviceName: "SameDeviceTest/1.0",
        tokenHash: "dummy-hash-a",
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    // B applies A's code from the exact same IP and device
    await ReferralService.applyReferral(
      userB,
      codeA,
      {
        ip: "203.0.113.42",
        deviceId: "SameDeviceTest/1.0",
      }
    );

    const referral = await prisma.referral.findUniqueOrThrow({
      where: { referredUserId: userB },
    });

    // Verify risk events logged for IP & device match
    const ipRisk = await prisma.referralRiskEvent.findFirst({
      where: {
        referralId: referral.id,
        type: "REFERRER_AND_REFEREE_SAME_IP",
      },
    });
    expect(ipRisk).not.toBeNull();
    expect(ipRisk?.severity).toBe("MEDIUM");
    expect((ipRisk?.metadata as any)?.hashedIp).toBeDefined();

    const deviceRisk = await prisma.referralRiskEvent.findFirst({
      where: {
        referralId: referral.id,
        type: "REFERRER_AND_REFEREE_SAME_DEVICE",
      },
    });
    expect(deviceRisk).not.toBeNull();
    expect(deviceRisk?.severity).toBe("HIGH");
    expect((deviceRisk?.metadata as any)?.hashedDevice).toBeDefined();
  });

  // TEST 4: Per-referral affiliate block
  it("TEST 4: Blocked referral affiliate suppresses commissions while referee deposit succeeds 100%", async () => {
    const userA = await createTestUser("referrer-blocked", 0, 0);
    const userB = await createTestUser("referee-blocked", 0, 0);
    const adminUser = await createTestUser("admin-operator", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);
    await ReferralService.applyReferral(userB, codeA);

    const referral = await prisma.referral.findUniqueOrThrow({
      where: { referredUserId: userB },
    });

    // Admin blocks this referral link from earning affiliate commissions
    await AffiliateService.blockReferralAffiliate(
      referral.id,
      adminUser,
      "Multi-account abuse pattern detected"
    );

    const blockedRef = await prisma.referral.findUnique({
      where: { id: referral.id },
    });
    expect(blockedRef?.affiliateBlockedAt).not.toBeNull();
    expect(blockedRef?.affiliateBlockedReason).toBe("Multi-account abuse pattern detected");

    // Referee deposits 1,000 MAIN
    const tx = await simulateDeposit(userB, 1000);
    expect(tx.amount).toBe(1000);

    // Referee receives 100% of their MAIN deposit
    const walletB = await prisma.wallet.findUnique({ where: { userId: userB } });
    expect(walletB?.balance).toBe(1000);

    // Referrer receives 0 commission
    const walletA = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletA?.bonusBalance).toBe(0);

    const comms = await prisma.affiliateCommission.findMany({
      where: { referralId: referral.id },
    });
    expect(comms.length).toBe(0);

    // Admin unblocks referral
    await AffiliateService.unblockReferralAffiliate(referral.id, adminUser);
    const unblockedRef = await prisma.referral.findUnique({
      where: { id: referral.id },
    });
    expect(unblockedRef?.affiliateBlockedAt).toBeNull();

    // Next deposit of 1,000 MAIN now generates commission
    await simulateDeposit(userB, 1000);

    const walletAAfter = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletAAfter?.bonusBalance).toBe(50); // 5% of 1,000
  });

  // TEST 5: Referrer account suspension suppresses commissions
  it("TEST 5: Suspended / penalized referrer account skips affiliate payout", async () => {
    const userA = await createTestUser("penalized-user", 0, 0);
    const userB = await createTestUser("clean-referee", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);
    await ReferralService.applyReferral(userB, codeA);

    // Add active penalty CHEATING to userA
    await prisma.playerPenalty.create({
      data: {
        userId: userA,
        type: PenaltyType.CHEATING,
        status: PenaltyStatus.ACTIVE,
        reason: "Detected suspicious gameplay",
      },
    });

    // User B deposits 1,000 MAIN
    await simulateDeposit(userB, 1000);

    // Referee deposit succeeded 100%
    const walletB = await prisma.wallet.findUnique({ where: { userId: userB } });
    expect(walletB?.balance).toBe(1000);

    // Referrer receives 0 commission due to active penalty
    const walletA = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletA?.bonusBalance).toBe(0);

    const commCount = await prisma.affiliateCommission.count({
      where: { referrerId: userA },
    });
    expect(commCount).toBe(0);
  });

  // TEST 6: Safe reversal with sufficient BONUS balance
  it("TEST 6: Reversal debits BONUS, creates compensating transaction, and preserves historical record", async () => {
    const userA = await createTestUser("rev-suff-a", 0, 0);
    const userB = await createTestUser("rev-suff-b", 0, 0);
    const adminUser = await createTestUser("rev-admin", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);
    await ReferralService.applyReferral(userB, codeA);

    // B deposits 2,000 MAIN -> A gets 100 BONUS (5%)
    await simulateDeposit(userB, 2000);

    const comm = await prisma.affiliateCommission.findFirst({
      where: { referrerId: userA },
    });
    expect(comm).not.toBeNull();
    expect(Number(comm?.commissionAmount)).toBe(100);

    const walletBefore = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletBefore?.bonusBalance).toBe(100);

    // Admin reverses commission
    const revResult = await AffiliateService.reverseCommission(
      comm!.id,
      adminUser,
      "Customer requested payment refund"
    );
    expect(revResult.status).toBe("REVERSED");

    // Wallet is debited 100 BONUS
    const walletAfter = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletAfter?.bonusBalance).toBe(0);

    // Historical commission record updated, not deleted
    const updatedComm = await prisma.affiliateCommission.findUnique({
      where: { id: comm!.id },
    });
    expect(updatedComm?.status).toBe("REVERSED");
    expect(updatedComm?.reversalReason).toBe("Customer requested payment refund");
    expect(updatedComm?.reversedAt).not.toBeNull();

    // Compensating transaction created
    const compTx = await prisma.transaction.findFirst({
      where: {
        userId: userA,
        referenceType: "AFFILIATE_COMMISSION_REVERSAL",
      },
    });
    expect(compTx).not.toBeNull();
    expect(compTx?.type).toBe("DEBIT");
    expect(Number(compTx?.amount)).toBe(100);

    // Second reversal is idempotent no-op
    const secondRev = await AffiliateService.reverseCommission(
      comm!.id,
      adminUser,
      "Duplicate reversal call"
    );
    expect(secondRev.status).toBe("REVERSED");
  });

  // TEST 7: Safe reversal with insufficient BONUS balance (clamped, ledger safe, unrecovered liability logged)
  it("TEST 7: Reversal with insufficient BONUS clamps to available balance, never drops negative, logs liability", async () => {
    const userA = await createTestUser("rev-insuff-a", 0, 0);
    const userB = await createTestUser("rev-insuff-b", 0, 0);
    const adminUser = await createTestUser("rev-admin-2", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);
    await ReferralService.applyReferral(userB, codeA);

    // B deposits 2,000 MAIN -> A receives 100 BONUS
    await simulateDeposit(userB, 2000);

    // A spends 80 BONUS on entry fee / gameplay, leaving only 20 BONUS
    await prisma.wallet.update({
      where: { userId: userA },
      data: { bonusBalance: 20 },
    });

    const walletBeforeRev = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletBeforeRev?.bonusBalance).toBe(20);

    const comm = await prisma.affiliateCommission.findFirst({
      where: { referrerId: userA },
    });

    // Admin reverses the 100 BONUS commission
    const revResult = await AffiliateService.reverseCommission(
      comm!.id,
      adminUser,
      "Fraudulent deposit charged back"
    );
    expect(revResult.status).toBe("REVERSED");

    // Wallet clamped to 0, NOT negative -80!
    const walletAfterRev = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletAfterRev?.bonusBalance).toBe(0);

    // Unrecovered reversal liability risk event logged
    const liabilityRisk = await prisma.referralRiskEvent.findFirst({
      where: {
        userId: userA,
        type: "UNRECOVERED_REVERSAL_LIABILITY",
      },
    });
    expect(liabilityRisk).not.toBeNull();
    expect((liabilityRisk?.metadata as any)?.liabilityAmount).toBe(80);
    expect(liabilityRisk?.severity).toBe("HIGH");
  });

  // TEST 8: Commission hold period
  it("TEST 8: Hold period keeps commission PENDING until matured, referee deposit is never delayed", async () => {
    const userA = await createTestUser("hold-referrer", 0, 0);
    const userB = await createTestUser("hold-referee", 0, 0);

    // Configure 60 minutes hold
    await updateCategorySettings("referral", {
      affiliateCommissionHoldMinutes: 60,
    });

    const codeA = await ReferralService.ensureReferralCode(userA);
    await ReferralService.applyReferral(userB, codeA);

    // User B deposits 1,000 MAIN
    await simulateDeposit(userB, 1000);

    // Referee receives 1,000 MAIN immediately
    const walletB = await prisma.wallet.findUnique({ where: { userId: userB } });
    expect(walletB?.balance).toBe(1000);

    // Referrer commission is created as PENDING, wallet not credited yet
    const comm = await prisma.affiliateCommission.findFirst({
      where: { referrerId: userA },
    });
    expect(comm).not.toBeNull();
    expect(comm?.status).toBe("PENDING");
    expect(comm?.heldUntil).not.toBeNull();
    expect(comm?.holdMinutes).toBe(60);

    const walletA = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletA?.bonusBalance).toBe(0);

    // Releasing held commissions before maturity does nothing
    const earlyRelease = await AffiliateService.releaseMaturedHeldCommissions();
    expect(earlyRelease.released).toBe(0);

    // Fast-forward heldUntil to past
    await prisma.affiliateCommission.update({
      where: { id: comm!.id },
      data: { heldUntil: new Date(Date.now() - 1000) },
    });

    // Now release matured commissions
    const maturedRelease = await AffiliateService.releaseMaturedHeldCommissions();
    expect(maturedRelease.released).toBe(1);

    // Commission status is now COMPLETED
    const updatedComm = await prisma.affiliateCommission.findUnique({
      where: { id: comm!.id },
    });
    expect(updatedComm?.status).toBe("COMPLETED");
    expect(updatedComm?.releasedAt).not.toBeNull();

    // Wallet is now credited with the 50 BONUS
    const walletAAfter = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletAAfter?.bonusBalance).toBe(50);
  });

  // TEST 9: Velocity limits (min eligible deposit, max commission per deposit, daily cap)
  it("TEST 9: Enforces minDepositEligible, maxAffiliateCommissionPerDeposit, and affiliateDailyCommissionCap", async () => {
    const userA = await createTestUser("caps-referrer", 0, 0);
    const userB = await createTestUser("caps-referee", 0, 0);

    // Configure limits:
    // Min deposit: 500 MAIN
    // Max commission per deposit: 50 BONUS
    // Daily cap: 75 BONUS
    await updateCategorySettings("referral", {
      affiliateDepositPercent: 10, // 10%
      minDepositEligible: 500,
      affiliateMinEligibleDeposit: 500,
      maxAffiliateCommissionPerDeposit: 50,
      affiliateMaxCommissionPerDeposit: 50,
      affiliateDailyCommissionCap: 75,
    });

    const codeA = await ReferralService.ensureReferralCode(userA);
    await ReferralService.applyReferral(userB, codeA);

    // Deposit 1: 300 MAIN (below min 500) -> 0 commission
    await simulateDeposit(userB, 300);
    let walletA = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletA?.bonusBalance).toBe(0);

    // Deposit 2: 1,000 MAIN (10% = 100, capped at max 50)
    await simulateDeposit(userB, 1000);
    walletA = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletA?.bonusBalance).toBe(50);

    // Deposit 3: 1,000 MAIN (10% = 100, capped at 50, but daily cap 75 allows only 25 more)
    await simulateDeposit(userB, 1000);
    walletA = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletA?.bonusBalance).toBe(75); // 50 + 25 = 75

    // Deposit 4: 1,000 MAIN (daily cap already saturated at 75) -> 0 additional commission
    await simulateDeposit(userB, 1000);
    walletA = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletA?.bonusBalance).toBe(75);
  });
});
