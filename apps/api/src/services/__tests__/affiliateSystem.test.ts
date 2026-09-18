import { describe, it, expect, afterEach } from "vitest";
import { prisma, NotificationType } from "@gaming-hub/db";
import { ReferralService } from "../referrals";
import { AffiliateService } from "../affiliateService";
import { WalletTransactionService } from "../walletTransactionService";
import { updateCategorySettings } from "../settings";
import { applyTransaction } from "../wallet";
import { requirePermission } from "../../lib/permissions";
import { requireMfa } from "../../plugins/authenticate";
import { hashToken, recordLoginSession } from "../sessions";
import { env } from "../../env";
import type { FastifyRequest, FastifyReply } from "fastify";

describe("Gaming Hub Wallet Deposit Affiliate Commission System", () => {
  const createdUserIds: string[] = [];
  const createdCommissionIds: string[] = [];
  const createdReferralIds: string[] = [];

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

  afterEach(async () => {
    // Reset settings
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
      maxAffiliateCommissionPerDay: 0,
      minDepositEligible: 0,
      qualificationRule: "FIRST_DEPOSIT",
      affiliateOnFirstDeposit: true,
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
      await prisma.loginSession.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => undefined);
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

  // TEST 1: User signs up with referral code -> A: 0, B: 0 (No fixed signup reward)
  it("TEST 1: B signs up with A's referral code -> A=0, B=0, status=PENDING, no wallet bonus", async () => {
    const userA = await createTestUser("user-a", 0, 0);
    const userB = await createTestUser("user-b", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);
    const applyRes = await ReferralService.applyReferral(userB, codeA);

    expect(applyRes.applied).toBe(true);
    expect(applyRes.status).toBe("PENDING");
    expect(applyRes.referrerReward).toBe(0);
    expect(applyRes.referredReward).toBe(0);

    const referral = await prisma.referral.findUnique({ where: { referredUserId: userB } });
    expect(referral?.status).toBe("PENDING");
    expect(referral?.commission).toBe(0);
    expect(referral?.firstCommissionAt).toBeNull();

    const walletA = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    const walletB = await prisma.wallet.findUniqueOrThrow({ where: { userId: userB } });
    expect(walletA.bonusBalance).toBe(0);
    expect(walletB.bonusBalance).toBe(0);
  });

  // TEST 2: Wallet deposit in CONTINUOUS mode -> Referee receives 100% MAIN, Referrer receives 5% BONUS
  it("TEST 2: CONTINUOUS mode -> Gaming Hub wallet deposit credits referee 100% MAIN and referrer 5% BONUS without deduction", async () => {
    const userA = await createTestUser("user-a-cont", 0, 0);
    const userB = await createTestUser("user-b-cont", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);
    await ReferralService.applyReferral(userB, codeA);

    // B deposits 1000 coins into Gaming Hub MAIN wallet
    let txRecord: any;
    await prisma.$transaction(async (tx) => {
      const wallet = await WalletTransactionService.createDeposit(tx, {
        userId: userB,
        amount: 1000,
        meta: { paymentMethod: "CARD" },
      });
      txRecord = (wallet as any)._transaction;
    });

    expect(txRecord).toBeDefined();
    expect(txRecord.id).toBeDefined();

    // Trigger authoritative ledger deposit hook
    await WalletTransactionService.onDepositCompleted({
      userId: userB,
      amount: 1000,
      transactionId: txRecord.id,
    });

    // 1. Referee receives 100% of deposit (1000 MAIN coins)
    const walletB = await prisma.wallet.findUniqueOrThrow({ where: { userId: userB } });
    expect(walletB.balance).toBe(1000);
    expect(walletB.bonusBalance).toBe(0);

    // 2. Referrer receives 5% commission = 50 BONUS coins
    const walletA = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    expect(walletA.bonusBalance).toBe(50);

    // 3. Affiliate commission record created with authoritative sourceType and sourceId
    const commission = await prisma.affiliateCommission.findUnique({
      where: {
        sourceType_sourceId: {
          sourceType: "GAME_WALLET_DEPOSIT",
          sourceId: txRecord.id,
        },
      },
    });
    expect(commission).not.toBeNull();
    expect(commission?.referrerId).toBe(userA);
    expect(commission?.referredUserId).toBe(userB);
    expect(Number(commission?.depositAmount)).toBe(1000);
    expect(Number(commission?.commissionPercent)).toBe(5);
    expect(Number(commission?.commissionAmount)).toBe(50);
    expect(commission?.status).toBe("COMPLETED");

    // 4. Referral status transitioned to REWARDED and commission recorded
    const referral = await prisma.referral.findUnique({ where: { referredUserId: userB } });
    expect(referral?.status).toBe("REWARDED");
    expect(referral?.firstCommissionAt).not.toBeNull();
    expect(referral?.commission).toBe(50);

    // 5. Referrer notification created
    await new Promise((r) => setTimeout(r, 100));
    const notif = await prisma.appNotification.findFirst({
      where: { userId: userA, type: NotificationType.AFFILIATE_COMMISSION },
    });
    expect(notif).not.toBeNull();
    expect(notif?.title).toContain("Affiliate Commission Earned");
  });

  // TEST 3: CONTINUOUS mode -> Multiple deposits generate commissions on EVERY deposit
  it("TEST 3: CONTINUOUS mode -> Multiple deposits each generate 5% BONUS commission", async () => {
    const userA = await createTestUser("user-a-multi", 0, 0);
    const userB = await createTestUser("user-b-multi", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);
    await ReferralService.applyReferral(userB, codeA);

    // Deposit 1: 1000 coins -> +50 BONUS to A
    let tx1: any;
    await prisma.$transaction(async (tx) => {
      const wallet = await WalletTransactionService.createDeposit(tx, {
        userId: userB,
        amount: 1000,
      });
      tx1 = (wallet as any)._transaction;
    });
    await WalletTransactionService.onDepositCompleted({
      userId: userB,
      amount: 1000,
      transactionId: tx1.id,
    });

    // Deposit 2: 2000 coins -> +100 BONUS to A
    let tx2: any;
    await prisma.$transaction(async (tx) => {
      const wallet = await WalletTransactionService.createDeposit(tx, {
        userId: userB,
        amount: 2000,
      });
      tx2 = (wallet as any)._transaction;
    });
    await WalletTransactionService.onDepositCompleted({
      userId: userB,
      amount: 2000,
      transactionId: tx2.id,
    });

    // Deposit 3: 500 coins -> +25 BONUS to A
    let tx3: any;
    await prisma.$transaction(async (tx) => {
      const wallet = await WalletTransactionService.createDeposit(tx, {
        userId: userB,
        amount: 500,
      });
      tx3 = (wallet as any)._transaction;
    });
    await WalletTransactionService.onDepositCompleted({
      userId: userB,
      amount: 500,
      transactionId: tx3.id,
    });

    // Referee has full 3500 MAIN coins
    const walletB = await prisma.wallet.findUniqueOrThrow({ where: { userId: userB } });
    expect(walletB.balance).toBe(3500);

    // Referrer has 50 + 100 + 25 = 175 BONUS coins
    const walletA = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    expect(walletA.bonusBalance).toBe(175);

    const totalCommissions = await prisma.affiliateCommission.count({ where: { referrerId: userA } });
    expect(totalCommissions).toBe(3);

    const summary = await AffiliateService.getAffiliateSummary(userA);
    expect(summary.totalAffiliateEarnings).toBe(175);
    expect(summary.affiliateMode).toBe("CONTINUOUS");
  });

  // TEST 4: ONE_TIME mode -> Commission credited ONLY on first deposit, subsequent deposits generate 0
  it("TEST 4: ONE_TIME mode -> Commission credited ONLY on first deposit, second deposit generates 0", async () => {
    await updateCategorySettings("referral", {
      affiliateMode: "ONE_TIME",
    });

    const userA = await createTestUser("user-a-ot", 0, 0);
    const userB = await createTestUser("user-b-ot", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);
    await ReferralService.applyReferral(userB, codeA);

    // Deposit 1: 1000 coins -> Referrer earns 50 BONUS
    let tx1: any;
    await prisma.$transaction(async (tx) => {
      const wallet = await WalletTransactionService.createDeposit(tx, {
        userId: userB,
        amount: 1000,
      });
      tx1 = (wallet as any)._transaction;
    });
    await WalletTransactionService.onDepositCompleted({
      userId: userB,
      amount: 1000,
      transactionId: tx1.id,
    });

    const walletA1 = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    expect(walletA1.bonusBalance).toBe(50);

    // Deposit 2: 2000 coins -> in ONE_TIME mode, referrer earns 0
    let tx2: any;
    await prisma.$transaction(async (tx) => {
      const wallet = await WalletTransactionService.createDeposit(tx, {
        userId: userB,
        amount: 2000,
      });
      tx2 = (wallet as any)._transaction;
    });
    await WalletTransactionService.onDepositCompleted({
      userId: userB,
      amount: 2000,
      transactionId: tx2.id,
    });

    // Referrer balance remains 50 BONUS (Deposit 2 earned 0)
    const walletA2 = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    expect(walletA2.bonusBalance).toBe(50);

    // Referee receives full 1000 + 2000 = 3000 MAIN
    const walletB = await prisma.wallet.findUniqueOrThrow({ where: { userId: userB } });
    expect(walletB.balance).toBe(3000);

    // Exactly 1 affiliate commission record
    const totalCommissions = await prisma.affiliateCommission.count({ where: { referrerId: userA } });
    expect(totalCommissions).toBe(1);

    const summary = await AffiliateService.getAffiliateSummary(userA);
    expect(summary.totalAffiliateEarnings).toBe(50);
    expect(summary.affiliateMode).toBe("ONE_TIME");
  });

  // TEST 5: Idempotency -> Repeated onDepositCompleted for same transaction does NOT duplicate commission
  it("TEST 5: Idempotent processing -> duplicate transaction ID triggers 0 duplicate commission", async () => {
    const userA = await createTestUser("user-a-idemp", 0, 0);
    const userB = await createTestUser("user-b-idemp", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);
    await ReferralService.applyReferral(userB, codeA);

    let tx: any;
    await prisma.$transaction(async (t) => {
      const wallet = await WalletTransactionService.createDeposit(t, {
        userId: userB,
        amount: 1000,
      });
      tx = (wallet as any)._transaction;
    });

    // Call 1
    await WalletTransactionService.onDepositCompleted({
      userId: userB,
      amount: 1000,
      transactionId: tx.id,
    });

    // Call 2 (Duplicate replay)
    await WalletTransactionService.onDepositCompleted({
      userId: userB,
      amount: 1000,
      transactionId: tx.id,
    });

    const walletA = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    expect(walletA.bonusBalance).toBe(50); // NOT 100

    const totalCommissions = await prisma.affiliateCommission.count({ where: { referrerId: userA } });
    expect(totalCommissions).toBe(1);
  });

  // TEST 6: Concurrency safety in ONE_TIME mode -> 5 concurrent deposits yield exactly 1 commission
  it("TEST 6: Race condition safety in ONE_TIME mode -> concurrent deposit events yield exactly 1 commission", async () => {
    await updateCategorySettings("referral", {
      affiliateMode: "ONE_TIME",
    });

    const userA = await createTestUser("user-a-race", 0, 0);
    const userB = await createTestUser("user-b-race", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);
    await ReferralService.applyReferral(userB, codeA);

    // Create 5 different transactions
    const txs: any[] = [];
    for (let i = 0; i < 5; i++) {
      await prisma.$transaction(async (t) => {
        const wallet = await WalletTransactionService.createDeposit(t, {
          userId: userB,
          amount: 1000,
        });
        txs.push((wallet as any)._transaction);
      });
    }

    // Execute 5 concurrent deposit completed events
    await Promise.all(
      txs.map((t) =>
        WalletTransactionService.onDepositCompleted({
          userId: userB,
          amount: 1000,
          transactionId: t.id,
        })
      )
    );

    const walletA = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    expect(walletA.bonusBalance).toBe(50); // Exactly 1 commission of 50 awarded

    const totalCommissions = await prisma.affiliateCommission.count({ where: { referrerId: userA } });
    expect(totalCommissions).toBe(1);
  });

  // TEST 7: Ineligible events do NOT trigger affiliate commission
  it("TEST 7: Non-deposit transactions (game win, match wager, tournament prize, admin) do NOT credit commission", async () => {
    const userA = await createTestUser("user-a-ineligible", 0, 0);
    const userB = await createTestUser("user-b-ineligible", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);
    await ReferralService.applyReferral(userB, codeA);

    // 1. Match wager debit
    await prisma.$transaction(async (tx) => {
      await applyTransaction(tx, userB, 500, "MATCH_WAGER", "wager-1", {}, "MAIN");
    });

    // 2. Match payout credit
    await prisma.$transaction(async (tx) => {
      await applyTransaction(tx, userB, 1000, "MATCH_PAYOUT", "win-1", {}, "MAIN");
    });

    // 3. Tournament prize credit
    await prisma.$transaction(async (tx) => {
      await applyTransaction(tx, userB, 2000, "TOURNAMENT_PRIZE", "tourn-1", {}, "MAIN");
    });

    // Referrer wallet is completely untouched (0 bonus coins)
    const walletA = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    expect(walletA.bonusBalance).toBe(0);

    const totalCommissions = await prisma.affiliateCommission.count({ where: { referrerId: userA } });
    expect(totalCommissions).toBe(0);
  });

  // ===========================================================================
  // FINAL AFFILIATE MODE TRANSITION TESTS (Requirements 1 - 6)
  // ===========================================================================

  // REQUIREMENT 1: ONE_TIME → CONTINUOUS
  it("REQUIREMENT 1: Mode transition ONE_TIME → CONTINUOUS creates second commission exactly once", async () => {
    await updateCategorySettings("referral", {
      affiliateMode: "ONE_TIME",
      affiliateDepositPercent: 5,
    });

    const userA = await createTestUser("req1-a", 0, 0);
    const userB = await createTestUser("req1-b", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);
    await ReferralService.applyReferral(userB, codeA);

    // Deposit #1: 1000 coins in ONE_TIME mode
    let tx1: any;
    await prisma.$transaction(async (t) => {
      const w = await WalletTransactionService.createDeposit(t, { userId: userB, amount: 1000 });
      tx1 = (w as any)._transaction;
    });
    await WalletTransactionService.onDepositCompleted({ userId: userB, amount: 1000, transactionId: tx1.id });

    // A receives 5% = 50 BONUS
    let walletA = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    expect(walletA.bonusBalance).toBe(50);

    // Admin changes mode to CONTINUOUS
    await updateCategorySettings("referral", {
      affiliateMode: "CONTINUOUS",
    });

    // Deposit #2: 2000 coins in CONTINUOUS mode
    let tx2: any;
    await prisma.$transaction(async (t) => {
      const w = await WalletTransactionService.createDeposit(t, { userId: userB, amount: 2000 });
      tx2 = (w as any)._transaction;
    });
    await WalletTransactionService.onDepositCompleted({ userId: userB, amount: 2000, transactionId: tx2.id });

    // A must receive additional 5% of 2000 = 100 BONUS coins (total 150)
    walletA = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    expect(walletA.bonusBalance).toBe(150);

    // PASS only if second commission is created exactly once
    const commissions = await prisma.affiliateCommission.findMany({ where: { referrerId: userA } });
    expect(commissions).toHaveLength(2);
    expect(commissions.filter((c) => c.sourceId === tx2.id)).toHaveLength(1);
  });

  // REQUIREMENT 2: CONTINUOUS → ONE_TIME
  it("REQUIREMENT 2: Mode transition CONTINUOUS → ONE_TIME awards 0 on subsequent deposits", async () => {
    await updateCategorySettings("referral", {
      affiliateMode: "CONTINUOUS",
      affiliateDepositPercent: 5,
    });

    const userA = await createTestUser("req2-a", 0, 0);
    const userB = await createTestUser("req2-b", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);
    await ReferralService.applyReferral(userB, codeA);

    // Deposit #1: 1000 coins in CONTINUOUS mode
    let tx1: any;
    await prisma.$transaction(async (t) => {
      const w = await WalletTransactionService.createDeposit(t, { userId: userB, amount: 1000 });
      tx1 = (w as any)._transaction;
    });
    await WalletTransactionService.onDepositCompleted({ userId: userB, amount: 1000, transactionId: tx1.id });

    // A receives 50 BONUS
    let walletA = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    expect(walletA.bonusBalance).toBe(50);

    // Admin changes mode to ONE_TIME
    await updateCategorySettings("referral", {
      affiliateMode: "ONE_TIME",
    });

    // Deposit #2: 2000 coins in ONE_TIME mode
    let tx2: any;
    await prisma.$transaction(async (t) => {
      const w = await WalletTransactionService.createDeposit(t, { userId: userB, amount: 2000 });
      tx2 = (w as any)._transaction;
    });
    await WalletTransactionService.onDepositCompleted({ userId: userB, amount: 2000, transactionId: tx2.id });

    // A must get 0! (Still 50 BONUS)
    walletA = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    expect(walletA.bonusBalance).toBe(50);

    const totalCommissions = await prisma.affiliateCommission.count({ where: { referrerId: userA } });
    expect(totalCommissions).toBe(1);
  });

  // REQUIREMENT 3: DISABLED → ONE_TIME
  it("REQUIREMENT 3: Mode transition DISABLED → ONE_TIME treats first deposit after enabling as first eligible deposit", async () => {
    // Start with affiliate disabled
    await updateCategorySettings("referral", {
      affiliateEnabled: false,
      affiliateMode: "ONE_TIME",
      affiliateDepositPercent: 5,
    });

    const userA = await createTestUser("req3-a", 0, 0);
    const userB = await createTestUser("req3-b", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);
    await ReferralService.applyReferral(userB, codeA);

    // Deposit #1 while disabled: 1000 coins
    let tx1: any;
    await prisma.$transaction(async (t) => {
      const w = await WalletTransactionService.createDeposit(t, { userId: userB, amount: 1000 });
      tx1 = (w as any)._transaction;
    });
    await WalletTransactionService.onDepositCompleted({ userId: userB, amount: 1000, transactionId: tx1.id });

    // A gets 0
    let walletA = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    expect(walletA.bonusBalance).toBe(0);

    // Verify firstCommissionAt is NOT set while disabled
    let ref = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: userB } });
    expect(ref.firstCommissionAt).toBeNull();

    // Enable affiliate in ONE_TIME mode
    await updateCategorySettings("referral", {
      affiliateEnabled: true,
      affiliateMode: "ONE_TIME",
    });

    // Deposit #2: 2000 coins (First eligible deposit while enabled)
    let tx2: any;
    await prisma.$transaction(async (t) => {
      const w = await WalletTransactionService.createDeposit(t, { userId: userB, amount: 2000 });
      tx2 = (w as any)._transaction;
    });
    await WalletTransactionService.onDepositCompleted({ userId: userB, amount: 2000, transactionId: tx2.id });

    // A gets 5% of 2000 = 100 BONUS
    walletA = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    expect(walletA.bonusBalance).toBe(100);

    ref = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: userB } });
    expect(ref.firstCommissionAt).not.toBeNull();
  });

  // REQUIREMENT 4: ONE_TIME → DISABLED → ONE_TIME
  it("REQUIREMENT 4: Mode transition ONE_TIME → DISABLED → ONE_TIME does not reset firstCommissionAt", async () => {
    await updateCategorySettings("referral", {
      affiliateEnabled: true,
      affiliateMode: "ONE_TIME",
      affiliateDepositPercent: 5,
    });

    const userA = await createTestUser("req4-a", 0, 0);
    const userB = await createTestUser("req4-b", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);
    await ReferralService.applyReferral(userB, codeA);

    // Deposit #1: 1000 coins -> A gets 50 BONUS
    let tx1: any;
    await prisma.$transaction(async (t) => {
      const w = await WalletTransactionService.createDeposit(t, { userId: userB, amount: 1000 });
      tx1 = (w as any)._transaction;
    });
    await WalletTransactionService.onDepositCompleted({ userId: userB, amount: 1000, transactionId: tx1.id });

    let walletA = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    expect(walletA.bonusBalance).toBe(50);

    const refAfterDep1 = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: userB } });
    const initialFirstCommissionAt = refAfterDep1.firstCommissionAt;
    expect(initialFirstCommissionAt).not.toBeNull();

    // Disable affiliate
    await updateCategorySettings("referral", {
      affiliateEnabled: false,
    });

    // Enable again in ONE_TIME mode
    await updateCategorySettings("referral", {
      affiliateEnabled: true,
      affiliateMode: "ONE_TIME",
    });

    // Verify firstCommissionAt was preserved and not reset
    const refAfterReenable = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: userB } });
    expect(refAfterReenable.firstCommissionAt?.toISOString()).toBe(initialFirstCommissionAt?.toISOString());

    // Deposit #2: 3000 coins -> A must get 0
    let tx2: any;
    await prisma.$transaction(async (t) => {
      const w = await WalletTransactionService.createDeposit(t, { userId: userB, amount: 3000 });
      tx2 = (w as any)._transaction;
    });
    await WalletTransactionService.onDepositCompleted({ userId: userB, amount: 3000, transactionId: tx2.id });

    walletA = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    expect(walletA.bonusBalance).toBe(50); // Still 50

    const totalCommissions = await prisma.affiliateCommission.count({ where: { referrerId: userA } });
    expect(totalCommissions).toBe(1);
  });

  // REQUIREMENT 5: Verify firstCommissionAt set on first commission in both modes & immutable during settings updates
  it("REQUIREMENT 5: firstCommissionAt is set on first commission regardless of mode and never reset by settings updates", async () => {
    // 1. Check CONTINUOUS mode sets firstCommissionAt on first commission
    await updateCategorySettings("referral", {
      affiliateMode: "CONTINUOUS",
      affiliateDepositPercent: 5,
    });

    const userA = await createTestUser("req5-a", 0, 0);
    const userB = await createTestUser("req5-b", 0, 0);

    const codeA = await ReferralService.ensureReferralCode(userA);
    await ReferralService.applyReferral(userB, codeA);

    let ref = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: userB } });
    expect(ref.firstCommissionAt).toBeNull();

    let tx1: any;
    await prisma.$transaction(async (t) => {
      const w = await WalletTransactionService.createDeposit(t, { userId: userB, amount: 1000 });
      tx1 = (w as any)._transaction;
    });
    await WalletTransactionService.onDepositCompleted({ userId: userB, amount: 1000, transactionId: tx1.id });

    ref = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: userB } });
    expect(ref.firstCommissionAt).not.toBeNull();
    const recordedTimestamp = ref.firstCommissionAt;

    // Admin repeatedly updates settings
    await ReferralService.adminUpdateSettings(
      {
        affiliateEnabled: true,
        affiliateMode: "ONE_TIME",
        affiliateDepositPercent: 10,
      },
      "admin-test-id"
    );

    await ReferralService.adminUpdateSettings(
      {
        affiliateMode: "CONTINUOUS",
        affiliateDepositPercent: 7,
      },
      "admin-test-id"
    );

    // Ensure firstCommissionAt is completely unchanged
    ref = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: userB } });
    expect(ref.firstCommissionAt?.toISOString()).toBe(recordedTimestamp?.toISOString());
  });

  // REQUIREMENT 6: Verify admin setting changes (permission protected, fresh-MFA protected, audit logged)
  it("REQUIREMENT 6: Admin setting changes are permission protected, fresh-MFA protected, and audit logged", async () => {
    const adminId = await createTestUser("admin-audit", 0, 0);
    await prisma.user.update({
      where: { id: adminId },
      data: { role: "ADMIN" },
    });
    await prisma.profile.update({
      where: { userId: adminId },
      data: { twoFactorEnabled: true },
    });

    const normalUserId = await createTestUser("normal-user", 0, 0);

    // 1. Permission Protected: Non-admin calling requirePermission throws 403
    const fakeNormalReq = {
      user: { id: normalUserId, role: "USER" },
    } as unknown as FastifyRequest;

    await expect(requirePermission(fakeNormalReq, "admin:settings:edit", prisma)).rejects.toThrow(
      /You do not have permission/
    );

    // Admin calling requirePermission succeeds
    const fakeAdminReq = {
      user: { id: adminId, role: "ADMIN" },
    } as unknown as FastifyRequest;
    await expect(requirePermission(fakeAdminReq, "admin:settings:edit", prisma)).resolves.toBeDefined();

    // 2. Fresh-MFA Protected:
    (env as unknown as Record<string, unknown>).MFA_FRESHNESS_MINUTES = 15;
    const tokenStale = "test-token-stale-mfa";
    const tokenHashStale = hashToken(tokenStale);

    // Session without mfaVerifiedAt
    await recordLoginSession({
      userId: adminId,
      token: tokenStale,
      ip: "127.0.0.1",
      userAgent: "TestAgent",
    });

    const staleReq = {
      user: { id: adminId, role: "ADMIN" },
      headers: { authorization: `Bearer ${tokenStale}` },
    } as unknown as FastifyRequest;

    await expect(requireMfa(staleReq, {} as FastifyReply)).rejects.toThrow();

    // Session with fresh mfaVerifiedAt
    const tokenFresh = "test-token-fresh-mfa";
    const tokenHashFresh = hashToken(tokenFresh);
    await recordLoginSession({
      userId: adminId,
      token: tokenFresh,
      ip: "127.0.0.1",
      userAgent: "TestAgent",
    });
    await prisma.loginSession.update({
      where: { tokenHash: tokenHashFresh },
      data: { mfaVerifiedAt: new Date() },
    });

    const freshReq = {
      user: { id: adminId, role: "ADMIN" },
      headers: { authorization: `Bearer ${tokenFresh}` },
    } as unknown as FastifyRequest;

    await expect(requireMfa(freshReq, {} as FastifyReply)).resolves.toBeUndefined();

    // 3. Audit Logged:
    await ReferralService.adminUpdateSettings(
      {
        affiliateEnabled: true,
        affiliateMode: "ONE_TIME",
        affiliateDepositPercent: 8,
      },
      adminId
    );

    await new Promise((r) => setTimeout(r, 150));

    const log = await prisma.auditLog.findFirst({
      where: {
        actorId: adminId,
        action: "referral.settings_updated",
      },
      orderBy: { createdAt: "desc" },
    });

    expect(log).not.toBeNull();
    expect(log?.category).toBe("admin");
    expect(log?.targetType).toBe("SiteSetting");
    expect(log?.targetId).toBe("referral");
    const meta = log?.meta as Record<string, any>;
    expect(meta?.updated?.affiliateMode).toBe("ONE_TIME");
    expect(meta?.updated?.affiliateDepositPercent).toBe(8);
  });
});
