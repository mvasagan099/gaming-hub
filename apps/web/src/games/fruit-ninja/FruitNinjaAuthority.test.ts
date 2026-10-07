import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FruitNinjaState } from '@gaming-hub/game-engine';
const store = vi.hoisted(() => ({ matchId: 'match-1', winner: null as unknown, sendGameAction: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock('phaser', () => ({ default: { Scene: class {} } }));
vi.mock('../../store/multiplayerStore', () => ({ useMultiplayerStore: { getState: () => store, subscribe: vi.fn(() => vi.fn()) } }));
import Driver from './phaser/managers/FruitNinjaMultiplayerDriver';
import FruitManager from './phaser/managers/FruitManager';
import SliceManager from './phaser/managers/SliceManager';
import { FruitNinjaScene } from './phaser/scenes/FruitNinjaScene';

const snapshot = (fields: Record<string, unknown> = {}) => ({ phase: 'playing', finished: false, serverTimeMs: Date.now(), targets: [], players: [], ...fields }) as unknown as FruitNinjaState;
beforeEach(() => { vi.restoreAllMocks(); store.matchId = 'match-1'; store.winner = null; store.sendGameAction.mockClear(); });

describe('Fruit Ninja multiplayer server authority', () => {
  it('sends only blade intent, uses the server clock, throttles movement and preserves begin/end', () => {
    let now = 10000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const driver = new Driver(0, []);
    driver.applyState(snapshot({ serverTimeMs: 15000 }), null);
    driver.sendSlice('slice-begin', 10, 20);
    now += 40; driver.sendSlice('slice-move', 30, 40);
    now += 1; driver.sendSlice('slice-move', 31, 41);
    driver.sendSlice('slice-end', 30, 40);
    expect(store.sendGameAction.mock.calls.map(([action]) => action.type)).toEqual(['slice-begin', 'slice-move', 'slice-end']);
    expect(store.sendGameAction.mock.calls[0][0]).toMatchObject({ x: 10, y: 20, time: 15000, actionId: expect.any(String) });
    expect(store.sendGameAction.mock.calls.every(([action]) => action.points === undefined && action.winner === undefined)).toBe(true);
  });

  it('blocks spectator, stopped, countdown and old-match input; completes each match once', () => {
    const spectator = new Driver(null, []);
    spectator.applyState(snapshot(), null); spectator.sendSlice('slice-begin', 1, 1);
    const driver = new Driver(0, []), over = vi.fn(); driver.setOnGameOver(over);
    driver.applyState(snapshot({ phase: 'countdown' }), null); driver.sendSlice('slice-begin', 1, 1);
    driver.applyState(snapshot(), null); store.matchId = 'match-2'; driver.sendSlice('slice-begin', 1, 1);
    driver.applyState(snapshot({ finished: true, phase: 'finished' }), null);
    driver.applyState(snapshot({ finished: true, phase: 'finished' }), null);
    expect(over).toHaveBeenCalledOnce();
    driver.stop(); driver.sendSlice('slice-end', 1, 1);
    expect(store.sendGameAction).not.toHaveBeenCalled();
  });

  it('draws a blade locally without splitting or scoring unconfirmed targets', () => {
    const fruit = { getActiveFruitsList: vi.fn() };
    const manager = new SliceManager({ time: { now: 1 } } as any, fruit as any);
    const send = vi.fn(); manager.setAuthoritativeInput(send);
    manager.startSlicePoint(100, 200); manager.addSlicePoint(200, 200); manager.endSlicePoint();
    expect(send.mock.calls).toEqual([['slice-begin', 100, 200], ['slice-move', 200, 200], ['slice-end', 200, 200]]);
    expect(fruit.getActiveFruitsList).not.toHaveBeenCalled();
  });

  it('renders canonical targets and removes misses without a client life-loss event', () => {
    const sprite = { body: { enable: true }, setDepth: vi.fn(), setDisplaySize: vi.fn(), setPosition: vi.fn(), setAngle: vi.fn(), destroy: vi.fn() };
    const scene = { scale: { width: 1600, height: 1000 }, time: { now: 0 }, events: { emit: vi.fn() } };
    const manager = new FruitManager(scene as any, {} as any, 'classic') as any;
    manager.fruitsGroup = { create: vi.fn(() => sprite) };
    const target = { id: 4, type: 'apple', x: 123, y: 234, rotation: 30, slicedBy: [], missedBy: [] };
    manager.syncAuthoritativeTargets(snapshot({ targets: [target] }), 0);
    expect(sprite.setPosition).toHaveBeenCalledWith(246, 468);
    expect(sprite.body.enable).toBe(false);
    manager.syncAuthoritativeTargets(snapshot({ targets: [{ ...target, missedBy: [0] }] }), 0);
    expect(sprite.destroy).toHaveBeenCalledOnce();
    expect(scene.events.emit).not.toHaveBeenCalled();
  });

  it('uses canonical score, lives, targets and remaining time in the scene', () => {
    const scene = new FruitNinjaScene() as any;
    scene.activeMatchId = 'match-1'; scene.mySeat = 1;
    scene.fruitManager = { syncAuthoritativeTargets: vi.fn() };
    scene.scoreManager = { applyAuthoritativePlayer: vi.fn() };
    scene.hud = { updateScore: vi.fn(), updateOpponentScore: vi.fn(), updateLives: vi.fn(), updateTimer: vi.fn() };
    const state = snapshot({ matchRemainingMs: 42100, players: [{ seat: 0, score: 10, lives: 3 }, { seat: 1, score: 30, lives: 2 }] });
    scene.applyMultiplayerState(state);
    expect(scene.scoreManager.applyAuthoritativePlayer).toHaveBeenCalledWith(state.players[1]);
    expect(scene.hud.updateScore).toHaveBeenCalledWith(30);
    expect(scene.hud.updateOpponentScore).toHaveBeenCalledWith(10);
    expect(scene.hud.updateLives).toHaveBeenCalledWith(2);
    expect(scene.hud.updateTimer).toHaveBeenCalledWith(43);
    expect(scene.fruitManager.syncAuthoritativeTargets).toHaveBeenCalledWith(state, 1);
  });
});
