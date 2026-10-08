import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_IDS, type GameId } from '@gaming-hub/shared';
import { MultiplayerFramework } from '../src/framework';
import { createTestFramework, makeSocket } from './helpers';

let framework: MultiplayerFramework;
beforeEach(() => {
  MultiplayerFramework.resetInstance();
  framework = createTestFramework({ enableReplay: false, enableAntiCheat: true });
});
afterEach(async () => { await framework.shutdown(); vi.useRealTimers(); });

async function setup(gameId: GameId, loading = false) {
  framework.config.requireGameLoadAck = loading;
  const paid = vi.fn(async () => undefined);
  const cancelled = vi.fn(async () => undefined);
  framework.config.persistFinalResult = paid;
  framework.config.persistAbortedResult = cancelled;
  const hostSocket = makeSocket('host');
  const guestSocket = makeSocket('guest');
  const room = await framework.roomManager.createRoom({ gameId, hostId: 'host', hostSocket, maxPlayers: 2, stake: 100 });
  await framework.roomManager.joinRoom({ roomId: room.id, playerId: 'guest', socket: guestSocket });
  room.players.get('host')!.isReady = true;
  room.players.get('guest')!.isReady = true;
  await framework.matchManager.startMatch({ roomId: room.id, startedBy: 'host' });
  return { room, paid, cancelled, hostSocket, guestSocket };
}

