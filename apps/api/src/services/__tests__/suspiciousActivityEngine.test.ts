import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { SuspiciousActivityService } from "../suspiciousActivityService";
import { WalletTransactionService } from "../walletTransactionService";

describe("Feature 22: Suspicious Transaction & Activity Detection", () => {
  const createdUserIds: string[] = [];
  const createdMatchIds: string[] = [];

  beforeEach(() => {
    SuspiciousActivityService.resetForTesting();
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
  // 1. Normal User Activity (No False Positives)
  // ---------------------------------------------------------------------------
  it("1. Normal activity: standard low-volume transactions do not generate alerts", async () => {
    const user = await createTestUser("u-sec-1", 1000);

    // 2 normal entry fees
    await WalletTransactionService.createDebit(prisma, {
      userId: user,
      amount: 50,
      referenceType: "MATCH_WAGER",
      referenceId: "m1",
    });
    await WalletTransactionService.createDebit(prisma, {
      userId: user,
      amount: 50,
      referenceType: "MATCH_WAGER",
      referenceId: "m2",
    });

    const alert = await SuspiciousActivityService.detectTransactionVelocity(user, 10);
    expect(alert).toBeNull();

    const list = await SuspiciousActivityService.listAlerts({ userId: user });
    expect(list.total).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 2. High Transaction Velocity Detection
  // ---------------------------------------------------------------------------
  it("2. High velocity: detects abnormal transaction frequency and raises alert", async () => {
    const user = await createTestUser("u-sec-2", 5000);

    // Create 10 transactions in quick succession
    for (let i = 0; i < 10; i++) {
      await WalletTransactionService.createDebit(prisma, {
        userId: user,
        amount: 10,
        referenceType: "MATCH_WAGER",
        referenceId: `m-vel-${i}`,
      });
    }

    const alert = await SuspiciousActivityService.detectTransactionVelocity(user, 10);
    expect(alert).not.toBeNull();
    expect(alert?.type).toBe("TRANSACTION_VELOCITY");
    expect(alert?.severity).toBe("HIGH");
    expect(alert?.status).toBe("OPEN");
  });

  // ---------------------------------------------------------------------------
  // 3. Excessive Refunds Detection
  // ---------------------------------------------------------------------------
  it("3. Excessive refunds: detects repeated rapid refunds and raises alert", async () => {
    const user = await createTestUser("u-sec-3", 1000);

    // Create 4 refund credits
    for (let i = 0; i < 4; i++) {
      await WalletTransactionService.createCredit(prisma, {
        userId: user,
        amount: 100,
        referenceType: "WAGER_REFUND",
        referenceId: `ref-${i}`,
      });
    }

    const alert = await SuspiciousActivityService.detectExcessiveRefunds(user, 3);
    expect(alert).not.toBeNull();
    expect(alert?.type).toBe("EXCESSIVE_REFUNDS");
    expect(alert?.severity).toBe("HIGH");
  });

  // ---------------------------------------------------------------------------
  // 4. Collusion / Same Opponent Win Streak
  // ---------------------------------------------------------------------------
  it("4. Collusion pattern: detects repeated wins against the exact same opponent", async () => {
    const userA = await createTestUser("u-sec-4-a", 1000);
    const userB = await createTestUser("u-sec-4-b", 1000);

    // Create 3 consecutive finished matches where User A wins against User B
    for (let i = 0; i < 3; i++) {
      const matchId = `match-col-${i}-${Date.now()}`;
      createdMatchIds.push(matchId);

      await prisma.match.create({
        data: {
          id: matchId,
          gameId: "chess",
          stake: 100,
          status: "FINISHED",
          endedAt: new Date(),
          players: {
            create: [
              { userId: userA, seat: 0, score: 1, result: "WIN" },
              { userId: userB, seat: 1, score: 0, result: "LOSS" },
            ],
          },
        },
      });
    }

    const alert = await SuspiciousActivityService.detectCollusionPattern(userA, userB, 3);
    expect(alert).not.toBeNull();
    expect(alert?.type).toBe("COLLUSION_SUSPICION");
    expect(alert?.referenceId).toBe(userB);
  });

  // ---------------------------------------------------------------------------
  // 5. Rapid Match Completion Detection
  // ---------------------------------------------------------------------------
  it("5. Rapid completion: detects staked matches finishing under expected threshold", async () => {
    const user = await createTestUser("u-sec-5", 1000);

    const alert = await SuspiciousActivityService.detectRapidMatchCompletion("match-fast-1", 2, 200, user);
    expect(alert).not.toBeNull();
    expect(alert?.type).toBe("RAPID_MATCH_COMPLETION");
    expect(alert?.severity).toBe("HIGH");
  });

  // ---------------------------------------------------------------------------
  // 6. Abnormal Admin Adjustment Detection
  // ---------------------------------------------------------------------------
  it("6. Admin anomalies: detects unusually large manual coin adjustments", async () => {
    const user = await createTestUser("u-sec-6", 1000);

    const alert = await SuspiciousActivityService.detectAbnormalAdminAdjustment("admin-1", user, 100_000, 50_000);
    expect(alert).not.toBeNull();
    expect(alert?.type).toBe("UNUSUAL_ADMIN_ADJUSTMENT");
    expect(alert?.severity).toBe("CRITICAL");
  });

  // ---------------------------------------------------------------------------
  // 7. Alert Deduplication
  // ---------------------------------------------------------------------------
  it("7. Deduplication: repeated alert triggers within cooldown are safely deduplicated", async () => {
    const user = await createTestUser("u-sec-7", 1000);

    const alert1 = await SuspiciousActivityService.createAlert({
      userId: user,
      type: "WALLET_ANOMALY",
      severity: "MEDIUM",
      score: 50,
      reason: "Abnormal balance shift",
    });
    expect(alert1).not.toBeNull();

    // Immediate duplicate trigger for same user and type
    const alert2 = await SuspiciousActivityService.createAlert({
      userId: user,
      type: "WALLET_ANOMALY",
      severity: "MEDIUM",
      score: 50,
      reason: "Abnormal balance shift",
    });
    expect(alert2).toBeNull(); // Deduplicated
  });

  // ---------------------------------------------------------------------------
  // 8. Admin Alert Investigation & Status Updates
  // ---------------------------------------------------------------------------
  it("8. Review workflow: admin can inspect details, set REVIEWING/RESOLVED, and add notes", async () => {
    const user = await createTestUser("u-sec-8", 1000);

    const alert = (await SuspiciousActivityService.createAlert({
      userId: user,
      type: "EXCESSIVE_REFUNDS",
      severity: "HIGH",
      score: 75,
      reason: "Multiple refund cycles",
    }))!;

    // 1. Get Details
    const details = await SuspiciousActivityService.getAlertDetails(alert.id);
    expect(details.alert.id).toBe(alert.id);
    expect(details.relatedTransactions).toBeDefined();

    // 2. Mark REVIEWING
    const reviewing = await SuspiciousActivityService.updateAlert(alert.id, {
      status: "REVIEWING",
      reviewedBy: "admin-mod-1",
      adminNotes: "Investigating player match logs",
    });
    expect(reviewing.status).toBe("REVIEWING");
    expect(reviewing.adminNotes).toBe("Investigating player match logs");

    // 3. Mark RESOLVED
    const resolved = await SuspiciousActivityService.updateAlert(alert.id, {
      status: "RESOLVED",
      adminNotes: "Verified as legitimate network timeout cluster",
    });
    expect(resolved.status).toBe("RESOLVED");

    // 4. Verify wallet balance remained completely unchanged (immutable)
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: user } });
    expect(wallet.balance).toBe(1000);
  });
});
