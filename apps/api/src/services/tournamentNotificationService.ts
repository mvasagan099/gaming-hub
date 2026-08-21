import { prisma, Prisma } from "@gaming-hub/db";
import type { TournamentNotificationEvent } from "@gaming-hub/shared";
import { notifyUserSocket } from "./socketBridge";

// ---------------------------------------------------------------------------
// Round name helper
// ---------------------------------------------------------------------------

function getRoundName(roundNumber: number, totalRounds: number): string {
  if (roundNumber === totalRounds) return "Final";
  if (roundNumber === totalRounds - 1) return "Semi Final";
  if (roundNumber === totalRounds - 2) return "Quarter Final";
  return `Round ${roundNumber}`;
}

// ---------------------------------------------------------------------------
// Idempotent notification creation
//
// Core flow:
//   1. Check TournamentNotificationIdempotency for duplicate
//   2. Create AppNotification in DB
//   3. Create idempotency record in same transaction
//   4. Send WebSocket event (fire-and-forget)
// ---------------------------------------------------------------------------

async function sendTournamentNotification(params: {
  tournamentId: string;
  playerId: string;
  eventType: TournamentNotificationEvent;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  referenceId?: string;
  /** Bypass preference check (for critical transactional notifications). */
  bypassPreferences?: boolean;
}): Promise<void> {
  const { tournamentId, playerId, eventType, title, body, data, bypassPreferences } = params;
  const referenceId = params.referenceId ?? "";

  // Check user preferences (unless bypassed for critical notifications)
  if (!bypassPreferences) {
    const allowed = await checkNotificationPreference(playerId, eventType);
    if (!allowed) return;
  }

  // Idempotency check
  const existing = await prisma.tournamentNotificationIdempotency.findUnique({
    where: {
      tournamentId_playerId_eventType_referenceId: {
        tournamentId,
        playerId,
        eventType,
        referenceId,
      },
    },
  });
  if (existing) return;

  // Persist notification + idempotency record in a transaction
  let notificationId: string;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const notification = await tx.appNotification.create({
        data: {
          userId: playerId,
          type: "TOURNAMENT",
          title,
          body,
          tournamentEventType: eventType,
          referenceId,
          data: (data ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });

      await tx.tournamentNotificationIdempotency.create({
        data: {
          tournamentId,
          playerId,
          eventType,
          referenceId,
        },
      });

      return notification;
    });
    notificationId = result.id;
  } catch (error) {
    // Unique constraint violation on idempotency = race condition, another
    // instance already created this notification. Safe to ignore.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return;
    }
    throw error;
  }

  // Fire-and-forget WebSocket push
  try {
    await notifyUserSocket(playerId, "notification:new", {
      notificationId,
      type: "TOURNAMENT",
      tournamentEventType: eventType,
      title,
      body,
      data: data ?? null,
      createdAt: new Date().toISOString(),
    });
  } catch {
    // WebSocket failure must not affect the persisted notification.
  }
}

// ---------------------------------------------------------------------------
// Preference check
// ---------------------------------------------------------------------------

async function checkNotificationPreference(
  playerId: string,
  eventType: TournamentNotificationEvent,
): Promise<boolean> {
  const pref = await prisma.notificationPreference.findUnique({
    where: { userId: playerId },
  });

  // Default: all enabled when no preference record exists
  if (!pref) return true;

  // Critical transactional notifications always go through
  const critical: TournamentNotificationEvent[] = [
    "TOURNAMENT_PRIZE_CREDITED",
    "TOURNAMENT_REFUNDED",
    "TOURNAMENT_CANCELLED",
  ];
  if (critical.includes(eventType)) return true;

  // Map event to preference flag
  if (
    eventType === "TOURNAMENT_MATCH_READY" ||
    eventType === "TOURNAMENT_MATCH_STARTED" ||
    eventType === "TOURNAMENT_BYE"
  ) {
    return pref.matchReadyNotifications;
  }

  if (
    eventType === "TOURNAMENT_WON" ||
    eventType === "TOURNAMENT_PRIZE_CREDITED"
  ) {
    return pref.prizeNotifications;
  }

  return pref.tournamentNotifications;
}

// ---------------------------------------------------------------------------
// Public notification methods
// ---------------------------------------------------------------------------

