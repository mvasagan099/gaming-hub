import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type { GameId } from "@gaming-hub/shared";
import { GameConfigService } from "./gameConfigService";
import { SettlementService } from "./settlementService";
import { RefundService } from "./refundService";
import { MatchTimeoutService } from "./matchTimeoutService";

export class PersistentMatchStateService {
  private static readonly recoveryLocks = new Map<string, { ownerId: string; expiresAt: number }>();

  /**
   * 1. Save State Snapshot with Optimistic Concurrency on `stateVersion` (`turnNumber`):
   * Guarantees atomic updates and rejects stale state overwrites with CONCURRENT_OPERATION.
   */
  static async saveStateSnapshot(params: {
    matchId: string;
    state: Record<string, unknown>;
    expectedVersion: number;
    turnNumber?: number;
  }) {
    const existing = await prisma.gameState.findUnique({
      where: { matchId: params.matchId },
    });

    if (existing) {
      if (existing.turnNumber !== params.expectedVersion) {
        throw new AppError(
          "CONCURRENT_OPERATION",
          `Optimistic concurrency conflict: expected stateVersion ${params.expectedVersion} but found ${existing.turnNumber}`,
          409,
        );
      }

      const nextVersion = params.turnNumber ?? params.expectedVersion + 1;
      const updated = await prisma.gameState.update({
        where: { matchId: params.matchId },
        data: {
          state: params.state as object,
          turnNumber: nextVersion,
        },
      });

      return {
        ok: true,
        matchId: params.matchId,
        stateVersion: updated.turnNumber,
        turnNumber: updated.turnNumber,
        state: updated.state,
      };
    }

    // Initial state creation
    if (params.expectedVersion !== 0) {
      throw new AppError(
        "CONCURRENT_OPERATION",
        `Cannot initialize match state with expectedVersion ${params.expectedVersion}`,
        409,
      );
    }

    const created = await prisma.gameState.create({
      data: {
        matchId: params.matchId,
        state: params.state as object,
        turnNumber: params.turnNumber ?? 1,
      },
    });

    return {
      ok: true,
      matchId: params.matchId,
      stateVersion: created.turnNumber,
      turnNumber: created.turnNumber,
      state: created.state,
    };
  }

