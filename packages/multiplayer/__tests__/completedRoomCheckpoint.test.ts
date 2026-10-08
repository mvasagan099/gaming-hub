import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_IDS } from '@gaming-hub/shared';
import { MultiplayerFramework } from '../src/framework';
import { createMatchRoom, createTestFramework, makePlayer, makeSocket } from './helpers';
import { restoreRoomCheckpoint, serializeRoomCheckpoint } from '../../../apps/socket-server/src/distributed/checkpoint';
import { createCommandDispatcher } from '../../../apps/socket-server/src/distributed/commands';

vi.mock('@gaming-hub/db', () => ({ prisma: { playerGameStats: { upsert: vi.fn() } } }));

describe('completed room recovery after another participant leaves', () => {
  let framework: MultiplayerFramework;
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-08T06:00:00Z'));
    MultiplayerFramework.resetInstance();
    framework = createTestFramework({ enableReplay: false });
  });
  afterEach(async () => { await framework.shutdown(); MultiplayerFramework.resetInstance(); vi.useRealTimers(); });

  async function departedCheckpoint() {
    const room = createMatchRoom('table-tennis', [makePlayer('p1', 0), makePlayer('p2', 1)]);
    room.match!.participants = [{ userId: 'p1', seat: 0 }, { userId: 'p2', seat: 1 }];
    room.match!.finishedAt = Date.now(); room.status = 'ended';
    framework.roomManager.registerRoom(room);
    await framework.roomManager.leaveRoom(room.id, 'p1', makeSocket('s1'));
    const checkpoint = serializeRoomCheckpoint(framework, room);
    framework.roomManager.unregisterRoom(room.id);
    return checkpoint;
  }

  it.each(GAME_IDS)('restores %s so the remaining account can leave after owner restart', async gameId => {
    const forfeit = vi.spyOn(framework.matchManager, 'handlePlayerForfeit');
    const abort = vi.spyOn(framework.matchManager, 'abortMatch');
    const room = createMatchRoom(gameId, [makePlayer('p1', 0), makePlayer('p2', 1)]);
    room.match!.participants = [{ userId: 'p1', seat: 0 }, { userId: 'p2', seat: 1 }];
    room.match!.finishedAt = Date.now();
    room.status = 'ended';
    framework.roomManager.registerRoom(room);
    await framework.roomManager.leaveRoom(room.id, 'p1', makeSocket('s1'));
    const checkpoint = serializeRoomCheckpoint(framework, room);
    framework.roomManager.unregisterRoom(room.id);
    const restored = restoreRoomCheckpoint(framework, checkpoint);
    expect([...restored.players.keys()]).toEqual(['p2']);
    expect(restored.match!.participants).toEqual([{ userId: 'p1', seat: 0 }, { userId: 'p2', seat: 1 }]);
    expect(restored.match!.engine.serialize()).toEqual(room.match!.engine.serialize());
    await framework.roomManager.leaveRoom(restored.id, 'p2', makeSocket('s2'));
    expect(framework.roomManager.getPlayerRoom('p2')).toBeUndefined();
    expect(forfeit).not.toHaveBeenCalled(); expect(abort).not.toHaveBeenCalled();
  });

  it('retains original game-load confirmations when a finished participant has left', async () => {
    const room = createMatchRoom('table-tennis', [makePlayer('p1', 0), makePlayer('p2', 1)]);
    room.match!.participants = [{ userId: 'p1', seat: 0 }, { userId: 'p2', seat: 1 }];
    room.match!.finishedAt = Date.now(); room.status = 'ended';
    room.match!.startConfirmationRequired = true;
    room.match!.loadedPlayerIds = ['p1', 'p2'];
    framework.roomManager.registerRoom(room);
    await framework.roomManager.leaveRoom(room.id, 'p1', makeSocket('s1'));
    const restored = restoreRoomCheckpoint(framework, serializeRoomCheckpoint(framework, room));
    expect(restored.match!.loadedPlayerIds).toEqual(['p1', 'p2']);
  });

  it.each(['waiting', 'starting', 'playing'] as const)('still rejects incomplete membership for a %s room', async status => {
    const checkpoint = await departedCheckpoint(); checkpoint.room.status = status;
    expect(() => restoreRoomCheckpoint(framework, checkpoint)).toThrow('INVALID_MATCH_PARTICIPANTS');
    expect(framework.roomManager.getRoom(checkpoint.room.id)).toBeUndefined();
  });
  it('does not accept an unfinished match merely because its room says ended', async () => {
    const checkpoint = await departedCheckpoint(); checkpoint.match!.finishedAt = null;
    expect(() => restoreRoomCheckpoint(framework, checkpoint)).toThrow('INVALID_MATCH_PARTICIPANTS');
  });
  it('rejects a remaining member with a different original seat', async () => {
    const checkpoint = await departedCheckpoint(); checkpoint.players[0].seat = 0;
    expect(() => restoreRoomCheckpoint(framework, checkpoint)).toThrow('INVALID_MATCH_PARTICIPANTS');
  });
  it('rejects an injected account even in a completed room', async () => {
    const checkpoint = await departedCheckpoint();
    checkpoint.players[0].id = checkpoint.players[0].userId = checkpoint.room.hostId = 'intruder';
    expect(() => restoreRoomCheckpoint(framework, checkpoint)).toThrow('INVALID_MATCH_PARTICIPANTS');
  });
  it('rejects a game-load confirmation from someone outside the original match', async () => {
    const checkpoint = await departedCheckpoint();
    checkpoint.match!.startConfirmationRequired = true;
    checkpoint.match!.loadedPlayerIds = ['p2', 'intruder'];
    expect(() => restoreRoomCheckpoint(framework, checkpoint)).toThrow('INVALID_GAME_LOAD_CHECKPOINT');
  });
  it('rejects an incompatible historical engine instead of clearing membership blindly', async () => {
    const checkpoint = await departedCheckpoint(); checkpoint.match!.engine.engineVersion += 1;
    expect(() => restoreRoomCheckpoint(framework, checkpoint)).toThrow('INCOMPATIBLE_ENGINE_CHECKPOINT');
  });
  it.each(['room:leave', 'game:action', 'game:sync', 'game:rematch'])('does not authorize a departed player for %s using the historical roster', async event => {
    const room = restoreRoomCheckpoint(framework, await departedCheckpoint());
    const dispatch = createCommandDispatcher(framework, {} as never, vi.fn());
    await expect(dispatch({ event, playerId: 'p1', socketId: 'old-socket', user: {}, roomId: room.id,
      payload: { matchId: room.match!.matchId } })).rejects.toMatchObject({ code: 'UNAUTHORIZED', statusCode: 403 });
  });
  it('allows the last spectator to leave a completed room after both players departed', async () => {
    const room = createMatchRoom('table-tennis', [makePlayer('p1', 0), makePlayer('p2', 1)]);
    room.match!.participants = [{ userId: 'p1', seat: 0 }, { userId: 'p2', seat: 1 }];
    room.match!.finishedAt = Date.now(); room.status = 'ended';
    room.spectators.set('viewer', makePlayer('viewer', 0, { seat: null, isSpectator: true }));
    framework.roomManager.registerRoom(room);
    await framework.roomManager.leaveRoom(room.id, 'p1', makeSocket('s1'));
    await framework.roomManager.leaveRoom(room.id, 'p2', makeSocket('s2'));
    const restored = restoreRoomCheckpoint(framework, serializeRoomCheckpoint(framework, room));
    expect(restored.players.size).toBe(0);
    expect([...restored.spectators.keys()]).toEqual(['viewer']);
    await framework.roomManager.leaveRoom(restored.id, 'viewer', makeSocket('s3'));
    expect(framework.roomManager.getPlayerRoom('viewer')).toBeUndefined();
  });
});
