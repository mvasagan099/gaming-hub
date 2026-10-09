import { createHash } from 'node:crypto';
import type { ReplayPackage, ResultReason } from '@gaming-hub/shared';
import type { RecordedAction } from '@gaming-hub/multiplayer';
import type { MatchResult } from '@gaming-hub/multiplayer';
import type { RoomCheckpoint } from './checkpoint';
import type { DurableResult, DurableSnapshot } from './store';

/** Archive the same fenced facts as the result, before a rematch replaces them. */
export function buildCompletedReplay(snapshot: DurableSnapshot, result: DurableResult): ReplayPackage | null {
  const saved = snapshot as unknown as RoomCheckpoint;
  const outcome = (result.result as unknown as { matchResult?: MatchResult }).matchResult;
  const match = saved.match;
  if (!outcome || !match || match.matchId !== result.matchId || saved.schemaVersion !== 1) return null;
  const { lastTrajectory: _trajectory, lastAction: _action, ...finalState } = match.engine.state;
  const events = match.actionHistory.map(record => replayEvent(record, result.matchId));
  const replay: ReplayPackage = {
    matchId: result.matchId, gameId: saved.room.config.gameId,
    metadata: { players: outcome.players.map(p => ({ id: p.playerId, username: p.playerId, seat: p.seat, score: p.score ?? 0 })),
      startedAt: match.gameplayStartedAt ?? match.startedAt, endedAt: outcome.finishedAt,
      durationMs: Math.max(0, outcome.finishedAt - (match.gameplayStartedAt ?? match.startedAt)),
      winnerIds: outcome.winnerIds, resultReason: (outcome.endReason ?? 'NORMAL') as ResultReason,
      entryFee: saved.room.config.stake, actionCount: events.length },
    initialState: match.replayInitialState ?? {}, events, snapshots: [], finalState,
  };
  replay.checksum = createHash('sha256').update(JSON.stringify({ matchId: replay.matchId,
    initialState: replay.initialState, events, finalState })).digest('hex');
  return replay;
}

export function replayEvent(record: RecordedAction, matchId: string) {
  return { eventId: `${matchId}:${record.turnNumber}`, matchId, sequence: record.turnNumber,
    playerId: record.playerId, eventType: record.action.type, timestamp: record.timestamp,
    stateVersion: record.turnNumber, actionData: (record.action.payload ?? {}) as Record<string, unknown>,
    resultData: { events: record.events.filter(event => event.type !== 'carrom:shot-start'),
      ...(record.replayState ? { state: record.replayState } : {}) } };
}
