import { describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ $transaction: vi.fn() }));
vi.mock('@gaming-hub/db', () => ({ prisma: db }));
vi.mock('../../../apps/socket-server/src/settings', () => ({ assertGameEnabled: vi.fn(), assertFeatureEnabled: vi.fn() }));
import { DistributedRoomCoordinator } from '../../../apps/socket-server/src/distributed/coordinator';
import { SharedMatchmaking } from '../../../apps/socket-server/src/distributed/matchmaking';
import { createCommandDispatcher } from '../../../apps/socket-server/src/distributed/commands';
const command = { event: 'matchmaking:join', playerId: 'p1', socketId: 's1', user: {}, payload: { gameId: 'chess', stake: 0 } };
function setup(status: string) {
  const store = { findPlayer: vi.fn().mockResolvedValue({ id: 'old-room' }), load: vi.fn().mockResolvedValue({ closed: false, snapshot: { room: { status } } }) };
  const redis = { duplicate: () => ({ on: vi.fn() }) };
  const coordinator = new DistributedRoomCoordinator({} as never, redis as never, store as never);
  const route = vi.spyOn(coordinator, 'route').mockImplementation(async () => { store.findPlayer.mockResolvedValue(null); });
  return { store, coordinator, route };
}
describe('completed durable room membership recovery', () => {
  it('releases completed membership through the owner before another search', async () => {
    const { coordinator, route } = setup('ended');
    expect(await coordinator.leaveEndedRoom(command)).toBe(true);
    expect(route).toHaveBeenCalledExactlyOnceWith({ ...command, event: 'room:leave', roomId: 'old-room', payload: { onlyIfEnded: true } });
  });
  it.each(['waiting', 'starting', 'playing'])('never auto-leaves a %s room', async status => {
    const { coordinator, route } = setup(status);
    expect(await coordinator.leaveEndedRoom(command)).toBe(false); expect(route).not.toHaveBeenCalled();
  });
  it('fails safely when the owner cannot acknowledge cleanup', async () => {
    const { coordinator, route } = setup('ended'); route.mockRejectedValue(new Error('Owner unavailable'));
    await expect(coordinator.leaveEndedRoom(command)).rejects.toThrow('Owner unavailable');
  });
  it('does not accept cleanup while membership remains reserved', async () => {
    const { coordinator, route } = setup('ended'); route.mockResolvedValue(undefined);
    expect(await coordinator.leaveEndedRoom(command)).toBe(false);
  });
  it.each(['waiting', 'starting', 'playing'])('owner recheck rejects a rematch that became %s', async status => {
    const leaveRoom = vi.fn();
    const framework = { io: {}, roomManager: { getRoom: () => ({ status, players: new Map([['p1', {}]]), spectators: new Map() }), leaveRoom } };
    const dispatch = createCommandDispatcher(framework as never, {} as never, vi.fn());
    await expect(dispatch({ ...command, event: 'room:leave', roomId: 'old-room', payload: { onlyIfEnded: true } })).rejects.toThrow('active room');
    expect(leaveRoom).not.toHaveBeenCalled();
  });
});

