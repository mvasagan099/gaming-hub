import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@gaming-hub/db";
import { NotificationService } from "../notificationService";

describe("Feature 27: Transaction / Wallet Notification System", () => {
  const createdUserIds: string[] = [];
  const createdNotificationIds: string[] = [];

  async function createTestUser(prefix: string, balance = 1000) {
    const userId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    createdUserIds.push(userId);

    await prisma.user.create({
      data: {
        id: userId,
        username: `u_${userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`,
        displayName: `User ${userId.slice(0, 8)}`,
        email: `${userId}@test.com`,
        wallet: {
          create: { balance },
        },
        profile: {
          create: {},
        },
      },
    });

    return userId;
  }

  afterEach(async () => {
    if (createdNotificationIds.length > 0) {
      await prisma.appNotification.deleteMany({
        where: { id: { in: createdNotificationIds } },
      }).catch(() => undefined);
      createdNotificationIds.length = 0;
    }

    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => undefined);
      createdUserIds.length = 0;
    }
  });

  // ---------------------------------------------------------------------------
  // 1. Winning Notification
  // ---------------------------------------------------------------------------
  it("1. Winning notification: creates MATCH_RESULT notification with accurate prize", async () => {
    const user = await createTestUser("u-notif-1", 1000);

    const notif = await NotificationService.notifyWinning(user, "match-w-1", "chess", 180);
    createdNotificationIds.push(notif.id);

    expect(notif.userId).toBe(user);
    expect(notif.type).toBe("MATCH_RESULT");
    expect(notif.title).toContain("Victory");
    expect(notif.body).toContain("180 coins");
    expect(notif.readAt).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 2. Entry Fee Paid Notification
  // ---------------------------------------------------------------------------
  it("2. Entry fee notification: creates WALLET notification with deducted fee", async () => {
    const user = await createTestUser("u-notif-2", 1000);

    const notif = await NotificationService.notifyEntryFee(user, "match-e-2", "carrom", 100);
    createdNotificationIds.push(notif.id);

    expect(notif.userId).toBe(user);
    expect(notif.type).toBe("WALLET");
    expect(notif.body).toContain("100 coins deducted");
  });

  // ---------------------------------------------------------------------------
  // 3. Refund Notification
  // ---------------------------------------------------------------------------
  it("3. Refund notification: creates WALLET notification with returned coins", async () => {
    const user = await createTestUser("u-notif-3", 1000);

    const notif = await NotificationService.notifyRefund(user, "match-r-3", "WAGER_REFUND", 100, "Match cancelled due to opponent forfeit");
    createdNotificationIds.push(notif.id);

    expect(notif.userId).toBe(user);
    expect(notif.type).toBe("WALLET");
    expect(notif.body).toContain("100 coins have been refunded");
    expect(notif.body).toContain("Match cancelled");
  });

  // ---------------------------------------------------------------------------
  // 4. Tournament Registration & Prize Notifications
  // ---------------------------------------------------------------------------
  it("4. Tournament notifications: creates registration and rank prize notifications", async () => {
    const user = await createTestUser("u-notif-4", 1000);

    // 1. Registration
    const regNotif = await NotificationService.notifyTournamentRegistration(user, "tourn-4", "Summer Cup", 250);
    createdNotificationIds.push(regNotif.id);
    expect(regNotif.type).toBe("TOURNAMENT");
    expect(regNotif.body).toContain("250 coins entry");

    // 2. Prize
    const prizeNotif = await NotificationService.notifyTournamentPrize(user, "tourn-4", "Summer Cup", 1, 2000);
    createdNotificationIds.push(prizeNotif.id);
    expect(prizeNotif.type).toBe("TOURNAMENT");
    expect(prizeNotif.body).toContain("Rank #1");
    expect(prizeNotif.body).toContain("2000 coins prize");
  });

  // ---------------------------------------------------------------------------
  // 5. Admin Wallet Adjustment Notification
  // ---------------------------------------------------------------------------
  it("5. Admin adjustment notification: creates notification with admin reason", async () => {
    const user = await createTestUser("u-notif-5", 1000);

    const notif = await NotificationService.notifyWalletAdjustment(user, 500, true, "Tournament server compensation");
    createdNotificationIds.push(notif.id);

    expect(notif.type).toBe("WALLET");
    expect(notif.title).toContain("Admin Credit");
    expect(notif.body).toContain("500 coins");
    expect(notif.body).toContain("Tournament server compensation");
  });

  // ---------------------------------------------------------------------------
  // 6. Match Outcome Event Notification
  // ---------------------------------------------------------------------------
  it("6. Match outcome: creates notifications for WIN, LOSS, and DRAW", async () => {
    const user = await createTestUser("u-notif-6", 1000);

    const drawNotif = await NotificationService.notifyMatchOutcome(user, "match-6-d", "table-tennis", "DRAW");
    createdNotificationIds.push(drawNotif.id);
    expect(drawNotif.title).toContain("Match Drawn");

    const lossNotif = await NotificationService.notifyMatchOutcome(user, "match-6-l", "table-tennis", "LOSS");
    createdNotificationIds.push(lossNotif.id);
    expect(lossNotif.title).toContain("Defeat");
  });

  // ---------------------------------------------------------------------------
  // 7. Idempotent Deduplication
  // ---------------------------------------------------------------------------
  it("7. Idempotency: repeated settlement/refund calls return existing notification without duplicates", async () => {
    const user = await createTestUser("u-notif-7", 1000);

    const notif1 = await NotificationService.notifyWinning(user, "match-dup-7", "chess", 180);
    const notif2 = await NotificationService.notifyWinning(user, "match-dup-7", "chess", 180);
    createdNotificationIds.push(notif1.id);

    expect(notif1.id).toBe(notif2.id);

    const all = await prisma.appNotification.findMany({
      where: { userId: user, referenceId: "match-dup-7" },
    });
    expect(all.length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 8. Read Workflow and Unread Count
  // ---------------------------------------------------------------------------
  it("8. Read workflow: lists notifications, increments unread count, and marks as read", async () => {
    const user = await createTestUser("u-notif-8", 1000);

    const n1 = await NotificationService.notifyEntryFee(user, "m-8-1", "ludo", 50);
    const n2 = await NotificationService.notifyWinning(user, "m-8-2", "ludo", 90);
    createdNotificationIds.push(n1.id, n2.id);

    // Initial unread count = 2
    expect(await NotificationService.getUnreadCount(user)).toBe(2);

    // Mark 1 as read
    await NotificationService.markAsRead(user, n1.id);
    expect(await NotificationService.getUnreadCount(user)).toBe(1);

    // Mark all as read
    await NotificationService.markAllAsRead(user);
    expect(await NotificationService.getUnreadCount(user)).toBe(0);

    // List notifications
    const list = await NotificationService.listUserNotifications(user, 1, 10);
    expect(list.total).toBe(2);
    expect(list.unreadCount).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 9. User Boundary Isolation
  // ---------------------------------------------------------------------------
  it("9. User isolation: user A cannot mark as read user B's notification", async () => {
    const userA = await createTestUser("u-notif-9-a", 1000);
    const userB = await createTestUser("u-notif-9-b", 1000);

    const notifB = await NotificationService.notifyEntryFee(userB, "m-9-b", "chess", 100);
    createdNotificationIds.push(notifB.id);

    await expect(NotificationService.markAsRead(userA, notifB.id)).rejects.toThrow(/Cannot modify another user's notification/i);
  });
});
