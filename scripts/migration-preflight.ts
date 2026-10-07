import { PrismaClient } from '@gaming-hub/db';
import { writeFile } from 'node:fs/promises';

/** SELECT-only reconciliation. Never runs migrations, deletes, refunds or updates records. */
export async function migrationPreflight(db: PrismaClient) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const duplicateSeats = await tx.$queryRaw`SELECT "matchId", "seat", COUNT(*)::int AS count
      FROM "MatchPlayer" GROUP BY "matchId","seat" HAVING COUNT(*)>1`;
    const duplicateParticipants = await tx.$queryRaw`SELECT p."userId", array_agg(p."matchId") AS matches
      FROM "MatchPlayer" p JOIN "Match" m ON m.id=p."matchId" WHERE m.status IN ('CREATED','ACTIVE')
      GROUP BY p."userId" HAVING COUNT(DISTINCT p."matchId")>1`;
    const invalidTournamentReferences = await tx.$queryRaw`SELECT r.id,r."tournamentId",r."matchId"
      FROM "TournamentRound" r LEFT JOIN "Match" m ON m.id=r."matchId"
      WHERE r."matchId" IS NOT NULL AND (m.id IS NULL
        OR m."gameId"<>(SELECT "gameId" FROM "Tournament" t WHERE t.id=r."tournamentId")
        OR (r."playerAId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MatchPlayer" p WHERE p."matchId"=m.id AND p."userId"=r."playerAId"))
        OR (r."playerBId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "MatchPlayer" p WHERE p."matchId"=m.id AND p."userId"=r."playerBId")))`;
    const unsettledHistoricalResults = await tx.$queryRaw`SELECT m.id,m."gameId",m.status,m.stake,m."endedAt"
      FROM "Match" m WHERE (m."endedAt" IS NOT NULL AND m.status NOT IN ('FINISHED','ABORTED'))
      OR (m.status='ACTIVE' AND m."matchDeadline"<CURRENT_TIMESTAMP)`;
    const tables = await tx.$queryRaw<Array<{ live: string | null; outbox: string | null }>>`SELECT
      to_regclass('public."LiveRoomCheckpoint"')::text AS live,to_regclass('public."GameResultOutbox"')::text AS outbox`;
    const durableSchemaPresent = !!tables[0]?.live && !!tables[0]?.outbox;
    const legacyLiveMatches = durableSchemaPresent ? await tx.$queryRaw`SELECT m.id,m."gameId",m.status,m.stake,m."startedAt"
      FROM "Match" m WHERE m.status IN ('CREATED','ACTIVE') AND m."gameId" IN ('ludo','fruit-ninja')
      AND NOT EXISTS (SELECT 1 FROM "LiveRoomCheckpoint" c WHERE c."matchId"=m.id AND c.closed=false
        AND c."schemaVersion"=1 AND c.snapshot->'match'->'engine'->>'engineVersion'='2')`
      : await tx.$queryRaw`SELECT m.id,m."gameId",m.status,m.stake,m."startedAt"
        FROM "Match" m WHERE m.status IN ('CREATED','ACTIVE') AND m."gameId" IN ('ludo','fruit-ninja')`;
    const duplicateLiveIdentities = durableSchemaPresent ? await tx.$queryRaw`SELECT "matchId",COUNT(*)::int AS count
      FROM "LiveRoomCheckpoint" WHERE "closed"=false AND "matchId" IS NOT NULL GROUP BY "matchId" HAVING COUNT(*)>1` : [];
    const pendingResults = durableSchemaPresent ? await tx.$queryRaw`SELECT id,"matchId",status,attempts,"lastError"
      FROM "GameResultOutbox" WHERE status<>'DELIVERED'` : [];
    const findings = { duplicateSeats, duplicateParticipants, duplicateLiveIdentities, legacyLiveMatches,
      invalidTournamentReferences, unsettledHistoricalResults, pendingResults };
    return { generatedAt: new Date().toISOString(), mode: 'READ_ONLY', durableSchemaPresent,
      verdict: Object.values(findings).some(rows => (rows as unknown[]).length) ? 'MANUAL_RECONCILIATION_REQUIRED' : 'CLEAN',
      policy: 'Financial records are preserved. Review paid conflicts and historical results manually. Drain existing processes before upgrade; incompatible Ludo/Fruit checkpoints are rejected. Cancel/refund only through the idempotent API after reconciliation.',
      findings };
  }, { timeout: 60000 });
}
if (process.argv[1]?.endsWith('migration-preflight.ts')) {
  const db = new PrismaClient();
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
    const report = await migrationPreflight(db);
    const output = process.argv[2];
    const json = JSON.stringify(report, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2);
    if (output) await writeFile(output, `${json}\n`); else console.log(json);
    process.exitCode = report.verdict === 'CLEAN' ? 0 : 2;
  } catch { console.error('PREFLIGHT_UNAVAILABLE: check database connectivity and read permissions'); process.exitCode = 1; }
  finally { await db.$disconnect(); }
}