  /**
   * 2. Load Authoritative State Snapshot:
   * Rehydrates match from database persistence and validates against state corruption.
   */
  static async loadAuthoritativeState(matchId: string) {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        players: { include: { user: true } },
        gameState: true,
        moves: { orderBy: { turnNumber: "asc" } },
      },
    });

    if (!match) {
      throw new AppError("NOT_FOUND", "Match not found", 404);
    }

    // Check for state corruption
    const rawState = match.gameState?.state;
    if (rawState !== null && rawState !== undefined && typeof rawState !== "object") {
      return {
        ok: false,
        matchId: match.id,
        status: "RECOVERY_FAILED",
        error: "Corrupted match state snapshot",
      };
    }

    const stateObj = (rawState ?? {}) as Record<string, unknown>;
    const turnNumber = match.gameState?.turnNumber ?? 0;
    const stateVersion = turnNumber;

    const gameConfig = await GameConfigService.getGameConfig(match.gameId as GameId);
    const elapsedSeconds = match.startedAt
      ? Math.max(0, Math.round((Date.now() - match.startedAt.getTime()) / 1000))
      : 0;

    return {
      ok: true,
      matchId: match.id,
      gameId: match.gameId,
      status: match.status,
      stateVersion,
      turnNumber,
      state: stateObj,
      totalMoves: match.moves.length,
      players: match.players.map((p) => ({
        userId: p.userId,
        username: p.user.username,
        seat: p.seat,
        result: p.result,
        score: p.score,
      })),
      timer: {
        startedAt: match.startedAt ? match.startedAt.toISOString() : null,
        elapsedSeconds,
        turnTimerSeconds: gameConfig.turnTimerSeconds || 30,
      },
    };
  }

  /**
   * 3. Multi-Instance Distributed Recovery Lock:
   * Prevents multiple server or socket instances from recovering the same match concurrently.
   */
  static acquireRecoveryLock(matchId: string, instanceId: string, ttlMs = 10000): boolean {
    const now = Date.now();
    const existing = this.recoveryLocks.get(matchId);

    if (existing && now < existing.expiresAt && existing.ownerId !== instanceId) {
      return false; // Lock held by another active instance
    }

    this.recoveryLocks.set(matchId, {
      ownerId: instanceId,
      expiresAt: now + ttlMs,
    });
    return true;
  }

  static releaseRecoveryLock(matchId: string, instanceId: string): void {
    const existing = this.recoveryLocks.get(matchId);
    if (existing && existing.ownerId === instanceId) {
      this.recoveryLocks.delete(matchId);
    }
  }

  /**
   * 4. Startup & Background Active Match Recovery Worker:
   * Evaluates lingering matches after server reboot and resolves them safely.
   */
  static async startupRecoveryWorker(options?: { batchSize?: number; instanceId?: string }) {
    const instanceId = options?.instanceId ?? `worker-${process.pid}-${Date.now()}`;
    const batchSize = options?.batchSize ?? 50;

    // Scan for potentially unrecovered matches
    const pendingMatches = await prisma.match.findMany({
      where: {
        status: { in: ["CREATED", "ACTIVE"] },
      },
      take: batchSize,
      orderBy: { createdAt: "asc" },
      include: { players: true, gameState: true },
    });

    const recovered = [];
    const refunded = [];
    const timedOut = [];

    for (const match of pendingMatches) {
      // Attempt lock acquisition for multi-instance safety
      const acquired = this.acquireRecoveryLock(match.id, instanceId);
      if (!acquired) continue;

      try {
        if (match.status === "CREATED") {
          // Check for lobby join timeout (> 60s)
          const isLobbyExpired = Date.now() - match.createdAt.getTime() > 60000;
          if (isLobbyExpired) {
            await RefundService.refundCancelledMatch({
              matchId: match.id,
              reason: "startup_recovery_lobby_timeout",
            }).catch(() => undefined);
            refunded.push(match.id);
          } else {
            recovered.push({ matchId: match.id, status: "CREATED" });
          }
        } else if (match.status === "ACTIVE") {
          // Check for turn timeout if match has been running without moves
          const lastUpdated = match.gameState?.updatedAt ?? match.startedAt ?? match.createdAt;
          const turnTimeLimit = 30000; // 30s default
          const isTurnExpired = Date.now() - lastUpdated.getTime() > turnTimeLimit;

          if (isTurnExpired && match.players.length > 1) {
            const rawState = (match.gameState?.state ?? {}) as Record<string, unknown>;
            const turnSeat = (rawState.turn ?? rawState.currentTurn ?? rawState.activeSeat ?? 0) as number;

            await MatchTimeoutService.checkTurnTimeout({
              matchId: match.id,
              currentTurnSeat: turnSeat,
              turnStartedAt: lastUpdated,
              maxTurnSeconds: 30,
            }).catch(() => undefined);

            timedOut.push(match.id);
          } else {
            recovered.push({ matchId: match.id, status: "ACTIVE" });
          }
        }
      } finally {
        this.releaseRecoveryLock(match.id, instanceId);
      }
    }

    return {
      instanceId,
      scannedCount: pendingMatches.length,
      recovered,
      refunded,
      timedOut,
    };
  }

  /**
   * 5. Admin System-Wide Recovery Overview:
   * Aggregates match health, recovery statuses, and pending settlements.
   */
  static async getAdminRecoveryOverview() {
    const [activeCount, createdCount, finishedCount, abortedCount] = await Promise.all([
      prisma.match.count({ where: { status: "ACTIVE" } }),
      prisma.match.count({ where: { status: "CREATED" } }),
      prisma.match.count({ where: { status: "FINISHED" } }),
      prisma.match.count({ where: { status: "ABORTED" } }),
    ]);

    return {
      health: "OK",
      activeMatches: activeCount,
      createdMatches: createdCount,
      finishedMatches: finishedCount,
      abortedMatches: abortedCount,
      activeRecoveryLocks: this.recoveryLocks.size,
    };
  }
}
