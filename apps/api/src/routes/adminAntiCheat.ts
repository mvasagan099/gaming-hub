import type { FastifyInstance } from "fastify";
import { prisma } from "@gaming-hub/db";
import { authenticate } from "../plugins/authenticate";
import { requirePermission } from "../lib/permissions";
import { parseSchema, queryParams } from "../lib/http";
import {
  securityEventQuerySchema,
  type SecurityEventRecord,
  type SecurityEventType,
  type SecuritySeverity,
} from "@gaming-hub/shared";
import { z } from "zod";

// In-memory anti-cheat security events buffer (fast read layer).
// MEDIUM-2 fix: events are also persisted to the SecurityEvent DB table so they
// survive server restarts, crashes, and rolling deployments.
const securityEventsBuffer: SecurityEventRecord[] = [];

export function recordApiSecurityEvent(event: Omit<SecurityEventRecord, "id" | "timestamp">): SecurityEventRecord {
  const record: SecurityEventRecord = {
    ...event,
    id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };
  securityEventsBuffer.unshift(record);
  if (securityEventsBuffer.length > 5000) {
    securityEventsBuffer.pop();
  }

  // MEDIUM-2: persist to DB asynchronously (fire-and-forget with error logging).
  prisma.securityEvent.create({
    data: {
      id: record.id,
      matchId: record.matchId ?? null,
      roomId: record.roomId ?? null,
      userId: record.userId,
      gameId: record.gameId ?? null,
      eventType: record.eventType,
      severity: record.severity,
      details: (record.details ?? {}) as object,
      actionTaken: record.actionTaken,
      timestamp: BigInt(record.timestamp),
    },
  }).catch((err: unknown) => {
    console.error("[antiCheat] Failed to persist SecurityEvent to DB:", err);
  });

  return record;
}

export async function adminAntiCheatRoutes(app: FastifyInstance) {
  // Query Anti-Cheat Events (Admin only)
  app.get(
    "/api/admin/security/anti-cheat/events",
    { preHandler: authenticate },
    async (request) => {
      await requirePermission(request, "admin:games:view", prisma);
      const query = parseSchema(securityEventQuerySchema, queryParams(request));

      let filtered = [...securityEventsBuffer];
      if (query.gameId) filtered = filtered.filter((e) => e.gameId === query.gameId);
      if (query.userId) filtered = filtered.filter((e) => e.userId === query.userId);
      if (query.matchId) filtered = filtered.filter((e) => e.matchId === query.matchId);
      if (query.eventType) filtered = filtered.filter((e) => e.eventType === query.eventType);
      if (query.severity) filtered = filtered.filter((e) => e.severity === query.severity);

      const total = filtered.length;
      const page = query.page;
      const pageSize = query.pageSize;
      const items = filtered.slice((page - 1) * pageSize, page * pageSize);

      return {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    },
  );

  // Summary statistics for anti-cheat dashboard
  // MEDIUM-2: stats are now read from DB for accuracy across restarts.
  app.get(
    "/api/admin/security/anti-cheat/stats",
    { preHandler: authenticate },
    async (request) => {
      await requirePermission(request, "admin:games:view", prisma);

      const [totalEvents, bySeverityRows, byEventTypeRows] = await Promise.all([
        prisma.securityEvent.count(),
        prisma.securityEvent.groupBy({ by: ["severity"], _count: { _all: true } }),
        prisma.securityEvent.groupBy({ by: ["eventType"], _count: { _all: true } }),
      ]);

      const bySeverity: Record<SecuritySeverity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
      for (const row of bySeverityRows) {
        bySeverity[row.severity as SecuritySeverity] = row._count._all;
      }

      const byEventType: Partial<Record<SecurityEventType, number>> = {};
      for (const row of byEventTypeRows) {
        byEventType[row.eventType as SecurityEventType] = row._count._all;
      }

      return { totalEvents, bySeverity, byEventType };
    },
  );

  // Ingest security event (e.g. from internal socket server or edge gateway)
  app.post(
    "/api/admin/security/anti-cheat/events",
    { preHandler: authenticate },
    async (request) => {
      // MEDIUM-1 fix: gate on admin permission, consistent with the two GET routes above.
      await requirePermission(request, "admin:games:view", prisma);

      const bodySchema = z.object({
        matchId: z.string().optional(),
        roomId: z.string().optional(),
        userId: z.string(),
        gameId: z.string().optional(),
        eventType: z.enum([
          "IMPOSSIBLE_ACTION",
          "RATE_LIMIT_EXCEEDED",
          "STALE_ACTION_SPAM",
          "INVALID_STATE",
          "DUPLICATE_ACTION_SPAM",
          "RECONNECT_ABUSE",
          "SOCKET_AUTH_FAILURE",
          "IMPOSSIBLE_MOVEMENT",
          "SCORE_TAMPERING_ATTEMPT",
          "TIMER_TAMPERING_ATTEMPT",
          "WRONG_TURN",
          "ROOM_SPOOFING",
          "CLIENT_FORGED_WINNER",
        ]),
        severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
        details: z.record(z.string(), z.unknown()).default({}),
        actionTaken: z.enum(["LOG", "RATE_LIMIT", "REJECT_ACTION", "FLAGGED_FOR_REVIEW"]).default("LOG"),
      });

      const body = parseSchema(bodySchema, request.body);
      const record = recordApiSecurityEvent(body);

      return { ok: true, data: record };
    },
  );
}
