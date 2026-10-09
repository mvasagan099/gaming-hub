import { describe, it, expect } from "vitest";
import { ChessEngine } from "../src/chess/engine";

describe("ChessEngine", () => {
  const players = [
    { seat: 0, userId: "p0", id: "p0", name: "White Player" },
    { seat: 1, userId: "p1", id: "p1", name: "Black Player" },
  ];

  it("assigns white to seat 0 and black to seat 1 by user ID, regardless of input order", () => {
    const engine = new ChessEngine([...players].reverse());
    expect(engine.state.players).toEqual([
      { userId: "p0", seat: 0, color: "w" },
      { userId: "p1", seat: 1, color: "b" },
    ]);
    expect(engine.state.whitePlayerId).toBe("p0");
    expect(engine.state.blackPlayerId).toBe("p1");
    expect(engine.serialize()).toMatchObject({ whitePlayerId: "p0", blackPlayerId: "p1" });
  });

  it("keeps SAN history chronological and unchanged by invalid moves or duplicate snapshot reads", () => {
    const engine = new ChessEngine(players);
    expect(engine.apply({ type: "move", from: "e2", to: "e4" }, 0).ok).toBe(true);
    expect(engine.state.history).toEqual(["e4"]);
    expect(engine.apply({ type: "move", from: "e2", to: "e4" }, 0).ok).toBe(false);
    expect(engine.state.history).toEqual(["e4"]);
    expect(engine.apply({ type: "move", from: "e7", to: "e4" }, 1).ok).toBe(false);
    expect(engine.state.history).toEqual(["e4"]);
    expect(engine.apply({ type: "move", from: "e7", to: "e5" }, 1).ok).toBe(true);
    const snapshot = engine.serialize();
    expect(snapshot.history).toEqual(["e4", "e5"]);
    expect(engine.serialize().history).toEqual(["e4", "e5"]);
    expect(engine.state.history).toEqual(["e4", "e5"]);
  });

  it("restores the same participant colors and move history after reconnect", () => {
    const original = new ChessEngine(players);
    original.apply({ type: "move", from: "e2", to: "e4" }, 0);
    const restored = new ChessEngine(players);
    restored.restoreState(original.serialize() as typeof restored.state);
    expect(restored.state.players).toEqual(original.state.players);
    expect(restored.state.history).toEqual(["e4"]);
    expect(restored.apply({ type: "move", from: "e7", to: "e5" }, 1).ok).toBe(true);
    expect(restored.state.history).toEqual(["e4", "e5"]);
  });

  it("handles valid moves and piece captures", () => {
    const engine = new ChessEngine(players);
    expect(engine.state.turn).toBe("w");
    expect(engine.state.currentSeat).toBe(0);

    // White moves e2 -> e4
    const r1 = engine.apply({ type: "move", from: "e2", to: "e4" }, 0);
    expect(r1.ok).toBe(true);
    expect(engine.state.turn).toBe("b");
    expect(engine.state.currentSeat).toBe(1);

    // Black moves d7 -> d5
    const r2 = engine.apply({ type: "move", from: "d7", to: "d5" }, 1);
    expect(r2.ok).toBe(true);
    expect(engine.state.turn).toBe("w");

    // White captures e4 -> d5
    const r3 = engine.apply({ type: "move", from: "e4", to: "d5" }, 0);
    expect(r3.ok).toBe(true);
    expect(r3.events[0]?.type).toBe("move");
    expect((r3.events[0] as any).isCapture).toBe(true);
    expect(engine.state.turn).toBe("b");
    expect(engine.state.history).toEqual(["e4", "d5", "exd5"]);
  });

  it("rejects out of turn moves", () => {
    const engine = new ChessEngine(players);
    // Black tries to move first
    const r1 = engine.apply({ type: "move", from: "e7", to: "e5" }, 1);
    expect(r1.ok).toBe(false);
    expect(r1.error).toBe("It is not your turn");
  });

  it("rejects illegal moves", () => {
    const engine = new ChessEngine(players);
    // White tries illegal move e2 -> e5 (over 2 squares)
    const r1 = engine.apply({ type: "move", from: "e2", to: "e5" }, 0);
    expect(r1.ok).toBe(false);
    expect(r1.error).toBe("Illegal move");
  });

  it("starts a 10-minutes match with seeded clocks and a live deadline", () => {
    let now = 5_000_000;
    const engine = new ChessEngine(players, undefined, {
      timeControl: { baseSeconds: 600, incrementSeconds: 0, delaySeconds: 0 },
      now: () => now,
    });

    expect(engine.state.timeControl).toEqual({ baseSeconds: 600, incrementSeconds: 0, delaySeconds: 0 });
    expect(engine.state.clocks).toEqual({
      0: { remainingMs: 600_000, startedAtMs: 5_000_000 },
      1: { remainingMs: 600_000, startedAtMs: null },
    });
    expect(engine.currentClockDeadline).toBe(5_600_000);

    // A move finalizes white's clock and starts black's.
    now += 2_000;
    const result = engine.apply({ type: "move", from: "e2", to: "e4" }, 0);
    expect(result.ok).toBe(true);

    const clocks = engine.state.clocks!;
    expect(clocks[0].remainingMs).toBe(598_000);
    expect(clocks[0].startedAtMs).toBeNull();
    expect(clocks[1].startedAtMs).toBe(5_002_000);
    expect(engine.currentClockDeadline).toBe(5_602_000);
  });

  it("checkmate mode has no clock", () => {
    const engine = new ChessEngine(players, undefined, {
      timeControl: { baseSeconds: 0, incrementSeconds: 0, delaySeconds: 0 },
    });

    expect(engine.state.timeControl).toBeNull();
    expect(engine.state.clocks).toBeNull();
    expect(engine.currentClockDeadline).toBeNull();
  });

  it("flags the current player when their clock hits zero", () => {
    let now = 1_000_000;
    const engine = new ChessEngine(players, undefined, {
      timeControl: { baseSeconds: 1, incrementSeconds: 0, delaySeconds: 0 },
      now: () => now,
    });

    const deadline = engine.currentClockDeadline!;
    expect(deadline).toBe(1_001_000);

    now = deadline + 1;
    const result = engine.handleTimeout("turn", engine.currentSeat);
    expect(result.ok).toBe(true);
    expect(result.finished).toBe(true);
    expect(result.state.endReason).toBe("flag");
    expect(result.state.result).toBe("0-1");
    expect(result.state.winnerSeats).toEqual([1]);
  });

  it("flags on move when the clock has already run out", () => {
    let now = 10_000_000;
    const engine = new ChessEngine(players, undefined, {
      timeControl: { baseSeconds: 1, incrementSeconds: 0, delaySeconds: 0 },
      now: () => now,
    });

    // Touch the state so the clock is seeded before time advances.
    engine.state;

    now += 2_000;
    const result = engine.apply({ type: "move", from: "e2", to: "e4" }, 0);
    expect(result.ok).toBe(true);
    expect(result.finished).toBe(true);
    expect(result.state.endReason).toBe("flag");
    expect(result.state.winnerSeats).toEqual([1]);
  });

  it("handles match timeout with material evaluation and rejects wrong-turn turn timeout", () => {
    const engine = new ChessEngine(players, undefined, {
      timeControl: { baseSeconds: 600, incrementSeconds: 0, delaySeconds: 0 },
    });

    // Not the flagging seat's turn (seat 0's turn, not seat 1).
    expect(engine.handleTimeout("turn", 1).ok).toBe(false);

    // Global 10-minute match timeout evaluates material balance
    const matchTimeout = engine.handleTimeout("match");
    expect(matchTimeout.ok).toBe(true);
    expect(matchTimeout.finished).toBe(true);
  });

  it("handles checkmate (Fool's Mate)", () => {
    const engine = new ChessEngine(players);
    // 1. f3 e5
    expect(engine.apply({ type: "move", from: "f2", to: "f3" }, 0).ok).toBe(true);
    expect(engine.apply({ type: "move", from: "e7", to: "e5" }, 1).ok).toBe(true);
    // 2. g4 Qh4#
    expect(engine.apply({ type: "move", from: "g2", to: "g4" }, 0).ok).toBe(true);
    const mate = engine.apply({ type: "move", from: "d8", to: "h4" }, 1);
    expect(mate.ok).toBe(true);
    expect(mate.finished).toBe(true);
    expect(engine.state.checkmate).toBe(true);
    expect(engine.state.winnerSeats).toEqual([1]); // Black wins
    expect(engine.state.endReason).toBe("checkmate");
    expect(engine.state.history.at(-1)).toBe("Qh4#");
  });

  it("handles resignation", () => {
    const engine = new ChessEngine(players);
    const res = engine.apply({ type: "resign" }, 0);
    expect(res.ok).toBe(true);
    expect(res.finished).toBe(true);
    expect(engine.state.winnerSeats).toEqual([1]); // Opponent wins
    expect(engine.state.endReason).toBe("resign");
  });

  it("handles draw offer, decline, and accept", () => {
    const engine = new ChessEngine(players);
    // White offers draw
    const offer = engine.apply({ type: "draw-offer" }, 0);
    expect(offer.ok).toBe(true);
    expect(engine.state.drawOfferedBy).toBe(0);

    // Black declines
    const decline = engine.apply({ type: "draw-decline" }, 1);
    expect(decline.ok).toBe(true);
    expect(engine.state.drawOfferedBy).toBeNull();
    expect(engine.state.finished).toBe(false);

    // Black offers draw
    engine.apply({ type: "draw-offer" }, 1);
    expect(engine.state.drawOfferedBy).toBe(1);

    // White accepts
    const accept = engine.apply({ type: "draw-accept" }, 0);
    expect(accept.ok).toBe(true);
    expect(accept.finished).toBe(true);
    expect(engine.state.draw).toBe(true);
    expect(engine.state.winnerSeats).toEqual([]);
    expect(engine.state.endReason).toBe("agreement");
  });

  it("handles castling", () => {
    const engine = new ChessEngine(players);
    // 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O
    expect(engine.apply({ type: "move", from: "e2", to: "e4" }, 0).ok).toBe(true);
    expect(engine.apply({ type: "move", from: "e7", to: "e5" }, 1).ok).toBe(true);
    expect(engine.apply({ type: "move", from: "g1", to: "f3" }, 0).ok).toBe(true);
    expect(engine.apply({ type: "move", from: "b8", to: "c6" }, 1).ok).toBe(true);
    expect(engine.apply({ type: "move", from: "f1", to: "c4" }, 0).ok).toBe(true);
    expect(engine.apply({ type: "move", from: "f8", to: "c5" }, 1).ok).toBe(true);

    // White castles kingside e1 -> g1
    const castle = engine.apply({ type: "move", from: "e1", to: "g1" }, 0);
    expect(castle.ok).toBe(true);
    expect(engine.state.history[engine.state.history.length - 1]).toBe("O-O");
  });

  it("handles en passant capture", () => {
    const engine = new ChessEngine(players);
    // 1. e4 a6 2. e5 d5 3. exd6
    expect(engine.apply({ type: "move", from: "e2", to: "e4" }, 0).ok).toBe(true);
    expect(engine.apply({ type: "move", from: "a7", to: "a6" }, 1).ok).toBe(true);
    expect(engine.apply({ type: "move", from: "e4", to: "e5" }, 0).ok).toBe(true);
    expect(engine.apply({ type: "move", from: "d7", to: "d5" }, 1).ok).toBe(true);

    // White captures en passant e5 -> d6
    const ep = engine.apply({ type: "move", from: "e5", to: "d6" }, 0);
    expect(ep.ok).toBe(true);
    expect((ep.events[0] as any).isCapture).toBe(true);
  });

  it("handles pawn promotion", () => {
    const engine = new ChessEngine(players);
    // 1. a4 b5 2. axb5 a6 3. bxa6 Rxa6 4. Rxa6 Nxa6 5. b4 e5 6. b5 Bc5 7. bxa6 Bxf2+ 8. Kxf2 Bxa6
    // Faster: custom FEN or standard moves leading to promotion
    expect(engine.apply({ type: "move", from: "a2", to: "a4" }, 0).ok).toBe(true);
    expect(engine.apply({ type: "move", from: "b7", to: "b5" }, 1).ok).toBe(true);
    expect(engine.apply({ type: "move", from: "a4", to: "b5" }, 0).ok).toBe(true);
    expect(engine.apply({ type: "move", from: "a7", to: "a6" }, 1).ok).toBe(true);
    expect(engine.apply({ type: "move", from: "b5", to: "a6" }, 0).ok).toBe(true);
    expect(engine.apply({ type: "move", from: "c7", to: "c6" }, 1).ok).toBe(true);
    expect(engine.apply({ type: "move", from: "a6", to: "a7" }, 0).ok).toBe(true);
    expect(engine.apply({ type: "move", from: "d7", to: "d6" }, 1).ok).toBe(true);

    // Promote to Queen: a7 captures b8 with promotion "q"
    const promo = engine.apply({ type: "move", from: "a7", to: "b8", promotion: "q" }, 0);
    expect(promo.ok).toBe(true);
    expect(engine.state.history[engine.state.history.length - 1]).toContain("=");
  });
});

