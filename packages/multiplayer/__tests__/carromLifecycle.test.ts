import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiplayerFramework } from '../src/framework';
import { createTestFramework, makeSocket } from './helpers';
import type { CarromEngine } from '@gaming-hub/game-engine';

// Results in this local fixture must not write player records to a database.
vi.mock('@gaming-hub/db', () => ({ prisma: { playerGameStats: { upsert: vi.fn().mockResolvedValue({}) } } }));

describe('Carrom multiplayer lifecycle', () => {
  let framework: MultiplayerFramework;
  beforeEach(() => {
    vi.useFakeTimers();
    MultiplayerFramework.resetInstance();
    framework = createTestFramework({ enableAntiCheat: true, enableReplay: false });
  });
  afterEach(async () => {
    await framework.shutdown();
    vi.useRealTimers(); vi.restoreAllMocks();
  });
  async function start(gameId: 'carrom' | 'chess' = 'carrom') {
    const room = await framework.roomManager.createRoom({ gameId, hostId: 'p0', hostSocket: makeSocket('s0'), maxPlayers: 2 });
    await framework.roomManager.joinRoom({ roomId: room.id, playerId: 'p1', socket: makeSocket('s1') });
    await framework.roomManager.setPlayerReady(room.id, 'p1', true);
    await framework.matchManager.startMatch({ roomId: room.id, startedBy: 'p0' });
    return room;
  }
  it('passes expired opening turns and keeps the match alive past the AFK limit', async () => {
    const room = await start();
    const engine = room.match!.engine as CarromEngine;
    const forfeit = vi.spyOn(framework.matchManager, 'handlePlayerForfeit').mockResolvedValue(undefined);
    await vi.advanceTimersByTimeAsync(30_051);
    expect(engine.state.currentSeat).toBe(1);
    expect(engine.state.finished).toBe(false);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(engine.state.turnNumber).toBe(2);
    expect(room.status).toBe('playing');
    expect(forfeit).not.toHaveBeenCalled();
  });
  it('does not forfeit a connected player waiting through the opponent’s extra turns', async () => {
    const room = await start();
    const engine = room.match!.engine as CarromEngine;
    const forfeit = vi.spyOn(framework.matchManager, 'handlePlayerForfeit').mockResolvedValue(undefined);
    for (let shot = 0; shot < 4; shot++) {
      // Simulate an earned extra turn by keeping its deadline fresh.
      engine.state.turnStartedAtMs = Date.now();
      engine.state.turnExpiresAt = Date.now() + 30_000;
      framework.playerManager.recordActivity('p0');
      await vi.advanceTimersByTimeAsync(20_000);
    }
    expect(room.status).toBe('playing');
    expect(engine.state.finished).toBe(false);
    expect(forfeit).not.toHaveBeenCalled();
  });
  it('accepts placement followed immediately by a shot through anti-cheat', async () => {
    const room = await start();
    const act = (action: any) => framework.matchManager.applyAction({ roomId: room.id, matchId: room.match!.matchId, playerId: 'p0', action });
    expect((await act({ type: 'place-striker', x: 280 })).ok).toBe(true);
    const shot = await act({ type: 'strike', x: 280, angle: -Math.PI / 2, power: 0.4 });
    expect(shot.error).toBeUndefined();
    expect(shot.ok).toBe(true);
    expect((room.match!.engine as CarromEngine).state.lastTrajectory!.length).toBeGreaterThan(1);
  });
  it('preserves AFK forfeits for games using that policy', async () => {
    const room = await start('chess');
    const forfeit = vi.spyOn(framework.matchManager, 'handlePlayerForfeit').mockResolvedValue(undefined);
    await vi.advanceTimersByTimeAsync(65_000);
    expect(forfeit).toHaveBeenCalledWith(room, room.players.get('p1'), 'afk');
  });
});
