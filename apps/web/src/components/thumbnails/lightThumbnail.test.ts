import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let instances: MockWorker[];
class MockWorker {
  onmessage: ((event: any) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { instances.push(this); }
}
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); instances = [];
  vi.stubGlobal('Worker', MockWorker);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:light');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('light thumbnail worker lifecycle', () => {
  it('shares duplicate requests and cached results then terminates the worker', async () => {
    const { lightThumbnail } = await import('./lightThumbnail');
    const first = lightThumbnail('/images/chess.png');
    expect(lightThumbnail('/images/chess.png')).toBe(first);
    expect(instances).toHaveLength(1); expect(instances[0].postMessage).toHaveBeenCalledOnce();
    instances[0].onmessage!({ data: { src: '/images/chess.png', blob: new Blob() } });
    expect(await first).toBe('blob:light');
    expect(instances[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(lightThumbnail('/images/chess.png')).toBe(first);
  });
  it('fails stalled work within its deadline and permits retry', async () => {
    const { lightThumbnail } = await import('./lightThumbnail');
    const first = lightThumbnail('/images/carrom.png');
    const rejected = expect(first).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(15000); await rejected;
    expect(instances[0].terminate).toHaveBeenCalledOnce();
    const retry = lightThumbnail('/images/carrom.png');
    const rejectedRetry = expect(retry).rejects.toThrow(); instances[1].onerror!(); await rejectedRetry;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('rejects failed conversion and ignores unknown messages', async () => {
    const { lightThumbnail } = await import('./lightThumbnail');
    const request = lightThumbnail('/images/ludo.png'); const rejected = expect(request).rejects.toThrow();
    instances[0].onmessage!({ data: { src: '/unknown.png', blob: new Blob() } });
    expect(instances[0].terminate).not.toHaveBeenCalled();
    instances[0].onmessage!({ data: { src: '/images/ludo.png', error: true } }); await rejected;
    expect(instances[0].terminate).toHaveBeenCalledOnce();
  });
  it('does not fetch or cache images outside the game catalogue', async () => {
    const { lightThumbnail } = await import('./lightThumbnail');
    expect(await lightThumbnail('https://example.com/avatar.png')).toBe('https://example.com/avatar.png');
    expect(instances).toHaveLength(0);
  });
});
