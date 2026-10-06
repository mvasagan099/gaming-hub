import type { TableTennisBall, TableTennisState } from '@gaming-hub/game-engine';

/** Render a short buffered history, instead of rewinding local prediction on every packet. */
export class TableTennisTimeline {
  private samples: { time: number; ball: TableTennisBall }[] = [];
  private offset: number | null = null;
  private remainingMs = 0;
  private clockReceivedAt = 0;
  private paused = false;

  receive(state: TableTennisState, receivedAt: number): void {
    const timestamp = typeof state.serverTimestamp === 'number' ? state.serverTimestamp : receivedAt;
    // Keep the smallest observed transit delay; packet jitter must not move the playback clock.
    this.offset = Math.min(this.offset ?? Infinity, receivedAt - timestamp);
    const remaining = state.matchRemainingMs;
    this.remainingMs = typeof remaining === 'number' ? remaining : Math.max(0,
      (state.matchTimerConfig?.matchDurationMs ?? 180000) -
      (state.matchStartedAtMs == null ? 0 : timestamp - state.matchStartedAtMs));
    this.clockReceivedAt = receivedAt;
    this.paused = state.paused || state.finished;
    if (!state.ball?.inPlay || state.paused || state.finished) {
      this.samples = [];
      return;
    }
    if (this.samples.length && timestamp < this.samples[this.samples.length - 1].time) return;
    const sample = { time: timestamp, ball: { ...state.ball } };
    if (this.samples.at(-1)?.time === timestamp) this.samples.pop();
    this.samples.push(sample);
    if (this.samples.length > 32) this.samples.shift();
  }

  secondsRemaining(now: number): number {
    return Math.ceil(Math.max(0, this.remainingMs - (this.paused ? 0 : now - this.clockReceivedAt)) / 1000);
  }

  ball(now: number): TableTennisBall | null {
    if (!this.samples.length) return null;
    const target = now - (this.offset ?? 0) - 80;
    while (this.samples.length > 2 && this.samples[1].time <= target) this.samples.shift();
    const a = this.samples[0];
    const b = this.samples[1];
    if (!b || target >= b.time) return { ...(this.samples.at(-1)!.ball) };
    const t = Math.max(0, Math.min(1, (target - a.time) / (b.time - a.time)));
    return { ...a.ball, x: a.ball.x + (b.ball.x - a.ball.x) * t, y: a.ball.y + (b.ball.y - a.ball.y) * t };
  }
}
