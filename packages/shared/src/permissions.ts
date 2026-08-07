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
  | "admin:wallet:adjust"
  | "admin:wallet:requests:view"
  | "admin:wallet:requests:manage"
  | "admin:settings:view"
  | "admin:settings:edit"
  | "admin:audit:view"
  | "admin:monitoring:view"
  | "admin:analytics:view"
  | "admin:errors:view"
  | "admin:errors:manage"
  | "admin:features:view"
  | "admin:features:edit"
  | "admin:tournaments:view"
  | "admin:tournaments:manage"
  | "admin:coupons:view"
  | "admin:coupons:manage"
  | "admin:announcements:view"
  | "admin:announcements:manage"
  | "admin:crm:view"
  | "admin:crm:manage"
  | "admin:automation:view"
  | "admin:automation:manage"
  | "admin:referrals:view";

export const ROLE_PERMISSIONS: Record<DbUserRole, readonly Permission[]> = {
  USER: [],
  MODERATOR: [
    "admin:users:view",
    "admin:rooms:view",
    "admin:matches:view",
    "admin:audit:view",
    "admin:monitoring:view",
    "admin:errors:view",
    "admin:crm:view",
    "admin:crm:manage",
  ],
  ADMIN: [
    "admin:users:view",
    "admin:users:manage",
    "admin:rooms:view",
    "admin:matches:view",
    "admin:wallet:adjust",
    "admin:wallet:requests:view",
    "admin:wallet:requests:manage",
    "admin:settings:view",
    "admin:settings:edit",
    "admin:audit:view",
    "admin:monitoring:view",
    "admin:analytics:view",
    "admin:errors:view",
    "admin:errors:manage",
    "admin:features:view",
    "admin:features:edit",
    "admin:tournaments:view",
    "admin:tournaments:manage",
    "admin:coupons:view",
    "admin:coupons:manage",
    "admin:announcements:view",
    "admin:announcements:manage",
    "admin:crm:view",
    "admin:crm:manage",
    "admin:automation:view",
    "admin:automation:manage",
    "admin:referrals:view",
  ],
};

export function hasPermission(role: DbUserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
