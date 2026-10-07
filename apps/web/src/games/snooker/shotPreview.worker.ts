import { simulateSnookerShot } from '@gaming-hub/game-engine';
self.onmessage = ({ data }: MessageEvent) => {
  try {
    const { shotId, balls, params } = data;
    self.postMessage({ shotId, keyframes: simulateSnookerShot(balls, params).keyframes });
  } catch { self.postMessage({ shotId: data.shotId, keyframes: [] }); }
};
