import { prisma } from "@gaming-hub/db";
import type { HealthCheckResult } from "@gaming-hub/shared";

const startedAt = Date.now();

/**
 * Operational monitoring + analytics queries. All read-only; powers the admin
 * Monitoring and Analytics dashboards. Cheap aggregate queries, no N+1.
 */
export async function getDashboardCounts() {
  const now = new Date();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [
    users,
    onlineUsers,
    newUsersToday,
    matches,
    activeMatches,
    rooms,
    transactions,
    transactionAgg,
    tournaments,
    referrals,
    supportTickets,
    openTickets,
    errorsToday,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isOnline: true } }),
    prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.match.count(),
    prisma.match.count({ where: { status: "ACTIVE" } }),
    prisma.room.count({ where: { status: { not: "ENDED" } } }),
    prisma.transaction.count(),
    prisma.transaction.aggregate({ _sum: { amount: true } }),
    prisma.tournament.count({ where: { status: { in: ["UPCOMING", "LIVE"] } } }),
    prisma.referral.count(),
    prisma.supportTicket.count(),
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "PENDING"] } } }),
    prisma.errorEvent.count({ where: { createdAt: { gte: todayStart } } }),
  ]);

  return {
    users,
    activeUsers: onlineUsers,
    newUsersToday,
    matches,
    liveMatches: activeMatches,
    rooms,
    transactions,
    transactionVolume: transactionAgg._sum.amount ?? 0,
    tournaments,
    onlineUsers,
    referrals,
    supportTickets,
    openTickets,
    errorsToday,
  };
}

export function getSystemMetrics() {
  const mem = process.memoryUsage();
  return {
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
    },
    cpuUsage: 0,
    activeConnections: 0,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Liveness checks for each platform dependency. Latency is measured per check;
 * `degraded` signals a slow but working dependency.
 */
export async function getHealthChecks(): Promise<HealthCheckResult[]> {
  const checks: HealthCheckResult[] = [];

  // Application process itself
  checks.push({
    name: "api",
    status: "up",
    latencyMs: 0,
    detail: `pid ${process.pid}`,
  });

  // Database connectivity + latency
  const dbStart = Date.now();
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    checks.push({
      name: "database",
      status: "up",
      latencyMs: Date.now() - dbStart,
    });
  } catch (error) {
    checks.push({
      name: "database",
      status: "down",
      latencyMs: Date.now() - dbStart,
      detail: error instanceof Error ? error.message : "unreachable",
    });
  }

  // Socket server (HTTP health endpoint) when API_URL is known
  const apiUrl = process.env.API_URL;
  if (apiUrl) {
    const socketHealthUrl = apiUrl.replace(/\/api\/?$/, "/health");
    const sockStart = Date.now();
    try {
      const response = await fetch(socketHealthUrl, { signal: AbortSignal.timeout(3000) });
      checks.push({
        name: "socket",
        status: response.ok ? "up" : "degraded",
        latencyMs: Date.now() - sockStart,
        detail: `http ${response.status}`,
      });
    } catch {
      checks.push({
        name: "socket",
        status: "down",
        latencyMs: Date.now() - sockStart,
        detail: "unreachable",
      });
    }
  }

  // Redis (optional — best effort, skipped when unset)
  if (process.env.REDIS_URL) {
    const redisStart = Date.now();
    try {
      const redisUrl = new URL(process.env.REDIS_URL);
      const ok = await tcpConnect(redisUrl.hostname, Number(redisUrl.port || 6379), 2000);
      checks.push({
        name: "redis",
        status: ok ? "up" : "down",
        latencyMs: Date.now() - redisStart,
      });
    } catch {
      checks.push({
        name: "redis",
        status: "down",
        latencyMs: Date.now() - redisStart,
        detail: "unreachable",
      });
    }
  }

  // Local disk free space
  try {
    const { execFileSync } = await import("node:child_process");
    const stat = execFileSync("df", ["-k", process.cwd()], { encoding: "utf8", timeout: 2000 });
    const lines = stat.trim().split("\n");
    const parts = lines[1]?.split(/\s+/);
    const availableKb = parts && parts.length > 3 ? Number(parts[3]) : NaN;
    if (Number.isFinite(availableKb)) {
      checks.push({
        name: "disk",
        status: "up",
        latencyMs: 0,
        detail: `${Math.round((availableKb / 1024) * 100) / 100} MB free`,
      });
    }
  } catch {
    // df unavailable on this platform — report as degraded, not down.
    checks.push({ name: "disk", status: "degraded", latencyMs: 0, detail: "not measurable" });
  }

  return checks;
}

function tcpConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const { createConnection } = require("node:net") as typeof import("node:net");
    const socket = createConnection({ host, port });
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

