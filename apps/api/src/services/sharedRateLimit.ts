import { createHash } from "node:crypto";
import { prisma, Prisma } from "@gaming-hub/db";

/** Database time and one upsert provide a combined budget across replicas. */
export async function consumeSharedLimit(key: string, windowMs: number) {
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new Error("Invalid rate-limit window");
  const digest = createHash("sha256").update(key).digest("hex");
  const [row] = await prisma.$queryRaw<Array<{ current: number; ttl: number }>>(Prisma.sql`
    INSERT INTO "RateLimitWindow" ("key", "count", "expiresAt")
    VALUES (${digest}, 1, clock_timestamp() + ${windowMs} * interval '1 millisecond')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitWindow"."expiresAt" <= clock_timestamp() THEN 1
        ELSE LEAST("RateLimitWindow"."count" + 1, 1000000000) END,
      "expiresAt" = CASE WHEN "RateLimitWindow"."expiresAt" <= clock_timestamp()
        THEN clock_timestamp() + ${windowMs} * interval '1 millisecond' ELSE "RateLimitWindow"."expiresAt" END
    RETURNING "count" AS current,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("expiresAt" - clock_timestamp())) * 1000))::integer AS ttl
  `);
  // Opportunistic bounded cleanup; no process-local timer or global truncate.
  if (row.current === 1) {
    await prisma.$executeRaw(Prisma.sql`DELETE FROM "RateLimitWindow" WHERE "key" IN
      (SELECT "key" FROM "RateLimitWindow" WHERE "expiresAt" < clock_timestamp() LIMIT 100)`);
  }
  return row;
}

/** Fastify's custom store contract; database errors fail closed (skipOnError=false). */
export class PostgresRateLimitStore {
  private readonly windowMs: number;
  private readonly namespace: string;
  constructor(options: { timeWindow?: number; routeInfo?: { method?: string | string[]; url?: string }; groupId?: string } = {}) {
    this.windowMs = options.timeWindow ?? 60_000;
    this.namespace = options.groupId ?? `${options.routeInfo?.method ?? "global"}:${options.routeInfo?.url ?? "global"}`;
  }
  incr(key: string, callback: (error: Error | null, result?: { current: number; ttl: number }) => void, windowMs = this.windowMs) {
    void consumeSharedLimit(`http:${this.namespace}:${key}`, windowMs).then(
      (result) => callback(null, result), (error: Error) => callback(error),
    );
  }
  child(options: any) { return new PostgresRateLimitStore(options); }
}
