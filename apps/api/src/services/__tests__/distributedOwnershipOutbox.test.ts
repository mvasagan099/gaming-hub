import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@gaming-hub/db';
import { RedisMatchOwnership } from '../../../../socket-server/src/distributed/ownership';
import { PostgresMatchStore } from '../../../../socket-server/src/distributed/store';
import { GameResultOutboxWorker } from '../../../../socket-server/src/distributed/outbox';
import { GameCoinService } from '../gameCoinService';
import { WalletTransactionService } from '../walletTransactionService';
import { createTestUser } from '../../../test/helpers';

const redis = new Redis(process.env.TEST_REDIS_URL ?? process.env.REDIS_URL ?? 'redis://127.0.0.1:56379', { maxRetriesPerRequest: 1 });
const namespace = `audit:${randomUUID()}`;
const leases = new RedisMatchOwnership(redis, namespace);
const store = new PostgresMatchStore();
beforeAll(async () => { expect(await redis.ping()).toBe('PONG'); });
afterAll(async () => { await redis.quit(); });

async function room() {
  const id = randomUUID(); await store.create(id, randomUUID(), { schemaVersion: 1 }); return id;
}
async function paidResult() {
  const players = await Promise.all([createTestUser(), createTestUser()]);
  for (const user of players) await prisma.$transaction(tx => WalletTransactionService.createCredit(tx,
    { userId: user.id, amount: 1000, referenceType: 'ADMIN', referenceId: randomUUID() }));
  const matchId = randomUUID();
  await GameCoinService.createAndFundMatch({ matchId, gameId: 'chess', stake: 100,
    players: players.map((user, seat) => ({ userId: user.id, seat })) });
  const event = await prisma.gameResultOutbox.create({ data: { id: `${matchId}:result:v1`, matchId,
    roomId: randomUUID(), result: { winnerIds: [players[0]!.id] } } });
  return { matchId, event, winner: players[0]!.id, loser: players[1]!.id };
}

