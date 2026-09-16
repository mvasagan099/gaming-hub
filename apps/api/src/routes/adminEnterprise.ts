import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { clampPagination, AppError } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { requireMfa } from "../plugins/authenticate";
import { parseSchema, routeParams, queryParams, queryString } from "../lib/http";
import { requirePermission } from "../lib/permissions";
import { auditFromRequest } from "../services/audit";
import {
  getFeatureFlagGroups,
  setFeatureFlag,
} from "../services/featureFlags";
import {
  createAnnouncement,
  deleteAnnouncement,
  listAllAnnouncements,
  updateAnnouncement,
} from "../services/announcements";
import {
  createCoupon,
  deleteCoupon,
  listCoupons,
  setCouponStatus,
  updateCoupon,
} from "../services/coupons";
import {
  adminListTournaments,
  createTournament,
  deleteTournament,
  setTournamentStatus,
  updateTournament,
} from "../services/tournaments";
import {
  startTournament,
  cancelTournamentWithRefunds,
  settleTournament,
  transitionTournamentStatus,
  getTournamentBracket,
  getAdminTournamentBracketDetails,
  assignManualSeeds,
} from "../services/tournamentEngine";
import { getTournamentHealth, reconcileTournament } from "../services/tournamentScheduler";
import {
  assignTicket,
  getTicket,
  listAllTickets,
  replyToTicket,
  setTicketStatus,
} from "../services/tickets";
import { getReferralLeaderboard } from "../services/referrals";
import {
  getAnalyticsSnapshot,
  getCouponUsage,
  getCountryDistribution,
  getDashboardCounts,
  getHealthChecks,
  getPopularGames,
  getSupportStats,
  getSystemMetrics,
  getTournamentParticipation,
  getTransactionSeries,
  getUserGrowthSeries,
} from "../services/monitoring";
import { getAdminCustomerDetail } from "../services/adminCustomers";
import {
  errorStats,
  getErrorDetail,
  listErrors,
  setErrorStatus,
} from "../services/errors";
import { getJobList, listJobRuns, runJob } from "../services/automation";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const couponCreateSchema = z.object({
  code: z.string().trim().min(3).max(40),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  discountType: z.enum(["PERCENT", "FIXED"]),
  discountValue: z.number().int().min(1).max(1_000_000),
  maxUses: z.number().int().min(1).max(1_000_000).default(1),
  minWager: z.number().int().min(0).max(10_000_000).default(0),
  maxRedeemValue: z.number().int().min(0).max(1_000_000).nullable().optional(),
  gameId: z.string().nullable().optional(),
  validFrom: z.string(),
  validUntil: z.string(),
});

const couponPatchSchema = couponCreateSchema.partial();

const announcementCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  type: z.enum(["INFO", "UPDATE", "MAINTENANCE", "PROMOTION", "ALERT"]).default("INFO"),
  imageUrl: z.string().max(500).nullable().optional(),
  targetRole: z.string().max(40).nullable().optional(),
  startsAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});

const announcementPatchSchema = announcementCreateSchema.partial();

const tournamentCreateSchema = z.object({
  gameId: z.string(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).default(""),
  format: z.enum(["BRACKET", "KNOCKOUT", "ROUND_ROBIN", "SWISS", "SINGLE_ELIMINATION", "DOUBLE_ELIMINATION"]).default("SINGLE_ELIMINATION"),
  prizePool: z.number().int().min(0).max(1_000_000_000).default(0),
  entryFee: z.number().int().min(0).max(100_000).default(0),
  maxPlayers: z.number().int().min(2).max(256).default(16),
  minPlayers: z.number().int().min(2).max(256).optional(),
  startTime: z.string(),
  endTime: z.string().nullable().optional(),
  bannerUrl: z.string().max(500).nullable().optional(),
});

const tournamentPatchSchema = tournamentCreateSchema.partial();

