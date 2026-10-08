import type { ReplayEventRecord } from '@gaming-hub/shared';

// Never stringify entire physics trajectories into the DOM. Work is bounded
// before serialization, even when a recorded shot contains thousands of frames.
export function summarizeReplayData(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.length > 300 ? `${value.slice(0, 300)}…` : value;
  if (!value || typeof value !== 'object') return value;
  if (depth >= 4) return Array.isArray(value) ? `[${value.length} items]` : '[details]';
  if (Array.isArray(value)) return { count: value.length, preview: value.slice(0, 6).map(v => summarizeReplayData(v, depth + 1)) };
  const output: Record<string, unknown> = {};
  let count = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    if (count++ >= 12) { output.more = 'Additional fields omitted'; break; }
    output[key] = summarizeReplayData((value as Record<string, unknown>)[key], depth + 1);
  }
  return output;
}

export function replayStepDuration(event?: ReplayEventRecord): number {
  const events = event?.resultData.events;
  const trajectory = Array.isArray(events) ? events.find(e => e.type === 'shot-trajectory') : null;
  const frames = trajectory?.keyframes ?? event?.resultData.lastTrajectory;
  const lastFrame = Array.isArray(frames) ? frames[frames.length - 1]?.frame : undefined;
  return Number.isFinite(lastFrame) ? Math.max(1000, Math.min(60000, lastFrame / 60 * 1000)) : 1000;
}
