/**
 * Fair Play Manager
 * 
 * Implements AFK detection, rage quit detection, penalties,
 * and moderation systems.
 * 
 * Features:
 * - AFK detection with warnings
 * - Rage quit detection
 * - Penalty system with escalating consequences
 * - Appeal system
 * - Reputation tracking
 * - Report handling
 */

import { prisma } from "@gaming-hub/db";
import type { PenaltyType, PlayerPenalty, PlayerReputation } from "@gaming-hub/db";
import type { GameId } from "@gaming-hub/shared";

export interface AfkDetectionConfig {
  warningThresholdMs: number;
  penaltyThresholdMs: number;
}

export interface PenaltyConfig {
  type: PenaltyType;
  baseDuration: number;
  coinsPenalty: number;
  xpPenalty: number;
  escalationFactor: number;
}

export const AFK_CONFIG: AfkDetectionConfig = {
  warningThresholdMs: 45000,
  penaltyThresholdMs: 60000,
};

export const PENALTY_CONFIGS: Record<PenaltyType, PenaltyConfig> = {
  AFK_WARNING: {
    type: "AFK_WARNING",
    baseDuration: 0,
    coinsPenalty: 0,
    xpPenalty: 0,
    escalationFactor: 1,
  },
  AFK_PENALTY: {
    type: "AFK_PENALTY",
    baseDuration: 60,
    coinsPenalty: 100,
    xpPenalty: 50,
    escalationFactor: 1.5,
  },
  RAGE_QUIT: {
    type: "RAGE_QUIT",
    baseDuration: 120,
    coinsPenalty: 200,
    xpPenalty: 100,
    escalationFactor: 2,
  },
  DISCONNECT_TIMEOUT: {
    type: "DISCONNECT_TIMEOUT",
    baseDuration: 90,
    coinsPenalty: 150,
    xpPenalty: 75,
    escalationFactor: 1.75,
  },
  CHEATING: {
    type: "CHEATING",
    baseDuration: 10080,
    coinsPenalty: 1000,
    xpPenalty: 500,
    escalationFactor: 3,
  },
  ABUSE: {
    type: "ABUSE",
    baseDuration: 1440,
    coinsPenalty: 500,
    xpPenalty: 250,
    escalationFactor: 2.5,
  },
  SPAMMING: {
    type: "SPAMMING",
    baseDuration: 30,
    coinsPenalty: 50,
    xpPenalty: 25,
    escalationFactor: 1.25,
  },
  UNSPORTSMANLIKE_CONDUCT: {
    type: "UNSPORTSMANLIKE_CONDUCT",
    baseDuration: 360,
    coinsPenalty: 300,
    xpPenalty: 150,
    escalationFactor: 2,
  },
};

export class FairPlayManager {
  private readonly afkTimers = new Map<string, NodeJS.Timeout>();
  private readonly afkWarnings = new Map<string, number>();

  async initialize(): Promise<void> {
    console.log("[FairPlayManager] Initialized");
  }

  async shutdown(): Promise<void> {
    for (const timer of this.afkTimers.values()) {
      clearTimeout(timer);
    }
    this.afkTimers.clear();
    this.afkWarnings.clear();
  }

  async startAfkMonitoring(userId: string, matchId: string): Promise<void> {
    const key = `${userId}:${matchId}`;
    this.clearAfkTimer(key);

    this.afkTimers.set(
      key,
      setTimeout(() => {
        this.handleAfkWarning(userId, matchId);
      }, AFK_CONFIG.warningThresholdMs)
    );
  }

  async stopAfkMonitoring(userId: string, matchId: string): Promise<void> {
    const key = `${userId}:${matchId}`;
    this.clearAfkTimer(key);
    this.afkWarnings.delete(key);
  }

  async recordPlayerActivity(userId: string, matchId: string): Promise<void> {
    const key = `${userId}:${matchId}`;
    this.clearAfkTimer(key);
    this.afkWarnings.delete(key);

    await this.startAfkMonitoring(userId, matchId);
  }

