import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ matchId: 'match-1', winner: null as unknown }));
vi.mock('phaser', () => ({ default: { Scene: class {} } }));
vi.mock('../../store/multiplayerStore', () => ({ useMultiplayerStore: { getState: () => store } }));
import { FruitNinjaScene } from './phaser/scenes/FruitNinjaScene';

beforeEach(() => { store.matchId = 'match-1'; store.winner = null; });

describe('Fruit Ninja bomb and rematch state ordering', () => {
  function stoppedScene() {
    const scene = new FruitNinjaScene() as any;
    scene.gameOver = true;
    scene.activeMatchId = 'match-1';
    scene.mySeat = 0;
    scene.hud = { updateOpponentScore: vi.fn(), updateScore: vi.fn(), updateLives: vi.fn(), updateTimer: vi.fn() };
    scene.fruitManager = { syncAuthoritativeTargets: vi.fn() };
    scene.scoreManager = { applyAuthoritativePlayer: vi.fn() };
    scene.restartGameForRematch = vi.fn(() => { scene.gameOver = false; });
    return scene;
  }
  const playing = { finished: false, phase: "playing", targets: [], players: [{ seat: 0, score: 10, lives: 3 }, { seat: 1, score: 20, lives: 3 }] };

  it('stays stopped when an in-flight playing packet arrives after a bomb', () => {
    const scene = stoppedScene();
    scene.applyMultiplayerState(playing);
    expect(scene.gameOver).toBe(true);
    expect(scene.restartGameForRematch).not.toHaveBeenCalled();
    expect(scene.hud.updateOpponentScore).not.toHaveBeenCalled();
  });

  it('keeps the bomb result when the server confirms the end', () => {
    const scene = stoppedScene();
    scene.applyMultiplayerState({ ...playing, finished: true });
    expect(scene.gameOver).toBe(true);
    expect(scene.restartGameForRematch).not.toHaveBeenCalled();
  });

  it('restarts once when a different authoritative match arrives', () => {
    const scene = stoppedScene();
    store.matchId = 'match-2';
    scene.applyMultiplayerState(playing);
    scene.applyMultiplayerState(playing);
    expect(scene.restartGameForRematch).toHaveBeenCalledOnce();
    expect(scene.gameOver).toBe(false);
    expect(scene.activeMatchId).toBe('match-2');
  });
});
