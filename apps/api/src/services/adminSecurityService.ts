import { prisma, UserRole } from "@gaming-hub/db";
import { AppError, hasPermission, type Permission } from "@gaming-hub/shared";
import { AuditLogService } from "./auditLogService";
import { env } from "../env";

export interface RoleChangeInput {
  actorId: string;
  targetUserId: string;
  newRole: UserRole;
  customRoleId?: string | null;
  reason?: string;
}

export class AdminSecurityService {
  /**
   * 1. Validate and Execute a Secure User Role Assignment
   */
  static async changeUserRole(input: RoleChangeInput) {
    const actor = await prisma.user.findUnique({
      where: { id: input.actorId },
      include: { profile: true },
    });

    if (!actor) {
      throw new AppError("UNAUTHORIZED", "Actor not found", 401);
    }

    // RBAC permission check on actor
    if (!hasPermission(actor.role, "admin:users:manage")) {
      throw new AppError("FORBIDDEN", "You do not have permission to manage user roles", 403);
    }

    // Prevent self-role modification (privilege escalation / lockout prevention)
    if (input.actorId === input.targetUserId) {
      throw new AppError("FORBIDDEN", "You cannot modify your own role", 403);
    }

    const target = await prisma.user.findUnique({
      where: { id: input.targetUserId },
    });

    if (!target) {
      throw new AppError("NOT_FOUND", `User ${input.targetUserId} not found`, 404);
    }

    // Validate custom role exists if assigning CUSTOM
    if (input.newRole === "CUSTOM" && input.customRoleId) {
      const customRole = await prisma.customRole.findUnique({
        where: { id: input.customRoleId },
      });
      if (!customRole) {
        throw new AppError("VALIDATION_ERROR", "Custom role not found", 422);
      }
    }

    // Protect the last active ADMIN from being demoted or changed
    if (target.role === "ADMIN" && input.newRole !== "ADMIN") {
      const adminCount = await prisma.user.count({
        where: { role: "ADMIN" },
      });
      if (adminCount <= 1) {
        throw new AppError("FORBIDDEN", "Cannot demote the last remaining administrator", 403);
      }
    }

    const beforeState = { role: target.role, customRoleId: target.customRoleId };
    const afterState = {
      role: input.newRole,
      customRoleId: input.newRole === "CUSTOM" ? input.customRoleId ?? null : null,
    };

    // Update target user
    const updatedUser = await prisma.user.update({
      where: { id: input.targetUserId },
      data: afterState,
    });

    // Record immutable audit log with before and after state diffs
    await AuditLogService.record({
      actorType: "admin",
      actorId: actor.id,
      action: "rbac.role_change",
      category: "security",
      targetType: "user",
      targetId: target.id,
      reason: input.reason ?? "Administrative role update",
      before: beforeState,
      after: afterState,
    });

    return updatedUser;
  }

  /**
   * 2. Verify Internal API Authorization Header
   */
  static verifyInternalAuth(internalKey?: string): boolean {
    const expectedKey = env.INTERNAL_API_KEY;
    if (!internalKey || internalKey !== expectedKey) {
      throw new AppError("UNAUTHORIZED", "Invalid or missing internal service key", 401);
    }
    return true;
  }

  /**
   * 3. Object-Level Access Guard & IDOR Defense
   */
  static checkObjectAccess(params: {
    actorRole: UserRole;
    requiredPermission: Permission;
    targetOwnerId?: string;
    actorUserId: string;
  }) {
    // If actor is accessing their own resource, allow
    if (params.targetOwnerId && params.targetOwnerId === params.actorUserId) {
      return true;
    }

    // Otherwise, check administrative permission
    if (!hasPermission(params.actorRole, params.requiredPermission)) {
      throw new AppError("FORBIDDEN", "Access denied for requested resource", 403);
    }

    return true;
  }

  /**
   * 4. Admin Security & Role Distribution Overview
   */
  static async getAdminSecurityOverview() {
    const [adminCount, modCount, userCount, customRoles] = await Promise.all([
      prisma.user.count({ where: { role: "ADMIN" } }),
      prisma.user.count({ where: { role: "MODERATOR" } }),
      prisma.user.count({ where: { role: "USER" } }),
      prisma.customRole.findMany({ include: { permissions: true } }),
    ]);

    return {
      adminCount,
      moderatorCount: modCount,
      userCount,
      customRolesCount: customRoles.length,
      customRoles: customRoles.map((r) => ({
        id: r.id,
        name: r.name,
        permissionsCount: r.permissions.length,
      })),
      timestamp: new Date().toISOString(),
    };
  }
}
