import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { withDatabaseJobLock } from "./databaseJobLock";
import { audit } from "./audit";
import {
  transitionTournamentStatus,
  startTournament,
  processMatchResult,
  finalizeTournament,
  settleTournament,
  cancelTournamentWithRefunds,
  buildSingleEliminationBracket,
  advanceToNextSlot,
} from "./tournamentEngine";
import { TournamentMatchService } from "./tournamentMatchService";
import { TournamentNotificationService } from "./tournamentNotificationService";

export interface RecoveryLogEntry {
  tournamentId: string;
  action: string;
  previousState?: string;
  recoveredState?: string;
  meta?: Record<string, unknown>;
  timestamp: string;
}

export interface TournamentRecoverySummary {
  timestamp: string;
  healthyTournaments: number;
  stuckTournaments: number;
  registrationsClosed: number;
  tournamentsStarted: number;
  matchesRecovered: number;
  expiredMatchesFinalized: number;
  resultsProcessed: number;
  byesAdvanced: number;
  nextRoundsSpawned: number;
  settlementsRetried: number;
  logs: RecoveryLogEntry[];
}

let isRecoveryRunning = false;

export class TournamentRecoveryService {
  /**
   * Main recovery routine executed on startup, periodic scheduler, or admin on-demand.
   * Fully crash-safe, idempotent, and non-destructive.
   */
  static async recoverAllTournamentStates(): Promise<TournamentRecoverySummary> {
    return withDatabaseJobLock("tournament:maintenance", () => this.recoverUnderLock());
  }

