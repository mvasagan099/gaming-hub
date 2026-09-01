import { prisma, Prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type { ErrorSeverity, ErrorStatus } from "@gaming-hub/shared";

/**
 * Error center. Any unhandled server error is captured here (see
 * plugins/errors.ts) so operators can triage, assign severities and resolve
 * without grepping logs. Events dedupe by `code:message` fingerprint.
 */
export interface CaptureErrorInput {
  code: string;
  message: string;
  stack?: string | null;
  severity?: ErrorSeverity;
  source?: string | null;
  path?: string | null;
  method?: string | null;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown> | null;
}

export async function captureError(input: CaptureErrorInput): Promise<void> {
  const fingerprint = `${input.code}:${input.message}`;
  const existing = await prisma.errorEvent.findFirst({
    where: { code: input.code, message: input.message, status: { not: "RESOLVED" } },
    select: { id: true },
  });

  if (existing) {
    return;
  }

  await prisma.errorEvent.create({
    data: {
      code: input.code,
      message: input.message.slice(0, 2000),
      stack: input.stack?.slice(0, 8000) ?? null,
      severity: input.severity ?? "MEDIUM",
      source: input.source ?? null,
      path: input.path ?? null,
      method: input.method ?? null,
      userId: input.userId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      meta: input.meta === null || input.meta === undefined ? Prisma.JsonNull : (input.meta as Prisma.InputJsonValue),
    },
  });
}

export async function listErrors(page: number, pageSize: number, status?: ErrorStatus, severity?: ErrorSeverity) {
  const where = {
    ...(status ? { status } : {}),
    ...(severity ? { severity } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.errorEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.errorEvent.count({ where }),
  ]);

  return {
    items: items.map((e) => ({
      id: e.id,
      code: e.code,
      message: e.message,
      severity: e.severity,
      status: e.status,
      source: e.source,
      path: e.path,
      method: e.method,
      userId: e.userId,
      createdAt: e.createdAt.toISOString(),
      resolvedAt: e.resolvedAt?.toISOString() ?? null,
      count: 1,
    })),
    total,
    page,
    pageSize,
  };
}

export async function getErrorDetail(id: string) {
  const error = await prisma.errorEvent.findUnique({ where: { id } });
  if (!error) throw new AppError("NOT_FOUND", "Error not found", 404);
  return {
    id: error.id,
    code: error.code,
    message: error.message,
    stack: error.stack,
    severity: error.severity,
    status: error.status,
    source: error.source,
    path: error.path,
    method: error.method,
    userId: error.userId,
    ip: error.ip,
    userAgent: error.userAgent,
    meta: error.meta,
    createdAt: error.createdAt.toISOString(),
    resolvedAt: error.resolvedAt?.toISOString() ?? null,
  };
}

export async function setErrorStatus(id: string, status: ErrorStatus) {
  const existing = await prisma.errorEvent.findUnique({ where: { id } });
  if (!existing) throw new AppError("NOT_FOUND", "Error not found", 404);
  const error = await prisma.errorEvent.update({
    where: { id },
    data: {
      status,
      resolvedAt: status === "RESOLVED" ? new Date() : null,
    },
  });
  return error;
}

export async function errorStats() {
  const [open, investigating, resolved, ignored, critical, high, total] = await Promise.all([
    prisma.errorEvent.count({ where: { status: "OPEN" } }),
    prisma.errorEvent.count({ where: { status: "INVESTIGATING" } }),
    prisma.errorEvent.count({ where: { status: "RESOLVED" } }),
    prisma.errorEvent.count({ where: { status: "IGNORED" } }),
    prisma.errorEvent.count({ where: { severity: "CRITICAL" } }),
    prisma.errorEvent.count({ where: { severity: "HIGH" } }),
    prisma.errorEvent.count(),
  ]);
  return { open, investigating, resolved, ignored, critical, high, total };
}
