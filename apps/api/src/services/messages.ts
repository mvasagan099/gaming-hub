import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { createNotification } from "./notifications";
import { getCategorySettings } from "./settings";
import { audit } from "./audit";

async function assertMessagingEnabled(): Promise<void> {
  const messaging = await getCategorySettings("messaging");
  if (!messaging.enabled) throw new AppError("FEATURE_DISABLED", "Messaging is disabled", 403);
  if (!messaging.dmEnabled) throw new AppError("FEATURE_DISABLED", "Direct messages are disabled", 403);
}

function otherMemberId(members: Array<{ userId: string }>, selfId: string): string | undefined {
  return members.find((m) => m.userId !== selfId)?.userId;
}

/** Finds the 1:1 conversation between two users, creating it if absent. */
export async function ensureConversation(userId: string, otherId: string) {
  if (userId === otherId) throw new AppError("MESSAGE_SELF_SEND", "You cannot message yourself", 422);

  await assertMessagingEnabled();

  const other = await prisma.user.findUnique({ where: { id: otherId }, select: { id: true, deletedAt: true } });
  if (!other || other.deletedAt) throw new AppError("NOT_FOUND", "User not found", 404);

  const blocked = await prisma.blockedUser.findFirst({
    where: { OR: [{ blockerId: userId, blockedId: otherId }, { blockerId: otherId, blockedId: userId }] },
  });
  if (blocked) throw new AppError("USER_BLOCKED", "You cannot message this user", 403);

  const mine = await prisma.conversationMember.findMany({
    where: { userId },
    select: { conversationId: true, conversation: { select: { id: true, members: { select: { userId: true } } } } },
  });
  const existing = mine.find((m) => otherMemberId(m.conversation.members, userId) === otherId);
  if (existing) return existing.conversation;

  const conversation = await prisma.conversation.create({
    data: {
      members: {
        create: [{ userId }, { userId: otherId }],
      },
    },
    include: { members: true },
  });
  return conversation;
}

export async function startConversation(userId: string, otherId: string) {
  const conversation = await ensureConversation(userId, otherId);
  return getConversationSummary(userId, conversation.id);
}

export async function sendMessage(userId: string, conversationId: string, body: string) {
  await assertMessagingEnabled();

  const trimmed = body.trim();
  if (!trimmed) throw new AppError("VALIDATION_ERROR", "Message cannot be empty", 422);
  const messaging = await getCategorySettings("messaging");
  if (trimmed.length > messaging.maxMessageLength) {
    throw new AppError("VALIDATION_ERROR", `Message exceeds ${messaging.maxMessageLength} characters`, 422);
  }

  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    include: { conversation: { select: { id: true, members: { select: { userId: true } } } } },
  });
  if (!membership) throw new AppError("CONVERSATION_NOT_FOUND", "Conversation not found", 404);

  const otherId = otherMemberId(membership.conversation.members, userId);
  if (otherId) {
    const blocked = await prisma.blockedUser.findFirst({
      where: { OR: [{ blockerId: userId, blockedId: otherId }, { blockerId: otherId, blockedId: userId }] },
    });
    if (blocked) throw new AppError("USER_BLOCKED", "You cannot message this user", 403);
  }

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: { conversationId, senderId: userId, body: trimmed },
    });
    await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    return created;
  });

  if (otherId) {
    await createNotification(otherId, "MESSAGE", "New message",
      "You received a new direct message", { conversationId, senderId: userId });
  }

  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    body: message.body,
    readAt: message.readAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function listConversations(userId: string) {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId },
    include: {
      conversation: {
        include: {
          members: true,
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          _count: {
            select: { messages: { where: { readAt: null, senderId: { not: userId } } } },
          },
        },
      },
    },
    orderBy: { conversation: { updatedAt: "desc" } },
  });

  const otherIds = memberships
    .map((m) => otherMemberId(m.conversation.members, userId))
    .filter((id): id is string => Boolean(id));
  const others = await prisma.user.findMany({
    where: { id: { in: otherIds } },
    select: { id: true, username: true, displayName: true, avatarUrl: true, isOnline: true },
  });
  const othersById = new Map(others.map((u) => [u.id, u]));

  return memberships
    .map((m) => {
      const other = otherMemberId(m.conversation.members, userId);
      const lastMessage = m.conversation.messages[0] ?? null;
      return {
        id: m.conversation.id,
        otherUser: other ? othersById.get(other) ?? { id: other, username: "deleted", displayName: "Deleted User", avatarUrl: null, isOnline: false } : null,
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              senderId: lastMessage.senderId,
              body: lastMessage.body,
              readAt: lastMessage.readAt?.toISOString() ?? null,
              createdAt: lastMessage.createdAt.toISOString(),
            }
          : null,
        unreadCount: m.conversation._count.messages,
        updatedAt: m.conversation.updatedAt.toISOString(),
      };
    })
    .filter((c) => c.otherUser);
}

