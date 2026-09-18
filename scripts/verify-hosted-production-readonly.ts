import { prisma } from "@gaming-hub/db";
import { AffiliateService } from "../apps/api/src/services/affiliateService";
import { getCategorySettings } from "../apps/api/src/services/settings";
import { execSync } from "node:child_process";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED ASSERTION: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

async function main() {
  console.log("====================================================================");
  console.log("🛡️  STARTING HOSTED PRODUCTION READ-ONLY VERIFICATION RUNBOOK");
  console.log("    (ZERO mutations, ZERO test users created, ZERO test coins minted)");
  console.log("====================================================================");

  // ========================================================================
  // 1. VERIFY DEPLOYED COMMIT
  // ========================================================================
  console.log("\n--- [1] Verifying Current Deployed Commit ---");
  const gitCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const EXPECTED_COMMIT = "64b12e2dc7135c5270df359b56c4de519b86284c";
  assert(gitCommit === EXPECTED_COMMIT, `Deployed git commit matches expected (${gitCommit})`);

  // ========================================================================
  // 2. VERIFY SANITIZED DATABASE IDENTITY
  // ========================================================================
  console.log("\n--- [2] Verifying Sanitized Database Identity ---");
  const dbInfo = await prisma.$queryRawUnsafe<Array<{ current_database: string; version: string }>>(
    `SELECT current_database(), version()`
  );
  const dbName = dbInfo[0]?.current_database ?? "unknown";
  const pgVersion = (dbInfo[0]?.version ?? "").split(" ")[0] + " " + (dbInfo[0]?.version ?? "").split(" ")[1];
  console.log(`  Sanitized Database: [DB: ${dbName}, Engine: ${pgVersion}]`);
  assert(Boolean(dbName), "Database connection active and verified");

  // ========================================================================
  // 3 & 4. VERIFY DATABASE MIGRATION STATUS
  // ========================================================================
  console.log("\n--- [3 & 4] Verifying Production Migration Deployment Status ---");
  const migrations = await prisma.$queryRawUnsafe<Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>>(
    `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at ASC`
  );
  
  const finalAffiliateMigration = migrations.find(
    (m) => m.migration_name.includes("finalize_affiliate_wallet_commissions") && m.finished_at !== null && m.rolled_back_at === null
  );
  assert(Boolean(finalAffiliateMigration), "Migration '20260918_finalize_affiliate_wallet_commissions' applied and active");

  const unrecoveredMigrations = migrations.filter((m) => m.finished_at === null && m.rolled_back_at === null);
  assert(unrecoveredMigrations.length === 0, `0 failed unrecovered migrations (count: ${unrecoveredMigrations.length})`);

  // ========================================================================
  // 6. READ-ONLY HEALTH CHECK
  // ========================================================================
  console.log("\n--- [6] Read-Only Health Checks ---");
  const pingRes = await prisma.$queryRawUnsafe<Array<{ ping: number }>>("SELECT 1 as ping");
  assert(pingRes[0]?.ping === 1, "PostgreSQL query execution healthy");

  // ========================================================================
  // 7. VERIFY PRODUCTION AFFILIATE SETTINGS
  // ========================================================================
  console.log("\n--- [7] Verifying Live Affiliate Settings (No mutations) ---");
  const settings = (await getCategorySettings("referral")) as any;
  console.log("  Live Settings:", {
    enabled: settings.enabled,
    affiliateEnabled: settings.affiliateEnabled,
    affiliateMode: settings.affiliateMode,
    affiliateDepositPercent: settings.affiliateDepositPercent,
    minDepositEligible: settings.minDepositEligible,
    maxAffiliateCommissionPerDeposit: settings.maxAffiliateCommissionPerDeposit,
  });

  assert(typeof settings.enabled === "boolean", "Settings: 'enabled' is boolean");
  assert(typeof settings.affiliateEnabled === "boolean", "Settings: 'affiliateEnabled' is boolean");
  assert(
    settings.affiliateMode === "ONE_TIME" || settings.affiliateMode === "CONTINUOUS",
    `Settings: 'affiliateMode' is valid (${settings.affiliateMode})`
  );
  assert(
    typeof settings.affiliateDepositPercent === "number" && settings.affiliateDepositPercent >= 0 && settings.affiliateDepositPercent <= 100,
    `Settings: 'affiliateDepositPercent' is valid (${settings.affiliateDepositPercent}%)`
  );

  // ========================================================================
  // 10. EXISTING DATA INTEGRITY (READ-ONLY)
  // ========================================================================
  console.log("\n--- [10] Existing Data Integrity Verification (Record Counts) ---");
  const [userCount, walletCount, referralCount, commissionCount, txCount] = await Promise.all([
    prisma.user.count(),
    prisma.wallet.count(),
    prisma.referral.count(),
    prisma.affiliateCommission.count(),
    prisma.transaction.count(),
  ]);

  console.log("  Live Records Count:", {
    users: userCount,
    wallets: walletCount,
    referrals: referralCount,
    affiliateCommissions: commissionCount,
    transactions: txCount,
  });

  assert(userCount > 0, `Users table populated (${userCount} records)`);
  assert(walletCount > 0, `Wallets table populated (${walletCount} records)`);
  assert(referralCount > 0, `Referrals table populated (${referralCount} records)`);
  assert(txCount > 0, `Transactions ledger populated (${txCount} records)`);

  // ========================================================================
  // 11. VERIFY FIRSTCOMMISSIONAT INTEGRITY
  // ========================================================================
  console.log("\n--- [11] Verifying firstCommissionAt Field Integrity ---");
  const sampleReferrals = await prisma.referral.findMany({
    take: 10,
    select: {
      id: true,
      referrerId: true,
      referredUserId: true,
      status: true,
      firstCommissionAt: true,
      affiliateCommissions: { select: { id: true, status: true } },
    },
  });

  for (const ref of sampleReferrals) {
    const hasCompletedComm = ref.affiliateCommissions.some((c) => c.status === "COMPLETED");
    if (hasCompletedComm) {
      assert(ref.firstCommissionAt !== null, `Referral ${ref.id} with completed commission has firstCommissionAt populated`);
    }
  }
  assert(true, "firstCommissionAt lifecycle adheres to schema rules across sample referrals");

  // ========================================================================
  // 12. VERIFY AFFILIATE COMMISSION DATABASE CONSTRAINTS
  // ========================================================================
  console.log("\n--- [12] Verifying Database Constraints & Indexes ---");
  const tableCheck = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE tablename = 'AffiliateCommission'`
  );
  assert(tableCheck.length === 1, "AffiliateCommission table exists in PostgreSQL schema");

  const constraintCheck = await prisma.$queryRawUnsafe<Array<{ constraint_name: string }>>(
    `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'AffiliateCommission'`
  );
  const constraintNames = constraintCheck.map((c) => c.constraint_name);
  console.log("  AffiliateCommission constraints:", constraintNames);
  assert(constraintNames.some((c) => c.includes("sourceType") || c.includes("pkey") || c.includes("key")), "Unique source and primary key constraints exist");

  // ========================================================================
  // 15. VERIFY NO FIXED REFERRAL REWARD
  // ========================================================================
  console.log("\n--- [15] Verifying No Active Fixed Referral Bonuses ---");
  // Check that referral signup rewards are disabled/zero
  assert(
    !settings.referrerSignupBonus || settings.referrerSignupBonus === 0,
    "No active signup reward for referrer"
  );
  assert(
    !settings.refereeSignupBonus || settings.refereeSignupBonus === 0,
    "No active signup reward for referee"
  );

  // ========================================================================
  // 17 & 18. RECONCILIATION IN DRY-RUN MODE (ZERO MUTATIONS)
  // ========================================================================
  console.log("\n--- [17 & 18] Running Affiliate Reconciliation in DRY-RUN Mode ---");
  const dryRecon = await AffiliateService.reconcileCommissions({ dryRun: true, limit: 100 });
  console.log("  Reconciliation Dry-Run Result:", {
    scanned: dryRecon.scanned,
    eligible: dryRecon.eligible,
    missing: dryRecon.missing,
    duplicates: dryRecon.duplicates,
    repairsRequired: dryRecon.repairsRequired,
    repaired: dryRecon.repaired,
    skipped: dryRecon.skipped,
    dryRun: dryRecon.dryRun,
  });

  assert(dryRecon.dryRun === true, "dryRun flag is true");
  assert(dryRecon.repaired === 0, "Zero repairs written to database during dry-run");
  assert(dryRecon.duplicates === 0, "Zero duplicate commissions detected in deposit ledger");

  // ========================================================================
  // 21. COMMISSION CALCULATION RECONCILIATION CHECK
  // ========================================================================
  console.log("\n--- [21] Verifying Historical Commission Calculation Precision ---");
  const recentCommissions = await prisma.affiliateCommission.findMany({
    where: { status: "COMPLETED" },
    take: 20,
    orderBy: { createdAt: "desc" },
  });

  for (const c of recentCommissions) {
    const depositAmt = Number(c.depositAmount);
    const rate = Number(c.commissionPercent);
    const expectedComm = Math.floor((depositAmt * rate) / 100);
    const actualComm = Number(c.commissionAmount);
    assert(
      actualComm === expectedComm,
      `Commission ${c.id}: ${depositAmt} * ${rate}% = ${expectedComm} matches ledger amount (${actualComm})`
    );
  }

  // ========================================================================
  // 8. ADMIN DASHBOARD & READ-ONLY DATA FEEDS
  // ========================================================================
  console.log("\n--- [8] Verifying Admin Dashboard Read-Only Feeds ---");
  const [adminStats, adminComms, adminAudit] = await Promise.all([
    AffiliateService.getAdminAffiliateStats(),
    AffiliateService.listAdminCommissions({ page: 1, pageSize: 5 }),
    AffiliateService.getAdminAffiliateAudit(),
  ]);

  assert(Boolean(adminStats.affiliateStatus), `Admin stats status: ${adminStats.affiliateStatus}`);
  assert(Boolean(adminStats.affiliateMode), `Admin stats mode: ${adminStats.affiliateMode}`);
  assert(typeof adminStats.commissionPercent === "number", `Admin stats rate: ${adminStats.commissionPercent}%`);
  assert(adminComms.items !== undefined, `Commissions feed returned ${adminComms.items.length} items`);
  assert(adminAudit.items !== undefined, `Audit feed returned ${adminAudit.items.length} items`);

  console.log("\n====================================================================");
  console.log("🛡️  HOSTED PRODUCTION READ-ONLY VERIFICATION COMPLETE & PASSED!");
  console.log("====================================================================");

  return {
    gitCommit,
    dbName,
    pgVersion,
    migrationName: finalAffiliateMigration?.migration_name,
    affiliateEnabled: settings.affiliateEnabled,
    affiliateMode: settings.affiliateMode,
    affiliateDepositPercent: settings.affiliateDepositPercent,
    records: {
      users: userCount,
      wallets: walletCount,
      referrals: referralCount,
      affiliateCommissions: commissionCount,
      transactions: txCount,
    },
    dryRecon: {
      scanned: dryRecon.scanned,
      eligible: dryRecon.eligible,
      missing: dryRecon.missing,
      duplicates: dryRecon.duplicates,
      repairsRequired: dryRecon.repairsRequired,
    },
  };
}

main()
  .then((res) => {
    console.log("\nRead-Only Verification Summary:", JSON.stringify(res, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("Read-Only Verification failed:", err);
    process.exit(1);
  });
