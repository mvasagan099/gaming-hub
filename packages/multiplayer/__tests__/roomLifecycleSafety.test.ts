import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChessEngine, createEngine, type EngineInstance } from '@gaming-hub/game-engine';
import { MultiplayerFramework } from '../src/framework';
import { createTestFramework, createMatchRoom, makePlayer, makeSocket } from './helpers';
import { serializeRoomCheckpoint, restoreRoomCheckpoint } from '../../../apps/socket-server/src/distributed/checkpoint';

describe('Authoritative room recovery and clock safety', () => {
  let framework: MultiplayerFramework;
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));
    MultiplayerFramework.resetInstance(); framework = createTestFramework({ enableAntiCheat: false, enableReplay: false });
  });
  afterEach(async () => { await framework.shutdown(); vi.restoreAllMocks(); vi.useRealTimers(); });
  function room(gameId: Parameters<typeof createMatchRoom>[0]) {
    const r = createMatchRoom(gameId, [makePlayer('a', 0), makePlayer('b', 1)]);
    if (gameId === 'chess') r.match!.engine = new ChessEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }], undefined,
      { timeControl: { baseSeconds: 60, incrementSeconds: 0, delaySeconds: 0 } });
    if (gameId === 'ludo' || gameId === 'snake-ladder') r.match!.engine = createEngine(gameId,
      [{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }], () => 0.5,
      { turnTimer: { turnDurationMs: 30000, warningThresholdMs: 10000 }, matchTimer: { matchDurationMs: 300000, warningThresholdMs: 30000 } });
    if (gameId === 'ludo' || gameId === 'snake-ladder') expect((r.match!.engine as EngineInstance).apply({ type: 'roll' }, 0).ok).toBe(true);
    framework.roomManager.registerRoom(r); return r;
  }
  it.each(['chess', 'carrom', 'snooker', 'ludo', 'snake-ladder'] as const)
   ('%s pauses its authoritative clock and rejoin resumes the same remaining time', async game => {
      const r = room(game); const e = r.match!.engine as EngineInstance;
      const deadline = e.currentClockDeadline;
      const matchDeadline = e.currentMatchDeadline;
      expect(deadline).toBeTypeOf('number');
      await vi.advanceTimersByTimeAsync(5000);
      const p = r.players.get('b')!; p.connectionStatus = 'disconnected'; p.socketIds.clear();
      await framework.disconnectHandler.handleDisconnect(r, p);
      expect(r.match!.pausedAt).not.toBeNull(); expect(e.currentClockDeadline).toBeNull();
      if (matchDeadline) expect(e.currentMatchDeadline).toBeNull();
      const frozen = e.serialize(); await vi.advanceTimersByTimeAsync(10000);
      expect(e.serialize()).toMatchObject({ paused: true });
      if (game === 'chess') expect(e.serialize().clocks).toEqual(frozen.clocks);
      await framework.roomManager.joinRoom({ roomId: r.id, playerId: p.id, socket: makeSocket('rejoined') });
      expect(r.match!.pausedAt).toBeNull(); expect(e.state.paused).toBe(false);
      if (deadline) expect(e.currentClockDeadline).toBe(deadline + 10000);
      if (matchDeadline) expect(e.currentMatchDeadline).toBe(matchDeadline + 10000);
      expect(framework.timerManager.getTimerInfo(`${r.id}:reconnect:${p.id}`)).toBeNull();
    });
  it.each(['bubble-shooter', 'table-tennis', 'snake-vs-worms', 'fruit-ninja'] as const)
   ('%s preserves its realtime no-pause disconnect policy', async game => {
      const r = room(game); const p = r.players.get('b')!; p.connectionStatus = 'disconnected';
      await framework.disconnectHandler.handleDisconnect(r, p);
      expect(r.match!.pausedAt).toBeNull();
      expect((r.match!.engine as EngineInstance).state.paused).not.toBe(true);
      expect(framework.timerManager.getTimerInfo(`${r.id}:reconnect:${p.id}`)).not.toBeNull();
    });
  it('does not resume until both disconnected players reconnect', async () => {
    const r = room('snooker');
    for (const p of r.players.values()) { p.connectionStatus = 'disconnected'; p.socketIds.clear(); await framework.disconnectHandler.handleDisconnect(r, p); }
    await framework.roomManager.joinRoom({ roomId: r.id, playerId: 'a', socket: makeSocket('a-new') });
    expect(r.match!.pausedAt).not.toBeNull();
    expect(framework.timerManager.getTimerInfo(`${r.id}:afk:a`)).toBeNull();
    await framework.roomManager.joinRoom({ roomId: r.id, playerId: 'b', socket: makeSocket('b-new') });
    expect(r.match!.pausedAt).toBeNull();
  });
  it.each(['table-tennis', 'snake-vs-worms'] as const)('%s keeps its existing pause controls consistent across rejoin', async game => {
    const r = room(game);
    expect((await framework.matchManager.applyAction({ roomId: r.id, playerId: 'a', action: { type: 'pause' } })).ok).toBe(true);
    expect(r.match).toMatchObject({ pauseReason: 'player', pausedBy: 'a' });
    const remaining = (r.match!.engine as EngineInstance).serialize().matchRemainingMs;
    await vi.advanceTimersByTimeAsync(10000);
    expect((r.match!.engine as EngineInstance).serialize().matchRemainingMs).toBe(remaining);
    await framework.roomManager.joinRoom({ roomId: r.id, playerId: 'a', socket: makeSocket('a-new') });
    expect(r.match!.pausedAt).not.toBeNull();
    expect((await framework.matchManager.applyAction({ roomId: r.id, playerId: 'a', action: { type: 'resume' } })).ok).toBe(true);
    expect(r.match!.pausedAt).toBeNull();
  });
  it.each(['chess', 'carrom', 'snooker'] as const)('%s rejects client pause and allows an authoritative paused exit', async game => {
    const r = room(game);
    const result = await framework.matchManager.applyAction({ roomId: r.id, playerId: 'a', action: { type: 'pause' } });
    expect(result.ok).toBe(false); expect((r.match!.engine as EngineInstance).state.paused).not.toBe(true);
    r.players.get('b')!.connectionStatus = 'disconnected';
    await framework.disconnectHandler.handleDisconnect(r, r.players.get('b')!);
    const finish = vi.spyOn(framework.matchManager, 'finishMatch');
    await framework.roomManager.leaveRoom(r.id, 'a', makeSocket('a'));
    expect(finish).toHaveBeenCalledTimes(1); expect(framework.roomManager.getRoom(r.id)).toBeUndefined();
    await framework.roomManager.leaveRoom(r.id, 'a', makeSocket('a'));
    expect(finish).toHaveBeenCalledTimes(1);
  });
  it('restores the remaining waiting TTL instead of a fresh lifetime', async () => {
    const r = room('chess'); framework.roomManager.unregisterRoom(r.id);
    r.status = 'waiting'; r.match = null; r.expiresAt = Date.now() + 1000;
    framework.roomManager.registerRoom(r);
    await vi.advanceTimersByTimeAsync(999); expect(framework.roomManager.getRoom(r.id)).toBe(r);
    await vi.advanceTimersByTimeAsync(2); expect(framework.roomManager.getRoom(r.id)).toBeUndefined();
    expect(framework.roomManager.getPlayerRoom('a')).toBeUndefined();
    expect(framework.roomManager.getPlayerRoom('b')).toBeUndefined();
  });
  it('expires a recovered overdue waiting room immediately and keeps active rooms', async () => {
    const r = room('chess'); framework.roomManager.unregisterRoom(r.id);
    r.status = 'waiting'; r.match = null; r.expiresAt = Date.now() - 1;
    framework.roomManager.registerRoom(r); await vi.advanceTimersByTimeAsync(1);
    expect(framework.roomManager.getRoom(r.id)).toBeUndefined();
    const active = room('chess'); active.expiresAt = Date.now() + 1;
    framework.roomManager.registerRoom(active); await vi.advanceTimersByTimeAsync(5);
    expect(framework.roomManager.getRoom(active.id)).toBe(active);
  });
  it.each(['chess', 'carrom', 'snooker'] as const)('%s restores a paused checkpoint without losing its clock budget', async game => {
    const r = room(game); const engine = r.match!.engine as EngineInstance;
    const deadline = engine.currentClockDeadline!;
    await vi.advanceTimersByTimeAsync(5000);
    const p = r.players.get('b')!; p.connectionStatus = 'disconnected'; p.socketIds.clear();
    await framework.disconnectHandler.handleDisconnect(r, p);
    const snapshot = serializeRoomCheckpoint(framework, r);
    framework.roomManager.unregisterRoom(r.id);
    await vi.advanceTimersByTimeAsync(10000);
    const restored = restoreRoomCheckpoint(framework, snapshot);
    framework.matchManager.restoreRuntime(restored);
    expect((restored.match!.engine as EngineInstance).currentClockDeadline).toBeNull();
    expect(framework.timerManager.getTimerInfo(`${restored.id}:afk:a`)).toBeNull();
    await framework.roomManager.joinRoom({ roomId: restored.id, playerId: 'a', socket: makeSocket('a-restored') });
    await framework.roomManager.joinRoom({ roomId: restored.id, playerId: 'b', socket: makeSocket('b-restored') });
    expect((restored.match!.engine as EngineInstance).currentClockDeadline).toBe(deadline + 10000);
  });
  it('does not trust a recovered connected flag without a live socket', async () => {
    const r = room('snooker'); const p = r.players.get('b')!;
    p.connectionStatus = 'disconnected'; p.socketIds.clear();
    await framework.disconnectHandler.handleDisconnect(r, p);
    const snapshot = serializeRoomCheckpoint(framework, r);
    framework.roomManager.unregisterRoom(r.id);
    const restored = restoreRoomCheckpoint(framework, snapshot);
    await framework.roomManager.joinRoom({ roomId: r.id, playerId: 'b', socket: makeSocket('b-live') });
    expect(restored.match!.pausedAt).not.toBeNull();
    expect(framework.timerManager.getTimerInfo(`${r.id}:reconnect:a`)).not.toBeNull();
    await framework.roomManager.joinRoom({ roomId: r.id, playerId: 'a', socket: makeSocket('a-live') });
    expect(restored.match!.pausedAt).toBeNull();
  });
  it.each([true, false])('uses adapter-confirmed participant identities on recovery (present=%s)', async present => {
    const r = room('snooker'); const p = r.players.get('b')!;
    p.connectionStatus = 'disconnected'; p.socketIds.clear();
    await framework.disconnectHandler.handleDisconnect(r, p);
    const snapshot = serializeRoomCheckpoint(framework, r); framework.roomManager.unregisterRoom(r.id);
    const restored = restoreRoomCheckpoint(framework, snapshot);
    vi.spyOn(framework.io, 'in').mockReturnValue({ socketsLeave: () => undefined,
      fetchSockets: async () => [{ id: 'adapter-socket', data: { userId: present ? 'a' : 'outsider' } }] } as any);
    await framework.roomManager.joinRoom({ roomId: r.id, playerId: 'b', socket: makeSocket('b-live') });
    if (present) { expect(restored.match!.pausedAt).toBeNull(); expect(restored.players.get('a')!.socketIds.has('adapter-socket')).toBe(true); }
    else { expect(restored.match!.pausedAt).not.toBeNull(); expect(restored.players.has('outsider')).toBe(false); }
  });
  it('retries failed waiting-room expiry without extending TTL or spinning', async () => {
    const r = room('chess'); framework.roomManager.unregisterRoom(r.id);
    r.status = 'waiting'; r.match = null; r.expiresAt = Date.now() + 100;
    const close = vi.spyOn(framework.roomManager, 'closeRoom').mockRejectedValueOnce(new Error('Temporary local store outage'));
    framework.roomManager.registerRoom(r); await vi.advanceTimersByTimeAsync(101);
    expect(close).toHaveBeenCalledTimes(1); expect(r.expiresAt).toBe(Date.now() - 1);
    await vi.advanceTimersByTimeAsync(998); expect(close).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2); expect(close).toHaveBeenCalledTimes(2);
    expect(framework.roomManager.getPlayerRoom('a')).toBeUndefined();
  });
  it.each(['table-tennis', 'snake-vs-worms'] as const)('%s exits a manually paused match exactly once', async game => {
    const r = room(game);
    expect((await framework.matchManager.applyAction({ roomId: r.id, playerId: 'a', action: { type: 'pause' } })).ok).toBe(true);
    const finish = vi.spyOn(framework.matchManager, 'finishMatch');
    await framework.roomManager.leaveRoom(r.id, 'a', makeSocket('a'));
    await framework.roomManager.leaveRoom(r.id, 'a', makeSocket('a'));
    expect(finish).toHaveBeenCalledTimes(1); expect(framework.roomManager.getRoom(r.id)).toBeUndefined();
  });
});