export class TournamentNotificationService {
  /**
   * TOURNAMENT_REGISTERED
   * Sent after successful registration transaction.
   */
  static async notifyRegistration(params: {
    tournamentId: string;
    playerId: string;
    tournamentTitle: string;
    entryFee: number;
    playerCount: number;
    maxPlayers: number;
    startTime: Date | string;
  }): Promise<void> {
    const startDate = typeof params.startTime === "string" ? new Date(params.startTime) : params.startTime;
    const startTimeStr = startDate.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    await sendTournamentNotification({
      tournamentId: params.tournamentId,
      playerId: params.playerId,
      eventType: "TOURNAMENT_REGISTERED",
      title: `Tournament Joined`,
      body: `You have successfully joined ${params.tournamentTitle}.`,
      data: {
        entryFee: params.entryFee,
        playerCount: params.playerCount,
        maxPlayers: params.maxPlayers,
        startTime: startTimeStr,
      },
      referenceId: `reg_${params.playerId}`,
    });
  }

  /**
   * TOURNAMENT_REGISTRATION_CLOSING
   * Reminder sent before registration closes (configurable, default 15 min).
   */
  static async notifyRegistrationClosing(params: {
    tournamentId: string;
    tournamentTitle: string;
    minutesRemaining: number;
  }): Promise<void> {
    const players = await prisma.tournamentPlayer.findMany({
      where: { tournamentId: params.tournamentId },
      select: { userId: true },
    });

    for (const player of players) {
      await sendTournamentNotification({
        tournamentId: params.tournamentId,
        playerId: player.userId,
        eventType: "TOURNAMENT_REGISTRATION_CLOSING",
        title: "Registration Closing Soon",
        body: `${params.tournamentTitle} registration closes in ${params.minutesRemaining} minutes.`,
        data: { minutesRemaining: params.minutesRemaining },
        referenceId: `reg_close_${params.minutesRemaining}m`,
      });
    }
  }

  /**
   * TOURNAMENT_REGISTRATION_CLOSED
   * Sent when registration closes.
   */
  static async notifyRegistrationClosed(params: {
    tournamentId: string;
    tournamentTitle: string;
  }): Promise<void> {
    const players = await prisma.tournamentPlayer.findMany({
      where: { tournamentId: params.tournamentId },
      select: { userId: true, seed: true },
    });

    for (const player of players) {
      await sendTournamentNotification({
        tournamentId: params.tournamentId,
        playerId: player.userId,
        eventType: "TOURNAMENT_REGISTRATION_CLOSED",
        title: "Registration Closed",
        body: `Registration has closed. Your tournament is being prepared.`,
        data: {
          seed: player.seed ? `#${player.seed}` : null,
        },
        referenceId: `reg_closed`,
      });
    }
  }

  /**
   * TOURNAMENT_STARTING
   * Timed reminders (30m, 15m, 5m) before tournament starts.
   */
  static async notifyTournamentStarting(params: {
    tournamentId: string;
    tournamentTitle: string;
    minutesRemaining: number;
  }): Promise<void> {
    const players = await prisma.tournamentPlayer.findMany({
      where: { tournamentId: params.tournamentId },
      select: { userId: true },
    });

    for (const player of players) {
      await sendTournamentNotification({
        tournamentId: params.tournamentId,
        playerId: player.userId,
        eventType: "TOURNAMENT_STARTING",
        title: "Tournament Starting Soon",
        body: `${params.tournamentTitle} starts in ${params.minutesRemaining} minutes.`,
        data: { minutesRemaining: params.minutesRemaining },
        referenceId: `starting_${params.minutesRemaining}m`,
      });
    }
  }

  /**
   * TOURNAMENT_STARTED
   * Sent when tournament transitions STARTING → IN_PROGRESS.
   */
  static async notifyTournamentStarted(params: {
    tournamentId: string;
    tournamentTitle: string;
  }): Promise<void> {
    const players = await prisma.tournamentPlayer.findMany({
      where: { tournamentId: params.tournamentId },
      select: { userId: true },
    });

    for (const player of players) {
      await sendTournamentNotification({
        tournamentId: params.tournamentId,
        playerId: player.userId,
        eventType: "TOURNAMENT_STARTED",
        title: "Tournament Started!",
        body: `${params.tournamentTitle} has started. Round 1 bracket is ready.`,
        data: {},
        referenceId: `started`,
      });
    }
  }

