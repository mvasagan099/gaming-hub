import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChessEngine } from '@gaming-hub/game-engine';
import { MultiplayerFramework } from '../src/framework';
import { createTestFramework, createMatchRoom, makePlayer } from './helpers';
let framework: MultiplayerFramework;
beforeEach(() => { MultiplayerFramework.resetInstance(); framework = createTestFramework({ enableAntiCheat: false, enableReplay: false }); });
afterEach(async () => { await framework.shutdown(); });
describe('Authoritative deadlines and rematch policy', () => {
  it.each([null, { baseSeconds: 1800, incrementSeconds: 0, delaySeconds: 0 }])('allows a legal chess move after eleven minutes with engine time control %j', async timeControl => {
    const room = createMatchRoom('chess', [makePlayer('a', 0), makePlayer('b', 1)]);
    room.match!.engine = new ChessEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }], () => 0.5, { timeControl });
    room.match!.startedAt = Date.now() - 11 * 60_000; framework.roomManager.registerRoom(room);
    expect((await framework.matchManager.applyAction({ roomId: room.id, playerId: 'a', action: { type: 'move', from: 'e2', to: 'e4' } })).ok).toBe(true);
  });
  it('rejects expired carrom input while still permitting resignation', async () => {
    const room = createMatchRoom('carrom', [makePlayer('a', 0), makePlayer('b', 1)]);
    const engine = room.match!.engine as any, state = engine.persistenceState();
    state.matchStartedAtMs = Date.now() - 3600_000; engine.restoreState(state);
    framework.roomManager.registerRoom(room);
    const result = await framework.matchManager.applyAction({ roomId: room.id, playerId: 'a', action: { type: 'place-striker', position: 0 } });
    expect(result.ok).toBe(false); expect(result.error).toContain('Match deadline exceeded'); expect(room.match!.actionHistory).toHaveLength(0);
    expect((await framework.matchManager.applyAction({ roomId: room.id, playerId: 'a', action: { type: 'resign' } })).finished).toBe(true);
  });
  it('rejects disabled rematches before collecting consent or funding', async () => {
    const room = createMatchRoom('chess', [makePlayer('a', 0), makePlayer('b', 1)]);
    room.status = 'ended'; room.match!.finishedAt = Date.now(); room.config.settings.allowRematch = false;
    framework.roomManager.registerRoom(room); const funding = vi.fn(); framework.config.onMatchStarting = funding;
    await expect(framework.matchManager.requestRematch(room.id, 'a')).rejects.toThrow('Rematches are disabled');
    expect(room.rematch).toBeNull(); expect(funding).not.toHaveBeenCalled();
  });
});
