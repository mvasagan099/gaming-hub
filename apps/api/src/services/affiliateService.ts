import { prisma, NotificationType } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type {
  AffiliateCommissionRecord,
  AffiliateSummary,
  AdminAffiliateStats,
  AdminCommissionItem,
  AdminAffiliateAuditItem,
} from "@gaming-hub/shared";
import { getCategorySettings } from "./settings";
import { applyTransaction } from "./wallet";
import { audit } from "./audit";
import { NotificationService } from "./notificationService";
import { SuspiciousActivityService } from "./suspiciousActivityService";

export function maskUsername(username?: string | null): string {
  if (!username) return "Player";
  if (username.length <= 3) return `${username[0]}***`;
  return `${username.slice(0, 2)}***${username.slice(-2)}`;
}

export type AffiliateMetricEvent =
  | "affiliate_commission_created"
  | "affiliate_commission_amount_total"
  | "affiliate_commission_skipped"
  | "affiliate_commission_duplicate"
  | "affiliate_commission_reversed"
  | "affiliate_processing_failed"
  | "affiliate_risk_flagged"
  | "affiliate_reconciliation_missing"
  | "affiliate_reconciliation_duplicates";

export const affiliateMetricsCounters: Record<AffiliateMetricEvent, number> = {
  affiliate_commission_created: 0,
  affiliate_commission_amount_total: 0,
  affiliate_commission_skipped: 0,
  affiliate_commission_duplicate: 0,
  affiliate_commission_reversed: 0,
  affiliate_processing_failed: 0,
  affiliate_risk_flagged: 0,
  affiliate_reconciliation_missing: 0,
  affiliate_reconciliation_duplicates: 0,
};

export function logAffiliateMetric(event: AffiliateMetricEvent, data: Record<string, unknown>) {
  if (event === "affiliate_commission_amount_total") {
    affiliateMetricsCounters[event] += Number(data.amount ?? 0);
  } else {
    affiliateMetricsCounters[event] = (affiliateMetricsCounters[event] ?? 0) + 1;
  }
  const safeData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("password") ||
      lower.includes("totp") ||
      lower.includes("token") ||
      lower.includes("secret") ||
      lower.includes("key") ||
      lower.includes("auth")
    ) {
      continue;
    }
    safeData[key] = value;
  }
  console.log(`[AFFILIATE_METRIC] ${event}:`, JSON.stringify(safeData));
}

