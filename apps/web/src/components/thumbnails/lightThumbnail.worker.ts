import { clearThumbnailBackground } from './background';

// Work away from gameplay/UI rendering, at sufficient resolution for a card.
let queue = Promise.resolve();
self.onmessage = ({ data: { src } }: MessageEvent<{ src: string }>) => {
  queue = queue.then(() => prepare(src));
};
async function prepare(src: string) {
  let bitmap: ImageBitmap | undefined;
  try {
    const response = await fetch(src);
    if (!response.ok) throw new Error('Thumbnail unavailable');
    bitmap = await createImageBitmap(await response.blob());
    const width = Math.min(1000, bitmap.width);
    const height = Math.max(1, Math.round(bitmap.height * width / bitmap.width));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close(); bitmap = undefined;
    const image = context.getImageData(0, 0, width, height);
    clearThumbnailBackground(image.data, width, height);
    context.putImageData(image, 0, 0);
    self.postMessage({ src, blob: await canvas.convertToBlob({ type: 'image/png' }) });
  } catch {
    self.postMessage({ src, error: true });
  } finally { bitmap?.close(); }
}
