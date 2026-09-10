/**
 * Economy System Module
 * 
 * Manages XP, levels, coins, gems, rewards, premium memberships,
 * VIP levels, battle passes, daily/weekly/monthly rewards, lucky wheel,
 * and loot box systems.
 */

import { EventEmitter } from "events";
import { Redis } from "ioredis";
import { prisma } from "@gaming-hub/db";
import type {
  UserEconomy,
  DailyReward,
  LuckyWheelConfig,
  LuckyWheelSegment,
  LootBoxConfig,
  LootBoxItem,
  EventReward,
} from "../types";

export interface EconomyConfig {
  redis: Redis;
  xpMultiplier?: number;
  coinMultiplier?: number;
  gemMultiplier?: number;
}

export interface LevelConfig {
  level: number;
  xpRequired: number;
  rewards: EventReward[];
}

export class EconomyManager extends EventEmitter {
  private redis: Redis;
  private xpMultiplier: number;
  private coinMultiplier: number;
  private gemMultiplier: number;
  private levels: LevelConfig[] = [];
  private dailyRewards: DailyReward[] = [];
  private luckyWheel: LuckyWheelConfig | null = null;
  private lootBoxes = new Map<string, LootBoxConfig>();

  constructor(config: EconomyConfig) {
    super();
    this.redis = config.redis;
    this.xpMultiplier = config.xpMultiplier ?? 1;
    this.coinMultiplier = config.coinMultiplier ?? 1;
    this.gemMultiplier = config.gemMultiplier ?? 1;
    this.initializeDefaults();
  }

  private initializeDefaults(): void {
    // Initialize level progression
    for (let level = 1; level <= 100; level++) {
      this.levels.push({
        level,
        xpRequired: Math.floor(100 * Math.pow(1.1, level - 1)),
        rewards: this.generateLevelRewards(level),
      });
    }

    // Initialize daily rewards
    this.dailyRewards = [
      { day: 1, rewards: [{ type: "coins", amount: 100 }] },
      { day: 2, rewards: [{ type: "coins", amount: 150 }] },
      { day: 3, rewards: [{ type: "coins", amount: 200 }, { type: "gems", amount: 5 }] },
      { day: 4, rewards: [{ type: "coins", amount: 250 }] },
      { day: 5, rewards: [{ type: "coins", amount: 300 }, { type: "gems", amount: 10 }] },
      { day: 6, rewards: [{ type: "coins", amount: 400 }] },
      { day: 7, rewards: [{ type: "coins", amount: 500 }, { type: "gems", amount: 25 }, { type: "item", itemId: "mystery_box" }] },
    ];
  }

  private generateLevelRewards(level: number): EventReward[] {
    const rewards: EventReward[] = [{ type: "coins", amount: level * 50 }];
    
    if (level % 5 === 0) {
      rewards.push({ type: "gems", amount: Math.floor(level / 5) * 10 });
    }
    
    if (level % 10 === 0) {
      rewards.push({ type: "item", itemId: `level_${level}_chest`, rarity: "rare" });
    }

    return rewards;
  }

  // ============================================================================
  // XP & Level System
  // ============================================================================

  /**
   * Award XP to user
   */
  async awardXp(
    userId: string,
    amount: number,
    source: string,
    multiplier: number = 1
  ): Promise<{ xpGained: number; levelsGained: number; totalLevel: number; rewards: EventReward[] }> {
    const profile = await prisma.profile.findUnique({
      where: { userId },
    });

    if (!profile) throw new Error("User not found");

    const actualXp = Math.floor(amount * this.xpMultiplier * multiplier);
    let newXp = profile.xp + actualXp;
    let newLevel = profile.level;
    let levelsGained = 0;
    const allRewards: EventReward[] = [];

    // Check for level ups
    while (true) {
      const nextLevel = this.levels.find(l => l.level === newLevel + 1);
      if (!nextLevel || newXp < nextLevel.xpRequired) break;

      newLevel++;
      levelsGained++;
      newXp -= nextLevel.xpRequired;
      
      // Add level rewards
      allRewards.push(...nextLevel.rewards);

      // Emit level up event
      this.emit("levelUp", { userId, level: newLevel });
    }

    // Update profile
    await prisma.profile.update({
      where: { userId },
      data: {
        xp: newXp,
        level: newLevel,
      },
    });

    // Award rewards
    for (const reward of allRewards) {
      await this.awardReward(userId, reward);
    }

    // Log XP gain
    await this.logEconomyAction(userId, "xp_gain", actualXp, source);

    return {
      xpGained: actualXp,
      levelsGained,
      totalLevel: newLevel,
      rewards: allRewards,
    };
  }

