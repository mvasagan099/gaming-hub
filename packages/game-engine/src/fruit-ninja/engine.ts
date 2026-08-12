import type { EngineActionResult, EngineEvent, EnginePlayer, RandomSource } from "../types";
import { MultiplayerGameEngine } from "../base/MultiplayerGameEngine";
import type { BaseState } from "../base/MultiplayerGameEngine";
import {
  COUNTDOWN_MS,
  COMBO_THRESHOLD,
  COMBO_WINDOW_MS,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  FLIGHT_TIME_MS,
  GRAVITY,
  MATCH_DURATION_MS,
  MAX_LIVES,
  PHYSICS_TICK_MS,
  SLICE_TIME_TOLERANCE_MS,
  SLICE_TOLERANCE_PX,
} from "./types";
import type {
  BladeSweep,
  FruitNinjaAction,
  FruitNinjaEngineOptions,
  FruitNinjaPlayer,
  FruitNinjaState,
  SpawnEntry,
  Target,
  TargetType,
} from "./types";

const FRUIT_POINTS: Record<TargetType, number> = {
  apple: 10,
  banana: 10,
  orange: 10,
  pear: 10,
  bomb: 0,
  life: 0,
};

const FRUIT_TYPES: readonly TargetType[] = ["apple", "banana", "orange", "pear"];

/**
 * Server-authoritative Fruit Ninja engine.
 *
 * All gameplay lives here: the 3s countdown, the 60s match clock, target
 * spawning and ballistic physics, blade-sweep slice validation, per-player
 * scores/lives/combos, miss handling and elimination. Clients only send blade
 * input (`slice-begin` / `slice-move` / `slice-end` with server-clock stamps);
 * the engine never trusts client scores or fruit coordinates.
 */
export class FruitNinjaEngine extends MultiplayerGameEngine<FruitNinjaState, FruitNinjaAction> {
  readonly gameId = "fruit-ninja" as const;

  constructor(players: EnginePlayer[], rng?: RandomSource, options?: FruitNinjaEngineOptions) {
    super(players, rng, {
      turnTimer: undefined, // Realtime game: no per-turn flag.
      matchTimer: options?.matchTimer ?? { matchDurationMs: MATCH_DURATION_MS, warningThresholdMs: 10000 },
      enableResign: options?.enableResign ?? true,
      enableDraw: false,
      enablePause: false,
      enableRematch: options?.enableRematch ?? true,
      now: options?.now,
    });
  }

  protected getInitialSeat(): number {
    return 0;
  }

  protected initBaseState(): Omit<FruitNinjaState, keyof BaseState> {
    const players: FruitNinjaPlayer[] = this.players.map((p) => ({
      seat: p.seat,
      name: `Player ${p.seat + 1}`,
      score: 0,
      lives: MAX_LIVES,
      combos: 0,
      longestCombo: 0,
      connected: true,
      eliminated: false,
    }));

    return {
      players,
      phase: "waiting",
      countdownEndsAtMs: null,
      targets: [],
      spawnQueue: [],
      nextTargetId: 1,
      lastWaveAtMs: null,
      blades: {},
      nextBladeId: 1,
      scores: players.map(() => 0),
      lastSliceAtMs: players.map(() => 0),
      winnerSeat: null,
    };
  }

  // ─── Clock ─────────────────────────────────────────────────────────────────

  override serialize(): import("@gaming-hub/shared").JsonObject {
    const copy = this.serializeWithLiveTimers(this.state) as unknown as { serverTimeMs?: number };
    copy.serverTimeMs = this.now();
    return copy as unknown as import("@gaming-hub/shared").JsonObject;
  }

  /** Resolve the match when the 60s clock expires: higher score wins, tie = draw. */
  protected onMatchTimerExpired(state: FruitNinjaState): EngineActionResult<FruitNinjaState> {
    return this.resolveByTimer(this.cloneState(state));
  }

