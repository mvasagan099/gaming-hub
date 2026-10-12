import { describe, expect, it } from 'vitest';
import { clearThumbnailBackground } from './background';

describe('theme thumbnail background', () => {
  it('clears connected background while preserving gold and enclosed black details', () => {
    const data = new Uint8ClampedArray(5 * 5 * 4);
    for (let i = 0; i < 25; i++) data.set([7, 9, 8, 255], i * 4);
    for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) data.set([200, 150, 30, 255], (y * 5 + x) * 4);
    data.set([0, 0, 0, 255], 12 * 4);
    const before = data.slice();
    clearThumbnailBackground(data, 5, 5);
    for (let i = 0; i < 25; i++) {
      const x = i % 5, y = Math.floor(i / 5);
      expect(data.slice(i * 4, i * 4 + 3)).toEqual(before.slice(i * 4, i * 4 + 3));
      expect(data[i * 4 + 3]).toBe(x === 0 || x === 4 || y === 0 || y === 4 ? 0 : 255);
    }
  });
  it('does not remove dark colored artwork or wrap between rows', () => {
    const data = new Uint8ClampedArray([0,20,0,255, 200,150,30,255, 0,0,0,255]);
    clearThumbnailBackground(data, 3, 1);
    expect(data[3]).toBe(255); expect(data[7]).toBe(255); expect(data[11]).toBe(0);
  });
  it('handles transparent edges and rejects invalid dimensions', () => {
    const data = new Uint8ClampedArray([255,255,255,0, 0,0,0,255]);
    clearThumbnailBackground(data, 2, 1); expect(data[7]).toBe(0);
    expect(() => clearThumbnailBackground(data, 3, 1)).toThrow();
  });
});
