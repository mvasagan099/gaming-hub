import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { MultiplayerFramework } from '../src/framework';
import { planHistoryRetention } from '../src/utils/HistoryRetention';
import { createTestFramework, createMatchRoom, makePlayer } from './helpers';
let framework: MultiplayerFramework;
beforeEach(() => { MultiplayerFramework.resetInstance(); framework = createTestFramework({ enableAntiCheat: false, enableReplay: false }); });
afterEach(async () => { await framework.shutdown(); });
describe('Safe history windows', () => {
  it('plans archival without mutating uncommitted runtime', () => {
    const records = Array.from({ length: 129 }, (_, i) => ({ turnNumber: i + 1, playerId: "a", action: { actionId: `action-${i}` } })) as any;
    const match = { actionHistory: records };
    const plan = planHistoryRetention(match);
    expect(plan.archive).toHaveLength(65); expect(plan.retained).toHaveLength(64);
    expect(plan.archivedThroughTurn).toBe(65); expect(match.actionHistory).toHaveLength(129);
  });
  it('bounds local snapshots while retaining the latest authoritative state and unarchived actions', () => {
    const room = createMatchRoom('carrom', [makePlayer('a', 0), makePlayer('b', 1)]);
    const engine = room.match!.engine as any;
    for (let i = 0; i < 300; i++) {
      const action = { type: 'place-striker', x: 300, actionId: `placement-${i}` };
      const result = engine.apply(action, 0); expect(result.ok).toBe(true);
      framework.gameStateManager.recordResult(room, result, 'a', 0, action, []);
    }
    expect(room.match!.stateSnapshots).toHaveLength(32);
    expect(room.match!.actionHistory).toHaveLength(300);
    expect(framework.gameStateManager.getLatestSnapshot(room)?.turnNumber).toBe(300);
    expect(framework.gameStateManager.getLatestSnapshot(room)?.state.coins).toEqual(engine.state.coins);
    expect(room.match!.stateSnapshots.map(s => s.turnNumber)).toEqual(Array.from({ length: 32 }, (_, i) => 269 + i));
  });
  it('uses a scoped durable receipt to suppress a retry after live history eviction', async () => {
    const room = createMatchRoom('carrom', [makePlayer('a', 0), makePlayer('b', 1)]);
    room.match!.archivedThroughTurn = 65; room.match!.turnNumber = 129;
    framework.roomManager.registerRoom(room);
    const lookup = vi.fn().mockResolvedValue(true); framework.config.hasArchivedAction = lookup;
    const apply = vi.spyOn(room.match!.engine as any, 'apply');
    const retry = await framework.matchManager.applyAction({ roomId: room.id, playerId: 'a', action: { type: 'place-striker', x: 300, actionId: 'old' } });
    expect(retry.ok).toBe(true); expect(retry.events).toEqual([]); expect(apply).not.toHaveBeenCalled();
    expect(lookup).toHaveBeenCalledExactlyOnceWith(room.id, room.match!.matchId, 'a', 'old');
    expect(room.match!.turnNumber).toBe(129);
  });
  it('fails closed if archived receipt storage cannot be read', async () => {
    const room = createMatchRoom('carrom', [makePlayer('a', 0), makePlayer('b', 1)]);
    room.match!.archivedThroughTurn = 65; framework.roomManager.registerRoom(room);
    framework.config.hasArchivedAction = vi.fn().mockRejectedValue(Error('archive unavailable'));
    const apply = vi.spyOn(room.match!.engine as any, 'apply');
    await expect(framework.matchManager.applyAction({ roomId: room.id, playerId: 'a', action: { type: 'place-striker', x: 300, actionId: 'old' } })).rejects.toThrow('archive unavailable');
    expect(apply).not.toHaveBeenCalled();
  });
  it('fails closed rather than running archived matches with an unconfigured receipt lookup', async () => {
    const room = createMatchRoom('carrom', [makePlayer('a', 0), makePlayer('b', 1)]);
    room.match!.archivedThroughTurn = 65; framework.roomManager.registerRoom(room);
    await expect(framework.matchManager.applyAction({ roomId: room.id, playerId: 'a', action: { type: 'place-striker', x: 300, actionId: 'old' } })).rejects.toThrow('ARCHIVED_ACTION_LOOKUP_REQUIRED');
  });
});

describe('Bounded archive negative filter', () => {
  it('keeps a fixed size and never loses an archived action identity', async () => {
    const { addArchivedActions, mightContainArchivedAction } = await import('../src/utils/ArchivedActionFilter');
    const records = Array.from({ length: 10000 }, (_, i) => ({ playerId: `p${i % 2}`, action: { actionId: `id-${i}` } })) as any;
    const encoded = addArchivedActions(undefined, records)!;
    expect(Buffer.from(encoded, 'base64')).toHaveLength(8192);
    for (const record of records) expect(mightContainArchivedAction(encoded, record.playerId, record.action.actionId)).toBe(true);
  });
  it('never builds a suffix-only filter for a legacy pruned checkpoint', async () => {
    const { mightContainArchivedAction } = await import('../src/utils/ArchivedActionFilter');
    const records = Array.from({ length: 129 }, (_, i) => ({ turnNumber: i + 66, playerId: 'a', action: { actionId: `new-${i}` } })) as any;
    const plan = planHistoryRetention({ actionHistory: records, archivedThroughTurn: 65 });
    expect(plan.archivedActionFilter).toBeUndefined();
    expect(mightContainArchivedAction(plan.archivedActionFilter, 'a', 'old-id')).toBe(true);
  });
  it('requires an exact receipt for a possible match and avoids DB reads for proven-new IDs', async () => {
    const { addArchivedActions, mightContainArchivedAction } = await import('../src/utils/ArchivedActionFilter');
    const room = createMatchRoom('carrom', [makePlayer('a', 0), makePlayer('b', 1)]);
    room.match!.archivedThroughTurn = 1;
    room.match!.archivedActionFilter = addArchivedActions(undefined, [{ playerId: 'a', action: { actionId: 'possible' } }] as any);
    framework.roomManager.registerRoom(room);
    const lookup = vi.fn().mockResolvedValue(false); framework.config.hasArchivedAction = lookup;
    const apply = vi.spyOn(room.match!.engine as any, 'apply');
    expect((await framework.matchManager.applyAction({ roomId: room.id, playerId: 'a', action: { type: 'place-striker', x: 300, actionId: 'possible' } })).ok).toBe(true);
    expect(lookup).toHaveBeenCalledOnce(); expect(apply).toHaveBeenCalledOnce();
    expect(mightContainArchivedAction(room.match!.archivedActionFilter, 'a', 'new')).toBe(false);
    expect((await framework.matchManager.applyAction({ roomId: room.id, playerId: 'a', action: { type: 'place-striker', x: 300, actionId: 'new' } })).ok).toBe(true);
    expect(lookup).toHaveBeenCalledOnce(); expect(apply).toHaveBeenCalledTimes(2);
  });
  it('rejects malformed checkpoint filters', async () => {
    const { validateArchivedActionFilter } = await import('../src/utils/ArchivedActionFilter');
    expect(() => validateArchivedActionFilter('invalid')).toThrow('INVALID_ARCHIVED_ACTION_FILTER');
  });
});