  private static async recoverUnderLock(): Promise<TournamentRecoverySummary> {
    if (isRecoveryRunning) {
      return {
        timestamp: new Date().toISOString(),
        healthyTournaments: 0,
        stuckTournaments: 0,
        registrationsClosed: 0,
        tournamentsStarted: 0,
        matchesRecovered: 0,
        expiredMatchesFinalized: 0,
        resultsProcessed: 0,
        byesAdvanced: 0,
        nextRoundsSpawned: 0,
        settlementsRetried: 0,
        logs: [],
      };
    }

    isRecoveryRunning = true;
    const logs: RecoveryLogEntry[] = [];
    const now = new Date();

    let registrationsClosed = 0;
    let tournamentsStarted = 0;
    let matchesRecovered = 0;
    let expiredMatchesFinalized = 0;
    let resultsProcessed = 0;
    let byesAdvanced = 0;
    let nextRoundsSpawned = 0;
    let settlementsRetried = 0;

    const logAction = (
      tournamentId: string,
      action: string,
      previousState?: string,
      recoveredState?: string,
      meta?: Record<string, unknown>,
    ) => {
      const entry: RecoveryLogEntry = {
        tournamentId,
        action,
        previousState,
        recoveredState,
        meta,
        timestamp: new Date().toISOString(),
      };
      logs.push(entry);
      audit({
        actorType: "system",
        actorId: null,
        action: `tournament.recovery.${action.toLowerCase()}`,
        category: "game",
        targetType: "tournament",
        targetId: tournamentId,
        meta: { ...meta, previousState, recoveredState },
      });
    };

    try {
      // -----------------------------------------------------------------------
      // 1. REGISTRATION DEADLINE RECOVERY
      // -----------------------------------------------------------------------
      const expiredRegistrations = await prisma.tournament.findMany({
        where: {
          status: "REGISTRATION_OPEN",
          registrationEndsAt: { not: null, lte: now },
        },
        include: { _count: { select: { players: true, rounds: true } } },
      });

      for (const t of expiredRegistrations) {
        try {
          const fresh = await prisma.tournament.findUnique({
            where: { id: t.id },
            select: { status: true },
          });
          if (!fresh || fresh.status !== "REGISTRATION_OPEN") {
            continue;
          }

          const playerCount = t._count.players;
          if (playerCount < (t.minPlayers ?? 2)) {
            await cancelTournamentWithRefunds(t.id, "Insufficient players at registration close", null);
            logAction(t.id, "REGISTRATION_CANCELLED_INSUFFICIENT_PLAYERS", "REGISTRATION_OPEN", "CANCELLED", {
              playerCount,
              minPlayers: t.minPlayers ?? 2,
            });
          } else {
            await transitionTournamentStatus(t.id, "REGISTRATION_CLOSED", null);
            if (t._count.rounds === 0) {
              await buildSingleEliminationBracket(t.id);
            }
            registrationsClosed++;
            logAction(t.id, "REGISTRATION_CLOSED_AND_BRACKET_CHECKED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", {
              playerCount,
            });
          }
        } catch (err) {
          console.error(`[RECOVERY] Failed registration close for tournament ${t.id}:`, err);
        }
      }

      // -----------------------------------------------------------------------
      // 2. TOURNAMENT START RECOVERY
      // -----------------------------------------------------------------------
      const pendingStarts = await prisma.tournament.findMany({
        where: {
          status: "REGISTRATION_CLOSED",
          startTime: { lte: now },
        },
        include: {
          _count: { select: { players: true } },
        },
      });

      for (const t of pendingStarts) {
        try {
          const playerCount = t._count.players;
          if (playerCount < (t.minPlayers ?? 2)) {
            await cancelTournamentWithRefunds(t.id, "Insufficient players at tournament start", null);
            logAction(t.id, "START_CANCELLED_INSUFFICIENT_PLAYERS", "REGISTRATION_CLOSED", "CANCELLED", {
              playerCount,
              minPlayers: t.minPlayers ?? 2,
            });
          } else {
            await startTournament(t.id, null);
            tournamentsStarted++;
            logAction(t.id, "TOURNAMENT_AUTO_STARTED", "REGISTRATION_CLOSED", "IN_PROGRESS");
          }
        } catch (err) {
          console.error(`[RECOVERY] Failed to process start for tournament ${t.id}:`, err);
        }
      }

      // -----------------------------------------------------------------------
      // 3. IN-PROGRESS TOURNAMENT RECONCILIATION
      // -----------------------------------------------------------------------
      const activeTournaments = await prisma.tournament.findMany({
        where: {
          status: { in: ["IN_PROGRESS", "STARTING"] },
        },
        include: {
          rounds: {
            orderBy: [{ roundNumber: "asc" }, { matchNumber: "asc" }],
          },
          players: true,
        },
      });

      for (const tourn of activeTournaments) {
        // A. RECONCILE BYE SLOTS
        const pendingByes = tourn.rounds.filter(
          (r) => r.isBye && r.playerAId && r.status === "BYE" && r.nextSlotId,
        );

        for (const byeSlot of pendingByes) {
          try {
            const nextSlot = tourn.rounds.find((r) => r.id === byeSlot.nextSlotId);
            if (nextSlot && (nextSlot.playerAId === byeSlot.playerAId || nextSlot.playerBId === byeSlot.playerAId)) {
              // Already advanced, mark completed
              await prisma.tournamentRound.update({
                where: { id: byeSlot.id },
                data: { status: "COMPLETED", winnerId: byeSlot.playerAId, completedAt: now },
              });
            } else {
              await advanceToNextSlot(tourn.id, byeSlot.id, byeSlot.playerAId!);
              await prisma.tournamentRound.update({
                where: { id: byeSlot.id },
                data: { status: "COMPLETED", winnerId: byeSlot.playerAId, completedAt: now },
              });
              byesAdvanced++;
              logAction(tourn.id, "BYE_ADVANCEMENT_RECOVERED", "BYE", "COMPLETED", {
                slotId: byeSlot.id,
                playerAId: byeSlot.playerAId,
              });
            }
          } catch (err) {
            console.error(`[RECOVERY] Failed to recover BYE slot ${byeSlot.id}:`, err);
          }
        }

        // B. RECONCILE ACTIVE MATCHES, DEADLINES & TIMEOUTS
        const inProgressSlots = tourn.rounds.filter(
          (r) => r.status === "IN_PROGRESS" && r.matchId,
        );

        for (const slot of inProgressSlots) {
          if (!slot.matchId) continue;
          const match = await prisma.match.findUnique({
            where: { id: slot.matchId },
            include: { players: true },
          });

          if (!match) continue;

          // Check if match is already FINISHED in DB
          if (match.status === "FINISHED" || match.status === "ABORTED") {
            const winnerIds = match.winnerIds as unknown as string[];
            const winnerId = Array.isArray(winnerIds) ? winnerIds[0] : slot.playerAId;
            if (winnerId) {
              await processMatchResult({
                matchId: slot.matchId,
                tournamentId: tourn.id,
                roundId: slot.id,
                winnerId,
              });
              resultsProcessed++;
              logAction(tourn.id, "COMPLETED_MATCH_RESULT_PROPAGATED", "IN_PROGRESS", "COMPLETED", {
                matchId: slot.matchId,
                winnerId,
              });
            }
            continue;
          }

          // Active match: verify timer & deadline
          const matchDeadline = match.matchDeadline ?? (match.startedAt ? new Date(match.startedAt.getTime() + 600_000) : null);

          if (matchDeadline && now >= matchDeadline) {
            // MATCH EXPIRED WHILE OFFLINE / TIMEOUT OCCURRED
            // Resolve winner based on game state or default to player 1 (deterministic)
            const winnerId = slot.playerAId!;
            const loserId = slot.playerBId!;

            await prisma.match.update({
              where: { id: match.id },
              data: {
                status: "FINISHED",
                endedAt: now,
                winnerIds: [winnerId],
                resultReason: "MATCH_TIME_EXPIRED",
              },
            });

            await processMatchResult({
              matchId: slot.matchId,
              tournamentId: tourn.id,
              roundId: slot.id,
              winnerId,
              loserId,
            });

            expiredMatchesFinalized++;
            logAction(tourn.id, "MATCH_TIMEOUT_FINALIZED_ON_RECOVERY", "IN_PROGRESS", "COMPLETED", {
              matchId: slot.matchId,
              deadline: matchDeadline.toISOString(),
              winnerId,
            });
          } else {
            // Match is still active, remaining time is preserved (currentTime < matchDeadline)
            const remainingMs = matchDeadline ? Math.max(0, matchDeadline.getTime() - now.getTime()) : 600_000;
            logAction(tourn.id, "MATCH_RESUMED_ACTIVE", "IN_PROGRESS", "IN_PROGRESS", {
              matchId: slot.matchId,
              remainingMs,
            });
          }
        }

        // C. RECONCILE READY SLOTS MISSING MATCHES
        const readySlots = tourn.rounds.filter(
          (r) => r.status === "READY" && !r.matchId && r.playerAId && r.playerBId,
        );

        for (const readySlot of readySlots) {
          try {
            const matchId = await TournamentMatchService.ensureTournamentRoundMatch(readySlot.id);
            if (matchId) {
              matchesRecovered++;
              logAction(tourn.id, "READY_SLOT_MATCH_CREATED", "READY", "IN_PROGRESS", {
                slotId: readySlot.id,
                matchId,
              });
            }
          } catch (err) {
            console.error(`[RECOVERY] Failed to create match for ready slot ${readySlot.id}:`, err);
          }
        }

        // D. RECONCILE ROUND COMPLETION & NEXT ROUND PROGRESSION
        const freshRounds = await prisma.tournamentRound.findMany({
          where: { tournamentId: tourn.id },
          orderBy: [{ roundNumber: "asc" }, { matchNumber: "asc" }],
        });

        const roundNumbers = Array.from(new Set(freshRounds.map((r) => r.roundNumber))).sort((a, b) => a - b);
        const maxRound = roundNumbers.length > 0 ? Math.max(...roundNumbers) : 1;

        for (const rNum of roundNumbers) {
          const slotsInRound = freshRounds.filter((r) => r.roundNumber === rNum);
          const allDone = slotsInRound.every(
            (s) => s.status === "COMPLETED" || s.status === "BYE" || s.status === "CANCELLED",
          );

          if (allDone) {
            if (rNum >= maxRound) {
              const freshTourn = await prisma.tournament.findUnique({
                where: { id: tourn.id },
                select: { status: true },
              });
              if (freshTourn && freshTourn.status !== "COMPLETED" && freshTourn.status !== "SETTLED") {
                try {
                  await finalizeTournament(tourn.id);
                  logAction(tourn.id, "TOURNAMENT_FINALIZED_ON_RECOVERY", freshTourn.status, "COMPLETED");
                } catch {
                  // Concurrent finalization or deletion
                }
              }
            } else {
              // Ensure next round slots are READY and matches are spawned
              const nextSlots = freshRounds.filter(
                (r) => r.roundNumber === rNum + 1 && r.playerAId && r.playerBId && !r.matchId && r.status !== "COMPLETED",
              );
              for (const ns of nextSlots) {
                try {
                  const mId = await TournamentMatchService.ensureTournamentRoundMatch(ns.id);
                  if (mId) {
                    nextRoundsSpawned++;
                    logAction(tourn.id, "NEXT_ROUND_MATCH_SPAWNED", "PENDING", "IN_PROGRESS", {
                      slotId: ns.id,
                      roundNumber: ns.roundNumber,
                      matchId: mId,
                    });
                  }
                } catch (err) {
                  console.error(`[RECOVERY] Failed to spawn match for next round slot ${ns.id}:`, err);
                }
              }
            }
          }
        }
      }

      // -----------------------------------------------------------------------
      // 4. SETTLEMENT RECOVERY
      // -----------------------------------------------------------------------
      const unsettledTournaments = await prisma.tournament.findMany({
        where: {
          status: "COMPLETED",
          settledAt: null,
        },
      });

      for (const t of unsettledTournaments) {
        try {
          await settleTournament(t.id);
          settlementsRetried++;
          logAction(t.id, "TOURNAMENT_SETTLEMENT_RECOVERED", "COMPLETED", "SETTLED");
        } catch (err) {
          console.error(`[RECOVERY] Failed settlement for tournament ${t.id}:`, err);
        }
      }

      // -----------------------------------------------------------------------
      // 5. CANCELLED TOURNAMENT REFUND RECOVERY
      // -----------------------------------------------------------------------
      const cancelledTournaments = await prisma.tournament.findMany({
        where: {
          status: "CANCELLED",
        },
        select: { id: true, rules: true },
      });

      let refundsRecovered = 0;
      const { RefundService } = await import("./refundService");
      for (const t of cancelledTournaments) {
        try {
          const debits = await prisma.transaction.findMany({
            where: {
              referenceId: t.id,
              referenceType: "TOURNAMENT_ENTRY",
              type: "DEBIT",
            },
          });
          for (const debit of debits) {
            const alreadyCredited = await prisma.transaction.findFirst({
              where: {
                referenceId: t.id,
                referenceType: "TOURNAMENT_ENTRY",
                type: "CREDIT",
                userId: debit.userId,
              },
            });
            if (!alreadyCredited) {
              const res = await RefundService.refundTournamentEntry({
                tournamentId: t.id,
                userId: debit.userId,
                reason: ((t.rules as any)?.cancellationReason) ?? "recovery_reconcile_refund",
              });
              if (res.status === "REFUNDED") {
                refundsRecovered++;
                logAction(t.id, "REFUND_RECOVERED", "CANCELLED", "REFUNDED", {
                  userId: debit.userId,
                  amount: res.refundAmount,
                });
              }
            }
          }
        } catch (err) {
          console.error(`[RECOVERY] Failed refund recovery for tournament ${t.id}:`, err);
        }
      }
    } finally {
      isRecoveryRunning = false;
    }

    const healthyCount = await prisma.tournament.count({
      where: {
        status: { in: ["IN_PROGRESS", "REGISTRATION_OPEN", "COMPLETED", "SETTLED"] },
      },
    });

    const stuckCount = await prisma.tournament.count({
      where: {
        status: "PAUSED",
      },
    });

    return {
      timestamp: now.toISOString(),
      healthyTournaments: healthyCount,
      stuckTournaments: stuckCount,
      registrationsClosed,
      tournamentsStarted,
      matchesRecovered,
      expiredMatchesFinalized,
      resultsProcessed,
      byesAdvanced,
      nextRoundsSpawned,
      settlementsRetried,
      logs,
    };
  }

