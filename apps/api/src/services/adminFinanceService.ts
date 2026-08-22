import { prisma } from "@gaming-hub/db";

export interface FinancialSummaryFilter {
  range?: "today" | "yesterday" | "7d" | "30d" | "this_month" | "all" | string;
  dateFrom?: Date | string;
  dateTo?: Date | string;
}

export class AdminFinanceService {
  /**
   * Helper: Parse Date Range Filter
   */
  private static parseDateRange(params: FinancialSummaryFilter): { gte?: Date; lte?: Date } {
    const now = new Date();
    if (params.dateFrom || params.dateTo) {
      const res: { gte?: Date; lte?: Date } = {};
      if (params.dateFrom) res.gte = new Date(params.dateFrom);
      if (params.dateTo) res.lte = new Date(params.dateTo);
      return res;
    }

    switch (params.range) {
      case "today": {
        const start = new Date(now);
        start.setUTCHours(0, 0, 0, 0);
        return { gte: start };
      }
      case "yesterday": {
        const start = new Date(now);
        start.setUTCDate(start.getUTCDate() - 1);
        start.setUTCHours(0, 0, 0, 0);
        const end = new Date(now);
        end.setUTCDate(end.getUTCDate() - 1);
        end.setUTCHours(23, 59, 59, 999);
        return { gte: start, lte: end };
      }
      case "7d": {
        const start = new Date(now);
        start.setUTCDate(start.getUTCDate() - 7);
        return { gte: start };
      }
      case "30d": {
        const start = new Date(now);
        start.setUTCDate(start.getUTCDate() - 30);
        return { gte: start };
      }
      case "this_month": {
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        return { gte: start };
      }
      default:
        return {};
    }
  }

