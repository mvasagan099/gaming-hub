import { prisma, Prisma } from "@gaming-hub/db";
import { canTransitionTournamentStatus } from "@gaming-hub/shared";
import type { TournamentStatus } from "@gaming-hub/shared";
import { audit } from "./audit";
import {
  transitionTournamentStatus,
  startTournament,
  processMatchResult,
  settleTournament,
  cancelTournamentWithRefunds,
} from "./tournamentEngine";
import { TournamentMatchService } from "./tournamentMatchService";
import { TournamentNotificationService } from "./tournamentNotificationService";
import { scheduleHourlyTournaments } from "./hourlyTournamentScheduler";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const STALE_MATCH_START_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// In-process mutex (replaces unreliable PG advisory lock)
//
// WHY: Prisma's connection pool assigns a different Postgres connection on each
// $queryRaw call.  pg_advisory_lock is session-level — connection A acquires
// it, returns to the pool, and connection B (different session) then sees the
// lock as "held by another instance".  The real idempotency guard is the
// TournamentTierScheduleLog @@unique([tierId, gameId, slotHour]) constraint,
// so this mutex is only an optimisation to skip redundant work.
// ---------------------------------------------------------------------------

let schedulerRunning = false;

function acquireLock(_lockKey: string): boolean {
  if (schedulerRunning) return false;
  schedulerRunning = true;
  return true;
}

function releaseLock(_lockKey: string): void {
  schedulerRunning = false;
}


// ---------------------------------------------------------------------------
// Audit helper
// ---------------------------------------------------------------------------

function auditEvent(
  action: string,
  meta: Record<string, unknown>,
  tournamentId?: string,
  roundId?: string,
  matchId?: string,
) {
  audit({
    actorType: "system",
    actorId: null,
    action,
    category: "game",
    targetType: "tournament",
    targetId: tournamentId ?? null,
    meta: {
      ...meta,
      ...(roundId ? { roundId } : {}),
      ...(matchId ? { matchId } : {}),
      timestamp: new Date().toISOString(),
    },
  });
}

// ---------------------------------------------------------------------------
// 1. Registration closure job
// ---------------------------------------------------------------------------

async function closeExpiredRegistrations(): Promise<number> {
  const now = new Date();
  const expired = await prisma.tournament.findMany({
    where: {
      status: "REGISTRATION_OPEN",
      registrationEndsAt: { not: null, lte: now },
    },
    select: {
      id: true,
      title: true,
      minPlayers: true,
      maxPlayers: true,
      startTime: true,
      _count: { select: { players: true } },
    },
  });

  let processed = 0;
  for (const t of expired) {
    try {
      const playerCount = t._count.players;
      const minRequired = t.minPlayers ?? 2;

      // Close registration first
      await transitionTournamentStatus(t.id, "REGISTRATION_CLOSED", null);
      auditEvent("TOURNAMENT_SCHEDULER_REGISTRATION_CLOSED", {
        playerCount,
        minPlayers: minRequired,
        maxPlayers: t.maxPlayers,
      }, t.id);

      // Evaluate minimum players requirement
      if (playerCount < minRequired) {
        // Minimum not reached -> Cancel tournament & execute authoritative refunds
        await cancelTournamentWithRefunds(t.id, "MINIMUM_PLAYERS_NOT_REACHED", null);
        auditEvent("TOURNAMENT_SCHEDULER_REGISTRATION_CANCELLED", {
          reason: "MINIMUM_PLAYERS_NOT_REACHED",
          playerCount,
          minPlayers: minRequired,
        }, t.id);
      } else {
        // Minimum reached -> Ready to start when scheduled
        if (t.startTime && t.startTime <= now) {
          await startTournament(t.id, null);
          auditEvent("TOURNAMENT_SCHEDULER_STARTED", {
            reason: "registration_closed_and_min_reached",
            playerCount,
          }, t.id);
        }
      }
      processed++;
    } catch (error) {
      console.error(`[SCHEDULER] Failed to process registration close for tournament ${t.id}:`, error);
    }
  }
  return processed;
}

// ---------------------------------------------------------------------------
// 1b. Scheduled registration open (registrationStartsAt)
// ---------------------------------------------------------------------------

