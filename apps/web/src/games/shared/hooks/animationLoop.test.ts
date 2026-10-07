import { afterEach, expect, it, vi } from 'vitest';
import { startAnimationLoop } from './animationLoop';
afterEach(() => vi.unstubAllGlobals());
it('runs one frame loop, freezes hidden tabs and resumes without a time jump', () => {
  const frames = new Map<number, FrameRequestCallback>(); let next = 0; let visibility!: () => void;
  const doc = { hidden: false, addEventListener: (_: string, cb: () => void) => { visibility = cb; }, removeEventListener: vi.fn() };
  vi.stubGlobal('document', doc);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { frames.set(++next, cb); return next; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const tick = (time: number) => { const [id, cb] = [...frames][0]; frames.delete(id); cb(time); };
  const callback = vi.fn(); const stop = startAnimationLoop(callback);
  tick(1000); tick(1016); expect(callback).toHaveBeenLastCalledWith(0.016); expect(frames.size).toBe(1);
  doc.hidden = true; visibility(); expect(frames.size).toBe(0);
  doc.hidden = false; visibility(); tick(10000); expect(callback).toHaveBeenCalledOnce();
  tick(10016); expect(callback).toHaveBeenLastCalledWith(0.016);
  stop(); expect(frames.size).toBe(0); expect(doc.removeEventListener).toHaveBeenCalledOnce();
});
it('does not leave an orphan frame if stopped during a callback', () => {
  let frame!: FrameRequestCallback;
  vi.stubGlobal('document', { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  const request = vi.fn((cb: FrameRequestCallback) => { frame = cb; return 1; });
  vi.stubGlobal('requestAnimationFrame', request); vi.stubGlobal('cancelAnimationFrame', vi.fn());
  let stop!: () => void; stop = startAnimationLoop(() => stop());
  frame(0); frame(16); expect(request).toHaveBeenCalledTimes(2);
});