export class AffiliateService {
  /**
   * Evaluates and credits affiliate commission whenever a referred user
   * completes a legitimate deposit to their Gaming Hub MAIN wallet.
   *
   * Supports two configurable admin modes:
   * - ONE_TIME: Only the referred user's first successful deposit generates commission.
   * - CONTINUOUS: Every eligible deposit generates commission.
   *
   * Idempotent: guaranteed exactly-once by unique constraint on (sourceType, sourceId).
   * Credited as BONUS coins to referrer. Referee's MAIN wallet receives 100% of their deposit.
   */
  static async processDepositCommission(params: {
    userId?: string;
    referredUserId?: string;
    amount: number;
    transactionId?: string;
    sourceType?: string;
    sourceId?: string;
    isFirstDeposit?: boolean;
  }) {
    const referredUserId = params.userId ?? params.referredUserId;
    const sourceType = params.sourceType ?? "GAME_WALLET_DEPOSIT";
    const sourceId = params.transactionId ?? params.sourceId;
    const amount = params.amount;

    if (!referredUserId || !sourceId || !amount || amount <= 0) {
      logAffiliateMetric("affiliate_commission_skipped", { reason: "invalid_params", referredUserId, sourceId, amount });
      return null;
    }

    // Only legitimate deposits trigger affiliate commissions
    const ELIGIBLE_DEPOSIT_SOURCES = new Set(["GAME_WALLET_DEPOSIT", "DEPOSIT", "COUPON_REDEMPTION"]);
    if (!ELIGIBLE_DEPOSIT_SOURCES.has(sourceType)) {
      logAffiliateMetric("affiliate_commission_skipped", { reason: "ineligible_source_type", sourceType, sourceId });
      return null;
    }

    // 1. Verify affiliate system is enabled in settings
    const settings = (await getCategorySettings("referral")) as any;
    if (!settings || !settings.enabled || !settings.affiliateEnabled) {
      logAffiliateMetric("affiliate_commission_skipped", { reason: "affiliate_disabled", sourceId });
      return null;
    }

    const affiliateMode: "ONE_TIME" | "CONTINUOUS" = settings.affiliateMode ?? "CONTINUOUS";

    const minDeposit = Number(settings.affiliateMinEligibleDeposit ?? settings.minDepositEligible ?? 0);
    if (minDeposit > 0 && amount < minDeposit) {
      logAffiliateMetric("affiliate_commission_skipped", { reason: "below_min_deposit", amount, min: minDeposit });
      return null;
    }

    // 2. Lookup active referral relation
    const referral = await prisma.referral.findUnique({
      where: { referredUserId },
      include: {
        referrer: {
          select: {
            id: true,
            username: true,
            isOnline: true,
            deletedAt: true,
            penalties: {
              where: {
                status: "ACTIVE",
                type: { in: ["CHEATING", "ABUSE", "UNSPORTSMANLIKE_CONDUCT"] },
              },
            },
          },
        },
        referredUser: {
          select: { id: true, username: true },
        },
      },
    });

    if (!referral || !referral.referrerId) {
      logAffiliateMetric("affiliate_commission_skipped", { reason: "no_referral_found", referredUserId });
      return null;
    }

    // 3. Reject self-referral, per-referral block, and suspended/deleted referrer accounts
    if (referral.referrerId === referredUserId) {
      logAffiliateMetric("affiliate_commission_skipped", { reason: "self_referral", referredUserId });
      return null;
    }

    if (referral.affiliateBlockedAt) {
      logAffiliateMetric("affiliate_commission_skipped", {
        reason: "referral_blocked",
        referralId: referral.id,
        referredUserId,
        blockedReason: referral.affiliateBlockedReason,
      });
      return null;
    }

    if (referral.referrer?.deletedAt || (referral.referrer?.penalties && referral.referrer.penalties.length > 0)) {
      logAffiliateMetric("affiliate_commission_skipped", {
        reason: "referrer_account_suspended",
        referrerId: referral.referrerId,
        referredUserId,
      });
      return null;
    }

    // 4. In ONE_TIME mode, reject if first commission has already been recorded or any prior commission exists
    if (affiliateMode === "ONE_TIME") {
      if (referral.firstCommissionAt !== null) {
        logAffiliateMetric("affiliate_commission_skipped", { reason: "already_rewarded_one_time_mode", referralId: referral.id });
        return null;
      }
      const priorCount = await prisma.affiliateCommission.count({
        where: { referralId: referral.id, status: { in: ["COMPLETED", "PENDING"] } },
      });
      if (priorCount > 0) {
        await prisma.referral.update({
          where: { id: referral.id },
          data: { firstCommissionAt: new Date(), status: "REWARDED" },
        }).catch(() => {});
        logAffiliateMetric("affiliate_commission_skipped", { reason: "prior_completed_commissions_exist", referralId: referral.id });
        return null;
      }
    }

    // In CONTINUOUS mode, if affiliateOnFirstDeposit is explicitly disabled, check first deposit
    if (affiliateMode === "CONTINUOUS" && settings.affiliateOnFirstDeposit === false) {
      const isFirst = referral.firstCommissionAt === null;
      if (isFirst) {
        await prisma.referral.update({
          where: { id: referral.id },
          data: { firstCommissionAt: new Date(), status: "REWARDED" },
        }).catch(() => {});
        logAffiliateMetric("affiliate_commission_skipped", { reason: "first_deposit_excluded_by_config", referralId: referral.id });
        return null;
      }
    }

    // 5. Check minimum eligible deposit
    const minEligible = Number(
      settings.affiliateMinEligibleDeposit || settings.minDepositEligible || 0
    );
    if (minEligible > 0 && amount < minEligible) {
      logAffiliateMetric("affiliate_commission_skipped", {
        reason: "below_min_deposit",
        amount,
        minEligible,
        referredUserId,
      });
      return null;
    }

    // 6. Determine configured commission percentage
    const percent = Number(settings.affiliateDepositPercent || settings.commissionPercent || 5);
    if (percent <= 0) {
      logAffiliateMetric("affiliate_commission_skipped", { reason: "non_positive_commission_percent", percent });
      return null;
    }

    // 7. Calculate commission using safe integer floor rule for coin ledger
    const rawCommission = (amount * percent) / 100;
    let commissionAmount = Math.floor(rawCommission);

    // Max commission per deposit
    const maxPerDeposit = Number(
      settings.affiliateMaxCommissionPerDeposit || settings.maxAffiliateCommissionPerDeposit || 0
    );
    if (maxPerDeposit > 0 && commissionAmount > maxPerDeposit) {
      commissionAmount = maxPerDeposit;
    }

    // Daily commission cap
    const dailyCap = Number(
      settings.affiliateDailyCommissionCap || settings.maxAffiliateCommissionPerDay || 0
    );
    if (dailyCap > 0) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const todayAgg = await prisma.affiliateCommission.aggregate({
        where: {
          referrerId: referral.referrerId,
          status: { in: ["COMPLETED", "PENDING"] },
          createdAt: { gte: startOfDay },
        },
        _sum: { commissionAmount: true },
      });
      const currentDayTotal = Number(todayAgg._sum.commissionAmount ?? 0);
      const remainingAllowed = Math.max(0, dailyCap - currentDayTotal);
      commissionAmount = Math.min(commissionAmount, remainingAllowed);
    }

