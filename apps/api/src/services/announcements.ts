import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type { AnnouncementType } from "@gaming-hub/shared";
import { audit } from "./audit";

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  type: AnnouncementType;
  imageUrl?: string | null;
  targetRole?: string | null;
  startsAt?: string | null;
  expiresAt?: string | null;
}

/**
 * Lists announcements visible to the given user (role-filtered, time-windowed),
 * marking each with whether the user has read it.
 */
export async function listAnnouncements(userId: string, page: number, pageSize: number) {
  const now = new Date();
  const where = {
    OR: [{ startsAt: null }, { startsAt: { lte: now } }],
    AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }],
  };

  const [items, total] = await Promise.all([
    prisma.announcement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        reads: { where: { userId }, select: { userId: true } },
      },
    }),
    prisma.announcement.count({ where }),
  ]);

  return {
    items: items.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      type: a.type,
      imageUrl: a.imageUrl,
      targetRole: a.targetRole,
      startsAt: a.startsAt?.toISOString() ?? null,
      expiresAt: a.expiresAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      read: a.reads.length > 0,
    })),
    total,
    page,
    pageSize,
  };
}

export async function markAnnouncementRead(userId: string, announcementId: string) {
  const announcement = await prisma.announcement.findUnique({ where: { id: announcementId } });
  if (!announcement) throw new AppError("NOT_FOUND", "Announcement not found", 404);
  await prisma.announcementRead.upsert({
    where: { announcementId_userId: { announcementId, userId } },
    create: { announcementId, userId },
    update: {},
  });
  return { ok: true };
}

export async function countUnreadAnnouncements(userId: string): Promise<number> {
  const now = new Date();
  const announcements = await prisma.announcement.findMany({
    where: {
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }],
    },
    select: { id: true },
  });
  if (announcements.length === 0) return 0;

  const read = await prisma.announcementRead.count({
    where: { userId, announcementId: { in: announcements.map((a) => a.id) } },
  });
  return Math.max(0, announcements.length - read);
}

export async function createAnnouncement(input: CreateAnnouncementInput, createdBy: string | null) {
  const announcement = await prisma.announcement.create({
    data: {
      title: input.title,
      body: input.body,
      type: input.type,
      imageUrl: input.imageUrl ?? null,
      targetRole: input.targetRole ?? null,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdBy,
    },
  });

  audit({
    actorType: "user",
    actorId: createdBy,
    action: "admin.announcement.created",
    category: "admin",
    targetType: "announcement",
    targetId: announcement.id,
    meta: { title: announcement.title, type: announcement.type },
  });
  return announcement;
}

export async function updateAnnouncement(id: string, input: Partial<CreateAnnouncementInput>, updatedBy: string | null) {
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Announcement not found", 404);

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.body !== undefined) data.body = input.body;
  if (input.type !== undefined) data.type = input.type;
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl ?? null;
  if (input.targetRole !== undefined) data.targetRole = input.targetRole ?? null;
  if (input.startsAt !== undefined) data.startsAt = input.startsAt ? new Date(input.startsAt) : null;
  if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

  const announcement = await prisma.announcement.update({ where: { id }, data });
  audit({
    actorType: "user",
    actorId: updatedBy,
    action: "admin.announcement.updated",
    category: "admin",
    targetType: "announcement",
    targetId: id,
    meta: { title: announcement.title },
  });
  return announcement;
}

export async function deleteAnnouncement(id: string, deletedBy: string | null) {
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Announcement not found", 404);
  await prisma.announcement.delete({ where: { id } });
  audit({
    actorType: "user",
    actorId: deletedBy,
    action: "admin.announcement.deleted",
    category: "admin",
    targetType: "announcement",
    targetId: id,
  });
  return { ok: true };
}
