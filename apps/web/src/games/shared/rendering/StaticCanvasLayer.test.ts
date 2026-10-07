import { afterEach, expect, it, vi } from 'vitest';
import { StaticCanvasLayer } from './StaticCanvasLayer';
afterEach(() => vi.unstubAllGlobals());
it('reuses painted scenery for 120 frames, then rebuilds when dimensions or appearance change', () => {
  const translate = vi.fn(), paint = vi.fn(), drawImage = vi.fn();
  const create = vi.fn(() => ({ width: 0, height: 0, getContext: () => ({ translate }) }));
  vi.stubGlobal('document', { createElement: create });
  const layer = new StaticCanvasLayer(); const ctx = { drawImage } as unknown as CanvasRenderingContext2D;
  for (let frame = 0; frame < 120; frame++) layer.draw(ctx, 960, 480, 'table', paint, 64);
  expect(paint).toHaveBeenCalledOnce(); expect(create).toHaveBeenCalledOnce();
  expect(drawImage).toHaveBeenCalledTimes(120);
  expect(drawImage).toHaveBeenLastCalledWith(expect.objectContaining({ width: 1088, height: 608 }), -64, -64);
  layer.draw(ctx, 480, 960, 'table', paint, 64);
  layer.draw(ctx, 480, 960, 'different', paint, 64);
  expect(paint).toHaveBeenCalledTimes(3);
});
it('falls back to direct drawing if a backing context cannot be created', () => {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
  const paint = vi.fn(), drawImage = vi.fn(); const ctx = { drawImage } as unknown as CanvasRenderingContext2D;
  new StaticCanvasLayer().draw(ctx, 100, 100, 'test', paint);
  expect(paint).toHaveBeenCalledWith(ctx); expect(drawImage).not.toHaveBeenCalled();
});
