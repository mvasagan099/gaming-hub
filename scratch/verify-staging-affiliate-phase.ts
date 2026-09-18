/**
 * Staging E2E Verification Script for Admin Affiliate Management & Business Logic
 *
 * Covers:
 * 1. ONE_TIME Mode End-to-End Deposit Flow
 * 2. CONTINUOUS Mode End-to-End Deposit Flow
 * 3. Duplicate Wallet Deposit Event Replay Protection (Idempotency)
 * 4. Non-Deposit Credit Protection (Game winnings, tournament prizes, refunds, admin adjustments)
 * 5. Admin Security (Permission checks, Fresh-MFA enforcement, and Audit Log creation)
 * 6. Historical Commission Immutability (Rate changes never alter historical records)
 * 7. Admin Affiliate APIs (Stats, Paginated Filtered Commissions, Audit Logs, Settings)
 */

import { prisma } from "@gaming-hub/db";
import { ReferralService } from "../apps/api/src/services/referrals";
import { AffiliateService } from "../apps/api/src/services/affiliateService";
import { WalletTransactionService } from "../apps/api/src/services/walletTransactionService";
import { applyTransaction } from "../apps/api/src/services/wallet";
import { requirePermission } from "../apps/api/src/lib/permissions";
import { requireMfa } from "../apps/api/src/plugins/authenticate";
import { recordLoginSession } from "../apps/api/src/services/sessions";
import { env } from "../apps/api/src/env";
import { createHash, randomUUID } from "crypto";
import type { FastifyRequest, FastifyReply } from "fastify";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function createTestUser(prefix: string, mainCoins = 0, bonusCoins = 0) {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@staging-test.local`,
      username: `${prefix}_${Math.random().toString(36).slice(2, 7)}`,
      displayName: `User ${prefix}`,
      role: "USER",
      wallet: {
        create: {
          balance: mainCoins,
          bonusBalance: bonusCoins,
        },
      },
      profile: {
        create: {
          xp: 100,
          level: 1,
        },
      },
    },
    include: { wallet: true },
  });
  return user.id;
}

async function runStagingVerification() {
  console.log("================================================================");
  console.log("STARTING STAGING VERIFICATION: ADMIN AFFILIATE MANAGEMENT");
  console.log("================================================================\n");

  const adminId = await createTestUser("staging-admin", 0, 0);
  await prisma.user.update({
    where: { id: adminId },
    data: { role: "ADMIN" },
  });
  await prisma.profile.update({
    where: { userId: adminId },
    data: { twoFactorEnabled: true },
  });

  // ---------------------------------------------------------------------------
  // 1. SETUP & SCENARIO A: ONE_TIME E2E
  // ---------------------------------------------------------------------------
  console.log("--- 1. SCENARIO A: ONE_TIME E2E ---");
  await ReferralService.adminUpdateSettings(
    {
      affiliateEnabled: true,
      affiliateMode: "ONE_TIME",
      affiliateDepositPercent: 5,
    },
    adminId
  );

  const userA = await createTestUser("user-A", 0, 0);
  const userB = await createTestUser("user-B", 0, 0);

  // User A gets referral code and User B applies it
  const codeA = await ReferralService.ensureReferralCode(userA);
  await ReferralService.applyReferral(userB, codeA);

  const refCheck = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: userB } });
  console.log("Referral link created: status =", refCheck.status, "firstCommissionAt =", refCheck.firstCommissionAt);

  // B deposit #1: 1,000 MAIN coins
  const dep1Tx = await prisma.$transaction(async (tx) => {
    return applyTransaction(tx, userB, 1000, "DEPOSIT", `dep-1-${Date.now()}`, {}, "MAIN");
  });
  await WalletTransactionService.onDepositCompleted({
    userId: userB,
    amount: 1000,
    transactionId: (dep1Tx as any)._transaction.id,
  });

  const bWallet1 = await prisma.wallet.findUniqueOrThrow({ where: { userId: userB } });
  const aWallet1 = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
  console.log(`Deposit #1 (1000 coins): B MAIN = ${bWallet1.balance} (Expected 1000), A BONUS = ${aWallet1.bonusBalance} (Expected 50)`);

  if (bWallet1.balance !== 1000 || aWallet1.bonusBalance !== 50) {
    throw new Error("Deposit #1 balances incorrect in ONE_TIME mode");
  }

  const refAfterDep1 = await prisma.referral.findUniqueOrThrow({ where: { referredUserId: userB } });
  if (!refAfterDep1.firstCommissionAt) {
    throw new Error("firstCommissionAt was not stamped on first deposit");
  }

  // B deposit #2: 2,000 MAIN coins in ONE_TIME mode -> A must get 0
  const dep2Tx = await prisma.$transaction(async (tx) => {
    return applyTransaction(tx, userB, 2000, "DEPOSIT", `dep-2-${Date.now()}`, {}, "MAIN");
  });
  await WalletTransactionService.onDepositCompleted({
    userId: userB,
    amount: 2000,
    transactionId: (dep2Tx as any)._transaction.id,
  });

  const bWallet2 = await prisma.wallet.findUniqueOrThrow({ where: { userId: userB } });
  const aWallet2 = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
  console.log(`Deposit #2 (2000 coins): B MAIN = ${bWallet2.balance} (Expected 3000), A BONUS = ${aWallet2.bonusBalance} (Expected 50 - 0 additional)`);

  if (bWallet2.balance !== 3000 || aWallet2.bonusBalance !== 50) {
    throw new Error("Deposit #2 credited extra commission in ONE_TIME mode");
  }

  const commCount1 = await prisma.affiliateCommission.count({ where: { referrerId: userA } });
  console.log("Total AffiliateCommission records for A:", commCount1, "(Expected 1)");
  if (commCount1 !== 1) throw new Error("AffiliateCommission count should be exactly 1");

  console.log("✓ ONE_TIME E2E PASSED\n");

  // ---------------------------------------------------------------------------
  // 2. SCENARIO B: CONTINUOUS E2E
  // ---------------------------------------------------------------------------
  console.log("--- 2. SCENARIO B: CONTINUOUS E2E ---");
  await ReferralService.adminUpdateSettings(
    {
      affiliateMode: "CONTINUOUS",
    },
    adminId
  );

  // B deposit #3: 3,000 MAIN coins -> A gets 5% = +150
  const dep3Tx = await prisma.$transaction(async (tx) => {
    return applyTransaction(tx, userB, 3000, "DEPOSIT", `dep-3-${Date.now()}`, {}, "MAIN");
  });
  await WalletTransactionService.onDepositCompleted({
    userId: userB,
    amount: 3000,
    transactionId: (dep3Tx as any)._transaction.id,
  });

  const aWallet3 = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
  console.log(`Deposit #3 (3000 coins): A BONUS = ${aWallet3.bonusBalance} (Expected 200 = 50 + 150)`);
  if (aWallet3.bonusBalance !== 200) throw new Error("Deposit #3 commission incorrect in CONTINUOUS mode");

  // B deposit #4: 2,000 MAIN coins -> A gets 5% = +100
  const dep4Tx = await prisma.$transaction(async (tx) => {
    return applyTransaction(tx, userB, 2000, "DEPOSIT", `dep-4-${Date.now()}`, {}, "MAIN");
  });
  await WalletTransactionService.onDepositCompleted({
    userId: userB,
    amount: 2000,
    transactionId: (dep4Tx as any)._transaction.id,
  });

  const aWallet4 = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
  console.log(`Deposit #4 (2000 coins): A BONUS = ${aWallet4.bonusBalance} (Expected 300 = 200 + 100)`);
  if (aWallet4.bonusBalance !== 300) throw new Error("Deposit #4 commission incorrect in CONTINUOUS mode");

  const commCount2 = await prisma.affiliateCommission.count({ where: { referrerId: userA } });
  console.log("Total AffiliateCommission records for A:", commCount2, "(Expected 3)");
  if (commCount2 !== 3) throw new Error("AffiliateCommission count should be 3");

  console.log("✓ CONTINUOUS E2E PASSED\n");

  // ---------------------------------------------------------------------------
  // 3. DUPLICATE EVENT REPLAY PROTECTION (Idempotency)
  // ---------------------------------------------------------------------------
  console.log("--- 3. VERIFY DUPLICATE EVENT REPLAY PROTECTION ---");
  const dep4TxId = (dep4Tx as any)._transaction.id;
  // Replay deposit #4 event
  await WalletTransactionService.onDepositCompleted({
    userId: userB,
    amount: 2000,
    transactionId: dep4TxId,
  });

  const aWalletReplay = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
  const commCountReplay = await prisma.affiliateCommission.count({ where: { referrerId: userA } });
  console.log(`Replayed event: A BONUS = ${aWalletReplay.bonusBalance} (Expected 300), Commission count = ${commCountReplay} (Expected 3)`);
  if (aWalletReplay.bonusBalance !== 300 || commCountReplay !== 3) {
    throw new Error("Duplicate deposit event resulted in double credit");
  }
  console.log("✓ DUPLICATE EVENT REPLAY PROTECTION PASSED\n");

  // ---------------------------------------------------------------------------
  // 4. NON-DEPOSIT CREDIT PROTECTION
  // ---------------------------------------------------------------------------
  console.log("--- 4. VERIFY NON-DEPOSIT CREDIT PROTECTION ---");
  const nonDepositTypes = [
    { type: "MATCH_PAYOUT", amount: 500, wallet: "MAIN" },
    { type: "TOURNAMENT_PRIZE", amount: 1000, wallet: "MAIN" },
    { type: "WAGER_REFUND", amount: 200, wallet: "MAIN" },
    { type: "ADMIN", amount: 300, wallet: "MAIN" },
    { type: "BONUS", amount: 100, wallet: "BONUS" },
  ] as const;

  for (const item of nonDepositTypes) {
    const txRes = await prisma.$transaction(async (tx) => {
      return applyTransaction(tx, userB, item.amount, item.type as any, `non-dep-${item.type}-${Date.now()}`, {}, item.wallet as any);
    });
    // Ensure onDepositCompleted is ONLY called on deposits, but if called on non-deposits directly:
    const comm = await AffiliateService.processDepositCommission({
      userId: userB,
      amount: item.amount,
      sourceType: item.type,
      sourceId: (txRes as any)._transaction.id,
    });
    if (comm !== null) {
      throw new Error(`Non-deposit type ${item.type} incorrectly generated commission`);
    }
  }

  const aWalletNonDep = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
  console.log(`After 5 non-deposit credits: A BONUS = ${aWalletNonDep.bonusBalance} (Expected unchanged 300)`);
  if (aWalletNonDep.bonusBalance !== 300) throw new Error("Non-deposit credit altered affiliate balance");
  console.log("✓ NON-DEPOSIT CREDIT PROTECTION PASSED\n");

  // ---------------------------------------------------------------------------
  // 5. ADMIN SECURITY (Permissions, Fresh MFA, Audit Logging)
  // ---------------------------------------------------------------------------
  console.log("--- 5. VERIFY ADMIN SECURITY & FRESH-MFA ---");
  const regularUser = await createTestUser("regular-user", 0, 0);

  // 5.1 Regular user rejected by requirePermission
  const fakeUserReq = {
    user: { id: regularUser, role: "USER" },
  } as unknown as FastifyRequest;

  let permissionBlocked = false;
  try {
    await requirePermission(fakeUserReq, "admin:settings:edit", prisma);
  } catch (err: any) {
    permissionBlocked = true;
  }
  if (!permissionBlocked) throw new Error("Regular user was not blocked by requirePermission");
  console.log("Regular user permission check correctly blocked (403)");

  // 5.2 Fresh-MFA check
  (env as unknown as Record<string, unknown>).MFA_FRESHNESS_MINUTES = 15;
  const staleToken = "staging-token-stale-mfa";
  await recordLoginSession({
    userId: adminId,
    token: staleToken,
    ip: "127.0.0.1",
    userAgent: "StagingAgent",
  });

  const staleReq = {
    user: { id: adminId, role: "ADMIN" },
    headers: { authorization: `Bearer ${staleToken}` },
  } as unknown as FastifyRequest;

  let mfaBlocked = false;
  try {
    await requireMfa(staleReq, {} as FastifyReply);
  } catch {
    mfaBlocked = true;
  }
  if (!mfaBlocked) throw new Error("Stale MFA was not blocked");
  console.log("Stale MFA session correctly blocked (MFA_REQUIRED)");

  // 5.3 Fresh MFA verified succeeds
  const freshToken = "staging-token-fresh-mfa";
  await recordLoginSession({
    userId: adminId,
    token: freshToken,
    ip: "127.0.0.1",
    userAgent: "StagingAgent",
  });
  await prisma.loginSession.update({
    where: { tokenHash: hashToken(freshToken) },
    data: { mfaVerifiedAt: new Date() },
  });

  const freshReq = {
    user: { id: adminId, role: "ADMIN" },
    headers: { authorization: `Bearer ${freshToken}` },
  } as unknown as FastifyRequest;

  await requireMfa(freshReq, {} as FastifyReply);
  console.log("Fresh MFA session authorized successfully");

  // 5.4 Execute setting change and check audit log
  await ReferralService.adminUpdateSettings(
    {
      affiliateDepositPercent: 10,
    },
    adminId
  );
  await new Promise((r) => setTimeout(r, 150));

  const latestAudit = await prisma.auditLog.findFirst({
    where: { actorId: adminId, action: "referral.settings_updated" },
    orderBy: { createdAt: "desc" },
  });
  if (!latestAudit) throw new Error("Audit log was not created for setting update");
  console.log("Audit log verified:", latestAudit.action, "by", latestAudit.actorId);
  console.log("✓ ADMIN SECURITY & FRESH-MFA PASSED\n");

  // ---------------------------------------------------------------------------
  // 6. HISTORICAL COMMISSION IMMUTABILITY
  // ---------------------------------------------------------------------------
  console.log("--- 6. VERIFY NO HISTORICAL RECALCULATION ---");
  // The rate was increased from 5% to 10%
  // Prior commissions: Deposit #1 (1000 @ 5% = 50), Deposit #3 (3000 @ 5% = 150), Deposit #4 (2000 @ 5% = 100)
  const priorComms = await prisma.affiliateCommission.findMany({
    where: { referrerId: userA },
    orderBy: { createdAt: "asc" },
  });
  console.log("Historical commission amounts:", priorComms.map((c) => Number(c.commissionAmount)));
  if (
    Number(priorComms[0].commissionAmount) !== 50 ||
    Number(priorComms[1].commissionAmount) !== 150 ||
    Number(priorComms[2].commissionAmount) !== 100
  ) {
    throw new Error("Historical commissions were altered by rate change");
  }

  // Next deposit gets new 10% rate: B deposits 1,000 -> A gets 10% = 100
  const dep5Tx = await prisma.$transaction(async (tx) => {
    return applyTransaction(tx, userB, 1000, "DEPOSIT", `dep-5-${Date.now()}`, {}, "MAIN");
  });
  await WalletTransactionService.onDepositCompleted({
    userId: userB,
    amount: 1000,
    transactionId: (dep5Tx as any)._transaction.id,
  });

  const aWallet5 = await prisma.wallet.findUniqueOrThrow({ where: { userId: userA } });
  console.log(`Deposit #5 (1000 coins @ 10%): A BONUS = ${aWallet5.bonusBalance} (Expected 400 = 300 + 100)`);
  if (aWallet5.bonusBalance !== 400) throw new Error("New deposit did not receive updated 10% rate");
  console.log("✓ HISTORICAL IMMUTABILITY PASSED\n");

  // ---------------------------------------------------------------------------
  // 7. ADMIN AFFILIATE APIS
  // ---------------------------------------------------------------------------
  console.log("--- 7. VERIFY ADMIN AFFILIATE APIS ---");
  const statsRes = await AffiliateService.getAdminAffiliateStats();
  console.log("Admin Affiliate Stats:", statsRes);
  if (statsRes.affiliateStatus !== "ENABLED" || statsRes.commissionPercent !== 10) {
    throw new Error("Admin Affiliate Stats incorrect");
  }

  const commsList = await AffiliateService.listAdminCommissions({ page: 1, pageSize: 10 });
  console.log(`Admin Commissions List: total = ${commsList.total}, returned = ${commsList.items.length}`);
  if (commsList.total < 4) throw new Error("Admin Commissions List missing records");

  const auditRes = await AffiliateService.getAdminAffiliateAudit();
  console.log(`Admin Affiliate Audit: ${auditRes.items.length} logs found`);
  if (auditRes.items.length === 0) throw new Error("Admin Affiliate Audit missing records");

  console.log("✓ ADMIN AFFILIATE APIS PASSED\n");

  console.log("================================================================");
  console.log("AFFILIATE SYSTEM — STAGING VERIFIED SUCCESSFULLY!");
  console.log("================================================================");
}

runStagingVerification()
  .catch((err) => {
    console.error("STAGING VERIFICATION FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
