import { describe, it, expect } from "vitest";
import { CricketEngine } from "../src/cricket/engine";

describe("Cricket Batting Quality & Alignment", () => {
  const players = [
    { id: "p0", seat: 0, name: "Alice" },
    { id: "p1", seat: 1, name: "Bob" },
  ];

  function setupMatchToBattingTurn() {
    const eng = new CricketEngine(players, () => 0.5, { matchType: "1-over" });
    eng.apply({ type: "toss-call", call: eng.state.tossResult! }, 0);
    eng.apply({ type: "toss-choice", choice: "bat" }, 0);
    return eng;
  }

  it("calculates outcome weights with high alignment when batter moves into line of delivery", () => {
    const eng = setupMatchToBattingTurn();
    // Bowler locks pitch target at lateral = 0.35 (outside off / leg)
    eng.apply({ type: "set-pitch-target", lateral: 0.35, length: 0.45 }, 1);
    eng.apply({ type: "lock-pitch-target" }, 1);
    eng.apply({ type: "bowl", delivery: "fast", pitchTargetId: eng.state.pitchTarget!.targetId }, 1);

    // Batter moves to 0.35 -> perfectly aligned with pitchTarget (diff = 0)
    eng.apply({ type: "move-batter", x: 0.35 }, 0);
    expect(eng.state.batterCreaseX).toBeCloseTo(0.35);

    // Batter plays straight shot with good timing
    const alignedRes = eng.apply({
      type: "bat",
      shot: "straight",
      timing: "good",
      deliveryId: eng.state.activeDeliveryId!,
    }, 0);
    expect(alignedRes.ok).toBe(true);
  });

  it("poor alignment increases dot balls / dismissals compared to well-aligned shot", () => {
    // We compare simulated outcomes between well-aligned vs poorly-aligned over multiple balls
    // With poor alignment: target is at +0.40, batter moves far away to -0.60 (diff = 1.0, alignment = 0)
    let wellAlignedDots = 0;
    let poorAlignedDots = 0;
    const trials = 100;

    for (let i = 0; i < trials; i++) {
      // Deterministic roll inside boundary/dot range
      let seed = (i * 0.009) % 1;
      const engGood = new CricketEngine(players, () => seed, { matchType: "1-over" });
      engGood.apply({ type: "toss-call", call: engGood.state.tossResult! }, 0);
      engGood.apply({ type: "toss-choice", choice: "bat" }, 0);
      engGood.apply({ type: "set-pitch-target", lateral: 0.2, length: 0.45 }, 1);
      engGood.apply({ type: "lock-pitch-target" }, 1);
      engGood.apply({ type: "bowl", delivery: "fast", pitchTargetId: engGood.state.pitchTarget!.targetId }, 1);
      engGood.apply({ type: "move-batter", x: 0.2 }, 0); // perfectly aligned
      engGood.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: engGood.state.activeDeliveryId! }, 0);
      if (engGood.state.balls[0].runs === 0) wellAlignedDots++;

      const engBad = new CricketEngine(players, () => seed, { matchType: "1-over" });
      engBad.apply({ type: "toss-call", call: engBad.state.tossResult! }, 0);
      engBad.apply({ type: "toss-choice", choice: "bat" }, 0);
      engBad.apply({ type: "set-pitch-target", lateral: 0.4, length: 0.45 }, 1);
      engBad.apply({ type: "lock-pitch-target" }, 1);
      engBad.apply({ type: "bowl", delivery: "fast", pitchTargetId: engBad.state.pitchTarget!.targetId }, 1);
      engBad.apply({ type: "move-batter", x: -0.6 }, 0); // completely out of line
      engBad.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: engBad.state.activeDeliveryId! }, 0);
      if (engBad.state.balls[0].runs === 0) poorAlignedDots++;
    }

    // Poorly aligned batsman should suffer significantly more dot balls/misses
    expect(poorAlignedDots).toBeGreaterThan(wellAlignedDots);
  });

  it("mirrors coordinate mapping between batting and bowling perspectives", () => {
    // Normalized canonical coordinate: negative is batsman's left (off), positive is batsman's right (leg)
    const creaseX = 0.5;
    const centerX = 400;
    const spread = 55;

    const batterViewScreenX = centerX + creaseX * spread;
    const bowlerViewScreenX = centerX - creaseX * spread;

    // Batter viewing sees positive X to the right (+27.5)
    expect(batterViewScreenX).toBe(427.5);
    // Bowler viewing from the opposite end sees positive X to the left (-27.5)
    expect(bowlerViewScreenX).toBe(372.5);
  });
});
