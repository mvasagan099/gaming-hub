import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@gaming-hub/db';
import { GAME_IDS } from '@gaming-hub/shared';
import { PostgresMatchStore } from '../../../../socket-server/src/distributed/store';

const store = new PostgresMatchStore();
afterEach(() => vi.restoreAllMocks());
async function setup(gameId = 'chess') {
  const id = randomUUID(), token = await store.nextFencingToken();
  const ids = [randomUUID(), randomUUID()];
  const snapshot = { room: { config: { gameId } }, players: ids.map(id => ({ id })), frame: 0 };
  await store.create(id, randomUUID(), snapshot, { ownerId: 'owner', token, ttlMs: 60000 });
  return { id, token, ids, snapshot };
}
describe('atomic gameplay frame checkpoints', () => {
  it.each(GAME_IDS)('%s persists consecutive frames without transaction round trips', async gameId => {
    const f = await setup(gameId);
    const transactions = vi.spyOn(prisma, '$transaction');
    for (let revision = 0; revision < 20; revision++) {
      expect(await store.commit(f.id, 'owner', f.token, revision, null,
        { ...f.snapshot, frame: revision + 1 }, undefined, false, f.ids)).toBe(revision + 1);
    }
    expect(transactions).not.toHaveBeenCalled();
    expect(await store.load(f.id)).toMatchObject({ revision: 20, snapshot: { frame: 20 } });
  });
  it('rejects stale revisions, fences, expired leases, and forged stable membership without overwriting a frame', async () => {
    const f = await setup();
    await expect(store.commit(f.id, 'owner', f.token, 1, null, f.snapshot, undefined, false, f.ids)).rejects.toThrow('STALE');
    await expect(store.commit(f.id, 'other', f.token, 0, null, f.snapshot, undefined, false, f.ids)).rejects.toThrow('STALE');
    await expect(store.commit(f.id, 'owner', String(BigInt(f.token)+1n), 0, null, f.snapshot, undefined, false, f.ids)).rejects.toThrow('STALE');
    const forged = [randomUUID(), randomUUID()];
    await expect(store.commit(f.id, 'owner', f.token, 0, null, { players: forged.map(id => ({ id })) }, undefined, false, forged)).rejects.toThrow('STALE');
    await prisma.liveRoomCheckpoint.update({ where: { id: f.id }, data: { leaseExpiresAt: new Date(0) } });
    await expect(store.commit(f.id, 'owner', f.token, 0, null, f.snapshot, undefined, false, f.ids)).rejects.toThrow('STALE');
    expect(await store.load(f.id)).toMatchObject({ revision: 0, snapshot: f.snapshot });
  });
  it('uses a transaction for membership changes and preserves exclusive room reservations', async () => {
    const f = await setup();
    const other = randomUUID();
    await store.create(randomUUID(), randomUUID(), { players: [{ id: other }] });
    const transactions = vi.spyOn(prisma, '$transaction');
    await expect(store.commit(f.id, 'owner', f.token, 0, null,
      { players: [{ id: f.ids[0] }, { id: other }] }, undefined, false, f.ids)).rejects.toThrow('PLAYER_ALREADY_IN_LIVE_ROOM');
    expect(transactions).toHaveBeenCalledOnce();
    expect(await store.load(f.id)).toMatchObject({ revision: 0, snapshot: f.snapshot });
  });
  it('commits room closure and its result outbox atomically, including conflict rollback', async () => {
    const f = await setup(), matchId = randomUUID();
    const result = { id: randomUUID(), matchId, roomId: f.id, result: { kind: 'CANCEL' } };
    await prisma.gameResultOutbox.create({ data: { ...result, result: { kind: 'CONFLICT' } } });
    const transactions = vi.spyOn(prisma, '$transaction');
    await expect(store.commit(f.id, 'owner', f.token, 0, matchId, f.snapshot, result, true, f.ids)).rejects.toThrow('CONFLICTING');
    expect(await store.load(f.id)).toMatchObject({ revision: 0, closed: false });
    await prisma.gameResultOutbox.delete({ where: { matchId } });
    expect(await store.commit(f.id, 'owner', f.token, 0, matchId, f.snapshot, result, true, f.ids)).toBe(1);
    expect(transactions).toHaveBeenCalledTimes(2);
    expect(await store.load(f.id)).toMatchObject({ closed: true, revision: 1 });
    expect(await prisma.gameResultOutbox.findUnique({ where: { matchId } })).toMatchObject(result);
    expect(await store.findPlayer(f.ids[0])).toBeNull();
  });
});