async function openScheduledRegistrations(): Promise<number> {
  const now = new Date();
  const toOpen = await prisma.tournament.findMany({
    where: {
      status: "DRAFT",
      registrationStartsAt: { not: null, lte: now },
    },
    select: { id: true, title: true },
  });

  let processed = 0;
  for (const t of toOpen) {
    try {
      await transitionTournamentStatus(t.id, "REGISTRATION_OPEN", null);
      auditEvent("TOURNAMENT_SCHEDULER_REGISTRATION_OPENED", {
        reason: "registrationStartsAt_reached",
      }, t.id);
      processed++;
    } catch (error) {
      console.error(`[SCHEDULER] Failed to open registration for tournament ${t.id}:`, error);
    }
  }
  return processed;
}

// ---------------------------------------------------------------------------
// 1c. Auto-start when full (autoStartWhenFull)
// ---------------------------------------------------------------------------

async function autoStartWhenFull(): Promise<number> {
  const full = await prisma.tournament.findMany({
    where: {
      status: "REGISTRATION_OPEN",
      autoStartWhenFull: true,
    },
    include: { _count: { select: { players: true } } },
  });

  let processed = 0;
  for (const t of full) {
    if (t._count.players < t.maxPlayers) continue; // not full yet
    try {
      // Close registration first
      await transitionTournamentStatus(t.id, "REGISTRATION_CLOSED", null);
      auditEvent("TOURNAMENT_SCHEDULER_REGISTRATION_CLOSED", {
        reason: "autoStartWhenFull",
        playerCount: t._count.players,
      }, t.id);

      // Then start if eligible (players >= minPlayers)
      if (t._count.players >= (t.minPlayers ?? 2)) {
        await startTournament(t.id, null);
        auditEvent("TOURNAMENT_SCHEDULER_STARTED", {
          reason: "autoStartWhenFull",
        }, t.id);
      } else {
        // Not enough players even though full — cancel
        await cancelTournamentWithRefunds(t.id, "Insufficient players for auto-start", null);
        auditEvent("TOURNAMENT_SCHEDULER_REGISTRATION_CANCELLED", {
          reason: "insufficient_players_auto_start",
          playerCount: t._count.players,
          minPlayers: t.minPlayers ?? 2,
        }, t.id);
      }
      processed++;
    } catch (error) {
      console.error(`[SCHEDULER] Failed auto-start for tournament ${t.id}:`, error);
    }
  }
  return processed;
}

// ---------------------------------------------------------------------------
// 2. Start eligible tournaments
// ---------------------------------------------------------------------------

async function startEligibleTournaments(): Promise<number> {
  const now = new Date();
  const eligible = await prisma.tournament.findMany({
    where: {
      status: "REGISTRATION_CLOSED",
      startTime: { lte: now },
    },
    select: { id: true },
  });

  let processed = 0;
  for (const t of eligible) {
    try {
      await startTournament(t.id, null);
      auditEvent("TOURNAMENT_SCHEDULER_STARTED", {}, t.id);
      processed++;
    } catch (error) {
      console.error(`[SCHEDULER] Failed to start tournament ${t.id}:`, error);
    }
  }
  return processed;
}

// ---------------------------------------------------------------------------
// 3. Match recovery — create missing matches for READY slots
// ---------------------------------------------------------------------------

async function recoverMissingMatches(): Promise<number> {
  const slots = await prisma.tournamentRound.findMany({
    where: {
      status: "READY",
      matchId: null,
      playerAId: { not: null },
      playerBId: { not: null },
      tournament: { status: { in: ["IN_PROGRESS", "STARTING"] } },
    },
    include: { tournament: { select: { id: true, title: true } } },
  });

  let created = 0;
  for (const slot of slots) {
    try {
      const matchId = await TournamentMatchService.ensureTournamentRoundMatch(slot.id);
      if (matchId) {
        created++;
        await TournamentMatchService.notifyMatchCreated(slot, matchId);
        await TournamentMatchService.emitMatchCreatedEvent(slot, matchId);
        auditEvent("TOURNAMENT_MATCH_RECOVERED", {
          reason: "missing_match",
        }, slot.tournamentId, slot.id, matchId);
      }
    } catch (error) {
      console.error(`[SCHEDULER] Failed to recover match for slot ${slot.id}:`, error);
    }
  }
  return created;
}

// ---------------------------------------------------------------------------
// 4. Match state recovery — detect completed matches not yet processed
// ---------------------------------------------------------------------------