  /**
   * TOURNAMENT_MATCH_READY
   * Most important notification — sent when both players assigned to a slot.
   */
  static async notifyMatchReady(params: {
    tournamentId: string;
    tournamentTitle: string;
    roundId: string;
    matchId: string;
    roundNumber: number;
    totalRounds: number;
    gameId: string;
    playerAId: string;
    playerBId: string;
  }): Promise<void> {
    const roundName = getRoundName(params.roundNumber, params.totalRounds);

    // Resolve opponent usernames
    const opponents = await prisma.user.findMany({
      where: { id: { in: [params.playerAId, params.playerBId] } },
      select: { id: true, displayName: true },
    });
    const playerA = opponents.find((u) => u.id === params.playerAId);
    const playerB = opponents.find((u) => u.id === params.playerBId);

    const data = {
      tournamentId: params.tournamentId,
      roundId: params.roundId,
      matchId: params.matchId,
      roundNumber: params.roundNumber,
      gameId: params.gameId,
    };

    // Notify player A
    await sendTournamentNotification({
      tournamentId: params.tournamentId,
      playerId: params.playerAId,
      eventType: "TOURNAMENT_MATCH_READY",
      title: "Tournament Match Ready",
      body: `Your ${roundName} match in ${params.tournamentTitle} is ready! vs ${playerB?.displayName ?? "Opponent"}`,
      data: { ...data, opponentId: params.playerBId },
      referenceId: params.matchId,
    });

    // Notify player B
    await sendTournamentNotification({
      tournamentId: params.tournamentId,
      playerId: params.playerBId,
      eventType: "TOURNAMENT_MATCH_READY",
      title: "Tournament Match Ready",
      body: `Your ${roundName} match in ${params.tournamentTitle} is ready! vs ${playerA?.displayName ?? "Opponent"}`,
      data: { ...data, opponentId: params.playerAId },
      referenceId: params.matchId,
    });
  }

  /**
   * TOURNAMENT_BYE
   * Sent when a player receives a BYE advancement.
   */
  static async notifyBye(params: {
    tournamentId: string;
    tournamentTitle: string;
    roundNumber: number;
    totalRounds: number;
    playerId: string;
    nextSlotId: string | null;
  }): Promise<void> {
    const nextRoundName = getRoundName(params.roundNumber + 1, params.totalRounds);

    await sendTournamentNotification({
      tournamentId: params.tournamentId,
      playerId: params.playerId,
      eventType: "TOURNAMENT_BYE",
      title: "BYE Received",
      body: `You received a BYE. Your opponent was not required for this round. You have advanced to ${nextRoundName}.`,
      data: {
        roundNumber: params.roundNumber,
        nextRoundNumber: params.roundNumber + 1,
        nextSlotId: params.nextSlotId,
      },
      referenceId: `bye_r${params.roundNumber}_${params.playerId}`,
    });
  }

  /**
   * TOURNAMENT_ADVANCED
   * Sent to winner after authoritative match result.
   */
  static async notifyAdvanced(params: {
    tournamentId: string;
    tournamentTitle: string;
    winnerId: string;
    roundNumber: number;
    totalRounds: number;
    nextRoundNumber: number | null;
    nextSlotId: string | null;
    matchId: string;
  }): Promise<void> {
    const roundName = getRoundName(params.roundNumber, params.totalRounds);

    if (params.nextRoundNumber !== null) {
      const nextRoundName = getRoundName(params.nextRoundNumber, params.totalRounds);
      await sendTournamentNotification({
        tournamentId: params.tournamentId,
        playerId: params.winnerId,
        eventType: "TOURNAMENT_ADVANCED",
        title: "You Advanced!",
        body: `You won your ${roundName}! You have advanced to ${nextRoundName}.`,
        data: {
          roundNumber: params.roundNumber,
          nextRoundNumber: params.nextRoundNumber,
          nextSlotId: params.nextSlotId,
          matchId: params.matchId,
        },
        referenceId: params.matchId,
      });
    } else {
      // This was the final round — handled by notifyWinner instead
      // But if somehow called with null next round, just skip
    }
  }

  /**
   * TOURNAMENT_ELIMINATED
   * Sent to loser after authoritative match result.
   */
  static async notifyEliminated(params: {
    tournamentId: string;
    tournamentTitle: string;
    loserId: string;
    roundNumber: number;
    totalRounds: number;
    finalRank: number | null;
    matchId: string;
  }): Promise<void> {
    const roundName = getRoundName(params.roundNumber, params.totalRounds);
    const rankText = params.finalRank
      ? ` Final rank: ${params.finalRank}${ordinalSuffix(params.finalRank)}`
      : "";

    await sendTournamentNotification({
      tournamentId: params.tournamentId,
      playerId: params.loserId,
      eventType: "TOURNAMENT_ELIMINATED",
      title: "Tournament Eliminated",
      body: `You have been eliminated from ${params.tournamentTitle} in the ${roundName}.${rankText}`,
      data: {
        roundNumber: params.roundNumber,
        finalRank: params.finalRank,
        matchId: params.matchId,
      },
      referenceId: params.matchId,
    });
  }