    // Monthly commission cap
    const monthlyCap = Number(settings.affiliateMonthlyCommissionCap ?? 0);
    if (monthlyCap > 0) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const monthAgg = await prisma.affiliateCommission.aggregate({
        where: {
          referrerId: referral.referrerId,
          status: { in: ["COMPLETED", "PENDING"] },
          createdAt: { gte: startOfMonth },
        },
        _sum: { commissionAmount: true },
      });
      const currentMonthTotal = Number(monthAgg._sum.commissionAmount ?? 0);
      const remainingAllowed = Math.max(0, monthlyCap - currentMonthTotal);
      commissionAmount = Math.min(commissionAmount, remainingAllowed);
    }

    if (commissionAmount <= 0) {
      logAffiliateMetric("affiliate_commission_skipped", { reason: "zero_calculated_commission", rawCommission });
      return null;
    }

    // 7. Fast idempotency check before transaction
    const existing = await prisma.affiliateCommission.findUnique({
      where: {
        sourceType_sourceId: {
          sourceType,
          sourceId,
        },
      },
    });
    if (existing) {
      logAffiliateMetric("affiliate_commission_duplicate", { sourceId, sourceType, commissionId: existing.id });
      return existing;
    }

    // Hold configuration: if affiliateCommissionHoldMinutes > 0, status is PENDING until matured
    const holdMinutes = Number(settings.affiliateCommissionHoldMinutes ?? 0);
    const isHoldActive = holdMinutes > 0;
    const initialStatus = isHoldActive ? "PENDING" : "COMPLETED";
    const heldUntil = isHoldActive ? new Date(Date.now() + holdMinutes * 60 * 1000) : null;
    const payoutDueAt = heldUntil;

    // 8. Atomic transaction: update referral + record commission + credit BONUS wallet (if immediate)
    let createdCommission: any;
    try {
      createdCommission = await prisma.$transaction(async (tx) => {
        // Idempotency check inside transaction
        const inTxExisting = await tx.affiliateCommission.findUnique({
          where: {
            sourceType_sourceId: {
              sourceType,
              sourceId,
            },
          },
        });
        if (inTxExisting) {
          return inTxExisting;
        }

        const now = new Date();

        if (affiliateMode === "ONE_TIME") {
          // Atomic transition: only succeed if firstCommissionAt is null
          const updateResult = await tx.referral.updateMany({
            where: {
              id: referral.id,
              firstCommissionAt: null,
            },
            data: {
              firstCommissionAt: now,
              status: "REWARDED",
              rewardedAt: referral.rewardedAt ?? now,
              commission: { increment: commissionAmount },
            },
          });
          if (updateResult.count === 0) {
            // Concurrently claimed by another deposit
            return null;
          }
        } else {
          // CONTINUOUS mode: ensure firstCommissionAt is recorded and status is REWARDED
          await tx.referral.update({
            where: { id: referral.id },
            data: {
              ...(referral.firstCommissionAt ? {} : { firstCommissionAt: now }),
              status: "REWARDED",
              rewardedAt: referral.rewardedAt ?? now,
              commission: { increment: commissionAmount },
            },
          });
        }

        const commission = await tx.affiliateCommission.create({
          data: {
            referrerId: referral.referrerId,
            referredUserId,
            referralId: referral.id,
            sourceType,
            sourceId,
            depositAmount: amount,
            commissionPercent: percent,
            commissionAmount,
            affiliateMode,
            status: initialStatus,
            heldUntil,
            holdMinutes,
            payoutDueAt,
          },
        });

        // Credit referrer BONUS wallet only if NOT held
        if (!isHoldActive) {
          // Ensure referrer wallet exists
          await tx.wallet.upsert({
            where: { userId: referral.referrerId },
            update: {},
            create: { userId: referral.referrerId },
          });

          // Credit referrer BONUS wallet (referee MAIN wallet is untouched)
          await applyTransaction(
            tx,
            referral.referrerId,
            commissionAmount,
            "AFFILIATE_COMMISSION",
            sourceId,
            {
              sourceType,
              sourceId,
              depositAmount: amount,
              commissionPercent: percent,
              refereeId: referredUserId,
              refereeUsername: referral.referredUser?.username,
              affiliateMode,
            },
            "BONUS",
          );

          audit({
            actorType: "system",
            action: "affiliate.commission.credited",
            category: "wallet",
            targetType: "AffiliateCommission",
            targetId: commission.id,
            meta: {
              referrerId: referral.referrerId,
              referredUserId,
              depositAmount: amount,
              commissionPercent: percent,
              commissionAmount,
              sourceType,
              sourceId,
              affiliateMode,
            },
          });
        } else {
          audit({
            actorType: "system",
            action: "affiliate.commission.held",
            category: "wallet",
            targetType: "AffiliateCommission",
            targetId: commission.id,
            meta: {
              referrerId: referral.referrerId,
              referredUserId,
              depositAmount: amount,
              commissionPercent: percent,
              commissionAmount,
              sourceType,
              sourceId,
              affiliateMode,
              holdMinutes,
              heldUntil: heldUntil?.toISOString(),
            },
          });
        }

        return commission;
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        // Unique constraint race condition safely caught
        const dup = await prisma.affiliateCommission.findUnique({
          where: {
            sourceType_sourceId: {
              sourceType,
              sourceId,
            },
          },
        });
        if (dup) {
          logAffiliateMetric("affiliate_commission_duplicate", { sourceId, sourceType, commissionId: dup.id });
          return dup;
        }
      }
      logAffiliateMetric("affiliate_processing_failed", { sourceId, referredUserId, error: err?.message });
      throw err;
    }

    if (createdCommission) {
      logAffiliateMetric("affiliate_commission_created", {
        commissionId: createdCommission.id,
        referrerId: referral.referrerId,
        referredUserId,
        depositAmount: amount,
        commissionAmount,
        affiliateMode,
        status: createdCommission.status,
      });
      logAffiliateMetric("affiliate_commission_amount_total", {
        amount: commissionAmount,
      });
    }

    // 9. Dispatch notification to referrer only if COMPLETED immediately
    if (createdCommission && createdCommission.status === "COMPLETED") {
      void NotificationService.createNotification({
        userId: referral.referrerId,
        type: NotificationType.AFFILIATE_COMMISSION,
        title: "🎁 Affiliate Commission Earned!",
        body: `You earned ${commissionAmount} bonus coins from a referred player's deposit.`,
        referenceType: "AFFILIATE_COMMISSION",
        referenceId: createdCommission.id,
        data: {
          commissionId: createdCommission.id,
          amount: commissionAmount,
          depositAmount: amount,
        },
      }).catch((notifErr) => {
        console.warn("Affiliate notification dispatch error:", notifErr);
      });
    }

    return createdCommission;
  }

  /**
   * Reverses an affiliate commission when an associated deposit is refunded or revoked.
   * If commission was COMPLETED, creates an opposite BONUS ledger entry with AFFILIATE_COMMISSION_REVERSAL.
   * If referrer already spent BONUS, clamps debit to available balance and records liability without corrupting totals.
   */
  static async reverseCommission(commissionId: string, adminId: string, reason: string) {
    const commission = await prisma.affiliateCommission.findUnique({
      where: { id: commissionId },
    });

    if (!commission) {
      throw new AppError("NOT_FOUND", "Affiliate commission record not found", 404);
    }
    if (commission.status === "REVERSED") {
      return commission;
    }
    if (commission.status !== "COMPLETED" && commission.status !== "PENDING") {
      throw new AppError("VALIDATION_ERROR", `Cannot reverse commission with status '${commission.status}'`, 400);
    }

    const commissionAmount = Number(commission.commissionAmount);

    const reversed = await prisma.$transaction(async (tx) => {
      const updated = await tx.affiliateCommission.update({
        where: { id: commissionId },
        data: {
          status: "REVERSED",
          reversedAt: new Date(),
          reversedBy: adminId,
          reversalReason: reason,
        },
      });

      // If pending, no bonus was credited
      if (commission.status === "PENDING") {
        audit({
          actorType: "user",
          actorId: adminId,
          action: "affiliate.commission.reversed_pending",
          category: "wallet",
          targetType: "AffiliateCommission",
          targetId: commissionId,
          meta: {
            referrerId: commission.referrerId,
            commissionAmount,
            reason,
          },
        });
        logAffiliateMetric("affiliate_commission_reversed", {
          commissionId,
          adminId,
          commissionAmount: 0,
          reason,
        });
        return updated;
      }

      // If completed, deduct up to available BONUS balance
      const referrerWallet = await tx.wallet.findUnique({
        where: { userId: commission.referrerId },
      });
      const bonusBalance = referrerWallet ? Number(referrerWallet.bonusBalance) : 0;
      const deductAmount = Math.min(bonusBalance, commissionAmount);
      const liabilityAmount = commissionAmount - deductAmount;

      if (deductAmount > 0) {
        await applyTransaction(
          tx,
          commission.referrerId,
          -deductAmount,
          "AFFILIATE_COMMISSION_REVERSAL",
          commissionId,
          {
            commissionId,
            reversalReason: reason,
            reversedBy: adminId,
            sourceType: commission.sourceType,
            sourceId: commission.sourceId,
            fullCommissionAmount: commissionAmount,
            deductedAmount: deductAmount,
            liabilityAmount,
          },
          "BONUS",
        );
      }

      if (liabilityAmount > 0) {
        // Create a risk event for unrecovered liability
        await tx.referralRiskEvent.create({
          data: {
            referralId: commission.referralId,
            userId: commission.referrerId,
            type: "UNRECOVERED_REVERSAL_LIABILITY",
            severity: "HIGH",
            status: "UNREVIEWED",
            note: `Reversal completed with unrecovered liability: ${liabilityAmount} coins (available bonus was ${bonusBalance}).`,
            metadata: {
              commissionId,
              commissionAmount,
              deductAmount,
              liabilityAmount,
              bonusBalanceBefore: bonusBalance,
            },
          },
        });
        logAffiliateMetric("affiliate_risk_flagged", {
          type: "UNRECOVERED_REVERSAL_LIABILITY",
          userId: commission.referrerId,
          liabilityAmount,
        });
      }

      audit({
        actorType: "user",
        actorId: adminId,
        action: "affiliate.commission.reversed",
        category: "wallet",
        targetType: "AffiliateCommission",
        targetId: commissionId,
        meta: {
          referrerId: commission.referrerId,
          referredUserId: commission.referredUserId,
          commissionAmount,
          deductAmount,
          liabilityAmount,
          reason,
        },
      });

      logAffiliateMetric("affiliate_commission_reversed", {
        commissionId,
        adminId,
        commissionAmount,
        deductAmount,
        liabilityAmount,
        reason,
      });

      return updated;
    });

    return reversed;
  }

  /**
   * Retrieves summary affiliate metrics for a referrer.
   */
  static async getAffiliateSummary(userId: string): Promise<AffiliateSummary> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const settings = (await getCategorySettings("referral")) as any;
    const commissionPercent = Number(settings?.affiliateDepositPercent ?? settings?.commissionPercent ?? 5);

    const [totalReferredUsers, activeReferrals, allCommissions] = await Promise.all([
      prisma.referral.count({ where: { referrerId: userId } }),
      prisma.referral.count({
        where: {
          referrerId: userId,
          OR: [
            { status: "REWARDED" },
            { status: "QUALIFIED" },
            { affiliateCommissions: { some: { status: "COMPLETED" } } },
          ],
        },
      }),
      prisma.affiliateCommission.findMany({
        where: {
          referrerId: userId,
          status: "COMPLETED",
        },
        select: {
          commissionAmount: true,
          createdAt: true,
        },
      }),
    ]);

    const totalAffiliateEarnings = allCommissions.reduce(
      (sum, c) => sum + Number(c.commissionAmount),
      0,
    );

    const thisMonthEarnings = allCommissions
      .filter((c) => c.createdAt >= startOfMonth)
      .reduce((sum, c) => sum + Number(c.commissionAmount), 0);

    return {
      totalReferredUsers,
      activeReferrals,
      totalAffiliateEarnings,
      thisMonthEarnings,
      commissionPercent,
      affiliateMode: (settings?.affiliateMode as "ONE_TIME" | "CONTINUOUS") ?? "CONTINUOUS",
      affiliateEnabled: Boolean(settings?.enabled && settings?.affiliateEnabled),
    };
  }

  /**
   * Retrieves paginated list of affiliate commission records for a user.
   */
  static async listCommissions(
    userId: string,
    page = 1,
    pageSize = 20,
  ): Promise<{ items: AffiliateCommissionRecord[]; total: number; page: number; pageSize: number }> {
    const skip = (page - 1) * pageSize;

    const [commissions, total] = await Promise.all([
      prisma.affiliateCommission.findMany({
        where: { referrerId: userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          referredUser: {
            select: { username: true },
          },
        },
      }),
      prisma.affiliateCommission.count({ where: { referrerId: userId } }),
    ]);

    const items: AffiliateCommissionRecord[] = commissions.map((c) => ({
      id: c.id,
      referrerId: c.referrerId,
      referredUserId: c.referredUserId,
      refereeUsername: maskUsername(c.referredUser?.username),
      referralId: c.referralId,
      sourceType: c.sourceType,
      sourceId: c.sourceId,
      depositAmount: Number(c.depositAmount),
      commissionPercent: Number(c.commissionPercent),
      commissionAmount: Number(c.commissionAmount),
      status: c.status,
      createdAt: c.createdAt.toISOString(),
    }));

    return { items, total, page, pageSize };
  }

  /**
   * Retrieves platform-wide affiliate metrics for admin overview cards.
   */
  static async getAdminAffiliateStats(): Promise<AdminAffiliateStats> {
    const settings = (await getCategorySettings("referral")) as any;
    const affiliateEnabled = Boolean(settings?.enabled && settings?.affiliateEnabled);
    const affiliateMode = (settings?.affiliateMode as "ONE_TIME" | "CONTINUOUS") ?? "CONTINUOUS";
    const commissionPercent = Number(settings?.affiliateDepositPercent ?? settings?.commissionPercent ?? 5);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      totalEarningsAgg,
      totalCommissions,
      activeReferrals,
      distinctReferrers,
      thisMonthEarningsAgg,
    ] = await Promise.all([
      prisma.affiliateCommission.aggregate({
        where: { status: "COMPLETED" },
        _sum: { commissionAmount: true },
      }),
      prisma.affiliateCommission.count({
        where: { status: "COMPLETED" },
      }),
      prisma.referral.count({
        where: {
          OR: [
            { status: "REWARDED" },
            { status: "QUALIFIED" },
            { firstCommissionAt: { not: null } },
            { affiliateCommissions: { some: { status: "COMPLETED" } } },
          ],
        },
      }),
      prisma.affiliateCommission.groupBy({
        by: ["referrerId"],
        where: { status: "COMPLETED" },
      }),
      prisma.affiliateCommission.aggregate({
        where: {
          status: "COMPLETED",
          createdAt: { gte: startOfMonth },
        },
        _sum: { commissionAmount: true },
      }),
    ]);

    return {
      affiliateStatus: affiliateEnabled ? "ENABLED" : "DISABLED",
      affiliateMode,
      commissionPercent,
      totalAffiliateEarnings: Number(totalEarningsAgg._sum.commissionAmount ?? 0),
      totalCommissions,
      activeReferrals,
      affiliateUsers: distinctReferrers.length,
      thisMonthPaid: Number(thisMonthEarningsAgg._sum.commissionAmount ?? 0),
    };
  }

  /**
   * Retrieves paginated, filtered admin affiliate commission history.
   */
  static async listAdminCommissions(params: {
    page?: number;
    pageSize?: number;
    status?: string;
    mode?: string;
    searchReferrer?: string;
    searchReferred?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{ items: AdminCommissionItem[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (params.status && params.status !== "ALL") {
      where.status = params.status;
    }

    if (params.mode && params.mode !== "ALL") {
      where.affiliateMode = params.mode;
    }

    if (params.searchReferrer) {
      where.referrer = {
        OR: [
          { username: { contains: params.searchReferrer, mode: "insensitive" } },
          { displayName: { contains: params.searchReferrer, mode: "insensitive" } },
        ],
      };
    }

    if (params.searchReferred) {
      where.referredUser = {
        OR: [
          { username: { contains: params.searchReferred, mode: "insensitive" } },
          { displayName: { contains: params.searchReferred, mode: "insensitive" } },
        ],
      };
    }

    if (params.startDate || params.endDate) {
      where.createdAt = {};
      if (params.startDate) where.createdAt.gte = new Date(params.startDate);
      if (params.endDate) {
        const end = new Date(params.endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const [commissions, total] = await Promise.all([
      prisma.affiliateCommission.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          referrer: { select: { id: true, username: true, displayName: true } },
          referredUser: { select: { id: true, username: true, displayName: true } },
        },
      }),
      prisma.affiliateCommission.count({ where }),
    ]);

    const items: AdminCommissionItem[] = commissions.map((c) => ({
      id: c.id,
      referrerId: c.referrerId,
      referrerUsername: c.referrer?.username ?? "Unknown",
      referrerDisplayName: c.referrer?.displayName ?? c.referrer?.username ?? "Unknown",
      referredUserId: c.referredUserId,
      referredUsername: c.referredUser?.username ?? "Unknown",
      referredDisplayName: c.referredUser?.displayName ?? c.referredUser?.username ?? "Unknown",
      referralId: c.referralId,
      sourceType: c.sourceType,
      sourceId: c.sourceId,
      depositAmount: Number(c.depositAmount),
      commissionPercent: Number(c.commissionPercent),
      commissionAmount: Number(c.commissionAmount),
      affiliateMode: c.affiliateMode ?? "CONTINUOUS",
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      reversalReason: c.reversalReason,
      reversedAt: c.reversedAt ? c.reversedAt.toISOString() : null,
      reversedBy: c.reversedBy,
    }));

    return { items, total, page, pageSize };
  }

  /**
   * Retrieves recent audit log history for affiliate settings updates.
   */
  static async getAdminAffiliateAudit(): Promise<{ items: AdminAffiliateAuditItem[] }> {
    const logs = await prisma.auditLog.findMany({
      where: { action: "referral.settings_updated" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const actorIds = Array.from(new Set(logs.map((l) => l.actorId).filter((id): id is string => Boolean(id))));
    const actors = actorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, username: true, displayName: true },
        })
      : [];
    const actorMap = new Map(actors.map((u) => [u.id, u.username || u.displayName || "Admin"]));

    const items: AdminAffiliateAuditItem[] = logs.map((l) => ({
      id: l.id,
      actorId: l.actorId ?? "system",
      actorUsername: l.actorId ? (actorMap.get(l.actorId) ?? "Admin") : "System",
      action: l.action,
      createdAt: l.createdAt.toISOString(),
      meta: (l.meta as any) ?? null,
    }));

    return { items };
  }

  /**
   * Reconciles completed eligible wallet deposits of referred users against
   * the AffiliateCommission ledger.
   * Supports dryRun mode for safe production preview.
   * In dryRun mode, it only evaluates eligibility and reports missing/duplicate/repairsRequired without writing ledger changes.
   */
  static async reconcileCommissions(params?: {
    limit?: number;
    since?: Date;
    dryRun?: boolean;
    userId?: string;
  }): Promise<{
    scanned: number;
    eligible: number;
    missing: number;
    duplicates: number;
    repairsRequired: number;
    repaired: number;
    skipped: number;
    dryRun: boolean;
    details: Array<{ sourceId: string; status: string; reason?: string }>;
  }> {
    const limit = Math.min(500, Math.max(1, params?.limit ?? 100));
    const since = params?.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // default past 30 days
    const dryRun = Boolean(params?.dryRun);

    // 1. Find completed credit deposits
    const eligibleTxs = await prisma.transaction.findMany({
      where: {
        type: "CREDIT",
        referenceType: { in: ["DEPOSIT", "COUPON"] },
        createdAt: { gte: since },
        ...(params?.userId ? { userId: params.userId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        userId: true,
        amount: true,
        referenceType: true,
        referenceId: true,
        createdAt: true,
      },
    });

    let eligible = 0;
    let missing = 0;
    let duplicates = 0;
    let repairsRequired = 0;
    let repaired = 0;
    let skipped = 0;
    const details: Array<{ sourceId: string; status: string; reason?: string }> = [];

    // Check settings for dryRun evaluation
    const settings = (await getCategorySettings("referral")) as any;
    const affiliateEnabled = Boolean(settings?.enabled && settings?.affiliateEnabled);
    const affiliateMode = settings?.affiliateMode ?? "CONTINUOUS";

    for (const tx of eligibleTxs) {
      const sourceId = tx.referenceId || tx.id;
      const sourceType = "GAME_WALLET_DEPOSIT";

      // Check if user has referrer
      const referral = await prisma.referral.findUnique({
        where: { referredUserId: tx.userId },
      });

      if (!referral || !referral.referrerId) {
        skipped++;
        details.push({ sourceId, status: "SKIPPED", reason: "no_referral" });
        continue;
      }

      eligible++;

      // Check if commission already exists
      const existingCommissions = await prisma.affiliateCommission.findMany({
        where: {
          sourceType,
          sourceId,
        },
      });

      if (existingCommissions.length > 1) {
        duplicates += (existingCommissions.length - 1);
        details.push({ sourceId, status: "DUPLICATE", reason: `multiple_commissions_found_${existingCommissions.length}` });
        continue;
      }

      if (existingCommissions.length === 1) {
        skipped++;
        details.push({ sourceId, status: "SKIPPED", reason: "already_exists" });
        continue;
      }

      // Commission is missing!
      missing++;

      if (dryRun) {
        // In dry-run mode, check if it WOULD qualify for repair
        if (affiliateEnabled) {
          if (affiliateMode === "ONE_TIME" && referral.firstCommissionAt !== null) {
            details.push({ sourceId, status: "MISSING_INELIGIBLE", reason: "one_time_mode_already_rewarded" });
          } else {
            repairsRequired++;
            details.push({ sourceId, status: "NEEDS_REPAIR", reason: "eligible_missing_commission" });
          }
        } else {
          details.push({ sourceId, status: "MISSING_INELIGIBLE", reason: "affiliate_currently_disabled" });
        }
        continue;
      }

      // Live repair execution
      try {
        const result = await AffiliateService.processDepositCommission({
          userId: tx.userId,
          amount: Number(tx.amount),
          transactionId: sourceId,
          sourceType,
        });

        if (result && result.status === "COMPLETED") {
          repaired++;
          details.push({ sourceId, status: "REPAIRED", reason: `commission_id_${result.id}` });
        } else {
          skipped++;
          details.push({ sourceId, status: "SKIPPED", reason: "ineligible_or_mode_rule" });
        }
      } catch (err: any) {
        logAffiliateMetric("affiliate_processing_failed", {
          sourceId,
          userId: tx.userId,
          error: err?.message,
        });
        details.push({ sourceId, status: "ERROR", reason: err?.message });
      }
    }

      if (missing > 0) {
        logAffiliateMetric("affiliate_reconciliation_missing", { missing, dryRun });
      }
      if (duplicates > 0) {
        logAffiliateMetric("affiliate_reconciliation_duplicates", { duplicates, dryRun });
      }

      return {
        scanned: eligibleTxs.length,
        eligible,
        missing,
        duplicates,
        repairsRequired,
        repaired,
        skipped,
        dryRun,
        details,
      };
    }

  /**
   * Releases pending commissions whose hold periods have expired.
   * Credits the referrer BONUS wallet and marks status COMPLETED.
   */
  static async releaseMaturedHeldCommissions() {
    const now = new Date();
    const matured = await prisma.affiliateCommission.findMany({
      where: {
        status: "PENDING",
        heldUntil: { lte: now },
      },
      include: {
        referral: true,
      },
    });

    let releasedCount = 0;
    for (const comm of matured) {
      try {
        const commissionAmount = Number(comm.commissionAmount);
        await prisma.$transaction(async (tx) => {
          await tx.affiliateCommission.update({
            where: { id: comm.id },
            data: {
              status: "COMPLETED",
              releasedAt: now,
            },
          });

          await tx.wallet.upsert({
            where: { userId: comm.referrerId },
            update: {},
            create: { userId: comm.referrerId },
          });

          await applyTransaction(
            tx,
            comm.referrerId,
            commissionAmount,
            "AFFILIATE_COMMISSION",
            comm.sourceId,
            {
              sourceType: comm.sourceType,
              sourceId: comm.sourceId,
              commissionId: comm.id,
              holdMinutes: comm.holdMinutes,
              releasedAt: now.toISOString(),
            },
            "BONUS",
          );

          audit({
            actorType: "system",
            action: "affiliate.commission.released",
            category: "wallet",
            targetType: "AffiliateCommission",
            targetId: comm.id,
            meta: {
              referrerId: comm.referrerId,
              commissionAmount,
              sourceId: comm.sourceId,
            },
          });
        });

        void NotificationService.createNotification({
          userId: comm.referrerId,
          type: NotificationType.AFFILIATE_COMMISSION,
          title: "🎁 Affiliate Commission Released!",
          body: `Your hold period has ended. You received ${commissionAmount} bonus coins.`,
          referenceType: "AFFILIATE_COMMISSION",
          referenceId: comm.id,
          data: {
            commissionId: comm.id,
            amount: commissionAmount,
          },
        }).catch(() => {});

        releasedCount++;
      } catch (err) {
        console.warn(`Failed to release held commission ${comm.id}:`, err);
      }
    }
    return { scanned: matured.length, released: releasedCount };
  }

  /**
   * Retrieves high-level risk overview KPIs for the admin dashboard.
   */
  static async getAdminRiskOverview() {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      flaggedReferrals,
      highRiskEvents,
      commissionsUnderReview,
      reversedCommissions,
      volume24hAgg,
    ] = await Promise.all([
      prisma.referral.count({
        where: {
          OR: [
            { affiliateBlockedAt: { not: null } },
            { riskEvents: { some: { status: "UNREVIEWED" } } },
          ],
        },
      }),
      prisma.referralRiskEvent.count({
        where: {
          severity: { in: ["HIGH", "CRITICAL"] },
          status: "UNREVIEWED",
        },
      }),
      prisma.affiliateCommission.count({
        where: { status: "PENDING" },
      }),
      prisma.affiliateCommission.count({
        where: { status: "REVERSED" },
      }),
      prisma.affiliateCommission.aggregate({
        where: {
          status: "COMPLETED",
          createdAt: { gte: oneDayAgo },
        },
        _sum: { commissionAmount: true },
      }),
    ]);

    return {
      flaggedReferrals,
      highRiskReferrals: highRiskEvents,
      commissionsUnderReview,
      reversedCommissions,
      volume24h: Number(volume24hAgg._sum.commissionAmount ?? 0),
    };
  }

  /**
   * Lists risk events with optional filters (severity, status, type) and pagination.
   */
  static async listRiskEvents(params: {
    severity?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (params.severity && params.severity !== "ALL") {
      where.severity = params.severity;
    }
    if (params.status && params.status !== "ALL") {
      where.status = params.status;
    }

    const [total, events] = await Promise.all([
      prisma.referralRiskEvent.count({ where }),
      prisma.referralRiskEvent.findMany({
        where,
        include: {
          user: {
            select: { id: true, username: true, role: true, email: true },
          },
          referral: {
            include: {
              referrer: { select: { id: true, username: true } },
              referredUser: { select: { id: true, username: true } },
              affiliateCommissions: {
                take: 1,
                orderBy: { createdAt: "desc" },
                select: { id: true, depositAmount: true, commissionAmount: true, status: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
    ]);

    return {
      events: events.map((e) => {
        const latestComm = e.referral?.affiliateCommissions?.[0];
        return {
          id: e.id,
          referralId: e.referralId,
          userId: e.userId,
          user: e.user,
          referrer: e.referral?.referrer ?? (e.userId === e.user.id ? e.user : null),
          referredUser: e.referral?.referredUser ?? null,
          type: e.type,
          severity: e.severity,
          status: e.status,
          note: e.note,
          metadata: e.metadata,
          depositAmount: latestComm ? Number(latestComm.depositAmount) : 0,
          commissionAmount: latestComm ? Number(latestComm.commissionAmount) : 0,
          affiliateBlocked: Boolean(e.referral?.affiliateBlockedAt),
          createdAt: e.createdAt,
          reviewedAt: e.reviewedAt,
          reviewedBy: e.reviewedBy,
        };
      }),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  static async reviewRiskEvent(eventId: string, adminId: string, status: "REVIEWED" | "DISMISSED", note?: string) {
    const event = await prisma.referralRiskEvent.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new AppError("NOT_FOUND", "Risk event not found", 404);
    }

    const updated = await prisma.referralRiskEvent.update({
      where: { id: eventId },
      data: {
        status,
        reviewedAt: new Date(),
        reviewedBy: adminId,
        note: note ?? event.note,
      },
    });

    audit({
      actorType: "user",
      actorId: adminId,
      action: "affiliate.risk_event.reviewed",
      category: "security",
      targetType: "ReferralRiskEvent",
      targetId: eventId,
      meta: {
        status,
        note,
        type: event.type,
      },
    });

    return updated;
  }

  static async blockReferralAffiliate(referralId: string, adminId: string, reason: string) {
    const referral = await prisma.referral.findUnique({ where: { id: referralId } });
    if (!referral) {
      throw new AppError("NOT_FOUND", "Referral not found", 404);
    }

    const updated = await prisma.referral.update({
      where: { id: referralId },
      data: {
        affiliateBlockedAt: new Date(),
        affiliateBlockedReason: reason,
        affiliateBlockedBy: adminId,
      },
    });

    audit({
      actorType: "user",
      actorId: adminId,
      action: "affiliate.referral.blocked",
      category: "security",
      targetType: "Referral",
      targetId: referralId,
      meta: { reason, referrerId: referral.referrerId, referredUserId: referral.referredUserId },
    });

    return updated;
  }

  static async unblockReferralAffiliate(referralId: string, adminId: string) {
    const referral = await prisma.referral.findUnique({ where: { id: referralId } });
    if (!referral) {
      throw new AppError("NOT_FOUND", "Referral not found", 404);
    }

    const updated = await prisma.referral.update({
      where: { id: referralId },
      data: {
        affiliateBlockedAt: null,
        affiliateBlockedReason: null,
        affiliateBlockedBy: null,
      },
    });

    audit({
      actorType: "user",
      actorId: adminId,
      action: "affiliate.referral.unblocked",
      category: "security",
      targetType: "Referral",
      targetId: referralId,
      meta: { referrerId: referral.referrerId, referredUserId: referral.referredUserId },
    });

    return updated;
  }

  static async getAffiliateAnalytics() {
    const [
      totalReferrals,
      referredUsersWithCommission,
      topReferrersAgg,
      commissionsAgg,
    ] = await Promise.all([
      prisma.referral.count(),
      prisma.referral.count({ where: { firstCommissionAt: { not: null } } }),
      prisma.affiliateCommission.groupBy({
        by: ["referrerId"],
        where: { status: "COMPLETED" },
        _sum: { commissionAmount: true, depositAmount: true },
        _count: { id: true },
        orderBy: { _sum: { commissionAmount: "desc" } },
        take: 10,
      }),
      prisma.affiliateCommission.aggregate({
        where: { status: "COMPLETED" },
        _avg: { commissionAmount: true, depositAmount: true },
        _sum: { commissionAmount: true, depositAmount: true },
        _count: { id: true },
      }),
    ]);

    const userIds = topReferrersAgg.map((r) => r.referrerId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.username]));

    const zeroDepositReferrals = Math.max(0, totalReferrals - referredUsersWithCommission);
    const conversionRate = totalReferrals > 0 ? (referredUsersWithCommission / totalReferrals) * 100 : 0;

    return {
      conversion: {
        totalReferrals,
        zeroDepositReferrals,
        firstDepositReferrals: referredUsersWithCommission,
        conversionRate: Math.round(conversionRate * 100) / 100,
      },
      averages: {
        avgDeposit: Math.round(Number(commissionsAgg._avg.depositAmount ?? 0)),
        avgCommission: Math.round(Number(commissionsAgg._avg.commissionAmount ?? 0)),
        totalCommissionVolume: Number(commissionsAgg._sum.commissionAmount ?? 0),
        totalEligibleDepositsVolume: Number(commissionsAgg._sum.depositAmount ?? 0),
      },
      topReferrers: topReferrersAgg.map((r) => ({
        referrerId: r.referrerId,
        username: userMap.get(r.referrerId) ?? "Unknown",
        totalCommission: Number(r._sum.commissionAmount ?? 0),
        totalDepositVolume: Number(r._sum.depositAmount ?? 0),
        commissionCount: r._count.id,
      })),
    };
  }

  static async generateDailyAffiliateReport(targetDate?: string) {
    const d = targetDate ? new Date(targetDate) : new Date();
    const startOfDay = new Date(d);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(d);
    endOfDay.setHours(23, 59, 59, 999);

    const [
      commissionsToday,
      reversalsToday,
      riskEventsToday,
    ] = await Promise.all([
      prisma.affiliateCommission.findMany({
        where: { createdAt: { gte: startOfDay, lte: endOfDay } },
      }),
      prisma.affiliateCommission.findMany({
        where: {
          reversedAt: { gte: startOfDay, lte: endOfDay },
          status: "REVERSED",
        },
      }),
      prisma.referralRiskEvent.count({
        where: { createdAt: { gte: startOfDay, lte: endOfDay } },
      }),
    ]);

    const completed = commissionsToday.filter((c) => c.status === "COMPLETED");
    const uniqueReferrers = new Set(completed.map((c) => c.referrerId));
    const uniqueReferees = new Set(completed.map((c) => c.referredUserId));
    const totalDeposit = completed.reduce((acc, c) => acc + Number(c.depositAmount), 0);
    const totalCommission = completed.reduce((acc, c) => acc + Number(c.commissionAmount), 0);
    const oneTimeCount = completed.filter((c) => c.affiliateMode === "ONE_TIME").length;
    const continuousCount = completed.filter((c) => c.affiliateMode === "CONTINUOUS").length;
    const reversalsAmount = reversalsToday.reduce((acc, c) => acc + Number(c.commissionAmount), 0);

    return {
      date: startOfDay.toISOString().split("T")[0],
      totalQualifyingDeposits: {
        count: completed.length,
        volume: totalDeposit,
      },
      totalAffiliateCommission: totalCommission,
      uniqueReferrersPaid: uniqueReferrers.size,
      uniqueReferredUsersDeposited: uniqueReferees.size,
      oneTimeCommissions: oneTimeCount,
      continuousCommissions: continuousCount,
      reversals: {
        count: reversalsToday.length,
        amount: reversalsAmount,
      },
      skippedCommissions: affiliateMetricsCounters.affiliate_commission_skipped,
      fraudFlags: riskEventsToday,
      reconciliationMismatches: affiliateMetricsCounters.affiliate_reconciliation_missing,
    };
  }

  static checkAffiliateAlertConditions() {
    const alerts: Array<{ type: string; message: string; severity: "HIGH" | "CRITICAL" | "MEDIUM" }> = [];

    if (affiliateMetricsCounters.affiliate_processing_failed > 0) {
      alerts.push({
        type: "PROCESSING_FAILURES",
        message: `${affiliateMetricsCounters.affiliate_processing_failed} affiliate commission transactions failed`,
        severity: "CRITICAL",
      });
    }

    if (affiliateMetricsCounters.affiliate_reconciliation_missing > 0) {
      alerts.push({
        type: "RECONCILIATION_MISSING",
        message: `${affiliateMetricsCounters.affiliate_reconciliation_missing} qualifying deposits missing commissions`,
        severity: "HIGH",
      });
    }

    if (affiliateMetricsCounters.affiliate_reconciliation_duplicates > 0) {
      alerts.push({
        type: "RECONCILIATION_DUPLICATES",
        message: `${affiliateMetricsCounters.affiliate_reconciliation_duplicates} duplicate commission records detected`,
        severity: "CRITICAL",
      });
    }

    if (affiliateMetricsCounters.affiliate_risk_flagged > 0) {
      alerts.push({
        type: "RISK_SIGNALS_FLAGGED",
        message: `${affiliateMetricsCounters.affiliate_risk_flagged} unreviewed affiliate risk events flagged`,
        severity: "MEDIUM",
      });
    }

    return {
      hasAlerts: alerts.length > 0,
      alerts,
    };
  }

  static async runReconciliationScheduler(options: { dryRun?: boolean } = { dryRun: true }) {
    const result = await AffiliateService.reconcileCommissions(options);
    if (result.missing > 0 || result.duplicates > 0) {
      logAffiliateMetric("affiliate_risk_flagged", {
        type: "RECONCILIATION_ALERT",
        missing: result.missing,
        duplicates: result.duplicates,
      });
      SuspiciousActivityService.createAlert({
        userId: "system",
        type: "REFERRAL_VELOCITY",
        severity: "HIGH",
        score: 90,
        reason: `Reconciliation found ${result.missing} missing and ${result.duplicates} duplicate commissions`,
        referenceType: "SYSTEM",
        referenceId: "affiliate-reconcile",
        metadata: { missing: result.missing, duplicates: result.duplicates, dryRun: options.dryRun },
      });
    }
    return result;
  }
}