  private clearAfkTimer(key: string): void {
    const timer = this.afkTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.afkTimers.delete(key);
    }
  }

  private async handleAfkWarning(userId: string, matchId: string): Promise<void> {
    const key = `${userId}:${matchId}`;
    const warningCount = this.afkWarnings.get(key) ?? 0;

    if (warningCount === 0) {
      this.afkWarnings.set(key, 1);

      await this.sendAfkWarningNotification(userId, matchId);

      this.afkTimers.set(
        key,
        setTimeout(() => {
          this.handleAfkPenalty(userId, matchId);
        }, AFK_CONFIG.penaltyThresholdMs - AFK_CONFIG.warningThresholdMs)
      );
    }
  }

  private async handleAfkPenalty(userId: string, matchId: string): Promise<void> {
    this.afkWarnings.delete(`${userId}:${matchId}`);

    await this.issuePenalty({
      userId,
      matchId,
      type: "AFK_PENALTY",
      reason: "Player was AFK for too long",
      detectionMethod: "automatic",
    });

    await this.updateReputation(userId, {
      afkCount: 1,
      gamesAbandoned: 1,
    });
  }

  async detectRageQuit(userId: string, matchId: string, matchDurationSec: number): Promise<boolean> {
    const RAGE_QUIT_THRESHOLD_SEC = 120;

    if (matchDurationSec < RAGE_QUIT_THRESHOLD_SEC) {
      await this.issuePenalty({
        userId,
        matchId,
        type: "RAGE_QUIT",
        reason: "Player disconnected early from match",
        detectionMethod: "automatic",
        detectionData: { matchDurationSec },
      });

      await this.updateReputation(userId, {
        rageQuitCount: 1,
        gamesAbandoned: 1,
      });

      return true;
    }

    return false;
  }

  async issuePenalty(options: {
    userId: string;
    matchId?: string;
    type: PenaltyType;
    reason: string;
    detectionMethod?: string;
    detectionData?: any;
    issuedBy?: string;
    notes?: string;
  }): Promise<PlayerPenalty> {
    const previousPenalties = await prisma.playerPenalty.count({
      where: {
        userId: options.userId,
        type: options.type,
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      },
    });

    const config = PENALTY_CONFIGS[options.type];
    const severity = Math.min(5, previousPenalties + 1);
    const duration = Math.floor(config.baseDuration * Math.pow(config.escalationFactor, severity - 1));
    const coinsPenalty = Math.floor(config.coinsPenalty * severity);
    const xpPenalty = Math.floor(config.xpPenalty * severity);

    const now = new Date();
    const expiresAt = duration > 0 ? new Date(now.getTime() + duration * 60 * 1000) : null;

    const penalty = await prisma.playerPenalty.create({
      data: {
        userId: options.userId,
        matchId: options.matchId ?? null,
        type: options.type,
        severity,
        status: "ACTIVE",
        duration,
        startedAt: now,
        expiresAt,
        coinsPenalty,
        xpPenalty,
        ratingPenalty: 0,
        detectionMethod: options.detectionMethod ?? "automatic",
        detectionData: options.detectionData ?? {},
        issuedBy: options.issuedBy ?? null,
        reason: options.reason,
        notes: options.notes ?? null,
      },
    });

    await this.sendPenaltyNotification(penalty);

    if (duration > 0) {
      setTimeout(() => {
        this.expirePenalty(penalty.id).catch(console.error);
      }, duration * 60 * 1000);
    }

    return penalty;
  }

  private async expirePenalty(penaltyId: string): Promise<void> {
    await prisma.playerPenalty.update({
      where: { id: penaltyId },
      data: { status: "EXPIRED" },
    });
  }

  async hasActivePenalty(userId: string): Promise<boolean> {
    const activePenalty = await prisma.playerPenalty.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });

    return activePenalty !== null;
  }

  async getActivePenalties(userId: string): Promise<PlayerPenalty[]> {
    return prisma.playerPenalty.findMany({
      where: {
        userId,
        status: "ACTIVE",
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async appealPenalty(
    penaltyId: string,
    userId: string,
    reason: string
  ): Promise<void> {
    await prisma.playerPenalty.update({
      where: { id: penaltyId, userId },
      data: {
        appealReason: reason,
        appealedAt: new Date(),
        appealStatus: "pending",
      },
    });

    await prisma.gameNotification.create({
      data: {
        userId,
        type: "PENALTY_RECEIVED",
        title: "Appeal Submitted",
        body: "Your penalty appeal has been submitted and is under review.",
        data: { penaltyId },
      },
    });
  }

  async resolveAppeal(
    penaltyId: string,
    approved: boolean,
    reviewedBy: string,
    resolution: string
  ): Promise<void> {
    const penalty = await prisma.playerPenalty.update({
      where: { id: penaltyId },
      data: {
        appealStatus: approved ? "approved" : "denied",
        appealResolvedAt: new Date(),
        status: approved ? "REVOKED" : "ACTIVE",
        notes: `Reviewed by ${reviewedBy}. Resolution: ${resolution}`,
      },
    });

    await prisma.gameNotification.create({
      data: {
        userId: penalty.userId,
        type: "APPEAL_RESOLVED",
        title: approved ? "Appeal Approved" : "Appeal Denied",
        body: approved
          ? "Your penalty appeal has been approved. The penalty has been revoked."
          : "Your penalty appeal has been denied.",
        data: { penaltyId, approved, resolution },
      },
    });
  }

  async getOrCreateReputation(userId: string): Promise<PlayerReputation> {
    let reputation = await prisma.playerReputation.findUnique({
      where: { userId },
    });

    if (!reputation) {
      reputation = await prisma.playerReputation.create({
        data: { userId },
      });
    }

    return reputation;
  }

  async updateReputation(
    userId: string,
    updates: Partial<{
      afkCount: number;
      rageQuitCount: number;
      gamesCompleted: number;
      gamesAbandoned: number;
      reportsReceived: number;
      complimentsReceived: number;
    }>
  ): Promise<PlayerReputation> {
    const reputation = await this.getOrCreateReputation(userId);

    const data: any = {};
    if (updates.afkCount) data.afkCount = reputation.afkCount + updates.afkCount;
    if (updates.rageQuitCount) data.rageQuitCount = reputation.rageQuitCount + updates.rageQuitCount;
    if (updates.gamesCompleted) data.gamesCompleted = reputation.gamesCompleted + updates.gamesCompleted;
    if (updates.gamesAbandoned) data.gamesAbandoned = reputation.gamesAbandoned + updates.gamesAbandoned;
    if (updates.reportsReceived) data.reportsReceived = reputation.reportsReceived + updates.reportsReceived;
    if (updates.complimentsReceived) data.complimentsReceived = reputation.complimentsReceived + updates.complimentsReceived;

    data.completionRate = data.gamesCompleted && data.gamesAbandoned
      ? (data.gamesCompleted / (data.gamesCompleted + data.gamesAbandoned)) * 100
      : reputation.completionRate;

    data.score = this.calculateReputationScore({
      ...reputation,
      ...data,
    });
    data.tier = this.getReputationTier(data.score);
    data.lastUpdated = new Date();

    return prisma.playerReputation.update({
      where: { userId },
      data,
    });
  }

  private calculateReputationScore(reputation: any): number {
    let score = 100.0;

    score -= reputation.afkCount * 5;
    score -= reputation.rageQuitCount * 10;
    score -= reputation.reportsValidated * 15;
    score += reputation.complimentsReceived * 2;

    score = Math.max(0, Math.min(100, score));

    return score;
  }

  private getReputationTier(score: number): string {
    if (score >= 95) return "Excellent";
    if (score >= 85) return "Good";
    if (score >= 70) return "Neutral";
    if (score >= 50) return "Poor";
    return "Toxic";
  }

  private async sendAfkWarningNotification(userId: string, matchId: string): Promise<void> {
    await prisma.gameNotification.create({
      data: {
        userId,
        type: "PENALTY_RECEIVED",
        title: "AFK Warning",
        body: "You have been inactive. Please return to the game or you will receive a penalty.",
        data: { matchId, type: "afk_warning" },
        expiresAt: new Date(Date.now() + 60000),
      },
    });
  }

  private async sendPenaltyNotification(penalty: PlayerPenalty): Promise<void> {
    await prisma.gameNotification.create({
      data: {
        userId: penalty.userId,
        type: "PENALTY_RECEIVED",
        title: `Penalty: ${penalty.type.replace(/_/g, " ")}`,
        body: penalty.reason,
        data: { penaltyId: penalty.id, type: penalty.type },
      },
    });
  }

  async reportPlayer(options: {
    reporterId: string;
    reportedUserId: string;
    matchId?: string;
    reason: string;
    category: string;
    description?: string;
    evidence?: any;
  }): Promise<void> {
    await prisma.playerReport.create({
      data: {
        reporterId: options.reporterId,
        reportedUserId: options.reportedUserId,
        matchId: options.matchId,
        reason: options.reason,
        category: options.category,
        description: options.description,
        evidence: options.evidence,
        status: "pending",
        contextData: options.matchId
          ? await this.getMatchContextForReport(options.matchId, options.reportedUserId)
          : undefined,
      },
    });

    await this.updateReputation(options.reportedUserId, {
      reportsReceived: 1,
    });
  }

  private async getMatchContextForReport(matchId: string, userId: string): Promise<any> {
    const stats = await prisma.matchStatistics.findUnique({
      where: { matchId },
    });

    return stats ?? {};
  }
}
