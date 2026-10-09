import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChessEngine } from '@gaming-hub/game-engine';
import { MultiplayerFramework } from '../src/framework';
import { createTestFramework, createMatchRoom, makePlayer } from './helpers';

describe('configured match policies', () => {
  let framework: MultiplayerFramework;
  beforeEach(() => { MultiplayerFramework.resetInstance(); framework = createTestFramework({ enableAntiCheat: false, enableReplay: false }); });
  afterEach(async () => { await framework.shutdown(); vi.restoreAllMocks(); });
  function room(timeControl: { baseSeconds: number; incrementSeconds: number; delaySeconds: number } | null) {
    const r = createMatchRoom('chess', [makePlayer('a', 0), makePlayer('b', 1)]);
    r.match!.engine = new ChessEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }], undefined, { timeControl });
    r.match!.startedAt = Date.now() - 11 * 60 * 1000;
    framework.roomManager.registerRoom(r); return r;
  }
  it.each([null, { baseSeconds: 1800, incrementSeconds: 0, delaySeconds: 0 }])('allows legal Chess moves beyond ten minutes with %j control', async timeControl => {
    const r = room(timeControl);
    expect(await framework.matchManager.applyAction({ roomId: r.id, playerId: 'a', action: { type: 'move', from: 'e2', to: 'e4' } })).toMatchObject({ ok: true });
  });
  it('honors engine deadlines and still allows resignation', async () => {
    const r = createMatchRoom('carrom', [makePlayer('a', 0), makePlayer('b', 1)]);
    const state = r.match!.engine.persistenceState();
    state.matchStartedAtMs = Date.now() - 3600000;
    r.match!.engine.restoreState(state); framework.roomManager.registerRoom(r);
    const move = await framework.matchManager.applyAction({ roomId: r.id, playerId: 'a', action: { type: 'place-striker', position: 0 } });
    expect(move).toMatchObject({ ok: false, error: 'Match deadline exceeded' });
    expect(r.match!.actionHistory).toHaveLength(0);
    expect(await framework.matchManager.applyAction({ roomId: r.id, playerId: 'a', action: { type: 'resign' } })).toMatchObject({ ok: true, finished: true });
  });
  it('rejects disabled rematches before consent or funding', async () => {
    const r = room(null); r.status = 'ended'; r.match!.finishedAt = Date.now(); r.config.settings.allowRematch = false;
    const fund = vi.fn(); framework.config.onMatchStarting = fund;
    await expect(framework.matchManager.requestRematch(r.id, 'a')).rejects.toThrow('Rematches are disabled');
    expect(r.rematch).toBeNull(); expect(fund).not.toHaveBeenCalled();
  });
});
