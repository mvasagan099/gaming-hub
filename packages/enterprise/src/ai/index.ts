/**
 * AI Services Module
 * 
 * Provides AI-powered features including:
 * - Matchmaking optimization
 * - Cheat detection
 * - Toxic chat detection
 * - Spam detection
 * - Fraud detection
 * - Player recommendations
 * - Risk scoring
 */

import { EventEmitter } from "events";
import { prisma } from "@gaming-hub/db";
import type {
  AIModel,
  AIPrediction,
  RiskScore,
  RiskFactor,
  GameAction,
  JsonObject,
} from "../types";

export interface AIServiceConfig {
  openAIApiKey?: string;
  modelEndpoints?: Record<string, string>;
  enableLogging?: boolean;
}

export class AIService extends EventEmitter {
  private config: AIServiceConfig;
  private models = new Map<string, AIModel>();
  private predictions = new Map<string, AIPrediction[]>();
  private riskScores = new Map<string, RiskScore>();

  constructor(config: AIServiceConfig = {}) {
    super();
    this.config = {
      enableLogging: true,
      ...config,
    };
  }

  // ============================================================================
  // AI Matchmaking Optimization
  // ============================================================================

  /**
   * Calculate optimal matchmaking for a player
   */
  async calculateMatchmakingScore(
    playerId: string,
    potentialOpponents: string[],
    gameId: string
  ): Promise<Array<{ userId: string; score: number; factors: RiskFactor[] }>> {
    const playerStats = await prisma.playerStatistic.findUnique({
      where: { userId_gameId: { userId: playerId, gameId } },
    });

    const scores = await Promise.all(
      potentialOpponents.map(async (opponentId) => {
        const opponentStats = await prisma.playerStatistic.findUnique({
          where: { userId_gameId: { userId: opponentId, gameId } },
        });

        const factors: RiskFactor[] = [];
        let score = 100;

        // Rating difference factor
        if (playerStats && opponentStats) {
          const ratingDiff = Math.abs(playerStats.rating - opponentStats.rating);
          const ratingFactor: RiskFactor = {
            type: "rating_difference",
            weight: 0.4,
            contribution: Math.max(0, 100 - ratingDiff / 10),
          };
          factors.push(ratingFactor);
          score = ratingFactor.contribution * ratingFactor.weight;

          // Win rate similarity
          const winRateDiff = Math.abs(
            (playerStats.wins / Math.max(1, playerStats.gamesPlayed)) -
            (opponentStats.wins / Math.max(1, opponentStats.gamesPlayed))
          );
          factors.push({
            type: "win_rate_similarity",
            weight: 0.2,
            contribution: (1 - winRateDiff) * 100,
          });

          // Experience level
          const expDiff = Math.abs(playerStats.gamesPlayed - opponentStats.gamesPlayed);
          factors.push({
            type: "experience_match",
            weight: 0.2,
            contribution: Math.max(0, 100 - expDiff / 10),
          });
        }

        // Recent activity
        const recentMatches = await prisma.match.findMany({
          where: {
            OR: [
              { players: { some: { userId: playerId } } },
              { players: { some: { userId: opponentId } } },
            ],
            endedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
          take: 10,
        });

        const playedRecently = recentMatches.some(m =>
          m.players.some(p => p.userId === opponentId)
        );

        if (playedRecently) {
          factors.push({
            type: "recent_match",
            weight: 0.1,
            contribution: 80, // Slightly penalize recent opponents
          });
        }

        // Calculate weighted score
        const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
        const weightedScore = factors.reduce(
          (sum, f) => sum + f.contribution * f.weight,
          0
        ) / totalWeight;

        return {
          userId: opponentId,
          score: weightedScore,
          factors,
        };
      })
    );

    // Sort by score descending
    return scores.sort((a, b) => b.score - a.score);
  }

  /**
   * Optimize matchmaking queue
   */
  async optimizeMatchmaking(
    gameId: string,
    queuedPlayers: string[]
  ): Promise<Array<[string, string]>> {
    const pairs: Array<[string, string]> = [];
    const unpaired = [...queuedPlayers];

    while (unpaired.length >= 2) {
      const player = unpaired[0]!;
      const opponents = unpaired.slice(1);

      const scores = await this.calculateMatchmakingScore(player, opponents, gameId);
      
      if (scores.length > 0) {
        const bestMatch = scores[0]!;
        pairs.push([player, bestMatch.userId]);
        
        // Remove paired players
        unpaired.splice(0, 1);
        const opponentIndex = unpaired.indexOf(bestMatch.userId);
        if (opponentIndex > -1) {
          unpaired.splice(opponentIndex, 1);
        }
      } else {
        break;
      }
    }

    return pairs;
  }

  // ============================================================================
  // AI Cheat Detection
  // ============================================================================

  /**
   * Analyze gameplay for cheating patterns
   */
  async analyzeGameplay(
    userId: string,
    gameId: string,
    actions: GameAction[],
    matchDuration: number
  ): Promise<{ isCheating: boolean; confidence: number; reasons: string[] }> {
    const reasons: string[] = [];
    let cheatScore = 0;

    // Pattern 1: Inhuman reaction times
    const reactionTimes = this.calculateReactionTimes(actions);
    const avgReactionTime = reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length;
    
    if (avgReactionTime < 50) { // Less than 50ms is suspicious
      cheatScore += 30;
      reasons.push("Suspicious reaction times (< 50ms average)");
    }

    // Pattern 2: Perfect move sequences
    const accuracy = this.calculateMoveAccuracy(actions);
    if (accuracy > 0.98 && actions.length > 10) {
      cheatScore += 25;
      reasons.push("Unusually high accuracy (> 98%)");
    }

    // Pattern 3: Consistent timing (bot-like behavior)
    const timingConsistency = this.calculateTimingConsistency(actions);
    if (timingConsistency < 0.1 && actions.length > 20) {
      cheatScore += 20;
      reasons.push("Overly consistent timing patterns (bot-like)");
    }

    // Pattern 4: Impossible game knowledge
    const gameKnowledge = await this.assessGameKnowledge(actions, gameId);
    if (gameKnowledge > 0.95 && actions.length > 5) {
      cheatScore += 15;
      reasons.push("Suspicious game knowledge");
    }

    // Pattern 5: Rapid successive wins
    const recentMatches = await prisma.matchPlayer.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const winStreak = recentMatches.reduce((streak, match) => {
      return match.result === "WIN" ? streak + 1 : 0;
    }, 0);

    if (winStreak >= 10) {
      cheatScore += 10;
      reasons.push("Unusual winning streak (10+ consecutive wins)");
    }

    const confidence = Math.min(cheatScore / 100, 1);
    const isCheating = cheatScore >= 70;

    if (isCheating && this.config.enableLogging) {
      await this.logSuspiciousActivity(userId, gameId, "cheating", cheatScore, reasons);
    }

    return { isCheating, confidence, reasons };
  }

  /**
   * Detect aimbot/perfect accuracy patterns
   */
  private calculateMoveAccuracy(actions: GameAction[]): number {
    if (actions.length === 0) return 0;
    
    // Count optimal moves
    const optimalMoves = actions.filter(a => a.isOptimal === true).length;
    return optimalMoves / actions.length;
  }

  /**
   * Calculate timing consistency (lower = more consistent/suspicious)
   */
  private calculateTimingConsistency(actions: GameAction[]): number {
    if (actions.length < 2) return 1;

    const intervals: number[] = [];
    for (let i = 1; i < actions.length; i++) {
      const interval = actions[i]!.timestamp! - actions[i - 1]!.timestamp!;
      intervals.push(interval);
    }

    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);

    return stdDev / mean; // Coefficient of variation
  }

