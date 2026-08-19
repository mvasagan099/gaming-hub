import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@gaming-hub/db";
import { AppError, clampPagination, isGameId } from "@gaming-hub/shared";
import type { TournamentStatus, TournamentFormat } from "@gaming-hub/shared";
import { authenticate } from "../plugins/authenticate";
import { parseSchema, routeParams, queryParams, queryString } from "../lib/http";
import { requirePermission } from "../lib/permissions";
import { auditFromRequest } from "../services/audit";
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
    return { ok: true, status: "IN_PROGRESS" };
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
    return { ok: true, status: "CANCELLED" };
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
}
