import { prisma } from "@gaming-hub/db";

async function main() {
  const rows = await prisma.siteSetting.findMany({
    where: { category: "game_config" }
  });
  
  for (const row of rows) {
    if (row.key.startsWith("game_config.")) {
      const config = row.value as any;
      if (Array.isArray(config.entryFees) && !config.entryFees.includes(50)) {
        config.entryFees = [50, ...config.entryFees].sort((a, b) => a - b);
        console.log(`Updating ${row.key} with entryFees:`, config.entryFees);
        await prisma.siteSetting.update({
          where: { key: row.key },
          data: { value: config }
        });
      }
    }
  }
  console.log("Done updating entry fees.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
