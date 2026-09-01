/**
 * Authorization model. Roles are stored on the `User` row (Prisma `UserRole`).
 * Permissions are the fine-grained capabilities a role is granted. All admin
 * surfaces must check a permission, never the raw role string, so a future
 * role can be granted a subset of capabilities without touching route code.
 */

export type DbUserRole = "USER" | "MODERATOR" | "ADMIN" | "CUSTOM";

export type Permission =
  | "admin:users:view"
  | "admin:users:manage"
  | "admin:rooms:view"
  | "admin:matches:view"
  | "admin:wallet:view"
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
  | "tournaments.disputes.view"
  | "tournaments.disputes.review"
  | "tournaments.results.override"
  | "admin:coupons:view"
  | "admin:coupons:manage"
  | "admin:announcements:view"
  | "admin:announcements:manage"
  | "admin:crm:view"
  | "admin:crm:manage"
  | "admin:automation:view"
  | "admin:automation:manage"
  | "admin:referrals:view"
  | "admin:kyc:view"
  | "admin:kyc:review"
  | "admin:kyc:override"
  | "admin:kyc:config"
  | "admin:roles:view"
  | "admin:roles:create"
  | "admin:roles:edit"
  | "admin:roles:delete"
  | "admin:games:view"
  | "admin:games:manage"
  | "games.config.read"
  | "games.config.update"
  | "games.enable"
  | "games.disable"
  | "games.entryFee.update"
  | "games.prize.update";

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
    "admin:tournaments:view",
    "tournaments.disputes.view",
    "tournaments.disputes.review",
  ],
  ADMIN: [
    "admin:users:view",
    "admin:users:manage",
    "admin:rooms:view",
    "admin:matches:view",
    "admin:wallet:view",
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
    "tournaments.disputes.view",
    "tournaments.disputes.review",
    "tournaments.results.override",
    "admin:coupons:view",
    "admin:coupons:manage",
    "admin:announcements:view",
    "admin:announcements:manage",
    "admin:crm:view",
    "admin:crm:manage",
    "admin:automation:view",
    "admin:automation:manage",
    "admin:referrals:view",
    "admin:kyc:view",
    "admin:kyc:review",
    "admin:kyc:override",
    "admin:kyc:config",
    "admin:roles:view",
    "admin:roles:create",
    "admin:roles:edit",
    "admin:roles:delete",
    "admin:games:view",
    "admin:games:manage",
    "games.config.read",
    "games.config.update",
    "games.enable",
    "games.disable",
    "games.entryFee.update",
    "games.prize.update",
  ],
  CUSTOM: [],
};

export const ALL_PERMISSIONS: readonly Permission[] = [
  "admin:users:view",
  "admin:users:manage",
  "admin:rooms:view",
  "admin:matches:view",
  "admin:wallet:view",
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
  "admin:kyc:view",
  "admin:kyc:review",
  "admin:kyc:override",
  "admin:kyc:config",
  "admin:roles:view",
  "admin:roles:create",
  "admin:roles:edit",
  "admin:roles:delete",
  "admin:games:view",
  "admin:games:manage",
  "games.config.read",
  "games.config.update",
  "games.enable",
  "games.disable",
  "games.entryFee.update",
  "games.prize.update",
];

export function hasPermission(role: DbUserRole, permission: Permission, customPermissions?: readonly Permission[]): boolean {
  if (role === "CUSTOM") {
    return customPermissions?.includes(permission) ?? false;
  }
  return ROLE_PERMISSIONS[role].includes(permission);
}
