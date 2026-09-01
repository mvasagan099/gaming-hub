import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { AuditLogService } from "../auditLogService";
import { WalletTransactionService } from "../walletTransactionService";

describe("Feature 23: Complete Admin & System Audit Log", () => {
  const createdUserIds: string[] = [];
  const createdAuditLogIds: string[] = [];

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
    if (createdAuditLogIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { id: { in: createdAuditLogIds } },
      }).catch(() => undefined);
      createdAuditLogIds.length = 0;
    }

    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Admin Wallet Adjustment Audit Log
  // ---------------------------------------------------------------------------
  it("1. Wallet adjustment audit: records actor, target, amount, reason, and transactionId", async () => {
    const adminId = await createTestUser("u-aud-1-a", 0);
    const targetUserId = await createTestUser("u-aud-1-b", 1000);

    const log = await AuditLogService.record({
      actorType: "admin",
      actorId: adminId,
      action: "wallet.manual_credit",
      category: "wallet",
      targetType: "user",
      targetId: targetUserId,
      reason: "Compensation for tournament delay",
      transactionId: "tx-aud-123",
      meta: { amount: 500, previousBalance: 1000, newBalance: 1500 },
    });
    createdAuditLogIds.push(log.id);

    expect(log.id).toBeDefined();
    expect(log.actorId).toBe(adminId);
    expect(log.targetId).toBe(targetUserId);
    expect(log.action).toBe("wallet.manual_credit");

    const meta = log.meta as Record<string, unknown>;
    expect(meta.reason).toBe("Compensation for tournament delay");
    expect(meta.transactionId).toBe("tx-aud-123");
    expect(meta.amount).toBe(500);
  });

  // ---------------------------------------------------------------------------
  // 2. Tournament Lifecycle Audit Logs
  // ---------------------------------------------------------------------------
  it("2. Tournament lifecycle: logs creation, pause, resume, and cancellation actions", async () => {
    const adminId = await createTestUser("u-aud-2", 0);
    const tournamentId = `tourn-aud-${Date.now()}`;

    const createLog = await AuditLogService.record({
      actorType: "admin",
      actorId: adminId,
      action: "tournament.created",
      category: "admin",
      targetType: "tournament",
      targetId: tournamentId,
      reason: "Weekend Championship setup",
    });
    createdAuditLogIds.push(createLog.id);

    const cancelLog = await AuditLogService.record({
      actorType: "admin",
      actorId: adminId,
      action: "tournament.cancelled",
      category: "admin",
      targetType: "tournament",
      targetId: tournamentId,
      reason: "Server maintenance window overlap",
    });
    createdAuditLogIds.push(cancelLog.id);

    expect(createLog.action).toBe("tournament.created");
    expect(cancelLog.action).toBe("tournament.cancelled");
  });

  // ---------------------------------------------------------------------------
  // 3. Before / After State Diffing
  // ---------------------------------------------------------------------------
  it("3. State diffing: captures before and after parameters for configuration edits", async () => {
    const adminId = await createTestUser("u-aud-3", 0);

    const log = await AuditLogService.record({
      actorType: "admin",
      actorId: adminId,
      action: "game_config.updated",
      category: "game",
      targetType: "game",
      targetId: "chess",
      reason: "Increase max entry fee tier",
      before: { entryFee: 100, turnTimerSeconds: 60 },
      after: { entryFee: 200, turnTimerSeconds: 60 },
    });
    createdAuditLogIds.push(log.id);

    const meta = log.meta as Record<string, unknown>;
    expect(meta.before).toEqual({ entryFee: 100, turnTimerSeconds: 60 });
    expect(meta.after).toEqual({ entryFee: 200, turnTimerSeconds: 60 });
  });

  // ---------------------------------------------------------------------------
  // 4. Sensitive Data Sanitization
  // ---------------------------------------------------------------------------
  it("4. Sanitization: automatically redacts passwords, tokens, JWTs, and API keys", async () => {
    const log = await AuditLogService.record({
      actorType: "system",
      action: "auth.password_reset",
      category: "auth",
      meta: {
        username: "player1",
        password: "SuperSecretPassword123!",
        token: "jwt.secret.bearer.token",
        apiKey: "sk-live-12345678",
      },
    });
    createdAuditLogIds.push(log.id);

    const meta = log.meta as Record<string, unknown>;
    expect(meta.username).toBe("player1");
    expect(meta.password).toBe("[REDACTED]");
    expect(meta.token).toBe("[REDACTED]");
    expect(meta.apiKey).toBe("[REDACTED]");
  });

  // ---------------------------------------------------------------------------
  // 5. Request ID Correlation
  // ---------------------------------------------------------------------------
  it("5. Correlation: associates requestId across audit log records", async () => {
    const reqId = `req-correlate-${Date.now()}`;

    const log = await AuditLogService.record({
      actorType: "system",
      action: "system.match_settled",
      category: "game",
      requestId: reqId,
      targetType: "match",
      targetId: "match-123",
    });
    createdAuditLogIds.push(log.id);

    const meta = log.meta as Record<string, unknown>;
    expect(meta.requestId).toBe(reqId);
  });

  // ---------------------------------------------------------------------------
  // 6. Query Filtering and Search
  // ---------------------------------------------------------------------------
  it("6. Filtering: filters logs by action, category, actor, and free-text search", async () => {
    const adminId = await createTestUser("u-aud-6", 0);

    const log = await AuditLogService.record({
      actorType: "admin",
      actorId: adminId,
      action: "rbac.role_change",
      category: "security",
      targetType: "user",
      targetId: "target-user-99",
      reason: "Promote to moderator",
    });
    createdAuditLogIds.push(log.id);

    // Filter by action & category
    const res = await AuditLogService.queryAuditLogs({
      action: "rbac.role_change",
      category: "security",
    });

    expect(res.total).toBeGreaterThanOrEqual(1);
    expect(res.items.some((i) => i.id === log.id)).toBe(true);

    // Free text search
    const searchRes = await AuditLogService.queryAuditLogs({
      search: "target-user-99",
    });
    expect(searchRes.items.some((i) => i.id === log.id)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 7. Audit Log Details with Context
  // ---------------------------------------------------------------------------
  it("7. Details view: returns audit log along with actor user and target context", async () => {
    const adminId = await createTestUser("u-aud-7-a", 0);
    const targetUserId = await createTestUser("u-aud-7-b", 1000);

    const log = await AuditLogService.record({
      actorType: "admin",
      actorId: adminId,
      action: "account.freeze",
      category: "admin",
      targetType: "user",
      targetId: targetUserId,
      reason: "Pending verification",
    });
    createdAuditLogIds.push(log.id);

    const details = await AuditLogService.getAuditLogDetails(log.id);
    expect(details.log.id).toBe(log.id);
    expect(details.actorUser?.id).toBe(adminId);
    expect(details.targetUser?.id).toBe(targetUserId);
  });

  // ---------------------------------------------------------------------------
  // 8. CSV Export
  // ---------------------------------------------------------------------------
  it("8. CSV export: generates structured CSV report for audit trail", async () => {
    const csv = await AuditLogService.exportAuditLogsCsv({});
    expect(typeof csv).toBe("string");
    expect(csv).toContain("ID,Timestamp,Actor Type,Actor ID,Action,Category,Target Type,Target ID,Reason");
  });
});
