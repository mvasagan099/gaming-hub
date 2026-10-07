import { expect, it } from 'vitest';
import { isInViewport } from './viewport';
it('keeps food visible in the zoomed-out portrait view and clips distant work', () => {
  expect(isInViewport(-350, 300, { x: 0, y: 0 }, 900, 600, 0.5)).toBe(true);
  expect(isInViewport(-350, 300, { x: 0, y: 0 }, 900, 600, 0.9)).toBe(false);
  expect(isInViewport(1900, 1900, { x: 0, y: 0 }, 900, 600, 0.5)).toBe(false);
  expect(isInViewport(1950, 1950, { x: 1500, y: 1650 }, 900, 600, 0.9)).toBe(true);
});
