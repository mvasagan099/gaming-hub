import { afterEach, expect, it, vi } from 'vitest';
import { CarromBoardRenderer } from '../../carrom/rendering/CarromBoardRenderer';
import { SnookerTableRenderer } from '../../snooker/rendering/SnookerTableRenderer';
afterEach(() => vi.unstubAllGlobals());
it.each(['carrom', 'snooker'])('reuses %s scenery without rebuilding textures during animation', game => {
  const gradient = { addColorStop: vi.fn() };
  const createGradient = vi.fn(() => gradient);
  const painter = new Proxy({ createLinearGradient: createGradient, createRadialGradient: createGradient } as Record<string, unknown>, {
    get: (target, key: string) => target[key] ?? vi.fn(),
  }) as unknown as CanvasRenderingContext2D;
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => painter }) });
  const drawImage = vi.fn(); const target = { drawImage } as unknown as CanvasRenderingContext2D;
  const draw = () => game === 'carrom' ? CarromBoardRenderer.drawBoard(target, 600, 600)
    : SnookerTableRenderer.drawTable(target, 960, 480);
  draw(); const gradientsOnFirstFrame = createGradient.mock.calls.length;
  expect(gradientsOnFirstFrame).toBeGreaterThan(0);
  for (let frame = 1; frame < 120; frame++) draw();
  expect(createGradient).toHaveBeenCalledTimes(gradientsOnFirstFrame);
  expect(drawImage).toHaveBeenCalledTimes(120);
});
