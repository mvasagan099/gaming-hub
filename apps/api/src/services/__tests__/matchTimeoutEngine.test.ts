import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { MatchTimeoutService } from "../matchTimeoutService";
import { GameEntryLifecycleService } from "../gameEntryLifecycleService";
import { MatchRecoveryService } from "../matchRecoveryService";

describe("Feature 10: Server-Authoritative Match Timeout Engine", () => {
  const createdUserIds: string[] = [];

  async function createTestUser(prefix: string, balance = 1000) {
    const id = `u_to_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const rand = Math.random().toString(36).slice(2, 10);
    createdUserIds.push(id);

    await prisma.user.create({
      data: {
        id,
        email: `${prefix}_${Date.now().toString(36)}_${rand}@gaminghub.test`,
        username: `usr_${Date.now().toString(36)}_${rand}`,
        displayName: `User ${id.slice(0, 8)}`,
        role: "USER",
        profile: { create: {} },
        wallet: { create: { balance } },
      },
    });

    return id;
  }

  async function getWallet(userId: string) {
    return prisma.wallet.findUniqueOrThrow({ where: { userId } });
  }

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      const userIds = [...createdUserIds];
      createdUserIds.length = 0;
      try {
        await prisma.transaction.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.matchPlayer.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.wallet.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.profile.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      } catch {
        // Safe fallback
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Normal Turn Check (Before Deadline)
  // ---------------------------------------------------------------------------
  it("1. Normal turn: checkTurnTimeout returns expired: false and remaining seconds when before deadline", async () => {
    const userA = await createTestUser("u-to-1-a", 1000);
    const userB = await createTestUser("u-to-1-b", 1000);
    const matchId = `match-to-1-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "chess", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "chess", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    const check = await MatchTimeoutService.checkTurnTimeout({
      matchId,
      currentTurnSeat: 0,
      turnStartedAt: new Date(), // Started just now
      maxTurnSeconds: 30,
    });

    expect(check.expired).toBe(false);
    expect(check.remainingSeconds).toBeGreaterThan(0);
    expect(check.remainingSeconds).toBeLessThanOrEqual(30);

    const match = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(match.status).toBe("ACTIVE");
  });

  // ---------------------------------------------------------------------------
  // 2. Turn Expiration (Authoritative Forfeit Settlement)
  // ---------------------------------------------------------------------------
  it("2. Turn expiration: server detects deadline expired, forfeits player, and settles match", async () => {
    const userA = await createTestUser("u-to-2-a", 1000);
    const userB = await createTestUser("u-to-2-b", 1000);
    const matchId = `match-to-2-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // Turn started 45 seconds ago with 30s limit
    const turnStartedAt = new Date(Date.now() - 45000);

    const result = await MatchTimeoutService.checkTurnTimeout({
      matchId,
      currentTurnSeat: 0, // userA is seat 0
      turnStartedAt,
      maxTurnSeconds: 30,
    });

    expect(result.expired).toBe(true);
    expect(result.status).toBe("SETTLED");
    expect(result.winners).toEqual([userB]);

    // userB receives 180 coins -> balance = 1080
    expect((await getWallet(userB)).balance).toBe(1080);
    expect((await getWallet(userA)).balance).toBe(900);
  });

  // ---------------------------------------------------------------------------
  // 3. Duplicate and Concurrent Timeout Workers
  // ---------------------------------------------------------------------------
  it("3. Concurrency: multiple simultaneous timeout checks settle match and credit winner exactly once", async () => {
    const userA = await createTestUser("u-to-3-a", 1000);
    const userB = await createTestUser("u-to-3-b", 1000);
    const matchId = `match-to-3-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "carrom", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "carrom", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    const turnStartedAt = new Date(Date.now() - 50000);

    // 5 concurrent workers detect timeout at the same time
    const results = await Promise.all([
      MatchTimeoutService.checkTurnTimeout({ matchId, currentTurnSeat: 0, turnStartedAt, maxTurnSeconds: 30 }),
      MatchTimeoutService.checkTurnTimeout({ matchId, currentTurnSeat: 0, turnStartedAt, maxTurnSeconds: 30 }),
      MatchTimeoutService.checkTurnTimeout({ matchId, currentTurnSeat: 0, turnStartedAt, maxTurnSeconds: 30 }),
      MatchTimeoutService.checkTurnTimeout({ matchId, currentTurnSeat: 0, turnStartedAt, maxTurnSeconds: 30 }),
      MatchTimeoutService.checkTurnTimeout({ matchId, currentTurnSeat: 0, turnStartedAt, maxTurnSeconds: 30 }),
    ]);

    for (const r of results) {
      if (r.expired) {
        expect(r.winners).toEqual([userB]);
      }
    }

    // Winner gets exactly 1 payout: 900 + 180 = 1080
    expect((await getWallet(userB)).balance).toBe(1080);
  });

  // ---------------------------------------------------------------------------
  // 4. Disconnect Grace Period and Timeout
  // ---------------------------------------------------------------------------
  it("4. Disconnect grace: within window is protected; after window expires match is forfeited", async () => {
    const userA = await createTestUser("u-to-4-a", 1000);
    const userB = await createTestUser("u-to-4-b", 1000);
    const matchId = `match-to-4-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "cricket", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "cricket", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // userA disconnected 10 seconds ago (within 30s grace window)
    const withinGrace = await MatchTimeoutService.handleDisconnectGraceTimeout({
      matchId,
      disconnectedUserId: userA,
      disconnectedAt: new Date(Date.now() - 10000),
      graceWindowSeconds: 30,
    });
    expect(withinGrace.expired).toBe(false);
    expect(withinGrace.status).toBe("GRACE_ACTIVE");

    // userA disconnected 40 seconds ago (past 30s grace window)
    const expiredGrace = await MatchTimeoutService.handleDisconnectGraceTimeout({
      matchId,
      disconnectedUserId: userA,
      disconnectedAt: new Date(Date.now() - 40000),
      graceWindowSeconds: 30,
    });
    expect(expiredGrace.expired).toBe(true);
    expect("status" in expiredGrace && expiredGrace.status).toBe("SETTLED");
    expect("winners" in expiredGrace && expiredGrace.winners).toEqual([userB]);

    expect((await getWallet(userB)).balance).toBe(1080);
  });

  // ---------------------------------------------------------------------------
  // 5. Match Join / Lobby Timeout (100% Refund)
  // ---------------------------------------------------------------------------
  it("5. Match join timeout: unfilled match lobby is cancelled and 100% refunded", async () => {
    const userA = await createTestUser("u-to-5-a", 1000);
    const matchId = `match-to-5-${Date.now()}`;

    // userA joined paid match, waiting for opponent
    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "table-tennis", stake: 100, matchId });

    // Manually backdate createdAt to simulate lobby waiting past deadline
    await prisma.match.update({
      where: { id: matchId },
      data: { createdAt: new Date(Date.now() - 120000) },
    });

    const res = await MatchTimeoutService.checkJoinTimeout({
      matchId,
      createdDeadlineSeconds: 60,
    });

    expect(res.expired).toBe(true);
    expect(res.status).toBe("ABORTED");
    expect(res.refunded).toBe(true);

    // userA refunded 100% -> balance restored to 1000
    expect((await getWallet(userA)).balance).toBe(1000);
  });

  // ---------------------------------------------------------------------------
  // 6. Admin Timeout Status Diagnostics
  // ---------------------------------------------------------------------------
  it("6. Admin timeout status: returns comprehensive diagnostics on active timers and turn owner", async () => {
    const userA = await createTestUser("u-to-6-a", 1000);
    const userB = await createTestUser("u-to-6-b", 1000);
    const matchId = `match-to-6-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "fruit-ninja", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "fruit-ninja", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    const status = await MatchTimeoutService.getAdminTimeoutStatus(matchId);
    expect(status.matchId).toBe(matchId);
    expect(status.gameId).toBe("fruit-ninja");
    expect(status.status).toBe("ACTIVE");
    expect(status.turnTimerSeconds).toBe(30);
    expect(status.players).toHaveLength(2);
  });
});
