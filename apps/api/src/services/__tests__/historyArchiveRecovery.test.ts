import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Redis from 'ioredis';
import { prisma } from '@gaming-hub/db';
import { MultiplayerFramework } from '@gaming-hub/multiplayer';
import { createIoStub, createMatchRoom, makePlayer } from '../../../../../packages/multiplayer/__tests__/helpers';
import { DistributedRoomCoordinator } from '../../../../socket-server/src/distributed/coordinator';
import { PostgresMatchStore, type DurableSnapshot } from '../../../../socket-server/src/distributed/store';
import { serializeRoomCheckpoint } from '../../../../socket-server/src/distributed/checkpoint';
import { buildCompletedReplay } from '../../../../socket-server/src/distributed/replay';
let framework: MultiplayerFramework | undefined, coordinator: DistributedRoomCoordinator | undefined, redis: Redis | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  await framework?.shutdown(); await coordinator?.stop(); await redis?.quit();
  framework = undefined; coordinator = undefined; redis = undefined;
});
async function host(store: PostgresMatchStore, namespace: string) {
  MultiplayerFramework.resetInstance(); framework = MultiplayerFramework.getInstance({ io: createIoStub(), enableReplay: false, enableAntiCheat: false });
  redis = new Redis(process.env.TEST_REDIS_URL!);
  coordinator = new DistributedRoomCoordinator(framework as unknown as ConstructorParameters<typeof DistributedRoomCoordinator>[0], redis, store, 10000, namespace);
  const c = coordinator;
  framework.config.executeRoomTask = (id, task, lifecycle) => c.local(id, task, false, lifecycle);
  framework.config.publish = (room, event, payload, destination) => c.publish(room, event, payload, destination);
  framework.config.hasArchivedAction = (id, match, player, action) => store.hasArchivedAction(id, match, player, action);
  framework.config.persistFinalResult = (room, result) => c.finalResult(room, result);
  framework.config.closeRoom = (room, reason) => c.close(room, reason);
  await c.start(async () => undefined);
  return { framework, c };
}
describe('Durable bounded action history', () => {
  it('keeps a long legal match bounded, restores old retry identity after takeover, and archives every completed action', async () => {
    const store = new PostgresMatchStore(), namespace = `history-test:${randomUUID()}`; let h = await host(store, namespace);
    const ids = [randomUUID(), randomUUID()], room = createMatchRoom('carrom', ids.map((id, seat) => makePlayer(id, seat)));
    room.id = randomUUID(); room.code = randomUUID(); room.ioName = room.id; room.match!.matchId = randomUUID();
    h.framework.roomManager.registerRoom(room);
    await prisma.match.create({ data: { id: room.match!.matchId, gameId: 'carrom', status: 'ACTIVE' } });
    await h.c.create(async () => room);
    for (let i = 0; i < 310; i++) {
      h.framework.actionValidator.resetPlayer(ids[0]);
      const result = await h.framework.matchManager.applyAction({ roomId: room.id, playerId: ids[0],
        action: { type: 'place-striker', x: 300, actionId: `placement-${i}`, clientSequence: i + 1 } });
      expect(result.ok).toBe(true); expect(room.match!.actionHistory.length).toBeLessThanOrEqual(128);
      expect(room.match!.stateSnapshots.length).toBeLessThanOrEqual(1);
    }
    const checkpoint = await store.load(room.id);
    expect((checkpoint!.snapshot as any).match.actionHistory.length).toBeLessThanOrEqual(128);
    expect(await store.hasArchivedAction(room.id, room.match!.matchId, ids[0], 'placement-0')).toBe(true);
    expect(await store.hasArchivedAction(room.id, room.match!.matchId, ids[1], 'placement-0')).toBe(false);
    expect(await store.hasArchivedAction(room.id, randomUUID(), ids[0], 'placement-0')).toBe(false);
    expect(await store.hasArchivedAction(randomUUID(), room.match!.matchId, ids[0], 'placement-0')).toBe(false);
    const applyBeforeRestart = vi.spyOn(room.match!.engine as any, 'apply');
    const retryBeforeRestart = await h.framework.matchManager.applyAction({ roomId: room.id, playerId: ids[0],
      action: { type: 'place-striker', x: 100, actionId: 'placement-0', clientSequence: 999 } });
    expect(retryBeforeRestart.ok).toBe(true); expect(applyBeforeRestart).not.toHaveBeenCalled();
    expect(room.match!.turnNumber).toBe(310); expect(room.players.get(ids[0])!.packetSequenceNumber).toBe(310);
    applyBeforeRestart.mockRestore();
    // Release this process's owner and restore from its actual PostgreSQL checkpoint.
    h.framework.matchManager.detachRoom(room); h.framework.roomManager.unregisterRoom(room.id);
    await h.framework.shutdown(); await h.c.stop(); await redis!.quit();
    h = await host(store, namespace);
    await h.c.local(room.id, async () => {
      const recovered = h.framework.roomManager.getRoom(room.id)!;
      const apply = vi.spyOn(recovered.match!.engine as any, 'apply');
      const retry = await h.framework.matchManager.applyAction({ roomId: room.id, playerId: ids[0],
        action: { type: 'place-striker', x: 100, actionId: 'placement-0', clientSequence: 1 } });
      expect(retry.ok).toBe(true); expect(apply).not.toHaveBeenCalled(); expect(recovered.match!.turnNumber).toBe(310);
      expect(recovered.players.get(ids[0])!.packetSequenceNumber).toBe(310); apply.mockRestore();
      h.framework.actionValidator.resetPlayer(ids[0]);
      const shot = await h.framework.matchManager.applyAction({ roomId: room.id, playerId: ids[0],
        action: { type: 'strike', x: 300, angle: -Math.PI / 2, power: 0.05, actionId: 'shot', clientSequence: 311 } });
      expect(shot.ok).toBe(true);
      const resigningId = ids[(recovered.match!.engine as any).currentSeat];
      const finish = await h.framework.matchManager.applyAction({ roomId: room.id, playerId: resigningId,
        action: { type: 'resign', actionId: 'final', clientSequence: 312 } });
      expect(finish.finished).toBe(true);
    });
    const recovered = h.framework.roomManager.getRoom(room.id)!;
    const archived = await prisma.matchActionArchive.findMany({ where: { matchId: recovered.match!.matchId }, orderBy: { turnNumber: 'asc' } });
    const event = await prisma.gameResultOutbox.findUnique({ where: { matchId: recovered.match!.matchId } });
    const replay = (await prisma.replay.findUnique({ where: { matchId: recovered.match!.matchId } }))!.payload as any;
    expect(archived).toHaveLength(312);
    expect(replay.events).toHaveLength(312);
    expect(replay.events.some((e: any) => e.resultData.events.some((event: any) => event.type === "shot-trajectory"))).toBe(true); expect(replay.metadata.actionCount).toBe(312);
    expect(replay.events.map((e: any) => e.sequence)).toEqual(Array.from({ length: 312 }, (_, i) => i + 1));
    const saved = serializeRoomCheckpoint(h.framework, recovered);
    const exact = await prisma.$queryRaw<Array<{ recordJson: string }>>`SELECT "record"::text AS "recordJson"
      FROM "MatchActionArchive" WHERE "matchId"=${recovered.match!.matchId} AND "turnNumber"<=${recovered.match!.archivedThroughTurn ?? 0}
      ORDER BY "turnNumber"`;
    const complete = { ...saved, match: { ...saved.match!, actionHistory: [...exact.map(r => JSON.parse(r.recordJson)), ...recovered.match!.actionHistory] } };
    expect(replay.checksum).toBe(buildCompletedReplay(complete as unknown as DurableSnapshot, event as any)!.checksum);
    expect(await prisma.gameResultOutbox.count({ where: { matchId: recovered.match!.matchId } })).toBe(1);
  }, 60000);
  it('rolls back checkpoint advancement when archival uniqueness fails', async () => {
    const store = new PostgresMatchStore(), id = randomUUID(), matchId = randomUUID(), token = await store.nextFencingToken();
    const records = Array.from({ length: 129 }, (_, i) => ({ turnNumber: i + 1, timestamp: i, playerId: 'a', seat: 0,
      action: { type: 'place-striker', actionId: i < 2 ? 'duplicate' : `id-${i}` }, events: [] }));
    const snapshot = { room: { id }, players: [{ id: 'a' }], match: { matchId, turnNumber: 129, actionHistory: records } };
    await store.create(id, randomUUID(), snapshot, { ownerId: 'owner', token, ttlMs: 60000 });
    await expect(store.commit(id, 'owner', token, 0, matchId, snapshot, undefined, false, ['a'])).rejects.toThrow('CONFLICTING_ARCHIVED_ACTION');
    expect(await store.load(id)).toMatchObject({ revision: 0, snapshot: { match: { actionHistory: records } } });
    expect(await prisma.matchActionArchive.count({ where: { matchId } })).toBe(0);
    expect(records).toHaveLength(129);
  });
  it('persists terminal facts before replay materialization and accepts exact archival retries only', async () => {
    const store = new PostgresMatchStore(), id = randomUUID(), matchId = randomUUID(), token = await store.nextFencingToken();
    const playerId = randomUUID();
    const records = Array.from({ length: 5 }, (_, i) => ({ turnNumber: i + 1, timestamp: i, playerId, seat: 0,
      action: { type: 'place-striker', actionId: `action-${i}` }, events: [] }));
    const snapshot = { room: { id }, players: [{ id: playerId }], match: { matchId, turnNumber: 5, actionHistory: records } };
    await store.create(id, randomUUID(), snapshot, { ownerId: 'owner', token, ttlMs: 60000 });
    const result = { id: randomUUID(), roomId: id, matchId, result: { kind: 'CANCEL' } };
    await store.commit(id, 'owner', token, 0, matchId, snapshot, result, false, [playerId]);
    expect(await prisma.matchActionArchive.count({ where: { matchId } })).toBe(5);
    expect(await prisma.gameResultOutbox.count({ where: { matchId } })).toBe(1);
    await store.commit(id, 'owner', token, 1, matchId, snapshot, result, false, [playerId]);
    expect(await prisma.matchActionArchive.count({ where: { matchId } })).toBe(5);
    const conflict = { ...snapshot, match: { ...snapshot.match, actionHistory: records.map((record, i) =>
      i === 0 ? { ...record, timestamp: 999 } : record) } };
    await expect(store.commit(id, 'owner', token, 2, matchId, conflict, result, false, [playerId])).rejects.toThrow('CONFLICTING_ARCHIVED_ACTION');
    expect(await store.load(id)).toMatchObject({ revision: 2 });
    expect((await prisma.matchActionArchive.findUnique({ where: { matchId_turnNumber: { matchId, turnNumber: 1 } } }))!.record).toMatchObject({ timestamp: 0 });
  });

});
