import { prisma, NotificationType } from "@gaming-hub/db";
import { ReferralService } from "../apps/api/src/services/referrals";
import { AffiliateService } from "../apps/api/src/services/affiliateService";
import { applyTransaction } from "../apps/api/src/services/wallet";
import { updateCategorySettings } from "../apps/api/src/services/settings";

async function main() {
  console.log("================================================================");
  console.log("STARTING FULL END-TO-END VERIFICATION: FIRST-DEPOSIT-ONLY REFERRAL");
  console.log("================================================================");

  // Setup settings
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
  });

  const timestamp = Date.now();
  const userAId = `e2e-user-a-${timestamp}`;
  const userBId = `e2e-user-b-${timestamp}`;

  try {
    // 1. Create User A (Referrer) and User B (Referee)
    console.log("\n[1/7] Creating test accounts User A and User B...");
    await prisma.user.create({
      data: {
        id: userAId,
        username: `usera_${timestamp}`.slice(0, 24),
        displayName: "User A",
        email: `${userAId}@test.local`,
        wallet: { create: { balance: 0, bonusBalance: 0 } },
        profile: { create: { xp: 100 } },
      },
    });

    await prisma.user.create({
      data: {
        id: userBId,
        username: `userb_${timestamp}`.slice(0, 24),
        displayName: "User B",
        email: `${userBId}@test.local`,
        wallet: { create: { balance: 0, bonusBalance: 0 } },
        profile: { create: { xp: 100 } },
      },
    });

    const codeA = await ReferralService.ensureReferralCode(userAId);
    console.log(`✓ User A created with referral code: ${codeA}`);

    // 2. User B signs up with User A's referral code
    console.log("\n[2/7] User B signs up with User A's referral code...");
    const applyRes = await ReferralService.applyReferral(userBId, codeA);
    console.log("Apply result:", applyRes);

    const refRecord = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: userBId } });
    const walletA1 = await prisma.wallet.findUniqueOrThrow({ where: { userId: userAId } });
    const walletB1 = await prisma.wallet.findUniqueOrThrow({ where: { userId: userBId } });

    console.log(`Referral status: ${refRecord.status} (expected: PENDING)`);
    console.log(`User A bonus: ${walletA1.bonusBalance} (expected: 0)`);
    console.log(`User B bonus: ${walletB1.bonusBalance} (expected: 0)`);

    if (refRecord.status !== "PENDING" || walletA1.bonusBalance !== 0 || walletB1.bonusBalance !== 0) {
      throw new Error("Step 2 FAILED: Referral is not PENDING or wallets were modified at signup");
    }
    console.log("✓ Step 2 PASSED: Referral is PENDING, zero bonus credited to either user.");

    // 3. User B plays game
    console.log("\n[3/7] User B plays game -> verifying NO referral reward...");
    const gameQual = await ReferralService.evaluateQualification(userBId, "FIRST_GAME", { gameId: "chess" });
    const walletA2 = await prisma.wallet.findUniqueOrThrow({ where: { userId: userAId } });
    const refRecord2 = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: userBId } });

    console.log(`Game qualification result: ${gameQual} (expected: null)`);
    console.log(`Referral status: ${refRecord2.status} (expected: PENDING)`);
    console.log(`User A bonus: ${walletA2.bonusBalance} (expected: 0)`);

    if (gameQual !== null || refRecord2.status !== "PENDING" || walletA2.bonusBalance !== 0) {
      throw new Error("Step 3 FAILED: Game play triggered referral reward or changed status");
    }
    console.log("✓ Step 3 PASSED: Playing game does NOT qualify referral or change PENDING status.");

    // 4. User B joins tournament
    console.log("\n[4/7] User B joins tournament -> verifying NO referral reward...");
    const tourneyQual = await ReferralService.evaluateQualification(userBId, "TOURNAMENT_JOIN", { tournamentId: "tourney-test" });
    const walletA3 = await prisma.wallet.findUniqueOrThrow({ where: { userId: userAId } });
    const refRecord3 = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: userBId } });

    console.log(`Tournament qualification result: ${tourneyQual} (expected: null)`);
    console.log(`Referral status: ${refRecord3.status} (expected: PENDING)`);
    console.log(`User A bonus: ${walletA3.bonusBalance} (expected: 0)`);

    if (tourneyQual !== null || refRecord3.status !== "PENDING" || walletA3.bonusBalance !== 0) {
      throw new Error("Step 4 FAILED: Tournament join triggered referral reward or changed status");
    }
    console.log("✓ Step 4 PASSED: Joining tournament does NOT qualify referral or change PENDING status.");

    // 5. User B completes FIRST coupon redemption: 1000 MAIN
    console.log("\n[5/7] User B completes FIRST coupon redemption (1000 MAIN)...");
    const saga1 = `saga-e2e-1-${timestamp}`;
    await prisma.$transaction(async (tx) => {
      await applyTransaction(tx, userBId, 1000, "COUPON", saga1, { code: "TEST1000" }, "MAIN");
    });

    const qualRes1 = await ReferralService.evaluateQualification(userBId, "FIRST_DEPOSIT", {
      amount: 1000,
      sagaId: saga1,
    });
    console.log(`First deposit qualification status: ${qualRes1?.status} (expected: REWARDED)`);

    await AffiliateService.processDepositCommission({
      referredUserId: userBId,
      sourceType: "COUPON_REDEMPTION",
      sourceId: saga1,
      amount: 1000,
      isFirstDeposit: true,
    });

    const walletBAfterDep1 = await prisma.wallet.findUniqueOrThrow({ where: { userId: userBId } });
    const walletAAfterDep1 = await prisma.wallet.findUniqueOrThrow({ where: { userId: userAId } });
    const refRecordAfterDep1 = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: userBId } });

    console.log(`User B balance: ${walletBAfterDep1.balance} MAIN (expected: 1000)`);
    console.log(`User B bonus: ${walletBAfterDep1.bonusBalance} BONUS (expected: 0)`);
    console.log(`User A bonus: ${walletAAfterDep1.bonusBalance} BONUS (expected: 550 = 500 fixed + 50 affiliate)`);
    console.log(`Referral status: ${refRecordAfterDep1.status} (expected: REWARDED)`);

    const refTxs = await prisma.transaction.findMany({ where: { userId: userAId, referenceType: "REFERRAL" } });
    console.log(`User A REFERRAL transactions count: ${refTxs.length} (expected: 1)`);

    if (
      walletBAfterDep1.balance !== 1000 ||
      walletBAfterDep1.bonusBalance !== 0 ||
      walletAAfterDep1.bonusBalance !== 550 ||
      refRecordAfterDep1.status !== "REWARDED" ||
      refTxs.length !== 1
    ) {
      throw new Error("Step 5 FAILED: First deposit rewards or status incorrect");
    }
    console.log("✓ Step 5 PASSED: Exactly one 500 fixed bonus credited to A, 50 affiliate to A, 1000 MAIN to B, 0 bonus to B.");

    // 6. Replay same deposit
    console.log("\n[6/7] Replaying same deposit -> verifying idempotency...");
    const qualReplay = await ReferralService.evaluateQualification(userBId, "FIRST_DEPOSIT", {
      amount: 1000,
      sagaId: saga1,
    });
    console.log(`Replay qualification result: ${qualReplay} (expected: null)`);

    await AffiliateService.processDepositCommission({
      referredUserId: userBId,
      sourceType: "COUPON_REDEMPTION",
      sourceId: saga1,
      amount: 1000,
    });

    const walletAAfterReplay = await prisma.wallet.findUniqueOrThrow({ where: { userId: userAId } });
    console.log(`User A bonus after replay: ${walletAAfterReplay.bonusBalance} (expected: 550)`);

    if (qualReplay !== null || walletAAfterReplay.bonusBalance !== 550) {
      throw new Error("Step 6 FAILED: Replay caused duplicate credit");
    }
    console.log("✓ Step 6 PASSED: Replay was cleanly and safely skipped.");

    // 7. User B completes SECOND deposit: 2000 MAIN
    console.log("\n[7/7] User B completes SECOND deposit (2000 MAIN)...");
    const saga2 = `saga-e2e-2-${timestamp}`;
    await prisma.$transaction(async (tx) => {
      await applyTransaction(tx, userBId, 2000, "COUPON", saga2, { code: "TEST2000" }, "MAIN");
    });

    const qualRes2 = await ReferralService.evaluateQualification(userBId, "FIRST_DEPOSIT", {
      amount: 2000,
      sagaId: saga2,
    });
    console.log(`Second deposit referral qualification: ${qualRes2} (expected: null, no second fixed reward)`);

    await AffiliateService.processDepositCommission({
      referredUserId: userBId,
      sourceType: "COUPON_REDEMPTION",
      sourceId: saga2,
      amount: 2000,
      isFirstDeposit: false,
    });

    const walletBAfterDep2 = await prisma.wallet.findUniqueOrThrow({ where: { userId: userBId } });
    const walletAAfterDep2 = await prisma.wallet.findUniqueOrThrow({ where: { userId: userAId } });

    console.log(`User B balance: ${walletBAfterDep2.balance} MAIN (expected: 3000)`);
    console.log(`User B bonus: ${walletBAfterDep2.bonusBalance} BONUS (expected: 0)`);
    console.log(`User A bonus: ${walletAAfterDep2.bonusBalance} BONUS (expected: 650 = 550 + 100 affiliate)`);

    const finalFixedTxs = await prisma.transaction.count({ where: { userId: userAId, referenceType: "REFERRAL" } });
    const finalAffTxs = await prisma.transaction.count({ where: { userId: userAId, referenceType: "AFFILIATE_COMMISSION" } });
    console.log(`Total fixed referral transactions: ${finalFixedTxs} (expected: 1)`);
    console.log(`Total affiliate commission transactions: ${finalAffTxs} (expected: 2)`);

    if (
      qualRes2 !== null ||
      walletBAfterDep2.balance !== 3000 ||
      walletBAfterDep2.bonusBalance !== 0 ||
      walletAAfterDep2.bonusBalance !== 650 ||
      finalFixedTxs !== 1 ||
      finalAffTxs !== 2
    ) {
      throw new Error("Step 7 FAILED: Second deposit gave duplicate fixed reward or incorrect affiliate commission");
    }
    console.log("✓ Step 7 PASSED: Second deposit gave 0 fixed reward, 100 affiliate commission only.");

    // Check referrer notification
    const referrerNotifs = await prisma.appNotification.findMany({
      where: { userId: userAId, type: NotificationType.REFERRAL },
    });
    console.log(`Referrer referral notifications count: ${referrerNotifs.length} (expected: 1)`);
    console.log(`Notification title: "${referrerNotifs[0]?.title}" (expected: "Referral Reward Earned")`);
    console.log(`Notification body: "${referrerNotifs[0]?.body}"`);

    // Verify summary for both users
    const summaryA = await ReferralService.getReferralSummary(userAId);
    const summaryB = await ReferralService.getReferralSummary(userBId);

    console.log("\nSummary User A:", {
      totalReferrals: summaryA.totalReferrals,
      completedReferrals: summaryA.completedReferrals,
      totalCommission: summaryA.totalCommission,
      affiliateEarnings: summaryA.affiliate?.totalAffiliateEarnings,
    });
    console.log("Summary User B:", {
      referredByCode: summaryB.referredByCode,
      referredStatus: summaryB.referredStatus,
      referredReward: summaryB.referredReward,
    });

    console.log("\n================================================================");
    console.log("🎉 ALL E2E VERIFICATION CHECKS PASSED PERFECTLY!");
    console.log("================================================================");
  } finally {
    // Cleanup test data
    await prisma.affiliateCommission.deleteMany({ where: { OR: [{ referrerId: userAId }, { referredUserId: userBId }] } }).catch(() => undefined);
    await prisma.appNotification.deleteMany({ where: { userId: { in: [userAId, userBId] } } }).catch(() => undefined);
    await prisma.transaction.deleteMany({ where: { userId: { in: [userAId, userBId] } } }).catch(() => undefined);
    await prisma.referral.deleteMany({ where: { OR: [{ referrerId: userAId }, { referredUserId: userBId }] } }).catch(() => undefined);
    await prisma.profile.deleteMany({ where: { userId: { in: [userAId, userBId] } } }).catch(() => undefined);
    await prisma.wallet.deleteMany({ where: { userId: { in: [userAId, userBId] } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("E2E Verification Error:", err);
  process.exit(1);
});
