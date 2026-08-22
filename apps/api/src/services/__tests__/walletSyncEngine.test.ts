import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { WalletSyncService, type WalletSyncPayload } from "../walletSyncService";
import { WalletTransactionService } from "../walletTransactionService";
import { GameEntryLifecycleService } from "../gameEntryLifecycleService";
import { SettlementService } from "../settlementService";
import { RefundService } from "../refundService";

describe("Feature 16: Authoritative Live Wallet Balance Sync", () => {
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

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Initial Wallet Load & Sync State
  // ---------------------------------------------------------------------------
  it("1. Initial wallet load: retrieves authoritative balance directly from database", async () => {
    const userA = await createTestUser("u-ws-1-a", 2500);

    const state = await WalletSyncService.getAuthoritativeSyncState(userA);
    expect(state.userId).toBe(userA);
    expect(state.balance).toBe(2500);
  });

  // ---------------------------------------------------------------------------
  // 2. Entry Fee Debit Sync Event
  // ---------------------------------------------------------------------------
  it("2. Entry fee debit: automatically emits wallet update event with new balance", async () => {
    const userA = await createTestUser("u-ws-2-a", 1000);
    const events: WalletSyncPayload[] = [];

    const unsubscribe = WalletSyncService.registerSyncListener((payload) => {
      if (payload.userId === userA) events.push(payload);
    });

    await WalletTransactionService.createDebit(prisma, {
      userId: userA,
      amount: 100,
      referenceType: "MATCH_WAGER",
      referenceId: "match-101",
    });

    unsubscribe();

    expect(events).toHaveLength(1);
    expect(events[0].balance).toBe(900);
    expect(events[0].type).toBe("DEBIT");
    expect(events[0].amount).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // 3. Winning Settlement Credit Sync Event
  // ---------------------------------------------------------------------------
  it("3. Game winning settlement: automatically emits wallet update event with credited balance", async () => {
    const userA = await createTestUser("u-ws-3-a", 1000);
    const userB = await createTestUser("u-ws-3-b", 1000);
    const matchId = `match-ws-3-${Date.now()}`;

    const events: WalletSyncPayload[] = [];
    const unsubscribe = WalletSyncService.registerSyncListener((payload) => {
      if (payload.userId === userA) events.push(payload);
    });

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "chess", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "chess", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);

    // Settle match
    await SettlementService.settleMatch({ matchId, winnerIds: [userA] });

    unsubscribe();

    // Event 1: Entry fee debit (balance -> 900)
    // Event 2: Winning payout credit (balance -> 1080)
    expect(events.length).toBeGreaterThanOrEqual(2);
    const lastEvent = events[events.length - 1];
    expect(lastEvent.balance).toBe(1080);
    expect(lastEvent.type).toBe("CREDIT");
  });

  // ---------------------------------------------------------------------------
  // 4. Refund Engine Credit Sync Event
  // ---------------------------------------------------------------------------
  it("4. Refund engine: automatically emits wallet update event when wager is returned", async () => {
    const userA = await createTestUser("u-ws-4-a", 1000);
    const matchId = `match-ws-4-${Date.now()}`;

    const events: WalletSyncPayload[] = [];
    const unsubscribe = WalletSyncService.registerSyncListener((payload) => {
      if (payload.userId === userA) events.push(payload);
    });

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "carrom", stake: 100, matchId });
    await RefundService.refundCancelledMatch({ matchId, reason: "match_aborted" });

    unsubscribe();

    expect(events.length).toBeGreaterThanOrEqual(2);
    const lastEvent = events[events.length - 1];
    expect(lastEvent.balance).toBe(1000); // 100% restored
  });

  // ---------------------------------------------------------------------------
  // 5. Stale Balance Spending Protection
  // ---------------------------------------------------------------------------
  it("5. Stale balance guard: server authoritatively rejects entry if real balance is insufficient", async () => {
    const userA = await createTestUser("u-ws-5-a", 50);
    const matchId = `match-ws-5-${Date.now()}`;

    // Attempt to enter 100-stake match with only 50 coins
    await expect(
      GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "chess", stake: 100, matchId })
    ).rejects.toThrow(/Insufficient coins|INSUFFICIENT_BALANCE/i);

    // Balance remains intact
    const state = await WalletSyncService.getAuthoritativeSyncState(userA);
    expect(state.balance).toBe(50);
  });

  // ---------------------------------------------------------------------------
  // 6. Admin Adjustment Sync Event
  // ---------------------------------------------------------------------------
  it("6. Admin adjustment: credit and debit operations emit real-time sync updates", async () => {
    const userA = await createTestUser("u-ws-6-a", 1000);
    const events: WalletSyncPayload[] = [];

    const unsubscribe = WalletSyncService.registerSyncListener((payload) => {
      if (payload.userId === userA) events.push(payload);
    });

    await WalletTransactionService.createAdminAdjustment(prisma, {
      userId: userA,
      amount: 500,
      reason: "Loyalty reward",
      adminId: "admin-1",
    });

    unsubscribe();

    expect(events).toHaveLength(1);
    expect(events[0].balance).toBe(1500);
  });
});
