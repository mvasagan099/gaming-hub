import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BubbleShooterEngine } from '@gaming-hub/game-engine';
import { MultiplayerFramework } from '../src/framework';
import { createTestFramework, makeSocket } from './helpers';

describe('Bubble Shooter two-player authoritative gameplay', () => {
  let framework: MultiplayerFramework;
  beforeEach(() => {
    MultiplayerFramework.resetInstance();
    framework = createTestFramework({ enableAntiCheat: true, enableReplay: false });
  });
  afterEach(async () => { await framework.shutdown(); });

  async function start(spectator = false) {
    const room = await framework.roomManager.createRoom({ gameId: 'bubble-shooter', hostId: 'p1', hostSocket: makeSocket('s1'), stake: 0 });
    await framework.roomManager.joinRoom({ roomId: room.id, playerId: 'p2', socket: makeSocket('s2') });
    await framework.roomManager.setPlayerReady(room.id, 'p2', true);
    if (spectator) await framework.roomManager.joinRoom({ roomId: room.id, playerId: 'viewer', socket: makeSocket('viewer'), asSpectator: true });
    await framework.matchManager.startMatch({ roomId: room.id, startedBy: 'p1' });
    return room;
  }

  it('accepts concurrent shots from both seats without turn gating and broadcasts both results', async () => {
    const room = await start();
    const broadcast = vi.spyOn(framework.syncManager, 'broadcastGameState');
    const results = await Promise.all(['p1', 'p2'].map(playerId => framework.matchManager.applyAction({
      roomId: room.id, playerId, action: { type: 'shoot', angle: -Math.PI / 2 },
    })));
    expect(results.map(result => result.ok)).toEqual([true, true]);
    const engine = room.match!.engine as BubbleShooterEngine;
    expect(engine.state.players.map(player => player.lastShot?.sequence)).toEqual([1, 2]);
    expect(engine.currentClockDeadline).toBeNull();
    expect(room.match!.actionHistory).toHaveLength(2);
    expect(broadcast).toHaveBeenCalledTimes(2);
    expect(engine.state.finished).toBe(false);
  });

  it('rejects invalid and spectator shots without modifying the authoritative board', async () => {
    const room = await start(true);
    const engine = room.match!.engine as BubbleShooterEngine;
    const before = structuredClone(engine.state);
    const invalid = await framework.matchManager.applyAction({ roomId: room.id, playerId: 'p1', action: { type: 'shoot', angle: Math.PI / 4 } });
    const spectator = await framework.matchManager.applyAction({ roomId: room.id, playerId: 'viewer', action: { type: 'shoot', angle: -Math.PI / 2 } });
    expect(invalid.ok).toBe(false);
    expect(spectator.ok).toBe(false);
    expect(engine.state).toEqual(before);
    expect(room.match!.actionHistory).toHaveLength(0);
  });
});
