import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { audit } from "./audit";

export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AlertStatus = "OPEN" | "REVIEWING" | "RESOLVED" | "DISMISSED";
export type AlertType =
  | "TRANSACTION_VELOCITY"
  | "EXCESSIVE_REFUNDS"
  | "RAPID_MATCH_COMPLETION"
  | "COLLUSION_SUSPICION"
  | "UNUSUAL_ADMIN_ADJUSTMENT"
  | "DUPLICATE_REQUEST_FLOOD"
  | "WALLET_ANOMALY"
  | "REFERRAL_ABUSE"
  | "REFERRAL_VELOCITY";

export interface SuspiciousAlert {
  id: string;
  userId: string;
  type: AlertType;
  severity: AlertSeverity;
  score: number;
  status: AlertStatus;
  reason: string;
  referenceType?: string;
  referenceId?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  adminNotes?: string;
}

export interface CreateAlertParams {
  userId: string;
  type: AlertType;
  severity: AlertSeverity;
  score: number;
  reason: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
}

export interface ListAlertsFilter {
  userId?: string;
  type?: AlertType;
  severity?: AlertSeverity;
  status?: AlertStatus;
}

export class SuspiciousActivityService {
  private static alerts = new Map<string, SuspiciousAlert>();
  private static recentAlertDedup = new Map<string, number>();

  // Deduplication window: 10 minutes
  private static readonly DEDUP_COOLDOWN_MS = 10 * 60 * 1000;

