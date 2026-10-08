import { prisma } from "@gaming-hub/db";
import type { GameId } from "@gaming-hub/shared";
import type { MatchLifecycleStatus, MatchResultReason, RoomRuntime } from "./types";

export interface MatchAuditReport {
  timestamp: number;
  totalActiveRooms: number;
  totalActiveDbMatches: number;
  validMatches: number;
  stuckMatches: Array<{
    matchId: string;
    roomId?: string;
    gameId: string;
    startedAt: number;
    deadline: number;
    overdueMs: number;
  }>;
  integrityErrors: Array<{
    matchId: string;
    errorType: "DEADLINE_BEFORE_START" | "NULL_DEADLINE" | "NULL_STARTED_AT" | "DURATION_EXCEEDS_600S" | "DEADLINE_MUTATED";
    details: string;
  }>;
}

export interface MatchMetricsBreakdown {
  activeMatches: number;
  expiredMatches: number;
  timeoutFinalizations: number;
  normalCompletions: number;
  timeLimitCompletions: number;
  averageMatchDurationSec: number;
  maximumMatchDurationSec: number;
  finalizationFailures: number;
  settlementFailures: number;
}

export class MatchTimeoutMonitoringService {
  private static metrics = {
    timeoutFinalizations: 0,
    normalCompletions: 0,
    timeLimitCompletions: 0,
    finalizationFailures: 0,
    settlementFailures: 0,
    durationCount: 0,
    durationTotal: 0,
    durationMaximum: 0,
    byGame: new Map<string, {
      timeoutFinalizations: number;
      normalCompletions: number;
      timeLimitCompletions: number;
      durationCount: number;
      durationTotal: number;
      durationMaximum: number;
    }>(),
  };

  /**
   * 1. Validate state machine transitions strictly.
   */
  static validateLifecycleTransition(
    currentStatus: MatchLifecycleStatus,
    targetStatus: MatchLifecycleStatus,
  ): boolean {
    const validTransitions: Record<MatchLifecycleStatus, MatchLifecycleStatus[]> = {
      WAITING: ["PLAYERS_READY", "COUNTDOWN", "CANCELLED"],
      PLAYERS_READY: ["COUNTDOWN", "WAITING", "CANCELLED"],
      COUNTDOWN: ["MATCH_STARTED", "WAITING", "CANCELLED"],
      MATCH_STARTED: ["ACTIVE", "CANCELLED"],
      ACTIVE: ["TIME_EXPIRED", "FINALIZING", "COMPLETED"],
      TIME_EXPIRED: ["FINALIZING", "COMPLETED"],
      FINALIZING: ["COMPLETED"],
      COMPLETED: [],
      CANCELLED: [],
    };

    const allowed = validTransitions[currentStatus] ?? [];
    return allowed.includes(targetStatus);
  }

