import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { applyTransaction } from "./wallet";
import { getCategorySettings } from "./settings";
import { createNotification } from "./notifications";
import { audit } from "./audit";
import { checkAndUnlock } from "./achievements";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

function codeFromUsername(username: string): string {
  const base = username.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
  return `${base || "PLAY"}${randomCode(4)}`;
}

/**
 * Ensures the user has a referral code, generating one deterministically from
 * their username + a random suffix.
 */
export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true, username: true } });
  if (!user) throw new AppError("NOT_FOUND", "User not found", 404);
  if (user.referralCode) return user.referralCode;

  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = attempt === 0 ? codeFromUsername(user.username) : randomCode(8);
    try {
      await prisma.user.update({ where: { id: userId }, data: { referralCode: candidate } });
      return candidate;
    } catch {
      // P2002 collision — retry with a fresh code.
    }
  }
  throw new AppError("INTERNAL_ERROR", "Could not allocate a referral code", 500);
}

export interface ReferralApplyResult {
  applied: boolean;
  referrerReward: number;
  referredReward: number;
}

/**
 * Applies a referral code at signup. Awards settings-driven rewards to both
 * parties through the bonus wallet and records the Referral row. Safe to call
 * more than once — the unique constraint on referredUserId makes it idempotent.
 */
export async function applyReferral(userId: string, code: string): Promise<ReferralApplyResult> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { applied: false, referrerReward: 0, referredReward: 0 };

  const referralSettings = await getCategorySettings("referral");
  if (!referralSettings.enabled) return { applied: false, referrerReward: 0, referredReward: 0 };

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
  if (!me) throw new AppError("NOT_FOUND", "User not found", 404);

  const referrer = await prisma.user.findUnique({ where: { referralCode: normalized } });
  if (!referrer) throw new AppError("INVALID_REFERRAL_CODE", "Invalid referral code", 400);
  if (referrer.id === userId) throw new AppError("SELF_REFERRAL", "You cannot use your own referral code", 400);

  const existing = await prisma.referral.findUnique({ where: { referredUserId: userId } });
  if (existing) return { applied: false, referrerReward: 0, referredReward: 0 };

  const referrerReward = referralSettings.referrerReward;
  const referredReward = referralSettings.referredReward;

  await prisma.$transaction(async (tx) => {
    await tx.referral.create({
      data: {
        code: normalized,
        referrerId: referrer.id,
        referredUserId: userId,
        status: "REWARDED",
        commission: referrerReward,
      },
    });

    if (referrerReward > 0) {
      await applyTransaction(tx, referrer.id, referrerReward, "REFERRAL", userId, { via: "signup" }, "BONUS");
    }
    if (referredReward > 0) {
      await applyTransaction(tx, userId, referredReward, "REFERRAL", referrer.id, { via: "signup" }, "BONUS");
    }
  });

  audit({
    actorType: "user",
    actorId: userId,
    action: "referral.applied",
    category: "account",
    targetType: "user",
    targetId: referrer.id,
    meta: { code: normalized, referrerReward, referredReward },
  });

  await createNotification(userId, "REFERRAL", "Referral bonus",
    `You received ${referredReward} bonus coins from your referral code`, { referrerId: referrer.id });
  await createNotification(referrer.id, "REFERRAL", "New referral!",
    `${me.username} joined using your code — you earned ${referrerReward} bonus coins`, { referredUserId: userId });

  // Evaluate referral/social achievements for both parties.
  const [referrerStats, myStats] = await Promise.all([
    getReferralProgress(referrer.id),
    getReferralProgress(userId),
  ]);
  await checkAndUnlock(referrer.id, { userId: referrer.id, referralCount: referrerStats.count, referralRewards: referrerStats.rewards });
  await checkAndUnlock(userId, { userId, referralCount: myStats.count, referralRewards: myStats.rewards });

  return { applied: true, referrerReward, referredReward };
}

async function getReferralProgress(userId: string): Promise<{ count: number; rewards: number }> {
  const [count, rewards] = await Promise.all([
    prisma.referral.count({ where: { referrerId: userId, status: { not: "PENDING" } } }),
    prisma.referral.aggregate({ where: { referrerId: userId, status: { not: "PENDING" } }, _sum: { commission: true } }),
  ]);
  return { count, rewards: rewards._sum.commission ?? 0 };
}

export async function getReferralSummary(userId: string) {
  const [code, referrals] = await Promise.all([
    ensureReferralCode(userId),
    prisma.referral.findMany({ where: { referrerId: userId }, orderBy: { createdAt: "desc" } }),
  ]);

  const completed = referrals.filter((r) => r.status !== "PENDING");
  return {
    code,
    totalReferrals: referrals.length,
    completedReferrals: completed.length,
    pendingReferrals: referrals.length - completed.length,
    totalCommission: completed.reduce((sum, r) => sum + r.commission, 0),
    shareUrl: `${process.env.WEB_ORIGIN ?? ""}?ref=${code}`,
  };
}

export async function listMyReferrals(userId: string, page: number, pageSize: number) {
  const [items, total] = await Promise.all([
    prisma.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { referredUser: { select: { id: true, username: true, displayName: true, avatarUrl: true, isOnline: true } } },
    }),
    prisma.referral.count({ where: { referrerId: userId } }),
  ]);

  return {
    items: items.map((r) => ({
      id: r.id,
      code: r.code,
      status: r.status,
      commission: r.commission,
      createdAt: r.createdAt.toISOString(),
      referredUser: r.referredUser,
    })),
    total,
    page,
    pageSize,
  };
}

export async function getReferralLeaderboard(limit = 50) {
  const groups = await prisma.referral.groupBy({
    by: ["referrerId"],
    where: { status: { not: "PENDING" } },
    _count: { referrerId: true },
    _sum: { commission: true },
    orderBy: { _count: { referrerId: "desc" } },
    take: limit,
  });

  const userIds = groups.map((g) => g.referrerId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, displayName: true, avatarUrl: true, isOnline: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  return groups
    .map((g, index) => {
      const user = byId.get(g.referrerId);
      return {
        rank: index + 1,
        userId: g.referrerId,
        username: user?.username ?? "deleted",
        displayName: user?.displayName ?? "Deleted User",
        avatarUrl: user?.avatarUrl ?? null,
        referralCount: g._count.referrerId,
        commission: g._sum.commission ?? 0,
      };
    })
    .filter((e) => e.username !== "deleted");
}