const errorStatusSchema = z.object({
  status: z.enum(["OPEN", "INVESTIGATING", "RESOLVED", "IGNORED"]),
});

export async function adminEnterpriseRoutes(app: FastifyInstance) {
  // ---- Feature flags -------------------------------------------------------
  app.get("/api/admin/features", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:features:view");
    return getFeatureFlagGroups();
  });

  const flagPatchSchema = z.object({
    enabled: z.boolean(),
  });

  app.patch("/api/admin/features/:key", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:features:edit");
    const { key } = routeParams(request);
    const { enabled } = parseSchema(flagPatchSchema, request.body);
    await setFeatureFlag(key, enabled, admin.id);
    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.feature.toggled",
      category: "admin",
      targetType: "system",
      targetId: key,
      meta: { key, enabled },
    });
    return { ok: true, key, enabled };
  });

  // ---- Audit logs ----------------------------------------------------------
  app.get("/api/admin/audit", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:audit:view");
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    const category = queryString(q.category) || undefined;
    const actorId = queryString(q.actorId) || undefined;

    const where = {
      ...(category ? { category } : {}),
      ...(actorId ? { actorId } : {}),
    };
    const [items, total] = await Promise.all([
      (await import("@gaming-hub/db")).prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      (await import("@gaming-hub/db")).prisma.auditLog.count({ where }),
    ]);

    return {
      items: items.map((log) => ({
        id: log.id,
        actorType: log.actorType,
        actorId: log.actorId,
        action: log.action,
        category: log.category,
        targetType: log.targetType,
        targetId: log.targetId,
        ip: log.ip,
        userAgent: log.userAgent,
        meta: log.meta,
        createdAt: log.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  });

  // ---- Monitoring ----------------------------------------------------------
  app.get("/api/admin/monitoring/metrics", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:monitoring:view");
    return getSystemMetrics();
  });

  app.get("/api/admin/monitoring/counts", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:monitoring:view");
    return getDashboardCounts();
  });

  app.get("/api/admin/monitoring/health", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:monitoring:view");
    return getHealthChecks();
  });

  // ---- Analytics -----------------------------------------------------------
  app.get("/api/admin/analytics/snapshot", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:analytics:view");
    return getAnalyticsSnapshot();
  });

  app.get("/api/admin/analytics/users", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:analytics:view");
    const q = queryParams(request);
    const days = Math.min(365, Math.max(7, Number(queryString(q.days)) || 30));
    return getUserGrowthSeries(days);
  });

  app.get("/api/admin/analytics/transactions", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:analytics:view");
    const q = queryParams(request);
    const days = Math.min(365, Math.max(7, Number(queryString(q.days)) || 30));
    const referenceType = queryString(q.referenceType) || undefined;
    return getTransactionSeries(days, referenceType);
  });

  app.get("/api/admin/analytics/games", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:analytics:view");
    return getPopularGames();
  });

  app.get("/api/admin/analytics/deposits", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:analytics:view");
    const q = queryParams(request);
    const days = Math.min(365, Math.max(7, Number(queryString(q.days)) || 30));
    return getTransactionSeries(days, "DEPOSIT");
  });

  app.get("/api/admin/analytics/withdrawals", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:analytics:view");
    const q = queryParams(request);
    const days = Math.min(365, Math.max(7, Number(queryString(q.days)) || 30));
    return getTransactionSeries(days, "WITHDRAWAL");
  });

  app.get("/api/admin/analytics/coupons", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:analytics:view");
    return getCouponUsage();
  });

  app.get("/api/admin/analytics/tournaments", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:analytics:view");
    return getTournamentParticipation();
  });

  app.get("/api/admin/analytics/geography", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:analytics:view");
    return getCountryDistribution();
  });

  app.get("/api/admin/analytics/support", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:analytics:view");
    return getSupportStats();
  });

  // ---- Customer 360 (CRM) --------------------------------------------------
  app.get("/api/admin/users/:id/detail", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:crm:view");
    const { id } = routeParams(request);
    return getAdminCustomerDetail(id);
  });

  // ---- Error center --------------------------------------------------------
  app.get("/api/admin/errors", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:errors:view");
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    const status = queryString(q.status) as "OPEN" | "INVESTIGATING" | "RESOLVED" | "IGNORED" | undefined;
    const severity = queryString(q.severity) as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | undefined;
    return listErrors(page, pageSize, status, severity);
  });

  app.get("/api/admin/errors/stats", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:errors:view");
    return errorStats();
  });

  app.get("/api/admin/errors/:id", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:errors:view");
    const { id } = routeParams(request);
    return getErrorDetail(id);
  });

  app.patch("/api/admin/errors/:id/status", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:errors:manage");
    const { id } = routeParams(request);
    const { status } = parseSchema(errorStatusSchema, request.body);
    const updated = await setErrorStatus(id, status);
    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.error.status.changed",
      category: "admin",
      targetType: "error",
      targetId: id,
      meta: { status },
    });
    return { ok: true, status: updated.status };
  });

  // ---- Automation ----------------------------------------------------------
  app.get("/api/admin/automation/jobs", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:automation:view");
    return getJobList();
  });

  app.get("/api/admin/automation/runs", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:automation:view");
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    return listJobRuns(page, pageSize);
  });

  app.post("/api/admin/automation/jobs/:name/run", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:automation:manage");
    const { name } = routeParams(request);
    const result = await runJob(name);
    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.automation.job.ran",
      category: "admin",
      targetType: "system",
      targetId: name,
      meta: { processed: result.processed },
    });
    return { ok: true, processed: result.processed, details: result.details };
  });

  // ---- Tournaments (admin) -------------------------------------------------
  app.get("/api/admin/tournaments", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view");
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    const status = queryString(q.status) as "UPCOMING" | "LIVE" | "ENDED" | "CANCELLED" | undefined;
    return adminListTournaments(page, pageSize, status);
  });

  app.post("/api/admin/tournaments", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage");
    const input = parseSchema(tournamentCreateSchema, request.body);
    const tournament = await createTournament(input, admin.id);
    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.tournament.created",
      category: "admin",
      targetType: "tournament",
      targetId: tournament.id,
    });
    return tournament;
  });

  app.get("/api/admin/tournaments/:id/health", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view");
    return getTournamentHealth(routeParams(request).id);
  });

  app.post("/api/admin/tournaments/:id/reconcile", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage");
    const id = routeParams(request).id;
    const result = await reconcileTournament(id);
    auditFromRequest(request, {
      actorType: "user", actorId: admin.id, action: "admin.tournament.reconciled",
      category: "admin", targetType: "tournament", targetId: id,
      meta: { repaired: result.repaired.length, warnings: result.warnings.length, errors: result.errors.length },
    });
    return result;
  });

  app.patch("/api/admin/tournaments/:id", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage");
    const { id } = routeParams(request);
    const input = parseSchema(tournamentPatchSchema, request.body);
    const tournament = await updateTournament(id, input, admin.id);
    return tournament;
  });

  app.patch("/api/admin/tournaments/:id/status", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage");
    const { id } = routeParams(request);
    const { status } = parseSchema(z.object({ status: z.enum(["UPCOMING", "LIVE", "ENDED", "CANCELLED"]) }), request.body);
    const tournament = await setTournamentStatus(id, status, admin.id);
    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.tournament.status.changed",
      category: "admin",
      targetType: "tournament",
      targetId: id,
      meta: { status },
    });
    return { ok: true, status: tournament.status };
  });

  app.delete("/api/admin/tournaments/:id", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage");
    const { id } = routeParams(request);
    await deleteTournament(id, admin.id);
    return { ok: true };
  });

  app.get("/api/admin/tournaments/:id/bracket", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view");
    const { id } = routeParams(request);
    return getAdminTournamentBracketDetails(id);
  });

  app.post("/api/admin/tournaments/:id/seeds", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage");
    const { id } = routeParams(request);
    const body = request.body as { assignments: { userId: string; seed: number }[] };
    if (!body?.assignments || !Array.isArray(body.assignments)) {
      throw new AppError("VALIDATION_ERROR", "Invalid assignments array", 400);
    }
    await assignManualSeeds(id, body.assignments, admin.id);
    return { ok: true };
  });

  app.post("/api/admin/tournaments/:id/open-registration", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage");
    const { id } = routeParams(request);
    await transitionTournamentStatus(id, "REGISTRATION_OPEN" as any, admin.id);
    return { ok: true };
  });

  app.post("/api/admin/tournaments/:id/close-registration", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage");
    const { id } = routeParams(request);
    await transitionTournamentStatus(id, "REGISTRATION_CLOSED" as any, admin.id);
    return { ok: true };
  });

  app.post("/api/admin/tournaments/:id/start", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage");
    const { id } = routeParams(request);
    await startTournament(id, admin.id);
    return { ok: true };
  });

  app.post("/api/admin/tournaments/:id/pause", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage");
    const { id } = routeParams(request);
    await transitionTournamentStatus(id, "PAUSED" as any, admin.id);
    return { ok: true };
  });

  app.post("/api/admin/tournaments/:id/resume", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage");
    const { id } = routeParams(request);
    await transitionTournamentStatus(id, "IN_PROGRESS" as any, admin.id);
    return { ok: true };
  });

  app.post("/api/admin/tournaments/:id/cancel", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage");
    const { id } = routeParams(request);
    const { reason } = (request.body as any) ?? {};
    await cancelTournamentWithRefunds(id, reason ?? "Admin cancelled", admin.id);
    return { ok: true };
  });

  app.post("/api/admin/tournaments/:id/settle", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage");
    const { id } = routeParams(request);
    await settleTournament(id);
    return { ok: true };
  });

  /** Get comprehensive Tournament Admin Control Center data */
  app.get("/api/admin/tournaments/:id/control-center", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view");
    const { id } = routeParams(request);
    const { getTournamentControlCenterData } = await import("../services/tournamentAdminControlCenter");
    return getTournamentControlCenterData(id);
  });

  /** Emergency administrative match result override (audited & RBAC protected) */
  app.post("/api/admin/tournaments/:id/override-result", { preHandler: [authenticate, requireMfa] }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage");
    const { id } = routeParams(request);
    const body = request.body as { slotId: string; winnerId: string; reason: string };
    if (!body?.slotId || !body?.winnerId || !body?.reason) {
      throw new AppError("VALIDATION_ERROR", "slotId, winnerId, and reason are required", 400);
    }
    const { overrideTournamentMatchResult } = await import("../services/tournamentAdminControlCenter");
    await overrideTournamentMatchResult({
      tournamentId: id,
      slotId: body.slotId,
      winnerId: body.winnerId,
      reason: body.reason,
      adminId: admin.id,
    });
    return { ok: true };
  });

  /** Trigger crash-safe tournament state recovery & resume */
  app.post("/api/admin/tournaments/recover", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:manage");
    const { TournamentRecoveryService } = await import("../services/tournamentRecoveryService");
    const summary = await TournamentRecoveryService.recoverAllTournamentStates();
    return summary;
  });

  /** Get crash recovery & tournament health status */
  app.get("/api/admin/tournaments/recovery-status", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view");
    const { TournamentRecoveryService } = await import("../services/tournamentRecoveryService");
    const q = queryParams(request);
    const tournamentId = q.tournamentId ? String(q.tournamentId) : undefined;
    return TournamentRecoveryService.getRecoveryStatusReport(tournamentId);
  });



  // ---- Coupons (admin) -----------------------------------------------------
  app.get("/api/admin/coupons", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:coupons:view");
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    const status = queryString(q.status) as "ACTIVE" | "INACTIVE" | "EXPIRED" | undefined;
    return listCoupons(page, pageSize, status);
  });

  app.post("/api/admin/coupons", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:coupons:manage");
    const input = parseSchema(couponCreateSchema, request.body);
    const coupon = await createCoupon(input, admin.id);
    return coupon;
  });

  app.patch("/api/admin/coupons/:id", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:coupons:manage");
    const { id } = routeParams(request);
    const input = parseSchema(couponPatchSchema, request.body);
    const coupon = await updateCoupon(id, input, admin.id);
    return coupon;
  });

  app.patch("/api/admin/coupons/:id/status", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:coupons:manage");
    const { id } = routeParams(request);
    const { status } = parseSchema(z.object({ status: z.enum(["ACTIVE", "INACTIVE", "EXPIRED"]) }), request.body);
    const coupon = await setCouponStatus(id, status, admin.id);
    return { ok: true, status: coupon.status };
  });

  app.delete("/api/admin/coupons/:id", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:coupons:manage");
    const { id } = routeParams(request);
    await deleteCoupon(id, admin.id);
    return { ok: true };
  });

  // ---- Announcements (admin) -----------------------------------------------
  app.get("/api/admin/announcements", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:announcements:view");
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    return listAllAnnouncements(page, pageSize);
  });

  app.post("/api/admin/announcements", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:announcements:manage");
    const input = parseSchema(announcementCreateSchema, request.body);
    const announcement = await createAnnouncement(input, admin.id);
    return announcement;
  });

  app.patch("/api/admin/announcements/:id", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:announcements:manage");
    const { id } = routeParams(request);
    const input = parseSchema(announcementPatchSchema, request.body);
    const announcement = await updateAnnouncement(id, input, admin.id);
    return announcement;
  });

  app.delete("/api/admin/announcements/:id", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:announcements:manage");
    const { id } = routeParams(request);
    await deleteAnnouncement(id, admin.id);
    return { ok: true };
  });

  // ---- CRM (tickets, staff) ------------------------------------------------
  app.get("/api/admin/tickets", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:crm:view");
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    const status = queryString(q.status) as "OPEN" | "PENDING" | "RESOLVED" | "CLOSED" | undefined;
    const priority = queryString(q.priority) as "LOW" | "MEDIUM" | "HIGH" | "URGENT" | undefined;
    return listAllTickets(page, pageSize, status, priority);
  });

  app.get("/api/admin/tickets/:id", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:crm:view");
    const { id } = routeParams(request);
    return getTicket(admin.id, id, true);
  });

  app.post("/api/admin/tickets/:id/reply", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:crm:manage");
    const { id } = routeParams(request);
    const { body } = parseSchema(z.object({ body: z.string().trim().min(1).max(4000) }), request.body);
    return replyToTicket(admin.id, id, body, true);
  });

  app.patch("/api/admin/tickets/:id/status", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:crm:manage");
    const { id } = routeParams(request);
    const { status } = parseSchema(z.object({ status: z.enum(["OPEN", "PENDING", "RESOLVED", "CLOSED"]) }), request.body);
    const ticket = await setTicketStatus(id, status, admin.id);
    return { ok: true, status: ticket.status };
  });

  app.patch("/api/admin/tickets/:id/assign", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:crm:manage");
    const { id } = routeParams(request);
    const { assignedTo } = parseSchema(z.object({ assignedTo: z.string().max(100).nullable() }), request.body);
    const ticket = await assignTicket(id, assignedTo, admin.id);
    return { ok: true, assignedTo: ticket.assignedTo };
  });

  // ---- Referrals (admin) ---------------------------------------------------
  app.get("/api/admin/referrals/leaderboard", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:referrals:view");
    return getReferralLeaderboard(100);
  });
}
