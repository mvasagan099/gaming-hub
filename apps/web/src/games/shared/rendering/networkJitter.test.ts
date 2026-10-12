import { describe, expect, it } from 'vitest';
import type { SnakeVsWormsState, TableTennisState } from '@gaming-hub/game-engine';
import { SnakeWormTimeline } from '../../snake-vs-worms/remoteTimeline';
import { TableTennisTimeline } from '../../table-tennis/remoteTimeline';

// Same legal straight movement, delivered with repeatable packet jitter.
function replay(game: 'snake' | 'tennis', delays: number[]) {
  const snake = new SnakeWormTimeline(), tennis = new TableTennisTimeline();
  const packets = Array.from({ length: 80 }, (_, i) => ({ time: 1000 + i * 50,
    arrival: 5000 + i * 50 + delays[i % delays.length], x: 100 + i * 5 })).sort((a, b) => a.arrival - b.arrival);
  let index = 0, previous: number | undefined;
  const steps: number[] = [];
  for (let now = 5000; now < 9000; now += 1000 / 60) {
    while (index < packets.length && packets[index].arrival <= now) {
      const p = packets[index++];
      if (game === 'snake') snake.receive({ gameId: 'snake-vs-worms', serverTimestamp: p.time, stateVersion: p.time,
        gridWidth: 2000, gridHeight: 2000, paused: false, finished: false,
        players: [{ seat: 0, status: 'active', direction: 'right', speed: 5, body: [{ x: p.x, y: 100 }] }],
      } as SnakeVsWormsState, p.arrival);
      else tennis.receive({ serverTimestamp: p.time, matchRemainingMs: 100000, paused: false, finished: false,
        players: [{ paddleY: p.x }, { paddleY: 160 }],
        ball: { x: p.x, y: 100, vx: 100 / 60, vy: 0, touchCount: 0, lastHitSeat: 0, inPlay: true },
      } as unknown as TableTennisState, p.arrival);
    }
    const position = game === 'snake' ? snake.bodies(now).get(0)?.[0]?.x : tennis.paddles(now)[0];
    if (previous !== undefined && position !== undefined) steps.push(position - previous);
    previous = position;
  }
  const sorted = steps.map(Math.abs).sort((a, b) => a - b);
  return { p95: sorted[Math.floor(sorted.length * 0.95)], held: steps.filter(step => Math.abs(step) < 0.01).length,
    backwards: steps.filter(step => step < -0.01).length };
}

describe('opponent motion under uneven snapshot delivery', () => {
  it('does not add the opponent buffer to the local authoritative snake trail', () => {
    const timeline = new SnakeWormTimeline();
    for (let i = 0; i <= 10; i++) {
      const x = 100 + i * 5;
      timeline.receive({ gameId: 'snake-vs-worms', serverTimestamp: 1000 + i * 50, stateVersion: i + 1,
        gridWidth: 2000, gridHeight: 2000, paused: false, finished: false,
        players: [0, 1].map(seat => ({ seat, status: 'active', direction: 'right', speed: 5, body: [{ x, y: 100 }] })),
      } as SnakeVsWormsState, 5000 + i * 50 + (i % 2 ? 65 : 0));
      timeline.bodies(5000 + i * 50 + 65, 0);
    }
    const bodies = timeline.bodies(5565, 0);
    expect(bodies.get(0)![0].x).toBeCloseTo(150.5);
    expect(bodies.get(1)![0].x).toBeLessThan(bodies.get(0)![0].x);
  });
  it('interpolates opponent paddles instead of repeatedly holding and jumping', () => {
    const result = replay('tennis', [0, 0, 65, 45, 25, 5, 0, 0, 80, 60, 40, 20, 0, 0, 0, 70, 50, 30, 10, 0]);
    expect(result.p95).toBeLessThan(3); expect(result.held).toBeLessThan(20); expect(result.backwards).toBe(0);
  });
  it('smooths recurring large delivery gaps without unbounded snake prediction', () => {
    const result = replay('snake', [0, 0, 180, 160, 140, 120, 100, 80, 60, 40, 20, 0, 0, 0, 0, 180, 160, 140, 120, 100]);
    expect(result.p95).toBeLessThan(3); expect(result.held).toBeLessThan(15); expect(result.backwards).toBe(0);
  });
});
