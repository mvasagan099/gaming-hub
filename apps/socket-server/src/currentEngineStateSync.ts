import type { MultiplayerFramework, RoomRuntime } from '@gaming-hub/multiplayer';
import type { EngineInstance } from '@gaming-hub/game-engine';
import { AppError } from '@gaming-hub/shared';
import { GameStateSyncManager } from './sync/GameStateSyncManager';

/** The active framework engine is the authority; a legacy cache is not a fallback for a rejected sync. */
export function authenticatedEngineStateSync(framework: MultiplayerFramework, playerId: string, matchId: string) {
  const room = framework.roomManager.getPlayerRoom(playerId);
  if (!room?.match || room.match.matchId !== matchId) throw new AppError('UNAUTHORIZED', 'Not a participant in this match', 403);
  GameStateSyncManager.checkSyncRateLimit(JSON.stringify([playerId, matchId]));
  return currentEngineStateSync(framework, room);
}

export function currentEngineStateSync(framework: MultiplayerFramework, room: RoomRuntime) {
  const match = room.match!;
  const stateVersion = framework.syncManager.getStateVersion(room.id);
  const state = (match.engine as EngineInstance).serialize();
  return { matchId: match.matchId, stateVersion, actionSequence: match.turnNumber,
    fullState: { matchId: match.matchId, gameId: room.config.gameId, stateVersion,
      actionSequence: match.turnNumber, status: room.status === 'playing' ? 'playing' as const : 'finished' as const,
      currentPlayerId: (state.currentTurnPlayerId as string) ?? [...room.players.values()].find(player => player.seat === state.currentSeat)?.id ?? null, turnNumber: match.turnNumber,
      turnStartedAt: (state.turnStartedAtMs as number | null) ?? match.startedAt,
      turnExpiresAt: (match.engine as EngineInstance).currentClockDeadline ?? null,
      gameState: state, lastActionId: null, lastActionSequence: match.turnNumber, updatedAt: Date.now() } };
}
