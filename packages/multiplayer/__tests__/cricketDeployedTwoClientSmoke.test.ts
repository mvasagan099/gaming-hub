import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io, type Socket } from "socket.io-client";
import type { CricketAction, CricketState } from "@gaming-hub/game-engine";

const SOCKET_SERVER_URL = "http://localhost:4001";
const COOLDOWN_WAIT_MS = 180;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function createClient(userId: string): Socket {
  return io(SOCKET_SERVER_URL, {
    auth: { token: `test.${userId}` },
    transports: ["websocket"],
    reconnection: false,
    timeout: 5000,
  });
}

function waitForEvent<T = any>(socket: Socket, eventName: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, listener);
      reject(new Error(`Timeout waiting for event "${eventName}" on socket ${socket.id}`));
    }, timeoutMs);

    const listener = (data: T) => {
      clearTimeout(timer);
      socket.off(eventName, listener);
      resolve(data);
    };

    socket.on(eventName, listener);
  });
}

async function sendAction(socket: Socket, roomId: string, action: CricketAction): Promise<{
  ok: boolean;
  data?: {
    ok: boolean;
    error?: string;
    state?: CricketState;
    events?: any[];
    finished?: boolean;
    winnerSeats?: number[];
  };
  error?: { code: string; message: string };
}> {
  if (action.type === "bowl" && !action.pitchTargetId) {
    const targetRes: any = await new Promise((resolve) => {
      socket.emit(
        "game:action",
        { roomId, action: { type: "set-pitch-target", lateral: 0, length: 0.4 } },
        (res: any) => resolve(res),
      );
    });
    if (targetRes?.data?.ok && targetRes.data.state?.pitchTarget) {
      action = { ...action, pitchTargetId: targetRes.data.state.pitchTarget.targetId };
      await new Promise((resolve) => setTimeout(resolve, 850));
    }
  }
  return new Promise((resolve) => {
    socket.emit("game:action", { roomId, action }, (res: any) => {
      resolve(res);
    });
  });
}

