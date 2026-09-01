import type { FastifyRequest } from "fastify";
import type { User } from "@gaming-hub/db";
import { AppError, hasPermission, type Permission } from "@gaming-hub/shared";
import { requireUser } from "./http";

export async function requirePermission(request: FastifyRequest, permission: Permission, prisma?: any): Promise<User> {
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
