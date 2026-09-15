import { PrismaClient } from "@gaming-hub/db";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: {
      profile: true,
      wallet: true,
      walletTransactions: true,
    },
  });

  console.log("Total users in database:", users.length);

  let safePromotional = 0;
  let legitimateOrMixed = 0;
  let manualReview = 0;
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  const flaggedAccounts: Array<{ id: string; reason: string; txs: any[] }> = [];

  for (const u of users) {
    const isMigrated = u.profile?.promoMigratedAt != null;
    if (isMigrated) {
      migrated++;
    } else {
      skipped++;
    }

    // Inspect user transactions (exclude PROMOTIONAL_MIGRATION)
    const userTxs = u.walletTransactions.filter(
      (tx) => !(tx.referenceType === "COUPON" && (tx.meta as any)?.source === "PROMOTIONAL_MIGRATION")
    );

    const deposits = userTxs.filter((tx) => tx.referenceType === "DEPOSIT" || tx.type === "DEPOSIT");
    const coupons = userTxs.filter((tx) => tx.referenceType === "COUPON");
    const gamePrizes = userTxs.filter((tx) => tx.referenceType === "GAME" || tx.type === "GAME_PAYOUT" || tx.type === "MATCH_WIN");
    const tournamentPrizes = userTxs.filter((tx) => tx.referenceType === "TOURNAMENT_PRIZE" || tx.type === "TOURNAMENT_PRIZE");
    const manualCredits = userTxs.filter((tx) => tx.type === "ADMIN_ADJUST" || tx.type === "MANUAL_CREDIT");
    const externalFunding = userTxs.filter((tx) => tx.referenceType === "EXTERNAL_FUNDING");
    const withdrawals = userTxs.filter((tx) => tx.referenceType === "WITHDRAWAL" || tx.type === "WITHDRAWAL");
    const otherLegit = userTxs.filter((tx) => !["ENTRY_FEE", "REFUND", "BET"].includes(tx.type) && tx.amount > 0);

    const hasLegitFunding =
      deposits.length > 0 ||
      coupons.length > 0 ||
      gamePrizes.length > 0 ||
      tournamentPrizes.length > 0 ||
      manualCredits.length > 0 ||
      externalFunding.length > 0 ||
      withdrawals.length > 0;

    if (userTxs.length === 0) {
      safePromotional++;
    } else if (hasLegitFunding) {
      legitimateOrMixed++;
      if (isMigrated) {
        // Check if only the 2500 promo credit was moved to bonusBalance and legitimate funds remained
        console.log(`Migrated user ${u.id.slice(0, 8)} has legitimate/mixed history:`, {
          deposits: deposits.length,
          coupons: coupons.length,
          tournamentPrizes: tournamentPrizes.length,
          gamePrizes: gamePrizes.length,
          bonusBalance: u.wallet?.bonusBalance,
          balance: u.wallet?.balance,
        });
      }
    } else {
      // e.g. entry fee or refund
      safePromotional++;
    }
  }

  console.log("CLASSIFICATION SUMMARY:");
  console.log({
    totalScanned: users.length,
    SAFE_PROMOTIONAL: safePromotional,
    LEGITIMATE_OR_MIXED: legitimateOrMixed,
    MANUAL_REVIEW: manualReview,
    migrated,
    skipped,
    failed,
    flaggedAmbiguousAccounts: flaggedAccounts.length,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
