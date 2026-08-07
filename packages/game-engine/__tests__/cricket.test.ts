import { CricketEngine } from "..";
import type { CricketAction, CricketMatchType } from "..";

describe("CricketEngine", () => {
  const players = [
    { seat: 0, id: "p0", name: "Player 1" },
    { seat: 1, id: "p1", name: "Player 2" },
  ];

  function setup(options?: { matchType?: CricketMatchType }) {
    const eng = new CricketEngine(players, () => 0.9, options);
    const call = eng.state.tossResult === "heads" ? "heads" : "tails";
    eng.apply({ type: "toss-call", call }, 0);
    return eng;
  }

  function bowl(eng: CricketEngine, action: { type: "bowl"; delivery: "fast" | "slow" | "spin" } = { type: "bowl", delivery: "fast" }) {
    return eng.apply(action, eng.state.bowlingTeam);
  }

  function bat(eng: CricketEngine, shot: "straight" | "left" | "right" | "up" = "straight", timing?: "early" | "good" | "late") {
    const action: CricketAction = { type: "bat", shot, timing };
    return eng.apply(action, eng.state.battingTeam);
  }

  function ball(eng: CricketEngine, opts: { shot?: "straight" | "left" | "right" | "up"; timing?: "early" | "good" | "late" } = {}) {
    const r1 = bowl(eng);
    expect(r1.ok).toBe(true);
    return bat(eng, opts.shot, opts.timing);
  }

  it("toss phase requires toss-call action", () => {
    const eng = new CricketEngine(players, () => 0.9);
    expect(eng.state.currentActor).toBe("toss");
    expect(eng.state.tossResult).toBeDefined();
    expect(eng.state.tossWinner).toBeNull();
    expect(eng.state.battingFirst).toBe(0);
  });

  it("toss-call determines batting first", () => {
    const eng = new CricketEngine(players, () => 0.9);
    expect(eng.state.currentActor).toBe("toss");
    
    const call = eng.state.tossResult === "heads" ? "tails" : "heads";
    const res = eng.apply({ type: "toss-call", call }, 0);
    expect(res.ok).toBe(true);
    expect(res.state.tossWinner).toBe(1);
    expect(res.state.battingFirst).toBeDefined();
    expect(res.state.currentActor).toBe("bowler");
  });

  it("random toss assigns one team to bat first", () => {
    const eng = setup();
    const s = eng.state;
    expect(s.battingFirst).toBeDefined();
    expect(s.battingTeam).toBeDefined();
    expect(s.bowlingTeam).toBeDefined();
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
    expect(s.currentSeat).toBe(s.battingTeam);
    expect(s.currentBall).toBe(0);
    expect(s.pendingDelivery).not.toBeNull();
  });

  it("bat action resolves the delivery and advances the ball", () => {
    const eng = setup();
    const res = ball(eng);
    expect(res.ok).toBe(true);
    const s = res.state;
    expect(s.currentBall).toBe(1);
    expect(s.currentActor).toBe("bowler");
    expect(s.balls.length).toBe(1);
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

  it("resign action ends the match immediately", () => {
    const eng = setup();
    const res = eng.apply({ type: "resign" }, 0);
    expect(res.ok).toBe(true);
    expect(res.state.finished).toBe(true);
  });
});
