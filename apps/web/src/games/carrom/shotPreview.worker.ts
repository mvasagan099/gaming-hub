import { predictCarromShot } from './shotPreview';

self.onmessage = ({ data }: MessageEvent) => {
  const { requestId, state, seat, action } = data;
  const keyframes = predictCarromShot(state, seat, action);
  self.postMessage({ requestId, keyframes });
};
