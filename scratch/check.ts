import { prisma } from "@gaming-hub/db";

async function main() {
  const url = process.env.DATABASE_URL;
  console.log("DB Host:", new URL(url).hostname);
  const records = await prisma.siteSetting.findMany({ where: { category: "game_config" }});
  console.log("SiteSetting records:", JSON.stringify(records, null, 2));
}

main().finally(() => prisma.$disconnect());
