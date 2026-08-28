import { prisma } from "@gaming-hub/db";
import type {
  TournamentValidationSummary,
  TournamentInconsistencyItem,
  TournamentValidationStatus,
  TournamentValidationMetrics,
  AnalyticsFilterParams,
} from "@gaming-hub/shared";
import { audit } from "./audit";

export class TournamentValidationService {
  /**
   * Performs an end-to-end read-only audit verification of tournament analytics against
   * the authoritative database and wallet/transaction ledger.
   *
   * NEVER modifies or mutates records.
   */
  static async validateTournamentAnalytics(
    params?: AnalyticsFilterParams,
    adminId?: string
  ): Promise<TournamentValidationSummary> {
    const inconsistencies: TournamentInconsistencyItem[] = [];
    const now = new Date();

    // 1. Query tournaments bounded by recent active/settled set (up to 500 tournaments)
    const tournaments = await prisma.tournament.findMany({
      where: params?.gameId && params.gameId !== "all" ? { gameId: params.gameId } : {},
      include: {
        players: {
          select: {
            id: true,
            userId: true,
            registeredAt: true,
            finalRank: true,
            scoreFor: true,
            scoreAgainst: true,
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
        rounds: {
          select: {
            id: true,
            roundNumber: true,
            matchNumber: true,
            status: true,
            winnerId: true,
            playerAScore: true,
            playerBScore: true,
          },
        },
        _count: {
          select: { players: true, rounds: true, prizes: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    const tournamentIds = tournaments.map((t) => t.id);

    // 2. Fetch related wallet transaction ledger records in bulk for cross-checking
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

    // Group transactions by referenceId (tournamentId)
    const txByTournament = new Map<string, typeof relevantTransactions>();
    for (const tx of relevantTransactions) {
      if (!tx.referenceId) continue;
      const list = txByTournament.get(tx.referenceId) || [];
      list.push(tx);
      txByTournament.set(tx.referenceId, list);
    }

    let totalCheckedRegistrations = 0;
    let totalCheckedMatches = 0;
    let totalCheckedPrizes = 0;
    let totalCheckedRefunds = 0;

    let tournamentCountMatches = true;
    let registrationCountMatches = true;
    let entryFeeTotalMatches = true;
    let prizeTotalMatches = true;
    let refundTotalMatches = true;
    let settlementTotalMatches = true;
    let matchCountMatches = true;
    let financialLedgerBalanced = true;

    // 3. Evaluate each tournament against authoritative rules
    for (const t of tournaments) {
      const tTransactions = txByTournament.get(t.id) || [];
      const registeredPlayers = t.players;
      totalCheckedRegistrations += registeredPlayers.length;
      totalCheckedMatches += t.rounds.length;
      totalCheckedPrizes += t.prizes.length;

      // A. Registration Count Integrity
      if (t._count.players !== registeredPlayers.length) {
        registrationCountMatches = false;
        inconsistencies.push({
          id: `reg-count-${t.id}`,
          category: "REGISTRATION",
          severity: "WARNING",
          code: "REGISTRATION_COUNT_MISMATCH",
          tournamentId: t.id,
          tournamentTitle: t.title,
          message: `Tournament player relation count (${registeredPlayers.length}) differs from _count metadata (${t._count.players}).`,
          expected: registeredPlayers.length,
          actual: t._count.players,
          suggestedAction: "Run registration reconciliation check.",
          detectedAt: now.toISOString(),
        });
      }

      // Check for duplicate player entries in same tournament
      const seenUsers = new Set<string>();
      for (const p of registeredPlayers) {
        if (seenUsers.has(p.userId)) {
          registrationCountMatches = false;
          inconsistencies.push({
            id: `dup-reg-${t.id}-${p.userId}`,
            category: "REGISTRATION",
            severity: "CRITICAL",
            code: "DUPLICATE_REGISTRATION",
            tournamentId: t.id,
            tournamentTitle: t.title,
            userId: p.userId,
            message: `User ${p.userId} is registered multiple times in tournament ${t.id}.`,
            expected: 1,
            actual: 2,
            suggestedAction: "Inspect tournament player roster and remove duplicate entry.",
            detectedAt: now.toISOString(),
          });
        }
        seenUsers.add(p.userId);
      }

      // B. Entry-Fee & Transaction Cross-Check
      if (t.entryFee < 0) {
        entryFeeTotalMatches = false;
        inconsistencies.push({
          id: `neg-fee-${t.id}`,
          category: "FINANCIAL",
          severity: "CRITICAL",
          code: "NEGATIVE_AMOUNT",
          tournamentId: t.id,
          tournamentTitle: t.title,
          message: `Tournament ${t.id} has an invalid negative entry fee (${t.entryFee}).`,
          expected: ">= 0",
          actual: t.entryFee,
          suggestedAction: "Correct tournament configuration.",
          detectedAt: now.toISOString(),
        });
      }

      if (t.entryFee > 0) {
        const entryDebits = tTransactions.filter(
          (tx) => tx.referenceType === "TOURNAMENT_ENTRY" && tx.type === "DEBIT"
        );
        const entryDebitUsers = new Map<string, number>();
        for (const tx of entryDebits) {
          entryDebitUsers.set(tx.userId, (entryDebitUsers.get(tx.userId) || 0) + 1);
          if (tx.amount <= 0) {
            entryFeeTotalMatches = false;
            financialLedgerBalanced = false;
            inconsistencies.push({
              id: `invalid-debit-${tx.id}`,
              category: "TRANSACTION",
              severity: "CRITICAL",
              code: "NEGATIVE_AMOUNT",
              tournamentId: t.id,
              tournamentTitle: t.title,
              userId: tx.userId,
              message: `Entry fee debit transaction ${tx.id} has non-positive amount (${tx.amount}).`,
              expected: "> 0",
              actual: tx.amount,
              suggestedAction: "Inspect wallet transaction record.",
              detectedAt: now.toISOString(),
            });
          }
        }

        // Check for missing entry debits for registered players
        for (const p of registeredPlayers) {
          const debitCount = entryDebitUsers.get(p.userId) || 0;
          if (debitCount === 0) {
            entryFeeTotalMatches = false;
            financialLedgerBalanced = false;
            inconsistencies.push({
              id: `missing-entry-tx-${t.id}-${p.userId}`,
              category: "TRANSACTION",
              severity: "WARNING",
              code: "MISSING_TRANSACTION",
              tournamentId: t.id,
              tournamentTitle: t.title,
              userId: p.userId,
              message: `Registered user ${p.userId} has no TOURNAMENT_ENTRY debit transaction recorded for tournament ${t.id}.`,
              expected: 1,
              actual: 0,
              suggestedAction: "Verify if player was registered via admin bypass or promotional invite.",
              detectedAt: now.toISOString(),
            });
          } else if (debitCount > 1) {
            entryFeeTotalMatches = false;
            financialLedgerBalanced = false;
            inconsistencies.push({
              id: `dup-entry-tx-${t.id}-${p.userId}`,
              category: "TRANSACTION",
              severity: "CRITICAL",
              code: "DUPLICATE_TRANSACTION",
              tournamentId: t.id,
              tournamentTitle: t.title,
              userId: p.userId,
              message: `User ${p.userId} was debited multiple times (${debitCount} times) for tournament ${t.id}.`,
              expected: 1,
              actual: debitCount,
              suggestedAction: "Inspect user wallet ledger and issue adjustment if overcharged.",
              detectedAt: now.toISOString(),
            });
          }
        }
      }

      // C. Prize Totals & Settlement Verification
      if (t.prizePool < 0) {
        prizeTotalMatches = false;
        inconsistencies.push({
          id: `neg-prize-${t.id}`,
          category: "PRIZE",
          severity: "CRITICAL",
          code: "NEGATIVE_AMOUNT",
          tournamentId: t.id,
          tournamentTitle: t.title,
          message: `Tournament ${t.id} has negative configured prize pool (${t.prizePool}).`,
          expected: ">= 0",
          actual: t.prizePool,
          suggestedAction: "Correct tournament prize pool configuration.",
          detectedAt: now.toISOString(),
        });
      }

      const totalDistributedPrizes = t.prizes.reduce((sum, p) => sum + p.amount, 0);
      if (t.status === "SETTLED" && totalDistributedPrizes > t.prizePool && t.prizePool > 0) {
        prizeTotalMatches = false;
        inconsistencies.push({
          id: `prize-pool-mismatch-${t.id}`,
          category: "PRIZE",
          severity: "CRITICAL",
          code: "PRIZE_MISMATCH",
          tournamentId: t.id,
          tournamentTitle: t.title,
          message: `Total distributed prizes (${totalDistributedPrizes}) exceeds configured prize pool (${t.prizePool}) for tournament ${t.id}.`,
          expected: t.prizePool,
          actual: totalDistributedPrizes,
          discrepancy: totalDistributedPrizes - t.prizePool,
          suggestedAction: "Inspect prize calculation logic and review settlement records.",
          detectedAt: now.toISOString(),
        });
      }

      // Check PAID prizes against Transaction credits
      const prizeCredits = tTransactions.filter(
        (tx) => tx.referenceType === "TOURNAMENT_PRIZE" && tx.type === "CREDIT"
      );
      const prizeCreditUsers = new Map<string, number>();
      for (const tx of prizeCredits) {
        prizeCreditUsers.set(tx.userId, (prizeCreditUsers.get(tx.userId) || 0) + 1);
        if (tx.amount <= 0) {
          prizeTotalMatches = false;
          inconsistencies.push({
            id: `neg-prize-credit-${tx.id}`,
            category: "TRANSACTION",
            severity: "CRITICAL",
            code: "NEGATIVE_AMOUNT",
            tournamentId: t.id,
            tournamentTitle: t.title,
            userId: tx.userId,
            message: `Prize credit transaction ${tx.id} has non-positive amount (${tx.amount}).`,
            expected: "> 0",
            actual: tx.amount,
            suggestedAction: "Inspect transaction ledger.",
            detectedAt: now.toISOString(),
          });
        }
      }

      for (const p of t.prizes) {
        if (p.amount < 0) {
          prizeTotalMatches = false;
          inconsistencies.push({
            id: `neg-prize-record-${p.id}`,
            category: "PRIZE",
            severity: "CRITICAL",
            code: "NEGATIVE_AMOUNT",
            tournamentId: t.id,
            tournamentTitle: t.title,
            userId: p.userId,
            message: `Prize record ${p.id} has negative amount (${p.amount}).`,
            expected: ">= 0",
            actual: p.amount,
            suggestedAction: "Review prize distribution.",
            detectedAt: now.toISOString(),
          });
        }

        if (p.status === "PAID") {
          const creditCount = prizeCreditUsers.get(p.userId) || 0;
          if (creditCount === 0 && p.amount > 0) {
            settlementTotalMatches = false;
            inconsistencies.push({
              id: `missing-prize-tx-${p.id}`,
              category: "SETTLEMENT",
              severity: "WARNING",
              code: "MISSING_TRANSACTION",
              tournamentId: t.id,
              tournamentTitle: t.title,
              userId: p.userId,
              message: `Prize for user ${p.userId} marked as PAID but no TOURNAMENT_PRIZE credit transaction found in ledger.`,
              expected: 1,
              actual: 0,
              suggestedAction: "Run settlement retry to ensure wallet credit was completed.",
              detectedAt: now.toISOString(),
            });
          }
        }
      }

      // D. Refund Totals for Cancelled Tournaments
      if (t.status === "CANCELLED" && t.entryFee > 0 && registeredPlayers.length > 0) {
        totalCheckedRefunds += registeredPlayers.length;
        const refundCredits = tTransactions.filter(
          (tx) =>
            (tx.referenceType === "WAGER_REFUND" || tx.referenceType === "REVERSAL") &&
            tx.type === "CREDIT"
        );
        const refundCreditUsers = new Set(refundCredits.map((tx) => tx.userId));

        for (const p of registeredPlayers) {
          if (!refundCreditUsers.has(p.userId)) {
            refundTotalMatches = false;
            inconsistencies.push({
              id: `missing-refund-${t.id}-${p.userId}`,
              category: "REFUND",
              severity: "CRITICAL",
              code: "REFUND_MISMATCH",
              tournamentId: t.id,
              tournamentTitle: t.title,
              userId: p.userId,
              message: `User ${p.userId} in cancelled tournament ${t.id} has not received an entry fee refund credit.`,
              expected: t.entryFee,
              actual: 0,
              discrepancy: t.entryFee,
              suggestedAction: "Execute admin refund retry for this tournament.",
              detectedAt: now.toISOString(),
            });
          }
        }
      }

      // E. Match Counts & Score Checks
      for (const r of t.rounds) {
        if (r.playerAScore < 0 || r.playerBScore < 0) {
          matchCountMatches = false;
          inconsistencies.push({
            id: `neg-score-${r.id}`,
            category: "MATCH",
            severity: "WARNING",
            code: "NEGATIVE_AMOUNT",
            tournamentId: t.id,
            tournamentTitle: t.title,
            matchId: r.id,
            message: `Match slot Round ${r.roundNumber} Match ${r.matchNumber} contains negative scores (A: ${r.playerAScore}, B: ${r.playerBScore}).`,
            expected: ">= 0",
            actual: `${r.playerAScore} / ${r.playerBScore}`,
            suggestedAction: "Verify match result snapshot.",
            detectedAt: now.toISOString(),
          });
        }
      }
    }

    // 4. Determine Overall Validation Status
    const criticalCount = inconsistencies.filter((i) => i.severity === "CRITICAL").length;
    const warningCount = inconsistencies.filter((i) => i.severity === "WARNING").length;

    let status: TournamentValidationStatus = "VALID";
    if (criticalCount > 0) {
      status = "CRITICAL_INCONSISTENCY";
    } else if (warningCount > 0) {
      status = "NEEDS_REVIEW";
    }

    const metrics: TournamentValidationMetrics = {
      tournamentCountMatches,
      registrationCountMatches,
      entryFeeTotalMatches,
      prizeTotalMatches,
      refundTotalMatches,
      settlementTotalMatches,
      matchCountMatches,
      financialLedgerBalanced,
    };

    const summary: TournamentValidationSummary = {
      status,
      checkedAt: now.toISOString(),
      totalCheckedTournaments: tournaments.length,
      totalCheckedRegistrations,
      totalCheckedMatches,
      totalCheckedPrizes,
      totalCheckedRefunds,
      totalCheckedTransactions: relevantTransactions.length,
      issuesCount: inconsistencies.length,
      criticalIssuesCount: criticalCount,
      warningIssuesCount: warningCount,
      metrics,
      inconsistencies,
    };

    if (adminId) {
      audit({
        actorType: "user",
        actorId: adminId,
        action: "tournament.analytics.validation.audited",
        category: "admin",
        targetType: "analytics",
        targetId: "validation-layer",
        meta: {
          status,
          issuesCount: inconsistencies.length,
          criticalCount,
          warningCount,
          timestamp: now.toISOString(),
        },
      });
    }

    return summary;
  }
}
