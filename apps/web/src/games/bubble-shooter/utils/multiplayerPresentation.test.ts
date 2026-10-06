import { describe, expect, it } from 'vitest';
import { BubbleShooterEngine, traceBubbleShot } from '@gaming-hub/game-engine';
import { BUBBLE_SHOOTER_VISUAL_CONFIG } from '../constants/bubbleShooterVisualConfig';
import { BubbleMultiplayerPresentation, createBubbleFlight, advanceBubbleFlight, bubbleShotEffects } from './multiplayerPresentation';

const players = [{ userId: 'white-user', seat: 0 }, { userId: 'black-user', seat: 1 }];
const angle = -Math.PI / 2;
function setup(seat = 0) {
  const engine = new BubbleShooterEngine(players);
  const view = new BubbleMultiplayerPresentation();
  view.receive(structuredClone(engine.state), seat);
  return { engine, view };
}

describe('Bubble Shooter multiplayer presentation', () => {
  it.each([0, 1])('loads and fires the authoritative bubble for seat %s', seat => {
    const { engine, view } = setup(seat);
    engine.state.players[seat].nextBubble = { color: '#34d399', type: 'bomb' };
    view.receive(structuredClone(engine.state), seat);
    expect(view.beginShot()!.bubble).toEqual(engine.state.players[seat].nextBubble);
    expect(view.beginShot()).toBeNull();
  });

  it('does not erase flight or unlock a shot when the opponent shoots', () => {
    const { engine, view } = setup();
    view.beginShot();
    engine.apply({ type: 'shoot', angle }, 1);
    expect(view.receive(structuredClone(engine.state), 0)).toBeNull();
    expect(view.finishFlight()).toBeNull();
    expect(view.busy).toBe(true);
    engine.apply({ type: 'shoot', angle }, 0);
    expect(view.receive(structuredClone(engine.state), 0)!.players[0]).toEqual(engine.state.players[0]);
    expect(view.busy).toBe(false);
  });

  it('buffers a fast response until the cosmetic flight lands', () => {
    const { engine, view } = setup();
    view.beginShot();
    engine.apply({ type: 'shoot', angle }, 0);
    expect(view.receive(structuredClone(engine.state), 0)).toBeNull();
    expect(view.busy).toBe(true);
    expect(view.finishFlight()!.players[0].lastShot!.sequence).toBe(1);
    expect(view.busy).toBe(false);
  });

  it('uses the latest authoritative snapshot if opponent updates arrive during a flight', () => {
    const { engine, view } = setup();
    view.beginShot();
    engine.apply({ type: 'shoot', angle }, 0);
    view.receive(structuredClone(engine.state), 0);
    engine.apply({ type: 'shoot', angle }, 1);
    view.receive(structuredClone(engine.state), 0);
    expect(view.finishFlight()).toEqual(engine.state);
  });

  it('restores the server board after rejection and ignores an old acknowledgement', () => {
    const { engine, view } = setup();
    const first = view.beginShot()!;
    expect(view.cancel(first.token)).toEqual(engine.state);
    const second = view.beginShot()!;
    expect(view.cancel(first.token)).toBeNull();
    expect(view.isPending(second.token)).toBe(true);
  });

  it('restores cannon and grid on reconnect without applying a move again', () => {
    const { engine } = setup();
    engine.apply({ type: 'shoot', angle }, 0);
    const restored = new BubbleMultiplayerPresentation();
    const before = structuredClone(engine.state);
    expect(restored.receive(before, 0)).toEqual(before);
    expect(restored.beginShot()!.bubble).toEqual(before.players[0].nextBubble);
    expect(engine.state).toEqual(before);
  });

  it('ignores duplicate state packets while flight is pending and never resubmits a shot', () => {
    const { engine, view } = setup();
    view.beginShot();
    engine.apply({ type: 'shoot', angle }, 0);
    const snapshot = structuredClone(engine.state);
    expect(view.receive(snapshot, 0)).toBeNull();
    expect(view.receive(snapshot, 0)).toBeNull();
    view.finishFlight();
    expect(view.receive(snapshot, 0)).toEqual(snapshot);
    expect(engine.state.turnCount).toBe(1);
  });

  it('never permits shooting when paused, eliminated, or finished', () => {
    const { engine, view } = setup();
    for (const change of [{ paused: true }, { finished: true }]) {
      view.receive({ ...engine.state, ...change }, 0);
      expect(view.beginShot()).toBeNull();
    }
    engine.state.players[0].status = 'eliminated';
    view.receive(engine.state, 0);
    expect(view.beginShot()).toBeNull();
  });

  it('separates pop particles from falling detached bubbles using the authoritative result', () => {
    const { engine } = setup();
    const player = engine.state.players[0];
    const previous = [
      { row: 0, col: 4, color: '#fb7185', type: 'normal' as const },
      { row: 0, col: 5, color: '#fb7185', type: 'normal' as const },
      { row: 1, col: 4, color: '#fb7185', type: 'normal' as const },
      { row: 2, col: 4, color: '#818cf8', type: 'normal' as const },
      { row: 0, col: 11, color: '#34d399', type: 'normal' as const },
    ];
    player.grid = [previous[4]!];
    player.lastShot = { sequence: 1, row: 1, col: 5, angle, color: '#fb7185', type: 'normal', result: 'pop', matchedCount: 4, droppedCount: 1, points: 70 };
    const before = structuredClone(player);
    const effects = bubbleShotEffects(previous, player);
    expect(effects.popped).toHaveLength(4);
    expect(effects.dropped).toEqual([previous[3]]);
    expect(player).toEqual(before);
  });

  it.each([-Math.PI / 2, -Math.PI / 6, -Math.PI * 5 / 6])('animates the same authoritative bounce path for angle %s', aim => {
    const { engine } = setup();
    const me = engine.state.players[0];
    const flight = createBubbleFlight(me, aim, me.nextBubble);
    const expected = traceBubbleShot(me.grid, me.topOffset, aim);
    for (let i = 0; i < 500 && !advanceBubbleFlight(flight, 1 / 60); i++) { /* presentation only */ }
    expect(flight.x).toBeCloseTo(expected.x);
    expect(flight.y).toBeCloseTo(expected.y);
    expect(BUBBLE_SHOOTER_VISUAL_CONFIG.canvasWidth).toBe(384);
    expect(engine.state.turnCount).toBe(0);
  });
});