  /**
   * 2. Audit All Active Matches across rooms and database.
   */
  static async auditActiveMatches(rooms: Map<string, RoomRuntime>): Promise<MatchAuditReport> {
    const now = Date.now();
    const report: MatchAuditReport = {
      timestamp: now,
      totalActiveRooms: 0,
      totalActiveDbMatches: 0,
      validMatches: 0,
      stuckMatches: [],
      integrityErrors: [],
    };

    // Audit In-Memory Active Rooms
    for (const room of rooms.values()) {
      if (room.status !== "playing" || !room.match) continue;
      report.totalActiveRooms++;
      const match = room.match;
      const startedAt = match.matchStartedAt ?? match.startedAt;
      const deadline = match.matchDeadline;

      // Integrity Checks
      if (!startedAt) {
        report.integrityErrors.push({
          matchId: match.matchId,
          errorType: "NULL_STARTED_AT",
          details: `Room ${room.id} (${room.gameId}) has match with null startedAt`,
        });
      } else if (!deadline) {
        report.integrityErrors.push({
          matchId: match.matchId,
          errorType: "NULL_DEADLINE",
          details: `Room ${room.id} (${room.gameId}) has match with null deadline`,
        });
      } else {
        if (deadline < startedAt) {
          report.integrityErrors.push({
            matchId: match.matchId,
            errorType: "DEADLINE_BEFORE_START",
            details: `Deadline (${deadline}) is before startedAt (${startedAt})`,
          });
        }
        if (deadline - startedAt > 600_000 + 1000) {
          report.integrityErrors.push({
            matchId: match.matchId,
            errorType: "DURATION_EXCEEDS_600S",
            details: `Calculated duration (${(deadline - startedAt) / 1000}s) exceeds 600s max limit`,
          });
        }

        // Stuck match check
        if (match.matchStatus === "ACTIVE" && now > deadline) {
          report.stuckMatches.push({
            matchId: match.matchId,
            roomId: room.id,
            gameId: room.gameId,
            startedAt,
            deadline,
            overdueMs: now - deadline,
          });
        } else {
          report.validMatches++;
        }
      }
    }

    // Audit Database Active Matches
    try {
      const activeDbMatches = await prisma.match.findMany({
        where: { status: "ACTIVE" },
        include: { room: true },
      });
      report.totalActiveDbMatches = activeDbMatches.length;

      for (const dbm of activeDbMatches) {
        const startedAtMs = dbm.startedAt ? dbm.startedAt.getTime() : null;
        const deadlineMs = dbm.matchDeadline ? dbm.matchDeadline.getTime() : null;

        if (!startedAtMs) {
          report.integrityErrors.push({
            matchId: dbm.id,
            errorType: "NULL_STARTED_AT",
            details: `Database match ${dbm.id} has null startedAt`,
          });
        } else if (!deadlineMs) {
          report.integrityErrors.push({
            matchId: dbm.id,
            errorType: "NULL_DEADLINE",
            details: `Database match ${dbm.id} has null matchDeadline`,
          });
        } else if (now > deadlineMs) {
          const alreadyReported = report.stuckMatches.some((s) => s.matchId === dbm.id);
          if (!alreadyReported) {
            report.stuckMatches.push({
              matchId: dbm.id,
              roomId: dbm.roomId ?? undefined,
              gameId: dbm.gameId,
              startedAt: startedAtMs,
              deadline: deadlineMs,
              overdueMs: now - deadlineMs,
            });
          }
        }
      }
    } catch (err) {
      console.error("[MatchTimeoutMonitoring] Error querying active database matches:", err);
    }

    return report;
  }

  /**
   * 3. Track metrics for structured observability.
   */
  static recordCompletion(params: {
    gameId: string;
    resultReason: MatchResultReason;
    durationSec: number;
    success: boolean;
  }) {
    const { gameId, resultReason, durationSec, success } = params;

    if (!success) {
      this.metrics.finalizationFailures++;
      return;
    }

    if (resultReason === "TIME_LIMIT") {
      this.metrics.timeLimitCompletions++;
      this.metrics.timeoutFinalizations++;
    } else {
      this.metrics.normalCompletions++;
    }

    this.metrics.durationCount++;
    this.metrics.durationTotal += durationSec;
    this.metrics.durationMaximum = Math.max(this.metrics.durationMaximum, durationSec);

    // Track per-game
    if (!this.metrics.byGame.has(gameId)) {
      this.metrics.byGame.set(gameId, {
        timeoutFinalizations: 0,
        normalCompletions: 0,
        timeLimitCompletions: 0,
        durationCount: 0, durationTotal: 0, durationMaximum: 0,
      });
    }

    const gMetric = this.metrics.byGame.get(gameId)!;
    if (resultReason === "TIME_LIMIT") {
      gMetric.timeLimitCompletions++;
      gMetric.timeoutFinalizations++;
    } else {
      gMetric.normalCompletions++;
    }
    gMetric.durationCount++;
    gMetric.durationTotal += durationSec;
    gMetric.durationMaximum = Math.max(gMetric.durationMaximum, durationSec);
  }

