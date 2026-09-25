import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { MatchRecoveryService } from "../matchRecoveryService";
import { GameEntryLifecycleService } from "../gameEntryLifecycleService";
import { SettlementService } from "../settlementService";

describe("Feature 9: Multiplayer Reconnect & Match Recovery", () => {
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
  // 1. Active Match Lookup
  // ---------------------------------------------------------------------------
  it("1. Active match lookup: user with in-progress match retrieves authoritative recovery payload", async () => {
    const userA = await createTestUser("u-rec-1-a", 1000);
    const userB = await createTestUser("u-rec-1-b", 1000);
    const matchId = `match-rec-lookup-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "chess", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "chess", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // Save initial game state snapshot
    await prisma.gameState.create({
      data: {
        matchId,
        turnNumber: 3,
        state: { fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", turn: 1 },
      },
    });

    const activeMatch = await MatchRecoveryService.getActiveMatchForUser(userA);
    expect(activeMatch).not.toBeNull();
    expect(activeMatch?.matchId).toBe(matchId);
    expect(activeMatch?.gameId).toBe("chess");
    expect(activeMatch?.status).toBe("ACTIVE");
    expect(activeMatch?.seat).toBe(0);
    expect(activeMatch?.turnNumber).toBe(3);
    expect(activeMatch?.currentTurnSeat).toBe(1);
    expect(activeMatch?.players).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // 2. Reconnect During Active Match
  // ---------------------------------------------------------------------------
  it("2. Reconnect active match: restores authoritative state snapshot without duplicate charges", async () => {
    const userA = await createTestUser("u-rec-act-a", 1000);
    const userB = await createTestUser("u-rec-act-b", 1000);
    const matchId = `match-rec-act-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "table-tennis", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "table-tennis", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // Reconnect userA
    const res = await MatchRecoveryService.reconnectMatch({ matchId, userId: userA });
    expect(res.ok).toBe(true);
    expect(res.status).toBe("ACTIVE");
    expect(res.seat).toBe(0);

    // Balance remains exactly 900 (never re-charged)
    expect((await getWallet(userA)).balance).toBe(900);
  });

  // ---------------------------------------------------------------------------
  // 3. Reconnect After Match Concluded
  // ---------------------------------------------------------------------------
  it("3. Reconnect finished match: returns final outcome, does not restart match", async () => {
    const userA = await createTestUser("u-rec-fin-a", 1000);
    const userB = await createTestUser("u-rec-fin-b", 1000);
    const matchId = `match-rec-fin-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // Match finishes while userB was away
    await SettlementService.settleMatch({ matchId, winnerIds: [userA] });

    // userB reconnects
    const res = await MatchRecoveryService.reconnectMatch({ matchId, userId: userB });
    expect(res.ok).toBe(true);
    expect(res.status).toBe("FINISHED");
    expect(res.outcome).toBe("LOSS");

    // Match remains FINISHED, balances are correct (userA = 1080, userB = 900)
    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(match.status).toBe("FINISHED");
    expect((await getWallet(userA)).balance).toBe(1080);
    expect((await getWallet(userB)).balance).toBe(900);
  });

  // ---------------------------------------------------------------------------
  // 4. Disconnect Grace Period
  // ---------------------------------------------------------------------------
  it("4. Disconnect grace period: arms 30s window without immediate forfeit", async () => {
    const userA = await createTestUser("u-grace-a", 1000);
    const userB = await createTestUser("u-grace-b", 1000);
    const matchId = `match-grace-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    const dcRes = await MatchRecoveryService.handleDisconnect({ matchId, userId: userA });
    expect(dcRes.ok).toBe(true);
    expect(dcRes.status).toBe("DISCONNECTED");
    expect(dcRes.gracePeriodSeconds).toBe(30);

    // Match is still ACTIVE (not forfeited)
    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(match.status).toBe("ACTIVE");
  });

  // ---------------------------------------------------------------------------
  // 5. Abandonment Timeout Forfeit
  // ---------------------------------------------------------------------------
  it("5. Abandonment timeout: forfeits match and credits remaining player", async () => {
    const userA = await createTestUser("u-ab-a", 1000);
    const userB = await createTestUser("u-ab-b", 1000);
    const matchId = `match-abandon-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "carrom", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "carrom", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // Grace timeout expires -> userA abandoned
    const abRes = await MatchRecoveryService.handleAbandonment({ matchId, userId: userA });
    expect("status" in abRes && abRes.status).toBe("SETTLED");
    expect("winners" in abRes && abRes.winners).toEqual([userB]);

    // userB receives 180 coins -> balance = 1080
    expect((await getWallet(userB)).balance).toBe(1080);
    expect((await getWallet(userA)).balance).toBe(900);
  });

  // ---------------------------------------------------------------------------
  // 6. Post-Server Restart Database Recovery
  // ---------------------------------------------------------------------------
  it("6. Server restart recovery: recovers match state and moves from database persistence", async () => {
    const userA = await createTestUser("u-rst-a", 1000);
    const userB = await createTestUser("u-rst-b", 1000);
    const matchId = `match-restart-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "fruit-ninja", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "fruit-ninja", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    await prisma.move.create({
      data: {
        matchId,
        userId: userA,
        seat: 0,
        turnNumber: 1,
        action: { type: "slice", target: "watermelon", score: 10 },
      },
    });

    await prisma.gameState.create({
      data: {
        matchId,
        turnNumber: 1,
        state: { scores: { "0": 10, "1": 0 } },
      },
    });

    // Simulate server reboot recovery
    const recovered = await MatchRecoveryService.recoverMatchFromDatabase(matchId);
    expect(recovered.matchId).toBe(matchId);
    expect(recovered.status).toBe("ACTIVE");
    expect(recovered.totalMoves).toBe(1);
    expect(recovered.turnNumber).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 7. Tournament Match Reconnect
  // ---------------------------------------------------------------------------
  it("7. Tournament match reconnect: preserves tournament bracket match with 0 duplicate fee", async () => {
    const userA = await createTestUser("u-trec-a", 1000);
    const userB = await createTestUser("u-trec-b", 1000);
    const matchId = `match-tourn-rec-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({
      userId: userA,
      gameId: "bubble-shooter",
      stake: 0,
      matchId,
      isTournament: true,
    });
    await GameEntryLifecycleService.initiateEntry({
      userId: userB,
      gameId: "bubble-shooter",
      stake: 0,
      matchId,
      isTournament: true,
    });
    await GameEntryLifecycleService.startMatch(matchId);

    const active = await MatchRecoveryService.getActiveMatchForUser(userA);
    expect(active?.matchId).toBe(matchId);
    expect(active?.stake).toBe(0);

    // Balance remains 1000
    expect((await getWallet(userA)).balance).toBe(1000);
  });
});