export async function getMessages(userId: string, conversationId: string, page: number, pageSize: number) {
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!membership) throw new AppError("CONVERSATION_NOT_FOUND", "Conversation not found", 404);

  const [items, total] = await Promise.all([
    prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.message.count({ where: { conversationId } }),
  ]);

  await prisma.message.updateMany({
    where: { conversationId, senderId: { not: userId }, readAt: null },
    data: { readAt: new Date() },
  });

  return {
    items: items.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      body: m.body,
      readAt: m.readAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}

export async function getConversationSummary(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { members: true },
  });
  if (!conversation) throw new AppError("CONVERSATION_NOT_FOUND", "Conversation not found", 404);
  const isMember = conversation.members.some((m) => m.userId === userId);
  if (!isMember) throw new AppError("CONVERSATION_NOT_FOUND", "Conversation not found", 404);

  const other = otherMemberId(conversation.members, userId);
  const otherUser = other
    ? await prisma.user.findUnique({
        where: { id: other },
        select: { id: true, username: true, displayName: true, avatarUrl: true, isOnline: true },
      })
    : null;

  return {
    id: conversation.id,
    otherUser: otherUser ?? { id: other ?? "", username: "deleted", displayName: "Deleted User", avatarUrl: null, isOnline: false },
  };
}

export async function countUnreadMessages(userId: string): Promise<number> {
  const memberships = await prisma.conversationMember.findMany({ where: { userId }, select: { conversationId: true } });
  if (memberships.length === 0) return 0;
  return prisma.message.count({
    where: {
      senderId: { not: userId },
      readAt: null,
      conversationId: { in: memberships.map((m) => m.conversationId) },
    },
  });
}

// ---------------------------------------------------------------------------
// Block list
// ---------------------------------------------------------------------------

export async function blockUser(userId: string, blockedId: string) {
  if (userId === blockedId) throw new AppError("VALIDATION_ERROR", "You cannot block yourself", 422);
  const target = await prisma.user.findUnique({ where: { id: blockedId }, select: { id: true, deletedAt: true } });
  if (!target || target.deletedAt) throw new AppError("NOT_FOUND", "User not found", 404);

  await prisma.blockedUser.upsert({
    where: { blockerId_blockedId: { blockerId: userId, blockedId } },
    create: { blockerId: userId, blockedId },
    update: {},
  });

  await prisma.friend.deleteMany({
    where: {
      OR: [
        { requesterId: userId, addresseeId: blockedId },
        { requesterId: blockedId, addresseeId: userId },
      ],
    },
  });

  audit({
    actorType: "user",
    actorId: userId,
    action: "user.blocked",
    category: "account",
    targetType: "user",
    targetId: blockedId,
  });
  return { ok: true };
}

export async function unblockUser(userId: string, blockedId: string) {
  await prisma.blockedUser.deleteMany({ where: { blockerId: userId, blockedId } });
  audit({
    actorType: "user",
    actorId: userId,
    action: "user.unblocked",
    category: "account",
    targetType: "user",
    targetId: blockedId,
  });
  return { ok: true };
}

export async function listBlocked(userId: string) {
  const rows = await prisma.blockedUser.findMany({
    where: { blockerId: userId },
    orderBy: { createdAt: "desc" },
    include: { blocked: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    blockedId: r.blockedId,
    username: r.blocked.username,
    displayName: r.blocked.displayName,
    avatarUrl: r.blocked.avatarUrl,
    createdAt: r.createdAt.toISOString(),
  }));
}
