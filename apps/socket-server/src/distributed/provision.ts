import { createEngine } from '@gaming-hub/game-engine';
import { isGameId } from '@gaming-hub/shared';
import { prisma } from '@gaming-hub/db';
import type { MultiplayerFramework } from '@gaming-hub/multiplayer';
import { remoteSocket } from './commands';
import type { DistributedRoomCoordinator } from './coordinator';
import { PostgresMatchStore } from './store';

export async function provisionTournamentRoom(framework: MultiplayerFramework, coordinator: DistributedRoomCoordinator,
  context: { matchId: string; playerIds: string[]; gameId: string; tournamentId: string; tournamentRoundId: string; tournamentMatchNumber: number }) {
  const { matchId, playerIds, gameId } = context;
  if (!matchId || !isGameId(gameId) || playerIds.length !== 2 || new Set(playerIds).size !== 2) throw new Error('INVALID_TOURNAMENT_PROVISION');
  const slot = await prisma.tournamentRound.findUnique({ where: { id: context.tournamentRoundId }, include: { tournament: true } });
  if (!slot || slot.matchId !== matchId || slot.tournamentId !== context.tournamentId || slot.tournament.gameId !== gameId ||
    slot.playerAId !== playerIds[0] || slot.playerBId !== playerIds[1] || !['READY','IN_PROGRESS'].includes(slot.status)) throw new Error('TOURNAMENT_IDENTITY_MISMATCH');
  const store = new PostgresMatchStore();
  const existing = await store.load(matchId);
  if (existing) { if (existing.closed) throw new Error('TOURNAMENT_ROOM_CLOSED'); return { roomId: matchId, matchId }; }
  const users = await prisma.user.findMany({ where: { id: { in: playerIds } } });
  if (users.length !== 2) throw new Error('TOURNAMENT_PARTICIPANT_MISSING');
  const sockets = playerIds.map(id => remoteSocket(framework, { playerId: id, socketId: `provision:${id}`,
    user: users.find(user => user.id === id)!, event: 'provision', payload: {} }));
  try {
    await coordinator.create(async () => {
      const room = await framework.roomManager.createRoom({ gameId, hostId: playerIds[0]!, hostSocket: sockets[0]!,
        isPrivate: true, stake: 0, maxPlayers: 2,
        settings: { tournamentId: context.tournamentId, tournamentRoundId: context.tournamentRoundId,
          tournamentMatchNumber: context.tournamentMatchNumber, tournamentEntryHandled: true } });
      await framework.roomManager.joinRoom({ roomId: room.id, playerId: playerIds[1]!, socket: sockets[1]! });
      framework.roomManager.unregisterRoom(room.id);
      room.id = matchId; room.ioName = `room:${matchId}`;
      const participants = playerIds.map((userId, seat) => ({ userId, seat }));
      room.match = { matchId, participants, engine: createEngine(gameId, participants), turnNumber: 0, startedAt: Date.now(),
        pausedAt: null, pausedBy: null, finishedAt: null, winnerIds: [], winnerSeats: [], stateSnapshots: [], actionHistory: [] };
      if (gameId === 'carrom') room.match.replayInitialState = (room.match.engine as ReturnType<typeof createEngine>).serialize();
      for (const player of room.players.values()) { player.socketIds.clear(); player.connectionStatus = 'disconnected'; player.isReady = false; }
      room.lifecyclePhase = 'WAITING';
      framework.roomManager.registerRoom(room);
      return room;
    });
  } catch (error) {
    if (!await store.load(matchId)) throw error;
    // Another replica may have persisted this same identity concurrently.
    // Its lease, rather than the HTTP caller, decides execution ownership.
    return { roomId: matchId, matchId };
  }
  return { roomId: matchId, matchId };
}
