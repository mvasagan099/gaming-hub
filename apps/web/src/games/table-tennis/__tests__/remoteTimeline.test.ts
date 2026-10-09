import { describe, expect, it, vi } from 'vitest';
import { TableTennisEngine } from '../../../../../../packages/game-engine/src/table-tennis/engine';
import { TableTennisTimeline } from '../remoteTimeline';
import type { TableTennisState } from '@gaming-hub/game-engine';

function snapshot(time: number, x: number): TableTennisState {
  const engine = new TableTennisEngine([{ userId: 'a', seat: 0 }, { userId: 'b', seat: 1 }], undefined, { now: () => time });
  engine.apply({ type: 'ready' }, 0); engine.apply({ type: 'ready' }, 1);
  engine.apply({ type: 'serve', angle: 0 }, engine.state.servingSeat);
  return { ...engine.state, ...engine.serialize(), ball: { ...engine.state.ball!, x, vx: 5, vy: 0 } } as TableTennisState;
}

describe('Table Tennis remote playback', () => {
  it('interpolates packets and bounds prediction during connection gaps', () => {
    const timeline = new TableTennisTimeline();
    timeline.receive(snapshot(1000, 100), 5000);
    timeline.receive(snapshot(1040, 112), 5040);
    expect(timeline.ball(5060)?.x).toBe(106);
    expect(timeline.ball(5070)?.x).toBe(109);
    expect(timeline.ball(5400)?.x).toBeCloseTo(142); // no runaway prediction on connection gaps
  });
  it('bridges late updates without rewinding the same shot', () => {
    const timeline = new TableTennisTimeline();
    timeline.receive(snapshot(1000, 100), 5000);
    expect(timeline.ball(5070)?.x).toBe(109);
    timeline.receive(snapshot(1040, 112), 5075);
    expect(timeline.ball(5075)?.x).toBe(110.5);
    expect(timeline.ball(5080)?.x).toBe(112);
  });
  it('does not predict a paddle bounce or ignore a confirmed hit', () => {
    const timeline = new TableTennisTimeline();
    timeline.receive(snapshot(1000, 550), 5000);
    expect(timeline.ball(5400)?.x).toBe(562);
    const hit = snapshot(1040, 561);
    hit.ball!.vx = -5;
    hit.ball!.touchCount = 1; hit.ball!.lastHitSeat = 1;
    timeline.receive(hit, 5040);
    expect(timeline.ball(5110)?.vx).toBe(-5);
    expect(timeline.ball(5110)!.x).toBeLessThan(561);
  });

  it.each([38, 562])('waits for the server at the exact paddle contact line %s', x => {
    const timeline = new TableTennisTimeline();
    const state = snapshot(1000, x); state.ball!.vx = x === 38 ? -5 : 5;
    timeline.receive(state, 5000);
    expect(timeline.ball(5400)?.x).toBe(x);
  });
  it('bridges 100 ms of jitter then holds without predicting a point or bounce', () => {
    const timeline = new TableTennisTimeline(); timeline.receive(snapshot(1000, 100), 5000);
    expect(timeline.ball(5120)?.x).toBeCloseTo(124);
    expect(timeline.ball(5140)?.x).toBeCloseTo(130);
    expect(timeline.ball(9000)?.x).toBeCloseTo(130);
    expect(timeline.ball(9000)?.touchCount).toBe(0);
  });
  it.each([{ y: 398, vy: 2 }, { y: 2, vy: -2 }])('keeps outgoing balls outside the board: %j', ({ y, vy }) => {
    const timeline = new TableTennisTimeline();
    const state = snapshot(1000, 100); state.ball!.y = y; state.ball!.vy = vy;
    timeline.receive(state, 5000);
    const ball = timeline.ball(5140)!;
    expect(ball.y).toBeCloseTo(y + vy * 6);
    expect(state.ball!.y).toBe(y);
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
    expect(timeline.ball(15000)?.x).toBe(100);
    expect(timeline.ball(15000)?.inPlay).toBe(true);
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

describe('Table Tennis bat contact alignment', () => {
  it('keeps the opponent paddle on the far baseline and matches its hit width', () => {
    const pose = TableTennis3DRenderer.farPaddlePose(200);
    const edge = TableTennis3DRenderer.project(600, 200, 0);
    expect(pose.y).toBeLessThan(edge.y);
    expect(TableTennis3DRenderer.paddleRadius(574, 200)).toBeCloseTo(
      (TableTennis3DRenderer.project(574, 240, 15).x - TableTennis3DRenderer.project(574, 200, 15).x) * 0.9);
    expect(TableTennis3DRenderer.paddleRadius(574, 200)).toBeGreaterThan(24);
    expect(TableTennis3DRenderer.paddleRadius(574, 200)).toBeLessThan(25);
  });
  it('draws the far bat upright with its handle below the blade', () => {
    const rotate = vi.fn(); const translate = vi.fn();
    const gradient = { addColorStop: vi.fn() };
    const ctx = new Proxy({ rotate, translate } as Record<string, unknown>, {
      get: (target, key: string) => target[key] ?? (key.startsWith('create') ? () => gradient : vi.fn()),
    }) as unknown as CanvasRenderingContext2D;
    (TableTennis3DRenderer as unknown as { drawFarPaddle: (ctx: CanvasRenderingContext2D, x: number, y: number, vy: number) => void })
      .drawFarPaddle(ctx, 600, 200, 0);
    const pose = TableTennis3DRenderer.farPaddlePose(200);
    expect(translate).toHaveBeenCalledWith(pose.x, pose.y);
    expect(rotate).toHaveBeenCalledWith(0);
  });
  it.each([false, true])('keeps the opponent handle visible and attached in portrait=%s', portrait => {
    const renderer = TableTennis3DRenderer as unknown as { isPortraitMode: boolean;
      drawFarPaddle: (ctx: CanvasRenderingContext2D, x: number, y: number, vy: number) => void };
    renderer.isPortraitMode = portrait;
    try {
      const roundRect = vi.fn(); const gradient = { addColorStop: vi.fn() };
      const ctx = new Proxy({ roundRect } as Record<string, unknown>, {
        get: (target, key: string) => target[key] ?? (key.startsWith('create') ? () => gradient : vi.fn()),
      }) as unknown as CanvasRenderingContext2D;
      renderer.drawFarPaddle(ctx, 600, 200, 0);
      const [, armY, , armHeight] = roundRect.mock.calls[0];
      const [, handleY, , handleHeight] = roundRect.mock.calls[1];
      const bladeEdge = TableTennis3DRenderer.paddleRadius(574, 200) * 1.15;
      expect(handleY).toBeLessThan(bladeEdge);
      expect(handleY + handleHeight - bladeEdge).toBeGreaterThan(10);
      expect(armY).toBeGreaterThan(bladeEdge);
      expect(armY).toBeLessThan(handleY + handleHeight);
      expect(armY + armHeight).toBeGreaterThan(handleY + handleHeight);
    } finally { renderer.isPortraitMode = false; }
  });
  it.each([38, 562])('brings the ball down to bat height at contact x=%s', x => {
    const z = TableTennis3DRenderer.calculateBallZ({ x, y: 200, vx: 5, vy: 0, inPlay: true });
    if (x === 38) expect(z).toBe(32);
    else expect(TableTennis3DRenderer.project(x, 200, z).y).toBeCloseTo(TableTennis3DRenderer.farPaddlePose(200).y);
  });
  it.each([false, true])('keeps the ball within the visible far bat at contact in portrait=%s', portrait => {
    const renderer = TableTennis3DRenderer as unknown as { isPortraitMode: boolean };
    renderer.isPortraitMode = portrait;
    try {
      for (const center of [40, 200, 360]) for (const offset of [-40, 40]) {
        const bat = TableTennis3DRenderer.farPaddlePose(center);
        expect(bat.y + TableTennis3DRenderer.paddleRadius(574, center) * 1.15 + 1.2)
          .toBeLessThan(TableTennis3DRenderer.project(600, center).y);
        const z = TableTennis3DRenderer.calculateBallZ({ x: 562, y: center + offset, vx: 5, vy: 0, inPlay: true });
        const ball = TableTennis3DRenderer.project(562, center + offset, z);
        const radius = TableTennis3DRenderer.paddleRadius(574, center);
        const ballRadius = Math.max(4, 6 * ball.scale);
        expect(((ball.x - bat.x) / (radius + ballRadius)) ** 2 +
          ((ball.y - bat.y) / (radius * 1.15 + ballRadius)) ** 2).toBeLessThan(1);
      }
    } finally { renderer.isPortraitMode = false; }
  });
  it('samples paddle and ball motion at the same playback time', () => {
    const timeline = new TableTennisTimeline();
    const a = snapshot(1000, 100); a.players[1].paddleY = 100;
    const b = snapshot(1040, 112); b.players[1].paddleY = 200;
    timeline.receive(a, 5000); timeline.receive(b, 5040);
    expect(timeline.ball(5060)?.x).toBe(106);
    expect(timeline.paddles(5060)[1]).toBe(150);
  });
  it.each([0, 1])('shows the ball reaching bat %s between snapshots before reversing', seat => {
    const timeline = new TableTennisTimeline();
    const a = snapshot(1000, seat === 0 ? 44 : 556);
    a.ball!.vx = seat === 0 ? -5 : 5;
    const b = snapshot(1040, seat === 0 ? 45 : 555);
    b.ball!.vx = -a.ball!.vx; b.ball!.touchCount = 1; b.ball!.lastHitSeat = seat;
    b.players[seat].paddleY = 180;
    timeline.receive(a, 5000); timeline.receive(b, 5040);
    expect(timeline.ball(5060)?.x).toBe(seat === 0 ? 38 : 562);
    expect(timeline.paddles(5060)[seat]).toBe(180);
    expect(Math.abs(timeline.ball(5070)!.x - (seat === 0 ? 38 : 562))).toBeGreaterThan(0);
    expect(timeline.ball(5070)!.vx).toBe(b.ball!.vx);
  });
});


describe('Table Tennis stale snapshot protection', () => {
  it('does not rewind paddles, pause state, or time on late packets', () => {
    const timeline = new TableTennisTimeline();
    const current = { ...snapshot(1040, 112), matchRemainingMs: 90000 };
    current.players[0].paddleY = 200;
    timeline.receive(current, 5040);
    const stale = { ...snapshot(1000, 100), paused: true, matchRemainingMs: 1000 };
    stale.players[0].paddleY = 40;
    timeline.receive(stale, 5050);
    expect(timeline.paddles(5100)[0]).toBe(200);
    expect(timeline.secondsRemaining(6040)).toBe(89);
    expect(timeline.ball(5100)!.x).toBeGreaterThan(112);
  });
  it('does not resurrect a previous rally after a newer serve snapshot cleared the buffer', () => {
    const timeline = new TableTennisTimeline();
    timeline.receive({ ...snapshot(1040, 112), ball: null, phase: 'serve' }, 5040);
    timeline.receive(snapshot(1000, 100), 5050);
    expect(timeline.ball(5100)).toBeNull();
  });
});
