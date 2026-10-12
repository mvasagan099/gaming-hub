import { describe, expect, it } from 'vitest';
import { NetworkPlaybackClock } from './NetworkPlaybackClock';

describe('bounded network playback clock', () => {
  it('keeps the normal buffer on a stable link', () => {
    const clock = new NetworkPlaybackClock(40);
    clock.observe(1000, 5000); clock.observe(1033, 5033);
    expect(clock.target(5050)).toBe(1010);
    expect(clock.target(5066)).toBe(1026);
  });
  it('absorbs jitter gradually without reversing time or exceeding the delay cap', () => {
    const clock = new NetworkPlaybackClock(40);
    clock.observe(1000, 5000);
    let previous = clock.target(5000);
    for (let i = 1; i <= 80; i++) {
      const now = 5000 + i * 50;
      clock.observe(1000 + i * 50, now + (i % 2 ? 300 : 0));
      const target = clock.target(now + 300);
      expect(target).toBeGreaterThanOrEqual(previous);
      expect(now + 300 - 4000 - target).toBeGreaterThanOrEqual(40);
      expect(now + 300 - 4000 - target).toBeLessThanOrEqual(150);
      previous = target;
    }
  });
  it('does not move playback twice when ball and paddles render in the same frame', () => {
    const clock = new NetworkPlaybackClock(40);
    clock.observe(1000, 5000); clock.target(5000);
    clock.observe(1050, 5200);
    expect(clock.target(5200)).toBe(clock.target(5200));
  });
  it('resets old network timing on recovery', () => {
    const clock = new NetworkPlaybackClock(60);
    clock.observe(1000, 5000); clock.target(5000);
    clock.reset(); clock.observe(9000, 1000);
    expect(clock.target(1020)).toBe(8960);
  });
});
