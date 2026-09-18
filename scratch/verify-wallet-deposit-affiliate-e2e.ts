import { prisma } from "@gaming-hub/db";
import { ReferralService } from "../apps/api/src/services/referrals";
import { AffiliateService } from "../apps/api/src/services/affiliateService";
import { WalletTransactionService } from "../apps/api/src/services/walletTransactionService";
import { updateCategorySettings } from "../apps/api/src/services/settings";

async function main() {
  console.log("================================================================");
  console.log("STARTING GAMING HUB WALLET DEPOSIT AFFILIATE COMMISSION E2E TEST");
  console.log("================================================================\n");

  const cleanupIds: string[] = [];

  async function createTestUser(name: string) {
    const id = `e2e-user-${name}-${Date.now()}`;
    cleanupIds.push(id);
    await prisma.user.create({
      data: {
        id,
        username: `u_${name}_${Date.now()}`.slice(0, 24),
        displayName: `User ${name}`,
        email: `${id}@test.com`,
        wallet: { create: { balance: 0, bonusBalance: 0 } },
        profile: { create: { xp: 100, level: 1 } },
      },
    });
    return id;
  }

  try {
    // -------------------------------------------------------------------------
    // SCENARIO 1: CONTINUOUS AFFILIATE COMMISSION MODE
    // -------------------------------------------------------------------------
    console.log("--- SCENARIO 1: CONTINUOUS MODE (Every Deposit) ---");
    await updateCategorySettings("referral", {
      enabled: true,
      affiliateEnabled: true,
      affiliateMode: "CONTINUOUS",
      affiliateDepositPercent: 5,
      referrerFirstDepositBonus: 0,
      referrerReward: 0,
      referredReward: 0,
      referrerSignupBonus: 0,
      refereeSignupBonus: 0,
    });

    const userA = await createTestUser("Alice");
    const userB = await createTestUser("Bob");

    // 1. Bob registers using Alice's referral code
    const codeA = await ReferralService.ensureReferralCode(userA);
    const applyRes = await ReferralService.applyReferral(userB, codeA);
    console.log("1. Bob signed up with Alice's code:", {
      status: applyRes.status,
      aliceReward: applyRes.referrerReward,
      bobReward: applyRes.referredReward,
    });

    // Check balances at signup: both should be 0
    let walletA = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    let walletB = await prisma.wallet.findUniqueOrThrow({ where: { userId: userB } });
    console.log("   Initial balances -> Alice BONUS:", walletA.bonusBalance, "| Bob MAIN:", walletB.balance);
    if (walletA.bonusBalance !== 0 || walletB.balance !== 0) {
      throw new Error("Initial balances must be 0!");
    }

    // 2. Bob deposits 1000 into Gaming Hub wallet
    let tx1: any;
    await prisma.$transaction(async (tx) => {
      const w = await WalletTransactionService.createDeposit(tx, {
        userId: userB,
        amount: 1000,
        meta: { source: "CARD_PAYMENT" },
      });
      tx1 = (w as any)._transaction;
    });

    // Trigger authoritative wallet deposit completion hook
    await WalletTransactionService.onDepositCompleted({
      userId: userB,
      amount: 1000,
      transactionId: tx1.id,
    });

    walletA = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    walletB = await prisma.wallet.findUniqueOrThrow({ where: { userId: userB } });
    console.log("2. After 1st deposit (1000 coins):");
    console.log("   Bob MAIN balance:", walletB.balance, "(Expected: 1000 - 100% full deposit)");
    console.log("   Alice BONUS balance:", walletA.bonusBalance, "(Expected: 50 - 5% commission)");

    if (walletB.balance !== 1000 || walletA.bonusBalance !== 50) {
      throw new Error("First deposit balance mismatch!");
    }

    // 3. Bob deposits another 2500 into Gaming Hub wallet
    let tx2: any;
    await prisma.$transaction(async (tx) => {
      const w = await WalletTransactionService.createDeposit(tx, {
        userId: userB,
        amount: 2500,
      });
      tx2 = (w as any)._transaction;
    });

    await WalletTransactionService.onDepositCompleted({
      userId: userB,
      amount: 2500,
      transactionId: tx2.id,
    });

    walletA = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
    walletB = await prisma.wallet.findUniqueOrThrow({ where: { userId: userB } });
    console.log("3. After 2nd deposit (2500 coins):");
    console.log("   Bob MAIN balance:", walletB.balance, "(Expected: 3500 - 100% unreduced)");
    console.log("   Alice BONUS balance:", walletA.bonusBalance, "(Expected: 175 = 50 + 125)");

    if (walletB.balance !== 3500 || walletA.bonusBalance !== 175) {
      throw new Error("Second deposit balance mismatch in CONTINUOUS mode!");
    }

    const summaryA = await AffiliateService.getAffiliateSummary(userA);
    console.log("   Alice Affiliate Summary:", {
      totalReferredUsers: summaryA.totalReferredUsers,
      totalAffiliateEarnings: summaryA.totalAffiliateEarnings,
      commissionPercent: summaryA.commissionPercent,
      affiliateMode: summaryA.affiliateMode,
    });

    // -------------------------------------------------------------------------
    // SCENARIO 2: ONE_TIME AFFILIATE COMMISSION MODE
    // -------------------------------------------------------------------------
    console.log("\n--- SCENARIO 2: ONE_TIME MODE (First Deposit Only) ---");
    await updateCategorySettings("referral", {
      affiliateMode: "ONE_TIME",
    });

    const userC = await createTestUser("Charlie");
    const userD = await createTestUser("David");

    const codeC = await ReferralService.ensureReferralCode(userC);
    await ReferralService.applyReferral(userD, codeC);

    // 1. David makes first deposit: 1000 coins
    let txD1: any;
    await prisma.$transaction(async (tx) => {
      const w = await WalletTransactionService.createDeposit(tx, {
        userId: userD,
        amount: 1000,
      });
      txD1 = (w as any)._transaction;
    });

    await WalletTransactionService.onDepositCompleted({
      userId: userD,
      amount: 1000,
      transactionId: txD1.id,
    });

    let walletC = await prisma.wallet.findUniqueOrThrow({ where: { userId: userC } });
    let walletD = await prisma.wallet.findUniqueOrThrow({ where: { userId: userD } });
    console.log("1. After David's 1st deposit (1000 coins):");
    console.log("   David MAIN balance:", walletD.balance, "(Expected: 1000)");
    console.log("   Charlie BONUS balance:", walletC.bonusBalance, "(Expected: 50)");

    if (walletD.balance !== 1000 || walletC.bonusBalance !== 50) {
      throw new Error("ONE_TIME mode first deposit mismatch!");
    }

    // 2. David makes second deposit: 2000 coins -> in ONE_TIME mode, Charlie earns 0!
    let txD2: any;
    await prisma.$transaction(async (tx) => {
      const w = await WalletTransactionService.createDeposit(tx, {
        userId: userD,
        amount: 2000,
      });
      txD2 = (w as any)._transaction;
    });

    await WalletTransactionService.onDepositCompleted({
      userId: userD,
      amount: 2000,
      transactionId: txD2.id,
    });

    walletC = await prisma.wallet.findUniqueOrThrow({ where: { userId: userC } });
    walletD = await prisma.wallet.findUniqueOrThrow({ where: { userId: userD } });
    console.log("2. After David's 2nd deposit (2000 coins):");
    console.log("   David MAIN balance:", walletD.balance, "(Expected: 3000)");
    console.log("   Charlie BONUS balance:", walletC.bonusBalance, "(Expected: 50 - no additional commission)");

    if (walletD.balance !== 3000 || walletC.bonusBalance !== 50) {
      throw new Error("ONE_TIME mode second deposit should NOT award commission!");
    }

    const summaryC = await AffiliateService.getAffiliateSummary(userC);
    console.log("   Charlie Affiliate Summary:", {
      totalReferredUsers: summaryC.totalReferredUsers,
      totalAffiliateEarnings: summaryC.totalAffiliateEarnings,
      commissionPercent: summaryC.commissionPercent,
      affiliateMode: summaryC.affiliateMode,
    });

    console.log("\n================================================================");
    console.log("ALL SCENARIOS PASSED WITH COMPLETE FIDELITY!");
    console.log("================================================================");
  } finally {
    // Cleanup test users and records
    if (cleanupIds.length > 0) {
      await prisma.affiliateCommission.deleteMany({
        where: { OR: [{ referrerId: { in: cleanupIds } }, { referredUserId: { in: cleanupIds } }] },
      });
      await prisma.appNotification.deleteMany({ where: { userId: { in: cleanupIds } } });
      await prisma.transaction.deleteMany({ where: { userId: { in: cleanupIds } } });
      await prisma.referral.deleteMany({
        where: { OR: [{ referrerId: { in: cleanupIds } }, { referredUserId: { in: cleanupIds } }] },
      });
      await prisma.profile.deleteMany({ where: { userId: { in: cleanupIds } } });
      await prisma.wallet.deleteMany({ where: { userId: { in: cleanupIds } } });
      await prisma.user.deleteMany({ where: { id: { in: cleanupIds } } });
    }
  }
}

main().catch((err) => {
  console.error("E2E Verification Failed:", err);
  process.exit(1);
});