  /**
   * Calculate reaction times between actions
   */
  private calculateReactionTimes(actions: GameAction[]): number[] {
    const times: number[] = [];
    
    for (let i = 1; i < actions.length; i++) {
      const reactionTime = actions[i]!.timestamp! - actions[i - 1]!.timestamp!;
      times.push(reactionTime);
    }

    return times;
  }

  /**
   * Assess if player has impossible game knowledge
   */
  private async assessGameKnowledge(
    actions: GameAction[],
    gameId: string
  ): Promise<number> {
    // This would analyze if player is making moves that require
    // knowledge they shouldn't have (e.g., wall hacks, map hacks)
    // Simplified implementation
    return 0.5;
  }

  // ============================================================================
  // AI Toxic Chat Detection
  // ============================================================================

  /**
   * Analyze chat message for toxicity
   */
  async analyzeToxicity(
    message: string,
    userId: string,
    context?: { roomId?: string; gameId?: string }
  ): Promise<{
    isToxic: boolean;
    toxicityScore: number;
    categories: Record<string, number>;
    suggestedAction: "none" | "warn" | "mute" | "ban";
  }> {
    const categories: Record<string, number> = {
      profanity: 0,
      harassment: 0,
      hate_speech: 0,
      spam: 0,
      personal_attack: 0,
    };

    // Simple pattern-based detection (replace with actual ML model)
    const lowerMessage = message.toLowerCase();
    
    // Profanity detection
    const profanityWords = ["badword1", "badword2"]; // Simplified
    categories.profanity = profanityWords.some(w => lowerMessage.includes(w)) ? 0.8 : 0;

    // Harassment patterns
    const harassmentPatterns = [/\bnoob\b/i, /\btrash\b/i, /\bgarbage\b/i];
    categories.harassment = harassmentPatterns.some(p => p.test(message)) ? 0.6 : 0;

    // Personal attack detection
    const attackPatterns = [/\byou are\s+\w+/i, /\bkill yourself\b/i];
    categories.personal_attack = attackPatterns.some(p => p.test(message)) ? 0.9 : 0;

    // Calculate overall score
    const weights = {
      profanity: 0.3,
      harassment: 0.5,
      hate_speech: 1.0,
      spam: 0.2,
      personal_attack: 0.8,
    };

    const toxicityScore = Object.entries(categories).reduce(
      (sum, [cat, score]) => sum + score * weights[cat as keyof typeof weights],
      0
    ) / Object.keys(weights).length;

    // Determine action
    let suggestedAction: "none" | "warn" | "mute" | "ban" = "none";
    if (toxicityScore > 0.9) {
      suggestedAction = "ban";
    } else if (toxicityScore > 0.7) {
      suggestedAction = "mute";
    } else if (toxicityScore > 0.4) {
      suggestedAction = "warn";
    }

    const isToxic = toxicityScore > 0.5;

    if (isToxic && this.config.enableLogging) {
      await this.logSuspiciousActivity(
        userId,
        context?.gameId ?? "",
        "toxicity",
        toxicityScore,
        [message]
      );
    }

    return {
      isToxic,
      toxicityScore,
      categories,
      suggestedAction,
    };
  }

