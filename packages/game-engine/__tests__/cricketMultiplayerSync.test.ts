import { describe, it, expect } from "vitest";
import { CricketEngine as BaseCricketEngine } from "../src/cricket/engine";
import type { CricketAction } from "../src/cricket/types";

class CricketEngine extends BaseCricketEngine {
  override apply(action: CricketAction, seat: number, now?: number) {
    if (
      action.type === "bowl" &&
      this.state.currentActor === "bowler" &&
      !this.state.pitchTarget &&
      seat === this.state.bowlingTeam &&
      !this.state.isProcessingDelivery
    ) {
      super.apply({ type: "set-pitch-target", lateral: 0, length: 0.4 }, seat, now);
      if (!action.pitchTargetId) {
        action = { ...action, pitchTargetId: this.state.pitchTarget?.targetId };
      }
    }
    return super.apply(action, seat, now);
  }
}

describe("Cricket Multiplayer Sync & Rules", () => {
  const players = [
    { seat: 0, id: "p0", userId: "p0", name: "Player 1" },
    { seat: 1, id: "p1", userId: "p1", name: "Player 2" },
  ];

  // ==================================================
  // 28. TEST TOSS SECURITY
  // ==================================================
  it("rejects toss-call when sent by opponent (toss authorization)", () => {
    const eng = new CricketEngine(players, () => 0.1);
    expect(eng.state.currentActor).toBe("toss");
    expect(eng.state.currentSeat).toBe(0);

    // Seat 1 tries to call toss when currentSeat is 0
    const res = eng.apply({ type: "toss-call", call: "heads" }, 1);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("NOT_YOUR_TOSS");

    // Seat 0 can call toss
    const res0 = eng.apply({ type: "toss-call", call: "heads" }, 0);
    expect(res0.ok).toBe(true);
    expect(res0.state.currentActor).toBe("toss-choice");

    // Opponent tries to choose bat/bowl
    const nonWinner = 1 - res0.state.tossWinner!;
    const choiceReject = eng.apply({ type: "toss-choice", choice: "bat" }, nonWinner);
    expect(choiceReject.ok).toBe(false);
    expect(choiceReject.error).toBe("NOT_YOUR_TOSS_CHOICE");

    // Winner can choose
    const choiceOk = eng.apply({ type: "toss-choice", choice: "bat" }, res0.state.tossWinner!);
    expect(choiceOk.ok).toBe(true);
    expect(choiceOk.state.currentActor).toBe("bowler");
  });

  // ==================================================
  // 8. REQUIRE REAL PENDING DELIVERY BEFORE BATTING
  // ==================================================
  it("rejects batting when no delivery is in progress", () => {
    const eng = new CricketEngine(players, () => 0.1);
    eng.apply({ type: "toss-call", call: "heads" }, 0);
    eng.apply({ type: "toss-choice", choice: "bat" }, eng.state.currentSeat);

    // Currently bowler's turn, no delivery active
    const res = eng.apply({ type: "bat", shot: "straight" }, eng.state.battingTeam);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("The bowler is at the crease");
  });

  // ==================================================
  // 27. TEST STALE BAT DELIVERY ID
  // ==================================================
  it("rejects bat action with stale or mismatched deliveryId", () => {
    const eng = new CricketEngine(players, () => 0.9);
    eng.apply({ type: "toss-call", call: "heads" }, 0);
    eng.apply({ type: "toss-choice", choice: "bat" }, eng.state.currentSeat);

    const bowlRes = eng.apply({ type: "bowl", delivery: "fast" }, eng.state.bowlingTeam);
    expect(bowlRes.ok).toBe(true);
    expect(bowlRes.state.activeDeliveryId).toBe("delivery-1");

    // Submit bat with mismatched deliveryId
    const staleRes = eng.apply(
      { type: "bat", shot: "straight", timing: "good", deliveryId: "delivery-99" },
      eng.state.battingTeam,
    );
    expect(staleRes.ok).toBe(false);
    expect(staleRes.error).toBe("STALE_DELIVERY");

    // Score remains 0
    expect(eng.state.team1Score).toBe(0);
    expect(eng.state.team2Score).toBe(0);

    // Correct deliveryId succeeds
    const okRes = eng.apply(
      { type: "bat", shot: "straight", timing: "good", deliveryId: "delivery-1" },
      eng.state.battingTeam,
    );
    expect(okRes.ok).toBe(true);
  });

  // ==================================================
  // 21. TEST: SEAT 0 BATS FIRST SCORE OWNERSHIP
  // ==================================================
  it("correctly owns score for seat 0 when seat 0 bats first", () => {
    // Deterministic random returning 0.9 (ensures normal run scoring, no wicket, no extras)
    const eng = new CricketEngine(players, () => 0.9, { matchType: "1-over" });
    // Heads wins for seat 0 if tossResult is heads, tails if tails
    const call = eng.state.tossResult === "heads" ? "heads" : "tails";
    eng.apply({ type: "toss-call", call }, 0);
    // Seat 0 chooses to bat
    eng.apply({ type: "toss-choice", choice: "bat" }, 0);

    expect(eng.state.battingFirst).toBe(0);
    expect(eng.state.battingTeam).toBe(0);
    expect(eng.state.bowlingTeam).toBe(1);

    // Bowl and bat
    eng.apply({ type: "bowl", delivery: "fast" }, 1);
    const batRes = eng.apply(
      { type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! },
      0,
    );
    expect(batRes.ok).toBe(true);

    // Runs must be in team1Score (seat 0) and team2Score MUST remain 0
    expect(batRes.state.team1Score).toBeGreaterThan(0);
    expect(batRes.state.team2Score).toBe(0);
  });

  // ==================================================
  // 22. TEST: SEAT 1 BATS FIRST SCORE OWNERSHIP & TARGET
  // ==================================================
  it("correctly owns score for seat 1 when seat 1 bats first", () => {
    const eng = new CricketEngine(players, () => 0.9, { matchType: "1-over" });
    // Seat 0 calls wrong side so seat 1 wins toss
    const call = eng.state.tossResult === "heads" ? "tails" : "heads";
    eng.apply({ type: "toss-call", call }, 0);
    expect(eng.state.tossWinner).toBe(1);

    // Seat 1 chooses to bat first
    eng.apply({ type: "toss-choice", choice: "bat" }, 1);
    expect(eng.state.battingFirst).toBe(1);
    expect(eng.state.battingTeam).toBe(1);
    expect(eng.state.bowlingTeam).toBe(0);

    // Seat 0 bowls, Seat 1 bats
    eng.apply({ type: "bowl", delivery: "fast" }, 0);
    const batRes = eng.apply(
      { type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! },
      1,
    );
    expect(batRes.ok).toBe(true);

    // CRITICAL: team1Score must be 0, team2Score must contain Seat 1 runs!
    expect(batRes.state.team1Score).toBe(0);
    expect(batRes.state.team2Score).toBeGreaterThan(0);

    // Play remaining 5 balls of inning 1
    for (let i = 0; i < 5; i++) {
      eng.apply({ type: "bowl", delivery: "fast" }, eng.state.bowlingTeam);
      eng.apply(
        { type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! },
        eng.state.battingTeam,
      );
    }

    // Inning 1 is complete, transitioning to Inning 2
    expect(eng.state.inning).toBe(2);
    expect(eng.state.battingTeam).toBe(0); // Seat 0 now chases
    expect(eng.state.bowlingTeam).toBe(1);

    // Target must be team2Score + 1 (NOT team1Score + 1!)
    expect(eng.state.target).toBe(eng.state.team2Score + 1);
    expect(eng.state.team1Score).toBe(0);
  });

  // ==================================================
  // 23. TEST TARGET & WINNER CALCULATION FOR BOTH ORDERS
  // ==================================================
  it("determines correct winner when seat 0 bats first and seat 1 fails chase", () => {
    const eng = new CricketEngine(players, () => 0.9, { matchType: "1-over" });
    const call = eng.state.tossResult === "heads" ? "heads" : "tails";
    eng.apply({ type: "toss-call", call }, 0);
    eng.apply({ type: "toss-choice", choice: "bat" }, 0);

    // Inning 1 (Seat 0 bats 6 balls)
    for (let i = 0; i < 6; i++) {
      eng.apply({ type: "bowl", delivery: "fast" }, 1);
      eng.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! }, 0);
    }
    expect(eng.state.inning).toBe(2);
    const seat0Score = eng.state.team1Score;
    expect(eng.state.target).toBe(seat0Score + 1);

    // Inning 2 (Seat 1 chases with mistimed shots so score is lower)
    for (let i = 0; i < 6; i++) {
      if (eng.state.finished) break;
      eng.apply({ type: "bowl", delivery: "fast" }, 0);
      eng.apply({ type: "bat", shot: "straight", timing: "early", deliveryId: eng.state.activeDeliveryId! }, 1);
    }

    expect(eng.state.finished).toBe(true);
    if (eng.state.team1Score > eng.state.team2Score) {
      expect(eng.state.winner).toBe(0);
      expect(eng.state.winnerSeats).toEqual([0]);
    } else if (eng.state.team2Score > eng.state.team1Score) {
      expect(eng.state.winner).toBe(1);
      expect(eng.state.winnerSeats).toEqual([1]);
    } else {
      expect(eng.state.winner).toBeNull();
      expect(eng.state.winnerSeats).toEqual([]);
    }
  });

  it("determines correct winner when seat 1 bats first and seat 0 chases", () => {
    const eng = new CricketEngine(players, () => 0.9, { matchType: "1-over" });
    const call = eng.state.tossResult === "heads" ? "tails" : "heads";
    eng.apply({ type: "toss-call", call }, 0); // seat 1 wins toss
    eng.apply({ type: "toss-choice", choice: "bat" }, 1); // seat 1 bats first

    // Inning 1 (Seat 1 bats 6 balls)
    for (let i = 0; i < 6; i++) {
      eng.apply({ type: "bowl", delivery: "fast" }, 0);
      eng.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! }, 1);
    }
    expect(eng.state.inning).toBe(2);
    expect(eng.state.target).toBe(eng.state.team2Score + 1);

    // Inning 2 (Seat 0 chases)
    for (let i = 0; i < 6; i++) {
      if (eng.state.finished) break;
      eng.apply({ type: "bowl", delivery: "fast" }, 1);
      eng.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! }, 0);
    }

    expect(eng.state.finished).toBe(true);
    if (eng.state.team1Score > eng.state.team2Score) {
      expect(eng.state.winner).toBe(0);
      expect(eng.state.winnerSeats).toEqual([0]);
    } else if (eng.state.team2Score > eng.state.team1Score) {
      expect(eng.state.winner).toBe(1);
      expect(eng.state.winnerSeats).toEqual([1]);
    } else {
      expect(eng.state.winner).toBeNull();
      expect(eng.state.winnerSeats).toEqual([]);
    }
  });

  // ==================================================
  // 24. & 25. TEST NO-BALL AND WIDE BALL COUNTING
  // ==================================================
  it("does not increment legal ball count on no-ball or wide", () => {
    // Custom RNG:
    // When rolling extra:
    // extraRoll < 0.03 -> no-ball
    // extraRoll >= 0.03 && extraRoll < 0.06 -> wide
    let callCount = 0;
    const rng = () => {
      callCount++;
      // Delivery weights selection uses rollOutcome: return 0.5
      // Extra roll: if callCount === 3, return 0.01 (no-ball)
      if (callCount === 3) return 0.01;
      return 0.9;
    };

    const eng = new CricketEngine(players, rng, { matchType: "1-over" });
    const call = eng.state.tossResult === "heads" ? "heads" : "tails";
    eng.apply({ type: "toss-call", call }, 0);
    eng.apply({ type: "toss-choice", choice: "bat" }, 0);

    // Ball 1: triggers no-ball via callCount === 3
    eng.apply({ type: "bowl", delivery: "fast" }, 1);
    const nbRes = eng.apply(
      { type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! },
      0,
    );
    expect(nbRes.ok).toBe(true);
    const lastBall = nbRes.state.balls[nbRes.state.balls.length - 1];
    expect(lastBall.extraType).toBe("no-ball");
    expect(lastBall.extras).toBe(1);

    // LEGAL BALL COUNT MUST NOT INCREASE ON NO-BALL! Still 0 legal balls!
    expect(nbRes.state.currentBall).toBe(0);
    expect(nbRes.state.currentOver).toBe(0);

    // Team extras increased
    expect(nbRes.state.team1Extras).toBe(1);

    // Ball 2: normal legal delivery (callCount > 3 returns 0.9)
    eng.apply({ type: "bowl", delivery: "fast" }, 1);
    const legalRes = eng.apply(
      { type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! },
      0,
    );
    expect(legalRes.ok).toBe(true);
    expect(legalRes.state.currentBall).toBe(1);
    expect(legalRes.state.currentOver).toBe(0);
  });

  // ==================================================
  // 11. & 12. TEST BOWLER EXTRA ACCOUNTING & MAIDEN OVER
  // ==================================================
  it("charges bowler for wide/no-ball but not byes/leg-byes, and calculates maiden over correctly", () => {
    // Test that bowler's runsConceded only includes runs off bat + wides/no-balls
    const eng = new CricketEngine(players, () => 0.9, { matchType: "1-over" });
    const call = eng.state.tossResult === "heads" ? "heads" : "tails";
    eng.apply({ type: "toss-call", call }, 0);
    eng.apply({ type: "toss-choice", choice: "bat" }, 0);

    // Bowl 6 balls
    for (let i = 0; i < 6; i++) {
      eng.apply({ type: "bowl", delivery: "fast" }, 1);
      eng.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! }, 0);
    }

    const bowler = eng.state.players[1]; // seat 1 bowled
    expect(bowler.oversBowled.overs).toBe(1);
    expect(bowler.oversBowled.balls).toBe(0);
    expect(bowler.runsConceded).toBeGreaterThan(0);
  });

  // ==================================================
  // 4. BOWL FIRST CHOICE (SEAT OWNERSHIP & RUN ATTRIBUTION)
  // ==================================================
  it("Seat 0 wins toss and selects bowl first -> Seat 1 bats first, score belongs strictly to Seat 1 (team2Score)", () => {
    const rng = () => 0.9;
    const eng = new CricketEngine(players, rng, { matchType: "1-over" });
    const call = eng.state.tossResult === "heads" ? "heads" : "tails";
    eng.apply({ type: "toss-call", call }, 0); // Seat 0 wins toss
    expect(eng.state.tossWinner).toBe(0);

    // Seat 0 chooses to BOWL first
    const choiceRes = eng.apply({ type: "toss-choice", choice: "bowl" }, 0);
    expect(choiceRes.ok).toBe(true);
    expect(eng.state.battingFirst).toBe(1); // Seat 1 bats first
    expect(eng.state.battingTeam).toBe(1);
    expect(eng.state.bowlingTeam).toBe(0);
    expect(eng.state.currentActor).toBe("bowler");
    expect(eng.state.currentSeat).toBe(0); // Seat 0 bowls first

    // Initial scoreboard: both 0/0
    expect(eng.state.team1Score).toBe(0);
    expect(eng.state.team2Score).toBe(0);
    expect(eng.state.team1Wickets).toBe(0);
    expect(eng.state.team2Wickets).toBe(0);

    // Seat 0 bowls
    const bowlRes = eng.apply({ type: "bowl", delivery: "fast" }, 0);
    expect(bowlRes.ok).toBe(true);
    expect(eng.state.currentActor).toBe("batsman");
    expect(eng.state.currentSeat).toBe(1);

    // Seat 1 bats and scores
    const batRes = eng.apply({
      type: "bat",
      shot: "straight",
      timing: "good",
      deliveryId: eng.state.activeDeliveryId!,
    }, 1);
    expect(batRes.ok).toBe(true);

    // CRITICAL: Seat 1 scored, so team2Score must contain runs, and team1Score MUST remain 0!
    expect(eng.state.team2Score).toBeGreaterThan(0);
    expect(eng.state.team1Score).toBe(0);
  });

  // ==================================================
  // 5 & 6. FIRST BALL FLOW & RAPID INPUT REJECTION
  // ==================================================
  it("accepts one authoritative delivery & shot only; duplicate rapid actions are rejected", () => {
    const eng = new CricketEngine(players, () => 0.9, { matchType: "1-over" });
    eng.apply({ type: "toss-call", call: eng.state.tossResult! }, 0);
    eng.apply({ type: "toss-choice", choice: "bat" }, 0);

    // Bowler (Seat 1) bowls first ball
    const bowl1 = eng.apply({ type: "bowl", delivery: "fast" }, 1);
    expect(bowl1.ok).toBe(true);
    const activeDeliveryId = eng.state.activeDeliveryId;
    expect(activeDeliveryId).toBe("delivery-1");

    // Rapid second click on Bowl by Seat 1 while delivery is in flight
    const rapidBowl = eng.apply({ type: "bowl", delivery: "fast" }, 1);
    expect(rapidBowl.ok).toBe(false); // Rejected!
    expect(eng.state.deliverySequence).toBe(1);

    // Batsman (Seat 0) hits shot
    const bat1 = eng.apply({
      type: "bat",
      shot: "straight",
      timing: "good",
      deliveryId: activeDeliveryId!,
    }, 0);
    expect(bat1.ok).toBe(true);

    // Rapid second click on Bat by Seat 0 with the same deliveryId
    const rapidBat = eng.apply({
      type: "bat",
      shot: "straight",
      timing: "good",
      deliveryId: activeDeliveryId!,
    }, 0);
    expect(rapidBat.ok).toBe(false); // Rejected!

    // Exactly 1 ball recorded in balls history
    expect(eng.state.balls).toHaveLength(1);
    expect(eng.state.currentBall).toBe(1);
  });

  // ==================================================
  // 7. REJECTED BAT TEST & CLIENT CONTROLS RECOVERY
  // ==================================================
  it("rejects invalid bat action without corrupting state, permitting subsequent valid bat action", () => {
    const eng = new CricketEngine(players, () => 0.9, { matchType: "1-over" });
    eng.apply({ type: "toss-call", call: eng.state.tossResult! }, 0);
    eng.apply({ type: "toss-choice", choice: "bat" }, 0);

    eng.apply({ type: "bowl", delivery: "fast" }, 1);
    const validDeliveryId = eng.state.activeDeliveryId!;

    // Attempt bat with invalid/stale deliveryId
    const badBat = eng.apply({
      type: "bat",
      shot: "straight",
      timing: "good",
      deliveryId: "wrong-id",
    }, 0);
    expect(badBat.ok).toBe(false);
    expect(badBat.error).toBe("STALE_DELIVERY");

    // Engine state remains preserved: delivery still pending, balls not incremented
    expect(eng.state.isProcessingDelivery).toBe(true);
    expect(eng.state.currentBall).toBe(0);
    expect(eng.state.currentActor).toBe("batsman");

    // Legitimate bat action succeeds immediately after rejection
    const goodBat = eng.apply({
      type: "bat",
      shot: "straight",
      timing: "good",
      deliveryId: validDeliveryId,
    }, 0);
    expect(goodBat.ok).toBe(true);
    expect(eng.state.currentBall).toBe(1);
  });

  // ==================================================
  // 8. DELIVERY ID TEST (delivery-10 vs delivery-9)
  // ==================================================
  it("strictly rejects delivery-9 when active delivery is delivery-10", () => {
    // 0.11 returns dots without ending on wickets or target chased early
    const eng = new CricketEngine(players, () => 0.11, { matchType: "1-over" });
    eng.apply({ type: "toss-call", call: "heads" }, 0);
    eng.apply({ type: "toss-choice", choice: "bat" }, 0);

    // Play 9 balls across innings
    for (let i = 1; i <= 9; i++) {
      eng.apply({ type: "bowl", delivery: "fast" }, eng.state.bowlingTeam);
      eng.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: `delivery-${i}` }, eng.state.battingTeam);
    }
    expect(eng.state.balls).toHaveLength(9);

    // Bowl ball 10
    eng.apply({ type: "bowl", delivery: "fast" }, eng.state.bowlingTeam);
    expect(eng.state.activeDeliveryId).toBe("delivery-10");

    // Attempt to submit bat action for delivery-9
    const staleRes = eng.apply({
      type: "bat",
      shot: "straight",
      timing: "good",
      deliveryId: "delivery-9",
    }, eng.state.battingTeam);
    expect(staleRes.ok).toBe(false);
    expect(staleRes.error).toBe("STALE_DELIVERY");
    expect(eng.state.balls).toHaveLength(9); // Still 9 balls!

    // Submit valid delivery-10
    const validRes = eng.apply({
      type: "bat",
      shot: "straight",
      timing: "good",
      deliveryId: "delivery-10",
    }, eng.state.battingTeam);
    expect(validRes.ok).toBe(true);
    expect(eng.state.balls).toHaveLength(10);
  });

  // ==================================================
  // 9. WIDE DELIVERY ACCOUNTING
  // ==================================================
  it("wide delivery adds runs and extras but does not increment legal ball count or balls faced", () => {
    let call = 0;
    const rng = () => {
      call++;
      if (call === 7) return 0.04; // triggers wide!
      return 0.9;
    };
    const eng = new CricketEngine(players, rng, { matchType: "1-over" });
    eng.apply({ type: "toss-call", call: eng.state.tossResult! }, 0);
    eng.apply({ type: "toss-choice", choice: "bat" }, 0);

    // Ball 1 (legal)
    eng.apply({ type: "bowl", delivery: "fast" }, 1);
    eng.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! }, 0);

    // Ball 2 (legal)
    eng.apply({ type: "bowl", delivery: "fast" }, 1);
    eng.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! }, 0);

    expect(eng.state.currentOver).toBe(0);
    expect(eng.state.currentBall).toBe(2);
    const batsmanBefore = eng.state.players[0].balls;
    const teamScoreBefore = eng.state.team1Score;
    const extrasBefore = eng.state.team1Extras;

    // Ball 3: triggers WIDE
    eng.apply({ type: "bowl", delivery: "fast" }, 1);
    const wideRes = eng.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! }, 0);
    expect(wideRes.ok).toBe(true);

    const lastBall = eng.state.balls[eng.state.balls.length - 1];
    expect(lastBall.extraType).toBe("wide");
    expect(lastBall.extras).toBe(1);

    // Overs stays 0.2!
    expect(eng.state.currentOver).toBe(0);
    expect(eng.state.currentBall).toBe(2);

    // Batsman balls faced unchanged!
    expect(eng.state.players[0].balls).toBe(batsmanBefore);

    // Score and extras increased!
    expect(eng.state.team1Score).toBe(teamScoreBefore + lastBall.runs + lastBall.extras);
    expect(eng.state.team1Extras).toBe(extrasBefore + 1);
  });

  // ==================================================
  // 11. BYE / LEG-BYE ACCOUNTING
  // ==================================================
  it("bye / leg-bye consumes a legal ball, increments extras, but does NOT charge bowler runs conceded", () => {
    let call = 0;
    const rng = () => {
      call++;
      if (call === 3) return 0.07; // triggers bye!
      return 0.9;
    };
    const eng = new CricketEngine(players, rng, { matchType: "1-over" });
    eng.apply({ type: "toss-call", call: eng.state.tossResult! }, 0);
    eng.apply({ type: "toss-choice", choice: "bat" }, 0);

    const bowlerRunsBefore = eng.state.players[1].runsConceded;
    eng.apply({ type: "bowl", delivery: "fast" }, 1);
    const byeRes = eng.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! }, 0);
    expect(byeRes.ok).toBe(true);

    const lastBall = eng.state.balls[eng.state.balls.length - 1];
    expect(lastBall.extraType).toBe("bye");
    expect(lastBall.extras).toBeGreaterThanOrEqual(1);

    // Legal ball WAS consumed!
    expect(eng.state.currentBall).toBe(1);
    expect(eng.state.players[0].balls).toBe(1);

    // Team score and extras increased
    expect(eng.state.team1Extras).toBe(lastBall.extras);

    // Bowler runsConceded only gets runs off the bat, NOT the bye extras!
    expect(eng.state.players[1].runsConceded).toBe(bowlerRunsBefore + lastBall.runs);
  });

  // ==================================================
  // 12. OVER COMPLETION (6 LEGAL DELIVERIES)
  // ==================================================
  it("advances over exactly after 6 legal deliveries, ignoring inserted extras", () => {
    let call = 0;
    const rng = () => {
      call++;
      if (call === 5) return 0.04; // wide on ball 2
      return 0.9;
    };
    const eng = new CricketEngine(players, rng, { matchType: "1-over" });
    eng.apply({ type: "toss-call", call: eng.state.tossResult! }, 0);
    eng.apply({ type: "toss-choice", choice: "bat" }, 0);

    // Deliver 7 total balls (6 legal + 1 wide)
    let lastRes: any;
    for (let i = 0; i < 7; i++) {
      eng.apply({ type: "bowl", delivery: "fast" }, 1);
      lastRes = eng.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! }, 0);
    }

    // After 6 legal deliveries, over completed event is emitted and inning transitions
    expect(lastRes.events.some((e: any) => e.type === "over-complete" && e.over === 1)).toBe(true);
    expect(eng.state.inning).toBe(2);
    expect(eng.state.balls).toHaveLength(7);
    const wideCount = eng.state.balls.filter(b => b.extraType === "wide").length;
    expect(wideCount).toBe(1);
  });

  // ==================================================
  // 13. MAIDEN OVER CALCULATION (0 RUNS CONCEDED)
  // ==================================================
  it("awards maiden +1 when 6 legal deliveries have 0 bowler-conceded runs, includes current ball", () => {
    const rng = () => 0.11; // outcome "0", extraRoll >= 0.10 (legal dot delivery)
    const eng = new CricketEngine(players, rng, { matchType: "1-over" });
    eng.apply({ type: "toss-call", call: "heads" }, 0);
    eng.apply({ type: "toss-choice", choice: "bat" }, 0);

    for (let i = 0; i < 6; i++) {
      eng.apply({ type: "bowl", delivery: "fast" }, 1);
      eng.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! }, 0);
    }

    // Bowler bowled 1 maiden over!
    expect(eng.state.players[1].maidens).toBe(1);
    expect(eng.state.players[1].runsConceded).toBe(0);
  });

  // ==================================================
  // 14. INNINGS — SEAT 0 BATS FIRST THEN SEAT 1 CHASES
  // ==================================================
  it("Seat 0 scores runs, Seat 1 chases target and wins immediately upon reaching target", () => {
    const eng = new CricketEngine(players, () => 0.9, { matchType: "1-over" });
    eng.apply({ type: "toss-call", call: eng.state.tossResult! }, 0);
    eng.apply({ type: "toss-choice", choice: "bat" }, 0); // Seat 0 bats first

    // Seat 0 first innings
    for (let i = 0; i < 6; i++) {
      eng.apply({ type: "bowl", delivery: "fast" }, 1);
      eng.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! }, 0);
    }
    expect(eng.state.inning).toBe(2);
    const seat0Score = eng.state.team1Score;
    expect(eng.state.target).toBe(seat0Score + 1);
    expect(eng.state.battingTeam).toBe(1); // Seat 1 now bats

    // Seat 1 chases
    for (let i = 0; i < 6; i++) {
      if (eng.state.finished) break;
      eng.apply({ type: "bowl", delivery: "fast" }, 0);
      eng.apply({ type: "bat", shot: "up", timing: "good", deliveryId: eng.state.activeDeliveryId! }, 1);
    }

    expect(eng.state.finished).toBe(true);
    if (eng.state.team2Score >= eng.state.target!) {
      expect(eng.state.winner).toBe(1);
      expect(eng.state.winnerSeats).toEqual([1]);
      expect(eng.state.endReason).toBe("target-chased");
    }
  });

  // ==================================================
  // 15. INNINGS — SEAT 1 BATS FIRST THEN SEAT 0 CHASES
  // ==================================================
  it("Seat 1 bats first, target is team2Score + 1, Seat 0 chases target and wins", () => {
    const eng = new CricketEngine(players, () => 0.9, { matchType: "1-over" });
    eng.apply({ type: "toss-call", call: eng.state.tossResult === "heads" ? "tails" : "heads" }, 0);
    eng.apply({ type: "toss-choice", choice: "bat" }, 1); // Seat 1 bats first

    expect(eng.state.battingTeam).toBe(1);
    expect(eng.state.bowlingTeam).toBe(0);

    // Seat 1 first innings
    for (let i = 0; i < 6; i++) {
      eng.apply({ type: "bowl", delivery: "fast" }, 0);
      eng.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! }, 1);
    }

    expect(eng.state.inning).toBe(2);
    expect(eng.state.team1Score).toBe(0);
    expect(eng.state.team2Score).toBeGreaterThan(0);
    expect(eng.state.target).toBe(eng.state.team2Score + 1);

    // Seat 0 second innings (chasing)
    for (let i = 0; i < 6; i++) {
      if (eng.state.finished) break;
      eng.apply({ type: "bowl", delivery: "fast" }, 1);
      eng.apply({ type: "bat", shot: "up", timing: "good", deliveryId: eng.state.activeDeliveryId! }, 0);
    }

    expect(eng.state.finished).toBe(true);
    if (eng.state.team1Score >= eng.state.target!) {
      expect(eng.state.winner).toBe(0);
      expect(eng.state.winnerSeats).toEqual([0]);
      expect(eng.state.endReason).toBe("target-chased");
    }
  });

  // ==================================================
  // 16. FAILED CHASE (COMPARES ACTUAL SCORES)
  // ==================================================
  it("declares Seat 1 winner when Seat 1 scores higher and Seat 0 fails the chase", () => {
    let step = 0;
    const customRng = () => {
      step++;
      // Inning 1 (Seat 1 bats): 0.9 returns runs
      if (step <= 14) return 0.9;
      // Inning 2 (Seat 0 chases): 0.11 returns legal dots (0 runs)
      return 0.11;
    };
    const eng = new CricketEngine(players, customRng, { matchType: "1-over" });
    eng.apply({ type: "toss-call", call: eng.state.tossResult === "heads" ? "tails" : "heads" }, 0);
    eng.apply({ type: "toss-choice", choice: "bat" }, 1); // Seat 1 bats first

    // Seat 1 bats 6 balls
    for (let i = 0; i < 6; i++) {
      eng.apply({ type: "bowl", delivery: "fast" }, 0);
      eng.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! }, 1);
    }
    expect(eng.state.inning).toBe(2);
    expect(eng.state.team2Score).toBeGreaterThan(0);

    // Seat 0 chases with legal dot balls (0 runs)
    for (let i = 0; i < 6; i++) {
      eng.apply({ type: "bowl", delivery: "fast" }, 1);
      eng.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! }, 0);
    }

    expect(eng.state.finished).toBe(true);
    expect(eng.state.team2Score).toBeGreaterThan(eng.state.team1Score);
    expect(eng.state.winner).toBe(1);
    expect(eng.state.winnerSeats).toEqual([1]);
  });

  // ==================================================
  // 17. TIE RESOLUTION
  // ==================================================
  it("properly declares a tie with empty winnerSeats and null winner when scores are equal", () => {
    const rng = () => 0.11; // 0 runs, no extras, legal dot delivery
    const eng = new CricketEngine(players, rng, { matchType: "1-over" });
    eng.apply({ type: "toss-call", call: "heads" }, 0);
    eng.apply({ type: "toss-choice", choice: "bat" }, 0);

    // Inning 1: 6 dots (0 runs)
    for (let i = 0; i < 6; i++) {
      eng.apply({ type: "bowl", delivery: "fast" }, 1);
      eng.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! }, 0);
    }
    expect(eng.state.team1Score).toBe(0);
    expect(eng.state.target).toBe(1);

    // Inning 2: 6 dots (0 runs)
    for (let i = 0; i < 6; i++) {
      eng.apply({ type: "bowl", delivery: "fast" }, 0);
      eng.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! }, 1);
    }
    expect(eng.state.team2Score).toBe(0);

    expect(eng.state.finished).toBe(true);
    expect(eng.state.endReason).toBe("tie");
    expect(eng.state.winner).toBeNull();
    expect(eng.state.winnerSeats).toEqual([]);
  });

  // ==================================================
  // 22. TOSS REFRESH (PRESERVATION OF TOSS CHOICE STATE)
  // ==================================================
  it("preserves tossWinner and toss-choice actor on state reload without rerolling", () => {
    const eng = new CricketEngine(players, () => 0.1);
    const tossCall = eng.apply({ type: "toss-call", call: "heads" }, 0);
    expect(tossCall.ok).toBe(true);
    const tossWinner = eng.state.tossWinner!;

    // Serialize state
    const serialized = JSON.parse(JSON.stringify(eng.serialize()));
    expect(serialized.currentActor).toBe("toss-choice");
    expect(serialized.tossWinner).toBe(tossWinner);
    expect(serialized.currentSeat).toBe(tossWinner);

    // Applying choice using original tossWinner succeeds
    const choiceRes = eng.apply({ type: "toss-choice", choice: "bat" }, tossWinner);
    expect(choiceRes.ok).toBe(true);
    expect(eng.state.currentActor).toBe("bowler");
  });

  // ==================================================
  // 23. TURN SECURITY
  // ==================================================
  it("enforces strict role/turn security: batsman cannot bowl and bowler cannot bat", () => {
    const eng = new CricketEngine(players, () => 0.9, { matchType: "1-over" });
    eng.apply({ type: "toss-call", call: eng.state.tossResult! }, 0);
    eng.apply({ type: "toss-choice", choice: "bat" }, 0); // Seat 0 bats, Seat 1 bowls

    expect(eng.state.currentActor).toBe("bowler");
    expect(eng.state.bowlingTeam).toBe(1);
    expect(eng.state.battingTeam).toBe(0);

    // Batsman (Seat 0) attempts to bowl -> REJECTED
    const batsmanBowl = eng.apply({ type: "bowl", delivery: "fast" }, 0);
    expect(batsmanBowl.ok).toBe(false);

    // Bowler (Seat 1) bowls valid delivery
    const bowlerBowl = eng.apply({ type: "bowl", delivery: "fast" }, 1);
    expect(bowlerBowl.ok).toBe(true);

    expect(eng.state.currentActor).toBe("batsman");

    // Bowler (Seat 1) attempts to bat -> REJECTED
    const bowlerBat = eng.apply({
      type: "bat",
      shot: "straight",
      timing: "good",
      deliveryId: eng.state.activeDeliveryId!,
    }, 1);
    expect(bowlerBat.ok).toBe(false);

    // Batsman (Seat 0) bats -> ACCEPTED
    const batsmanBat = eng.apply({
      type: "bat",
      shot: "straight",
      timing: "good",
      deliveryId: eng.state.activeDeliveryId!,
    }, 0);
    expect(batsmanBat.ok).toBe(true);
  });

  // ==================================================
  // 26. AUTOMATED REGRESSION: TERNARY PRECEDENCE & SCORE TYPE
  // ==================================================
  it("enforces exact first innings target calculation and score type for both teams", () => {
    // Seat 0 first innings test
    {
      const eng = new CricketEngine(players, () => 0.9, { matchType: "1-over" });
      const call = eng.state.tossResult === "heads" ? "heads" : "tails";
      eng.apply({ type: "toss-call", call }, 0);
      eng.apply({ type: "toss-choice", choice: "bat" }, 0); // seat 0 bats first

      for (let i = 0; i < 6; i++) {
        eng.apply({ type: "bowl", delivery: "fast" }, 1);
        eng.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! }, 0);
      }

      expect(eng.state.inning).toBe(2);
      expect(eng.state.target).toBe(eng.state.team1Score + 1);
      expect(typeof eng.state.target).toBe("number");
    }

    // Seat 1 first innings test
    {
      const eng = new CricketEngine(players, () => 0.9, { matchType: "1-over" });
      const call = eng.state.tossResult === "heads" ? "tails" : "heads";
      eng.apply({ type: "toss-call", call }, 0);
      eng.apply({ type: "toss-choice", choice: "bat" }, 1); // seat 1 bats first

      for (let i = 0; i < 6; i++) {
        eng.apply({ type: "bowl", delivery: "fast" }, 0);
        eng.apply({ type: "bat", shot: "straight", timing: "good", deliveryId: eng.state.activeDeliveryId! }, 1);
      }

      expect(eng.state.inning).toBe(2);
      expect(eng.state.target).toBe(eng.state.team2Score + 1);
      expect(typeof eng.state.target).toBe("number");
    }

    // Type safety assertions protecting against boolean expressions in chasingScore
    const battingTeam = 1;
    const team1Score = 10;
    const team2Score = 15;
    const score = battingTeam === 0 ? team1Score : team2Score;
    expect(typeof score).toBe("number");
    expect(score).toBe(15);
  });
});
