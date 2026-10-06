import { describe, expect, it, vi } from 'vitest';
import { TableTennisEngine } from '@gaming-hub/game-engine';
import { SyncManager } from '../src/managers/SyncManager';
import type { MultiplayerFramework } from '../src/framework';
import type { RoomRuntime } from '../src/types';

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
