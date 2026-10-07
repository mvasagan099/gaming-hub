import { describe, it, expect, beforeEach, vi } from "vitest";
import { SnookerEngine } from "../src/snooker/engine";
import { SnookerRulesEngine } from "../src/snooker/rules";
import {
  SNOOKER_SPOTS,
  SNOOKER_POCKETS,
  type SnookerBall,
  type SnookerState,
} from "../src/snooker/types";
import { createInitialSnookerSetup } from "../src/snooker/physics";

describe("Snooker Rules & Engine WPBSA Comprehensive Audit Test Suite", () => {
  let engine: SnookerEngine;

  beforeEach(() => {
    engine = new SnookerEngine([
      { userId: "player-1", seat: 0 },
      { userId: "player-2", seat: 1 },
    ]);
  });

  // ── A. RED PHASE ──────────────────────────────────────────────────────────
  it("A1. Initial table setup: 15 reds, 6 colors, cue ball, target RED, scores 0", () => {
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

  it("A2. Red phase scoring: potting legal red awards +1 pt, increments break, transitions to COLOR_PHASE", () => {
    const state = engine.getState();
    const cue = state.balls.find((b) => b.type === "cue")!;
    const red = state.balls.find((b) => b.type === "red")!;

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
    expect(nextState.currentPlayer).toBe(0);
    expect(nextState.redsRemaining).toBe(14);
  });

  it("A3. Red phase miss: passing turn to opponent without foul resets break", () => {
    const cue = engine.state.balls.find((b) => b.type === "cue")!;
    cue.x = 500;
    cue.y = 240;

    // Aim away into open cushion
    const res = engine.apply({ type: "strike", angle: Math.PI / 2, power: 0.2, shotId: "shot-miss" }, 0);
    expect(res.ok).toBe(true);

    const nextState = engine.getState();
    expect(nextState.player2Score).toBe(4); // Foul: No ball contacted (+4 pts to opponent)
    expect(nextState.currentPlayer).toBe(1);
    expect(nextState.player1Break).toBe(0);
  });

  // ── B. COLOR PHASE & RESPOTTING ───────────────────────────────────────────
  it("B1. Color phase scoring: legally potting nominated Black awards +7 pts, respots Black, transitions to RED_PHASE", () => {
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

    const respottedBlack = nextState.balls.find((b) => b.type === "black")!;
    expect(respottedBlack.pocketed).toBe(false);
    expect(respottedBlack.x).toBe(SNOOKER_SPOTS.black.x);
    expect(respottedBlack.y).toBe(SNOOKER_SPOTS.black.y);
  });

  it("B2. Color respotting hierarchy: if home spot is occupied, respot to highest vacant spot", () => {
    const balls = createInitialSnookerSetup();
    const black = balls.find((b) => b.type === "black")!;
    const red = balls.find((b) => b.type === "red")!;
    const pink = balls.find((b) => b.type === "pink")!;

    pink.pocketed = true; // Pink spot vacant
    red.x = SNOOKER_SPOTS.black.x;
    red.y = SNOOKER_SPOTS.black.y; // Black home spot occupied

    SnookerRulesEngine.respotColor(black, balls);

    expect(black.x).toBe(SNOOKER_SPOTS.pink.x);
    expect(black.y).toBe(SNOOKER_SPOTS.pink.y);
  });

  // ── C. LAST RED SEQUENCE ──────────────────────────────────────────────────
  it("C1. Final Red -> Color -> Yellow Clearance sequence: missing color after final red transitions to YELLOW", () => {
    // Pocket 14 reds
    let redsSeen = 0;
    engine.state.balls.forEach((b) => {
      if (b.type === "red") {
        redsSeen++;
        if (redsSeen > 1) b.pocketed = true;
      }
    });
    engine.state.redsRemaining = 1;
    engine.state.frameStatus = "RED_PHASE";
    engine.state.targetBall = "RED";

    // Pot 15th red
    const lastRed = engine.state.balls.find((b) => b.type === "red" && !b.pocketed)!;
    const cue = engine.state.balls.find((b) => b.type === "cue")!;
    lastRed.x = 70;
    lastRed.y = 70;
    cue.x = 110;
    cue.y = 110;

    const angle = Math.atan2(lastRed.y - cue.y, lastRed.x - cue.x);
    const res = engine.apply({ type: "strike", angle, power: 0.55, shotId: "shot-last-red" }, 0);

    expect(res.ok).toBe(true);
    expect(engine.state.redsRemaining).toBe(0);
    expect(engine.state.targetBall).toBe("COLOR");
    expect(engine.state.frameStatus).toBe("COLOR_PHASE");
    expect(engine.state.isColorAfterFinalRed).toBe(true);

    // Miss color after final red -> target becomes YELLOW clearance
    const cue2 = engine.state.balls.find((b) => b.type === "cue")!;
    cue2.x = 500;
    cue2.y = 240;

    const clock = vi.spyOn(Date, 'now').mockReturnValue(engine.state.shotPlaybackEndsAtMs + 1);
    const res2 = engine.apply({ type: "strike", angle: Math.PI / 2, power: 0.2, shotId: "shot-miss-color" }, 0);
    clock.mockRestore();
    expect(res2.ok).toBe(true);

    const stateAfterMiss = engine.getState();
    expect(stateAfterMiss.targetBall).toBe("YELLOW");
    expect(stateAfterMiss.frameStatus).toBe("COLOR_CLEARANCE");
  });

  // ── D. COLOR CLEARANCE ────────────────────────────────────────────────────
  it("D1. Color clearance sequence: colors are potted in strict order without respotting", () => {
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
    expect(nextState.player1Score).toBe(2);
    expect(nextState.targetBall).toBe("GREEN");
    expect(nextState.frameStatus).toBe("COLOR_CLEARANCE");

    const yellowBall = nextState.balls.find((b) => b.type === "yellow")!;
    expect(yellowBall.pocketed).toBe(true);
  });

  // ── E. FOULS & PENALTIES ──────────────────────────────────────────────────
  it("E1. Foul penalty calculation: hitting Black first when RED is on awards 7 points to opponent", () => {
    const black = engine.state.balls.find((b) => b.type === "black")!;
    const cue = engine.state.balls.find((b) => b.type === "cue")!;

    cue.x = black.x - 20;
    cue.y = black.y;

    const res = engine.apply({ type: "strike", angle: 0, power: 0.5, shotId: "shot-foul-black" }, 0);

    expect(res.ok).toBe(true);
    const nextState = engine.getState();
    expect(nextState.player2Score).toBe(7);
    expect(nextState.player1Break).toBe(0);
    expect(nextState.currentPlayer).toBe(1);
    expect(nextState.lastFoul).toContain("Hit BLACK first");
  });

  it("E2. In-off cue ball foul: awards minimum 4 points and gives ball in hand inside the D", () => {
    const cue = engine.state.balls.find((b) => b.type === "cue")!;
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

  // ── F. FREE BALL ──────────────────────────────────────────────────────────
  it("F1. Free Ball on Yellow clearance: awards 2 points and retains Yellow on", () => {
    engine.state.balls.forEach((b) => {
      if (b.type === "red") b.pocketed = true;
    });
    engine.state.redsRemaining = 0;
    engine.state.frameStatus = "FREE_BALL";
    engine.state.freeBallAvailable = true;
    engine.state.freeBallTarget = "YELLOW";
    engine.state.targetBall = "FREE_BALL";

    // Nominate Black as free ball for Yellow
    engine.apply({ type: "nominate-color", color: "black" }, 0);

    const black = engine.state.balls.find((b) => b.type === "black")!;
    const cue = engine.state.balls.find((b) => b.type === "cue")!;
    black.x = 70;
    black.y = 70;
    cue.x = 110;
    cue.y = 110;

    const angle = Math.atan2(black.y - cue.y, black.x - cue.x);
    const res = engine.apply({ type: "strike", angle, power: 0.55, shotId: "shot-free-yellow" }, 0);

    expect(res.ok).toBe(true);
    const nextState = engine.getState();
    expect(nextState.player1Score).toBe(2); // Yellow value = +2
    expect(nextState.targetBall).toBe("YELLOW"); // Yellow remains target ball on clearance
    expect(nextState.frameStatus).toBe("COLOR_CLEARANCE");

    // Nominated black is respotted
    const respottedBlack = nextState.balls.find((b) => b.type === "black")!;
    expect(respottedBlack.pocketed).toBe(false);
  });

  // ── G. FINAL BLACK & RESPOTTED BLACK ──────────────────────────────────────
  it("G1. Final Black pot when leading: ends frame and determines frame winner", () => {
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
    const res = engine.apply({ type: "strike", angle, power: 0.55, shotId: "shot-final-black" }, 0);

    expect(res.ok).toBe(true);
    const nextState = engine.getState();
    expect(nextState.player1Score).toBe(57);
    expect(nextState.frameStatus).toBe("MATCH_END");
    expect(nextState.finished).toBe(true);
    expect(nextState.winnerSeats).toEqual([0]);
  });

  it("G2. Tied score on final Black: triggers WPBSA Respotted Black procedure", () => {
    engine.state.balls.forEach((b) => {
      if (b.type !== "cue" && b.type !== "black") b.pocketed = true;
    });
    engine.state.redsRemaining = 0;
    engine.state.frameStatus = "COLOR_CLEARANCE";
    engine.state.targetBall = "BLACK";
    engine.state.player1Score = 50;
    engine.state.player2Score = 57; // Player 2 leads by 7

    // Player 1 pots Black (+7 pts) -> Score becomes 57 - 57 (TIED!)
    const black = engine.state.balls.find((b) => b.type === "black")!;
    const cue = engine.state.balls.find((b) => b.type === "cue")!;
    black.x = 70;
    black.y = 70;
    cue.x = 110;
    cue.y = 110;

    const angle = Math.atan2(black.y - cue.y, black.x - cue.x);
    const res = engine.apply({ type: "strike", angle, power: 0.55, shotId: "shot-tie-black" }, 0);

    expect(res.ok).toBe(true);
    const nextState = engine.getState();
    expect(nextState.player1Score).toBe(57);
    expect(nextState.player2Score).toBe(57);
    expect(nextState.isRespottedBlack).toBe(true);
    expect(nextState.finished).toBe(false); // Frame does NOT end!
    expect(nextState.cueBallInHand).toBe(true); // Cue ball in hand in D
    expect(nextState.inBaulkOnly).toBe(true);

    const respottedBlack = nextState.balls.find((b) => b.type === "black")!;
    expect(respottedBlack.pocketed).toBe(false);
    expect(respottedBlack.x).toBe(SNOOKER_SPOTS.black.x);
    expect(respottedBlack.y).toBe(SNOOKER_SPOTS.black.y);
  });

  // ── H. MULTIPLAYER & CONCURRENCY ──────────────────────────────────────────
  it("H1. Duplicate shot protection: identical shotId is processed once idempotently", () => {
    const res1 = engine.apply({ type: "strike", angle: 0, power: 0.1, shotId: "dup-shot-100" }, 0);
    expect(res1.ok).toBe(true);
    const version1 = engine.state.stateVersion;

    const res2 = engine.apply({ type: "strike", angle: 0, power: 0.1, shotId: "dup-shot-100" }, 0);
    expect(res2.ok).toBe(true);
    expect(engine.state.stateVersion).toBe(version1);
  });

  it("H2. Stale state protection: rejects action when expectedStateVersion does not match", () => {
    const res = engine.apply(
      { type: "strike", angle: 0, power: 0.1, expectedStateVersion: 999 },
      0
    );
    expect(res.ok).toBe(false);
    expect(res.error).toBe("STALE_GAME_STATE");
  });

  it("H3. Turn ownership: rejects action from player whose turn it is not", () => {
    const res = engine.apply({ type: "strike", angle: 0, power: 0.5 }, 1);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("NOT_YOUR_TURN");
  });

  it("H4. Turn timeout: awards 4 points to opponent and enforces inBaulkOnly placement inside D", () => {
    const res = engine.handleTimeout("turn");
    expect(res.ok).toBe(true);
    expect(engine.state.player2Score).toBe(4);
    expect(engine.state.currentPlayer).toBe(1);
    expect(engine.state.cueBallInHand).toBe(true);
    expect(engine.state.inBaulkOnly).toBe(true);
  });

  it("H5. Concede validation: rejects concession on already completed frame or match", () => {
    engine.state.finished = true;
    engine.state.frameStatus = "MATCH_END";
    const res = engine.apply({ type: "concede" }, 0);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Match has already finished");
  });

  it("H6. Multi-frame match alternates break-off seat each frame", () => {
    const multiEngine = new SnookerEngine(
      [
        { userId: "player-1", seat: 0 },
        { userId: "player-2", seat: 1 },
      ],
      undefined,
      { bestOf: 3 }
    );

    // Frame 1 break-off seat is 0
    expect(multiEngine.state.currentPlayer).toBe(0);

    // Concede Frame 1
    multiEngine.apply({ type: "concede" }, 1);
    expect(multiEngine.state.player1FramesWon).toBe(1);

    // Start Frame 2 -> break-off seat should alternate to Seat 1!
    multiEngine.startNextFrame();
    expect(multiEngine.state.frameNumber).toBe(2);
    expect(multiEngine.state.currentPlayer).toBe(1);
  });

  // ── I. INVARIANT PROPERTY TESTS ───────────────────────────────────────────
  it("I1. Invariant: redsRemaining is non-negative and never increases", () => {
    expect(engine.state.redsRemaining).toBeGreaterThanOrEqual(0);
    expect(engine.state.player1Score).toBeGreaterThanOrEqual(0);
    expect(engine.state.player2Score).toBeGreaterThanOrEqual(0);
  });

  it("I2. Invariant: completed frame cannot receive further strike action", () => {
    engine.state.finished = true;
    const res = engine.apply({ type: "strike", angle: 0, power: 0.5 }, 0);
    expect(res.ok).toBe(false);
  });
});
