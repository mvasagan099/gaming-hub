import { execSync } from "node:child_process";
import { PrismaClient } from "@gaming-hub/db";

const FRESH_DB_NAME = `gaming_hub_fresh_${Date.now()}`;
const ADMIN_DB_URL = "postgresql://testuser:testpass@localhost:5541/postgres";
const FRESH_DB_URL = `postgresql://testuser:testpass@localhost:5541/${FRESH_DB_NAME}`;

async function main() {
  console.log(`--- Creating fresh database: ${FRESH_DB_NAME} ---`);
  const adminClient = new PrismaClient({
    datasources: { db: { url: ADMIN_DB_URL } },
  });

  try {
    await adminClient.$executeRawUnsafe(`CREATE DATABASE "${FRESH_DB_NAME}"`);
  } catch (err: any) {
    console.error("Failed to create fresh DB:", err.message);
    process.exit(1);
  } finally {
    await adminClient.$disconnect();
  }

  console.log("--- Running: prisma migrate deploy against fresh database ---");
  try {
    const output = execSync("npx prisma migrate deploy --schema packages/db/prisma/schema.prisma", {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: FRESH_DB_URL },
      stdio: "pipe",
    }).toString();
    console.log(output);
  } catch (err: any) {
    console.error("prisma migrate deploy failed:", err.stderr?.toString() || err.message);
    process.exit(1);
  }

  console.log("--- Verifying schema against fresh database ---");
  const freshClient = new PrismaClient({
    datasources: { db: { url: FRESH_DB_URL } },
  });

  try {
    // 1. Check all tables exist
    const tables = await freshClient.$queryRawUnsafe<Array<{ table_name: string }>>(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    console.log(`Total tables created: ${tables.length}`);
    const tableNames = tables.map((t) => t.table_name);
    console.log("Tables:", tableNames);

    const requiredTables = [
      "User",
      "Profile",
      "Wallet",
      "Transaction",
      "WalletRequest",
      "CouponRedemption",
      "LoginSession",
      "UserPrivacy",
      "KycRequest",
      "KycDocument",
      "Room",
      "Match",
    ];
    for (const req of requiredTables) {
      if (!tableNames.includes(req)) {
        throw new Error(`Required table ${req} is missing from migrate deploy!`);
      }
    }

    // 2. Check defaults
    const walletCols = await freshClient.$queryRawUnsafe<Array<{ column_name: string; column_default: string }>>(`
      SELECT column_name, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'Wallet' AND column_name IN ('balance', 'bonusBalance', 'lockedBalance');
    `);
    console.log("Wallet column defaults:", walletCols);
    for (const col of walletCols) {
      if (!col.column_default || !col.column_default.includes("0")) {
        throw new Error(`Wallet.${col.column_name} default is not 0: ${col.column_default}`);
      }
    }

    // 3. Check unique constraints
    const uniqueConstraints = await freshClient.$queryRawUnsafe<Array<{ constraint_name: string; table_name: string }>>(`
      SELECT tc.constraint_name, tc.table_name
      FROM information_schema.table_constraints tc
      WHERE tc.table_schema = 'public' AND tc.constraint_type = 'UNIQUE'
      ORDER BY tc.table_name, tc.constraint_name;
    `);
    console.log("Unique constraints count:", uniqueConstraints.length);

    // 4. Create new user and verify withdrawable balance = 0
    console.log("--- Creating new user and checking initial balance ---");
    const testUser = await freshClient.user.create({
      data: {
        id: "fresh-user-test-1",
        username: "fresh_user_1",
        displayName: "Fresh User 1",
        email: "fresh1@test.com",
        wallet: {
          create: {}, // Rely completely on column defaults!
        },
        profile: {
          create: {},
        },
      },
      include: {
        wallet: true,
        profile: true,
      },
    });

    console.log("New User Wallet created with defaults:", {
      balance: testUser.wallet?.balance,
      bonusBalance: testUser.wallet?.bonusBalance,
      lockedBalance: testUser.wallet?.lockedBalance,
    });

    if (testUser.wallet?.balance !== 0) {
      throw new Error(`Expected new user balance = 0, got ${testUser.wallet?.balance}`);
    }
    if (testUser.wallet?.bonusBalance !== 0) {
      throw new Error(`Expected new user bonusBalance = 0, got ${testUser.wallet?.bonusBalance}`);
    }

    console.log("✅ REQUIREMENT 14 PASSED: prisma migrate deploy succeeds on fresh DB and default withdrawable balance is 0.");
  } finally {
    await freshClient.$disconnect();

    // Clean up fresh database
    const cleanupClient = new PrismaClient({
      datasources: { db: { url: ADMIN_DB_URL } },
    });
    try {
      await cleanupClient.$executeRawUnsafe(`DROP DATABASE "${FRESH_DB_NAME}" WITH (FORCE)`);
      console.log(`Cleaned up temporary DB ${FRESH_DB_NAME}`);
    } finally {
      await cleanupClient.$disconnect();
    }
  }
}

main().catch((err) => {
  console.error("VERIFICATION FAILED:", err);
  process.exit(1);
});