  private resolveByTimer(state: FruitNinjaState): EngineActionResult<FruitNinjaState> {
    const p0 = state.scores[0] ?? 0;
    const p1 = state.scores[1] ?? 0;

    let winnerSeats: number[] = [];
    if (p0 > p1) winnerSeats = [0];
    else if (p1 > p0) winnerSeats = [1];

    state.finished = true;
    state.gameOver = true;
    state.phase = "finished";
    state.endReason = "timer_expired";
    state.winnerSeat = winnerSeats[0] ?? null;
    state.winnerSeats = winnerSeats;
    state.turnStartedAtMs = null;
    state.matchStartedAtMs = null;

    return {
      ok: true,
      state,
      events: [{ type: "match-timeout", winnerSeats, endReason: "timer_expired" }],
      finished: true,
      winnerSeats,
    };
  }

  // ─── Physics tick (driven by the MatchManager loop, ~60Hz) ─────────────────

  tick(): { state: FruitNinjaState; events: EngineEvent[]; finished: boolean; winnerSeats: number[] } {
    const now = this.now();
    const state = this.state as FruitNinjaState;

    if (state.finished || state.paused) {
      return { state, events: [], finished: state.finished, winnerSeats: state.winnerSeats ?? [] };
    }

    const events: EngineEvent[] = [];
    let next: FruitNinjaState;

    if (state.phase === "waiting") {
      next = this.cloneState(state);
      next.phase = "countdown";
      next.countdownEndsAtMs = now + COUNTDOWN_MS;
      events.push({ type: "countdown-start", durationMs: COUNTDOWN_MS, countdownEndsAtMs: next.countdownEndsAtMs });
    } else if (state.phase === "countdown") {
      if (now < (state.countdownEndsAtMs ?? Infinity)) {
        next = state;
      } else {
        next = this.cloneState(state);
        next.phase = "playing";
        next.matchStartedAtMs = now;
        events.push({ type: "match-start", matchDurationMs: MATCH_DURATION_MS, matchStartedAtMs: now });
      }
    } else {
      next = this.cloneState(state);
      const deadline = (next.matchStartedAtMs ?? now) + MATCH_DURATION_MS;
      if (now >= deadline) {
        const result = this.resolveByTimer(next);
        this.writeState(result.state);
        return { state: result.state, events: result.events, finished: true, winnerSeats: result.winnerSeats };
      }

      this.processSpawns(next, now, events);
      this.spawnDueTargets(next, now, events);
      this.integrateTargets(next, PHYSICS_TICK_MS / 1000);

      const finished = this.processExpiry(next, now, events);
      if (finished) {
        this.writeState(next);
        return { state: next, events, finished: true, winnerSeats: next.winnerSeats ?? [] };
      }
    }

    this.writeState(next);
    return { state: next, events, finished: next.finished ?? false, winnerSeats: next.winnerSeats ?? [] };
  }

  private writeState(next: FruitNinjaState): void {
    (this as unknown as { _state: FruitNinjaState })._state = next;
  }

  // ─── Spawning ──────────────────────────────────────────────────────────────

  private processSpawns(state: FruitNinjaState, now: number, events: EngineEvent[]): void {
    const leading = Math.max(state.scores[0] ?? 0, state.scores[1] ?? 0);

    // Dynamic difficulty driven by the leading score (same curve as the solo game).
    const delay = Math.max(400, 1100 - leading * 5);
    if (state.lastWaveAtMs !== null && now - state.lastWaveAtMs < delay) return;
    state.lastWaveAtMs = now;

    const maxFruits = Math.min(6, 1 + Math.floor(leading / 50));
    const minFruits = Math.max(1, Math.floor(maxFruits / 2));
    const count = this.randomInt(minFruits, maxFruits);

    for (let i = 0; i < count; i++) {
      state.spawnQueue.push({ type: this.pickTargetType(), spawnTime: now + i * 150 });
    }
  }

  private pickTargetType(): TargetType {
    const roll = this.random();
    if (roll < 0.15) return "bomb";
    if (roll < 0.2) return "life";
    return FRUIT_TYPES[this.randomInt(0, FRUIT_TYPES.length - 1)] as TargetType;
  }

