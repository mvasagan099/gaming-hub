import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { ReconciliationService } from "../reconciliationService";
import { WalletTransactionService } from "../walletTransactionService";

describe("Feature 24: Automated Wallet & Financial Reconciliation", () => {
  const createdUserIds: string[] = [];
  const createdMatchIds: string[] = [];
  const createdTournamentIds: string[] = [];

  beforeEach(() => {
    ReconciliationService.resetForTesting();
  });

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
    if (createdTournamentIds.length > 0) {
      await prisma.tournament.deleteMany({
        where: { id: { in: createdTournamentIds } },
      }).catch(() => undefined);
      createdTournamentIds.length = 0;
    }

    if (createdMatchIds.length > 0) {
      await prisma.match.deleteMany({
        where: { id: { in: createdMatchIds } },
      }).catch(() => undefined);
      createdMatchIds.length = 0;
    }

    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Healthy Wallet State
  // ---------------------------------------------------------------------------
  it("1. Healthy state: perfectly reconciled wallet produces 0 issues", async () => {
    const user = await createTestUser("u-rec-1", 1000);

    // Debit 100
    await WalletTransactionService.createDebit(prisma, {
      userId: user,
      amount: 100,
      referenceType: "MATCH_WAGER",
      referenceId: "m1",
    });

    await ReconciliationService.runWalletBalanceReconciliation(user);
    const issues = ReconciliationService.listIssues();
    expect(issues.total).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 2. Wallet Balance Mismatch Detection
  // ---------------------------------------------------------------------------
  it("2. Balance mismatch: detects discrepancy between wallet balance and ledger balanceAfter", async () => {
    const user = await createTestUser("u-rec-2", 1000);

    await WalletTransactionService.createDebit(prisma, {
      userId: user,
      amount: 100,
      referenceType: "MATCH_WAGER",
      referenceId: "m2",
    }); // Balance is now 900, balanceAfter = 900

    // Simulate external out-of-band corruption to wallet table
    await prisma.wallet.update({
      where: { userId: user },
      data: { balance: 950 },
    });

    await ReconciliationService.runWalletBalanceReconciliation(user);
    const issues = ReconciliationService.listIssues();

    expect(issues.total).toBeGreaterThanOrEqual(1);
    const mismatch = issues.items.find((i) => i.type === "WALLET_BALANCE_MISMATCH");
    expect(mismatch).toBeDefined();
    expect(mismatch?.severity).toBe("CRITICAL");
    expect(mismatch?.expectedValue).toBe(900);
    expect(mismatch?.actualValue).toBe(950);
  });

  // ---------------------------------------------------------------------------
  // 3. Negative Balance Detection
  // ---------------------------------------------------------------------------
  it("3. Negative balance: detects wallet balance < 0 and raises CRITICAL issue", async () => {
    const user = await createTestUser("u-rec-3", 1000);

    // Force negative balance
    await prisma.wallet.update({
      where: { userId: user },
      data: { balance: -150 },
    });

    await ReconciliationService.runWalletBalanceReconciliation(user);
    const issues = ReconciliationService.listIssues();

    const negIssue = issues.items.find((i) => i.type === "NEGATIVE_WALLET_BALANCE");
    expect(negIssue).toBeDefined();
    expect(negIssue?.severity).toBe("CRITICAL");
    expect(negIssue?.actualValue).toBe(-150);
  });

  // ---------------------------------------------------------------------------
  // 4. Missing Entry Fee Debit
  // ---------------------------------------------------------------------------
  it("4. Missing entry fee: detects player in paid match without MATCH_WAGER debit", async () => {
    const userA = await createTestUser("u-rec-4", 1000);
    const matchId = `match-rec-4-${Date.now()}`;
    createdMatchIds.push(matchId);

    // Paid match created directly without debit transaction
    await prisma.match.create({
      data: {
        id: matchId,
        gameId: "chess",
        stake: 100,
        status: "ACTIVE",
        players: { create: [{ userId: userA, seat: 0, result: "PENDING" }] },
      },
    });

    await ReconciliationService.runEntryReconciliation(matchId);
    const issues = ReconciliationService.listIssues();

    const missingEntry = issues.items.find((i) => i.type === "MISSING_ENTRY_FEE");
    expect(missingEntry).toBeDefined();
    expect(missingEntry?.severity).toBe("HIGH");
    expect(missingEntry?.expectedValue).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // 5. Missing Settlement Payout
  // ---------------------------------------------------------------------------
  it("5. Missing settlement: detects finished match winner without MATCH_PAYOUT credit", async () => {
    const userA = await createTestUser("u-rec-5", 1000);
    const matchId = `match-rec-5-${Date.now()}`;
    createdMatchIds.push(matchId);

    await prisma.match.create({
      data: {
        id: matchId,
        gameId: "chess",
        stake: 100,
        status: "FINISHED",
        endedAt: new Date(),
        players: { create: [{ userId: userA, seat: 0, result: "WIN" }] },
      },
    });

    await ReconciliationService.runSettlementReconciliation(matchId);
    const issues = ReconciliationService.listIssues();

    const missingPayout = issues.items.find((i) => i.type === "MISSING_SETTLEMENT_PAYOUT");
    expect(missingPayout).toBeDefined();
    expect(missingPayout?.severity).toBe("HIGH");
  });

  // ---------------------------------------------------------------------------
  // 6. Excess Refund Detection
  // ---------------------------------------------------------------------------
  it("6. Excess refund: detects refund amount exceeding original wager debit", async () => {
    const user = await createTestUser("u-rec-6", 1000);

    // 1. Debit 100
    await WalletTransactionService.createDebit(prisma, {
      userId: user,
      amount: 100,
      referenceType: "MATCH_WAGER",
      referenceId: "match-excess-ref",
    });

    // 2. Refund 250 (excess)
    await WalletTransactionService.createCredit(prisma, {
      userId: user,
      amount: 250,
      referenceType: "WAGER_REFUND",
      referenceId: "match-excess-ref",
    });

    await ReconciliationService.runRefundReconciliation();
    const issues = ReconciliationService.listIssues();

    const excessIssue = issues.items.find((i) => i.type === "EXCESS_REFUND");
    expect(excessIssue).toBeDefined();
    expect(excessIssue?.severity).toBe("CRITICAL");
    expect(excessIssue?.actualValue).toBe(250);
  });

  // ---------------------------------------------------------------------------
  // 7. Full Reconciliation Summary
  // ---------------------------------------------------------------------------
  it("7. Full summary: generates comprehensive report across wallets, matches, and refunds", async () => {
    const summary = await ReconciliationService.runFullReconciliation();
    expect(summary).toHaveProperty("walletsChecked");
    expect(summary).toHaveProperty("transactionsChecked");
    expect(summary).toHaveProperty("status");
    expect(summary).toHaveProperty("criticalIssues");
  });

  // ---------------------------------------------------------------------------
  // 8. Admin Issue Management & Notes
  // ---------------------------------------------------------------------------
  it("8. Issue workflow: admin can update issue status and add investigation notes", async () => {
    const issue = ReconciliationService.recordIssue({
      type: "WALLET_BALANCE_MISMATCH",
      severity: "CRITICAL",
      userId: "u-rec-8",
      expectedValue: 1000,
      actualValue: 800,
      details: "Balance difference of 200",
    });

    // 1. Mark INVESTIGATING
    const investigating = ReconciliationService.updateIssue(issue.id, {
      status: "INVESTIGATING",
      notes: "Auditor looking into transaction history",
    });
    expect(investigating.status).toBe("INVESTIGATING");
    expect(investigating.notes).toBe("Auditor looking into transaction history");

    // 2. Mark RESOLVED
    const resolved = ReconciliationService.updateIssue(issue.id, {
      status: "RESOLVED",
      notes: "Compensating adjustment executed",
      resolvedBy: "admin-lead",
    });
    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.resolvedBy).toBe("admin-lead");
  });
});
