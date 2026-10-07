/** Cache one stationary canvas layer, preserving room for shadows outside its bounds. */
export class StaticCanvasLayer {
  private canvas: HTMLCanvasElement | null = null;
  private key = '';

  draw(ctx: CanvasRenderingContext2D, width: number, height: number, key: string,
    paint: (ctx: CanvasRenderingContext2D) => void, padding = 0): void {
    if (typeof document === 'undefined') { paint(ctx); return; }
    const cacheKey = `${width}:${height}:${padding}:${key}`;
    if (!this.canvas || this.key !== cacheKey) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(width + padding * 2);
      canvas.height = Math.ceil(height + padding * 2);
      const layer = canvas.getContext('2d');
      if (!layer) { paint(ctx); return; }
      layer.translate(padding, padding);
      paint(layer);
      this.canvas = canvas; this.key = cacheKey;
    }
    ctx.drawImage(this.canvas, -padding, -padding);
  }
}
