import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type {
  CreateDisputePayload,
  ResolveDisputePayload,
  TournamentDisputeSummary,
  TournamentDisputeDetail,
  TournamentDisputePriority,
  TournamentDisputeStatus,
} from "@gaming-hub/shared";
import { audit } from "./audit";
import { TournamentEmailService } from "./tournamentEmailService";
import { TournamentNotificationService } from "./tournamentNotificationService";
import { getTournamentResultSnapshot } from "./tournamentResultVerification";
import { applyTransaction } from "./wallet";

/**
 * 1. Create Tournament Dispute (Player Action)
 */
export async function createTournamentDispute(
  userId: string,
  payload: CreateDisputePayload,
): Promise<TournamentDisputeSummary> {
  const { matchId, reason, description, evidenceUrls = [] } = payload;

  if (!description || description.trim().length < 5) {
    throw new AppError("VALIDATION_ERROR", "Description must be at least 5 characters long", 400);
  }

  // Find the match and round slot
  const roundSlot = await prisma.tournamentRound.findFirst({
    where: { matchId },
    include: {
      tournament: {
        select: {
          id: true,
          title: true,
          status: true,
          maxPlayers: true,
        },
      },
    },
  });

  if (!roundSlot) {
    throw new AppError("NOT_FOUND", `Match ${matchId} not found in tournament brackets`, 404);
  }

  // Validate user was a participant in the match
  if (roundSlot.playerAId !== userId && roundSlot.playerBId !== userId) {
    throw new AppError("FORBIDDEN", "You can only dispute matches you participated in", 403);
  }

  // Validate dispute window (e.g. 10 minutes from match completion)
  const matchRecord = await prisma.match.findUnique({
    where: { id: matchId },
    select: { endedAt: true },
  });
  const snapshotRecord = await prisma.tournamentResultSnapshot.findUnique({
    where: { matchId },
    select: { endedAt: true },
  });
  const matchEndedAt = snapshotRecord?.endedAt || matchRecord?.endedAt || roundSlot.completedAt;
  if (matchEndedAt) {
    const elapsedMs = Date.now() - matchEndedAt.getTime();
    if (elapsedMs > 10 * 60 * 1000) {
      throw new AppError("DISPUTE_WINDOW_EXPIRED", "The dispute reporting window for this match has expired (10-minute limit).", 400);
    }
  }

  // Validate optional evidence URLs - reject executable/dangerous file extensions
  const FORBIDDEN_EXTENSIONS = [".exe", ".bat", ".cmd", ".sh", ".js", ".py", ".bin", ".vbs", ".msi", ".scr", ".com"];
  for (const url of evidenceUrls) {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname.toLowerCase();
      for (const ext of FORBIDDEN_EXTENSIONS) {
        if (pathname.endsWith(ext)) {
          throw new AppError("INVALID_EVIDENCE", `Executable or dangerous file types (${ext}) are not allowed as evidence.`, 400);
        }
      }
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      throw new AppError("INVALID_EVIDENCE", `Invalid evidence URL format: ${url}`, 400);
    }
  }

  // Prevent duplicate active disputes for this (matchId, userId)
  const existingDispute = await prisma.tournamentDispute.findUnique({
    where: { matchId_userId: { matchId, userId } },
  });

  if (existingDispute && (existingDispute.status === "OPEN" || existingDispute.status === "UNDER_REVIEW")) {
    throw new AppError("DISPUTE_ALREADY_EXISTS", "You already have an active dispute open for this match", 409);
  }

  // Calculate total rounds to determine priority
  const maxRoundsAgg = await prisma.tournamentRound.aggregate({
    where: { tournamentId: roundSlot.tournamentId },
    _max: { roundNumber: true },
  });
  const totalRounds = maxRoundsAgg._max.roundNumber ?? 1;
  const isFinalMatch = roundSlot.roundNumber === totalRounds;

  let priority: TournamentDisputePriority = "NORMAL";
  if (isFinalMatch) {
    priority = "CRITICAL";
  } else if (roundSlot.roundNumber >= totalRounds - 1) {
    priority = "HIGH";
  }

  // Tournament Final Protection: Mark snapshot reviewStatus as RESULT_REVIEW_REQUIRED while dispute is open
  if (isFinalMatch) {
    await prisma.tournamentResultSnapshot.updateMany({
      where: { matchId },
      data: { reviewStatus: "RESULT_REVIEW_REQUIRED" },
    });
  }

  const disputeCode = `DISP-${Math.floor(100000 + Math.random() * 900000)}`;

  // Create dispute record
  const dispute = await prisma.tournamentDispute.upsert({
    where: { matchId_userId: { matchId, userId } },
    create: {
      disputeId: disputeCode,
      tournamentId: roundSlot.tournamentId,
      matchId,
      userId,
      roundNumber: roundSlot.roundNumber,
      reason,
      description: description.trim(),
      evidenceUrls: evidenceUrls as any,
      priority,
      status: "OPEN",
    },
    update: {
      reason,
      description: description.trim(),
      evidenceUrls: evidenceUrls as any,
      priority,
      status: "OPEN",
      resolutionAction: null,
      adminNotes: null,
      resolvedBy: null,
      resolvedAt: null,
    },
  });

  // Audit log
  audit({
    actorType: "user",
    actorId: userId,
    action: "tournament.dispute.created",
    category: "game",
    targetType: "tournament_dispute",
    targetId: dispute.id,
    meta: {
      disputeId: dispute.disputeId,
      tournamentId: roundSlot.tournamentId,
      matchId,
      reason,
      priority,
    },
  });

  // Send Email Notification
  await TournamentEmailService.notifyDisputeCreated({
    userId,
    tournamentId: roundSlot.tournamentId,
    tournamentTitle: roundSlot.tournament.title,
    disputeId: dispute.disputeId,
    reason,
    matchId,
  }).catch(() => undefined);

  // Send In-App Notification
  await prisma.appNotification.create({
    data: {
      userId,
      type: "TOURNAMENT",
      tournamentEventType: "DISPUTE_CREATED",
      title: "Match Dispute Submitted",
      body: `Your report for match ${matchId} in ${roundSlot.tournament.title} has been logged under ${dispute.disputeId}.`,
      data: { disputeId: dispute.disputeId, tournamentId: roundSlot.tournamentId, matchId },
    },
  }).catch(() => undefined);

  return {
    id: dispute.id,
    disputeId: dispute.disputeId,
    tournamentId: dispute.tournamentId,
    tournamentTitle: roundSlot.tournament.title,
    matchId: dispute.matchId,
    userId: dispute.userId,
    roundNumber: dispute.roundNumber,
    reason: dispute.reason as any,
    description: dispute.description,
    evidenceUrls: (dispute.evidenceUrls as string[]) || [],
    priority: dispute.priority as any,
    status: dispute.status as any,
    resolutionAction: dispute.resolutionAction as any,
    adminNotes: null, // do not expose admin notes
    resolvedBy: dispute.resolvedBy,
    resolvedAt: dispute.resolvedAt ? dispute.resolvedAt.toISOString() : null,
    createdAt: dispute.createdAt.toISOString(),
    updatedAt: dispute.updatedAt.toISOString(),
  };
}

