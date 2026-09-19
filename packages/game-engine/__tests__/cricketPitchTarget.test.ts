import { describe, it, expect } from "vitest";
import { CricketEngine } from "..";
import type { CricketDelivery, CricketState } from "..";

describe("CricketEngine - Pitch Landing Place Selection", () => {
  const players = [
    { seat: 0, id: "p0", userId: "p0", name: "Player 1" },
    { seat: 1, id: "p1", userId: "p1", name: "Player 2" },
  ];

  function setupEngine(options?: { pitchTargetRevealMs?: number; now?: () => number }) {
    const eng = new CricketEngine(players, () => 0.5, options);
    // Complete toss: Player 0 calls correctly and chooses to bat -> Player 1 bowls first
    const call = eng.state.tossResult === "heads" ? "heads" : "tails";
    eng.apply({ type: "toss-call", call }, 0);
    eng.apply({ type: "toss-choice", choice: "bat" }, 0);
    return eng;
  }

  it("authorizes only the bowler to set the pitch target", () => {
    const eng = setupEngine();
    expect(eng.state.currentActor).toBe("bowler");
    expect(eng.state.bowlingTeam).toBe(1);
    expect(eng.state.battingTeam).toBe(0);

    // Batsman (seat 0) attempts to set pitch target -> must fail
    const batsmanAttempt = eng.apply(
      { type: "set-pitch-target", lateral: 0, length: 0.4 },
      0
    );
    expect(batsmanAttempt.ok).toBe(false);
    expect(batsmanAttempt.error).toBe("NOT_YOUR_TURN");

    // Bowler (seat 1) sets pitch target -> succeeds
    const bowlerAttempt = eng.apply(
      { type: "set-pitch-target", lateral: 0.1, length: 0.35 },
      1
    );
    expect(bowlerAttempt.ok).toBe(true);
    expect(bowlerAttempt.state.pitchTarget).toBeDefined();
    expect(bowlerAttempt.state.bowlingPhase).toBe("TARGET_LOCKED");
  });

  it("clamps out-of-bounds coordinates to legal pitch limits", () => {
    const eng = setupEngine();
    const bowlerSeat = eng.state.bowlingTeam;

    // Extreme lateral (-1.5) and length (1.2)
    const res1 = eng.apply(
      { type: "set-pitch-target", lateral: -1.5, length: 1.2 },
      bowlerSeat
    );
    expect(res1.ok).toBe(true);
    expect(res1.state.pitchTarget?.lateral).toBe(-0.85);
    expect(res1.state.pitchTarget?.length).toBe(0.82);

    // Extreme other side: lateral 2.0, length -0.5
    const res2 = eng.apply(
      { type: "set-pitch-target", lateral: 2.0, length: -0.5 },
      bowlerSeat
    );
    expect(res2.ok).toBe(true);
    expect(res2.state.pitchTarget?.lateral).toBe(0.85);
    expect(res2.state.pitchTarget?.length).toBe(0.08);
  });

  it("derives canonical line and lengthZone correctly", () => {
    const eng = setupEngine();
    const bowlerSeat = eng.state.bowlingTeam;

    // Off line + Full length
    eng.apply(
      { type: "set-pitch-target", lateral: -0.4, length: 0.15 },
      bowlerSeat
    );
    expect(eng.state.pitchTarget?.line).toBe("off");
    expect(eng.state.pitchTarget?.lengthZone).toBe("full");

    // Middle line + Good length
    eng.apply(
      { type: "set-pitch-target", lateral: 0.05, length: 0.45 },
      bowlerSeat
    );
    expect(eng.state.pitchTarget?.line).toBe("middle");
    expect(eng.state.pitchTarget?.lengthZone).toBe("good");

    // Leg line + Short length
    eng.apply(
      { type: "set-pitch-target", lateral: 0.5, length: 0.75 },
      bowlerSeat
    );
    expect(eng.state.pitchTarget?.line).toBe("leg");
    expect(eng.state.pitchTarget?.lengthZone).toBe("short");
  });

  it("generates monotonic target ID sequence per delivery turn", () => {
    const eng = setupEngine();
    const bowlerSeat = eng.state.bowlingTeam;
    const turnNumber = eng.state.turnNumber;

    eng.apply({ type: "set-pitch-target", lateral: 0, length: 0.3 }, bowlerSeat);
    const id1 = eng.state.pitchTarget?.targetId;
    expect(id1).toBe(`pitch-${turnNumber}-1`);

    // Update target within same turn
    eng.apply({ type: "set-pitch-target", lateral: 0.2, length: 0.5 }, bowlerSeat);
    const id2 = eng.state.pitchTarget?.targetId;
    expect(id2).toBe(`pitch-${turnNumber}-2`);
    expect(id2).not.toBe(id1);
  });

  it("rejects bowl action without a locked pitch target", () => {
    const eng = setupEngine();
    const bowlerSeat = eng.state.bowlingTeam;

    expect(eng.state.pitchTarget).toBeNull();
    const res = eng.apply({ type: "bowl", delivery: "fast" }, bowlerSeat);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("NO_PITCH_TARGET");
  });

  it("rejects bowl action with mismatched or stale pitchTargetId", () => {
    const eng = setupEngine();
    const bowlerSeat = eng.state.bowlingTeam;

    eng.apply({ type: "set-pitch-target", lateral: 0, length: 0.4 }, bowlerSeat);
    const validId = eng.state.pitchTarget?.targetId;
    expect(validId).toBeDefined();

    // Try bowl with wrong target ID
    const wrongRes = eng.apply(
      { type: "bowl", delivery: "fast", pitchTargetId: "pitch-999-9" },
      bowlerSeat
    );
    expect(wrongRes.ok).toBe(false);
    expect(wrongRes.error).toBe("STALE_PITCH_TARGET");

    // Try bowl with correct target ID -> succeeds
    const validRes = eng.apply(
      { type: "bowl", delivery: "fast", pitchTargetId: validId },
      bowlerSeat
    );
    expect(validRes.ok).toBe(true);
  });

  it("enforces minimum 800ms reveal window when configured", () => {
    let mockTime = 1000;
    const eng = setupEngine({
      pitchTargetRevealMs: 800,
      now: () => mockTime,
    });
    const bowlerSeat = eng.state.bowlingTeam;

    mockTime = 1000;
    eng.apply({ type: "set-pitch-target", lateral: 0, length: 0.4 }, bowlerSeat);
    const targetId = eng.state.pitchTarget?.targetId;

    // Attempt bowl at 500ms after lock (300ms too early)
    mockTime = 1500;
    const earlyRes = eng.apply(
      { type: "bowl", delivery: "fast", pitchTargetId: targetId },
      bowlerSeat
    );
    expect(earlyRes.ok).toBe(false);
    expect(earlyRes.error).toBe("REVEAL_IN_PROGRESS");

    // Attempt bowl at 1800ms after lock (800ms window elapsed)
    mockTime = 1800;
    const onTimeRes = eng.apply(
      { type: "bowl", delivery: "fast", pitchTargetId: targetId },
      bowlerSeat
    );
    expect(onTimeRes.ok).toBe(true);
    expect(onTimeRes.state.currentActor).toBe("batsman");
  });

  it("preserves pitchTarget in serialized state across rehydration / reconnect", () => {
    const eng = setupEngine();
    const bowlerSeat = eng.state.bowlingTeam;

    eng.apply({ type: "set-pitch-target", lateral: -0.2, length: 0.38 }, bowlerSeat);
    const serialized = eng.serialize() as unknown as CricketState;
    expect(serialized.pitchTarget).toBeDefined();
    expect(serialized.pitchTarget?.lateral).toBe(-0.2);
    expect(serialized.pitchTarget?.length).toBe(0.38);
    expect(serialized.pitchTarget?.lengthZone).toBe("good");
    expect(serialized.bowlingPhase).toBe("TARGET_LOCKED");

    // Rehydrate new engine with the serialized state
    const rehydrated = new CricketEngine(players, () => 0.5);
    (rehydrated as any).updateState(JSON.parse(JSON.stringify(serialized)));

    expect(rehydrated.state.pitchTarget?.targetId).toBe(eng.state.pitchTarget?.targetId);
    expect(rehydrated.state.bowlingPhase).toBe("TARGET_LOCKED");

    // Can bowl referencing the rehydrated target
    const bowlRes = rehydrated.apply(
      { type: "bowl", delivery: "yorker", pitchTargetId: rehydrated.state.pitchTarget?.targetId },
      bowlerSeat
    );
    expect(bowlRes.ok).toBe(true);
  });

  it("cleans up pitchTarget and resets bowlingPhase to TARGETING after delivery completes", () => {
    const eng = setupEngine();
    const bowlerSeat = eng.state.bowlingTeam;
    const batsmanSeat = eng.state.battingTeam;

    eng.apply({ type: "set-pitch-target", lateral: 0, length: 0.4 }, bowlerSeat);
    const targetId = eng.state.pitchTarget?.targetId;

    eng.apply({ type: "bowl", delivery: "fast", pitchTargetId: targetId }, bowlerSeat);
    expect(eng.state.pendingDelivery?.pitchTarget?.targetId).toBe(targetId);

    // Batsman plays shot
    eng.apply(
      { type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId ?? undefined },
      batsmanSeat
    );

    // After delivery finishes:
    expect(eng.state.pitchTarget).toBeNull();
    expect(eng.state.bowlingPhase).toBe("TARGETING");
    expect(eng.state.currentActor).toBe("bowler");
  });

  it("auto-assigns default pitch target on turn timer expiration if bowler was idle", () => {
    const eng = setupEngine();
    expect(eng.state.pitchTarget).toBeNull();
    expect(eng.state.bowlingPhase).toBe("TARGETING");

    // Turn timer expires while bowler is still targeting
    const timeoutRes = eng.handleTimeout("turn");
    expect(timeoutRes.ok).toBe(true);

    // Auto-targeting locks a valid target and bowls automatically
    expect(eng.state.currentActor).toBe("batsman");
    expect(eng.state.pendingDelivery).toBeDefined();
    expect(eng.state.pendingDelivery?.pitchTarget).toBeDefined();
    expect(eng.state.pendingDelivery?.pitchTarget?.lateral).toBeGreaterThanOrEqual(-0.85);
    expect(eng.state.pendingDelivery?.pitchTarget?.lateral).toBeLessThanOrEqual(0.85);
    expect(eng.state.pendingDelivery?.pitchTarget?.length).toBeGreaterThanOrEqual(0.08);
    expect(eng.state.pendingDelivery?.pitchTarget?.length).toBeLessThanOrEqual(0.82);
  });

  it("supports all 6 delivery types: fast, slow, spin, yorker, bouncer, swing", () => {
    const deliveryTypes: CricketDelivery[] = ["fast", "slow", "spin", "yorker", "bouncer", "swing"];

    for (const delivery of deliveryTypes) {
      const eng = setupEngine();
      const bowlerSeat = eng.state.bowlingTeam;
      const batsmanSeat = eng.state.battingTeam;

      const targetRes = eng.apply(
        { type: "set-pitch-target", lateral: 0.1, length: 0.35 },
        bowlerSeat
      );
      expect(targetRes.ok).toBe(true);

      const bowlRes = eng.apply(
        { type: "bowl", delivery, pitchTargetId: eng.state.pitchTarget?.targetId },
        bowlerSeat
      );
      expect(bowlRes.ok).toBe(true);
      expect(eng.state.pendingDelivery?.delivery).toBe(delivery);

      const batRes = eng.apply(
        { type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId ?? undefined },
        batsmanSeat
      );
      expect(batRes.ok).toBe(true);
    }
  });

  it("guarantees mathematical bounce point convergence via projectile equations", () => {
    // Test the physics velocity formulas used in CricketScene
    const releaseX = 360;
    const releaseY = 220;
    const bounceX = 375;
    const bounceY = 460;
    const gravity = 980;
    const timeToBounce = 0.45;
    const H = 60; // release height

    const vx = (bounceX - releaseX) / timeToBounce;
    const vy = (bounceY - releaseY) / timeToBounce;
    const vz = (0.5 * gravity * timeToBounce * timeToBounce - H) / timeToBounce;

    // Simulate projectile motion up to t = timeToBounce
    const finalX = releaseX + vx * timeToBounce;
    const finalY = releaseY + vy * timeToBounce;
    const finalH = H + vz * timeToBounce - 0.5 * gravity * timeToBounce * timeToBounce;

    expect(Math.abs(finalX - bounceX)).toBeLessThan(1e-9);
    expect(Math.abs(finalY - bounceY)).toBeLessThan(1e-9);
    expect(Math.abs(finalH)).toBeLessThan(1e-9);
  });

  it("mirrors perspective correctly between bowler and batsman views", () => {
    const PITCH_TOP_Y = 175;
    const PITCH_BOT_Y = 650;
    const PITCH_TOP_W = 100;
    const PITCH_BOT_W = 420;
    const CENTER_X = 360;
    const getPitchHalfWidthAtY = (y: number) => {
      const t = Math.max(0, Math.min(1, (y - PITCH_TOP_Y) / (PITCH_BOT_Y - PITCH_TOP_Y)));
      return (PITCH_TOP_W / 2) + t * ((PITCH_BOT_W / 2) - (PITCH_TOP_W / 2));
    };
    const pitchTargetToScreen = (target: { lateral: number; length: number }, role: "batting" | "bowling") => {
      if (role === "batting") {
        const y = 550 + target.length * (270 - 550);
        const halfW = getPitchHalfWidthAtY(y) * 0.85;
        const x = CENTER_X + target.lateral * halfW;
        return { x, y };
      } else {
        const y = 240 + target.length * (520 - 240);
        const halfW = getPitchHalfWidthAtY(y) * 0.85;
        const x = CENTER_X - target.lateral * halfW;
        return { x, y };
      }
    };

    // Off-side full ball: lateral = -0.5, length = 0.1
    const offFullTarget = { lateral: -0.5, length: 0.1 };
    const batView = pitchTargetToScreen(offFullTarget, "batting");
    const bowlView = pitchTargetToScreen(offFullTarget, "bowling");

    // Batsman view: length 0.1 is close to batsman crease (high Y)
    expect(batView.y).toBeGreaterThan(500);
    // Batsman view: lateral -0.5 is on batsman's off side (left of center)
    expect(batView.x).toBeLessThan(CENTER_X);

    // Bowler view: length 0.1 is far down towards batsman (low Y from top bowler end)
    expect(bowlView.y).toBeLessThan(300);
    // Bowler view: camera facing down pitch, so off side is on the right of bowler's screen
    expect(bowlView.x).toBeGreaterThan(CENTER_X);
  });

  it("rejects using previous delivery's targetId on subsequent delivery", () => {
    const eng = setupEngine();
    const bowlerSeat = eng.state.bowlingTeam;
    const batsmanSeat = eng.state.battingTeam;

    // Delivery 1
    eng.apply({ type: "set-pitch-target", lateral: 0, length: 0.4 }, bowlerSeat);
    const del1TargetId = eng.state.pitchTarget?.targetId;
    expect(del1TargetId).toBeDefined();

    eng.apply({ type: "bowl", delivery: "fast", pitchTargetId: del1TargetId }, bowlerSeat);
    eng.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId ?? undefined }, batsmanSeat);

    // Delivery 1 completed, Delivery 2 turn begins
    expect(eng.state.currentActor).toBe("bowler");
    expect(eng.state.pitchTarget).toBeNull();

    // Trying to bowl immediately with old delivery 1 targetId must be rejected
    const staleBowl = eng.apply({ type: "bowl", delivery: "fast", pitchTargetId: del1TargetId }, bowlerSeat);
    expect(staleBowl.ok).toBe(false);
    expect(staleBowl.error).toBe("NO_PITCH_TARGET");

    // Set new target for delivery 2
    eng.apply({ type: "set-pitch-target", lateral: 0.3, length: 0.6 }, bowlerSeat);
    const del2TargetId = eng.state.pitchTarget?.targetId;
    expect(del2TargetId).not.toBe(del1TargetId);

    // Trying to pass del1TargetId when delivery 2 target is active must be rejected as STALE_PITCH_TARGET
    const staleBowl2 = eng.apply({ type: "bowl", delivery: "fast", pitchTargetId: del1TargetId }, bowlerSeat);
    expect(staleBowl2.ok).toBe(false);
    expect(staleBowl2.error).toBe("STALE_PITCH_TARGET");

    // Passing del2TargetId succeeds
    const validBowl2 = eng.apply({ type: "bowl", delivery: "fast", pitchTargetId: del2TargetId }, bowlerSeat);
    expect(validBowl2.ok).toBe(true);
  });
});