describe('Chess repetition across snapshots', () => {
  const players = [{ userId: 'white', seat: 0 }, { userId: 'black', seat: 1 }];
  const cycle = [['g1','f3'], ['g8','f6'], ['f3','g1'], ['f6','g8']];
  it.each(['continuous', 'restored', 'legacy'])('%s recognizes the third occurrence exactly once', mode => {
    let engine = new ChessEngine(players);
    for (let i = 0; i < 8; i++) {
      if (i === 4 && mode !== 'continuous') {
        const snapshot = engine.persistenceState() as typeof engine.state;
        if (mode === 'legacy') delete snapshot.repetitionPositions;
        engine = new ChessEngine(players);
        engine.restoreState(snapshot);
      }
      const [from, to] = cycle[i % 4];
      expect(engine.apply({ type: 'move', from, to }, i % 2).ok).toBe(true);
      if (i < 7) expect(engine.finished).toBe(false);
    }
    expect(engine.state).toMatchObject({ finished: true, gameOver: true, draw: true,
      endReason: 'repetition', winnerSeats: [], result: '1/2-1/2' });
    expect(engine.state.history).toEqual(['Nf3','Nf6','Ng1','Ng8','Nf3','Nf6','Ng1','Ng8']);
    expect(engine.apply({ type: 'move', from: 'g1', to: 'f3' }, 0).ok).toBe(false);
    expect(engine.state.history).toHaveLength(8);
  });
  it('illegal moves do not change repetition counts', () => {
    const engine = new ChessEngine(players);
    const before = engine.persistenceState();
    expect(engine.apply({ type: 'move', from: 'e2', to: 'e5' }, 0).ok).toBe(false);
    expect(engine.persistenceState()).toEqual(before);
  });
});
