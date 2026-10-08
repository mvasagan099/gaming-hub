import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GAME_IDS } from '@gaming-hub/shared';
import { MultiplayerFramework } from '../src/framework';
import { createMatchRoom, createTestFramework, makePlayer, makeSocket } from './helpers';

describe('assigned tournament room access', () => {
  let framework: MultiplayerFramework;
  beforeEach(() => {
    MultiplayerFramework.resetInstance();
    framework = createTestFramework({ enableReplay: false });
  });
  afterEach(async () => { await framework.shutdown(); });

  it.each(GAME_IDS)('%s reserves participant seats while allowing reconnects and spectators', async gameId => {
    const room = createMatchRoom(gameId, [makePlayer('p1', 0), makePlayer('p2', 1)]);
    room.status = 'waiting';
    room.config.settings.tournamentId = 'tournament-1';
    framework.roomManager.registerRoom(room);
    await expect(framework.roomManager.joinRoom({ roomId: room.id, playerId: 'outsider', socket: makeSocket('outsider') }))
      .rejects.toThrow('Only assigned participants');
    expect([...room.players.keys()]).toEqual(['p1', 'p2']);
    await framework.roomManager.joinRoom({ roomId: room.id, playerId: 'p1', socket: makeSocket('reconnected') });
    expect(room.players.size).toBe(2);
    await framework.roomManager.joinRoom({ roomId: room.id, playerId: 'viewer', socket: makeSocket('viewer'), asSpectator: true });
    expect(room.spectators.has('viewer')).toBe(true);
  });

  it('allows the assigned second player to be seated during initial provisioning', async () => {
    const room = await framework.roomManager.createRoom({ gameId: 'chess', hostId: 'p1', hostSocket: makeSocket('p1'), settings: { tournamentId: 'tournament-1' } });
    await framework.roomManager.joinRoom({ roomId: room.id, playerId: 'p2', socket: makeSocket('p2') });
    expect(room.players.size).toBe(2);
  });
});