  /**
   * Get user's XP progress
   */
  async getXpProgress(userId: string): Promise<{
    level: number;
    currentXp: number;
    xpRequired: number;
    progress: number;
    totalXp: number;
  }> {
    const profile = await prisma.profile.findUnique({
      where: { userId },
    });

    if (!profile) throw new Error("User not found");

    const currentLevel = this.levels.find(l => l.level === profile.level);
    const nextLevel = this.levels.find(l => l.level === profile.level + 1);
    
    const xpRequired = nextLevel?.xpRequired ?? currentLevel?.xpRequired ?? 100;
    const progress = profile.xp / xpRequired;

    return {
      level: profile.level,
      currentXp: profile.xp,
      xpRequired,
      progress,
      totalXp: this.calculateTotalXp(profile.level, profile.xp),
    };
  }

  private calculateTotalXp(level: number, currentXp: number): number {
    const prevLevelsXp = this.levels
      .filter(l => l.level < level)
      .reduce((sum, l) => sum + l.xpRequired, 0);
    return prevLevelsXp + currentXp;
  }

  // ============================================================================
  // Currency System
  // ============================================================================

  /**
   * Award coins to user
   */
  async awardCoins(
    userId: string,
    amount: number,
    source: string
  ): Promise<{ newBalance: number }> {
    const actualAmount = Math.floor(amount * this.coinMultiplier);
    if (actualAmount <= 0) {
      const wallet = await prisma.wallet.findUnique({ where: { userId } });
      return { newBalance: wallet?.balance ?? 0 };
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.wallet.upsert({
        where: { userId },
        create: { userId, balance: 2500 + actualAmount },
        update: { balance: { increment: actualAmount } },
      });

      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      const balanceAfter = wallet.balance;
      const balanceBefore = balanceAfter - actualAmount;

      await tx.profile.updateMany({
        where: { userId },
        data: { coins: balanceAfter },
      });

      await tx.transaction.create({
        data: {
          userId,
          type: "CREDIT",
          amount: actualAmount,
          balanceBefore,
          balanceAfter,
          walletType: "MAIN",
          referenceType: "REWARD_CREDIT",
          referenceId: null,
          meta: { source, reason: "economy_award", description: `Awarded ${actualAmount} coins from ${source}` },
        },
      });

      return wallet;
    });

    await this.logEconomyAction(userId, "coins_gain", actualAmount, source);

