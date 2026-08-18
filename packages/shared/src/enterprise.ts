import type { GameId } from "./games";
import type { UserAchievement } from "./notification";
import type { TournamentStatus, TournamentFormat } from "./tournament";

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

export type ReferralStatus = "PENDING" | "COMPLETED" | "REWARDED";

export interface Referral {
  id: string;
  code: string;
  referrerId: string;
  referredUserId: string;
  status: ReferralStatus;
  commission: number;
  createdAt: string;
  referredUser: PublicUserSummary;
}

export interface ReferralSummary {
  code: string;
  totalReferrals: number;
  completedReferrals: number;
  pendingReferrals: number;
  totalCommission: number;
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

export type SearchType = "GLOBAL" | "USERS" | "GAMES" | "TOURNAMENTS" | "TICKETS" | "COUPONS";

export interface SearchResults {
  users: PublicUserSummary[];
  games: GameSearchResult[];
  tournaments: TournamentSummary[];
  tickets: SupportTicketSearchResult[];
  coupons: CouponSearchResult[];
  total: number;
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
  maxPlayers: number;
  registeredCount: number;
  startTime: string;
  status: TournamentStatus;
}

export interface TournamentDetail extends TournamentSummary {
  bannerUrl: string | null;
  rules: Record<string, unknown>;
  endTime: string | null;
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
}