async function recoverMatchResults(): Promise<number> {
  // Find tournament rounds that are IN_PROGRESS but whose match is COMPLETED
  const stale = await prisma.tournamentRound.findMany({
    where: {
      status: "IN_PROGRESS",
      matchId: { not: null },
      tournament: { status: "IN_PROGRESS" },
    },
    select: {
      id: true,
      tournamentId: true,
      matchId: true,
      playerAId: true,
      playerBId: true,
    },
  });

  let recovered = 0;
  for (const slot of stale) {
    if (!slot.matchId) continue;

    const match = await prisma.match.findUnique({
      where: { id: slot.matchId },
      select: { status: true, winnerIds: true },
    });

    if (!match) {
      // Match reference is dangling — logged by recoverMatchReferences
      continue;
    }

    if (match.status !== "FINISHED" && match.status !== "ABORTED") {
      continue; // Not ready for processing yet
    }

    // Match is completed but round still in progress — process result
    const winnerIds = match.winnerIds as unknown as string[];
    const winnerId = Array.isArray(winnerIds) ? winnerIds[0] : null;
    if (!winnerId) continue;

    try {
      await processMatchResult({
        matchId: slot.matchId,
        tournamentId: slot.tournamentId,
        roundId: slot.id,
        winnerId,
      });
      recovered++;
      auditEvent("TOURNAMENT_RESULT_RECOVERED", {
        reason: "match_completed_round_pending",
        matchStatus: match.status,
      }, slot.tournamentId, slot.id, slot.matchId);
    } catch (error) {
      console.error(`[SCHEDULER] Failed to recover match result for slot ${slot.id}:`, error);
    }
  }
  return recovered;
}

// ---------------------------------------------------------------------------
// 5. Match reference verification
// ---------------------------------------------------------------------------

async function recoverMatchReferences(): Promise<{ cleaned: number; inconsistencies: number }> {
  const slotsWithMatchId = await prisma.tournamentRound.findMany({
    where: {
      matchId: { not: null },
      tournament: { status: { in: ["IN_PROGRESS", "STARTING"] } },
    },
    select: { id: true, matchId: true, tournamentId: true, status: true, isBye: true, playerAId: true, playerBId: true },
  });

  let cleaned = 0;
  let inconsistencies = 0;

  for (const slot of slotsWithMatchId) {
    if (!slot.matchId) continue;

    const match = await prisma.match.findUnique({
      where: { id: slot.matchId },
      select: { id: true, status: true },
    });

    if (match) continue; // Match exists, all good

    // Match reference points to non-existent Match
    inconsistencies++;
    auditEvent("TOURNAMENT_INCONSISTENCY_DETECTED", {
      type: "TOURNAMENT_MATCH_MISSING",
      missingMatchId: slot.matchId,
    }, slot.tournamentId, slot.id, slot.matchId);

    // If the slot is still READY and has both players, clear the stale matchId
    // so the recovery job can create a new match
    if (slot.status !== "COMPLETED" && slot.status !== "BYE" && slot.status !== "CANCELLED") {
      if (slot.playerAId && slot.playerBId) {
        await prisma.tournamentRound.update({
          where: { id: slot.id },
          data: { matchId: null, status: "READY" },
        });
        cleaned++;
      }
    }
  }

  return { cleaned, inconsistencies };
}

// ---------------------------------------------------------------------------
// 6. BYE recovery — auto-advance BYE slots that weren't advanced
// ---------------------------------------------------------------------------

async function recoverBYEs(): Promise<number> {
  // Find BYE slots that have a player but are still marked as BYE status
  // and haven't advanced their winner to the next slot
  const byeSlots = await prisma.tournamentRound.findMany({
    where: {
      isBye: true,
      status: "BYE",
      playerAId: { not: null },
      nextSlotId: { not: null },
      tournament: { status: { in: ["IN_PROGRESS", "STARTING"] } },
    },
  });

  let recovered = 0;
  for (const slot of byeSlots) {
    if (!slot.playerAId || !slot.nextSlotId) continue;

    // Check if the winner has already been advanced to the next slot
    const nextSlot = await prisma.tournamentRound.findUnique({
      where: { id: slot.nextSlotId },
      select: { playerAId: true, playerBId: true },
    });

    if (!nextSlot) continue;

    // If the next slot already has this player, BYE was already processed
    if (nextSlot.playerAId === slot.playerAId || nextSlot.playerBId === slot.playerAId) {
      // Just mark the BYE slot as completed
      if (slot.status !== "COMPLETED") {
        await prisma.tournamentRound.update({
          where: { id: slot.id },
          data: { status: "COMPLETED", winnerId: slot.playerAId, completedAt: new Date() },
        });
      }
      continue;
    }

    // Need to advance — call processMatchResult for BYE advancement
    try {
      // Create a virtual BYE match for idempotency tracking
      const byeMatchId = `bye_${slot.tournamentId}_${slot.id}`;
      await processMatchResult({
        matchId: byeMatchId,
        tournamentId: slot.tournamentId,
        roundId: slot.id,
        winnerId: slot.playerAId,
      });
      recovered++;
      auditEvent("TOURNAMENT_ROUND_RECOVERED", {
        reason: "bye_advancement",
      }, slot.tournamentId, slot.id);
    } catch (error) {
      // processMatchResult may throw if already processed (idempotency)
      // Just mark it completed
      try {
        await prisma.tournamentRound.update({
          where: { id: slot.id },
          data: { status: "COMPLETED", winnerId: slot.playerAId, completedAt: new Date() },
        });
      } catch {
        // Already processed
      }
    }
  }
  return recovered;
}

