import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@gaming-hub/db";
import {
  AppError,
  clampPagination,
  SETTINGS_CATEGORIES,
  type SettingsCategoryName,
} from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireUser, parseSchema, routeParams, queryParams, queryString } from "../lib/http";
import { requirePermission } from "../lib/permissions";
import { applyTransaction } from "../services/wallet";
import { auditFromRequest } from "../services/audit";
import {
  approveWalletRequest,
  listWalletRequests,
  rejectWalletRequest,
  setWalletFrozen,
} from "../services/walletRequests";
import {
  getSettings,
  setSetting,
  setCategorySettings,
} from "../services/settings";

const walletAdjustSchema = z.object({
  amount: z.number().int().min(-1_000_000).max(1_000_000),
  reason: z.string().trim().min(1).max(200),
});

const roleChangeSchema = z.object({
  role: z.enum(["USER", "MODERATOR", "ADMIN"]),
});

const requestDecisionSchema = z.object({
  note: z.string().trim().max(300).optional(),
});

const requestRejectSchema = z.object({
  reason: z.string().trim().min(1).max(300),
});

const freezeSchema = z.object({
  reason: z.string().trim().min(1).max(300),
});

export async function adminRoutes(app: FastifyInstance) {
  app.get("/api/admin/users", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:users:view");
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
    await requirePermission(request, "admin:rooms:view");
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
    await requirePermission(request, "admin:matches:view");
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
    const admin = await requirePermission(request, "admin:wallet:adjust");
    const { id } = routeParams(request);
    const { amount, reason } = parseSchema(walletAdjustSchema, request.body);

    const wallet = await prisma.$transaction(async (tx) => {
      const updated = await applyTransaction(
        tx,
        id,
        amount,
        "ADMIN",
        null,
        { reason, adjustedBy: admin.id },
      );
      return updated;
    });

    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.wallet.adjust",
      category: "admin",
      targetType: "user",
      targetId: id,
      meta: { amount, reason },
    });

    return { ok: true, balance: wallet.balance };
  });

  // ---- Wallet requests ------------------------------------------------------
  app.get("/api/admin/wallet/requests", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:wallet:requests:view");
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    const kind = (["DEPOSIT", "WITHDRAWAL"] as const).find((k) => k === queryString(q.kind));
    const status = (["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const).find(
      (s) => s === queryString(q.status),
    );
    const userId = queryString(q.userId) || undefined;
    return listWalletRequests({ userId, kind, status }, page, pageSize);
  });

  app.post("/api/admin/wallet/requests/:id/approve", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:wallet:requests:manage");
    const { id } = routeParams(request);
    const { note } = parseSchema(requestDecisionSchema, request.body ?? {});
    const updated = await approveWalletRequest(admin.id, id, note);
    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.wallet.request.approved",
      category: "admin",
      targetType: "walletRequest",
      targetId: id,
      meta: { kind: updated.kind, amount: updated.amount, userId: updated.userId },
    });
    return { ok: true, request: updated };
  });

  app.post("/api/admin/wallet/requests/:id/reject", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:wallet:requests:manage");
    const { id } = routeParams(request);
    const { reason } = parseSchema(requestRejectSchema, request.body);
    const updated = await rejectWalletRequest(admin.id, id, reason);
    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.wallet.request.rejected",
      category: "admin",
      targetType: "walletRequest",
      targetId: id,
      meta: { kind: updated.kind, amount: updated.amount, userId: updated.userId },
    });
    return { ok: true, request: updated };
  });

  app.post("/api/admin/users/:id/wallet/freeze", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:wallet:requests:manage");
    const { id } = routeParams(request);
    const { reason } = parseSchema(freezeSchema, request.body);
    const wallet = await setWalletFrozen(admin.id, id, true, reason);
    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.wallet.frozen",
      category: "admin",
      targetType: "user",
      targetId: id,
      meta: { reason },
    });
    return { ok: true, isFrozen: wallet.isFrozen };
  });

  app.post("/api/admin/users/:id/wallet/unfreeze", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:wallet:requests:manage");
    const { id } = routeParams(request);
    const wallet = await setWalletFrozen(admin.id, id, false);
    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.wallet.unfrozen",
      category: "admin",
      targetType: "user",
      targetId: id,
    });
    return { ok: true, isFrozen: wallet.isFrozen };
  });

  app.patch("/api/admin/users/:id/role", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:users:manage");
    const { id } = routeParams(request);
    const { role } = parseSchema(roleChangeSchema, request.body);

    if (id === admin.id) {
      throw new AppError("FORBIDDEN", "You cannot change your own role", 403);
    }

    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) {
      throw new AppError("NOT_FOUND", "User not found", 404);
    }

    // Never allow demoting the last ADMIN — prevents lockout of the platform.
    if (target.role === "ADMIN" && role !== "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) {
        throw new AppError("FORBIDDEN", "Cannot demote the last admin", 403);
      }
    }

    await prisma.user.update({ where: { id }, data: { role } });

    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.user.role.changed",
      category: "admin",
      targetType: "user",
      targetId: id,
      meta: { from: target.role, to: role },
    });

    return { ok: true, user: { id, role } };
  });

  // ---- Site settings -------------------------------------------------------
  // Returns the full validated configuration including secret values. Requires
  // the read permission; non-admin clients use the public /api/settings route.
  app.get("/api/admin/settings", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:settings:view");
    return getSettings();
  });

  const singleSettingSchema = z.object({
    value: z.unknown(),
  });

  // Patch a single dotted setting key (e.g. `auth.signupEnabled`).
  app.patch("/api/admin/settings/:key", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:settings:edit");
    const { key } = routeParams(request);
    const { value } = parseSchema(singleSettingSchema, request.body);
    await setSetting(key, value, admin.id);
    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.settings.updated",
      category: "admin",
      targetType: "system",
      targetId: key,
      meta: { key },
    });
    return { ok: true, key };
  });

  const categoryUpdateSchema = z.object({
    category: z.enum(Object.keys(SETTINGS_CATEGORIES) as [SettingsCategoryName, ...SettingsCategoryName[]]),
    values: z.record(z.string(), z.unknown()),
  });

  // Replace an entire category (e.g. all `wallet.*` keys) in one transaction.
  app.put("/api/admin/settings/category", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:settings:edit");
    const { category, values } = parseSchema(categoryUpdateSchema, request.body);
    const saved = await setCategorySettings(category, values, admin.id);
    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.settings.category.updated",
      category: "admin",
      targetType: "system",
      targetId: category,
      meta: { category, fields: Object.keys(values) },
    });
    return { ok: true, category, values: saved };
  });

  // Reset a category back to built-in defaults (deletes all stored rows).
  app.delete("/api/admin/settings/category/:category", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:settings:edit");
    const { category } = routeParams(request);
    if (!(category in SETTINGS_CATEGORIES)) {
      throw new AppError("VALIDATION_ERROR", `Unknown category "${category}"`, 422);
    }
    await prisma.siteSetting.deleteMany({ where: { category } });
    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.settings.category.reset",
      category: "admin",
      targetType: "system",
      targetId: category,
      meta: { category },
    });
    return { ok: true, category };
  });
}
