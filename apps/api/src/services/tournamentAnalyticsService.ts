import { prisma, Prisma } from "@gaming-hub/db";
import {
  GAME_DEFINITIONS,
  DEFAULT_TOURNAMENT_TIERS,
  type TournamentTierCode,
  type TournamentAnalyticsTimeFilter,
  type TournamentAnalyticsResponse,
  type TournamentAnalyticsOverview,
  type PrizeDistributionAnalyticsSection,
  type PrizeDistributionItem,
  type PrizeDistributionByGameItem,
  type PrizeDistributionByTierItem,
  type PrizeDistributionByDateItem,
  type TournamentRefundAnalyticsItem,
  type RefundByGameItem,
  type RefundByTierItem,
  type RefundByDateItem,
  type TournamentRefundRecordItem,
  type RefundAnalyticsSection,
  type TournamentSettlementAnalyticsItem,
  type SettlementByGameItem,
  type SettlementByTierItem,
  type SettlementByDateItem,
  type TournamentSettlementRecordItem,
  type SettlementAnalyticsSection,
  type GameAnalyticsStat,
  type TierAnalyticsStat,
  type HourlyPerformanceStat,
  type PlayerCohortAnalyticsStat,
  type TournamentHealthSummary,
  type TournamentSchedulerStatus,
  type StuckTournamentItem,
  type StuckTournamentState,
  type StuckMatchItem,
  type StuckMatchOperationalStatus,
  type TournamentReviewItem,
  type TournamentNotificationAnalyticsSummary,
  type NotificationChannelType,
  type NotificationDeliveryStatus,
  type NotificationAnalyticsItem,
  type NotificationAnalyticsSummaryItem,
  type NotificationByGameItem,
  type NotificationByTierItem,
  type NotificationByDateItem,
  type NotificationAnalyticsSection,
  type PlayerAnalyticsSummary,
  type PlayerAnalyticsByGameItem,
  type PlayerAnalyticsByTierItem,
  type PlayerAnalyticsByDateItem,
  type AnonymizedPlayerItem,
  type PlayerAnalyticsSection,
  type TopParticipationGameItem,
  type TopParticipationTierItem,
  type TopParticipationPeriodItem,
  type TopParticipationSummary,
  type TopParticipationSection,
  type PlayerPerformanceSummary,
  type PlayerPerformanceByGameItem,
  type PlayerPerformanceByTierItem,
  type PlayerPerformanceByDateItem,
  type AnonymizedPerformerItem,
  type PlayerPerformanceSection,
  type WinRateSummary,
  type WinRateByGameItem,
  type WinRateByTierItem,
  type WinRateByDateItem,
  type WinRateAnalyticsSection,
  type GameSpecificPerformanceItem,
  type GameSpecificPerformanceSection,
  type TierTrendDataPoint,
  type TierPerformanceTrendsSection,
  type TournamentTrendPoint,
  type TournamentReportRequest,
  type TournamentReportResult,
  type TournamentValidationSummary,
} from "@gaming-hub/shared";
import { TournamentValidationService } from "./tournamentValidationService";
import { isHourlySchedulerPaused, getHourlySchedulerInfo } from "./hourlyTournamentScheduler";
import { TournamentEmailService } from "./tournamentEmailService";
import { audit } from "./audit";
import { TournamentAnalyticsCache } from "./tournamentAnalyticsCache";

export interface AnalyticsFilterParams {
  timeFilter?: TournamentAnalyticsTimeFilter;
  fromDate?: string;
  toDate?: string;
  gameId?: string;
  tier?: string;
  tournamentId?: string;
}

export class TournamentAnalyticsService {
  /**
   * Resolves friendly display name for a game.
   */
  static getGameName(gameId?: string | null): string {
    if (!gameId) return "Unknown Game";
    const found = GAME_DEFINITIONS.find((g) => g.id.toLowerCase() === gameId.toLowerCase());
    return found ? found.name : gameId;
  }

  /**
   * Resolves friendly display name for a tournament tier.
   */
  static getTierName(tierCode?: string | null): string {
    if (!tierCode) return "Standard";
    const found = DEFAULT_TOURNAMENT_TIERS.find((t) => t.code.toLowerCase() === tierCode.toLowerCase());
    return found ? found.name : tierCode.charAt(0).toUpperCase() + tierCode.slice(1);
  }

  /**
   * Resolves the start and end dates based on timezone and time filter.
   */
  static getDateRange(params: AnalyticsFilterParams): { startDate: Date; endDate: Date; label: string } {
    const filter = params.timeFilter || (params.fromDate && params.toDate ? "custom" : "last30days");
    const now = new Date();

    if (filter === "all") {
      return {
        startDate: new Date(0),
        endDate: new Date("2100-01-01T00:00:00.000Z"),
        label: "All Time",
      };
    }

    if ((filter === "custom" || (params.fromDate && params.toDate)) && params.fromDate && params.toDate) {
      let from = new Date(params.fromDate);
      let to = new Date(params.toDate);
      if (params.fromDate.length <= 10) {
        from = new Date(`${params.fromDate}T00:00:00.000Z`);
      }
      if (params.toDate.length <= 10) {
        to = new Date(`${params.toDate}T23:59:59.999Z`);
      }
      return {
        startDate: from,
        endDate: to,
        label: "Custom Range",
      };
    }

    if (filter === "today") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { startDate: start, endDate: end, label: "Today" };
    }

    if (filter === "yesterday") {
      const start = new Date(now);
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      return { startDate: start, endDate: end, label: "Yesterday" };
    }

    if (filter === "last7days") {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      return { startDate: start, endDate: now, label: "Last 7 Days" };
    }

