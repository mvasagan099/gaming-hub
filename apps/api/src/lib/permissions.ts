import type { FastifyRequest } from "fastify";
import type { User } from "@gaming-hub/db";
import { AppError, hasPermission, type Permission } from "@gaming-hub/shared";
import { requireUser } from "./http";

export function requirePermission(request: FastifyRequest, permission: Permission): User {
  const user = requireUser(request);
  if (!hasPermission(user.role, permission)) {
    throw new AppError(
      "FORBIDDEN",
      "You do not have permission to perform this action",
      403,
    );
  }
  return user;
}
