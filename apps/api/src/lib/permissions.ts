import type { FastifyRequest } from "fastify";
import { prisma as database, type User } from "@gaming-hub/db";
import { AppError, hasPermission, ROLE_PERMISSIONS, type Permission } from "@gaming-hub/shared";
import { requireUser } from "./http";

export async function requirePermission(request: FastifyRequest, permission: Permission, prisma: any = database): Promise<User> {
  const user = requireUser(request);
  
  if (user.role === "CUSTOM" && user.customRoleId && prisma) {
    const customRole = await prisma.customRole.findUnique({
      where: { id: user.customRoleId },
      include: { permissions: true },
    });
    
    if (!customRole) {
      throw new AppError("FORBIDDEN", "Custom role not found", 403);
    }
    
    const permissions = customRole.permissions.map((p: any) => p.permission) as Permission[];
    if (!hasPermission(user.role, permission, permissions)) {
      throw new AppError(
        "FORBIDDEN",
        "You do not have permission to perform this action",
        403,
      );
    }
  } else {
    if (!hasPermission(user.role, permission)) {
      throw new AppError(
        "FORBIDDEN",
        "You do not have permission to perform this action",
        403,
      );
    }
  }
  
  return user;
}

/** Delegation cannot create authority the caller does not already hold. */
export async function assertRoleGrant(user: User, permissions: readonly string[], prisma: any = database): Promise<void> {
  if (user.role === "ADMIN") return;
  let granted: readonly string[] = ROLE_PERMISSIONS[user.role] ?? [];
  if (user.role === "CUSTOM" && user.customRoleId) {
    const role = await prisma.customRole.findUnique({ where: { id: user.customRoleId }, include: { permissions: true } });
    granted = role?.permissions.map((p: { permission: string }) => p.permission) ?? [];
  }
  if (permissions.some((permission) => !granted.includes(permission))) {
    throw new AppError("FORBIDDEN", "Cannot administer or grant permissions outside your delegated authority", 403);
  }
}
