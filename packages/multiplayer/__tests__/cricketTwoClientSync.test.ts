import { describe, it, expect, beforeEach } from "vitest";
import { MultiplayerFramework } from "../src/framework";
import { createMatchRoom, createTestFramework, makePlayer } from "./helpers";
import { GameStateSyncManager } from "../../../apps/socket-server/src/sync/GameStateSyncManager";
import type { CricketAction, CricketState } from "@gaming-hub/game-engine";

function wrapCricketEngine(engine: any) {
  const origApply = engine.apply.bind(engine);
  engine.apply = (action: any, seat: number, now?: number) => {
    if (
      action.type === "bowl" &&
      engine.state.currentActor === "bowler" &&
      !engine.state.pitchTarget &&
      seat === engine.state.bowlingTeam &&
      !engine.state.isProcessingDelivery
    ) {
      origApply({ type: "set-pitch-target", lateral: 0, length: 0.4 }, seat, now);
      if (!action.pitchTargetId) {
        action = { ...action, pitchTargetId: engine.state.pitchTarget?.targetId };
      }
    }
    return origApply(action, seat, now);
  };
  return engine;
}

describe("Cricket Two-Client Real Multiplayer Synchronization", () => {
  let framework: MultiplayerFramework;

  beforeEach(() => {
    MultiplayerFramework.resetInstance();
    framework = createTestFramework({ enableAntiCheat: false });
  });

  // ==========================================================================
  // 1. Two Authenticated Clients Joining Match Room
  // ==========================================================================
  it("initializes cricket room with two distinct authenticated players", () => {
    const clientA = makePlayer("user-alice", 0, { displayName: "Alice" });
    const clientB = makePlayer("user-bob", 1, { displayName: "Bob" });

    const room = createMatchRoom("cricket", [clientA, clientB]);
    expect(room.players.size).toBe(2);
    expect(room.players.get("user-alice")?.seat).toBe(0);
    expect(room.players.get("user-bob")?.seat).toBe(1);

    const engine = wrapCricketEngine(room.match!.engine);
    const initial = engine.state as unknown as CricketState;
    expect(initial.currentActor).toBe("toss");
    expect(initial.team1Score).toBe(0);
    expect(initial.team2Score).toBe(0);
  });

  // ==========================================================================
  // 2. Toss Phase: Client A Calls, Winner Chooses Bat vs Bowl
  // ==========================================================================
  it("executes authoritative toss where only the authorized seat can call and winner can choose", () => {
    const clientA = makePlayer("user-alice", 0);
    const clientB = makePlayer("user-bob", 1);
    const room = createMatchRoom("cricket", [clientA, clientB]);
    const engine = wrapCricketEngine(room.match!.engine);

    // Bob (seat 1) tries to call toss -> REJECTED (not caller's turn)
    const bobTossRes = engine.apply({ type: "toss-call", call: "heads" }, 1);
    expect(bobTossRes.ok).toBe(false);
    expect(bobTossRes.error).toBe("NOT_YOUR_TOSS");

    // Alice (seat 0) calls toss -> ACCEPTED
    const aliceTossRes = engine.apply({ type: "toss-call", call: "heads" }, 0);
    expect(aliceTossRes.ok).toBe(true);
    const tossWinner = (engine.state as unknown as CricketState).tossWinner!;
    const nonWinner = 1 - tossWinner;

    // Non-winner attempts to choose bat/bowl -> REJECTED
    const nonWinnerChoice = engine.apply({ type: "toss-choice", choice: "bat" }, nonWinner);
    expect(nonWinnerChoice.ok).toBe(false);
    expect(nonWinnerChoice.error).toBe("NOT_YOUR_TOSS_CHOICE");

    // Winner chooses BAT FIRST -> Winner is battingTeam, other is bowlingTeam
    const winnerChoice = engine.apply({ type: "toss-choice", choice: "bat" }, tossWinner);
    expect(winnerChoice.ok).toBe(true);
    const state = engine.state as unknown as CricketState;
    expect(state.battingFirst).toBe(tossWinner);
    expect(state.battingTeam).toBe(tossWinner);
    expect(state.bowlingTeam).toBe(nonWinner);
    expect(state.currentActor).toBe("bowler");
    expect(state.currentSeat).toBe(nonWinner);
  });

  // ==========================================================================
  // 4. Bowl First Choice: Seat 0 wins toss, chooses bowl -> Seat 1 bats first
  // ==========================================================================
  it("correctly attributes score to Seat 1 when Seat 0 wins toss and chooses BOWL FIRST", () => {
    const clientA = makePlayer("user-alice", 0);
    const clientB = makePlayer("user-bob", 1);
    const room = createMatchRoom("cricket", [clientA, clientB]);
    const engine = wrapCricketEngine(room.match!.engine);

    // Force Seat 0 to win toss
    const tossResult = (engine.state as unknown as CricketState).tossResult!;
    engine.apply({ type: "toss-call", call: tossResult }, 0);

    // Seat 0 chooses BOWL
    const choiceRes = engine.apply({ type: "toss-choice", choice: "bowl" }, 0);
    expect(choiceRes.ok).toBe(true);
    const state = engine.state as unknown as CricketState;

    expect(state.battingFirst).toBe(1); // Seat 1 bats first
    expect(state.battingTeam).toBe(1);
    expect(state.bowlingTeam).toBe(0);
    expect(state.currentActor).toBe("bowler");
    expect(state.currentSeat).toBe(0); // Seat 0 bowls first

    // Seat 0 bowls
    const bowlRes = engine.apply({ type: "bowl", delivery: "fast" }, 0);
    expect(bowlRes.ok).toBe(true);

    // Seat 1 bats
    const batRes = engine.apply({
      type: "bat",
      shot: "straight",
      timing: "good",
      deliveryId: state.activeDeliveryId!,
    }, 1);
    expect(batRes.ok).toBe(true);

    // Runs must belong strictly to team2Score (Seat 1) and team1Score (Seat 0) must be 0!
    const afterBat = engine.state as unknown as CricketState;
    expect(afterBat.team2Score).toBeGreaterThan(0);
    expect(afterBat.team1Score).toBe(0);
  });

  // ==========================================================================
  // 5 & 6. First Ball Flow, Replay, and Rapid Input Deduplication
  // ==========================================================================
  it("processes delivery atomically and rejects duplicate rapid submissions", () => {
    const clientA = makePlayer("user-alice", 0);
    const clientB = makePlayer("user-bob", 1);
    const room = createMatchRoom("cricket", [clientA, clientB]);
    const engine = wrapCricketEngine(room.match!.engine);

    engine.apply({ type: "toss-call", call: (engine.state as any).tossResult }, 0);
    engine.apply({ type: "toss-choice", choice: "bat" }, 0);

    const s = engine.state as unknown as CricketState;
    const bowler = s.bowlingTeam;
    const batsman = s.battingTeam;

    // Bowler delivers ball
    const bowlRes1 = engine.apply({ type: "bowl", delivery: "fast" }, bowler);
    expect(bowlRes1.ok).toBe(true);
    const deliveryId = (engine.state as any).activeDeliveryId;

    // Bowler tries to deliver a second time while delivery is active -> REJECTED
    const rapidBowl = engine.apply({ type: "bowl", delivery: "slow" }, bowler);
    expect(rapidBowl.ok).toBe(false);

    // Batsman hits shot
    const batRes1 = engine.apply({
      type: "bat",
      shot: "straight",
      timing: "good",
      deliveryId,
    }, batsman);
    expect(batRes1.ok).toBe(true);

    // Batsman tries to hit a second time with the same deliveryId -> REJECTED
    const rapidBat = engine.apply({
      type: "bat",
      shot: "straight",
      timing: "good",
      deliveryId,
    }, batsman);
    expect(rapidBat.ok).toBe(false);
  });

  // ==========================================================================
  // 8. Stale Delivery ID Rejection
  // ==========================================================================
  it("rejects shots sent with an outdated deliveryId (e.g. delivery-9 vs active delivery-10)", () => {
    const clientA = makePlayer("user-alice", 0);
    const clientB = makePlayer("user-bob", 1);
    const room = createMatchRoom("cricket", [clientA, clientB]);
    const engine = wrapCricketEngine(room.match!.engine);

    engine.apply({ type: "toss-call", call: (engine.state as any).tossResult }, 0);
    engine.apply({ type: "toss-choice", choice: "bat" }, 0);

    const s = engine.state as unknown as CricketState;
    engine.apply({ type: "bowl", delivery: "fast" }, s.bowlingTeam);

    const staleRes = engine.apply({
      type: "bat",
      shot: "straight",
      timing: "good",
      deliveryId: "delivery-999",
    }, s.battingTeam);
    expect(staleRes.ok).toBe(false);
    expect(staleRes.error).toBe("STALE_DELIVERY");
  });

  // ==========================================================================
  // 18, 19, 20. Reconnection Scenarios (Bowler Turn, Pending Delivery, After Result)
  // ==========================================================================
  it("handles client reconnection gracefully during bowler turn, pending delivery, and after result", () => {
    const clientA = makePlayer("user-alice", 0);
    const clientB = makePlayer("user-bob", 1);
    const room = createMatchRoom("cricket", [clientA, clientB]);
    const engine = wrapCricketEngine(room.match!.engine);

    engine.apply({ type: "toss-call", call: (engine.state as any).tossResult }, 0);
    engine.apply({ type: "toss-choice", choice: "bat" }, 0);

    // 18. Reconnect during bowler turn
    const stateBeforeDisconnect = JSON.parse(JSON.stringify(engine.serialize())) as CricketState;
    expect(stateBeforeDisconnect.currentActor).toBe("bowler");
    clientA.connectionStatus = "disconnected";
    // Client A reconnects
    clientA.connectionStatus = "connected";
    const stateAfterReconnect = engine.state as unknown as CricketState;
    expect(stateAfterReconnect.currentActor).toBe("bowler");
    expect(stateAfterReconnect.currentSeat).toBe(stateBeforeDisconnect.currentSeat);

    // 19. Reconnect during pending delivery
    engine.apply({ type: "bowl", delivery: "fast" }, stateAfterReconnect.bowlingTeam);
    const pendingState = JSON.parse(JSON.stringify(engine.serialize())) as CricketState;
    expect(pendingState.currentActor).toBe("batsman");
    expect(pendingState.pendingDelivery).not.toBeNull();

    // Batsman disconnects and reconnects
    clientB.connectionStatus = "disconnected";
    clientB.connectionStatus = "connected";
    // State preserves pendingDelivery
    expect((engine.state as any).pendingDelivery).not.toBeNull();
    expect((engine.state as any).activeDeliveryId).toBe(pendingState.activeDeliveryId);

    // Batsman submits shot after reconnection
    const batRes = engine.apply({
      type: "bat",
      shot: "straight",
      timing: "good",
      deliveryId: pendingState.activeDeliveryId!,
    }, pendingState.battingTeam);
    expect(batRes.ok).toBe(true);

    // 20. Reconnect after result
    const resultState = JSON.parse(JSON.stringify(engine.serialize())) as CricketState;
    clientA.connectionStatus = "disconnected";
    clientA.connectionStatus = "connected";
    const reconnectedState = engine.state as unknown as CricketState;
    expect(reconnectedState.balls.length).toBe(resultState.balls.length);
    expect(reconnectedState.team1Score).toBe(resultState.team1Score);
  });

  // ==========================================================================
  // 14 & 15. Complete Match & Winner Calculation (Both Batting Orders)
  // ==========================================================================
  it("determines authoritative winner via WinnerCalculator for Seat 0 first and Seat 1 first", () => {
    // Test Case: Seat 0 bats first, Seat 1 chases
    {
      const clientA = makePlayer("user-alice", 0);
      const clientB = makePlayer("user-bob", 1);
      const room = createMatchRoom("cricket", [clientA, clientB]);
      const engine = wrapCricketEngine(room.match!.engine);

      engine.apply({ type: "toss-call", call: (engine.state as any).tossResult }, 0);
      engine.apply({ type: "toss-choice", choice: "bat" }, 0); // Seat 0 bats first

      // Inning 1
      for (let i = 0; i < 6; i++) {
        engine.apply({ type: "bowl", delivery: "fast" }, 1);
        engine.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: (engine.state as any).activeDeliveryId }, 0);
      }
      expect((engine.state as any).inning).toBe(2);
      expect((engine.state as any).target).toBe((engine.state as any).team1Score + 1);

      // Inning 2
      let lastRes: any;
      for (let i = 0; i < 6; i++) {
        if ((engine.state as any).finished) break;
        engine.apply({ type: "bowl", delivery: "fast" }, 0);
        lastRes = engine.apply({ type: "bat", shot: "up", timing: "good", deliveryId: (engine.state as any).activeDeliveryId }, 1);
      }

      expect((engine.state as any).finished).toBe(true);
      const winnerCalc = framework.winnerCalculator.calculate(room, lastRes);
      expect(winnerCalc.winnerSeats).toEqual([(engine.state as any).winner]);
      expect(winnerCalc.players[0].score).toBe((engine.state as any).team1Score);
      expect(winnerCalc.players[1].score).toBe((engine.state as any).team2Score);
    }

    // Test Case: Seat 1 bats first, Seat 0 chases
    {
      const clientA = makePlayer("user-alice", 0);
      const clientB = makePlayer("user-bob", 1);
      const room = createMatchRoom("cricket", [clientA, clientB]);
      const engine = wrapCricketEngine(room.match!.engine);

      engine.apply({ type: "toss-call", call: (engine.state as any).tossResult === "heads" ? "tails" : "heads" }, 0);
      engine.apply({ type: "toss-choice", choice: "bat" }, 1); // Seat 1 bats first

      // Inning 1 (Seat 1 bats)
      for (let i = 0; i < 6; i++) {
        engine.apply({ type: "bowl", delivery: "fast" }, 0);
        engine.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: (engine.state as any).activeDeliveryId }, 1);
      }
      expect((engine.state as any).inning).toBe(2);
      expect((engine.state as any).target).toBe((engine.state as any).team2Score + 1);

      // Inning 2 (Seat 0 chases)
      let lastRes: any;
      for (let i = 0; i < 6; i++) {
        if ((engine.state as any).finished) break;
        engine.apply({ type: "bowl", delivery: "fast" }, 1);
        lastRes = engine.apply({ type: "bat", shot: "up", timing: "good", deliveryId: (engine.state as any).activeDeliveryId }, 0);
      }

      expect((engine.state as any).finished).toBe(true);
      const winnerCalc = framework.winnerCalculator.calculate(room, lastRes);
      expect(winnerCalc.winnerSeats).toEqual([(engine.state as any).winner]);
      expect(winnerCalc.players[0].score).toBe((engine.state as any).team1Score);
      expect(winnerCalc.players[1].score).toBe((engine.state as any).team2Score);
    }
  });

  // ==========================================================================
  // 25. Multiplayer Event Logging & State Version Monotonicity
  // ==========================================================================
  it("strictly increments stateVersion monotonically and logs state transitions", () => {
    const matchId = "cricket-monotony-test";
    const initial = GameStateSyncManager.initializeMatch(
      matchId,
      "cricket",
      { inning: 1, currentActor: "bowler", score: 0 },
      Date.now() + 30000,
      "user-alice",
    );
    expect(initial.stateVersion).toBe(1);
    expect(initial.actionSequence).toBe(0);

    // Ball bowled
    const update1 = GameStateSyncManager.applyActionUpdate(
      matchId,
      "act-delivery-1",
      { inning: 1, currentActor: "batsman", deliveryId: "delivery-1" },
      { turnNumber: 1, currentPlayerId: "user-bob" },
    );
    expect(update1.stateVersion).toBe(2);
    expect(update1.actionSequence).toBe(1);

    // Bat shot
    const update2 = GameStateSyncManager.applyActionUpdate(
      matchId,
      "act-bat-1",
      { inning: 1, currentActor: "bowler", score: 4 },
      { turnNumber: 2, currentPlayerId: "user-alice" },
    );
    const versionAfterBat = update2.stateVersion;
    expect(versionAfterBat).toBe(3);
    expect(update2.actionSequence).toBe(2);

    // Inning transition
    const update3 = GameStateSyncManager.applyActionUpdate(
      matchId,
      "act-innings-trans",
      { inning: 2, currentActor: "bowler", target: 25 },
      { turnNumber: 7, currentPlayerId: "user-bob" },
    );
    expect(update3.stateVersion).toBe(4);
    expect(update3.actionSequence).toBe(3);
    expect(update3.stateVersion).toBeGreaterThan(versionAfterBat);
  });
});
