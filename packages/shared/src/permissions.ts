/**
 * Authorization model. Roles are stored on the `User` row (Prisma `UserRole`).
 * Permissions are the fine-grained capabilities a role is granted. All admin
 * surfaces must check a permission, never the raw role string, so a future
 * role can be granted a subset of capabilities without touching route code.
 */

export type DbUserRole = "USER" | "MODERATOR" | "ADMIN";

export type Permission =
  | "admin:users:view"
  | "admin:users:manage"
  | "admin:rooms:view"
  | "admin:matches:view"
  | "admin:wallet:adjust";

export const ROLE_PERMISSIONS: Record<DbUserRole, readonly Permission[]> = {
  USER: [],
  MODERATOR: ["admin:users:view", "admin:rooms:view", "admin:matches:view"],
  ADMIN: [
    "admin:users:view",
    "admin:users:manage",
    "admin:rooms:view",
    "admin:matches:view",
    "admin:wallet:adjust",
  ],
};

export function hasPermission(role: DbUserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
