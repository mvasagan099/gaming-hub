import { prisma, Prisma } from "@gaming-hub/db";
import type { User } from "@gaming-hub/db";
import type { PublicProfile } from "@gaming-hub/shared";

const USERNAME_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomSuffix(length = 5): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += USERNAME_ALPHABET[Math.floor(Math.random() * USERNAME_ALPHABET.length)];
  }
  return out;
}

function sanitizeUsername(candidate: string | null): string | null {
  if (!candidate) return null;
  const cleaned = candidate.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
  if (cleaned.length < 3) return null;
  return cleaned;
}

/**
 * Upserts the authenticated Supabase user into our user table and creates the
 * default gaming resources (profile + wallet) on first sign-in.
 */
export async function ensureUser(sub: string, email: string | null): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { id: sub } });
  if (existing) {
    if (existing.email !== email) {
      return prisma.user.update({ where: { id: sub }, data: { email } });
    }
    return existing;
  }

  const baseUsername = sanitizeUsername(email?.split("@")[0] ?? null) ?? "player";

  for (let attempt = 0; attempt < 5; attempt++) {
    const username = attempt === 0 ? baseUsername : `${baseUsername}_${randomSuffix()}`;
    try {
      return await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            id: sub,
            email,
            username,
            displayName: username,
            avatarUrl: null,
          },
        });
        await tx.profile.create({
          data: { userId: sub },
        });
        await tx.wallet.create({
          data: { userId: sub },
        });
        return user;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Could not allocate a unique username");
}

export function toPublicProfile(
  user: Prisma.UserGetPayload<{ include: { profile: true } }>,
): PublicProfile {
  const profile = user.profile;
  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: profile?.bio ?? null,
    country: profile?.country ?? null,
    coins: profile?.coins ?? 0,
    gems: profile?.gems ?? 0,
    xp: profile?.xp ?? 0,
    level: profile?.level ?? 1,
    wins: profile?.wins ?? 0,
    losses: profile?.losses ?? 0,
    draws: profile?.draws ?? 0,
    isOnline: user.isOnline,
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
  };
}

export async function getPublicProfileById(userId: string): Promise<PublicProfile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
  return user ? toPublicProfile(user) : null;
}

export async function getAuthenticatedUserData(user: User) {
  const [profile, wallet, stats, unreadNotifications] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: user.id } }),
    prisma.wallet.findUnique({ where: { userId: user.id } }),
    prisma.playerStatistic.findMany({
      where: { userId: user.id },
      orderBy: { gamesPlayed: "desc" },
    }),
    prisma.appNotification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return {
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    },
    profile,
    wallet,
    statistics: stats.map((s) => ({
      userId: s.userId,
      gameId: s.gameId,
      gamesPlayed: s.gamesPlayed,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      bestScore: s.bestScore,
      totalXp: s.totalXp,
      rating: s.rating,
    })),
    unreadNotifications,
  };
}

export async function updateUserProfile(
  userId: string,
  data: { displayName?: string; bio?: string; country?: string; avatarUrl?: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: {
        displayName: data.displayName,
        avatarUrl: data.avatarUrl === undefined ? undefined : data.avatarUrl,
      },
    });
    const profile = await tx.profile.update({
      where: { userId },
      data: {
        bio: data.bio,
        country: data.country,
      },
    });
    return { user, profile };
  });
}

export async function searchUsers(query: string, limit = 12) {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { username: { contains: query, mode: "insensitive" } },
        { displayName: { contains: query, mode: "insensitive" } },
      ],
    },
    take: limit,
    include: { profile: true },
  });
  return users.map(toPublicProfile);
}
