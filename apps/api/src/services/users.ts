import { prisma, Prisma } from "@gaming-hub/db";
import type { User } from "@gaming-hub/db";
import { AppError, type PublicProfile } from "@gaming-hub/shared";
import { hashToken } from "./sessions";
import { env } from "../env";

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

function readMetadata(metadata: Record<string, unknown> | null | undefined): {
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  phone: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
  country: string | null;
  currency: string | null;
  referredBy: string | null;
} {
  const empty = {
    username: null,
    displayName: null,
    avatarUrl: null,
    phone: null,
    dateOfBirth: null,
    gender: null,
    country: null,
    currency: null,
    referredBy: null,
  };
  if (!metadata) return empty;
  const pick = (keys: string[]): string | null => {
    for (const key of keys) {
      const value = metadata[key];
      if (typeof value === "string" && value.trim().length > 0) return value.trim();
    }
    return null;
  };

  const rawDob = pick(["date_of_birth", "dob", "birth_date"]);
  const dob = rawDob ? new Date(rawDob) : null;

  return {
    username: sanitizeUsername(pick(["username", "user_name", "nickname"])),
    displayName: pick(["display_name", "full_name", "name"]),
    avatarUrl: pick(["avatar_url", "picture"]),
    phone: pick(["phone", "phone_number", "mobile"]),
    dateOfBirth: dob && !Number.isNaN(dob.getTime()) ? dob : null,
    gender: pick(["gender", "sex"]),
    country: pick(["country", "country_code", "region"]),
    currency: pick(["currency", "currency_code"]),
    referredBy: pick(["referred_by", "referral_code", "invite_code"]),
  };
}

/**
 * Upserts the authenticated Supabase user into our user table and creates the
 * default gaming resources (profile + wallet) on first sign-in.
 */
export async function ensureUser(
  sub: string,
  email: string | null,
  userMetadata?: Record<string, unknown> | null,
): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { id: sub } });
  if (existing) {
    if (existing.deletedAt) {
      throw new AppError("ACCOUNT_DELETED", "This account has been deleted", 403);
    }
    if (existing.email !== email) {
      return prisma.user.update({ where: { id: sub }, data: { email } });
    }
    return existing;
  }

  const meta = readMetadata(userMetadata);
  const baseUsername = sanitizeUsername(meta.username) ?? sanitizeUsername(email?.split("@")[0] ?? null) ?? "player";

  let created: User | null = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const username = attempt === 0 ? baseUsername : `${baseUsername}_${randomSuffix()}`;
    try {
      created = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            id: sub,
            email,
            username,
            displayName: meta.displayName ?? username,
            avatarUrl: meta.avatarUrl,
          },
        });
        await tx.profile.create({
          data: {
            userId: sub,
            phone: meta.phone,
            dateOfBirth: meta.dateOfBirth,
            gender: meta.gender,
            country: meta.country,
            currency: meta.currency,
            referredBy: meta.referredBy,
          },
        });
        await tx.wallet.create({
          data: { userId: sub },
        });
        return user;
      });
      break;
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

  if (!created) {
    throw new Error("Could not allocate a unique username");
  }

  // Apply the invite/referral code from signup metadata (settings-driven
  // rewards, fire-and-forget so a bad code never blocks sign-in).
  if (meta.referredBy) {
    void import("./referrals")
      .then(({ applyReferral }) => applyReferral(created!.id, meta.referredBy!))
      .catch((error) => {
        console.error("referral: failed to apply at signup", error);
      });
  }

  return created;
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

export async function getAuthenticatedUserData(user: User, rawToken?: string) {
  const [profile, wallet, stats, unreadNotifications] = await Promise.all([
    prisma.profile.findUnique({
      where: { userId: user.id },
      select: {
        bio: true, country: true, currency: true, coins: true, gems: true,
        xp: true, level: true, wins: true, losses: true, draws: true,
        premium: true, vipLevel: true, twoFactorEnabled: true,
        phone: true, dateOfBirth: true, gender: true,
        streetAddress: true, city: true, state: true, postcode: true,
      },
    }),
    prisma.wallet.findUnique({ where: { userId: user.id } }),
    prisma.playerStatistic.findMany({
      where: { userId: user.id },
      orderBy: { gamesPlayed: "desc" },
    }),
    prisma.appNotification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  if (wallet && profile && profile.coins !== wallet.balance) {
    profile.coins = wallet.balance;
    void prisma.profile.update({
      where: { userId: user.id },
      data: { coins: wallet.balance },
    }).catch(() => undefined);
  }

  // Fallback & auto-sync address and personal details from KYC if missing in profile
  if (profile && (!profile.streetAddress || !profile.city || !profile.postcode)) {
    const kyc = await prisma.kycRequest.findUnique({
      where: { userId: user.id },
      select: {
        streetAddress: true,
        city: true,
        state: true,
        postalCode: true,
        dateOfBirth: true,
        mobileNumber: true,
      },
    });
    if (kyc && (kyc.streetAddress || kyc.city)) {
      profile.streetAddress = profile.streetAddress || kyc.streetAddress;
      profile.city = profile.city || kyc.city;
      profile.state = profile.state || kyc.state;
      profile.postcode = profile.postcode || kyc.postalCode;
      if (!profile.phone && kyc.mobileNumber) profile.phone = kyc.mobileNumber;
      if (!profile.dateOfBirth && kyc.dateOfBirth) profile.dateOfBirth = kyc.dateOfBirth;

      void prisma.profile.update({
        where: { userId: user.id },
        data: {
          streetAddress: profile.streetAddress,
          city: profile.city,
          state: profile.state,
          postcode: profile.postcode,
          phone: profile.phone,
          dateOfBirth: profile.dateOfBirth,
        },
      }).catch(() => undefined);
    }
  }

  let mfaVerified = false;
  if (rawToken) {
    const tokenHash = hashToken(rawToken);
    const session = await prisma.loginSession.findUnique({
      where: { tokenHash },
      select: { mfaVerifiedAt: true },
    });
    if (session?.mfaVerifiedAt) {
      const freshnessMs = env.MFA_FRESHNESS_MINUTES * 60 * 1000;
      mfaVerified = (Date.now() - session.mfaVerifiedAt.getTime()) <= freshnessMs;
    }
  }

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
    mfaVerified,
  };
}

export async function updateUserProfile(
  userId: string,
  data: {
    displayName?: string;
    bio?: string;
    country?: string;
    avatarUrl?: string | null;
    phone?: string;
    dateOfBirth?: string;
    streetAddress?: string;
    city?: string;
    state?: string;
    postcode?: string;
  },
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
        phone: data.phone,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        streetAddress: data.streetAddress,
        city: data.city,
        state: data.state,
        postcode: data.postcode,
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
