import { describe, expect, it } from 'vitest';
import { replayStepDuration, summarizeReplayData } from './replayPresentation';
import type { ReplayEventRecord } from '@gaming-hub/shared';

describe('bounded replay presentation', () => {
  it('limits work before serialization of a long physics shot', () => {
    const frame = { pieces: Array.from({ length: 20 }, () => ({ x: 12, y: 20 })) };
    const keyframes = Array(100000).fill(frame);
    Object.defineProperty(keyframes, 6, { get() { throw new Error('Unbounded traversal'); } });
    const text = JSON.stringify(summarizeReplayData({ result: { keyframes } }));
    expect(text.length).toBeLessThan(3000);
    expect(text).toContain('100000');
  });

  it('uses recorded shot duration so playback does not cut off long shots', () => {
    const event = { resultData: { events: [{ type: 'shot-trajectory', keyframes: [{ frame: 0 }, { frame: 180 }] }] } } as unknown as ReplayEventRecord;
    expect(replayStepDuration(event)).toBe(3000);
    expect(replayStepDuration()).toBe(1000);
  });
});
