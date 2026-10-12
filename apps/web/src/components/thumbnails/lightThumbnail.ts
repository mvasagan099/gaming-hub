import { GAME_DEFINITIONS } from '@gaming-hub/shared';

// Only the nine catalogue assets can enter this page-lifetime cache.
const allowed = new Set(GAME_DEFINITIONS.map(game => `/images/${game.id}.png`));
const cache = new Map<string, Promise<string>>();
const pending = new Map<string, { resolve: (url: string) => void; reject: () => void }>();
let worker: Worker | null = null;
let deadline: ReturnType<typeof setTimeout> | null = null;
function stop() {
  worker?.terminate(); worker = null;
  if (deadline) clearTimeout(deadline);
  deadline = null;
}
function fail() {
  stop();
  for (const [src, request] of pending) { cache.delete(src); request.reject(); }
  pending.clear();
}
export function lightThumbnail(src: string): Promise<string> {
  if (!allowed.has(src)) return Promise.resolve(src);
  const existing = cache.get(src);
  if (existing) return existing;
  const promise = new Promise<string>((resolve, reject) => {
    try {
      if (!worker) {
        worker = new Worker(new URL('./lightThumbnail.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }: MessageEvent<{ src: string; blob?: Blob; error?: boolean }>) => {
          const request = pending.get(data.src);
          if (!request) return;
          pending.delete(data.src);
          if (data.error || !data.blob) { cache.delete(data.src); request.reject(); }
          else request.resolve(URL.createObjectURL(data.blob));
          if (!pending.size) stop();
        };
        worker.onerror = fail;
        deadline = setTimeout(fail, 15000);
      }
      pending.set(src, { resolve, reject: () => reject(new Error('Light thumbnail unavailable')) });
      worker.postMessage({ src });
    } catch { pending.delete(src); reject(new Error('Light thumbnail unavailable')); if (!pending.size) stop(); }
  });
  cache.set(src, promise);
  void promise.catch(() => { if (cache.get(src) === promise) cache.delete(src); });
  return promise;
}
