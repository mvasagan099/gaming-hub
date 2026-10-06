import { describe, expect, it } from 'vitest';
import { TableTennisEngine } from '../../../../../../packages/game-engine/src/table-tennis/engine';
import { TableTennisTimeline } from '../remoteTimeline';
import type { TableTennisState } from '@gaming-hub/game-engine';

function snapshot(time: number, x: number): TableTennisState {
  const engine = new TableTennisEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }], undefined, { now: () => time });
  engine.apply({ type: 'serve', angle: 0 }, engine.state.servingSeat);
  return { ...engine.state, ...engine.serialize(), ball: { ...engine.state.ball!, x } } as TableTennisState;
}

describe('Table Tennis remote playback', () => {
  it('smoothly interpolates packets without advancing or rewinding prediction', () => {
    const timeline = new TableTennisTimeline();
    timeline.receive(snapshot(1000, 100), 5000);
    timeline.receive(snapshot(1040, 112), 5040);
    expect(timeline.ball(5100)?.x).toBe(106);
    expect(timeline.ball(5110)?.x).toBe(109);
    expect(timeline.ball(5400)?.x).toBe(112); // no runaway prediction on connection gaps
  });
  it('keeps playback moving forward when packet arrival times vary', () => {
    const timeline = new TableTennisTimeline();
    timeline.receive(snapshot(1000, 100), 5000);
    timeline.receive(snapshot(1040, 112), 5070);
    expect(timeline.ball(5100)?.x).toBe(106);
    timeline.receive(snapshot(1080, 124), 5105);
    expect(timeline.ball(5110)?.x).toBe(109);
    expect(timeline.ball(5140)?.x).toBe(118);
  });
  it('clears a finished rally immediately so the previous ball cannot keep moving', () => {
    const timeline = new TableTennisTimeline();
    timeline.receive(snapshot(1000, 100), 5000);
    timeline.receive({ ...snapshot(1040, 112), ball: null, phase: 'serve' }, 5040);
    expect(timeline.ball(5100)).toBeNull();
  });
  it('counts down configured server remaining time regardless of the device clock', () => {
    const timeline = new TableTennisTimeline();
    timeline.receive({ ...snapshot(1000, 100), matchRemainingMs: 599500 }, 5000);
    expect(timeline.secondsRemaining(5000)).toBe(600);
    expect(timeline.secondsRemaining(6000)).toBe(599);
    expect(timeline.secondsRemaining(605000)).toBe(0);
  });
  it('holds the clock while paused', () => {
    const timeline = new TableTennisTimeline();
    timeline.receive({ ...snapshot(1000, 100), paused: true, matchRemainingMs: 90000 }, 5000);
    expect(timeline.secondsRemaining(15000)).toBe(90);
    expect(timeline.ball(15000)).toBeNull();
  });
});

import { TableTennis3DRenderer } from '../utils/tableTennis3DRenderer';
import { TABLE_TENNIS_VISUAL_CONFIG } from '../constants/tableTennisVisualConfig';

describe('Table Tennis ball geometry', () => {
  it('clears the net continuously from both directions', () => {
    for (const x of [290, 299, 300, 301, 310]) {
      for (const vx of [-5, 5]) {
        const z = TableTennis3DRenderer.calculateBallZ({ x, y: 200, vx, vy: 0, inPlay: true });
        expect(z - TABLE_TENNIS_VISUAL_CONFIG.ballRadius * 1.35).toBeGreaterThan(TABLE_TENNIS_VISUAL_CONFIG.net.height);
      }
    }
  });
  it('projects out-of-board positions outside the table rather than clamping them back', () => {
    expect(TableTennis3DRenderer.project(300, -20).x).toBeLessThan(TableTennis3DRenderer.project(300, 0).x);
    expect(TableTennis3DRenderer.project(300, 420).x).toBeGreaterThan(TableTennis3DRenderer.project(300, 400).x);
    expect(TableTennis3DRenderer.project(-20, 200).tableY).toBeGreaterThan(TableTennis3DRenderer.project(0, 200).tableY);
  });
});
