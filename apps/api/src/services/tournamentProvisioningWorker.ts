import { randomUUID } from 'node:crypto';
import { prisma } from '@gaming-hub/db';
import { env } from '../env';

interface ProvisionContext { matchId: string; playerIds: string[]; gameId: string; tournamentId: string; tournamentRoundId: string; tournamentMatchNumber: number }
/** Durable, expiring claims. Provisioning is idempotent under the bracket's fixed match ID. */
export async function runTournamentProvisioning() {
  const claim = randomUUID();
  const jobs = await prisma.$queryRaw<Array<{ matchId: string; context: ProvisionContext; attempts: number }>>`UPDATE "TournamentProvisionJob"
    SET status='PROVISIONING',"claimedBy"=${claim},"claimExpiresAt"=CURRENT_TIMESTAMP+interval '30 seconds',attempts=attempts+1,"updatedAt"=CURRENT_TIMESTAMP
    WHERE "matchId" IN (SELECT "matchId" FROM "TournamentProvisionJob"
      WHERE (status IN ('PENDING_PROVISION','FAILED_RETRYABLE') AND "nextAttemptAt"<=CURRENT_TIMESTAMP)
        OR (status='PROVISIONING' AND "claimExpiresAt"<=CURRENT_TIMESTAMP)
      ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 10) RETURNING "matchId",context,attempts`;
  for (const job of jobs) {
    try {
      const response = await fetch(`${process.env.SOCKET_SERVER_URL ?? (env.NODE_ENV === 'test' ? 'http://127.0.0.1:19998' : 'http://localhost:4001')}/internal/tournament/create-match`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-key': env.INTERNAL_API_KEY },
        body: JSON.stringify(job.context), redirect: 'error', signal: AbortSignal.timeout(10000) });
      const body = await response.json() as { ok: boolean; matchId?: string; roomId?: string };
      if (!response.ok || !body.ok || body.matchId !== job.matchId || !body.roomId) throw new Error('PROVISION_REJECTED');
      await prisma.$transaction(async tx => {
        const changed = await tx.tournamentProvisionJob.updateMany({ where: { matchId: job.matchId, claimedBy: claim, status: 'PROVISIONING' },
          data: { status: 'READY', readyAt: new Date(), claimedBy: null, claimExpiresAt: null, lastError: null } });
        if (!changed.count) return;
        // READY means a canonical room exists. IN_PROGRESS is set only when the game starts.
        await tx.tournamentRound.updateMany({ where: { id: job.context.tournamentRoundId, matchId: job.matchId, status: 'READY' }, data: { status: 'READY' } });
      });
      const slot = await prisma.tournamentRound.findUnique({ where: { id: job.context.tournamentRoundId } });
      if (slot) {
        const { TournamentMatchService } = await import('./tournamentMatchService');
        await TournamentMatchService.notifyMatchCreated(slot, job.matchId);
        await TournamentMatchService.emitMatchCreatedEvent(slot, job.matchId);
      }
    } catch {
      await prisma.tournamentProvisionJob.updateMany({ where: { matchId: job.matchId, claimedBy: claim, status: 'PROVISIONING' },
        data: { status: 'FAILED_RETRYABLE', nextAttemptAt: new Date(Date.now() + Math.min(30000, 500 * 2 ** Math.min(job.attempts, 6))),
          lastError: 'LIVE_PROVISION_UNAVAILABLE', claimedBy: null, claimExpiresAt: null } });
    }
  }
  return jobs.length;
}
