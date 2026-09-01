import { prisma, Prisma } from "@gaming-hub/db";
import type { IdempotencyRecord, IdempotencyStatus } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";

export interface ExecuteOnceOptions<T> {
  key: string;
  operation: string;
  userId?: string;
  referenceId?: string;
  handler: (tx: Prisma.TransactionClient) => Promise<T>;
}

/**
 * Centralized Global Financial Idempotency Service.
 * Guarantees that financial operations (game entry, tournament registration,
 * prize distribution, settlement, refund, and adjustment) execute exactly once,
 * even when exposed to concurrent requests, double clicks, network retries,
 * socket retries, or multiple browser tabs.
 */
export class IdempotencyService {
  /**
   * Deterministic Idempotency Key Generators
   */
  static gameEntryKey(matchId: string, userId: string): string {
    return `ENTRY:${matchId}:${userId}`;
  }

  static tournamentEntryKey(tournamentId: string, userId: string): string {
    return `TOURNAMENT_ENTRY:${tournamentId}:${userId}`;
  }

  static matchSettlementKey(matchId: string): string {
    return `SETTLEMENT:${matchId}`;
  }

  static matchRefundKey(matchId: string, userId: string): string {
    return `REFUND:${matchId}:${userId}`;
  }

  static tournamentPrizeKey(tournamentId: string, userId: string, rank: number): string {
    return `PRIZE:${tournamentId}:${userId}:${rank}`;
  }

  static tournamentRefundKey(tournamentId: string, userId: string): string {
    return `TOURNAMENT_REFUND:${tournamentId}:${userId}`;
  }

  static tournamentSettlementKey(tournamentId: string): string {
    return `TOURNAMENT_SETTLEMENT:${tournamentId}`;
  }

  static adminAdjustmentKey(referenceId: string): string {
    return `ADMIN_ADJUST:${referenceId}`;
  }

  /**
   * Validates key format, length, allowed characters, and security ownership.
   */
  static validateKey(key: string, expectedPrefix?: string, expectedUserId?: string): void {
    if (!key || typeof key !== "string" || key.trim().length === 0) {
      throw new AppError("VALIDATION_ERROR", "Idempotency key is required and cannot be empty", 400);
    }
    const trimmed = key.trim();
    if (trimmed.length < 3 || trimmed.length > 255) {
      throw new AppError("VALIDATION_ERROR", "Idempotency key must be between 3 and 255 characters", 400);
    }

    // Must contain only safe characters (alphanumeric, colons, hyphens, underscores)
    const validPattern = /^[A-Za-z0-9:_\-]+$/;
    if (!validPattern.test(trimmed)) {
      throw new AppError("VALIDATION_ERROR", "Idempotency key contains invalid characters", 400);
    }

    if (expectedPrefix && !trimmed.startsWith(`${expectedPrefix}:`)) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Idempotency key prefix mismatch: expected '${expectedPrefix}'`,
        400,
      );
    }

    if (expectedUserId && !trimmed.includes(expectedUserId)) {
      throw new AppError("FORBIDDEN", "Idempotency key does not match authenticated user", 403);
    }
  }

  /**
   * Executes the given handler atomically once for the given key.
   * If the key was already completed, returns the previously stored response without re-executing.
   * If the operation fails, rolls back the entire database transaction cleanly.
   */
  static async executeOnce<T>(options: ExecuteOnceOptions<T>, maxRetries = 4): Promise<T> {
    this.validateKey(options.key, undefined, options.userId);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Fast-path: Check outside transaction if already COMPLETED
      const existing = await prisma.idempotencyRecord.findUnique({
        where: { key: options.key },
      });

      if (existing && existing.status === "COMPLETED") {
        if (options.userId && existing.userId && existing.userId !== options.userId) {
          throw new AppError("FORBIDDEN", "Idempotency key does not match authenticated user", 403);
        }
        return existing.response as T;
      }

      try {
        return await prisma.$transaction(
          async (tx) => {
            // Re-check with row lock inside transaction
            let record = await tx.idempotencyRecord.findUnique({
              where: { key: options.key },
            });

            if (record) {
              if (record.status === "COMPLETED") {
                if (options.userId && record.userId && record.userId !== options.userId) {
                  throw new AppError("FORBIDDEN", "Idempotency key does not match authenticated user", 403);
                }
                return record.response as T;
              }

              if (record.status === "PROCESSING") {
                throw new AppError(
                  "DUPLICATE_REQUEST",
                  "Operation is already being processed, please retry shortly",
                  409,
                );
              }

              // If FAILED, allow re-try by updating to PROCESSING
              await tx.idempotencyRecord.update({
                where: { key: options.key },
                data: { status: "PROCESSING", errorMessage: null },
              });
            } else {
              // First attempt: create record with status PROCESSING
              record = await tx.idempotencyRecord.create({
                data: {
                  key: options.key,
                  operation: options.operation,
                  userId: options.userId ?? null,
                  referenceId: options.referenceId ?? null,
                  status: "PROCESSING",
                },
              });
            }

            // Execute handler
            const result = await options.handler(tx);

            // Serialize result to JSON-safe payload
            const serialized = (
              result !== undefined && result !== null
                ? JSON.parse(JSON.stringify(result))
                : { ok: true }
            ) as Prisma.InputJsonValue;

            // Mark COMPLETED
            await tx.idempotencyRecord.update({
              where: { key: options.key },
              data: {
                status: "COMPLETED",
                response: serialized,
                completedAt: new Date(),
              },
            });

            return result;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            maxWait: 15000,
            timeout: 30000,
          },
        );
      } catch (err: any) {
        const isUniqueConstraint =
          err?.code === "P2002" ||
          (typeof err?.message === "string" && err.message.includes("Unique constraint failed"));

        const isDuplicateRequest = err?.code === "DUPLICATE_REQUEST";

        if ((isUniqueConstraint || isDuplicateRequest) && attempt < maxRetries) {
          // Another concurrent request is creating / processing the key simultaneously.
          // Wait briefly and retry to fetch the completed result.
          await new Promise((resolve) => setTimeout(resolve, 60 * (attempt + 1)));
          continue;
        }

        throw err;
      }
    }

    throw new AppError("CONCURRENT_OPERATION", "Concurrent operation conflict, please retry", 409);
  }

  /**
   * Retrieves an existing idempotency record by key.
   */
  static async getRecord(key: string): Promise<IdempotencyRecord | null> {
    return prisma.idempotencyRecord.findUnique({ where: { key } });
  }
}