  /**
   * Get user toxicity history
   */
  async getUserToxicityHistory(userId: string): Promise<{
    totalMessages: number;
    toxicMessages: number;
    toxicityRate: number;
    trend: "improving" | "stable" | "worsening";
  }> {
    // Get recent chat messages
    const messages = await prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // Analyze each message
    let toxicCount = 0;
    const scores: number[] = [];

    for (const msg of messages) {
      const analysis = await this.analyzeToxicity(msg.body, userId);
      if (analysis.isToxic) toxicCount++;
      scores.push(analysis.toxicityScore);
    }

    const toxicityRate = toxicCount / messages.length;
    
    // Calculate trend
    const recentScores = scores.slice(0, 20);
    const olderScores = scores.slice(20, 40);
    const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    const olderAvg = olderScores.reduce((a, b) => a + b, 0) / olderScores.length;
    
    const trend = recentAvg < olderAvg - 0.1
      ? "improving"
      : recentAvg > olderAvg + 0.1
      ? "worsening"
      : "stable";

    return {
      totalMessages: messages.length,
      toxicMessages: toxicCount,
      toxicityRate,
      trend,
    };
  }

  // ============================================================================
  // AI Spam Detection
  // ============================================================================

  /**
   * Detect spam patterns
   */
  async detectSpam(
    message: string,
    userId: string
  ): Promise<{
    isSpam: boolean;
    spamScore: number;
    reasons: string[];
  }> {
    const reasons: string[] = [];
    let spamScore = 0;

    // Check repetition
    const recentMessages = await prisma.chatMessage.findMany({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - 60000) }, // Last minute
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (recentMessages.length >= 5) {
      spamScore += 30;
      reasons.push("High message frequency (> 5 messages/minute)");
    }

    // Check for duplicate messages
    const duplicates = recentMessages.filter(
      m => this.messageSimilarity(m.body, message) > 0.8
    );

    if (duplicates.length > 0) {
      spamScore += 40;
      reasons.push("Duplicate or similar messages");
    }

    // Check for excessive caps
    const capsRatio = (message.match(/[A-Z]/g) || []).length / message.length;
    if (capsRatio > 0.7 && message.length > 10) {
      spamScore += 15;
      reasons.push("Excessive capital letters");
    }

    // Check for links
    const hasLinks = /https?:\/\/|www\./.test(message);
    if (hasLinks) {
      spamScore += 10;
      reasons.push("Contains external links");
    }

    const isSpam = spamScore >= 50;

    if (isSpam && this.config.enableLogging) {
      await this.logSuspiciousActivity(userId, "", "spam", spamScore, reasons);
    }

    return { isSpam, spamScore, reasons };
  }

