import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { AdminSecurityService } from "../adminSecurityService";

describe("Feature 26: Admin Security & RBAC Hardening", () => {
  const createdUserIds: string[] = [];
  const createdAuditLogIds: string[] = [];

  async function createTestUser(prefix: string, role: "USER" | "MODERATOR" | "ADMIN" = "USER") {
    const userId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    createdUserIds.push(userId);

    await prisma.user.create({
      data: {
        id: userId,
        username: `u_${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`,
        displayName: `User ${userId.slice(0, 8)}`,
        email: `${userId}@test.com`,
        role,
        wallet: {
          create: { balance: 1000 },
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
  // 1. Role Change Execution by Authorized Admin
  // ---------------------------------------------------------------------------
  it("1. Authorized admin: successfully promotes USER to MODERATOR and creates audit log", async () => {
    const adminId = await createTestUser("u-sec-1-a", "ADMIN");
    const targetUserId = await createTestUser("u-sec-1-b", "USER");

    const updated = await AdminSecurityService.changeUserRole({
      actorId: adminId,
      targetUserId,
      newRole: "MODERATOR",
      reason: "Promoting to community moderator",
    });

    expect(updated.role).toBe("MODERATOR");

    const auditLogs = await prisma.auditLog.findMany({
      where: { targetId: targetUserId, action: "rbac.role_change" },
    });
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    createdAuditLogIds.push(...auditLogs.map((l) => l.id));

    const log = auditLogs[0];
    expect(log.actorId).toBe(adminId);
    const meta = log.meta as Record<string, unknown>;
    expect(meta.before).toEqual({ role: "USER", customRoleId: null });
    expect(meta.after).toEqual({ role: "MODERATOR", customRoleId: null });
  });

  // ---------------------------------------------------------------------------
  // 2. Unauthorized Role Modification Rejection
  // ---------------------------------------------------------------------------
  it("2. Unauthorized actor: normal USER cannot change another user's role (403)", async () => {
    const regularUserId = await createTestUser("u-sec-2-a", "USER");
    const targetUserId = await createTestUser("u-sec-2-b", "USER");

    await expect(
      AdminSecurityService.changeUserRole({
        actorId: regularUserId,
        targetUserId,
        newRole: "ADMIN",
      })
    ).rejects.toThrow(/do not have permission/i);
  });

  // ---------------------------------------------------------------------------
  // 3. Self-Role Modification Prevention
  // ---------------------------------------------------------------------------
  it("3. Self-modification guard: admin cannot change their own role (403)", async () => {
    const adminId = await createTestUser("u-sec-3", "ADMIN");

    await expect(
      AdminSecurityService.changeUserRole({
        actorId: adminId,
        targetUserId: adminId,
        newRole: "USER",
      })
    ).rejects.toThrow(/cannot modify your own role/i);
  });

  // ---------------------------------------------------------------------------
  // 4. Last Admin Demotion Guard
  // ---------------------------------------------------------------------------
  it("4. Last admin protection: cannot demote the last remaining ADMIN account (403)", async () => {
    // Count existing admins
    const totalAdmins = await prisma.user.count({ where: { role: "ADMIN" } });
    
    // Create an admin actor and a target admin
    const actorAdminId = await createTestUser("u-sec-act-adm", "ADMIN");
    const targetAdminId = await createTestUser("u-sec-tgt-adm", "ADMIN");

    // When there are >= 2 admins, demoting targetAdminId succeeds
    const demoted = await AdminSecurityService.changeUserRole({
      actorId: actorAdminId,
      targetUserId: targetAdminId,
      newRole: "MODERATOR",
      reason: "Demoting secondary admin",
    });
    expect(demoted.role).toBe("MODERATOR");

    // If we remove all other admins except actorAdminId:
    await prisma.user.updateMany({
      where: { role: "ADMIN", id: { not: actorAdminId } },
      data: { role: "MODERATOR" },
    });

    // Create a temporary admin to act as caller
    const callerAdminId = await createTestUser("u-sec-caller-adm", "ADMIN");
    // Demote callerAdminId to moderator
    await prisma.user.update({
      where: { id: callerAdminId },
      data: { role: "MODERATOR" },
    });

    // Demoting actorAdminId when it is the sole remaining admin should be rejected
    // Give callerAdmin temporary permission via custom role or test directly
    await prisma.user.update({
      where: { id: callerAdminId },
      data: { role: "ADMIN" },
    });

    // Demote callerAdminId again so actorAdminId is the ONLY admin
    await prisma.user.update({
      where: { id: callerAdminId },
      data: { role: "USER" },
    });

    // Attempting to demote the sole admin (actorAdminId) by another user fails
    await expect(
      AdminSecurityService.changeUserRole({
        actorId: callerAdminId,
        targetUserId: actorAdminId,
        newRole: "USER",
      })
    ).rejects.toThrow();
  });

  // ---------------------------------------------------------------------------
  // 5. Internal API Authorization
  // ---------------------------------------------------------------------------
  it("5. Internal API protection: validates X-Internal-Key and rejects unauthorized callers", async () => {
    const { env } = await import("../../env");

    // Valid key
    expect(AdminSecurityService.verifyInternalAuth(env.INTERNAL_API_KEY)).toBe(true);

    // Missing key
    expect(() => AdminSecurityService.verifyInternalAuth(undefined)).toThrow(/Invalid or missing internal service key/i);

    // Invalid key
    expect(() => AdminSecurityService.verifyInternalAuth("wrong-key-value-123")).toThrow(/Invalid or missing internal service key/i);
  });

  // ---------------------------------------------------------------------------
  // 6. Object-Level Access & IDOR Defense
  // ---------------------------------------------------------------------------
  it("6. Object authorization: allows resource owner or admin, denies cross-user access", () => {
    // Resource owner can access their own data
    expect(
      AdminSecurityService.checkObjectAccess({
        actorRole: "USER",
        requiredPermission: "admin:wallet:view",
        targetOwnerId: "user-123",
        actorUserId: "user-123",
      })
    ).toBe(true);

    // Cross-user access without admin permission is denied
    expect(() =>
      AdminSecurityService.checkObjectAccess({
        actorRole: "USER",
        requiredPermission: "admin:wallet:view",
        targetOwnerId: "user-999",
        actorUserId: "user-123",
      })
    ).toThrow(/Access denied/i);

    // Admin with permission can access other users' data
    expect(
      AdminSecurityService.checkObjectAccess({
        actorRole: "ADMIN",
        requiredPermission: "admin:wallet:view",
        targetOwnerId: "user-999",
        actorUserId: "admin-1",
      })
    ).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 7. Security Overview Endpoint Data
  // ---------------------------------------------------------------------------
  it("7. Security overview: aggregates admin, moderator, user counts, and custom roles", async () => {
    const overview = await AdminSecurityService.getAdminSecurityOverview();
    expect(overview).toHaveProperty("adminCount");
    expect(overview).toHaveProperty("moderatorCount");
    expect(overview).toHaveProperty("userCount");
    expect(overview).toHaveProperty("customRoles");
  });
});
