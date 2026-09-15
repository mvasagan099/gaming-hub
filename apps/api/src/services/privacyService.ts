/**
 * M-01: Privacy service — persistent user privacy settings.
 *
 * Stores settings in the UserPrivacy table (PostgreSQL), surviving API
 * restarts and horizontal scaling.  A row is created on first upsert so
 * reads on accounts that have never configured privacy return sensible defaults.
 */

import { prisma } from "@gaming-hub/db";

export interface PrivacySettings {
  userId: string;
  profileVisibility: "EVERYONE" | "FRIENDS" | "NOBODY";
  showEmail: boolean;
  showPhone: boolean;
  showStats: boolean;
  allowFriendRequests: boolean;
  allowGameInvites: boolean;
}

const ALLOWED_VISIBILITY = new Set(["EVERYONE", "FRIENDS", "NOBODY"]);

/**
 * Returns the user's privacy settings. If no row exists, returns the defaults
 * without writing to the DB (lazy initialisation — the upsert happens on first write).
 */
export async function getPrivacySettings(userId: string): Promise<PrivacySettings> {
  const row = await prisma.userPrivacy.findUnique({ where: { userId } });
  return {
    userId,
    profileVisibility: (row?.profileVisibility as PrivacySettings["profileVisibility"]) ?? "EVERYONE",
    showEmail: row?.showEmail ?? false,
    showPhone: row?.showPhone ?? false,
    showStats: row?.showStats ?? true,
    allowFriendRequests: row?.allowFriendRequests ?? true,
    allowGameInvites: row?.allowGameInvites ?? true,
  };
}

/**
 * Partial update of the user's privacy settings.
 * Unknown fields are silently ignored to be forward-compatible.
 */
export async function updatePrivacySettings(
  userId: string,
  patch: Partial<Omit<PrivacySettings, "userId">>,
): Promise<PrivacySettings> {
  // Validate profileVisibility if provided
  if (patch.profileVisibility !== undefined && !ALLOWED_VISIBILITY.has(patch.profileVisibility)) {
    throw new Error(`profileVisibility must be one of: ${[...ALLOWED_VISIBILITY].join(", ")}`);
  }

  const safeUpdate: Record<string, unknown> = {};
  if (patch.profileVisibility !== undefined) safeUpdate.profileVisibility = patch.profileVisibility;
  if (patch.showEmail !== undefined) safeUpdate.showEmail = Boolean(patch.showEmail);
  if (patch.showPhone !== undefined) safeUpdate.showPhone = Boolean(patch.showPhone);
  if (patch.showStats !== undefined) safeUpdate.showStats = Boolean(patch.showStats);
  if (patch.allowFriendRequests !== undefined) safeUpdate.allowFriendRequests = Boolean(patch.allowFriendRequests);
  if (patch.allowGameInvites !== undefined) safeUpdate.allowGameInvites = Boolean(patch.allowGameInvites);

  const row = await prisma.userPrivacy.upsert({
    where: { userId },
    update: safeUpdate,
    create: {
      userId,
      profileVisibility: patch.profileVisibility ?? "EVERYONE",
      showEmail: patch.showEmail ?? false,
      showPhone: patch.showPhone ?? false,
      showStats: patch.showStats ?? true,
      allowFriendRequests: patch.allowFriendRequests ?? true,
      allowGameInvites: patch.allowGameInvites ?? true,
    },
  });

  return {
    userId: row.userId,
    profileVisibility: row.profileVisibility as PrivacySettings["profileVisibility"],
    showEmail: row.showEmail,
    showPhone: row.showPhone,
    showStats: row.showStats,
    allowFriendRequests: row.allowFriendRequests,
    allowGameInvites: row.allowGameInvites,
  };
}

/**
 * Checks whether a viewer (viewerId) is allowed to see the profile of targetUserId
 * based on the target's privacy settings.
 *
 * Rules:
 *   EVERYONE  — any authenticated user can view
 *   FRIENDS   — only friends can view (friendship check included)
 *   NOBODY    — only the user themselves can view
 */
export async function canViewProfile(viewerId: string, targetUserId: string): Promise<boolean> {
  if (viewerId === targetUserId) return true;

  const privacy = await getPrivacySettings(targetUserId);

  if (privacy.profileVisibility === "EVERYONE") return true;
  if (privacy.profileVisibility === "NOBODY") return false;

  // FRIENDS: check bidirectional friendship in DB
  if (privacy.profileVisibility === "FRIENDS") {
    const friendship = await prisma.friend.findFirst({
      where: {
        OR: [
          { requesterId: viewerId, addresseeId: targetUserId, status: "ACCEPTED" },
          { requesterId: targetUserId, addresseeId: viewerId, status: "ACCEPTED" },
        ],
      },
    });
    return Boolean(friendship);
  }

  return false;
}
