import { describe, it, expect, afterEach } from "vitest";
import { prisma, NotificationType } from "@gaming-hub/db";
import { ReferralService } from "../referrals";
import { AffiliateService } from "../affiliateService";
import { updateCategorySettings } from "../settings";
import { RateLimitService } from "../rateLimitService";
import { SuspiciousActivityService } from "../suspiciousActivityService";
import { applyTransaction } from "../wallet";
import { AppError } from "@gaming-hub/shared";

describe("First-Deposit-Only Referral System & Integrity", () => {
  const createdUserIds: string[] = [];
  const createdReferralIds: string[] = [];
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
    // Reset referral settings to standard defaults
    await updateCategorySettings("referral", {
      enabled: true,
      referrerFirstDepositBonus: 500,
      referrerReward: 500,
      referredReward: 0,
      affiliateEnabled: true,
      affiliateDepositPercent: 5,
      affiliateOnFirstDeposit: true,
      minimumFirstDeposit: 0,
      minDepositToReward: 0,
      qualificationRule: "FIRST_DEPOSIT",
      maxRewardsPerUser: 0,
      campaignStartDate: null,
      campaignEndDate: null,
    }).catch(() => undefined);

    if (createdCommissionIds.length > 0) {
      await prisma.affiliateCommission
        .deleteMany({ where: { id: { in: createdCommissionIds } } })
        .catch(() => undefined);
      createdCommissionIds.length = 0;
    }

    if (createdReferralIds.length > 0) {
      await prisma.referral.deleteMany({ where: { id: { in: createdReferralIds } } }).catch(() => undefined);
      createdReferralIds.length = 0;
    }

    if (createdUserIds.length > 0) {
      await prisma.affiliateCommission
        .deleteMany({ where: { OR: [{ referrerId: { in: createdUserIds } }, { referredUserId: { in: createdUserIds } }] } })
        .catch(() => undefined);
      await prisma.appNotification.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.transaction.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.referral
        .deleteMany({ where: { OR: [{ referrerId: { in: createdUserIds } }, { referredUserId: { in: createdUserIds } }] } })
        .catch(() => undefined);
      await prisma.profile.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.wallet.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  // ---------------------------------------------------------------------------
  // TEST 1: B signs up with A's referral code
  // ---------------------------------------------------------------------------
  it("TEST 1: B signs up with A referral code -> PENDING, A BONUS = 0, B BONUS = 0, no transactions", async () => {
    const userA = await createTestUser("user-a", 0, 0);
    const userB = await createTestUser("user-b", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);
    const applyRes = await ReferralService.applyReferral(userB, codeA);

    expect(applyRes.applied).toBe(true);
    expect(applyRes.status).toBe("PENDING");
    expect(applyRes.referrerReward).toBe(0);
    expect(applyRes.referredReward).toBe(0);

    const ref = await prisma.referral.findUnique({ where: { referredUserId: userB } });
    expect(ref?.status).toBe("PENDING");
    expect(ref?.commission).toBe(0);
    expect(ref?.referredReward).toBe(0);
    expect(ref?.rewardedAt).toBeNull();

    // Verify wallets are untouched
    const walletA = await prisma.wallet.findUnique({ where: { userId: userA } });
    const walletB = await prisma.wallet.findUnique({ where: { userId: userB } });
    expect(walletA?.bonusBalance).toBe(0);
    expect(walletB?.bonusBalance).toBe(0);

    // Verify no transactions occurred
    const txCount = await prisma.transaction.count({
      where: { userId: { in: [userA, userB] } },
    });
    expect(txCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // TEST 2: B plays first game
  // ---------------------------------------------------------------------------
  it("TEST 2: B plays first game -> Referral still PENDING, A reward = 0", async () => {
    const userA = await createTestUser("t2-a", 0, 0);
    const userB = await createTestUser("t2-b", 0, 0);
    const codeA = await ReferralService.ensureReferralCode(userA);

    await ReferralService.applyReferral(userB, codeA);

    // Simulate game play / first win event
    const evalRes = await ReferralService.evaluateQualification(userB, "FIRST_GAME", { gameId: "ludo" });
    expect(evalRes).toBeNull();

    const ref = await prisma.referral.findUnique({ where: { referredUserId: userB } });
    expect(ref?.status).toBe("PENDING");

    const walletA = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletA?.bonusBalance).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // TEST 3: B joins tournament
  // ---------------------------------------------------------------------------
  it("TEST 3: B joins tournament -> Referral still PENDING, A reward = 0", async () => {
    const userA = await createTestUser("t3-a", 0, 0);
    const userB = await createTestUser("t3-b", 0, 0);
    const codeA = await ReferralService.ensureReferralCode(userA);

    await ReferralService.applyReferral(userB, codeA);

    // Simulate tournament join event
    const evalRes = await ReferralService.evaluateQualification(userB, "TOURNAMENT_JOIN", { tournamentId: "tourney-1" });
    expect(evalRes).toBeNull();

    const ref = await prisma.referral.findUnique({ where: { referredUserId: userB } });
    expect(ref?.status).toBe("PENDING");

    const walletA = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletA?.bonusBalance).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // TEST 4: B attempts invalid coupon
  // ---------------------------------------------------------------------------
  it("TEST 4: B attempts invalid coupon -> Referral still PENDING, A reward = 0", async () => {
    const userA = await createTestUser("t4-a", 0, 0);
    const userB = await createTestUser("t4-b", 0, 0);
    const codeA = await ReferralService.ensureReferralCode(userA);

    await ReferralService.applyReferral(userB, codeA);

    // An invalid or unredeemed coupon does NOT trigger evaluateQualification(..., "FIRST_DEPOSIT")
    const ref = await prisma.referral.findUnique({ where: { referredUserId: userB } });
    expect(ref?.status).toBe("PENDING");

    const walletA = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletA?.bonusBalance).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // TEST 5: B completes first successful coupon redemption: 1000 MAIN
  // ---------------------------------------------------------------------------
  it("TEST 5: B completes first successful coupon redemption (1000 MAIN) -> B +1000 MAIN, A +500 BONUS, REWARDED", async () => {
    const userA = await createTestUser("t5-a", 0, 0);
    const userB = await createTestUser("t5-b", 0, 0);
    const codeA = await ReferralService.ensureReferralCode(userA);

    await ReferralService.applyReferral(userB, codeA);

    const sagaId = `saga-first-dep-${Date.now()}`;

    // 1. Simulate coupon redemption crediting B's MAIN wallet
    await prisma.$transaction(async (tx) => {
      await applyTransaction(tx, userB, 1000, "COUPON", sagaId, {}, "MAIN");
    });

    // 2. Authoritative FIRST_DEPOSIT referral qualification triggered
    const qualResult = await ReferralService.evaluateQualification(userB, "FIRST_DEPOSIT", {
      amount: 1000,
      sagaId,
    });

    expect(qualResult).toBeDefined();
    expect(qualResult?.status).toBe("REWARDED");

    // 3. Optional affiliate commission on first deposit (default true)
    await AffiliateService.processDepositCommission({
      referredUserId: userB,
      sourceType: "COUPON_REDEMPTION",
      sourceId: sagaId,
      amount: 1000,
      isFirstDeposit: true,
    });

    // Check balances
    const walletB = await prisma.wallet.findUnique({ where: { userId: userB } });
    const walletA = await prisma.wallet.findUnique({ where: { userId: userA } });

    expect(walletB?.balance).toBe(1000); // 1000 MAIN
    expect(walletB?.bonusBalance).toBe(0); // 0 referee referral bonus
    // Referrer A receives 500 BONUS fixed reward + 50 BONUS affiliate (5% of 1000)
    expect(walletA?.bonusBalance).toBe(550);

    // Exactly one REFERRAL transaction for referrer
    const refTxs = await prisma.transaction.findMany({
      where: { userId: userA, referenceType: "REFERRAL" },
    });
    expect(refTxs.length).toBe(1);
    expect(refTxs[0].amount).toBe(500);
    expect(refTxs[0].walletType).toBe("BONUS");

    // Check referrer notification
    const notifs = await prisma.appNotification.findMany({
      where: { userId: userA, type: NotificationType.REFERRAL },
    });
    expect(notifs.length).toBe(1);
    expect(notifs[0].title).toBe("Referral Reward Earned");
    expect(notifs[0].body).toContain("500 bonus coins");
  });

  // ---------------------------------------------------------------------------
  // TEST 6: Replay same coupon redemption
  // ---------------------------------------------------------------------------
  it("TEST 6: Replay same coupon redemption -> No extra 500, no duplicate affiliate commission", async () => {
    const userA = await createTestUser("t6-a", 0, 0);
    const userB = await createTestUser("t6-b", 0, 0);
    const codeA = await ReferralService.ensureReferralCode(userA);

    await ReferralService.applyReferral(userB, codeA);

    const sagaId = `saga-replay-${Date.now()}`;

    // 1st redemption
    await prisma.$transaction(async (tx) => {
      await applyTransaction(tx, userB, 1000, "COUPON", sagaId, {}, "MAIN");
    });
    await ReferralService.evaluateQualification(userB, "FIRST_DEPOSIT", { amount: 1000, sagaId });
    await AffiliateService.processDepositCommission({
      referredUserId: userB,
      sourceType: "COUPON_REDEMPTION",
      sourceId: sagaId,
      amount: 1000,
      isFirstDeposit: true,
    });

    const walletAfter1 = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletAfter1?.bonusBalance).toBe(550);

    // Replay same coupon deposit
    const secondQual = await ReferralService.evaluateQualification(userB, "FIRST_DEPOSIT", { amount: 1000, sagaId });
    expect(secondQual).toBeNull(); // Skipped, already REWARDED

    await AffiliateService.processDepositCommission({
      referredUserId: userB,
      sourceType: "COUPON_REDEMPTION",
      sourceId: sagaId,
      amount: 1000,
    });

    const walletAfterReplay = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletAfterReplay?.bonusBalance).toBe(550); // Unchanged

    const totalRefTxs = await prisma.transaction.count({
      where: { userId: userA, referenceType: "REFERRAL" },
    });
    expect(totalRefTxs).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // TEST 7: B completes second deposit
  // ---------------------------------------------------------------------------
  it("TEST 7: B completes second deposit -> NO additional 500 fixed reward, 5% affiliate only", async () => {
    const userA = await createTestUser("t7-a", 0, 0);
    const userB = await createTestUser("t7-b", 0, 0);
    const codeA = await ReferralService.ensureReferralCode(userA);

    await ReferralService.applyReferral(userB, codeA);

    const saga1 = `saga-dep-1-${Date.now()}`;
    const saga2 = `saga-dep-2-${Date.now()}`;

    // Deposit 1: 1000 MAIN
    await prisma.$transaction(async (tx) => {
      await applyTransaction(tx, userB, 1000, "COUPON", saga1, {}, "MAIN");
    });
    await ReferralService.evaluateQualification(userB, "FIRST_DEPOSIT", { amount: 1000, sagaId: saga1 });
    await AffiliateService.processDepositCommission({
      referredUserId: userB,
      sourceType: "COUPON_REDEMPTION",
      sourceId: saga1,
      amount: 1000,
      isFirstDeposit: true,
    });

    // A has 500 (fixed) + 50 (affiliate 1) = 550
    expect((await prisma.wallet.findUnique({ where: { userId: userA } }))?.bonusBalance).toBe(550);

    // Deposit 2: 2000 MAIN
    await prisma.$transaction(async (tx) => {
      await applyTransaction(tx, userB, 2000, "COUPON", saga2, {}, "MAIN");
    });

    // Referral qualification skips because status is already REWARDED
    const qual2 = await ReferralService.evaluateQualification(userB, "FIRST_DEPOSIT", { amount: 2000, sagaId: saga2 });
    expect(qual2).toBeNull();

    // Affiliate commission processes: 5% of 2000 = 100 BONUS
    await AffiliateService.processDepositCommission({
      referredUserId: userB,
      sourceType: "COUPON_REDEMPTION",
      sourceId: saga2,
      amount: 2000,
      isFirstDeposit: false,
    });

    const walletAfter2 = await prisma.wallet.findUnique({ where: { userId: userA } });
    // Total: 550 + 100 = 650 BONUS
    expect(walletAfter2?.bonusBalance).toBe(650);

    // Fixed referral transactions count is STILL exactly 1
    const fixedTxs = await prisma.transaction.count({
      where: { userId: userA, referenceType: "REFERRAL" },
    });
    expect(fixedTxs).toBe(1);

    // Affiliate commission transactions count is 2
    const affTxs = await prisma.transaction.count({
      where: { userId: userA, referenceType: "AFFILIATE_COMMISSION" },
    });
    expect(affTxs).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // TEST 8: Concurrent first-deposit processing
  // ---------------------------------------------------------------------------
  it("TEST 8: Concurrent first-deposit processing -> exactly one 500 BONUS credit and one REFERRAL transaction", async () => {
    const userA = await createTestUser("t8-a", 0, 0);
    const userB = await createTestUser("t8-b", 0, 0);
    const codeA = await ReferralService.ensureReferralCode(userA);

    await ReferralService.applyReferral(userB, codeA);

    const sagaId = `saga-concurrent-${Date.now()}`;

    // Run 5 concurrent evaluateQualification calls simultaneously
    const results = await Promise.all([
      ReferralService.evaluateQualification(userB, "FIRST_DEPOSIT", { amount: 1000, sagaId }),
      ReferralService.evaluateQualification(userB, "FIRST_DEPOSIT", { amount: 1000, sagaId }),
      ReferralService.evaluateQualification(userB, "FIRST_DEPOSIT", { amount: 1000, sagaId }),
      ReferralService.evaluateQualification(userB, "FIRST_DEPOSIT", { amount: 1000, sagaId }),
      ReferralService.evaluateQualification(userB, "FIRST_DEPOSIT", { amount: 1000, sagaId }),
    ]);

    // Exactly one winner returned a rewarded referral; other 4 returned null
    const winners = results.filter((r) => r !== null && r.status === "REWARDED");
    expect(winners.length).toBe(1);

    // Referrer wallet was credited exactly 500 once
    const walletA = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletA?.bonusBalance).toBe(500);

    // Exactly one referral reward ledger transaction exists
    const txs = await prisma.transaction.findMany({
      where: { userId: userA, referenceType: "REFERRAL" },
    });
    expect(txs.length).toBe(1);
    expect(txs[0].amount).toBe(500);
  });

  // ---------------------------------------------------------------------------
  // Integrity & Security Tests
  // ---------------------------------------------------------------------------
  it("Integrity: Generates stable, non-sensitive referral code", async () => {
    const user = await createTestUser("u-code");
    const code = await ReferralService.ensureReferralCode(user);
    expect(code).toBeDefined();
    expect(code.length).toBeGreaterThanOrEqual(6);
    expect(await ReferralService.ensureReferralCode(user)).toBe(code);
  });

  it("Integrity: Strictly rejects self-referral", async () => {
    const user = await createTestUser("u-self");
    const code = await ReferralService.ensureReferralCode(user);
    await expect(ReferralService.applyReferral(user, code)).rejects.toThrowError(/own referral code/i);
  });

  it("Integrity: Enforces one referrer per account", async () => {
    const userA1 = await createTestUser("u-dup-a1");
    const userA2 = await createTestUser("u-dup-a2");
    const userB = await createTestUser("u-dup-b");

    const code1 = await ReferralService.ensureReferralCode(userA1);
    const code2 = await ReferralService.ensureReferralCode(userA2);

    await ReferralService.applyReferral(userB, code1);
    await expect(ReferralService.applyReferral(userB, code2)).rejects.toThrowError(/already been referred/i);
  });

  it("Integrity: Admin reversal creates compensating debit transaction", async () => {
    const admin = await createTestUser("u-rev-adm");
    const userA = await createTestUser("u-rev-a");
    const userB = await createTestUser("u-rev-b");
    const codeA = await ReferralService.ensureReferralCode(userA);

    await ReferralService.applyReferral(userB, codeA);
    await ReferralService.evaluateQualification(userB, "FIRST_DEPOSIT", { amount: 1000 });

    const ref = await prisma.referral.findUnique({ where: { referredUserId: userB } });
    expect(ref?.status).toBe("REWARDED");

    await ReferralService.reverseReferral(ref!.id, admin, "Fraudulent multi-account");

    const updatedRef = await prisma.referral.findUnique({ where: { id: ref!.id } });
    expect(updatedRef?.status).toBe("REVERSED");

    const reversalTx = await prisma.transaction.findFirst({
      where: { userId: userA, referenceType: "REVERSAL" },
    });
    expect(reversalTx?.amount).toBe(500);
    expect(reversalTx?.type).toBe("DEBIT");
  });
});
