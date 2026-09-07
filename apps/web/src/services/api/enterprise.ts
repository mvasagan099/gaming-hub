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
  TournamentStatus,
  TournamentSummary,
  TournamentDisputeSummary,
  TournamentDisputeDetail,
  TournamentResultSnapshotData,
  TournamentSettlementRecord,
  TournamentSettlementSummary,
  TournamentPrizeConfigSnapshot,
  TournamentLeaderboardResponse,
  PlayerTournamentCareerStats,
  GameTournamentRankingEntry,
  CreateDisputePayload,
  ResolveDisputePayload,
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

export interface ControlCenterMatch {
  slotId: string;
  roundNumber: number;
  matchNumber: number;
  status: string;
  isBye: boolean;
  playerA: {
    id: string;
    username: string;
    displayName: string;
    seed: number | null;
    score: number;
  } | null;
  playerB: {
    id: string;
    username: string;
    displayName: string;
    seed: number | null;
    score: number;
  } | null;
  winnerId: string | null;
  matchId: string | null;
  startedAt: string | null;
  matchDeadline: string | null;
  remainingMs: number | null;
  isExpired: boolean;
  isStuck: boolean;
  resultReason: string | null;
  stateVersion: number;
}

export interface ControlCenterPlayer {
  registrationSequence: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  registeredAt: string;
  seed: number | null;
  rating: number;
  eliminated: boolean;
  eliminatedInRound: number | null;
  finalRank: number | null;
  currentRound: number;
  status: 'ACTIVE' | 'ELIMINATED' | 'CHAMPION' | 'WAITING';
}

export interface TournamentControlCenterData {
  tournament: {
    id: string;
    gameId: string;
    title: string;
    description: string;
    status: TournamentStatus;
    format: string;
    seedMethod: string;
    entryFee: number;
    prizePool: number;
    grossPool: number;
    minPlayers: number;
    maxPlayers: number;
    startTime: string;
    registrationStartsAt: string | null;
    registrationEndsAt: string | null;
    endTime: string | null;
    settledAt: string | null;
    stateVersion: number;
    rules: unknown;
  };
  summary: {
    maxPlayers: number;
    registeredPlayers: number;
    availableSlots: number;
    minPlayers: number;
    currentRound: number;
    totalRounds: number;
    remainingPlayers: number;
    eliminatedPlayers: number;
    activeMatches: number;
    completedMatches: number;
    waitingMatches: number;
    expiredMatches: number;
    stuckMatches: number;
    byeMatches: number;
    timeLimitMatches: number;
    healthStatus: 'HEALTHY' | 'RECOVERY_NEEDED' | 'CRITICAL';
  };
  matches: ControlCenterMatch[];
  players: ControlCenterPlayer[];
  notifications: {
    totalSent: number;
    totalPending: number;
    totalFailed: number;
    recent: {
      eventType: string;
      playerId: string;
      referenceId: string | null;
      sentAt: string;
    }[];
  };
  timeLimitMetrics: {
    gameId: string;
    normalCompletionCount: number;
    timeLimitCount: number;
    timeLimitPercentage: number;
  };
  auditLogs: {
    id: string;
    action: string;
    actorType: string;
    actorId: string | null;
    meta: unknown;
    createdAt: string;
  }[];
}

export interface PlayerMyTournamentsItem {
  tournamentId: string;
  title: string;
  gameId: string;
  status: TournamentStatus;
  format: string;
  entryFee: number;
  prizePool: number;
  grossPool: number;
  registeredPlayers: number;
  maxPlayers: number;
  minPlayers: number;
  currentRound: number;
  totalRounds: number;
  remainingPlayers: number;
  startTime: string;
  mySeed: number | null;
  myRegistrationSequence: number;
  myStatus:
    | 'REGISTERED'
    | 'WAITING'
    | 'MATCH_READY'
    | 'LIVE'
    | 'ADVANCED'
    | 'ELIMINATED'
    | 'WINNER'
    | 'COMPLETED';
  eliminated: boolean;
  eliminatedInRound: number | null;
  finalRank: number | null;
  prizeWon: number | null;
  myCurrentMatch: {
    matchId: string | null;
    slotId: string;
    roundNumber: number;
    matchNumber: number;
    status: string;
    opponent: {
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      seed: number | null;
    } | null;
    remainingMs: number | null;
    matchDeadline: string | null;
    startedAt: string | null;
    myScore: number;
    opponentScore: number;
    resultReason: string | null;
  } | null;
  myResultSummary: string;
}