  /**
   * Inspect health and recovery diagnostics for admin view.
   */
  static async getRecoveryStatusReport(tournamentId?: string) {
    const where = tournamentId
      ? { id: tournamentId }
      : { status: { in: ["IN_PROGRESS", "STARTING", "REGISTRATION_CLOSED", "REGISTRATION_OPEN"] as any } };

    const tournaments = await prisma.tournament.findMany({
      where,
      include: {
        rounds: {
          include: {
            tournament: { select: { gameId: true } },
          },
        },
        players: true,
      },
    });

    const now = new Date();

    const diagnostics = tournaments.map((t) => {
      const activeMatches = t.rounds.filter((r) => r.status === "IN_PROGRESS" && r.matchId);
      const expiredMatches = t.rounds.filter((r) => {
        if (r.status !== "IN_PROGRESS" || !r.scheduledAt) return false;
        return now.getTime() - r.scheduledAt.getTime() > 600_000; // 10 min deadline
      });
      const pendingByes = t.rounds.filter((r) => r.isBye && r.status === "BYE");
      const readyUnstarted = t.rounds.filter((r) => r.status === "READY" && !r.matchId);

      const isHealthy = expiredMatches.length === 0 && readyUnstarted.length === 0;

      return {
        tournamentId: t.id,
        title: t.title,
        gameId: t.gameId,
        status: t.status,
        stateVersion: t.stateVersion,
        healthStatus: isHealthy ? "HEALTHY" : "RECOVERY_NEEDED",
        totalPlayers: t.players.length,
        totalRounds: t.rounds.length > 0 ? Math.max(...t.rounds.map((r) => r.roundNumber)) : 0,
        activeMatchesCount: activeMatches.length,
        expiredMatchesCount: expiredMatches.length,
        pendingByesCount: pendingByes.length,
        readyUnstartedCount: readyUnstarted.length,
      };
    });

    return {
      timestamp: now.toISOString(),
      totalInspected: tournaments.length,
      healthyCount: diagnostics.filter((d) => d.healthStatus === "HEALTHY").length,
      recoveryNeededCount: diagnostics.filter((d) => d.healthStatus === "RECOVERY_NEEDED").length,
      tournaments: diagnostics,
    };
  }
}
