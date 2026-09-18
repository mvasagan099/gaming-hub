import type { GameId } from "./games";
import type { UserAchievement } from "./notification";
import type { TournamentStatus, TournamentFormat } from "./tournament";

export type ReferralStatus = "PENDING" | "QUALIFIED" | "REWARDED" | "REVERSED" | "CANCELLED" | "COMPLETED";

export interface Referral {
  id: string;
  code: string;
  referrerId: string;
  referredUserId: string;
  status: ReferralStatus;
  commission: number;
  referredReward?: number;
  qualifiedAt?: string | null;
  rewardedAt?: string | null;
  reversedAt?: string | null;
  reversalReason?: string | null;
  createdAt: string;
  referredUser?: PublicUserSummary;
}

export interface AffiliateCommissionRecord {
  id: string;
  referrerId: string;
  referredUserId: string;
  refereeUsername?: string;
  referralId?: string | null;
  sourceType: string;
  sourceId: string;
  depositAmount: number;
  commissionPercent: number;
  commissionAmount: number;
  affiliateMode?: string;
  status: string;
  reversalReason?: string | null;
  reversedAt?: string | null;
  reversedBy?: string | null;
  createdAt: string;
}

export interface AffiliateSummary {
  totalReferredUsers: number;
  activeReferrals: number;
  totalAffiliateEarnings: number;
  thisMonthEarnings: number;
  commissionPercent: number;
  affiliateMode?: "ONE_TIME" | "CONTINUOUS";
  affiliateEnabled?: boolean;
}

export interface AdminAffiliateStats {
  affiliateStatus: "ENABLED" | "DISABLED";
  affiliateMode: "ONE_TIME" | "CONTINUOUS";
  commissionPercent: number;
  totalAffiliateEarnings: number;
  totalCommissions: number;
  activeReferrals: number;
  affiliateUsers: number;
  thisMonthPaid: number;
}

export interface AdminCommissionItem {
  id: string;
  referrerId: string;
  referrerUsername: string;
  referrerDisplayName: string;
  referredUserId: string;
  referredUsername: string;
  referredDisplayName: string;
  referralId: string | null;
  sourceType: string;
  sourceId: string;
  depositAmount: number;
  commissionPercent: number;
  commissionAmount: number;
  affiliateMode: string;
  status: string;
  createdAt: string;
  reversalReason?: string | null;
  reversedAt?: string | null;
  reversedBy?: string | null;
}

export interface AdminAffiliateAuditItem {
  id: string;
  actorId: string;
  actorUsername: string;
  action: string;
  createdAt: string;
  meta: {
    previous?: Record<string, unknown>;
    updated?: Record<string, unknown>;
  } | null;
}

export interface ReferralSummary {
  code: string;
  totalReferrals: number;
  qualifiedReferrals: number;
  completedReferrals: number;
  pendingReferrals: number;
  totalCommission: number;
  totalEarned?: number;
  shareUrl: string;
  referredByCode?: string | null;
  referrerUsername?: string | null;
  referredStatus?: string | null;
  referredReward?: number | null;
  affiliate?: AffiliateSummary;
}

export interface ReferralLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  referralCount: number;
  commission: number;
}

export interface AdminReferralStats {
  totalReferrals: number;
  qualifiedReferrals: number;
  rewardedReferrals: number;
  pendingReferrals: number;
  reversedReferrals: number;
  totalRewardsDistributed: number;
  conversionRate: number;
  suspiciousReferralsCount: number;
  topReferrers: ReferralLeaderboardEntry[];
}

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

export type CouponDiscountType = "PERCENT" | "FIXED";
export type CouponStatus = "ACTIVE" | "INACTIVE" | "EXPIRED";

export interface Coupon {
  id: string;
  code: string;
  title: string;
  description: string | null;
  discountType: CouponDiscountType;
  discountValue: number;
  maxUses: number;
  usedCount: number;
  minWager: number;
  maxRedeemValue: number | null;
  gameId: GameId | null;
  validFrom: string;
  validUntil: string;
  status: CouponStatus;
  createdAt: string;
}