/**
 * 2. Get Dispute Detail (RBAC: Admin or Creator)
 */
export async function getDisputeDetail(
  disputeIdOrId: string,
  requesterUserId: string,
  isAdmin: boolean,
): Promise<TournamentDisputeDetail> {
  const dispute = await prisma.tournamentDispute.findFirst({
    where: {
      OR: [{ id: disputeIdOrId }, { disputeId: disputeIdOrId }],
    },
    include: {
      tournament: {
        select: {
          id: true,
          title: true,
          gameId: true,
          status: true,
          prizePool: true,
        },
      },
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
        },
      },
    },
  });

  if (!dispute) {
    throw new AppError("NOT_FOUND", "Dispute not found", 404);
  }

  if (!isAdmin && dispute.userId !== requesterUserId) {
    throw new AppError("FORBIDDEN", "You are not authorized to view this dispute", 403);
  }

  // Load Round Slot & Match
  const roundSlot = await prisma.tournamentRound.findFirst({
    where: { matchId: dispute.matchId },
  });

  const match = await prisma.match.findUnique({
    where: { id: dispute.matchId },
    include: {
      players: {
        include: {
          user: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      },
      moves: {
        select: { id: true, turnNumber: true },
      },
    },
  });

  const pAUser = match?.players.find((p) => p.userId === roundSlot?.playerAId)?.user;
  const pBUser = match?.players.find((p) => p.userId === roundSlot?.playerBId)?.user;

  // Snapshot
  const snapshot = await getTournamentResultSnapshot(dispute.matchId);

  // Authoritative events summary
  const totalEvents = match?.moves.length ?? snapshot?.eventsCount ?? 0;

  return {
    id: dispute.id,
    disputeId: dispute.disputeId,
    tournamentId: dispute.tournamentId,
    tournamentTitle: dispute.tournament.title,
    gameId: dispute.tournament.gameId,
    matchId: dispute.matchId,
    userId: dispute.userId,
    userName: dispute.user.username,
    userDisplayName: dispute.user.displayName,
    roundNumber: dispute.roundNumber,
    reason: dispute.reason as any,
    description: dispute.description,
    evidenceUrls: (dispute.evidenceUrls as string[]) || [],
    priority: dispute.priority as any,
    status: dispute.status as any,
    resolutionAction: dispute.resolutionAction as any,
    adminNotes: isAdmin ? dispute.adminNotes : null, // Admin only
    resolvedBy: dispute.resolvedBy,
    resolvedAt: dispute.resolvedAt ? dispute.resolvedAt.toISOString() : null,
    createdAt: dispute.createdAt.toISOString(),
    updatedAt: dispute.updatedAt.toISOString(),
    tournament: {
      id: dispute.tournament.id,
      title: dispute.tournament.title,
      gameId: dispute.tournament.gameId,
      status: dispute.tournament.status,
      prizePool: dispute.tournament.prizePool,
      currentRound: roundSlot?.roundNumber ?? 1,
    },
    match: {
      id: dispute.matchId,
      gameId: dispute.tournament.gameId,
      status: match?.status ?? "FINISHED",
      startedAt: match?.startedAt ? match.startedAt.toISOString() : null,
      endedAt: match?.endedAt ? match.endedAt.toISOString() : null,
      winnerIds: (match?.winnerIds as unknown as string[]) || (roundSlot?.winnerId ? [roundSlot.winnerId] : []),
      resultReason: match?.resultReason || snapshot?.resultReason || "NORMAL",
      playerA: {
        id: roundSlot?.playerAId ?? "unknown",
        username: pAUser?.username ?? "Player A",
        displayName: pAUser?.displayName ?? "Player A",
        avatarUrl: pAUser?.avatarUrl ?? null,
        score: roundSlot?.playerAScore ?? snapshot?.playerAScore ?? 0,
      },
      playerB: {
        id: roundSlot?.playerBId ?? "unknown",
        username: pBUser?.username ?? "Player B",
        displayName: pBUser?.displayName ?? "Player B",
        avatarUrl: pBUser?.avatarUrl ?? null,
        score: roundSlot?.playerBScore ?? snapshot?.playerBScore ?? 0,
      },
      replayAvailable: false,
      replayId: dispute.matchId,
    },
    snapshot,
    authoritativeEventsSummary: {
      totalEvents,
      movesCount: totalEvents,
      disconnectsCount: 0,
      timeoutsCount: 0,
    },
  };
}