    return { newBalance: updated.balance };
  }

  /**
   * Deduct coins from user
   */
  async deductCoins(
    userId: string,
    amount: number,
    reason: string
  ): Promise<{ success: boolean; newBalance: number }> {
    if (amount <= 0) {
      const wallet = await prisma.wallet.findUnique({ where: { userId } });
      return { success: true, newBalance: wallet?.balance ?? 0 };
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.wallet.updateMany({
          where: { userId, balance: { gte: amount } },
          data: { balance: { decrement: amount } },
        });

        if (result.count === 0) {
          const exists = await tx.wallet.findUnique({ where: { userId } });
          throw new Error(exists ? "INSUFFICIENT_BALANCE" : "WALLET_NOT_FOUND");
        }

        const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
        const balanceAfter = wallet.balance;
        const balanceBefore = balanceAfter + amount;

        await tx.profile.updateMany({
          where: { userId },
          data: { coins: balanceAfter },
        });

        await tx.transaction.create({
          data: {
            userId,
            type: "DEBIT",
            amount,
            balanceBefore,
            balanceAfter,
            walletType: "MAIN",
            referenceType: "WITHDRAWAL",
            referenceId: null,
            meta: { reason, subType: "ECONOMY_SPEND", description: `Spent ${amount} coins: ${reason}` },
          },
        });

        return wallet;
      });

      await this.logEconomyAction(userId, "coins_spend", -amount, reason);

      return { success: true, newBalance: updated.balance };
    } catch {
      const wallet = await prisma.wallet.findUnique({ where: { userId } });
      return { success: false, newBalance: wallet?.balance ?? 0 };
    }
  }

  /**
   * Award gems to user
   */
  async awardGems(
    userId: string,
    amount: number,
    source: string
  ): Promise<{ newBalance: number }> {
    const actualAmount = Math.floor(amount * this.gemMultiplier);
    
    const profile = await prisma.profile.update({
      where: { userId },
      data: {
        gems: { increment: actualAmount },
      },
    });

    await this.logEconomyAction(userId, "gems_gain", actualAmount, source);

    return { newBalance: profile.gems };
  }

  /**
   * Deduct gems from user
   */
  async deductGems(
    userId: string,
    amount: number,
    reason: string
  ): Promise<{ success: boolean; newBalance: number }> {
    const profile = await prisma.profile.findUnique({
      where: { userId },
    });

    if (!profile || profile.gems < amount) {
      return { success: false, newBalance: profile?.gems ?? 0 };
    }

    const updated = await prisma.profile.update({
      where: { userId },
      data: {
        gems: { decrement: amount },
      },
    });

    await this.logEconomyAction(userId, "gems_spend", -amount, reason);

    return { success: true, newBalance: updated.gems };
  }

  // ============================================================================
  // Daily Rewards
  // ============================================================================

  /**
   * Claim daily reward
   */
  async claimDailyReward(userId: string): Promise<{
    success: boolean;
    day: number;
    streak: number;
    rewards: EventReward[];
    nextClaimTime?: Date;
    error?: string;
  }> {
    const now = new Date();
    const cacheKey = `daily:${userId}`;
    
    // Check if already claimed today
    const lastClaimStr = await this.redis.get(cacheKey);
    const lastClaim = lastClaimStr ? new Date(lastClaimStr) : null;

    if (lastClaim) {
      const timeSinceLastClaim = now.getTime() - lastClaim.getTime();
      const hoursSinceLastClaim = timeSinceLastClaim / (1000 * 60 * 60);

      if (hoursSinceLastClaim < 20) {
        const nextClaim = new Date(lastClaim.getTime() + 24 * 60 * 60 * 1000);
        return {
          success: false,
          day: 0,
          streak: 0,
          rewards: [],
          nextClaimTime: nextClaim,
          error: "Already claimed today",
        };
      }

      // Check if streak should be reset (missed more than 48 hours)
      if (hoursSinceLastClaim > 48) {
        await this.resetStreak(userId);
      }
    }

    const profile = await prisma.profile.findUnique({
      where: { userId },
    });

    if (!profile) throw new Error("User not found");

    // Calculate current day and streak
    const currentStreak = profile.dailyStreak ?? 0;
    const day = ((currentStreak % 7) + 1);
    const dailyReward = this.dailyRewards.find(r => r.day === day);

    if (!dailyReward) {
      return { success: false, day: 0, streak: 0, rewards: [], error: "No reward found" };
    }

    // Award rewards
    for (const reward of dailyReward.rewards) {
      await this.awardReward(userId, reward);
    }

    // Update streak
    const newStreak = currentStreak + 1;
    await prisma.profile.update({
      where: { userId },
      data: {
        dailyStreak: newStreak,
        lastDailyClaim: now,
      },
    });

    // Update cache
    await this.redis.setex(cacheKey, 24 * 60 * 60, now.toISOString());

    // Check for streak bonuses
    const bonusRewards = await this.checkStreakBonuses(userId, newStreak);

    return {
      success: true,
      day,
      streak: newStreak,
      rewards: [...dailyReward.rewards, ...bonusRewards],
    };
  }

  /**
   * Get daily reward status
   */
  async getDailyRewardStatus(userId: string): Promise<{
    canClaim: boolean;
    currentStreak: number;
    nextDay: number;
    timeUntilNextClaim: number;
    rewards: DailyReward[];
  }> {
    const cacheKey = `daily:${userId}`;
    const lastClaimStr = await this.redis.get(cacheKey);
    const lastClaim = lastClaimStr ? new Date(lastClaimStr) : null;

    const profile = await prisma.profile.findUnique({
      where: { userId },
    });

    const currentStreak = profile?.dailyStreak ?? 0;
    const nextDay = (currentStreak % 7) + 1;

    let canClaim = true;
    let timeUntilNextClaim = 0;

    if (lastClaim) {
      const timeSinceLastClaim = Date.now() - lastClaim.getTime();
      const hoursSinceLastClaim = timeSinceLastClaim / (1000 * 60 * 60);

      if (hoursSinceLastClaim < 20) {
        canClaim = false;
        timeUntilNextClaim = 24 * 60 * 60 * 1000 - timeSinceLastClaim;
      }
    }

    return {
      canClaim,
      currentStreak,
      nextDay,
      timeUntilNextClaim,
      rewards: this.dailyRewards,
    };
  }

  private async checkStreakBonuses(userId: string, streak: number): Promise<EventReward[]> {
    const bonuses: EventReward[] = [];

    // 7-day streak bonus
    if (streak % 7 === 0) {
      bonuses.push({ type: "gems", amount: 50 });
    }

    // 30-day streak bonus
    if (streak % 30 === 0) {
      bonuses.push({ type: "item", itemId: "legendary_chest", rarity: "legendary" });
    }

    // Award bonuses
    for (const bonus of bonuses) {
      await this.awardReward(userId, bonus);
    }

    return bonuses;
  }

  private async resetStreak(userId: string): Promise<void> {
    await prisma.profile.update({
      where: { userId },
      data: {
        dailyStreak: 0,
      },
    });

    this.emit("streakReset", { userId });
  }

  // ============================================================================
  // Lucky Wheel
  // ============================================================================

  /**
   * Spin the lucky wheel
   */
  async spinLuckyWheel(userId: string): Promise<{
    success: boolean;
    segment: LuckyWheelSegment;
    reward: EventReward;
    remainingSpins: number;
    error?: string;
  }> {
    if (!this.luckyWheel) {
      return { success: false, segment: null as unknown as LuckyWheelSegment, reward: null as unknown as EventReward, remainingSpins: 0, error: "Wheel not configured" };
    }

    // Check spins available
    const cacheKey = `wheel:${userId}:${new Date().toDateString()}`;
    const spinsUsed = parseInt(await this.redis.get(cacheKey) ?? "0", 10);

    if (spinsUsed >= this.luckyWheel.dailySpins) {
      return { success: false, segment: null as unknown as LuckyWheelSegment, reward: null as unknown as EventReward, remainingSpins: 0, error: "No spins remaining" };
    }

    // Check if user has enough currency
    const profile = await prisma.profile.findUnique({
      where: { userId },
    });

    if (!profile) throw new Error("User not found");

    if (this.luckyWheel.currency === "coins" && profile.coins < this.luckyWheel.spinCost) {
      return { success: false, segment: null as unknown as LuckyWheelSegment, reward: null as unknown as EventReward, remainingSpins: 0, error: "Insufficient coins" };
    }

    if (this.luckyWheel.currency === "gems" && profile.gems < this.luckyWheel.spinCost) {
      return { success: false, segment: null as unknown as LuckyWheelSegment, reward: null as unknown as EventReward, remainingSpins: 0, error: "Insufficient gems" };
    }

    // Deduct cost
    if (this.luckyWheel.currency === "coins") {
      await this.deductCoins(userId, this.luckyWheel.spinCost, "lucky_wheel");
    } else {
      await this.deductGems(userId, this.luckyWheel.spinCost, "lucky_wheel");
    }

    // Select winning segment based on probability
    const segment = this.selectRandomSegment(this.luckyWheel.segments);

    // Award reward
    await this.awardReward(userId, segment.reward);

    // Update spins used
    await this.redis.incr(cacheKey);
    await this.redis.expire(cacheKey, 24 * 60 * 60);

    const remainingSpins = this.luckyWheel.dailySpins - (spinsUsed + 1);

    return {
      success: true,
      segment,
      reward: segment.reward,
      remainingSpins,
    };
  }

  /**
   * Configure lucky wheel
   */
  setLuckyWheelConfig(config: LuckyWheelConfig): void {
    this.luckyWheel = config;
  }

  private selectRandomSegment(segments: LuckyWheelSegment[]): LuckyWheelSegment {
    const totalProbability = segments.reduce((sum, s) => sum + s.probability, 0);
    let random = Math.random() * totalProbability;

    for (const segment of segments) {
      random -= segment.probability;
      if (random <= 0) {
        return segment;
      }
    }

    return segments[segments.length - 1]!;
  }

  // ============================================================================
  // Loot Box System
  // ============================================================================

  /**
   * Open a loot box
   */
  async openLootBox(userId: string, lootBoxId: string): Promise<{
    success: boolean;
    items: LootBoxItem[];
    error?: string;
  }> {
    const lootBox = this.lootBoxes.get(lootBoxId);
    if (!lootBox) {
      return { success: false, items: [], error: "Loot box not found" };
    }

    // Check user has enough currency
    const profile = await prisma.profile.findUnique({
      where: { userId },
    });

    if (!profile) throw new Error("User not found");

    // Deduct cost
    let deducted = false;
    if (lootBox.currency === "coins") {
      const result = await this.deductCoins(userId, lootBox.price, `loot_box:${lootBoxId}`);
      deducted = result.success;
    } else if (lootBox.currency === "gems") {
      const result = await this.deductGems(userId, lootBox.price, `loot_box:${lootBoxId}`);
      deducted = result.success;
    }

    if (!deducted) {
      return { success: false, items: [], error: "Insufficient funds" };
    }

    // Select items based on drop rates
    const items = this.selectLootBoxItems(lootBox);

    // Award items
    for (const item of items) {
      // Add to inventory (simplified)
      await this.awardReward(userId, {
        type: "item",
        itemId: item.itemId,
        rarity: item.rarity as "common" | "rare" | "epic" | "legendary",
      });
    }

    return { success: true, items };
  }

  /**
   * Register a loot box
   */
  registerLootBox(config: LootBoxConfig): void {
    this.lootBoxes.set(config.id, config);
  }

  private selectLootBoxItems(lootBox: LootBoxConfig): LootBoxItem[] {
    const items: LootBoxItem[] = [];
    const rarity = this.selectRarity(lootBox.dropRates);
    
    const availableItems = lootBox.items.filter(i => i.rarity === rarity);
    if (availableItems.length > 0) {
      const randomItem = availableItems[Math.floor(Math.random() * availableItems.length)]!;
      items.push(randomItem);
    }

    return items;
  }

  private selectRarity(dropRates: { rarity: string; probability: number }[]): string {
    const total = dropRates.reduce((sum, d) => sum + d.probability, 0);
    let random = Math.random() * total;

    for (const rate of dropRates) {
      random -= rate.probability;
      if (random <= 0) {
        return rate.rarity;
      }
    }

    return "common";
  }

  // ============================================================================
  // Premium & VIP
  // ============================================================================

  /**
   * Activate premium membership
   */
  async activatePremium(userId: string, durationDays: number): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + durationDays);

    await prisma.user.update({
      where: { id: userId },
      data: {
        profile: {
          update: {
            premium: true,
            premiumExpiresAt: expiresAt,
          },
        },
      },
    });

    this.emit("premiumActivated", { userId, expiresAt });
  }

  /**
   * Check if user has active premium
   */
  async hasPremium(userId: string): Promise<boolean> {
    const profile = await prisma.profile.findUnique({
      where: { userId },
    });

    if (!profile?.premium) return false;
    if (!profile.premiumExpiresAt) return true;

    return new Date(profile.premiumExpiresAt) > new Date();
  }

  /**
   * Grant VIP level
   */
  async setVipLevel(userId: string, level: number): Promise<void> {
    await prisma.profile.update({
      where: { userId },
      data: {
        vipLevel: level,
      },
    });

    this.emit("vipLevelChanged", { userId, level });
  }

  // ============================================================================
  // Battle Pass
  // ============================================================================

  /**
   * Activate battle pass
   */
  async activateBattlePass(userId: string): Promise<void> {
    await prisma.profile.update({
      where: { userId },
      data: {
        battlePassActive: true,
      },
    });

    this.emit("battlePassActivated", { userId });
  }

  /**
   * Add battle pass XP
   */
  async addBattlePassXp(userId: string, amount: number): Promise<{
    tier: number;
    xp: number;
    tierUp: boolean;
  }> {
    const profile = await prisma.profile.findUnique({
      where: { userId },
    });

    if (!profile?.battlePassActive) {
      return { tier: 0, xp: 0, tierUp: false };
    }

    let newXp = profile.battlePassXp + amount;
    let newTier = profile.battlePassTier;
    let tierUp = false;

    // Check for tier up (1000 XP per tier)
    const xpPerTier = 1000;
    while (newXp >= xpPerTier) {
      newTier++;
      newXp -= xpPerTier;
      tierUp = true;

      // Award tier rewards
      await this.awardBattlePassTierRewards(userId, newTier);
    }

    await prisma.profile.update({
      where: { userId },
      data: {
        battlePassTier: newTier,
        battlePassXp: newXp,
      },
    });

    return { tier: newTier, xp: newXp, tierUp };
  }

  private async awardBattlePassTierRewards(userId: string, tier: number): Promise<void> {
    // Award rewards based on tier
    const rewards: EventReward[] = [];

    if (tier <= 10) {
      rewards.push({ type: "coins", amount: tier * 100 });
    } else if (tier <= 20) {
      rewards.push({ type: "gems", amount: (tier - 10) * 10 });
    } else {
      rewards.push({ type: "item", itemId: `bp_tier_${tier}`, rarity: "rare" });
    }

    for (const reward of rewards) {
      await this.awardReward(userId, reward);
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private async awardReward(userId: string, reward: EventReward): Promise<void> {
    switch (reward.type) {
      case "xp":
        await this.awardXp(userId, reward.amount ?? 0, "reward", 1);
        break;
      case "coins":
        await this.awardCoins(userId, reward.amount ?? 0, "reward");
        break;
      case "gems":
        await this.awardGems(userId, reward.amount ?? 0, "reward");
        break;
      case "item":
        // Add to inventory (would be implemented in monetization module)
        break;
    }
  }

  private async logEconomyAction(
    userId: string,
    action: string,
    amount: number,
    source: string
  ): Promise<void> {
    await prisma.auditLog.create({
      data: {
        actorType: "user",
        actorId: userId,
        action: `economy_${action}`,
        category: "economy",
        targetType: "user",
        targetId: userId,
        meta: { amount, source },
      },
    });
  }
}
