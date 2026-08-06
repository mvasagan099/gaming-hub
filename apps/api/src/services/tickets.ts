import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type { TicketPriority, TicketStatus } from "@gaming-hub/shared";
import { createNotification } from "./notifications";
import { getCategorySettings } from "./settings";
import { audit } from "./audit";

export interface CreateTicketInput {
  subject: string;
  category: string;
  priority?: TicketPriority;
  body: string;
}

async function assertSupportEnabled(): Promise<void> {
  const support = await getCategorySettings("support");
  if (!support.enabled) throw new AppError("FEATURE_DISABLED", "Support is disabled", 403);
}

export async function createTicket(userId: string, input: CreateTicketInput) {
  await assertSupportEnabled();

  const supportSettings = await getCategorySettings("support");
  if (!supportSettings.categories.includes(input.category)) {
    throw new AppError("VALIDATION_ERROR", `Unknown ticket category "${input.category}"`, 422);
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const countToday = await prisma.supportTicket.count({
    where: { userId, createdAt: { gte: todayStart } },
  });
  if (countToday >= supportSettings.maxTicketsPerUserPerDay) {
    throw new AppError("RATE_LIMITED", "You have reached your daily ticket limit", 429);
  }

  const ticket = await prisma.$transaction(async (tx) => {
    const created = await tx.supportTicket.create({
      data: {
        userId,
        subject: input.subject,
        category: input.category,
        priority: input.priority ?? "MEDIUM",
        messages: {
          create: { senderId: userId, body: input.body, isStaff: false },
        },
      },
    });
    return created;
  });

  audit({
    actorType: "user",
    actorId: userId,
    action: "support.ticket.created",
    category: "account",
    targetType: "ticket",
    targetId: ticket.id,
    meta: { subject: ticket.subject, category: ticket.category },
  });

  if (supportSettings.autoReplyEnabled && supportSettings.autoReplyText) {
    await prisma.ticketMessage.create({
      data: { ticketId: ticket.id, senderId: userId, body: supportSettings.autoReplyText, isStaff: true },
    });
  }

  return ticket;
}

export async function listMyTickets(userId: string, page: number, pageSize: number) {
  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.supportTicket.count({ where: { userId } }),
  ]);

  return {
    items: items.map((t) => ({
      id: t.id,
      subject: t.subject,
      category: t.category,
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}

export async function getTicket(userId: string, ticketId: string, isStaff: boolean) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) throw new AppError("NOT_FOUND", "Ticket not found", 404);
  if (!isStaff && ticket.userId !== userId) throw new AppError("FORBIDDEN", "Not your ticket", 403);

  return {
    id: ticket.id,
    userId: ticket.userId,
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
    priority: ticket.priority,
    assignedTo: ticket.assignedTo,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    messages: ticket.messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      body: m.body,
      isStaff: m.isStaff,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export async function replyToTicket(userId: string, ticketId: string, body: string, isStaff: boolean) {
  const trimmed = body.trim();
  if (!trimmed) throw new AppError("VALIDATION_ERROR", "Reply cannot be empty", 422);

  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new AppError("NOT_FOUND", "Ticket not found", 404);
  if (!isStaff && ticket.userId !== userId) throw new AppError("FORBIDDEN", "Not your ticket", 403);
  if (ticket.status === "CLOSED") throw new AppError("INVALID_ACTION", "This ticket is closed", 400);

  await prisma.$transaction(async (tx) => {
    await tx.ticketMessage.create({ data: { ticketId, senderId: userId, body: trimmed, isStaff } });
    await tx.supportTicket.update({
      where: { id: ticketId },
      data: { status: isStaff ? "PENDING" : "OPEN" },
    });
  });

  const otherParty = isStaff ? ticket.userId : ticket.assignedTo;
  if (otherParty) {
    await createNotification(otherParty, "SUPPORT", `Ticket #${ticketId.slice(0, 8)} updated`,
      "Someone replied to your support ticket", { ticketId });
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Staff (CRM)
// ---------------------------------------------------------------------------

export async function listAllTickets(page: number, pageSize: number, status?: TicketStatus, priority?: TicketPriority) {
  const where = {
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return {
    items: items.map((t) => ({
      id: t.id,
      subject: t.subject,
      category: t.category,
      status: t.status,
      priority: t.priority,
      assignedTo: t.assignedTo,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      user: t.user,
    })),
    total,
    page,
    pageSize,
  };
}

export async function setTicketStatus(id: string, status: TicketStatus, updatedBy: string | null) {
  const existing = await prisma.supportTicket.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Ticket not found", 404);
  const ticket = await prisma.supportTicket.update({ where: { id }, data: { status } });
  audit({
    actorType: "user",
    actorId: updatedBy,
    action: "admin.ticket.status.changed",
    category: "admin",
    targetType: "ticket",
    targetId: id,
    meta: { status },
  });
  return ticket;
}

export async function assignTicket(id: string, assignedTo: string | null, updatedBy: string | null) {
  const existing = await prisma.supportTicket.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Ticket not found", 404);
  const ticket = await prisma.supportTicket.update({ where: { id }, data: { assignedTo } });
  audit({
    actorType: "user",
    actorId: updatedBy,
    action: "admin.ticket.assigned",
    category: "admin",
    targetType: "ticket",
    targetId: id,
    meta: { assignedTo },
  });
  return ticket;
}
