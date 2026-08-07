import { SnakeVsWormsEngine } from "..";
import type { SnakeVsWormsAction } from "..";

describe("SnakeVsWormsEngine", () => {
  const players = [
    { seat: 0, id: "p0", name: "P0" },
    { seat: 1, id: "p1", name: "P1" },
  ];

  function act(eng: SnakeVsWormsEngine, action: SnakeVsWormsAction) {
    return eng.apply(action, 0);
  }

  it("initial state has two snakes and two worms", () => {
    const eng = new SnakeVsWormsEngine(players);
    const s = eng.state;
    expect(s.snakes.length).toBe(2);
    expect(s.worms.length).toBe(2);
  });

  it("resign ends match", () => {
    const eng = new SnakeVsWormsEngine(players);
    const res = act(eng, { type: "resign" });
    expect(res.ok).toBe(true);
    expect(res.state.finished).toBe(true);
  });
});
