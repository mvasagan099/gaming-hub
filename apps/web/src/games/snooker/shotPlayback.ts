import { SNOOKER_KEYFRAME_MS, snookerShotDuration, type SnookerBall, type SnookerState, type SnookerTrajectoryKeyframe } from '@gaming-hub/game-engine';

/** Wall-clock playback; prediction supplies motion only, never scores or turns. */
export class SnookerShotPlayback {
  private active: { id: string; startAt: number; balls: SnookerBall[]; frames: SnookerTrajectoryKeyframe[]; final: SnookerState | null } | null = null;
  private seenShot: string | null = null;
  constructor(privateCallbacks: { render: (balls: SnookerBall[]) => void; settle: (state: SnookerState) => void }) {
    this.callbacks = privateCallbacks;
  }
  private readonly callbacks: { render: (balls: SnookerBall[]) => void; settle: (state: SnookerState) => void };
  get busy(): boolean { return this.active !== null; }
  get shotId(): string | null { return this.active?.id ?? null; }
  begin(id: string, balls: SnookerBall[], startAt: number): void {
    this.active = { id, startAt, balls: balls.map(b => ({ ...b })), frames: [], final: null };
  }
  preview(id: string, frames: SnookerTrajectoryKeyframe[]): void {
    if (this.active?.id === id && !this.active.final) this.active.frames = frames;
  }
  receive(state: SnookerState, now: number, restore = false): void {
    const id = state.lastProcessedShotId ?? state.lastShot?.shotId ?? null;
    if (restore) {
      this.active = null; this.seenShot = id;
      this.callbacks.settle(state); return;
    }
    const frames = state.keyframes ?? [];
    if (id && frames.length && (this.active?.id === id || id !== this.seenShot)) {
      if (this.active?.id !== id) this.begin(id, state.balls, now);
      this.seenShot = id;
      this.active!.frames = frames;
      this.active!.final = state;
      this.advance(now);
      return;
    }
    // Repeated delivery of a shot must not snap to the settled board mid-flight.
    if (this.active?.id === id && frames.length) { this.active.final = state; return; }
    this.active = null;
    this.callbacks.settle(state);
  }
  advance(now: number): void {
    const shot = this.active;
    if (!shot || !shot.frames.length || now < shot.startAt) return;
    const elapsed = now - shot.startAt;
    if (elapsed >= snookerShotDuration(shot.frames) && shot.final) {
      this.active = null;
      this.callbacks.settle(shot.final); return;
    }
    const frame = Math.min(elapsed / SNOOKER_KEYFRAME_MS, shot.frames.at(-1)!.frame);
    let index = Math.min(shot.frames.length - 1, Math.floor(frame));
    // Frames currently have consecutive indices; also tolerate sparse trajectories.
    while (index > 0 && shot.frames[index].frame > frame) index--;
    while (index + 1 < shot.frames.length && shot.frames[index + 1].frame <= frame) index++;
    const a = shot.frames[index], b = shot.frames[index + 1] ?? a;
    const mix = b.frame === a.frame ? 0 : (frame - a.frame) / (b.frame - a.frame);
    const before = new Map(a.pieces.map(p => [p.id, p]));
    const after = new Map(b.pieces.map(p => [p.id, p]));
    this.callbacks.render(shot.balls.map(ball => {
      const p = before.get(ball.id); const q = after.get(ball.id) ?? p;
      if (!p || !q) return ball;
      return { ...ball, ...p, x: p.x + (q.x - p.x) * mix, y: p.y + (q.y - p.y) * mix };
    }));
  }
  cancel(state?: SnookerState): void {
    this.active = null;
    if (state) { this.seenShot = state.lastProcessedShotId ?? null; this.callbacks.settle(state); }
  }
}
