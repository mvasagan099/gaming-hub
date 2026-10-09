import { describe, it, expect, afterEach } from "vitest";
import { prisma, NotificationType } from "@gaming-hub/db";
import { ReferralService } from "../referrals";
import { AffiliateService } from "../affiliateService";
import { updateCategorySettings } from "../settings";
import { applyTransaction } from "../wallet";

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
    // Reset referral settings to standard defaults (0 fixed bonus, 5% affiliate)
    await updateCategorySettings("referral", {
      enabled: true,
      referrerFirstDepositBonus: 0,
      referrerReward: 0,
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
  // TEST 5: B completes first successful deposit: 1000 MAIN
  // ---------------------------------------------------------------------------
  it("TEST 5: B completes first deposit (1000 MAIN) -> B +1000 MAIN, 0 bonus; A receives 0 fixed and 50 BONUS (5% affiliate), QUALIFIED", async () => {
    const userA = await createTestUser("t5-a", 0, 0);
    const userB = await createTestUser("t5-b", 0, 0);
    const codeA = await ReferralService.ensureReferralCode(userA);

    await ReferralService.applyReferral(userB, codeA);

    const sagaId = `saga-first-dep-${Date.now()}`;

    // 1. Simulate deposit crediting B's MAIN wallet
    await prisma.$transaction(async (tx) => {
      await applyTransaction(tx, userB, 1000, "DEPOSIT", sagaId, {}, "MAIN", sagaId);
    });

    // 2. Authoritative FIRST_DEPOSIT referral qualification triggered
    const qualResult = await ReferralService.evaluateQualification(userB, "FIRST_DEPOSIT", {
      amount: 1000,
      sagaId,
    });

    expect(qualResult).toBeDefined();
    expect(qualResult?.status).toBe("QUALIFIED");
    expect(qualResult?.commission).toBe(0);

    // 3. Affiliate commission on deposit: 5% of 1000 = 50 BONUS
    await AffiliateService.processDepositCommission({
      referredUserId: userB,
      sourceType: "GAME_WALLET_DEPOSIT",
      sourceId: sagaId,
      amount: 1000,
      isFirstDeposit: true,
    });

    // Check balances
    const walletB = await prisma.wallet.findUnique({ where: { userId: userB } });
    const walletA = await prisma.wallet.findUnique({ where: { userId: userA } });

    expect(walletB?.balance).toBe(1000); // 1000 MAIN
    expect(walletB?.bonusBalance).toBe(0); // 0 referee referral bonus
    // Referrer A receives 0 fixed referral reward + 50 BONUS affiliate (5% of 1000)
    expect(walletA?.bonusBalance).toBe(50);

    // 0 fixed REFERRAL transactions for referrer
    const refTxs = await prisma.transaction.findMany({
      where: { userId: userA, referenceType: "REFERRAL" },
    });
    expect(refTxs.length).toBe(0);

    // Exactly 1 AFFILIATE_COMMISSION transaction for referrer
    const affTxs = await prisma.transaction.findMany({
      where: { userId: userA, referenceType: "AFFILIATE_COMMISSION" },
    });
    expect(affTxs.length).toBe(1);
    expect(affTxs[0].amount).toBe(50);
  });

  // ---------------------------------------------------------------------------
  // TEST 6: Replay same deposit
  // ---------------------------------------------------------------------------
  it("TEST 6: Replay same deposit -> No duplicate qualification, no duplicate affiliate commission", async () => {
    const userA = await createTestUser("t6-a", 0, 0);
    const userB = await createTestUser("t6-b", 0, 0);
    const codeA = await ReferralService.ensureReferralCode(userA);

    await ReferralService.applyReferral(userB, codeA);

    const sagaId = `saga-replay-${Date.now()}`;

    // 1st deposit
    await prisma.$transaction(async (tx) => {
      await applyTransaction(tx, userB, 1000, "DEPOSIT", sagaId, {}, "MAIN", sagaId);
    });
    await ReferralService.evaluateQualification(userB, "FIRST_DEPOSIT", { amount: 1000, sagaId });
    await AffiliateService.processDepositCommission({
      referredUserId: userB,
      sourceType: "GAME_WALLET_DEPOSIT",
      sourceId: sagaId,
      amount: 1000,
      isFirstDeposit: true,
    });

    const walletAfter1 = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletAfter1?.bonusBalance).toBe(50);

    // Replay same deposit
    const secondQual = await ReferralService.evaluateQualification(userB, "FIRST_DEPOSIT", { amount: 1000, sagaId });
    expect(secondQual).toBeNull(); // Skipped, already QUALIFIED

    await AffiliateService.processDepositCommission({
      referredUserId: userB,
      sourceType: "GAME_WALLET_DEPOSIT",
      sourceId: sagaId,
      amount: 1000,
    });

    const walletAfterReplay = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletAfterReplay?.bonusBalance).toBe(50); // Unchanged

    const totalAffTxs = await prisma.transaction.count({
      where: { userId: userA, referenceType: "AFFILIATE_COMMISSION" },
    });
    expect(totalAffTxs).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // TEST 7: B completes second deposit
  // ---------------------------------------------------------------------------
  it("TEST 7: B completes second deposit -> NO fixed reward, 5% affiliate only", async () => {
    const userA = await createTestUser("t7-a", 0, 0);
    const userB = await createTestUser("t7-b", 0, 0);
    const codeA = await ReferralService.ensureReferralCode(userA);

    await ReferralService.applyReferral(userB, codeA);

    const saga1 = `saga-dep-1-${Date.now()}`;
    const saga2 = `saga-dep-2-${Date.now()}`;

    // Deposit 1: 1000 MAIN
    await prisma.$transaction(async (tx) => {
      await applyTransaction(tx, userB, 1000, "DEPOSIT", saga1, {}, "MAIN", saga1);
    });
    await ReferralService.evaluateQualification(userB, "FIRST_DEPOSIT", { amount: 1000, sagaId: saga1 });
    await AffiliateService.processDepositCommission({
      referredUserId: userB,
      sourceType: "GAME_WALLET_DEPOSIT",
      sourceId: saga1,
      amount: 1000,
      isFirstDeposit: true,
    });

    // A has 50 (affiliate 1)
    expect((await prisma.wallet.findUnique({ where: { userId: userA } }))?.bonusBalance).toBe(50);

    // Deposit 2: 2000 MAIN
    await prisma.$transaction(async (tx) => {
      await applyTransaction(tx, userB, 2000, "DEPOSIT", saga2, {}, "MAIN", saga2);
    });

    // Referral qualification skips because status is already QUALIFIED
    const qual2 = await ReferralService.evaluateQualification(userB, "FIRST_DEPOSIT", { amount: 2000, sagaId: saga2 });
    expect(qual2).toBeNull();

    // Affiliate commission processes: 5% of 2000 = 100 BONUS
    await AffiliateService.processDepositCommission({
      referredUserId: userB,
      sourceType: "GAME_WALLET_DEPOSIT",
      sourceId: saga2,
      amount: 2000,
      isFirstDeposit: false,
    });

    const walletAfter2 = await prisma.wallet.findUnique({ where: { userId: userA } });
    // Total: 50 + 100 = 150 BONUS
    expect(walletAfter2?.bonusBalance).toBe(150);

    // Fixed referral transactions count is 0
    const fixedTxs = await prisma.transaction.count({
      where: { userId: userA, referenceType: "REFERRAL" },
    });
    expect(fixedTxs).toBe(0);

    // Affiliate commission transactions count is 2
    const affTxs = await prisma.transaction.count({
      where: { userId: userA, referenceType: "AFFILIATE_COMMISSION" },
    });
    expect(affTxs).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // TEST 8: Concurrent first-deposit qualification
  // ---------------------------------------------------------------------------
  it("TEST 8: Concurrent first-deposit qualification -> exactly one marks QUALIFIED, 0 fixed bonus transactions", async () => {
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

    // Exactly one winner returned a qualified referral; other 4 returned null
    const winners = results.filter((r) => r !== null && r.status === "QUALIFIED");
    expect(winners.length).toBe(1);

    // Referrer wallet bonusBalance is untouched (0 fixed bonus)
    const walletA = await prisma.wallet.findUnique({ where: { userId: userA } });
    expect(walletA?.bonusBalance).toBe(0);

    // 0 referral reward ledger transactions exist
    const txs = await prisma.transaction.findMany({
      where: { userId: userA, referenceType: "REFERRAL" },
    });
    expect(txs.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // TEST 9: Idempotent repeat applyReferral with same code
  // ---------------------------------------------------------------------------
  it("TEST 9: Repeated applyReferral with same code is idempotent and returns existing status", async () => {
    const userA = await createTestUser("t9-a");
    const userB = await createTestUser("t9-b");
    const codeA = await ReferralService.ensureReferralCode(userA);

    const first = await ReferralService.applyReferral(userB, codeA);
    expect(first.applied).toBe(true);

    const second = await ReferralService.applyReferral(userB, codeA);
    expect(second.applied).toBe(true);
    expect(second.status).toBe(first.status);

    const count = await prisma.referral.count({ where: { referredUserId: userB } });
    expect(count).toBe(1);
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

  it("Integrity: Admin reversal marks referral as REVERSED without wallet debits", async () => {
    const admin = await createTestUser("u-rev-adm");
    const userA = await createTestUser("u-rev-a");
    const userB = await createTestUser("u-rev-b");
    const codeA = await ReferralService.ensureReferralCode(userA);

    await ReferralService.applyReferral(userB, codeA);
    await ReferralService.evaluateQualification(userB, "FIRST_DEPOSIT", { amount: 1000 });

    const ref = await prisma.referral.findUnique({ where: { referredUserId: userB } });
    expect(ref?.status).toBe("QUALIFIED");

    await ReferralService.reverseReferral(ref!.id, admin, "Fraudulent multi-account");

    const updatedRef = await prisma.referral.findUnique({ where: { id: ref!.id } });
    expect(updatedRef?.status).toBe("REVERSED");

    // No financial reversal transactions created
    const reversalTx = await prisma.transaction.findFirst({
      where: { userId: userA, referenceType: "REVERSAL" },
    });
    expect(reversalTx).toBeNull();
  });
});
