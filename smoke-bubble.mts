import { BubbleShooterEngine } from "./packages/game-engine/src/bubble-shooter/engine";
import type { BubbleShooterServerState } from "./packages/game-engine/src/bubble-shooter/types";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RADIUS = 11;
const DIAMETER = RADIUS * 2;
const COLS = 13;
const ROW_HEIGHT = RADIUS * Math.sqrt(3);
const CANVAS_WIDTH = COLS * DIAMETER;
const SHOOTER_X = CANVAS_WIDTH / 2;
const SHOOTER_Y = 435;

function randomAngle(rng: () => number): number {
  // Aim at a random point well above the shooter so the bubble travels upward.
  const tx = rng() * CANVAS_WIDTH;
  const ty = rng() * 200;
  return Math.atan2(ty - SHOOTER_Y, tx - SHOOTER_X);
}

interface PlayerView {
  seat: number;
  grid: { row: number; col: number; color: string; type: string }[];
  topOffset: number;
  nextBubble: { color: string; type: string };
  score: number;
  status: string;
}

function playersOf(state: BubbleShooterServerState): PlayerView[] {
  return state.players as unknown as PlayerView[];
}

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`  FAIL: ${msg}`);
  }
}

console.log("== Termination (random play, 2p and 4p) ==");
for (let seed = 1; seed <= 20; seed++) {
  const n = seed % 2 === 0 ? 4 : 2;
  const engine = new BubbleShooterEngine(
    Array.from({ length: n }, (_, i) => ({ userId: `u${i}`, seat: i })),
    mulberry32(seed * 7919),
  );
  let shots = 0;
  let rejects = 0;
  const cap = 1000;
  while (!engine.finished && shots < cap && rejects < 200) {
    const active = playersOf(engine.state as BubbleShooterServerState).filter((p) => p.status === "playing");
    if (active.length === 0) break;
    const seat = active[shots % active.length].seat;
    const res = engine.apply({ type: "shoot", angle: randomAngle(mulberry32(seed * 31 + shots)) }, seat);
    if (res.ok) shots++;
    else rejects++;
  }
  const state = engine.state as BubbleShooterServerState;
  assert(engine.finished, `seed ${seed}: finished within ${shots} shots`);
  if (engine.finished) {
    assert(state.winnerSeats.length <= 1, `seed ${seed}: at most one winner`);
    if (state.winnerSeats.length === 1) {
      const w = playersOf(state).find((p) => p.seat === state.winnerSeats[0]);
      assert(w?.status === "won", `seed ${seed}: winner status is won`);
    } else {
      const allDone = playersOf(state).every((p) => p.status !== "playing");
      assert(allDone, `seed ${seed}: draw implies everyone finished`);
    }
  }
}
console.log(`  ${pass} pass / ${fail} fail`);

console.log("== Determinism (same seed + same actions -> same state) ==");
{
  const seed = 12345;
  const mk = () =>
    new BubbleShooterEngine(
      Array.from({ length: 3 }, (_, i) => ({ userId: `u${i}`, seat: i })),
      mulberry32(seed),
    );
  const a = mk();
  const b = mk();
  const actions: { seat: number; angle: number }[] = [];
  const ra = mulberry32(seed * 7);
  for (let i = 0; i < 60; i++) {
    actions.push({ seat: i % 3, angle: randomAngle(ra) });
  }
  for (const act of actions) {
    a.apply({ type: "shoot", angle: act.angle }, act.seat);
    b.apply({ type: "shoot", angle: act.angle }, act.seat);
  }
  assert(JSON.stringify(a.serialize()) === JSON.stringify(b.serialize()), "states match after identical action stream");
}
console.log(`  ${pass} pass / ${fail} fail`);

console.log("== Validation ==");
{
  const engine = new BubbleShooterEngine(
    [
      { userId: "u0", seat: 0 },
      { userId: "u1", seat: 1 },
    ],
    mulberry32(999),
  );
  // Downward shot rejected.
  const down = engine.apply({ type: "shoot", angle: Math.PI / 2 }, 0);
  assert(!down.ok, "downward angle rejected");
  assert(down.error === "Aim upward", "downward angle gives Aim upward error");
  // Bad angle type rejected.
  const bad = engine.apply({ type: "shoot", angle: "x" as unknown as number }, 0);
  assert(!bad.ok, "non-numeric angle rejected");
  // Unknown action rejected.
  const unknown = engine.apply({ type: "move", tokenId: "x" } as never, 0);
  assert(!unknown.ok, "unknown action rejected");
  // Seat not in match rejected.
  const ghost = engine.apply({ type: "shoot", angle: -1 }, 7);
  assert(!ghost.ok, "unknown seat rejected");
  // A legal shot passes.
  const legal = engine.apply({ type: "shoot", angle: -Math.PI / 3 }, 1);
  assert(legal.ok, "legal upward shot accepted");
}
console.log(`  ${pass} pass / ${fail} fail`);

