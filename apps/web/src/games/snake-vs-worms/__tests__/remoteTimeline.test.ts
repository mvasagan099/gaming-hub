import { describe, it, expect } from 'vitest';
import type { SnakeVsWormsState } from '@gaming-hub/game-engine';
import { SnakeWormTimeline } from '../remoteTimeline';
const state = (time: number, x: number, version = time) => ({ serverTimestamp: time, stateVersion: version,
  players: [{ seat: 0, status: 'active', body: [{ x, y: 100 }] }], paused: false, finished: false } as SnakeVsWormsState);
describe('Snake timestamped presentation', () => {
  it('interpolates chronological samples despite irregular delivery without mutating them', () => {
    const timeline = new SnakeWormTimeline(); const a = state(1000, 0), b = state(1050, 10);
    timeline.receive(a, 5000); timeline.receive(b, 5060);
    expect(timeline.bodies(5085).get(0)?.[0].x).toBe(5);
    expect(a.players[0].body[0].x).toBe(0);
    expect(b.players[0].body[0].x).toBe(10);
  });
  it('replaces same-timestamp updates without discarding the preceding playback history', () => {
    const timeline = new SnakeWormTimeline(); timeline.receive(state(1000, 0, 1), 5000);
    timeline.receive(state(1050, 10, 2), 5050); timeline.receive(state(1050, 12, 3), 5051);
    expect(timeline.bodies(5085).get(0)?.[0].x).toBe(6);
  });
  it('ignores replayed/stale versions and bounds prediction on long network gaps', () => {
    const timeline = new SnakeWormTimeline(); timeline.receive(state(1000, 0), 5000);
    timeline.receive(state(1050, 10), 5050); timeline.receive(state(1020, -100), 5100);
    expect(timeline.bodies(9000).get(0)?.[0].x).toBe(30);
  });
  it('resets on recovery, pause, death and teleport rather than blending old positions', () => {
    const timeline = new SnakeWormTimeline(); timeline.receive(state(1000, 0), 5000);
    timeline.receive(state(1050, 600), 5050);
    expect(timeline.bodies(5085).get(0)?.[0].x).toBe(600);
    timeline.receive({ ...state(1100, 620), paused: true }, 5100);
    expect(timeline.bodies(5100).get(0)?.[0].x).toBe(620);
    timeline.receive(state(50, 20, 1), 5200, true);
    expect(timeline.bodies(5200).get(0)?.[0].x).toBe(20);
    const dead = state(100, 30, 2); dead.players[0].status = 'eliminated';
    timeline.receive(dead, 5250);
    expect(timeline.bodies(5250).get(0)?.[0].x).toBe(30);
  });
  it('continues motion between packets and freezes after 100 ms of prediction', () => {
    const timeline = new SnakeWormTimeline();
    timeline.receive(state(1000, 0), 5000); timeline.receive(state(1050, 10), 5050);
    expect(timeline.bodies(5135).get(0)?.[0].x).toBe(15);
    expect(timeline.bodies(5160).get(0)?.[0].x).toBe(20);
    expect(timeline.bodies(9000).get(0)?.[0].x).toBe(30);
  });
  it('moves the body along its existing bends without mutating authoritative state', () => {
    const timeline = new SnakeWormTimeline();
    const a = state(1000, 20), b = state(1050, 30);
    a.players[0].body = [{ x:20,y:100 },{ x:10,y:100 },{ x:10,y:110 },{ x:10,y:120 }];
    b.players[0].body = [{ x:30,y:100 },{ x:20,y:100 },{ x:10,y:100 },{ x:10,y:110 }];
    timeline.receive(a, 5000); timeline.receive(b, 5050);
    expect(timeline.bodies(5160).get(0)).toEqual([{ x:40,y:100 },{ x:30,y:100 },{ x:20,y:100 },{ x:10,y:100 }]);
    expect(b.players[0].body[0].x).toBe(30);
  });
  it('holds the authoritative position across turns and clamps prediction to the arena', () => {
    const timeline = new SnakeWormTimeline();
    const a = state(1000, 90), b = state(1050, 100);
    a.players[0].direction = 'right'; b.players[0].direction = 'down';
    timeline.receive(a, 5000); timeline.receive(b, 5050);
    expect(timeline.bodies(9000).get(0)?.[0].x).toBe(100);
    const c = { ...state(1100, 110), gridWidth: 115, gridHeight: 200 };
    c.players[0].direction = 'down'; timeline.receive(c, 5100);
    expect(timeline.bodies(9000).get(0)?.[0].x).toBe(115);
  });

});
