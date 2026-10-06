import type { TableTennisBall, TableTennisState } from '@gaming-hub/game-engine';

/** Render a short buffered history, instead of rewinding local prediction on every packet. */
export class TableTennisTimeline {
  private samples: { time: number; ball: TableTennisBall; paddles: number[] }[] = [];
  private latestPaddles: number[] = [160, 160];
  private heldBall: TableTennisBall | null = null;
  private rendered: TableTennisBall | null = null;
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
    this.heldBall = state.paused && !state.finished && state.ball?.inPlay ? { ...state.ball } : null;
    this.latestPaddles = state.players.map(p => p.paddleY);
    if (!state.ball?.inPlay || state.paused || state.finished) {
      this.samples = [];
      this.rendered = null;
      return;
    }
    if (this.samples.length && timestamp < this.samples[this.samples.length - 1].time) return;
    const sample = { time: timestamp, ball: { ...state.ball }, paddles: [...this.latestPaddles] };
    const previous = this.samples.at(-1);
    if (previous && sample.ball.touchCount === previous.ball.touchCount + 1
      && previous.ball.vx * sample.ball.vx < 0 && timestamp > previous.time
      && (sample.ball.lastHitSeat === 0 ? previous.ball.vx < 0 : previous.ball.vx > 0)) {
      // Include the contact between snapshots, so interpolation reaches the bat
      // instead of reversing early between two positions away from it.
      const x = sample.ball.lastHitSeat === 0 ? 38 : 562;
      const fraction = Math.max(0.05, Math.min(0.95,
        Math.abs((x - previous.ball.x) / previous.ball.vx) * (1000 / 60) / (timestamp - previous.time)));
      this.samples.push({ time: previous.time + (timestamp - previous.time) * fraction,
        ball: { ...sample.ball, x, y: previous.ball.y + (x - previous.ball.x) * previous.ball.vy / previous.ball.vx },
        paddles: [...sample.paddles] });
    }
    if (this.samples.at(-1)?.time === timestamp) this.samples.pop();
    this.samples.push(sample);
    if (this.samples.length > 32) this.samples.shift();
  }

  secondsRemaining(now: number): number {
    return Math.ceil(Math.max(0, this.remainingMs - (this.paused ? 0 : now - this.clockReceivedAt)) / 1000);
  }

  paddles(now: number): number[] {
    if (!this.samples.length) return [...this.latestPaddles];
    const target = now - (this.offset ?? 0) - 40;
    let a = this.samples[0];
    for (const b of this.samples.slice(1)) {
      if (target < b.time) {
        const t = Math.max(0, (target - a.time) / (b.time - a.time));
        // At a confirmed contact the hit paddle belongs to the contact snapshot.
        if (b.ball.x === 38 || b.ball.x === 562) return [...b.paddles];
        return a.paddles.map((y, seat) => y + (b.paddles[seat] - y) * t);
      }
      a = b;
    }
    return [...a.paddles];
  }

  ball(now: number): TableTennisBall | null {
    if (!this.samples.length) return this.heldBall ? { ...this.heldBall } : null;
    const target = now - (this.offset ?? 0) - 40;
    while (this.samples.length > 2 && this.samples[1].time <= target) this.samples.shift();
    const a = this.samples[0];
    const b = this.samples[1];
    let ball: TableTennisBall;
    if (!b || target >= b.time) {
      const latest = this.samples.at(-1)!;
      // Bridge brief jitter, but never predict a paddle bounce or a new point.
      const frames = Math.max(0, Math.min(64, target - latest.time)) / (1000 / 60);
      ball = { ...latest.ball };
      const contactX = ball.vx > 0 ? (ball.x < 562 ? 562 : 612) : (ball.x > 38 ? 38 : -12);
      ball.x = ball.vx > 0 ? Math.min(contactX, ball.x + ball.vx * frames)
        : Math.max(contactX, ball.x + ball.vx * frames);
      ball.y = Math.max(0, Math.min(400, ball.y + ball.vy * frames));
    } else {
      const t = Math.max(0, Math.min(1, (target - a.time) / (b.time - a.time)));
      ball = { ...a.ball, x: a.ball.x + (b.ball.x - a.ball.x) * t, y: a.ball.y + (b.ball.y - a.ball.y) * t };
    }
    // A late snapshot must not rewind a ball still travelling on the same shot.
    // A confirmed contact changes touchCount/direction and releases this guard.
    const previous = this.rendered;
    if (previous && previous.touchCount === ball.touchCount && previous.vx * ball.vx > 0
      && Math.abs(previous.x - ball.x) < 40) {
      ball.x = ball.vx > 0 ? Math.max(previous.x, ball.x) : Math.min(previous.x, ball.x);
    }
    this.rendered = ball;
    return { ...ball };
  }
}
