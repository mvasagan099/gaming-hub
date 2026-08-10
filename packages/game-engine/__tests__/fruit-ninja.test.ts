import { describe, it, expect } from "vitest";
import { FruitNinjaEngine } from "..";
import type { FruitNinjaAction } from "..";

describe("FruitNinjaEngine", () => {
  const players = [{ seat: 0, id: "p0", name: "P0" }];

  function act(eng: FruitNinjaEngine, action: FruitNinjaAction) {
    return eng.apply(action, 0);
  }

  it("initial state is stage-1 level-1, 3 lives", () => {
    const eng = new FruitNinjaEngine(players);
    const s = eng.state;
    expect(s.stage).toBe(1);
    expect(s.level).toBe(1);
    expect(s.players[0].lives).toBe(3);
  });

  it("slice-begin adds a slice", () => {
    const eng = new FruitNinjaEngine(players);
    expect(eng.state.slices.length).toBe(0);
    const r = act(eng, { type: "slice-begin", x: 0.5, y: 0.5, time: 0 });
    expect(r.ok).toBe(true);
  });

  it("resign ends match", () => {
    const eng = new FruitNinjaEngine(players);
    const r = act(eng, { type: "resign" });
    expect(r.ok).toBe(true);
    expect(r.state.finished).toBe(true);
  });
});
