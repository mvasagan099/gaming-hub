import { prisma } from "../packages/db/src/index";
import { codeFromUsername } from "../apps/api/src/services/referrals";

async function main() {
  console.log("Starting backfill for referral codes and missing wallets...");

  // 1. Wallets
  const usersWithoutWallet = await prisma.user.findMany({
    where: { wallet: null },
    select: { id: true, username: true },
  });

  console.log(`Found ${usersWithoutWallet.length} users without a wallet.`);
  for (const u of usersWithoutWallet) {
    await prisma.wallet.create({
      data: { userId: u.id },
    }).catch(() => undefined);
  }
  console.log("Wallets backfilled successfully.");

  // 2. Referral Codes
  const usersWithoutCode = await prisma.user.findMany({
    where: { referralCode: null },
    select: { id: true, username: true },
  });

  console.log(`Found ${usersWithoutCode.length} users without a referral code.`);

  let updated = 0;
  for (const u of usersWithoutCode) {
    let success = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = attempt === 0 ? codeFromUsername(u.username) : codeFromUsername(`${u.username}${attempt}`);
      try {
        await prisma.user.update({
          where: { id: u.id },
          data: { referralCode: code },
        });
        success = true;
        updated++;
        break;
      } catch (err) {
        // Retry on unique collision
      }
    }
    if (!success) {
      console.warn(`Could not allocate code for user ${u.username} (${u.id})`);
    }
  }

  console.log(`Referral codes backfilled successfully for ${updated} users.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