  private spawnDueTargets(state: FruitNinjaState, now: number, events: EngineEvent[]): void {
    const due: SpawnEntry[] = [];
    const pending: SpawnEntry[] = [];
    for (const entry of state.spawnQueue) {
      if (entry.spawnTime <= now) due.push(entry);
      else pending.push(entry);
    }
    state.spawnQueue = pending;
    for (const entry of due) {
      this.createTarget(state, entry, events);
    }
  }

  private createTarget(state: FruitNinjaState, entry: SpawnEntry, events: EngineEvent[]): void {
    const leading = Math.max(state.scores[0] ?? 0, state.scores[1] ?? 0);
    const velMult = Math.min(1.4, 1 + leading / 500);

    const x = this.randomInt(100, FIELD_WIDTH - 100);
    const y = FIELD_HEIGHT + 40;
    const targetX = FIELD_WIDTH / 2 + this.randomInt(-150, 150);
    const flightTimeS = FLIGHT_TIME_MS / 1000 / velMult;
    const vx = (targetX - x) / flightTimeS;
    const vy = (-GRAVITY * (flightTimeS * 0.5) - this.randomInt(20, 80)) * velMult;

    const target: Target = {
      id: state.nextTargetId++,
      type: entry.type,
      x,
      y,
      vx,
      vy,
      rotation: 0,
      spin: this.randomInt(-160, 160),
      spawnTime: entry.spawnTime,
      expiresAt: entry.spawnTime + flightTimeS * 1000,
      slicedBy: [],
      missedBy: [],
      points: FRUIT_POINTS[entry.type],
    };

    state.targets.push(target);
    events.push({ type: "target-spawn", targetId: target.id, target });
  }

  // ─── Ballistics & expiry ───────────────────────────────────────────────────

  private integrateTargets(state: FruitNinjaState, dtSeconds: number): void {
    for (const tg of state.targets) {
      tg.x += tg.vx * dtSeconds;
      tg.y += tg.vy * dtSeconds;
      tg.vy += GRAVITY * dtSeconds;
      tg.rotation += tg.spin * dtSeconds;
    }
  }

  /**
   * Continuous ballistic position (used for slice validation so a client's
   * past sweep stamps map onto the fruit's path).
   */
  private positionAt(tg: Target, tMs: number): { x: number; y: number } {
    const dt = Math.max(0, tMs - tg.spawnTime) / 1000;
    return {
      x: tg.x + tg.vx * dt,
      y: tg.y + tg.vy * dt + 0.5 * GRAVITY * dt * dt,
    };
  }

  /** Expire out-of-reach targets; returns true when a player was eliminated. */
  private processExpiry(state: FruitNinjaState, now: number, events: EngineEvent[]): boolean {
    const remaining: Target[] = [];

    for (const tg of state.targets) {
      const expired = now >= tg.expiresAt || tg.y > FIELD_HEIGHT + 100;
      if (!expired) {
        remaining.push(tg);
        continue;
      }

      const penalize = tg.type !== "bomb" && tg.type !== "life";
      for (const player of this.players) {
        const seat = player.seat;
        if (tg.slicedBy.includes(seat) || tg.missedBy.includes(seat)) continue;
        tg.missedBy.push(seat);

        if (!penalize) continue;

        const p = state.players[seat];
        p.lives = Math.max(0, p.lives - 1);
        p.combos = 0;
        events.push({ type: "target-missed", targetId: tg.id, seat, livesRemaining: p.lives });

        if (p.lives === 0) {
          p.eliminated = true;
          const winnerSeat = seat === 0 ? 1 : 0;
          state.finished = true;
          state.gameOver = true;
          state.phase = "finished";
          state.endReason = "player_eliminated";
          state.winnerSeat = winnerSeat;
          state.winnerSeats = [winnerSeat];
          events.push({ type: "player-eliminated", seat, winnerSeat });
          events.push({ type: "target-expired", targetId: tg.id });
          return true;
        }
      }

      events.push({ type: "target-expired", targetId: tg.id });
    }

    state.targets = remaining;
    return false;
  }

  // ─── Actions (blade input) ─────────────────────────────────────────────────

