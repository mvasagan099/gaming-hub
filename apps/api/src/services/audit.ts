import type { FastifyRequest } from "fastify";
import pino from "pino";
import { prisma, Prisma } from "@gaming-hub/db";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

export type AuditCategory =
  | "auth"
  | "wallet"
  | "admin"
  | "account"
  | "game"
  | "system";

export interface AuditEntry {
  /** Who performed the action: "user", "system" (no actor) or "internal" (service-to-service). */
  actorType?: "user" | "system" | "internal";
  actorId?: string | null;
  action: string;
  category: AuditCategory;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown> | null;
}

/**
 * Writes an audit trail entry. Fire-and-forget: failures are logged and never
 * allowed to break the request path. Uses its own connection so audit rows
 * persist even when the triggering business transaction is rolled back.
 */
export function audit(entry: AuditEntry): void {
  const { meta, ...rest } = entry;
  void prisma.auditLog
    .create({
      data: {
        ...rest,
        actorType: rest.actorType ?? "user",
        meta:
          meta === null || meta === undefined
            ? Prisma.JsonNull
            : (meta as Prisma.InputJsonValue),
      },
    })
    .catch((error: unknown) => {
      logger.error({ error, entry }, "audit: failed to write audit log");
    });
}

/** Builds an audit entry from a request's transport context (IP + user agent). */
export function auditFromRequest(
  request: FastifyRequest,
  entry: Omit<AuditEntry, "ip" | "userAgent">,
): void {
  const ua = request.headers["user-agent"];
  audit({
    ...entry,
    ip: request.ip,
    userAgent: typeof ua === "string" ? ua : null,
  });
}
