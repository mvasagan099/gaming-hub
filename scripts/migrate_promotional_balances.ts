/**
 * Promotional Balance Migration Script
 *
 * Problem: The original schema created accounts with a Wallet.balance default of 2500
 * and/or Profile.coins default of 2500. These promotional funds must be moved to
 * the non-withdrawable bonusBalance to prevent them from being withdrawn as real money.
 *
 * Strategy:
 *   1. For each user whose Profile.promoMigratedAt is NULL (not yet migrated):
 *      a. Read the wallet inside a FOR UPDATE transaction.
 *      b. If balance > 0 and there is no real deposit/win history,
 *         move the promotional amount to bonusBalance atomically.
 *      c. Set Profile.promoMigratedAt to NOW() as the idempotency guard.
 *
 * Safety:
 *   - The script is fully idempotent: users with promoMigratedAt set are skipped.
 *   - Never runs destructive reset commands.
 *   - Dry-run mode is default; pass --apply to commit changes.
 *   - All changes are audit-logged.
 *
 * Usage:
 *   # Dry run (inspect what would change):
 *   npx ts-node scripts/migrate_promotional_balances.ts
 *
 *   # Apply:
 *   npx ts-node scripts/migrate_promotional_balances.ts --apply
 */

import { PrismaClient } from "../packages/db/src/generated/client/index.js";

const PROMO_AMOUNT = 2500; // The promotional starting balance from old accounts
const DRY_RUN = !process.argv.includes("--apply");

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

interface MigrationResult {
  total: number;
  skipped: number;
  migrated: number;
  errors: number;
  errorDetails: Array<{ userId: string; error: string }>;
}

async function migratePromoBalances(): Promise<MigrationResult> {
  const result: MigrationResult = {
    total: 0,
    skipped: 0,
    migrated: 0,
    errors: 0,
    errorDetails: [],
  };

  if (DRY_RUN) {
    console.log("🔍 DRY RUN MODE — no changes will be committed. Pass --apply to commit.");
  } else {
    console.log("⚡ APPLY MODE — changes will be written to the database.");
  }

  // Find all users whose wallet has a positive balance and haven't been migrated yet
  const profiles = await prisma.profile.findMany({
    where: { promoMigratedAt: null },
    select: { userId: true },
    orderBy: { userId: "asc" },
  });

  result.total = profiles.length;
  console.log(`\nFound ${result.total} unmigrated profiles to process.`);

  for (const profile of profiles) {
    const { userId } = profile;
    try {
      await prisma.$transaction(async (tx) => {
        // Lock wallet row
        const rows = await tx.$queryRaw<Array<{ balance: number; bonusBalance: number }>>`
          SELECT "balance", "bonusBalance"
          FROM "Wallet"
          WHERE "userId" = ${userId}
          FOR UPDATE
        `;

        if (rows.length === 0) {
          // No wallet — mark as migrated to skip on retry
          if (!DRY_RUN) {
            await tx.profile.update({
              where: { userId },
              data: { promoMigratedAt: new Date() },
            });
          }
          result.skipped++;
          return;
        }

        const { balance, bonusBalance } = rows[0];

        if (balance <= 0) {
          // Nothing to move — user already spent down, mark migrated
          if (!DRY_RUN) {
            await tx.profile.update({
              where: { userId },
              data: { promoMigratedAt: new Date() },
            });
          }
          result.skipped++;
          return;
        }

        // Check if user has any real money deposits
        const realDeposits = await tx.transaction.count({
          where: {
            userId,
            type: "CREDIT",
            walletType: "MAIN",
            referenceType: { in: ["DEPOSIT", "MATCH_PAYOUT"] },
          },
        });

        if (realDeposits > 0) {
          // User has real deposits — do NOT migrate; admin should review manually
          console.log(`  ⚠️  User ${userId}: has ${realDeposits} real deposits — skipping (manual review needed)`);
          // Leave the idempotency marker unset: this account needs an explicit
          // accounting review before any promotional portion can be moved.
          result.skipped++;
          return;
        }

        // Safe to migrate: balance is all promotional funds
        const promoToMove = Math.min(balance, PROMO_AMOUNT);
        console.log(`  ✅ User ${userId}: moving ${promoToMove} from balance → bonusBalance`);

        if (!DRY_RUN) {
          // Atomically move from balance → bonusBalance
          await tx.wallet.update({
            where: { userId },
            data: {
              balance: { decrement: promoToMove },
              bonusBalance: { increment: promoToMove },
            },
          });

          // Record transaction for audit trail
          await tx.transaction.create({
            data: {
              userId,
              type: "DEBIT",
              amount: promoToMove,
              balanceAfter: balance - promoToMove,
              walletType: "MAIN",
              referenceType: "COUPON", // Closest existing type for internal adjustments
              meta: {
                source: "PROMOTIONAL_MIGRATION",
                description: "Promotional starting balance moved to bonusBalance (non-withdrawable)",
                migratedAt: new Date().toISOString(),
              },
            },
          });

          await tx.transaction.create({
            data: {
              userId,
              type: "CREDIT",
              amount: promoToMove,
              balanceAfter: bonusBalance + promoToMove,
              walletType: "BONUS",
              referenceType: "COUPON",
              meta: {
                source: "PROMOTIONAL_MIGRATION",
                description: "Promotional starting balance received in bonusBalance",
                migratedAt: new Date().toISOString(),
              },
            },
          });

          // Mark this profile as migrated (idempotency guard)
          await tx.profile.update({
            where: { userId },
            data: { promoMigratedAt: new Date() },
          });
        }

        result.migrated++;
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ User ${userId}: error — ${errMsg}`);
      result.errors++;
      result.errorDetails.push({ userId, error: errMsg });
    }
  }

  return result;
}

async function main() {
  console.log("=".repeat(60));
  console.log("Promotional Balance Migration");
  console.log("=".repeat(60));

  const result = await migratePromoBalances();

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total profiles:    ${result.total}`);
  console.log(`Migrated:          ${result.migrated}`);
  console.log(`Skipped:           ${result.skipped}`);
  console.log(`Errors:            ${result.errors}`);

  if (result.errorDetails.length > 0) {
    console.log("\nError details:");
    for (const { userId, error } of result.errorDetails) {
      console.log(`  - ${userId}: ${error}`);
    }
  }

  if (DRY_RUN) {
    console.log("\n⚠️  DRY RUN COMPLETE — run with --apply to commit these changes.");
  } else {
    console.log(`\n${result.errors === 0 ? "✅" : "⚠️"} Migration complete.`);
  }

  await prisma.$disconnect();
  process.exit(result.errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
