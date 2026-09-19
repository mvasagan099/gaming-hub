import { describe, it, expect } from "vitest";
import { CricketEngine } from "..";
import type { CricketAction, CricketMatchType } from "..";

describe("CricketEngine", () => {
  const players = [
    { seat: 0, id: "p0", userId: "p0", name: "Player 1" },
    { seat: 1, id: "p1", userId: "p1", name: "Player 2" },
  ];

  function setup(options?: { matchType?: CricketMatchType }) {
    const eng = new CricketEngine(players, () => 0.9, options);
    const call = eng.state.tossResult === "heads" ? "heads" : "tails";
    eng.apply({ type: "toss-call", call }, 0);
    eng.apply({ type: "toss-choice", choice: "bat" }, eng.state.currentSeat);
    return eng;
  }

  function bowl(eng: CricketEngine, action: { type: "bowl"; delivery: "fast" | "slow" | "spin"; pitchTargetId?: string } = { type: "bowl", delivery: "fast" }) {
    eng.apply({ type: "set-pitch-target", lateral: 0, length: 0.4 }, eng.state.bowlingTeam, (eng.state.turnStartedAtMs ?? 1000));
    return eng.apply({ ...action, pitchTargetId: eng.state.pitchTarget?.targetId }, eng.state.bowlingTeam, (eng.state.turnStartedAtMs ?? 1000) + 1000);
  }

  function bat(eng: CricketEngine, shot: "straight" | "left" | "right" | "up" = "straight", timing?: "early" | "good" | "late") {
    const action: CricketAction = { type: "bat", shot, timing, deliveryId: eng.state.activeDeliveryId ?? undefined };
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

  it("toss-call determines toss-winner and toss-choice sets batting first", () => {
    const eng = new CricketEngine(players, () => 0.9);
    expect(eng.state.currentActor).toBe("toss");
    
    const call = eng.state.tossResult === "heads" ? "tails" : "heads";
    const res = eng.apply({ type: "toss-call", call }, 0);
    expect(res.ok).toBe(true);
    expect(res.state.tossWinner).toBe(1);
    expect(res.state.currentActor).toBe("toss-choice");
    expect(res.state.currentSeat).toBe(1);

    const choiceRes = eng.apply({ type: "toss-choice", choice: "bat" }, 1);
    expect(choiceRes.ok).toBe(true);
    expect(choiceRes.state.battingFirst).toBe(1);
    expect(choiceRes.state.currentActor).toBe("bowler");
  });

  it("random toss assigns one team to bat first", () => {
    const eng = setup();
    const s = eng.state;
    expect(s.battingFirst).toBeDefined();
    expect(s.battingTeam).toBeDefined();
    expect(s.bowlingTeam).toBeDefined();
    expect(s.currentActor).toBe("bowler");
    expect(s.totalOvers).toBe(1);
  });

  it("can customize match type", () => {
    const eng = setup({ matchType: "1-over" });
    expect(eng.state.totalOvers).toBe(1);
  });

  it("only the bowling side can bowl", () => {
    const eng = setup();
    const res = eng.apply({ type: "bowl", delivery: "fast" }, eng.state.battingTeam);
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

  it("advances to the second innings after 1 over (6 balls)", () => {
    const eng = setup();
    for (let i = 0; i < 6; i++) {
      const r = ball(eng);
      expect(r.ok).toBe(true);
    }
    const s = eng.state;
    expect(s.inning).toBe(2);
    expect(s.currentOver).toBe(0);
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
    const firstInningsScore = s.battingFirst === 0 ? s.team1Score : s.team2Score;
    expect(s.target).toBe(firstInningsScore + 1);
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

  it("allows resigning during toss phase", () => {
    const eng = new CricketEngine(players, () => 0.9);
    expect(eng.state.currentActor).toBe("toss");
    const res = eng.apply({ type: "resign" }, 1);
    expect(res.ok).toBe(true);
    expect(res.state.finished).toBe(true);
    expect(res.state.winnerSeats).toEqual([0]);
  });

  it("allows resigning when it is not your turn", () => {
    const eng = setup();
    const notMyTurnSeat = 1 - eng.state.currentSeat;
    const res = eng.apply({ type: "resign" }, notMyTurnSeat);
    expect(res.ok).toBe(true);
    expect(res.state.finished).toBe(true);
    expect(res.state.winnerSeats).toEqual([eng.state.currentSeat]);
  });

  it("atomically locks delivery and rejects duplicate bowl requests while processing", () => {
    const eng = setup();
    const bowlerSeat = eng.state.bowlingTeam;

    // First bowl request succeeds and acquires delivery lock
    const res1 = bowl(eng, { type: "bowl", delivery: "fast" });
    expect(res1.ok).toBe(true);
    expect(res1.state.isProcessingDelivery).toBe(true);
    expect(res1.state.activeDeliveryId).toBe("delivery-1");
    expect(res1.state.deliverySequence).toBe(1);

    // Rapid second bowl request while delivery is processing is rejected
    const res2 = eng.apply({ type: "bowl", delivery: "slow" }, bowlerSeat);
    expect(res2.ok).toBe(false);
    expect(res2.error).toBe("DELIVERY_IN_PROGRESS");

    // Bat action resolves the shot and releases the delivery lock
    const batRes = eng.apply({ type: "bat", shot: "straight", timing: "good" }, eng.state.battingTeam);
    expect(batRes.ok).toBe(true);
    expect(batRes.state.isProcessingDelivery).toBe(false);
    expect(batRes.state.activeDeliveryId).toBeNull();

    // Next delivery can acquire lock and generates delivery-2
    const res3 = bowl(eng, { type: "bowl", delivery: "spin" });
    expect(res3.ok).toBe(true);
    expect(res3.state.isProcessingDelivery).toBe(true);
    expect(res3.state.activeDeliveryId).toBe("delivery-2");
    expect(res3.state.deliverySequence).toBe(2);
  });
});