  /**
   * Calculate message similarity (0-1)
   */
  private messageSimilarity(a: string, b: string): number {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    
    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Levenshtein distance for string similarity
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0]![j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i]![j] = matrix[i - 1]![j - 1]!;
        } else {
          matrix[i]![j] = Math.min(
            matrix[i - 1]![j - 1]! + 1,
            matrix[i]![j - 1]! + 1,
            matrix[i - 1]![j]! + 1
          );
        }
      }
    }

    return matrix[b.length]![a.length]!;
  }

  // ============================================================================
  // AI Fraud Detection
  // ============================================================================

  /**
   * Calculate fraud risk score for a user
   */
  async calculateFraudRisk(userId: string): Promise<RiskScore> {
    const factors: RiskFactor[] = [];
    let totalScore = 0;

    // Factor 1: Account age
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { 
        wallet: true,
        profile: true,
        referralsMade: true,
        referralsReceived: true,
      },
    });

    if (!user) {
      return {
        userId,
        score: 100,
        level: "critical",
        factors: [{ type: "user_not_found", weight: 1, contribution: 100 }],
        calculatedAt: new Date(),
      };
    }

    const accountAge = Date.now() - user.createdAt.getTime();
    const ageDays = accountAge / (1000 * 60 * 60 * 24);
    
    if (ageDays < 1) {
      factors.push({
        type: "new_account",
        weight: 0.3,
        contribution: 80,
      });
      totalScore += 24;
    } else if (ageDays < 7) {
      factors.push({
        type: "recent_account",
        weight: 0.2,
        contribution: 40,
      });
      totalScore += 8;
    }

    // Factor 2: Transaction patterns
    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Check for rapid transactions
    const rapidTxns = transactions.filter((t, i) => {
      if (i === 0) return false;
      const prev = transactions[i - 1];
      return prev && t.createdAt.getTime() - prev.createdAt.getTime() < 10000; // 10 seconds
    });

    if (rapidTxns.length >= 5) {
      factors.push({
        type: "rapid_transactions",
        weight: 0.4,
        contribution: 90,
      });
      totalScore += 36;
    }

    // Factor 3: Withdrawal patterns
    const withdrawals = transactions.filter(
      t => t.type === "DEBIT" && t.referenceType === "WITHDRAWAL"
    );

    const totalWithdrawn = withdrawals.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const totalDeposited = transactions
      .filter(t => t.referenceType === "DEPOSIT")
      .reduce((sum, t) => sum + t.amount, 0);

    if (totalWithdrawn > totalDeposited * 2) {
      factors.push({
        type: "withdrawal_ratio",
        weight: 0.3,
        contribution: 70,
      });
      totalScore += 21;
    }

    // Factor 4: Referral fraud
    const referralRatio = user.referralsMade.length / Math.max(1, ageDays);
    if (referralRatio > 10) {
      factors.push({
        type: "suspicious_referrals",
        weight: 0.2,
        contribution: 60,
      });
      totalScore += 12;
    }

    // Determine risk level
    const level: RiskScore["level"] =
      totalScore >= 70 ? "critical" :
      totalScore >= 50 ? "high" :
      totalScore >= 30 ? "medium" : "low";

    const score: RiskScore = {
      userId,
      score: totalScore,
      level,
      factors,
      calculatedAt: new Date(),
    };

    this.riskScores.set(userId, score);

    if (level === "critical" || level === "high") {
      await this.logSuspiciousActivity(userId, "", "fraud", totalScore, factors.map(f => f.type));
    }

    return score;
  }

  /**
   * Detect coordinated fraud patterns
   */
  async detectCoordinatedFraud(
    userIds: string[]
  ): Promise<Array<{ users: string[]; confidence: number; pattern: string }>> {
    const patterns: Array<{ users: string[]; confidence: number; pattern: string }> = [];

    // Check for shared IP addresses
    const ipGroups = await this.groupByIP(userIds);
    for (const [ip, users] of ipGroups) {
      if (users.length >= 3) {
        patterns.push({
          users,
          confidence: users.length * 0.2,
          pattern: `Shared IP: ${ip}`,
        });
      }
    }

    // Check for synchronized activity
    const syncGroups = await this.findSynchronizedActivity(userIds);
    for (const group of syncGroups) {
      patterns.push({
        users: group.users,
        confidence: group.confidence,
        pattern: "Synchronized activity patterns",
      });
    }

    return patterns.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Group users by shared IP
   */
  private async groupByIP(userIds: string[]): Promise<Map<string, string[]>> {
    const groups = new Map<string, string[]>();
    // This would query login sessions or audit logs
    // Simplified implementation
    return groups;
  }

  /**
   * Find synchronized activity patterns
   */
  private async findSynchronizedActivity(
    userIds: string[]
  ): Promise<Array<{ users: string[]; confidence: number }>> {
    // Analyze activity timestamps to find synchronized behavior
    // Simplified implementation
    return [];
  }

  // ============================================================================
  // AI Player Recommendations
  // ============================================================================

  /**
   * Recommend games for a user
   */
  async recommendGames(
    userId: string,
    limit: number = 5
  ): Promise<Array<{ gameId: string; score: number; reasons: string[] }>> {
    const userStats = await prisma.playerStatistic.findMany({
      where: { userId },
    });

    const playedGames = new Set(userStats.map(s => s.gameId));
    const allGames = ["chess", "ludo", "snake-ladder", "carrom", "bubble-shooter", "table-tennis"];

    const recommendations: Array<{ gameId: string; score: number; reasons: string[] }> = [];

    for (const gameId of allGames) {
      if (playedGames.has(gameId)) continue;

      const reasons: string[] = [];
      let score = 0;

      // Check similar players
      const similarPlayers = await this.findSimilarPlayers(userId, gameId);
      if (similarPlayers.length > 0) {
        score += 30;
        reasons.push(`${similarPlayers.length} similar players enjoy this game`);
      }

      // Check genre preference
      const genreMatch = await this.checkGenrePreference(userId, gameId);
      if (genreMatch) {
        score += 25;
        reasons.push("Matches your preferred game genre");
      }

      // Check skill level fit
      const skillFit = await this.checkSkillLevelFit(userId, gameId);
      score += skillFit * 20;
      if (skillFit > 0.7) {
        reasons.push("Good match for your skill level");
      }

      // Trending factor
      const trending = await this.isGameTrending(gameId);
      if (trending) {
        score += 10;
        reasons.push("Trending among players");
      }

      if (score > 0) {
        recommendations.push({ gameId, score, reasons });
      }
    }

    return recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Find similar players
   */
  private async findSimilarPlayers(userId: string, gameId: string): Promise<string[]> {
    // Find players with similar skill levels who play this game
    // Simplified implementation
    return [];
  }

  /**
   * Check genre preference
   */
  private async checkGenrePreference(userId: string, gameId: string): Promise<boolean> {
    // Check if user likes similar games
    // Simplified implementation
    return false;
  }

  /**
   * Check skill level fit
   */
  private async checkSkillLevelFit(userId: string, gameId: string): Promise<number> {
    // Check if user's skill level matches game difficulty
    // Simplified implementation
    return 0.5;
  }

  /**
   * Check if game is trending
   */
  private async isGameTrending(gameId: string): Promise<boolean> {
    const recentMatches = await prisma.match.count({
      where: {
        gameId,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    return recentMatches > 100;
  }

  // ============================================================================
  // AI Analytics Summary
  // ============================================================================

  /**
   * Generate analytics summary
   */
  async generateAnalyticsSummary(
    timeframe: "daily" | "weekly" | "monthly",
    date: Date
  ): Promise<{
    overview: string;
    keyMetrics: Record<string, number>;
    insights: string[];
    recommendations: string[];
    anomalies: Array<{ metric: string; expected: number; actual: number }>;
  }> {
    const startDate = this.getStartDate(timeframe, date);
    const endDate = date;

    // Gather metrics
    const metrics = await this.gatherMetrics(startDate, endDate);

    // Generate insights
    const insights: string[] = [];
    const recommendations: string[] = [];
    const anomalies: Array<{ metric: string; expected: number; actual: number }> = [];

    // Analyze trends
    const prevMetrics = await this.gatherMetrics(
      this.getStartDate(timeframe, startDate),
      startDate
    );

    // DAU trend
    const dauChange = ((metrics.dau - prevMetrics.dau) / prevMetrics.dau) * 100;
    if (dauChange > 10) {
      insights.push(`DAU increased by ${dauChange.toFixed(1)}%`);
    } else if (dauChange < -10) {
      insights.push(`DAU decreased by ${Math.abs(dauChange).toFixed(1)}%`);
      recommendations.push("Investigate reasons for user churn");
    }

    // Revenue trend
    const revenueChange = ((metrics.revenue - prevMetrics.revenue) / prevMetrics.revenue) * 100;
    if (revenueChange > 20) {
      insights.push(`Revenue increased by ${revenueChange.toFixed(1)}%`);
    }

    // Detect anomalies
    if (metrics.churnRate > 0.1) {
      anomalies.push({
        metric: "churn_rate",
        expected: 0.05,
        actual: metrics.churnRate,
      });
    }

    return {
      overview: `${timeframe} analytics for ${date.toDateString()}`,
      keyMetrics: metrics,
      insights,
      recommendations,
      anomalies,
    };
  }

  /**
   * Gather metrics
   */
  private async gatherMetrics(startDate: Date, endDate: Date): Promise<Record<string, number>> {
    const [
      dau,
      revenue,
      matches,
      newUsers,
    ] = await Promise.all([
      // DAU
      prisma.loginSession.groupBy({
        by: ["userId"],
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
      }).then(r => r.length),

      // Revenue
      prisma.transaction.aggregate({
        where: {
          type: "CREDIT",
          referenceType: "DEPOSIT",
          createdAt: { gte: startDate, lte: endDate },
        },
        _sum: { amount: true },
      }).then(r => r._sum.amount ?? 0),

      // Matches
      prisma.match.count({
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
      }),

      // New users
      prisma.user.count({
        where: {
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
    ]);

    return {
      dau,
      revenue,
      matches,
      newUsers,
      churnRate: 0, // Would calculate based on cohort analysis
    };
  }

  /**
   * Get start date for timeframe
   */
  private getStartDate(timeframe: string, date: Date): Date {
    const d = new Date(date);
    switch (timeframe) {
      case "daily":
        d.setDate(d.getDate() - 1);
        break;
      case "weekly":
        d.setDate(d.getDate() - 7);
        break;
      case "monthly":
        d.setMonth(d.getMonth() - 1);
        break;
    }
    return d;
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private async logSuspiciousActivity(
    userId: string,
    gameId: string,
    type: string,
    score: number,
    details: string[]
  ): Promise<void> {
    await prisma.auditLog.create({
      data: {
        actorType: "system",
        action: "ai_detection",
        category: "security",
        targetType: "user",
        targetId: userId,
        meta: {
          gameId,
          detectionType: type,
          score,
          details,
        },
      },
    });

    this.emit("suspiciousActivity", { userId, type, score, details });
  }
}
