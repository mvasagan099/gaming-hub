import { prisma, Prisma, NotificationType } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { persistNotification } from './notificationIdentity';

export interface CreateFinancialNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  referenceType?: string;
  referenceId?: string;
  tournamentEventType?: string;
  data?: Record<string, unknown>;
}

export type NotificationListener = (payload: { userId: string; notification: unknown }) => void;

export class NotificationService {
  private static readonly listeners = new Set<NotificationListener>();

  /**
   * Register real-time socket/event listener
   */
  static registerListener(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 1. Idempotent Notification Creation
   */
  static async createNotification(input: CreateFinancialNotificationInput) {
    const identity = input.referenceId && input.referenceType
      ? JSON.stringify(['reference', input.userId, input.type, input.referenceId, input.tournamentEventType ?? null]) : undefined;
    const { notification: created, created: isNew } = await persistNotification({
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        referenceId: input.referenceId ?? null,
        tournamentEventType: input.tournamentEventType ?? null,
        data: input.data ? (input.data as Prisma.InputJsonValue) : Prisma.JsonNull,
    }, identity, identity ? { userId: input.userId, type: input.type, referenceId: input.referenceId, tournamentEventType: input.tournamentEventType ?? null } : undefined);

    // Dispatch to registered real-time listeners
    for (const listener of isNew ? this.listeners : []) {
      try {
        listener({ userId: input.userId, notification: created });
      } catch {
        // Listener failure is non-blocking
      }
    }

    return created;
  }

  /**
   * 2. Dedicated Financial Event: Entry Fee Paid
   */
  static async notifyEntryFee(userId: string, matchId: string, gameId: string, amount: number) {
    return this.createNotification({
      userId,
      type: "WALLET",
      title: "Game Entry Confirmed",
      body: `${amount} coins deducted for ${gameId.toUpperCase()} match.`,
      referenceType: "MATCH_WAGER",
      referenceId: matchId,
      data: { matchId, gameId, amount },
    });
  }

  /**
   * 3. Dedicated Financial Event: Match Winnings
   */
  static async notifyWinning(userId: string, matchId: string, gameId: string, amount: number) {
    return this.createNotification({
      userId,
      type: "MATCH_RESULT",
      title: "🏆 Victory!",
      body: `You won ${amount} coins in ${gameId.toUpperCase()}!`,
      referenceType: "MATCH_PAYOUT",
      referenceId: matchId,
      data: { matchId, gameId, amount },
    });
  }

  /**
   * 4. Dedicated Financial Event: Wager / Entry Refund
   */
  static async notifyRefund(userId: string, referenceId: string, referenceType: string, amount: number, reason?: string) {
    return this.createNotification({
      userId,
      type: "WALLET",
      title: "↩ Coins Refunded",
      body: `${amount} coins have been refunded${reason ? `: ${reason}` : "."}`,
      referenceType,
      referenceId,
      data: { referenceId, referenceType, amount, reason },
    });
  }

  /**
   * 5. Dedicated Event: Tournament Registration
   */
  static async notifyTournamentRegistration(userId: string, tournamentId: string, tournamentName: string, amount: number) {
    return this.createNotification({
      userId,
      type: "TOURNAMENT",
      title: "🎯 Tournament Registered",
      body: `You registered for ${tournamentName} (${amount} coins entry).`,
      referenceType: "TOURNAMENT_ENTRY",
      referenceId: tournamentId,
      tournamentEventType: "REGISTERED",
      data: { tournamentId, tournamentName, amount },
    });
  }

  /**
   * 6. Dedicated Financial Event: Tournament Prize
   */
  static async notifyTournamentPrize(userId: string, tournamentId: string, tournamentName: string, rank: number, amount: number) {
    return this.createNotification({
      userId,
      type: "TOURNAMENT",
      title: "🏆 Tournament Prize Awarded!",
      body: `Rank #${rank} in ${tournamentName}! Awarded ${amount} coins prize!`,
      referenceType: "TOURNAMENT_PRIZE",
      referenceId: tournamentId,
      tournamentEventType: "PRIZE_AWARDED",
      data: { tournamentId, tournamentName, rank, amount },
    });
  }

  /**
   * 7. Dedicated Financial Event: Admin Wallet Adjustment
   */
  static async notifyWalletAdjustment(userId: string, amount: number, isCredit: boolean, reason: string) {
    return this.createNotification({
      userId,
      type: "WALLET",
      title: isCredit ? "Admin Credit" : "Admin Debit",
      body: isCredit
        ? `An administrator credited ${amount} coins to your wallet. Reason: ${reason}`
        : `An administrator debited ${amount} coins from your wallet. Reason: ${reason}`,
      referenceType: "ADMIN_ADJUSTMENT",
      referenceId: `adj-${Date.now()}`,
      data: { amount, isCredit, reason },
    });
  }

  /**
   * 8. Dedicated Event: Match Outcome
   */
  static async notifyMatchOutcome(
    userId: string,
    matchId: string,
    gameId: string,
    outcome: "WIN" | "LOSS" | "DRAW" | "FORFEIT",
    payout?: number
  ) {
    let title = "Match Finished";
    let body = `Your ${gameId.toUpperCase()} match ended.`;

    if (outcome === "WIN") {
      title = "🏆 Match Victory!";
      body = `You won the ${gameId.toUpperCase()} match${payout ? ` and earned ${payout} coins` : ""}!`;
    } else if (outcome === "LOSS") {
      title = "Defeat";
      body = `Better luck next time in ${gameId.toUpperCase()}.`;
    } else if (outcome === "DRAW") {
      title = "Match Drawn";
      body = `Your ${gameId.toUpperCase()} match ended in a draw. Wagers refunded.`;
    } else if (outcome === "FORFEIT") {
      title = "Match Forfeit";
      body = `The ${gameId.toUpperCase()} match ended due to player timeout/forfeit.`;
    }

    return this.createNotification({
      userId,
      type: "MATCH_RESULT",
      title,
      body,
      referenceType: "MATCH_OUTCOME",
      referenceId: matchId,
      data: { matchId, gameId, outcome, payout },
    });
  }

  /**
   * 9. List User Notifications with Pagination
   */
  static async listUserNotifications(userId: string, page = 1, pageSize = 20, options?: { unreadOnly?: boolean }) {
    const where: Prisma.AppNotificationWhereInput = {
      userId,
      ...(options?.unreadOnly ? { readAt: null } : {}),
    };

    const [items, total, unreadCount] = await Promise.all([
      prisma.appNotification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.appNotification.count({ where }),
      prisma.appNotification.count({ where: { userId, readAt: null } }),
    ]);

    return {
      items,
      total,
      unreadCount,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * 10. Mark Notification as Read
   */
  static async markAsRead(userId: string, notificationId: string) {
    const notification = await prisma.appNotification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new AppError("NOT_FOUND", "Notification not found", 404);
    }

    if (notification.userId !== userId) {
      throw new AppError("FORBIDDEN", "Cannot modify another user's notification", 403);
    }

    return prisma.appNotification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  /**
   * 11. Mark All Notifications as Read for User
   */
  static async markAllAsRead(userId: string) {
    return prisma.appNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  /**
   * 12. Fast Unread Count
   */
  static async getUnreadCount(userId: string): Promise<number> {
    return prisma.appNotification.count({
      where: { userId, readAt: null },
    });
  }
}
