import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { GameEntryLifecycleService } from "../gameEntryLifecycleService";
import { GameCoinService } from "../gameCoinService";

describe("Feature 5: Unified Game Entry Lifecycle", () => {
  const createdUserIds: string[] = [];

  async function createTestUser(prefix: string, balance = 1000) {
    const userId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    createdUserIds.push(userId);

    await prisma.user.create({
      data: {
        id: userId,
        username: `u_${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`,
        displayName: `User ${userId.slice(0, 8)}`,
        email: `${userId}@test.com`,
        wallet: {
          create: {
            balance,
          },
        },
        profile: {
          create: {},
        },
      },
    });

    return userId;
  }

  async function getWallet(userId: string) {
    return prisma.wallet.findUniqueOrThrow({ where: { userId } });
  }

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Successful Paid Entry Lifecycle
  // ---------------------------------------------------------------------------
  it("1. Successful paid entry: complete lifecycle CREATED -> FEE_PAID -> MATCH_READY -> MATCH_STARTED -> MATCH_FINISHED -> SETTLED", async () => {
    const userA = await createTestUser("u-life-a", 1000);
    const userB = await createTestUser("u-life-b", 1000);
    const matchId = `match-lifecycle-${Date.now()}`;

    // Step 1: User A enters
    const entryA = await GameEntryLifecycleService.initiateEntry({
      userId: userA,
      gameId: "chess",
      stake: 100,
      matchId,
      seat: 0,
    });
    expect(entryA.status).toBe("FEE_PAID");
    expect(entryA.fee).toBe(100);

    // Check ready state: only 1 player, should not be ready
    const ready1 = await GameEntryLifecycleService.checkMatchReady(matchId);
    expect(ready1.isReady).toBe(false);
    expect(ready1.currentPlayers).toBe(1);

    // Step 2: User B enters
    const entryB = await GameEntryLifecycleService.initiateEntry({
      userId: userB,
      gameId: "chess",
      stake: 100,
      matchId,
      seat: 1,
    });
    expect(entryB.status).toBe("FEE_PAID");

    // Check ready state: both players joined, now MATCH_READY
    const ready2 = await GameEntryLifecycleService.checkMatchReady(matchId);
    expect(ready2.isReady).toBe(true);
    expect(ready2.currentPlayers).toBe(2);

    // Step 3: Match starts (MATCH_STARTED / ACTIVE)
    const startedMatch = await GameEntryLifecycleService.startMatch(matchId);
    expect(startedMatch.status).toBe("ACTIVE");
    expect(startedMatch.startedAt).toBeDefined();

    // Step 4: Authoritative match finish & settlement
    const settlement = await GameEntryLifecycleService.finishAndSettleMatch(matchId, [userA], {
      scores: { [userA]: 1, [userB]: 0 },
      resultType: "WIN",
    });

    expect(settlement.winners).toEqual([userA]);
    expect(settlement.pot).toBe(200);

    // User A wins 180 coins: 1000 - 100 + 180 = 1080
    const wA = await getWallet(userA);
    expect(wA.balance).toBe(1080);

    // User B loses: 1000 - 100 = 900
    const wB = await getWallet(userB);
    expect(wB.balance).toBe(900);

    // Traceability check
    const trace = await GameEntryLifecycleService.getEntryTrace(matchId);
    expect(trace).toHaveLength(2);
    expect(trace[0].status).toBe("SETTLED");
    expect(trace[0].timeline.paidAt).toBeDefined();
    expect(trace[0].timeline.startedAt).toBeDefined();
    expect(trace[0].timeline.finishedAt).toBeDefined();
    expect(trace[0].timeline.settledAt).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 2. Insufficient Balance
  // ---------------------------------------------------------------------------
  it("2. Insufficient balance: rejects entry, 0 coins debited, 0 match player entries", async () => {
    const poorUser = await createTestUser("u-poor", 30);
    const matchId = `match-poor-${Date.now()}`;

    await expect(
      GameEntryLifecycleService.initiateEntry({
        userId: poorUser,
        gameId: "table-tennis",
        stake: 100,
        matchId,
      })
    ).rejects.toThrow(/INSUFFICIENT_BALANCE|Insufficient coins/i);

    const wallet = await getWallet(poorUser);
    expect(wallet.balance).toBe(30);

    const playerCount = await prisma.matchPlayer.count({ where: { matchId, userId: poorUser } });
    expect(playerCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 3. Duplicate Entry
  // ---------------------------------------------------------------------------
  it("3. Duplicate entry: repeated initiateEntry calls for same match/user are idempotent and do not double charge", async () => {
    const user = await createTestUser("u-dup-entry", 1000);
    const matchId = `match-dup-${Date.now()}`;

    const res1 = await GameEntryLifecycleService.initiateEntry({
      userId: user,
      gameId: "ludo",
      stake: 100,
      matchId,
      seat: 0,
    });
    expect(res1.status).toBe("FEE_PAID");

    const res2 = await GameEntryLifecycleService.initiateEntry({
      userId: user,
      gameId: "ludo",
      stake: 100,
      matchId,
      seat: 0,
    });
    expect(res2.status).toBe("FEE_PAID");

    const wallet = await getWallet(user);
    expect(wallet.balance).toBe(900); // Charged once (1000 - 100 = 900)

    const txs = await prisma.transaction.findMany({
      where: { userId: user, referenceId: matchId },
    });
    expect(txs).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // 4. Concurrent Entry
  // ---------------------------------------------------------------------------
  it("4. Concurrent entry: simultaneous join requests debit wallet exactly once", async () => {
    const user = await createTestUser("u-conc-entry", 1000);
    const matchId = `match-conc-${Date.now()}`;

    const results = await Promise.allSettled([
      GameEntryLifecycleService.initiateEntry({
        userId: user,
        gameId: "ludo",
        stake: 100,
        matchId,
        seat: 0,
      }),
      GameEntryLifecycleService.initiateEntry({
        userId: user,
        gameId: "ludo",
        stake: 100,
        matchId,
        seat: 0,
      }),
    ]);

    const successes = results.filter((r) => r.status === "fulfilled");
    expect(successes.length).toBeGreaterThanOrEqual(1);

    const wallet = await getWallet(user);
    expect(wallet.balance).toBe(900);

    const playerCount = await prisma.matchPlayer.count({ where: { matchId, userId: user } });
    expect(playerCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 5. Room Full
  // ---------------------------------------------------------------------------
  it("5. Room full: rejects entry beyond game capacity without debiting coins", async () => {
    const userA = await createTestUser("u-full-a", 1000);
    const userB = await createTestUser("u-full-b", 1000);
    const userC = await createTestUser("u-full-c", 1000);
    const matchId = `match-full-${Date.now()}`;

    // Chess has maxPlayers = 2
    await GameEntryLifecycleService.initiateEntry({
      userId: userA,
      gameId: "chess",
      stake: 100,
      matchId,
      seat: 0,
    });
    await GameEntryLifecycleService.initiateEntry({
      userId: userB,
      gameId: "chess",
      stake: 100,
      matchId,
      seat: 1,
    });

    // 3rd player attempts entry
    await expect(
      GameEntryLifecycleService.initiateEntry({
        userId: userC,
        gameId: "chess",
        stake: 100,
        matchId,
        seat: 2,
      })
    ).rejects.toThrow(/ROOM_FULL|capacity/i);

    const wC = await getWallet(userC);
    expect(wC.balance).toBe(1000); // untouched
  });

  // ---------------------------------------------------------------------------
  // 6. Match Ready
  // ---------------------------------------------------------------------------
  it("6. Match ready: checkMatchReady validates exact server player count", async () => {
    const userA = await createTestUser("u-rdy-a", 1000);
    const userB = await createTestUser("u-rdy-b", 1000);
    const matchId = `match-rdy-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({
      userId: userA,
      gameId: "fruit-ninja",
      stake: 100,
      matchId,
    });

    const status1 = await GameEntryLifecycleService.checkMatchReady(matchId);
    expect(status1.isReady).toBe(false);

    await GameEntryLifecycleService.initiateEntry({
      userId: userB,
      gameId: "fruit-ninja",
      stake: 100,
      matchId,
    });

    const status2 = await GameEntryLifecycleService.checkMatchReady(matchId);
    expect(status2.isReady).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 7. Match Start
  // ---------------------------------------------------------------------------
  it("7. Match start: startMatch transitions status to ACTIVE and prevents duplicate starts", async () => {
    const userA = await createTestUser("u-st-a", 1000);
    const userB = await createTestUser("u-st-b", 1000);
    const matchId = `match-st-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "bubble-shooter", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "bubble-shooter", stake: 100, matchId });

    const m1 = await GameEntryLifecycleService.startMatch(matchId);
    expect(m1.status).toBe("ACTIVE");

    // Second call is idempotent
    const m2 = await GameEntryLifecycleService.startMatch(matchId);
    expect(m2.status).toBe("ACTIVE");
  });

  // ---------------------------------------------------------------------------
  // 8. Match Finish
  // ---------------------------------------------------------------------------
  it("8. Match finish: records final scores and transitions status to FINISHED", async () => {
    const userA = await createTestUser("u-fn-a", 1000);
    const userB = await createTestUser("u-fn-b", 1000);
    const matchId = `match-fn-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "snake-vs-worms", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "snake-vs-worms", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    await GameEntryLifecycleService.finishAndSettleMatch(matchId, [userA], {
      scores: { [userA]: 500, [userB]: 300 },
      resultType: "WIN",
    });

    const match = await prisma.match.findUniqueOrThrow({
      where: { id: matchId },
      include: { players: true },
    });
    expect(match.status).toBe("FINISHED");
    expect(match.endedAt).toBeDefined();

    const pA = match.players.find((p) => p.userId === userA);
    const pB = match.players.find((p) => p.userId === userB);
    expect(pA?.result).toBe("WIN");
    expect(pA?.score).toBe(500);
    expect(pB?.result).toBe("LOSS");
    expect(pB?.score).toBe(300);
  });

  // ---------------------------------------------------------------------------
  // 9. Settlement (Draw Refund Policy)
  // ---------------------------------------------------------------------------
  it("9. Settlement: draw outcome refunds 100% entry fee to all players", async () => {
    const userA = await createTestUser("u-draw-a", 1000);
    const userB = await createTestUser("u-draw-b", 1000);
    const matchId = `match-draw-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "carrom", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "carrom", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    await GameEntryLifecycleService.finishAndSettleMatch(matchId, [], {
      resultType: "DRAW",
    });

    const wA = await getWallet(userA);
    const wB = await getWallet(userB);
    expect(wA.balance).toBe(1000); // 1000 - 100 + 100 refund = 1000
    expect(wB.balance).toBe(1000);

    const refunds = await prisma.transaction.findMany({
      where: { referenceId: matchId, referenceType: "WAGER_REFUND" },
    });
    expect(refunds).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // 10. Failed Initialization / Pre-Game Cancellation
  // ---------------------------------------------------------------------------
  it("10. Failed initialization: abortAndRefundMatch refunds 100% of player wagers", async () => {
    const userA = await createTestUser("u-abort-a", 1000);
    const userB = await createTestUser("u-abort-b", 1000);
    const matchId = `match-abort-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "ludo", stake: 100, matchId });

    // Both users debited 100
    expect((await getWallet(userA)).balance).toBe(900);
    expect((await getWallet(userB)).balance).toBe(900);

    // Abort match due to initialization error
    await GameEntryLifecycleService.abortAndRefundMatch(matchId, "server_initialization_error");

    // Both users refunded back to 1000
    expect((await getWallet(userA)).balance).toBe(1000);
    expect((await getWallet(userB)).balance).toBe(1000);

    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(match.status).toBe("ABORTED");
  });

  // ---------------------------------------------------------------------------
  // 11. Disconnect Grace Period
  // ---------------------------------------------------------------------------
  it("11. Disconnect: handleDisconnect provides grace period without immediate forfeit", async () => {
    const user = await createTestUser("u-disc", 1000);
    const matchId = `match-disc-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: user, gameId: "chess", stake: 100, matchId });

    const disc = await GameEntryLifecycleService.handleDisconnect(matchId, user);
    expect(disc.disconnected).toBe(true);
    expect(disc.gracePeriodSeconds).toBeGreaterThan(0);

    // Match status remains intact (not finished/forfeited)
    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(match.status).toBe("CREATED");
  });

  // ---------------------------------------------------------------------------
  // 12. Reconnect
  // ---------------------------------------------------------------------------
  it("12. Reconnect: handleReconnect restores connection state within grace period", async () => {
    const user = await createTestUser("u-reconn", 1000);
    const matchId = `match-reconn-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: user, gameId: "table-tennis", stake: 100, matchId });
    await GameEntryLifecycleService.handleDisconnect(matchId, user);

    const reconn = await GameEntryLifecycleService.handleReconnect(matchId, user);
    expect(reconn.reconnected).toBe(true);
    expect(reconn.match.id).toBe(matchId);
  });

  // ---------------------------------------------------------------------------
  // 13. Abandoned Match
  // ---------------------------------------------------------------------------
  it("13. Abandoned match: handleAbandonment settles match in favor of remaining player", async () => {
    const userA = await createTestUser("u-ab-a", 1000);
    const userB = await createTestUser("u-ab-b", 1000); // will abandon
    const matchId = `match-abandon-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "chess", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "chess", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // User B abandons
    await GameEntryLifecycleService.handleAbandonment(matchId, userB);

    const wA = await getWallet(userA);
    const wB = await getWallet(userB);
    expect(wA.balance).toBe(1080); // Winner payout: 1000 - 100 + 180
    expect(wB.balance).toBe(900); // Loser

    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(match.status).toBe("FINISHED");
    expect(match.winnerIds).toEqual([userA]);
  });

  // ---------------------------------------------------------------------------
  // 14. Duplicate Finish
  // ---------------------------------------------------------------------------
  it("14. Duplicate finish: calling settleMatch multiple times never pays prizes twice", async () => {
    const userA = await createTestUser("u-dupfin-a", 1000);
    const userB = await createTestUser("u-dupfin-b", 1000);
    const matchId = `match-dupfin-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // Finish 1
    await GameEntryLifecycleService.finishAndSettleMatch(matchId, [userA], { resultType: "WIN" });
    // Finish 2 (duplicate trigger)
    await GameEntryLifecycleService.finishAndSettleMatch(matchId, [userA], { resultType: "WIN" });

    const wA = await getWallet(userA);
    expect(wA.balance).toBe(1080); // exactly 1 payout credited

    const prizes = await prisma.transaction.findMany({
      where: { userId: userA, referenceId: matchId, referenceType: "MATCH_PAYOUT" },
    });
    expect(prizes).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // 15. Tournament Match
  // ---------------------------------------------------------------------------
  it("15. Tournament match: progresses through lifecycle with 0 duplicate entry fee deduction", async () => {
    const userA = await createTestUser("u-tourn-a", 1000);
    const userB = await createTestUser("u-tourn-b", 1000);
    const matchId = `match-tourn-bracket-${Date.now()}`;

    // Tournament bracket match with isTournament: true
    const entryA = await GameEntryLifecycleService.initiateEntry({
      userId: userA,
      gameId: "table-tennis",
      stake: 100, // bracket match stake definition
      matchId,
      isTournament: true, // exempt from second entry fee
    });
    expect(entryA.fee).toBe(0);
    expect(entryA.status).toBe("FEE_PAID");

    const entryB = await GameEntryLifecycleService.initiateEntry({
      userId: userB,
      gameId: "table-tennis",
      stake: 100,
      matchId,
      isTournament: true,
    });
    expect(entryB.fee).toBe(0);

    // Wallets are untouched (0 coins deducted)
    expect((await getWallet(userA)).balance).toBe(1000);
    expect((await getWallet(userB)).balance).toBe(1000);

    // Match starts and finishes smoothly
    await GameEntryLifecycleService.startMatch(matchId);
    await GameEntryLifecycleService.finishAndSettleMatch(matchId, [userA], { resultType: "WIN" });

    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(match.status).toBe("FINISHED");
    expect(match.winnerIds).toEqual([userA]);
  });
});
