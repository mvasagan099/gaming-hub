/**
 * Notifications Service
 * 
 * Manages push notifications, email, SMS, and in-app notifications.
 */

import { EventEmitter } from "events";
import { Redis } from "ioredis";
import { Queue } from "bullmq";
import { prisma } from "@gaming-hub/db";
import type {
  NotificationChannel,
  NotificationTemplate,
  ScheduledNotification,
  PushSubscription,
  TargetAudience,
} from "../types";

export interface NotificationConfig {
  redis: Redis;
  firebase?: {
    projectId: string;
    privateKey: string;
    clientEmail: string;
  };
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
  };
  twilio?: {
    accountSid: string;
    authToken: string;
    fromNumber: string;
  };
  vapid?: {
    publicKey: string;
    privateKey: string;
  };
}

export class NotificationService extends EventEmitter {
  private redis: Redis;
  private notificationQueue: Queue;
  private channels = new Map<string, NotificationChannel>();

  constructor(config: NotificationConfig) {
    super();
    this.redis = config.redis;
    
    // Initialize notification queue
    this.notificationQueue = new Queue("notifications", {
      connection: config.redis,
    });

    this.initializeChannels(config);
  }

  private initializeChannels(config: NotificationConfig): void {
    // Initialize channels based on config
    if (config.firebase) {
      this.channels.set("push", {
        id: "push",
        name: "Push Notifications",
        type: "push",
        isActive: true,
        config: { type: "push", firebaseConfig: {} },
      });
    }

    if (config.smtp) {
      this.channels.set("email", {
        id: "email",
        name: "Email",
        type: "email",
        isActive: true,
        config: { type: "email", smtpConfig: {} },
      });
    }

    if (config.twilio) {
      this.channels.set("sms", {
        id: "sms",
        name: "SMS",
        type: "sms",
        isActive: true,
        config: { type: "sms", twilioConfig: {} },
      });
    }
  }

  // ============================================================================
  // Push Notifications
  // ============================================================================

