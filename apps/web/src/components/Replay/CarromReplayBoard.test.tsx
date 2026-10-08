import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplayEventRecord } from '@gaming-hub/shared';
const fixture = vi.hoisted(() => ({ ref: { current: null as any }, effect: null as any, tick: null as any, stop: vi.fn(), draw: vi.fn() }));
vi.mock('react', () => ({
  useRef(initial: any) { if (initial === null) return fixture.ref; return playback; },
  useEffect(effect: any) { fixture.effect = effect; },
}));
let playback: any;
vi.mock('../../games/carrom/rendering/CarromBoardRenderer', () => ({ CarromBoardRenderer: { drawBoard: vi.fn() } }));
vi.mock('../../games/carrom/rendering/CarromPieceRenderer', () => ({ CarromPieceRenderer: { drawCoin: fixture.draw } }));
vi.mock('../../games/shared/hooks/animationLoop', () => ({ startAnimationLoop: (callback: any) => { fixture.tick = callback; return fixture.stop; } }));
import { CarromReplayBoard } from './CarromReplayBoard';

beforeEach(() => {
  vi.clearAllMocks();
  playback = { current: { event: undefined, elapsed: 0, started: false } };
  fixture.ref.current = { getContext: () => ({ clearRect: vi.fn() }) };
});
const event = { resultData: { events: [{ type: 'shot-trajectory', keyframes: [
  { frame: 0, pieces: [{ id: 'white-1', x: 100, y: 100 }] },
  { frame: 60, pieces: [{ id: 'white-1', x: 160, y: 100 }] },
] }] } } as unknown as ReplayEventRecord;
const state = { coins: [{ id: 'white-1', type: 'white', x: 160, y: 100 }] };
function mount(isPlaying: boolean, speed = 1, selected = event) {
  CarromReplayBoard({ event: selected, fallbackState: state, isPlaying, speed });
  return fixture.effect();
}
const x = () => fixture.draw.mock.calls.at(-1)![1].x;
describe('recorded Carrom playback', () => {
  it('interpolates, pauses, resumes and changes speed without rewinding the shot', () => {
    const cleanup = mount(true); fixture.tick(0.5); expect(x()).toBe(130);
    cleanup(); mount(false); expect(x()).toBe(130);
    mount(true); fixture.tick(0.25); expect(x()).toBe(145);
    mount(true, 2); fixture.tick(0.125); expect(x()).toBe(160);
    expect(fixture.stop).toHaveBeenCalled();
  });
  it('draws a settled board when seeking and cleans up on close', () => {
    mount(false); expect(x()).toBe(160);
    const cleanup = mount(true); fixture.tick(0.5); expect(x()).toBe(130);
    cleanup();
    const next = { ...event, sequence: 2 };
    mount(false, 1, next); expect(x()).toBe(160);
    expect(fixture.stop).toHaveBeenCalledOnce();
  });
});