  /**
   * 1. Create or deduplicate a security alert
   */
  static async createAlert(params: CreateAlertParams): Promise<SuspiciousAlert | null> {
    const dedupKey = `${params.userId}:${params.type}:${params.referenceId ?? "global"}`;
    const now = Date.now();
    const lastAlertTime = this.recentAlertDedup.get(dedupKey);

    if (lastAlertTime && now - lastAlertTime < this.DEDUP_COOLDOWN_MS) {
      // Deduplicated within cooldown
      return null;
    }

    const alertId = `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const alert: SuspiciousAlert = {
      id: alertId,
      userId: params.userId,
      type: params.type,
      severity: params.severity,
      score: params.score,
      status: "OPEN",
      reason: params.reason,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      metadata: params.metadata ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.alerts.set(alertId, alert);
    this.recentAlertDedup.set(dedupKey, now);

    audit({
      actorType: "system",
      action: "security.alert_created",
      category: "security",
      targetType: "user",
      targetId: params.userId,
      meta: {
        alertId,
        type: params.type,
        severity: params.severity,
        score: params.score,
        reason: params.reason,
      },
    });

    return alert;
  }

  /**
   * 2. Anomaly Detector: Transaction Velocity (> 10 transactions in 5 minutes)
   */
  static async detectTransactionVelocity(userId: string, threshold = 10): Promise<SuspiciousAlert | null> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const count = await prisma.transaction.count({
      where: {
        userId,
        createdAt: { gte: fiveMinutesAgo },
      },
    });

    if (count >= threshold) {
      return this.createAlert({
        userId,
        type: "TRANSACTION_VELOCITY",
        severity: count >= threshold * 2 ? "CRITICAL" : "HIGH",
        score: Math.min(100, count * 5),
        reason: `Unusually high transaction velocity: ${count} transactions in last 5 minutes (threshold: ${threshold})`,
        metadata: { count, threshold, windowSeconds: 300 },
      });
    }

    return null;
  }

  /**
   * 3. Anomaly Detector: Excessive Refunds (> 3 refunds in 15 minutes)
   */
  static async detectExcessiveRefunds(userId: string, threshold = 3): Promise<SuspiciousAlert | null> {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const count = await prisma.transaction.count({
      where: {
        userId,
        type: "CREDIT",
        referenceType: "WAGER_REFUND",
        createdAt: { gte: fifteenMinutesAgo },
      },
    });

    if (count >= threshold) {
      return this.createAlert({
        userId,
        type: "EXCESSIVE_REFUNDS",
        severity: count >= threshold * 2 ? "CRITICAL" : "HIGH",
        score: Math.min(100, count * 15),
        reason: `Excessive refunds detected: ${count} refunds in last 15 minutes (threshold: ${threshold})`,
        metadata: { count, threshold, windowSeconds: 900 },
      });
    }

    return null;
  }

  /**
   * 4. Anomaly Detector: Collusion / Same Opponent Win Streak (> 3 consecutive wins against same player)
   */
  static async detectCollusionPattern(
    userId: string,
    opponentId: string,
    threshold = 3
  ): Promise<SuspiciousAlert | null> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Find recent matches involving both players where userId won
    const matches = await prisma.match.findMany({
      where: {
        createdAt: { gte: oneHourAgo },
        status: "FINISHED",
        stake: { gt: 0 },
        AND: [
          { players: { some: { userId, result: "WIN" } } },
          { players: { some: { userId: opponentId, result: "LOSS" } } },
        ],
      },
      take: 10,
    });

    if (matches.length >= threshold) {
      return this.createAlert({
        userId,
        type: "COLLUSION_SUSPICION",
        severity: matches.length >= threshold * 2 ? "CRITICAL" : "MEDIUM",
        score: Math.min(100, matches.length * 20),
        reason: `Repeated winning pattern: ${matches.length} consecutive paid wins against same opponent (${opponentId}) in 1 hour`,
        referenceType: "USER",
        referenceId: opponentId,
        metadata: { opponentId, winCount: matches.length, threshold },
      });
    }

    return null;
  }

  /**
   * 5. Anomaly Detector: Rapid Match Completion with Stake (< 5 seconds)
   */
  static async detectRapidMatchCompletion(
    matchId: string,
    durationSeconds: number,
    stake: number,
    winnerUserId: string
  ): Promise<SuspiciousAlert | null> {
    if (stake > 0 && durationSeconds < 5) {
      return this.createAlert({
        userId: winnerUserId,
        type: "RAPID_MATCH_COMPLETION",
        severity: "HIGH",
        score: 85,
        reason: `Match ended in ${durationSeconds}s with a stake of ${stake} coins (minimum expected: 5s)`,
        referenceType: "MATCH",
        referenceId: matchId,
        metadata: { matchId, durationSeconds, stake },
      });
    }

    return null;
  }

  /**
   * 6. Anomaly Detector: Abnormal Admin Manual Adjustments (> 50,000 coins)
   */
  static async detectAbnormalAdminAdjustment(
    adminId: string,
    targetUserId: string,
    amount: number,
    threshold = 50_000
  ): Promise<SuspiciousAlert | null> {
    if (Math.abs(amount) >= threshold) {
      return this.createAlert({
        userId: targetUserId,
        type: "UNUSUAL_ADMIN_ADJUSTMENT",
        severity: Math.abs(amount) >= threshold * 2 ? "CRITICAL" : "HIGH",
        score: 90,
        reason: `Large manual adjustment of ${amount} coins performed by admin (${adminId})`,
        referenceType: "ADMIN",
        referenceId: adminId,
        metadata: { adminId, targetUserId, amount, threshold },
      });
    }

    return null;
  }

  /**
   * 7. List Security Alerts with Filters and Pagination
   */
  static async listAlerts(filter: ListAlertsFilter = {}, page = 1, pageSize = 20) {
    let items = Array.from(this.alerts.values());

    if (filter.userId) {
      items = items.filter((a) => a.userId === filter.userId);
    }
    if (filter.type) {
      items = items.filter((a) => a.type === filter.type);
    }
    if (filter.severity) {
      items = items.filter((a) => a.severity === filter.severity);
    }
    if (filter.status) {
      items = items.filter((a) => a.status === filter.status);
    }

    // Sort newest first
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = items.length;
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = items.slice(startIndex, startIndex + pageSize);

    return {
      items: paginatedItems,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * 8. Get Alert Details with Context
   */
  static async getAlertDetails(alertId: string) {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new AppError("NOT_FOUND", `Alert ${alertId} not found`, 404);
    }

    // Related user transactions
    const relatedTransactions = await prisma.transaction.findMany({
      where: { userId: alert.userId },
      take: 10,
      orderBy: { createdAt: "desc" },
    });

    // Related user matches
    const relatedMatches = await prisma.match.findMany({
      where: { players: { some: { userId: alert.userId } } },
      take: 10,
      orderBy: { createdAt: "desc" },
    });

    // Prior alerts for this user
    const priorAlerts = Array.from(this.alerts.values())
      .filter((a) => a.userId === alert.userId && a.id !== alertId)
      .slice(0, 5);

    return {
      alert,
      relatedTransactions,
      relatedMatches,
      priorAlerts,
    };
  }

  /**
   * 9. Update Alert Status and Admin Review Notes
   */
  static async updateAlert(
    alertId: string,
    update: { status?: AlertStatus; adminNotes?: string; reviewedBy?: string }
  ) {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new AppError("NOT_FOUND", `Alert ${alertId} not found`, 404);
    }

    if (update.status) {
      alert.status = update.status;
      alert.reviewedAt = new Date();
      if (update.reviewedBy) alert.reviewedBy = update.reviewedBy;
    }
    if (update.adminNotes !== undefined) {
      alert.adminNotes = update.adminNotes;
    }
    alert.updatedAt = new Date();
    this.alerts.set(alertId, alert);

    audit({
      actorType: "user",
      actorId: update.reviewedBy,
      action: "security.alert_reviewed",
      category: "security",
      targetType: "alert",
      targetId: alertId,
      meta: {
        status: alert.status,
        adminNotes: alert.adminNotes,
      },
    });

    return alert;
  }

  /**
   * Helper: Clear in-memory alert store (for testing)
   */
  static resetForTesting(): void {
    this.alerts.clear();
    this.recentAlertDedup.clear();
  }
}
