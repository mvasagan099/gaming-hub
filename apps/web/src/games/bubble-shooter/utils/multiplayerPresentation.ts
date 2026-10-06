import { BUBBLE_SHOOTER_GEOMETRY, traceBubbleShot } from '@gaming-hub/game-engine';
import type { BubbleShooterNextBubble, BubbleShooterPlayerState, BubbleShooterServerState } from '@gaming-hub/game-engine';

/** Buffer snapshots during a cosmetic flight; never calculate a local score. */
export class BubbleMultiplayerPresentation {
  private latest: BubbleShooterServerState | null = null;
  private seat: number | null = null;
  private token = 0;
  private pending: { token: number; sequence: number; landed: boolean } | null = null;

  get busy() { return this.pending !== null; }

  receive(state: BubbleShooterServerState, seat: number) {
    if (this.seat !== seat) this.pending = null;
    this.seat = seat;
    this.latest = state;
    if (!this.pending) return state;
    if (state.finished && !this.hasResult()) return this.cancel(this.pending.token);
    return this.resolve();
  }

  beginShot(): { token: number; bubble: BubbleShooterNextBubble } | null {
    const me = this.latest?.players.find(player => player.seat === this.seat);
    if (this.pending || !me || me.status !== 'playing' || this.latest?.finished || this.latest?.paused) return null;
    this.pending = { token: ++this.token, sequence: me.lastShot?.sequence ?? 0, landed: false };
    return { token: this.token, bubble: { ...me.nextBubble } };
  }

  finishFlight() {
    if (this.pending) this.pending.landed = true;
    return this.resolve();
  }

  isPending(token: number) { return this.pending?.token === token; }

  cancel(token: number) {
    if (!this.isPending(token)) return null;
    this.pending = null;
    return this.latest;
  }

  private hasResult() {
    const me = this.latest?.players.find(player => player.seat === this.seat);
    return !!this.pending && (me?.lastShot?.sequence ?? 0) > this.pending.sequence;
  }

  private resolve() {
    if (!this.pending?.landed || !this.hasResult()) return null;
    this.pending = null;
    return this.latest;
  }
}

export function createBubbleFlight(player: BubbleShooterPlayerState, angle: number, bubble: BubbleShooterNextBubble) {
  const geometry = BUBBLE_SHOOTER_GEOMETRY;
  return {
    x: Number(geometry.shooterX), y: Number(geometry.shooterY),
    vx: Math.cos(angle) * geometry.speed, vy: Math.sin(angle) * geometry.speed,
    ...bubble,
    path: traceBubbleShot(player.grid, player.topOffset, angle).points,
    segment: 1,
  };
}

/** Advance only the presentation along the same bounce path as the server. */
export function advanceBubbleFlight(flight: ReturnType<typeof createBubbleFlight>, dt: number): boolean {
  let distance = BUBBLE_SHOOTER_GEOMETRY.speed * Math.max(0, dt);
  while (flight.segment < flight.path.length) {
    const target = flight.path[flight.segment]!;
    const dx = target.x - flight.x;
    const dy = target.y - flight.y;
    const remaining = Math.hypot(dx, dy);
    if (remaining <= distance) {
      flight.x = target.x; flight.y = target.y;
      distance -= remaining;
      flight.segment++;
    } else {
      flight.vx = dx / remaining * BUBBLE_SHOOTER_GEOMETRY.speed;
      flight.vy = dy / remaining * BUBBLE_SHOOTER_GEOMETRY.speed;
      flight.x += dx / remaining * distance;
      flight.y += dy / remaining * distance;
      return false;
    }
  }
  return true;
}

/** Classify visual removals without awarding points or changing the server grid. */
export function bubbleShotEffects(previous: BubbleShooterPlayerState['grid'], player: BubbleShooterPlayerState) {
  const shot = player.lastShot;
  if (!shot || shot.matchedCount === 0) return { popped: [], dropped: [] };
  const key = (b: { row: number; col: number }) => `${b.row},${b.col}`;
  const neighbors = (row: number, col: number) => [
    [row, col - 1], [row, col + 1], [row - 1, col], [row + 1, col],
    [row - 1, col + (row % 2 === 0 ? -1 : 1)],
    [row + 1, col + (row % 2 === 0 ? -1 : 1)],
  ].map(([r, c]) => ({ row: r!, col: c! }));
  const fired = { row: shot.row, col: shot.col, color: shot.color, type: shot.type };
  const cells = [...previous, fired];
  const poppedKeys = new Set<string>();
  if (shot.type === 'bomb') {
    poppedKeys.add(key(fired));
    for (const n of neighbors(shot.row, shot.col)) {
      poppedKeys.add(key(n));
      for (const second of neighbors(n.row, n.col)) poppedKeys.add(key(second));
    }
  } else {
    const todo = [fired];
    while (todo.length) {
      const cell = todo.pop()!;
      if (poppedKeys.has(key(cell))) continue;
      poppedKeys.add(key(cell));
      for (const n of neighbors(cell.row, cell.col)) {
        const connected = cells.find(b => key(b) === key(n) && (b.color === shot.color || b.type === 'rainbow'));
        if (connected && !poppedKeys.has(key(connected))) todo.push(connected);
      }
    }
  }
  const remaining = new Set(player.grid.map(key));
  const removed = cells.filter(b => !remaining.has(key(b)));
  return { popped: removed.filter(b => poppedKeys.has(key(b))), dropped: removed.filter(b => !poppedKeys.has(key(b))) };
}
