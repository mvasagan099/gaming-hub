/** Remove only neutral, nearly black background connected to the image edge.
 * Enclosed black lettering/shadows and every other artwork pixel remain intact.
 */
export function clearThumbnailBackground(data: Uint8ClampedArray, width: number, height: number): void {
  const count = width * height;
  if (data.length !== count * 4 || width < 1 || height < 1) throw new Error('Invalid thumbnail dimensions');
  const visited = new Uint8Array(count);
  const queue = new Uint32Array(count);
  let head = 0, tail = 0;
  function enqueue(index: number) {
    if (visited[index]) return;
    visited[index] = 1;
    const i = index * 4;
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    if (data[i + 3] === 0 || (max <= 24 && max - min <= 8)) queue[tail++] = index;
  }
  for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
  while (head < tail) {
    const index = queue[head++];
    data[index * 4 + 3] = 0;
    const x = index % width;
    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (index >= width) enqueue(index - width);
    if (index + width < count) enqueue(index + width);
  }
}
