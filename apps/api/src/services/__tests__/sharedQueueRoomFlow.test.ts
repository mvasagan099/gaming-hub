import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@gaming-hub/db';
import { createTestUser } from '../../../test/helpers';
import { WalletTransactionService } from '../walletTransactionService';
import { SharedMatchmaking } from '../../../../socket-server/src/distributed/matchmaking';
import { createCommandDispatcher } from '../../../../socket-server/src/distributed/commands';

describe('distributed queue reconnect and room transitions with PostgreSQL', () => {
  let userId: string;
  const io = { to: () => ({ emit: vi.fn() }) };
  const coordinator = { leaveEndedRoom: vi.fn().mockResolvedValue(true), findPlayer: vi.fn().mockResolvedValue(null),
    create: vi.fn(async (fn: () => unknown) => fn()) };
  const search = new SharedMatchmaking({ io } as never, coordinator as never);
  const request = (gameId = 'chess', stake = 100, socketId = 'socket-new') => ({
    event: 'matchmaking:join', user: {}, playerId: userId, socketId, payload: { gameId, stake },
  });
  const queues = () => prisma.matchmakingQueue.findMany({ where: { userId }, orderBy: { joinedAt: 'asc' } });
  beforeEach(async () => {
    vi.clearAllMocks();
    userId = (await createTestUser()).id;
    await prisma.$transaction(tx => WalletTransactionService.createCredit(tx,
      { userId, amount: 1000, referenceType: 'ADMIN', referenceId: crypto.randomUUID() }));
  });
  afterEach(async () => { await prisma.user.delete({ where: { id: userId } }); });

  it('reconnect updates the queued socket while retaining one entry and its original position', async () => {
    await search.join(request('chess', 100, 'socket-old'));
    const original = (await queues())[0];
    await search.join(request());
    const rows = await queues();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: original.id, socketId: 'socket-new', status: 'WAITING', joinedAt: original.joinedAt });
  });
  it.each([['carrom', 100], ['chess', 500]] as const)('switching queue to %s/%s cancels the previous request', async (gameId, stake) => {
    await search.join(request());
    const previous = (await queues())[0];
    await search.join(request(gameId, stake));
    const rows = await queues();
    expect(rows.find(row => row.id === previous.id)?.status).toBe('CANCELLED');
    expect(rows.filter(row => row.status === 'WAITING')).toMatchObject([{ gameId, entryFee: stake }]);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance).toBe(1000);
  });
  it('resuming a queue rechecks a newly frozen wallet', async () => {
    await search.join(request());
    await prisma.wallet.update({ where: { userId }, data: { isFrozen: true } });
    await expect(search.join(request())).rejects.toThrow('Wallet unavailable');
  });

  function dispatch(event: string, target = 'private-room') {
    const room = { id: target, status: 'waiting' };
    const enter = vi.fn(async () => {
      expect((await queues()).filter(row => row.status === 'WAITING')).toHaveLength(0);
      return room;
    });
    const framework = { io, roomManager: { getRoom: () => room, createRoom: enter, joinRoom: enter },
      syncManager: { serializeRoom: (value: unknown) => value }, matchManager: { resumeReadyCountdown: vi.fn() } };
    const handler = createCommandDispatcher(framework as never, coordinator as never, vi.fn());
    return { enter, run: () => handler({ ...request(), event, roomId: event === 'room:create' ? undefined : target }) };
  }
  it.each(['room:create', 'room:join'])('%s cancels the waiting queue before room admission', async event => {
    await search.join(request());
    await dispatch(event).run();
    expect((await queues())[0].status).toBe('CANCELLED');
  });
  it.each(['room:create', 'room:join'])('%s cannot abandon a reserved pairing while provisioning is in progress', async event => {
    await search.join(request());
    await prisma.matchmakingQueue.updateMany({ where: { userId }, data: { status: 'MATCHED', matchId: 'assigned-room', roomId: 'assigned-room' } });
    const command = dispatch(event);
    await expect(command.run()).rejects.toThrow('already being matched');
    expect(command.enter).not.toHaveBeenCalled();
    expect((await queues())[0].status).toBe('MATCHED');
  });
  it('allows joining the assigned room during pairing recovery', async () => {
    await search.join(request());
    await prisma.matchmakingQueue.updateMany({ where: { userId }, data: { status: 'MATCHED', matchId: 'assigned-room', roomId: 'assigned-room' } });
    await expect(dispatch('room:join', 'assigned-room').run()).resolves.toMatchObject({ id: 'assigned-room' });
  });
  it('concurrent duplicate queue joins retain exactly one waiting entry', async () => {
    await Promise.all([search.join(request()), search.join(request()), search.join(request())]);
    expect(await queues()).toHaveLength(1);
    expect((await queues())[0].status).toBe('WAITING');
    expect((await prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance).toBe(1000);
  });
  it('an unaffordable queue change preserves the original waiting request', async () => {
    await search.join(request());
    await prisma.$transaction(tx => WalletTransactionService.createDebit(tx,
      { userId, amount: 700, referenceType: 'ADMIN', referenceId: crypto.randomUUID() }));
    await expect(search.join(request('chess', 500))).rejects.toThrow('Wallet unavailable');
    expect(await queues()).toMatchObject([{ status: 'WAITING', gameId: 'chess', entryFee: 100 }]);
  });
  it('room admission waits for the pairing lock and cannot steal a concurrent reservation', async () => {
    await search.join(request());
    let unlock!: () => void;
    let reserved!: () => void;
    const held = new Promise<void>(resolve => { unlock = resolve; });
    const ready = new Promise<void>(resolve => { reserved = resolve; });
    const pairing = prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('shared-matchmaking'))`;
      await tx.matchmakingQueue.updateMany({ where: { userId }, data: { status: 'MATCHED', matchId: 'assigned-room', roomId: 'assigned-room' } });
      reserved(); await held;
    });
    await ready;
    const command = dispatch('room:create');
    const outcome = command.run().then(() => 'admitted', error => error.message);
    try {
      await new Promise(resolve => setTimeout(resolve, 30));
      expect(command.enter).not.toHaveBeenCalled();
    } finally { unlock(); }
    await pairing;
    expect(await outcome).toContain('already being matched');
    expect(command.enter).not.toHaveBeenCalled();
  });
  it('an expired pairing no longer prevents entry to a new private room', async () => {
    await search.join(request());
    await prisma.matchmakingQueue.updateMany({ where: { userId }, data: { status: 'MATCHED', matchId: 'expired-room', roomId: 'expired-room', expiresAt: new Date(Date.now() - 1000) } });
    await expect(dispatch('room:create').run()).resolves.toMatchObject({ id: 'private-room' });
  });
  it.each([
    { timeControl: null, rated: true },
    { timeControl: { baseSeconds: 300, incrementSeconds: 0, delaySeconds: 0 }, rated: true },
    { timeControl: { baseSeconds: 600, incrementSeconds: 0, delaySeconds: 5 }, rated: true },
    { timeControl: { baseSeconds: 600, incrementSeconds: 0, delaySeconds: 0 }, rated: false },
  ])('changing clock/rated settings replaces the old waiting reservation: %j', async settings => {
    const timed = { timeControl: { baseSeconds: 600, incrementSeconds: 0, delaySeconds: 0 }, rated: true };
    await search.join({ ...request(), payload: { ...request().payload, settings: timed } });
    await search.join({ ...request(), payload: { ...request().payload, settings } });
    const rows = await queues();
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe('CANCELLED');
    expect(rows[1]).toMatchObject({ status: 'WAITING', settings });
    expect(rows[1].settingsKey).not.toBe(rows[0].settingsKey);
  });
  it('only assigns compatible settings, including after a queued socket reconnect', async () => {
    const other = await createTestUser();
    const provision = vi.spyOn(search as any, 'provision').mockResolvedValue(undefined);
    const settings = { timeControl: { baseSeconds: 600, incrementSeconds: 2, delaySeconds: 1 }, rated: false };
    try {
      await search.join({ ...request('chess', 0, 'old'), payload: { gameId: 'chess', stake: 0, settings } });
      await search.join({ ...request('chess', 0), playerId: other.id, payload: { gameId: 'chess', stake: 0, settings: { ...settings, rated: true } } });
      expect(provision).not.toHaveBeenCalled();
      await search.join({ ...request('chess', 0, 'reconnected'), payload: { gameId: 'chess', stake: 0, settings } });
      await search.join({ ...request('chess', 0), playerId: other.id, payload: { gameId: 'chess', stake: 0, settings } });
      expect(provision).toHaveBeenCalledOnce();
      const pair = await prisma.matchmakingQueue.findMany({ where: { status: 'MATCHED', userId: { in: [userId, other.id] } } });
      expect(pair).toHaveLength(2);
      expect(pair[0].matchId).toBe(pair[1].matchId);
      expect(pair.find(row => row.userId === userId)?.socketId).toBe('reconnected');
      expect(pair.every(row => row.settingsKey === pair[0].settingsKey)).toBe(true);
    } finally { provision.mockRestore(); await prisma.user.delete({ where: { id: other.id } }); }
  });

});