console.log("== Branch coverage (crafted states) ==");
{
  const ROW_HEIGHT_B = RADIUS * Math.sqrt(3);
  const craft = (seed: number) =>
    new BubbleShooterEngine(
      [
        { userId: "u0", seat: 0 },
        { userId: "u1", seat: 1 },
      ],
      mulberry32(seed),
    );
  const setPlayer = (state: BubbleShooterServerState, seat: number, patch: Partial<PlayerView> & { grid: unknown; nextBubble: unknown }) => {
    const p = playersOf(state).find((x) => x.seat === seat)!;
    Object.assign(p, patch);
    return p;
  };

  // A) Clearing the board -> win.
  {
    const engine = craft(101);
    const s = engine.state as BubbleShooterServerState;
    setPlayer(s, 0, {
      grid: [
        { row: 0, col: 0, color: "#fb7185", type: "normal" },
        { row: 0, col: 1, color: "#fb7185", type: "normal" },
      ],
      topOffset: 0,
      shotsFired: 0,
      nextBubble: { color: "#fb7185", type: "normal" },
    });
    // Aim at the cell just below the gap between the two bubbles so the fired
    // bubble snaps to (1,0) and forms a 3-match.
    const angle = Math.atan2(11 + 1 * ROW_HEIGHT_B - SHOOTER_Y, 2 * RADIUS - SHOOTER_X);
    const res = engine.apply({ type: "shoot", angle }, 0);
    assert(res.ok, "win shot accepted");
    assert(engine.finished, "clearing the board finishes the match");
    const s2 = engine.state as BubbleShooterServerState;
    assert(s2.winnerSeats.includes(0), "winner is seat 0");
    assert(playersOf(s2).find((p) => p.seat === 0)!.status === "won", "winner status is won");
    assert(s2.result === "win", "result is win");
  }

  // B) Overflow -> eliminated, match continues for the other player.
  {
    const engine = craft(202);
    const s = engine.state as BubbleShooterServerState;
    setPlayer(s, 0, {
      grid: [{ row: 25, col: 0, color: "#34d399", type: "normal" }],
      topOffset: 0,
      shotsFired: 0,
      nextBubble: { color: "#818cf8", type: "normal" },
    });
    const res = engine.apply({ type: "shoot", angle: -Math.PI / 2 }, 0);
    assert(res.ok, "elimination shot accepted");
    const s2 = engine.state as BubbleShooterServerState;
    assert(playersOf(s2).find((p) => p.seat === 0)!.status === "eliminated", "player 0 eliminated");
    assert(!engine.finished, "match continues while seat 1 is still playing");
  }

  // C) Everyone eliminated, nobody won -> draw.
  {
    const engine = craft(303);
    const s = engine.state as BubbleShooterServerState;
    setPlayer(s, 0, { status: "eliminated" });
    setPlayer(s, 1, {
      grid: [{ row: 25, col: 0, color: "#34d399", type: "normal" }],
      topOffset: 0,
      shotsFired: 0,
      nextBubble: { color: "#818cf8", type: "normal" },
    });
    const res = engine.apply({ type: "shoot", angle: -Math.PI / 2 }, 1);
    assert(res.ok, "draw shot accepted");
    assert(engine.finished, "all players done -> match finished");
    const s2 = engine.state as BubbleShooterServerState;
    assert(s2.winnerSeats.length === 0, "draw has no winners");
    assert(s2.result === "draw", "result is draw");
  }

  // D) Bomb always pops regardless of cluster size.
  {
    const engine = craft(404);
    const s = engine.state as BubbleShooterServerState;
    setPlayer(s, 0, {
      grid: [{ row: 0, col: 5, color: "#fb7185", type: "normal" }],
      topOffset: 0,
      shotsFired: 0,
      nextBubble: { color: "#000000", type: "bomb" },
    });
    // Aim straight up so it snaps to (0,6); (0,5) sits in the bomb's 1-ring.
    const res = engine.apply({ type: "shoot", angle: -Math.PI / 2 }, 0);
    assert(res.ok, "bomb shot accepted");
    const s2 = engine.state as BubbleShooterServerState;
    assert(playersOf(s2).find((p) => p.seat === 0)!.status === "won", "bomb cleared the single bubble -> win");
  }
}
console.log(`  ${pass} pass / ${fail} fail`);

console.log(`\nTOTAL: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