  /**
   * TOURNAMENT_FINAL
   * Sent when player reaches the final round.
   */
  static async notifyFinal(params: {
    tournamentId: string;
    tournamentTitle: string;
    playerId: string;
    opponentId: string;
    matchId: string;
    roundNumber: number;
  }): Promise<void> {
    const opponent = await prisma.user.findUnique({
      where: { id: params.opponentId },
      select: { displayName: true },
    });

    await sendTournamentNotification({
      tournamentId: params.tournamentId,
      playerId: params.playerId,
      eventType: "TOURNAMENT_FINAL",
      title: "Grand Final!",
      body: `You reached the Grand Final of ${params.tournamentTitle}! Final: You vs ${opponent?.displayName ?? "Opponent"}`,
      data: {
        tournamentId: params.tournamentId,
        matchId: params.matchId,
        opponentId: params.opponentId,
        roundNumber: params.roundNumber,
      },
      referenceId: params.matchId,
    });
  }

  /**
   * TOURNAMENT_WON
   * Sent after final result confirms champion.
   */
  static async notifyWinner(params: {
    tournamentId: string;
    tournamentTitle: string;
    winnerId: string;
    prizeAmount?: number;
    ratingChange?: number;
  }): Promise<void> {
    const prizeText = params.prizeAmount
      ? ` Prize: ${params.prizeAmount.toLocaleString()} Coins.`
      : "";
    const ratingText = params.ratingChange
      ? ` Rating: ${params.ratingChange >= 0 ? "+" : ""}${params.ratingChange}`
      : "";

    await sendTournamentNotification({
      tournamentId: params.tournamentId,
      playerId: params.winnerId,
      eventType: "TOURNAMENT_WON",
      title: "Tournament Champion!",
      body: `You won the ${params.tournamentTitle}! 1st Place.${prizeText}${ratingText}`,
      data: {
        prizeAmount: params.prizeAmount ?? null,
        ratingChange: params.ratingChange ?? null,
      },
      referenceId: `won_${params.winnerId}`,
      bypassPreferences: true,
    });
  }

  /**
   * TOURNAMENT_COMPLETED
   * Sent to all participants when tournament finishes.
   */
  static async notifyCompleted(params: {
    tournamentId: string;
    tournamentTitle: string;
  }): Promise<void> {
    const players = await prisma.tournamentPlayer.findMany({
      where: { tournamentId: params.tournamentId },
      select: { userId: true, finalRank: true },
    });

    for (const player of players) {
      // Don't send to champion (they get TOURNAMENT_WON)
      if (player.finalRank === 1) continue;

      const rankText = player.finalRank
        ? ` Final rank: ${player.finalRank}${ordinalSuffix(player.finalRank)}.`
        : "";

      await sendTournamentNotification({
        tournamentId: params.tournamentId,
        playerId: player.userId,
        eventType: "TOURNAMENT_COMPLETED",
        title: "Tournament Completed",
        body: `${params.tournamentTitle} has finished.${rankText}`,
        data: { finalRank: player.finalRank },
        referenceId: `completed_${player.userId}`,
      });
    }
  }

  /**
   * TOURNAMENT_PRIZE_CREDITED
   * Sent after wallet settlement succeeds.
   */
  static async notifyPrizeCredited(params: {
    tournamentId: string;
    tournamentTitle: string;
    playerId: string;
    rank: number;
    amount: number;
  }): Promise<void> {
    await sendTournamentNotification({
      tournamentId: params.tournamentId,
      playerId: params.playerId,
      eventType: "TOURNAMENT_PRIZE_CREDITED",
      title: "Prize Credited!",
      body: `${params.amount.toLocaleString()} Coins have been credited to your wallet for finishing ${params.rank}${ordinalSuffix(params.rank)} place in ${params.tournamentTitle}.`,
      data: {
        rank: params.rank,
        amount: params.amount,
      },
      referenceId: `prize_${params.playerId}`,
      bypassPreferences: true,
    });
  }

