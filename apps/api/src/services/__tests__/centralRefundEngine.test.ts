import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { RefundService } from "../refundService";
import { GameEntryLifecycleService } from "../gameEntryLifecycleService";
import { registerForTournament } from "../tournaments";

describe("Feature 6: Central Automatic Refund Engine", () => {
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
  // 1. Successful Paid Match Refund
  // ---------------------------------------------------------------------------
  it("1. Successful refund: match entry is refunded 100% and balance restored", async () => {
    const user = await createTestUser("u-ref-1", 1000);
    const matchId = `match-ref-1-${Date.now()}`;

    // Join & pay 100 coins
    await GameEntryLifecycleService.initiateEntry({
      userId: user,
      gameId: "chess",
      stake: 100,
      matchId,
    });
    expect((await getWallet(user)).balance).toBe(900);

    // Refund entry
    const res = await RefundService.refundGameEntry({
      matchId,
      userId: user,
      reason: "opponent_disconnected",
    });

    expect(res.ok).toBe(true);
    expect(res.status).toBe("REFUNDED");
    expect(res.refundAmount).toBe(100);

    // Balance restored to 1000
    expect((await getWallet(user)).balance).toBe(1000);

    // Ledger contains WAGER_REFUND
    const refundTx = await prisma.transaction.findFirst({
      where: { userId: user, referenceId: matchId, referenceType: "WAGER_REFUND" },
    });
    expect(refundTx).toBeDefined();
    expect(refundTx?.amount).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // 2. Duplicate Refund Attempt
  // ---------------------------------------------------------------------------
  it("2. Duplicate refund: calling refund repeatedly credits zero additional coins", async () => {
    const user = await createTestUser("u-dup-ref", 1000);
    const matchId = `match-dupref-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({
      userId: user,
      gameId: "table-tennis",
      stake: 100,
      matchId,
    });

    // Call 1
    const res1 = await RefundService.refundGameEntry({ matchId, userId: user });
    expect(res1.ok).toBe(true);
    expect(res1.refundAmount).toBe(100);

    // Call 2 (idempotent repeat)
    const res2 = await RefundService.refundGameEntry({ matchId, userId: user });
    expect(res2.ok).toBe(true);
    expect(res2.refundAmount).toBe(100);

    // Call 3
    const res3 = await RefundService.refundGameEntry({ matchId, userId: user });
    expect(res3.ok).toBe(true);

    // Balance remains exactly 1000 (never 1100 or 1200)
    expect((await getWallet(user)).balance).toBe(1000);

    // Only 1 refund transaction exists
    const txCount = await prisma.transaction.count({
      where: { userId: user, referenceId: matchId, referenceType: "WAGER_REFUND" },
    });
    expect(txCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 3. Concurrent Refund Protection
  // ---------------------------------------------------------------------------
  it("3. Concurrent refund: simultaneous refund requests credit wallet exactly once", async () => {
    const user = await createTestUser("u-conc-ref", 1000);
    const matchId = `match-concref-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({
      userId: user,
      gameId: "ludo",
      stake: 100,
      matchId,
    });

    // Fire 5 concurrent refund requests
    const results = await Promise.allSettled([
      RefundService.refundGameEntry({ matchId, userId: user }),
      RefundService.refundGameEntry({ matchId, userId: user }),
      RefundService.refundGameEntry({ matchId, userId: user }),
      RefundService.refundGameEntry({ matchId, userId: user }),
      RefundService.refundGameEntry({ matchId, userId: user }),
    ]);

    for (const r of results) {
      expect(r.status).toBe("fulfilled");
    }

    // Balance is 1000
    expect((await getWallet(user)).balance).toBe(1000);

    const txCount = await prisma.transaction.count({
      where: { userId: user, referenceId: matchId, referenceType: "WAGER_REFUND" },
    });
    expect(txCount).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 4. Unpaid Entry Refund Attempt
  // ---------------------------------------------------------------------------
  it("4. Unpaid entry refund attempt: returns NO_FEE and credits zero coins for 0-stake entry", async () => {
    const user = await createTestUser("u-unpaid-ref", 1000);
    const matchId = `match-unpaid-${Date.now()}`;

    // Practice entry with 0 stake
    await GameEntryLifecycleService.initiateEntry({
      userId: user,
      gameId: "chess",
      stake: 0,
      matchId,
    });

    const res = await RefundService.refundGameEntry({ matchId, userId: user });
    expect(res.status).toBe("NO_FEE");
    expect(res.refundAmount).toBe(0);

    expect((await getWallet(user)).balance).toBe(1000);
  });

  // ---------------------------------------------------------------------------
  // 5. Wrong-User Refund Rejection
  // ---------------------------------------------------------------------------
  it("5. Wrong user refund: user cannot refund someone else's match entry", async () => {
    const userA = await createTestUser("u-user-a", 1000);
    const userB = await createTestUser("u-user-b", 1000);
    const matchId = `match-wronguser-${Date.now()}`;

    // User A joins match
    await GameEntryLifecycleService.initiateEntry({
      userId: userA,
      gameId: "ludo",
      stake: 100,
      matchId,
    });

    // User B attempts to refund matchId for userB
    await expect(
      RefundService.refundGameEntry({ matchId, userId: userB })
    ).rejects.toThrow(/FORBIDDEN|not a participant/i);

    expect((await getWallet(userB)).balance).toBe(1000);
  });

  // ---------------------------------------------------------------------------
  // 6. Cancelled Tournament Full Refund
  // ---------------------------------------------------------------------------
  it("6. Cancelled tournament: refundCancelledTournament refunds all registered players idempotently", async () => {
    const userA = await createTestUser("u-tourn-ref-a", 1000);
    const userB = await createTestUser("u-tourn-ref-b", 1000);
    const tournamentId = `tourn-cancel-test-${Date.now()}`;

    await prisma.tournament.create({
      data: {
        id: tournamentId,
        gameId: "table-tennis",
        title: "Refundable Tournament",
        description: "Test cancellation refund",
        entryFee: 150,
        prizePool: 300,
        minPlayers: 2,
        maxPlayers: 4,
        startTime: new Date(Date.now() + 3600_000),
        status: "REGISTRATION_OPEN",
      },
    });

    // Register both users (debit 150 each)
    await registerForTournament(userA, tournamentId);
    await registerForTournament(userB, tournamentId);

    expect((await getWallet(userA)).balance).toBe(850);
    expect((await getWallet(userB)).balance).toBe(850);

    // Cancel tournament
    const cancelRes = await RefundService.refundCancelledTournament({
      tournamentId,
      reason: "admin_cancelled_event",
    });

    expect(cancelRes.ok).toBe(true);
    expect(cancelRes.status).toBe("CANCELLED");

    // Both users refunded 150 -> balance back to 1000
    expect((await getWallet(userA)).balance).toBe(1000);
    expect((await getWallet(userB)).balance).toBe(1000);

    // Second cancellation call is idempotent
    await RefundService.refundCancelledTournament({ tournamentId });
    expect((await getWallet(userA)).balance).toBe(1000);
    expect((await getWallet(userB)).balance).toBe(1000);
  });

  // ---------------------------------------------------------------------------
  // 7. Failed Match Initialization / Abort
  // ---------------------------------------------------------------------------
  it("7. Failed match initialization: refundCancelledMatch refunds 100% of player wagers", async () => {
    const userA = await createTestUser("u-fail-a", 1000);
    const userB = await createTestUser("u-fail-b", 1000);
    const matchId = `match-failinit-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "carrom", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "carrom", stake: 100, matchId });

    expect((await getWallet(userA)).balance).toBe(900);
    expect((await getWallet(userB)).balance).toBe(900);

    const abortRes = await RefundService.refundCancelledMatch({
      matchId,
      reason: "room_host_disconnected",
    });

    expect(abortRes.ok).toBe(true);
    expect((await getWallet(userA)).balance).toBe(1000);
    expect((await getWallet(userB)).balance).toBe(1000);
  });

  // ---------------------------------------------------------------------------
  // 8. Admin-Authorized Manual Refund
  // ---------------------------------------------------------------------------
  it("8. Admin refund: processAdminRefund requires admin auth, reasons, and produces audit logs", async () => {
    const user = await createTestUser("u-admin-ref", 1000);
    const matchId = `match-adminref-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: user, gameId: "snake-vs-worms", stake: 100, matchId });
    expect((await getWallet(user)).balance).toBe(900);

    const adminRefund = await RefundService.processAdminRefund({
      referenceType: "MATCH",
      referenceId: matchId,
      userId: user,
      reason: "Customer support ticket #1234 resolution",
      adminId: "admin-super-id",
    });

    expect(adminRefund.ok).toBe(true);
    expect(adminRefund.status).toBe("REFUNDED");
    expect(adminRefund.refundAmount).toBe(100);
    expect((await getWallet(user)).balance).toBe(1000);

    // Verify audit log
    const auditLog = await prisma.auditLog.findFirst({
      where: { targetId: matchId, action: "admin.refund.match" },
    });
    expect(auditLog).toBeDefined();
    expect(auditLog?.actorId).toBe("admin-super-id");
  });

  // ---------------------------------------------------------------------------
  // 9. Refund After Settlement (Protected)
  // ---------------------------------------------------------------------------
  it("9. Refund after settlement: finished match with winners cannot be refunded", async () => {
    const userA = await createTestUser("u-settle-a", 1000);
    const userB = await createTestUser("u-settle-b", 1000);
    const matchId = `match-settled-ref-${Date.now()}`;

    await GameEntryLifecycleService.initiateEntry({ userId: userA, gameId: "fruit-ninja", stake: 100, matchId });
    await GameEntryLifecycleService.initiateEntry({ userId: userB, gameId: "fruit-ninja", stake: 100, matchId });
    await GameEntryLifecycleService.startMatch(matchId);
    await GameEntryLifecycleService.finishAndSettleMatch(matchId, [userA], { resultType: "WIN" });

    // Attempt refund on finished match
    await expect(
      RefundService.refundGameEntry({ matchId, userId: userB })
    ).rejects.toThrow(/INVALID_ACTION|already finished/i);
  });

  // ---------------------------------------------------------------------------
  // 10. Financial Reconciliation Chain
  // ---------------------------------------------------------------------------
  it("10. Financial reconciliation: balanceBefore - debit + credit = balanceAfter holds strictly", async () => {
    const user = await createTestUser("u-recon-ref", 500);
    const matchId = `match-recon-${Date.now()}`;

    // Debit
    await GameEntryLifecycleService.initiateEntry({ userId: user, gameId: "bubble-shooter", stake: 100, matchId });
    const wDebit = await getWallet(user);
    expect(wDebit.balance).toBe(400);

    // Refund Credit
    await RefundService.refundGameEntry({ matchId, userId: user, reason: "reconciliation_test" });
    const wCredit = await getWallet(user);
    expect(wCredit.balance).toBe(500);

    // Inspect transactions
    const txs = await prisma.transaction.findMany({
      where: { userId: user, referenceId: matchId },
      orderBy: { createdAt: "asc" },
    });
    expect(txs).toHaveLength(2);

    const [debitTx, creditTx] = txs;
    expect(debitTx.type).toBe("DEBIT");
    expect(debitTx.amount).toBe(100);
    expect((debitTx.meta as any)?.balanceBefore ?? debitTx.balanceBefore ?? (debitTx.balanceAfter + debitTx.amount)).toBe(500);
    expect(debitTx.balanceAfter).toBe(400);

    expect(creditTx.type).toBe("CREDIT");
    expect(creditTx.amount).toBe(100);
    expect((creditTx.meta as any)?.balanceBefore ?? creditTx.balanceBefore ?? (creditTx.balanceAfter - creditTx.amount)).toBe(400);
    expect(creditTx.balanceAfter).toBe(500);
  });
});