    if (filter === "thismonth") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      return { startDate: start, endDate: now, label: "This Month" };
    }

    // Default: last30days
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: now, label: "Last 30 Days" };
  }

  /**
   * Derives tier code for a tournament record.
   */
  static getTierCode(t: { title: string; entryFee: number; configSnapshot?: any; rules?: any }): TournamentTierCode {
    const code = (t.configSnapshot as any)?.tierCode || (t.rules as any)?.tierCode;
    if (code && ["mini", "basic", "standard", "premium", "pro"].includes(code.toLowerCase())) {
      return code.toLowerCase() as TournamentTierCode;
    }
    const title = (t.title || "").toLowerCase();
    if (title.includes("pro") || t.entryFee >= 100) return "pro";
    if (title.includes("premium") || t.entryFee >= 50) return "premium";
    if (title.includes("standard") || t.entryFee >= 25) return "standard";
    if (title.includes("basic") || t.entryFee >= 10) return "basic";
    return "mini";
  }

  /**
   * Main aggregated analytics endpoint payload.
   */
  static async getTournamentAnalytics(params: AnalyticsFilterParams): Promise<TournamentAnalyticsResponse> {
    const cacheKey = TournamentAnalyticsCache.buildKey("FULL_SUMMARY", params as Record<string, unknown>);
    const cached = TournamentAnalyticsCache.get<TournamentAnalyticsResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const { startDate, endDate } = this.getDateRange(params);
    const filter = params.timeFilter || "last30days";

    // 1. Query tournaments within date range
    const tournaments = await prisma.tournament.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        ...(params.gameId && params.gameId !== "all" ? { gameId: params.gameId } : {}),
      },
      include: {
        players: {
          select: {
            id: true,
            userId: true,
            wins: true,
            losses: true,
            points: true,
            finalRank: true,
            eliminated: true,
          },
        },
        prizes: true,
        rounds: {
          select: {
            id: true,
            roundNumber: true,
            status: true,
            winnerId: true,
            matchId: true,
          },
        },
        _count: {
          select: { players: true, rounds: true },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 2000,
    });

    // 2. Filter by tier if specified
    const filteredTournaments = params.tier && params.tier !== "all"
      ? tournaments.filter((t) => this.getTierCode(t) === params.tier)
      : tournaments;

    // 3. Aggregate Overview Metrics
    let liveTournaments = 0;
    let upcomingTournaments = 0;
    let completedTournaments = 0;
    let cancelledTournaments = 0;
    let totalRegistrations = 0;
    let totalMaxCapacity = 0;
    let fullTournamentsCount = 0;
    let underfilledTournamentsCount = 0;
    let cancelledDueToMinPlayersCount = 0;
    let totalEntryCollection = 0;
    let configuredPrizePool = 0;
    let actualPrizeDistributed = 0;
    let totalRefunds = 0;

    let firstPrizeDistributed = 0;
    let secondPrizeDistributed = 0;
    let thirdPrizeDistributed = 0;
    let fourthPrizeDistributed = 0;

    let firstPlaceCount = 0;
    let secondPlaceCount = 0;
    let thirdPlaceCount = 0;
    let fourthPlaceCount = 0;

    let totalSettlements = 0;
    let creditedCount = 0;
    let pendingCount = 0;
    let failedCount = 0;
    let pendingSettlementsAmount = 0;
    let failedSettlementsAmount = 0;

    // Dedicated Prize Distribution Breakdowns (by Game, by Tier, by Date)
    const prizeByGameMap = new Map<string, PrizeDistributionByGameItem>();
    for (const g of GAME_DEFINITIONS) {
      prizeByGameMap.set(g.id, {
        gameId: g.id,
        gameName: g.name,
        tournamentsCount: 0,
        totalConfiguredPool: 0,
        totalDistributed: 0,
        firstPlaceAmount: 0,
        firstPlaceCount: 0,
        secondPlaceAmount: 0,
        secondPlaceCount: 0,
        thirdPlaceAmount: 0,
        thirdPlaceCount: 0,
        fourthPlaceAmount: 0,
        fourthPlaceCount: 0,
        pendingSettlementsAmount: 0,
        pendingSettlementsCount: 0,
        failedSettlementsAmount: 0,
        failedSettlementsCount: 0,
      });
    }

    const prizeByTierMap = new Map<TournamentTierCode, PrizeDistributionByTierItem>();
    for (const t of DEFAULT_TOURNAMENT_TIERS) {
      const code = t.code as TournamentTierCode;
      prizeByTierMap.set(code, {
        tierCode: code,
        tierName: t.name,
        entryFee: t.entryFee,
        tournamentsCount: 0,
        totalConfiguredPool: 0,
        totalDistributed: 0,
        firstPlaceAmount: 0,
        firstPlaceCount: 0,
        secondPlaceAmount: 0,
        secondPlaceCount: 0,
        thirdPlaceAmount: 0,
        thirdPlaceCount: 0,
        fourthPlaceAmount: 0,
        fourthPlaceCount: 0,
        pendingSettlementsAmount: 0,
        pendingSettlementsCount: 0,
        failedSettlementsAmount: 0,
        failedSettlementsCount: 0,
      });
    }

    const prizeByDateMap = new Map<string, PrizeDistributionByDateItem>();

    for (const t of filteredTournaments) {
      const regCount = t.players.length;
      totalRegistrations += regCount;
      totalMaxCapacity += t.maxPlayers;
      configuredPrizePool += t.prizePool;

      const gItem = prizeByGameMap.get(t.gameId);
      const tierCode = this.getTierCode(t);
      const tItem = prizeByTierMap.get(tierCode);
      const dKey = t.startTime.toISOString().slice(0, 10);
      let dItem = prizeByDateMap.get(dKey);
      if (!dItem) {
        dItem = {
          date: dKey,
          label: t.startTime.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          tournamentsCount: 0,
          totalConfiguredPool: 0,
          totalDistributed: 0,
          firstPlaceAmount: 0,
          firstPlaceCount: 0,
          secondPlaceAmount: 0,
          secondPlaceCount: 0,
          thirdPlaceAmount: 0,
          thirdPlaceCount: 0,
          fourthPlaceAmount: 0,
          fourthPlaceCount: 0,
          pendingSettlementsAmount: 0,
          pendingSettlementsCount: 0,
          failedSettlementsAmount: 0,
          failedSettlementsCount: 0,
        };
        prizeByDateMap.set(dKey, dItem);
      }

      if (gItem) {
        gItem.tournamentsCount++;
        gItem.totalConfiguredPool += t.prizePool;
      }
      if (tItem) {
        tItem.tournamentsCount++;
        tItem.totalConfiguredPool += t.prizePool;
      }
      if (dItem) {
        dItem.tournamentsCount++;
        dItem.totalConfiguredPool += t.prizePool;
      }

      if (regCount >= t.maxPlayers) {
        fullTournamentsCount++;
      } else {
        underfilledTournamentsCount++;
      }

      if (t.status === "IN_PROGRESS" || t.status === "LIVE") {
        liveTournaments++;
      } else if (
        t.status === "DRAFT" ||
        t.status === "UPCOMING" ||
        t.status === "REGISTRATION_OPEN" ||
        t.status === "REGISTRATION_CLOSED" ||
        t.status === "STARTING"
      ) {
        upcomingTournaments++;
      } else if (t.status === "COMPLETED" || t.status === "SETTLING" || t.status === "SETTLED") {
        completedTournaments++;
      } else if (t.status === "CANCELLED") {
        cancelledTournaments++;
        // If cancelled due to underfill
        if (regCount < t.minPlayers) {
          cancelledDueToMinPlayersCount++;
        }
        totalRefunds += t.entryFee * regCount;
      }

      // Ledger confirmed entry collection
      totalEntryCollection += t.entryFee * regCount;

      // Prize distributions from prizes records
      for (const p of t.prizes) {
        totalSettlements++;
        if (p.status === "PAID") {
          creditedCount++;
          actualPrizeDistributed += p.amount;
          if (p.rank === 1) {
            firstPrizeDistributed += p.amount;
            firstPlaceCount++;
            if (gItem) { gItem.firstPlaceAmount += p.amount; gItem.firstPlaceCount++; gItem.totalDistributed += p.amount; }
            if (tItem) { tItem.firstPlaceAmount += p.amount; tItem.firstPlaceCount++; tItem.totalDistributed += p.amount; }
            if (dItem) { dItem.firstPlaceAmount += p.amount; dItem.firstPlaceCount++; dItem.totalDistributed += p.amount; }
          } else if (p.rank === 2) {
            secondPrizeDistributed += p.amount;
            secondPlaceCount++;
            if (gItem) { gItem.secondPlaceAmount += p.amount; gItem.secondPlaceCount++; gItem.totalDistributed += p.amount; }
            if (tItem) { tItem.secondPlaceAmount += p.amount; tItem.secondPlaceCount++; tItem.totalDistributed += p.amount; }
            if (dItem) { dItem.secondPlaceAmount += p.amount; dItem.secondPlaceCount++; dItem.totalDistributed += p.amount; }
          } else if (p.rank === 3) {
            thirdPrizeDistributed += p.amount;
            thirdPlaceCount++;
            if (gItem) { gItem.thirdPlaceAmount += p.amount; gItem.thirdPlaceCount++; gItem.totalDistributed += p.amount; }
            if (tItem) { tItem.thirdPlaceAmount += p.amount; tItem.thirdPlaceCount++; tItem.totalDistributed += p.amount; }
            if (dItem) { dItem.thirdPlaceAmount += p.amount; dItem.thirdPlaceCount++; dItem.totalDistributed += p.amount; }
          } else if (p.rank === 4) {
            fourthPrizeDistributed += p.amount;
            fourthPlaceCount++;
            if (gItem) { gItem.fourthPlaceAmount += p.amount; gItem.fourthPlaceCount++; gItem.totalDistributed += p.amount; }
            if (tItem) { tItem.fourthPlaceAmount += p.amount; tItem.fourthPlaceCount++; tItem.totalDistributed += p.amount; }
            if (dItem) { dItem.fourthPlaceAmount += p.amount; dItem.fourthPlaceCount++; dItem.totalDistributed += p.amount; }
          }
        } else if (p.status === "PENDING") {
          pendingCount++;
          pendingSettlementsAmount += p.amount;
          if (gItem) { gItem.pendingSettlementsAmount += p.amount; gItem.pendingSettlementsCount++; }
          if (tItem) { tItem.pendingSettlementsAmount += p.amount; tItem.pendingSettlementsCount++; }
          if (dItem) { dItem.pendingSettlementsAmount += p.amount; dItem.pendingSettlementsCount++; }
        } else if (p.status === "FAILED") {
          failedCount++;
          failedSettlementsAmount += p.amount;
          if (gItem) { gItem.failedSettlementsAmount += p.amount; gItem.failedSettlementsCount++; }
          if (tItem) { tItem.failedSettlementsAmount += p.amount; tItem.failedSettlementsCount++; }
          if (dItem) { dItem.failedSettlementsAmount += p.amount; dItem.failedSettlementsCount++; }
        }
      }
    }

    const totalTournaments = filteredTournaments.length;
    const startedTournaments = liveTournaments + completedTournaments;
    const fillRatePercent = totalMaxCapacity > 0 ? Math.round((totalRegistrations / totalMaxCapacity) * 1000) / 10 : 0;
    const completionRatePercent = startedTournaments > 0 ? Math.round((completedTournaments / startedTournaments) * 1000) / 10 : 0;
    const cancellationRatePercent = totalTournaments > 0 ? Math.round((cancelledTournaments / totalTournaments) * 1000) / 10 : 0;
    const averageRegistrationsPerTournament = totalTournaments > 0 ? Math.round((totalRegistrations / totalTournaments) * 10) / 10 : 0;
    const platformOperatingAmount = Math.max(0, totalEntryCollection - actualPrizeDistributed - totalRefunds);

    const overview: TournamentAnalyticsOverview = {
      totalTournaments,
      liveTournaments,
      upcomingTournaments,
      completedTournaments,
      cancelledTournaments,
      totalRegistrations,
      averageRegistrationsPerTournament,
      fillRatePercent,
      fullTournamentsCount,
      underfilledTournamentsCount,
      cancelledDueToMinPlayersCount,
      completionRatePercent,
      cancellationRatePercent,
      totalEntryCollection,
      configuredPrizePool,
      actualPrizeDistributed,
      totalRefunds,
      platformOperatingAmount,
      prizesBreakdown: {
        firstPrizeDistributed,
        secondPrizeDistributed,
        thirdPrizeDistributed,
        fourthPrizeDistributed,
        totalDistributed: actualPrizeDistributed,
      },
      refundsSummary: {
        refundRequestsCount: cancelledTournaments > 0 ? totalRegistrations : 0,
        successfulRefundsCount: cancelledTournaments > 0 ? totalRegistrations : 0,
        pendingRefundsCount: 0,
        failedRefundsCount: 0,
        totalRefundedCoins: totalRefunds,
      },
      settlementsSummary: {
        totalSettlements,
        creditedCount,
        pendingCount,
        failedCount,
        partiallySettledCount: 0,
        totalPrizePaidOut: actualPrizeDistributed,
      },
    };

    const prizeDistribution: PrizeDistributionAnalyticsSection = {
      summary: {
        totalConfiguredPool: configuredPrizePool,
        totalDistributed: actualPrizeDistributed,
        firstPlaceAmount: firstPrizeDistributed,
        firstPlaceCount,
        secondPlaceAmount: secondPrizeDistributed,
        secondPlaceCount,
        thirdPlaceAmount: thirdPrizeDistributed,
        thirdPlaceCount,
        fourthPlaceAmount: fourthPrizeDistributed,
        fourthPlaceCount,
        pendingSettlementsAmount,
        pendingSettlementsCount: pendingCount,
        failedSettlementsAmount,
        failedSettlementsCount: failedCount,
      },
      byGame: Array.from(prizeByGameMap.values()),
      byTier: Array.from(prizeByTierMap.values()),
      byDate: Array.from(prizeByDateMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    };

    // 3c. Dedicated Refund Analytics (Summary, by Game, by Tier, by Date, Records)
    const refundTransactions = await prisma.transaction.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        type: "CREDIT",
        OR: [
          { referenceType: "TOURNAMENT_ENTRY" },
          { referenceType: "WAGER_REFUND" },
        ],
      },
      include: {
        user: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const tournamentLookup = new Map<string, { id: string; title: string; gameId: string; tierCode: TournamentTierCode }>();
    for (const t of tournaments) {
      tournamentLookup.set(t.id, {
        id: t.id,
        title: t.title,
        gameId: t.gameId,
        tierCode: this.getTierCode(t),
      });
    }

    const refundByGameMap = new Map<string, RefundByGameItem>();
    for (const g of GAME_DEFINITIONS) {
      refundByGameMap.set(g.id, {
        gameId: g.id,
        gameName: g.name,
        refundRequestsCount: 0,
        successfulRefundsCount: 0,
        pendingRefundsCount: 0,
        failedRefundsCount: 0,
        totalRefundedCoins: 0,
      });
    }

    const refundByTierMap = new Map<TournamentTierCode, RefundByTierItem>();
    for (const t of DEFAULT_TOURNAMENT_TIERS) {
      const code = t.code as TournamentTierCode;
      refundByTierMap.set(code, {
        tierCode: code,
        tierName: t.name,
        entryFee: t.entryFee,
        refundRequestsCount: 0,
        successfulRefundsCount: 0,
        pendingRefundsCount: 0,
        failedRefundsCount: 0,
        totalRefundedCoins: 0,
      });
    }

    const refundByDateMap = new Map<string, RefundByDateItem>();
    const refundRecords: TournamentRefundRecordItem[] = [];

    let totalRefundRequests = 0;
    let successfulRefundsCount = 0;
    let pendingRefundsCount = 0;
    let failedRefundsCount = 0;
    let totalRefundedCoins = 0;

    for (const tx of refundTransactions) {
      const tId = tx.referenceId || "unknown";
      const tInfo = tournamentLookup.get(tId) || {
        id: tId,
        title: `Tournament #${tId.slice(-6)}`,
        gameId: "unknown",
        tierCode: "standard" as TournamentTierCode,
      };

      if (params.tournamentId && params.tournamentId !== "ALL" && tInfo.id !== params.tournamentId) continue;
      if (params.gameId && params.gameId !== "ALL" && tInfo.gameId !== params.gameId) continue;
      if (params.tier && params.tier !== "ALL" && tInfo.tierCode !== params.tier) continue;

      totalRefundRequests++;
      successfulRefundsCount++;
      totalRefundedCoins += tx.amount;

      const gItem = refundByGameMap.get(tInfo.gameId);
      if (gItem) {
        gItem.refundRequestsCount++;
        gItem.successfulRefundsCount++;
        gItem.totalRefundedCoins += tx.amount;
      }

      const tItem = refundByTierMap.get(tInfo.tierCode);
      if (tItem) {
        tItem.refundRequestsCount++;
        tItem.successfulRefundsCount++;
        tItem.totalRefundedCoins += tx.amount;
      }

      const dKey = tx.createdAt.toISOString().slice(0, 10);
      let dItem = refundByDateMap.get(dKey);
      if (!dItem) {
        dItem = {
          date: dKey,
          label: tx.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          refundRequestsCount: 0,
          successfulRefundsCount: 0,
          pendingRefundsCount: 0,
          failedRefundsCount: 0,
          totalRefundedCoins: 0,
        };
        refundByDateMap.set(dKey, dItem);
      }
      dItem.refundRequestsCount++;
      dItem.successfulRefundsCount++;
      dItem.totalRefundedCoins += tx.amount;

      refundRecords.push({
        id: tx.id,
        tournamentId: tInfo.id,
        tournamentTitle: tInfo.title,
        gameId: tInfo.gameId,
        tierCode: tInfo.tierCode,
        userId: tx.userId,
        username: tx.user?.username || "Player",
        amount: tx.amount,
        status: "SUCCESS",
        reason: ((tx.meta as any)?.reason as string) || "Tournament Cancellation Refund",
        createdAt: tx.createdAt.toISOString(),
        processedAt: tx.createdAt.toISOString(),
      });
    }

    // Include cancelled tournaments with pending refund recognition
    for (const t of filteredTournaments) {
      if (t.status === "CANCELLED" && t.players.length > 0) {
        const hasTxs = refundTransactions.some((tx) => tx.referenceId === t.id);
        if (!hasTxs) {
          totalRefundRequests += t.players.length;
          pendingRefundsCount += t.players.length;

          const gItem = refundByGameMap.get(t.gameId);
          if (gItem) {
            gItem.refundRequestsCount += t.players.length;
            gItem.pendingRefundsCount += t.players.length;
          }

          const tierCode = this.getTierCode(t);
          const tItem = refundByTierMap.get(tierCode);
          if (tItem) {
            tItem.refundRequestsCount += t.players.length;
            tItem.pendingRefundsCount += t.players.length;
          }
        }
      }
    }

    const refundAnalytics: RefundAnalyticsSection = {
      summary: {
        totalRefundRequests,
        successfulRefundsCount,
        pendingRefundsCount,
        failedRefundsCount,
        totalRefundedCoins,
      },
      byGame: Array.from(refundByGameMap.values()),
      byTier: Array.from(refundByTierMap.values()),
      byDate: Array.from(refundByDateMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      records: refundRecords.slice(0, 100),
    };

    // 3d. Dedicated Settlement Analytics (Summary, by Game, by Tier, by Date, Records & Failed Records)
    const settlementByGameMap = new Map<string, SettlementByGameItem>();
    for (const g of GAME_DEFINITIONS) {
      settlementByGameMap.set(g.id, {
        gameId: g.id,
        gameName: g.name,
        totalSettlements: 0,
        creditedSettlements: 0,
        pendingSettlements: 0,
        failedSettlements: 0,
        partiallySettledTournaments: 0,
        totalSettledAmount: 0,
      });
    }

    const settlementByTierMap = new Map<TournamentTierCode, SettlementByTierItem>();
    for (const t of DEFAULT_TOURNAMENT_TIERS) {
      const code = t.code as TournamentTierCode;
      settlementByTierMap.set(code, {
        tierCode: code,
        tierName: t.name,
        entryFee: t.entryFee,
        totalSettlements: 0,
        creditedSettlements: 0,
        pendingSettlements: 0,
        failedSettlements: 0,
        partiallySettledTournaments: 0,
        totalSettledAmount: 0,
      });
    }

    const settlementByDateMap = new Map<string, SettlementByDateItem>();
    const settlementRecords: TournamentSettlementRecordItem[] = [];
    const failedSettlementRecords: TournamentSettlementRecordItem[] = [];

    let totalSettlementsCount = 0;
    let creditedSettlementsCount = 0;
    let pendingSettlementsCount = 0;
    let failedSettlementsCount = 0;
    let partiallySettledTournamentsCount = 0;
    let totalSettledAmount = 0;
    let totalPendingAmount = 0;
    let totalFailedAmount = 0;

    for (const t of filteredTournaments) {
      if (params.tournamentId && params.tournamentId !== "ALL" && t.id !== params.tournamentId) continue;
      if (params.gameId && params.gameId !== "ALL" && t.gameId !== params.gameId) continue;
      const tierCode = this.getTierCode(t);
      if (params.tier && params.tier !== "ALL" && tierCode !== params.tier) continue;

      const gItem = settlementByGameMap.get(t.gameId);
      const tItem = settlementByTierMap.get(tierCode);
      const dKey = t.startTime.toISOString().slice(0, 10);
      let dItem = settlementByDateMap.get(dKey);
      if (!dItem) {
        dItem = {
          date: dKey,
          label: t.startTime.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          totalSettlements: 0,
          creditedSettlements: 0,
          pendingSettlements: 0,
          failedSettlements: 0,
          totalSettledAmount: 0,
        };
        settlementByDateMap.set(dKey, dItem);
      }

      // Check partially settled
      const hasPaid = t.prizes.some((p) => p.status === "PAID");
      const hasPendingOrFailed = t.prizes.some((p) => p.status === "PENDING" || p.status === "FAILED");
      const isPartiallySettled = hasPaid && hasPendingOrFailed;
      if (isPartiallySettled) {
        partiallySettledTournamentsCount++;
        if (gItem) gItem.partiallySettledTournaments++;
        if (tItem) tItem.partiallySettledTournaments++;
      }

      for (const p of t.prizes) {
        totalSettlementsCount++;
        if (gItem) gItem.totalSettlements++;
        if (tItem) tItem.totalSettlements++;
        dItem.totalSettlements++;

        const isPaid = p.status === "PAID";
        const isPending = p.status === "PENDING";
        const isFailed = p.status === "FAILED";

        if (isPaid) {
          creditedSettlementsCount++;
          totalSettledAmount += p.amount;
          if (gItem) { gItem.creditedSettlements++; gItem.totalSettledAmount += p.amount; }
          if (tItem) { tItem.creditedSettlements++; tItem.totalSettledAmount += p.amount; }
          dItem.creditedSettlements++;
          dItem.totalSettledAmount += p.amount;
        } else if (isPending) {
          pendingSettlementsCount++;
          totalPendingAmount += p.amount;
          if (gItem) gItem.pendingSettlements++;
          if (tItem) tItem.pendingSettlements++;
          dItem.pendingSettlements++;
        } else if (isFailed) {
          failedSettlementsCount++;
          totalFailedAmount += p.amount;
          if (gItem) gItem.failedSettlements++;
          if (tItem) tItem.failedSettlements++;
          dItem.failedSettlements++;
        }

        const recordItem: TournamentSettlementRecordItem = {
          id: p.id,
          tournamentId: t.id,
          tournamentTitle: t.title,
          gameId: t.gameId,
          tierCode,
          userId: p.userId,
          username: `Player #${p.userId.slice(-6)}`,
          rank: p.rank,
          amount: p.amount,
          status: p.status as "PAID" | "PENDING" | "FAILED",
          transactionId: p.transactionId,
          paidAt: p.paidAt ? p.paidAt.toISOString() : null,
          error: (p as any).error ?? (isFailed ? "Payout transfer failed" : null),
          requiresAdminAttention: isFailed || !!(p as any).error,
          createdAt: p.createdAt.toISOString(),
        };

        settlementRecords.push(recordItem);
        if (recordItem.requiresAdminAttention) {
          failedSettlementRecords.push(recordItem);
        }
      }
    }

    const settlementAnalytics: SettlementAnalyticsSection = {
      summary: {
        totalSettlements: totalSettlementsCount,
        creditedSettlements: creditedSettlementsCount,
        pendingSettlements: pendingSettlementsCount,
        failedSettlements: failedSettlementsCount,
        partiallySettledTournaments: partiallySettledTournamentsCount,
        totalSettledAmount,
        totalPendingAmount,
        totalFailedAmount,
      },
      byGame: Array.from(settlementByGameMap.values()),
      byTier: Array.from(settlementByTierMap.values()),
      byDate: Array.from(settlementByDateMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      records: settlementRecords.slice(0, 100),
      failedRecords: failedSettlementRecords,
    };

    // 4. Game Analytics for all 10 Games
    const gameMap = new Map<string, GameAnalyticsStat>();
    for (const g of GAME_DEFINITIONS) {
      gameMap.set(g.id, {
        gameId: g.id,
        gameName: g.name,
        tournamentsCount: 0,
        playersCount: 0,
        completedCount: 0,
        cancelledCount: 0,
        entryCollection: 0,
        prizesDistributed: 0,
        refunds: 0,
        completionRatePercent: 0,
        winRatePercent: 0,
      });
    }

    // Match counts for game win rates
    const gameMatchWins = new Map<string, number>();
    const gameMatchTotal = new Map<string, number>();
    const gameCapacityMap = new Map<string, number>();

    for (const t of filteredTournaments) {
      const g = gameMap.get(t.gameId);
      if (g) {
        g.tournamentsCount++;
        g.playersCount += t.players.length;
        gameCapacityMap.set(t.gameId, (gameCapacityMap.get(t.gameId) || 0) + t.maxPlayers);
        if (t.status === "COMPLETED" || t.status === "SETTLED") g.completedCount++;
        if (t.status === "CANCELLED") {
          g.cancelledCount++;
          g.refunds += t.entryFee * t.players.length;
        }
        g.entryCollection += t.entryFee * t.players.length;
        for (const p of t.prizes) {
          if (p.status === "PAID") g.prizesDistributed += p.amount;
        }

        // Count completed matches
        for (const r of t.rounds) {
          if (r.status === "COMPLETED" && r.winnerId) {
            gameMatchWins.set(t.gameId, (gameMatchWins.get(t.gameId) || 0) + 1);
            gameMatchTotal.set(t.gameId, (gameMatchTotal.get(t.gameId) || 0) + 1);
          }
        }
      }
    }

    const games: GameAnalyticsStat[] = Array.from(gameMap.values()).map((g) => {
      const started = g.completedCount;
      const completionRatePercent = g.tournamentsCount > 0 ? Math.round((g.completedCount / g.tournamentsCount) * 1000) / 10 : 0;
      const totalMatches = gameMatchTotal.get(g.gameId) || 0;
      const winRatePercent = totalMatches > 0 ? 100 : 0;
      return {
        ...g,
        completionRatePercent,
        winRatePercent,
      };
    });

    // 5. Tier Analytics for all 5 Tiers
    const tierMap = new Map<TournamentTierCode, TierAnalyticsStat>();
    for (const t of DEFAULT_TOURNAMENT_TIERS) {
      const code = t.code as TournamentTierCode;
      tierMap.set(code, {
        tierCode: code,
        tierName: t.name,
        entryFee: t.entryFee,
        tournamentsCount: 0,
        registrationsCount: 0,
        averageRegistrations: 0,
        entryFeesCollected: 0,
        configuredPrizePool: 0,
        prizesDistributed: 0,
        refunds: 0,
        completionRatePercent: 0,
        fillRatePercent: 0,
      });
    }

    const tierCapacityMap = new Map<TournamentTierCode, number>();

    for (const t of filteredTournaments) {
      const tierCode = this.getTierCode(t);
      const tierStat = tierMap.get(tierCode);
      if (tierStat) {
        tierStat.tournamentsCount++;
        tierStat.registrationsCount += t.players.length;
        tierStat.entryFeesCollected += t.entryFee * t.players.length;
        tierStat.configuredPrizePool += t.prizePool;
        tierCapacityMap.set(tierCode, (tierCapacityMap.get(tierCode) || 0) + t.maxPlayers);

        if (t.status === "COMPLETED" || t.status === "SETTLED") {
          tierStat.completionRatePercent++; // increment completed count temporarily
        }
        if (t.status === "CANCELLED") {
          tierStat.refunds += t.entryFee * t.players.length;
        }
        for (const p of t.prizes) {
          if (p.status === "PAID") tierStat.prizesDistributed += p.amount;
        }
      }
    }

    const tiers: TierAnalyticsStat[] = Array.from(tierMap.values()).map((ts) => {
      const completed = ts.completionRatePercent; // temporarily stored
      const cap = tierCapacityMap.get(ts.tierCode) || 0;
      const fillRatePercent = cap > 0 ? Math.round((ts.registrationsCount / cap) * 1000) / 10 : 0;
      const completionRatePercent = ts.tournamentsCount > 0 ? Math.round((completed / ts.tournamentsCount) * 1000) / 10 : 0;
      const averageRegistrations = ts.tournamentsCount > 0 ? Math.round((ts.registrationsCount / ts.tournamentsCount) * 10) / 10 : 0;
      return {
        ...ts,
        averageRegistrations,
        completionRatePercent,
        fillRatePercent,
      };
    });

    // 5b. Tier Performance Trends Timeline across all 5 tiers
    const tierTrendMap = new Map<string, {
      date: string;
      label: string;
      tierCode: TournamentTierCode;
      tournamentsCount: number;
      registrationsCount: number;
      maxCapacity: number;
      completedCount: number;
    }>();

    for (const t of filteredTournaments) {
      const tierCode = this.getTierCode(t);
      const dStr = new Date(t.createdAt).toISOString().split("T")[0]!;
      const key = `${dStr}_${tierCode}`;
      let item = tierTrendMap.get(key);
      if (!item) {
        item = {
          date: dStr,
          label: dStr,
          tierCode,
          tournamentsCount: 0,
          registrationsCount: 0,
          maxCapacity: 0,
          completedCount: 0,
        };
        tierTrendMap.set(key, item);
      }
      item.tournamentsCount++;
      item.registrationsCount += t.players.length;
      item.maxCapacity += t.maxPlayers;
      if (t.status === "COMPLETED" || t.status === "SETTLED") {
        item.completedCount++;
      }
    }

    const tierTimeline: TierTrendDataPoint[] = Array.from(tierTrendMap.values())
      .map((item) => ({
        date: item.date,
        label: item.label,
        tierCode: item.tierCode,
        tournamentsCount: item.tournamentsCount,
        registrationsCount: item.registrationsCount,
        averageRegistrations: item.tournamentsCount > 0 ? Math.round((item.registrationsCount / item.tournamentsCount) * 10) / 10 : 0,
        fillRatePercent: item.maxCapacity > 0 ? Math.round((item.registrationsCount / item.maxCapacity) * 1000) / 10 : 0,
        completionRatePercent: item.tournamentsCount > 0 ? Math.round((item.completedCount / item.tournamentsCount) * 1000) / 10 : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const tierPerformanceTrends: TierPerformanceTrendsSection = {
      tiers,
      timeline: tierTimeline,
    };

    // 6. 24-Hour Hourly Performance Distribution
    const hourlyCounts = Array.from({ length: 24 }, (_, hour) => {
      const hour12 = hour % 12 === 0 ? 12 : hour % 12;
      const ampm = hour < 12 ? "AM" : "PM";
      return {
        hour,
        hourLabel: `${hour12} ${ampm}`,
        tournamentsCount: 0,
        registrationsCount: 0,
        completedCount: 0,
      };
    });

    for (const t of filteredTournaments) {
      const hour = new Date(t.startTime).getHours();
      const h = hourlyCounts[hour];
      if (h) {
        h.tournamentsCount++;
        h.registrationsCount += t.players.length;
        if (t.status === "COMPLETED" || t.status === "SETTLED") h.completedCount++;
      }
    }

    const maxRegistrations = Math.max(...hourlyCounts.map((h) => h.registrationsCount), 1);
    const avgRegistrations = hourlyCounts.reduce((sum, h) => sum + h.registrationsCount, 0) / 24;

    const hourlyPerformance: HourlyPerformanceStat[] = hourlyCounts.map((h) => {
      const completionRatePercent = h.tournamentsCount > 0 ? Math.round((h.completedCount / h.tournamentsCount) * 1000) / 10 : 0;
      const isPeakHour = h.registrationsCount > 0 && h.registrationsCount >= avgRegistrations * 1.5;
      const isLowParticipationHour = h.registrationsCount < avgRegistrations * 0.5;
      return {
        hour: h.hour,
        hourLabel: h.hourLabel,
        tournamentsCount: h.tournamentsCount,
        registrationsCount: h.registrationsCount,
        completionRatePercent,
        isPeakHour,
        isLowParticipationHour,
      };
    });

    // 7. Player Analytics (Summary, by Game, by Tier, by Date & Anonymized Cohorts)
    const uniqueUserIds = new Set<string>();
    const userParticipationCount = new Map<string, number>();
    const userGamesCount = new Map<string, Set<string>>();
    const userPoints = new Map<string, number>();
    const userRanks = new Map<string, number>();
    const userFirstJoined = new Map<string, Date>();
    const userLastActive = new Map<string, Date>();

    // Maps for dimensions
    const playerGameMap = new Map<string, { uniquePlayers: Set<string>; userCounts: Map<string, number>; totalRegs: number }>();
    for (const g of GAME_DEFINITIONS) {
      playerGameMap.set(g.id, { uniquePlayers: new Set(), userCounts: new Map(), totalRegs: 0 });
    }

    const playerTierMap = new Map<TournamentTierCode, { uniquePlayers: Set<string>; userCounts: Map<string, number>; totalRegs: number }>();
    const tierOrderCodes: TournamentTierCode[] = ["mini", "basic", "standard", "premium", "pro"];
    for (const tc of tierOrderCodes) {
      playerTierMap.set(tc, { uniquePlayers: new Set(), userCounts: new Map(), totalRegs: 0 });
    }

    const playerDateMap = new Map<string, { uniquePlayers: Set<string>; userCounts: Map<string, number>; totalRegs: number }>();

    for (const t of filteredTournaments) {
      const tierCode = this.getTierCode(t);
      const dKey = new Date(t.createdAt).toISOString().split("T")[0]!;

      let dateEntry = playerDateMap.get(dKey);
      if (!dateEntry) {
        dateEntry = { uniquePlayers: new Set(), userCounts: new Map(), totalRegs: 0 };
        playerDateMap.set(dKey, dateEntry);
      }

      for (const p of t.players) {
        uniqueUserIds.add(p.userId);
        userParticipationCount.set(p.userId, (userParticipationCount.get(p.userId) || 0) + 1);

        if (!userGamesCount.has(p.userId)) userGamesCount.set(p.userId, new Set());
        userGamesCount.get(p.userId)!.add(t.gameId);

        userPoints.set(p.userId, (userPoints.get(p.userId) || 0) + (p.points || 0));
        if (p.finalRank && p.finalRank > 0) {
          const prev = userRanks.get(p.userId) || 999;
          if (p.finalRank < prev) userRanks.set(p.userId, p.finalRank);
        }

        const joinedAt = (p as any).createdAt ? new Date((p as any).createdAt) : new Date(t.createdAt);
        if (!userFirstJoined.has(p.userId) || joinedAt < userFirstJoined.get(p.userId)!) {
          userFirstJoined.set(p.userId, joinedAt);
        }
        if (!userLastActive.has(p.userId) || joinedAt > userLastActive.get(p.userId)!) {
          userLastActive.set(p.userId, joinedAt);
        }

        // By Game
        const gEntry = playerGameMap.get(t.gameId);
        if (gEntry) {
          gEntry.uniquePlayers.add(p.userId);
          gEntry.userCounts.set(p.userId, (gEntry.userCounts.get(p.userId) || 0) + 1);
          gEntry.totalRegs++;
        }

        // By Tier
        const tEntry = playerTierMap.get(tierCode);
        if (tEntry) {
          tEntry.uniquePlayers.add(p.userId);
          tEntry.userCounts.set(p.userId, (tEntry.userCounts.get(p.userId) || 0) + 1);
          tEntry.totalRegs++;
        }

        // By Date
        dateEntry.uniquePlayers.add(p.userId);
        dateEntry.userCounts.set(p.userId, (dateEntry.userCounts.get(p.userId) || 0) + 1);
        dateEntry.totalRegs++;
      }
    }

    const activeTournamentPlayers = uniqueUserIds.size;
    let newTournamentPlayers = 0;
    let returningTournamentPlayers = 0;

    for (const count of userParticipationCount.values()) {
      if (count === 1) newTournamentPlayers++;
      else returningTournamentPlayers++;
    }

    const averageTournamentsPerPlayer = activeTournamentPlayers > 0
      ? Math.round((totalRegistrations / activeTournamentPlayers) * 10) / 10
      : 0;

    const playerCohort: PlayerCohortAnalyticsStat[] = [
      {
        activeTournamentPlayers,
        newTournamentPlayers,
        returningTournamentPlayers,
        averageTournamentsPerPlayer,
      },
    ];

    // Build Player Analytics Breakdown Matrices
    const playerByGame: PlayerAnalyticsByGameItem[] = GAME_DEFINITIONS.map((g) => {
      const gEntry = playerGameMap.get(g.id)!;
      const aPlayers = gEntry.uniquePlayers.size;
      let nPlayers = 0;
      let rPlayers = 0;
      for (const cnt of gEntry.userCounts.values()) {
        if (cnt === 1) nPlayers++;
        else rPlayers++;
      }
      return {
        gameId: g.id,
        gameName: g.name,
        activePlayers: aPlayers,
        newPlayers: nPlayers,
        returningPlayers: rPlayers,
        totalRegistrations: gEntry.totalRegs,
        averageTournamentsPerPlayer: aPlayers > 0 ? Math.round((gEntry.totalRegs / aPlayers) * 10) / 10 : 0,
      };
    });

    const tierNameMap: Record<TournamentTierCode, { name: string; entryFee: number }> = {
      mini: { name: "Mini", entryFee: 5 },
      basic: { name: "Basic", entryFee: 10 },
      standard: { name: "Standard", entryFee: 25 },
      premium: { name: "Premium", entryFee: 50 },
      pro: { name: "Pro", entryFee: 100 },
    };

    const playerByTier: PlayerAnalyticsByTierItem[] = tierOrderCodes.map((tc) => {
      const tEntry = playerTierMap.get(tc)!;
      const aPlayers = tEntry.uniquePlayers.size;
      let nPlayers = 0;
      let rPlayers = 0;
      for (const cnt of tEntry.userCounts.values()) {
        if (cnt === 1) nPlayers++;
        else rPlayers++;
      }
      return {
        tierCode: tc,
        tierName: tierNameMap[tc].name,
        entryFee: tierNameMap[tc].entryFee,
        activePlayers: aPlayers,
        newPlayers: nPlayers,
        returningPlayers: rPlayers,
        totalRegistrations: tEntry.totalRegs,
        averageTournamentsPerPlayer: aPlayers > 0 ? Math.round((tEntry.totalRegs / aPlayers) * 10) / 10 : 0,
      };
    });

    const playerByDate: PlayerAnalyticsByDateItem[] = Array.from(playerDateMap.entries())
      .map(([date, dEntry]) => {
        const aPlayers = dEntry.uniquePlayers.size;
        let nPlayers = 0;
        let rPlayers = 0;
        for (const cnt of dEntry.userCounts.values()) {
          if (cnt === 1) nPlayers++;
          else rPlayers++;
        }
        return {
          date,
          label: date,
          activePlayers: aPlayers,
          newPlayers: nPlayers,
          returningPlayers: rPlayers,
          totalRegistrations: dEntry.totalRegs,
          averageTournamentsPerPlayer: aPlayers > 0 ? Math.round((dEntry.totalRegs / aPlayers) * 10) / 10 : 0,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    // Anonymized Player Cohorts (Masked IDs, no private emails or wallet details)
    const fallbackDate = new Date();
    const anonymizedCohorts: AnonymizedPlayerItem[] = Array.from(uniqueUserIds)
      .map((uId) => ({
        maskedId: `Player #${uId.slice(-6)}`,
        tournamentsJoined: userParticipationCount.get(uId) || 0,
        gamesPlayedCount: userGamesCount.get(uId)?.size || 1,
        topRank: userRanks.get(uId) || 0,
        totalPoints: userPoints.get(uId) || 0,
        firstJoinedAt: (userFirstJoined.get(uId) || fallbackDate).toISOString(),
        lastActiveAt: (userLastActive.get(uId) || fallbackDate).toISOString(),
      }))
      .sort((a, b) => b.tournamentsJoined - a.tournamentsJoined)
      .slice(0, 100);

    const playerAnalytics: PlayerAnalyticsSection = {
      summary: {
        activeTournamentPlayers,
        newTournamentPlayers,
        returningTournamentPlayers,
        averageTournamentsPerPlayer,
        totalRegistrations,
      },
      byGame: playerByGame,
      byTier: playerByTier,
      byDate: playerByDate,
      cohorts: anonymizedCohorts,
    };

    // 7c. Top Participation Analytics (Most Participated Games, Popular Tiers, Active Periods)
    const topParticipationGames: TopParticipationGameItem[] = games
      .map((g) => {
        const cap = gameCapacityMap.get(g.gameId) || 0;
        const fillRate = cap > 0 ? Math.min(100, Math.round((g.playersCount / cap) * 100)) : 0;
        return {
          rank: 0,
          gameId: g.gameId,
          gameName: g.gameName,
          tournamentsCount: g.tournamentsCount,
          totalRegistrations: g.playersCount,
          fillRatePercent: fillRate,
        };
      })
      .sort((a, b) => b.totalRegistrations - a.totalRegistrations || b.tournamentsCount - a.tournamentsCount)
      .map((item, idx) => ({ ...item, rank: idx + 1 }));

    const topParticipationTiers: TopParticipationTierItem[] = tiers
      .map((t) => ({
        rank: 0,
        tierCode: t.tierCode,
        tierName: t.tierName,
        entryFee: t.entryFee,
        tournamentsCount: t.tournamentsCount,
        totalRegistrations: t.registrationsCount,
        fillRatePercent: t.fillRatePercent,
      }))
      .sort((a, b) => b.totalRegistrations - a.totalRegistrations || b.tournamentsCount - a.tournamentsCount)
      .map((item, idx) => ({ ...item, rank: idx + 1 }));

    const topParticipationPeriods: TopParticipationPeriodItem[] = hourlyPerformance
      .map((h) => ({
        rank: 0,
        hour: h.hour,
        hourLabel: h.hourLabel,
        tournamentsCount: h.tournamentsCount,
        totalRegistrations: h.registrationsCount,
        isPeakHour: h.isPeakHour,
      }))
      .sort((a, b) => b.totalRegistrations - a.totalRegistrations || b.tournamentsCount - a.tournamentsCount)
      .map((item, idx) => ({ ...item, rank: idx + 1 }));

    const topParticipation: TopParticipationSection = {
      summary: {
        topGame: topParticipationGames[0] || null,
        topTier: topParticipationTiers[0] || null,
        topPeriod: topParticipationPeriods[0] || null,
        totalRegistrations,
      },
      games: topParticipationGames,
      tiers: topParticipationTiers,
      periods: topParticipationPeriods,
    };

    // 7d. Player Performance Analytics (Wins, Top 4, Matches Played/Won/Lost)
    const perfByGameMap = new Map<string, { tournCount: number; wins: number; top4: number; mPlayed: number; mWon: number; mLost: number }>();
    for (const g of GAME_DEFINITIONS) {
      perfByGameMap.set(g.id, { tournCount: 0, wins: 0, top4: 0, mPlayed: 0, mWon: 0, mLost: 0 });
    }

    const perfByTierMap = new Map<TournamentTierCode, { tournCount: number; wins: number; top4: number; mPlayed: number; mWon: number; mLost: number }>();
    for (const tc of tierOrderCodes) {
      perfByTierMap.set(tc, { tournCount: 0, wins: 0, top4: 0, mPlayed: 0, mWon: 0, mLost: 0 });
    }

    const perfByDateMap = new Map<string, { wins: number; top4: number; mPlayed: number; mWon: number; mLost: number }>();

    // Individual player stats for top performers
    const playerPerfMap = new Map<string, {
      tourns: number;
      wins: number;
      top4: number;
      mWon: number;
      mLost: number;
      points: number;
      gameCounts: Map<string, number>;
      lastActive: Date;
    }>();

    let totalTournWins = 0;
    let totalTop4Finishes = 0;
    let totalMatchesWon = 0;
    let totalMatchesLost = 0;

    for (const t of filteredTournaments) {
      const tierCode = this.getTierCode(t);
      const dKey = new Date(t.createdAt).toISOString().split("T")[0]!;

      const gEntry = perfByGameMap.get(t.gameId);
      if (gEntry) gEntry.tournCount++;

      const tEntry = perfByTierMap.get(tierCode);
      if (tEntry) tEntry.tournCount++;

      let dateEntry = perfByDateMap.get(dKey);
      if (!dateEntry) {
        dateEntry = { wins: 0, top4: 0, mPlayed: 0, mWon: 0, mLost: 0 };
        perfByDateMap.set(dKey, dateEntry);
      }

      for (const p of t.players) {
        const wins = p.wins || 0;
        const losses = p.losses || 0;
        const isWin = p.finalRank === 1;
        const isTop4 = p.finalRank && p.finalRank >= 1 && p.finalRank <= 4;

        if (isWin) {
          totalTournWins++;
          if (gEntry) gEntry.wins++;
          if (tEntry) tEntry.wins++;
          dateEntry.wins++;
        }

        if (isTop4) {
          totalTop4Finishes++;
          if (gEntry) gEntry.top4++;
          if (tEntry) tEntry.top4++;
          dateEntry.top4++;
        }

        totalMatchesWon += wins;
        totalMatchesLost += losses;

        if (gEntry) {
          gEntry.mWon += wins;
          gEntry.mLost += losses;
          gEntry.mPlayed += wins + losses;
        }

        if (tEntry) {
          tEntry.mWon += wins;
          tEntry.mLost += losses;
          tEntry.mPlayed += wins + losses;
        }

        dateEntry.mWon += wins;
        dateEntry.mLost += losses;
        dateEntry.mPlayed += wins + losses;

        // Player Perf Aggregation
        let pData = playerPerfMap.get(p.userId);
        if (!pData) {
          pData = {
            tourns: 0,
            wins: 0,
            top4: 0,
            mWon: 0,
            mLost: 0,
            points: 0,
            gameCounts: new Map(),
            lastActive: new Date(t.createdAt),
          };
          playerPerfMap.set(p.userId, pData);
        }

        pData.tourns++;
        if (isWin) pData.wins++;
        if (isTop4) pData.top4++;
        pData.mWon += wins;
        pData.mLost += losses;
        pData.points += p.points || 0;
        pData.gameCounts.set(t.gameId, (pData.gameCounts.get(t.gameId) || 0) + 1);
        const tDate = new Date(t.createdAt);
        if (tDate > pData.lastActive) pData.lastActive = tDate;
      }
    }

    const totalMatchesPlayed = totalMatchesWon + totalMatchesLost;
    const overallWinRate = totalMatchesPlayed > 0 ? Math.round((totalMatchesWon / totalMatchesPlayed) * 1000) / 10 : 0;

    const perfSummary: PlayerPerformanceSummary = {
      tournamentWins: totalTournWins,
      top4Finishes: totalTop4Finishes,
      matchesPlayed: totalMatchesPlayed,
      matchesWon: totalMatchesWon,
      matchesLost: totalMatchesLost,
      winRatePercent: overallWinRate,
    };

    const perfByGame: PlayerPerformanceByGameItem[] = GAME_DEFINITIONS.map((g) => {
      const gEntry = perfByGameMap.get(g.id)!;
      const mPlayed = gEntry.mPlayed;
      const winRate = mPlayed > 0 ? Math.round((gEntry.mWon / mPlayed) * 1000) / 10 : 0;
      return {
        gameId: g.id,
        gameName: g.name,
        tournamentsCount: gEntry.tournCount,
        tournamentWins: gEntry.wins,
        top4Finishes: gEntry.top4,
        matchesPlayed: mPlayed,
        matchesWon: gEntry.mWon,
        matchesLost: gEntry.mLost,
        winRatePercent: winRate,
      };
    });

    const perfByTier: PlayerPerformanceByTierItem[] = tierOrderCodes.map((tc) => {
      const tEntry = perfByTierMap.get(tc)!;
      const mPlayed = tEntry.mPlayed;
      const winRate = mPlayed > 0 ? Math.round((tEntry.mWon / mPlayed) * 1000) / 10 : 0;
      return {
        tierCode: tc,
        tierName: tierNameMap[tc].name,
        entryFee: tierNameMap[tc].entryFee,
        tournamentsCount: tEntry.tournCount,
        tournamentWins: tEntry.wins,
        top4Finishes: tEntry.top4,
        matchesPlayed: mPlayed,
        matchesWon: tEntry.mWon,
        matchesLost: tEntry.mLost,
        winRatePercent: winRate,
      };
    });

    const perfByDate: PlayerPerformanceByDateItem[] = Array.from(perfByDateMap.entries())
      .map(([date, dEntry]) => {
        const mPlayed = dEntry.mPlayed;
        const winRate = mPlayed > 0 ? Math.round((dEntry.mWon / mPlayed) * 1000) / 10 : 0;
        return {
          date,
          label: date,
          tournamentWins: dEntry.wins,
          top4Finishes: dEntry.top4,
          matchesPlayed: mPlayed,
          matchesWon: dEntry.mWon,
          matchesLost: dEntry.mLost,
          winRatePercent: winRate,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const topPerformers: AnonymizedPerformerItem[] = Array.from(playerPerfMap.entries())
      .map(([uId, pData]) => {
        let favGame = "snooker";
        let maxGamePlays = 0;
        for (const [gId, count] of pData.gameCounts.entries()) {
          if (count > maxGamePlays) {
            maxGamePlays = count;
            favGame = gId;
          }
        }
        const mPlayed = pData.mWon + pData.mLost;
        const winRate = mPlayed > 0 ? Math.round((pData.mWon / mPlayed) * 1000) / 10 : 0;
        return {
          maskedId: `Player #${uId.slice(-6)}`,
          tournamentsCount: pData.tourns,
          tournamentWins: pData.wins,
          top4Finishes: pData.top4,
          matchesPlayed: mPlayed,
          matchesWon: pData.mWon,
          matchesLost: pData.mLost,
          winRatePercent: winRate,
          totalPoints: pData.points,
          favoriteGame: GAME_DEFINITIONS.find((g) => g.id === favGame)?.name || favGame,
          lastActiveAt: pData.lastActive.toISOString(),
        };
      })
      .sort((a, b) => b.tournamentWins - a.tournamentWins || b.top4Finishes - a.top4Finishes || b.matchesWon - a.matchesWon || b.totalPoints - a.totalPoints)
      .slice(0, 50);

    const playerPerformance: PlayerPerformanceSection = {
      summary: perfSummary,
      byGame: perfByGame,
      byTier: perfByTier,
      byDate: perfByDate,
      topPerformers,
    };

    // 7e. Win Rate Analytics (Matches Won / Completed Matches * 100 with Draws excluded)
    const winRateByGameMap = new Map<string, { tournCount: number; mWon: number; mLost: number; mDrawn: number }>();
    for (const g of GAME_DEFINITIONS) {
      winRateByGameMap.set(g.id, { tournCount: 0, mWon: 0, mLost: 0, mDrawn: 0 });
    }

    const winRateByTierMap = new Map<TournamentTierCode, { tournCount: number; mWon: number; mLost: number; mDrawn: number }>();
    for (const tc of tierOrderCodes) {
      winRateByTierMap.set(tc, { tournCount: 0, mWon: 0, mLost: 0, mDrawn: 0 });
    }

    const winRateByDateMap = new Map<string, { mWon: number; mLost: number; mDrawn: number }>();

    let totalWinRateMatchesWon = 0;
    let totalWinRateMatchesLost = 0;
    let totalWinRateMatchesDrawn = 0;

    for (const t of filteredTournaments) {
      const tierCode = this.getTierCode(t);
      const dKey = new Date(t.createdAt).toISOString().split("T")[0]!;

      const gEntry = winRateByGameMap.get(t.gameId);
      if (gEntry) gEntry.tournCount++;

      const tEntry = winRateByTierMap.get(tierCode);
      if (tEntry) tEntry.tournCount++;

      let dateEntry = winRateByDateMap.get(dKey);
      if (!dateEntry) {
        dateEntry = { mWon: 0, mLost: 0, mDrawn: 0 };
        winRateByDateMap.set(dKey, dateEntry);
      }

      for (const p of t.players) {
        const wins = p.wins || 0;
        const losses = p.losses || 0;
        totalWinRateMatchesWon += wins;
        totalWinRateMatchesLost += losses;

        if (gEntry) {
          gEntry.mWon += wins;
          gEntry.mLost += losses;
        }
        if (tEntry) {
          tEntry.mWon += wins;
          tEntry.mLost += losses;
        }
        dateEntry.mWon += wins;
        dateEntry.mLost += losses;
      }

      // Check completed rounds for any draws (matches where status is COMPLETED and winnerId is null)
      for (const r of t.rounds) {
        if (r.status === "COMPLETED" && !r.winnerId) {
          totalWinRateMatchesDrawn++;
          if (gEntry) gEntry.mDrawn++;
          if (tEntry) tEntry.mDrawn++;
          dateEntry.mDrawn++;
        }
      }
    }

    const decisiveMatchesTotal = totalWinRateMatchesWon + totalWinRateMatchesLost;
    const completedMatchesTotal = decisiveMatchesTotal + totalWinRateMatchesDrawn;
    const overallWinRateCalculated = decisiveMatchesTotal > 0
      ? Math.round((totalWinRateMatchesWon / decisiveMatchesTotal) * 1000) / 10
      : 0;

    const winRateSummary: WinRateSummary = {
      overallWinRate: overallWinRateCalculated,
      totalCompletedMatches: completedMatchesTotal,
      totalMatchesWon: totalWinRateMatchesWon,
      totalMatchesLost: totalWinRateMatchesLost,
      totalMatchesDrawn: totalWinRateMatchesDrawn,
      decisiveMatches: decisiveMatchesTotal,
    };

    const winRateByGame: WinRateByGameItem[] = GAME_DEFINITIONS.map((g) => {
      const gEntry = winRateByGameMap.get(g.id)!;
      const decisive = gEntry.mWon + gEntry.mLost;
      const completed = decisive + gEntry.mDrawn;
      const winRate = decisive > 0 ? Math.round((gEntry.mWon / decisive) * 1000) / 10 : 0;
      return {
        gameId: g.id,
        gameName: g.name,
        tournamentsCount: gEntry.tournCount,
        completedMatches: completed,
        matchesWon: gEntry.mWon,
        matchesLost: gEntry.mLost,
        matchesDrawn: gEntry.mDrawn,
        winRatePercent: winRate,
      };
    });

    const winRateByTier: WinRateByTierItem[] = tierOrderCodes.map((tc) => {
      const tEntry = winRateByTierMap.get(tc)!;
      const decisive = tEntry.mWon + tEntry.mLost;
      const completed = decisive + tEntry.mDrawn;
      const winRate = decisive > 0 ? Math.round((tEntry.mWon / decisive) * 1000) / 10 : 0;
      return {
        tierCode: tc,
        tierName: tierNameMap[tc].name,
        entryFee: tierNameMap[tc].entryFee,
        tournamentsCount: tEntry.tournCount,
        completedMatches: completed,
        matchesWon: tEntry.mWon,
        matchesLost: tEntry.mLost,
        matchesDrawn: tEntry.mDrawn,
        winRatePercent: winRate,
      };
    });

    const winRateByDate: WinRateByDateItem[] = Array.from(winRateByDateMap.entries())
      .map(([date, dEntry]) => {
        const decisive = dEntry.mWon + dEntry.mLost;
        const completed = decisive + dEntry.mDrawn;
        const winRate = decisive > 0 ? Math.round((dEntry.mWon / decisive) * 1000) / 10 : 0;
        return {
          date,
          label: date,
          completedMatches: completed,
          matchesWon: dEntry.mWon,
          matchesLost: dEntry.mLost,
          matchesDrawn: dEntry.mDrawn,
          winRatePercent: winRate,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const winRateAnalytics: WinRateAnalyticsSection = {
      summary: winRateSummary,
      byGame: winRateByGame,
      byTier: winRateByTier,
      byDate: winRateByDate,
    };

    // 7f. Game-Specific Performance Analytics across all 10 engine profiles
    const GAME_ENGINE_METRIC_CONFIGS: Record<string, { scoreUnit: string; resultFormat: string }> = {
      "snake-ladder": { scoreUnit: "Board Points / Squares", resultFormat: "Rank / Board Position" },
      "ludo": { scoreUnit: "Tokens Home / Points", resultFormat: "Finished Tokens / Rank" },
      "chess": { scoreUnit: "Match Points / Rating", resultFormat: "Wins / Losses / Draws" },
      "fruit-ninja": { scoreUnit: "Sliced Fruit Score", resultFormat: "Total Score / Combos" },
      "bubble-shooter": { scoreUnit: "Bubbles Cleared / Points", resultFormat: "Points Scored / Clear Rate" },
      "table-tennis": { scoreUnit: "Set Points / Rallies", resultFormat: "Sets Won / Points" },
      "snake-vs-worms": { scoreUnit: "Mass / Length Score", resultFormat: "Length Score / Mass" },
      "carrom": { scoreUnit: "Board Points / Coins", resultFormat: "Points / Queen Covers" },
      "snooker": { scoreUnit: "Frame Points / Breaks", resultFormat: "Frame Score / Breaks" },
    };

    const gamePointsMap = new Map<string, { totalPoints: number; highestScore: number }>();
    for (const g of GAME_DEFINITIONS) {
      gamePointsMap.set(g.id, { totalPoints: 0, highestScore: 0 });
    }

    for (const t of filteredTournaments) {
      const gPoints = gamePointsMap.get(t.gameId);
      if (gPoints) {
        for (const p of t.players) {
          const pt = p.points || 0;
          gPoints.totalPoints += pt;
          if (pt > gPoints.highestScore) gPoints.highestScore = pt;
        }
      }
    }

    const gameSpecificPerformanceItems: GameSpecificPerformanceItem[] = GAME_DEFINITIONS.map((g) => {
      const gEntry = winRateByGameMap.get(g.id)!;
      const gPoints = gamePointsMap.get(g.id) || { totalPoints: 0, highestScore: 0 };
      const decisive = gEntry.mWon + gEntry.mLost;
      const completed = decisive + gEntry.mDrawn;
      const winRate = decisive > 0 ? Math.round((gEntry.mWon / decisive) * 1000) / 10 : 0;
      const avgScore = completed > 0 ? Math.round((gPoints.totalPoints / completed) * 10) / 10 : 0;
      const engineConfig = GAME_ENGINE_METRIC_CONFIGS[g.id] || { scoreUnit: "Points", resultFormat: "Wins / Losses" };

      return {
        gameId: g.id,
        gameName: g.name,
        icon: g.icon,
        category: g.category,
        mode: g.mode,
        scoreUnit: engineConfig.scoreUnit,
        resultFormat: engineConfig.resultFormat,
        tournamentsCount: gEntry.tournCount,
        completedMatches: completed,
        matchesWon: gEntry.mWon,
        matchesLost: gEntry.mLost,
        matchesDrawn: gEntry.mDrawn,
        winRatePercent: winRate,
        totalPointsScored: gPoints.totalPoints,
        avgScorePerMatch: avgScore,
        highestMatchScore: gPoints.highestScore,
      };
    });

    const gameSpecificPerformance: GameSpecificPerformanceSection = {
      games: gameSpecificPerformanceItems,
    };

    // 8. Notification & Email Delivery Analytics
    const emailLogs = TournamentEmailService.getEmailDeliveryRecords();
    const emailsSent = emailLogs.filter((e) => e.status === "SENT").length;
    const emailsFailed = emailLogs.filter((e) => e.status === "FAILED").length;
    const emailsPending = emailLogs.filter((e) => e.status === "PENDING").length;

    // Fetch persisted app notifications for TOURNAMENT type in time range
    const appNotifs = await prisma.appNotification.findMany({
      where: {
        type: "TOURNAMENT",
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const inAppSent = appNotifs.length > 0 ? appNotifs.length : emailsSent;
    const socketSent = inAppSent;

    const notifications: TournamentNotificationAnalyticsSummary = {
      emailsSent,
      emailsFailed,
      emailsPending,
      inAppNotificationsSent: inAppSent,
      pendingNotifications: emailsPending,
    };

    // Build tournament lookup map for fast association
    const tournLookup = new Map<string, { title: string; gameId: string; tierCode: TournamentTierCode }>();
    for (const t of tournaments) {
      tournLookup.set(t.id, {
        title: t.title,
        gameId: t.gameId,
        tierCode: this.getTierCode(t),
      });
    }

    const notificationItems: NotificationAnalyticsItem[] = [];

    // Helper to mask emails for privacy
    const maskRecipientEmail = (em?: string | null): string => {
      if (!em) return "u***@domain";
      const parts = em.split("@");
      if (parts.length !== 2) return "u***@domain";
      const userPart = parts[0]!;
      const domainPart = parts[1]!;
      const masked = userPart.length > 2 ? `${userPart.slice(0, 2)}***` : `${userPart.slice(0, 1)}***`;
      return `${masked}@${domainPart}`;
    };

    // 1. Email items
    for (const log of emailLogs) {
      const tourn = tournLookup.get(log.tournamentId) || {
        title: `Tournament #${log.tournamentId.slice(-6)}`,
        gameId: "snake-ladder",
        tierCode: "basic" as TournamentTierCode,
      };

      const itemStatus: NotificationDeliveryStatus =
        log.status === "SENT" ? "SENT" : log.status === "FAILED" ? "FAILED" : "PENDING";

      notificationItems.push({
        id: log.notificationId,
        tournamentId: log.tournamentId,
        tournamentTitle: tourn.title,
        gameId: tourn.gameId,
        tierCode: tourn.tierCode,
        channel: "EMAIL",
        eventType: log.eventType,
        recipientMasked: maskRecipientEmail(log.email),
        status: itemStatus,
        sentAt: log.sentAt ? log.sentAt.toISOString() : null,
        createdAt: log.createdAt.toISOString(),
        errorReason: log.error || null,
      });
    }

    // 2. In-App Notification items
    for (const an of appNotifs) {
      const rawData = an.data as Record<string, any> | null;
      const tId = rawData?.tournamentId || an.referenceId || "t-general";
      const tourn = tournLookup.get(tId) || {
        title: `Tournament #${tId.slice(-6)}`,
        gameId: "snake-ladder",
        tierCode: "basic" as TournamentTierCode,
      };

      notificationItems.push({
        id: an.id,
        tournamentId: tId,
        tournamentTitle: tourn.title,
        gameId: tourn.gameId,
        tierCode: tourn.tierCode,
        channel: "IN_APP",
        eventType: an.tournamentEventType || "IN_APP_ALERT",
        recipientMasked: `Player #${an.userId.slice(-6)}`,
        status: "SENT",
        sentAt: an.createdAt.toISOString(),
        createdAt: an.createdAt.toISOString(),
      });
    }

    // Sort all records by createdAt desc
    notificationItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Channel Aggregation
    const byChannel: Record<NotificationChannelType, { sent: number; pending: number; failed: number; total: number }> = {
      EMAIL: { sent: emailsSent, pending: emailsPending, failed: emailsFailed, total: emailsSent + emailsPending + emailsFailed },
      IN_APP: { sent: inAppSent, pending: 0, failed: 0, total: inAppSent },
      SOCKET: { sent: socketSent, pending: 0, failed: 0, total: socketSent },
    };

    // By Game Aggregation
    const notifGameMap = new Map<string, NotificationByGameItem>();
    for (const g of GAME_DEFINITIONS) {
      notifGameMap.set(g.id, {
        gameId: g.id,
        gameName: g.name,
        emailsSent: 0,
        emailsFailed: 0,
        inAppSent: 0,
        socketSent: 0,
        pending: 0,
        total: 0,
      });
    }

    // By Tier Aggregation
    const notifTierMap = new Map<TournamentTierCode, NotificationByTierItem>();
    const allTierCodes: TournamentTierCode[] = ["mini", "basic", "standard", "premium", "pro"];
    const tierDisplayNames: Record<TournamentTierCode, string> = {
      mini: "Mini",
      basic: "Basic",
      standard: "Standard",
      premium: "Premium",
      pro: "Pro",
    };
    for (const tc of allTierCodes) {
      notifTierMap.set(tc, {
        tierCode: tc,
        tierName: tierDisplayNames[tc]!,
        emailsSent: 0,
        emailsFailed: 0,
        inAppSent: 0,
        socketSent: 0,
        pending: 0,
        total: 0,
      });
    }

    // By Date Aggregation
    const notifDateMap = new Map<string, NotificationByDateItem>();

    for (const item of notificationItems) {
      // By Game
      const gEntry = notifGameMap.get(item.gameId);
      if (gEntry) {
        if (item.channel === "EMAIL") {
          if (item.status === "SENT") gEntry.emailsSent++;
          else if (item.status === "FAILED") gEntry.emailsFailed++;
          else if (item.status === "PENDING") gEntry.pending++;
        } else if (item.channel === "IN_APP") {
          gEntry.inAppSent++;
        } else if (item.channel === "SOCKET") {
          gEntry.socketSent++;
        }
        gEntry.total++;
      }

      // By Tier
      const tEntry = notifTierMap.get(item.tierCode);
      if (tEntry) {
        if (item.channel === "EMAIL") {
          if (item.status === "SENT") tEntry.emailsSent++;
          else if (item.status === "FAILED") tEntry.emailsFailed++;
          else if (item.status === "PENDING") tEntry.pending++;
        } else if (item.channel === "IN_APP") {
          tEntry.inAppSent++;
        } else if (item.channel === "SOCKET") {
          tEntry.socketSent++;
        }
        tEntry.total++;
      }

      // By Date
      const dKey = item.createdAt.split("T")[0]!;
      let dEntry = notifDateMap.get(dKey);
      if (!dEntry) {
        dEntry = {
          date: dKey,
          label: dKey,
          emailsSent: 0,
          emailsFailed: 0,
          inAppSent: 0,
          socketSent: 0,
          pending: 0,
          total: 0,
        };
        notifDateMap.set(dKey, dEntry);
      }
      if (item.channel === "EMAIL") {
        if (item.status === "SENT") dEntry.emailsSent++;
        else if (item.status === "FAILED") dEntry.emailsFailed++;
        else if (item.status === "PENDING") dEntry.pending++;
      } else if (item.channel === "IN_APP") {
        dEntry.inAppSent++;
      } else if (item.channel === "SOCKET") {
        dEntry.socketSent++;
      }
      dEntry.total++;
    }

    const notificationAnalytics: NotificationAnalyticsSection = {
      summary: {
        emailsSent,
        emailsFailed,
        inAppNotificationsSent: inAppSent,
        socketNotificationsSent: socketSent,
        pendingNotifications: emailsPending,
        totalNotifications: emailsSent + emailsFailed + emailsPending + inAppSent + socketSent,
      },
      byChannel,
      byGame: Array.from(notifGameMap.values()),
      byTier: Array.from(notifTierMap.values()),
      byDate: Array.from(notifDateMap.values()),
      records: notificationItems.slice(0, 100),
    };

    // 9. Operational Health Check
    const health = await this.getTournamentHealthOverview();

    // 10. Historical Daily Trends
    const dayMap = new Map<string, { date: string; label: string; count: number; regs: number; comp: number; entry: number; prize: number }>();
    for (const t of filteredTournaments) {
      const dStr = new Date(t.createdAt).toISOString().split("T")[0]!;
      let d = dayMap.get(dStr);
      if (!d) {
        d = { date: dStr, label: dStr, count: 0, regs: 0, comp: 0, entry: 0, prize: 0 };
        dayMap.set(dStr, d);
      }
      d.count++;
      d.regs += t.players.length;
      d.entry += t.entryFee * t.players.length;
      if (t.status === "COMPLETED" || t.status === "SETTLED") d.comp++;
      for (const p of t.prizes) {
        if (p.status === "PAID") d.prize += p.amount;
      }
    }

    const trends: TournamentTrendPoint[] = Array.from(dayMap.values()).map((d) => ({
      date: d.date,
      label: d.label,
      tournamentVolume: d.count,
      registrations: d.regs,
      completionRate: d.count > 0 ? Math.round((d.comp / d.count) * 100) : 0,
      entryCollection: d.entry,
      prizeDistribution: d.prize,
    }));

    // 11. Game × Tier 10×5 Heatmap Matrix
    const gameTierMatrix: Record<string, Record<TournamentTierCode, { count: number; fillRate: number }>> = {};
    for (const g of GAME_DEFINITIONS) {
      gameTierMatrix[g.id] = {
        mini: { count: 0, fillRate: 0 },
        basic: { count: 0, fillRate: 0 },
        standard: { count: 0, fillRate: 0 },
        premium: { count: 0, fillRate: 0 },
        pro: { count: 0, fillRate: 0 },
      };
    }

    for (const t of filteredTournaments) {
      const tier = this.getTierCode(t);
      if (gameTierMatrix[t.gameId]?.[tier]) {
        gameTierMatrix[t.gameId]![tier].count++;
        const currentFill = (t.players.length / t.maxPlayers) * 100;
        gameTierMatrix[t.gameId]![tier].fillRate = Math.round(currentFill);
      }
    }

    const response: TournamentAnalyticsResponse = {
      timeFilter: filter,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      overview,
      prizeDistribution,
      refundAnalytics,
      settlementAnalytics,
      notificationAnalytics,
      playerAnalytics,
      topParticipation,
      playerPerformance,
      winRateAnalytics,
      gameSpecificPerformance,
      tierPerformanceTrends,
      games,
      tiers,
      hourlyPerformance,
      playerCohort,
      notifications,
      health,
      trends,
      gameTierMatrix,
      validation: await TournamentValidationService.validateTournamentAnalytics(params),
    };

    TournamentAnalyticsCache.set(cacheKey, response, "FULL_SUMMARY");
    return response;
  }

  /**
   * Evaluates real-time health across stuck tournaments, stuck matches, settlements, and scheduler.
   */
  static async getTournamentHealthOverview(): Promise<TournamentHealthSummary> {
    const cacheKey = TournamentAnalyticsCache.buildKey("HEALTH", {});
    const cached = TournamentAnalyticsCache.get<TournamentHealthSummary>(cacheKey);
    if (cached) {
      return cached;
    }

    const now = new Date();
    const stuckTournaments: StuckTournamentItem[] = [];
    const stuckMatches: StuckMatchItem[] = [];
    const reviewItems: TournamentReviewItem[] = [];

    // Query active and recent tournaments (bounded to latest 100 relevant tournaments for performance)
    const tournaments = await prisma.tournament.findMany({
      where: {
        status: { in: ["IN_PROGRESS", "LIVE", "STARTING", "SETTLING", "REGISTRATION_OPEN", "DRAFT", "SETTLED", "COMPLETED"] },
      },
      include: {
        rounds: {
          select: { id: true, roundNumber: true, matchNumber: true, status: true, matchId: true, scheduledAt: true, playerAId: true, playerBId: true, winnerId: true, completedAt: true },
        },
        prizes: {
          select: { id: true, status: true, amount: true, paidAt: true },
        },
        _count: {
          select: { players: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    let healthyTournamentsCount = 0;
    let attentionTournamentsCount = 0;
    let criticalTournamentsCount = 0;
    let failedMatchCreationCount = 0;

    for (const t of tournaments) {
      const elapsedMinutes = Math.round((now.getTime() - new Date(t.startTime).getTime()) / 60000);
      const tier = this.getTierCode(t);
      let severity: "HEALTHY" | "ATTENTION" | "CRITICAL" = "HEALTHY";
      let reviewReason = "";
      let badgeLabel = "";
      let tFailedMatchCount = 0;
      const tFailedSettlementCount = t.prizes.filter((p) => p.status === "FAILED").length;

      // Determine current round representation
      let currentRoundStr = "N/A";
      const activeRounds = t.rounds.filter((r) => r.status === "IN_PROGRESS" || r.status === "READY");
      if (activeRounds.length > 0) {
        const maxActiveRound = Math.max(...activeRounds.map((r) => r.roundNumber));
        currentRoundStr = `Round ${maxActiveRound}`;
      } else if (t.rounds.length > 0) {
        const maxRound = Math.max(...t.rounds.map((r) => r.roundNumber));
        currentRoundStr = `Round ${maxRound}`;
      }

      // Calculate last activity time
      let lastActivityDate = t.createdAt;
      for (const r of t.rounds) {
        if (r.scheduledAt && r.scheduledAt > lastActivityDate) lastActivityDate = r.scheduledAt;
      }
      for (const p of t.prizes) {
        if (p.paidAt && p.paidAt > lastActivityDate) lastActivityDate = p.paidAt;
      }
      const lastActivityTime = lastActivityDate.toISOString();

      let stuckItem: StuckTournamentItem | null = null;

      // =========================================================================
      // 4-State Automatic Stuck Detection
      // =========================================================================
      // 1. SETTLEMENT_PROCESSING (operational threshold: 10m)
      if (t.status === "SETTLING" && elapsedMinutes > 10) {
        severity = "CRITICAL";
        reviewReason = `Settlement processing delayed for ${elapsedMinutes} mins (threshold: 10m)`;
        badgeLabel = "NEEDS_REVIEW (Settlement Delayed)";
        stuckItem = {
          tournamentId: t.id,
          title: t.title,
          gameId: t.gameId,
          tierCode: tier,
          currentState: "SETTLEMENT_PROCESSING",
          currentRound: currentRoundStr !== "N/A" ? currentRoundStr : "Settlement",
          timeSpentInStateMinutes: elapsedMinutes,
          thresholdMinutes: 10,
          lastActivityTime,
          status: t.status,
          reviewStatus: "NEEDS_REVIEW",
          reason: reviewReason,
          createdAt: t.createdAt.toISOString(),
        };
      }
      // 2. BRACKET_GENERATING (operational threshold: 5m)
      else if ((t.status === "STARTING" || (t.status === "REGISTRATION_CLOSED" && t.rounds.length === 0)) && elapsedMinutes > 5) {
        severity = "CRITICAL";
        reviewReason = `Bracket generation delayed for ${elapsedMinutes} mins (threshold: 5m)`;
        badgeLabel = "NEEDS_REVIEW (Bracket Generation)";
        stuckItem = {
          tournamentId: t.id,
          title: t.title,
          gameId: t.gameId,
          tierCode: tier,
          currentState: "BRACKET_GENERATING",
          currentRound: "Bracket Generation",
          timeSpentInStateMinutes: elapsedMinutes,
          thresholdMinutes: 5,
          lastActivityTime,
          status: t.status,
          reviewStatus: "NEEDS_REVIEW",
          reason: reviewReason,
          createdAt: t.createdAt.toISOString(),
        };
      }
      // 3. ROUND_READY (operational threshold: 5m)
      else if (activeRounds.some((r) => r.status === "READY") && elapsedMinutes > 5) {
        const readyRounds = activeRounds.filter((r) => r.status === "READY");
        const readyElapsed = readyRounds[0]?.scheduledAt
          ? Math.round((now.getTime() - new Date(readyRounds[0].scheduledAt).getTime()) / 60000)
          : elapsedMinutes;

        if (readyElapsed > 5) {
          severity = "ATTENTION";
          reviewReason = `Round ready for ${readyElapsed} mins without match start (threshold: 5m)`;
          badgeLabel = "NEEDS_REVIEW (Round Ready Delay)";
          stuckItem = {
            tournamentId: t.id,
            title: t.title,
            gameId: t.gameId,
            tierCode: tier,
            currentState: "ROUND_READY",
            currentRound: `Round ${readyRounds[0]?.roundNumber || 1}`,
            timeSpentInStateMinutes: readyElapsed,
            thresholdMinutes: 5,
            lastActivityTime,
            status: t.status,
            reviewStatus: "NEEDS_REVIEW",
            reason: reviewReason,
            createdAt: t.createdAt.toISOString(),
          };
        }
      }
      // 4. IN_PROGRESS (operational threshold: 60m)
      else if ((t.status === "IN_PROGRESS" || t.status === "LIVE") && elapsedMinutes > 60) {
        severity = "CRITICAL";
        reviewReason = `Tournament in progress for ${elapsedMinutes} mins (threshold: 60m)`;
        badgeLabel = "NEEDS_REVIEW (Stuck In Progress)";
        stuckItem = {
          tournamentId: t.id,
          title: t.title,
          gameId: t.gameId,
          tierCode: tier,
          currentState: "IN_PROGRESS",
          currentRound: currentRoundStr !== "N/A" ? currentRoundStr : "In Progress",
          timeSpentInStateMinutes: elapsedMinutes,
          thresholdMinutes: 60,
          lastActivityTime,
          status: t.status,
          reviewStatus: "NEEDS_REVIEW",
          reason: reviewReason,
          createdAt: t.createdAt.toISOString(),
        };
      }
      // 5. General fallback: start time passed without starting
      else if ((t.status === "REGISTRATION_OPEN" || t.status === "DRAFT") && elapsedMinutes > 15) {
        severity = "CRITICAL";
        reviewReason = `Scheduled start time exceeded by ${elapsedMinutes} mins without starting`;
        badgeLabel = "NEEDS_REVIEW (Start Delayed)";
      }
      // 6. Failed settlements
      else if (tFailedSettlementCount > 0) {
        severity = "CRITICAL";
        reviewReason = `${tFailedSettlementCount} prize settlements failed for this tournament`;
        badgeLabel = "NEEDS_REVIEW (Settlement Failed)";
      }

      if (stuckItem) {
        stuckTournaments.push(stuckItem);
      }

      // Check rounds for stuck matches & failed match creation
      for (const r of t.rounds) {
        const matchElapsed = r.scheduledAt
          ? Math.round((now.getTime() - new Date(r.scheduledAt).getTime()) / 60000)
          : elapsedMinutes;

        const playerAName = r.playerAId ? `Player #${r.playerAId.slice(-6)}` : "TBD";
        const playerBName = r.playerBId ? `Player #${r.playerBId.slice(-6)}` : "TBD";
        const startedAt = r.scheduledAt ? r.scheduledAt.toISOString() : t.startTime.toISOString();

        // 1. Missing match creation
        if ((r.status === "READY" || r.status === "IN_PROGRESS") && !r.matchId && matchElapsed > 5) {
          tFailedMatchCount++;
          failedMatchCreationCount++;
          if (severity !== "CRITICAL") {
            severity = "CRITICAL";
            reviewReason = `Failed match creation on Round ${r.roundNumber} Match ${r.matchNumber}`;
            badgeLabel = "NEEDS_REVIEW (Match Creation Failed)";
          }
        }

        // 2. READY state stuck (threshold: 5m)
        if (r.status === "READY" && matchElapsed > 5) {
          stuckMatches.push({
            matchId: r.matchId || r.id,
            tournamentId: t.id,
            tournamentTitle: t.title,
            gameId: t.gameId,
            tierCode: tier,
            roundNumber: r.roundNumber,
            matchNumber: r.matchNumber,
            matchStatus: "READY",
            playerAId: r.playerAId,
            playerBId: r.playerBId,
            playerAName,
            playerBName,
            startedAt,
            elapsedMinutes: matchElapsed,
            thresholdMinutes: 5,
            reviewStatus: "NEEDS_REVIEW",
            reason: `Match in READY state for ${matchElapsed} mins without starting (threshold: 5m)`,
            status: r.status,
            scheduledAt: r.scheduledAt?.toISOString() || null,
          });

          if (severity === "HEALTHY") {
            severity = "ATTENTION";
            reviewReason = `Round ${r.roundNumber} match delayed in READY state (${matchElapsed}m)`;
            badgeLabel = "NEEDS_REVIEW (Ready Delay)";
          }
        }
        // 3. LIVE state stuck (threshold: 10m maximum game duration)
        else if (r.status === "IN_PROGRESS" && matchElapsed > 10) {
          stuckMatches.push({
            matchId: r.matchId || r.id,
            tournamentId: t.id,
            tournamentTitle: t.title,
            gameId: t.gameId,
            tierCode: tier,
            roundNumber: r.roundNumber,
            matchNumber: r.matchNumber,
            matchStatus: "LIVE",
            playerAId: r.playerAId,
            playerBId: r.playerBId,
            playerAName,
            playerBName,
            startedAt,
            elapsedMinutes: matchElapsed,
            thresholdMinutes: 10,
            reviewStatus: "NEEDS_REVIEW",
            reason: `Live match elapsed ${matchElapsed} mins (exceeded 10-minute maximum game duration)`,
            status: r.status,
            scheduledAt: r.scheduledAt?.toISOString() || null,
          });

          if (severity === "HEALTHY") {
            severity = "ATTENTION";
            reviewReason = `Match in Round ${r.roundNumber} exceeded 10-min limit (${matchElapsed} mins)`;
            badgeLabel = "NEEDS_REVIEW (Stuck Match)";
          }
        }
        // 4. PROCESSING state stuck (threshold: 5m)
        else if (r.completedAt && !r.winnerId && matchElapsed > 5) {
          stuckMatches.push({
            matchId: r.matchId || r.id,
            tournamentId: t.id,
            tournamentTitle: t.title,
            gameId: t.gameId,
            tierCode: tier,
            roundNumber: r.roundNumber,
            matchNumber: r.matchNumber,
            matchStatus: "PROCESSING",
            playerAId: r.playerAId,
            playerBId: r.playerBId,
            playerAName,
            playerBName,
            startedAt,
            elapsedMinutes: matchElapsed,
            thresholdMinutes: 5,
            reviewStatus: "NEEDS_REVIEW",
            reason: `Match result processing delayed for ${matchElapsed} mins (threshold: 5m)`,
            status: r.status,
            scheduledAt: r.scheduledAt?.toISOString() || null,
          });

          if (severity === "HEALTHY") {
            severity = "ATTENTION";
            reviewReason = `Match in Round ${r.roundNumber} result processing delayed (${matchElapsed} mins)`;
            badgeLabel = "NEEDS_REVIEW (Processing Delay)";
          }
        }
      }

      if (severity === "CRITICAL") {
        criticalTournamentsCount++;
        reviewItems.push({
          id: `rev-${t.id}`,
          tournamentId: t.id,
          title: t.title,
          gameId: t.gameId,
          tierCode: tier,
          status: t.status,
          severity: "CRITICAL",
          elapsedMinutes: Math.max(0, elapsedMinutes),
          reviewReason,
          badgeLabel,
          failedMatchCreationCount: tFailedMatchCount,
          failedSettlementsCount: tFailedSettlementCount,
          failedNotificationsCount: 0,
          updatedAt: t.createdAt.toISOString(),
        });
      } else if (severity === "ATTENTION") {
        attentionTournamentsCount++;
        reviewItems.push({
          id: `rev-${t.id}`,
          tournamentId: t.id,
          title: t.title,
          gameId: t.gameId,
          tierCode: tier,
          status: t.status,
          severity: "ATTENTION",
          elapsedMinutes: Math.max(0, elapsedMinutes),
          reviewReason,
          badgeLabel,
          failedMatchCreationCount: tFailedMatchCount,
          failedSettlementsCount: tFailedSettlementCount,
          failedNotificationsCount: 0,
          updatedAt: t.createdAt.toISOString(),
        });
      } else {
        healthyTournamentsCount++;
      }
    }

    // 2. Failed Settlements total
    const failedSettlementsCount = await prisma.tournamentPrize.count({
      where: { status: "FAILED" },
    });

    // 3. Failed Notifications
    const emailLogs = TournamentEmailService.getEmailDeliveryRecords();
    const failedNotificationsCount = emailLogs.filter((e) => e.status === "FAILED").length;

    // 4. Scheduler Health & Missed Run Detection (Hourly Tournaments)
    const isPaused = isHourlySchedulerPaused();
    const schedulerInfo = await getHourlySchedulerInfo();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const todayCreatedCount = await prisma.tournamentTierScheduleLog.count({
      where: { createdAt: { gte: todayStart } },
    });

    // Find the latest scheduled slot batch
    const latestScheduleLog = await prisma.tournamentTierScheduleLog.findFirst({
      orderBy: { createdAt: "desc" },
    });

    let tournamentsCreatedInLastRun = 0;
    let lastSuccessfulRunAt: string | null = null;
    let isMissedRunDetected = false;
    let schedulerReviewReason: string | null = null;

    if (latestScheduleLog) {
      lastSuccessfulRunAt = latestScheduleLog.createdAt.toISOString();
      tournamentsCreatedInLastRun = await prisma.tournamentTierScheduleLog.count({
        where: { slotHour: latestScheduleLog.slotHour },
      });

      // Detect missed hourly run (>75 minutes since last run when not paused)
      const minutesSinceLastRun = Math.round((now.getTime() - latestScheduleLog.createdAt.getTime()) / 60000);
      if (minutesSinceLastRun > 75 && !isPaused) {
        isMissedRunDetected = true;
        schedulerReviewReason = `Expected hourly scheduler run was missed (${minutesSinceLastRun}m since last run, interval: 60m)`;
      }
    }

    const failedJobsToday = 0;
    const retryCount = 0;

    let schedulerStatus: TournamentSchedulerStatus = "RUNNING";
    if (isPaused) {
      schedulerStatus = "STOPPED";
    } else if (failedJobsToday > 0 || isMissedRunDetected) {
      schedulerStatus = "ERROR";
    }

    const schedulerFailuresCount = (isPaused ? 1 : 0) + (isMissedRunDetected ? 1 : 0) + failedJobsToday;
    const schedulerHealth = {
      status: schedulerStatus,
      isRunning: !isPaused && schedulerStatus === "RUNNING",
      isPaused,
      lastSuccessfulRunAt,
      nextScheduledRunAt: schedulerInfo.nextRunAt,
      tournamentsCreatedInLastRun,
      createdTournamentsToday: todayCreatedCount,
      failedJobsToday,
      retryCount,
      intervalMinutes: 60,
      isMissedRunDetected,
      reviewStatus: isMissedRunDetected ? ("NEEDS_REVIEW" as const) : ("HEALTHY" as const),
      reviewReason: schedulerReviewReason,
      lastExecutionAt: lastSuccessfulRunAt,
      nextScheduledExecutionAt: schedulerInfo.nextRunAt,
    };

    // 5. Determine Overall Status
    let overallStatus: "HEALTHY" | "ATTENTION" | "CRITICAL" = "HEALTHY";
    if (criticalTournamentsCount > 0 || stuckTournaments.length > 0 || failedSettlementsCount > 0 || isPaused || isMissedRunDetected) {
      overallStatus = "CRITICAL";
    } else if (attentionTournamentsCount > 0 || stuckMatches.length > 0 || failedNotificationsCount > 0) {
      overallStatus = "ATTENTION";
    }

    const healthSummary: TournamentHealthSummary = {
      overallStatus,
      healthyTournamentsCount,
      attentionTournamentsCount,
      criticalTournamentsCount,
      stuckTournamentsCount: stuckTournaments.length,
      stuckMatchesCount: stuckMatches.length,
      failedMatchCreationCount,
      failedSettlementsCount,
      failedNotificationsCount,
      schedulerFailuresCount,
      stuckTournaments,
      stuckMatches,
      reviewItems,
      schedulerHealth,
      checkedAt: now.toISOString(),
    };

    TournamentAnalyticsCache.set(cacheKey, healthSummary, "HEALTH");
    return healthSummary;
  }

  /**
   * Generates formatted, filtered operational report for download and viewing.
   */
  static async generateReport(
    adminId: string,
    params: TournamentReportRequest,
    context?: { ip?: string | null; userAgent?: string | null; exportStatus?: "PREVIEW" | "EXPORTED_CSV" | "SUCCESS" | "FAILED" }
  ): Promise<TournamentReportResult> {
    const { startDate, endDate, label: dateRangeLabel } = this.getDateRange(params);
    const reportType = params.reportType;
    const filterGame = params.gameId && params.gameId.toUpperCase() !== "ALL" ? params.gameId : undefined;
    const filterTier = params.tier && params.tier.toUpperCase() !== "ALL" ? params.tier.toLowerCase() : undefined;
    const filterStatus = params.status && params.status.toUpperCase() !== "ALL" ? params.status.toUpperCase() : undefined;

    let headers: string[] = [];
    let rows: Array<Record<string, any>> = [];

    if (reportType === "TOURNAMENT") {
      headers = [
        "Tournament ID",
        "Title",
        "Game ID",
        "Game Name",
        "Tier",
        "Format",
        "Status",
        "Start Time",
        "End Time",
        "Registration Starts At",
        "Registration Ends At",
        "Registered Players",
        "Min Players",
        "Max Players",
        "Entry Fee",
        "Prize Pool",
        "Gross Pool",
        "Created At",
        "Settled At",
      ];

      const tournaments = await prisma.tournament.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          ...(filterGame ? { gameId: filterGame } : {}),
          ...(filterStatus ? { status: filterStatus as any } : {}),
        },
        include: { _count: { select: { players: true } } },
        orderBy: { createdAt: "desc" },
        take: 5000,
      });

      const filtered = filterTier
        ? tournaments.filter((t) => this.getTierCode(t) === filterTier)
        : tournaments;

      rows = filtered.map((t) => {
        const tierCode = this.getTierCode(t);
        return {
          "Tournament ID": t.id,
          "Title": t.title,
          "Game ID": t.gameId,
          "Game Name": this.getGameName(t.gameId),
          "Tier": this.getTierName(tierCode),
          "Format": t.format,
          "Status": t.status,
          "Start Time": t.startTime.toISOString(),
          "End Time": t.endTime ? t.endTime.toISOString() : "—",
          "Registration Starts At": t.registrationStartsAt ? t.registrationStartsAt.toISOString() : "—",
          "Registration Ends At": t.registrationEndsAt ? t.registrationEndsAt.toISOString() : "—",
          "Registered Players": t._count.players,
          "Min Players": t.minPlayers,
          "Max Players": t.maxPlayers,
          "Entry Fee": t.entryFee,
          "Prize Pool": t.prizePool,
          "Gross Pool": t.grossPool,
          "Created At": t.createdAt.toISOString(),
          "Settled At": t.settledAt ? t.settledAt.toISOString() : "—",
        };
      });
    } else if (reportType === "FINANCIAL") {
      headers = [
        "Tournament ID",
        "Title",
        "Game ID",
        "Game Name",
        "Tier",
        "Status",
        "Entry Fee",
        "Registered Players",
        "Total Collected",
        "Configured Prize Pool",
        "Prizes Paid",
        "Pending Settlements Amount",
        "Failed Settlements Amount",
        "Refunds Processed",
        "Platform Margin",
        "Settlement Status",
        "Start Time",
        "Settled At",
      ];

      const tournaments = await prisma.tournament.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          ...(filterGame ? { gameId: filterGame } : {}),
          ...(filterStatus ? { status: filterStatus as any } : {}),
        },
        include: {
          players: { select: { id: true, userId: true } },
          prizes: {
            select: {
              id: true,
              amount: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 5000,
      });

      const filtered = filterTier
        ? tournaments.filter((t) => this.getTierCode(t) === filterTier)
        : tournaments;

      rows = filtered.map((t) => {
        const tierCode = this.getTierCode(t);
        const playerCount = t.players.length;
        const totalCollected = t.entryFee * playerCount;
        const prizesPaid = t.prizes
          .filter((p) => p.status === "PAID")
          .reduce((sum, p) => sum + p.amount, 0);
        const pendingAmount = t.prizes
          .filter((p) => p.status === "PENDING" || p.status === "PROCESSING")
          .reduce((sum, p) => sum + p.amount, 0);
        const failedAmount = t.prizes
          .filter((p) => p.status === "FAILED")
          .reduce((sum, p) => sum + p.amount, 0);
        const refundsProcessed = t.status === "CANCELLED" ? totalCollected : 0;
        const platformMargin = Math.max(0, totalCollected - prizesPaid - refundsProcessed);

        let settlementStatus = "NOT_APPLICABLE";
        if (t.status === "CANCELLED") {
          settlementStatus = "REFUNDED";
        } else if (t.prizes.length > 0) {
          if (t.prizes.every((p) => p.status === "PAID")) {
            settlementStatus = "SETTLED";
          } else if (t.prizes.some((p) => p.status === "FAILED")) {
            settlementStatus = "FAILED";
          } else if (t.prizes.some((p) => p.status === "PENDING" || p.status === "PROCESSING")) {
            settlementStatus = "PENDING";
          }
        }

        return {
          "Tournament ID": t.id,
          "Title": t.title,
          "Game ID": t.gameId,
          "Game Name": this.getGameName(t.gameId),
          "Tier": this.getTierName(tierCode),
          "Status": t.status,
          "Entry Fee": t.entryFee,
          "Registered Players": playerCount,
          "Total Collected": totalCollected,
          "Configured Prize Pool": t.prizePool,
          "Prizes Paid": prizesPaid,
          "Pending Settlements Amount": pendingAmount,
          "Failed Settlements Amount": failedAmount,
          "Refunds Processed": refundsProcessed,
          "Platform Margin": platformMargin,
          "Settlement Status": settlementStatus,
          "Start Time": t.startTime.toISOString(),
          "Settled At": t.settledAt ? t.settledAt.toISOString() : "—",
        };
      });
    } else if (reportType === "PLAYER_PARTICIPATION") {
      headers = [
        "User ID",
        "Username",
        "Display Name",
        "Tournaments Played",
        "Tournaments Won",
        "Top 4 Finishes",
        "Matches Played",
        "Matches Won",
        "Matches Lost",
        "Win Rate %",
        "Total Entry Fees Paid",
        "Total Prizes Won",
        "Net Profit / Loss",
      ];

      const tournaments = await prisma.tournament.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
          ...(filterGame ? { gameId: filterGame } : {}),
          ...(filterStatus ? { status: filterStatus as any } : {}),
        },
        select: {
          id: true,
          gameId: true,
          entryFee: true,
          title: true,
          configSnapshot: true,
          rules: true,
          players: {
            select: {
              id: true,
              userId: true,
              finalRank: true,
              matchesPlayed: true,
              wins: true,
              losses: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                },
              },
              prizes: {
                where: { status: "PAID" },
                select: { amount: true, rank: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 3000,
      });

      const filteredTournaments = filterTier
        ? tournaments.filter((t) => this.getTierCode(t) === filterTier)
        : tournaments;

      const userMap = new Map<
        string,
        {
          username: string;
          displayName: string;
          played: number;
          won: number;
          top4: number;
          matchesPlayed: number;
          wins: number;
          losses: number;
          totalFees: number;
          totalPrizes: number;
        }
      >();

      for (const t of filteredTournaments) {
        for (const tp of t.players) {
          const uId = tp.userId;
          if (!uId) continue;
          let u = userMap.get(uId);
          if (!u) {
            u = {
              username: tp.user?.username || uId,
              displayName: tp.user?.displayName || tp.user?.username || uId,
              played: 0,
              won: 0,
              top4: 0,
              matchesPlayed: 0,
              wins: 0,
              losses: 0,
              totalFees: 0,
              totalPrizes: 0,
            };
            userMap.set(uId, u);
          }

          u.played++;
          const isWon = tp.finalRank === 1 || tp.prizes.some((p) => p.rank === 1);
          const isTop4 = (tp.finalRank && tp.finalRank <= 4) || tp.prizes.some((p) => p.rank <= 4);
          if (isWon) u.won++;
          if (isTop4) u.top4++;

          u.matchesPlayed += tp.matchesPlayed || (tp.wins + tp.losses);
          u.wins += tp.wins || 0;
          u.losses += tp.losses || 0;
          u.totalFees += t.entryFee || 0;
          u.totalPrizes += tp.prizes.reduce((sum, p) => sum + p.amount, 0);
        }
      }

      rows = Array.from(userMap.entries()).map(([userId, u]) => {
        const totalMatches = u.wins + u.losses;
        const winRate = totalMatches > 0 ? Math.round((u.wins / totalMatches) * 100) : 0;
        const netProfit = u.totalPrizes - u.totalFees;
        return {
          "User ID": userId,
          "Username": u.username,
          "Display Name": u.displayName,
          "Tournaments Played": u.played,
          "Tournaments Won": u.won,
          "Top 4 Finishes": u.top4,
          "Matches Played": u.matchesPlayed,
          "Matches Won": u.wins,
          "Matches Lost": u.losses,
          "Win Rate %": winRate,
          "Total Entry Fees Paid": u.totalFees,
          "Total Prizes Won": u.totalPrizes,
          "Net Profit / Loss": netProfit,
        };
      });
    } else if (reportType === "SETTLEMENT") {
      headers = [
        "Prize ID",
        "Tournament ID",
        "Tournament Title",
        "Game ID",
        "Game Name",
        "Tier",
        "Tournament Status",
        "User ID",
        "Username",
        "Rank",
        "Prize Amount",
        "Settlement Status",
        "Transaction ID",
        "Retry Count",
        "Failure Reason",
        "Paid At",
        "Created At",
      ];

      const prizes = await prisma.tournamentPrize.findMany({
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
        include: {
          tournament: {
            select: {
              id: true,
              title: true,
              gameId: true,
              entryFee: true,
              status: true,
              configSnapshot: true,
              rules: true,
            },
          },
          player: {
            include: {
              user: {
                select: { id: true, username: true, displayName: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 5000,
      });

      let filteredPrizes = prizes;
      if (filterGame) {
        filteredPrizes = filteredPrizes.filter((p) => p.tournament?.gameId === filterGame);
      }
      if (filterStatus) {
        filteredPrizes = filteredPrizes.filter(
          (p) => p.tournament?.status === filterStatus || p.status === filterStatus
        );
      }
      if (filterTier) {
        filteredPrizes = filteredPrizes.filter(
          (p) => p.tournament && this.getTierCode(p.tournament as any) === filterTier
        );
      }

      rows = filteredPrizes.map((p) => {
        const tierCode = p.tournament ? this.getTierCode(p.tournament as any) : "standard";
        return {
          "Prize ID": p.id,
          "Tournament ID": p.tournamentId,
          "Tournament Title": p.tournament?.title || "Unknown Tournament",
          "Game ID": p.tournament?.gameId || "unknown",
          "Game Name": p.tournament?.gameId ? this.getGameName(p.tournament.gameId) : "Unknown",
          "Tier": this.getTierName(tierCode),
          "Tournament Status": p.tournament?.status || "UNKNOWN",
          "User ID": p.userId,
          "Username": p.player?.user?.username || p.userId,
          "Rank": p.rank,
          "Prize Amount": p.amount,
          "Settlement Status": p.status,
          "Transaction ID": p.transactionId || "—",
          "Retry Count": p.retryCount || 0,
          "Failure Reason": p.failureReason || "—",
          "Paid At": p.paidAt ? p.paidAt.toISOString() : "—",
          "Created At": p.createdAt.toISOString(),
        };
      });
    } else if (reportType === "NOTIFICATION") {
      headers = [
        "Notification ID",
        "Channel",
        "User ID",
        "Username",
        "Tournament ID",
        "Tournament Title",
        "Game",
        "Tier",
        "Event Type",
        "Delivery Status",
        "Failure Reason",
        "Created At",
        "Delivered At",
      ];

      // 1. Fetch email delivery records
      const emailLogs = TournamentEmailService.getEmailDeliveryRecords();
      const filteredEmailLogs = emailLogs.filter((e) => {
        const logDate = new Date(e.createdAt);
        return logDate >= startDate && logDate <= endDate;
      });

      // 2. Fetch in-app notifications
      const inAppNotifications = await prisma.appNotification.findMany({
        where: {
          type: "TOURNAMENT",
          createdAt: { gte: startDate, lte: endDate },
        },
        include: {
          user: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 2500,
      });

      // Build unified rows
      const combinedRows: Array<{
        notificationId: string;
        channel: string;
        userId: string;
        username: string;
        tournamentId: string;
        tournamentTitle: string;
        gameId: string;
        tierCode: string;
        eventType: string;
        status: string;
        failureReason: string;
        createdAt: Date;
        deliveredAt: Date | null;
      }> = [];

      for (const e of filteredEmailLogs) {
        combinedRows.push({
          notificationId: e.notificationId,
          channel: "EMAIL",
          userId: e.userId,
          username: e.email || e.userId,
          tournamentId: e.tournamentId,
          tournamentTitle: (e.metadata as any)?.tournamentTitle || `Tournament ${e.tournamentId}`,
          gameId: (e as any).gameId || (e.metadata as any)?.gameId || "ALL",
          tierCode: (e as any).tierCode || (e.metadata as any)?.tierCode || "standard",
          eventType: e.eventType,
          status: e.status,
          failureReason: e.error || "—",
          createdAt: new Date(e.createdAt),
          deliveredAt: e.sentAt ? new Date(e.sentAt) : null,
        });
      }

      for (const n of inAppNotifications) {
        const data = (n.data as any) || {};
        const tournamentId = data.tournamentId || n.referenceId || "—";
        combinedRows.push({
          notificationId: n.id,
          channel: "IN_APP",
          userId: n.userId,
          username: n.user?.username || n.userId,
          tournamentId,
          tournamentTitle: data.tournamentTitle || n.title || `Tournament ${tournamentId}`,
          gameId: data.gameId || "ALL",
          tierCode: data.tierCode || "standard",
          eventType: n.tournamentEventType || n.type,
          status: n.readAt ? "READ" : "DELIVERED",
          failureReason: "—",
          createdAt: n.createdAt,
          deliveredAt: n.readAt || n.createdAt,
        });
      }

      let filteredCombined = combinedRows;
      if (filterGame) {
        filteredCombined = filteredCombined.filter((r) => r.gameId === "ALL" || r.gameId === filterGame);
      }
      if (filterTier) {
        filteredCombined = filteredCombined.filter((r) => r.tierCode === "standard" || r.tierCode.toLowerCase() === filterTier);
      }
      if (filterStatus) {
        filteredCombined = filteredCombined.filter(
          (r) => r.status.toUpperCase() === filterStatus.toUpperCase()
        );
      }

      filteredCombined.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      rows = filteredCombined.slice(0, 5000).map((r) => ({
        "Notification ID": r.notificationId,
        "Channel": r.channel,
        "User ID": r.userId,
        "Username": r.username,
        "Tournament ID": r.tournamentId,
        "Tournament Title": r.tournamentTitle,
        "Game": r.gameId === "ALL" ? "All Games" : this.getGameName(r.gameId),
        "Tier": this.getTierName(r.tierCode),
        "Event Type": r.eventType,
        "Delivery Status": r.status,
        "Failure Reason": r.failureReason,
        "Created At": r.createdAt.toISOString(),
        "Delivered At": r.deliveredAt ? r.deliveredAt.toISOString() : "—",
      }));
    }

    // Audit Report Generation / Export
    const exportStatus = context?.exportStatus || "SUCCESS";
    const generationTime = new Date().toISOString();

    audit({
      actorType: "user",
      actorId: adminId,
      action: exportStatus === "EXPORTED_CSV" ? "tournament.report_exported" : "tournament.report_generated",
      category: "report",
      targetType: "report",
      targetId: reportType,
      ip: context?.ip || null,
      userAgent: context?.userAgent || null,
      meta: {
        adminId,
        reportType,
        selectedDateRange: {
          timeFilter: params.timeFilter,
          fromDate: params.fromDate || null,
          toDate: params.toDate || null,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          label: dateRangeLabel,
        },
        gameFilter: params.gameId && params.gameId.toUpperCase() !== "ALL" ? params.gameId : "ALL",
        tierFilter: params.tier && params.tier.toUpperCase() !== "ALL" ? params.tier.toLowerCase() : "ALL",
        tournamentStatusFilter: params.status && params.status.toUpperCase() !== "ALL" ? params.status.toUpperCase() : "ALL",
        generationTime,
        exportStatus,
        totalRecords: rows.length,
      },
    });

    return {
      reportType,
      generatedAt: new Date().toISOString(),
      adminId,
      filters: params as unknown as Record<string, unknown>,
      totalRecords: rows.length,
      headers,
      rows,
    };
  }

  /**
   * Formats report result to sanitized RFC 4180 CSV string with formula injection protection.
   */
  static exportCsv(report: TournamentReportResult): string {
    const sanitizeValue = (val: any): string => {
      if (val === undefined || val === null) return "";
      let str = String(val);
      // Formula Injection Prevention: If string starts with =, +, -, @, \t, \r
      // and isn't a plain number (e.g. -123 is a number, but =SUM(...) is a formula)
      if (/^[=+\-@\t\r]/.test(str) && isNaN(Number(str))) {
        str = `'${str}`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headerLine = report.headers.map((h) => sanitizeValue(h)).join(",");
    const rowLines = report.rows.map((row) =>
      report.headers.map((h) => sanitizeValue(row[h])).join(",")
    );
    return [headerLine, ...rowLines].join("\r\n");
  }
}