describe('intentional multiplayer exits', () => {
  it.each(GAME_IDS.flatMap(game => ['host', 'guest'].map(player => [game, player] as const)))('%s ends immediately when %s leaves', async (gameId, leaving) => {
    const { room, paid, cancelled, hostSocket, guestSocket } = await setup(gameId);
    const gameOver = vi.spyOn(framework.syncManager, 'broadcastGameOver');
    // Leaving immediately after an input must work despite cooldown/rate checks.
    framework.actionValidator.recordAction(leaving);
    await framework.roomManager.leaveRoom(room.id, leaving, leaving === 'host' ? hostSocket : guestSocket);
    expect(room.status).toBe('ended');
    expect(room.match!.engine.finished).toBe(true);
    expect(room.match!.winnerIds).toEqual([leaving === 'host' ? 'guest' : 'host']);
    expect(paid).toHaveBeenCalledOnce();
    expect(paid.mock.calls[0][1].players).toHaveLength(2);
    expect(cancelled).not.toHaveBeenCalled();
    expect(gameOver).toHaveBeenCalledOnce();
    expect(framework.matchManager.getActiveMatchCount()).toBe(0);
    expect(framework.roomManager.getRoom(room.id)).toBeUndefined();
    expect(framework.roomManager.getPlayerRoom('host')).toBeUndefined();
    expect(framework.roomManager.getPlayerRoom('guest')).toBeUndefined();
    for (const [id, socket] of [['host', hostSocket], ['guest', guestSocket]] as const) {
      const next = await framework.roomManager.createRoom({ gameId: 'chess', hostId: id, hostSocket: socket, maxPlayers: 2, stake: 0 });
      expect(next.id).not.toBe(room.id);
    }
    await framework.roomManager.leaveRoom(room.id, leaving, leaving === 'host' ? hostSocket : guestSocket);
    expect(paid).toHaveBeenCalledOnce();
  });

  it.each(['carrom', 'snake-vs-worms'] as const)('%s cancels an exit before both boards load without paying a winner', async gameId => {
    const { room, paid, cancelled, guestSocket } = await setup(gameId, true);
    await framework.roomManager.leaveRoom(room.id, 'guest', guestSocket);
    expect(cancelled).toHaveBeenCalledOnce();
    expect(paid).not.toHaveBeenCalled();
    expect(room.match!.winnerIds).toEqual([]);
  });

  it.each(GAME_IDS)('%s cancels an exit during the start countdown without paying a winner', async gameId => {
    framework.config.countdownDurationMs = 3000;
    const { room, paid, cancelled, hostSocket } = await setup(gameId);
    expect(room.status).toBe('starting');
    await framework.roomManager.leaveRoom(room.id, 'host', hostSocket);
    expect(cancelled).toHaveBeenCalledOnce();
    expect(paid).not.toHaveBeenCalled();
    expect(room.match!.winnerIds).toEqual([]);
  });

  it.each(GAME_IDS)('%s cancels a countdown disconnect timeout without leaving a funded match active', async gameId => {
    vi.useFakeTimers();
    framework.config.countdownDurationMs = 3000;
    framework.config.reconnectGracePeriodMs = 1000;
    const { room, paid, cancelled, guestSocket } = await setup(gameId);
    await framework.playerManager.handleDisconnect('guest', room.id, guestSocket);
    expect(room.lifecyclePhase).toBe('READY_CHECK');
    await vi.advanceTimersByTimeAsync(1000);
    expect(room.match!.finishedAt).not.toBeNull();
    expect(cancelled).toHaveBeenCalledOnce();
    expect(paid).not.toHaveBeenCalled();
    expect(framework.roomManager.getRoom(room.id)).toBeUndefined();
  });

  it.each(GAME_IDS)('%s reconnects before the grace deadline without ending the match', async gameId => {
    vi.useFakeTimers();
    framework.config.reconnectGracePeriodMs = 1000;
    const { room, paid, guestSocket } = await setup(gameId);
    vi.spyOn(framework.syncManager, 'syncFullStateToPlayer').mockResolvedValue(undefined);
    await framework.playerManager.handleDisconnect('guest', room.id, guestSocket);
    await framework.playerManager.handleReconnect('guest', room.id, makeSocket('reconnected-guest'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(room.status).toBe('playing');
    expect(room.match!.finishedAt).toBeNull();
    expect(room.match!.pausedAt).toBeNull();
    expect(paid).not.toHaveBeenCalled();
  });

  it.each(GAME_IDS)('%s concurrent exits finalize only one result', async gameId => {
    const { room, paid, hostSocket, guestSocket } = await setup(gameId);
    await Promise.all([
      framework.roomManager.leaveRoom(room.id, 'host', hostSocket),
      framework.roomManager.leaveRoom(room.id, 'guest', guestSocket),
    ]);
    expect(paid).toHaveBeenCalledOnce();
    expect(room.match!.finishedAt).not.toBeNull();
  });

  it.each(GAME_IDS)('%s exits immediately while paused waiting for the other player', async gameId => {
    const { room, paid, hostSocket } = await setup(gameId);
    await framework.disconnectHandler.handleDisconnect(room, room.players.get('guest')!);
    await framework.roomManager.leaveRoom(room.id, 'host', hostSocket);
    expect(room.status).toBe('ended');
    expect(room.match!.engine.finished).toBe(true);
    expect(paid).toHaveBeenCalledOnce();
    expect(room.match!.winnerIds).toEqual(['guest']);
  });

  it.each(GAME_IDS)('%s spectator exits do not end a match', async gameId => {
    const { room, paid } = await setup(gameId);
    const spectator = makeSocket('spectator');
    await framework.roomManager.joinRoom({ roomId: room.id, playerId: 'spectator', socket: spectator, asSpectator: true });
    await framework.roomManager.leaveRoom(room.id, 'spectator', spectator);
    expect(room.status).toBe('playing');
    expect(paid).not.toHaveBeenCalled();
  });

  it.each(GAME_IDS)('%s ends after an absent player’s reconnect grace period exactly once', async gameId => {
    vi.useFakeTimers();
    framework.config.reconnectGracePeriodMs = 1000;
    const { room, paid } = await setup(gameId);
    const player = room.players.get('guest')!;
    await framework.disconnectHandler.handleDisconnect(room, player);
    expect(room.status).toBe('playing');
    expect(paid).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(room.status).toBe('ended');
    expect(room.match!.winnerIds).toEqual(['host']);
    expect(paid).toHaveBeenCalledOnce();
    await framework.matchManager.handlePlayerForfeit(room, player, 'disconnect_timeout');
    expect(paid).toHaveBeenCalledOnce();
  });
});
