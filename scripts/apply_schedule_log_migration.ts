import { prisma } from '@gaming-hub/db';

async function applyMigration() {
  console.log('Applying migration: add gameId to TournamentTierScheduleLog');

  // 1. Clear existing log entries (safe: only idempotency guard, not actual tournaments)
  const deleted = await prisma.$executeRaw`DELETE FROM "TournamentTierScheduleLog"`;
  console.log(`Cleared ${deleted} schedule log rows`);

  // 2. Drop old indexes
  try {
    await prisma.$executeRaw`DROP INDEX IF EXISTS "TournamentTierScheduleLog_tierId_slotHour_key"`;
    console.log('Dropped old unique index');
  } catch (e: any) { console.log('drop unique idx:', e.message); }

  try {
    await prisma.$executeRaw`DROP INDEX IF EXISTS "TournamentTierScheduleLog_tierId_slotHour_idx"`;
    console.log('Dropped old regular index');
  } catch (e: any) { console.log('drop reg idx:', e.message); }

  // 3. Add gameId column with a temporary default (all rows cleared above)
  try {
    await prisma.$executeRaw`ALTER TABLE "TournamentTierScheduleLog" ADD COLUMN IF NOT EXISTS "gameId" TEXT NOT NULL DEFAULT ''`;
    console.log('Added gameId column');
  } catch (e: any) { console.log('add col:', e.message); }

  try {
    await prisma.$executeRaw`ALTER TABLE "TournamentTierScheduleLog" ALTER COLUMN "gameId" DROP DEFAULT`;
    console.log('Removed default from gameId');
  } catch (e: any) { console.log('drop default:', e.message); }

  // 4. Create new unique constraint
  try {
    await prisma.$executeRaw`CREATE UNIQUE INDEX "TournamentTierScheduleLog_tierId_gameId_slotHour_key" ON "TournamentTierScheduleLog"("tierId", "gameId", "slotHour")`;
    console.log('Created unique index: (tierId, gameId, slotHour)');
  } catch (e: any) { console.log('unique idx:', e.message); }

  // 5. Create covering index
  try {
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "TournamentTierScheduleLog_tierId_gameId_slotHour_idx" ON "TournamentTierScheduleLog"("tierId", "gameId", "slotHour")`;
    console.log('Created regular index');
  } catch (e: any) { console.log('reg idx:', e.message); }

  console.log('Migration complete ✓');
}

applyMigration()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
