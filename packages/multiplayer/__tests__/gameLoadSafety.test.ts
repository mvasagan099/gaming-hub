import { afterEach, describe, expect, it, vi } from 'vitest';
import { MultiplayerFramework } from '../src/framework';
import { createTestFramework, makeSocket } from './helpers';
import { GAME_IDS, type GameId } from '@gaming-hub/shared';

afterEach(() => { vi.useRealTimers(); });

describe('room board initialization safety', () => {
  async function loading(gameId: GameId) {
    MultiplayerFramework.resetInstance();
    const framework = createTestFramework({ enableReplay: false, enableAntiCheat: false });
    framework.config.requireGameLoadAck = true;
    framework.config.gameLoadTimeoutMs = 5000;
    const cancelled = vi.fn(async () => undefined), paid = vi.fn(async () => undefined);
    framework.config.persistAbortedResult = cancelled;
    framework.config.persistFinalResult = paid;
    const room = await framework.roomManager.createRoom({ gameId, hostId: 'host', hostSocket: makeSocket('host'), maxPlayers: 2, stake: 100 });
    await framework.roomManager.joinRoom({ roomId: room.id, playerId: 'guest', socket: makeSocket('guest') });
    room.players.get('host')!.isReady = true; room.players.get('guest')!.isReady = true;
    await framework.matchManager.startMatch({ roomId: room.id, startedBy: 'host' });
    return { framework, room, cancelled, paid };
  }
  it.each(GAME_IDS.filter(game => game !== 'carrom' && game !== 'snake-vs-worms'))('%s preserves its immediate-start policy and accepts duplicate load receipts safely', async gameId => {
    const { framework, room, cancelled, paid } = await loading(gameId);
    try {
      expect(room.match!.startConfirmationRequired).toBe(false);
      expect(room.match!.gameplayStartedAt).toBeTypeOf('number');
      expect(framework.matchManager.getActiveMatchCount()).toBe(1);
      const startedAt = room.match!.gameplayStartedAt;
      await framework.matchManager.confirmGameLoaded(room.id, 'host', room.match!.matchId);
      await framework.matchManager.confirmGameLoaded(room.id, 'guest', room.match!.matchId);
      expect(room.match!.gameplayStartedAt).toBe(startedAt);
      expect(cancelled).not.toHaveBeenCalled();
      expect(paid).not.toHaveBeenCalled();
    } finally { await framework.shutdown(); }
  });
  it.each(['carrom', 'snake-vs-worms'] as const)('%s waits for both boards and starts once despite duplicate receipts', async gameId => {
    const { framework, room, paid } = await loading(gameId);
    try {
      const id = room.match!.matchId;
      expect(framework.matchManager.getActiveMatchCount()).toBe(0);
      expect((await framework.matchManager.applyAction({ roomId: room.id, playerId: 'guest', action: { type: 'resign' } })).ok).toBe(false);
      await expect(framework.matchManager.confirmGameLoaded(room.id, 'outsider', id)).rejects.toThrow('participant');
      await expect(framework.matchManager.confirmGameLoaded(room.id, 'host', 'old-match')).rejects.toThrow('not loading');
      await framework.matchManager.confirmGameLoaded(room.id, 'host', id);
      await framework.matchManager.confirmGameLoaded(room.id, 'host', id);
      expect(room.match!.gameplayStartedAt).toBeNull();
      const now = Date.now();
      await framework.matchManager.confirmGameLoaded(room.id, 'guest', id);
      const started = room.match!.startedAt;
      expect(started).toBeGreaterThanOrEqual(now);
      expect(room.match!.gameplayStartedAt).toBeGreaterThanOrEqual(now);
      expect(framework.matchManager.getActiveMatchCount()).toBe(1);
      await framework.matchManager.confirmGameLoaded(room.id, 'guest', id);
      expect(room.match!.startedAt).toBe(started);
      expect(paid).not.toHaveBeenCalled();
    } finally { await framework.shutdown(); }
  });
  it.each(['carrom', 'snake-vs-worms'] as const)('%s cancels a missing board after the stored deadline without a winner', async gameId => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    const { framework, room, cancelled, paid } = await loading(gameId);
    try {
      await framework.matchManager.confirmGameLoaded(room.id, 'host', room.match!.matchId);
      const deadline = room.match!.loadDeadline;
      framework.matchManager.detachRoom(room);
      await vi.advanceTimersByTimeAsync(2000);
      framework.matchManager.restoreRuntime(room);
      expect(room.match!.loadDeadline).toBe(deadline);
      await vi.advanceTimersByTimeAsync(3000);
      expect(cancelled).toHaveBeenCalledOnce();
      expect(room.status).toBe('ended');
      expect(room.match!.winnerIds).toEqual([]);
      expect(paid).not.toHaveBeenCalled();
    } finally { await framework.shutdown(); }
  });
  it.each(['carrom', 'snake-vs-worms'] as const)('%s turns a premature finish/forfeit into cancellation', async gameId => {
    const { framework, room, cancelled, paid } = await loading(gameId);
    try {
      await framework.matchManager.finishMatch(room, { ok: true, state: {}, events: [], finished: true, winnerSeats: [0] });
      await framework.matchManager.handlePlayerForfeit(room, room.players.get('guest')!, 'disconnect_timeout');
      expect(cancelled).toHaveBeenCalledOnce();
      expect(paid).not.toHaveBeenCalled();
      expect(room.match!.winnerIds).toEqual([]);
    } finally { await framework.shutdown(); }
  });
});
