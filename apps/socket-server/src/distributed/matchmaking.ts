import { randomUUID } from 'node:crypto';
import { prisma } from '@gaming-hub/db';
import { matchmakingJoinSchema, isGameId, getGameDefinition, type GameId } from '@gaming-hub/shared';
import type { MultiplayerFramework } from '@gaming-hub/multiplayer';
import type { DistributedRoomCoordinator, RoutedCommand } from './coordinator';
import { remoteSocket } from './commands';
import { PostgresMatchStore } from './store';
import { assertFeatureEnabled, assertGameEnabled } from '../settings';

export class SharedMatchmaking {
  constructor(private readonly framework: MultiplayerFramework, private readonly coordinator: DistributedRoomCoordinator) {}
  async join(command: RoutedCommand) {
    const parsed = matchmakingJoinSchema.parse(command.payload);
    await assertFeatureEnabled('games.enabled', 'Games'); await assertFeatureEnabled('games.matchmaking', 'Matchmaking');
    await assertFeatureEnabled(parsed.stake > 0 ? 'games.realMoney' : 'games.practice', 'Games');
    await assertGameEnabled(parsed.gameId, parsed.stake);
    if (!await this.coordinator.leaveEndedRoom(command)) throw new Error('Leave your current room before searching');
    const gameMode = parsed.gameMode ?? 'casual';
    // Serialize assignment in the database; sockets and sticky routing do not define identity.
    const paired = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('shared-matchmaking'))`;
      await tx.matchmakingQueue.updateMany({ where: { status: 'WAITING', expiresAt: { lte: new Date() } }, data: { status: 'EXPIRED' } });
      const existing = await tx.matchmakingQueue.findFirst({ where: { userId: command.playerId, status: { in: ['WAITING','MATCHED'] }, expiresAt: { gt: new Date() } } });
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: command.playerId } });
      if (wallet.isFrozen || wallet.balance < parsed.stake) throw new Error('Wallet unavailable or insufficient balance');
      if (existing?.status === 'MATCHED') return existing.matchId;
      if (existing && existing.gameId === parsed.gameId && existing.entryFee === parsed.stake && existing.gameMode === gameMode) {
        await tx.matchmakingQueue.update({ where: { id: existing.id }, data: { socketId: command.socketId } });
        return null;
      }
      if (existing) await tx.matchmakingQueue.update({ where: { id: existing.id }, data: { status: 'CANCELLED' } });
      await tx.matchmakingQueue.create({ data: { userId: command.playerId, gameId: parsed.gameId, entryFee: parsed.stake,
        gameMode, socketId: command.socketId, expiresAt: new Date(Date.now() + 120000) } });
      const group = await tx.matchmakingQueue.findMany({ where: { status: 'WAITING', gameId: parsed.gameId, entryFee: parsed.stake, gameMode }, orderBy: { joinedAt: 'asc' }, take: getGameDefinition(parsed.gameId).minPlayers });
      if (group.length < getGameDefinition(parsed.gameId).minPlayers) return null;
      const id = randomUUID();
      await tx.matchmakingQueue.updateMany({ where: { id: { in: group.map(p => p.id) } }, data: { status: 'MATCHED', matchId: id, roomId: id, matchedAt: new Date(), expiresAt: new Date(Date.now() + 120000) } });
      return id;
    });
    if (paired) await this.provision(paired);
    else {
      this.framework.io.to(command.socketId).emit('matchmaking:queued', { position: 1, gameId: parsed.gameId, stake: parsed.stake });
      (this.framework.io.to(command.socketId) as any).emit('game:queue-joined', { position: 1, gameId: parsed.gameId, entryFee: parsed.stake, mode: gameMode });
    }
    return { position: paired ? 0 : 1 };
  }
  async leave(playerId: string) {
    await prisma.matchmakingQueue.updateMany({ where: { userId: playerId, status: 'WAITING' }, data: { status: 'CANCELLED' } });
    return { left: true };
  }
  async recover() {
    const pairs = await prisma.matchmakingQueue.findMany({ where: { status: 'MATCHED', expiresAt: { gt: new Date() } }, distinct: ['matchId'], select: { matchId: true } });
    for (const pair of pairs) if (pair.matchId) await this.provision(pair.matchId).catch(() => this.framework.error('Matchmaking provision remains retryable', 'MATCHMAKING_PROVISION_RETRY'));
  }
  private async provision(id: string) {
    const store = new PostgresMatchStore();
    const group = await prisma.matchmakingQueue.findMany({ where: { matchId: id, status: 'MATCHED' }, orderBy: { joinedAt: 'asc' }, include: { user: true } });
    if (group.length < 2 || !isGameId(group[0]!.gameId)) return;
    const first = group[0]!, gameId = first.gameId as GameId;
    let checkpoint = await store.load(id);
    if (!checkpoint) {
      try {
        await this.coordinator.create(async () => {
          const proxies = group.map(entry => remoteSocket(this.framework, { playerId: entry.userId, socketId: entry.socketId!, user: entry.user,
            event: 'matchmaking:join', payload: {} }));
          const room = await this.framework.roomManager.createRoom({ gameId, hostId: first.userId, hostSocket: proxies[0]!,
            stake: first.entryFee, isPrivate: true, maxPlayers: group.length });
          for (let i = 1; i < group.length; i++) await this.framework.roomManager.joinRoom({ roomId: room.id, playerId: group[i]!.userId, socket: proxies[i]! });
          this.framework.roomManager.unregisterRoom(room.id); room.id = id; room.ioName = `room:${id}`;
          for (const proxy of proxies) await proxy.join(room.ioName);
          for (const p of room.players.values()) p.isReady = true;
          this.framework.roomManager.registerRoom(room);
          return room;
        });
      } catch (error) { if (!await store.load(id)) throw error; }
      checkpoint = await store.load(id);
    }
    if (!checkpoint || checkpoint.closed) return;
    for (const player of group) this.framework.io.to(player.socketId!).emit('matchmaking:found', { roomId: id, code: checkpoint.code });
    // Route starting through the current owner, including recovery of a provision interrupted before start.
    if ((checkpoint.snapshot as any).room.status === 'waiting') {
      await this.coordinator.route({ event: 'room:start', roomId: id, playerId: first.userId, socketId: first.socketId!, user: first.user, payload: { roomId: id } });
    }
    await prisma.matchmakingQueue.updateMany({ where: { matchId: id, status: 'MATCHED' }, data: { expiresAt: new Date() } });
  }
}
