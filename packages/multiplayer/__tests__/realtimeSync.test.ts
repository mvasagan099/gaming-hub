import { describe, expect, it, vi } from 'vitest';
import { TableTennisEngine } from '@gaming-hub/game-engine';
import { SyncManager } from '../src/managers/SyncManager';
import type { MultiplayerFramework } from '../src/framework';
import type { RoomRuntime } from '../src/types';
import { MultiplayerFramework as Framework } from '../src/framework';
import { createMatchRoom, createTestFramework, makePlayer } from './helpers';

it('broadcasts every Table Tennis frame without per-frame logging and preserves point events', async () => {
  const emit = vi.fn();
  const log = vi.fn();
  const framework = { log, io: { to: () => ({ emit }) } } as unknown as MultiplayerFramework;
  const sync = new SyncManager(framework);
  const engine = new TableTennisEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }]);
  const room = { id: 'room', ioName: 'room:room', config: { gameId: 'table-tennis' },
    match: { matchId: 'match', turnNumber: 0, engine } } as unknown as RoomRuntime;
  for (let frame = 0; frame < 60; frame++) await sync.broadcastGameState(room, []);
  expect(emit).toHaveBeenCalledTimes(60);
  expect(log).not.toHaveBeenCalled();
  await sync.broadcastGameState(room, [{ type: 'point-scored', winnerSeat: 0 }]);
  expect(emit).toHaveBeenLastCalledWith('game:state', expect.objectContaining({
    sequenceNumber: 61, events: [expect.objectContaining({ type: 'point-scored', winnerSeat: 0 })],
  }));
  expect(log).toHaveBeenCalledOnce();
});

describe('Table Tennis physics scheduling', () => {
  it('waits for an action and coalesces overlapping physics frames', async () => {
    Framework.resetInstance();
    const framework = createTestFramework({ enableReplay: false });
    const room = createMatchRoom('table-tennis', [makePlayer('a', 0), makePlayer('b', 1)]);
    const tick = vi.spyOn(room.match!.engine as TableTennisEngine, 'tick');
    let release!: () => void;
    const blocker = framework.gameStateManager.enqueue(room.id, () => new Promise<void>(resolve => { release = resolve; }));
    await Promise.resolve();
    try {
      const manager = framework.matchManager as unknown as { runPhysicsTick(room: RoomRuntime): Promise<void> };
      const pending = manager.runPhysicsTick(room);
      await manager.runPhysicsTick(room);
      expect(tick).not.toHaveBeenCalled();
      release(); await blocker; await pending;
      expect(tick).toHaveBeenCalledOnce();
      await manager.runPhysicsTick(room);
      expect(tick).toHaveBeenCalledTimes(2);
    } finally { release(); await framework.shutdown(); }
  });

  it('discards a queued tick when a different match replaces the old one', async () => {
    Framework.resetInstance();
    const framework = createTestFramework({ enableReplay: false });
    const room = createMatchRoom('table-tennis', [makePlayer('a', 0), makePlayer('b', 1)]);
    const tick = vi.spyOn(room.match!.engine as TableTennisEngine, 'tick');
    let release!: () => void;
    const blocker = framework.gameStateManager.enqueue(room.id, () => new Promise<void>(resolve => { release = resolve; }));
    await Promise.resolve();
    try {
      const manager = framework.matchManager as unknown as { runPhysicsTick(room: RoomRuntime): Promise<void> };
      const pending = manager.runPhysicsTick(room);
      room.match = { ...room.match!, matchId: 'replacement', engine: new TableTennisEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }]) };
      release(); await blocker; await pending;
      expect(tick).not.toHaveBeenCalled();
    } finally { release(); await framework.shutdown(); }
  });
});
