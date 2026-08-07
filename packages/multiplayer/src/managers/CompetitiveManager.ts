/**
 * Competitive Manager
 * 
 * Implements ELO/MMR rating system, rank tiers, placement matches,
 * promotion/demotion, and seasonal rankings.
 * 
 * Features:
 * - ELO rating calculation
 * - MMR (Matchmaking Rating) tracking
 * - Rank tier progression
 * - Placement matches (provisional rating)
 * - Promotion/demotion matches
 * - Seasonal resets and rewards
 * - Regional and global leaderboards
 */

import { prisma } from "@gaming-hub/db";
import type { RankTier, Season, CompetitiveRank, RatingHistory } from "@gaming-hub/db";
import type { GameId } from "@gaming-hub/shared";

export interface RatingChange {
  ratingChange: number;
  mmrChange: number;
  newRating: number;
  newMmr: number;
  tierChanged: boolean;
  oldTier: RankTier;
  newTier: RankTier;
  promotionMatch: boolean;
  demotionProtection: boolean;
}

export interface RankThresholds {
  [key: string]: { min: number; max: number };
}

export const RANK_THRESHOLDS: RankThresholds = {
  BRONZE: { min: 0, max: 1199 },
  SILVER: { min: 1200, max: 1399 },
  GOLD: { min: 1400, max: 1599 },
  PLATINUM: { min: 1600, max: 1799 },
  DIAMOND: { min: 1800, max: 1999 },
  MASTER: { min: 2000, max: 2199 },
  GRANDMASTER: { min: 2200, max: 2399 },
  LEGEND: { min: 2400, max: 9999 },
};

export const K_FACTORS = {
  PLACEMENT: 40,
  LOW_GAMES: 32,
  MID_GAMES: 24,
  HIGH_GAMES: 16,
};

export class CompetitiveManager {
  async initialize(): Promise<void> {
    console.log("[CompetitiveManager] Initialized");
  }

  async shutdown(): Promise<void> {}

  async getOrCreateRank(userId: string, gameId: GameId, seasonId?: string): Promise<CompetitiveRank> {
    let rank = await prisma.competitiveRank.findFirst({
      where: {
        userId,
        gameId,
        seasonId: seasonId ?? null,
      },
    });

    if (!rank) {
      const now = new Date();
      const season = seasonId ? await prisma.season.findUnique({ where: { id: seasonId } }) : null;
      
      rank = await prisma.competitiveRank.create({
        data: {
          userId,
          gameId,
          seasonId: season?.id ?? null,
          mmr: 1000,
          rating: 1000,
          peakRating: 1000,
          tier: "BRONZE",
          tierProgress: 0,
          stars: 0,
          placementMatches: 0,
          placementComplete: false,
          promotionMatches: 0,
          demotionProtection: false,
          gamesPlayed: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          winStreak: 0,
          longestWinStreak: 0,
          ratingUpdatedAt: now,
        },
      });
    }

    return rank;
  }

  async getActiveSeason(gameId: GameId): Promise<Season | null> {
    const season = await prisma.season.findFirst({
      where: {
        gameId,
        status: "ACTIVE",
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
      },
      orderBy: { startDate: "desc" },
    });

    return season;
  }

  async updateRating(
    userId: string,
    gameId: GameId,
    opponentId: string,
    result: "win" | "loss" | "draw",
    matchId: string
  ): Promise<RatingChange> {
    const season = await this.getActiveSeason(gameId);
    const playerRank = await this.getOrCreateRank(userId, gameId, season?.id);
    const opponentRank = await this.getOrCreateRank(opponentId, gameId, season?.id);

    const ratingChange = this.calculateRatingChange(
      playerRank,
      opponentRank,
      result
    );

    const oldTier = playerRank.tier;
    const oldRating = playerRank.rating;
    const oldMmr = playerRank.mmr;

    const newRating = Math.max(0, oldRating + ratingChange.ratingChange);
    const newMmr = Math.max(0, oldMmr + ratingChange.mmrChange);
    const newTier = this.getTierForRating(newRating);

    const tierChanged = oldTier !== newTier;
    const promotionMatch = this.checkForPromotion(oldTier, newTier);
    const demotionProtection = this.checkDemotionProtection(playerRank);

    const updatedRank = await prisma.competitiveRank.update({
      where: { id: playerRank.id },
      data: {
        rating: newRating,
        mmr: newMmr,
        peakRating: Math.max(playerRank.peakRating, newRating),
        tier: newTier,
        tierProgress: this.calculateTierProgress(newRating),
        gamesPlayed: playerRank.gamesPlayed + 1,
        wins: playerRank.wins + (result === "win" ? 1 : 0),
        losses: playerRank.losses + (result === "loss" ? 1 : 0),
        draws: playerRank.draws + (result === "draw" ? 1 : 0),
        winStreak: result === "win" ? playerRank.winStreak + 1 : 0,
        longestWinStreak: Math.max(
          playerRank.longestWinStreak,
          result === "win" ? playerRank.winStreak + 1 : playerRank.winStreak
        ),
        placementMatches: playerRank.placementComplete
          ? playerRank.placementMatches
          : playerRank.placementMatches + 1,
        placementComplete:
          playerRank.placementComplete || playerRank.placementMatches >= 9,
        lastMatchAt: new Date(),
        ratingUpdatedAt: new Date(),
      },
    });

    await prisma.ratingHistory.create({
      data: {
        rankId: playerRank.id,
        seasonId: season?.id ?? null,
        matchId,
        ratingBefore: oldRating,
        ratingAfter: newRating,
        ratingChange: ratingChange.ratingChange,
        mmrBefore: oldMmr,
        mmrAfter: newMmr,
        mmrChange: ratingChange.mmrChange,
        tierBefore: oldTier,
        tierAfter: newTier,
        tierProgressBefore: this.calculateTierProgress(oldRating),
        tierProgressAfter: this.calculateTierProgress(newRating),
        opponentRating: opponentRank.rating,
        result,
        gameId,
      },
    });

    if (tierChanged) {
      await this.sendRankChangeNotification(
        userId,
        gameId,
        oldTier,
        newTier,
        promotionMatch
      );
    }

    return {
      ratingChange: ratingChange.ratingChange,
      mmrChange: ratingChange.mmrChange,
      newRating,
      newMmr,
      tierChanged,
      oldTier,
      newTier,
      promotionMatch,
      demotionProtection,
    };
  }

