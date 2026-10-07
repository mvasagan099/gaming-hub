import type { MultiplayerFramework, RoomRuntime } from '@gaming-hub/multiplayer';
import type { EngineInstance } from '@gaming-hub/game-engine';

export function currentEngineStateSync(framework: MultiplayerFramework, room: RoomRuntime) {
  const match = room.match!;
  const stateVersion = framework.syncManager.getStateVersion(room.id);
  const state = (match.engine as EngineInstance).serialize();
  return { matchId: match.matchId, stateVersion, actionSequence: match.turnNumber,
    fullState: { matchId: match.matchId, gameId: room.config.gameId, stateVersion,
      actionSequence: match.turnNumber, status: room.status === 'playing' ? 'playing' as const : 'finished' as const,
      currentPlayerId: (state.currentTurnPlayerId as string) ?? null, turnNumber: match.turnNumber,
      turnStartedAt: (state.turnStartedAtMs as number | null) ?? match.startedAt,
      turnExpiresAt: (state.turnDeadlineMs as number | null) ?? null,
      gameState: state, lastActionId: null, lastActionSequence: match.turnNumber, updatedAt: Date.now() } };
}