describe('shared search cleanup gate', () => {
  it('does not touch the queue or wallet when active membership cannot be released', async () => {
    db.$transaction.mockClear();
    const coordinator = { leaveEndedRoom: vi.fn().mockResolvedValue(false) };
    const search = new SharedMatchmaking({} as never, coordinator as never);
    await expect(search.join(command)).rejects.toThrow('Leave your current room');
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('acknowledges ended-room cleanup before reserving a new queue slot', async () => {
    const order: string[] = [];
    const coordinator = { leaveEndedRoom: vi.fn(async () => { order.push('left'); return true; }) };
    const tx = { $executeRaw: vi.fn(), matchmakingQueue: {
      updateMany: vi.fn(), findFirst: vi.fn().mockResolvedValue(null), create: vi.fn(), findMany: vi.fn().mockResolvedValue([]),
    }, wallet: { findUniqueOrThrow: vi.fn().mockResolvedValue({ balance: 1000, isFrozen: false }) } };
    db.$transaction.mockImplementation(async fn => { order.push('queued'); return fn(tx); });
    const framework = { io: { to: () => ({ emit: vi.fn() }) } };
    expect(await new SharedMatchmaking(framework as never, coordinator as never).join(command)).toEqual({ position: 1 });
    expect(order).toEqual(['left', 'queued']);
    expect(tx.matchmakingQueue.create).toHaveBeenCalledOnce();
  });
});

describe('private room creation and join cleanup gates', () => {
  function dispatcher(status = 'ended') {
    const recovery = setup(status);
    const room = { id: 'new-room', status: 'waiting' };
    const createRoom = vi.fn().mockResolvedValue(room);
    const joinRoom = vi.fn().mockResolvedValue(room);
    const framework = {
      io: {}, roomManager: { getRoom: () => room, createRoom, joinRoom },
      syncManager: { serializeRoom: (value: unknown) => value },
      matchManager: { resumeReadyCountdown: vi.fn() },
    };
    vi.spyOn(recovery.coordinator, 'create').mockImplementation(async fn => fn());
    return { ...recovery, room, createRoom, joinRoom,
      dispatch: createCommandDispatcher(framework as never, recovery.coordinator, vi.fn()) };
  }
  function request(event: string) {
    return { ...command, event, roomId: event === 'room:create' ? undefined : 'new-room',
      payload: { gameId: 'table-tennis', stake: 0, isPrivate: true } };
  }

  it.each(['room:create', 'room:join', 'match:join'])('%s releases the old completed room through its owner', async event => {
    const fixture = dispatcher();
    await expect(fixture.dispatch(request(event))).resolves.toEqual(event === 'match:join'
      ? { room: fixture.room, status: 'waiting' } : fixture.room);
    expect(fixture.route).toHaveBeenCalledExactlyOnceWith({ ...request(event),
      event: 'room:leave', roomId: 'old-room', payload: { onlyIfEnded: true } });
    expect(event === 'room:create' ? fixture.createRoom : fixture.joinRoom).toHaveBeenCalledOnce();
  });

  for (const event of ['room:create', 'room:join', 'match:join']) {
    it.each(['waiting', 'starting', 'playing'])(`${event} never auto-leaves a %s room`, async status => {
      const fixture = dispatcher(status);
      await expect(fixture.dispatch(request(event))).rejects.toThrow('Leave your current room');
      expect(fixture.route).not.toHaveBeenCalled();
      expect(fixture.createRoom).not.toHaveBeenCalled();
      expect(fixture.joinRoom).not.toHaveBeenCalled();
    });
    it(`${event} blocks when completed membership remains reserved`, async () => {
      const fixture = dispatcher(); fixture.route.mockResolvedValue(undefined);
      await expect(fixture.dispatch(request(event))).rejects.toThrow('Leave your current room');
      expect(fixture.createRoom).not.toHaveBeenCalled();
      expect(fixture.joinRoom).not.toHaveBeenCalled();
    });
    it(`${event} blocks when the old owner cannot confirm cleanup`, async () => {
      const fixture = dispatcher(); fixture.route.mockRejectedValue(new Error('Owner unavailable'));
      await expect(fixture.dispatch(request(event))).rejects.toThrow('Owner unavailable');
      expect(fixture.createRoom).not.toHaveBeenCalled();
      expect(fixture.joinRoom).not.toHaveBeenCalled();
    });
  }

  it.each(['room:join', 'match:join'])('%s reconnects to the same active room without leaving it', async event => {
    const fixture = dispatcher('playing');
    fixture.store.findPlayer.mockResolvedValue({ id: 'new-room' });
    await fixture.dispatch(request(event));
    expect(fixture.route).not.toHaveBeenCalled();
    expect(fixture.joinRoom).toHaveBeenCalledOnce();
  });

  it('waits for the old owner acknowledgement before creating a new room', async () => {
    const fixture = dispatcher();
    let release!: () => void;
    fixture.route.mockImplementation(async () => {
      await new Promise<void>(resolve => { release = resolve; });
      fixture.store.findPlayer.mockResolvedValue(null);
    });
    const creating = fixture.dispatch(request('room:create'));
    // Keep a regression rejection observed while checking acknowledgement order.
    void creating.catch(() => undefined);
    await vi.waitFor(() => expect(fixture.route).toHaveBeenCalledOnce());
    expect(fixture.createRoom).not.toHaveBeenCalled();
    release();
    await creating;
    expect(fixture.createRoom).toHaveBeenCalledOnce();
  });
});