/**
 * 3. List Player Disputes (Self Only)
 */
export async function listPlayerDisputes(userId: string): Promise<TournamentDisputeSummary[]> {
  const disputes = await prisma.tournamentDispute.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      tournament: {
        select: { title: true, gameId: true },
      },
    },
  });

  return disputes.map((d) => ({
    id: d.id,
    disputeId: d.disputeId,
    tournamentId: d.tournamentId,
    tournamentTitle: d.tournament.title,
    gameId: d.tournament.gameId,
    matchId: d.matchId,
    userId: d.userId,
    roundNumber: d.roundNumber,
    reason: d.reason as any,
    description: d.description,
    evidenceUrls: (d.evidenceUrls as string[]) || [],
    priority: d.priority as any,
    status: d.status as any,
    resolutionAction: d.resolutionAction as any,
    adminNotes: null, // do not expose admin notes to player
    resolvedBy: d.resolvedBy,
    resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  }));
}

/**
 * 4. List Admin Disputes (Admin Queue with Filtering)
 */
export async function listAdminDisputes(params: {
  status?: string;
  priority?: string;
  tournamentId?: string;
  gameId?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: TournamentDisputeSummary[]; total: number; page: number; pageSize: number }> {
  const { status, priority, tournamentId, gameId, page = 1, pageSize = 20 } = params;

  const where: any = {};
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (tournamentId) where.tournamentId = tournamentId;
  if (gameId) where.tournament = { gameId };

  const [items, total] = await Promise.all([
    prisma.tournamentDispute.findMany({
      where,
      orderBy: [
        { priority: "asc" },
        { createdAt: "desc" },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        tournament: { select: { title: true, gameId: true } },
        user: { select: { username: true, displayName: true } },
      },
    }),
    prisma.tournamentDispute.count({ where }),
  ]);

  return {
    items: items.map((d) => ({
      id: d.id,
      disputeId: d.disputeId,
      tournamentId: d.tournamentId,
      tournamentTitle: d.tournament.title,
      gameId: d.tournament.gameId,
      matchId: d.matchId,
      userId: d.userId,
      userName: d.user.username,
      userDisplayName: d.user.displayName,
      roundNumber: d.roundNumber,
      reason: d.reason as any,
      description: d.description,
      evidenceUrls: (d.evidenceUrls as string[]) || [],
      priority: d.priority as any,
      status: d.status as any,
      resolutionAction: d.resolutionAction as any,
      adminNotes: d.adminNotes,
      resolvedBy: d.resolvedBy,
      resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}

/**
 * 5. Resolve Tournament Dispute (Admin Action)
 */
export async function resolveTournamentDispute(
  adminId: string,
  disputeIdOrId: string,
  payload: ResolveDisputePayload,
): Promise<TournamentDisputeSummary> {
  const { action, adminNotes, newWinnerId, newScoreA, newScoreB, justificationReason } = payload;

  const dispute = await prisma.tournamentDispute.findFirst({
    where: {
      OR: [{ id: disputeIdOrId }, { disputeId: disputeIdOrId }],
    },
    include: {
      tournament: { select: { id: true, title: true, stateVersion: true } },
    },
  });

  if (!dispute) {
    throw new AppError("NOT_FOUND", "Dispute not found", 404);
  }

  const roundSlot = await prisma.tournamentRound.findFirst({
    where: { matchId: dispute.matchId },
  });

  let newStatus: TournamentDisputeStatus = "RESOLVED";

  if (action === "REQUEST_REVIEW" || action === "ESCALATE") {
    newStatus = "UNDER_REVIEW";
  } else if (action === "REJECT_DISPUTE") {
    newStatus = "REJECTED";
  } else if (action === "CONFIRM_RESULT" || action === "OVERRIDE_RESULT" || action === "FINANCIAL_CORRECTION") {
    newStatus = "RESOLVED";
  }

  let overrideUpdated: Awaited<ReturnType<typeof prisma.tournamentDispute.update>> | undefined;
  let repeatedOverride = false;

  // Handle RESULT_OVERRIDE with authoritative pipeline reconciliation
  if (action === "OVERRIDE_RESULT") {
    if (!justificationReason || justificationReason.trim().length < 5) {
      throw new AppError("VALIDATION_ERROR", "Justification reason must be at least 5 characters for result override", 400);
    }
    if (!newWinnerId) {
      throw new AppError("VALIDATION_ERROR", "New winner ID must be specified for result override", 400);
    }
    if (roundSlot && (newWinnerId !== roundSlot.playerAId && newWinnerId !== roundSlot.playerBId)) {
      throw new AppError("INVALID_ACTION", "New winner must be one of the match participants", 400);
    }

    let oldWinnerId = roundSlot?.winnerId;
    let oldScoreA = roundSlot?.playerAScore ?? 0;
    let oldScoreB = roundSlot?.playerBScore ?? 0;

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "TournamentDispute" WHERE "id" = ${dispute.id} FOR UPDATE`;
      const current = await tx.tournamentDispute.findUniqueOrThrow({ where: { id: dispute.id } });
      // Serialize different disputes against the same result as well as retries.
      await tx.$queryRaw`SELECT "id" FROM "TournamentRound" WHERE "matchId" = ${dispute.matchId} FOR UPDATE`;
      const roundSlot = await tx.tournamentRound.findFirst({ where: { matchId: dispute.matchId } });
      if (!roundSlot || (newWinnerId !== roundSlot.playerAId && newWinnerId !== roundSlot.playerBId)) throw new AppError("INVALID_ACTION", "A valid tournament participant is required", 400);
      if (["RESOLVED", "REJECTED", "CLOSED"].includes(current.status)) {
        if (current.resolutionAction !== action || roundSlot.winnerId !== newWinnerId || (newScoreA !== undefined && newScoreA !== roundSlot.playerAScore) || (newScoreB !== undefined && newScoreB !== roundSlot.playerBScore)) throw new AppError("VALIDATION_ERROR", "Dispute has already been resolved with a different result", 409);
        overrideUpdated = current;
        repeatedOverride = true;
        return;
      }
      oldWinnerId = roundSlot.winnerId;
      oldScoreA = roundSlot.playerAScore;
      oldScoreB = roundSlot.playerBScore;
      // Update round slot
      if (roundSlot) {
        await tx.tournamentRound.update({
          where: { id: roundSlot.id },
          data: {
            winnerId: newWinnerId,
            playerAScore: newScoreA !== undefined ? newScoreA : roundSlot.playerAScore,
            playerBScore: newScoreB !== undefined ? newScoreB : roundSlot.playerBScore,
          },
        });
      }

      // Update Result Snapshot
      await tx.tournamentResultSnapshot.updateMany({
        where: { matchId: dispute.matchId },
        data: {
          winnerId: newWinnerId,
          loserId: oldWinnerId,
          playerAScore: newScoreA !== undefined ? newScoreA : oldScoreA,
          playerBScore: newScoreB !== undefined ? newScoreB : oldScoreB,
          reviewStatus: "OVERRIDDEN",
          resultReason: "ADMIN_OVERRIDE",
        },
      });

      // Update match record if exists
      await tx.match.updateMany({
        where: { id: dispute.matchId },
        data: {
          winnerIds: [newWinnerId],
          resultReason: "ADMIN_OVERRIDE",
        },
      });

      // Update TournamentPlayer elimination states
      if (oldWinnerId && oldWinnerId !== newWinnerId) {
        await tx.tournamentPlayer.updateMany({
          where: { tournamentId: dispute.tournamentId, userId: oldWinnerId },
          data: { eliminated: true, eliminatedInRound: roundSlot?.roundNumber ?? 1 },
        });
        await tx.tournamentPlayer.updateMany({
          where: { tournamentId: dispute.tournamentId, userId: newWinnerId },
          data: { eliminated: false, eliminatedInRound: null },
        });
      }

      // Reconcile next round slot if old winner had already advanced into it (Requirement 18)
      if (roundSlot?.nextSlotId && oldWinnerId && oldWinnerId !== newWinnerId) {
        const nextSlot = await tx.tournamentRound.findUnique({
          where: { id: roundSlot.nextSlotId },
        });
        if (nextSlot && (nextSlot.status === "READY" || nextSlot.status === "PENDING")) {
          const updateData: any = {};
          if (nextSlot.playerAId === oldWinnerId) updateData.playerAId = newWinnerId;
          if (nextSlot.playerBId === oldWinnerId) updateData.playerBId = newWinnerId;
          await tx.tournamentRound.update({
            where: { id: nextSlot.id },
            data: updateData,
          });
        }
      }

      // Financial Protection: Reconcile paid prizes if settlement was already performed (Requirement 19)
      if (oldWinnerId && oldWinnerId !== newWinnerId) {
        const oldWinnerPrize = await tx.tournamentPrize.findFirst({
          where: { tournamentId: dispute.tournamentId, userId: oldWinnerId, status: "PAID" },
        });
        if (oldWinnerPrize && oldWinnerPrize.amount > 0) {
          // Debit old winner via auditable transaction (without balance hacking)
          await applyTransaction(
            tx,
            oldWinnerId,
            -oldWinnerPrize.amount,
            "REVERSAL",
            dispute.id,
            { disputeId: dispute.disputeId, reason: "DISPUTE_RESULT_OVERRIDE_REVERSAL" },
          );

          // A failed reversal aborts the entire correction before this credit.
          const replacementWallet = await applyTransaction(
            tx,
            newWinnerId,
            oldWinnerPrize.amount,
            "TOURNAMENT_PRIZE",
            dispute.tournamentId,
            { disputeId: dispute.disputeId, reason: "DISPUTE_RESULT_OVERRIDE_PRIZE" },
          );

          // Update prize record
          const newPlayer = await tx.tournamentPlayer.findUnique({
            where: { tournamentId_userId: { tournamentId: dispute.tournamentId, userId: newWinnerId } },
          });
          if (!newPlayer) throw new AppError("NOT_FOUND", "Replacement tournament player not found", 404);
          if (newPlayer) {
            await tx.tournamentPrize.update({
              where: { id: oldWinnerPrize.id },
              data: { userId: newWinnerId, playerId: newPlayer.id, transactionId: (replacementWallet as any)._transaction.id },
            });
          }
        }
      }

      // Recalculate authoritative tournament leaderboard standings
      const { TournamentLeaderboardService } = await import("./tournamentLeaderboardService");
      await TournamentLeaderboardService.recalculateTournamentStandings(dispute.tournamentId, tx);
      overrideUpdated = await tx.tournamentDispute.update({ where: { id: dispute.id }, data: {
        status: newStatus, resolutionAction: action, adminNotes: adminNotes?.trim() ?? current.adminNotes,
        resolvedBy: adminId, resolvedAt: new Date(),
      } });
    });

    // Replayed corrections do not repeat audit/notification side effects.
    if (!repeatedOverride) audit({
      actorType: "user",
      actorId: adminId,
      action: "tournament.result.override",
      category: "game",
      targetType: "tournament_match",
      targetId: dispute.matchId,
      meta: {
        disputeId: dispute.disputeId,
        tournamentId: dispute.tournamentId,
        oldWinner: oldWinnerId,
        newWinner: newWinnerId,
        oldScore: { scoreA: oldScoreA, scoreB: oldScoreB },
        newScore: { scoreA: newScoreA ?? oldScoreA, scoreB: newScoreB ?? oldScoreB },
        justificationReason,
      },
    });
  }

  // Update dispute status
  const updated = overrideUpdated ?? await prisma.tournamentDispute.update({
    where: { id: dispute.id },
    data: {
      status: newStatus,
      resolutionAction: action,
      adminNotes: adminNotes ? adminNotes.trim() : dispute.adminNotes,
      resolvedBy: adminId,
      resolvedAt: newStatus === "RESOLVED" || newStatus === "REJECTED" ? new Date() : null,
    },
  });

  // Audit Resolution
  if (!repeatedOverride) audit({
    actorType: "user",
    actorId: adminId,
    action: "tournament.dispute.resolved",
    category: "game",
    targetType: "tournament_dispute",
    targetId: dispute.id,
    meta: {
      disputeId: dispute.disputeId,
      action,
      oldStatus: dispute.status,
      newStatus,
      adminNotes,
    },
  });

  // Email Notification for Resolution
  if (!repeatedOverride && (newStatus === "RESOLVED" || newStatus === "REJECTED")) {
    await TournamentEmailService.notifyDisputeResolved({
      userId: dispute.userId,
      tournamentId: dispute.tournamentId,
      tournamentTitle: dispute.tournament.title,
      disputeId: dispute.disputeId,
      status: newStatus,
      matchId: dispute.matchId,
    }).catch(() => undefined);

    await prisma.appNotification.create({
      data: {
        userId: dispute.userId,
        type: "TOURNAMENT",
        tournamentEventType: "DISPUTE_RESOLVED",
        title: "Match Dispute Review Completed",
        body: `Your dispute ${dispute.disputeId} in ${dispute.tournament.title} has been ${newStatus.toLowerCase()}.`,
        data: { disputeId: dispute.disputeId, tournamentId: dispute.tournamentId, status: newStatus },
      },
    }).catch(() => undefined);
  }

  return {
    id: updated.id,
    disputeId: updated.disputeId,
    tournamentId: updated.tournamentId,
    tournamentTitle: dispute.tournament.title,
    matchId: updated.matchId,
    userId: updated.userId,
    roundNumber: updated.roundNumber,
    reason: updated.reason as any,
    description: updated.description,
    evidenceUrls: (updated.evidenceUrls as string[]) || [],
    priority: updated.priority as any,
    status: updated.status as any,
    resolutionAction: updated.resolutionAction as any,
    adminNotes: updated.adminNotes,
    resolvedBy: updated.resolvedBy,
    resolvedAt: updated.resolvedAt ? updated.resolvedAt.toISOString() : null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
}
