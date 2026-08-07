import { TableTennisEngine } from "..";
import type { TableTennisAction } from "..";

describe("TableTennisEngine", () => {
  const players = [
    { seat: 0, id: "p0", name: "P0" },
    { seat: 1, id: "p1", name: "P1" },
  ];

  function act(eng: TableTennisEngine, action: TableTennisAction) {
    return eng.apply(action, 0);
  }

  it("initial state is 11 points to win", () => {
    const eng = new TableTennisEngine(players);
    const s = eng.state;
    expect(s.rules.pointsPerSet).toBe(11);
    expect(s.servingSeat).toBe(0);
  });

  it("serve creates a ball", () => {
    const eng = new TableTennisEngine(players);
    const res = act(eng, { type: "serve", power: 1.0 });
    expect(res.ok).toBe(true);
    const ns = res.state;
    expect(!!ns.ball).toBe(true);
    expect(ns.ball?.served).toBe(true);
  });

  it("resign ends match", () => {
    const eng = new TableTennisEngine(players);
    const res = act(eng, { type: "resign" });
    expect(res.ok).toBe(true);
    expect(res.state.finished).toBe(true);
    expect(res.state.winnerSeats).toEqual([1]);
  });
});