export async function getAnalyticsSnapshot() {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [deposits, withdrawals, wagers, payouts, revenueAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { referenceType: { in: ["DEPOSIT", "ADMIN"] }, type: "CREDIT", createdAt: { gte: todayStart } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { referenceType: { in: ["WITHDRAWAL", "ADMIN"] }, type: "DEBIT", createdAt: { gte: todayStart } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { referenceType: "MATCH_WAGER", createdAt: { gte: todayStart } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { referenceType: "MATCH_PAYOUT", createdAt: { gte: todayStart } },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { referenceType: "MATCH_PAYOUT", type: "CREDIT", createdAt: { gte: todayStart } },
      _sum: { amount: true },
    }),
  ]);

  const [newUsers, activeUsers, matches] = await Promise.all([
    prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.user.count({ where: { lastSeenAt: { gte: thirtyDaysAgo } } }),
    prisma.match.count({ where: { createdAt: { gte: todayStart } } }),
  ]);

  return {
    revenue: revenueAgg._sum.amount ?? 0,
    wagers: wagers._sum.amount ?? 0,
    payouts: payouts._sum.amount ?? 0,
    deposits: deposits._sum.amount ?? 0,
    withdrawals: withdrawals._sum.amount ?? 0,
    newUsers,
    activeUsers,
    matches,
  };
}

/** Daily user-growth series for the last `days` days. */
export async function getUserGrowthSeries(days = 30) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const signups = await prisma.user.groupBy({
    by: ["createdAt"],
    where: { createdAt: { gte: start } },
    _count: { id: true },
  });

  const byDay = new Map<string, number>();
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    byDay.set(d.toISOString().slice(0, 10), 0);
  }

  for (const row of signups) {
    const key = row.createdAt.toISOString().slice(0, 10);
    if (byDay.has(key)) byDay.set(key, byDay.get(key)! + row._count.id);
  }

  return [...byDay.entries()].map(([date, value]) => ({ date, value }));
}

export async function getTransactionSeries(days = 30, referenceType?: string) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const where = {
    createdAt: { gte: start },
    ...(referenceType ? { referenceType: referenceType as never } : {}),
  };

  const rows = await prisma.transaction.groupBy({
    by: ["createdAt"],
    where,
    _count: { id: true },
    _sum: { amount: true },
  });

  const byDay = new Map<string, { count: number; amount: number }>();
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    byDay.set(d.toISOString().slice(0, 10), { count: 0, amount: 0 });
  }

  for (const row of rows) {
    const key = row.createdAt.toISOString().slice(0, 10);
    const entry = byDay.get(key);
    if (entry) {
      entry.count += row._count.id;
      entry.amount += row._sum.amount ?? 0;
    }
  }

  return [...byDay.entries()].map(([date, v]) => ({ date, value: v.amount }));
}

export async function getPopularGames() {
  const matches = await prisma.match.groupBy({
    by: ["gameId"],
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });
  return matches.map((m) => ({
    gameId: m.gameId,
    matches: m._count.id,
  }));
}

// ---------------------------------------------------------------------------
// Extended analytics (admin dashboards)
// ---------------------------------------------------------------------------

export async function getCouponUsage() {
  const rows = await prisma.couponRedemption.groupBy({
    by: ["couponId"],
    _count: { id: true },
    _sum: { value: true },
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });
  const coupons = await prisma.coupon.findMany({
    where: { id: { in: rows.map((r) => r.couponId) } },
    select: { id: true, code: true, title: true },
  });
  const byId = new Map(coupons.map((c) => [c.id, c]));
  return rows.map((r) => ({
    code: byId.get(r.couponId)?.code ?? r.couponId,
    title: byId.get(r.couponId)?.title ?? r.couponId,
    redemptions: r._count.id,
    value: r._sum.value ?? 0,
  }));
}

export async function getTournamentParticipation() {
  const rows = await prisma.tournament.findMany({
    orderBy: { startTime: "desc" },
    take: 10,
    include: { _count: { select: { players: true } } },
  });
  return rows.map((t) => ({
    title: t.title,
    format: t.format,
    status: t.status,
    registeredCount: t._count.players,
    prizePool: t.prizePool,
  }));
}

export async function getCountryDistribution() {
  const rows = await prisma.profile.groupBy({
    by: ["country"],
    _count: { userId: true },
    orderBy: { _count: { userId: "desc" } },
    take: 15,
  });
  return rows.map((r) => ({ country: r.country, users: r._count.userId }));
}

export async function getSupportStats() {
  const [byStatus, highPriority, unassigned] = await Promise.all([
    prisma.supportTicket.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
    prisma.supportTicket.count({ where: { priority: { in: ["HIGH", "URGENT"] }, status: { in: ["OPEN", "PENDING"] } } }),
    prisma.supportTicket.count({ where: { assignedTo: null, status: { in: ["OPEN", "PENDING"] } } }),
  ]);

  const counts: Record<string, number> = { OPEN: 0, PENDING: 0, RESOLVED: 0, CLOSED: 0 };
  for (const row of byStatus) {
    if (row.status in counts) counts[row.status] = row._count.id;
  }

  return {
    open: counts.OPEN,
    pending: counts.PENDING,
    resolved: counts.RESOLVED,
    closed: counts.CLOSED,
    highPriority,
    unassigned,
  };
}