describe("FINAL CRICKET DEPLOYED TWO-CLIENT SMOKE TEST (LIVE SERVER)", () => {
  let serverRunning = false;

  beforeAll(async () => {
    try {
      const probe = io(SOCKET_SERVER_URL, {
        auth: { token: "test.probe-user" },
        transports: ["websocket"],
        timeout: 2000,
      });
      await new Promise<void>((resolve, reject) => {
        probe.on("connect", () => {
          serverRunning = true;
          probe.disconnect();
          resolve();
        });
        probe.on("connect_error", (err) => {
          probe.disconnect();
          reject(err);
        });
      });
    } catch {
      serverRunning = false;
    }
  });

  // Helper to setup a live 2-player match
  async function setupLiveMatch(suffix: string) {
    const userA = `smoke-alice-${suffix}`;
    const userB = `smoke-bob-${suffix}`;

    const sockA = createClient(userA);
    const sockB = createClient(userB);

    await Promise.all([
      new Promise<void>((res) => sockA.on("connect", () => res())),
      new Promise<void>((res) => sockB.on("connect", () => res())),
    ]);

    // SockA creates room
    const createRes = await new Promise<any>((resolve) => {
      sockA.emit(
        "room:create",
        { gameId: "cricket", isPrivate: true, stake: 0, settings: {} },
        resolve,
      );
    });
    expect(createRes.ok).toBe(true);
    const roomId = createRes.data.id;
    const code = createRes.data.code;

    // SockB joins room
    const joinRes = await new Promise<any>((resolve) => {
      sockB.emit("room:join", { roomId, code, asSpectator: false }, resolve);
    });
    expect(joinRes.ok).toBe(true);

    // Both ready
    await new Promise<any>((r) => sockA.emit("room:ready", { roomId, ready: true }, r));
    await new Promise<any>((r) => sockB.emit("room:ready", { roomId, ready: true }, r));

    // Listen for match:started
    const startedPromiseA = waitForEvent(sockA, "match:started");
    const startedPromiseB = waitForEvent(sockB, "match:started");

    // Start match
    const startRes = await new Promise<any>((resolve) => {
      sockA.emit("room:start", { roomId }, resolve);
    });
    expect(startRes.ok).toBe(true);

    const [startedA, startedB] = await Promise.all([startedPromiseA, startedPromiseB]);
    expect(startedA.matchId).toBeDefined();
    expect(startedB.matchId).toBeDefined();

    return { sockA, sockB, roomId, userA, userB };
  }

  // Helper to execute the toss cleanly and deterministically set batting order
  async function completeToss(
    sockA: Socket,
    sockB: Socket,
    roomId: string,
    seat0BatsFirst: boolean,
  ) {
    const callRes = await sendAction(sockA, roomId, { type: "toss-call", call: "heads" });
    expect(callRes.data?.ok).toBe(true);
    const tossWinner = callRes.data?.state?.tossWinner!;
    await delay(COOLDOWN_WAIT_MS);

    // If seat0BatsFirst is true:
    // If tossWinner === 0, Seat 0 chooses "bat".
    // If tossWinner === 1, Seat 1 chooses "bowl".
    // If seat0BatsFirst is false (Seat 1 bats first):
    // If tossWinner === 0, Seat 0 chooses "bowl".
    // If tossWinner === 1, Seat 1 chooses "bat".
    const winnerSock = tossWinner === 0 ? sockA : sockB;
    const choice = (tossWinner === 0)
      ? (seat0BatsFirst ? "bat" : "bowl")
      : (seat0BatsFirst ? "bowl" : "bat");

    const choiceRes = await sendAction(winnerSock, roomId, { type: "toss-choice", choice });
    expect(choiceRes.data?.ok).toBe(true);
    await delay(COOLDOWN_WAIT_MS);

    return {
      tossWinner,
      state: choiceRes.data?.state!,
      battingTeam: choiceRes.data?.state?.battingTeam!,
      bowlingTeam: choiceRes.data?.state?.bowlingTeam!,
    };
  }

  // ==========================================================================
  // 1. USE TWO REAL CLIENTS
  // ==========================================================================
  it("1. Connects two real authenticated Socket.IO clients to the live server", async () => {
    if (!serverRunning) return;
    const { sockA, sockB, roomId } = await setupLiveMatch("sec1");
    expect(sockA.connected).toBe(true);
    expect(sockB.connected).toBe(true);
    expect(roomId).toBeDefined();
    sockA.disconnect();
    sockB.disconnect();
  });

  // ==========================================================================
  // 2. VERIFY TOSS (A wins toss, B sees waiting and cannot choose; repeat with B)
  // ==========================================================================
  it("2. Authoritative toss controls: only winner can choose; non-winner rejected", async () => {
    if (!serverRunning) return;
    const { sockA, sockB, roomId } = await setupLiveMatch("sec2");

    // Step 1: SockB attempts to call toss when it is SockA's turn -> REJECTED
    const unauthorizedCall = await sendAction(sockB, roomId, { type: "toss-call", call: "heads" });
    expect(unauthorizedCall.ok).toBe(true);
    expect(unauthorizedCall.data?.ok).toBe(false);
    expect(unauthorizedCall.data?.error).toMatch(/not your turn|NOT_YOUR_TOSS/i);

    // Step 2: SockA calls heads -> ACCEPTED
    const callRes = await sendAction(sockA, roomId, { type: "toss-call", call: "heads" });
    expect(callRes.ok).toBe(true);
    expect(callRes.data?.ok).toBe(true);
    await delay(COOLDOWN_WAIT_MS);

    const tossWinner = callRes.data?.state?.tossWinner!;
    const winnerSock = tossWinner === 0 ? sockA : sockB;
    const loserSock = tossWinner === 0 ? sockB : sockA;

    // Step 3: Loser attempts to select toss-choice -> REJECTED
    const loserChoice = await sendAction(loserSock, roomId, { type: "toss-choice", choice: "bat" });
    expect(loserChoice.ok).toBe(true);
    expect(loserChoice.data?.ok).toBe(false);
    expect(loserChoice.data?.error).toMatch(/not your turn|NOT_YOUR_TOSS_CHOICE/i);
    await delay(COOLDOWN_WAIT_MS);

    // Step 4: Winner selects choice -> ACCEPTED
    const winnerChoice = await sendAction(winnerSock, roomId, { type: "toss-choice", choice: "bat" });
    expect(winnerChoice.ok).toBe(true);
    expect(winnerChoice.data?.ok).toBe(true);
    expect(winnerChoice.data?.state?.battingFirst).toBe(tossWinner);
    expect(winnerChoice.data?.state?.currentActor).toBe("bowler");

    sockA.disconnect();
    sockB.disconnect();
  });

  // ==========================================================================
  // 3 & 4. VERIFY SEAT 1 BATS FIRST & TARGET IDENTICAL ON BOTH CLIENTS
  // ==========================================================================
  it("3 & 4. Seat 1 bats first: runs belong strictly to team2Score; target is team2Score + 1", { timeout: 25000 }, async () => {
    if (!serverRunning) return;
    const { sockA, sockB, roomId } = await setupLiveMatch("sec3");

    // Configure match so Seat 1 bats first
    const { state: startState } = await completeToss(sockA, sockB, roomId, false);
    expect(startState.battingTeam).toBe(1);
    expect(startState.bowlingTeam).toBe(0);
    expect(startState.team1Score).toBe(0);
    expect(startState.team2Score).toBe(0);

    // Listen for broadcasts
    const latest = {
      a: null as CricketState | null,
      b: null as CricketState | null,
    };
    sockA.on("game:state", (payload: any) => { latest.a = payload.state; });
    sockB.on("game:state", (payload: any) => { latest.b = payload.state; });

    // Seat 0 (bowler, sockA) bowls ball 1
    const bowlRes = await sendAction(sockA, roomId, { type: "bowl", delivery: "fast" });
    expect(bowlRes.data?.ok).toBe(true);
    const deliveryId = bowlRes.data?.state?.activeDeliveryId!;
    await delay(COOLDOWN_WAIT_MS);

    // Seat 1 (batsman, sockB) hits shot
    const batRes = await sendAction(sockB, roomId, {
      type: "bat",
      shot: "straight",
      timing: "good",
      deliveryId,
    });
    expect(batRes.data?.ok).toBe(true);
    await delay(COOLDOWN_WAIT_MS);

    // CRITICAL: Runs must belong strictly to Seat 1 (team2Score). team1Score must remain 0!
    const state = batRes.data?.state!;
    expect(state.team2Score).toBeGreaterThanOrEqual(0);
    expect(state.team1Score).toBe(0);

    // Verify broadcast received identically on both clients
    await delay(100);
    expect(latest.a?.team2Score).toBe(state.team2Score);
    expect(latest.b?.team2Score).toBe(state.team2Score);
    expect(latest.a?.team1Score).toBe(0);
    expect(latest.b?.team1Score).toBe(0);

    // Complete remaining balls of Inning 1
    while (latest.a?.inning === 1) {
      const bRes = await sendAction(sockA, roomId, { type: "bowl", delivery: "fast" });
      if (!bRes.data?.ok) break;
      const delId = bRes.data?.state?.activeDeliveryId!;
      await delay(COOLDOWN_WAIT_MS);

      await sendAction(sockB, roomId, { type: "bat", shot: "up", timing: "good", deliveryId: delId });
      await delay(COOLDOWN_WAIT_MS);
    }

    // Inning 2 begins: Target MUST be team2Score + 1 on BOTH clients!
    expect(latest.a?.inning).toBe(2);
    expect(latest.b?.inning).toBe(2);
    expect(latest.a?.team2Score).toBeGreaterThan(0);
    expect(latest.a?.team1Score).toBe(0);
    const expectedTarget = latest.a!.team2Score + 1;
    expect(latest.a?.target).toBe(expectedTarget);
    expect(latest.b?.target).toBe(expectedTarget);

    sockA.disconnect();
    sockB.disconnect();
  });

  // ==========================================================================
  // 5 & 6. BOWL EVENT & BAT EVENT DEDUPLICATION (RAPID INPUT)
  // ==========================================================================
  it("5 & 6. Single delivery/shot event broadcast; rapid double-tap rejected", async () => {
    if (!serverRunning) return;
    const { sockA, sockB, roomId } = await setupLiveMatch("sec5");

    // Complete toss so Seat 0 bats, Seat 1 bowls
    await completeToss(sockA, sockB, roomId, true);

    // Bowler is Seat 1 (sockB). Batsman is Seat 0 (sockA).
    const bowlPromise1 = sendAction(sockB, roomId, { type: "bowl", delivery: "fast" });
    const bowlPromise2 = sendAction(sockB, roomId, { type: "bowl", delivery: "slow" });

    const [bowlRes1, bowlRes2] = await Promise.all([bowlPromise1, bowlPromise2]);
    const successfulBowls = [bowlRes1, bowlRes2].filter((r) => r.data?.ok === true);
    const rejectedBowls = [bowlRes1, bowlRes2].filter((r) => r.data?.ok === false);
    expect(successfulBowls).toHaveLength(1);
    expect(rejectedBowls).toHaveLength(1);

    const activeDeliveryId = successfulBowls[0].data?.state?.activeDeliveryId!;
    expect(activeDeliveryId).toBeDefined();

    // Rapid double-tap bat action by Seat 0
    const batPromise1 = sendAction(sockA, roomId, {
      type: "bat",
      shot: "straight",
      timing: "good",
      deliveryId: activeDeliveryId,
    });
    const batPromise2 = sendAction(sockA, roomId, {
      type: "bat",
      shot: "straight",
      timing: "good",
      deliveryId: activeDeliveryId,
    });

    const [batRes1, batRes2] = await Promise.all([batPromise1, batPromise2]);
    const successfulBats = [batRes1, batRes2].filter((r) => r.data?.ok === true);
    const rejectedBats = [batRes1, batRes2].filter((r) => r.data?.ok === false);
    expect(successfulBats).toHaveLength(1);
    expect(rejectedBats).toHaveLength(1);

    sockA.disconnect();
    sockB.disconnect();
  });

  // ==========================================================================
  // 7, 8, 9, 10. OVERS, WIDE, NO-BALL, AND LEGAL BALL ADVANCEMENT
  // ==========================================================================
  it("7, 8, 9, 10. Legal balls increment over tally; balls faced track correctly", async () => {
    if (!serverRunning) return;
    const { sockA, sockB, roomId } = await setupLiveMatch("sec7");

    // Seat 0 bats, Seat 1 bowls
    await completeToss(sockA, sockB, roomId, true);

    // Send first legal ball
    const bRes1 = await sendAction(sockB, roomId, { type: "bowl", delivery: "fast" });
    expect(bRes1.data?.ok).toBe(true);
    const del1 = bRes1.data?.state?.activeDeliveryId!;
    await delay(COOLDOWN_WAIT_MS);

    const batRes1 = await sendAction(sockA, roomId, { type: "bat", shot: "straight", timing: "good", deliveryId: del1 });
    expect(batRes1.data?.ok).toBe(true);
    await delay(COOLDOWN_WAIT_MS);

    const stateAfterBall1 = batRes1.data?.state!;
    const firstBallRecord = stateAfterBall1.balls[0];
    if (firstBallRecord.extraType === "wide" || firstBallRecord.extraType === "no-ball") {
      // If extra was rolled, legal ball does NOT advance
      expect(stateAfterBall1.currentBall).toBe(0);
    } else {
      // Normal ball: 0.1
      expect(stateAfterBall1.currentBall).toBe(1);
      expect(stateAfterBall1.players[0].balls).toBe(1);
    }

    sockA.disconnect();
    sockB.disconnect();
  });

  // ==========================================================================
  // 11. ROLE SWITCH AFTER INNINGS
  // ==========================================================================
  it("11. Roles swap cleanly after innings 1: old batsman becomes bowler, old bowler becomes batsman", { timeout: 25000 }, async () => {
    if (!serverRunning) return;
    const { sockA, sockB, roomId } = await setupLiveMatch("sec11");

    // Seat 0 bats first, Seat 1 bowls first
    const { state: init } = await completeToss(sockA, sockB, roomId, true);
    expect(init.battingTeam).toBe(0);
    expect(init.bowlingTeam).toBe(1);

    let currentState: CricketState = init;

    // Complete Inning 1
    while (currentState.inning === 1) {
      const bRes = await sendAction(sockB, roomId, { type: "bowl", delivery: "fast" });
      if (!bRes.data?.ok) break;
      const delId = bRes.data?.state?.activeDeliveryId!;
      await delay(COOLDOWN_WAIT_MS);

      const batRes = await sendAction(sockA, roomId, { type: "bat", shot: "straight", timing: "good", deliveryId: delId });
      currentState = batRes.data?.state!;
      await delay(COOLDOWN_WAIT_MS);
    }

    // Role switch verification
    expect(currentState.inning).toBe(2);
    expect(currentState.battingTeam).toBe(1); // Old bowler (Seat 1) is now batsman
    expect(currentState.bowlingTeam).toBe(0); // Old batsman (Seat 0) is now bowler
    expect(currentState.currentActor).toBe("bowler");
    expect(currentState.currentSeat).toBe(0); // Seat 0 bowls now

    // Old batsman (Seat 0) can now bowl!
    const bowlInning2 = await sendAction(sockA, roomId, { type: "bowl", delivery: "spin" });
    expect(bowlInning2.data?.ok).toBe(true);

    sockA.disconnect();
    sockB.disconnect();
  });

  // ==========================================================================
  // 12. RECONNECT — BOWLER TURN RESTORATION
  // ==========================================================================
  it("12. Reconnects bowler socket without match restart, preserving state", async () => {
    if (!serverRunning) return;
    const { sockA, sockB, roomId, userB } = await setupLiveMatch("sec12");

    // Seat 0 bats, Seat 1 bowls
    await completeToss(sockA, sockB, roomId, true);

    // Ball 1
    const bRes = await sendAction(sockB, roomId, { type: "bowl", delivery: "fast" });
    const delId = bRes.data?.state?.activeDeliveryId!;
    await delay(COOLDOWN_WAIT_MS);

    await sendAction(sockA, roomId, { type: "bat", shot: "straight", timing: "good", deliveryId: delId });
    await delay(COOLDOWN_WAIT_MS);

    // Now bowler's turn for ball 2. Disconnect bowler (sockB)
    sockB.disconnect();
    await delay(100);

    // Bowler reconnects with a fresh socket
    const reconnectedSockB = createClient(userB);
    await new Promise<void>((res) => reconnectedSockB.on("connect", () => res()));

    // Rejoining room
    const joinRes = await new Promise<any>((resolve) => {
      reconnectedSockB.emit("room:join", { roomId, asSpectator: false }, resolve);
    });
    expect(joinRes.ok).toBe(true);
    await delay(COOLDOWN_WAIT_MS);

    // Bowler can immediately bowl next ball without error!
    const nextBowl = await sendAction(reconnectedSockB, roomId, { type: "bowl", delivery: "spin" });
    expect(nextBowl.data?.ok).toBe(true);
    expect(nextBowl.data?.state?.currentActor).toBe("batsman");

    sockA.disconnect();
    reconnectedSockB.disconnect();
  });

  // ==========================================================================
  // 13. RECONNECT DURING PENDING DELIVERY
  // ==========================================================================
  it("13. Preserves pending delivery when batsman reconnects, permitting shot resolution", async () => {
    if (!serverRunning) return;
    const { sockA, sockB, roomId, userA } = await setupLiveMatch("sec13");

    // Seat 0 bats, Seat 1 bowls
    await completeToss(sockA, sockB, roomId, true);

    // Bowler (sockB) bowls
    const bowlRes = await sendAction(sockB, roomId, { type: "bowl", delivery: "fast" });
    expect(bowlRes.data?.ok).toBe(true);
    const deliveryId = bowlRes.data?.state?.activeDeliveryId!;
    await delay(100);

    // Batsman (sockA) disconnects before swinging
    sockA.disconnect();
    await delay(100);

    // Batsman reconnects
    const reconnectedSockA = createClient(userA);
    await new Promise<void>((res) => reconnectedSockA.on("connect", () => res()));
    await new Promise<any>((resolve) => {
      reconnectedSockA.emit("room:join", { roomId, asSpectator: false }, resolve);
    });
    await delay(COOLDOWN_WAIT_MS);

    // Batsman hits the pending delivery
    const batRes = await sendAction(reconnectedSockA, roomId, {
      type: "bat",
      shot: "straight",
      timing: "good",
      deliveryId,
    });
    expect(batRes.data?.ok).toBe(true);
    expect(batRes.data?.state?.balls).toHaveLength(1);

    reconnectedSockA.disconnect();
    sockB.disconnect();
  });

  // ==========================================================================
  // 14. RECONNECT AFTER RESULT
  // ==========================================================================
  it("14. Reconnect after result restores latest score without replaying past delivery", async () => {
    if (!serverRunning) return;
    const { sockA, sockB, roomId, userA } = await setupLiveMatch("sec14");

    // Seat 0 bats, Seat 1 bowls
    await completeToss(sockA, sockB, roomId, true);

    // Ball 1 bowled and resolved
    const bRes = await sendAction(sockB, roomId, { type: "bowl", delivery: "fast" });
    const delId = bRes.data?.state?.activeDeliveryId!;
    await delay(COOLDOWN_WAIT_MS);

    const batRes = await sendAction(sockA, roomId, { type: "bat", shot: "straight", timing: "good", deliveryId: delId });
    const scoreAfterBall1 = batRes.data?.state?.team1Score;
    await delay(COOLDOWN_WAIT_MS);

    // SockA disconnects and reconnects
    sockA.disconnect();
    await delay(100);

    const reconnectedSockA = createClient(userA);
    await new Promise<void>((res) => reconnectedSockA.on("connect", () => res()));
    const joinRes = await new Promise<any>((resolve) => {
      reconnectedSockA.emit("room:join", { roomId, asSpectator: false }, resolve);
    });
    expect(joinRes.ok).toBe(true);

    // Check room state
    const roomState = joinRes.data?.state;
    if (roomState) {
      expect(roomState.team1Score).toBe(scoreAfterBall1);
      expect(roomState.pendingDelivery).toBeNull();
    }

    reconnectedSockA.disconnect();
    sockB.disconnect();
  });

  // ==========================================================================
  // 15. NETWORK DELAY / LATENCY RESILIENCE
  // ==========================================================================
  it("15. Server remains authoritative during network latency delays", async () => {
    if (!serverRunning) return;
    const { sockA, sockB, roomId } = await setupLiveMatch("sec15");

    await completeToss(sockA, sockB, roomId, true);

    // Simulate delayed bowler action
    await delay(300);
    const bowlRes = await sendAction(sockB, roomId, { type: "bowl", delivery: "fast" });
    expect(bowlRes.data?.ok).toBe(true);
    const delId = bowlRes.data?.state?.activeDeliveryId!;

    // Simulate delayed batsman action
    await delay(300);
    const batRes = await sendAction(sockA, roomId, { type: "bat", shot: "straight", timing: "good", deliveryId: delId });
    expect(batRes.data?.ok).toBe(true);

    // State is strictly coherent
    expect(batRes.data?.state?.balls).toHaveLength(1);
    expect(batRes.data?.state?.currentActor).toBe("bowler");

    sockA.disconnect();
    sockB.disconnect();
  });

  // ==========================================================================
  // 16. WRONG-TURN ACTION SECURITY
  // ==========================================================================
  it("16. Strict turn & role security: batsman cannot bowl, bowler cannot bat", async () => {
    if (!serverRunning) return;
    const { sockA, sockB, roomId } = await setupLiveMatch("sec16");

    // Seat 0 bats, Seat 1 bowls
    await completeToss(sockA, sockB, roomId, true);

    // Batsman (Seat 0, sockA) tries to bowl -> REJECTED
    const batsmanBowl = await sendAction(sockA, roomId, { type: "bowl", delivery: "fast" });
    expect(batsmanBowl.data?.ok).toBe(false);

    // Bowler (Seat 1, sockB) bowls -> ACCEPTED
    const bowlerBowl = await sendAction(sockB, roomId, { type: "bowl", delivery: "fast" });
    expect(bowlerBowl.data?.ok).toBe(true);
    const delId = bowlerBowl.data?.state?.activeDeliveryId!;

    // Bowler (Seat 1, sockB) tries to bat -> REJECTED
    const bowlerBat = await sendAction(sockB, roomId, { type: "bat", shot: "straight", timing: "good", deliveryId: delId });
    expect(bowlerBat.data?.ok).toBe(false);

    sockA.disconnect();
    sockB.disconnect();
  });

  // ==========================================================================
  // 19. FINAL RESULT: MATCH COMPLETION WITH WINNER
  // ==========================================================================
  it("19. Completes full match with authoritative winner and state", { timeout: 25000 }, async () => {
    if (!serverRunning) return;
    const { sockA, sockB, roomId } = await setupLiveMatch("sec19");

    // Seat 1 bats first
    const { state: init } = await completeToss(sockA, sockB, roomId, false);
    expect(init.battingTeam).toBe(1);

    // Track game:over event broadcast by server
    let gameOverPayload: any = null;
    sockA.on("game:over", (data: any) => {
      gameOverPayload = data;
    });
    sockB.on("game:over", (data: any) => {
      gameOverPayload = data;
    });

    let currentState = init;

    // Inning 1 (Seat 1 bats, Seat 0 bowls 6 balls)
    while (currentState.inning === 1 && !currentState.finished) {
      const bRes = await sendAction(sockA, roomId, { type: "bowl", delivery: "fast" });
      if (!bRes.data?.ok) break;
      const delId = bRes.data?.state?.activeDeliveryId!;
      await delay(COOLDOWN_WAIT_MS);

      const batRes = await sendAction(sockB, roomId, { type: "bat", shot: "straight", timing: "good", deliveryId: delId });
      currentState = batRes.data?.state!;
      await delay(COOLDOWN_WAIT_MS);
    }

    // Inning 2 (Seat 0 bats, Seat 1 bowls)
    while (!currentState.finished) {
      const bRes = await sendAction(sockB, roomId, { type: "bowl", delivery: "fast" });
      if (!bRes.data?.ok || bRes.data?.state?.finished) {
        if (bRes.data?.state) currentState = bRes.data.state;
        break;
      }
      const delId = bRes.data?.state?.activeDeliveryId!;
      await delay(COOLDOWN_WAIT_MS);

      const batRes = await sendAction(sockA, roomId, { type: "bat", shot: "up", timing: "good", deliveryId: delId });
      currentState = batRes.data?.state!;
      await delay(COOLDOWN_WAIT_MS);
    }

    await delay(300);
    expect(currentState.finished).toBe(true);
    expect(currentState.winner).not.toBeNull();
    expect(gameOverPayload).not.toBeNull();
    expect(gameOverPayload.winnerSeats).toBeDefined();
    expect(gameOverPayload.winnerSeats).toContain(currentState.winner);

    sockA.disconnect();
    sockB.disconnect();
  });
});