// ---------------------------------------------------------------------------
// 7. Stale match detection
// ---------------------------------------------------------------------------

async function detectStaleMatches(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_MATCH_START_TIMEOUT_MS);

  const staleSlots = await prisma.tournamentRound.findMany({
    where: {
      status: "IN_PROGRESS",
      matchId: { not: null },
      completedAt: null,
      scheduledAt: { lt: cutoff },
      tournament: { status: "IN_PROGRESS" },
    },
    select: { id: true, tournamentId: true, matchId: true, scheduledAt: true },
  });

  for (const slot of staleSlots) {
    auditEvent("TOURNAMENT_INCONSISTENCY_DETECTED", {
      type: "STALE_MATCH",
      staleSince: slot.scheduledAt?.toISOString() ?? null,
      timeoutMs: STALE_MATCH_START_TIMEOUT_MS,
    }, slot.tournamentId, slot.id, slot.matchId ?? undefined);
  }

  return staleSlots.length;
}

// ---------------------------------------------------------------------------
// 8. Settlement recovery
// ---------------------------------------------------------------------------

async function recoverSettlements(): Promise<number> {
  const unsettled = await prisma.tournament.findMany({
    where: {
      status: "COMPLETED",
      settledAt: null,
    },
    select: { id: true },
  });

  let recovered = 0;
  for (const t of unsettled) {
    try {
      await settleTournament(t.id);
      recovered++;
      auditEvent("TOURNAMENT_SETTLEMENT_RETRIED", {
        reason: "completed_not_settled",
      }, t.id);
    } catch (error) {
      console.error(`[SCHEDULER] Failed to settle tournament ${t.id}:`, error);
    }
  }
  return recovered;
}

// ---------------------------------------------------------------------------
// 9. Next-round match recovery — create matches for next-round READY slots
// ---------------------------------------------------------------------------

async function recoverNextRoundMatches(): Promise<number> {
  const slots = await prisma.tournamentRound.findMany({
    where: {
      status: "READY",
      matchId: null,
      playerAId: { not: null },
      playerBId: { not: null },
      roundNumber: { gt: 1 },
      tournament: { status: "IN_PROGRESS" },
    },
    include: { tournament: { select: { id: true } } },
  });

  let created = 0;
  for (const slot of slots) {
    try {
      const matchId = await TournamentMatchService.ensureTournamentRoundMatch(slot.id);
      if (matchId) {
        created++;
        await TournamentMatchService.notifyMatchCreated(slot, matchId);
        await TournamentMatchService.emitMatchCreatedEvent(slot, matchId);
        auditEvent("TOURNAMENT_MATCH_RECOVERED", {
          reason: "next_round_match_missing",
          roundNumber: slot.roundNumber,
        }, slot.tournamentId, slot.id, matchId);
      }
    } catch (error) {
      console.error(`[SCHEDULER] Failed to recover next-round match for slot ${slot.id}:`, error);
    }
  }
  return created;
}

// ---------------------------------------------------------------------------
// 9b. Registration closing reminders
// ---------------------------------------------------------------------------

