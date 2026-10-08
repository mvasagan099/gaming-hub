import { describe, expect, it, vi } from 'vitest';
import { TableTennisEngine } from '@gaming-hub/game-engine';
import { SyncManager } from '../src/managers/SyncManager';
import type { MultiplayerFramework } from '../src/framework';
import type { RoomRuntime } from '../src/types';
import { MultiplayerFramework as Framework } from '../src/framework';
import { createMatchRoom, createTestFramework, makePlayer } from './helpers';

it.each(['table-tennis', 'fruit-ninja', 'snake-vs-worms'] as const)('broadcasts %s frames without per-frame logging and preserves scoring events', async gameId => {
  const emit = vi.fn();
  const log = vi.fn();
  const framework = { log, io: { to: () => ({ emit }) } } as unknown as MultiplayerFramework;
  const sync = new SyncManager(framework);
  const engine = new TableTennisEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }]);
  const room = { id: 'room', ioName: 'room:room', config: { gameId },
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
  it('does not queue or checkpoint idle and paused rallies', async () => {
    Framework.resetInstance();
    const framework = createTestFramework({ enableReplay: false });
    const room = createMatchRoom('table-tennis', [makePlayer('a', 0), makePlayer('b', 1)]);
    const enqueue = vi.spyOn(framework.gameStateManager, 'enqueue');
    const manager = framework.matchManager as unknown as { runPhysicsTick(room: RoomRuntime): Promise<void> };
    try {
      await manager.runPhysicsTick(room);
      const engine = room.match!.engine as TableTennisEngine;
      engine.apply({ type: 'ready' }, 0); engine.apply({ type: 'ready' }, 1);
      engine.apply({ type: 'serve', angle: 0 }, engine.state.servingSeat);
      engine.apply({ type: 'pause' }, 0);
      await manager.runPhysicsTick(room);
      expect(enqueue).not.toHaveBeenCalled();
    } finally { await framework.shutdown(); }
  });
  it.each(['table-tennis', 'fruit-ninja', 'snake-vs-worms'] as const)('%s waits for an action and coalesces overlapping physics frames', async gameId => {
    Framework.resetInstance();
    const framework = createTestFramework({ enableReplay: false });
    const room = createMatchRoom(gameId, [makePlayer('a', 0), makePlayer('b', 1)]);
    if (room.config.gameId === 'table-tennis') {
      const engine = room.match!.engine as TableTennisEngine;
      engine.apply({ type: 'ready' }, 0); engine.apply({ type: 'ready' }, 1);
      engine.apply({ type: 'serve', angle: 0 }, engine.state.servingSeat);
    }
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
    if (room.config.gameId === 'table-tennis') {
      const engine = room.match!.engine as TableTennisEngine;
      engine.apply({ type: 'ready' }, 0); engine.apply({ type: 'ready' }, 1);
      engine.apply({ type: 'serve', angle: 0 }, engine.state.servingSeat);
    }
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

describe('authoritative reconnect snapshots', () => {
  it.each(['ludo', 'chess', 'carrom', 'snake-ladder', 'fruit-ninja', 'bubble-shooter', 'table-tennis', 'snake-vs-worms', 'snooker'] as const)('recovers %s from the running engine and enforces authenticated rate limits', async gameId => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now());
    const { authenticatedEngineStateSync } = await import('../../../apps/socket-server/src/currentEngineStateSync');
    Framework.resetInstance();
    const framework = createTestFramework({ enableReplay: false });
    const room = createMatchRoom(gameId, [makePlayer(`a-${gameId}`, 0), makePlayer(`b-${gameId}`, 1)]);
    room.id = `sync-${gameId}`;
    room.match!.matchId = `match-${gameId}`;
    (framework.roomManager as any).rooms.set(room.id, room);
    (framework.roomManager as any).playerRoomMap.set(`a-${gameId}`, room.id);
    try {
      const playerId = `a-${gameId}`;
      expect(() => authenticatedEngineStateSync(framework, 'foreign-user', room.match!.matchId)).toThrow('Not a participant');
      expect(() => authenticatedEngineStateSync(framework, playerId, 'previous-match')).toThrow('Not a participant');
      const state = room.match!.engine.serialize();
      for (let i = 0; i < 5; i++) {
        expect(authenticatedEngineStateSync(framework, playerId, room.match!.matchId).fullState.gameState).toMatchObject(state);
      }
      expect(() => authenticatedEngineStateSync(framework, playerId, room.match!.matchId)).toThrow('Too many state sync');
    } finally { await framework.shutdown(); nowSpy.mockRestore(); }
  });
});

it('sends the Carrom trajectory once without changing history or pocket-event metadata', async () => {
  const emit = vi.fn();
  const sync = new SyncManager({ log: vi.fn(), io: { to: () => ({ emit }) } } as unknown as MultiplayerFramework);
  const keyframes = [{ frame: 0, coins: [] }, { frame: 60, coins: [] }];
  const state = { lastActionAtMs: 123, lastTrajectory: keyframes };
  const events = [
    { type: 'carrom:shot-start', shotId: 123, keyframes },
    { type: 'shot-trajectory', shotId: 123, keyframes, pocketEvents: [{ coinId: 'white-1', pocketIndex: 0 }] },
    { type: 'coin-pocketed', coinId: 'white-1', pocketIndex: 0 },
  ];
  const original = structuredClone(events);
  const room = { id: 'room', ioName: 'room:room', config: { gameId: 'carrom' },
    match: { matchId: 'match', turnNumber: 1, engine: { serialize: () => state } } } as unknown as RoomRuntime;
  await sync.broadcastGameState(room, events);
  const packet = emit.mock.calls[0][1];
  expect(packet.state.lastTrajectory).toEqual(keyframes);
  expect(packet.events[0].keyframes).toBeUndefined();
  expect(packet.events[1].keyframes).toBeUndefined();
  expect(packet.events[1].pocketEvents).toEqual(events[1].pocketEvents);
  expect(packet.events[2]).toMatchObject(events[2]);
  expect(events).toEqual(original);
  expect(JSON.stringify(packet).length).toBeLessThan(JSON.stringify({ ...packet, events: original }).length);
});
