import { unpackCarromState } from "@gaming-hub/shared";
import { describe, expect, it, vi } from 'vitest';
import { CarromEngine } from '@gaming-hub/game-engine';
import type { MultiplayerFramework } from '../src/framework';
import { applySocketGameAction } from '../../../apps/socket-server/src/gameActions';
import { SyncManager } from '../src/managers/SyncManager';
import type { RoomRuntime } from '../src/types';

describe('Carrom owner action receipts', () => {
  it('sends trajectories only for shot broadcasts and full recovery, without changing canonical state', async () => {
    const engine = new CarromEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }]);
    const result = engine.apply({ type: 'strike', x: 300, angle: -Math.PI / 2, power: 0.8 }, 0);
    expect(result.ok).toBe(true);
    const canonical = JSON.stringify(engine.persistenceState());
    const emit = vi.fn();
    const sync = new SyncManager({ log: vi.fn(), io: { to: () => ({ emit }) } } as unknown as MultiplayerFramework);
    const room = { id: 'room', ioName: 'room:room', config: { gameId: 'carrom' },
      match: { matchId: 'match', turnNumber: 1, engine } } as unknown as RoomRuntime;
    await sync.broadcastGameState(room, result.events);
    const shot = emit.mock.calls.at(-1)![1];
    expect(unpackCarromState(shot.state).lastTrajectory).toEqual(result.state.lastTrajectory);
    expect(shot.events.every((event: any) => !('keyframes' in event))).toBe(true);
    await sync.broadcastGameState(room, [{ type: 'timer-warning' }]);
    const metadata = emit.mock.calls.at(-1)![1];
    expect(metadata.state.lastTrajectory).toBeNull();
    expect(metadata.state.trajectoryOmitted).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(metadata))).toBeLessThan(Buffer.byteLength(JSON.stringify(shot)) / 5);
    sync.syncMatchStateToPlayer(room, 'a', { id: 'socket-a' } as any);
    expect(emit.mock.calls.at(-1)![1].state.lastTrajectory).toEqual(result.state.lastTrajectory);
    expect(JSON.stringify(engine.persistenceState())).toBe(canonical);
  });
  it('keeps Redis replies below the RPC ceiling without changing authoritative shot data', async () => {
    const engine = new CarromEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }]);
    const result = engine.apply({ type: 'strike', x: 300, angle: -Math.PI / 2, power: 0.8 }, 0);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result).length).toBeGreaterThan(64 * 1024);
    const canonical = JSON.stringify(result);
    const framework = {
      matchManager: { applyAction: vi.fn().mockResolvedValue(result) },
      roomManager: { getRoom: () => ({ config: { gameId: 'carrom' } }) },
    } as unknown as MultiplayerFramework;
    const payload = { roomId: 'room', matchId: 'match', action: { type: 'strike' } };
    const receipt = await applySocketGameAction(framework, 'a', payload);
    expect(Buffer.byteLength(JSON.stringify({ requestId: 'request', ok: true, value: receipt }))).toBeLessThan(64 * 1024);
    expect(receipt.state.lastTrajectory).toBeNull();
    expect(receipt.events.every(event => !('keyframes' in event))).toBe(true);
    expect(receipt.finished).toBe(result.finished);
    expect(receipt.winnerSeats).toEqual(result.winnerSeats);
    expect(receipt.state.coins).toEqual(result.state.coins);
    expect(JSON.stringify(result)).toBe(canonical);
    expect(engine.persistenceState().lastTrajectory).toEqual(result.state.lastTrajectory);
    // A cached retry is compacted independently, retaining the original replay.
    expect(await applySocketGameAction(framework, 'a', payload)).toEqual(receipt);
    expect(JSON.stringify(result)).toBe(canonical);
  });

  it('preserves other games and rejected-action semantics', async () => {
    const result = { ok: false, error: 'Invalid action', state: {}, events: [], finished: false, winnerSeats: [] };
    const framework = {
      matchManager: { applyAction: vi.fn().mockResolvedValue(result) },
      roomManager: { getRoom: () => ({ config: { gameId: 'chess' } }) },
    } as unknown as MultiplayerFramework;
    expect(await applySocketGameAction(framework, 'a', { roomId: 'room', matchId: 'match', action: { type: 'move' } })).toBe(result);
    expect(() => applySocketGameAction(framework, 'a', { roomId: 'room', matchId: '', action: { type: 'move' } })).toThrow('Current match identity is required');
    expect(framework.matchManager.applyAction).toHaveBeenCalledOnce();
  });
});