async function sendRegistrationClosingReminders(): Promise<number> {
  const now = new Date();
  const REMINDER_WINDOWS = [15, 5]; // minutes before registrationEndsAt

  const openTournaments = await prisma.tournament.findMany({
    where: {
      status: "REGISTRATION_OPEN",
      registrationEndsAt: { not: null, gt: now },
    },
    select: { id: true, title: true, registrationEndsAt: true },
  });

  let sent = 0;
  for (const t of openTournaments) {
    if (!t.registrationEndsAt) continue;
    const minutesUntilClose = (t.registrationEndsAt.getTime() - now.getTime()) / 60_000;

    for (const window of REMINDER_WINDOWS) {
      const idempotencyKey = `reg_close_${window}m`;
      const alreadySent = await prisma.tournamentNotificationIdempotency.findUnique({
        where: {
          tournamentId_playerId_eventType_referenceId: {
            tournamentId: t.id,
            playerId: "__system__",
            eventType: "TOURNAMENT_REGISTRATION_CLOSING",
            referenceId: idempotencyKey,
          },
        },
      });

      if (!alreadySent && minutesUntilClose <= window && minutesUntilClose > window - 2) {
        await TournamentNotificationService.notifyRegistrationClosing({
          tournamentId: t.id,
          tournamentTitle: t.title,
          minutesRemaining: window,
        });
        sent++;
        break;
      }
    }
  }
  return sent;
}

// ---------------------------------------------------------------------------
// 9c. Tournament starting reminders (30m, 15m, 5m before startTime)
// ---------------------------------------------------------------------------

async function sendTournamentStartingReminders(): Promise<number> {
  const now = new Date();
  const REMINDER_WINDOWS = [30, 15, 5]; // minutes before startTime

  const closedTournaments = await prisma.tournament.findMany({
    where: {
      status: { in: ["REGISTRATION_CLOSED", "UPCOMING"] },
      startTime: { gt: now },
    },
    select: { id: true, title: true, startTime: true },
  });

  let sent = 0;
  for (const t of closedTournaments) {
    const minutesUntilStart = (t.startTime.getTime() - now.getTime()) / 60_000;

    for (const window of REMINDER_WINDOWS) {
      const idempotencyKey = `starting_${window}m`;
      const alreadySent = await prisma.tournamentNotificationIdempotency.findUnique({
        where: {
          tournamentId_playerId_eventType_referenceId: {
            tournamentId: t.id,
            playerId: "__system__",
            eventType: "TOURNAMENT_STARTING",
            referenceId: idempotencyKey,
          },
        },
      });

      if (!alreadySent && minutesUntilStart <= window && minutesUntilStart > window - 2) {
        await TournamentNotificationService.notifyTournamentStarting({
          tournamentId: t.id,
          tournamentTitle: t.title,
          minutesRemaining: window,
        });
        sent++;
        break;
      }
    }
  }
  return sent;
}

// ---------------------------------------------------------------------------
// MAIN SCHEDULER RUN
// ---------------------------------------------------------------------------

export interface SchedulerRunResult {
  hourlyTournamentsCreated: number;
  registrationsClosed: number;
  tournamentsStarted: number;
  matchesRecovered: number;
  resultsRecovered: number;
  byesRecovered: number;
  nextRoundMatchesRecovered: number;
  referencesChecked: { cleaned: number; inconsistencies: number };
  staleMatchesDetected: number;
  settlementsRetried: number;
  registrationRemindersSent: number;
  startingRemindersSent: number;
  errors: string[];
}

