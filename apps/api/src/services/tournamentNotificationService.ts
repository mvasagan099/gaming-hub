import { prisma, Prisma } from "@gaming-hub/db";
import type { TournamentNotificationEvent } from "@gaming-hub/shared";
import { notifyUserSocket } from "./socketBridge";
import { TournamentEmailService } from "./tournamentEmailService";

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

    // Transactional Email notification (informational backup)
    await TournamentEmailService.sendRegistrationEmail({
      userId: params.playerId,
      tournamentId: params.tournamentId,
      tournamentTitle: params.tournamentTitle,
      gameId: (params as any).gameId ?? "chess",
    }).catch(() => undefined);
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
    gameId?: string;
    startTime?: string;
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

      await TournamentEmailService.sendTournamentStartingEmail({
        userId: player.userId,
        tournamentId: params.tournamentId,
        tournamentTitle: params.tournamentTitle,
        gameId: params.gameId ?? "tournament",
        minutesRemaining: params.minutesRemaining,
        startTime: params.startTime,
      }).catch(() => undefined);
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

      // Email backup
      await TournamentEmailService.sendTournamentStartedEmail({
        userId: player.userId,
        tournamentId: params.tournamentId,
        tournamentTitle: params.tournamentTitle,
      }).catch(() => undefined);
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

    await TournamentEmailService.sendMatchAssignedEmail({
      userId: params.playerAId,
      tournamentId: params.tournamentId,
      tournamentTitle: params.tournamentTitle,
      matchId: params.matchId,
      roundNumber: roundName,
      gameId: params.gameId,
      opponentDisplayName: playerB?.displayName ?? "Opponent",
    }).catch(() => undefined);

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

    await TournamentEmailService.sendMatchAssignedEmail({
      userId: params.playerBId,
      tournamentId: params.tournamentId,
      tournamentTitle: params.tournamentTitle,
      matchId: params.matchId,
      roundNumber: roundName,
      gameId: params.gameId,
      opponentDisplayName: playerA?.displayName ?? "Opponent",
    }).catch(() => undefined);
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

    await TournamentEmailService.sendNextRoundEmail({
      userId: params.playerId,
      tournamentId: params.tournamentId,
      tournamentTitle: params.tournamentTitle,
      nextRoundName,
    }).catch(() => undefined);
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

      await TournamentEmailService.sendNextRoundEmail({
        userId: params.winnerId,
        tournamentId: params.tournamentId,
        tournamentTitle: params.tournamentTitle,
        nextRoundName,
      }).catch(() => undefined);
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

    await TournamentEmailService.sendEliminationEmail({
      userId: params.loserId,
      tournamentId: params.tournamentId,
      tournamentTitle: params.tournamentTitle,
      roundNumber: roundName,
    }).catch(() => undefined);
  }

  /**
   * TOURNAMENT_FINAL
   * Sent when player reaches the final round ("🏆 YOU REACHED THE FINAL").
   */
  static async notifyFinal(params: {
    tournamentId: string;
    tournamentTitle: string;
    playerId: string;
    opponentId: string;
    matchId: string;
    roundNumber: number;
    gameId?: string;
  }): Promise<void> {
    const opponent = await prisma.user.findUnique({
      where: { id: params.opponentId },
      select: { displayName: true },
    });
    const opponentDisplayName = opponent?.displayName ?? "Opponent";

    await sendTournamentNotification({
      tournamentId: params.tournamentId,
      playerId: params.playerId,
      eventType: "TOURNAMENT_FINAL",
      title: "Grand Final!",
      body: `You reached the Grand Final of ${params.tournamentTitle}! Final: You vs ${opponentDisplayName}`,
      data: {
        tournamentId: params.tournamentId,
        matchId: params.matchId,
        opponentId: params.opponentId,
        opponentDisplayName,
        roundNumber: params.roundNumber,
        gameId: params.gameId,
      },
      referenceId: params.matchId,
    });

    await TournamentEmailService.sendFinalistEmail({
      userId: params.playerId,
      tournamentId: params.tournamentId,
      tournamentTitle: params.tournamentTitle,
      matchId: params.matchId,
      opponentDisplayName,
      gameId: params.gameId,
    }).catch(() => undefined);
  }

  /**
   * TOURNAMENT_PODIUM
   * Sent to 2nd, 3rd, and 4th place finishers with exact authoritative prize coins.
   */
  static async notifyPodiumPlacement(params: {
    tournamentId: string;
    tournamentTitle: string;
    playerId: string;
    rank: number;
    prizeAmount: number;
  }): Promise<void> {
    const medal = params.rank === 2 ? "🥈" : params.rank === 3 ? "🥉" : "4️⃣";
    const rankLabel = params.rank === 2 ? "2nd Place" : params.rank === 3 ? "3rd Place" : "4th Place";

    await sendTournamentNotification({
      tournamentId: params.tournamentId,
      playerId: params.playerId,
      eventType: "TOURNAMENT_PODIUM",
      title: `${medal} You Finished ${rankLabel}!`,
      body: `You finished ${rankLabel} in ${params.tournamentTitle}! Prize: ${params.prizeAmount.toLocaleString()} Coins.`,
      data: {
        rank: params.rank,
        prizeAmount: params.prizeAmount,
      },
      referenceId: `podium_${params.rank}_${params.playerId}`,
    });

    await TournamentEmailService.sendPodiumPlacementEmail({
      userId: params.playerId,
      tournamentId: params.tournamentId,
      tournamentTitle: params.tournamentTitle,
      rank: params.rank,
      prizeAmount: params.prizeAmount,
    }).catch(() => undefined);
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

    await TournamentEmailService.sendTournamentWinEmail({
      userId: params.winnerId,
      tournamentId: params.tournamentId,
      tournamentTitle: params.tournamentTitle,
      finalResult: "1st Place Champion",
      prizeAmount: params.prizeAmount,
    }).catch(() => undefined);
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
    transactionId?: string;
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
        transactionId: params.transactionId ?? null,
      },
      referenceId: `prize_${params.playerId}`,
      bypassPreferences: true,
    });

    await TournamentEmailService.sendPrizeCreditedEmail({
      userId: params.playerId,
      tournamentId: params.tournamentId,
      tournamentTitle: params.tournamentTitle,
      rank: params.rank,
      amount: params.amount,
      transactionId: params.transactionId,
    }).catch(() => undefined);
  }

  /**
   * TOURNAMENT_CANCELLED
   * Sent to registered players when tournament is cancelled.
   */
  static async notifyCancelled(params: {
    tournamentId: string;
    tournamentTitle: string;
    reason?: string;
    entryFee?: number;
    playerId?: string;
  }): Promise<void> {
    const reasonText = params.reason || "The minimum number of players was not reached.";
    const body =
      params.entryFee && params.entryFee > 0
        ? `The tournament was cancelled (${reasonText}). Your ${params.entryFee} coins will be refunded according to the tournament refund process.`
        : `The tournament was cancelled (${reasonText}).`;

    if (params.playerId) {
      await sendTournamentNotification({
        tournamentId: params.tournamentId,
        playerId: params.playerId,
        eventType: "TOURNAMENT_CANCELLED",
        title: "Tournament Cancelled",
        body,
        data: { reason: params.reason, entryFee: params.entryFee },
        referenceId: `cancelled_${params.tournamentId}`,
        bypassPreferences: true,
      });
      await TournamentEmailService.sendTournamentCancelledEmail({
        userId: params.playerId,
        tournamentId: params.tournamentId,
        tournamentTitle: params.tournamentTitle,
        reason: reasonText,
        entryFee: params.entryFee,
        refundStatus: "PROCESSING",
      }).catch(() => undefined);
    } else {
      const players = await prisma.tournamentPlayer.findMany({
        where: { tournamentId: params.tournamentId },
        select: { userId: true },
      });
      for (const player of players) {
        await sendTournamentNotification({
          tournamentId: params.tournamentId,
          playerId: player.userId,
          eventType: "TOURNAMENT_CANCELLED",
          title: "Tournament Cancelled",
          body,
          data: { reason: params.reason, entryFee: params.entryFee },
          referenceId: `cancelled_${params.tournamentId}`,
          bypassPreferences: true,
        });
        await TournamentEmailService.sendTournamentCancelledEmail({
          userId: player.userId,
          tournamentId: params.tournamentId,
          tournamentTitle: params.tournamentTitle,
          reason: reasonText,
          entryFee: params.entryFee,
          refundStatus: "PROCESSING",
        }).catch(() => undefined);
      }
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
    refundId?: string;
  }): Promise<void> {
    await sendTournamentNotification({
      tournamentId: params.tournamentId,
      playerId: params.playerId,
      eventType: "TOURNAMENT_REFUNDED",
      title: "💰 Tournament Entry Refunded",
      body: `Your entry fee of ${params.amount.toLocaleString()} coins for ${params.tournamentTitle} has been refunded to your wallet.`,
      data: { tournamentId: params.tournamentId, amount: params.amount, refundId: params.refundId },
      referenceId: `refund_${params.tournamentId}_${params.playerId}`,
      bypassPreferences: true,
    });

    await TournamentEmailService.sendRefundCompletedEmail({
      userId: params.playerId,
      tournamentId: params.tournamentId,
      tournamentTitle: params.tournamentTitle,
      amount: params.amount,
      refundId: params.refundId,
    }).catch(() => undefined);
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

    void TournamentEmailService.sendEliminationEmail({
      userId: params.loserId,
      tournamentId: params.tournamentId,
      tournamentTitle: params.tournamentTitle,
      roundNumber: "Final (Runner-Up)",
    }).catch(() => undefined);
  }

  /**
   * Notify player when their opponent is ready.
   */
  static async notifyOpponentReady(params: {
    tournamentId: string;
    tournamentTitle: string;
    playerId: string;
    matchId: string;
    roundNumber: number | string;
    opponentDisplayName: string;
  }): Promise<void> {
    void TournamentEmailService.sendOpponentReadyEmail({
      userId: params.playerId,
      tournamentId: params.tournamentId,
      tournamentTitle: params.tournamentTitle,
      matchId: params.matchId,
      roundNumber: params.roundNumber,
      opponentDisplayName: params.opponentDisplayName,
    }).catch(() => undefined);
  }

  /**
   * Notify player about completed match result.
   */
  static async notifyMatchResult(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    gameId: string;
    roundNumber: number | string;
    opponentDisplayName: string;
    result: "WON" | "LOST" | "DRAW";
    finalScore?: string | Record<string, number>;
  }): Promise<void> {
    await TournamentEmailService.sendMatchResultEmail(params).catch(() => undefined);
  }

  /**
   * Send match starting reminder if player has not joined yet.
   */
  static async notifyMatchStartingReminder(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    matchId: string;
    roundNumber: number | string;
    gameId: string;
    opponentDisplayName: string;
  }): Promise<void> {
    await TournamentEmailService.sendMatchStartingReminder(params).catch(() => undefined);
  }

  /**
   * Send match forfeited notification if player did not join within allowed time.
   */
  static async notifyMatchForfeited(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    gameId: string;
    roundNumber: number | string;
    opponentDisplayName: string;
    matchId?: string;
  }): Promise<void> {
    await sendTournamentNotification({
      tournamentId: params.tournamentId,
      playerId: params.userId,
      eventType: "TOURNAMENT_ELIMINATED",
      title: "Match Forfeited",
      body: `Your match in ${params.tournamentTitle} was forfeited because you did not join in time.`,
      referenceId: params.matchId ?? `forfeit_${params.userId}`,
    });

    await TournamentEmailService.sendMatchForfeitedEmail(params).catch(() => undefined);
  }

  /**
   * Send match reminder (In-App + Socket + Email) if player has not joined waiting room.
   */
  static async notifyMatchReminder(params: {
    userId: string;
    tournamentId: string;
    tournamentTitle: string;
    matchId: string;
    roundNumber: number | string;
    gameId: string;
    opponentDisplayName: string;
  }): Promise<void> {
    if (TournamentEmailService.isPlayerJoined({ matchId: params.matchId, userId: params.userId })) {
      return;
    }

    await sendTournamentNotification({
      tournamentId: params.tournamentId,
      playerId: params.userId,
      eventType: "TOURNAMENT_MATCH_REMINDER",
      title: "⏰ Match Waiting",
      body: `Your Round ${params.roundNumber} match in ${params.tournamentTitle} is waiting. vs ${params.opponentDisplayName}`,
      data: {
        matchId: params.matchId,
        roundNumber: params.roundNumber,
        gameId: params.gameId,
        opponentDisplayName: params.opponentDisplayName,
      },
      referenceId: `reminder_${params.matchId}`,
    });

    await TournamentEmailService.sendMatchStartingReminder(params).catch(() => undefined);
  }

  /**
   * Records that player has entered the match room, canceling reminders.
   */
  static recordPlayerJoinedMatch(params: { matchId: string; userId: string }): void {
    TournamentEmailService.recordPlayerJoined(params);
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
