import { randomUUID } from 'node:crypto';
import { prisma } from '@gaming-hub/db';

export interface OutboxDelivery { id: string; matchId: string; roomId: string; result: unknown; attempts: number }
/** Claims are expiring, uniquely fenced per attempt. API idempotency handles ACK loss. */
export class GameResultOutboxWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  constructor(private readonly deliver: (event: OutboxDelivery) => Promise<void>,
    private readonly db = prisma, private readonly claimMs = 30_000,
    private readonly onError: () => void = () => { console.error("DURABLE_RESULT_WORKER_UNAVAILABLE"); }) {}

  start(intervalMs = 1000) { this.timer = setInterval(() => { void this.runOnce().catch(() => this.onError()); }, intervalMs); this.timer.unref(); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  async runOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const claim = randomUUID();
      const jobs = await this.db.$queryRaw<OutboxDelivery[]>`UPDATE "GameResultOutbox" SET "status"='PROCESSING',
        "claimedBy"=${claim}, "claimExpiresAt"=CURRENT_TIMESTAMP+${this.claimMs} * interval '1 millisecond',
        "attempts"="attempts"+1, "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id" IN (SELECT "id" FROM "GameResultOutbox"
          WHERE (("status" IN ('PENDING','FAILED_RETRYABLE') AND "nextAttemptAt"<=CURRENT_TIMESTAMP)
            OR ("status"='PROCESSING' AND "claimExpiresAt"<=CURRENT_TIMESTAMP))
          ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 10)
        RETURNING "id", "matchId", "roomId", "result", "attempts"`;
      await Promise.all(jobs.map(async job => {
        try {
          await this.deliver(job);
          await this.db.gameResultOutbox.updateMany({ where: { id: job.id, claimedBy: claim, status: 'PROCESSING' },
            data: { status: 'DELIVERED', deliveredAt: new Date(), claimedBy: null, claimExpiresAt: null, lastError: null } });
        } catch {
          // Never persist transport error text: URLs/headers may contain secrets.
          const delayMs = Math.min(30_000, 500 * 2 ** Math.min(job.attempts, 6));
          await this.db.gameResultOutbox.updateMany({ where: { id: job.id, claimedBy: claim, status: 'PROCESSING' },
            data: { status: 'FAILED_RETRYABLE', nextAttemptAt: new Date(Date.now() + delayMs),
              claimedBy: null, claimExpiresAt: null, lastError: 'SETTLEMENT_DELIVERY_FAILED' } });
        }
      }));
      return jobs.length;
    } finally { this.running = false; }
  }
}