  /**
   * TOURNAMENT_CANCELLED
   * Sent to all registered players when tournament is cancelled.
   */
  static async notifyCancelled(params: {
    tournamentId: string;
    tournamentTitle: string;
    reason?: string;
  }): Promise<void> {
    const players = await prisma.tournamentPlayer.findMany({
      where: { tournamentId: params.tournamentId },
      select: { userId: true },
    });

    const reasonText = params.reason ? ` Reason: ${params.reason}` : "";

    for (const player of players) {
      await sendTournamentNotification({
        tournamentId: params.tournamentId,
        playerId: player.userId,
        eventType: "TOURNAMENT_CANCELLED",
        title: "Tournament Cancelled",
        body: `${params.tournamentTitle} has been cancelled.${reasonText}`,
        data: { reason: params.reason ?? null },
        referenceId: `cancelled`,
        bypassPreferences: true,
      });
    }
  }

  /**
   * TOURNAMENT_REFUNDED
   * Sent after successful refund transaction.
   */
  static async notifyRefunded(params: {
    tournamentId: string;
    tournamentTitle: string;
    playerId: string;
    amount: number;
  }): Promise<void> {
    await sendTournamentNotification({
      tournamentId: params.tournamentId,
      playerId: params.playerId,
      eventType: "TOURNAMENT_REFUNDED",
      title: "Entry Fee Refunded",
      body: `${params.amount.toLocaleString()} Coins have been refunded to your wallet.`,
      data: { amount: params.amount },
      referenceId: `refund_${params.playerId}`,
      bypassPreferences: true,
    });
  }

  // -----------------------------------------------------------------------
  // Admin operational alerts
  // -----------------------------------------------------------------------

  /**
   * Send an admin operational alert. Delivered to all admin users.
   */
  static async notifyAdmin(params: {
    eventType: "TOURNAMENT_ADMIN_ERROR" | "TOURNAMENT_ADMIN_STUCK" | "TOURNAMENT_SETTLEMENT_FAILED" | "TOURNAMENT_BRACKET_INCONSISTENCY";
    tournamentId: string;
    tournamentTitle: string;
    issue: string;
    actionUrl?: string;
  }): Promise<void> {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    });

    const titleMap: Record<string, string> = {
      TOURNAMENT_ADMIN_ERROR: "Tournament Error",
      TOURNAMENT_ADMIN_STUCK: "Tournament Stuck",
      TOURNAMENT_SETTLEMENT_FAILED: "Settlement Failed",
      TOURNAMENT_BRACKET_INCONSISTENCY: "Bracket Inconsistency",
    };

    for (const admin of admins) {
      await sendTournamentNotification({
        tournamentId: params.tournamentId,
        playerId: admin.id,
        eventType: params.eventType,
        title: titleMap[params.eventType] ?? "Tournament Alert",
        body: `${params.tournamentTitle} requires attention. Issue: ${params.issue}`,
        data: {
          tournamentId: params.tournamentId,
          tournamentTitle: params.tournamentTitle,
          issue: params.issue,
          actionUrl: params.actionUrl ?? null,
        },
        referenceId: `${params.eventType}_${params.tournamentId}`,
        bypassPreferences: true,
      });
    }
  }

  /**
   * Send notification about tournament starting match.
   */
  static async notifyMatchStarted(params: {
    tournamentId: string;
    roundId: string;
    matchId: string;
    playerAId: string;
    playerBId: string;
  }): Promise<void> {
    for (const playerId of [params.playerAId, params.playerBId]) {
      await sendTournamentNotification({
        tournamentId: params.tournamentId,
        playerId,
        eventType: "TOURNAMENT_MATCH_STARTED",
        title: "Match Started",
        body: `Your tournament match has started.`,
        data: {
          matchId: params.matchId,
          roundId: params.roundId,
        },
        referenceId: params.matchId,
      });
    }
  }

  /**
   * Notify about tournament completion for the final round specifically.
   */
  static async notifyFinalRoundComplete(params: {
    tournamentId: string;
    tournamentTitle: string;
    winnerId: string;
    loserId: string;
    matchId: string;
  }): Promise<void> {
    // Loser gets 2nd place notification
    await sendTournamentNotification({
      tournamentId: params.tournamentId,
      playerId: params.loserId,
      eventType: "TOURNAMENT_ELIMINATED",
      title: "Runner-Up",
      body: `You finished 2nd in ${params.tournamentTitle}. Great tournament!`,
      data: {
        finalRank: 2,
        matchId: params.matchId,
      },
      referenceId: params.matchId,
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ordinalSuffix(n: number): string {
  const abs = Math.abs(n);
  if (abs % 100 >= 11 && abs % 100 <= 13) return "th";
  switch (abs % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}
