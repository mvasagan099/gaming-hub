import { CricketEngine } from "..";
import type { CricketAction, CricketMatchType } from "..";

describe("CricketEngine", () => {
  const players = [
    { seat: 0, id: "p0", name: "Player 1" },
    { seat: 1, id: "p1", name: "Player 2" },
  ];

  function act(eng: CricketEngine, action: CricketAction) {
    return eng.applyGameAction(action, 0, eng.getState());
  }

  function setup(options?: { matchType?: CricketMatchType }) {
    return new CricketEngine(players, undefined, options);
  }

  it("initial state defaults to 5 overs", () => {
    const eng = setup();
    const s = eng.getState();
    expect(s.totalOvers).toBe(5);
    expect(s.inning).toBe(1);
    expect(s.currentSeat).toBe(0);
  });

  it("can customize match type", () => {
    const eng = setup({ matchType: "1-over" });
    const s = eng.getState();
    expect(s.totalOvers).toBe(1);
  });

  it("play-ball action adds runs and advances state", () => {
    const eng = setup();
    const res = act(eng, { type: "play-ball", runs: 4 });
    expect(res.ok).toBe(true);
    const s = res.state;
    expect(s.team1Score).toBe(4);
    expect(s.players[0].runs).toBe(4);
    expect(s.players[0].fours).toBe(1);
    expect(s.currentBall).toBe(1);
    expect(s.currentOver).toBe(0);
  });

  it("advances to next over after 6 balls", () => {
    const eng = setup();
    for (let i = 0; i < 6; i++) {
      const r = act(eng, { type: "play-ball", runs: 0 });
      expect(r.ok).toBe(true);
    }
    const s = eng.getState();
    expect(s.currentOver).toBe(1);
    expect(s.currentBall).toBe(0);
  });

  it("wicket reduces batting team and adds to bowler", () => {
    const eng = setup();
    const res = act(eng, {
      type: "play-ball",
      runs: 0,
      wicket: true,
      wicketType: "bowled",
    });
    expect(res.ok).toBe(true);
    const s = res.state;
    expect(s.team1Wickets).toBe(1);
    expect(s.players[0].wickets).toBe(1);
  });

  it("match ends when all overs are finished", () => {
    const eng = setup({ matchType: "1-over" });
    // play full 1 over, 6 balls
    for (let i = 0; i < 6; i++) {
      const r = act(eng, { type: "play-ball", runs: 0 });
      expect(r.ok).toBe(true);
    }
    const s = eng.getState();
    expect(s.finished).toBe(true);
    expect(s.endReason).toBe("overs-complete");
  });

  it("resign action ends the match immediately", () => {
    const eng = setup();
    const res = act(eng, { type: "resign" });
    expect(res.ok).toBe(true);
    expect(res.state.finished).toBe(true);
  });
});