  /**
   * 1. Get Complete Financial Economy Summary
   */
  static async getFinancialSummary(filter: FinancialSummaryFilter) {
    const dateRange = this.parseDateRange(filter);
    const createdAt = Object.keys(dateRange).length > 0 ? dateRange : undefined;

    const txWhere = createdAt ? { createdAt } : {};

    // 1. Authoritative Transaction Aggregations
    const [
      gameEntryFeesAgg,
      tournEntryFeesAgg,
      matchWinningsAgg,
      tournPrizesAgg,
      refundsAgg,
      bonusesAgg,
      adminCreditsAgg,
      adminDebitsAgg,
      totalCreditsAgg,
      totalDebitsAgg,
      totalTxCount,
    ] = await Promise.all([
      // Game Entry Fees
      prisma.transaction.aggregate({
        where: { ...txWhere, type: "DEBIT", referenceType: "MATCH_WAGER" },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Tournament Entry Fees
      prisma.transaction.aggregate({
        where: { ...txWhere, type: "DEBIT", referenceType: "TOURNAMENT_ENTRY" },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Match Winnings
      prisma.transaction.aggregate({
        where: { ...txWhere, type: "CREDIT", referenceType: "MATCH_PAYOUT" },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Tournament Prizes
      prisma.transaction.aggregate({
        where: { ...txWhere, type: "CREDIT", referenceType: "TOURNAMENT_PRIZE" },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Refunds
      prisma.transaction.aggregate({
        where: { ...txWhere, type: "CREDIT", referenceType: "WAGER_REFUND" },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Bonuses & practice rewards
      prisma.transaction.aggregate({
        where: {
          ...txWhere,
          type: "CREDIT",
          referenceType: { in: ["BONUS", "PRACTICE"] },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Admin Credits
      prisma.transaction.aggregate({
        where: { ...txWhere, type: "CREDIT", referenceType: "ADMIN" },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Admin Debits
      prisma.transaction.aggregate({
        where: { ...txWhere, type: "DEBIT", referenceType: "ADMIN" },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Total Credits
      prisma.transaction.aggregate({
        where: { ...txWhere, type: "CREDIT" },
        _sum: { amount: true },
      }),
      // Total Debits
      prisma.transaction.aggregate({
        where: { ...txWhere, type: "DEBIT" },
        _sum: { amount: true },
      }),
      prisma.transaction.count({ where: txWhere }),
    ]);

    const totalGameEntryFees = gameEntryFeesAgg._sum.amount ?? 0;
    const totalTournEntryFees = tournEntryFeesAgg._sum.amount ?? 0;
    const totalEntryFees = totalGameEntryFees + totalTournEntryFees;

    const totalMatchWinnings = matchWinningsAgg._sum.amount ?? 0;
    const totalTournPrizes = tournPrizesAgg._sum.amount ?? 0;
    const totalPrizesAndWinnings = totalMatchWinnings + totalTournPrizes;

    const totalRefunds = refundsAgg._sum.amount ?? 0;
    const totalBonuses = bonusesAgg._sum.amount ?? 0;
    const totalAdminCredits = adminCreditsAgg._sum.amount ?? 0;
    const totalAdminDebits = adminDebitsAgg._sum.amount ?? 0;
    const totalAdminAdjustments = totalAdminCredits - totalAdminDebits;

    const totalCredits = totalCreditsAgg._sum.amount ?? 0;
    const totalDebits = totalDebitsAgg._sum.amount ?? 0;
    const netCoinMovement = totalCredits - totalDebits;

    // 2. Active Operational Health & Reconciliation
    const [
      activePaidMatches,
      pendingSettlements,
      activeTournaments,
      totalUserWalletBalance,
    ] = await Promise.all([
      prisma.match.count({
        where: { status: "ACTIVE", stake: { gt: 0 } },
      }),
      prisma.match.count({
        where: { status: "FINISHED", endedAt: null, stake: { gt: 0 } },
      }),
      prisma.tournament.count({
        where: { status: { in: ["REGISTRATION_OPEN", "IN_PROGRESS", "STARTING"] } },
      }),
      prisma.wallet.aggregate({
        _sum: { balance: true },
      }),
    ]);

    // 3. Game Breakdown Aggregation
    const gameBreakdown = await this.getGameBreakdown(createdAt);

    // 4. Tournament Breakdown Aggregation
    const tournamentBreakdown = await this.getTournamentBreakdown(createdAt);

    // 5. Daily Trend Series
    const dailyTrends = await this.getDailyTrends(dateRange);

    return {
      summary: {
        totalEntryFees,
        totalGameEntryFees,
        totalTournEntryFees,
        totalWinnings: totalMatchWinnings,
        totalTournamentPrizes: totalTournPrizes,
        totalPrizesAndWinnings,
        totalRefunds,
        totalBonuses,
        totalAdminAdjustments,
        totalCredits,
        totalDebits,
        netCoinMovement,
        transactionCount: totalTxCount,
      },
      operations: {
        activePaidMatches,
        pendingSettlements,
        activeTournaments,
        systemTotalWalletBalance: totalUserWalletBalance._sum.balance ?? 0,
        reconciliationStatus: pendingSettlements === 0 ? "HEALTHY" : "PENDING_OPERATIONS",
      },
      gameBreakdown,
      tournamentBreakdown,
      dailyTrends,
    };
  }

  /**
   * 2. Per-Game Volume & Revenue Breakdown
   */
  private static async getGameBreakdown(createdAt?: { gte?: Date; lte?: Date }) {
    const matchWhere: Record<string, unknown> = {
      stake: { gt: 0 },
    };
    if (createdAt) matchWhere.createdAt = createdAt;

    const matches = await prisma.match.findMany({
      where: matchWhere,
      select: {
        gameId: true,
        stake: true,
        status: true,
        endedAt: true,
        players: { select: { result: true } },
      },
    });

    const gameStatsMap = new Map<
      string,
      {
        gameId: string;
        gameName: string;
        matchCount: number;
        totalEntryFees: number;
        totalPayouts: number;
        totalRefunds: number;
      }
    >();

    // Initialize all known games
    const { GAME_DEFINITIONS, GAME_IDS } = await import("@gaming-hub/shared");
    for (const def of GAME_DEFINITIONS) {
      gameStatsMap.set(def.id, {
        gameId: def.id,
        gameName: def.name,
        matchCount: 0,
        totalEntryFees: 0,
        totalPayouts: 0,
        totalRefunds: 0,
      });
    }

    for (const m of matches) {
      const def = GAME_DEFINITIONS.find((g) => g.id === m.gameId);
      const stats = gameStatsMap.get(m.gameId) ?? {
        gameId: m.gameId,
        gameName: def?.name ?? m.gameId,
        matchCount: 0,
        totalEntryFees: 0,
        totalPayouts: 0,
        totalRefunds: 0,
      };

      const playerCount = m.players.length;
      const matchFeeSum = m.stake * playerCount;

      stats.matchCount += 1;
      stats.totalEntryFees += matchFeeSum;

      if (m.status === "FINISHED") {
        stats.totalPayouts += Math.floor(matchFeeSum * 0.9);
      } else if (m.status === "ABORTED") {
        stats.totalRefunds += matchFeeSum;
      }

      gameStatsMap.set(m.gameId, stats);
    }

    return Array.from(gameStatsMap.values())
      .filter((g) => g.matchCount > 0 || (GAME_IDS as readonly string[]).includes(g.gameId))
      .sort((a, b) => b.totalEntryFees - a.totalEntryFees);
  }

  /**
   * 3. Tournament Lifecycle & Payout Breakdown
   */
  private static async getTournamentBreakdown(createdAt?: { gte?: Date; lte?: Date }) {
    const where: Record<string, unknown> = {};
    if (createdAt) where.createdAt = createdAt;

    const tournaments = await prisma.tournament.findMany({
      where,
      include: {
        _count: { select: { players: true } },
        prizes: true,
      },
    });

    let tournamentsCreated = 0;
    let tournamentsCompleted = 0;
    let tournamentsCancelled = 0;
    let totalRegistrations = 0;
    let totalEntryFeeVolume = 0;
    let totalPrizesDistributed = 0;
    let totalRefundsIssued = 0;

    for (const t of tournaments) {
      tournamentsCreated += 1;
      totalRegistrations += t._count.players;
      totalEntryFeeVolume += t.entryFee * t._count.players;

      if (t.status === "COMPLETED" || t.status === "SETTLED") {
        tournamentsCompleted += 1;
        for (const p of t.prizes) {
          totalPrizesDistributed += p.amount;
        }
      } else if (t.status === "CANCELLED") {
        tournamentsCancelled += 1;
        totalRefundsIssued += t.entryFee * t._count.players;
      }
    }

    return {
      tournamentsCreated,
      tournamentsCompleted,
      tournamentsCancelled,
      totalRegistrations,
      totalEntryFeeVolume,
      totalPrizesDistributed,
      totalRefundsIssued,
    };
  }

  /**
   * 4. Daily Time-Series Trend Breakdown
   */
  private static async getDailyTrends(dateRange: { gte?: Date; lte?: Date }) {
    const days = 7;
    const now = new Date();
    const trendMap = new Map<string, { date: string; entryFees: number; winnings: number; refunds: number }>();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      const dateKey = d.toISOString().slice(0, 10);
      trendMap.set(dateKey, { date: dateKey, entryFees: 0, winnings: 0, refunds: 0 });
    }

    const txs = await prisma.transaction.findMany({
      where: {
        createdAt: dateRange.gte ? dateRange : { gte: new Date(Date.now() - 7 * 86400000) },
        referenceType: { in: ["MATCH_WAGER", "TOURNAMENT_ENTRY", "MATCH_PAYOUT", "TOURNAMENT_PRIZE", "WAGER_REFUND"] },
      },
      select: {
        type: true,
        referenceType: true,
        amount: true,
        createdAt: true,
      },
    });

    for (const t of txs) {
      const dateKey = t.createdAt.toISOString().slice(0, 10);
      const entry = trendMap.get(dateKey);
      if (entry) {
        if (t.type === "DEBIT" && (t.referenceType === "MATCH_WAGER" || t.referenceType === "TOURNAMENT_ENTRY")) {
          entry.entryFees += t.amount;
        } else if (t.type === "CREDIT" && (t.referenceType === "MATCH_PAYOUT" || t.referenceType === "TOURNAMENT_PRIZE")) {
          entry.winnings += t.amount;
        } else if (t.type === "CREDIT" && t.referenceType === "WAGER_REFUND") {
          entry.refunds += t.amount;
        }
      }
    }

    return Array.from(trendMap.values());
  }

  /**
   * 5. Export Financial Data to CSV
   */
  static async exportFinancialCsv(filter: FinancialSummaryFilter): Promise<string> {
    const summary = await this.getFinancialSummary(filter);

    const lines: string[] = [];
    lines.push("Metric,Value (Coins)");
    lines.push(`Total Entry Fees,${summary.summary.totalEntryFees}`);
    lines.push(`Total Game Entry Fees,${summary.summary.totalGameEntryFees}`);
    lines.push(`Total Tournament Entry Fees,${summary.summary.totalTournEntryFees}`);
    lines.push(`Total Match Winnings,${summary.summary.totalWinnings}`);
    lines.push(`Total Tournament Prizes,${summary.summary.totalTournamentPrizes}`);
    lines.push(`Total Refunds,${summary.summary.totalRefunds}`);
    lines.push(`Total Bonuses,${summary.summary.totalBonuses}`);
    lines.push(`Net Coin Movement,${summary.summary.netCoinMovement}`);
    lines.push(`Total Transactions,${summary.summary.transactionCount}`);
    lines.push(`Active Paid Matches,${summary.operations.activePaidMatches}`);
    lines.push(`System Total Wallet Balance,${summary.operations.systemTotalWalletBalance}`);
    lines.push("");
    lines.push("Game Name,Matches Played,Entry Fees,Payouts,Refunds");
    for (const g of summary.gameBreakdown) {
      lines.push(`"${g.gameName}",${g.matchCount},${g.totalEntryFees},${g.totalPayouts},${g.totalRefunds}`);
    }

    return lines.join("\n");
  }
}
