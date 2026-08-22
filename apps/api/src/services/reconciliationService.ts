import { prisma } from "@gaming-hub/db";
import { AppError } from "@gaming-hub/shared";
import { audit } from "./audit";

export type ReconciliationSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ReconciliationStatus = "OPEN" | "INVESTIGATING" | "RESOLVED" | "DISMISSED";
export type ReconciliationType =
  | "WALLET_BALANCE_MISMATCH"
  | "NEGATIVE_WALLET_BALANCE"
  | "MISSING_ENTRY_FEE"
  | "ENTRY_FEE_AMOUNT_MISMATCH"
  | "MISSING_SETTLEMENT_PAYOUT"
  | "SETTLEMENT_AMOUNT_MISMATCH"
  | "EXCESS_REFUND"
  | "MISSING_ORIGINAL_DEBIT"
  | "TOURNAMENT_PRIZE_MISMATCH"
  | "STUCK_OPERATION";

export interface ReconciliationIssue {
  id: string;
  type: ReconciliationType;
  severity: ReconciliationSeverity;
  status: ReconciliationStatus;
  userId?: string;
  referenceType?: string;
  referenceId?: string;
  expectedValue: number | string;
  actualValue: number | string;
  details: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  notes?: string;
}

export interface ReconciliationSummary {
  walletsChecked: number;
  transactionsChecked: number;
  matchesChecked: number;
  tournamentsChecked: number;
  issuesFound: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  status: "HEALTHY" | "ISSUES_DETECTED";
  timestamp: string;
}

export class ReconciliationService {
  private static issues = new Map<string, ReconciliationIssue>();

