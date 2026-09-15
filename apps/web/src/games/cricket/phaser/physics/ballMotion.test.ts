import { describe, expect, it } from 'vitest';
import { planeCrossing, shotDrag, simulationSteps, contactDistance, shotBufferDelay, predictShot } from './ballMotion';

describe('cricket motion', () => {
  it('preserves elapsed time with bounded steps at common refresh rates', () => {
    for (const fps of [30, 60, 90, 120, 144]) {
      const { steps, dt } = simulationSteps(1000 / fps);
      expect(steps * dt).toBeCloseTo(1 / fps, 12);
      expect(dt).toBeLessThanOrEqual(1 / 240);
    }
  });

  it('bounds catch-up and rejects invalid frame times', () => {
    expect(simulationSteps(5000)).toEqual({ steps: 24, dt: 1 / 240 });
    for (const value of [0, -10, NaN, Infinity]) {
      expect(simulationSteps(value)).toEqual({ steps: 0, dt: 0 });
    }
  });

  it('has the same final ball speed at 30, 60, 120 and 144 Hz', () => {
    for (const height of [0, 50]) {
      const speeds = [30, 60, 120, 144].map(fps => {
        let velocity = 1200;
        for (let frame = 0; frame < fps; frame++) velocity *= shotDrag(height, 1 / fps);
        return velocity;
      });
      for (const speed of speeds) expect(speed).toBeCloseTo(speeds[0], 9);
    }
    expect(shotDrag(0, 1 / 60)).toBeCloseTo(Math.pow(0.3, 1 / 60) * 0.985, 12);
  });

  it('detects fast stump crossings in either direction without phantom hits', () => {
    expect(planeCrossing(640, 690, 665)).toBe(0.5);
    expect(planeCrossing(230, 170, 200)).toBe(0.5);
    expect(planeCrossing(640, 650, 665)).toBeNull();
    expect(planeCrossing(670, 680, 665)).toBeNull();
    expect(planeCrossing(665, 665, 665)).toBeNull();
  });

  it('labels early and late consistently from either batting end', () => {
    expect(contactDistance(500, 575, 700)).toBe(75);
    expect(contactDistance(290, 215, -700)).toBe(75);
    expect(contactDistance(600, 575, 700)).toBe(-25);
    expect(contactDistance(190, 215, -700)).toBe(-25);
  });

  it('buffers only just before outer contact, without promoting in-window or late taps', () => {
    expect(shotBufferDelay(170, 600)).toBeCloseTo(0.05);
    expect(shotBufferDelay(177, 600)).toBeNull();
    for (const distance of [140, 90, 35, 0, -50]) {
      expect(shotBufferDelay(distance, 600)).toBeNull();
    }
    expect(shotBufferDelay(170, 0)).toBeNull();
  });

  it('predicts a slowing ground ball and mirrors the intercept across orientations', () => {
    const forward = predictShot(462, 400, 0, 100, 500, 0, 0.4);
    const reverse = predictShot(462, 400, 0, -100, -500, 0, 0.4);
    expect(forward.x).toBeGreaterThan(462);
    expect(forward.x).toBeLessThan(502);
    expect(forward.depth).toBeGreaterThan(400);
    expect(forward.depth).toBeLessThan(600);
    expect(forward.x + reverse.x).toBeCloseTo(924);
    expect(forward.depth + reverse.depth).toBeCloseTo(800);
    expect(predictShot(462, 400, 0, 0, 0, 0, 0.4)).toEqual({ x: 462, depth: 400 });
    expect(predictShot(462, 400, 0, 100, 500, 0, 0)).toEqual({ x: 462, depth: 400 });
  });
});
