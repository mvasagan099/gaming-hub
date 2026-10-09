import { buildCompletedReplay } from './replay';
import { archiveCompletedReplay } from './archiveReplay';
import { planHistoryRetention } from '@gaming-hub/multiplayer';
import type { RoomCheckpoint } from './checkpoint';
import { prisma, type Prisma } from '@gaming-hub/db';

export type DurableSnapshot = Prisma.InputJsonValue;
export interface DurableResult { id: string; matchId: string; roomId: string; result: Prisma.InputJsonValue }

/** No wallet writes here: this store checkpoints canonical game facts only. */
export class PostgresMatchStore {
  constructor(private readonly db = prisma) {}
  async validateSchema(): Promise<void> {
    const rows = await this.db.$queryRaw<Array<{ ready: boolean }>>`SELECT
      to_regclass('public."LiveRoomCheckpoint"') IS NOT NULL AND to_regclass('public."GameResultOutbox"') IS NOT NULL
      AND to_regclass('public.match_owner_fencing_seq') IS NOT NULL
      AND to_regclass('public."MatchActionArchive"') IS NOT NULL AS ready`;
    if (!rows[0]?.ready) throw new Error('DURABLE_MATCH_SCHEMA_REQUIRED: LiveRoomCheckpoint, GameResultOutbox, match_owner_fencing_seq and MatchActionArchive must exist in the socket DATABASE_URL database. Complete the read-only migration preflight and apply the approved recovery migrations before restarting.');
  }
  async hasArchivedAction(roomId: string, matchId: string, playerId: string, actionId: string): Promise<boolean> {
    return !!await this.db.matchActionArchive.findFirst({ where: { roomId, matchId, playerId, actionId }, select: { turnNumber: true } });
  }
  async nextFencingToken(): Promise<string> {
    const rows = await this.db.$queryRaw<Array<{ token: bigint }>>`SELECT nextval('match_owner_fencing_seq') AS token`;
    return rows[0]!.token.toString();
  }
  async create(roomId: string, code: string, snapshot: DurableSnapshot,
    owner?: { ownerId: string; token: string; ttlMs: number }) {
    return this.db.$transaction(async tx => {
      await reserveParticipants(tx, roomId, snapshot);
      const created = await tx.liveRoomCheckpoint.create({ data: { id: roomId, code, snapshot,
        ...(owner ? { ownerId: owner.ownerId, fencingToken: BigInt(owner.token) } : {}) } });
      if (owner) await tx.$executeRaw`UPDATE "LiveRoomCheckpoint" SET
        "leaseExpiresAt"=clock_timestamp() + ${owner.ttlMs} * interval '1 millisecond' WHERE "id"=${roomId}`;
      return created;
    });
  }
  async resolveRoom(identity: { roomId?: string; code?: string; matchId?: string }) {
    const where = identity.roomId ? { id: identity.roomId } : identity.code ? { code: identity.code.toUpperCase() }
      : identity.matchId ? { matchId: identity.matchId } : null;
    return where ? this.db.liveRoomCheckpoint.findUnique({ where, select: { id: true, closed: true } }) : null;
  }
  async load(roomId: string) { return this.db.liveRoomCheckpoint.findUnique({ where: { id: roomId } }); }
  async find(code: string) { return this.db.liveRoomCheckpoint.findUnique({ where: { code: code.toUpperCase() } }); }
  async findMatch(matchId: string) { return this.db.liveRoomCheckpoint.findUnique({ where: { matchId } }); }
  async isResultDelivered(matchId: string): Promise<boolean> {
    const event = await this.db.gameResultOutbox.findUnique({ where: { matchId }, select: { status: true } });
    return event?.status === 'DELIVERED';
  }
  async findPlayer(playerId: string): Promise<{ id: string } | null> {
    const rooms = await this.db.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "LiveRoomCheckpoint"
      WHERE "closed"=false AND ("snapshot"->'players' @> ${JSON.stringify([{ id: playerId }])}::jsonb
        OR "snapshot"->'spectators' @> ${JSON.stringify([{ id: playerId }])}::jsonb)
      ORDER BY "updatedAt" DESC LIMIT 1`;
    return rooms[0] ?? null;
  }
  async expiredRooms(limit = 20): Promise<Array<{ id: string }>> {
    return this.db.$queryRaw`SELECT "id" FROM "LiveRoomCheckpoint" WHERE "closed"=false
      AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt"<=clock_timestamp()) ORDER BY "updatedAt" LIMIT ${limit}`;
  }
  async adopt(roomId: string, ownerId: string, token: string, ttlMs: number): Promise<void> {
    const changed = await this.db.$executeRaw`UPDATE "LiveRoomCheckpoint" SET "ownerId"=${ownerId}, "fencingToken"=${BigInt(token)},
      "leaseExpiresAt"=clock_timestamp() + ${ttlMs} * interval '1 millisecond'
      WHERE "id"=${roomId} AND "fencingToken" < ${BigInt(token)} AND "closed"=false`;
    if (changed !== 1) throw new Error('STALE_MATCH_OWNER');
  }
  async renew(roomId: string, ownerId: string, token: string, ttlMs: number): Promise<void> {
    const changed = await this.db.$executeRaw`UPDATE "LiveRoomCheckpoint" SET
      "leaseExpiresAt"=clock_timestamp() + ${ttlMs} * interval '1 millisecond'
      WHERE "id"=${roomId} AND "ownerId"=${ownerId} AND "fencingToken"=${BigInt(token)} AND "closed"=false`;
    if (changed !== 1) throw new Error('STALE_MATCH_OWNER');
  }
  async commit(roomId: string, ownerId: string, token: string, expectedRevision: number,
    matchId: string | null, snapshot: DurableSnapshot, result?: DurableResult, closed = false, previousParticipants?: string[]): Promise<number> {
    const original = snapshot as unknown as RoomCheckpoint;
    const plan = original.match ? planHistoryRetention(original.match) : null;
    // Terminal commits preserve the entire remaining tail with the result outbox,
    // even if optional replay-document materialization later fails.
    const archiveRows = plan ? [...plan.archive, ...(result && original.match?.matchId === result.matchId ? plan.retained : [])] : [];
    if (archiveRows.length && original.match!.matchId !== matchId) throw new Error("ARCHIVE_MATCH_ID_MISMATCH");
    const committedSnapshot = plan?.archive.length ? { ...original, match: { ...original.match!,
      actionHistory: plan.retained, archivedThroughTurn: plan.archivedThroughTurn, archivedActionFilter: plan.archivedActionFilter } } as unknown as DurableSnapshot : snapshot;
    const players = (snapshot as { players?: Array<{ id?: string }> }).players ?? [];
    const ids = players.map(p => p.id).filter((id): id is string => typeof id === 'string').sort();
    const stable = previousParticipants != null && ids.length === players.length && new Set(ids).size === ids.length &&
      canonical(ids) === canonical([...previousParticipants].sort());
    const writeCheckpoint = async (tx: Pick<Prisma.TransactionClient, '$executeRaw'>) => {
      // Stable membership was reserved by the previous fenced commit. Verify it
      // in this atomic UPDATE instead of an additional SELECT on every frame.
      // Any join/leave still takes the original participant-lock/conflict path.
      const changed = await tx.$executeRaw`UPDATE "LiveRoomCheckpoint" SET "snapshot"=${JSON.stringify(committedSnapshot)}::jsonb,
        "closed"=${closed}, "matchId"=${matchId}, "revision"="revision"+1, "updatedAt"=clock_timestamp()
        WHERE "id"=${roomId} AND "ownerId"=${ownerId} AND "fencingToken"=${BigInt(token)}
          AND "revision"=${expectedRevision} AND "leaseExpiresAt">clock_timestamp() AND "closed"=false
          AND (${!stable} OR (jsonb_array_length("snapshot"->'players')=${ids.length}
            AND "snapshot"->'players' @> ${JSON.stringify(ids.map(id => ({ id })))}::jsonb))`;
      if (changed !== 1) throw new Error('STALE_MATCH_OWNER_OR_REVISION');
      return expectedRevision + 1;
    };
    // A frame with unchanged membership has exactly one guarded write. PostgreSQL
    // makes that UPDATE atomic without BEGIN/COMMIT network round trips. Result
    // outbox insertion and participant changes still require the full transaction.
    const nextRevision = stable && !closed && !result && !archiveRows.length
      ? await writeCheckpoint(this.db)
      : await this.db.$transaction(async tx => {
      if (!closed && !stable) await reserveParticipants(tx, roomId, snapshot);
      const revision = await writeCheckpoint(tx);
      if (archiveRows.length) {
        // Compare JSONB inside PostgreSQL. A JSON round trip through Prisma's
        // floating-point decoder can change coin coordinates by one ULP.
        const rowsJson = JSON.stringify(archiveRows.map(record => ({
          roomId, matchId: original.match!.matchId, turnNumber: record.turnNumber,
          playerId: record.playerId, actionId: typeof record.action.actionId === 'string' ? record.action.actionId : null,
          record,
        })));
        await tx.$executeRaw`INSERT INTO "MatchActionArchive" ("roomId", "matchId", "turnNumber", "playerId", "actionId", "record")
          SELECT "roomId", "matchId", "turnNumber", "playerId", "actionId", "record"
          FROM jsonb_to_recordset(${rowsJson}::jsonb) AS incoming("roomId" text, "matchId" text,
            "turnNumber" integer, "playerId" text, "actionId" text, "record" jsonb)
          ON CONFLICT DO NOTHING`;
        const conflicts = await tx.$queryRaw<Array<{ conflict: boolean }>>`SELECT EXISTS (
          SELECT 1 FROM jsonb_to_recordset(${rowsJson}::jsonb) AS incoming("roomId" text, "matchId" text,
            "turnNumber" integer, "playerId" text, "actionId" text, "record" jsonb)
          LEFT JOIN "MatchActionArchive" stored ON stored."matchId"=incoming."matchId" AND stored."turnNumber"=incoming."turnNumber"
          WHERE stored."roomId" IS DISTINCT FROM incoming."roomId"
            OR stored."playerId" IS DISTINCT FROM incoming."playerId"
            OR stored."actionId" IS DISTINCT FROM incoming."actionId"
            OR stored."record" IS DISTINCT FROM incoming."record") AS conflict`;
        if (conflicts[0]?.conflict !== false) throw new Error('CONFLICTING_ARCHIVED_ACTION');
      }
      if (result) {
        const existing = await tx.gameResultOutbox.findUnique({ where: { matchId: result.matchId } });
        if (!existing) await tx.gameResultOutbox.create({ data: result });
        if (existing && (existing.id !== result.id || existing.roomId !== result.roomId || canonical(existing.result) !== canonical(result.result))) throw new Error('CONFLICTING_CANONICAL_RESULT');
      }
      return revision;
    }, { timeout: 45000, maxWait: 10000 });

    if (result) {
      try {
        const saved = committedSnapshot as unknown as RoomCheckpoint;
        if ((saved.match?.archivedThroughTurn ?? 0) > 0) {
          await archiveCompletedReplay(this.db, saved, result);
          return nextRevision;
        }
        const replay = buildCompletedReplay(committedSnapshot, result);
        if (replay && await this.db.match.findUnique({ where: { id: result.matchId }, select: { id: true } })) {
          const payloadStr = JSON.stringify(replay);
          await this.db.replay.upsert({
            where: { matchId: result.matchId },
            create: {
              matchId: result.matchId,
              gameId: replay.gameId,
              payload: replay as unknown as Prisma.InputJsonValue,
              sizeBytes: Buffer.byteLength(payloadStr),
            },
            update: {
              payload: replay as unknown as Prisma.InputJsonValue,
              sizeBytes: Buffer.byteLength(payloadStr),
            },
          });
        }
      } catch (error) {
        console.warn(`[REPLAY ARCHIVE WARNING] Failed to persist match replay for ${result.matchId}:`, error);
      }
    }

    return nextRevision;
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}

async function reserveParticipants(tx: Prisma.TransactionClient, roomId: string, snapshot: DurableSnapshot) {
  const players = (snapshot as { players?: Array<{ id?: string }> }).players ?? [];
  const ids = players.map(p => p.id).filter((id): id is string => typeof id === 'string');
  // Membership usually stays unchanged during physics ticks. Avoid taking
  // participant locks and repeating conflict queries on every frame.
  if (ids.length) {
    const same = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "LiveRoomCheckpoint"
      WHERE id=${roomId} AND closed=false AND jsonb_array_length(snapshot->'players')=${ids.length}
        AND snapshot->'players' @> ${JSON.stringify(ids.map(id => ({ id })))}::jsonb`;
    if (same.length) return;
  }
  for (const id of ids.sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'live-participant:' + id}))`;
    const conflict = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "LiveRoomCheckpoint"
      WHERE closed=false AND id<>${roomId} AND snapshot->'players' @> ${JSON.stringify([{ id }])}::jsonb LIMIT 1`;
    if (conflict.length) throw new Error('PLAYER_ALREADY_IN_LIVE_ROOM');
  }
}
