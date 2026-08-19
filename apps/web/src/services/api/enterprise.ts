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
  TournamentBracket,
  TournamentCurrentMatchResponse,
  TournamentDetail,
  TournamentHistoryEntry,
  TournamentLeaderboardEntry,
  TournamentParticipationStat,
  TournamentPlayerStats,
  TournamentPlayerStatus,
  TournamentSummary,
  TransactionPage,
  UserAchievement,
  WalletBalanceType,
  TransactionReferenceType,
  WalletRequest,
  WalletRequestKind,
  WalletRequestStatus,
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

export interface AdminTournamentDetail {
  id: string;
  gameId: string;
  title: string;
  description: string;
  format: string;
  prizePool: number;
  entryFee: number;
  grossPool: number;
  minPlayers: number;
  maxPlayers: number;
  status: string;
  seedMethod: string;
  startTime: string;
  endTime: string | null;
  registrationEndsAt: string | null;
  settledAt: string | null;
  stateVersion: number;
  createdAt: string;
  players: {
    id: string;
    userId: string;
    seed: number | null;
    finalRank: number | null;
    eliminated: boolean;
    eliminatedInRound: number | null;
    registeredAt: string;
    user: { id: string; username: string; displayName: string; avatarUrl: string | null };
    prizes: { amount: number; rank: number; status: string }[];
  }[];
  prizes: { userId: string; rank: number; amount: number; status: string; paidAt: string | null }[];
  rounds: {
    id: string;
    roundNumber: number;
    matchNumber: number;
    status: string;
    isBye: boolean;
    playerAId: string | null;
    playerBId: string | null;
    winnerId: string | null;
    matchId: string | null;
    playerAScore: number;
    playerBScore: number;
    scheduledAt: string | null;
    completedAt: string | null;
  }[];
  _count: { players: number; rounds: number };
}

export interface AdminTournamentBracket {
  tournamentId: string;
  format: string;
  totalRounds: number;
  rounds: {
    roundNumber: number;
    slots: {
      id: string;
      roundNumber: number;
      matchNumber: number;
      status: string;
      isBye: boolean;
      playerAId: string | null;
      playerBId: string | null;
      winnerId: string | null;
      matchId: string | null;
      playerAScore: number;
      playerBScore: number;
      nextSlotId: string | null;
      scheduledAt: string | null;
      completedAt: string | null;
    }[];
  }[];
}

export interface TournamentHealthReport {
  tournamentId: string;
  status: string;
  currentRound: number | null;
  totalRounds: number;
  activeMatches: number;
  pendingMatches: number;
  completedMatches: number;
  missingMatches: number;
  unprocessedResults: number;
  settlementStatus: string;
  health: 'HEALTHY' | 'WARNING' | 'ERROR';
}

export interface TournamentReconcileResult {
  tournamentId: string;
  status: string;
  repaired: string[];
  warnings: string[];
  errors: string[];
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

export const NOTIFICATION_CHANGED_EVENT = "gaming-hub:notifications-changed";

export function notifyNotificationChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(NOTIFICATION_CHANGED_EVENT));
  }
}