  /**
   * 1. Register or Deduplicate a Reconciliation Issue
   */
  static recordIssue(params: {
    type: ReconciliationType;
    severity: ReconciliationSeverity;
    userId?: string;
    referenceType?: string;
    referenceId?: string;
    expectedValue: number | string;
    actualValue: number | string;
    details: string;
    metadata?: Record<string, unknown>;
  }): ReconciliationIssue {
    const dedupKey = `${params.type}:${params.userId ?? "global"}:${params.referenceId ?? "global"}`;
    const existing = Array.from(this.issues.values()).find(
      (i) => i.status !== "RESOLVED" && `${i.type}:${i.userId ?? "global"}:${i.referenceId ?? "global"}` === dedupKey
    );

    if (existing) {
      existing.expectedValue = params.expectedValue;
      existing.actualValue = params.actualValue;
      existing.details = params.details;
      existing.updatedAt = new Date();
      return existing;
    }

    const issueId = `recon-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const issue: ReconciliationIssue = {
      id: issueId,
      type: params.type,
      severity: params.severity,
      status: "OPEN",
      userId: params.userId,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      expectedValue: params.expectedValue,
      actualValue: params.actualValue,
      details: params.details,
      metadata: params.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.issues.set(issueId, issue);

    audit({
      actorType: "system",
      action: "reconciliation.issue_detected",
      category: "system",
      targetType: params.referenceType ?? "wallet",
      targetId: params.referenceId ?? params.userId,
      meta: {
        issueId,
        type: params.type,
        severity: params.severity,
        details: params.details,
      },
    });

    return issue;
  }

  /**
   * 2. Wallet Balance Reconciliation
   */
  static async runWalletBalanceReconciliation(userId?: string): Promise<number> {
    const where = userId ? { userId } : {};
    const wallets = await prisma.wallet.findMany({ where });

    let checked = 0;
    for (const w of wallets) {
      checked += 1;

      // Negative balance check
      if (w.balance < 0) {
        this.recordIssue({
          type: "NEGATIVE_WALLET_BALANCE",
          severity: "CRITICAL",
          userId: w.userId,
          referenceType: "WALLET",
          referenceId: w.userId,
          expectedValue: ">= 0",
          actualValue: w.balance,
          details: `Wallet for user ${w.userId} has negative balance of ${w.balance} coins`,
        });
      }

      // Check transactions sum
      const txs = await prisma.transaction.findMany({
        where: { userId: w.userId },
        orderBy: { createdAt: "asc" },
      });

      if (txs.length > 0) {
        const lastTx = txs[txs.length - 1];
        if (lastTx.balanceAfter !== w.balance) {
          this.recordIssue({
            type: "WALLET_BALANCE_MISMATCH",
            severity: "CRITICAL",
            userId: w.userId,
            referenceType: "WALLET",
            referenceId: w.userId,
            expectedValue: lastTx.balanceAfter,
            actualValue: w.balance,
            details: `Wallet balance (${w.balance}) does not match latest ledger balanceAfter (${lastTx.balanceAfter})`,
            metadata: { lastTxId: lastTx.id, calculatedBalance: lastTx.balanceAfter },
          });
        }
      }
    }

    return checked;
  }

  /**
   * 3. Game Entry Fee Reconciliation
   */
  static async runEntryReconciliation(matchId?: string): Promise<number> {
    const where: Record<string, unknown> = { stake: { gt: 0 } };
    if (matchId) where.id = matchId;

    const matches = await prisma.match.findMany({
      where,
      include: { players: true },
    });

    let checked = 0;
    for (const m of matches) {
      checked += 1;
      for (const p of m.players) {
        // Look for matching MATCH_WAGER debit
        const debits = await prisma.transaction.findMany({
          where: {
            userId: p.userId,
            type: "DEBIT",
            referenceType: "MATCH_WAGER",
            referenceId: m.id,
          },
        });

        if (debits.length === 0) {
          this.recordIssue({
            type: "MISSING_ENTRY_FEE",
            severity: "HIGH",
            userId: p.userId,
            referenceType: "MATCH",
            referenceId: m.id,
            expectedValue: m.stake,
            actualValue: 0,
            details: `Player ${p.userId} is in paid match ${m.id} (stake: ${m.stake}) but no MATCH_WAGER debit exists`,
          });
        } else {
          const totalDebited = debits.reduce((acc, d) => acc + d.amount, 0);
          if (totalDebited !== m.stake) {
            this.recordIssue({
              type: "ENTRY_FEE_AMOUNT_MISMATCH",
              severity: "CRITICAL",
              userId: p.userId,
              referenceType: "MATCH",
              referenceId: m.id,
              expectedValue: m.stake,
              actualValue: totalDebited,
              details: `Expected entry fee ${m.stake} for match ${m.id}, but debited ${totalDebited}`,
            });
          }
        }
      }
    }

    return checked;
  }

  /**
   * 4. Match Settlement Payout Reconciliation
   */
  static async runSettlementReconciliation(matchId?: string): Promise<number> {
    const where: Record<string, unknown> = { status: "FINISHED", stake: { gt: 0 } };
    if (matchId) where.id = matchId;

    const matches = await prisma.match.findMany({
      where,
      include: { players: true },
    });

    let checked = 0;
    for (const m of matches) {
      checked += 1;
      const winners = m.players.filter((p) => p.result === "WIN");
      const totalPot = m.stake * m.players.length;
      const expectedPayout = Math.floor(totalPot * 0.9);

      if (winners.length > 0) {
        for (const w of winners) {
          const payoutCredits = await prisma.transaction.findMany({
            where: {
              userId: w.userId,
              type: "CREDIT",
              referenceType: "MATCH_PAYOUT",
              referenceId: m.id,
            },
          });

          if (payoutCredits.length === 0) {
            this.recordIssue({
              type: "MISSING_SETTLEMENT_PAYOUT",
              severity: "HIGH",
              userId: w.userId,
              referenceType: "MATCH",
              referenceId: m.id,
              expectedValue: expectedPayout,
              actualValue: 0,
              details: `Winner ${w.userId} of finished match ${m.id} has no MATCH_PAYOUT credit recorded`,
            });
          } else {
            const actualPaid = payoutCredits.reduce((acc, c) => acc + c.amount, 0);
            if (actualPaid !== expectedPayout) {
              this.recordIssue({
                type: "SETTLEMENT_AMOUNT_MISMATCH",
                severity: "CRITICAL",
                userId: w.userId,
                referenceType: "MATCH",
                referenceId: m.id,
                expectedValue: expectedPayout,
                actualValue: actualPaid,
                details: `Settlement payout for match ${m.id} expected ${expectedPayout} but paid ${actualPaid}`,
              });
            }
          }
        }
      }
    }

    return checked;
  }

  /**
   * 5. Refund Reconciliation
   */
  static async runRefundReconciliation(): Promise<number> {
    const refunds = await prisma.transaction.findMany({
      where: {
        type: "CREDIT",
        referenceType: "WAGER_REFUND",
      },
    });

    let checked = 0;
    for (const r of refunds) {
      checked += 1;
      if (!r.referenceId) continue;

      // Find original debit for this match/user
      const debit = await prisma.transaction.findFirst({
        where: {
          userId: r.userId,
          type: "DEBIT",
          referenceType: "MATCH_WAGER",
          referenceId: r.referenceId,
        },
      });

      if (!debit) {
        this.recordIssue({
          type: "MISSING_ORIGINAL_DEBIT",
          severity: "CRITICAL",
          userId: r.userId,
          referenceType: "REFUND",
          referenceId: r.id,
          expectedValue: `Debit for ${r.referenceId}`,
          actualValue: "None",
          details: `Refund ${r.id} for user ${r.userId} has no corresponding MATCH_WAGER debit`,
        });
      } else if (r.amount > debit.amount) {
        this.recordIssue({
          type: "EXCESS_REFUND",
          severity: "CRITICAL",
          userId: r.userId,
          referenceType: "REFUND",
          referenceId: r.id,
          expectedValue: `<= ${debit.amount}`,
          actualValue: r.amount,
          details: `Refund amount (${r.amount}) exceeds original wager debit (${debit.amount})`,
        });
      }
    }

    return checked;
  }

  /**
   * 6. Tournament Reconciliation
   */
  static async runTournamentReconciliation(tournamentId?: string): Promise<number> {
    const where: Record<string, unknown> = {};
    if (tournamentId) where.id = tournamentId;

    const tournaments = await prisma.tournament.findMany({
      where,
      include: {
        players: true,
        prizes: true,
      },
    });

    let checked = 0;
    for (const t of tournaments) {
      checked += 1;

      // If completed, verify prizes
      if (t.status === "COMPLETED" || t.status === "SETTLED") {
        for (const p of t.prizes) {
          const prizeCredits = await prisma.transaction.findMany({
            where: {
              userId: p.userId,
              type: "CREDIT",
              referenceType: "TOURNAMENT_PRIZE",
              referenceId: t.id,
            },
          });

          const totalPaid = prizeCredits.reduce((acc, c) => acc + c.amount, 0);
          if (totalPaid !== p.amount) {
            this.recordIssue({
              type: "TOURNAMENT_PRIZE_MISMATCH",
              severity: "HIGH",
              userId: p.userId,
              referenceType: "TOURNAMENT",
              referenceId: t.id,
              expectedValue: p.amount,
              actualValue: totalPaid,
              details: `Prize for rank ${p.rank} in tournament ${t.id} expected ${p.amount} coins but recorded ${totalPaid}`,
            });
          }
        }
      }
    }

    return checked;
  }

  /**
   * 7. Stuck Operations Detector
   */
  static async runStuckOperationsCheck(timeoutMinutes = 60): Promise<number> {
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    const stuckMatches = await prisma.match.findMany({
      where: {
        status: "ACTIVE",
        stake: { gt: 0 },
        createdAt: { lte: cutoff },
      },
    });

    for (const m of stuckMatches) {
      this.recordIssue({
        type: "STUCK_OPERATION",
        severity: "HIGH",
        referenceType: "MATCH",
        referenceId: m.id,
        expectedValue: "FINISHED or ABORTED",
        actualValue: "ACTIVE > 60m",
        details: `Paid match ${m.id} has remained in ACTIVE status for over ${timeoutMinutes} minutes`,
      });
    }

    return stuckMatches.length;
  }

  /**
   * 8. Run Full Automated Reconciliation
   */
  static async runFullReconciliation(scope?: { userId?: string; matchId?: string; tournamentId?: string }): Promise<ReconciliationSummary> {
    const [
      walletsChecked,
      entriesChecked,
      settlementsChecked,
      refundsChecked,
      tournamentsChecked,
    ] = await Promise.all([
      this.runWalletBalanceReconciliation(scope?.userId),
      this.runEntryReconciliation(scope?.matchId),
      this.runSettlementReconciliation(scope?.matchId),
      this.runRefundReconciliation(),
      this.runTournamentReconciliation(scope?.tournamentId),
      this.runStuckOperationsCheck(),
    ]);

    const txCount = await prisma.transaction.count();
    const allIssues = Array.from(this.issues.values()).filter((i) => i.status !== "RESOLVED" && i.status !== "DISMISSED");

    const criticalIssues = allIssues.filter((i) => i.severity === "CRITICAL").length;
    const highIssues = allIssues.filter((i) => i.severity === "HIGH").length;
    const mediumIssues = allIssues.filter((i) => i.severity === "MEDIUM").length;
    const lowIssues = allIssues.filter((i) => i.severity === "LOW").length;

    return {
      walletsChecked,
      transactionsChecked: txCount,
      matchesChecked: entriesChecked + settlementsChecked,
      tournamentsChecked,
      issuesFound: allIssues.length,
      criticalIssues,
      highIssues,
      mediumIssues,
      lowIssues,
      status: allIssues.length === 0 ? "HEALTHY" : "ISSUES_DETECTED",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 9. List and Filter Reconciliation Issues
   */
  static listIssues(filter: { status?: ReconciliationStatus; severity?: ReconciliationSeverity; type?: ReconciliationType } = {}, page = 1, pageSize = 20) {
    let items = Array.from(this.issues.values());

    if (filter.status) items = items.filter((i) => i.status === filter.status);
    if (filter.severity) items = items.filter((i) => i.severity === filter.severity);
    if (filter.type) items = items.filter((i) => i.type === filter.type);

    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = items.length;
    const startIndex = (page - 1) * pageSize;
    const paginated = items.slice(startIndex, startIndex + pageSize);

    return {
      items: paginated,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * 10. Get Issue Details
   */
  static getIssueDetails(issueId: string) {
    const issue = this.issues.get(issueId);
    if (!issue) {
      throw new AppError("NOT_FOUND", `Reconciliation issue ${issueId} not found`, 404);
    }
    return issue;
  }

  /**
   * 11. Update Issue Status / Admin Resolution Notes
   */
  static updateIssue(issueId: string, update: { status?: ReconciliationStatus; notes?: string; resolvedBy?: string }) {
    const issue = this.issues.get(issueId);
    if (!issue) {
      throw new AppError("NOT_FOUND", `Reconciliation issue ${issueId} not found`, 404);
    }

    if (update.status) {
      issue.status = update.status;
      if (update.status === "RESOLVED") {
        issue.resolvedAt = new Date();
        issue.resolvedBy = update.resolvedBy;
      }
    }
    if (update.notes !== undefined) {
      issue.notes = update.notes;
    }
    issue.updatedAt = new Date();
    this.issues.set(issueId, issue);

    audit({
      actorType: "user",
      actorId: update.resolvedBy,
      action: "reconciliation.issue_updated",
      category: "system",
      targetType: "reconciliation_issue",
      targetId: issueId,
      meta: {
        status: issue.status,
        notes: issue.notes,
      },
    });

    return issue;
  }

  /**
   * Helper: Reset issues in memory for test isolation
   */
  static resetForTesting(): void {
    this.issues.clear();
  }
}