export interface CouponRedemption {
  id: string;
  coupon: Coupon;
  value: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export type AnnouncementType = "INFO" | "UPDATE" | "MAINTENANCE" | "PROMOTION" | "ALERT";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  type: AnnouncementType;
  imageUrl: string | null;
  targetRole: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  read: boolean;
}

// ---------------------------------------------------------------------------
// Messages (DM)
// ---------------------------------------------------------------------------

export interface ConversationSummary {
  id: string;
  otherUser: PublicUserSummary;
  lastMessage: MessageSummary | null;
  unreadCount: number;
  updatedAt: string;
}

export interface MessageSummary {
  id: string;
  senderId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface MessagePage {
  items: Message[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Block list
// ---------------------------------------------------------------------------

export interface BlockedUser {
  id: string;
  blockedId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Support tickets (CRM)
// ---------------------------------------------------------------------------

export type TicketStatus = "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface SupportTicket {
  id: string;
  userId: string;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  user?: PublicUserSummary;
  messages?: TicketMessage[];
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  senderId: string;
  body: string;
  isStaff: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Login sessions / devices
// ---------------------------------------------------------------------------

export interface LoginSession {
  id: string;
  ip: string | null;
  userAgent: string | null;
  deviceName: string | null;
  browserName?: string | null;
  isCurrent: boolean;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type SearchType =
  | "GLOBAL"
  | "ALL"
  | "USERS"
  | "PLAYERS"
  | "GAMES"
  | "TOURNAMENTS"
  | "EVENTS"
  | "ACHIEVEMENTS"
  | "TICKETS"
  | "COUPONS";

export interface EventSearchResult {
  id: string;
  title: string;
  description: string;
  type: string;
  status: "UPCOMING" | "ACTIVE" | "ENDED";
  startsAt: string | null;
  expiresAt: string | null;
  imageUrl?: string | null;
}

export interface AchievementSearchResult {
  id: string;
  code: string;
  title: string;
  description: string;
  category: string;
  rarity: string;
  icon: string;
  xpReward: number;
  unlocked?: boolean;
}

export interface SearchResults {
  users: PublicUserSummary[];
  players?: PublicUserSummary[];
  games: GameSearchResult[];
  tournaments: TournamentSummary[];
  events: EventSearchResult[];
  achievements: AchievementSearchResult[];
  tickets: SupportTicketSearchResult[];
  coupons: CouponSearchResult[];
  total: number;
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
}

export interface SupportTicketSearchResult {
  id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
}

export interface CouponSearchResult {
  id: string;
  code: string;
  title: string;
  value: number;
  createdAt: string;
}

export interface GameSearchResult {
  gameId: GameId;
  name: string;
  description: string;
  icon: string;
  playersOnline: number;
}

export interface SearchSuggestion {
  query: string;
  type: SearchType;
}

// ---------------------------------------------------------------------------
// Tournaments
// ---------------------------------------------------------------------------

// TournamentStatus and TournamentFormat are defined in ./tournament.ts
// (imported above for use in TournamentSummary interface)


export interface TournamentSummary {
  id: string;
  gameId: GameId;
  title: string;
  description: string;
  format: TournamentFormat;
  prizePool: number;
  entryFee: number;
  minPlayers: number;
  maxPlayers: number;
  registeredCount: number;
  grossPool: number;
  startTime: string;
  registrationStartsAt: string | null;
  registrationEndsAt: string | null;
  status: TournamentStatus;
  autoStartWhenFull: boolean;
}

export interface TournamentDetail extends TournamentSummary {
  bannerUrl: string | null;
  rules: Record<string, unknown>;
  endTime: string | null;
  prizeDistribution: unknown;
  stateVersion: number;
  registered: boolean;
  players: TournamentPlayerEntry[];
}

export interface TournamentPlayerEntry {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  seed: number | null;
  result: number | null;
}

// ---------------------------------------------------------------------------
// Monitoring / analytics
// ---------------------------------------------------------------------------

export interface SystemMetrics {
  uptimeSeconds: number;
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
  cpuUsage: number;
  activeConnections: number;
  timestamp: string;
}

export interface DashboardCounts {
  users: number;
  activeUsers: number;
  newUsersToday: number;
  matches: number;
  liveMatches: number;
  rooms: number;
  transactions: number;
  transactionVolume: number;
  tournaments: number;
  onlineUsers: number;
  referrals: number;
  supportTickets: number;
  openTickets: number;
  errorsToday: number;
}

export interface AnalyticsSeriesPoint {
  date: string;
  value: number;
}

export interface AnalyticsSnapshot {
  revenue: number;
  wagers: number;
  payouts: number;
  deposits: number;
  withdrawals: number;
  newUsers: number;
  activeUsers: number;
  matches: number;
}

export interface UserGrowthPoint {
  date: string;
  signups: number;
  active: number;
}

// ---------------------------------------------------------------------------
// Admin customer 360 (CRM)
// ---------------------------------------------------------------------------

export interface AdminCustomerStatLine {
  id: string;
  gameId: GameId | null;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  bestScore: number;
  totalXp: number;
  rating: number;
}

export interface AdminCustomerMatchLine {
  id: string;
  gameId: GameId;
  status: string;
  stake: number;
  createdAt: string;
  result: string;
  score: number;
}

export interface AdminCustomerTicketLine {
  id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
}

export interface AdminCustomerReferralLine {
  id: string;
  code: string;
  status: ReferralStatus;
  commission: number;
  createdAt: string;
  referredUser: PublicUserSummary;
}

export interface AdminCustomerDetail {
  user: {
    id: string;
    username: string;
    displayName: string;
    email: string | null;
    avatarUrl: string | null;
    role: string;
    isOnline: boolean;
    lastSeenAt: string | null;
    createdAt: string;
  };
  profile: {
    bio: string | null;
    country: string | null;
    phone: string | null;
    currency: string | null;
    coins: number;
    gems: number;
    xp: number;
    level: number;
    wins: number;
    losses: number;
    draws: number;
    referredBy: string | null;
  } | null;
  wallet: {
    balance: number;
    bonusBalance: number;
    lockedBalance: number;
    rewardBalance: number;
    cashbackBalance: number;
  } | null;
  statistics: AdminCustomerStatLine[];
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    walletType: string;
    referenceType: string;
    createdAt: string;
  }>;
  tickets: AdminCustomerTicketLine[];
  referrals: AdminCustomerReferralLine[];
  sessions: LoginSession[];
  matches: AdminCustomerMatchLine[];
  achievements: UserAchievement[];
}

// ---------------------------------------------------------------------------
// Monitoring health
// ---------------------------------------------------------------------------

export interface HealthCheckResult {
  name: string;
  status: "up" | "down" | "degraded";
  latencyMs: number;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Extended analytics
// ---------------------------------------------------------------------------

export interface CouponUsageStat {
  code: string;
  title: string;
  redemptions: number;
  value: number;
}

export interface TournamentParticipationStat {
  title: string;
  format: string;
  status: string;
  registeredCount: number;
  prizePool: number;
}

export interface CountryDistributionPoint {
  country: string | null;
  users: number;
}

export interface SupportStats {
  open: number;
  pending: number;
  resolved: number;
  closed: number;
  highPriority: number;
  unassigned: number;
}

// ---------------------------------------------------------------------------
// Error center
// ---------------------------------------------------------------------------

export type ErrorSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ErrorStatus = "OPEN" | "INVESTIGATING" | "RESOLVED" | "IGNORED";

export interface ErrorEventView {
  id: string;
  code: string;
  message: string;
  severity: ErrorSeverity;
  status: ErrorStatus;
  source: string | null;
  path: string | null;
  method: string | null;
  userId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  count: number;
}

// ---------------------------------------------------------------------------
// Automation
// ---------------------------------------------------------------------------

export type CronJobStatus = "SUCCESS" | "FAILED" | "RUNNING";

export interface CronJobRun {
  id: string;
  jobName: string;
  status: CronJobStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

export interface FeatureFlagGroup {
  key: string;
  label: string;
  description: string;
  flags: FeatureFlagEntry[];
}

export interface FeatureFlagEntry {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Generic
// ---------------------------------------------------------------------------

export interface PublicUserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isOnline: boolean;
  level?: number;
  xp?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  globalRating?: number;
  createdAt?: string;
}
