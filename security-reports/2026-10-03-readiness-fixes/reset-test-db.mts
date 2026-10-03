import fs from 'node:fs';
import { PrismaClient } from '@gaming-hub/db';
import { validateTestDatabaseUrl } from '../../apps/api/test/databaseSafety';
import { resetTestDatabase } from '../../apps/api/test/db';

const url = validateTestDatabaseUrl('postgresql://audit:audit_local_only@127.0.0.1:5541/gaming_hub_readiness_8507d07_test');
process.env.TEST_DATABASE_URL = url;
process.env.DATABASE_URL = url;
const prisma = new PrismaClient({ datasources: { db: { url } } });
const tables = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE '_prisma%' ORDER BY tablename");
async function counts() {
  const result: Record<string, number> = {};
  for (const table of tables) {
    const name = table.tablename.replaceAll('"', '""');
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT count(*) FROM public."${name}"`);
    result[table.tablename] = Number(rows[0].count);
  }
  return result;
}
try {
  const before = await counts();
  await resetTestDatabase();
  const after = await counts();
  if (Object.values(after).some(value => value !== 0)) throw new Error('Test database reset left application rows');
  const result = { host: '127.0.0.1', port: 5541, database: 'gaming_hub_readiness_8507d07_test', procedure: 'project resetTestDatabase()', before, after, allApplicationTablesEmpty: true, productionDbTouched: false };
  fs.writeFileSync('security-reports/2026-10-03-readiness-fixes/database-reset.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ database: result.database, tables: tables.length, allApplicationTablesEmpty: true, productionDbTouched: false }));
} finally {
  await prisma.$disconnect();
  const { getTestPrisma } = await import('../../apps/api/test/db');
  await getTestPrisma().$disconnect();
}
