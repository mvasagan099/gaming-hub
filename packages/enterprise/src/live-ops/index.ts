/**
 * Live Operations Module
 * 
 * Manages feature flags, remote configuration, live events, seasons,
 * maintenance windows, and global announcements.
 */

import { EventEmitter } from "events";
import { Redis } from "ioredis";
import { prisma } from "@gaming-hub/db";
import type {
  FeatureFlag,
  RemoteConfig,
  LiveEvent,
  GameSeason,
  MaintenanceWindow,
  ServerBroadcast,
  GlobalAnnouncement,
  TargetAudience,
} from "../types";

export interface LiveOpsConfig {
  redis: Redis;
  cachePrefix?: string;
  defaultCacheTtl?: number;
}

export class LiveOpsManager extends EventEmitter {
  private redis: Redis;
  private cachePrefix: string;
  private defaultCacheTtl: number;
  private activeBroadcasts = new Map<string, NodeJS.Timeout>();
  private featureFlags = new Map<string, FeatureFlag>();
  private remoteConfigs = new Map<string, RemoteConfig>();

  constructor(config: LiveOpsConfig) {
    super();
    this.redis = config.redis;
    this.cachePrefix = config.cachePrefix ?? "liveops:";
    this.defaultCacheTtl = config.defaultCacheTtl ?? 300; // 5 minutes
  }

  // ============================================================================
  // Feature Flags
  // ============================================================================