  static recordSettlementFailure() {
    this.metrics.settlementFailures++;
  }

  /**
   * 4. Get live metrics summary.
   */
  static getMetricsSummary(rooms: Map<string, RoomRuntime>): {
    overall: MatchMetricsBreakdown;
    byGame: Record<string, MatchMetricsBreakdown>;
  } {
    const now = Date.now();
    let activeMatches = 0;
    let expiredMatches = 0;
    const activeByGame: Record<string, { active: number; expired: number }> = {};

    for (const room of rooms.values()) {
      if (room.status === "playing" && room.match) {
        activeMatches++;
        const g = room.gameId;
        if (!activeByGame[g]) activeByGame[g] = { active: 0, expired: 0 };
        activeByGame[g].active++;

        if (room.match.matchDeadline && now >= room.match.matchDeadline) {
          expiredMatches++;
          activeByGame[g].expired++;
        }
      }
    }

    const avgDuration = this.metrics.durationCount > 0
      ? Math.round(this.metrics.durationTotal / this.metrics.durationCount) : 0;
    const maxDuration = this.metrics.durationMaximum;

    const overall: MatchMetricsBreakdown = {
      activeMatches,
      expiredMatches,
      timeoutFinalizations: this.metrics.timeoutFinalizations,
      normalCompletions: this.metrics.normalCompletions,
      timeLimitCompletions: this.metrics.timeLimitCompletions,
      averageMatchDurationSec: avgDuration,
      maximumMatchDurationSec: maxDuration,
      finalizationFailures: this.metrics.finalizationFailures,
      settlementFailures: this.metrics.settlementFailures,
    };

    const byGame: Record<string, MatchMetricsBreakdown> = {};
    for (const [gameId, gm] of this.metrics.byGame.entries()) {
      const gAvg = gm.durationCount > 0 ? Math.round(gm.durationTotal / gm.durationCount) : 0;
      const gMax = gm.durationMaximum;

      byGame[gameId] = {
        activeMatches: activeByGame[gameId]?.active ?? 0,
        expiredMatches: activeByGame[gameId]?.expired ?? 0,
        timeoutFinalizations: gm.timeoutFinalizations,
        normalCompletions: gm.normalCompletions,
        timeLimitCompletions: gm.timeLimitCompletions,
        averageMatchDurationSec: gAvg,
        maximumMatchDurationSec: gMax,
        finalizationFailures: 0,
        settlementFailures: 0,
      };
    }

    return { overall, byGame };
  }

  /**
   * 5. Get admin live match list for real-time monitoring.
   */
  static getAdminLiveMatches(rooms: Map<string, RoomRuntime>) {
    const now = Date.now();
    const liveMatches: Array<{
      gameId: GameId;
      matchId: string;
      roomId: string;
      players: Array<{ userId: string; displayName: string; seat: number }>;
      startedAt: number;
      deadline: number;
      remainingSeconds: number;
      status: MatchLifecycleStatus;
      isExpired: boolean;
    }> = [];

    for (const room of rooms.values()) {
      if (room.status === "playing" && room.match) {
        const match = room.match;
        const startedAt = match.matchStartedAt ?? match.startedAt ?? now;
        const deadline = match.matchDeadline ?? (startedAt + 600_000);
        const remainingSeconds = Math.max(0, Math.ceil((deadline - now) / 1000));
        const participants = [...room.players.values()]
          .filter((p) => !p.isSpectator && p.seat !== null)
          .map((p) => ({ userId: p.userId, displayName: p.displayName, seat: p.seat! }));

        liveMatches.push({
          gameId: room.gameId,
          matchId: match.matchId,
          roomId: room.id,
          players: participants,
          startedAt,
          deadline,
          remainingSeconds,
          status: match.matchStatus ?? "ACTIVE",
          isExpired: now >= deadline,
        });
      }
    }

    return liveMatches;
  }
}
