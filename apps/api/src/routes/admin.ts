import type { FastifyInstance } from "fastify";
import { prisma } from "@gaming-hub/db";
import { AppError, clampPagination } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, parseSchema, routeParams, queryParams, queryString } from "../lib/http";
import { applyTransaction } from "../services/wallet";
import { z } from "zod";

async function requireAdmin(request: Parameters<typeof requireUser>[0]) {
  const user = requireUser(request);
  if (user.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "Admin access required", 403);
  }
  return user;
}

const walletAdjustSchema = z.object({
  amount: z.number().int().min(-1_000_000).max(1_000_000),
  reason: z.string().trim().min(1).max(200),
});

export async function adminRoutes(app: FastifyInstance) {
  app.get("/api/admin/users", { preHandler: authenticate }, async (request) => {
    await requireAdmin(request);
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { profile: true, wallet: true, _count: { select: { roomPlayers: true } } },
      }),
      prisma.user.count(),
    ]);

    return {
      items: items.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        email: u.email,
        role: u.role,
        isOnline: u.isOnline,
        coins: u.wallet?.balance ?? 0,
        level: u.profile?.level ?? 1,
        createdAt: u.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  });

  app.get("/api/admin/rooms", { preHandler: authenticate }, async (request) => {
    await requireAdmin(request);
    const rooms = await prisma.room.findMany({
      where: { status: { not: "ENDED" } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        host: { select: { username: true } },
        _count: { select: { players: true } },
      },
    });
    return rooms;
  });

  app.get("/api/admin/matches", { preHandler: authenticate }, async (request) => {
    await requireAdmin(request);
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));

    const [items, total] = await Promise.all([
      prisma.match.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { players: { include: { user: { select: { username: true } } } } },
      }),
      prisma.match.count(),
    ]);

    return { items, total, page, pageSize };
  });

  app.post("/api/admin/users/:id/wallet", { preHandler: authenticate }, async (request) => {
    await requireAdmin(request);
    const { id } = routeParams(request);
    const { amount, reason } = parseSchema(walletAdjustSchema, request.body);

    const wallet = await prisma.$transaction(async (tx) => {
      const updated = await applyTransaction(
        tx,
        id,
        amount,
        "ADMIN",
        null,
        { reason, adjustedBy: id },
      );
      return updated;
    });

    return { ok: true, balance: wallet.balance };
  });
}
