import { describe, expect, it } from 'vitest';
import { ReplayBuffer, replayBlend, type ReplayFrame } from './replayBuffer';

const frame = (time: number): ReplayFrame => ({ time, poses: [], ballX: 462, ballDepth: time * 100, ballHeight: 20, bails: [] });

describe('visual replay history', () => {
  it('bounds memory over a long innings', () => {
    const buffer = new ReplayBuffer(60);
    for (let i = 0; i < 10000; i++) buffer.push(frame(i / 30));
    expect(buffer.clip(1000)).toHaveLength(60);
    expect(buffer.clip(1000)[0].time).toBe(9940 / 30);
  });
  it('keeps an already captured clip when a new delivery clears live history', () => {
    const buffer = new ReplayBuffer();
    buffer.push(frame(0)); buffer.push(frame(0.5)); buffer.push(frame(1));
    const clip = buffer.clip();
    buffer.clear(); buffer.push(frame(2));
    expect(clip.map(item => item.time)).toEqual([0, 0.5, 1]);
    expect(buffer.clip().map(item => item.time)).toEqual([2]);
  });
  it('interpolates recorded motion at half-speed without changing recorded data', () => {
    const frames = [frame(0), frame(0.1), frame(0.2)];
    const before = JSON.stringify(frames);
    const blend = replayBlend(frames, 0.15)!;
    expect(blend.from.time).toBe(0.1);
    expect(blend.to.time).toBe(0.2);
    expect(blend.mix).toBeCloseTo(0.5);
    expect(JSON.stringify(frames)).toBe(before);
    expect(replayBlend([], 0)).toBeNull();
    expect(replayBlend(frames, -1)?.mix).toBe(0);
    expect(replayBlend(frames, 2)?.mix).toBe(1);
  });
});