  private calculateRatingChange(
    playerRank: CompetitiveRank,
    opponentRank: CompetitiveRank,
    result: "win" | "loss" | "draw"
  ): { ratingChange: number; mmrChange: number } {
    const k = this.getKFactor(playerRank);
    const expectedScore = this.calculateExpectedScore(
      playerRank.rating,
      opponentRank.rating
    );

    const actualScore = result === "win" ? 1 : result === "loss" ? 0 : 0.5;
    const ratingChange = Math.round(k * (actualScore - expectedScore));

    const mmrK = k * 1.2;
    const mmrChange = Math.round(mmrK * (actualScore - expectedScore));

    return { ratingChange, mmrChange };
  }

  private getKFactor(rank: CompetitiveRank): number {
    if (!rank.placementComplete) {
      return K_FACTORS.PLACEMENT;
    }

    if (rank.gamesPlayed < 30) {
      return K_FACTORS.LOW_GAMES;
    } else if (rank.gamesPlayed < 100) {
      return K_FACTORS.MID_GAMES;
    } else {
      return K_FACTORS.HIGH_GAMES;
    }
  }

  private calculateExpectedScore(ratingA: number, ratingB: number): number {
    return (
      1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
    );
  }

  private getTierForRating(rating: number): RankTier {
    for (const [tier, range] of Object.entries(RANK_THRESHOLDS)) {
      if (rating >= range.min && rating <= range.max) {
        return tier as RankTier;
      }
    }
    return "BRONZE";
  }

  private calculateTierProgress(rating: number): number {
    const tier = this.getTierForRating(rating);
    const range = RANK_THRESHOLDS[tier];
    const rangeWidth = range.max - range.min;
    const progress = rating - range.min;
    return Math.floor((progress / rangeWidth) * 100);
  }

  private checkForPromotion(oldTier: RankTier, newTier: RankTier): boolean {
    const tierOrder = [
      "BRONZE",
      "SILVER",
      "GOLD",
      "PLATINUM",
      "DIAMOND",
      "MASTER",
      "GRANDMASTER",
      "LEGEND",
    ];
    return tierOrder.indexOf(newTier) > tierOrder.indexOf(oldTier);
  }

  private checkDemotionProtection(rank: CompetitiveRank): boolean {
    return rank.demotionProtection;
  }

  private async sendRankChangeNotification(
    userId: string,
    gameId: GameId,
    oldTier: RankTier,
    newTier: RankTier,
    isPromotion: boolean
  ): Promise<void> {
    await prisma.gameNotification.create({
      data: {
        userId,
        type: "RANK_CHANGED",
        title: isPromotion ? "Rank Up!" : "Rank Changed",
        body: isPromotion
          ? `Congratulations! You've been promoted to ${newTier}!`
          : `Your rank has changed from ${oldTier} to ${newTier}`,
        data: {
          oldTier,
          newTier,
          gameId,
          isPromotion,
        },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }

  async getLeaderboard(
    gameId: GameId,
    options?: {
      limit?: number;
      offset?: number;
      seasonId?: string;
      tier?: RankTier;
    }
  ): Promise<CompetitiveRank[]> {
    const leaderboard = await prisma.competitiveRank.findMany({
      where: {
        gameId,
        seasonId: options?.seasonId ?? null,
        ...(options?.tier ? { tier: options.tier } : {}),
      },
      orderBy: [
        { mmr: "desc" },
        { rating: "desc" },
      ],
      take: options?.limit ?? 100,
      skip: options?.offset ?? 0,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return leaderboard;
  }

  async getPlayerRanking(
    userId: string,
    gameId: GameId,
    seasonId?: string
  ): Promise<{
    globalRank: number;
    regionalRank: number | null;
    countryRank: number | null;
  }> {
    const rank = await this.getOrCreateRank(userId, gameId, seasonId);

    const globalRank = await prisma.competitiveRank.count({
      where: {
        gameId,
        seasonId: seasonId ?? null,
        mmr: { gt: rank.mmr },
      },
    }) + 1;

    return {
      globalRank,
      regionalRank: rank.regionalRank,
      countryRank: rank.countryRank,
    };
  }

  async getSeasonRewards(userId: string, gameId: GameId): Promise<any[]> {
    const season = await this.getActiveSeason(gameId);
    if (!season) return [];

    const rank = await this.getOrCreateRank(userId, gameId, season.id);
    const rewards = season.rewards as any;

    if (!rewards || !rewards.tiers) return [];

    const tierRewards = rewards.tiers[rank.tier] || [];
    return tierRewards;
  }
}
