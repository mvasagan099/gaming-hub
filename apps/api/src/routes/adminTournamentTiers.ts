/**
 * Admin Tournament Tier Routes
 *
 * Provides CRUD endpoints for managing TournamentTier configurations.
 * All modifications to tiers apply ONLY to future hourly tournament instances;
 * already-created instances are frozen via their configSnapshot and are
 * not affected by tier changes.
 *
 * Permission: admin:tournaments:manage
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { DEFAULT_TOURNAMENT_TIERS, validatePrizeConfiguration } from "@gaming-hub/shared";
import type { PrizeDistributionEntry } from "@gaming-hub/shared";
import { authenticate, requireMfa } from "../plugins/authenticate";
import { parseSchema, routeParams, queryParams, queryString } from "../lib/http";
import { requirePermission } from "../lib/permissions";
import { auditFromRequest } from "../services/audit";

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const prizeDistributionSchema = z.array(
  z.object({
    rank: z.number().int().min(1).max(10),
    percentage: z.number().min(0).max(100),
  }),
);

const tierBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  code: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .regex(/^[a-z0-9-]+$/, "Code must be lowercase alphanumeric with hyphens"),
  description: z.string().trim().max(500).nullable().optional(),
  entryFee: z.number().int().min(0),
  maxPlayers: z.number().int().min(2).max(10_000),
  prizePool: z.number().int().min(0),
  prizeDistribution: prizeDistributionSchema.optional(),
  gameId: z.string().min(1).nullable().optional(),
  format: z
    .enum(["SINGLE_ELIMINATION", "BRACKET", "KNOCKOUT", "ROUND_ROBIN", "SWISS"])
    .optional(),
  enableThirdPlace: z.boolean().optional(),
  autoStartWhenFull: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const updateTierBodySchema = tierBodySchema.partial();

// ---------------------------------------------------------------------------
// Helper: format DB row → API response
// ---------------------------------------------------------------------------

function formatTier(tier: Record<string, unknown>) {
  return {
    id: tier.id,
    name: tier.name,
    code: tier.code,
    description: tier.description ?? null,
    entryFee: tier.entryFee,
    maxPlayers: tier.maxPlayers,
    prizePool: tier.prizePool,
    prizeDistribution: tier.prizeDistribution,
    gameId: tier.gameId ?? null,
    format: tier.format,
    enableThirdPlace: tier.enableThirdPlace,
    autoStartWhenFull: tier.autoStartWhenFull,
    isActive: tier.isActive,
    sortOrder: tier.sortOrder,
    createdAt: (tier.createdAt as Date).toISOString(),
    updatedAt: (tier.updatedAt as Date).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Prize distribution validator
// ---------------------------------------------------------------------------

function assertValidPrizeDistribution(prizePool: number, dist: PrizeDistributionEntry[]) {
  if (!dist || dist.length === 0) return; // empty = allow (defaults will be used)
  const validation = validatePrizeConfiguration(prizePool, dist);
  if (!validation.valid) {
    throw new AppError("VALIDATION_ERROR", validation.error ?? "Invalid prize distribution", 400);
  }
  const total = dist.reduce((s, d) => s + (d.percentage ?? 0), 0);
  if (total !== 100) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Prize distribution percentages must sum to 100 (got ${total})`,
      400,
    );
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function adminTournamentTiersRoutes(app: FastifyInstance) {
  // ------------------------------------------------------------------
  // GET /api/admin/tournament-tiers  — List all tiers
  // ------------------------------------------------------------------
  app.get("/api/admin/tournament-tiers", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:manage", prisma);
    const q = queryParams(request);
    const onlyActive = queryString(q.active) === "true";

    const tiers = await prisma.tournamentTier.findMany({
      where: onlyActive ? { isActive: true } : undefined,
      orderBy: { sortOrder: "asc" },
    });

    return { items: tiers.map((t) => formatTier(t as unknown as Record<string, unknown>)), total: tiers.length };
  });

  // ------------------------------------------------------------------
  // GET /api/admin/tournament-tiers/:id  — Get single tier
  // ------------------------------------------------------------------
  app.get("/api/admin/tournament-tiers/:id", { preHandler: authenticate }, async (request) => {
    await requirePermission(request, "admin:tournaments:manage", prisma);
    const { id } = routeParams(request);

    const tier = await prisma.tournamentTier.findUnique({ where: { id } });
    if (!tier) throw new AppError("NOT_FOUND", "Tournament tier not found", 404);

    // Count how many tournament instances have been created from this tier
    const instanceCount = await prisma.tournamentTierScheduleLog.count({ where: { tierId: id } });

    return { ...formatTier(tier as unknown as Record<string, unknown>), instanceCount };
  });

  // ------------------------------------------------------------------
  // POST /api/admin/tournament-tiers  — Create tier
  // ------------------------------------------------------------------
  app.post("/api/admin/tournament-tiers", { preHandler: [authenticate, requireMfa] }, async (request) => {
    await requirePermission(request, "admin:tournaments:manage", prisma);
    const body = parseSchema(tierBodySchema, request.body);

    const dist = (body.prizeDistribution ?? []) as PrizeDistributionEntry[];
    assertValidPrizeDistribution(body.prizePool, dist);

    // Ensure code is unique
    const exists = await prisma.tournamentTier.findUnique({ where: { code: body.code } });
    if (exists) {
      throw new AppError("CONFLICT", `A tier with code "${body.code}" already exists`, 409);
    }

    const tier = await prisma.tournamentTier.create({
      data: {
        name: body.name,
        code: body.code,
        description: body.description ?? null,
        entryFee: body.entryFee,
        maxPlayers: body.maxPlayers,
        prizePool: body.prizePool,
        prizeDistribution: dist.length > 0 ? (dist as unknown as import("@gaming-hub/db").Prisma.InputJsonValue) : [],
        gameId: body.gameId ?? null,
        format: body.format ?? "SINGLE_ELIMINATION",
        enableThirdPlace: body.enableThirdPlace ?? true,
        autoStartWhenFull: body.autoStartWhenFull ?? false,
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 0,
        createdBy: (request as any).user?.id ?? null,
      },
    });

    auditFromRequest(request, {
      action: "admin.tournament_tier.created",
      category: "game",
      targetType: "tournament_tier",
      targetId: tier.id,
      meta: { code: tier.code, name: tier.name },
    });

    return { ok: true, tier: formatTier(tier as unknown as Record<string, unknown>) };
  });

  // ------------------------------------------------------------------
  // PUT /api/admin/tournament-tiers/:id  — Full update
  // ------------------------------------------------------------------
  app.put("/api/admin/tournament-tiers/:id", { preHandler: [authenticate, requireMfa] }, async (request) => {
    await requirePermission(request, "admin:tournaments:manage", prisma);
    const { id } = routeParams(request);
    const body = parseSchema(tierBodySchema, request.body);

    const existing = await prisma.tournamentTier.findUnique({ where: { id } });
    if (!existing) throw new AppError("NOT_FOUND", "Tournament tier not found", 404);

    const dist = (body.prizeDistribution ?? []) as PrizeDistributionEntry[];
    assertValidPrizeDistribution(body.prizePool, dist);

    // Ensure new code doesn't collide with another tier
    if (body.code !== existing.code) {
      const collision = await prisma.tournamentTier.findUnique({ where: { code: body.code } });
      if (collision) {
        throw new AppError("CONFLICT", `A tier with code "${body.code}" already exists`, 409);
      }
    }

    const updated = await prisma.tournamentTier.update({
      where: { id },
      data: {
        name: body.name,
        code: body.code,
        description: body.description ?? null,
        entryFee: body.entryFee,
        maxPlayers: body.maxPlayers,
        prizePool: body.prizePool,
        prizeDistribution: dist.length > 0 ? (dist as unknown as import("@gaming-hub/db").Prisma.InputJsonValue) : [],
        gameId: body.gameId ?? null,
        format: body.format ?? "SINGLE_ELIMINATION",
        enableThirdPlace: body.enableThirdPlace ?? true,
        autoStartWhenFull: body.autoStartWhenFull ?? false,
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 0,
      },
    });

    auditFromRequest(request, {
      action: "admin.tournament_tier.updated",
      category: "game",
      targetType: "tournament_tier",
      targetId: id,
      meta: { code: updated.code },
    });

    return { ok: true, tier: formatTier(updated as unknown as Record<string, unknown>) };
  });

  // ------------------------------------------------------------------
  // PATCH /api/admin/tournament-tiers/:id  — Partial update
  // ------------------------------------------------------------------
  app.patch("/api/admin/tournament-tiers/:id", { preHandler: [authenticate, requireMfa] }, async (request) => {
    await requirePermission(request, "admin:tournaments:manage", prisma);
    const { id } = routeParams(request);
    const body = parseSchema(updateTierBodySchema, request.body);

    const existing = await prisma.tournamentTier.findUnique({ where: { id } });
    if (!existing) throw new AppError("NOT_FOUND", "Tournament tier not found", 404);

    // If prizeDistribution is being updated, validate it against effective prizePool
    const effectivePrizePool = body.prizePool ?? existing.prizePool;
    const dist = body.prizeDistribution as PrizeDistributionEntry[] | undefined;
    if (dist !== undefined) {
      assertValidPrizeDistribution(effectivePrizePool, dist);
    }

    // Check code collision if code is being changed
    if (body.code !== undefined && body.code !== existing.code) {
      const collision = await prisma.tournamentTier.findUnique({ where: { code: body.code } });
      if (collision) {
        throw new AppError("CONFLICT", `A tier with code "${body.code}" already exists`, 409);
      }
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.code !== undefined) updateData.code = body.code;
    if ("description" in body) updateData.description = body.description ?? null;
    if (body.entryFee !== undefined) updateData.entryFee = body.entryFee;
    if (body.maxPlayers !== undefined) updateData.maxPlayers = body.maxPlayers;
    if (body.prizePool !== undefined) updateData.prizePool = body.prizePool;
    if (dist !== undefined) updateData.prizeDistribution = dist;
    if ("gameId" in body) updateData.gameId = body.gameId ?? null;
    if (body.format !== undefined) updateData.format = body.format;
    if (body.enableThirdPlace !== undefined) updateData.enableThirdPlace = body.enableThirdPlace;
    if (body.autoStartWhenFull !== undefined) updateData.autoStartWhenFull = body.autoStartWhenFull;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;

    const updated = await prisma.tournamentTier.update({
      where: { id },
      data: updateData,
    });

    auditFromRequest(request, {
      action: "admin.tournament_tier.patched",
      category: "game",
      targetType: "tournament_tier",
      targetId: id,
      meta: { fields: Object.keys(updateData) },
    });

    return { ok: true, tier: formatTier(updated as unknown as Record<string, unknown>) };
  });

  // ------------------------------------------------------------------
  // DELETE /api/admin/tournament-tiers/:id  — Deactivate (soft delete)
  // ------------------------------------------------------------------
  app.delete("/api/admin/tournament-tiers/:id", { preHandler: [authenticate, requireMfa] }, async (request) => {
    await requirePermission(request, "admin:tournaments:manage", prisma);
    const { id } = routeParams(request);

    const existing = await prisma.tournamentTier.findUnique({ where: { id } });
    if (!existing) throw new AppError("NOT_FOUND", "Tournament tier not found", 404);

    // Soft-delete: mark as inactive so no new slots are created.
    // Existing tournaments derived from this tier are unaffected.
    const updated = await prisma.tournamentTier.update({
      where: { id },
      data: { isActive: false },
    });

    auditFromRequest(request, {
      action: "admin.tournament_tier.deactivated",
      category: "game",
      targetType: "tournament_tier",
      targetId: id,
      meta: { code: existing.code },
    });

    return { ok: true, tier: formatTier(updated as unknown as Record<string, unknown>) };
  });

  // ------------------------------------------------------------------
  // POST /api/admin/tournament-tiers/seed-defaults
  // Upserts the 5 canonical default tiers. Safe to call multiple times.
  // ------------------------------------------------------------------
  app.post(
    "/api/admin/tournament-tiers/seed-defaults",
    { preHandler: [authenticate, requireMfa] },
    async (request) => {
      await requirePermission(request, "admin:tournaments:manage", prisma);

      const results: Array<{ code: string; action: "created" | "updated" }> = [];

      for (const defaults of DEFAULT_TOURNAMENT_TIERS) {
        const dist = defaults.prizeDistribution as unknown as import("@gaming-hub/db").Prisma.InputJsonValue;

        const existing = await prisma.tournamentTier.findUnique({
          where: { code: defaults.code },
        });

        if (existing) {
          // Update in case defaults changed (but never overwrite custom tiers)
          await prisma.tournamentTier.update({
            where: { code: defaults.code },
            data: {
              name: defaults.name,
              description: defaults.description ?? null,
              entryFee: defaults.entryFee,
              maxPlayers: defaults.maxPlayers,
              prizePool: defaults.prizePool,
              prizeDistribution: dist,
              format: defaults.format,
              enableThirdPlace: defaults.enableThirdPlace,
              autoStartWhenFull: defaults.autoStartWhenFull,
              sortOrder: defaults.sortOrder,
              // Do NOT overwrite isActive — admin may have intentionally disabled one
            },
          });
          results.push({ code: defaults.code, action: "updated" });
        } else {
          await prisma.tournamentTier.create({
            data: {
              name: defaults.name,
              code: defaults.code,
              description: defaults.description ?? null,
              entryFee: defaults.entryFee,
              maxPlayers: defaults.maxPlayers,
              prizePool: defaults.prizePool,
              prizeDistribution: dist,
              gameId: defaults.gameId,
              format: defaults.format,
              enableThirdPlace: defaults.enableThirdPlace,
              autoStartWhenFull: defaults.autoStartWhenFull,
              isActive: defaults.isActive,
              sortOrder: defaults.sortOrder,
              createdBy: "system:seed",
            },
          });
          results.push({ code: defaults.code, action: "created" });
        }
      }

      auditFromRequest(request, {
        action: "admin.tournament_tier.seeded_defaults",
        category: "game",
        targetType: "tournament_tier",
        targetId: null,
        meta: { results },
      });

      return { ok: true, results };
    },
  );

  // ------------------------------------------------------------------
  // GET /api/admin/tournament-tiers/:id/schedule-logs
  // Shows recent hourly tournament instances created from this tier
  // ------------------------------------------------------------------
  app.get(
    "/api/admin/tournament-tiers/:id/schedule-logs",
    { preHandler: authenticate },
    async (request) => {
      await requirePermission(request, "admin:tournaments:view", prisma);
      const { id } = routeParams(request);
      const q = queryParams(request);
      const limit = Math.min(parseInt(queryString(q.limit) ?? "24", 10), 168); // max 1 week

      const tier = await prisma.tournamentTier.findUnique({
        where: { id },
        select: { id: true, name: true, code: true },
      });
      if (!tier) throw new AppError("NOT_FOUND", "Tournament tier not found", 404);

      const logs = await prisma.tournamentTierScheduleLog.findMany({
        where: { tierId: id },
        orderBy: { slotHour: "desc" },
        take: limit,
        include: {
          tier: { select: { name: true, code: true } },
        },
      });

      // Enrich with tournament status
      const tournamentIds = logs.map((l) => l.tournamentId);
      const tournaments = await prisma.tournament.findMany({
        where: { id: { in: tournamentIds } },
        select: {
          id: true,
          status: true,
          title: true,
          startTime: true,
          _count: { select: { players: true } },
        },
      });

      const tournamentMap = new Map(tournaments.map((t) => [t.id, t]));

      return {
        tier: { id: tier.id, name: tier.name, code: tier.code },
        logs: logs.map((log) => {
          const t = tournamentMap.get(log.tournamentId);
          return {
            id: log.id,
            slotHour: log.slotHour.toISOString(),
            tournamentId: log.tournamentId,
            tournamentTitle: t?.title ?? null,
            tournamentStatus: t?.status ?? null,
            startTime: t?.startTime?.toISOString() ?? null,
            registeredPlayers: t?._count?.players ?? 0,
            createdAt: log.createdAt.toISOString(),
          };
        }),
      };
    },
  );
}