  protected validateGameAction(action: FruitNinjaAction, seat: number, state: FruitNinjaState): string | null {
    if (state.finished) return "The match is finished";
    switch (action.type) {
      case "slice-fruit":
      case "miss-fruit":
      case "bomb-hit":
      case "resign":
      case "draw-offer":
      case "draw-accept":
      case "draw-decline":
      case "pause":
      case "resume":
        return null;

      case "slice-begin":
      case "slice-move":
      case "slice-end": {
        if (state.phase !== "playing") return "The match is not in progress";
        if (!Number.isFinite(action.x) || !Number.isFinite(action.y) || !Number.isFinite(action.time)) {
          return "Malformed slice input";
        }
        if (Math.abs(action.x) > FIELD_WIDTH * 2 || Math.abs(action.y) > FIELD_HEIGHT * 2) {
          return "Slice is out of bounds";
        }
        const t = action.time;
        const now = this.now();
        if (t < now - SLICE_TIME_TOLERANCE_MS || t > now + 2000) {
          return "Slice timestamp is out of range";
        }
        return null;
      }
      default:
        return "Unknown action";
    }
  }

  protected applyGameAction(action: FruitNinjaAction, seat: number, state: FruitNinjaState): EngineActionResult<FruitNinjaState> {
    const now = this.now();
    const next = this.cloneState(state);
    const events: EngineEvent[] = [];

    const reject = (error: string): EngineActionResult<FruitNinjaState> => ({
      ok: false,
      error,
      state: next,
      events: [],
      finished: next.finished,
      winnerSeats: next.winnerSeats ?? [],
    });

    switch (action.type) {
      case "slice-fruit": {
        const pts = action.points ?? 10;
        next.scores[seat] = (next.scores[seat] ?? 0) + pts;
        const p = next.players[seat];
        if (p) {
          p.score = next.scores[seat];
          p.combos = (p.combos ?? 0) + 1;
          p.longestCombo = Math.max(p.longestCombo ?? 0, p.combos);
        }
        events.push({ type: "fruit-sliced", seat, points: pts, score: next.scores[seat] });
        break;
      }

      case "miss-fruit": {
        const p = next.players[seat];
        if (p) {
          p.combos = 0;
          p.lives = Math.max(0, p.lives - 1);
          events.push({ type: "target-missed", seat, livesRemaining: p.lives });

          if (p.lives === 0) {
            p.eliminated = true;
            const winnerSeat = seat === 0 ? 1 : 0;
            next.finished = true;
            next.gameOver = true;
            next.phase = "finished";
            next.endReason = "player_eliminated";
            next.winnerSeat = winnerSeat;
            next.winnerSeats = [winnerSeat];
            events.push({ type: "player-eliminated", seat, winnerSeat });
          }
        }
        break;
      }

      case "bomb-hit": {
        const p = next.players[seat];
        if (p) {
          p.combos = 0;
        }
        const winnerSeat = seat === 0 ? 1 : 0;
        next.finished = true;
        next.gameOver = true;
        next.phase = "finished";
        next.endReason = "bomb_elimination";
        next.winnerSeat = winnerSeat;
        next.winnerSeats = [winnerSeat];
        events.push({ type: "bomb-hit", seat, winnerSeat });
        break;
      }

      case "resign": {
        const winnerSeat = seat === 0 ? 1 : 0;
        next.finished = true;
        next.gameOver = true;
        next.phase = "finished";
        next.endReason = "resignation";
        next.winnerSeat = winnerSeat;
        next.winnerSeats = [winnerSeat];
        events.push({ type: "resign", seat });
        break;
      }

      case "slice-begin": {
        // A previous un-ended sweep is finalized (safety net for dropped ends).
        if (next.blades[seat]) {
          this.finalizeBlade(next, seat, events, now);
          delete next.blades[seat];
          if (next.finished) break;
        }
        next.blades[seat] = {
          id: next.nextBladeId++,
          seat,
          points: [{ x: action.x, y: action.y, t: action.time }],
        };
        break;
      }

      case "slice-move": {
        const blade = next.blades[seat];
        if (!blade) return reject("No active slice");
        const last = blade.points[blade.points.length - 1];
        if (action.time < last.t) return reject("Slice timestamp out of order");
        if (blade.points.length >= 512) break;
        const dx = action.x - last.x;
        const dy = action.y - last.y;
        if (dx * dx + dy * dy >= 4) {
          blade.points.push({ x: action.x, y: action.y, t: action.time });
        }
        break;
      }

      case "slice-end": {
        const blade = next.blades[seat];
        if (!blade) return reject("No active slice");
        const last = blade.points[blade.points.length - 1];
        if (action.time < last.t) return reject("Slice timestamp out of order");
        blade.points.push({ x: action.x, y: action.y, t: action.time });
        this.finalizeBlade(next, seat, events, now);
        delete next.blades[seat];
        break;
      }

      default:
        return reject("Unknown action");
    }

    return { ok: true, state: next, events, finished: next.finished, winnerSeats: next.winnerSeats ?? [] };
  }

