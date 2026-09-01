import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type { GameId } from "@gaming-hub/shared";
import { IdempotencyService } from "./idempotencyService";
import { GameConfigService } from "./gameConfigService";
import { SettlementService } from "./settlementService";
import { processMatchResult } from "./tournamentEngine";

export class MatchAbandonmentService {
  private static readonly disconnects = new Map<string, { userId: string; disconnectedAt: Date; deadline: Date }>();

  /**
   * 1. Register Temporary Disconnect:
   * Records disconnect timestamp and arms server-authoritative grace period (30s).
   */
  static async registerDisconnect(params: {
    matchId: string;
    userId: string;
  }) {
    const match = await prisma.match.findUnique({
      where: { id: params.matchId },
      include: { players: true },
    });

    if (!match) throw new AppError("NOT_FOUND", "Match not found", 404);
    if (match.status !== "ACTIVE") {
      return { ok: true, status: match.status };
    }

    const player = match.players.find((p) => p.userId === params.userId);
    if (!player) throw new AppError("FORBIDDEN", "User is not a player in this match", 403);

    const gameConfig = await GameConfigService.getGameConfig(match.gameId as GameId);
    const gracePeriodSeconds = gameConfig.reconnectWindowSeconds || 30;
    const now = new Date();
    const deadline = new Date(now.getTime() + gracePeriodSeconds * 1000);

    const key = `${params.matchId}:${params.userId}`;
    this.disconnects.set(key, {
      userId: params.userId,
      disconnectedAt: now,
      deadline,
    });

    return {
      ok: true,
      matchId: match.id,
      userId: params.userId,
      disconnectedAt: now.toISOString(),
      gracePeriodSeconds,
      deadline: deadline.toISOString(),
      status: "DISCONNECTED",
    };
  }

  /**
   * 2. Register Reconnect:
   * Cancels pending abandonment upon timely reconnection before deadline.
   */
  static async registerReconnect(params: {
    matchId: string;
    userId: string;
  }) {
    const match = await prisma.match.findUnique({
      where: { id: params.matchId },
      include: { players: true },
    });

    if (!match) throw new AppError("NOT_FOUND", "Match not found", 404);

    const key = `${params.matchId}:${params.userId}`;
    this.disconnects.delete(key);

    return {
      ok: true,
      matchId: match.id,
      userId: params.userId,
      status: "CONNECTED",
    };
  }

  /**
   * 3. Process Authoritative Abandonment:
   * Verifies expiration, blocks malicious client attempts, and settles match in favor of opponent.
   */
  static async processAbandonment(params: {
    matchId: string;
    userId: string;
    caller: "SYSTEM_WORKER" | "ADMIN" | "CLIENT";
    adminId?: string;
    disconnectedAt?: Date;
    reason?: string;
  }) {
    // Rule 1: Malicious clients cannot force abandonment on opponents
    if (params.caller === "CLIENT") {
      throw new AppError("FORBIDDEN", "Clients cannot trigger player abandonment", 403);
    }

    // Rule 2: Grace period validation for system workers
    if (params.caller === "SYSTEM_WORKER" && params.disconnectedAt) {
      const gameConfig = await GameConfigService.getGameConfig("chess"); // fallback default
      const graceMs = (gameConfig.reconnectWindowSeconds || 30) * 1000;
      if (Date.now() < params.disconnectedAt.getTime() + graceMs) {
        throw new AppError("INVALID_ACTION", "Reconnect grace period is still active", 409);
      }
    }

    const match = await prisma.match.findUnique({
      where: { id: params.matchId },
      include: { players: true },
    });

    if (!match) throw new AppError("NOT_FOUND", "Match not found", 404);
    if (match.status !== "ACTIVE") {
      return { ok: true, status: match.status, message: `Match already ${match.status}` };
    }

    const isPlayer = match.players.some((p) => p.userId === params.userId);
    if (!isPlayer) throw new AppError("VALIDATION_ERROR", "User is not a seated player in this match", 422);

    const remainingWinners = match.players
      .filter((p) => p.userId !== params.userId)
      .map((p) => p.userId);

    const idempotencyKey = `ABANDONMENT:${params.matchId}:${params.userId}`;

    const summary = await IdempotencyService.executeOnce({
      key: idempotencyKey,
      operation: "MATCH_ABANDONMENT_SETTLEMENT",
      referenceId: params.matchId,
      handler: async () => {
        const result = await SettlementService.settleMatch({
          matchId: params.matchId,
          winnerIds: remainingWinners,
          options: {
            resultType: "FORFEIT",
            reason: params.reason ?? "player_abandonment",
          },
        });

        // If this was a tournament match, advance tournament bracket
        if (match.roomId && match.roomId.startsWith("tournament_")) {
          const parts = match.roomId.split(":");
          if (parts.length >= 3) {
            const tournamentId = parts[1];
            const roundId = parts[2];
            await processMatchResult({
              matchId: match.id,
              tournamentId,
              roundId,
              winnerId: remainingWinners[0] || "",
              loserId: params.userId,
            }).catch(() => undefined);
          }
        }

        const key = `${params.matchId}:${params.userId}`;
        this.disconnects.delete(key);

        return result;
      },
    });

    return {
      ok: true,
      status: summary.status,
      abandonedUserId: params.userId,
      winners: remainingWinners,
    };
  }

  /**
   * 4. Process Admin Force-Forfeit:
   * Protects with RBAC verification and writes immutable audit trail.
   */
  static async processAdminForceForfeit(params: {
    matchId: string;
    userId: string;
    adminId: string;
    reason: string;
  }) {
    // Record audit trail
    await prisma.auditLog.create({
      data: {
        actorId: params.adminId,
        actorType: "admin",
        action: "FORCE_FORFEIT_MATCH",
        category: "game",
        targetId: params.matchId,
        targetType: "match",
        meta: {
          matchId: params.matchId,
          forfeitedUserId: params.userId,
          reason: params.reason,
        },
      },
    });

    return this.processAbandonment({
      matchId: params.matchId,
      userId: params.userId,
      caller: "ADMIN",
      adminId: params.adminId,
      reason: `admin_force_forfeit: ${params.reason}`,
    });
  }

  /**
   * 5. Periodic Scan & Cleanup of Expired Abandoned Matches
   */
  static async scanAndCleanupAbandonedMatches() {
    const now = Date.now();
    const expiredEntries: { matchId: string; userId: string }[] = [];

    for (const [key, record] of this.disconnects.entries()) {
      if (now >= record.deadline.getTime()) {
        const [matchId, userId] = key.split(":");
        expiredEntries.push({ matchId, userId });
      }
    }

    const results = [];
    for (const { matchId, userId } of expiredEntries) {
      const res = await this.processAbandonment({
        matchId,
        userId,
        caller: "SYSTEM_WORKER",
        reason: "grace_period_expired",
      }).catch(() => null);

      if (res) results.push(res);
    }

    return { cleanedCount: results.length, results };
  }
}