export async function runTournamentScheduler(): Promise<SchedulerRunResult> {
  const result: SchedulerRunResult = {
    hourlyTournamentsCreated: 0,
    registrationsClosed: 0,
    tournamentsStarted: 0,
    matchesRecovered: 0,
    resultsRecovered: 0,
    byesRecovered: 0,
    nextRoundMatchesRecovered: 0,
    referencesChecked: { cleaned: 0, inconsistencies: 0 },
    staleMatchesDetected: 0,
    settlementsRetried: 0,
    registrationRemindersSent: 0,
    startingRemindersSent: 0,
    errors: [],
  };

  const lockKey = "tournament:scheduler:global";

  // Try to acquire the in-process lock (prevents concurrent scheduler runs)
  const locked = acquireLock(lockKey);
  if (!locked) {
    console.log("[SCHEDULER] Scheduler already running, skipping");
    return result;
  }

  try {
    // -1. Create hourly tier-based tournaments for the current clock-hour slot
    try {
      const hourlyResult = await scheduleHourlyTournaments();
      result.hourlyTournamentsCreated = hourlyResult.created;
      for (const err of hourlyResult.errors) {
        result.errors.push(err);
      }
    } catch (error) {
      result.errors.push(`scheduleHourlyTournaments: ${error}`);
    }

    // 0. Open scheduled registrations (registrationStartsAt)
    try {
      await openScheduledRegistrations();
    } catch (error) {
      result.errors.push(`openScheduledRegistrations: ${error}`);
    }

    // 0b. Auto-start when full
    try {
      await autoStartWhenFull();
    } catch (error) {
      result.errors.push(`autoStartWhenFull: ${error}`);
    }

    // 1. Close expired registrations
    try {
      result.registrationsClosed = await closeExpiredRegistrations();
    } catch (error) {
      result.errors.push(`closeExpiredRegistrations: ${error}`);
    }

    // 2. Start eligible tournaments
    try {
      result.tournamentsStarted = await startEligibleTournaments();
    } catch (error) {
      result.errors.push(`startEligibleTournaments: ${error}`);
    }

    // 3. Verify match references (before match recovery)
    try {
      result.referencesChecked = await recoverMatchReferences();
    } catch (error) {
      result.errors.push(`recoverMatchReferences: ${error}`);
    }

    // 4. Recover missing matches
    try {
      result.matchesRecovered = await recoverMissingMatches();
    } catch (error) {
      result.errors.push(`recoverMissingMatches: ${error}`);
    }

    // 5. Recover BYE slots
    try {
      result.byesRecovered = await recoverBYEs();
    } catch (error) {
      result.errors.push(`recoverBYEs: ${error}`);
    }

    // 6. Recover next-round matches (after BYE recovery)
    try {
      result.nextRoundMatchesRecovered = await recoverNextRoundMatches();
    } catch (error) {
      result.errors.push(`recoverNextRoundMatches: ${error}`);
    }

    // 7. Recover match results (completed matches not yet processed)
    try {
      result.resultsRecovered = await recoverMatchResults();
    } catch (error) {
      result.errors.push(`recoverMatchResults: ${error}`);
    }

    // 8. Detect stale matches
    try {
      result.staleMatchesDetected = await detectStaleMatches();
    } catch (error) {
      result.errors.push(`detectStaleMatches: ${error}`);
    }

    // 9. Retry settlements
    try {
      result.settlementsRetried = await recoverSettlements();
    } catch (error) {
      result.errors.push(`recoverSettlements: ${error}`);
    }

    // 10. Send timed notification reminders
    try {
      result.registrationRemindersSent = await sendRegistrationClosingReminders();
    } catch (error) {
      result.errors.push(`sendRegistrationClosingReminders: ${error}`);
    }

    try {
      result.startingRemindersSent = await sendTournamentStartingReminders();
    } catch (error) {
      result.errors.push(`sendTournamentStartingReminders: ${error}`);
    }
  } finally {
    releaseLock(lockKey);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Reconciliation — full audit of a single tournament
// ---------------------------------------------------------------------------

export interface ReconciliationResult {
  tournamentId: string;
  status: TournamentStatus;
  repaired: string[];
  warnings: string[];
  errors: string[];
}

export async function reconcileTournament(tournamentId: string): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    tournamentId,
    status: "DRAFT",
    repaired: [],
    warnings: [],
    errors: [],
  };

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, status: true, settledAt: true },
  });

  if (!tournament) {
    result.errors.push("Tournament not found");
    return result;
  }

  result.status = tournament.status as TournamentStatus;

  auditEvent("TOURNAMENT_RECONCILIATION_STARTED", {}, tournamentId);

  const rounds = await prisma.tournamentRound.findMany({
    where: { tournamentId },
    orderBy: [{ roundNumber: "asc" }, { matchNumber: "asc" }],
  });

  // 1. Check for dangling matchId references
  for (const round of rounds) {
    if (!round.matchId) continue;
    const match = await prisma.match.findUnique({ where: { id: round.matchId } });
    if (!match) {
      result.warnings.push(`TOURNAMENT_MATCH_MISSING: Round ${round.id} references missing Match ${round.matchId}`);

      auditEvent("TOURNAMENT_INCONSISTENCY_DETECTED", {
        type: "TOURNAMENT_MATCH_MISSING",
        missingMatchId: round.matchId,
        roundStatus: round.status,
      }, tournamentId, round.id, round.matchId);

      // Repair: clear stale matchId if not completed
      if (round.status !== "COMPLETED" && round.status !== "BYE" && round.status !== "CANCELLED") {
        if (round.playerAId && round.playerBId) {
          await prisma.tournamentRound.update({
            where: { id: round.id },
            data: { matchId: null, status: "READY" },
          });
          result.repaired.push(`Cleared dangling matchId on round ${round.id}`);
        }
      }
    }
  }

  // 2. Check for completed matches with unprocessed results
  for (const round of rounds) {
    if (round.status !== "IN_PROGRESS" || !round.matchId) continue;

    const match = await prisma.match.findUnique({
      where: { id: round.matchId },
      select: { status: true, winnerIds: true },
    });

    if (match && (match.status === "FINISHED" || match.status === "ABORTED")) {
      const idempotency = await prisma.tournamentResultIdempotency.findUnique({
        where: { matchId: round.matchId },
      });

      if (!idempotency) {
        result.warnings.push(`UNPROCESSED_RESULT: Match ${round.matchId} is ${match.status} but result not processed`);

        auditEvent("TOURNAMENT_INCONSISTENCY_DETECTED", {
          type: "UNPROCESSED_RESULT",
          matchStatus: match.status,
        }, tournamentId, round.id, round.matchId);

        // Repair: process the result
        const winnerIds = match.winnerIds as unknown as string[];
        const winnerId = Array.isArray(winnerIds) ? winnerIds[0] : null;
        if (winnerId) {
          try {
            await processMatchResult({
              matchId: round.matchId,
              tournamentId,
              roundId: round.id,
              winnerId,
            });
            result.repaired.push(`Processed unprocessed result for match ${round.matchId}`);
          } catch (error) {
            result.errors.push(`Failed to process result for match ${round.matchId}: ${error}`);
          }
        }
      }
    }
  }

  // 3. Check for READY slots without matches
  for (const round of rounds) {
    if (round.status !== "READY" || round.matchId || !round.playerAId || !round.playerBId) continue;

    result.warnings.push(`MISSING_MATCH: Round slot ${round.id} is READY but has no match`);
    result.repaired.push(`Triggering match creation for slot ${round.id}`);

    try {
      const matchId = await TournamentMatchService.ensureTournamentRoundMatch(round.id);
      if (matchId) {
        await TournamentMatchService.notifyMatchCreated(round, matchId);
        await TournamentMatchService.emitMatchCreatedEvent(round, matchId);
      }
    } catch (error) {
      result.errors.push(`Failed to create match for slot ${round.id}: ${error}`);
    }
  }

  // 4. Check for duplicate matchId (matchId is unique per TournamentRound, but check Match side)
  const matchIds = rounds.filter((r) => r.matchId).map((r) => r.matchId!);
  const uniqueMatchIds = new Set(matchIds);
  if (uniqueMatchIds.size < matchIds.length) {
    result.errors.push("DUPLICATE_MATCH_REFERENCE: Multiple rounds reference the same match");
    auditEvent("TOURNAMENT_INCONSISTENCY_DETECTED", {
      type: "DUPLICATE_MATCH_REFERENCE",
      matchIds: [...uniqueMatchIds],
    }, tournamentId);
  }

  // 5. Check tournament completion vs settlement
  if (tournament.status === "COMPLETED" && !tournament.settledAt) {
    result.warnings.push("UNSETTLED: Tournament is COMPLETED but not settled");
    try {
      await settleTournament(tournamentId);
      result.repaired.push("Triggered settlement for unsettled tournament");
    } catch (error) {
      result.errors.push(`Failed to settle tournament: ${error}`);
    }
  }

  // 6. Check current round validity
  if (tournament.status === "IN_PROGRESS") {
    const activeRounds = rounds.filter(
      (r) => r.status === "READY" || r.status === "IN_PROGRESS",
    );
    const completedRounds = rounds.filter((r) => r.status === "COMPLETED" || r.status === "BYE");
    const maxRound = rounds.length > 0 ? Math.max(...rounds.map((r) => r.roundNumber)) : 0;

    // Check if all rounds in current group are done
    if (activeRounds.length === 0 && completedRounds.length > 0) {
      // All active matches are done, but tournament still IN_PROGRESS
      // This means the round completion check may have missed something
      const allRoundNumbers = [...new Set(rounds.map((r) => r.roundNumber))];
      for (const rn of allRoundNumbers) {
        const roundSlots = rounds.filter((r) => r.roundNumber === rn);
        const allDone = roundSlots.every(
          (s) => s.status === "COMPLETED" || s.status === "BYE" || s.status === "CANCELLED",
        );
        if (allDone && rn === maxRound) {
          result.warnings.push(`ROUND_COMPLETE_NOT_ADVANCED: Round ${rn} is complete but tournament still IN_PROGRESS`);
        }
      }
    }

    // 7. Check for missing winners in completed rounds
    for (const round of rounds) {
      if (round.status === "COMPLETED" && !round.winnerId && !round.isBye) {
        result.warnings.push(`MISSING_WINNER: Completed round ${round.id} has no winner`);
      }
    }
  }

  auditEvent("TOURNAMENT_RECONCILIATION_COMPLETED", {
    repaired: result.repaired.length,
    warnings: result.warnings.length,
    errors: result.errors.length,
  }, tournamentId);

  return result;
}

