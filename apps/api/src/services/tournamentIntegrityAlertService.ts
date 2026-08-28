import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import type {
  TournamentIntegrityAlert,
  TournamentIntegrityIssueType,
  TournamentIntegrityAlertSeverity,
  TournamentIntegrityAlertStatus,
  IntegrityAlertsFilterParams,
} from "@gaming-hub/shared";
import { audit } from "./audit";

export class TournamentIntegrityAlertService {
  /**
   * Helper to derive tournament tier code.
   */
  private static getTierCode(t: { title?: string; entryFee?: number; configSnapshot?: any }): string {
    const snap = t.configSnapshot as any;
    if (snap?.tierCode) return snap.tierCode.toLowerCase();
    if (snap?.tierName) return snap.tierName.toLowerCase();
    const title = (t.title || "").toLowerCase();
    if (title.includes("pro") || (t.entryFee ?? 0) >= 100) return "pro";
    if (title.includes("premium") || (t.entryFee ?? 0) >= 50) return "premium";
    if (title.includes("standard") || (t.entryFee ?? 0) >= 25) return "standard";
    if (title.includes("basic") || (t.entryFee ?? 0) >= 10) return "basic";
    return "mini";
  }

  /**
   * Scans authoritative tournament and wallet ledger records to detect the 9 integrity issues.
   * NEVER mutates underlying financial, prize, or tournament records.
   */
  static async scanAndDetectAlerts(targetTournamentId?: string): Promise<TournamentIntegrityAlert[]> {
    const now = new Date();
    const detectedAlerts: Array<{
      alertId: string;
      tournamentId: string;
      gameId: string;
      tier: string;
      issueType: TournamentIntegrityIssueType;
      affectedRecord: string;
      severity: TournamentIntegrityAlertSeverity;
      details?: string;
    }> = [];

    // 1. Fetch tournaments
    const tournaments = await prisma.tournament.findMany({
      where: targetTournamentId ? { id: targetTournamentId } : {},
      include: {
        players: {
          select: {
            id: true,
            userId: true,
            registeredAt: true,
            finalRank: true,
          },
        },
        prizes: {
          select: {
            id: true,
            userId: true,
            rank: true,
            amount: true,
            status: true,
            transactionId: true,
            paidAt: true,
          },
        },
        _count: {
          select: { players: true, prizes: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const tournamentIds = tournaments.map((t) => t.id);

    // 2. Fetch associated wallet ledger transactions
    const relevantTransactions = tournamentIds.length > 0
      ? await prisma.transaction.findMany({
          where: {
            referenceId: { in: tournamentIds },
            referenceType: {
              in: ["TOURNAMENT_ENTRY", "TOURNAMENT_PRIZE", "WAGER_REFUND", "REVERSAL"],
            },
          },
          select: {
            id: true,
            userId: true,
            type: true,
            amount: true,
            referenceType: true,
            referenceId: true,
            createdAt: true,
          },
          take: 10000,
        })
      : [];

    const txByTournament = new Map<string, typeof relevantTransactions>();
    for (const tx of relevantTransactions) {
      if (!tx.referenceId) continue;
      const list = txByTournament.get(tx.referenceId) || [];
      list.push(tx);
      txByTournament.set(tx.referenceId, list);
    }

    // 3. Evaluate each tournament against the 9 integrity detection rules
    for (const t of tournaments) {
      const tier = this.getTierCode(t);
      const tTx = txByTournament.get(t.id) || [];
      const playerUserIds = new Set(t.players.map((p) => p.userId));

      const entryDebits = tTx.filter(
        (tx) => tx.referenceType === "TOURNAMENT_ENTRY" && tx.type === "DEBIT"
      );
      const entryDebitUsers = new Map<string, number>();
      const entryDebitAmounts = new Map<string, number>();
      for (const tx of entryDebits) {
        entryDebitUsers.set(tx.userId, (entryDebitUsers.get(tx.userId) || 0) + 1);
        entryDebitAmounts.set(tx.userId, tx.amount);
      }

      // Rule 1: Registration without entry-fee transaction
      if (t.entryFee > 0) {
        for (const p of t.players) {
          if (!entryDebitUsers.has(p.userId)) {
            detectedAlerts.push({
              alertId: `alert-no-fee-${t.id}-${p.userId}`,
              tournamentId: t.id,
              gameId: t.gameId,
              tier,
              issueType: "REGISTRATION_WITHOUT_ENTRY_FEE",
              affectedRecord: `userId: ${p.userId}, playerId: ${p.id}`,
              severity: "HIGH",
              details: `User ${p.userId} is registered in paid tournament ${t.title} (${t.entryFee} coins) with no TOURNAMENT_ENTRY debit transaction recorded.`,
            });
          }
        }
      }

      // Rule 2: Entry-fee transaction without registration
      for (const tx of entryDebits) {
        if (!playerUserIds.has(tx.userId)) {
          detectedAlerts.push({
            alertId: `alert-orphan-fee-${t.id}-${tx.userId}-${tx.id}`,
            tournamentId: t.id,
            gameId: t.gameId,
            tier,
            issueType: "ENTRY_FEE_WITHOUT_REGISTRATION",
            affectedRecord: `transactionId: ${tx.id}, userId: ${tx.userId}, amount: ${tx.amount}`,
            severity: "CRITICAL",
            details: `User ${tx.userId} was debited ${tx.amount} coins for tournament ${t.title}, but is not present in the tournament player roster.`,
          });
        }
      }

      // Rule 3: Prize settlement without completed tournament
      const completedStatuses = ["COMPLETED", "SETTLING", "SETTLED"];
      const isCompleted = completedStatuses.includes(t.status);
      for (const prz of t.prizes) {
        if ((prz.status === "PAID" || (prz.status as string) === "PROCESSING") && !isCompleted) {
          detectedAlerts.push({
            alertId: `alert-premature-settle-${t.id}-${prz.id}`,
            tournamentId: t.id,
            gameId: t.gameId,
            tier,
            issueType: "PRIZE_SETTLEMENT_WITHOUT_COMPLETION",
            affectedRecord: `prizeId: ${prz.id}, userId: ${prz.userId}, rank: ${prz.rank}, amount: ${prz.amount}`,
            severity: "CRITICAL",
            details: `Prize ${prz.id} (${prz.amount} coins) for rank ${prz.rank} is marked as ${prz.status} while tournament is in ${t.status} status.`,
          });
        }
      }

      // Rule 4: Prize amount different from configured tournament snapshot
      const totalDistributed = t.prizes.reduce((sum, p) => sum + p.amount, 0);
      if (t.status === "SETTLED" && t.prizePool > 0 && totalDistributed > t.prizePool) {
        detectedAlerts.push({
          alertId: `alert-prize-mismatch-${t.id}`,
          tournamentId: t.id,
          gameId: t.gameId,
          tier,
          issueType: "PRIZE_AMOUNT_SNAPSHOT_MISMATCH",
          affectedRecord: `tournamentId: ${t.id}, configuredPrizePool: ${t.prizePool}, totalDistributed: ${totalDistributed}`,
          severity: "HIGH",
          details: `Total distributed prize amount (${totalDistributed}) exceeds configured prize pool snapshot (${t.prizePool}) for tournament ${t.title}.`,
        });
      }

      // Rule 5: Refund without original entry transaction
      const refundCredits = tTx.filter(
        (tx) =>
          (tx.referenceType === "WAGER_REFUND" || tx.referenceType === "REVERSAL") &&
          tx.type === "CREDIT"
      );
      for (const rtx of refundCredits) {
        if (!entryDebitUsers.has(rtx.userId) && t.entryFee > 0) {
          detectedAlerts.push({
            alertId: `alert-refund-no-entry-${t.id}-${rtx.userId}-${rtx.id}`,
            tournamentId: t.id,
            gameId: t.gameId,
            tier,
            issueType: "REFUND_WITHOUT_ENTRY_TRANSACTION",
            affectedRecord: `transactionId: ${rtx.id}, userId: ${rtx.userId}, amount: ${rtx.amount}`,
            severity: "CRITICAL",
            details: `Refund credit ${rtx.id} (${rtx.amount} coins) was granted to user ${rtx.userId} without an original entry fee debit transaction.`,
          });
        }
      }

      // Rule 6: Duplicate settlement
      const prizeCredits = tTx.filter(
        (tx) => tx.referenceType === "TOURNAMENT_PRIZE" && tx.type === "CREDIT"
      );
      const prizeCreditCounts = new Map<string, number>();
      for (const ptx of prizeCredits) {
        prizeCreditCounts.set(ptx.userId, (prizeCreditCounts.get(ptx.userId) || 0) + 1);
      }
      for (const [userId, count] of prizeCreditCounts.entries()) {
        if (count > 1) {
          detectedAlerts.push({
            alertId: `alert-dup-settle-${t.id}-${userId}`,
            tournamentId: t.id,
            gameId: t.gameId,
            tier,
            issueType: "DUPLICATE_SETTLEMENT",
            affectedRecord: `userId: ${userId}, settlementCreditCount: ${count}`,
            severity: "CRITICAL",
            details: `User ${userId} received multiple prize credit transactions (${count} credits) for tournament ${t.title}.`,
          });
        }
      }

      // Rule 7: Duplicate refund
      const refundCreditCounts = new Map<string, number>();
      for (const rtx of refundCredits) {
        refundCreditCounts.set(rtx.userId, (refundCreditCounts.get(rtx.userId) || 0) + 1);
      }
      for (const [userId, count] of refundCreditCounts.entries()) {
        if (count > 1) {
          detectedAlerts.push({
            alertId: `alert-dup-refund-${t.id}-${userId}`,
            tournamentId: t.id,
            gameId: t.gameId,
            tier,
            issueType: "DUPLICATE_REFUND",
            affectedRecord: `userId: ${userId}, refundCount: ${count}`,
            severity: "CRITICAL",
            details: `User ${userId} received multiple entry fee refunds (${count} refunds) for cancelled tournament ${t.title}.`,
          });
        }
      }

      // Rule 8: Settlement amount mismatch
      for (const prz of t.prizes) {
        if (prz.status === "PAID" && prz.transactionId) {
          const matchedTx = tTx.find((tx) => tx.id === prz.transactionId);
          if (matchedTx && matchedTx.amount !== prz.amount) {
            detectedAlerts.push({
              alertId: `alert-amount-mismatch-${prz.id}`,
              tournamentId: t.id,
              gameId: t.gameId,
              tier,
              issueType: "SETTLEMENT_AMOUNT_MISMATCH",
              affectedRecord: `prizeId: ${prz.id}, recordAmount: ${prz.amount}, ledgerAmount: ${matchedTx.amount}`,
              severity: "HIGH",
              details: `Prize record amount (${prz.amount}) does not match credited ledger transaction amount (${matchedTx.amount}) for user ${prz.userId}.`,
            });
          }
        }
      }

      // Rule 9: Incorrect tournament totals
      if (t.entryFee > 0 && t.players.length > 0) {
        const expectedCollection = t.entryFee * t.players.length;
        const totalDebited = entryDebits.reduce((sum, tx) => sum + tx.amount, 0);
        if (expectedCollection !== totalDebited && Math.abs(expectedCollection - totalDebited) > 0) {
          detectedAlerts.push({
            alertId: `alert-totals-mismatch-${t.id}`,
            tournamentId: t.id,
            gameId: t.gameId,
            tier,
            issueType: "INCORRECT_TOURNAMENT_TOTALS",
            affectedRecord: `tournamentId: ${t.id}, expectedCollection: ${expectedCollection}, ledgerCollection: ${totalDebited}`,
            severity: "MEDIUM",
            details: `Expected tournament collection (${expectedCollection} coins for ${t.players.length} players) does not match total ledger debits (${totalDebited} coins).`,
          });
        }
      }
    }

    // 4. Upsert newly detected alerts into database so admins can track and resolve them
    for (const alert of detectedAlerts) {
      try {
        await (prisma as any).tournamentIntegrityAlert.upsert({
          where: { alertId: alert.alertId },
          update: {
            details: alert.details,
            severity: alert.severity,
            affectedRecord: alert.affectedRecord,
          },
          create: {
            alertId: alert.alertId,
            tournamentId: alert.tournamentId,
            gameId: alert.gameId,
            tier: alert.tier,
            issueType: alert.issueType,
            affectedRecord: alert.affectedRecord,
            severity: alert.severity,
            status: "OPEN",
            details: alert.details,
            detectedAt: now,
          },
        });
      } catch {
        // Best effort upsert
      }
    }

    // Return the list of current alerts
    return this.listAlerts({});
  }

  /**
   * Retrieves filtered alerts with total, open, and critical statistics.
   */
  static async listAlerts(filters: IntegrityAlertsFilterParams): Promise<any> {
    const where: any = {};
    if (filters.status && filters.status !== "ALL") where.status = filters.status;
    if (filters.severity && filters.severity !== "ALL") where.severity = filters.severity;
    if (filters.issueType && filters.issueType !== "ALL") where.issueType = filters.issueType;
    if (filters.gameId && filters.gameId !== "ALL") where.gameId = filters.gameId;
    if (filters.tier && filters.tier !== "ALL") where.tier = filters.tier.toLowerCase();
    if (filters.tournamentId && filters.tournamentId !== "ALL") where.tournamentId = filters.tournamentId;

    try {
      const [items, total, openCount, criticalCount, underReviewCount, resolvedCount] =
        await Promise.all([
          (prisma as any).tournamentIntegrityAlert.findMany({
            where,
            include: {
              tournament: {
                select: { title: true },
              },
            },
            orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
            take: 200,
          }),
          (prisma as any).tournamentIntegrityAlert.count({ where }),
          (prisma as any).tournamentIntegrityAlert.count({ where: { status: "OPEN" } }),
          (prisma as any).tournamentIntegrityAlert.count({ where: { severity: "CRITICAL", status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
          (prisma as any).tournamentIntegrityAlert.count({ where: { status: "UNDER_REVIEW" } }),
          (prisma as any).tournamentIntegrityAlert.count({ where: { status: "RESOLVED" } }),
        ]);

      return {
        items: items.map((i: any) => ({
          id: i.id,
          alertId: i.alertId,
          tournamentId: i.tournamentId,
          tournamentTitle: i.tournament?.title ?? `Tournament #${i.tournamentId.slice(-6)}`,
          gameId: i.gameId,
          tier: i.tier,
          issueType: i.issueType,
          affectedRecord: i.affectedRecord,
          severity: i.severity,
          status: i.status,
          details: i.details,
          resolutionNotes: i.resolutionNotes,
          resolvedBy: i.resolvedBy,
          resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
          detectedAt: i.detectedAt ? i.detectedAt.toISOString() : new Date().toISOString(),
        })),
        total,
        openCount,
        criticalCount,
        underReviewCount,
        resolvedCount,
      };
    } catch {
      return {
        items: [],
        total: 0,
        openCount: 0,
        criticalCount: 0,
        underReviewCount: 0,
        resolvedCount: 0,
      };
    }
  }

  /**
   * Updates an alert status to OPEN, UNDER_REVIEW, or RESOLVED with audit logging.
   * NEVER modifies the underlying tournament or wallet records.
   */
  static async updateAlertStatus(
    alertId: string,
    newStatus: TournamentIntegrityAlertStatus,
    adminId: string,
    resolutionNotes?: string
  ): Promise<TournamentIntegrityAlert> {
    const existing = await (prisma as any).tournamentIntegrityAlert.findFirst({
      where: { OR: [{ id: alertId }, { alertId }] },
    });

    if (!existing) {
      throw new AppError("NOT_FOUND", `Integrity alert ${alertId} not found`, 404);
    }

    const previousStatus = existing.status;
    const now = new Date();

    const updated = await (prisma as any).tournamentIntegrityAlert.update({
      where: { id: existing.id },
      data: {
        status: newStatus,
        resolutionNotes: resolutionNotes || existing.resolutionNotes,
        resolvedBy: newStatus === "RESOLVED" ? adminId : existing.resolvedBy,
        resolvedAt: newStatus === "RESOLVED" ? now : existing.resolvedAt,
        updatedAt: now,
      },
      include: {
        tournament: { select: { title: true } },
      },
    });

    // Record immutable audit log
    audit({
      actorType: "user",
      actorId: adminId,
      action: "tournament.integrity_alert.status_updated",
      category: "admin",
      targetType: "integrity_alert",
      targetId: existing.alertId,
      meta: {
        alertId: existing.alertId,
        tournamentId: existing.tournamentId,
        issueType: existing.issueType,
        previousStatus,
        newStatus,
        resolutionNotes: resolutionNotes || null,
        timestamp: now.toISOString(),
      },
    });

    return {
      id: updated.id,
      alertId: updated.alertId,
      tournamentId: updated.tournamentId,
      tournamentTitle: updated.tournament?.title,
      gameId: updated.gameId,
      tier: updated.tier,
      issueType: updated.issueType,
      affectedRecord: updated.affectedRecord,
      severity: updated.severity,
      status: updated.status,
      details: updated.details,
      resolutionNotes: updated.resolutionNotes,
      resolvedBy: updated.resolvedBy,
      resolvedAt: updated.resolvedAt ? updated.resolvedAt.toISOString() : null,
      detectedAt: updated.detectedAt.toISOString(),
    };
  }
}
