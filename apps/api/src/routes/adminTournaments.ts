import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@gaming-hub/db";
import { AppError, clampPagination, isGameId } from "@gaming-hub/shared";
import type { TournamentStatus, TournamentFormat } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { parseSchema, routeParams, queryParams, queryString } from "../lib/http";
import { requirePermission } from "../lib/permissions";
import { auditFromRequest } from "../services/audit";
import { broadcastAdminAnalytics } from "../services/socketBridge";
import { TournamentAnalyticsCache } from "../services/tournamentAnalyticsCache";
import {
  createTournament,
  updateTournament,
  adminListTournaments,
  deleteTournament,
} from "../services/tournaments";
import {
  startTournament,
  cancelTournamentWithRefunds,
  settleTournament,
  getTournamentBracket,
  createTournamentMatch,
  transitionTournamentStatus,
} from "../services/tournamentEngine";
import {
  reconcileTournament,
  getTournamentHealth,
} from "../services/tournamentScheduler";

const createTournamentSchema = z.object({
  gameId: z.string().min(1),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).optional(),
  format: z.enum(["SINGLE_ELIMINATION", "BRACKET", "KNOCKOUT", "ROUND_ROBIN", "SWISS"]).optional(),
  prizePool: z.number().int().min(0).optional(),
  entryFee: z.number().int().min(0).optional(),
  minPlayers: z.number().int().min(2).max(128).optional(),
  maxPlayers: z.number().int().min(2).max(128).optional(),
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }).nullable().optional(),
  registrationStartsAt: z.string().datetime({ offset: true }).nullable().optional(),
  registrationEndsAt: z.string().datetime({ offset: true }).nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  rules: z.record(z.string(), z.unknown()).optional(),
  autoStartWhenFull: z.boolean().optional(),
  prizeDistribution: z
    .array(z.object({ rank: z.number().int().min(1), percentage: z.number().min(0).max(100) }))
    .optional(),
});

const updateTournamentSchema = createTournamentSchema.partial();

const statusChangeSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

