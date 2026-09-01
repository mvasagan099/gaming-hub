/**
 * Enterprise Types
 * Core type definitions for the enterprise platform
 */

import type { JsonObject } from "@gaming-hub/shared";

export type { JsonObject };

// ============================================================================
// Feature Flags & Remote Configuration
// ============================================================================

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description?: string;
  enabled: boolean;
  targetAudience: TargetAudience;
  rolloutPercentage: number;
  conditions?: FeatureCondition[];
  metadata?: JsonObject;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

export interface TargetAudience {
  userRoles?: string[];
  userIds?: string[];
  countries?: string[];
  platforms?: string[];
  appVersions?: string[];
}

export interface FeatureCondition {
  type: "user_property" | "custom" | "experiment";
  property?: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains";
  value: unknown;
}

export interface RemoteConfig {
  id: string;
  key: string;
  value: JsonObject;
  environment: "development" | "staging" | "production";
  version: number;
  isSecret: boolean;
  updatedBy: string;
  updatedAt: Date;
}

// ============================================================================
// Live Events & Seasons
// ============================================================================

export interface LiveEvent {
  id: string;
  name: string;
  description?: string;
  type: "seasonal" | "promotional" | "tournament" | "special";
  startTime: Date;
  endTime: Date;
  timezone: string;
  status: "scheduled" | "active" | "paused" | "ended" | "cancelled";
  targetAudience: TargetAudience;
  rewards?: EventReward[];
  config?: JsonObject;
  bannerUrl?: string;
  metadata?: JsonObject;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventReward {
  type: "xp" | "coins" | "gems" | "item" | "badge" | "title";
  amount?: number;
  itemId?: string;
  rarity?: "common" | "rare" | "epic" | "legendary";
}

export interface GameSeason {
  id: string;
  number: number;
  name: string;
  gameId: string;
  startDate: Date;
  endDate: Date;
  theme?: string;
  rewards: SeasonReward[];
  battlePass?: BattlePassConfig;
  status: "upcoming" | "active" | "ended";
  leaderboardReset: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SeasonReward {
  tier: number;
  xpRequired: number;
  freeReward?: EventReward;
  premiumReward?: EventReward;
}

export interface BattlePassConfig {
  price: number;
  currency: "coins" | "gems" | "usd";
  tiers: number;
  instantUnlockTiers?: number;
  bonusXpPercent: number;
}

// ============================================================================
// Maintenance & Operations
// ============================================================================

export interface MaintenanceWindow {
  id: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  title: string;
  description?: string;
  affectedServices: string[];
  isEmergency: boolean;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  createdBy: string;
  createdAt: Date;
}

export interface ServerBroadcast {
  id: string;
  message: string;
  type: "info" | "warning" | "critical" | "maintenance";
  durationSeconds: number;
  dismissible: boolean;
  targetAudience: TargetAudience;
  scheduledAt?: Date;
  createdBy: string;
  createdAt: Date;
}

export interface GlobalAnnouncement {
  id: string;
  title: string;
  body: string;
  type: "info" | "update" | "promotion" | "alert" | "maintenance";
  priority: "low" | "medium" | "high" | "urgent";
  imageUrl?: string;
  actionUrl?: string;
  buttonText?: string;
  targetAudience: TargetAudience;
  scheduledAt?: Date;
  expiresAt?: Date;
  dismissedBy: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// AI & Machine Learning
// ============================================================================

export interface AIModel {
  id: string;
  name: string;
  type: "matchmaking" | "cheat_detection" | "toxicity" | "spam" | "fraud" | "recommendation";
  version: string;
  status: "active" | "training" | "deprecated" | "disabled";
  config: AIModelConfig;
  accuracy?: number;
  precision?: number;
  recall?: number;
  lastTrainedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIModelConfig {
  threshold: number;
  features: string[];
  hyperparameters?: JsonObject;
  trainingDataSize?: number;
}

export interface AIPrediction {
  id: string;
  modelId: string;
  input: JsonObject;
  output: JsonObject;
  confidence: number;
  timestamp: Date;
}

export interface GameAction {
  type: string;
  playerId?: string;
  timestamp?: number;
  data?: JsonObject;
  isOptimal?: boolean;
}

export interface RiskScore {
  userId: string;
  score: number;
  level: "low" | "medium" | "high" | "critical";
  factors: RiskFactor[];
  calculatedAt: Date;
}

export interface RiskFactor {
  type: string;
  weight: number;
  contribution: number;
}

// ============================================================================
// Economy
// ============================================================================

export interface UserEconomy {
  userId: string;
  xp: number;
  level: number;
  totalXp: number;
  coins: number;
  gems: number;
  rewardPoints: number;
  vipLevel: number;
  vipExpiresAt?: Date;
  premium: boolean;
  premiumExpiresAt?: Date;
  dailyStreak: number;
  lastDailyClaim: Date;
  lastWeeklyClaim?: Date;
  lastMonthlyClaim?: Date;
  battlePassActive: boolean;
  battlePassTier: number;
  battlePassXp: number;
  updatedAt: Date;
}

export interface DailyReward {
  day: number;
  rewards: EventReward[];
  bonusForStreak?: number;
}

export interface LuckyWheelConfig {
  id: string;
  name: string;
  segments: LuckyWheelSegment[];
  dailySpins: number;
  spinCost: number;
  currency: "coins" | "gems";
}

export interface LuckyWheelSegment {
  id: string;
  reward: EventReward;
  probability: number;
  color: string;
}

export interface LootBoxConfig {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  price: number;
  currency: "coins" | "gems" | "usd";
  dropRates: LootBoxDropRate[];
  items: LootBoxItem[];
}

export interface LootBoxDropRate {
  rarity: string;
  probability: number;
}

export interface LootBoxItem {
  id: string;
  itemId: string;
  rarity: string;
  quantity: number;
}

// ============================================================================
// Monetization
// ============================================================================

export interface StoreItem {
  id: string;
  type: "avatar" | "theme" | "frame" | "emoji" | "booster" | "currency" | "bundle";
  name: string;
  description?: string;
  imageUrl?: string;
  price: number;
  currency: "coins" | "gems" | "usd";
  originalPrice?: number;
  isLimited: boolean;
  quantity?: number;
  availableFrom?: Date;
  availableUntil?: Date;
  targetAudience?: TargetAudience;
  metadata?: JsonObject;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserInventoryItem {
  id: string;
  userId: string;
  itemId: string;
  type: string;
  quantity: number;
  acquiredAt: Date;
  expiresAt?: Date;
  isEquipped: boolean;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  description?: string;
  tier: "bronze" | "silver" | "gold" | "platinum";
  price: number;
  currency: string;
  interval: "monthly" | "yearly";
  features: SubscriptionFeature[];
  rewards: EventReward[];
  isActive: boolean;
}

export interface SubscriptionFeature {
  name: string;
  description?: string;
  value?: string | number | boolean;
}

export interface UserSubscription {
  id: string;
  userId: string;
  planId: string;
  status: "active" | "cancelled" | "expired" | "past_due";
  startedAt: Date;
  expiresAt: Date;
  cancelledAt?: Date;
  autoRenew: boolean;
  paymentMethod?: string;
  externalSubscriptionId?: string;
}

export interface Coupon {
  id: string;
  code: string;
  name: string;
  description?: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  maxUses: number;
  usedCount: number;
  minPurchase?: number;
  maxDiscount?: number;
  appliesTo: string[];
  validFrom: Date;
  validUntil: Date;
  createdBy: string;
  createdAt: Date;
}

export interface Gift {
  id: string;
  senderId: string;
  recipientId: string;
  itemId: string;
  itemType: string;
  quantity: number;
  message?: string;
  status: "pending" | "accepted" | "declined" | "expired";
  sentAt: Date;
  expiresAt: Date;
  respondedAt?: Date;
}

// ============================================================================
// Social Platform
// ============================================================================

export interface UserPresence {
  userId: string;
  status: "online" | "away" | "dnd" | "invisible" | "offline";
  gameId?: string;
  roomId?: string;
  activity?: string;
  lastSeen: Date;
  updatedAt: Date;
}

export interface UserActivity {
  id: string;
  userId: string;
  type: string;
  description: string;
  metadata?: JsonObject;
  isPublic: boolean;
  createdAt: Date;
}

export interface Party {
  id: string;
  name: string;
  leaderId: string;
  members: PartyMember[];
  maxSize: number;
  status: "open" | "locked" | "in_game" | "disbanded";
  gameId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PartyMember {
  userId: string;
  role: "leader" | "member";
  joinedAt: Date;
  isReady: boolean;
}

export interface Clan {
  id: string;
  name: string;
  tag: string;
  description?: string;
  iconUrl?: string;
  bannerUrl?: string;
  leaderId: string;
  officers: string[];
  members: ClanMember[];
  maxMembers: number;
  level: number;
  xp: number;
  requirements?: ClanRequirements;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClanMember {
  userId: string;
  role: "leader" | "officer" | "member";
  joinedAt: Date;
  contribution: number;
}

export interface ClanRequirements {
  minLevel?: number;
  minXp?: number;
  approvalRequired: boolean;
}

// ============================================================================
// Notifications
// ============================================================================

export interface NotificationChannel {
  id: string;
  name: string;
  type: "push" | "email" | "sms" | "in_app" | "webhook";
  isActive: boolean;
  config: NotificationChannelConfig;
}

export type NotificationChannelConfig = 
  | { type: "push"; firebaseConfig: JsonObject }
  | { type: "email"; smtpConfig: JsonObject }
  | { type: "sms"; twilioConfig: JsonObject }
  | { type: "in_app"; retentionDays: number }
  | { type: "webhook"; endpoint: string; secret: string };

export interface NotificationTemplate {
  id: string;
  name: string;
  type: string;
  channels: string[];
  subject?: string;
  body: string;
  data?: JsonObject;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduledNotification {
  id: string;
  templateId: string;
  userIds?: string[];
  targetAudience?: TargetAudience;
  scheduledAt: Date;
  status: "scheduled" | "sending" | "sent" | "cancelled" | "failed";
  sentCount?: number;
  failedCount?: number;
  createdBy: string;
  createdAt: Date;
}

export interface PushSubscription {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
  createdAt: Date;
}

// ============================================================================
// Analytics
// ============================================================================

export interface AnalyticsEvent {
  id: string;
  userId?: string;
  sessionId?: string;
  eventType: string;
  eventName: string;
  properties?: JsonObject;
  timestamp: Date;
  platform?: string;
  version?: string;
  country?: string;
}

export interface AnalyticsDashboard {
  id: string;
  name: string;
  description?: string;
  widgets: DashboardWidget[];
  filters?: DashboardFilter[];
  isDefault: boolean;
  isPublic: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardWidget {
  id: string;
  type: "metric" | "chart" | "table" | "funnel" | "cohort" | "retention";
  title: string;
  config: JsonObject;
  position: { x: number; y: number; w: number; h: number };
}

export interface DashboardFilter {
  field: string;
  operator: string;
  value: unknown;
}

export interface MetricDefinition {
  id: string;
  name: string;
  description?: string;
  category: string;
  calculation: "count" | "sum" | "avg" | "min" | "max" | "unique" | "custom";
  eventType?: string;
  eventProperty?: string;
  formula?: string;
  unit?: string;
  format?: "number" | "percent" | "currency" | "time" | "duration";
  isActive: boolean;
}

// ============================================================================
// Compliance
// ============================================================================

export interface DataExportRequest {
  id: string;
  userId: string;
  status: "pending" | "processing" | "completed" | "failed";
  requestedAt: Date;
  completedAt?: Date;
  expiresAt?: Date;
  downloadUrl?: string;
  fileSize?: number;
  dataTypes: string[];
}

export interface AccountDeletionRequest {
  id: string;
  userId: string;
  status: "pending" | "processing" | "completed" | "cancelled";
  reason?: string;
  requestedAt: Date;
  scheduledFor: Date;
  completedAt?: Date;
  cancelledAt?: Date;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  type: string;
  version: string;
  granted: boolean;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface PrivacySetting {
  userId: string;
  profileVisibility: "public" | "friends" | "private";
  activityVisibility: "public" | "friends" | "private";
  showOnlineStatus: boolean;
  allowFriendRequests: boolean;
  allowMessages: "everyone" | "friends" | "none";
  marketingEmails: boolean;
  analyticsOptIn: boolean;
  updatedAt: Date;
}

// ============================================================================
// Infrastructure
// ============================================================================

export interface WorkerJob {
  id: string;
  name: string;
  queue: string;
  data?: JsonObject;
  priority: number;
  attempts: number;
  maxAttempts: number;
  delay?: Date;
  status: "waiting" | "active" | "completed" | "failed" | "delayed";
  result?: JsonObject;
  error?: string;
  startedAt?: Date;
  finishedAt?: Date;
  createdAt: Date;
}

export interface HealthCheck {
  id: string;
  service: string;
  status: "healthy" | "degraded" | "unhealthy" | "unknown";
  latencyMs: number;
  lastCheckedAt: Date;
  message?: string;
  metadata?: JsonObject;
}

export interface ScalingEvent {
  id: string;
  service: string;
  action: "scale_up" | "scale_down" | "maintain";
  reason: string;
  fromInstances: number;
  toInstances: number;
  triggeredAt: Date;
  completedAt?: Date;
  success?: boolean;
}

// ============================================================================
// Security
// ============================================================================

export interface SecurityAuditLog {
  id: string;
  userId?: string;
  action: string;
  category: "auth" | "admin" | "game" | "payment" | "data" | "system";
  severity: "info" | "warning" | "critical";
  targetType?: string;
  targetId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: JsonObject;
  timestamp: Date;
}

export interface RateLimitRule {
  id: string;
  name: string;
  endpoint: string;
  method?: string;
  maxRequests: number;
  windowMs: number;
  scope: "global" | "ip" | "user";
  isActive: boolean;
}

export interface DeviceFingerprint {
  id: string;
  userId: string;
  fingerprint: string;
  deviceType?: string;
  os?: string;
  browser?: string;
  screenResolution?: string;
  timezone?: string;
  firstSeen: Date;
  lastSeen: Date;
  trustScore: number;
}

export interface FraudAlert {
  id: string;
  userId: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  evidence?: JsonObject;
  status: "open" | "investigating" | "resolved" | "false_positive";
  assignedTo?: string;
  createdAt: Date;
  resolvedAt?: Date;
}

// ============================================================================
// Automation
// ============================================================================

export interface CronJob {
  id: string;
  name: string;
  description?: string;
  schedule: string;
  timezone: string;
  handler: string;
  params?: JsonObject;
  isActive: boolean;
  lastRunAt?: Date;
  lastRunStatus?: "success" | "failed";
  lastRunDurationMs?: number;
  nextRunAt?: Date;
  createdBy: string;
  createdAt: Date;
}

export interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  isActive: boolean;
  runCount: number;
  lastTriggeredAt?: Date;
  createdBy: string;
  createdAt: Date;
}

export interface AutomationTrigger {
  type: "event" | "schedule" | "manual";
  eventType?: string;
  schedule?: string;
}

export interface AutomationCondition {
  field: string;
  operator: string;
  value: unknown;
}

export interface AutomationAction {
  type: string;
  params: JsonObject;
}
