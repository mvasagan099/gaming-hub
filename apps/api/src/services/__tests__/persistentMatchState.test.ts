import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { PersistentMatchStateService } from "../persistentMatchStateService";
import { GameEntryLifecycleService } from "../gameEntryLifecycleService";

describe("Feature 12: Persistent Match State Recovery", () => {
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
  // 1. Initial State Save & Optimistic Concurrency
  // ---------------------------------------------------------------------------
  it("1. State snapshot save: initializes stateVersion and advances atomically", async () => {
    const userA = await createTestUser("u-pms-1-a", 1000);
    const userB = await createTestUser("u-pms-1-b", 1000);
    const matchId = `match-pms-1-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "chess", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "chess", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // Initial state save with expectedVersion = 0
    const s1 = await PersistentMatchStateService.saveStateSnapshot({
      matchId,
      state: { fen: "start_fen", turn: 0 },
      expectedVersion: 0,
      turnNumber: 1,
    });
    expect(s1.ok).toBe(true);
    expect(s1.stateVersion).toBe(1);

    // Subsequent state advance with expectedVersion = 1 -> version 2
    const s2 = await PersistentMatchStateService.saveStateSnapshot({
      matchId,
      state: { fen: "after_e4", turn: 1 },
      expectedVersion: 1,
      turnNumber: 2,
    });
    expect(s2.ok).toBe(true);
    expect(s2.stateVersion).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // 2. Optimistic Concurrency Conflict Rejection
  // ---------------------------------------------------------------------------
  it("2. Concurrency conflict: saving state with stale expectedVersion is rejected with 409", async () => {
    const userA = await createTestUser("u-pms-2-a", 1000);
    const userB = await createTestUser("u-pms-2-b", 1000);
    const matchId = `match-pms-2-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "ludo", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    await PersistentMatchStateService.saveStateSnapshot({
      matchId,
      state: { positions: { "0": 0, "1": 0 } },
      expectedVersion: 0,
      turnNumber: 1,
    });

    await PersistentMatchStateService.saveStateSnapshot({
      matchId,
      state: { positions: { "0": 6, "1": 0 } },
      expectedVersion: 1,
      turnNumber: 2,
    });

    // Worker with stale version 1 tries to write over version 2
    await expect(
      PersistentMatchStateService.saveStateSnapshot({
        matchId,
        state: { positions: { "0": 4, "1": 0 } },
        expectedVersion: 1, // Stale! Current is 2
        turnNumber: 2,
      })
    ).rejects.toThrow(/CONCURRENT_OPERATION|Optimistic concurrency conflict/i);
  });

  // ---------------------------------------------------------------------------
  // 3. Load Authoritative State Rehydration
  // ---------------------------------------------------------------------------
  it("3. Load state: recovers full match metadata, player seats, timers, and moves", async () => {
    const userA = await createTestUser("u-pms-3-a", 1000);
    const userB = await createTestUser("u-pms-3-b", 1000);
    const matchId = `match-pms-3-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "carrom", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "carrom", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    await prisma.move.create({
      data: {
        matchId,
        userId: userA,
        seat: 0,
        turnNumber: 1,
        action: { type: "strike", force: 75 },
      },
    });

    await PersistentMatchStateService.saveStateSnapshot({
      matchId,
      state: { coins: { white: 9, black: 9, queen: 1 } },
      expectedVersion: 0,
      turnNumber: 1,
    });

    const res = await PersistentMatchStateService.loadAuthoritativeState(matchId);
    expect(res.ok).toBe(true);
    expect(res.matchId).toBe(matchId);
    expect(res.status).toBe("ACTIVE");
    expect(res.totalMoves).toBe(1);
    expect(res.players).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // 4. Multi-Instance Distributed Recovery Lock
  // ---------------------------------------------------------------------------
  it("4. Distributed recovery lock: allows 1 instance to hold lock and blocks concurrent workers", () => {
    const matchId = `match-lock-${Date.now()}`;
    const instanceA = "worker-node-1";
    const instanceB = "worker-node-2";

    const lockA1 = PersistentMatchStateService.acquireRecoveryLock(matchId, instanceA, 5000);
    expect(lockA1).toBe(true);

    // Instance B tries to acquire lock on same match -> rejected
    const lockB = PersistentMatchStateService.acquireRecoveryLock(matchId, instanceB, 5000);
    expect(lockB).toBe(false);

    // Instance A releases lock
    PersistentMatchStateService.releaseRecoveryLock(matchId, instanceA);

    // Instance B can now acquire lock
    const lockB2 = PersistentMatchStateService.acquireRecoveryLock(matchId, instanceB, 5000);
    expect(lockB2).toBe(true);

    PersistentMatchStateService.releaseRecoveryLock(matchId, instanceB);
  });

  // ---------------------------------------------------------------------------
  // 5. Startup Recovery Worker
  // ---------------------------------------------------------------------------
  it("5. Startup recovery worker: evaluates active matches and cleans up stalled lobbies", async () => {
    const userA = await createTestUser("u-pms-5-a", 1000);
    const matchId = `match-pms-5-${Date.now()}`;

    // Create stalled match lobby
    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "table-tennis", stake: 100, matchId });

    // Backdate createdAt to simulate lobby past 60s deadline
    await prisma.match.update({
      where: { id: matchId },
      data: { createdAt: new Date(Date.now() - 120000) },
    });

    const result = await PersistentMatchStateService.startupRecoveryWorker({ batchSize: 10 });
    expect(result.scannedCount).toBeGreaterThan(0);
    expect(result.refunded).toContain(matchId);

    // userA is refunded
    expect((await getWallet(userA)).balance).toBe(1000);
  });

  // ---------------------------------------------------------------------------
  // 6. Admin Recovery Overview
  // ---------------------------------------------------------------------------
  it("6. Admin recovery overview: aggregates system-wide health and match statuses", async () => {
    const overview = await PersistentMatchStateService.getAdminRecoveryOverview();
    expect(overview.health).toBe("OK");
    expect(typeof overview.activeMatches).toBe("number");
    expect(typeof overview.createdMatches).toBe("number");
  });
});
