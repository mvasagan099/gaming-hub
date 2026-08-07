import { CricketEngine } from "..";
import type { CricketAction, CricketMatchType } from "..";

describe("CricketEngine", () => {
  const players = [
    { seat: 0, id: "p0", name: "Player 1" },
    { seat: 1, id: "p1", name: "Player 2" },
  ];

  /** Fixed RNG: toss picks seat 1 to bat first, and every roll is high. */
  function setup(options?: { matchType?: CricketMatchType }) {
    return new CricketEngine(players, () => 0.9, options);
  }

  function bowl(eng: CricketEngine, action: { type: "bowl"; delivery: "fast" | "slow" | "spin" } = { type: "bowl", delivery: "fast" }) {
    return eng.apply(action, eng.state.bowlingTeam);
  }

  function bat(eng: CricketEngine, shot: "straight" | "left" | "right" | "up" = "straight", timing?: "early" | "good" | "late") {
    const action: CricketAction = { type: "bat", shot, timing };
    return eng.apply(action, eng.state.battingTeam);
  }

  /** Bowl + bat = one legal delivery. */
  function ball(eng: CricketEngine, opts: { shot?: "straight" | "left" | "right" | "up"; timing?: "early" | "good" | "late" } = {}) {
    const r1 = bowl(eng);
    expect(r1.ok).toBe(true);
    return bat(eng, opts.shot, opts.timing);
  }

  it("random toss assigns one team to bat first", () => {
    const eng = setup();
    const s = eng.state;
    expect(s.battingFirst).toBe(1);
    expect(s.battingTeam).toBe(1);
    expect(s.bowlingTeam).toBe(0);
    expect(s.currentSeat).toBe(0);
    expect(s.currentActor).toBe("bowler");
    expect(s.totalOvers).toBe(5);
  });

  it("can customize match type", () => {
    const eng = setup({ matchType: "1-over" });
    expect(eng.state.totalOvers).toBe(1);
  });

  it("only the bowling side can bowl", () => {
    const eng = setup();
    const res = eng.apply({ type: "bowl", delivery: "fast" }, 1);
    expect(res.ok).toBe(false);
  });

  it("bowl action hands the turn to the batsman without scoring", () => {
    const eng = setup();
    const res = bowl(eng);
    expect(res.ok).toBe(true);
    const s = res.state;
    expect(s.currentActor).toBe("batsman");
    expect(s.currentSeat).toBe(1);
    expect(s.currentBall).toBe(0);
    expect(s.team2Score).toBe(0);
    expect(s.pendingDelivery).not.toBeNull();
  });

  it("bat action resolves the delivery and advances the ball", () => {
    const eng = setup();
    const res = ball(eng);
    expect(res.ok).toBe(true);
    const s = res.state;
    expect(s.currentBall).toBe(1);
    expect(s.currentActor).toBe("bowler");
    expect(s.currentSeat).toBe(0);
    expect(s.balls.length).toBe(1);
    expect(s.team2Score).toBeGreaterThanOrEqual(0);
  });

  it("advances to the next over after 6 balls", () => {
    const eng = setup();
    for (let i = 0; i < 6; i++) {
      const r = ball(eng);
      expect(r.ok).toBe(true);
    }
    const s = eng.state;
    expect(s.currentOver).toBe(1);
    expect(s.currentBall).toBe(0);
  });

  it("swaps roles and sets a target after the first innings", () => {
    const eng = setup({ matchType: "1-over" });
    for (let i = 0; i < 6; i++) {
      const r = ball(eng);
      expect(r.ok).toBe(true);
    }
    const s = eng.state;
    expect(s.inning).toBe(2);
    expect(s.target).toBe(s.team1Score + 1);
    expect(s.battingTeam).toBe(0);
    expect(s.bowlingTeam).toBe(1);
  });

  it("ends the match when both innings are complete", () => {
    const eng = setup({ matchType: "1-over" });
    for (let i = 0; i < 6; i++) ball(eng);
    for (let i = 0; i < 6; i++) ball(eng);
    const s = eng.state;
    expect(s.finished).toBe(true);
    expect(s.gameOver).toBe(true);
    expect(s.winnerSeats.length).toBeGreaterThanOrEqual(0);
  });

  it("ends immediately when the chasing side reaches the target", () => {
    // Deterministic: seat 1 bats first (toss roll 0.9), scores 0 in innings 1,
    // then chases a target of 1 and hits it on the first ball of the chase.
    const seq = [0.9, ...new Array(6).fill(0.05), 0.9, 0.9];
    let i = 0;
    const eng = new CricketEngine(players, () => seq[i++], { matchType: "1-over" });

    expect(eng.state.battingFirst).toBe(1);
    for (let b = 0; b < 6; b++) ball(eng);
    expect(eng.state.inning).toBe(2);
    expect(eng.state.target).toBe(1);

    const r = bowl(eng);
    expect(r.ok).toBe(true);
    const res = bat(eng, "up");
    expect(res.ok).toBe(true);
    const s = res.state;
    expect(s.finished).toBe(true);
    expect(s.endReason).toBe("target-chased");
    expect(s.winner).toBe(0);
    expect(s.winnerSeats).toEqual([0]);
  });

  it("resign action ends the match immediately", () => {
    const eng = setup();
    const res = eng.apply({ type: "resign" }, 0);
    expect(res.ok).toBe(true);
    expect(res.state.finished).toBe(true);
  });
});
