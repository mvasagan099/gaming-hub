import { prisma } from "@gaming-hub/db";
import type { Prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { getCategorySettings } from "./settings";

export type JobName =
  | "cleanup-expired-coupons"
  | "cleanup-expired-announcements"
  | "update-tournament-statuses"
  | "revoke-expired-sessions"
  | "cleanup-search-history"
  | "cleanup-error-events"
  | "tournament-scheduler";

const JOB_LABELS: Record<JobName, string> = {
  "cleanup-expired-coupons": "Mark expired coupons",
  "cleanup-expired-announcements": "Purge expired announcements",
  "update-tournament-statuses": "Advance tournament statuses",
  "revoke-expired-sessions": "Revoke stale login sessions",
  "cleanup-search-history": "Prune old search history",
  "cleanup-error-events": "Purge resolved error events",
  "tournament-scheduler": "Tournament recovery & reconciliation",
};

type JobResult = {
  processed: number;
  details?: Record<string, unknown>;
};

const RUNNING = new Set<string>();

async function runCleanupExpiredCoupons(): Promise<JobResult> {
  const result = await prisma.coupon.updateMany({
    where: { status: "ACTIVE", validUntil: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  return { processed: result.count };
}

async function runCleanupExpiredAnnouncements(): Promise<JobResult> {
  const automation = await getCategorySettings("automation");
  if (!automation.expiredAnnouncementCleanupEnabled) return { processed: 0 };
  const result = await prisma.announcement.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
  });
  return { processed: result.count };
}

async function runUpdateTournamentStatuses(): Promise<JobResult> {
  const now = new Date();
  const live = await prisma.tournament.updateMany({
    where: { status: "UPCOMING", startTime: { lte: now } },
    data: { status: "LIVE" },
  });
  const ended = await prisma.tournament.updateMany({
    where: { status: "LIVE", endTime: { lt: now } },
    data: { status: "ENDED" },
  });
  return { processed: live.count + ended.count, details: { live: live.count, ended: ended.count } };
}

async function runRevokeExpiredSessions(): Promise<JobResult> {
  const automation = await getCategorySettings("automation");
  if (!automation.sessionRevocationEnabled) return { processed: 0 };
  const cutoff = new Date(Date.now() - automation.sessionRevocationAfterDays * 24 * 60 * 60 * 1000);
  const result = await prisma.loginSession.updateMany({
    where: { revokedAt: null, createdAt: { lt: cutoff } },
    data: { revokedAt: new Date() },
  });
  return { processed: result.count };
}

async function runCleanupSearchHistory(): Promise<JobResult> {
  const automation = await getCategorySettings("automation");
  const cutoff = new Date(Date.now() - automation.cleanupRetentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.searchHistory.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return { processed: result.count };
}

async function runCleanupErrorEvents(): Promise<JobResult> {
  const automation = await getCategorySettings("automation");
  const cutoff = new Date(Date.now() - automation.cleanupRetentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.errorEvent.deleteMany({
    where: { status: "RESOLVED", createdAt: { lt: cutoff } },
  });
  return { processed: result.count };
}

async function runTournamentSchedulerJob(): Promise<JobResult> {
  const { runTournamentScheduler } = await import("./tournamentScheduler");
  const { TournamentRecoveryService } = await import("./tournamentRecoveryService");

  const [schedResult, recoveryResult] = await Promise.all([
    runTournamentScheduler(),
    TournamentRecoveryService.recoverAllTournamentStates(),
  ]);

  const processed =
    schedResult.registrationsClosed +
    schedResult.tournamentsStarted +
    schedResult.matchesRecovered +
    schedResult.resultsRecovered +
    schedResult.byesRecovered +
    schedResult.nextRoundMatchesRecovered +
    schedResult.settlementsRetried +
    recoveryResult.expiredMatchesFinalized +
    recoveryResult.nextRoundsSpawned;

  return {
    processed,
    details: {
      registrationsClosed: schedResult.registrationsClosed + recoveryResult.registrationsClosed,
      tournamentsStarted: schedResult.tournamentsStarted + recoveryResult.tournamentsStarted,
      matchesRecovered: schedResult.matchesRecovered + recoveryResult.matchesRecovered,
      expiredMatchesFinalized: recoveryResult.expiredMatchesFinalized,
      resultsRecovered: schedResult.resultsRecovered + recoveryResult.resultsProcessed,
      byesRecovered: schedResult.byesRecovered + recoveryResult.byesAdvanced,
      nextRoundMatchesRecovered: schedResult.nextRoundMatchesRecovered + recoveryResult.nextRoundsSpawned,
      staleMatchesDetected: schedResult.staleMatchesDetected,
      settlementsRetried: schedResult.settlementsRetried + recoveryResult.settlementsRetried,
      referencesCleaned: schedResult.referencesChecked.cleaned,
      inconsistencies: schedResult.referencesChecked.inconsistencies,
      errors: schedResult.errors,
    },
  };
}

const JOB_RUNNERS: Record<JobName, () => Promise<JobResult>> = {
  "cleanup-expired-coupons": runCleanupExpiredCoupons,
  "cleanup-expired-announcements": runCleanupExpiredAnnouncements,
  "update-tournament-statuses": runUpdateTournamentStatuses,
  "revoke-expired-sessions": runRevokeExpiredSessions,
  "cleanup-search-history": runCleanupSearchHistory,
  "cleanup-error-events": runCleanupErrorEvents,
  "tournament-scheduler": runTournamentSchedulerJob,
};

export function getJobList() {
  return (Object.keys(JOB_RUNNERS) as JobName[]).map((name) => ({
    name,
    label: JOB_LABELS[name],
  }));
}

/**
 * Runs a registered maintenance job, recording a CronJobRun row. Guards against
 * overlapping executions of the same job.
 */
export async function runJob(jobName: string): Promise<{ ok: boolean; processed: number; details?: Record<string, unknown> }> {
  if (!(jobName in JOB_RUNNERS)) {
    throw new AppError("NOT_FOUND", `Unknown job "${jobName}"`, 404);
  }
  if (RUNNING.has(jobName)) {
    throw new AppError("INVALID_ACTION", "This job is already running", 409);
  }

  RUNNING.add(jobName);
  const startedAt = new Date();

  try {
    const result = await JOB_RUNNERS[jobName as JobName]();
    await prisma.cronJobRun.create({
      data: {
        jobName,
        status: "SUCCESS",
        startedAt,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        meta: (result.details ?? { processed: result.processed }) as Prisma.InputJsonValue,
      },
    });
    return { ok: true, processed: result.processed, details: result.details };
  } catch (error) {
    await prisma.cronJobRun.create({
      data: {
        jobName,
        status: "FAILED",
        startedAt,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        error: error instanceof Error ? error.message.slice(0, 1000) : "Unknown error",
      },
    });
    throw error;
  } finally {
    RUNNING.delete(jobName);
  }
}

export async function runScheduledJobs(): Promise<void> {
  const automation = await getCategorySettings("automation");
  if (!automation.enabled) return;

  await runJob("update-tournament-statuses").catch(() => undefined);
  await runJob("cleanup-expired-coupons").catch(() => undefined);
  await runJob("cleanup-search-history").catch(() => undefined);
  await runJob("tournament-scheduler").catch(() => undefined);
}

export async function listJobRuns(page: number, pageSize: number) {
  const [items, total] = await Promise.all([
    prisma.cronJobRun.findMany({
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.cronJobRun.count(),
  ]);
  return {
    items: items.map((r) => ({
      id: r.id,
      jobName: r.jobName,
      status: r.status,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      durationMs: r.durationMs,
      error: r.error,
    })),
    total,
    page,
    pageSize,
  };
}
