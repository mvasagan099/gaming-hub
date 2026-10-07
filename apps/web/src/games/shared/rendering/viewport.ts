/** Test world coordinates against the same centered zoom used by the canvas. */
export function isInViewport(x: number, y: number, camera: { x: number; y: number },
  width: number, height: number, zoom: number, margin = 32): boolean {
  const centerX = camera.x + width / 2, centerY = camera.y + height / 2;
  return Math.abs(x - centerX) <= width / (2 * zoom) + margin
    && Math.abs(y - centerY) <= height / (2 * zoom) + margin;
}
