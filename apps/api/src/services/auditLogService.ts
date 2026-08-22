import { prisma, Prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type { AuditCategory } from "./audit";

export interface AuditRecordInput {
  actorType?: "user" | "admin" | "system" | "service" | "internal";
  actorId?: string | null;
  action: string;
  category: AuditCategory;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  transactionId?: string | null;
  reason?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
}

export interface AuditLogFilter {
  actorId?: string;
  actorType?: string;
  action?: string;
  category?: AuditCategory;
  targetType?: string;
  targetId?: string;
  search?: string;
  dateFrom?: Date | string;
  dateTo?: Date | string;
}

export class AuditLogService {
  private static readonly SENSITIVE_KEYS = new Set([
    "password",
    "passwordhash",
    "token",
    "jwt",
    "secret",
    "apikey",
    "authorization",
    "creditcard",
    "cvv",
  ]);

  /**
   * Helper: Deep sanitization of objects to redact secrets and credentials
   */
  static sanitize(data: unknown): unknown {
    if (!data || typeof data !== "object") return data;

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitize(item));
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (this.SENSITIVE_KEYS.has(lower) || lower.includes("password") || lower.includes("secret")) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        sanitized[key] = this.sanitize(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * 1. Record an Immutable Audit Log Entry
   */
  static async record(entry: AuditRecordInput) {
    const metaPayload: Record<string, unknown> = {
      ...(entry.meta ? (this.sanitize(entry.meta) as Record<string, unknown>) : {}),
    };

    if (entry.requestId) metaPayload.requestId = entry.requestId;
    if (entry.transactionId) metaPayload.transactionId = entry.transactionId;
    if (entry.reason) metaPayload.reason = entry.reason;
    if (entry.before) metaPayload.before = this.sanitize(entry.before);
    if (entry.after) metaPayload.after = this.sanitize(entry.after);

    return prisma.auditLog.create({
      data: {
        actorType: entry.actorType ?? "user",
        actorId: entry.actorId ?? null,
        action: entry.action,
        category: entry.category,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        meta: Object.keys(metaPayload).length > 0 ? (metaPayload as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  }

  /**
   * 2. Query Audit Logs with Filters and Pagination
   */
  static async queryAuditLogs(filter: AuditLogFilter, page = 1, pageSize = 20) {
    const where: Prisma.AuditLogWhereInput = {};

    if (filter.actorId) where.actorId = filter.actorId;
    if (filter.actorType) where.actorType = filter.actorType;
    if (filter.action) where.action = filter.action;
    if (filter.category) where.category = filter.category;
    if (filter.targetType) where.targetType = filter.targetType;
    if (filter.targetId) where.targetId = filter.targetId;

    if (filter.dateFrom || filter.dateTo) {
      where.createdAt = {};
      if (filter.dateFrom) where.createdAt.gte = new Date(filter.dateFrom);
      if (filter.dateTo) where.createdAt.lte = new Date(filter.dateTo);
    }

    if (filter.search) {
      where.OR = [
        { action: { contains: filter.search, mode: "insensitive" } },
        { targetId: { contains: filter.search, mode: "insensitive" } },
        { actorId: { contains: filter.search, mode: "insensitive" } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * 3. Get Full Details for an Audit Log Entry
   */
  static async getAuditLogDetails(id: string) {
    const log = await prisma.auditLog.findUnique({
      where: { id },
    });

    if (!log) {
      throw new AppError("NOT_FOUND", `Audit log ${id} not found`, 404);
    }

    let actorUser = null;
    if (log.actorId) {
      actorUser = await prisma.user.findUnique({
        where: { id: log.actorId },
        select: { id: true, username: true, displayName: true, email: true, role: true },
      });
    }

    let targetUser = null;
    if (log.targetType === "user" && log.targetId) {
      targetUser = await prisma.user.findUnique({
        where: { id: log.targetId },
        select: { id: true, username: true, displayName: true, email: true },
      });
    }

    let relatedTransaction = null;
    const meta = (log.meta as Record<string, unknown>) ?? {};
    if (meta.transactionId && typeof meta.transactionId === "string") {
      relatedTransaction = await prisma.transaction.findUnique({
        where: { id: meta.transactionId },
      });
    }

    return {
      log,
      actorUser,
      targetUser,
      relatedTransaction,
    };
  }

  /**
   * 4. Export Filtered Audit Logs to CSV
   */
  static async exportAuditLogsCsv(filter: AuditLogFilter): Promise<string> {
    const { items } = await this.queryAuditLogs(filter, 1, 1000);

    const headers = ["ID", "Timestamp", "Actor Type", "Actor ID", "Action", "Category", "Target Type", "Target ID", "Reason"];
    const rows = items.map((i) => {
      const meta = (i.meta as Record<string, unknown>) ?? {};
      const reason = (meta.reason as string) ?? "";
      return [
        `"${i.id}"`,
        `"${i.createdAt.toISOString()}"`,
        `"${i.actorType}"`,
        `"${i.actorId ?? ""}"`,
        `"${i.action}"`,
        `"${i.category}"`,
        `"${i.targetType ?? ""}"`,
        `"${i.targetId ?? ""}"`,
        `"${reason.replace(/"/g, '""')}"`,
      ].join(",");
    });

    return [headers.join(","), ...rows].join("\n");
  }
}