export const notificationsApi = {
  list: (page = 1, pageSize = 25) =>
    apiClient.get<Page<AppNotification>>(`/notifications?page=${page}&pageSize=${pageSize}`),
  unreadCount: () => apiClient.get<{ count: number }>('/notifications/unread-count'),
  markRead: (id: string) => apiClient.post(`/notifications/${id}/read`, {}),
  markAllRead: () => apiClient.post('/notifications/read-all', {}),
  delete: (id: string) => apiClient.delete(`/notifications/${id}`),
  deleteAll: () => apiClient.delete('/notifications/clear-all'),
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
  bracket: (id: string) => apiClient.get<TournamentBracket>(`/tournaments/${id}/bracket`),
  myStatus: (id: string) => apiClient.get<TournamentPlayerStatus>(`/tournaments/${id}/my-status`),
  state: (id: string) =>
    apiClient.get<{ detail: TournamentDetail; bracket: TournamentBracket; myStatus: TournamentPlayerStatus }>(`/tournaments/${id}/state`),
  currentMatch: (id: string) => apiClient.get<TournamentCurrentMatchResponse>(`/tournaments/${id}/current-match`),
  history: (page = 1, pageSize = 20) =>
    apiClient.get<Page<TournamentHistoryEntry>>(`/tournaments/history?page=${page}&pageSize=${pageSize}`),
  stats: () => apiClient.get<TournamentPlayerStats>('/tournaments/stats'),
  leaderboard: (params: { page?: number; pageSize?: number; period?: string } = {}) => {
    const qs = new URLSearchParams();
    qs.set('page', String(params.page ?? 1));
    qs.set('pageSize', String(params.pageSize ?? 20));
    if (params.period) qs.set('period', params.period);
    return apiClient.get<Page<TournamentLeaderboardEntry>>(`/tournaments/leaderboard?${qs.toString()}`);
  },
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
// Security
// ---------------------------------------------------------------------------

export const securityApi = {
  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.patch<{ ok: boolean }>('/security/password', {
      currentPassword,
      newPassword,
      confirmPassword: newPassword,
    }),
  setup2FA: () =>
    apiClient.post<{ ok: boolean; secret: string; authUrl: string }>('/security/2fa/setup', { enable: true }),
  verify2FA: (token: string) =>
    apiClient.post<{ ok: boolean; enabled: boolean }>('/security/2fa/verify', { token }),
  disable2FA: (token: string) =>
    apiClient.post<{ ok: boolean }>('/security/2fa/disable', { token }),
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

export interface WalletSummary {
  balance: number;
  bonusBalance: number;
  lockedBalance: number;
  rewardBalance: number;
  cashbackBalance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  totalSpent: number;
  totalWon: number;
}

export const walletApi = {
  summary: () => apiClient.get<WalletSummary>('/wallet/summary'),
  transfer: (amount: number) => apiClient.post<{ ok: boolean; transferredAmount: number; newBalance: number }>('/wallet/transfer', { amount }),
  transactions: (page: number, pageSize: number, walletType?: WalletBalanceType, referenceType?: TransactionReferenceType) => {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (walletType) qs.set('walletType', walletType);
    if (referenceType) qs.set('referenceType', referenceType);
    return apiClient.get<TransactionPage>(`/wallet/transactions?${qs.toString()}`);
  },
  requestOtp: () => apiClient.post<{ ok: boolean; expiresAt: string; debugCode?: string }>('/wallet/otp'),
  createDeposit: (input: { amount: number; method?: string }) =>
    apiClient.post<WalletRequest>('/wallet/deposits', input),
  createWithdrawal: (input: { amount: number; otp: string }) =>
    apiClient.post<WalletRequest>('/wallet/withdrawals', input),
  requests: (page = 1, pageSize = 20, kind?: WalletRequestKind, status?: WalletRequestStatus) => {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (kind) qs.set('kind', kind);
    if (status) qs.set('status', status);
    return apiClient.get<Page<WalletRequest>>(`/wallet/requests?${qs.toString()}`);
  },
  cancelRequest: (requestId: string) =>
    apiClient.post<WalletRequest>(`/wallet/requests/${requestId}/cancel`),
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
  tournamentDetail: (id: string) =>
    apiClient.get<AdminTournamentDetail>(`/admin/tournaments/${id}`),
  tournamentBracket: (id: string) =>
    apiClient.get<AdminTournamentBracket>(`/admin/tournaments/${id}/bracket`),
  tournamentHealth: (id: string) =>
    apiClient.get<TournamentHealthReport>(`/admin/tournaments/${id}/health`),
  tournamentReconcile: (id: string) =>
    apiClient.post<TournamentReconcileResult>(`/admin/tournaments/${id}/reconcile`),
  createTournament: (input: Record<string, unknown>) => apiClient.post('/admin/tournaments', input),
  updateTournament: (id: string, input: Record<string, unknown>) => apiClient.patch(`/admin/tournaments/${id}`, input),
  deleteTournament: (id: string) => apiClient.delete(`/admin/tournaments/${id}`),
  openRegistration: (id: string) => apiClient.post(`/admin/tournaments/${id}/open-registration`),
  closeRegistration: (id: string) => apiClient.post(`/admin/tournaments/${id}/close-registration`),
  startTournament: (id: string) => apiClient.post(`/admin/tournaments/${id}/start`),
  pauseTournament: (id: string) => apiClient.post(`/admin/tournaments/${id}/pause`),
  resumeTournament: (id: string) => apiClient.post(`/admin/tournaments/${id}/resume`),
  cancelTournament: (id: string, reason?: string) =>
    apiClient.post(`/admin/tournaments/${id}/cancel`, { reason }),
  settleTournament: (id: string) => apiClient.post(`/admin/tournaments/${id}/settle`),

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

  roles: () => apiClient.get<CustomRoleView[]>('/admin/roles'),
  createRole: (input: { name: string; displayName: string; description?: string; permissions: string[] }) =>
    apiClient.post<CustomRoleView>('/admin/roles', input),
  updateRole: (id: string, input: { displayName?: string; description?: string; permissions?: string[] }) =>
    apiClient.patch<CustomRoleView>(`/admin/roles/${id}`, input),
  deleteRole: (id: string) => apiClient.delete(`/admin/roles/${id}`),

  kycPending: (page = 1, pageSize = 20) =>
    apiClient.get<Page<AdminKycRequest>>(`/admin/kyc/pending?page=${page}&pageSize=${pageSize}`),
  kycListByStatus: (status: string, page = 1, pageSize = 20) =>
    apiClient.get<Page<AdminKycRequest>>(`/admin/kyc/status/${status}?page=${page}&pageSize=${pageSize}`),
  kycReview: (requestId: string, approved: boolean, notes?: string, rejectionReason?: string) =>
    apiClient.post(`/admin/kyc/review/${requestId}`, {
      requestId,
      action: approved ? 'APPROVE' : 'REJECT',
      notes: notes || undefined,
      rejectionReason: rejectionReason || undefined,
    }),
  kycOverride: (userId: string, targetLevel: string, reason: string) =>
    apiClient.post('/admin/kyc/override', { userId, targetLevel, reason }),
};

export interface AdminKycRequest {
  id: string;
  userId: string;
  level: string;
  status: string;
  fullName?: string | null;
  country?: string | null;
  dateOfBirth?: string | null;
  mobileNumber?: string | null;
  streetAddress?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  rejectionReason?: string | null;
  notes?: string | null;
  user?: {
    id: string;
    displayName: string;
    username: string;
    email?: string | null;
  };
  documents?: Array<{
    id: string;
    documentType: string;
    fileUrl: string;
    status: string;
    uploadedAt?: string;
    fileName?: string;
    mimeType?: string;
    side?: string | null;
    isSelfie?: boolean;
  }>;
}

export interface CustomRoleView {
  id: string;
  name: string;
  displayName: string;
  description?: string | null;
  isSystem: boolean;
  userCount?: number;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export type { LoginSession };