describe('crossReplicaOwnership / ownershipFencing with real Redis and PostgreSQL', () => {
  it('racing replicas admit one owner, renew, expire and reject the old fencing token', async () => {
    const id = await room();
    const a = await store.nextFencingToken(), b = await store.nextFencingToken();
    const claims = await Promise.all([leases.acquire(id, 'A', a, 400), leases.acquire(id, 'B', b, 400)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const owner = claims[0] ? 'A' : 'B', token = claims[0] ? a : b;
    await store.adopt(id, owner, token, 400);
    await store.commit(id, owner, token, 0, null, { value: 'committed' });
    expect(await leases.renew(id, owner, token, 400)).toBe(true);
    await store.renew(id, owner, token, 400);
    await new Promise(resolve => setTimeout(resolve, 450));
    const replacement = await store.nextFencingToken();
    expect(BigInt(replacement)).toBeGreaterThan(BigInt(token));
    expect(await leases.acquire(id, 'replacement', replacement, 2000)).toBe(true);
    await store.adopt(id, 'replacement', replacement, 2000);
    await expect(leases.assert(id, owner, token)).rejects.toThrow('STALE');
    await expect(store.commit(id, owner, token, 1, null, { value: 'stale write' })).rejects.toThrow('STALE');
    expect((await store.load(id))!.snapshot).toEqual({ value: 'committed' });
    await store.commit(id, 'replacement', replacement, 1, null, { value: 'continued' });
  });

  it('does not reuse fencing generations if Redis loses a key', async () => {
    const id = await room(); const first = await store.nextFencingToken();
    await leases.acquire(id, 'old', first, 2000); await store.adopt(id, 'old', first, 2000);
    await redis.del(`${namespace}:${id}`);
    const second = await store.nextFencingToken();
    await leases.acquire(id, 'new', second, 2000); await store.adopt(id, 'new', second, 2000);
    await expect(store.commit(id, 'old', first, 0, null, {})).rejects.toThrow('STALE');
  });

  it('reserves a participant in one live room across concurrent replica creates', async () => {
    const player = randomUUID(), ids = [randomUUID(), randomUUID()];
    const outcomes = await Promise.allSettled(ids.map(id => store.create(id, randomUUID(), { players: [{ id: player }] })));
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(r => r.status === 'rejected')).toHaveLength(1);
    const live = await store.findPlayer(player);
    expect(ids).toContain(live?.id);
  });

  it('commits a final snapshot and a single result in one fenced transaction', async () => {
    const id = await room(); const token = await store.nextFencingToken();
    await leases.acquire(id, 'owner', token, 5000); await store.adopt(id, 'owner', token, 5000);
    const matchId = randomUUID(); const result = { id: `${matchId}:result:v1`, matchId, roomId: id, result: { winnerIds: ['winner'] } };
    await store.commit(id, 'owner', token, 0, matchId, { finished: true }, result);
    await expect(store.commit(id, 'owner', token, 0, matchId, { finished: false })).rejects.toThrow('REVISION');
    expect(await prisma.gameResultOutbox.count({ where: { matchId } })).toBe(1);
    expect((await store.load(id))!.snapshot).toEqual({ finished: true });
    await expect(store.commit(id, 'owner', token, 1, matchId, { finished: true },
      { ...result, result: { winnerIds: ['different-winner'] } })).rejects.toThrow('CONFLICTING_CANONICAL_RESULT');
    expect((await store.load(id))!.revision).toBe(1);
    expect((await prisma.gameResultOutbox.findUniqueOrThrow({ where: { matchId } })).result).toEqual(result.result);

  });
});

describe('durableResultOutbox / outboxRetry with real financial transactions', () => {
  it('two workers claim once; ten duplicate deliveries settle one paid result', async () => {
    const { event, matchId, winner, loser } = await paidResult();
    // Only claim this paid fixture; unrelated checkpoint event is held for later.
    await prisma.gameResultOutbox.updateMany({ where: { id: { not: event.id } }, data: { nextAttemptAt: new Date(Date.now() + 60000) } });
    let deliveries = 0;
    const deliver = async () => { deliveries++; await Promise.all(Array.from({ length: 10 }, () => GameCoinService.settleMatch(matchId, [winner]))); };
    const a = new GameResultOutboxWorker(deliver), b = new GameResultOutboxWorker(deliver);
    await Promise.all([a.runOnce(), b.runOnce()]);
    expect(deliveries).toBe(1);
    expect((await prisma.gameResultOutbox.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('DELIVERED');
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: winner } })).balance).toBe(1080);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: loser } })).balance).toBe(900);
  });

  it('cancels a persisted unfunded intent and rejects delayed funding without debiting wallets', async () => {
    const players = await Promise.all([createTestUser(), createTestUser()]);
    for (const user of players) await prisma.$transaction(tx => WalletTransactionService.createCredit(tx,
      { userId: user.id, amount: 1000, referenceType: 'ADMIN', referenceId: randomUUID() }));
    const matchId = randomUUID();
    const event = await prisma.gameResultOutbox.create({ data: { id: `${matchId}:result:v1`, matchId,
      roomId: randomUUID(), result: { kind: 'CANCEL', reason: 'closed_before_start' } } });
    await new GameResultOutboxWorker(async () => { await GameCoinService.cancelMatch(matchId); }).runOnce();
    expect((await prisma.gameResultOutbox.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('DELIVERED');
    await expect(GameCoinService.createAndFundMatch({ matchId, gameId: 'chess', stake: 100,
      players: players.map((p, seat) => ({ userId: p.id, seat })) })).rejects.toThrow('cancelled');
    expect(await prisma.match.count({ where: { id: matchId } })).toBe(0);
    for (const p of players) expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: p.id } })).balance).toBe(1000);
  });

  it('keeps API failure retryable, recovers expired worker claim and tolerates a lost settlement ACK', async () => {
    const { event, matchId, winner } = await paidResult();
    const failing = new GameResultOutboxWorker(async () => { throw new Error('API unavailable'); });
    await failing.runOnce();
    expect((await prisma.gameResultOutbox.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('FAILED_RETRYABLE');
    await prisma.gameResultOutbox.update({ where: { id: event.id }, data: { status: 'PROCESSING', claimedBy: 'dead-worker', claimExpiresAt: new Date(0) } });
    const ackLost = new GameResultOutboxWorker(async () => { await GameCoinService.settleMatch(matchId, [winner]); throw new Error('ACK lost'); });
    await ackLost.runOnce();
    expect((await prisma.gameResultOutbox.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('FAILED_RETRYABLE');
    await prisma.gameResultOutbox.update({ where: { id: event.id }, data: { nextAttemptAt: new Date(0) } });
    await new GameResultOutboxWorker(async () => { await GameCoinService.settleMatch(matchId, [winner]); }).runOnce();
    expect((await prisma.gameResultOutbox.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('DELIVERED');
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId: winner } })).balance).toBe(1080);
  });
});
