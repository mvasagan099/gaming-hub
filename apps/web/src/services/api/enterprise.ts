import { apiClient } from './client';
import type {
  Achievement,
  AdminCustomerDetail,
  Announcement,
  AnalyticsSnapshot,
  AnalyticsSeriesPoint,
  AppNotification,
  BlockedUser,
  ConversationSummary,
  Coupon,
  CouponRedemption,
  CouponUsageStat,
  CountryDistributionPoint,
  CronJobRun,
  DashboardCounts,
  ErrorEventView,
  FeatureFlagGroup,
  FriendRequest,
  HealthCheckResult,
  LoginSession,
  Message,
  MessagePage,
  PublicProfile,
  RankedLeaderboardPage,
  Referral,
  ReferralLeaderboardEntry,
  ReferralSummary,
  SearchResults,
  SupportStats,
  SupportTicket,
  SystemMetrics,
  TicketMessage,
  TournamentDetail,
  TournamentParticipationStat,
  TournamentSummary,
  TransactionPage,
  UserAchievement,
  WalletBalanceType,
  TransactionReferenceType,
  LeaderboardMetric,
  LeaderboardPeriod,
  LeaderboardScope,
} from '@gaming-hub/shared';

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditLogEntry {
  id: string;
  actorType: string;
  actorId: string;
  action: string;
  category: string;
  targetType: string;
  targetId: string | null;
  ip: string | null;
  userAgent: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

interface ErrorStats {
  open: number;
  investigating: number;
  resolved: number;
  ignored: number;
  critical: number;
  high: number;
  total: number;
}

interface AutomationJob {
  name: string;
  label: string;
}

interface PopularGameEntry {
  gameId: string;
  matches: number;
}

interface AdminTournament extends TournamentSummary {
  id: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------

export interface FriendEntry {
  id: string;
  friend: PublicProfile;
  createdAt: string;
}

export const friendsApi = {
  list: () => apiClient.get<FriendEntry[]>('/friends'),
  requests: () => apiClient.get<FriendRequest[]>('/friends/requests'),
  send: (username: string) => apiClient.post<{ id: string }>('/friends/request', { username }),
  respond: (requestId: string, accept: boolean) =>
    apiClient.post<{ ok: boolean; friend: PublicProfile | null }>('/friends/respond', { requestId, accept }),
  remove: (friendId: string) => apiClient.delete(`/friends/${friendId}`),
};

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const notificationsApi = {
  list: (page = 1, pageSize = 25) =>
    apiClient.get<Page<AppNotification>>(`/notifications?page=${page}&pageSize=${pageSize}`),
  unreadCount: () => apiClient.get<{ count: number }>('/notifications/unread-count'),
  markRead: (id: string) => apiClient.post(`/notifications/${id}/read`),
  markAllRead: () => apiClient.post('/notifications/read-all'),
};

// ---------------------------------------------------------------------------
// Referrals
// ---------------------------------------------------------------------------

export const referralsApi = {
  summary: () => apiClient.get<ReferralSummary>('/referrals'),
  list: (page = 1, pageSize = 20) =>
    apiClient.get<Page<Referral>>(`/referrals/list?page=${page}&pageSize=${pageSize}`),
  apply: (code: string) => apiClient.post<{ ok: boolean; applied: boolean }>('/referrals/apply', { code }),
  leaderboard: () => apiClient.get<ReferralLeaderboardEntry[]>('/referrals/leaderboard'),
};

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

export const couponsApi = {
  redeem: (code: string) =>
    apiClient.post<{ ok: boolean; value: number; code: string }>('/coupons/redeem', { code }),
  redemptions: (page = 1, pageSize = 20) =>
    apiClient.get<Page<CouponRedemption>>(`/coupons/redemptions?page=${page}&pageSize=${pageSize}`),
};

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export const announcementsApi = {
  list: (page = 1, pageSize = 20) =>
    apiClient.get<Page<Announcement>>(`/announcements?page=${page}&pageSize=${pageSize}`),
  unreadCount: () => apiClient.get<{ count: number }>('/announcements/unread-count'),
  markRead: (id: string) => apiClient.post(`/announcements/${id}/read`),
};

// ---------------------------------------------------------------------------
// Tournaments
// ---------------------------------------------------------------------------

export const tournamentsApi = {
  list: (params: { page?: number; pageSize?: number; status?: string; gameId?: string } = {}) => {
    const qs = new URLSearchParams();
    qs.set('page', String(params.page ?? 1));
    qs.set('pageSize', String(params.pageSize ?? 20));
    if (params.status) qs.set('status', params.status);
    if (params.gameId) qs.set('gameId', params.gameId);
    return apiClient.get<Page<TournamentSummary>>(`/tournaments?${qs.toString()}`);
  },
  detail: (id: string) => apiClient.get<TournamentDetail>(`/tournaments/${id}`),
  register: (id: string) => apiClient.post<{ ok: boolean }>(`/tournaments/${id}/register`),
  cancel: (id: string) => apiClient.post<{ ok: boolean }>(`/tournaments/${id}/cancel`),
};

// ---------------------------------------------------------------------------
// Support tickets
// ---------------------------------------------------------------------------

export const ticketsApi = {
  create: (input: { subject: string; category: string; priority?: string; body: string }) =>
    apiClient.post<SupportTicket>('/support/tickets', input),
  list: (page = 1, pageSize = 20) =>
    apiClient.get<Page<SupportTicket>>(`/support/tickets?page=${page}&pageSize=${pageSize}`),
  get: (id: string) => apiClient.get<SupportTicket>(`/support/tickets/${id}`),
  reply: (id: string, body: string) => apiClient.post(`/support/tickets/${id}/reply`, { body }),
};

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export const messagesApi = {
  conversations: () => apiClient.get<ConversationSummary[]>('/messages/conversations'),
  unreadCount: () => apiClient.get<{ count: number }>('/messages/unread-count'),
  start: (userId: string) => apiClient.post<ConversationSummary>('/messages/start', { userId }),
  send: (conversationId: string, body: string) =>
    apiClient.post<Message>('/messages/send', { conversationId, body }),
  messages: (conversationId: string, page = 1, pageSize = 50) =>
    apiClient.get<MessagePage>(`/messages/${conversationId}?page=${page}&pageSize=${pageSize}`),
  blocked: () => apiClient.get<BlockedUser[]>('/messages/blocked'),
  block: (userId: string) => apiClient.post('/messages/block', { userId }),
  unblock: (userId: string) => apiClient.post('/messages/unblock', { userId }),
};

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const searchApi = {
  search: (query: string, type?: string) => {
    const qs = new URLSearchParams({ q: query });
    if (type) qs.set('type', type);
    return apiClient.get<SearchResults>(`/search?${qs.toString()}`);
  },
  suggestions: (query: string) =>
    apiClient.get<Array<{ query: string; type: string }>>(`/search/suggestions?q=${encodeURIComponent(query)}`),
  clearHistory: () => apiClient.delete('/search/history'),
};

// ---------------------------------------------------------------------------
// Sessions / devices
// ---------------------------------------------------------------------------

export const sessionsApi = {
  list: () => apiClient.get<LoginSession[]>('/account/sessions'),
  revoke: (id: string) => apiClient.delete<{ ok: boolean }>(`/account/sessions/${id}`),
  revokeAll: () => apiClient.delete<{ ok: boolean; revoked: number }>('/account/sessions'),
};

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export const achievementsApi = {
  list: () => apiClient.get<Achievement[]>('/achievements'),
  mine: () => apiClient.get<UserAchievement[]>('/achievements/me'),
};

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

export const walletApi = {
  transactions: (page: number, pageSize: number, walletType?: WalletBalanceType, referenceType?: TransactionReferenceType) => {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (walletType) qs.set('walletType', walletType);
    if (referenceType) qs.set('referenceType', referenceType);
    return apiClient.get<TransactionPage>(`/wallet/transactions?${qs.toString()}`);
  },
};

// ---------------------------------------------------------------------------
// Leaderboards
// ---------------------------------------------------------------------------

export interface LeaderboardParams {
  scope?: LeaderboardScope;
  gameId?: string;
  country?: string;
  region?: string;
  period?: LeaderboardPeriod;
  metric?: LeaderboardMetric;
  page?: number;
  pageSize?: number;
}

export const leaderboardApi = {
  get: (params: LeaderboardParams = {}) => {
    const qs = new URLSearchParams();
    qs.set('scope', params.scope ?? 'global');
    qs.set('period', params.period ?? 'all');
    qs.set('metric', params.metric ?? 'wins');
    qs.set('page', String(params.page ?? 1));
    qs.set('pageSize', String(params.pageSize ?? 20));
    if (params.gameId) qs.set('gameId', params.gameId);
    if (params.country) qs.set('country', params.country);
    if (params.region) qs.set('region', params.region);
    return apiClient.get<RankedLeaderboardPage>(`/leaderboard?${qs.toString()}`);
  },
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const adminApi = {
  featureFlags: () => apiClient.get<FeatureFlagGroup[]>('/admin/features'),
  toggleFeatureFlag: (key: string, enabled: boolean) =>
    apiClient.patch(`/admin/features/${encodeURIComponent(key)}`, { enabled }),

  auditLogs: (page = 1, pageSize = 50, category?: string) => {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (category) qs.set('category', category);
    return apiClient.get<Page<AuditLogEntry>>(`/admin/audit?${qs.toString()}`);
  },

  monitoringCounts: () => apiClient.get<DashboardCounts>('/admin/monitoring/counts'),
  systemMetrics: () => apiClient.get<SystemMetrics>('/admin/monitoring/metrics'),
  monitoringHealth: () => apiClient.get<HealthCheckResult[]>('/admin/monitoring/health'),

  analyticsSnapshot: () => apiClient.get<AnalyticsSnapshot>('/admin/analytics/snapshot'),
  analyticsUsers: (days = 30) =>
    apiClient.get<AnalyticsSeriesPoint[]>(`/admin/analytics/users?days=${days}`),
  analyticsTransactions: (days = 30) =>
    apiClient.get<AnalyticsSeriesPoint[]>(`/admin/analytics/transactions?days=${days}`),
  analyticsGames: () => apiClient.get<PopularGameEntry[]>('/admin/analytics/games'),
  analyticsDeposits: (days = 30) =>
    apiClient.get<AnalyticsSeriesPoint[]>(`/admin/analytics/deposits?days=${days}`),
  analyticsWithdrawals: (days = 30) =>
    apiClient.get<AnalyticsSeriesPoint[]>(`/admin/analytics/withdrawals?days=${days}`),
  analyticsCoupons: () => apiClient.get<CouponUsageStat[]>('/admin/analytics/coupons'),
  analyticsTournaments: () => apiClient.get<TournamentParticipationStat[]>('/admin/analytics/tournaments'),
  analyticsGeography: () => apiClient.get<CountryDistributionPoint[]>('/admin/analytics/geography'),
  analyticsSupport: () => apiClient.get<SupportStats>('/admin/analytics/support'),

  customerDetail: (userId: string) => apiClient.get<AdminCustomerDetail>(`/admin/users/${userId}/detail`),

  errors: (page = 1, pageSize = 50, status?: string) => {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) qs.set('status', status);
    return apiClient.get<Page<ErrorEventView>>(`/admin/errors?${qs.toString()}`);
  },
  errorStats: () => apiClient.get<ErrorStats>('/admin/errors/stats'),
  setErrorStatus: (id: string, status: string) =>
    apiClient.patch(`/admin/errors/${id}/status`, { status }),

  automationJobs: () => apiClient.get<AutomationJob[]>('/admin/automation/jobs'),
  automationRuns: (page = 1, pageSize = 50) =>
    apiClient.get<Page<CronJobRun>>(`/admin/automation/runs?page=${page}&pageSize=${pageSize}`),
  runAutomationJob: (name: string) => apiClient.post<{ ok: boolean; processed: number }>(`/admin/automation/jobs/${name}/run`),

  tournaments: (page = 1, pageSize = 50, status?: string) => {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) qs.set('status', status);
    return apiClient.get<Page<AdminTournament>>(`/admin/tournaments?${qs.toString()}`);
  },
  createTournament: (input: Record<string, unknown>) => apiClient.post('/admin/tournaments', input),
  updateTournament: (id: string, input: Record<string, unknown>) => apiClient.patch(`/admin/tournaments/${id}`, input),
  setTournamentStatus: (id: string, status: string) => apiClient.patch(`/admin/tournaments/${id}/status`, { status }),
  deleteTournament: (id: string) => apiClient.delete(`/admin/tournaments/${id}`),

  coupons: (page = 1, pageSize = 50, status?: string) => {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) qs.set('status', status);
    return apiClient.get<Page<Coupon>>(`/admin/coupons?${qs.toString()}`);
  },
  createCoupon: (input: Record<string, unknown>) => apiClient.post('/admin/coupons', input),
  updateCoupon: (id: string, input: Record<string, unknown>) => apiClient.patch(`/admin/coupons/${id}`, input),
  setCouponStatus: (id: string, status: string) => apiClient.patch(`/admin/coupons/${id}/status`, { status }),
  deleteCoupon: (id: string) => apiClient.delete(`/admin/coupons/${id}`),

  announcements: (page = 1, pageSize = 50) =>
    apiClient.get<Page<Announcement>>(`/admin/announcements?page=${page}&pageSize=${pageSize}`),
  createAnnouncement: (input: Record<string, unknown>) => apiClient.post('/admin/announcements', input),
  updateAnnouncement: (id: string, input: Record<string, unknown>) => apiClient.patch(`/admin/announcements/${id}`, input),
  deleteAnnouncement: (id: string) => apiClient.delete(`/admin/announcements/${id}`),

  tickets: (page = 1, pageSize = 50, status?: string) => {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) qs.set('status', status);
    return apiClient.get<Page<SupportTicket>>(`/admin/tickets?${qs.toString()}`);
  },
  ticketDetail: (id: string) => apiClient.get<SupportTicket & { messages: TicketMessage[] }>(`/admin/tickets/${id}`),
  replyToTicket: (id: string, body: string) => apiClient.post(`/admin/tickets/${id}/reply`, { body }),
  setTicketStatus: (id: string, status: string) => apiClient.patch(`/admin/tickets/${id}/status`, { status }),
  assignTicket: (id: string, assignedTo: string | null) => apiClient.patch(`/admin/tickets/${id}/assign`, { assignedTo }),

  referralLeaderboard: () => apiClient.get<ReferralLeaderboardEntry[]>('/admin/referrals/leaderboard'),
};

export type { LoginSession };
