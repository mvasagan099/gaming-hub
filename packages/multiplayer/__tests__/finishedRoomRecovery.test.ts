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
