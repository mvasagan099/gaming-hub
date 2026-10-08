import { prisma } from "@gaming-hub/db";

async function main() {
  const records = await prisma.siteSetting.findMany({ take: 5 });
  console.log("First 5 SiteSetting records:", JSON.stringify(records, null, 2));
}

main().finally(() => prisma.$disconnect());
