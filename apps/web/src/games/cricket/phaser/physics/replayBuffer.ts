export interface ReplayPose {
  texture: string; x: number; y: number; sx: number; sy: number;
  angle: number; alpha: number; visible: boolean; ox: number; oy: number;
}
export interface ReplayFrame {
  time: number; poses: ReplayPose[]; ballX: number; ballDepth: number; ballHeight: number;
  bails: { x: number; y: number; angle: number; alpha: number }[];
}

/** A bounded visual history; replay never contains live game objects or actions. */
export class ReplayBuffer {
  private frames: ReplayFrame[] = [];
  private capacity: number;
  constructor(capacity = 60) { this.capacity = capacity; }
  push(frame: ReplayFrame) {
    this.frames.push(frame);
    if (this.frames.length > this.capacity) this.frames.shift();
  }
  clear() { this.frames = []; }
  clip(seconds = 1.4): ReplayFrame[] {
    const end = this.frames.at(-1)?.time ?? 0;
    return this.frames.filter(frame => frame.time >= end - seconds);
  }
}

export function replayBlend(frames: ReplayFrame[], time: number) {
  let index = 0;
  while (index < frames.length - 2 && frames[index + 1].time <= time) index++;
  const from = frames[index], to = frames[Math.min(index + 1, frames.length - 1)];
  if (!from || !to) return null;
  const mix = Math.max(0, Math.min(1, (time - from.time) / Math.max(0.001, to.time - from.time)));
  return { from, to, mix };
}
