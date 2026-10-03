import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@gaming-hub/db";
import {
  AppError,
  clampPagination,
  SETTINGS_CATEGORIES,
  type SettingsCategoryName,
} from "@gaming-hub/shared";
import { authenticate, requireMfa } from "../plugins/authenticate";
import { requireUser, parseSchema, routeParams, queryParams, queryString } from "../lib/http";
import { requirePermission } from "../lib/permissions";
import { applyTransaction } from "../services/wallet";
import { WalletTransactionService } from "../services/walletTransactionService";
import { auditFromRequest } from "../services/audit";
import {
  approveWalletRequest,
  listWalletRequests,
  rejectWalletRequest,
  setWalletFrozen,
} from "../services/walletRequests";
import {
  getSettings,
  resetSettingsCache,
  setSetting,
  setCategorySettings,
} from "../services/settings";

const walletAdjustSchema = z.object({
  amount: z.number().int().min(-1_000_000).max(1_000_000),
  reason: z.string().trim().min(1).max(200),
});

const roleChangeSchema = z.object({
  role: z.enum(["USER", "MODERATOR", "ADMIN", "CUSTOM"]),
  customRoleId: z.string().optional(),
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
    await requirePermission(request, "admin:users:view", prisma);
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
        customRoleId: u.customRoleId,
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
    await requirePermission(request, "admin:rooms:view", prisma);
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
    await requirePermission(request, "admin:matches:view", prisma);
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

  app.get("/api/admin/users/:id/wallet", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:wallet:view", prisma);
    const { id } = routeParams(request);
    const { AdminWalletService } = await import("../services/adminWalletService");
    return AdminWalletService.getUserWalletDetails(id);
  });

  app.post("/api/admin/users/:id/wallet/adjust", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:wallet:adjust", prisma);
    const { id } = routeParams(request);
    const { amount, reason } = parseSchema(walletAdjustSchema, request.body);
    const { AdminWalletService } = await import("../services/adminWalletService");

    return AdminWalletService.adjustWallet({
      adminId: admin.id,
      targetUserId: id,
      amount,
      reason,
    });
  });

  // ---- Admin Financial Dashboard -------------------------------------------
  app.get("/api/admin/finance/summary", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:wallet:view", prisma);
    const q = queryParams(request);
    const { AdminFinanceService } = await import("../services/adminFinanceService");

    return AdminFinanceService.getFinancialSummary({
      range: queryString(q.range),
      dateFrom: queryString(q.dateFrom),
      dateTo: queryString(q.dateTo),
    });
  });

  app.get("/api/admin/finance/export", { preHandler: authenticate }, async (request, reply) => {
    await requirePermission(request, "admin:wallet:view", prisma);
    const q = queryParams(request);
    const { AdminFinanceService } = await import("../services/adminFinanceService");

    const csv = await AdminFinanceService.exportFinancialCsv({
      range: queryString(q.range),
      dateFrom: queryString(q.dateFrom),
      dateTo: queryString(q.dateTo),
    });

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="financial_report_${Date.now()}.csv"`);
    return reply.send(csv);
  });

  // ---- Security / Suspicious Activity Alerts ------------------------------
  app.get("/api/admin/security/alerts", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:wallet:view", prisma);
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    const { SuspiciousActivityService } = await import("../services/suspiciousActivityService");

    return SuspiciousActivityService.listAlerts(
      {
        userId: queryString(q.userId),
        type: queryString(q.type) as any,
        severity: queryString(q.severity) as any,
        status: queryString(q.status) as any,
      },
      page,
      pageSize,
    );
  });

  app.get("/api/admin/security/alerts/:id", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:wallet:view", prisma);
    const { id } = routeParams(request);
    const { SuspiciousActivityService } = await import("../services/suspiciousActivityService");

    return SuspiciousActivityService.getAlertDetails(id);
  });

  app.patch("/api/admin/security/alerts/:id", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:wallet:view", prisma);
    const { id } = routeParams(request);
    const body = (request.body ?? {}) as { status?: any; adminNotes?: string };
    const { SuspiciousActivityService } = await import("../services/suspiciousActivityService");

    return SuspiciousActivityService.updateAlert(id, {
      status: body.status,
      adminNotes: body.adminNotes,
      reviewedBy: admin.id,
    });
  });

  // ---- Audit Logs ---------------------------------------------------------
  app.get("/api/admin/audit/logs", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:wallet:view", prisma);
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    const { AuditLogService } = await import("../services/auditLogService");

    return AuditLogService.queryAuditLogs(
      {
        actorId: queryString(q.actorId),
        actorType: queryString(q.actorType),
        action: queryString(q.action),
        category: queryString(q.category) as any,
        targetType: queryString(q.targetType),
        targetId: queryString(q.targetId),
        search: queryString(q.search),
        dateFrom: queryString(q.dateFrom),
        dateTo: queryString(q.dateTo),
      },
      page,
      pageSize,
    );
  });

  app.get("/api/admin/audit/logs/:id", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:wallet:view", prisma);
    const { id } = routeParams(request);
    const { AuditLogService } = await import("../services/auditLogService");

    return AuditLogService.getAuditLogDetails(id);
  });

  app.get("/api/admin/audit/export", { preHandler: authenticate }, async (request, reply) => {
    await requirePermission(request, "admin:wallet:view", prisma);
    const q = queryParams(request);
    const { AuditLogService } = await import("../services/auditLogService");

    const csv = await AuditLogService.exportAuditLogsCsv({
      actorId: queryString(q.actorId),
      actorType: queryString(q.actorType),
      action: queryString(q.action),
      category: queryString(q.category) as any,
      targetType: queryString(q.targetType),
      targetId: queryString(q.targetId),
      search: queryString(q.search),
      dateFrom: queryString(q.dateFrom),
      dateTo: queryString(q.dateTo),
    });

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="audit_logs_${Date.now()}.csv"`);
    return reply.send(csv);
  });

  // ---- Automated Financial Reconciliation ----------------------------------
  app.post("/api/admin/reconciliation/run", { preHandler: [authenticate, requireMfa] }, async (request) => {
    await requirePermission(request, "admin:wallet:view", prisma);
    const body = (request.body ?? {}) as { userId?: string; matchId?: string; tournamentId?: string };
    const { ReconciliationService } = await import("../services/reconciliationService");

    return ReconciliationService.runFullReconciliation(body);
  });

  app.get("/api/admin/reconciliation/summary", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:wallet:view", prisma);
    const { ReconciliationService } = await import("../services/reconciliationService");

    return ReconciliationService.runFullReconciliation();
  });

  app.get("/api/admin/reconciliation/issues", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:wallet:view", prisma);
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    const { ReconciliationService } = await import("../services/reconciliationService");

    return ReconciliationService.listIssues(
      {
        status: queryString(q.status) as any,
        severity: queryString(q.severity) as any,
        type: queryString(q.type) as any,
      },
      page,
      pageSize,
    );
  });

  app.get("/api/admin/reconciliation/issues/:id", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:wallet:view", prisma);
    const { id } = routeParams(request);
    const { ReconciliationService } = await import("../services/reconciliationService");

    return ReconciliationService.getIssueDetails(id);
  });

  app.patch("/api/admin/reconciliation/issues/:id", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:wallet:view", prisma);
    const { id } = routeParams(request);
    const body = (request.body ?? {}) as { status?: any; notes?: string };
    const { ReconciliationService } = await import("../services/reconciliationService");

    return ReconciliationService.updateIssue(id, {
      status: body.status,
      notes: body.notes,
      resolvedBy: admin.id,
    });
  });

  // ---- Security / Rate Limiting Metrics ------------------------------------
  app.get("/api/admin/security/rate-limits", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:wallet:view", prisma);
    const { RateLimitService } = await import("../services/rateLimitService");

    return RateLimitService.getRateLimitMetrics();
  });

  app.get("/api/admin/security/overview", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:users:view", prisma);
    const { AdminSecurityService } = await import("../services/adminSecurityService");

    return AdminSecurityService.getAdminSecurityOverview();
  });

  // ---- Wallet transactions ledger -------------------------------------------
  app.get("/api/admin/wallet/transactions", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:wallet:view", prisma);
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    const userId = queryString(q.userId) || undefined;
    const walletType = (queryString(q.walletType) as any) || undefined;
    const referenceType = (queryString(q.referenceType) as any) || undefined;
    const referenceId = queryString(q.referenceId) || undefined;
    const type = (queryString(q.type) as any) || undefined;

    return WalletTransactionService.adminListTransactions(
      { userId, walletType, referenceType, referenceId, type },
      page,
      pageSize,
    );
  });

  // ---- Wallet requests ------------------------------------------------------
  app.get("/api/admin/wallet/requests", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:wallet:requests:view", prisma);
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    const kind = (["DEPOSIT", "WITHDRAWAL"] as const).find((k) => k === queryString(q.kind));
    const status = (["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const).find(
      (s) => s === queryString(q.status),
    );
    const userId = queryString(q.userId) || undefined;
    return listWalletRequests({ userId, kind, status }, page, pageSize);
  });

  app.post("/api/admin/wallet/requests/:id/approve", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:wallet:requests:manage", prisma);
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

  app.post("/api/admin/wallet/requests/:id/reject", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:wallet:requests:manage", prisma);
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

  app.post("/api/admin/users/:id/wallet/freeze", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:wallet:requests:manage", prisma);
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

  app.post("/api/admin/users/:id/wallet/unfreeze", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:wallet:requests:manage", prisma);
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

  app.patch("/api/admin/users/:id/role", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:users:manage", prisma);
    const { id } = routeParams(request);
    const { role, customRoleId } = parseSchema(roleChangeSchema, request.body);

    if (id === admin.id) {
      throw new AppError("FORBIDDEN", "You cannot change your own role", 403);
    }

    if (role === "ADMIN" && admin.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Only administrators can grant the ADMIN role", 403);
    }

    const target = await prisma.user.findUnique({ where: { id }, select: { role: true, customRoleId: true } });
    if (!target) {
      throw new AppError("NOT_FOUND", "User not found", 404);
    }

    if (target.role === "ADMIN" && admin.role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Only administrators can modify an administrator's role", 403);
    }

    if (role === "CUSTOM" && customRoleId) {
      const customRole = await prisma.customRole.findUnique({
        where: { id: customRoleId },
      });
      if (!customRole) {
        throw new AppError("VALIDATION_ERROR", "Custom role not found", 422);
      }
    }

    if (target.role === "ADMIN" && role !== "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) {
        throw new AppError("FORBIDDEN", "Cannot demote the last admin", 403);
      }
    }

    await prisma.user.update({
      where: { id },
      data: {
        role,
        customRoleId: role === "CUSTOM" ? customRoleId : null,
      },
    });

    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.user.role.changed",
      category: "admin",
      targetType: "user",
      targetId: id,
      meta: {
        from: target.role,
        to: role,
        fromCustomRole: target.customRoleId,
        toCustomRole: customRoleId,
      },
    });

    return { ok: true, user: { id, role, customRoleId: role === "CUSTOM" ? customRoleId : null } };
  });

  // ---- Site settings -------------------------------------------------------
  // Returns the full validated configuration including secret values. Requires
  // the read permission; non-admin clients use the public /api/settings route.
  app.get("/api/admin/settings", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:settings:view", prisma);
    return getSettings();
  });

  const singleSettingSchema = z.object({
    value: z.unknown(),
  });

  // Patch a single dotted setting key (e.g. `auth.signupEnabled`).
  app.patch("/api/admin/settings/:key", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:settings:edit", prisma);
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
  app.put("/api/admin/settings/category", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:settings:edit", prisma);
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
  app.delete("/api/admin/settings/category/:category", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:settings:edit", prisma);
    const { category } = routeParams(request);
    if (!(category in SETTINGS_CATEGORIES)) {
      throw new AppError("VALIDATION_ERROR", `Unknown category "${category}"`, 422);
    }
    await prisma.siteSetting.deleteMany({ where: { category } });
    resetSettingsCache();
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