  /**
   * Register push subscription
   */
  async registerPushSubscription(
    userId: string,
    subscription: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    },
    userAgent?: string
  ): Promise<void> {
    await prisma.pushSubscription.create({
      data: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent,
        createdAt: new Date(),
      },
    });

    this.emit("pushSubscriptionRegistered", { userId, subscription });
  }

  /**
   * Send push notification
   */
  async sendPushNotification(
    userId: string | string[],
    payload: {
      title: string;
      body: string;
      icon?: string;
      image?: string;
      badge?: string;
      data?: Record<string, unknown>;
      actions?: Array<{ action: string; title: string; icon?: string }>;
    }
  ): Promise<{ success: number; failed: number }> {
    const userIds = Array.isArray(userId) ? userId : [userId];
    let success = 0;
    let failed = 0;

    for (const uid of userIds) {
      const subscriptions = await prisma.pushSubscription.findMany({
        where: { userId: uid },
      });

      for (const sub of subscriptions) {
        try {
          // Send push via FCM
          // In real implementation, this would use firebase-admin
          // await admin.messaging().send({...})
          
          // For now, queue the notification
          await this.notificationQueue.add("push", {
            userId: uid,
            subscription: sub,
            payload,
          });

          success++;
        } catch (error) {
          failed++;
          // Remove invalid subscription
          if ((error as { code?: string }).code === "messaging/registration-token-not-registered") {
            await prisma.pushSubscription.delete({
              where: { id: sub.id },
            });
          }
        }
      }
    }

    return { success, failed };
  }

  /**
   * Send push to topic
   */
  async sendPushToTopic(
    topic: string,
    payload: {
      title: string;
      body: string;
      data?: Record<string, unknown>;
    }
  ): Promise<void> {
    await this.notificationQueue.add("push-topic", {
      topic,
      payload,
    });
  }

  // ============================================================================
  // Email Notifications
  // ============================================================================

  /**
   * Send email
   */
  async sendEmail(
    to: string | string[],
    template: string,
    data: Record<string, unknown>
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const templateConfig = await prisma.notificationTemplate.findUnique({
      where: { name: template },
    }) as unknown as NotificationTemplate | null;

    if (!templateConfig) {
      return { success: false, error: "Template not found" };
    }

    // Queue email job
    await this.notificationQueue.add("email", {
      to: Array.isArray(to) ? to : [to],
      subject: templateConfig.subject,
      body: this.interpolateTemplate(templateConfig.body, data),
    });

    return { success: true };
  }

  /**
   * Send transactional email
   */
  async sendTransactionalEmail(
    userId: string,
    type: "welcome" | "password_reset" | "verify_email" | "match_result" | "reward",
    data: Record<string, unknown>
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user?.email) return;

    await this.sendEmail(user.email, `email_${type}`, {
      ...data,
      username: user.username,
    });
  }

  // ============================================================================
  // SMS Notifications
  // ============================================================================

  /**
   * Send SMS
   */
  async sendSMS(
    phoneNumber: string,
    message: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.channels.has("sms")) {
      return { success: false, error: "SMS not configured" };
    }

    await this.notificationQueue.add("sms", {
      to: phoneNumber,
      message,
    });

    return { success: true };
  }

  /**
   * Send verification code via SMS
   */
  async sendVerificationCode(
    phoneNumber: string,
    code: string
  ): Promise<void> {
    await this.sendSMS(
      phoneNumber,
      `Your Gaming Hub verification code is: ${code}`
    );
  }

  // ============================================================================
  // In-App Notifications
  // ============================================================================

  /**
   * Send in-app notification
   */
  async sendInApp(
    userId: string,
    notification: {
      type: string;
      title: string;
      body: string;
      data?: Record<string, unknown>;
    }
  ): Promise<void> {
    await prisma.appNotification.create({
      data: {
        userId,
        type: notification.type as import("@gaming-hub/db").NotificationType,
        title: notification.title,
        body: notification.body,
        data: notification.data as object,
        createdAt: new Date(),
      },
    });

    // Emit real-time event
    this.emit("inAppNotification", { userId, notification });
  }

  /**
   * Send bulk in-app notifications
   */
  async sendBulkInApp(
    userIds: string[],
    notification: {
      type: string;
      title: string;
      body: string;
      data?: Record<string, unknown>;
    }
  ): Promise<void> {
    await prisma.appNotification.createMany({
      data: userIds.map(userId => ({
        userId,
        type: notification.type as import("@gaming-hub/db").NotificationType,
        title: notification.title,
        body: notification.body,
        data: notification.data as object,
        createdAt: new Date(),
      })),
    });

    // Emit for each user
    for (const userId of userIds) {
      this.emit("inAppNotification", { userId, notification });
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    await prisma.appNotification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  /**
   * Get user's notifications
   */
  async getUserNotifications(
    userId: string,
    options?: { unreadOnly?: boolean; limit?: number; offset?: number }
  ): Promise<Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    read: boolean;
    createdAt: Date;
  }>> {
    const notifications = await prisma.appNotification.findMany({
      where: {
        userId,
        ...(options?.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });

    return notifications.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data as Record<string, unknown> | undefined,
      read: !!n.readAt,
      createdAt: n.createdAt,
    }));
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return prisma.appNotification.count({
      where: {
        userId,
        readAt: null,
      },
    });
  }

  // ============================================================================
  // Scheduled Notifications
  // ============================================================================

  /**
   * Schedule notification
   */
  async scheduleNotification(
    notification: Partial<ScheduledNotification>
  ): Promise<ScheduledNotification> {
    const created = await prisma.scheduledNotification.create({
      data: {
        templateId: notification.templateId!,
        userIds: notification.userIds as string[],
        targetAudience: notification.targetAudience as object,
        scheduledAt: notification.scheduledAt!,
        status: "scheduled",
        createdBy: notification.createdBy!,
      },
    }) as unknown as ScheduledNotification;

    // Schedule job
    const delay = notification.scheduledAt!.getTime() - Date.now();
    await this.notificationQueue.add(
      "scheduled",
      { notificationId: created.id },
      { delay: Math.max(0, delay) }
    );

    return created;
  }

  /**
   * Cancel scheduled notification
   */
  async cancelScheduledNotification(notificationId: string): Promise<void> {
    await prisma.scheduledNotification.update({
      where: { id: notificationId },
      data: { status: "cancelled" },
    });

    // Remove from queue if possible
    // This requires tracking job IDs
  }

  // ============================================================================
  // Tournament Notifications
  // ============================================================================

  /**
   * Notify tournament participants
   */
  async notifyTournamentParticipants(
    tournamentId: string,
    message: {
      title: string;
      body: string;
      actionUrl?: string;
    }
  ): Promise<void> {
    const participants = await prisma.tournamentPlayer.findMany({
      where: { tournamentId },
      select: { userId: true },
    });

    const userIds = participants.map(p => p.userId);

    await this.sendBulkInApp(userIds, {
      type: "TOURNAMENT",
      title: message.title,
      body: message.body,
      data: { tournamentId, actionUrl: message.actionUrl },
    });

    // Also send push notifications
    await this.sendPushNotification(userIds, {
      title: message.title,
      body: message.body,
      data: { tournamentId, actionUrl: message.actionUrl },
    });
  }

  /**
   * Notify tournament results
   */
  async notifyTournamentResults(
    tournamentId: string,
    results: Array<{ userId: string; position: number; prize: number }>
  ): Promise<void> {
    for (const result of results) {
      const title = result.position === 1
        ? "🏆 Tournament Winner!"
        : result.position <= 3
        ? "🎉 Top 3 Finish!"
        : "Tournament Complete";

      await this.sendInApp(result.userId, {
        type: "TOURNAMENT",
        title,
        body: `You finished #${result.position} and won ${result.prize} coins!`,
        data: { tournamentId, position: result.position, prize: result.prize },
      });
    }
  }

  // ============================================================================
  // Friend Activity Notifications
  // ============================================================================

  /**
   * Notify friend request
   */
  async notifyFriendRequest(
    recipientId: string,
    senderName: string,
    senderId: string
  ): Promise<void> {
    await this.sendInApp(recipientId, {
      type: "FRIEND_REQUEST",
      title: "New Friend Request",
      body: `${senderName} sent you a friend request`,
      data: { senderId },
    });

    await this.sendPushNotification(recipientId, {
      title: "New Friend Request",
      body: `${senderName} sent you a friend request`,
    });
  }

  /**
   * Notify friend activity
   */
  async notifyFriendActivity(
    friendId: string,
    activity: {
      type: "online" | "playing" | "won_match" | "achieved";
      gameId?: string;
      details?: string;
    }
  ): Promise<void> {
    const title = "Friend Activity";
    const body = this.getActivityMessage(activity);

    await this.sendInApp(friendId, {
      type: "FRIEND",
      title,
      body,
      data: activity,
    });
  }

  private getActivityMessage(activity: {
    type: string;
    gameId?: string;
    details?: string;
  }): string {
    switch (activity.type) {
      case "online":
        return "A friend is now online";
      case "playing":
        return `A friend is playing ${activity.gameId}`;
      case "won_match":
        return "A friend won a match!";
      case "achieved":
        return `A friend ${activity.details}`;
      default:
        return "Friend activity update";
    }
  }

  // ============================================================================
  // Admin Broadcasts
  // ============================================================================

  /**
   * Send admin broadcast
   */
  async sendAdminBroadcast(
    broadcast: {
      title: string;
      body: string;
      targetAudience?: TargetAudience;
      channels: Array<"push" | "email" | "sms" | "in_app">;
    },
    adminId: string
  ): Promise<void> {
    // Get target users
    const users = await this.getTargetUsers(broadcast.targetAudience);

    for (const channel of broadcast.channels) {
      switch (channel) {
        case "push":
          await this.sendPushNotification(
            users.map(u => u.id),
            { title: broadcast.title, body: broadcast.body }
          );
          break;
        case "in_app":
          await this.sendBulkInApp(
            users.map(u => u.id),
            {
              type: "SYSTEM",
              title: broadcast.title,
              body: broadcast.body,
            }
          );
          break;
        case "email":
          // Send emails
          break;
        case "sms":
          // Send SMS
          break;
      }
    }

    this.emit("adminBroadcast", { adminId, broadcast });
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private interpolateTemplate(
    template: string,
    data: Record<string, unknown>
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = data[key];
      return value !== undefined ? String(value) : match;
    });
  }

  private async getTargetUsers(
    audience?: TargetAudience
  ): Promise<Array<{ id: string; email?: string | null }>> {
    if (!audience) {
      return prisma.user.findMany({
        select: { id: true, email: true },
      });
    }

    // Build query based on audience
    const where: Record<string, unknown> = {};
    
    if (audience.userRoles?.length) {
      where.role = { in: audience.userRoles };
    }

    if (audience.countries?.length) {
      where.profile = { country: { in: audience.countries } };
    }

    return prisma.user.findMany({
      where,
      select: { id: true, email: true },
    });
  }
}
