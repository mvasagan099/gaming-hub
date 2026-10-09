import type { SnakeVsWormsState } from '@gaming-hub/game-engine';

/** Presentation only. Authoritative collision, input and scoring use the latest state. */
export class SnakeWormTimeline {
  private samples: { time: number; state: SnakeVsWormsState }[] = [];
  private offset: number | null = null;
  private version = -1;

  receive(state: SnakeVsWormsState, receivedAt: number, restored = false): void {
    if (restored) { this.samples = []; this.offset = null; this.version = -1; }
    if (state.stateVersion <= this.version) return;
    this.version = state.stateVersion;
    const time = state.serverTimestamp || receivedAt;
    if (state.paused || state.finished || (this.samples.at(-1)?.time ?? -Infinity) > time) {
      this.samples = [];
      this.offset = null;
    }
    this.offset = Math.min(this.offset ?? Infinity, receivedAt - time);
    if (this.samples.at(-1)?.time === time) this.samples.pop();
    this.samples.push({ time, state });
    if (this.samples.length > 12) this.samples.shift();
  }

  bodies(now: number): Map<number, { x: number; y: number }[]> {
    const target = now - (this.offset ?? 0) - 60;
    while (this.samples.length > 2 && this.samples[1].time <= target) this.samples.shift();
    const a = this.samples[0], b = this.samples[1];
    if (!a) return new Map();
    const latest = this.samples.at(-1)!.state;
    const t = b ? Math.max(0, Math.min(1, (target - a.time) / (b.time - a.time))) : 0;
    const result = new Map<number, { x: number; y: number }[]>();
    for (const player of latest.players) {
      const from = a.state.players.find(p => p.seat === player.seat);
      const to = b?.state.players.find(p => p.seat === player.seat) ?? from;
      // Death, respawn, growth/shrink and teleport are authoritative discontinuities.
      if (!from || !to || latest.paused || latest.finished || player.status !== from.status || player.status !== to.status ||
          player.body.length !== from.body.length || player.body.length !== to.body.length ||
          Math.hypot((to.body[0]?.x ?? 0) - (from.body[0]?.x ?? 0), (to.body[0]?.y ?? 0) - (from.body[0]?.y ?? 0)) > 250) {
        result.set(player.seat, player.body.map(p => ({ ...p })));
      } else {
        result.set(player.seat, from.body.map((p, i) => ({ x: p.x + (to.body[i].x - p.x) * t, y: p.y + (to.body[i].y - p.y) * t })));
      }
    }
    return result;
  }
}