export async function adminTournamentsRoutes(app: FastifyInstance) {
  // ------------------------------------------------------------------
  // List all tournaments (admin view — all statuses)
  // ------------------------------------------------------------------
  app.get("/api/admin/tournaments", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view", prisma);
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    const status = queryString(q.status) as TournamentStatus | undefined;
    return adminListTournaments(page, pageSize, status);
  });

  // ------------------------------------------------------------------
  // Get single tournament detail (admin)
  // ------------------------------------------------------------------
  app.get("/api/admin/tournaments/:id", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view", prisma);
    const { id } = routeParams(request);
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        players: {
          orderBy: { seed: "asc" },
          include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
        },
        prizes: true,
        _count: { select: { players: true, rounds: true } },
      },
    });
    if (!tournament) throw new AppError("NOT_FOUND", "Tournament not found", 404);
    return tournament;
  });

  // ------------------------------------------------------------------
  // Get bracket (admin)
  // ------------------------------------------------------------------
  app.get("/api/admin/tournaments/:id/bracket", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view", prisma);
    const { id } = routeParams(request);
    return getTournamentBracket(id);
  });

  // ------------------------------------------------------------------
  // Create tournament
  // ------------------------------------------------------------------
  app.post("/api/admin/tournaments", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage", prisma);
    const body = parseSchema(createTournamentSchema, request.body);

    if (!isGameId(body.gameId)) {
      throw new AppError("VALIDATION_ERROR", "Unknown game", 422);
    }

    const input: any = { ...body };
    if (body.registrationEndsAt !== undefined) {
      input.registrationEndsAt = body.registrationEndsAt ? new Date(body.registrationEndsAt) : null;
    }
    if (body.registrationStartsAt !== undefined) {
      input.registrationStartsAt = body.registrationStartsAt ? new Date(body.registrationStartsAt) : null;
    }
    if (body.prizeDistribution) {
      input.prizeDistribution = body.prizeDistribution;
    }

    const tournament = await createTournament(input, admin.id);

    // Update extra fields not in base createTournament
    const extraUpdates: Record<string, unknown> = {};
    if (body.minPlayers !== undefined) extraUpdates.minPlayers = body.minPlayers;
    if (body.registrationEndsAt !== undefined) {
      extraUpdates.registrationEndsAt = body.registrationEndsAt ? new Date(body.registrationEndsAt) : null;
    }
    if (body.registrationStartsAt !== undefined) {
      extraUpdates.registrationStartsAt = body.registrationStartsAt ? new Date(body.registrationStartsAt) : null;
    }
    if (body.autoStartWhenFull !== undefined) extraUpdates.autoStartWhenFull = body.autoStartWhenFull;
    if (body.prizeDistribution !== undefined) extraUpdates.prizeDistribution = body.prizeDistribution;

    if (Object.keys(extraUpdates).length > 0) {
      await prisma.tournament.update({
        where: { id: tournament.id },
        data: extraUpdates as any,
      });
    }

    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.tournament.created",
      category: "admin",
      targetType: "tournament",
      targetId: tournament.id,
      meta: { title: tournament.title },
    });

    return { ok: true, tournament };
  });

  // ------------------------------------------------------------------
  // Update tournament (only while in editable statuses)
  // ------------------------------------------------------------------
  app.patch("/api/admin/tournaments/:id", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage", prisma);
    const { id } = routeParams(request);
    const body = parseSchema(updateTournamentSchema, request.body);

    // Restrict edits to pre-start statuses
    const existing = await prisma.tournament.findUnique({ where: { id }, select: { status: true } });
    if (!existing) throw new AppError("NOT_FOUND", "Tournament not found", 404);
    const editableStatuses: TournamentStatus[] = ["DRAFT", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "UPCOMING"];
    if (!editableStatuses.includes(existing.status as TournamentStatus)) {
      throw new AppError("INVALID_ACTION", "Tournament cannot be edited after it starts", 409);
    }

    const updated = await updateTournament(id, body as any, admin.id);

    // Apply extra fields
    const extraUpdates: Record<string, unknown> = {};
    if (body.minPlayers !== undefined) extraUpdates.minPlayers = body.minPlayers;
    if (body.registrationEndsAt !== undefined) {
      extraUpdates.registrationEndsAt = body.registrationEndsAt ? new Date(body.registrationEndsAt) : null;
    }
    if (body.registrationStartsAt !== undefined) {
      extraUpdates.registrationStartsAt = body.registrationStartsAt ? new Date(body.registrationStartsAt) : null;
    }
    if (body.autoStartWhenFull !== undefined) extraUpdates.autoStartWhenFull = body.autoStartWhenFull;
    if (body.prizeDistribution !== undefined) extraUpdates.prizeDistribution = body.prizeDistribution;

    if (Object.keys(extraUpdates).length > 0) {
      await prisma.tournament.update({
        where: { id },
        data: extraUpdates as any,
      });
    }

    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.tournament.updated",
      category: "admin",
      targetType: "tournament",
      targetId: id,
      meta: { title: updated.title },
    });

    return { ok: true, tournament: updated };
  });

  // ------------------------------------------------------------------
  // Lifecycle transitions
  // ------------------------------------------------------------------

  /** Open registrations (DRAFT → REGISTRATION_OPEN) */
  app.post("/api/admin/tournaments/:id/open-registration", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage", prisma);
    const { id } = routeParams(request);
    await transitionTournamentStatus(id, "REGISTRATION_OPEN", admin.id);
    auditFromRequest(request, {
      actorType: "user", actorId: admin.id, action: "admin.tournament.registration.opened",
      category: "admin", targetType: "tournament", targetId: id,
    });
    return { ok: true, status: "REGISTRATION_OPEN" };
  });

  /** Close registrations (REGISTRATION_OPEN → REGISTRATION_CLOSED) */
  app.post("/api/admin/tournaments/:id/close-registration", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage", prisma);
    const { id } = routeParams(request);
    await transitionTournamentStatus(id, "REGISTRATION_CLOSED", admin.id);
    auditFromRequest(request, {
      actorType: "user", actorId: admin.id, action: "admin.tournament.registration.closed",
      category: "admin", targetType: "tournament", targetId: id,
    });
    return { ok: true, status: "REGISTRATION_CLOSED" };
  });

  /** Start tournament — generates bracket, transitions to IN_PROGRESS */
  app.post("/api/admin/tournaments/:id/start", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage", prisma);
    const { id } = routeParams(request);
    await startTournament(id, admin.id);
    auditFromRequest(request, {
      actorType: "user", actorId: admin.id, action: "admin.tournament.started",
      category: "admin", targetType: "tournament", targetId: id,
    });
    return { ok: true, status: "IN_PROGRESS" };
  });

  /** Pause tournament */
  app.post("/api/admin/tournaments/:id/pause", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage", prisma);
    const { id } = routeParams(request);
    await transitionTournamentStatus(id, "PAUSED", admin.id);
    auditFromRequest(request, {
      actorType: "user", actorId: admin.id, action: "admin.tournament.paused",
      category: "admin", targetType: "tournament", targetId: id,
    });
    void broadcastAdminAnalytics("admin:analytics:tournament-updated", {
      tournamentId: id,
      status: "PAUSED",
      timestamp: new Date().toISOString(),
    });
    TournamentAnalyticsCache.invalidateTournaments(id);
    return { ok: true, status: "PAUSED" };
  });

  /** Resume tournament */
  app.post("/api/admin/tournaments/:id/resume", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage", prisma);
    const { id } = routeParams(request);
    await transitionTournamentStatus(id, "IN_PROGRESS", admin.id);
    auditFromRequest(request, {
      actorType: "user", actorId: admin.id, action: "admin.tournament.resumed",
      category: "admin", targetType: "tournament", targetId: id,
    });
    void broadcastAdminAnalytics("admin:analytics:tournament-updated", {
      tournamentId: id,
      status: "IN_PROGRESS",
      timestamp: new Date().toISOString(),
    });
    TournamentAnalyticsCache.invalidateTournaments(id);
    return { ok: true, status: "IN_PROGRESS" };
  });

  /** Cancellation preview (financial impact before cancellation) */
  app.get("/api/admin/tournaments/:id/cancellation-preview", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view", prisma);
    const { id } = routeParams(request);
    const { RefundService } = await import("../services/refundService");
    return RefundService.getCancellationPreview(id);
  });

  /** Cancel tournament with player refunds */
  app.post("/api/admin/tournaments/:id/cancel", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage", prisma);
    const { id } = routeParams(request);
    const body = parseSchema(statusChangeSchema, request.body ?? {});
    await cancelTournamentWithRefunds(id, body.reason ?? "Cancelled by admin", admin.id);
    auditFromRequest(request, {
      actorType: "user", actorId: admin.id, action: "admin.tournament.cancelled",
      category: "admin", targetType: "tournament", targetId: id,
      meta: { reason: body.reason },
    });
    void broadcastAdminAnalytics("admin:analytics:tournament-updated", {
      tournamentId: id,
      status: "CANCELLED",
      timestamp: new Date().toISOString(),
    });
    void broadcastAdminAnalytics("admin:analytics:refund-updated", {
      tournamentId: id,
      status: "COMPLETED",
      timestamp: new Date().toISOString(),
    });
    TournamentAnalyticsCache.invalidateTournaments(id);
    TournamentAnalyticsCache.invalidateRefunds(id);
    return { ok: true, status: "CANCELLED" };
  });

  /** Get tournament refund summary and record ledger */
  app.get("/api/admin/tournaments/:id/refunds", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view", prisma);
    const { id } = routeParams(request);
    const { RefundService } = await import("../services/refundService");
    return RefundService.listTournamentRefunds(id);
  });

  /** Retry failed tournament refunds (admin recovery) */
  app.post("/api/admin/tournaments/:id/refunds/retry", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage", prisma);
    const { id } = routeParams(request);
    const retrySchema = z.object({
      reason: z.string().trim().min(3).max(300),
      targetUserId: z.string().optional(),
    });
    const body = parseSchema(retrySchema, request.body);
    const { RefundService } = await import("../services/refundService");
    const result = await RefundService.retryFailedTournamentRefunds(id, admin.id, body.reason, body.targetUserId);
    auditFromRequest(request, {
      actorType: "user",
      actorId: admin.id,
      action: "admin.tournament.refunds.retried",
      category: "admin",
      targetType: "tournament",
      targetId: id,
      meta: { ...result, reason: body.reason },
    });
    void broadcastAdminAnalytics("admin:analytics:refund-updated", {
      tournamentId: id,
      status: "COMPLETED",
      timestamp: new Date().toISOString(),
    });
    TournamentAnalyticsCache.invalidateRefunds(id);
    return result;
  });

  /** Force-settle (admin override) */
  app.post("/api/admin/tournaments/:id/settle", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage", prisma);
    const { id } = routeParams(request);
    await settleTournament(id);
    auditFromRequest(request, {
      actorType: "user", actorId: admin.id, action: "admin.tournament.settled",
      category: "admin", targetType: "tournament", targetId: id,
    });
    TournamentAnalyticsCache.invalidateSettlements(id);
    return { ok: true, status: "SETTLED" };
  });

  /** Create a match for a specific ready bracket slot (admin override) */
  app.post("/api/admin/tournaments/:id/slots/:slotId/create-match", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage", prisma);
    const { slotId } = routeParams(request);
    const matchId = await createTournamentMatch(slotId);
    auditFromRequest(request, {
      actorType: "user", actorId: admin.id, action: "admin.tournament.match.created",
      category: "admin", targetType: "tournamentRound", targetId: slotId,
      meta: { matchId },
    });
    return { ok: true, matchId };
  });

  /** Delete tournament (only DRAFT/CANCELLED) */
  app.delete("/api/admin/tournaments/:id", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage", prisma);
    const { id } = routeParams(request);
    const existing = await prisma.tournament.findUnique({ where: { id }, select: { status: true } });
    if (!existing) throw new AppError("NOT_FOUND", "Tournament not found", 404);
    const deletableStatuses: TournamentStatus[] = ["DRAFT", "CANCELLED"];
    if (!deletableStatuses.includes(existing.status as TournamentStatus)) {
      throw new AppError("INVALID_ACTION", "Only DRAFT or CANCELLED tournaments can be deleted", 409);
    }
    await deleteTournament(id, admin.id);
    auditFromRequest(request, {
      actorType: "user", actorId: admin.id, action: "admin.tournament.deleted",
      category: "admin", targetType: "tournament", targetId: id,
    });
    return { ok: true };
  });

  // ------------------------------------------------------------------
  // Tournament health
  // ------------------------------------------------------------------
  app.get("/api/admin/tournaments/:id/health", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view", prisma);
    const { id } = routeParams(request);
    return getTournamentHealth(id);
  });

  // ------------------------------------------------------------------
  // Tournament reconciliation (manual trigger)
  // ------------------------------------------------------------------
  app.post("/api/admin/tournaments/:id/reconcile", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage", prisma);
    const { id } = routeParams(request);
    const result = await reconcileTournament(id);
    auditFromRequest(request, {
      actorType: "user", actorId: admin.id, action: "admin.tournament.reconciled",
      category: "admin", targetType: "tournament", targetId: id,
      meta: { repaired: result.repaired.length, warnings: result.warnings.length, errors: result.errors.length },
    });
    return result;
  });

  // ------------------------------------------------------------------
  // Tournament Disputes Queue (Admin)
  // ------------------------------------------------------------------
  app.get("/api/admin/tournaments/disputes", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "tournaments.disputes.view", prisma);
    const q = queryParams(request);
    const { page, pageSize } = clampPagination(queryString(q.page), queryString(q.pageSize));
    const { listAdminDisputes } = await import("../services/tournamentDisputeService");
    return listAdminDisputes({
      status: queryString(q.status),
      priority: queryString(q.priority),
      tournamentId: queryString(q.tournamentId),
      gameId: queryString(q.gameId),
      page,
      pageSize,
    });
  });

  // ------------------------------------------------------------------
  // Tournament Dispute Detail (Admin)
  // ------------------------------------------------------------------
  app.get("/api/admin/tournaments/disputes/:id", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "tournaments.disputes.view", prisma);
    const { id } = routeParams(request);
    const { getDisputeDetail } = await import("../services/tournamentDisputeService");
    return getDisputeDetail(id, admin.id, true);
  });

  // ------------------------------------------------------------------
  // Resolve Tournament Dispute (Admin)
  // ------------------------------------------------------------------
  app.post("/api/admin/tournaments/disputes/:id/resolve", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "tournaments.disputes.review", prisma);
    const { id } = routeParams(request);
    const body = request.body as any;
    const { resolveTournamentDispute } = await import("../services/tournamentDisputeService");
    return resolveTournamentDispute(admin.id, id, body);
  });

  // ------------------------------------------------------------------
  // Tournament Settlements Queue & KPIs (Admin)
  // ------------------------------------------------------------------
  app.get("/api/admin/tournaments/:id/settlements", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view", prisma);
    const { id } = routeParams(request);
    const q = queryParams(request);
    const status = queryString(q.status) as any;
    const { TournamentSettlementService } = await import("../services/tournamentSettlementService");
    return TournamentSettlementService.listTournamentSettlements(id, { status });
  });

  // ------------------------------------------------------------------
  // Retry Tournament Settlements (Admin Recovery Action)
  // ------------------------------------------------------------------
  app.post("/api/admin/tournaments/:id/settlements/retry", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage", prisma);
    const { id } = routeParams(request);
    const body = (request.body as any) || {};
    const { TournamentSettlementService } = await import("../services/tournamentSettlementService");
    const result = await TournamentSettlementService.retryFailedSettlements(
      id,
      admin.id,
      body.reason || "Admin settlement retry",
      body.prizeId,
    );
    void broadcastAdminAnalytics("admin:analytics:settlement-updated", {
      tournamentId: id,
      prizeId: body.prizeId,
      status: "PAID",
      timestamp: new Date().toISOString(),
    });
    return result;
  });

  // ------------------------------------------------------------------
  // Admin Tournament Leaderboard & Standings
  // ------------------------------------------------------------------
  app.get("/api/admin/tournaments/:id/leaderboard", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view", prisma);
    const { id } = routeParams(request);
    const q = queryParams(request);
    const page = q.page ? parseInt(queryString(q.page), 10) : 1;
    const pageSize = q.pageSize ? parseInt(queryString(q.pageSize), 10) : 50;
    const search = queryString(q.search);
    const status = queryString(q.status);
    const roundNumber = q.round ? parseInt(queryString(q.round), 10) : undefined;

    const { TournamentLeaderboardService } = await import("../services/tournamentLeaderboardService");
    return TournamentLeaderboardService.getTournamentLeaderboard(id, {
      page,
      pageSize,
      search,
      status,
      roundNumber,
    });
  });

  // ------------------------------------------------------------------
  // Admin Tournament Notification Monitor & Delivery Logs
  // ------------------------------------------------------------------
  app.get("/api/admin/tournaments/:id/notifications", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view", prisma);
    const { id } = routeParams(request);
    const q = queryParams(request);
    const userId = queryString(q.userId);
    const eventType = queryString(q.eventType);
    const status = queryString(q.status);

    const { TournamentEmailService } = await import("../services/tournamentEmailService");
    const emailLogs = TournamentEmailService.getEmailDeliveryRecords({
      tournamentId: id,
      userId: userId || undefined,
      eventType: eventType || undefined,
      status: status as any || undefined,
    });

    const inAppLogs = await prisma.appNotification.findMany({
      where: {
        type: "TOURNAMENT",
        ...(userId ? { userId } : {}),
        ...(eventType ? { tournamentEventType: eventType } : {}),
        ...(id ? { data: { path: ["tournamentId"], equals: id } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { id: true, username: true, displayName: true } },
      },
    });

    const sentCount = emailLogs.filter((e) => e.status === "SENT").length + inAppLogs.length;
    const pendingCount = emailLogs.filter((e) => e.status === "PENDING").length;
    const failedCount = emailLogs.filter((e) => e.status === "FAILED").length;

    return {
      summary: {
        total: emailLogs.length + inAppLogs.length,
        sent: sentCount,
        pending: pendingCount,
        failed: failedCount,
      },
      emailLogs,
      inAppLogs,
    };
  });

  // ------------------------------------------------------------------
  // Admin Email Delivery Retry
  // ------------------------------------------------------------------
  app.post("/api/admin/tournaments/emails/:id/retry", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage", prisma);
    const { id } = routeParams(request);
    const { TournamentEmailService } = await import("../services/tournamentEmailService");
    const record = await TournamentEmailService.retryFailedEmail(id, admin.id);
    return { success: true, record };
  });

  // ------------------------------------------------------------------
  // Scheduler Info & Controls
  // ------------------------------------------------------------------
  app.get("/api/admin/tournaments/scheduler", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view", prisma);
    const { getHourlySchedulerInfo } = await import("../services/hourlyTournamentScheduler");
    return getHourlySchedulerInfo();
  });

  app.post("/api/admin/tournaments/scheduler/toggle", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage", prisma);
    const body = (request.body as { paused: boolean; reason?: string }) || {};
    const { setHourlySchedulerPaused, getHourlySchedulerInfo } = await import("../services/hourlyTournamentScheduler");
    setHourlySchedulerPaused(Boolean(body.paused), admin.id, body.reason);
    return getHourlySchedulerInfo();
  });

  app.get("/api/admin/tournaments/scheduler/preview", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view", prisma);
    const q = queryParams(request);
    const hours = q.hours ? parseInt(queryString(q.hours), 10) : 6;
    const { getHourlySchedulerPreview } = await import("../services/hourlyTournamentScheduler");
    return getHourlySchedulerPreview(hours);
  });

  // ------------------------------------------------------------------
  // Game-Tier Availability Matrix
  // ------------------------------------------------------------------
  app.get("/api/admin/tournaments/game-tiers", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view", prisma);
    const { getGameTierAvailabilityMatrix } = await import("../services/hourlyTournamentScheduler");
    return getGameTierAvailabilityMatrix();
  });

  app.put("/api/admin/tournaments/game-tiers", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage", prisma);
    const matrix = request.body as any;
    const { updateGameTierAvailabilityMatrix } = await import("../services/hourlyTournamentScheduler");
    return updateGameTierAvailabilityMatrix(matrix, admin.id);
  });

  // ------------------------------------------------------------------
  // Authoritative Financial Summary
  // ------------------------------------------------------------------
  app.get("/api/admin/tournaments/:id/financials", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view", prisma);
    const { id } = routeParams(request);

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        players: { select: { id: true, userId: true } },
        prizes: true,
      },
    });

    if (!tournament) throw new AppError("NOT_FOUND", "Tournament not found", 404);

    const entryFee = tournament.entryFee;
    const registeredPlayers = tournament.players.length;
    const totalCollected = entryFee * registeredPlayers;
    const configuredPrizePool = tournament.prizePool;
    const platformShare = Math.max(0, totalCollected - configuredPrizePool);

    const distributedPrize = tournament.prizes
      .filter((p) => p.status === "PAID")
      .reduce((sum, p) => sum + p.amount, 0);

    const pendingSettlementCount = tournament.prizes.filter((p) => p.status === "PENDING").length;
    const failedSettlementCount = tournament.prizes.filter((p) => p.status === "FAILED").length;

    return {
      tournamentId: tournament.id,
      entryFee,
      registeredPlayers,
      totalCollected,
      configuredPrizePool,
      platformShare,
      distributedPrize,
      pendingSettlementCount,
      failedSettlementCount,
      status: tournament.status,
    };
  });

  // ------------------------------------------------------------------
  // Operational Data Export (CSV / JSON)
  // ------------------------------------------------------------------
  app.get("/api/admin/tournaments/export", { preHandler: authenticate }, async (request, reply) => {
    await requirePermission(request, "admin:tournaments:view", prisma);
    const q = queryParams(request);
    const format = queryString(q.format) || "json";

    const tournaments = await prisma.tournament.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        _count: { select: { players: true } },
        prizes: true,
      },
    });

    const exportData = tournaments.map((t) => {
      const totalCollected = t.entryFee * t._count.players;
      const totalDistributed = t.prizes
        .filter((p) => p.status === "PAID")
        .reduce((sum, p) => sum + p.amount, 0);

      return {
        tournamentId: t.id,
        title: t.title,
        gameId: t.gameId,
        tier: (t.configSnapshot as any)?.tierName ?? "Standard",
        status: t.status,
        startTime: t.startTime.toISOString(),
        entryFee: t.entryFee,
        prizePool: t.prizePool,
        totalCollected,
        totalDistributed,
        participantCount: t._count.players,
      };
    });

    if (format === "csv") {
      const headers = [
        "Tournament ID",
        "Title",
        "Game",
        "Tier",
        "Status",
        "Start Time",
        "Entry Fee",
        "Prize Pool",
        "Total Collected",
        "Total Distributed",
        "Participants",
      ];
      const rows = exportData.map((d) => [
        `"${d.tournamentId}"`,
        `"${d.title}"`,
        `"${d.gameId}"`,
        `"${d.tier}"`,
        `"${d.status}"`,
        `"${d.startTime}"`,
        d.entryFee,
        d.prizePool,
        d.totalCollected,
        d.totalDistributed,
        d.participantCount,
      ]);
      const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

      reply.header("Content-Type", "text/csv");
      reply.header("Content-Disposition", `attachment; filename=tournaments-export-${Date.now()}.csv`);
      return reply.send(csv);
    }

    return exportData;
  });

  // ------------------------------------------------------------------
  // Complete Tournament Analytics & Performance System
  // ------------------------------------------------------------------
  app.get("/api/admin/tournaments/analytics", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view", prisma);
    const q = queryParams(request);
    const timeFilter = queryString(q.timeFilter) as any;
    const fromDate = queryString(q.fromDate);
    const toDate = queryString(q.toDate);
    const gameId = queryString(q.gameId);
    const tier = queryString(q.tier);
    const tournamentId = queryString(q.tournamentId);

    const { TournamentAnalyticsService } = await import("../services/tournamentAnalyticsService");
    return TournamentAnalyticsService.getTournamentAnalytics({
      timeFilter,
      fromDate,
      toDate,
      gameId,
      tier,
      tournamentId,
    });
  });

  // ------------------------------------------------------------------
  // Operational Health Overview & Stuck Detection
  // ------------------------------------------------------------------
  app.get("/api/admin/tournaments/health-overview", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view", prisma);
    const { TournamentAnalyticsService } = await import("../services/tournamentAnalyticsService");
    return TournamentAnalyticsService.getTournamentHealthOverview();
  });

  // ------------------------------------------------------------------
  // Data Validation & Financial Cross-Check Layer
  // ------------------------------------------------------------------
  app.get("/api/admin/tournaments/analytics/validate", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view", prisma);
    const q = queryParams(request);
    const gameId = queryString(q.gameId);
    const { TournamentValidationService } = await import("../services/tournamentValidationService");
    return TournamentValidationService.validateTournamentAnalytics({ gameId: gameId || undefined });
  });

  app.post("/api/admin/tournaments/analytics/validate/run", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage", prisma);
    const body = (request.body as any) || {};
    const { TournamentValidationService } = await import("../services/tournamentValidationService");
    return TournamentValidationService.validateTournamentAnalytics(body, admin.id);
  });

  // ------------------------------------------------------------------
  // Data Integrity Alerts Center
  // ------------------------------------------------------------------
  app.get("/api/admin/tournaments/integrity-alerts", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:view", prisma);
    const q = queryParams(request);
    const status = queryString(q.status) as any;
    const severity = queryString(q.severity) as any;
    const issueType = queryString(q.issueType) as any;
    const gameId = queryString(q.gameId);
    const tier = queryString(q.tier);
    const tournamentId = queryString(q.tournamentId);

    const { TournamentIntegrityAlertService } = await import("../services/tournamentIntegrityAlertService");
    return TournamentIntegrityAlertService.listAlerts({
      status,
      severity,
      issueType,
      gameId,
      tier,
      tournamentId,
    });
  });

  app.post("/api/admin/tournaments/integrity-alerts/scan", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:manage", prisma);
    const body = (request.body as any) || {};
    const { TournamentIntegrityAlertService } = await import("../services/tournamentIntegrityAlertService");
    return TournamentIntegrityAlertService.scanAndDetectAlerts(body.tournamentId);
  });

  app.patch("/api/admin/tournaments/integrity-alerts/:id/status", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:manage", prisma);
    const { id } = routeParams(request);
    const body = (request.body as any) || {};
    const { TournamentIntegrityAlertService } = await import("../services/tournamentIntegrityAlertService");
    return TournamentIntegrityAlertService.updateAlertStatus(id, body.status, admin.id, body.resolutionNotes);
  });

  // ------------------------------------------------------------------
  // Report Generation
  // ------------------------------------------------------------------
  app.post("/api/admin/tournaments/reports/generate", { preHandler: authenticate }, async (request) => {
    const admin = await requirePermission(request, "admin:tournaments:view", prisma);
    const body = request.body as any;
    const { TournamentAnalyticsService } = await import("../services/tournamentAnalyticsService");
    return TournamentAnalyticsService.generateReport(admin.id, body, {
      ip: request.ip,
      userAgent: request.headers["user-agent"] as string,
      exportStatus: "PREVIEW",
    });
  });

  // ------------------------------------------------------------------
  // Sanitized CSV Export for Reports
  // ------------------------------------------------------------------
  app.get("/api/admin/tournaments/reports/export-csv", { preHandler: authenticate }, async (request, reply) => {
    const admin = await requirePermission(request, "admin:tournaments:view", prisma);
    const q = queryParams(request);
    const reportType = (queryString(q.reportType) || "TOURNAMENT") as any;
    const timeFilter = queryString(q.timeFilter) as any;
    const fromDate = queryString(q.fromDate);
    const toDate = queryString(q.toDate);
    const gameId = queryString(q.gameId);
    const tier = queryString(q.tier);
    const status = queryString(q.status);

    const { TournamentAnalyticsService } = await import("../services/tournamentAnalyticsService");
    const report = await TournamentAnalyticsService.generateReport(
      admin.id,
      {
        reportType,
        timeFilter,
        fromDate,
        toDate,
        gameId,
        tier,
        status,
      },
      {
        ip: request.ip,
        userAgent: request.headers["user-agent"] as string,
        exportStatus: "EXPORTED_CSV",
      },
    );

    const csv = TournamentAnalyticsService.exportCsv(report);
    const filenameType = String(reportType).toLowerCase().replace(/_/g, "-");
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="tournament-report-${filenameType}-${Date.now()}.csv"`);
    reply.header("Cache-Control", "no-cache, no-store, must-revalidate");
    return reply.send(csv);
  });
}

