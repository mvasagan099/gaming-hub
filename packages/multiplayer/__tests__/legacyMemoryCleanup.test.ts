import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameStateSyncManager } from '../../../apps/socket-server/src/sync/GameStateSyncManager';
import { GameEventBus } from '../../../apps/socket-server/src/events/GameEventBus';
import { MatchTimeoutMonitoringService } from '../../../apps/socket-server/src/rooms/MatchTimeoutMonitoringService';
import { RoomManager } from '../../../apps/socket-server/src/rooms/RoomManager';
import { NetworkOptimizationsManager } from '../src/managers/NetworkOptimizationsManager';
import { createIoStub, createTestFramework } from './helpers';
import { MultiplayerFramework } from '../src/framework';

vi.mock('../../../apps/socket-server/src/apiClient', () => ({}));
vi.mock('@gaming-hub/db', () => ({ prisma: { room: { update: vi.fn().mockResolvedValue({}) } } }));

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('legacy and optional manager retention', () => {
  it('room closure releases all match-scoped static records across 100 matches', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const manager = new RoomManager(createIoStub());
    manager.stopBackgroundWorker();
    try {
      for (let n = 0; n < 100; n++) {
        const matchId = `legacy-memory-${n}`;
        GameStateSyncManager.initializeMatch(matchId, 'carrom', { turn: 0 });
        GameStateSyncManager.setCachedActionResult(matchId, 'shot', { state: { turn: 1 } });
        GameStateSyncManager.checkAndMarkCarromPocket('same-shot', 'same-coin', matchId);
        GameEventBus.nextStateVersion(matchId); GameEventBus.nextSequence(matchId);
        const room = { id: `room-${n}`, code: `code-${n}`, ioName: `room:${n}`, players: new Map(), match: { matchId } };
        (manager as any).rooms.set(room.id, room);
        (manager as any).roomsByCode.set(room.code, room);
        (manager as any).closeRoom(room, 'test');
        expect(GameStateSyncManager.getMatchState(matchId)).toBeNull();
        expect(GameStateSyncManager.getCachedActionResult(matchId, 'shot')).toBeNull();
        expect((GameStateSyncManager as any).activeReplayPackages.has(matchId)).toBe(false);
        expect((GameStateSyncManager as any).lastSnapshotTimestamps.has(matchId)).toBe(false);
        expect(GameEventBus.getStateVersion(matchId)).toBe(0);
      }
      expect((GameStateSyncManager as any).processedPocketKeys.size).toBe(0);
      expect((GameEventBus as any).matchEventSequences.size).toBe(0);
    } finally { manager.stopBackgroundWorker(); }
  });

  it('match cleanup preserves client rate limits, then expiry releases idle identities', () => {
    vi.useFakeTimers(); vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let n = 0; n < 5; n++) GameStateSyncManager.checkSyncRateLimit('cleanup-client');
    GameStateSyncManager.cleanupMatch('closed-match');
    expect(() => GameStateSyncManager.checkSyncRateLimit('cleanup-client')).toThrow();
    vi.advanceTimersByTime(10000);
    expect((GameStateSyncManager as any).clientSyncRateLimits.has('cleanup-client')).toBe(false);
    expect((GameStateSyncManager as any).rateLimitCleanupTimer).toBeNull();
  });

  it('duration metrics use constant-size aggregates with unchanged average/max', () => {
    for (let n = 0; n < 10000; n++) MatchTimeoutMonitoringService.recordCompletion({ gameId: 'chess', resultReason: 'NORMAL', durationSec: n % 2 ? 4 : 2, success: true });
    const summary = MatchTimeoutMonitoringService.getMetricsSummary(new Map());
    expect(summary.overall.averageMatchDurationSec).toBe(3);
    expect(summary.overall.maximumMatchDurationSec).toBe(4);
    expect(summary.byGame.chess.averageMatchDurationSec).toBe(3);
    expect((MatchTimeoutMonitoringService as any).metrics.durations).toBeUndefined();
    expect((MatchTimeoutMonitoringService as any).metrics.byGame.get('chess').durations).toBeUndefined();
  });

  it('optional network manager releases previous state and pending prediction records', async () => {
    MultiplayerFramework.resetInstance();
    const framework = createTestFramework();
    const network = new NetworkOptimizationsManager(framework);
    try {
      for (let n = 0; n < 100; n++) {
        network.calculateDelta(`room-${n}`, { n });
        (network as any).predictionQueue.set(`player-${n}`, [{ n }]);
        network.releaseRoom(`room-${n}`); network.releasePlayer(`player-${n}`);
      }
      expect((network as any).previousStates.size).toBe(0);
      expect((network as any).predictionQueue.size).toBe(0);
      expect((network as any).compressionCache.size).toBe(0);
    } finally { await network.shutdown(); await framework.matchmakingManager.shutdown(); MultiplayerFramework.resetInstance(); }
  });
});