// ---------------------------------------------------------------------------
// Tournament health
// ---------------------------------------------------------------------------

export interface TournamentHealth {
  tournamentId: string;
  status: TournamentStatus;
  currentRound: number | null;
  totalRounds: number;
  activeMatches: number;
  pendingMatches: number;
  completedMatches: number;
  missingMatches: number;
  unprocessedResults: number;
  settlementStatus: "NOT_NEEDED" | "PENDING" | "SETTLED";
  health: "HEALTHY" | "WARNING" | "ERROR";
}

export async function getTournamentHealth(tournamentId: string): Promise<TournamentHealth> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, status: true, settledAt: true },
  });

  if (!tournament) {
    return {
      tournamentId,
      status: "DRAFT",
      currentRound: null,
      totalRounds: 0,
      activeMatches: 0,
      pendingMatches: 0,
      completedMatches: 0,
      missingMatches: 0,
      unprocessedResults: 0,
      settlementStatus: "NOT_NEEDED",
      health: "ERROR",
    };
  }

  const rounds = await prisma.tournamentRound.findMany({
    where: { tournamentId },
    orderBy: [{ roundNumber: "asc" }, { matchNumber: "asc" }],
  });

  const totalRounds = rounds.length > 0 ? Math.max(...rounds.map((r) => r.roundNumber)) : 0;

  // Find current round (first round with active matches)
  const activeRoundSlots = rounds.filter(
    (r) => r.status === "READY" || r.status === "IN_PROGRESS",
  );
  const currentRound = activeRoundSlots.length > 0
    ? Math.min(...activeRoundSlots.map((r) => r.roundNumber))
    : null;

  const activeMatches = rounds.filter((r) => r.status === "IN_PROGRESS" && r.matchId).length;
  const pendingMatches = rounds.filter((r) => r.status === "READY" && !r.matchId).length;
  const completedMatches = rounds.filter((r) => r.status === "COMPLETED").length;

  // Missing matches: slots with matchId pointing to non-existent Match
  let missingMatches = 0;
  const slotsWithMatchId = rounds.filter((r) => r.matchId !== null);
  for (const slot of slotsWithMatchId) {
    const match = await prisma.match.findUnique({ where: { id: slot.matchId! }, select: { id: true } });
    if (!match) missingMatches++;
  }

  // Unprocessed results: matches COMPLETED/FORFEITED but tournamentRound still IN_PROGRESS
  let unprocessedResults = 0;
  const inProgressRounds = rounds.filter((r) => r.status === "IN_PROGRESS" && r.matchId);
  for (const slot of inProgressRounds) {
    const match = await prisma.match.findUnique({
      where: { id: slot.matchId! },
      select: { status: true },
    });
    if (match && (match.status === "FINISHED" || match.status === "ABORTED")) {
      const idempotency = await prisma.tournamentResultIdempotency.findUnique({
        where: { matchId: slot.matchId! },
      });
      if (!idempotency) unprocessedResults++;
    }
  }

  // Settlement status
  let settlementStatus: TournamentHealth["settlementStatus"] = "NOT_NEEDED";
  if (tournament.status === "COMPLETED" || tournament.status === "SETTLING" || tournament.status === "SETTLED") {
    settlementStatus = tournament.settledAt ? "SETTLED" : "PENDING";
  }

  // Determine health
  let health: TournamentHealth["health"] = "HEALTHY";
  if (missingMatches > 0 || unprocessedResults > 0) {
    health = "WARNING";
  }
  if (missingMatches > 2 || unprocessedResults > 2) {
    health = "ERROR";
  }

  return {
    tournamentId,
    status: tournament.status as TournamentStatus,
    currentRound,
    totalRounds,
    activeMatches,
    pendingMatches,
    completedMatches,
    missingMatches,
    unprocessedResults,
    settlementStatus,
    health,
  };
}
