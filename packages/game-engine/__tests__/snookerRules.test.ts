import { describe, it, expect, beforeEach } from "vitest";
import { SnookerEngine } from "../src/snooker/engine";
import { SnookerRulesEngine } from "../src/snooker/rules";
import {
  SNOOKER_SPOTS,
  SNOOKER_POCKETS,
  type SnookerBall,
  type SnookerState,
} from "../src/snooker/types";
import { createInitialSnookerSetup } from "../src/snooker/physics";

describe("SnookerRulesEngine & SnookerEngine Phase 3 Test Suite", () => {
  let engine: SnookerEngine;

  beforeEach(() => {
    engine = new SnookerEngine([
      { userId: "player-1", seat: 0 },
      { userId: "player-2", seat: 1 },
    ]);
  });

  it("1. Initial table: sets 15 reds, 6 colors, cue ball, BREAK status, target RED", () => {
    const state = engine.getState();
    expect(state.balls.length).toBe(22);
    expect(state.redsRemaining).toBe(15);
    expect(state.targetBall).toBe("RED");
    expect(state.frameStatus).toBe("BREAK");
    expect(state.player1Score).toBe(0);
    expect(state.player2Score).toBe(0);
    expect(state.player1Break).toBe(0);
    expect(state.player2Break).toBe(0);
    expect(state.stateVersion).toBe(1);
    expect(state.currentPlayer).toBe(0);
  });

  it("2. Red phase scoring: potting legal red awards +1 pt, increments break, transitions to COLOR_PHASE", () => {
    const state = engine.getState();
    const cue = state.balls.find((b) => b.type === "cue")!;
    const red = state.balls.find((b) => b.type === "red")!;

    // Position red 62px from top-left pocket (26, 26) and cue 56px behind red
    red.x = 70;
    red.y = 70;
    cue.x = 110;
    cue.y = 110;

    const angle = Math.atan2(red.y - cue.y, red.x - cue.x);
    const res = engine.apply({ type: "strike", angle, power: 0.55, shotId: "shot-1" }, 0);

    expect(res.ok).toBe(true);
    const nextState = engine.getState();
    expect(nextState.player1Score).toBe(1);
    expect(nextState.player1Break).toBe(1);
    expect(nextState.targetBall).toBe("COLOR");
    expect(nextState.frameStatus).toBe("COLOR_PHASE");
    expect(nextState.currentPlayer).toBe(0); // Turn continues
    expect(nextState.redsRemaining).toBe(14);
  });

  it("3. Color phase scoring: legally potting nominated Black awards +7 pts, respots Black, transitions to RED_PHASE", () => {
    // Nominate black
    engine.state.frameStatus = "COLOR_PHASE";
    engine.state.targetBall = "COLOR";
    engine.state.player1Score = 1;
    engine.state.player1Break = 1;
    engine.apply({ type: "nominate-color", color: "black" }, 0);

    const black = engine.state.balls.find((b) => b.type === "black")!;
    const cue = engine.state.balls.find((b) => b.type === "cue")!;
    black.x = 70;
    black.y = 70;
    cue.x = 110;
    cue.y = 110;

    const angle = Math.atan2(black.y - cue.y, black.x - cue.x);
    const res = engine.apply({ type: "strike", angle, power: 0.55, shotId: "shot-2" }, 0);

    expect(res.ok).toBe(true);
    const nextState = engine.getState();
    expect(nextState.player1Score).toBe(8); // 1 + 7
    expect(nextState.player1Break).toBe(8);
    expect(nextState.targetBall).toBe("RED");
    expect(nextState.frameStatus).toBe("RED_PHASE");

    // Black ball must be respotted to its home spot
    const respottedBlack = nextState.balls.find((b) => b.type === "black")!;
    expect(respottedBlack.pocketed).toBe(false);
    expect(respottedBlack.x).toBe(SNOOKER_SPOTS.black.x);
    expect(respottedBlack.y).toBe(SNOOKER_SPOTS.black.y);
  });

  it("4. Color respotting hierarchy: if home spot is occupied, respot to highest vacant spot", () => {
    const balls = createInitialSnookerSetup();
    const black = balls.find((b) => b.type === "black")!;
    const red = balls.find((b) => b.type === "red")!;
    const pink = balls.find((b) => b.type === "pink")!;

    // Move Pink ball off its spot to make Pink spot vacant
    pink.pocketed = true;

    // Block Black's home spot with a red
    red.x = SNOOKER_SPOTS.black.x;
    red.y = SNOOKER_SPOTS.black.y;

    // Respot black
    SnookerRulesEngine.respotColor(black, balls);

    // Black should be respotted on Pink's spot (the highest vacant spot)
    expect(black.x).toBe(SNOOKER_SPOTS.pink.x);
    expect(black.y).toBe(SNOOKER_SPOTS.pink.y);
  });

  it("5. Color clearance sequence: colors are potted in strict order without respotting", () => {
    // Remove all reds and set clearance to YELLOW
    engine.state.balls.forEach((b) => {
      if (b.type === "red") b.pocketed = true;
    });
    engine.state.redsRemaining = 0;
    engine.state.frameStatus = "COLOR_CLEARANCE";
    engine.state.targetBall = "YELLOW";

    const yellow = engine.state.balls.find((b) => b.type === "yellow")!;
    const cue = engine.state.balls.find((b) => b.type === "cue")!;
    yellow.x = 70;
    yellow.y = 70;
    cue.x = 110;
    cue.y = 110;

    const angle = Math.atan2(yellow.y - cue.y, yellow.x - cue.x);
    const res = engine.apply({ type: "strike", angle, power: 0.55, shotId: "shot-3" }, 0);

    expect(res.ok).toBe(true);
    const nextState = engine.getState();
    expect(nextState.player1Score).toBe(2); // +2 for yellow
    expect(nextState.targetBall).toBe("GREEN");
    expect(nextState.frameStatus).toBe("COLOR_CLEARANCE");

    // Yellow must remain pocketed in clearance
    const yellowBall = nextState.balls.find((b) => b.type === "yellow")!;
    expect(yellowBall.pocketed).toBe(true);
  });

  it("6. Final Black pot: concludes frame, calculates frame winner, records into frameHistory", () => {
    // Pocket all balls except Cue and Black
    engine.state.balls.forEach((b) => {
      if (b.type !== "cue" && b.type !== "black") b.pocketed = true;
    });
    engine.state.redsRemaining = 0;
    engine.state.frameStatus = "COLOR_CLEARANCE";
    engine.state.targetBall = "BLACK";
    engine.state.player1Score = 50;
    engine.state.player2Score = 30;

    const black = engine.state.balls.find((b) => b.type === "black")!;
    const cue = engine.state.balls.find((b) => b.type === "cue")!;
    black.x = 70;
    black.y = 70;
    cue.x = 110;
    cue.y = 110;

    const angle = Math.atan2(black.y - cue.y, black.x - cue.x);
    const res = engine.apply({ type: "strike", angle, power: 0.55, shotId: "shot-4" }, 0);

    expect(res.ok).toBe(true);
    const nextState = engine.getState();
    expect(nextState.player1Score).toBe(57); // 50 + 7
    expect(nextState.frameStatus).toBe("MATCH_END"); // Best of 1 -> Match end
    expect(nextState.finished).toBe(true);
    expect(nextState.winnerSeats).toEqual([0]);
    expect(nextState.frameHistory.length).toBe(1);
    expect(nextState.frameHistory[0].player1Score).toBe(57);
    expect(nextState.frameHistory[0].player2Score).toBe(30);
    expect(nextState.frameHistory[0].winnerSeat).toBe(0);
  });

  it("7. Multi-frame match (Best of 3): Frame 1 completion leads to Frame 2 and Match Winner on Frame 2 win", () => {
    const multiEngine = new SnookerEngine(
      [
        { userId: "player-1", seat: 0 },
        { userId: "player-2", seat: 1 },
      ],
      undefined,
      { bestOf: 3 }
    );

    // Concede Frame 1 by Player 2 -> Player 1 wins Frame 1
    const res1 = multiEngine.apply({ type: "concede" }, 1);
    expect(res1.ok).toBe(true);
    expect(multiEngine.state.player1FramesWon).toBe(1);
    expect(multiEngine.state.frameStatus).toBe("FRAME_END");
    expect(multiEngine.state.finished).toBe(false);

    // Start Frame 2
    const resNext = multiEngine.apply({ type: "next-frame" }, 0);
    expect(resNext.ok).toBe(true);
    expect(multiEngine.state.frameNumber).toBe(2);
    expect(multiEngine.state.frameStatus).toBe("BREAK");
    expect(multiEngine.state.redsRemaining).toBe(15);

    // Concede Frame 2 by Player 2 -> Player 1 wins Frame 2 (2 wins out of 3 = Match Won!)
    const res2 = multiEngine.apply({ type: "concede" }, 1);
    expect(res2.ok).toBe(true);
    expect(multiEngine.state.player1FramesWon).toBe(2);
    expect(multiEngine.state.frameStatus).toBe("MATCH_END");
    expect(multiEngine.state.finished).toBe(true);
    expect(multiEngine.state.winnerSeats).toEqual([0]);
    expect(multiEngine.state.frameHistory.length).toBe(2);
  });

  it("8. Foul penalty calculation: hitting Black first when RED is on awards 7 points to opponent", () => {
    const black = engine.state.balls.find((b) => b.type === "black")!;
    const cue = engine.state.balls.find((b) => b.type === "cue")!;

    // Position cue ball right next to Black and aim directly at Black
    cue.x = black.x - 20;
    cue.y = black.y;

    const angle = 0; // Strike right into Black
    const res = engine.apply({ type: "strike", angle, power: 0.5, shotId: "shot-foul-black" }, 0);

    expect(res.ok).toBe(true);
    const nextState = engine.getState();
    expect(nextState.player2Score).toBe(7); // 7 points foul penalty awarded to Player 2
    expect(nextState.player1Break).toBe(0);
    expect(nextState.currentPlayer).toBe(1); // Turn passed to Player 2
    expect(nextState.lastFoul).toContain("Hit BLACK first");
  });

  it("9. In-off cue ball foul: awards minimum 4 points and gives ball in hand inside the D", () => {
    const cue = engine.state.balls.find((b) => b.type === "cue")!;
    // Aim cue directly into corner pocket
    cue.x = SNOOKER_POCKETS[0].x + 40;
    cue.y = SNOOKER_POCKETS[0].y + 40;

    const angle = Math.atan2(SNOOKER_POCKETS[0].y - cue.y, SNOOKER_POCKETS[0].x - cue.x);
    const res = engine.apply({ type: "strike", angle, power: 0.7, shotId: "shot-in-off" }, 0);

    expect(res.ok).toBe(true);
    const nextState = engine.getState();
    expect(nextState.player2Score).toBe(4);
    expect(nextState.cueBallInHand).toBe(true);
    expect(nextState.inBaulkOnly).toBe(true);
    expect(nextState.currentPlayer).toBe(1);
  });

  it("10. Duplicate shot protection: identical shotId is processed once idempotently", () => {
    const res1 = engine.apply({ type: "strike", angle: 0, power: 0.1, shotId: "dup-shot-100" }, 0);
    expect(res1.ok).toBe(true);
    const version1 = engine.state.stateVersion;

    // Send identical duplicate shot
    const res2 = engine.apply({ type: "strike", angle: 0, power: 0.1, shotId: "dup-shot-100" }, 0);
    expect(res2.ok).toBe(true);
    expect(engine.state.stateVersion).toBe(version1); // State version unchanged (idempotent)
  });

  it("11. Stale state protection: rejects action when expectedStateVersion does not match", () => {
    const res = engine.apply(
      { type: "strike", angle: 0, power: 0.1, expectedStateVersion: 999 },
      0
    );
    expect(res.ok).toBe(false);
    expect(res.error).toBe("STALE_GAME_STATE");
  });

  it("12. Turn ownership: rejects action from player whose turn it is not", () => {
    const res = engine.apply({ type: "strike", angle: 0, power: 0.5 }, 1); // Player 2 tries to shoot on Player 1's turn
    expect(res.ok).toBe(false);
    expect(res.error).toBe("NOT_YOUR_TURN");
  });

  it("13. Turn timeout: awards 4 points to opponent and passes turn", () => {
    const res = engine.handleTimeout("turn");
    expect(res.ok).toBe(true);
    expect(engine.state.player2Score).toBe(4);
    expect(engine.state.currentPlayer).toBe(1);
    expect(engine.state.cueBallInHand).toBe(true);
  });
});