export interface PlayerTournamentDashboardData {
  tournament: {
    id: string;
    title: string;
    gameId: string;
    description: string;
    status: TournamentStatus;
    format: string;
    seedMethod: string;
    entryFee: number;
    prizePool: number;
    grossPool: number;
    minPlayers: number;
    maxPlayers: number;
    registeredPlayers: number;
    availableSlots: number;
    currentRound: number;
    totalRounds: number;
    remainingPlayers: number;
    startTime: string;
    stateVersion: number;
    rules: any;
    prizeDistribution: any;
  };
  player: {
    userId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    registeredAt: string;
    seed: number | null;
    registrationSequence: number;
    rating: number;
    status:
      | 'REGISTERED'
      | 'WAITING'
      | 'MATCH_READY'
      | 'LIVE'
      | 'ADVANCED'
      | 'ELIMINATED'
      | 'WINNER'
      | 'COMPLETED';
    eliminated: boolean;
    eliminatedInRound: number | null;
    finalRank: number | null;
    prizeWon: number | null;
  };
  myCurrentMatch: {
    slotId: string;
    matchId: string | null;
    roundNumber: number;
    matchNumber: number;
    status: 'WAITING' | 'READY' | 'IN_PROGRESS' | 'COMPLETED';
    opponent: {
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      seed: number | null;
    } | null;
    myScore: number;
    opponentScore: number;
    startedAt: string | null;
    matchDeadline: string | null;
    remainingMs: number | null;
    isExpired: boolean;
    resultReason: string | null;
  } | null;
  myMatchHistory: {
    roundNumber: number;
    matchNumber: number;
    matchId: string | null;
    opponent: {
      userId: string;
      username: string;
      displayName: string;
      avatarUrl: string | null;
      seed: number | null;
    } | null;
    result: 'WIN' | 'LOSS' | 'DRAW';
    myScore: number;
    opponentScore: number;
    durationSeconds: number;
    resultReason: string;
    replayAvailable: boolean;
  }[];
  stats: {
    matchesPlayed: number;
    wins: number;
    losses: number;
    currentRound: number;
    highestRound: number;
    timeLimitMatches: number;
    winRate: number;
  };
  roundProgress: {
    roundNumber: number;
    name: string;
    status: 'COMPLETED' | 'CURRENT' | 'UPCOMING';
  }[];
  myPathSlotIds: string[];
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
  list: (params: { page?: number; pageSize?: number; status?: string; gameId?: string; tier?: string } = {}) => {
    const qs = new URLSearchParams();
    qs.set('page', String(params.page ?? 1));
    qs.set('pageSize', String(params.pageSize ?? 20));
    if (params.status) qs.set('status', params.status);
    if (params.gameId) qs.set('gameId', params.gameId);
    if (params.tier) qs.set('tier', params.tier);
    return apiClient.get<Page<TournamentSummary>>(`/tournaments?${qs.toString()}`);
  },
  detail: (id: string) => apiClient.get<TournamentDetail>(`/tournaments/${id}`),
  register: (id: string) =>
    apiClient.post<{
      ok: boolean;
      registrationId: string;
      tournamentId: string;
      gameId: string;
      status: string;
      registeredPlayers: number;
      maximumPlayers: number;
      registrationEndTime: string | null;
      tournamentStartTime: string;
      entryFee: number;
    }>(`/tournaments/${id}/register`),
  cancel: (id: string) => apiClient.post<{ ok: boolean }>(`/tournaments/${id}/cancel`),
  bracket: (id: string) => apiClient.get<TournamentBracket>(`/tournaments/${id}/bracket`),
  myStatus: (id: string) => apiClient.get<TournamentPlayerStatus>(`/tournaments/${id}/my-status`),
  settlement: (id: string) =>
    apiClient.get<TournamentSettlementRecord | { status: string; prizeAmount: number; rank: null }>(`/tournaments/${id}/settlement`),
  prizes: (id: string) =>
    apiClient.get<TournamentPrizeConfigSnapshot>(`/tournaments/${id}/prizes`),
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
  globalLeaderboard: (params: { scope?: string; gameId?: string; tier?: string; period?: string; search?: string; page?: number; pageSize?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.scope) qs.set('scope', params.scope);
    if (params.gameId && params.gameId !== 'all') qs.set('gameId', params.gameId);
    if (params.tier && params.tier !== 'all') qs.set('tier', params.tier);
    if (params.period) qs.set('period', params.period);
    if (params.search) qs.set('search', params.search);
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    return apiClient.get<import('@gaming-hub/shared').GlobalTournamentLeaderboardResponse>(`/tournaments/leaderboard/global?${qs.toString()}`);
  },
  myTournaments: () => apiClient.get<PlayerMyTournamentsItem[]>('/tournaments/my-tournaments'),
  playerDashboard: (tournamentId: string) => apiClient.get<PlayerTournamentDashboardData>(`/tournaments/${tournamentId}/dashboard`),
  submitDispute: (payload: CreateDisputePayload) => apiClient.post<TournamentDisputeSummary>('/tournaments/disputes', payload),
  listDisputes: () => apiClient.get<TournamentDisputeSummary[]>('/tournaments/disputes'),
  getDispute: (id: string) => apiClient.get<TournamentDisputeDetail>(`/tournaments/disputes/${id}`),
  getMatchSnapshot: (matchId: string) => apiClient.get<TournamentResultSnapshotData>(`/tournaments/matches/${matchId}/snapshot`),
  leaderboardStandings: (tournamentId: string, params: { page?: number; pageSize?: number; search?: string; status?: string; round?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.search) qs.set('search', params.search);
    if (params.status) qs.set('status', params.status);
    if (params.round) qs.set('round', String(params.round));
    return apiClient.get<TournamentLeaderboardResponse>(`/tournaments/${tournamentId}/leaderboard?${qs.toString()}`);
  },
  playerCareerStats: (userId: string) => apiClient.get<import('@gaming-hub/shared').PlayerTournamentCareerStats>(`/tournaments/players/${userId}/career`),
  gameTournamentRankings: (gameId: string, params: { page?: number; pageSize?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    return apiClient.get<{ page: number; pageSize: number; total: number; items: GameTournamentRankingEntry[] }>(`/tournaments/games/${gameId}/rankings?${qs.toString()}`);
  },
  tiers: () => apiClient.get<{ items: import('@gaming-hub/shared').TournamentTierConfig[] }>('/tournament-tiers'),
  upcomingTier: (code: string) =>
    apiClient.get<{ tier: import('@gaming-hub/shared').TournamentTierConfig; tournament: any; message?: string }>(`/tournament-tiers/${code}/upcoming`),
};

export const adminTournamentsApi = {
  listDisputes: (params: { page?: number; pageSize?: number; status?: string; priority?: string; tournamentId?: string; gameId?: string } = {}) => {
    const qs = new URLSearchParams();
    qs.set('page', String(params.page ?? 1));
    qs.set('pageSize', String(params.pageSize ?? 20));
    if (params.status) qs.set('status', params.status);
    if (params.priority) qs.set('priority', params.priority);
    if (params.tournamentId) qs.set('tournamentId', params.tournamentId);
    if (params.gameId) qs.set('gameId', params.gameId);
    return apiClient.get<Page<TournamentDisputeSummary>>(`/admin/tournaments/disputes?${qs.toString()}`);
  },
  getDispute: (id: string) => apiClient.get<TournamentDisputeDetail>(`/admin/tournaments/disputes/${id}`),
  resolveDispute: (id: string, payload: ResolveDisputePayload) =>
    apiClient.post<TournamentDisputeSummary>(`/admin/tournaments/disputes/${id}/resolve`, payload),
  getMatchSnapshot: (matchId: string) => apiClient.get<TournamentResultSnapshotData>(`/admin/tournaments/matches/${matchId}/snapshot`),
  leaderboard: (tournamentId: string, params: { page?: number; pageSize?: number; search?: string; status?: string; round?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.search) qs.set('search', params.search);
    if (params.status) qs.set('status', params.status);
    if (params.round) qs.set('round', String(params.round));
    return apiClient.get<TournamentLeaderboardResponse>(`/admin/tournaments/${tournamentId}/leaderboard?${qs.toString()}`);
  },
  analytics: (params: { timeFilter?: string; fromDate?: string; toDate?: string; gameId?: string; tier?: string; tournamentId?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.timeFilter) qs.set('timeFilter', params.timeFilter);
    if (params.fromDate) qs.set('fromDate', params.fromDate);
    if (params.toDate) qs.set('toDate', params.toDate);
    if (params.gameId && params.gameId !== 'ALL' && params.gameId !== 'all') qs.set('gameId', params.gameId);
    if (params.tier && params.tier !== 'ALL' && params.tier !== 'all') qs.set('tier', params.tier);
    if (params.tournamentId && params.tournamentId !== 'ALL' && params.tournamentId !== 'all') qs.set('tournamentId', params.tournamentId);
    return apiClient.get<import('@gaming-hub/shared').TournamentAnalyticsResponse>(`/admin/tournaments/analytics?${qs.toString()}`);
  },
  healthOverview: () => apiClient.get<import('@gaming-hub/shared').TournamentHealthSummary>('/admin/tournaments/health-overview'),
  generateReport: (payload: import('@gaming-hub/shared').TournamentReportRequest) =>
    apiClient.post<import('@gaming-hub/shared').TournamentReportResult>('/admin/tournaments/reports/generate', payload),
  getExportCsvUrl: (params: { reportType: string; timeFilter?: string; fromDate?: string; toDate?: string; gameId?: string; tier?: string; status?: string }) => {
    const qs = new URLSearchParams();
    qs.set('reportType', params.reportType);
    if (params.timeFilter) qs.set('timeFilter', params.timeFilter);
    if (params.fromDate) qs.set('fromDate', params.fromDate);
    if (params.toDate) qs.set('toDate', params.toDate);
    if (params.gameId && params.gameId !== 'ALL' && params.gameId !== 'all') qs.set('gameId', params.gameId);
    if (params.tier && params.tier !== 'ALL' && params.tier !== 'all') qs.set('tier', params.tier);
    if (params.status && params.status !== 'ALL') qs.set('status', params.status);
    return `/api/admin/tournaments/reports/export-csv?${qs.toString()}`;
  },
  downloadReportCsv: async (params: { reportType: string; timeFilter?: string; fromDate?: string; toDate?: string; gameId?: string; tier?: string; status?: string }) => {
    const qs = new URLSearchParams();
    qs.set('reportType', params.reportType);
    if (params.timeFilter) qs.set('timeFilter', params.timeFilter);
    if (params.fromDate) qs.set('fromDate', params.fromDate);
    if (params.toDate) qs.set('toDate', params.toDate);
    if (params.gameId && params.gameId !== 'ALL' && params.gameId !== 'all') qs.set('gameId', params.gameId);
    if (params.tier && params.tier !== 'ALL' && params.tier !== 'all') qs.set('tier', params.tier);
    if (params.status && params.status !== 'ALL') qs.set('status', params.status);

    const token = (await import('../../store/authStore')).useAuthStore.getState().session?.access_token;
    const envUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000/api';
    const baseUrl = typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
      ? envUrl.replace('localhost', window.location.hostname).replace('127.0.0.1', window.location.hostname)
      : envUrl;

    const res = await fetch(`${baseUrl}/admin/tournaments/reports/export-csv?${qs.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      throw new Error(`CSV Export failed with status ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const sanitizedType = params.reportType.toLowerCase().replace(/_/g, '-');
    a.download = `tournament-report-${sanitizedType}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
  search: (query: string, type?: string, page?: number, limit?: number) => {
    const qs = new URLSearchParams({ q: query });
    if (type) qs.set('type', type);
    if (page) qs.set('page', String(page));
    if (limit) qs.set('limit', String(limit));
    return apiClient.get<SearchResults>(`/search?${qs.toString()}`);
  },
  suggestions: (query: string) =>
    apiClient.get<Array<{ query: string; type: string }>>(`/search/suggestions?q=${encodeURIComponent(query)}`),
  clearHistory: () => apiClient.delete<{ ok: boolean }>('/search/history'),
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

  getAppVersionConfig: () =>
    apiClient.get<import('@gaming-hub/shared').AppVersionConfig>('/admin/app/version-config'),
  updateAppVersionConfig: (payload: {
    latestVersion: string;
    minimumSupportedVersion: string;
    downloadUrl: string;
    updateMessage: string;
    forceUpdate: boolean;
  }) => apiClient.put<import('@gaming-hub/shared').AppVersionConfig>('/admin/app/version-config', payload),

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
  tournamentControlCenter: (id: string) =>
    apiClient.get<TournamentControlCenterData>(`/admin/tournaments/${id}/control-center`),
  overrideTournamentResult: (id: string, slotId: string, winnerId: string, reason: string) =>
    apiClient.post(`/admin/tournaments/${id}/override-result`, { slotId, winnerId, reason }),
  recoverTournaments: () => apiClient.post<{ ok: boolean; timestamp: string }>('/admin/tournaments/recover'),
  tournamentRecoveryStatus: (tournamentId?: string) =>
    apiClient.get(`/admin/tournaments/recovery-status${tournamentId ? `?tournamentId=${tournamentId}` : ''}`),
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
  tournamentCancellationPreview: (id: string) =>
    apiClient.get<import('@gaming-hub/shared').TournamentCancellationPreview>(`/admin/tournaments/${id}/cancellation-preview`),
  tournamentRefunds: (id: string) =>
    apiClient.get<import('@gaming-hub/shared').TournamentRefundSummary>(`/admin/tournaments/${id}/refunds`),
  retryTournamentRefunds: (id: string, reason: string, targetUserId?: string) =>
    apiClient.post<{ ok: boolean; retriedCount?: number; succeededCount?: number; failedCount?: number }>(
      `/admin/tournaments/${id}/refunds/retry`,
      { reason, targetUserId }
    ),
  settleTournament: (id: string) => apiClient.post(`/admin/tournaments/${id}/settle`),
  tournamentSettlements: (id: string, status?: string) => {
    const qs = status && status !== 'ALL' ? `?status=${status}` : '';
    return apiClient.get<TournamentSettlementSummary>(`/admin/tournaments/${id}/settlements${qs}`);
  },
  retryTournamentSettlements: (id: string, reason: string, prizeId?: string) =>
    apiClient.post<{ ok: boolean; retriedCount?: number }>(`/admin/tournaments/${id}/settlements/retry`, { reason, prizeId }),
  tournamentNotifications: (id: string, params?: { userId?: string; eventType?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.userId) qs.set('userId', params.userId);
    if (params?.eventType) qs.set('eventType', params.eventType);
    if (params?.status) qs.set('status', params.status);
    return apiClient.get<{ summary: { total: number; sent: number; pending: number; failed: number }; emailLogs: any[]; inAppLogs: any[] }>(
      `/admin/tournaments/${id}/notifications?${qs.toString()}`
    );
  },
  retryTournamentEmail: (emailId: string) =>
    apiClient.post<{ success: boolean; record: any }>(`/admin/tournaments/emails/${emailId}/retry`),
  tournamentSchedulerInfo: () =>
    apiClient.get<import('@gaming-hub/shared').TournamentSchedulerInfo>('/admin/tournaments/scheduler'),
  toggleTournamentScheduler: (paused: boolean, reason?: string) =>
    apiClient.post<import('@gaming-hub/shared').TournamentSchedulerInfo>('/admin/tournaments/scheduler/toggle', { paused, reason }),
  tournamentSchedulerPreview: (hours = 6) =>
    apiClient.get<import('@gaming-hub/shared').SchedulerPreviewSlot[]>(`/admin/tournaments/scheduler/preview?hours=${hours}`),
  tournamentGameTiers: () =>
    apiClient.get<import('@gaming-hub/shared').GameTierAvailability>('/admin/tournaments/game-tiers'),
  updateTournamentGameTiers: (matrix: import('@gaming-hub/shared').GameTierAvailability) =>
    apiClient.put<import('@gaming-hub/shared').GameTierAvailability>('/admin/tournaments/game-tiers', matrix),
  tournamentFinancials: (id: string) =>
    apiClient.get<import('@gaming-hub/shared').TournamentFinancialSummary>(`/admin/tournaments/${id}/financials`),
  tournamentAnalyticsValidation: (gameId?: string) => {
    const qs = gameId && gameId !== 'ALL' ? `?gameId=${gameId}` : '';
    return apiClient.get<import('@gaming-hub/shared').TournamentValidationSummary>(`/admin/tournaments/analytics/validate${qs}`);
  },
  runTournamentAnalyticsValidation: (body?: Record<string, unknown>) =>
    apiClient.post<import('@gaming-hub/shared').TournamentValidationSummary>('/admin/tournaments/analytics/validate/run', body || {}),
  tournamentIntegrityAlerts: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params || {});
    return apiClient.get<{
      items: import('@gaming-hub/shared').TournamentIntegrityAlert[];
      total: number;
      openCount: number;
      criticalCount: number;
      underReviewCount: number;
      resolvedCount: number;
    }>(`/admin/tournaments/integrity-alerts?${qs.toString()}`);
  },
  scanTournamentIntegrityAlerts: (tournamentId?: string) =>
    apiClient.post<{
      items: import('@gaming-hub/shared').TournamentIntegrityAlert[];
      total: number;
      openCount: number;
      criticalCount: number;
      underReviewCount: number;
      resolvedCount: number;
    }>('/admin/tournaments/integrity-alerts/scan', { tournamentId }),
  updateTournamentIntegrityAlertStatus: (id: string, status: string, resolutionNotes?: string) =>
    apiClient.patch<import('@gaming-hub/shared').TournamentIntegrityAlert>(`/admin/tournaments/integrity-alerts/${id}/status`, {
      status,
      resolutionNotes,
    }),
  tournamentTiers: () => apiClient.get<any[]>('/admin/tournament-tiers'),
  updateTournamentTier: (id: string, data: any) => apiClient.put(`/admin/tournament-tiers/${id}`, data),

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
