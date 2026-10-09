import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '@gaming-hub/db';
import type { RecordedAction } from '@gaming-hub/multiplayer';
import { buildCompletedReplay, replayEvent } from './replay';
import type { RoomCheckpoint } from './checkpoint';
import type { DurableResult, DurableSnapshot } from './store';

/** Hash bounded pages; assemble the complete historical document in PostgreSQL. */
export async function archiveCompletedReplay(db: typeof prisma, saved: RoomCheckpoint, result: DurableResult): Promise<void> {
  const match = saved.match;
  if (!match || !await db.match.findUnique({ where: { id: result.matchId }, select: { id: true } })) return;
  const replay = buildCompletedReplay({ ...saved, match: { ...match, actionHistory: [] } } as unknown as DurableSnapshot, result);
  if (!replay) return;
  const hash = createHash('sha256');
  hash.update(JSON.stringify({ matchId: replay.matchId, initialState: replay.initialState }).slice(0, -1) + ',"events":[');
  let cursor = 0, count = 0;
  const append = (record: RecordedAction) => {
    if (count++) hash.update(',');
    hash.update(JSON.stringify(replayEvent(record, result.matchId)));
  };
  for (;;) {
    // Read JSON as text so Prisma's JSON-number decoder cannot round facts
    // before hashing them. Parsing uses the same JS JSON representation as input.
    const page = await db.$queryRaw<Array<{ turnNumber: number; recordJson: string }>>`SELECT "turnNumber", "record"::text AS "recordJson"
      FROM "MatchActionArchive" WHERE "matchId"=${result.matchId} AND "turnNumber">${cursor}
        AND "turnNumber"<=${match.archivedThroughTurn ?? 0} ORDER BY "turnNumber" LIMIT 64`;
    for (const row of page) { append(JSON.parse(row.recordJson) as RecordedAction); cursor = row.turnNumber; }
    if (page.length < 64) break;
  }
  for (const record of match.actionHistory) append(record);
  hash.update('],"finalState":' + JSON.stringify(replay.finalState) + '}');
  replay.checksum = hash.digest('hex'); replay.metadata.actionCount = count;
  // JSON aggregation happens in the database, never as a full Node.js array.
  await db.$executeRaw`INSERT INTO "Replay" ("id", "matchId", "gameId", "payload", "sizeBytes", "createdAt")
    SELECT ${randomUUID()}, ${result.matchId}, ${replay.gameId}, payload, octet_length(payload::text), now()
    FROM (SELECT jsonb_set(${JSON.stringify(replay)}::jsonb, '{events}',
      COALESCE(jsonb_agg(jsonb_build_object(
        'eventId', ${result.matchId} || ':' || (record->>'turnNumber'), 'matchId', ${result.matchId},
        'sequence', record->'turnNumber', 'playerId', record->'playerId', 'eventType', record->'action'->'type',
        'timestamp', record->'timestamp', 'stateVersion', record->'turnNumber',
        'actionData', COALESCE(NULLIF(record->'action'->'payload', 'null'::jsonb), '{}'::jsonb),
        'resultData', jsonb_build_object('events', COALESCE((SELECT jsonb_agg(event)
          FROM jsonb_array_elements(record->'events') event WHERE event->>'type' <> 'carrom:shot-start'), '[]'::jsonb))
          || CASE WHEN record->'replayState' IS NOT NULL AND record->'replayState' <> 'null'::jsonb THEN jsonb_build_object('state', record->'replayState') ELSE '{}'::jsonb END
      ) ORDER BY (record->>'turnNumber')::integer), '[]'::jsonb)) AS payload
      FROM (SELECT "record" AS record FROM "MatchActionArchive" WHERE "matchId"=${result.matchId} AND "turnNumber" <= ${match.archivedThroughTurn ?? 0}
        UNION ALL SELECT value FROM jsonb_array_elements(${JSON.stringify(match.actionHistory)}::jsonb)) records) document
    ON CONFLICT ("matchId") DO UPDATE SET "payload"=EXCLUDED."payload", "sizeBytes"=EXCLUDED."sizeBytes"`;
}
