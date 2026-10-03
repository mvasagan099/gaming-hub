import { PrismaClient } from './src/generated/client/index.js';
import { schemaGuardSql } from './prisma/schema-guards/build-guard.js';
const client=new PrismaClient();
try {
  await client.$executeRawUnsafe(schemaGuardSql(!process.argv.includes('--existing')));
  console.log('Existing affiliate schema definitions verified.');
} catch {
  console.error('Schema drift detected in affiliate/referral tables, constraints, indexes, or enums. Deployment refused; inspect schema-guards/affiliate-schema.json before a reviewed recovery.');
  process.exitCode=1;
} finally { await client.$disconnect(); }
