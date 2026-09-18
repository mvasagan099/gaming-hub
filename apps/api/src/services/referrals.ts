import crypto from "node:crypto";
import { prisma, Prisma, NotificationType } from "@gaming-hub/db";
import { AppError, referralSettingsSchema } from "@gaming-hub/shared";
import type { z } from "zod";
import type {
  AdminReferralStats,
  ReferralLeaderboardEntry,
  ReferralStatus,
  ReferralSummary,
} from "@gaming-hub/shared";
import { applyTransaction } from "./wallet";
import { getCategorySettings, updateCategorySettings } from "./settings";
import { NotificationService } from "./notificationService";
import { audit } from "./audit";
import { SuspiciousActivityService } from "./suspiciousActivityService";
import { RateLimitService } from "./rateLimitService";
import { AchievementService } from "./achievementService";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomCode(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

export function codeFromUsername(username: string): string {
  const base = username.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
  return `${base || "PLAY"}${randomCode(4)}`;
}

export interface ReferralApplyResult {
  applied: boolean;
  referrerReward: number;
  referredReward: number;
  status: string;
}

export interface ReferralRequestContext {
  ip?: string;
  userAgent?: string;
  deviceId?: string;
  deviceFingerprint?: string;
  phone?: string;
  paymentIdentifier?: string;
}

export function hashIdentifier(val: string): string {
  return crypto.createHash("sha256").update(val.trim()).digest("hex").slice(0, 16);
}

export class ReferralService {
  /**
   * 1. Ensures the user has a unique, stable, non-sensitive referral code.
   */
  static async ensureReferralCode(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true, username: true },
    });
    if (!user) throw new AppError("NOT_FOUND", "User not found", 404);
    if (user.referralCode) return user.referralCode;

    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = attempt === 0 ? codeFromUsername(user.username) : randomCode(8);
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { referralCode: candidate },
        });
        return candidate;
      } catch {
        // P2002 collision retry
      }
    }
    throw new AppError("INTERNAL_ERROR", "Could not allocate a referral code", 500);
  }

  /**
   * 2. Applies a referral code during signup or onboarding.
   * Enforces self-referral checks, single-referrer per account, rate limiting, and fraud checks.
   */
  static async applyReferral(
    userId: string,
    code: string,
    reqContext?: ReferralRequestContext
  ): Promise<ReferralApplyResult> {
    const rateCheck = RateLimitService.checkRateLimit(userId, "REFERRAL");
    if (!rateCheck.allowed) {
      throw new AppError("RATE_LIMITED", "Too many referral attempts. Please try again later.", 429);
    }

    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      return { applied: false, referrerReward: 0, referredReward: 0, status: "IGNORED" };
    }

    const referralSettings = await getCategorySettings("referral");
    if (!referralSettings.enabled) {
      throw new AppError("FEATURE_DISABLED", "Referral program is currently disabled", 403);
    }

    // Check campaign dates
    const now = new Date();
    if (referralSettings.campaignStartDate && new Date(referralSettings.campaignStartDate) > now) {
      throw new AppError("FEATURE_DISABLED", "Referral campaign has not started yet", 400);
    }
    if (referralSettings.campaignEndDate && new Date(referralSettings.campaignEndDate) < now) {
      throw new AppError("FEATURE_DISABLED", "Referral campaign has ended", 400);
    }

    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, referralCode: true },
    });
    if (!me) throw new AppError("NOT_FOUND", "User not found", 404);

    const referrer = await prisma.user.findUnique({
      where: { referralCode: normalized },
      select: { id: true, username: true },
    });
    if (!referrer) {
      throw new AppError("INVALID_REFERRAL_CODE", "Invalid referral code", 400);
    }

    // 1. Self-referral prevention (both referrerId match and referral code ownership)
    const isSelfReferral = referrer.id === userId || (me.referralCode && me.referralCode.toUpperCase() === normalized);
    if (isSelfReferral) {
      await prisma.referralRiskEvent.create({
        data: {
          userId,
          type: "SELF_REFERRAL_ATTEMPT",
          severity: "MEDIUM",
          status: "UNREVIEWED",
          metadata: {
            code: normalized,
            ip: reqContext?.ip ? hashIdentifier(reqContext.ip) : undefined,
          },
        },
      }).catch(() => {});

      SuspiciousActivityService.createAlert({
        userId,
        type: "REFERRAL_ABUSE",
        severity: "MEDIUM",
        score: 65,
        reason: "User attempted self-referral using own code",
        referenceType: "USER",
        referenceId: userId,
        metadata: { code: normalized, ip: reqContext?.ip },
      });
      throw new AppError("SELF_REFERRAL_NOT_ALLOWED", "You cannot use your own referral code", 400);
    }

    // 2. Enforce one referrer per account (immutable relationship)
    const existing = await prisma.referral.findUnique({
      where: { referredUserId: userId },
    });
    if (existing) {
      await prisma.referralRiskEvent.create({
        data: {
          referralId: existing.id,
          userId,
          type: "MULTIPLE_REFERRER_ATTEMPT",
          severity: "LOW",
          status: "UNREVIEWED",
          metadata: {
            attemptedCode: normalized,
            existingReferrerId: existing.referrerId,
          },
        },
      }).catch(() => {});
      throw new AppError("ALREADY_REFERRED", "Account has already been referred", 400);
    }

    // Check referrer maximum rewards limit if configured
    if (referralSettings.maxRewardsPerUser > 0) {
      const rewardedCount = await prisma.referral.count({
        where: { referrerId: referrer.id, status: "REWARDED" },
      });
      if (rewardedCount >= referralSettings.maxRewardsPerUser) {
        throw new AppError("FEATURE_DISABLED", "Referrer has reached maximum referral rewards", 400);
      }
    }

    // 3. Collect fraud and duplicate account signals
    const detectedRiskSignals: Array<{ type: string; severity: string; metadata: any }> = [];

    // Privacy-conscious device / IP matching
    const clientDevice = reqContext?.deviceId ?? reqContext?.deviceFingerprint;
    if (reqContext?.ip || clientDevice) {
      const referrerSessions = await prisma.loginSession.findMany({
        where: { userId: referrer.id },
        select: { ip: true, userAgent: true, deviceName: true },
        take: 20,
        orderBy: { createdAt: "desc" },
      });

      if (reqContext?.ip && referrerSessions.some((s) => s.ip && s.ip === reqContext.ip)) {
        detectedRiskSignals.push({
          type: "REFERRER_AND_REFEREE_SAME_IP",
          severity: "MEDIUM",
          metadata: { hashedIp: hashIdentifier(reqContext.ip) },
        });
      }

      if (clientDevice && referrerSessions.some((s) => s.deviceName && s.deviceName === clientDevice)) {
        detectedRiskSignals.push({
          type: "REFERRER_AND_REFEREE_SAME_DEVICE",
          severity: "HIGH",
          metadata: { hashedDevice: hashIdentifier(clientDevice) },
        });
      }
    }

    // Rapid referral creation velocity check
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    const [recent10mCount, recent5mCount] = await Promise.all([
      prisma.referral.count({
        where: { referrerId: referrer.id, createdAt: { gte: tenMinsAgo } },
      }),
      prisma.referral.count({
        where: { referrerId: referrer.id, createdAt: { gte: fiveMinsAgo } },
      }),
    ]);

    if (recent5mCount >= 20 || recent10mCount >= 10) {
      detectedRiskSignals.push({
        type: "RAPID_REFERRAL_CREATION",
        severity: "HIGH",
        metadata: { recent10mCount, recent5mCount },
      });

      SuspiciousActivityService.createAlert({
        userId: referrer.id,
        type: "REFERRAL_VELOCITY",
        severity: "HIGH",
        score: 85,
        reason: `High referral velocity detected: ${recent10mCount} in 10m / ${recent5mCount} in 5m`,
        referenceType: "REFERRER",
        referenceId: referrer.id,
        metadata: { recent10mCount, recent5mCount, ip: reqContext?.ip },
      });
    }

    // Referral commissions are deposit-based only.
    // At signup: status is always PENDING, referee bonus = 0, referrer bonus = 0.
    const createdReferral = await prisma.referral.create({
      data: {
        code: normalized,
        referrerId: referrer.id,
        referredUserId: userId,
        status: "PENDING",
        commission: 0,
        referredReward: 0, // Referee receives 0 bonus coins
        qualifiedAt: null,
        rewardedAt: null,
      },
    });

    // Record any identified risk events linked to this referral
    for (const signal of detectedRiskSignals) {
      await prisma.referralRiskEvent.create({
        data: {
          referralId: createdReferral.id,
          userId: referrer.id,
          type: signal.type,
          severity: signal.severity,
          status: "UNREVIEWED",
          metadata: signal.metadata,
        },
      }).catch(() => {});
    }

    audit({
      actorType: "user",
      actorId: userId,
      action: "referral.applied",
      category: "account",
      targetType: "User",
      targetId: referrer.id,
      meta: {
        code: normalized,
        referralId: createdReferral.id,
        referrerBonus: 0,
        rule: "DEPOSIT_AFFILIATE_ONLY",
        riskSignalsCount: detectedRiskSignals.length,
      },
    });

    return {
      applied: true,
      referrerReward: 0,
      referredReward: 0,
      status: "PENDING",
    };
  }

  /**
   * 3. Authoritative first-deposit qualification engine.
   * Rewards referrer with fixed bonus ONLY on the referred user's FIRST legitimate CouponVault deposit.
   * Non-deposit events (FIRST_GAME, FIRST_WIN, TOURNAMENT_JOIN, etc.) are strictly rejected.
   */
  static async evaluateQualification(
    referredUserId: string,
    eventType: "FIRST_DEPOSIT" | string,
    ctx?: Record<string, unknown>
  ) {
    // Only FIRST_DEPOSIT qualifies for the one-time referral bonus
    if (eventType !== "FIRST_DEPOSIT") {
      return null;
    }

    const referral = await prisma.referral.findUnique({
      where: { referredUserId },
      include: {
        referrer: { select: { id: true, username: true } },
        referredUser: { select: { id: true, username: true } },
      },
    });

    if (!referral || referral.status !== "PENDING") {
      return null;
    }

    const referralSettings = await getCategorySettings("referral");
    if (!referralSettings.enabled) {
      return null;
    }

    const minDeposit = Number(
      referralSettings.minimumFirstDeposit ?? referralSettings.minDepositToReward ?? 0
    );
    const depositAmount = Number(ctx?.amount ?? 0);
    if (minDeposit > 0 && depositAmount < minDeposit) {
      return null;
    }

    const fixedBonus = Number(
      referralSettings.referrerFirstDepositBonus ??
      referralSettings.referrerReward ??
      referralSettings.referrerSignupBonus ??
      500
    );

    let rewardedReferral: any = null;

    try {
      rewardedReferral = await prisma.$transaction(async (tx) => {
        // Atomic status transition using updateMany to guarantee single-winner concurrency
        const updateResult = await tx.referral.updateMany({
          where: {
            id: referral.id,
            status: "PENDING",
          },
          data: {
            status: "REWARDED",
            qualifiedAt: new Date(),
            rewardedAt: new Date(),
            commission: fixedBonus,
            referredReward: 0,
          },
        });

        if (updateResult.count === 0) {
          // Already qualified/rewarded by another concurrent process
          return null;
        }

        // Ensure wallet records exist
        await tx.wallet.upsert({
          where: { userId: referral.referrerId },
          update: {},
          create: { userId: referral.referrerId },
        });
        await tx.wallet.upsert({
          where: { userId: referral.referredUserId },
          update: {},
          create: { userId: referral.referredUserId },
        });

        // Credit referrer BONUS wallet exactly once
        if (fixedBonus > 0) {
          await applyTransaction(
            tx,
            referral.referrerId,
            fixedBonus,
            "REFERRAL",
            referral.id, // idempotent referenceId
            {
              referenceType: "REFERRAL_REWARD",
              referralId: referral.id,
              referralCode: referral.code,
              referredUserId: referral.referredUserId,
              referredUsername: referral.referredUser?.username,
              depositAmount,
              sourceId: ctx?.sagaId ?? ctx?.sourceId,
            },
            "BONUS"
          );
        }

        return tx.referral.findUnique({
          where: { id: referral.id },
          include: {
            referrer: { select: { id: true, username: true } },
            referredUser: { select: { id: true, username: true } },
          },
        });
      });
    } catch (err) {
      console.error("Referral first-deposit qualification transaction error:", err);
      throw err;
    }

    if (!rewardedReferral) {
      return null;
    }

    // Send notification to referrer:
    // Title: Referral Reward Earned
    // Message: "Your referred player made their first deposit. You earned 500 bonus coins."
    if (fixedBonus > 0) {
      void NotificationService.createNotification({
        userId: referral.referrerId,
        type: NotificationType.REFERRAL,
        title: "Referral Reward Earned",
        body: `Your referred player made their first deposit. You earned ${fixedBonus} bonus coins.`,
        referenceType: "REFERRAL_REWARD",
        referenceId: referral.id,
        data: { referralId: referral.id, amount: fixedBonus },
      }).catch((notifErr) => {
        console.warn("Referral reward notification dispatch error:", notifErr);
      });
    }

    // Trigger achievement evaluation
    void AchievementService.evaluateAchievements(referral.referrerId, { userId: referral.referrerId }).catch(() => undefined);

    audit({
      actorType: "system",
      action: "referral.rewarded",
      category: "wallet",
      targetType: "Referral",
      targetId: referral.id,
      meta: {
        referrerId: referral.referrerId,
        referredUserId: referral.referredUserId,
        depositAmount,
        referrerReward: fixedBonus,
        referredReward: 0,
        source: ctx,
      },
    });

    return rewardedReferral;
  }

  /**
   * 4. Legacy processReward method: delegates to first-deposit qualification.
   */
  static async processReward(referralId: string) {
    const referral = await prisma.referral.findUnique({
      where: { id: referralId },
    });
    if (!referral || referral.status !== "PENDING") {
      return referral;
    }
    return this.evaluateQualification(referral.referredUserId, "FIRST_DEPOSIT");
  }

  /**
   * 5. Compensating transaction for reversing rewards on fraud or rollback.
   */
  static async reverseReferral(referralId: string, adminId: string, reason: string) {
    const referral = await prisma.referral.findUnique({
      where: { id: referralId },
      include: { referrer: { select: { id: true, username: true } } },
    });

    if (!referral) {
      throw new AppError("NOT_FOUND", "Referral record not found", 404);
    }

    if (referral.status !== "REWARDED") {
      throw new AppError("VALIDATION_ERROR", `Cannot reverse referral in '${referral.status}' status`, 400);
    }

    await prisma.$transaction(async (tx) => {
      // Mark referral as REVERSED
      await tx.referral.update({
        where: { id: referralId },
        data: {
          status: "REVERSED",
          reversedAt: new Date(),
          reversalReason: reason,
        },
      });

      // Deduct reward from referrer wallet via compensating reversal transaction
      if (referral.commission > 0) {
        await applyTransaction(
          tx,
          referral.referrerId,
          -referral.commission,
          "REVERSAL",
          referral.id,
          {
            originalTransactionType: "REFERRAL",
            reversalReason: reason,
            reversedBy: adminId,
          },
          "BONUS"
        );
      }
    });

    audit({
      actorType: "user",
      actorId: adminId,
      action: "referral.reversed",
      category: "admin",
      targetType: "Referral",
      targetId: referralId,
      meta: {
        referrerId: referral.referrerId,
        referredUserId: referral.referredUserId,
        amount: referral.commission,
        reason,
      },
    });

    return { ok: true, referralId, status: "REVERSED" };
  }

  /**
   * 6. User referral summary metrics and share link.
   */
  static async getReferralSummary(userId: string): Promise<ReferralSummary> {
    const [code, referrals, myReferral, affiliateSummary] = await Promise.all([
      this.ensureReferralCode(userId),
      prisma.referral.findMany({
        where: { referrerId: userId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.referral.findUnique({
        where: { referredUserId: userId },
        include: { referrer: { select: { username: true, displayName: true } } },
      }),
      import("./affiliateService")
        .then((m) => m.AffiliateService.getAffiliateSummary(userId))
        .catch(() => undefined),
    ]);

    const qualified = referrals.filter((r) => r.status === "QUALIFIED" || r.status === "REWARDED");
    const rewarded = referrals.filter((r) => r.status === "REWARDED");
    const pending = referrals.filter((r) => r.status === "PENDING");
    const totalCommission = rewarded.reduce((sum, r) => sum + r.commission, 0);

    const origin = process.env.WEB_ORIGIN || "http://localhost:5173";

    return {
      code,
      totalReferrals: referrals.length,
      qualifiedReferrals: qualified.length,
      completedReferrals: rewarded.length,
      pendingReferrals: pending.length,
      totalCommission,
      totalEarned: totalCommission,
      shareUrl: `${origin}/signup?ref=${code}`,
      referredByCode: myReferral?.code ?? null,
      referrerUsername: myReferral?.referrer?.username ?? null,
      referredStatus: myReferral?.status ?? null,
      referredReward: myReferral?.referredReward ?? null,
      affiliate: affiliateSummary ?? undefined,
    };
  }

  /**
   * 7. Paginated referral list for referee history.
   */
  static async listMyReferrals(userId: string, page = 1, pageSize = 20) {
    const [items, total] = await Promise.all([
      prisma.referral.findMany({
        where: { referrerId: userId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          referredUser: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              isOnline: true,
              createdAt: true,
            },
          },
        },
      }),
      prisma.referral.count({ where: { referrerId: userId } }),
    ]);

    return {
      items: items.map((r) => ({
        id: r.id,
        code: r.code,
        status: r.status as ReferralStatus,
        commission: r.commission,
        referredReward: r.referredReward,
        qualifiedAt: r.qualifiedAt ? r.qualifiedAt.toISOString() : null,
        rewardedAt: r.rewardedAt ? r.rewardedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        referredUser: r.referredUser
          ? {
              id: r.referredUser.id,
              username: r.referredUser.username,
              displayName: r.referredUser.displayName,
              avatarUrl: r.referredUser.avatarUrl,
              isOnline: r.referredUser.isOnline,
            }
          : undefined,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 8. Public / In-app referral leaderboard.
   */
  static async getReferralLeaderboard(limit = 50): Promise<ReferralLeaderboardEntry[]> {
    const groups = await prisma.referral.groupBy({
      by: ["referrerId"],
      where: { status: "REWARDED" },
      _count: { referrerId: true },
      _sum: { commission: true },
      orderBy: { _count: { referrerId: "desc" } },
      take: limit,
    });

    const userIds = groups.map((g) => g.referrerId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
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

  /**
   * 9. Admin dashboard metrics.
   */
  static async getAdminReferralStats(): Promise<AdminReferralStats> {
    const [
      totalReferrals,
      qualifiedCount,
      rewardedCount,
      pendingCount,
      reversedCount,
      rewardsSum,
      suspiciousCount,
      topReferrers,
    ] = await Promise.all([
      prisma.referral.count(),
      prisma.referral.count({ where: { status: "QUALIFIED" } }),
      prisma.referral.count({ where: { status: "REWARDED" } }),
      prisma.referral.count({ where: { status: "PENDING" } }),
      prisma.referral.count({ where: { status: "REVERSED" } }),
      prisma.referral.aggregate({
        where: { status: "REWARDED" },
        _sum: { commission: true },
      }),
      prisma.auditLog.count({
        where: { action: { in: ["referral.abuse", "referral.reversed"] } },
      }).catch(() => 0),
      this.getReferralLeaderboard(10),
    ]);

    const conversionRate = totalReferrals === 0 ? 0 : Number(((rewardedCount / totalReferrals) * 100).toFixed(1));

    return {
      totalReferrals,
      qualifiedReferrals: qualifiedCount,
      rewardedReferrals: rewardedCount,
      pendingReferrals: pendingCount,
      reversedReferrals: reversedCount,
      totalRewardsDistributed: rewardsSum._sum.commission ?? 0,
      conversionRate,
      suspiciousReferralsCount: suspiciousCount,
      topReferrers,
    };
  }

  /**
   * 10. Admin: List referrals with filters.
   */
  static async listAdminReferrals(filter: {
    status?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 50;

    const where: Prisma.ReferralWhereInput = {};
    if (filter.status && filter.status !== "ALL") {
      where.status = filter.status;
    }
    if (filter.search) {
      where.OR = [
        { code: { contains: filter.search, mode: "insensitive" } },
        { referrer: { username: { contains: filter.search, mode: "insensitive" } } },
        { referredUser: { username: { contains: filter.search, mode: "insensitive" } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.referral.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          referrer: { select: { id: true, username: true, displayName: true } },
          referredUser: { select: { id: true, username: true, displayName: true } },
        },
      }),
      prisma.referral.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /**
   * 11. Admin: Update campaign settings with RBAC and audit trail.
   */
  static async adminUpdateSettings(
    data: Partial<z.infer<typeof referralSettingsSchema>>,
    adminId: string
  ) {
    const current = await getCategorySettings("referral");
    const updated = await updateCategorySettings("referral", data);

    audit({
      actorType: "user",
      actorId: adminId,
      action: "referral.settings_updated",
      category: "admin",
      targetType: "SiteSetting",
      targetId: "referral",
      meta: { previous: current, updated },
    });

    return updated;
  }
}

// ---------------------------------------------------------------------------
// Backward-compatible exports for existing callers
// ---------------------------------------------------------------------------

export const ensureReferralCode = ReferralService.ensureReferralCode.bind(ReferralService);
export const applyReferral = ReferralService.applyReferral.bind(ReferralService);
export const getReferralSummary = ReferralService.getReferralSummary.bind(ReferralService);
export const listMyReferrals = ReferralService.listMyReferrals.bind(ReferralService);
export const getReferralLeaderboard = ReferralService.getReferralLeaderboard.bind(ReferralService);