  /**
   * Score a completed blade sweep against every candidate target using the
   * target's deterministic trajectory. A bomb ends the match instantly.
   */
  private finalizeBlade(state: FruitNinjaState, seat: number, events: EngineEvent[], now: number): void {
    const blade: BladeSweep | undefined = state.blades[seat];
    if (!blade || blade.points.length === 0) return;
    const endT = blade.points[blade.points.length - 1].t;

    for (const tg of state.targets) {
      if (tg.slicedBy.includes(seat) || tg.missedBy.includes(seat)) continue;
      if (tg.spawnTime > endT) continue;

      let hit = false;
      for (const p of blade.points) {
        if (p.t < tg.spawnTime) continue;
        if (p.t > tg.expiresAt) break;
        const pos = this.positionAt(tg, p.t);
        const dx = p.x - pos.x;
        const dy = p.y - pos.y;
        const rr = this.targetRadius(tg.type) + SLICE_TOLERANCE_PX;
        if (dx * dx + dy * dy <= rr * rr) {
          hit = true;
          break;
        }
      }
      if (!hit) continue;

      if (tg.type === "bomb") {
        tg.slicedBy.push(seat);
        const winnerSeat = seat === 0 ? 1 : 0;
        state.finished = true;
        state.gameOver = true;
        state.phase = "finished";
        state.endReason = "bomb_elimination";
        state.winnerSeat = winnerSeat;
        state.winnerSeats = [winnerSeat];
        events.push({ type: "bomb-hit", targetId: tg.id, seat, winnerSeat });
        events.push({ type: "target-expired", targetId: tg.id });
        return;
      }

      tg.slicedBy.push(seat);

      if (tg.type === "life") {
        const player = state.players[seat];
        player.lives = Math.min(MAX_LIVES, player.lives + 1);
        events.push({ type: "life-gained", targetId: tg.id, seat, livesRemaining: player.lives });
        continue;
      }

      const player = state.players[seat];
      state.scores[seat] = (state.scores[seat] ?? 0) + tg.points;
      player.score = state.scores[seat];

      const prev = state.lastSliceAtMs[seat] ?? 0;
      player.combos = endT - prev <= COMBO_WINDOW_MS ? (player.combos ?? 0) + 1 : 1;
      player.longestCombo = Math.max(player.longestCombo, player.combos);
      state.lastSliceAtMs[seat] = endT;

      events.push({
        type: "fruit-sliced",
        targetId: tg.id,
        seat,
        points: tg.points,
        score: state.scores[seat],
        combo: player.combos,
      });

      if (player.combos >= COMBO_THRESHOLD) {
        const bonus = player.combos * 10;
        state.scores[seat] += bonus;
        player.score = state.scores[seat];
        events.push({ type: "combo-bonus", seat, comboCount: player.combos, bonus, score: state.scores[seat] });
        player.combos = 0;
      }
    }
  }

  private targetRadius(type: TargetType): number {
    switch (type) {
      case "apple":
        return 32;
      case "banana":
        return 30;
      case "orange":
        return 34;
      case "pear":
        return 32;
      case "bomb":
        return 32;
      case "life":
        return 30;
    }
  }
}
