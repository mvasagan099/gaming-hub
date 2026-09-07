import { prisma, Prisma } from "@gaming-hub/db";
import type { NotificationType } from "@gaming-hub/shared";

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  options?: {
    eventId?: string;
    referenceId?: string;
    tournamentEventType?: string;
  },
) {
  // Deduplication check: prevent duplicate notifications for same eventId or referenceId
  if (options?.eventId) {
    const existing = await prisma.appNotification.findFirst({
      where: {
        userId,
        data: {
          path: ["eventId"],
          equals: options.eventId,
        },
      },
    });
    if (existing) {
      return existing;
    }
  } else if (options?.referenceId) {
    const existing = await prisma.appNotification.findFirst({
      where: {
        userId,
        type,
        referenceId: options.referenceId,
      },
    });
    if (existing) {
      return existing;
    }
  }

  const mergedData = {
    ...(data ?? {}),
    ...(options?.eventId ? { eventId: options.eventId } : {}),
  };

  return prisma.appNotification.create({
    data: {
      userId,
      type,
      title,
      body,
      data: Object.keys(mergedData).length > 0 ? (mergedData as Prisma.InputJsonValue) : undefined,
      referenceId: options?.referenceId,
      tournamentEventType: options?.tournamentEventType,
    },
  });
}

export async function listNotifications(
  userId: string,
  page: number,
  pageSize: number,
  options?: { unreadOnly?: boolean },
) {
  const where: Prisma.AppNotificationWhereInput = {
    userId,
    ...(options?.unreadOnly ? { readAt: null } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.appNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.appNotification.count({ where }),
  ]);

  return {
    items: items.map((n) => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data as Record<string, unknown> | null,
      tournamentEventType: n.tournamentEventType ?? null,
      referenceId: n.referenceId ?? null,
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

export async function deleteNotification(userId: string, notificationId: string) {
  return prisma.appNotification.deleteMany({
    where: { id: notificationId, userId },
  });
}

export async function deleteAllNotifications(userId: string) {
  return prisma.appNotification.deleteMany({
    where: { userId },
  });
}

export async function markNotificationsReadByType(
  userId: string,
  tournamentEventType: string,
  referenceId?: string,
) {
  const where: Prisma.AppNotificationWhereInput = {
    userId,
    tournamentEventType,
    ...(referenceId ? { referenceId } : {}),
  };
  return prisma.appNotification.updateMany({
    where,
    data: { readAt: new Date() },
  });
}

