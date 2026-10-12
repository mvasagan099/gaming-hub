import type { SnakeVsWormsState } from '@gaming-hub/game-engine';
import { NetworkPlaybackClock } from '../shared/rendering/NetworkPlaybackClock';

/** Presentation only. Authoritative collision, input and scoring use the latest state. */
export class SnakeWormTimeline {
  private samples: { time: number; state: SnakeVsWormsState }[] = [];
  private readonly playbackClock = new NetworkPlaybackClock(60);
  private version = -1;

  receive(state: SnakeVsWormsState, receivedAt: number, restored = false): void {
    if (restored) { this.samples = []; this.playbackClock.reset(); this.version = -1; }
    if (state.stateVersion <= this.version) return;
    this.version = state.stateVersion;
    const time = state.serverTimestamp || receivedAt;
    if (state.paused || state.finished || (this.samples.at(-1)?.time ?? -Infinity) > time) {
      this.samples = [];
      this.playbackClock.reset();
    }
    this.playbackClock.observe(time, receivedAt);
    if (this.samples.at(-1)?.time === time) this.samples.pop();
    this.samples.push({ time, state });
    if (this.samples.length > 12) this.samples.shift();
  }

  bodies(now: number, localSeat?: number | null): Map<number, { x: number; y: number }[]> {
    const target = this.playbackClock.target(now);
    while (this.samples.length > 2 && this.samples[1].time <= target) this.samples.shift();
    if (!this.samples.length) return new Map();
    const latest = this.samples.at(-1)!.state;
    const result = new Map<number, { x: number; y: number }[]>();
    for (const player of latest.players) {
      const playbackTarget = player.seat === localSeat ? this.playbackClock.baseTarget(now) : target;
      let index = 0;
      while (index < this.samples.length - 2 && this.samples[index + 1].time <= playbackTarget) index++;
      const a = this.samples[index], b = this.samples[index + 1];
      const t = b ? Math.max(0, Math.min(1, (playbackTarget - a.time) / (b.time - a.time))) : 0;
      const from = a.state.players.find(p => p.seat === player.seat);
      const to = b?.state.players.find(p => p.seat === player.seat) ?? from;
      // Death, respawn, growth/shrink and teleport are authoritative discontinuities.
      if (!from || !to || latest.paused || latest.finished || player.status !== from.status || player.status !== to.status ||
          player.body.length !== from.body.length || player.body.length !== to.body.length ||
          Math.hypot((to.body[0]?.x ?? 0) - (from.body[0]?.x ?? 0), (to.body[0]?.y ?? 0) - (from.body[0]?.y ?? 0)) > 250) {
        result.set(player.seat, player.body.map(p => ({ ...p })));
      } else {
        const body = from.body.map((p, i) => ({ x: p.x + (to.body[i].x - p.x) * t, y: p.y + (to.body[i].y - p.y) * t }));
        // Bridge short delivery gaps along the known trail. Never predict a
        // collision, turn, death, growth or respawn; those require server state.
        if (b && playbackTarget > b.time && from.direction === to.direction) {
          const elapsed = b.time - a.time;
          const dx = to.body[0].x - from.body[0].x, dy = to.body[0].y - from.body[0].y;
          const length = Math.hypot(dx, dy);
          if (elapsed > 0 && length > 0) {
            const speed = Math.min(length / elapsed, (Number.isFinite(to.speed) ? to.speed : 10) * 60 / 1000);
            const distance = speed * Math.min(100, playbackTarget - b.time);
            result.set(player.seat, advanceTrail(body, dx / length, dy / length, distance,
              latest.gridWidth, latest.gridHeight));
            continue;
          }
        }
        result.set(player.seat, body);
      }
    }
    return result;
  }
}


/** Shift segments along their existing polyline so prediction preserves bends. */
function advanceTrail(body: { x: number; y: number }[], vx: number, vy: number, distance: number,
  width: number, height: number): { x: number; y: number }[] {
  if (!body.length) return [];
  const head = body[0];
  const boundaries = [vx > 0 ? (width - head.x) / vx : vx < 0 ? -head.x / vx : Infinity,
    vy > 0 ? (height - head.y) / vy : vy < 0 ? -head.y / vy : Infinity];
  for (const boundary of boundaries) if (Number.isFinite(boundary)) distance = Math.min(distance, Math.max(0, boundary));
  const lengths = [0];
  for (let i = 1; i < body.length; i++) lengths.push(lengths[i - 1] + Math.hypot(body[i].x - body[i - 1].x, body[i].y - body[i - 1].y));
  let segment = 1;
  return lengths.map(length => {
    const target = length - distance;
    if (target <= 0) return { x: head.x - vx * target, y: head.y - vy * target };
    while (segment < body.length - 1 && lengths[segment] < target) segment++;
    const from = body[segment - 1], to = body[segment];
    const span = lengths[segment] - lengths[segment - 1];
    const fraction = span > 0 ? (target - lengths[segment - 1]) / span : 0;
    return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
  });
}