  /**
   * Check if a feature is enabled for a user
   */
  async isFeatureEnabled(
    featureKey: string,
    userId?: string,
    userProperties?: Record<string, unknown>
  ): Promise<boolean> {
    const cacheKey = `${this.cachePrefix}flag:${featureKey}`;
    
    // Try cache first
    let flag = this.featureFlags.get(featureKey);
    if (!flag) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        flag = JSON.parse(cached);
        this.featureFlags.set(featureKey, flag);
      }
    }

    // If not in cache, fetch from database
    if (!flag) {
      flag = await prisma.featureFlag.findUnique({
        where: { key: featureKey },
      }) as unknown as FeatureFlag | null;
      
      if (flag) {
        this.featureFlags.set(featureKey, flag);
        await this.redis.setex(cacheKey, this.defaultCacheTtl, JSON.stringify(flag));
      }
    }

    if (!flag || !flag.enabled) {
      return false;
    }

    // Check if expired
    if (flag.expiresAt && new Date(flag.expiresAt) < new Date()) {
      return false;
    }

    // Check audience targeting
    if (flag.targetAudience && userId) {
      const matchesAudience = await this.matchesTargetAudience(
        flag.targetAudience,
        userId,
        userProperties
      );
      if (!matchesAudience) {
        return false;
      }
    }

    // Rollout percentage
    if (flag.rolloutPercentage < 100 && userId) {
      const userHash = this.hashUserId(userId);
      return userHash % 100 < flag.rolloutPercentage;
    }

    return true;
  }

  /**
   * Get all feature flags for a user
   */
  async getUserFeatureFlags(
    userId: string,
    userProperties?: Record<string, unknown>
  ): Promise<Record<string, boolean>> {
    const flags = await prisma.featureFlag.findMany({
      where: { enabled: true },
    }) as unknown as FeatureFlag[];

    const result: Record<string, boolean> = {};
    
    for (const flag of flags) {
      result[flag.key] = await this.isFeatureEnabled(flag.key, userId, userProperties);
    }

    return result;
  }

  /**
   * Create or update a feature flag
   */
  async setFeatureFlag(flag: Partial<FeatureFlag>): Promise<FeatureFlag> {
    const existing = await prisma.featureFlag.upsert({
      where: { key: flag.key! },
      create: {
        key: flag.key!,
        name: flag.name!,
        description: flag.description,
        enabled: flag.enabled ?? false,
        targetAudience: flag.targetAudience as object,
        rolloutPercentage: flag.rolloutPercentage ?? 0,
        conditions: flag.conditions as object[],
        metadata: flag.metadata as object,
        expiresAt: flag.expiresAt,
      },
      update: {
        name: flag.name,
        description: flag.description,
        enabled: flag.enabled,
        targetAudience: flag.targetAudience as object,
        rolloutPercentage: flag.rolloutPercentage,
        conditions: flag.conditions as object[],
        metadata: flag.metadata as object,
        expiresAt: flag.expiresAt,
        updatedAt: new Date(),
      },
    }) as unknown as FeatureFlag;

    // Update cache
    this.featureFlags.set(existing.key, existing);
    await this.redis.setex(
      `${this.cachePrefix}flag:${existing.key}`,
      this.defaultCacheTtl,
      JSON.stringify(existing)
    );

    this.emit("flagUpdated", existing);
    return existing;
  }

  /**
   * Delete a feature flag
   */
  async deleteFeatureFlag(key: string): Promise<void> {
    await prisma.featureFlag.delete({ where: { key } });
    this.featureFlags.delete(key);
    await this.redis.del(`${this.cachePrefix}flag:${key}`);
    this.emit("flagDeleted", key);
  }

  // ============================================================================
  // Remote Configuration
  // ============================================================================

  /**
   * Get remote config value
   */
  async getRemoteConfig(
    key: string,
    environment: string = "production"
  ): Promise<RemoteConfig | null> {
    const cacheKey = `${this.cachePrefix}config:${environment}:${key}`;
    
    // Try cache
    let config = this.remoteConfigs.get(`${environment}:${key}`);
    if (!config) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        config = JSON.parse(cached);
        this.remoteConfigs.set(`${environment}:${key}`, config);
      }
    }

    // Fetch from database
    if (!config) {
      config = await prisma.remoteConfig.findUnique({
        where: { key_environment: { key, environment } },
      }) as unknown as RemoteConfig | null;
      
      if (config) {
        this.remoteConfigs.set(`${environment}:${key}`, config);
        await this.redis.setex(cacheKey, this.defaultCacheTtl, JSON.stringify(config));
      }
    }

    return config;
  }

  /**
   * Set remote config value
   */
  async setRemoteConfig(
    key: string,
    value: Record<string, unknown>,
    environment: string = "production",
    isSecret: boolean = false,
    updatedBy: string
  ): Promise<RemoteConfig> {
    const existing = await prisma.remoteConfig.findUnique({
      where: { key_environment: { key, environment } },
    });

    const config = await prisma.remoteConfig.upsert({
      where: { key_environment: { key, environment } },
      create: {
        key,
        value: value as object,
        environment,
        version: 1,
        isSecret,
        updatedBy,
      },
      update: {
        value: value as object,
        version: { increment: 1 },
        isSecret,
        updatedBy,
        updatedAt: new Date(),
      },
    }) as unknown as RemoteConfig;

    // Update cache
    this.remoteConfigs.set(`${environment}:${key}`, config);
    await this.redis.setex(
      `${this.cachePrefix}config:${environment}:${key}`,
      this.defaultCacheTtl,
      JSON.stringify(config)
    );

    this.emit("configUpdated", config);
    return config;
  }

  /**
   * Hot reload configuration
   */
  async hotReloadConfig(): Promise<void> {
    // Clear caches
    this.featureFlags.clear();
    this.remoteConfigs.clear();
    
    // Clear Redis keys
    const keys = await this.redis.keys(`${this.cachePrefix}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }

    // Reload from database
    const [flags, configs] = await Promise.all([
      prisma.featureFlag.findMany({ where: { enabled: true } }),
      prisma.remoteConfig.findMany(),
    ]);

    for (const flag of flags as unknown as FeatureFlag[]) {
      this.featureFlags.set(flag.key, flag);
      await this.redis.setex(
        `${this.cachePrefix}flag:${flag.key}`,
        this.defaultCacheTtl,
        JSON.stringify(flag)
      );
    }

    for (const config of configs as unknown as RemoteConfig[]) {
      this.remoteConfigs.set(`${config.environment}:${config.key}`, config);
      await this.redis.setex(
        `${this.cachePrefix}config:${config.environment}:${config.key}`,
        this.defaultCacheTtl,
        JSON.stringify(config)
      );
    }

    this.emit("configReloaded");
  }

  // ============================================================================
  // Live Events
  // ============================================================================

  /**
   * Schedule a live event
   */
  async scheduleLiveEvent(event: Partial<LiveEvent>): Promise<LiveEvent> {
    const created = await prisma.liveEvent.create({
      data: {
        name: event.name!,
        description: event.description,
        type: event.type!,
        startTime: event.startTime!,
        endTime: event.endTime!,
        timezone: event.timezone ?? "UTC",
        status: "scheduled",
        targetAudience: event.targetAudience as object,
        rewards: event.rewards as object[],
        config: event.config as object,
        bannerUrl: event.bannerUrl,
        metadata: event.metadata as object,
        createdBy: event.createdBy!,
      },
    }) as unknown as LiveEvent;

    // Schedule activation/deactivation
    this.scheduleEventActivation(created.id, created.startTime, created.endTime);

    this.emit("eventScheduled", created);
    return created;
  }

  /**
   * Get active live events
   */
  async getActiveEvents(userId?: string): Promise<LiveEvent[]> {
    const now = new Date();
    
    const events = await prisma.liveEvent.findMany({
      where: {
        status: "active",
        startTime: { lte: now },
        endTime: { gte: now },
      },
      orderBy: { startTime: "asc" },
    }) as unknown as LiveEvent[];

    if (userId) {
      // Filter by audience
      const filtered: LiveEvent[] = [];
      for (const event of events) {
        if (await this.matchesTargetAudience(event.targetAudience, userId)) {
          filtered.push(event);
        }
      }
      return filtered;
    }

    return events;
  }

  /**
   * Activate/deactivate events
   */
  async activateEvent(eventId: string): Promise<void> {
    const event = await prisma.liveEvent.update({
      where: { id: eventId },
      data: { status: "active" },
    }) as unknown as LiveEvent;

    this.emit("eventActivated", event);
  }

  async deactivateEvent(eventId: string): Promise<void> {
    const event = await prisma.liveEvent.update({
      where: { id: eventId },
      data: { status: "ended" },
    }) as unknown as LiveEvent;

    this.emit("eventDeactivated", event);
  }

  // ============================================================================
  // Game Seasons
  // ============================================================================

  /**
   * Create a new season
   */
  async createSeason(season: Partial<GameSeason>): Promise<GameSeason> {
    const created = await prisma.gameSeason.create({
      data: {
        number: season.number!,
        name: season.name!,
        gameId: season.gameId!,
        startDate: season.startDate!,
        endDate: season.endDate!,
        theme: season.theme,
        rewards: season.rewards as object[],
        battlePass: season.battlePass as object,
        status: "upcoming",
        leaderboardReset: season.leaderboardReset ?? false,
      },
    }) as unknown as GameSeason;

    // Schedule activation
    const delay = season.startDate!.getTime() - Date.now();
    if (delay > 0) {
      setTimeout(() => this.activateSeason(created.id), delay);
    }

    this.emit("seasonCreated", created);
    return created;
  }

  /**
   * Get current season for a game
   */
  async getCurrentSeason(gameId: string): Promise<GameSeason | null> {
    const now = new Date();
    
    const season = await prisma.gameSeason.findFirst({
      where: {
        gameId,
        status: "active",
        startDate: { lte: now },
        endDate: { gte: now },
      },
      orderBy: { number: "desc" },
    }) as unknown as GameSeason | null;

    return season;
  }

  /**
   * Activate/deactivate seasons
   */
  async activateSeason(seasonId: string): Promise<void> {
    const season = await prisma.gameSeason.update({
      where: { id: seasonId },
      data: { status: "active" },
    }) as unknown as GameSeason;

    // Handle leaderboard reset
    if (season.leaderboardReset) {
      await this.resetGameLeaderboard(season.gameId);
    }

    this.emit("seasonActivated", season);
  }

  async endSeason(seasonId: string): Promise<void> {
    const season = await prisma.gameSeason.update({
      where: { id: seasonId },
      data: { status: "ended" },
    }) as unknown as GameSeason;

    // Distribute season rewards
    await this.distributeSeasonRewards(season);

    this.emit("seasonEnded", season);
  }

  // ============================================================================
  // Maintenance Windows
  // ============================================================================

  /**
   * Schedule maintenance window
   */
  async scheduleMaintenance(
    window: Partial<MaintenanceWindow>
  ): Promise<MaintenanceWindow> {
    const created = await prisma.maintenanceWindow.create({
      data: {
        startTime: window.startTime!,
        endTime: window.endTime!,
        timezone: window.timezone ?? "UTC",
        title: window.title!,
        description: window.description,
        affectedServices: window.affectedServices!,
        isEmergency: window.isEmergency ?? false,
        status: "scheduled",
        createdBy: window.createdBy!,
      },
    }) as unknown as MaintenanceWindow;

    // Schedule broadcast
    this.scheduleMaintenanceBroadcast(created);

    this.emit("maintenanceScheduled", created);
    return created;
  }

  /**
   * Get active maintenance window
   */
  async getActiveMaintenance(): Promise<MaintenanceWindow | null> {
    const now = new Date();
    
    const window = await prisma.maintenanceWindow.findFirst({
      where: {
        status: "in_progress",
        startTime: { lte: now },
        endTime: { gte: now },
      },
    }) as unknown as MaintenanceWindow | null;

    return window;
  }

  /**
   * Check if in maintenance mode
   */
  async isMaintenanceMode(service?: string): Promise<boolean> {
    const window = await this.getActiveMaintenance();
    if (!window) return false;
    
    if (service) {
      return window.affectedServices.includes(service);
    }
    
    return true;
  }

  // ============================================================================
  // Server Broadcasts
  // ============================================================================

  /**
   * Send a server broadcast
   */
  async sendBroadcast(
    broadcast: Partial<ServerBroadcast>,
    io?: import("socket.io").Server
  ): Promise<ServerBroadcast> {
    const created = await prisma.serverBroadcast.create({
      data: {
        message: broadcast.message!,
        type: broadcast.type!,
        durationSeconds: broadcast.durationSeconds!,
        dismissible: broadcast.dismissible ?? true,
        targetAudience: broadcast.targetAudience as object,
        scheduledAt: broadcast.scheduledAt,
        createdBy: broadcast.createdBy!,
      },
    }) as unknown as ServerBroadcast;

    // Schedule or send immediately
    if (broadcast.scheduledAt && broadcast.scheduledAt > new Date()) {
      const delay = broadcast.scheduledAt.getTime() - Date.now();
      const timeout = setTimeout(() => {
        this.emitBroadcast(created, io);
      }, delay);
      this.activeBroadcasts.set(created.id, timeout);
    } else {
      await this.emitBroadcast(created, io);
    }

    this.emit("broadcastCreated", created);
    return created;
  }

  /**
   * Cancel a broadcast
   */
  async cancelBroadcast(broadcastId: string): Promise<void> {
    const timeout = this.activeBroadcasts.get(broadcastId);
    if (timeout) {
      clearTimeout(timeout);
      this.activeBroadcasts.delete(broadcastId);
    }

    await prisma.serverBroadcast.delete({ where: { id: broadcastId } });
    this.emit("broadcastCancelled", broadcastId);
  }

  // ============================================================================
  // Global Announcements
  // ============================================================================

  /**
   * Create a global announcement
   */
  async createAnnouncement(
    announcement: Partial<GlobalAnnouncement>
  ): Promise<GlobalAnnouncement> {
    const created = await prisma.globalAnnouncement.create({
      data: {
        title: announcement.title!,
        body: announcement.body!,
        type: announcement.type!,
        priority: announcement.priority!,
        imageUrl: announcement.imageUrl,
        actionUrl: announcement.actionUrl,
        buttonText: announcement.buttonText,
        targetAudience: announcement.targetAudience as object,
        scheduledAt: announcement.scheduledAt,
        expiresAt: announcement.expiresAt,
        createdBy: announcement.createdBy!,
      },
    }) as unknown as GlobalAnnouncement;

    this.emit("announcementCreated", created);
    return created;
  }

  /**
   * Get active announcements for a user
   */
  async getActiveAnnouncements(userId: string): Promise<GlobalAnnouncement[]> {
    const now = new Date();
    
    const announcements = await prisma.globalAnnouncement.findMany({
      where: {
        status: "active",
        OR: [
          { scheduledAt: { lte: now } },
          { scheduledAt: null },
        ],
        OR: [
          { expiresAt: { gte: now } },
          { expiresAt: null },
        ],
      },
      orderBy: [
        { priority: "desc" },
        { createdAt: "desc" },
      ],
    }) as unknown as GlobalAnnouncement[];

    // Filter by audience and dismissed
    const filtered: GlobalAnnouncement[] = [];
    for (const announcement of announcements) {
      if (announcement.dismissedBy?.includes(userId)) continue;
      if (await this.matchesTargetAudience(announcement.targetAudience, userId)) {
        filtered.push(announcement);
      }
    }

    return filtered;
  }

  /**
   * Dismiss announcement
   */
  async dismissAnnouncement(
    announcementId: string,
    userId: string
  ): Promise<void> {
    await prisma.globalAnnouncement.update({
      where: { id: announcementId },
      data: {
        dismissedBy: { push: userId },
      },
    });
  }

  // ============================================================================
  // Emergency Operations
  // ============================================================================

  /**
   * Emergency shutdown - close all rooms and prevent new games
   */
  async emergencyShutdown(reason: string): Promise<void> {
    // Set global maintenance flag
    await this.redis.set(`${this.cachePrefix}emergency`, "true", "EX", 3600);

    // Close all active rooms
    // This would be handled by the multiplayer framework
    this.emit("emergencyShutdown", { reason, timestamp: new Date() });
  }

  /**
   * Lift emergency shutdown
   */
  async liftEmergencyShutdown(): Promise<void> {
    await this.redis.del(`${this.cachePrefix}emergency`);
    this.emit("emergencyLifted", { timestamp: new Date() });
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async matchesTargetAudience(
    target: TargetAudience,
    userId: string,
    userProperties?: Record<string, unknown>
  ): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) return false;

    // Check user roles
    if (target.userRoles && !target.userRoles.includes(user.role)) {
      return false;
    }

    // Check specific user IDs
    if (target.userIds && !target.userIds.includes(userId)) {
      return false;
    }

    // Check countries
    if (target.countries && user.profile?.country) {
      if (!target.countries.includes(user.profile.country)) {
        return false;
      }
    }

    // Check app versions (would come from client)
    if (target.appVersions && userProperties?.appVersion) {
      if (!target.appVersions.includes(userProperties.appVersion as string)) {
        return false;
      }
    }

    return true;
  }

  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private scheduleEventActivation(
    eventId: string,
    startTime: Date,
    endTime: Date
  ): void {
    const startDelay = startTime.getTime() - Date.now();
    const endDelay = endTime.getTime() - Date.now();

    if (startDelay > 0) {
      setTimeout(() => this.activateEvent(eventId), startDelay);
    }
    if (endDelay > 0) {
      setTimeout(() => this.deactivateEvent(eventId), endDelay);
    }
  }

  private scheduleMaintenanceBroadcast(window: MaintenanceWindow): void {
    // Broadcast 15 minutes before maintenance
    const warningTime = new Date(window.startTime.getTime() - 15 * 60 * 1000);
    const delay = warningTime.getTime() - Date.now();

    if (delay > 0) {
      setTimeout(() => {
        this.emit("maintenanceWarning", window);
      }, delay);
    }
  }

  private async emitBroadcast(
    broadcast: ServerBroadcast,
    io?: import("socket.io").Server
  ): Promise<void> {
    if (io) {
      io.emit("server:broadcast", broadcast);
    }
    this.emit("broadcastEmitted", broadcast);
  }

  private async resetGameLeaderboard(gameId: string): Promise<void> {
    // Reset leaderboard logic
    await prisma.leaderboard.updateMany({
      where: { gameId },
      data: {
        score: 0,
        wins: 0,
        gamesPlayed: 0,
        winRate: 0,
      },
    });
  }

  private async distributeSeasonRewards(season: GameSeason): Promise<void> {
    // Get all players who participated
    const players = await prisma.playerStatistic.findMany({
      where: { gameId: season.gameId },
    });

    // Distribute rewards based on final tier
    for (const player of players) {
      // Calculate rewards based on participation/performance
      // This is a simplified version
    }
  }
}

export * from "./types";
