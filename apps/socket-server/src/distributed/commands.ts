import { randomUUID } from 'node:crypto';
import { registerCarromPreviewHandler } from '../carromHandlers';
import { registerSnookerPreviewHandler } from '../snookerHandlers';
import { assertGameEnabled } from '../settings';
import type { Socket } from 'socket.io';
import type { RoomRuntime, MultiplayerFramework } from '@gaming-hub/multiplayer';
import { AppError, isGameId } from '@gaming-hub/shared';
import { authenticatedEngineStateSync } from '../currentEngineStateSync';
import { applySocketGameAction } from '../gameActions';
import type { DistributedRoomCoordinator, RoutedCommand } from './coordinator';
import { leaveQueueForRoom } from './queueAdmission';

/** Remote socket channel operations use the Redis Socket.IO adapter. No client identity is trusted here. */
export function remoteSocket(framework: MultiplayerFramework, command: RoutedCommand): Socket {
  const socketId = command.socketId;
  return {
    id: socketId, connected: true, data: { user: command.user, userId: command.playerId },
    join: async (name: string) => { await framework.io.in(socketId).socketsJoin(name); },
    leave: async (name: string) => { await framework.io.in(socketId).socketsLeave(name); },
    emit: (event: string, ...args: unknown[]) => { framework.io.to(socketId).emit(event, ...args); },
    on: () => undefined,
  } as unknown as Socket;
}
export const DISTRIBUTED_ROOM_EVENTS = new Set([
  'room:create', 'game:loaded',
  'room:join', 'match:join', 'match:ready', 'room:kick', 'chat:message', 'chat:emoji', 'chat:typing', 'carrom:striker-position', 'snooker:aim-position', 'room:ready', 'room:start', 'room:leave', 'game:action', 'game:sync', 'game:state-sync',
  'game:rematch', 'game:rematch-request', 'game:rematch-accept', 'game:rematch-decline',
]);
export function createCommandDispatcher(framework: MultiplayerFramework, coordinator: DistributedRoomCoordinator,
  assertFeatureEnabled: (flag: string, label: string) => Promise<void>) {
  const previewHandlers = new WeakMap<RoomRuntime, Map<string, (payload: unknown) => void>>();
  return async (command: RoutedCommand): Promise<unknown> => {
    const { event, payload, playerId, roomId } = command;
    const socket = remoteSocket(framework, command);
    const room = roomId ? framework.roomManager.getRoom(roomId) : undefined;
    if (!['room:create', 'room:join', 'match:join'].includes(event) && (!room || (!room.players.has(playerId) && !room.spectators.has(playerId)))) {
      throw new AppError('UNAUTHORIZED', 'Not a participant in this room', 403);
    }
    switch (event) {
      case 'room:create': {
        await assertFeatureEnabled('games.enabled', 'Games');
        await assertFeatureEnabled(Number(payload.stake) > 0 ? 'games.realMoney' : 'games.practice', 'Games');
        if ((typeof payload.gameId !== "string" || !isGameId(payload.gameId)) || !Number.isSafeInteger(payload.stake ?? 0) || Number(payload.stake ?? 0) < 0) throw new AppError('VALIDATION_ERROR', 'Invalid room game or stake', 400);
        if (payload.settings && typeof payload.settings === 'object' && Object.keys(payload.settings).some(k => k.startsWith('tournament') || ['configSnapshot','pendingMatchId','engineVersion','requiresGameStartValidation'].includes(k))) throw new AppError('VALIDATION_ERROR', 'Reserved room settings cannot be supplied by clients', 400);
        if (!await coordinator.leaveEndedRoom(command)) throw new AppError('INVALID_ACTION', 'Leave your current room before creating another', 409);
        await leaveQueueForRoom(playerId);
        const created = await coordinator.create(() => framework.roomManager.createRoom({
          gameId: payload.gameId as Parameters<typeof framework.roomManager.createRoom>[0]['gameId'],
          hostId: playerId, hostSocket: socket, isPrivate: !!payload.isPrivate,
          stake: Number(payload.stake ?? 0), maxPlayers: Number(payload.maxPlayers ?? 2),
          settings: payload.settings as Parameters<typeof framework.roomManager.createRoom>[0]['settings'],
        }));
        return framework.syncManager.serializeRoom(created);
      }
      case 'match:join':
      case 'room:join': {
        await assertFeatureEnabled('games.enabled', 'Games');
        if (payload.asSpectator) await assertFeatureEnabled('games.spectator', 'Spectator mode');
        const previous = await coordinator.findPlayer(playerId);
        if (previous && previous.id !== roomId && !await coordinator.leaveEndedRoom(command)) throw new AppError('INVALID_ACTION', 'Leave your current room before joining another', 409);
        if (previous?.id !== roomId) await leaveQueueForRoom(playerId, roomId);
        const joined = await framework.roomManager.joinRoom({ roomId, playerId, socket, asSpectator: !!payload.asSpectator, password: typeof payload.password === "string" ? payload.password : undefined });
        await framework.matchManager.resumeReadyCountdown(joined);
        return event === 'match:join' ? { room: framework.syncManager.serializeRoom(joined), status: joined.status } : framework.syncManager.serializeRoom(joined);
      }
      case 'match:ready':
      case 'room:ready':
        await framework.roomManager.setPlayerReady(roomId!, playerId, event === 'match:ready' ? payload.ready !== false : !!payload.ready);
        if (room!.status === 'waiting') room!.lifecyclePhase = 'READY_CHECK';
        await framework.matchManager.resumeReadyCountdown(room!);
        return framework.syncManager.serializeRoom(room!);
      case 'room:start':
        await assertFeatureEnabled('games.enabled', 'Games');
        await framework.matchManager.startMatch({ roomId: roomId!, startedBy: playerId });
        return framework.syncManager.serializeRoom(room!);
      case 'room:leave':
        if (payload.onlyIfEnded && room!.status !== 'ended') throw new AppError('INVALID_ACTION', 'An active room must be left explicitly', 409);
        await framework.roomManager.leaveRoom(roomId!, playerId, socket); return undefined;
      case 'game:loaded':
        return framework.matchManager.confirmGameLoaded(roomId!, playerId, String(payload.matchId));
      case 'game:action':
        return applySocketGameAction(framework, playerId, payload as Parameters<typeof applySocketGameAction>[2]);
      case 'game:state-sync': case 'game:sync': {
        const result = authenticatedEngineStateSync(framework, playerId, String(payload.matchId));
        return event === 'game:sync' ? { fullState: result.fullState.gameState, stateVersion: result.stateVersion } : result;
      }
      case 'room:kick':
        await framework.roomManager.kickPlayer(roomId!, String(payload.targetUserId), playerId); return { roomId };
      case 'chat:message': case 'chat:emoji': case 'chat:typing': {
        const player = room!.players.get(playerId) ?? room!.spectators.get(playerId)!;
        const message = { id: randomUUID(), roomId, userId: playerId, senderName: player.displayName,
          body: String(payload.text ?? '').slice(0, 500), emoji: payload.emoji, typing: event === 'chat:typing',
          isSystem: false, createdAt: new Date().toISOString() };
        framework.syncManager.broadcastToRoom(room!, event, message); return { sent: true };
      }
      case 'carrom:striker-position': case 'snooker:aim-position': {
        // Retain each validator's turn-scoped anti-replay state across forwarded
        // previews. A recovered room gets a fresh presentation-only cache.
        let handlers = previewHandlers.get(room!);
        if (!handlers) { handlers = new Map(); previewHandlers.set(room!, handlers); }
        const key = `${command.socketId}:${event}`;
        let handler = handlers.get(key);
        if (!handler) {
          const capture = { on: (_event: string, callback: (p: unknown) => void) => { handler = callback; } } as unknown as Socket;
          const output = { to: () => ({ emit: (name: string, data: unknown) => framework.syncManager.broadcastToRoom(room!, name, data) }) };
          if (event === 'carrom:striker-position') registerCarromPreviewHandler(capture, output as never, framework, playerId);
          else registerSnookerPreviewHandler(capture, output as never, framework, playerId);
          handlers.set(key, handler!);
        }
        handler!(payload);
        return undefined;
      }
      case 'game:rematch': case 'game:rematch-request': case 'game:rematch-accept':
        await assertFeatureEnabled('games.enabled', 'Games');
        await assertFeatureEnabled(room!.config.stake > 0 ? 'games.realMoney' : 'games.practice', 'Games');
        await assertGameEnabled(room!.config.gameId, room!.config.stake);
        await coordinator.assertRematchSettled(room!);
        return framework.matchManager.requestRematch(roomId!, playerId);
      case 'game:rematch-decline': return framework.matchManager.declineRematch(roomId!, playerId);
      case 'disconnect':
        previewHandlers.get(room!)?.delete(`${command.socketId}:carrom:striker-position`);
        previewHandlers.get(room!)?.delete(`${command.socketId}:snooker:aim-position`);
        await framework.playerManager.handleDisconnect(playerId, roomId!, socket); return undefined;
      default: throw new Error('UNSUPPORTED_DISTRIBUTED_COMMAND');
    }
  };
}
