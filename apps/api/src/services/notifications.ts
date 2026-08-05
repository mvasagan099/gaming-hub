import { prisma, Prisma } from "@gaming-hub/db";
import type { NotificationType } from "@gaming-hub/shared";

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  return prisma.appNotification.create({
    data: {
      userId,
      type,
      title,
      body,
      data: (data ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function listNotifications(userId: string, page: number, pageSize: number) {
  const [items, total] = await Promise.all([
    prisma.appNotification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.appNotification.count({ where: { userId } }),
  ]);

  return {
    items: items.map((n) => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data as Record<string, unknown> | null,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  return prisma.appNotification.updateMany({
    where: { id: notificationId, userId },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string) {
  return prisma.appNotification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function countUnread(userId: string): Promise<number> {
  return prisma.appNotification.count({ where: { userId, readAt: null } });
}
