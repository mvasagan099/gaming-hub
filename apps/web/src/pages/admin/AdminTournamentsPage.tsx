import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Trophy,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Trash2,
  Eye,
  Plus,
  Clock,
  Play,
  Pause,
  Sliders,
  Grid,
  Download,
  Calendar,
  DollarSign,
  Layers,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  BarChart3,
  TrendingUp,
  Activity,
  FileText,
  PieChart,
  Shield,
  Send,
  Mail,
  Users,
  Award,
  Percent,
  Scale,
  Gamepad2,
  Radio,
  Wifi,
  WifiOff,
  Zap,
  Inbox,
} from 'lucide-react';
import { createTypedSocket, type TypedSocket } from '@gaming-hub/socket';
import { useAuthStore } from '../../store/authStore';
import {
  GAME_DEFINITIONS,
  TOURNAMENT_TIER_VISUALS,
  DEFAULT_TIER_PRIZE_DISTRIBUTION,
  type TournamentStatus,
  type TournamentFormat,
  type GameId,
  type TournamentTierCode,
  type SchedulerPreviewSlot,
  type TournamentSchedulerInfo,
  type GameTierAvailability,
  type TournamentAnalyticsResponse,
  type TournamentAnalyticsTimeFilter,
  type TournamentReportType,
  type TournamentReportResult,
} from '@gaming-hub/shared';
import { adminApi, adminTournamentsApi } from '../../services/api/enterprise';
import type { AdminTournamentDetail } from '../../services/api/enterprise';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';


const gameById = new Map(GAME_DEFINITIONS.map((g) => [g.id, g]));

const STATUS_VARIANT: Record<TournamentStatus, 'success' | 'warning' | 'danger' | 'default' | 'accent' | 'outline'> = {
  DRAFT: 'outline',
  REGISTRATION_OPEN: 'accent',
  REGISTRATION_CLOSED: 'default',
  UPCOMING: 'default',
  STARTING: 'warning',
  IN_PROGRESS: 'success',
  PAUSED: 'warning',
  COMPLETED: 'accent',
  SETTLING: 'warning',
  SETTLED: 'success',
  LIVE: 'success',
  ENDED: 'default',
  CANCELLED: 'danger',
};

const TIER_ORDER: TournamentTierCode[] = ['mini', 'basic', 'standard', 'premium', 'pro'];

type MainTab = 'TOURNAMENTS' | 'ANALYTICS' | 'REPORTS' | 'SCHEDULER' | 'TIERS' | 'GAME_MATRIX';
type StatusTab = 'ALL' | 'LIVE' | 'UPCOMING' | 'REGISTRATION' | 'COMPLETED' | 'CANCELLED';

const EMPTY_FORM = {
  gameId: 'snooker' as GameId,
  title: '',
  description: '',
  format: 'SINGLE_ELIMINATION' as TournamentFormat,
  prizePool: 10000,
  entryFee: 25,
  minPlayers: 2,
  maxPlayers: 500,
  startTime: '',
  registrationEndsAt: '',
};

interface RealTimeEventItem {
  id: string;
  type: 'TOURNAMENT' | 'MATCH' | 'REGISTRATION' | 'SETTLEMENT' | 'REFUND' | 'NOTIFICATION' | 'SCHEDULER';
  title: string;
  timestamp: string;
  details?: string;
  variant: 'info' | 'success' | 'warning' | 'danger';
}

export function AdminTournamentsPage() {
  const navigate = useNavigate();
  const [mainTab, setMainTab] = useState<MainTab>('TOURNAMENTS');
  const [statusTab, setStatusTab] = useState<StatusTab>('ALL');

  const [items, setItems] = useState<AdminTournamentDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Real-Time Socket & Live Stream State
  const [socketStatus, setSocketStatus] = useState<'connected' | 'connecting' | 'reconnecting' | 'disconnected'>('connecting');
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<Date | null>(null);
  const [realTimeEvents, setRealTimeEvents] = useState<RealTimeEventItem[]>([]);
  const [showRealTimeDrawer, setShowRealTimeDrawer] = useState(false);
  const socketRef = useRef<TypedSocket | null>(null);
  const wasDisconnectedRef = useRef(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTier, setSelectedTier] = useState<string>('ALL');
  const [filterGame, setFilterGame] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  // Modals & Forms
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Scheduler State
  const [schedulerInfo, setSchedulerInfo] = useState<TournamentSchedulerInfo | null>(null);
  const [schedulerPreview, setSchedulerPreview] = useState<SchedulerPreviewSlot[]>([]);
  const [isSchedulerLoading, setIsSchedulerLoading] = useState(false);
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);

  // Tiers & Matrix State
  const [tiersList, setTiersList] = useState<any[]>([]);
  const [editingTier, setEditingTier] = useState<any | null>(null);
  const [gameMatrix, setGameMatrix] = useState<GameTierAvailability>({});
  const [isMatrixSaving, setIsMatrixSaving] = useState(false);

  // Analytics & Health State
  const [analyticsData, setAnalyticsData] = useState<TournamentAnalyticsResponse | null>(null);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analyticsTimeFilter, setAnalyticsTimeFilter] = useState<TournamentAnalyticsTimeFilter>('last30days');
  const [analyticsFromDate, setAnalyticsFromDate] = useState('');
  const [analyticsToDate, setAnalyticsToDate] = useState('');
  const [analyticsGame, setAnalyticsGame] = useState('ALL');
  const [analyticsTier, setAnalyticsTier] = useState('ALL');
  const [analyticsTournament, setAnalyticsTournament] = useState('ALL');
  const [showHealthDrawer, setShowHealthDrawer] = useState(false);
  const [healthFilterTab, setHealthFilterTab] = useState<'ALL' | 'CRITICAL' | 'ATTENTION' | 'STUCK_TOURNAMENTS' | 'STUCK_MATCHES' | 'SCHEDULER'>('ALL');
  const [prizeBreakdownTab, setPrizeBreakdownTab] = useState<'GAME' | 'TIER' | 'DATE'>('GAME');
  const [refundBreakdownTab, setRefundBreakdownTab] = useState<'GAME' | 'TIER' | 'DATE' | 'RECORDS'>('GAME');
  const [settlementBreakdownTab, setSettlementBreakdownTab] = useState<'GAME' | 'TIER' | 'DATE' | 'FAILED' | 'RECORDS'>('GAME');
  const [notifBreakdownTab, setNotifBreakdownTab] = useState<'LOG' | 'GAME' | 'TIER' | 'DATE'>('LOG');
  const [notifChannelFilter, setNotifChannelFilter] = useState<'ALL' | 'EMAIL' | 'IN_APP' | 'SOCKET'>('ALL');
  const [notifStatusFilter, setNotifStatusFilter] = useState<'ALL' | 'SENT' | 'PENDING' | 'FAILED'>('ALL');
  const [playerBreakdownTab, setPlayerBreakdownTab] = useState<'SUMMARY' | 'GAME' | 'TIER' | 'DATE' | 'COHORT'>('SUMMARY');
  const [topPartBreakdownTab, setTopPartBreakdownTab] = useState<'OVERVIEW' | 'GAMES' | 'TIERS' | 'PERIODS'>('OVERVIEW');
  const [playerPerfBreakdownTab, setPlayerPerfBreakdownTab] = useState<'SUMMARY' | 'GAME' | 'TIER' | 'DATE' | 'PERFORMERS'>('SUMMARY');
  const [winRateBreakdownTab, setWinRateBreakdownTab] = useState<'OVERVIEW' | 'GAME' | 'TIER' | 'DATE'>('OVERVIEW');
  const [selectedGameProfileId, setSelectedGameProfileId] = useState<string>('all');
  const [trendMetricTab, setTrendMetricTab] = useState<'ALL' | 'VOLUME' | 'REGISTRATIONS' | 'COMPLETION' | 'COLLECTION' | 'PRIZES'>('ALL');
  const [tierTrendMetricTab, setTierTrendMetricTab] = useState<'ALL' | 'COUNT' | 'REGISTRATIONS' | 'AVERAGE' | 'FILL_RATE' | 'COMPLETION_RATE'>('ALL');
  const [selectedTierTrendCode, setSelectedTierTrendCode] = useState<string>('all');

  // Report Generator State
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState<TournamentReportType>('TOURNAMENT');
  const [reportTimeFilter, setReportTimeFilter] = useState<TournamentAnalyticsTimeFilter>('last30days');
  const [reportFromDate, setReportFromDate] = useState('');
  const [reportToDate, setReportToDate] = useState('');
  const [reportGame, setReportGame] = useState('ALL');
  const [reportTier, setReportTier] = useState('ALL');
  const [reportStatus, setReportStatus] = useState('ALL');
  const [generatedReport, setGeneratedReport] = useState<TournamentReportResult | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Data Validation State
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [isValidatingAudit, setIsValidatingAudit] = useState(false);
  const [validationFilterTab, setValidationFilterTab] = useState<'ALL' | 'CRITICAL' | 'WARNING' | 'FINANCIAL' | 'REGISTRATION' | 'PRIZE' | 'REFUND'>('ALL');

  // Data Integrity Alerts State
  const [showAlertsDrawer, setShowAlertsDrawer] = useState(false);
  const [alertsList, setAlertsList] = useState<import('@gaming-hub/shared').TournamentIntegrityAlert[]>([]);
  const [alertsStats, setAlertsStats] = useState({ total: 0, openCount: 0, criticalCount: 0, underReviewCount: 0, resolvedCount: 0 });
  const [alertFilterStatus, setAlertFilterStatus] = useState<string>('OPEN');
  const [alertFilterSeverity, setAlertFilterSeverity] = useState<string>('ALL');
  const [alertFilterIssueType, setAlertFilterIssueType] = useState<string>('ALL');
  const [isAlertsLoading, setIsAlertsLoading] = useState(false);
  const [isScanningAlerts, setIsScanningAlerts] = useState(false);
  const [selectedAlertForResolve, setSelectedAlertForResolve] = useState<import('@gaming-hub/shared').TournamentIntegrityAlert | null>(null);
  const [resolutionNotesInput, setResolutionNotesInput] = useState('');
  const [isUpdatingAlert, setIsUpdatingAlert] = useState(false);

  const flash = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  const handleRunLiveAudit = async () => {
    setIsValidatingAudit(true);
    try {
      const summary = await adminApi.runTournamentAnalyticsValidation({
        gameId: analyticsGame !== 'ALL' ? analyticsGame : undefined,
      });
      if (analyticsData) {
        setAnalyticsData({
          ...analyticsData,
          validation: summary,
        });
      }
      flash(`Live audit complete: ${summary.status === 'VALID' ? 'All records verified & balanced' : `${summary.issuesCount} issues detected`}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run live validation audit');
    } finally {
      setIsValidatingAudit(false);
    }
  };

  const loadIntegrityAlerts = async () => {
    setIsAlertsLoading(true);
    try {
      const res = await adminApi.tournamentIntegrityAlerts({
        status: alertFilterStatus !== 'ALL' ? alertFilterStatus : undefined,
        severity: alertFilterSeverity !== 'ALL' ? alertFilterSeverity : undefined,
        issueType: alertFilterIssueType !== 'ALL' ? alertFilterIssueType : undefined,
        gameId: analyticsGame !== 'ALL' ? analyticsGame : undefined,
      });
      setAlertsList(res.items || []);
      setAlertsStats({
        total: res.total || 0,
        openCount: res.openCount || 0,
        criticalCount: res.criticalCount || 0,
        underReviewCount: res.underReviewCount || 0,
        resolvedCount: res.resolvedCount || 0,
      });
    } catch {
      // Best effort load
    } finally {
      setIsAlertsLoading(false);
    }
  };

  const handleScanIntegrityAlerts = async () => {
    setIsScanningAlerts(true);
    try {
      const res = await adminApi.scanTournamentIntegrityAlerts(analyticsTournament !== 'ALL' ? analyticsTournament : undefined);
      setAlertsList(res.items || []);
      setAlertsStats({
        total: res.total || 0,
        openCount: res.openCount || 0,
        criticalCount: res.criticalCount || 0,
        underReviewCount: res.underReviewCount || 0,
        resolvedCount: res.resolvedCount || 0,
      });
      flash(`Automated integrity scan completed: ${res.openCount} open alerts`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan integrity alerts');
    } finally {
      setIsScanningAlerts(false);
    }
  };

  const handleUpdateAlertStatus = async (alertId: string, status: string, notes?: string) => {
    setIsUpdatingAlert(true);
    try {
      await adminApi.updateTournamentIntegrityAlertStatus(alertId, status, notes);
      flash(`Alert status updated to ${status}`);
      setSelectedAlertForResolve(null);
      setResolutionNotesInput('');
      loadIntegrityAlerts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update alert status');
    } finally {
      setIsUpdatingAlert(false);
    }
  };

  const loadTournaments = async (p = page) => {
    setIsLoading(true);
    setError(null);
    try {
      let statusQuery: string | undefined = undefined;
      if (statusTab === 'LIVE') statusQuery = 'IN_PROGRESS';
      else if (statusTab === 'UPCOMING') statusQuery = 'UPCOMING';
      else if (statusTab === 'REGISTRATION') statusQuery = 'REGISTRATION_OPEN';
      else if (statusTab === 'COMPLETED') statusQuery = 'SETTLED';
      else if (statusTab === 'CANCELLED') statusQuery = 'CANCELLED';

      const data = await adminApi.tournaments(p, pageSize, statusQuery);
      setItems((data.items || []) as unknown as AdminTournamentDetail[]);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tournaments');
    } finally {
      setIsLoading(false);
    }
  };

  const loadScheduler = async () => {
    setIsSchedulerLoading(true);
    try {
      const [info, preview, matrix, tiers] = await Promise.all([
        adminApi.tournamentSchedulerInfo().catch(() => null),
        adminApi.tournamentSchedulerPreview(12).catch(() => []),
        adminApi.tournamentGameTiers().catch(() => ({})),
        adminApi.tournamentTiers().catch(() => []),
      ]);
      if (info) setSchedulerInfo(info);
      setSchedulerPreview(preview);
      setGameMatrix(matrix);
      setTiersList(tiers);
    } catch {
      // Best-effort load
    } finally {
      setIsSchedulerLoading(false);
    }
  };

  const loadAnalytics = async (silent = false) => {
    if (!silent) setIsAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const data = await adminTournamentsApi.analytics({
        timeFilter: analyticsTimeFilter,
        fromDate: analyticsTimeFilter === 'custom' ? analyticsFromDate : undefined,
        toDate: analyticsTimeFilter === 'custom' ? analyticsToDate : undefined,
        gameId: analyticsGame,
        tier: analyticsTier,
        tournamentId: analyticsTournament,
      });
      setAnalyticsData(data);
      setLastSyncTimestamp(new Date());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load tournament analytics';
      setAnalyticsError(msg);
      if (!silent) {
        setError(msg);
      }
    } finally {
      if (!silent) setIsAnalyticsLoading(false);
    }
  };

  const handleManualReconnect = () => {
    if (socketRef.current) {
      socketRef.current.connect();
    }
    loadAnalytics();
    loadScheduler();
    loadTournaments(1);
    flash('Reconnecting real-time stream & refreshing authoritative data...');
  };

  // Socket Connection & Real-Time Analytics Pipeline
  useEffect(() => {
    function getSocketUrl(): string {
      const envUrl = (import.meta.env.VITE_SOCKET_URL as string | undefined) || 'http://localhost:4001';
      if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return envUrl.replace('localhost', window.location.hostname).replace('127.0.0.1', window.location.hostname);
      }
      return envUrl;
    }

    const token = useAuthStore.getState().session?.access_token;
    if (!token) {
      setSocketStatus('disconnected');
      return;
    }

    const socket = createTypedSocket({
      url: getSocketUrl(),
      token: () => useAuthStore.getState().session?.access_token ?? null,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;
    socket.connect();

    socket.on('connect', () => {
      setSocketStatus('connected');
      setLastSyncTimestamp(new Date());
      socket.emit('admin:analytics:subscribe');

      if (wasDisconnectedRef.current) {
        wasDisconnectedRef.current = false;
        flash('🟢 Real-time connection restored. Latest authoritative data loaded.');
        loadAnalytics(true);
        loadScheduler();
        loadTournaments(1);
      }
    });

    socket.on('disconnect', () => {
      wasDisconnectedRef.current = true;
      setSocketStatus('reconnecting');
    });

    socket.on('connect_error', () => {
      wasDisconnectedRef.current = true;
      setSocketStatus('reconnecting');
    });

    // 1. Live Tournaments Update
    socket.on('admin:analytics:tournament-updated', (data) => {
      const eventItem: RealTimeEventItem = {
        id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'TOURNAMENT',
        title: `Tournament ${data.status.replace('_', ' ')}`,
        timestamp: data.timestamp || new Date().toISOString(),
        details: `ID: #${data.tournamentId.slice(-6)} ${data.tier ? `(${data.tier})` : ''}`,
        variant: data.status === 'CANCELLED' ? 'danger' : data.status === 'PAUSED' ? 'warning' : 'info',
      };
      setRealTimeEvents((prev) => [eventItem, ...prev].slice(0, 20));

      setAnalyticsData((prev) => {
        if (!prev) return prev;
        const isLive = data.status === 'IN_PROGRESS' || data.status === 'LIVE';
        const isCompleted = data.status === 'COMPLETED' || data.status === 'SETTLED';
        const isCancelled = data.status === 'CANCELLED';
        return {
          ...prev,
          overview: {
            ...prev.overview,
            liveTournaments: isLive
              ? prev.overview.liveTournaments + 1
              : Math.max(0, prev.overview.liveTournaments - 1),
            completedTournaments: isCompleted
              ? prev.overview.completedTournaments + 1
              : prev.overview.completedTournaments,
            cancellationRatePercent: isCancelled
              ? Number((((prev.overview.totalTournaments > 0 ? (prev.overview.cancellationRatePercent * prev.overview.totalTournaments / 100) + 1 : 1) / Math.max(1, prev.overview.totalTournaments + 1)) * 100).toFixed(1))
              : prev.overview.cancellationRatePercent,
          },
        };
      });

      setItems((prev) =>
        prev.map((t) =>
          t.id === data.tournamentId
            ? { ...t, status: data.status as any }
            : t
        )
      );
    });

    // 2. Active Match Update
    socket.on('admin:analytics:match-updated', (data) => {
      const eventItem: RealTimeEventItem = {
        id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'MATCH',
        title: `Match ${data.status}`,
        timestamp: data.timestamp || new Date().toISOString(),
        details: `Match #${data.matchId.slice(-6)} ${data.roundNumber ? `Round ${data.roundNumber}` : ''}`,
        variant: data.status === 'LIVE' ? 'info' : 'success',
      };
      setRealTimeEvents((prev) => [eventItem, ...prev].slice(0, 20));

      setAnalyticsData((prev) => {
        if (!prev) return prev;
        const isLive = data.status === 'LIVE';
        return {
          ...prev,
          health: {
            ...prev.health,
            stuckMatchesCount: isLive ? Math.max(0, prev.health.stuckMatchesCount - 1) : prev.health.stuckMatchesCount,
          },
        };
      });
    });

    // 3. Player Registration Update
    socket.on('admin:analytics:registration-updated', (data) => {
      const eventItem: RealTimeEventItem = {
        id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'REGISTRATION',
        title: 'Player Registered',
        timestamp: data.timestamp || new Date().toISOString(),
        details: `Tournament #${data.tournamentId.slice(-6)}: ${data.registeredPlayers}/${data.maxPlayers} players`,
        variant: 'info',
      };
      setRealTimeEvents((prev) => [eventItem, ...prev].slice(0, 20));

      setAnalyticsData((prev) => {
        if (!prev) return prev;
        const newTotalReg = prev.overview.totalRegistrations + 1;
        const newRevenue = prev.overview.totalEntryCollection + (data.entryFee || 0);
        return {
          ...prev,
          overview: {
            ...prev.overview,
            totalRegistrations: newTotalReg,
            totalEntryCollection: newRevenue,
            platformOperatingAmount: newRevenue - prev.overview.actualPrizeDistributed,
          },
        };
      });

      setItems((prev) =>
        prev.map((t) =>
          t.id === data.tournamentId
            ? { ...t, registeredPlayers: data.registeredPlayers, maxPlayers: data.maxPlayers }
            : t
        )
      );
    });

    // 4. Prize Settlement Update
    socket.on('admin:analytics:settlement-updated', (data) => {
      const isPaid = data.status === 'PAID';
      const eventItem: RealTimeEventItem = {
        id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'SETTLEMENT',
        title: isPaid ? 'Prize Settled' : 'Settlement Failed',
        timestamp: data.timestamp || new Date().toISOString(),
        details: `Tournament #${data.tournamentId.slice(-6)} ${data.amount ? `(${data.amount}🪙)` : ''}`,
        variant: isPaid ? 'success' : 'danger',
      };
      setRealTimeEvents((prev) => [eventItem, ...prev].slice(0, 20));

      setAnalyticsData((prev) => {
        if (!prev) return prev;
        if (isPaid) {
          const newPrizes = prev.overview.actualPrizeDistributed + (data.amount || 0);
          return {
            ...prev,
            overview: {
              ...prev.overview,
              actualPrizeDistributed: newPrizes,
              platformOperatingAmount: prev.overview.totalEntryCollection - newPrizes,
            },
            settlementAnalytics: {
              ...prev.settlementAnalytics,
              summary: {
                ...prev.settlementAnalytics.summary,
                creditedSettlements: prev.settlementAnalytics.summary.creditedSettlements + 1,
                failedSettlements: Math.max(0, prev.settlementAnalytics.summary.failedSettlements - 1),
                totalSettledAmount: prev.settlementAnalytics.summary.totalSettledAmount + (data.amount || 0),
              },
            },
          };
        } else {
          return {
            ...prev,
            settlementAnalytics: {
              ...prev.settlementAnalytics,
              summary: {
                ...prev.settlementAnalytics.summary,
                failedSettlements: prev.settlementAnalytics.summary.failedSettlements + 1,
                totalFailedAmount: prev.settlementAnalytics.summary.totalFailedAmount + (data.amount || 0),
              },
            },
            health: {
              ...prev.health,
              failedSettlementsCount: prev.health.failedSettlementsCount + 1,
            },
          };
        }
      });
    });

    // 5. Refund Update
    socket.on('admin:analytics:refund-updated', (data) => {
      const eventItem: RealTimeEventItem = {
        id: `rf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'REFUND',
        title: `Refund Processed (${data.status})`,
        timestamp: data.timestamp || new Date().toISOString(),
        details: `Tournament #${data.tournamentId.slice(-6)} ${data.amount ? `(${data.amount}🪙)` : ''}`,
        variant: data.status === 'COMPLETED' ? 'warning' : 'danger',
      };
      setRealTimeEvents((prev) => [eventItem, ...prev].slice(0, 20));

      setAnalyticsData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          overview: {
            ...prev.overview,
            totalRefunds: prev.overview.totalRefunds + (data.amount || 0),
          },
          refundAnalytics: {
            ...prev.refundAnalytics,
            summary: {
              ...prev.refundAnalytics.summary,
              totalRefundRequests: prev.refundAnalytics.summary.totalRefundRequests + 1,
              successfulRefundsCount: prev.refundAnalytics.summary.successfulRefundsCount + 1,
              totalRefundedCoins: prev.refundAnalytics.summary.totalRefundedCoins + (data.amount || 0),
            },
          },
        };
      });
    });

    // 6. Notification Failure Update
    socket.on('admin:analytics:notification-failed', (data) => {
      const eventItem: RealTimeEventItem = {
        id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'NOTIFICATION',
        title: 'Notification Failed',
        timestamp: data.timestamp || new Date().toISOString(),
        details: `${data.channel} - ${data.error || 'Delivery failed'}`,
        variant: 'danger',
      };
      setRealTimeEvents((prev) => [eventItem, ...prev].slice(0, 20));

      setAnalyticsData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          notificationAnalytics: {
            ...prev.notificationAnalytics,
            summary: {
              ...prev.notificationAnalytics.summary,
              emailsFailed: prev.notificationAnalytics.summary.emailsFailed + 1,
            },
          },
          health: {
            ...prev.health,
            failedNotificationsCount: prev.health.failedNotificationsCount + 1,
          },
        };
      });
    });

    // 7. Scheduler Status Update
    socket.on('admin:analytics:scheduler-status', (data) => {
      const eventItem: RealTimeEventItem = {
        id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'SCHEDULER',
        title: `Scheduler ${data.isPaused ? 'Paused' : 'Running'}`,
        timestamp: data.timestamp || new Date().toISOString(),
        details: `Status: ${data.status}`,
        variant: data.isPaused ? 'warning' : 'success',
      };
      setRealTimeEvents((prev) => [eventItem, ...prev].slice(0, 20));

      setSchedulerInfo((prev) => (prev ? { ...prev, isPaused: data.isPaused, status: data.status as any } : prev));
      setAnalyticsData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          health: {
            ...prev.health,
            schedulerHealth: {
              ...prev.health.schedulerHealth,
              status: data.isPaused ? 'STOPPED' : 'RUNNING',
            },
          },
        };
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    loadTournaments(1);
    setPage(1);
  }, [statusTab]);

  useEffect(() => {
    if (mainTab === 'ANALYTICS') {
      loadAnalytics();
    }
  }, [mainTab, analyticsTimeFilter, analyticsFromDate, analyticsToDate, analyticsGame, analyticsTier, analyticsTournament]);

  useEffect(() => {
    if (mainTab === 'SCHEDULER' || mainTab === 'TIERS' || mainTab === 'GAME_MATRIX') {
      loadScheduler();
    }
  }, [mainTab]);

  const handleGenerateReport = async () => {
    setIsGeneratingReport(true);
    setError(null);
    try {
      const res = await adminTournamentsApi.generateReport({
        reportType,
        timeFilter: reportTimeFilter,
        fromDate: reportTimeFilter === 'custom' ? reportFromDate : undefined,
        toDate: reportTimeFilter === 'custom' ? reportToDate : undefined,
        gameId: reportGame,
        tier: reportTier,
        status: reportStatus,
      });
      setGeneratedReport(res);
      flash(`Generated ${res.rows.length} records for ${reportType} report`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleDownloadReportCsv = async () => {
    try {
      await adminTournamentsApi.downloadReportCsv({
        reportType,
        timeFilter: reportTimeFilter,
        fromDate: reportTimeFilter === 'custom' ? reportFromDate : undefined,
        toDate: reportTimeFilter === 'custom' ? reportToDate : undefined,
        gameId: reportGame,
        tier: reportTier,
        status: reportStatus,
      });
      flash(`Downloaded CSV for ${reportType.replace(/_/g, ' ')} Report`);
    } catch {
      const url = adminTournamentsApi.getExportCsvUrl({
        reportType,
        timeFilter: reportTimeFilter,
        fromDate: reportTimeFilter === 'custom' ? reportFromDate : undefined,
        toDate: reportTimeFilter === 'custom' ? reportToDate : undefined,
        gameId: reportGame,
        tier: reportTier,
        status: reportStatus,
      });
      window.open(url, '_blank');
    }
  };

  const handleDownloadReportJson = () => {
    if (!generatedReport) return;
    const blob = new Blob([JSON.stringify(generatedReport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tournament-report-${generatedReport.reportType.toLowerCase()}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Dynamic filter for tournaments list
  const filteredItems = useMemo(() => {
    return items.filter((t) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !t.id.toLowerCase().includes(q)) return false;
      }
      if (filterGame !== 'ALL' && t.gameId !== filterGame) return false;
      if (selectedTier !== 'ALL') {
        const tierName = (t as any).configSnapshot?.tierCode || t.title.toLowerCase();
        if (!tierName.includes(selectedTier.toLowerCase())) return false;
      }
      return true;
    });
  }, [items, searchQuery, filterGame, selectedTier]);

  const handleToggleScheduler = async () => {
    if (!schedulerInfo) return;
    try {
      const newPaused = !schedulerInfo.isPaused;
      const updated = await adminApi.toggleTournamentScheduler(
        newPaused,
        newPaused ? 'Paused by tournament admin' : 'Resumed by tournament admin'
      );
      setSchedulerInfo(updated);
      setShowPauseConfirm(false);
      flash(`Hourly Tournament Scheduler ${newPaused ? 'PAUSED' : 'RESUMED'}`);
      loadScheduler();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update scheduler');
    }
  };

  const handleToggleGameTier = async (gameId: string, tierCode: TournamentTierCode) => {
    const currentEnabled = (gameMatrix[gameId]?.[tierCode] ?? true);
    const updated = {
      ...gameMatrix,
      [gameId]: {
        ...(gameMatrix[gameId] || { mini: true, basic: true, standard: true, premium: true, pro: true }),
        [tierCode]: !currentEnabled,
      },
    };
    setGameMatrix(updated);
    setIsMatrixSaving(true);
    try {
      await adminApi.updateTournamentGameTiers(updated);
      flash(`Updated tier availability for ${formatGame(gameId)} → ${tierCode.toUpperCase()} (${!currentEnabled ? 'Enabled' : 'Disabled'})`);
    } catch {
      setError('Failed to update game-tier availability');
    } finally {
      setIsMatrixSaving(false);
    }
  };

  const handleToggleGameAllTiers = async (gameId: string, enable: boolean) => {
    const updated = {
      ...gameMatrix,
      [gameId]: {
        mini: enable,
        basic: enable,
        standard: enable,
        premium: enable,
        pro: enable,
      },
    };
    setGameMatrix(updated);
    setIsMatrixSaving(true);
    try {
      await adminApi.updateTournamentGameTiers(updated);
      flash(`${enable ? 'Enabled' : 'Disabled'} all tiers for ${formatGame(gameId)}`);
    } catch {
      setError('Failed to update game-tier availability');
    } finally {
      setIsMatrixSaving(false);
    }
  };

  const handleToggleTierAllGames = async (tierCode: TournamentTierCode, enable: boolean) => {
    const updated: GameTierAvailability = { ...gameMatrix };
    for (const g of GAME_DEFINITIONS) {
      updated[g.id] = {
        ...(updated[g.id] || { mini: true, basic: true, standard: true, premium: true, pro: true }),
        [tierCode]: enable,
      };
    }
    setGameMatrix(updated);
    setIsMatrixSaving(true);
    try {
      await adminApi.updateTournamentGameTiers(updated);
      flash(`${enable ? 'Enabled' : 'Disabled'} ${tierCode.toUpperCase()} tier across all 10 games`);
    } catch {
      setError('Failed to update game-tier availability');
    } finally {
      setIsMatrixSaving(false);
    }
  };

  const handleSaveTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTier) return;
    try {
      await adminApi.updateTournamentTier(editingTier.id, {
        name: editingTier.name,
        entryFee: Number(editingTier.entryFee),
        prizePool: Number(editingTier.prizePool),
        maxPlayers: Number(editingTier.maxPlayers),
        isActive: Boolean(editingTier.isActive),
      });
      setEditingTier(null);
      flash(`Tier "${editingTier.name}" configuration saved`);
      loadScheduler();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tier');
    }
  };

  const handleCreate = async () => {
    if (!form.title || !form.startTime) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        ...form,
        startTime: new Date(form.startTime).toISOString(),
      };
      if (form.registrationEndsAt) {
        payload.registrationEndsAt = new Date(form.registrationEndsAt).toISOString();
      }
      await adminApi.createTournament(payload);
      setShowCreateModal(false);
      flash('Exceptional tournament created');
      await loadTournaments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tournament');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExport = (format: 'csv' | 'json') => {
    const url = `/api/admin/tournaments/export?format=${format}`;
    window.open(url, '_blank');
  };

  const formatGame = (gameId: string) => gameById.get(gameId as GameId)?.name ?? gameId;

  const totalPages = Math.ceil(total / pageSize);

  // Dynamic Prize Preview for Creation / Edit
  const calculatePrizes = (pool: number) => ({
    p1: Math.round(pool * 0.5),
    p2: Math.round(pool * 0.25),
    p3: Math.round(pool * 0.15),
    p4: Math.round(pool * 0.1),
  });

  return (
    <div className="min-h-screen space-y-6">
      {/* Top Banner Header */}
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-white border border-indigo-500/20 shadow-2xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-indigo-500/20 border border-indigo-500/30 backdrop-blur shadow-inner">
              <Trophy className="size-8 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Tournament Control Center</h1>
                {schedulerInfo && (
                  <Badge variant={schedulerInfo.isPaused ? 'warning' : 'success'} className="font-bold">
                    {schedulerInfo.isPaused ? '⏸ SCHEDULER PAUSED' : '⚡ HOURLY AUTO-RUN'}
                  </Badge>
                )}
                <button
                  onClick={() => setShowRealTimeDrawer(true)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black transition-all cursor-pointer border ${
                    socketStatus === 'connected'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 shadow-sm shadow-emerald-500/10'
                      : socketStatus === 'reconnecting'
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20 animate-pulse'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20'
                  }`}
                  title="Click to view real-time activity stream"
                >
                  <span className={`size-2 rounded-full ${
                    socketStatus === 'connected'
                      ? 'bg-emerald-400 animate-ping'
                      : socketStatus === 'reconnecting'
                      ? 'bg-amber-400 animate-spin'
                      : 'bg-rose-400'
                  }`} />
                  <span>
                    {socketStatus === 'connected'
                      ? 'LIVE REAL-TIME'
                      : socketStatus === 'reconnecting'
                      ? 'RECONNECTING...'
                      : 'DISCONNECTED'}
                  </span>
                  {realTimeEvents.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-900/80 text-[10px] text-white">
                      {realTimeEvents.length}
                    </span>
                  )}
                </button>
              </div>
              <p className="text-xs sm:text-sm text-indigo-200/80 mt-1">
                Server-authoritative 5-tier & 10-game management, automated scheduling, and financial recovery
              </p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRealTimeDrawer(true)}
              className="border-indigo-500/40 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20 text-xs font-bold gap-1.5"
            >
              <Zap className="size-3.5 text-amber-400" /> Live Stream ({realTimeEvents.length})
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowReportModal(true)}
              className="border-indigo-500/40 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20 text-xs font-bold gap-1.5"
            >
              <FileText className="size-3.5 text-indigo-400" /> Reports & Exports
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('csv')}
              className="border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-700 text-xs font-bold gap-1.5"
            >
              <Download className="size-3.5 text-emerald-400" /> Export CSV
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/admin/tournaments/disputes')}
              className="border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs font-bold gap-1.5"
            >
              <AlertTriangle className="size-3.5 text-amber-400" /> Disputes
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setForm({
                  ...EMPTY_FORM,
                  startTime: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
                });
                setShowCreateModal(true);
              }}
              className="bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 hover:from-amber-400 hover:to-orange-400 font-black text-xs gap-1.5 shadow-lg shadow-amber-500/20"
            >
              <Plus className="size-4" /> Exceptional Tournament
            </Button>
          </div>
        </div>

        {/* Primary Tab Navigation */}
        <div className="flex items-center gap-2 mt-8 overflow-x-auto pb-1 no-scrollbar border-b border-indigo-900/60">
          {[
            { id: 'TOURNAMENTS', label: 'Tournaments Directory', icon: Trophy },
            { id: 'ANALYTICS', label: 'Analytics & Overview', icon: BarChart3 },
            { id: 'REPORTS', label: 'Tournament Reports', icon: FileText },
            { id: 'SCHEDULER', label: 'Hourly Scheduler & Preview', icon: Clock },
            { id: 'TIERS', label: '5-Tier Configuration', icon: Sliders },
            { id: 'GAME_MATRIX', label: 'Game-Tier Matrix', icon: Grid },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = mainTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setMainTab(tab.id as MainTab)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                  active
                    ? 'bg-white text-slate-950 shadow-md font-black'
                    : 'text-indigo-200 hover:text-white hover:bg-white/10'
                }`}
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Real-time Connection Warning Banner */}
      {socketStatus !== 'connected' && (
        <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-950/60 via-slate-900/90 to-amber-950/60 p-4 shadow-xl text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-300">
          <div className="flex items-center gap-3.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 shrink-0">
              <WifiOff className="size-5 animate-pulse" />
            </div>
            <div>
              <div className="text-sm font-black text-white flex items-center gap-2">
                <span>Real-Time Connection Interrupted</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                  {socketStatus === 'reconnecting' ? 'Auto-Reconnecting...' : 'Disconnected'}
                </span>
              </div>
              <p className="text-xs text-amber-300/80 mt-0.5">
                Live tournament event stream is disconnected. System is reconnecting automatically and will refresh authoritative data upon reconnection.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualReconnect}
              className="border-amber-500/50 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-bold gap-1.5 w-full sm:w-auto shadow-md"
            >
              <RefreshCw className="size-3.5 animate-spin" /> Reconnect &amp; Refresh
            </Button>
          </div>
        </div>
      )}

      {/* Success & Error Alert Messages */}
      {successMessage && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-400 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-400 flex items-center gap-2">
          <XCircle className="size-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-xs underline">Dismiss</button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 1. TOURNAMENTS DIRECTORY TAB */}
      {/* ===================================================================== */}
      {mainTab === 'TOURNAMENTS' && (
        <div className="space-y-6">
          {/* Status filter bar */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {[
                { id: 'ALL', label: 'All Status' },
                { id: 'LIVE', label: '🟢 Live Now' },
                { id: 'UPCOMING', label: '⏳ Upcoming' },
                { id: 'REGISTRATION', label: '📝 Registration Open' },
                { id: 'COMPLETED', label: '🏆 Completed / Settled' },
                { id: 'CANCELLED', label: '❌ Cancelled' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusTab(tab.id as StatusTab)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    statusTab === tab.id
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => loadTournaments()}
              className="border-slate-800 text-xs h-8 gap-1.5"
            >
              <RefreshCw className="size-3.5" /> Refresh
            </Button>
          </div>

          {/* Tier quick-selector chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1">
              <Layers className="size-3.5" /> Tier:
            </span>
            <button
              onClick={() => setSelectedTier('ALL')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                selectedTier === 'ALL'
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white'
                  : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              All Tiers
            </button>
            {TIER_ORDER.map((code) => {
              const visual = TOURNAMENT_TIER_VISUALS[code];
              const isSel = selectedTier === code;
              return (
                <button
                  key={code}
                  onClick={() => setSelectedTier(code)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
                    isSel
                      ? `${visual.badgeBgClass} ${visual.borderClass} ring-1`
                      : 'border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span>{visual.badgeEmoji}</span>
                  <span>{visual.name}</span>
                </button>
              );
            })}
          </div>

          {/* Search and Game Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by tournament title, ID or match..."
                className="w-full rounded-xl border border-slate-800 bg-slate-900/90 py-2 pl-10 pr-4 text-xs font-medium text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <select
                value={filterGame}
                onChange={(e) => setFilterGame(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900/90 py-2 px-3 text-xs font-medium text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="ALL">All 10 Games</option>
                {GAME_DEFINITIONS.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tournaments List & Cards */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-slate-900/40 rounded-3xl border border-slate-800">
              <Loader2 className="size-8 animate-spin text-indigo-400 mb-2" />
              <p className="text-xs text-slate-400">Loading tournaments...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/40 rounded-3xl border border-slate-800 p-6">
              <Trophy className="size-12 text-slate-600 mx-auto mb-3" />
              <p className="text-base font-bold text-slate-300">No tournaments match your filters</p>
              <p className="text-xs text-slate-500 mt-1">Try resetting the status, game, or tier filter</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/80 backdrop-blur shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/60 font-semibold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-5 py-3.5">Tournament & Tier</th>
                      <th className="px-4 py-3.5">Game</th>
                      <th className="px-4 py-3.5 text-right">Entry Fee</th>
                      <th className="px-4 py-3.5 text-right">Prize Pool</th>
                      <th className="px-4 py-3.5 text-center">Players</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5">Start Time</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {filteredItems.map((t) => {
                      const tierCode = (t as any).configSnapshot?.tierCode || 'standard';
                      const visual = TOURNAMENT_TIER_VISUALS[tierCode] || TOURNAMENT_TIER_VISUALS.standard;
                      const startsFormatted = new Date(t.startTime).toLocaleTimeString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      return (
                        <tr
                          key={t.id}
                          onClick={() => navigate(`/admin/tournaments/${t.id}`)}
                          className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                        >
                          <td className="px-5 py-3.5">
                            <div className="font-bold text-white flex items-center gap-2">
                              <span>{visual.badgeEmoji}</span>
                              <span className="truncate max-w-[220px]">{t.title}</span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">{t.id}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="font-semibold text-slate-200">{formatGame(t.gameId)}</span>
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono font-bold text-amber-400">
                            {t.entryFee ? `🪙 ${t.entryFee}` : 'Free'}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono font-black text-emerald-400">
                            🪙 {t.prizePool.toLocaleString()}
                          </td>
                          <td className="px-4 py-3.5 text-center font-mono">
                            <span className="text-white font-bold">{t.players?.length ?? 0}</span>
                            <span className="text-slate-500 text-[10px]"> / {t.maxPlayers}</span>
                          </td>
                          <td className="px-4 py-3.5">
                            <Badge variant={STATUS_VARIANT[t.status as TournamentStatus] || 'default'} className="text-[10px]">
                              {t.status.replace(/_/g, ' ')}
                            </Badge>
                          </td>
                          <td className="px-4 py-3.5 text-slate-400 font-mono text-[11px]">
                            {startsFormatted}
                          </td>
                          <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/admin/tournaments/${t.id}`)}
                              className="border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs h-7 px-2.5 font-bold"
                            >
                              <Eye className="size-3.5 mr-1" /> Open
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
              <span>Page {page} of {totalPages} ({total} total)</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => { setPage(page - 1); loadTournaments(page - 1); }}
                  className="h-8"
                >
                  <ChevronLeft className="size-4" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => { setPage(page + 1); loadTournaments(page + 1); }}
                  className="h-8"
                >
                  Next <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. TOURNAMENT ANALYTICS & REPORTING SYSTEM TAB                        */}
      {/* ===================================================================== */}
      {mainTab === 'ANALYTICS' && (
        <div className="space-y-6">
          {/* Analytics Filter Bar */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl backdrop-blur space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mr-1">
                  <Calendar className="size-3.5" /> Timeframe:
                </span>
                {[
                  { value: 'today', label: 'Today' },
                  { value: 'yesterday', label: 'Yesterday' },
                  { value: 'last7days', label: 'Last 7 Days' },
                  { value: 'last30days', label: 'Last 30 Days' },
                  { value: 'thismonth', label: 'This Month' },
                  { value: 'custom', label: 'Custom Range' },
                ].map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setAnalyticsTimeFilter(p.value as TournamentAnalyticsTimeFilter)}
                    className={`rounded-xl px-3.5 py-1.5 text-xs font-bold whitespace-nowrap transition-all ${
                      analyticsTimeFilter === p.value
                        ? 'bg-indigo-600 text-white shadow-md font-black'
                        : 'bg-slate-950/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadAnalytics()}
                  disabled={isAnalyticsLoading}
                  className="border-slate-800 text-xs h-8 gap-1.5 bg-slate-950/50"
                >
                  <RefreshCw className={`size-3.5 ${isAnalyticsLoading ? 'animate-spin' : ''}`} /> Refresh
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReportModal(true)}
                  className="border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 text-xs h-8 gap-1.5 font-bold"
                >
                  <FileText className="size-3.5" /> Reports & CSV
                </Button>
              </div>
            </div>

            {/* Custom Date Pickers & Scope Dropdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-800/80">
              {analyticsTimeFilter === 'custom' && (
                <>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">From Date</label>
                    <input
                      type="date"
                      value={analyticsFromDate}
                      onChange={(e) => setAnalyticsFromDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1">To Date</label>
                    <input
                      type="date"
                      value={analyticsToDate}
                      onChange={(e) => setAnalyticsToDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">Game Discipline</label>
                <select
                  value={analyticsGame}
                  onChange={(e) => setAnalyticsGame(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="ALL">All 10 Games</option>
                  {GAME_DEFINITIONS.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">Tournament Tier</label>
                <select
                  value={analyticsTier}
                  onChange={(e) => setAnalyticsTier(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="ALL">All 5 Tiers</option>
                  <option value="mini">🟢 Mini (5🪙)</option>
                  <option value="basic">🔵 Basic (10🪙)</option>
                  <option value="standard">🟣 Standard (25🪙)</option>
                  <option value="premium">🟠 Premium (50🪙)</option>
                  <option value="pro">🔴 Pro (100🪙)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">Specific Tournament</label>
                <select
                  value={analyticsTournament}
                  onChange={(e) => setAnalyticsTournament(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="ALL">All Tournaments</option>
                  {items.slice(0, 30).map((t) => (
                    <option key={t.id} value={t.id}>{t.title} (#{t.id.slice(-6)})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Real-Time Live Activity Bar */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-inner">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className={`flex size-10 items-center justify-center rounded-xl shrink-0 ${
                socketStatus === 'connected'
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-sm shadow-emerald-500/10'
                  : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
              }`}>
                <Radio className={`size-5 ${socketStatus === 'connected' ? 'animate-pulse' : ''}`} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black text-white">Live Stream Ticker:</span>
                  {realTimeEvents.length > 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-indigo-300 truncate font-mono">
                      <span className={`inline-block size-2 rounded-full ${
                        realTimeEvents[0].variant === 'danger'
                          ? 'bg-rose-400 animate-pulse'
                          : realTimeEvents[0].variant === 'warning'
                          ? 'bg-amber-400 animate-pulse'
                          : 'bg-emerald-400 animate-pulse'
                      }`} />
                      <strong className="text-slate-100">{realTimeEvents[0].title}</strong> — {realTimeEvents[0].details}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Listening for live tournament updates across 7 operations...</span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2.5 flex-wrap">
                  <span>Authoritative sync: <strong className="text-slate-400">{lastSyncTimestamp ? lastSyncTimestamp.toLocaleTimeString() : 'Just now'}</strong></span>
                  <span>·</span>
                  <span><strong>{realTimeEvents.length}</strong> events logged in session</span>
                  <span>·</span>
                  <span className={socketStatus === 'connected' ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                    Socket: {socketStatus.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
              <button
                onClick={() => setShowRealTimeDrawer(true)}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <Zap className="size-3.5 text-amber-400" /> Event Stream ({realTimeEvents.length})
              </button>
              <button
                onClick={() => loadAnalytics()}
                disabled={isAnalyticsLoading}
                className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
              >
                <RefreshCw className={`size-3.5 text-indigo-400 ${isAnalyticsLoading ? 'animate-spin' : ''}`} /> Refresh Snapshot
              </button>
            </div>
          </div>

          {/* Disconnected Stream Warning Banner */}
          {socketStatus !== 'connected' && (
            <div className="rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-950/60 via-slate-900 to-amber-950/40 p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-md">
              <div className="flex items-center gap-2.5 text-amber-200">
                <AlertTriangle className="size-4 text-amber-400 shrink-0 animate-pulse" />
                <span>
                  <strong>Real-Time Stream Disconnected ({socketStatus.toUpperCase()})</strong> — Displaying last valid snapshot from <strong>{lastSyncTimestamp ? lastSyncTimestamp.toLocaleTimeString() : 'earlier'}</strong>. Reconnecting automatically...
                </span>
              </div>
              <button
                onClick={handleManualReconnect}
                className="px-3 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-bold shrink-0 transition-all"
              >
                Reconnect Stream
              </button>
            </div>
          )}

          {/* 1. Loading State */}
          {isAnalyticsLoading && !analyticsData ? (
            <div className="space-y-6 animate-pulse">
              <div className="p-8 rounded-3xl border border-slate-800 bg-slate-900/60 flex flex-col items-center justify-center text-center">
                <Loader2 className="size-10 animate-spin text-indigo-400 mb-3" />
                <h3 className="text-base font-bold text-white">Aggregating Authoritative Tournament Analytics</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md">
                  Cross-checking registrations, prize distributions, wallet transactions, and match brackets across all 10 games and 5 tiers...
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="h-28 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
                    <div className="h-3 w-1/2 bg-slate-800 rounded" />
                    <div className="h-6 w-3/4 bg-slate-700 rounded" />
                    <div className="h-2 w-1/3 bg-slate-800 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ) : analyticsError && !analyticsData ? (
            /* 2. Error State (No misleading zero values) */
            <div className="p-8 rounded-3xl border border-rose-800/40 bg-gradient-to-br from-rose-950/40 via-slate-900 to-rose-950/20 flex flex-col items-center justify-center text-center space-y-4 shadow-xl">
              <div className="size-14 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shadow-lg shadow-rose-500/10">
                <AlertTriangle className="size-7" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">Unable to Load Tournament Analytics</h3>
                <p className="text-xs text-rose-300 mt-1 max-w-md">
                  {analyticsError}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  No misleading zero values are displayed. Please verify database connectivity or permissions and retry.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => loadAnalytics()}
                  disabled={isAnalyticsLoading}
                  className="text-xs font-bold"
                >
                  <RefreshCw className={`size-3.5 mr-1.5 ${isAnalyticsLoading ? 'animate-spin' : ''}`} />
                  Retry Request
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAnalyticsTimeFilter('last30days');
                    setAnalyticsGame('ALL');
                    setAnalyticsTier('ALL');
                    setAnalyticsTournament('ALL');
                    setTimeout(() => loadAnalytics(), 0);
                  }}
                  className="text-xs font-bold text-slate-300"
                >
                  Reset Filters & Retry
                </Button>
              </div>
            </div>
          ) : !analyticsData || (analyticsData.overview.totalTournaments === 0 && analyticsData.overview.totalRegistrations === 0) ? (
            /* 3. Empty State (No tournament activity matches filters) */
            <div className="p-10 rounded-3xl border border-dashed border-slate-800 bg-slate-950/60 flex flex-col items-center justify-center text-center space-y-4">
              <div className="size-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400">
                <Inbox className="size-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">No Tournament Activity Found</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-md">
                  No tournaments, registrations, or prize payouts match the selected filter criteria (
                  {analyticsGame !== 'ALL' ? `Game: ${analyticsGame}` : 'All Games'}, {analyticsTier !== 'ALL' ? `Tier: ${analyticsTier}` : 'All Tiers'}, Timeframe: {analyticsTimeFilter}
                  ).
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAnalyticsTimeFilter('last30days');
                  setAnalyticsGame('ALL');
                  setAnalyticsTier('ALL');
                  setAnalyticsTournament('ALL');
                  setTimeout(() => loadAnalytics(), 0);
                }}
                className="text-xs font-bold text-indigo-300 border-indigo-500/40 hover:bg-indigo-500/10"
              >
                Reset All Filters
              </Button>
            </div>
          ) : (
            <>
              {/* ========================================================================= */}
              {/* 0. DATA VALIDATION & FINANCIAL CROSS-CHECK LAYER                          */}
              {/* ========================================================================= */}
              <div className={`rounded-3xl border p-5 shadow-xl backdrop-blur transition-all ${
                analyticsData.validation?.status === 'CRITICAL_INCONSISTENCY'
                  ? 'border-rose-500/40 bg-gradient-to-r from-rose-950/70 via-slate-900/90 to-rose-950/40'
                  : analyticsData.validation?.status === 'NEEDS_REVIEW'
                  ? 'border-amber-500/40 bg-gradient-to-r from-amber-950/60 via-slate-900/90 to-amber-950/30'
                  : 'border-emerald-500/30 bg-gradient-to-r from-emerald-950/50 via-slate-900/90 to-emerald-950/20'
              }`}>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className={`flex size-11 items-center justify-center rounded-2xl shrink-0 font-black text-lg ${
                      analyticsData.validation?.status === 'CRITICAL_INCONSISTENCY'
                        ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                        : analyticsData.validation?.status === 'NEEDS_REVIEW'
                        ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                        : 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                    }`}>
                      <Shield className="size-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Data Validation Engine</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${
                          analyticsData.validation?.status === 'CRITICAL_INCONSISTENCY'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse'
                            : analyticsData.validation?.status === 'NEEDS_REVIEW'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        }`}>
                          {analyticsData.validation?.status === 'VALID' ? 'DATA VALIDATION: VERIFIED & BALANCED' : 'DATA VALIDATION / NEEDS REVIEW'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">
                        {analyticsData.validation?.status === 'VALID'
                          ? `All ${analyticsData.validation.totalCheckedTournaments} tournaments, ${analyticsData.validation.totalCheckedRegistrations} registrations, entry fees, prizes, and ${analyticsData.validation.totalCheckedRefunds} refunds match ledger transactions perfectly.`
                          : `${analyticsData.validation?.criticalIssuesCount || 0} critical inconsistencies and ${analyticsData.validation?.warningIssuesCount || 0} warnings detected across financial ledger and settlement records.`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 w-full md:w-auto justify-end flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowAlertsDrawer(true);
                        loadIntegrityAlerts();
                      }}
                      className="text-xs font-bold text-amber-300 border-amber-500/40 hover:bg-amber-500/10"
                    >
                      <AlertTriangle className="size-3.5 mr-1 text-amber-400" />
                      Integrity Alerts
                    </Button>
                    <Button
                      variant={analyticsData.validation?.status === 'VALID' ? 'outline' : 'primary'}
                      size="sm"
                      onClick={() => setShowValidationModal(true)}
                      className="text-xs font-bold"
                    >
                      <FileText className="size-3.5 mr-1" />
                      {analyticsData.validation?.status === 'VALID' ? 'View Audit Scorecard' : `Inspect Issues (${analyticsData.validation?.issuesCount || 0})`}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRunLiveAudit}
                      disabled={isValidatingAudit}
                      className="text-xs font-bold text-slate-300 hover:text-white"
                    >
                      <RefreshCw className={`size-3.5 mr-1 text-indigo-400 ${isValidatingAudit ? 'animate-spin' : ''}`} />
                      Live Re-Audit
                    </Button>
                  </div>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* 1. COMPREHENSIVE TOURNAMENT HEALTH & OPERATIONAL MONITORING              */}
              {/* ========================================================================= */}
              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur space-y-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-3.5">
                    <div className={`flex size-11 items-center justify-center rounded-2xl font-black text-lg ${
                      analyticsData.health.overallStatus === 'CRITICAL'
                        ? 'bg-rose-500 text-white'
                        : analyticsData.health.overallStatus === 'ATTENTION'
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-emerald-500 text-slate-950'
                    }`}>
                      {analyticsData.health.overallStatus === 'CRITICAL' ? '🔴' : analyticsData.health.overallStatus === 'ATTENTION' ? '🟡' : '🟢'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-black text-white">
                          Tournament Health: {analyticsData.health.overallStatus}
                        </h3>
                        <Badge variant={
                          analyticsData.health.schedulerHealth.status === 'RUNNING'
                            ? 'success'
                            : analyticsData.health.schedulerHealth.status === 'STOPPED'
                            ? 'default'
                            : 'danger'
                        }>
                          {analyticsData.health.schedulerHealth.status === 'RUNNING'
                            ? 'Scheduler: 🟢 RUNNING'
                            : analyticsData.health.schedulerHealth.status === 'STOPPED'
                            ? 'Scheduler: ⏸ STOPPED'
                            : 'Scheduler: 🔴 ERROR'}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Authoritative operational health monitoring, "Needs Review" threshold detection & audit trail
                      </p>
                    </div>
                  </div>

                  {/* Health Filter Pills */}
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800 overflow-x-auto">
                    {[
                      { id: 'ALL', label: `All Reviews (${analyticsData.health.reviewItems?.length || 0})` },
                      { id: 'CRITICAL', label: `🔴 Critical (${analyticsData.health.criticalTournamentsCount})` },
                      { id: 'ATTENTION', label: `🟡 Attention (${analyticsData.health.attentionTournamentsCount})` },
                      { id: 'STUCK_TOURNAMENTS', label: `🚨 Stuck Tournaments (${analyticsData.health.stuckTournaments?.length || 0})` },
                      { id: 'STUCK_MATCHES', label: `⏱️ Stuck Matches (${analyticsData.health.stuckMatchesCount})` },
                      { id: 'SCHEDULER', label: '⚙️ Scheduler' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setHealthFilterTab(tab.id as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                          healthFilterTab === tab.id
                            ? tab.id === 'STUCK_TOURNAMENTS' && (analyticsData.health.stuckTournaments?.length || 0) > 0
                              ? 'bg-rose-600 text-white shadow font-black animate-pulse'
                              : 'bg-indigo-600 text-white shadow font-black'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stuck Tournaments High-Visibility Warning Banner */}
                {(analyticsData.health.stuckTournaments?.length || 0) > 0 && (
                  <div className="rounded-2xl border border-rose-500/80 bg-rose-950/40 p-4 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-xl bg-rose-500 text-white font-black text-lg animate-bounce">
                        ⚠️
                      </div>
                      <div>
                        <div className="text-sm font-black text-white flex items-center gap-2">
                          <span>{analyticsData.health.stuckTournaments.length} Stuck Tournaments Exceeding Operational Thresholds</span>
                          <span className="inline-block px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold">
                            NEEDS_REVIEW
                          </span>
                        </div>
                        <div className="text-xs text-rose-300 mt-0.5">
                          Monitored states: BRACKET_GENERATING (5m), ROUND_READY (5m), IN_PROGRESS (60m), and SETTLEMENT_PROCESSING (10m).
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setHealthFilterTab('STUCK_TOURNAMENTS')}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black transition-all whitespace-nowrap shadow"
                    >
                      Inspect Stuck Tournaments →
                    </button>
                  </div>
                )}

                {/* 8 Core Health KPI Metric Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
                  <div className="rounded-2xl bg-emerald-950/20 border border-emerald-800/40 p-3">
                    <div className="text-[10px] font-bold text-emerald-400 uppercase">Healthy</div>
                    <div className="text-xl font-black text-emerald-400 font-mono mt-0.5">
                      {analyticsData.health.healthyTournamentsCount}
                    </div>
                    <div className="text-[9px] text-slate-500 mt-0.5">Within normal state</div>
                  </div>

                  <div className="rounded-2xl bg-amber-950/20 border border-amber-800/40 p-3">
                    <div className="text-[10px] font-bold text-amber-400 uppercase">Attention</div>
                    <div className="text-xl font-black text-amber-400 font-mono mt-0.5">
                      {analyticsData.health.attentionTournamentsCount}
                    </div>
                    <div className="text-[9px] text-slate-500 mt-0.5">Overtime / warnings</div>
                  </div>

                  <div className="rounded-2xl bg-rose-950/20 border border-rose-800/40 p-3">
                    <div className="text-[10px] font-bold text-rose-400 uppercase">Critical</div>
                    <div className="text-xl font-black text-rose-400 font-mono mt-0.5">
                      {analyticsData.health.criticalTournamentsCount}
                    </div>
                    <div className="text-[9px] text-slate-500 mt-0.5">Threshold exceeded</div>
                  </div>

                  <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Stuck Tourns</div>
                    <div className="text-xl font-black text-rose-400 font-mono mt-0.5">
                      {analyticsData.health.stuckTournamentsCount}
                    </div>
                    <div className="text-[9px] text-slate-500 mt-0.5">&gt;60m progress / &gt;15m settle</div>
                  </div>

                  <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Failed Matches</div>
                    <div className="text-xl font-black text-amber-400 font-mono mt-0.5">
                      {analyticsData.health.failedMatchCreationCount}
                    </div>
                    <div className="text-[9px] text-slate-500 mt-0.5">Creation errors</div>
                  </div>

                  <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Failed Settlements</div>
                    <div className="text-xl font-black text-rose-400 font-mono mt-0.5">
                      {analyticsData.health.failedSettlementsCount}
                    </div>
                    <div className="text-[9px] text-slate-500 mt-0.5">Payout errors</div>
                  </div>

                  <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Failed Notifs</div>
                    <div className="text-xl font-black text-amber-400 font-mono mt-0.5">
                      {analyticsData.health.failedNotificationsCount}
                    </div>
                    <div className="text-[9px] text-slate-500 mt-0.5">Email delivery logs</div>
                  </div>

                  <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-3">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Scheduler</div>
                    <div className={`text-sm font-black font-mono mt-1 ${
                      analyticsData.health.schedulerHealth.status === 'RUNNING'
                        ? 'text-emerald-400'
                        : analyticsData.health.schedulerHealth.status === 'STOPPED'
                        ? 'text-slate-300'
                        : 'text-rose-400'
                    }`}>
                      {analyticsData.health.schedulerHealth.status === 'RUNNING'
                        ? '🟢 RUNNING'
                        : analyticsData.health.schedulerHealth.status === 'STOPPED'
                        ? '⏸ STOPPED'
                        : '🔴 ERROR'}
                    </div>
                    <div className="text-[9px] text-slate-500 mt-0.5">
                      {analyticsData.health.schedulerHealth.isMissedRunDetected ? '⚠️ Missed Run' : '1h Cadence'}
                    </div>
                  </div>
                </div>

                {/* Safety & Non-Mutation Disclaimer Banner */}
                <div className="rounded-2xl border border-indigo-900/40 bg-indigo-950/20 p-3 flex items-center justify-between text-xs text-indigo-300">
                  <div className="flex items-center gap-2">
                    <Shield className="size-4 text-indigo-400 flex-shrink-0" />
                    <span>
                      <strong>Safe Monitoring Mode:</strong> This health system is strictly read-only. It audits and flags items as <strong>"NEEDS_REVIEW"</strong> without automatically modifying results, declaring winners, cancelling tournaments, penalizing players, or altering wallet balances.
                    </span>
                  </div>
                  <span className="text-[10px] text-indigo-400 font-mono whitespace-nowrap ml-2">
                    Checked: {new Date(analyticsData.health.checkedAt).toLocaleTimeString()}
                  </span>
                </div>

                {/* Needs Review & Health Sub-Views */}
                <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
                  {healthFilterTab === 'SCHEDULER' ? (
                    <div className="p-5 space-y-4 font-mono text-xs">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-800 font-sans">
                        <div>
                          <h4 className="font-bold text-sm text-white flex items-center gap-2">
                            <Sliders className="size-4 text-indigo-400" /> Hourly Tournament Scheduler Health & Diagnostics
                          </h4>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Tournaments are scheduled every 1 hour (60 minutes). Idempotency guarantees zero duplicate tournaments across backend instances.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-block px-2.5 py-1 rounded text-[11px] font-black uppercase font-mono ${
                            analyticsData.health.schedulerHealth.status === 'RUNNING'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-800/40'
                              : analyticsData.health.schedulerHealth.status === 'STOPPED'
                              ? 'bg-slate-800 text-slate-300 border border-slate-700'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-800/40 animate-pulse'
                          }`}>
                            Status: {analyticsData.health.schedulerHealth.status}
                          </span>
                        </div>
                      </div>

                      {/* Missed Run Alert Warning */}
                      {analyticsData.health.schedulerHealth.isMissedRunDetected && (
                        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-sans">
                          <div className="flex items-center gap-2.5">
                            <AlertTriangle className="size-5 text-rose-400 flex-shrink-0 animate-bounce" />
                            <div>
                              <div className="text-xs font-black text-white flex items-center gap-1.5">
                                <span>Hourly Scheduler Missed Run Detected</span>
                                <span className="inline-block px-2 py-0.2 rounded bg-rose-500/30 text-rose-200 text-[10px] font-bold">
                                  NEEDS_REVIEW
                                </span>
                              </div>
                              <div className="text-[11px] text-rose-300 mt-0.5">
                                {analyticsData.health.schedulerHealth.reviewReason || 'An expected hourly tournament run was missed. Safe recovery active.'}
                              </div>
                            </div>
                          </div>
                          <div className="text-[11px] text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800 whitespace-nowrap">
                            No duplicate tournaments created
                          </div>
                        </div>
                      )}

                      {/* 6 Scheduler Diagnostic KPI Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                          <div className="text-slate-400 text-[10px] uppercase font-bold">Status</div>
                          <div className={`text-base font-black mt-1 ${
                            analyticsData.health.schedulerHealth.status === 'RUNNING'
                              ? 'text-emerald-400'
                              : analyticsData.health.schedulerHealth.status === 'STOPPED'
                              ? 'text-slate-300'
                              : 'text-rose-400'
                          }`}>
                            {analyticsData.health.schedulerHealth.status}
                          </div>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                          <div className="text-slate-400 text-[10px] uppercase font-bold">Last Successful Run</div>
                          <div className="text-sm font-bold text-slate-200 mt-1 truncate">
                            {analyticsData.health.schedulerHealth.lastSuccessfulRunAt
                              ? new Date(analyticsData.health.schedulerHealth.lastSuccessfulRunAt).toLocaleTimeString()
                              : '—'}
                          </div>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                          <div className="text-slate-400 text-[10px] uppercase font-bold">Next Scheduled Run</div>
                          <div className="text-sm font-bold text-indigo-400 mt-1 truncate">
                            {analyticsData.health.schedulerHealth.nextScheduledRunAt
                              ? new Date(analyticsData.health.schedulerHealth.nextScheduledRunAt).toLocaleTimeString()
                              : 'Hourly'}
                          </div>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                          <div className="text-slate-400 text-[10px] uppercase font-bold">In Last Run</div>
                          <div className="text-base font-black text-amber-400 mt-1">
                            {analyticsData.health.schedulerHealth.tournamentsCreatedInLastRun} created
                          </div>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                          <div className="text-slate-400 text-[10px] uppercase font-bold">Failed Jobs</div>
                          <div className="text-base font-black text-rose-400 mt-1">
                            {analyticsData.health.schedulerHealth.failedJobsToday}
                          </div>
                        </div>

                        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                          <div className="text-slate-400 text-[10px] uppercase font-bold">Retry Count</div>
                          <div className="text-base font-black text-cyan-400 mt-1">
                            {analyticsData.health.schedulerHealth.retryCount}
                          </div>
                        </div>
                      </div>

                      {/* Multi-Instance Safe Recovery Information */}
                      <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 font-sans text-xs text-slate-400 flex items-center gap-2.5">
                        <Shield className="size-4 text-emerald-400 flex-shrink-0" />
                        <span>
                          <strong>Safe Multi-Instance Recovery:</strong> Database unique constraint on <code>TournamentTierScheduleLog(tierId, slotHour)</code> prevents duplicate tournament creation across server restarts and concurrent backend instances.
                        </span>
                      </div>
                    </div>
                  ) : healthFilterTab === 'STUCK_TOURNAMENTS' ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Tournament</th>
                            <th className="py-2.5 px-3">Game Discipline</th>
                            <th className="py-2.5 px-3 text-center">Tier</th>
                            <th className="py-2.5 px-3 text-center">Current State</th>
                            <th className="py-2.5 px-3 text-center">Current Round</th>
                            <th className="py-2.5 px-3 text-center">Time in State</th>
                            <th className="py-2.5 px-3">Last Activity</th>
                            <th className="py-2.5 px-4">Operational Reason</th>
                            <th className="py-2.5 px-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {(analyticsData.health.stuckTournaments || []).length === 0 ? (
                            <tr>
                              <td colSpan={9} className="py-8 text-center text-emerald-400 font-sans font-bold">
                                🟢 No stuck tournaments detected! All tournaments are progressing within normal operational thresholds.
                              </td>
                            </tr>
                          ) : (
                            analyticsData.health.stuckTournaments.map((st) => (
                              <tr key={st.tournamentId} className="hover:bg-rose-950/20 transition-colors">
                                <td className="py-2.5 px-4 font-sans font-bold text-slate-200">
                                  <div>{st.title}</div>
                                  <div className="text-[10px] text-slate-500 font-mono">#{st.tournamentId.slice(-8)}</div>
                                </td>
                                <td className="py-2.5 px-3 font-sans text-slate-300 flex items-center gap-1.5 pt-3.5">
                                  <span>{GAME_DEFINITIONS.find((def) => def.id === st.gameId)?.icon ?? '🎮'}</span>
                                  <span>{GAME_DEFINITIONS.find((def) => def.id === st.gameId)?.name ?? st.gameId}</span>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className="uppercase text-[10px] font-bold text-amber-400">{st.tierCode}</span>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className="inline-block px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-black uppercase">
                                    {st.currentState}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center font-bold text-slate-300">
                                  {st.currentRound}
                                </td>
                                <td className="py-2.5 px-3 text-center text-rose-400 font-bold">
                                  {st.timeSpentInStateMinutes} mins <span className="text-[10px] text-slate-500 font-normal">(&gt;{st.thresholdMinutes}m)</span>
                                </td>
                                <td className="py-2.5 px-3 text-slate-400 text-[10px]">
                                  {st.lastActivityTime ? new Date(st.lastActivityTime).toLocaleTimeString() : '—'}
                                </td>
                                <td className="py-2.5 px-4 font-sans text-rose-300 text-[11px] max-w-xs">
                                  {st.reason}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className="inline-block px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black uppercase animate-pulse">
                                    {st.reviewStatus}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : healthFilterTab === 'STUCK_MATCHES' ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Match ID</th>
                            <th className="py-2.5 px-3">Tournament</th>
                            <th className="py-2.5 px-3">Game Discipline</th>
                            <th className="py-2.5 px-3 text-center">Tier</th>
                            <th className="py-2.5 px-3 text-center">Round</th>
                            <th className="py-2.5 px-3">Players</th>
                            <th className="py-2.5 px-3 text-center">Match Status</th>
                            <th className="py-2.5 px-3">Started Time</th>
                            <th className="py-2.5 px-3 text-center">Elapsed Time</th>
                            <th className="py-2.5 px-4">Reason / Game Limit</th>
                            <th className="py-2.5 px-3 text-center">Review Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {analyticsData.health.stuckMatches.length === 0 ? (
                            <tr>
                              <td colSpan={11} className="py-8 text-center text-emerald-400 font-sans font-bold">
                                🟢 No stuck matches detected! All tournament matches are running within normal 10-minute limits.
                              </td>
                            </tr>
                          ) : (
                            analyticsData.health.stuckMatches.map((sm) => (
                              <tr key={sm.matchId} className="hover:bg-slate-800/40 transition-colors">
                                <td className="py-2.5 px-4 text-amber-400 font-bold">#{sm.matchId.slice(-8)}</td>
                                <td className="py-2.5 px-3 font-sans font-bold text-slate-200">
                                  <div>{sm.tournamentTitle}</div>
                                  <div className="text-[10px] text-slate-500 font-mono">#{sm.tournamentId.slice(-8)}</div>
                                </td>
                                <td className="py-2.5 px-3 font-sans text-slate-300 flex items-center gap-1.5 pt-3.5">
                                  <span>{GAME_DEFINITIONS.find((def) => def.id === sm.gameId)?.icon ?? '🎮'}</span>
                                  <span>{GAME_DEFINITIONS.find((def) => def.id === sm.gameId)?.name ?? sm.gameId}</span>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className="uppercase text-[10px] font-bold text-amber-400">{sm.tierCode}</span>
                                </td>
                                <td className="py-2.5 px-3 text-center font-bold text-slate-300">Round {sm.roundNumber}</td>
                                <td className="py-2.5 px-3 font-sans text-slate-300 text-[11px]">
                                  <div className="flex items-center gap-1">
                                    <span className="text-cyan-300 font-mono">{sm.playerAName || 'TBD'}</span>
                                    <span className="text-slate-500 text-[10px]">vs</span>
                                    <span className="text-pink-300 font-mono">{sm.playerBName || 'TBD'}</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                    sm.matchStatus === 'LIVE'
                                      ? 'bg-rose-500/20 text-rose-400 border border-rose-800/40 animate-pulse'
                                      : sm.matchStatus === 'READY'
                                      ? 'bg-amber-500/20 text-amber-400 border border-amber-800/40'
                                      : 'bg-indigo-500/20 text-indigo-400 border border-indigo-800/40'
                                  }`}>
                                    {sm.matchStatus}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-slate-400 text-[10px]">
                                  {sm.startedAt ? new Date(sm.startedAt).toLocaleTimeString() : '—'}
                                </td>
                                <td className="py-2.5 px-3 text-center text-rose-400 font-bold">
                                  {sm.elapsedMinutes} mins <span className="text-[10px] text-slate-500 font-normal">(&gt;{sm.thresholdMinutes}m limit)</span>
                                </td>
                                <td className="py-2.5 px-4 font-sans text-rose-300 text-[11px] max-w-xs">
                                  {sm.reason}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className="inline-block px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black uppercase animate-pulse">
                                    {sm.reviewStatus || 'NEEDS_REVIEW'}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Tournament</th>
                            <th className="py-2.5 px-3">Game Discipline</th>
                            <th className="py-2.5 px-3 text-center">Tier</th>
                            <th className="py-2.5 px-3 text-center">Severity</th>
                            <th className="py-2.5 px-3 text-center">Review Badge</th>
                            <th className="py-2.5 px-4">Operational Review Reason</th>
                            <th className="py-2.5 px-3 text-right">Elapsed Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {(() => {
                            const items = (analyticsData.health.reviewItems || []).filter((item) => {
                              if (healthFilterTab === 'CRITICAL') return item.severity === 'CRITICAL';
                              if (healthFilterTab === 'ATTENTION') return item.severity === 'ATTENTION';
                              return true;
                            });

                            if (items.length === 0) {
                              return (
                                <tr>
                                  <td colSpan={7} className="py-8 text-center text-emerald-400 font-sans font-bold">
                                    🟢 All tournaments are healthy and operating within normal operational parameters.
                                  </td>
                                </tr>
                              );
                            }

                            return items.map((r) => (
                              <tr key={r.id} className={`transition-colors ${
                                r.severity === 'CRITICAL' ? 'hover:bg-rose-950/20' : 'hover:bg-slate-800/40'
                              }`}>
                                <td className="py-2.5 px-4 font-sans font-bold text-slate-200">
                                  <div>{r.title}</div>
                                  <div className="text-[10px] text-slate-500 font-mono">#{r.tournamentId.slice(-8)}</div>
                                </td>
                                <td className="py-2.5 px-3 font-sans text-slate-300 flex items-center gap-1.5 pt-3.5">
                                  <span>{GAME_DEFINITIONS.find((def) => def.id === r.gameId)?.icon ?? '🎮'}</span>
                                  <span>{GAME_DEFINITIONS.find((def) => def.id === r.gameId)?.name ?? r.gameId}</span>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className="uppercase text-[10px] font-bold text-amber-400">{r.tierCode}</span>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                    r.severity === 'CRITICAL'
                                      ? 'bg-rose-500 text-white animate-pulse'
                                      : r.severity === 'ATTENTION'
                                      ? 'bg-amber-500 text-slate-950'
                                      : 'bg-emerald-500 text-white'
                                  }`}>
                                    {r.severity}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className="inline-block px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 text-[10px] font-bold whitespace-nowrap">
                                    {r.badgeLabel || 'NEEDS_REVIEW'}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 font-sans text-slate-300 text-[11px] max-w-md">
                                  {r.reviewReason}
                                </td>
                                <td className="py-2.5 px-3 text-right font-bold text-slate-300">
                                  {r.elapsedMinutes > 0 ? `${r.elapsedMinutes} mins` : '—'}
                                </td>
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Overview Performance Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tournaments</div>
                  <div className="mt-1 text-2xl font-black text-white font-mono">{analyticsData.overview.totalTournaments}</div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    🟢 {analyticsData.overview.liveTournaments} Live · 🏆 {analyticsData.overview.completedTournaments} Done
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Registrations</div>
                  <div className="mt-1 text-2xl font-black text-indigo-300 font-mono">{analyticsData.overview.totalRegistrations}</div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Avg {analyticsData.overview.averageRegistrationsPerTournament} / tourn
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fill Rate</div>
                  <div className="mt-1 text-2xl font-black text-amber-400 font-mono">{analyticsData.overview.fillRatePercent}%</div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Capacity utilization
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Completion Rate</div>
                  <div className="mt-1 text-2xl font-black text-emerald-400 font-mono">{analyticsData.overview.completionRatePercent}%</div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Started to Settled
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cancellation Rate</div>
                  <div className="mt-1 text-2xl font-black text-rose-400 font-mono">{analyticsData.overview.cancellationRatePercent}%</div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {analyticsData.overview.cancelledDueToMinPlayersCount} underfilled
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Unique Players</div>
                  <div className="mt-1 text-2xl font-black text-sky-400 font-mono">
                    {analyticsData.playerCohort[0]?.activeTournamentPlayers ?? 0}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {analyticsData.playerCohort[0]?.newTournamentPlayers ?? 0} new players
                  </div>
                </div>
              </div>

              {/* 3. TOURNAMENT TRENDS & TEMPORAL VISUALIZATION */}
              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <TrendingUp className="size-4 text-indigo-400" /> Tournament Trends &amp; Temporal Performance
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Temporal volume, registration fill, completion rates, and wallet ledger distributions across the selected date range
                    </p>
                  </div>

                  {/* Trend Metric Switcher */}
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800 flex-wrap">
                    {[
                      { id: 'ALL', label: '📊 All 5 Charts' },
                      { id: 'VOLUME', label: '🏟️ Volume' },
                      { id: 'REGISTRATIONS', label: '👥 Registrations' },
                      { id: 'COMPLETION', label: '🏁 Completion %' },
                      { id: 'COLLECTION', label: '🪙 Collection' },
                      { id: 'PRIZES', label: '🏆 Prize Distribution' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setTrendMetricTab(tab.id as 'ALL' | 'VOLUME' | 'REGISTRATIONS' | 'COMPLETION' | 'COLLECTION' | 'PRIZES')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          trendMetricTab === tab.id
                            ? 'bg-indigo-600 text-white shadow font-black'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Authoritative Ledger Disclaimer */}
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Shield className="size-4 text-indigo-400 flex-shrink-0" />
                    <span>
                      <strong>Authoritative Ledger &amp; Database Verification:</strong> Trend analytics are computed directly from immutable tournament records and confirmed wallet transaction logs. This section does not modify tournament schedules, match results, leaderboards, wallet balances, or prize allocations.
                    </span>
                  </div>
                </div>

                {/* Trends Charts Grid */}
                {(!analyticsData.trends || analyticsData.trends.length === 0) ? (
                  <div className="text-center py-12 text-slate-400 bg-slate-950/40 rounded-2xl border border-slate-800">
                    No trend datapoints found for the selected filter timeframe.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* 1. Tournament Volume Chart */}
                    {(trendMetricTab === 'ALL' || trendMetricTab === 'VOLUME') && (
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-white">🏟️ Tournament Volume Trend</span>
                            <span className="text-xs text-slate-400">(Events Created per Day)</span>
                          </div>
                          <div className="text-xs font-mono font-bold text-indigo-300">
                            Total: {analyticsData.trends.reduce((acc, curr) => acc + curr.tournamentVolume, 0)} events
                          </div>
                        </div>

                        {/* Responsive SVG Bar Chart */}
                        <div className="h-40 w-full flex items-end gap-1.5 pt-4 pb-2 px-2 overflow-x-auto">
                          {(() => {
                            const maxVal = Math.max(...analyticsData.trends.map((t) => t.tournamentVolume), 1);
                            return analyticsData.trends.map((t, idx) => {
                              const heightPct = Math.max(8, Math.round((t.tournamentVolume / maxVal) * 100));
                              return (
                                <div key={idx} className="flex-1 min-w-[28px] max-w-[48px] flex flex-col items-center gap-1 group relative">
                                  <div className="text-[9px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {t.tournamentVolume}
                                  </div>
                                  <div
                                    style={{ height: `${heightPct}%` }}
                                    className="w-full rounded-t-md bg-indigo-500 hover:bg-indigo-400 transition-all cursor-pointer shadow"
                                    title={`${t.label}: ${t.tournamentVolume} tournaments`}
                                  />
                                  <div className="text-[9px] font-mono text-slate-500 truncate w-full text-center">
                                    {t.label.slice(-5)}
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    )}

                    {/* 2. Total Registrations Chart */}
                    {(trendMetricTab === 'ALL' || trendMetricTab === 'REGISTRATIONS') && (
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-white">👥 Total Registrations Trend</span>
                            <span className="text-xs text-slate-400">(Players Registered per Day)</span>
                          </div>
                          <div className="text-xs font-mono font-bold text-sky-300">
                            Total: {analyticsData.trends.reduce((acc, curr) => acc + curr.registrations, 0)} registrations
                          </div>
                        </div>

                        {/* Responsive SVG Bar Chart */}
                        <div className="h-40 w-full flex items-end gap-1.5 pt-4 pb-2 px-2 overflow-x-auto">
                          {(() => {
                            const maxVal = Math.max(...analyticsData.trends.map((t) => t.registrations), 1);
                            return analyticsData.trends.map((t, idx) => {
                              const heightPct = Math.max(8, Math.round((t.registrations / maxVal) * 100));
                              return (
                                <div key={idx} className="flex-1 min-w-[28px] max-w-[48px] flex flex-col items-center gap-1 group relative">
                                  <div className="text-[9px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {t.registrations}
                                  </div>
                                  <div
                                    style={{ height: `${heightPct}%` }}
                                    className="w-full rounded-t-md bg-sky-500 hover:bg-sky-400 transition-all cursor-pointer shadow"
                                    title={`${t.label}: ${t.registrations} registrations`}
                                  />
                                  <div className="text-[9px] font-mono text-slate-500 truncate w-full text-center">
                                    {t.label.slice(-5)}
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    )}

                    {/* 3. Completion Rate (%) Chart */}
                    {(trendMetricTab === 'ALL' || trendMetricTab === 'COMPLETION') && (
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-white">🏁 Tournament Completion Rate Trend</span>
                            <span className="text-xs text-slate-400">(% Finished / Settled)</span>
                          </div>
                          <div className="text-xs font-mono font-bold text-emerald-400">
                            {analyticsData.overview.completionRatePercent}% overall completion
                          </div>
                        </div>

                        {/* Responsive SVG Bar Chart */}
                        <div className="h-40 w-full flex items-end gap-1.5 pt-4 pb-2 px-2 overflow-x-auto">
                          {analyticsData.trends.map((t, idx) => {
                            const heightPct = Math.max(8, Math.min(100, t.completionRate));
                            return (
                              <div key={idx} className="flex-1 min-w-[28px] max-w-[48px] flex flex-col items-center gap-1 group relative">
                                <div className="text-[9px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {t.completionRate}%
                                </div>
                                <div
                                  style={{ height: `${heightPct}%` }}
                                  className="w-full rounded-t-md bg-emerald-500 hover:bg-emerald-400 transition-all cursor-pointer shadow"
                                  title={`${t.label}: ${t.completionRate}% completed`}
                                />
                                <div className="text-[9px] font-mono text-slate-500 truncate w-full text-center">
                                  {t.label.slice(-5)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 4. Total Entry-Fee Collection Chart */}
                    {(trendMetricTab === 'ALL' || trendMetricTab === 'COLLECTION') && (
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-white">🪙 Total Entry-Fee Collection Trend</span>
                            <span className="text-xs text-slate-400">(Coins Deposited per Day)</span>
                          </div>
                          <div className="text-xs font-mono font-bold text-amber-400">
                            Total: 🪙 {analyticsData.trends.reduce((acc, curr) => acc + curr.entryCollection, 0).toLocaleString()}
                          </div>
                        </div>

                        {/* Responsive SVG Bar Chart */}
                        <div className="h-40 w-full flex items-end gap-1.5 pt-4 pb-2 px-2 overflow-x-auto">
                          {(() => {
                            const maxVal = Math.max(...analyticsData.trends.map((t) => t.entryCollection), 1);
                            return analyticsData.trends.map((t, idx) => {
                              const heightPct = Math.max(8, Math.round((t.entryCollection / maxVal) * 100));
                              return (
                                <div key={idx} className="flex-1 min-w-[28px] max-w-[48px] flex flex-col items-center gap-1 group relative">
                                  <div className="text-[9px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                    🪙{t.entryCollection}
                                  </div>
                                  <div
                                    style={{ height: `${heightPct}%` }}
                                    className="w-full rounded-t-md bg-amber-500 hover:bg-amber-400 transition-all cursor-pointer shadow"
                                    title={`${t.label}: 🪙 ${t.entryCollection.toLocaleString()} collected`}
                                  />
                                  <div className="text-[9px] font-mono text-slate-500 truncate w-full text-center">
                                    {t.label.slice(-5)}
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    )}

                    {/* 5. Total Prize Distribution Chart */}
                    {(trendMetricTab === 'ALL' || trendMetricTab === 'PRIZES') && (
                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-white">🏆 Total Prize Distribution Trend</span>
                            <span className="text-xs text-slate-400">(Coins Distributed to Winners)</span>
                          </div>
                          <div className="text-xs font-mono font-bold text-purple-400">
                            Total: 🪙 {analyticsData.trends.reduce((acc, curr) => acc + curr.prizeDistribution, 0).toLocaleString()}
                          </div>
                        </div>

                        {/* Responsive SVG Bar Chart */}
                        <div className="h-40 w-full flex items-end gap-1.5 pt-4 pb-2 px-2 overflow-x-auto">
                          {(() => {
                            const maxVal = Math.max(...analyticsData.trends.map((t) => t.prizeDistribution), 1);
                            return analyticsData.trends.map((t, idx) => {
                              const heightPct = Math.max(8, Math.round((t.prizeDistribution / maxVal) * 100));
                              return (
                                <div key={idx} className="flex-1 min-w-[28px] max-w-[48px] flex flex-col items-center gap-1 group relative">
                                  <div className="text-[9px] font-mono text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                    🪙{t.prizeDistribution}
                                  </div>
                                  <div
                                    style={{ height: `${heightPct}%` }}
                                    className="w-full rounded-t-md bg-purple-500 hover:bg-purple-400 transition-all cursor-pointer shadow"
                                    title={`${t.label}: 🪙 ${t.prizeDistribution.toLocaleString()} distributed`}
                                  />
                                  <div className="text-[9px] font-mono text-slate-500 truncate w-full text-center">
                                    {t.label.slice(-5)}
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 4. TIER PERFORMANCE TRENDS (MINI TO PRO) */}
              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <Layers className="size-4 text-amber-400" /> Tier Performance Trends (Mini → Pro)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Authoritative tracking across all 5 tiers: Tournament count, total registrations, average registrations, fill rate %, and completion rate %
                    </p>
                  </div>

                  {/* Metric & Tier Selector Pills */}
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800 flex-wrap">
                    {[
                      { id: 'ALL', label: '📊 Overview Matrix' },
                      { id: 'COUNT', label: '🏟️ Count' },
                      { id: 'REGISTRATIONS', label: '👥 Registrations' },
                      { id: 'AVERAGE', label: '📈 Avg Regs' },
                      { id: 'FILL_RATE', label: '⚡ Fill Rate %' },
                      { id: 'COMPLETION_RATE', label: '🏁 Completion %' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setTierTrendMetricTab(tab.id as 'ALL' | 'COUNT' | 'REGISTRATIONS' | 'AVERAGE' | 'FILL_RATE' | 'COMPLETION_RATE')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          tierTrendMetricTab === tab.id
                            ? 'bg-amber-600 text-slate-950 shadow font-black'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Non-Mutation & Tier Integrity Notice */}
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Shield className="size-4 text-amber-400 flex-shrink-0" />
                    <span>
                      <strong>Authoritative Tier Verification:</strong> Metrics reflect verified database records and registration history across all 5 tiers. Does not modify tournament configurations, entry fees, prize pools, wallet ledgers, or leaderboard rankings.
                    </span>
                  </div>
                </div>

                {/* 5 Tier Performance Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {(analyticsData.tiers || []).map((t) => (
                    <div
                      key={t.tierCode}
                      className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-3 hover:border-slate-700 transition-all"
                    >
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                        <div>
                          <span className="uppercase text-[10px] font-black text-amber-400 tracking-wider">
                            {t.tierCode} Tier
                          </span>
                          <div className="text-base font-black text-white">{t.tierName}</div>
                        </div>
                        <div className="text-right">
                          <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono font-bold">
                            🪙 {t.entryFee}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs font-mono">
                        <div className="flex justify-between items-center text-slate-300">
                          <span className="text-slate-500 font-sans">Tournaments:</span>
                          <span className="font-bold text-white">{t.tournamentsCount}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-300">
                          <span className="text-slate-500 font-sans">Total Regs:</span>
                          <span className="font-bold text-indigo-300">{t.registrationsCount}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-300">
                          <span className="text-slate-500 font-sans">Avg Regs / Tourn:</span>
                          <span className="font-bold text-sky-400">{t.averageRegistrations}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-300">
                          <span className="text-slate-500 font-sans">Fill Rate:</span>
                          <span className="font-bold text-amber-400">{t.fillRatePercent}%</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-300">
                          <span className="text-slate-500 font-sans">Completion Rate:</span>
                          <span className="font-bold text-emerald-400">{t.completionRatePercent}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Detailed Comparison Table / Visual Charts */}
                <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                          <th className="py-2.5 px-4">Tournament Tier</th>
                          <th className="py-2.5 px-3 text-center">Entry Fee</th>
                          <th className="py-2.5 px-3 text-center">Tournaments</th>
                          <th className="py-2.5 px-3 text-center">Total Registrations</th>
                          <th className="py-2.5 px-3 text-center">Avg Regs / Tourn</th>
                          <th className="py-2.5 px-3 text-center">Capacity Fill Rate</th>
                          <th className="py-2.5 px-3 text-center">Completion Rate</th>
                          <th className="py-2.5 px-4 text-right">Coins Collected</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                        {(analyticsData.tiers || []).map((t) => (
                          <tr key={t.tierCode} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-2.5 px-4 font-sans font-bold text-slate-200 flex items-center gap-2">
                              <span className="uppercase text-[10px] font-black text-amber-400">{t.tierCode}</span>
                              <span>{t.tierName}</span>
                            </td>
                            <td className="py-2.5 px-3 text-center text-amber-400 font-bold">🪙 {t.entryFee}</td>
                            <td className="py-2.5 px-3 text-center text-white font-bold">{t.tournamentsCount}</td>
                            <td className="py-2.5 px-3 text-center text-indigo-300 font-bold">{t.registrationsCount}</td>
                            <td className="py-2.5 px-3 text-center text-sky-400 font-bold">{t.averageRegistrations}</td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 font-bold">
                                {t.fillRatePercent}%
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">
                                {t.completionRatePercent}%
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right font-bold text-amber-400">
                              🪙 {t.entryFeesCollected.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* 5. Authoritative Financial Ledger & Prize Settlement Card */}
              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <DollarSign className="size-4 text-emerald-400" /> Authoritative Financial & Ledger Analytics
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Confirmed ledger transactions, prize settlements (50% / 25% / 15% / 10%), and refund reconciliation
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Entry Fees Collected</span>
                    <div className="text-xl font-black text-white font-mono mt-1">
                      🪙 {analyticsData.overview.totalEntryCollection.toLocaleString()}
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Configured Prize Pool</span>
                    <div className="text-xl font-black text-amber-300 font-mono mt-1">
                      🪙 {analyticsData.overview.configuredPrizePool.toLocaleString()}
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Prizes Distributed</span>
                    <div className="text-xl font-black text-emerald-400 font-mono mt-1">
                      🪙 {analyticsData.overview.actualPrizeDistributed.toLocaleString()}
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">Total Refunds Issued</span>
                    <div className="text-xl font-black text-rose-400 font-mono mt-1">
                      🪙 {analyticsData.overview.totalRefunds.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* ========================================================================= */}
                {/* PRIZE DISTRIBUTION & SETTLEMENT BREAKDOWN SECTION                         */}
                {/* ========================================================================= */}
                <div className="pt-4 border-t border-slate-800 space-y-4">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-black text-white flex items-center gap-2">
                        <Trophy className="size-4 text-amber-400" /> Prize Distribution & Settlement Details
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Authoritative prize payouts by rank, pending balances, and settlement failures
                      </p>
                    </div>

                    {/* Breakdown Dimension Switcher */}
                    <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800">
                      {[
                        { id: 'GAME', label: '🎮 By Game', count: analyticsData.prizeDistribution.byGame.length },
                        { id: 'TIER', label: '⚡ By Tier', count: analyticsData.prizeDistribution.byTier.length },
                        { id: 'DATE', label: '📅 By Date', count: analyticsData.prizeDistribution.byDate.length },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setPrizeBreakdownTab(tab.id as 'GAME' | 'TIER' | 'DATE')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            prizeBreakdownTab === tab.id
                              ? 'bg-indigo-600 text-white shadow font-black'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Summary Stat Grid for 4 Prize Ranks + Settlements */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
                    <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3">
                      <div className="text-[10px] font-bold text-amber-400 uppercase">🥇 1st Place (50%)</div>
                      <div className="text-sm sm:text-base font-black text-white font-mono mt-1">
                        🪙 {analyticsData.prizeDistribution.summary.firstPlaceAmount.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {analyticsData.prizeDistribution.summary.firstPlaceCount} winners
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-800/50 border border-slate-700/60 p-3">
                      <div className="text-[10px] font-bold text-slate-300 uppercase">🥈 2nd Place (25%)</div>
                      <div className="text-sm sm:text-base font-black text-white font-mono mt-1">
                        🪙 {analyticsData.prizeDistribution.summary.secondPlaceAmount.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {analyticsData.prizeDistribution.summary.secondPlaceCount} winners
                      </div>
                    </div>

                    <div className="rounded-2xl bg-amber-900/20 border border-amber-800/40 p-3">
                      <div className="text-[10px] font-bold text-amber-600 uppercase">🥉 3rd Place (15%)</div>
                      <div className="text-sm sm:text-base font-black text-white font-mono mt-1">
                        🪙 {analyticsData.prizeDistribution.summary.thirdPlaceAmount.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {analyticsData.prizeDistribution.summary.thirdPlaceCount} winners
                      </div>
                    </div>

                    <div className="rounded-2xl bg-indigo-950/30 border border-indigo-800/40 p-3">
                      <div className="text-[10px] font-bold text-indigo-400 uppercase">4️⃣ 4th Place (10%)</div>
                      <div className="text-sm sm:text-base font-black text-white font-mono mt-1">
                        🪙 {analyticsData.prizeDistribution.summary.fourthPlaceAmount.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {analyticsData.prizeDistribution.summary.fourthPlaceCount} winners
                      </div>
                    </div>

                    <div className="rounded-2xl bg-emerald-950/30 border border-emerald-800/40 p-3 sm:col-span-2">
                      <div className="text-[10px] font-bold text-emerald-400 uppercase">Total Distributed</div>
                      <div className="text-sm sm:text-base font-black text-emerald-400 font-mono mt-1">
                        🪙 {analyticsData.prizeDistribution.summary.totalDistributed.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        of 🪙 {analyticsData.prizeDistribution.summary.totalConfiguredPool.toLocaleString()} pool
                      </div>
                    </div>

                    <div className="rounded-2xl bg-amber-950/30 border border-amber-800/40 p-3">
                      <div className="text-[10px] font-bold text-amber-400 uppercase">Pending Settlements</div>
                      <div className="text-sm sm:text-base font-black text-amber-400 font-mono mt-1">
                        🪙 {analyticsData.prizeDistribution.summary.pendingSettlementsAmount.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {analyticsData.prizeDistribution.summary.pendingSettlementsCount} pending
                      </div>
                    </div>

                    <div className={`rounded-2xl p-3 border ${
                      analyticsData.prizeDistribution.summary.failedSettlementsCount > 0
                        ? 'bg-rose-950/40 border-rose-500/60'
                        : 'bg-slate-950/60 border-slate-800'
                    }`}>
                      <div className="text-[10px] font-bold text-rose-400 uppercase">Failed Settlements</div>
                      <div className="text-sm sm:text-base font-black text-rose-400 font-mono mt-1">
                        🪙 {analyticsData.prizeDistribution.summary.failedSettlementsAmount.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {analyticsData.prizeDistribution.summary.failedSettlementsCount} failed
                      </div>
                    </div>
                  </div>

                  {/* Breakdown Tables (Game / Tier / Date) */}
                  <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
                    <div className="overflow-x-auto">
                      {prizeBreakdownTab === 'GAME' && (
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                              <th className="py-2.5 px-4">Game Discipline</th>
                              <th className="py-2.5 px-3 text-center">Tournaments</th>
                              <th className="py-2.5 px-3 text-right">Prize Pool</th>
                              <th className="py-2.5 px-3 text-right">Distributed</th>
                              <th className="py-2.5 px-3 text-right text-amber-400">1st (50%)</th>
                              <th className="py-2.5 px-3 text-right text-slate-300">2nd (25%)</th>
                              <th className="py-2.5 px-3 text-right text-amber-600">3rd (15%)</th>
                              <th className="py-2.5 px-3 text-right text-indigo-400">4th (10%)</th>
                              <th className="py-2.5 px-3 text-right text-amber-400">Pending</th>
                              <th className="py-2.5 px-3 text-right text-rose-400">Failed</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono">
                            {analyticsData.prizeDistribution.byGame.map((g) => (
                              <tr key={g.gameId} className="hover:bg-slate-800/40 transition-colors">
                                <td className="py-2.5 px-4 font-sans font-bold text-slate-200 flex items-center gap-2">
                                  <span>{GAME_DEFINITIONS.find((def) => def.id === g.gameId)?.icon ?? '🎮'}</span>
                                  <span>{g.gameName}</span>
                                </td>
                                <td className="py-2.5 px-3 text-center text-slate-300">{g.tournamentsCount}</td>
                                <td className="py-2.5 px-3 text-right font-bold text-slate-200">🪙 {g.totalConfiguredPool.toLocaleString()}</td>
                                <td className="py-2.5 px-3 text-right font-bold text-emerald-400">🪙 {g.totalDistributed.toLocaleString()}</td>
                                <td className="py-2.5 px-3 text-right text-amber-400">🪙 {g.firstPlaceAmount.toLocaleString()}</td>
                                <td className="py-2.5 px-3 text-right text-slate-300">🪙 {g.secondPlaceAmount.toLocaleString()}</td>
                                <td className="py-2.5 px-3 text-right text-amber-600">🪙 {g.thirdPlaceAmount.toLocaleString()}</td>
                                <td className="py-2.5 px-3 text-right text-indigo-400">🪙 {g.fourthPlaceAmount.toLocaleString()}</td>
                                <td className="py-2.5 px-3 text-right text-amber-400">{g.pendingSettlementsCount > 0 ? `🪙 ${g.pendingSettlementsAmount.toLocaleString()}` : '—'}</td>
                                <td className="py-2.5 px-3 text-right text-rose-400">{g.failedSettlementsCount > 0 ? `🪙 ${g.failedSettlementsAmount.toLocaleString()}` : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {prizeBreakdownTab === 'TIER' && (
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                              <th className="py-2.5 px-4">Tournament Tier</th>
                              <th className="py-2.5 px-3 text-center">Entry Fee</th>
                              <th className="py-2.5 px-3 text-center">Tournaments</th>
                              <th className="py-2.5 px-3 text-right">Prize Pool</th>
                              <th className="py-2.5 px-3 text-right">Distributed</th>
                              <th className="py-2.5 px-3 text-right text-amber-400">1st (50%)</th>
                              <th className="py-2.5 px-3 text-right text-slate-300">2nd (25%)</th>
                              <th className="py-2.5 px-3 text-right text-amber-600">3rd (15%)</th>
                              <th className="py-2.5 px-3 text-right text-indigo-400">4th (10%)</th>
                              <th className="py-2.5 px-3 text-right text-amber-400">Pending</th>
                              <th className="py-2.5 px-3 text-right text-rose-400">Failed</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono">
                            {analyticsData.prizeDistribution.byTier.map((t) => (
                              <tr key={t.tierCode} className="hover:bg-slate-800/40 transition-colors">
                                <td className="py-2.5 px-4 font-sans font-bold text-slate-200">
                                  {t.tierName}
                                </td>
                                <td className="py-2.5 px-3 text-center text-amber-400 font-bold">{t.entryFee}🪙</td>
                                <td className="py-2.5 px-3 text-center text-slate-300">{t.tournamentsCount}</td>
                                <td className="py-2.5 px-3 text-right font-bold text-slate-200">🪙 {t.totalConfiguredPool.toLocaleString()}</td>
                                <td className="py-2.5 px-3 text-right font-bold text-emerald-400">🪙 {t.totalDistributed.toLocaleString()}</td>
                                <td className="py-2.5 px-3 text-right text-amber-400">🪙 {t.firstPlaceAmount.toLocaleString()}</td>
                                <td className="py-2.5 px-3 text-right text-slate-300">🪙 {t.secondPlaceAmount.toLocaleString()}</td>
                                <td className="py-2.5 px-3 text-right text-amber-600">🪙 {t.thirdPlaceAmount.toLocaleString()}</td>
                                <td className="py-2.5 px-3 text-right text-indigo-400">🪙 {t.fourthPlaceAmount.toLocaleString()}</td>
                                <td className="py-2.5 px-3 text-right text-amber-400">{t.pendingSettlementsCount > 0 ? `🪙 ${t.pendingSettlementsAmount.toLocaleString()}` : '—'}</td>
                                <td className="py-2.5 px-3 text-right text-rose-400">{t.failedSettlementsCount > 0 ? `🪙 ${t.failedSettlementsAmount.toLocaleString()}` : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {prizeBreakdownTab === 'DATE' && (
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                              <th className="py-2.5 px-4">Date / Period</th>
                              <th className="py-2.5 px-3 text-center">Tournaments</th>
                              <th className="py-2.5 px-3 text-right">Prize Pool</th>
                              <th className="py-2.5 px-3 text-right">Distributed</th>
                              <th className="py-2.5 px-3 text-right text-amber-400">1st (50%)</th>
                              <th className="py-2.5 px-3 text-right text-slate-300">2nd (25%)</th>
                              <th className="py-2.5 px-3 text-right text-amber-600">3rd (15%)</th>
                              <th className="py-2.5 px-3 text-right text-indigo-400">4th (10%)</th>
                              <th className="py-2.5 px-3 text-right text-amber-400">Pending</th>
                              <th className="py-2.5 px-3 text-right text-rose-400">Failed</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono">
                            {analyticsData.prizeDistribution.byDate.length === 0 ? (
                              <tr>
                                <td colSpan={10} className="py-6 text-center text-slate-500 font-sans">
                                  No prize records for this time period
                                </td>
                              </tr>
                            ) : (
                              analyticsData.prizeDistribution.byDate.map((d) => (
                                <tr key={d.date} className="hover:bg-slate-800/40 transition-colors">
                                  <td className="py-2.5 px-4 font-sans font-bold text-slate-200">
                                    {d.label} <span className="text-[10px] text-slate-500 font-normal">({d.date})</span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center text-slate-300">{d.tournamentsCount}</td>
                                  <td className="py-2.5 px-3 text-right font-bold text-slate-200">🪙 {d.totalConfiguredPool.toLocaleString()}</td>
                                  <td className="py-2.5 px-3 text-right font-bold text-emerald-400">🪙 {d.totalDistributed.toLocaleString()}</td>
                                  <td className="py-2.5 px-3 text-right text-amber-400">🪙 {d.firstPlaceAmount.toLocaleString()}</td>
                                  <td className="py-2.5 px-3 text-right text-slate-300">🪙 {d.secondPlaceAmount.toLocaleString()}</td>
                                  <td className="py-2.5 px-3 text-right text-amber-600">🪙 {d.thirdPlaceAmount.toLocaleString()}</td>
                                  <td className="py-2.5 px-3 text-right text-indigo-400">🪙 {d.fourthPlaceAmount.toLocaleString()}</td>
                                  <td className="py-2.5 px-3 text-right text-amber-400">{d.pendingSettlementsCount > 0 ? `🪙 ${d.pendingSettlementsAmount.toLocaleString()}` : '—'}</td>
                                  <td className="py-2.5 px-3 text-right text-rose-400">{d.failedSettlementsCount > 0 ? `🪙 ${d.failedSettlementsAmount.toLocaleString()}` : '—'}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* 4. TOURNAMENT REFUND ANALYTICS SECTION                                    */}
              {/* ========================================================================= */}
              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <RefreshCw className="size-4 text-rose-400" /> Tournament Refund Analytics & Ledger Reconciliation
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Authoritative refund ledger records, cancellation recovery, and settlement tracking
                    </p>
                  </div>

                  {/* Breakdown Dimension Switcher */}
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800 overflow-x-auto">
                    {[
                      { id: 'GAME', label: '🎮 By Game' },
                      { id: 'TIER', label: '⚡ By Tier' },
                      { id: 'DATE', label: '📅 By Date' },
                      { id: 'RECORDS', label: '📜 Audit Records' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setRefundBreakdownTab(tab.id as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                          refundBreakdownTab === tab.id
                            ? 'bg-rose-600 text-white shadow font-black'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5 KPI Metric Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-4">
                    <div className="text-[11px] font-bold text-slate-400 uppercase">Refund Requests</div>
                    <div className="text-xl font-black text-white font-mono mt-1">
                      {analyticsData.refundAnalytics.summary.totalRefundRequests}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Total attempts / logged</div>
                  </div>

                  <div className="rounded-2xl bg-emerald-950/20 border border-emerald-800/40 p-4">
                    <div className="text-[11px] font-bold text-emerald-400 uppercase">Successful Refunds</div>
                    <div className="text-xl font-black text-emerald-400 font-mono mt-1">
                      {analyticsData.refundAnalytics.summary.successfulRefundsCount}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Confirmed wallet credits</div>
                  </div>

                  <div className="rounded-2xl bg-amber-950/20 border border-amber-800/40 p-4">
                    <div className="text-[11px] font-bold text-amber-400 uppercase">Pending Refunds</div>
                    <div className="text-xl font-black text-amber-400 font-mono mt-1">
                      {analyticsData.refundAnalytics.summary.pendingRefundsCount}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Awaiting processing</div>
                  </div>

                  <div className="rounded-2xl bg-rose-950/20 border border-rose-800/40 p-4">
                    <div className="text-[11px] font-bold text-rose-400 uppercase">Failed Refunds</div>
                    <div className="text-xl font-black text-rose-400 font-mono mt-1">
                      {analyticsData.refundAnalytics.summary.failedRefundsCount}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Action required</div>
                  </div>

                  <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-4 col-span-2 sm:col-span-1">
                    <div className="text-[11px] font-bold text-slate-400 uppercase">Total Refunded Coins</div>
                    <div className="text-xl font-black text-rose-400 font-mono mt-1">
                      🪙 {analyticsData.refundAnalytics.summary.totalRefundedCoins.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Actual credited amount</div>
                  </div>
                </div>

                {/* Breakdown Tables (Game / Tier / Date / Records) */}
                <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
                  <div className="overflow-x-auto">
                    {refundBreakdownTab === 'GAME' && (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Game Discipline</th>
                            <th className="py-2.5 px-3 text-center">Requests</th>
                            <th className="py-2.5 px-3 text-center text-emerald-400">Successful</th>
                            <th className="py-2.5 px-3 text-center text-amber-400">Pending</th>
                            <th className="py-2.5 px-3 text-center text-rose-400">Failed</th>
                            <th className="py-2.5 px-4 text-right">Total Refunded Coins</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {analyticsData.refundAnalytics.byGame.map((g) => (
                            <tr key={g.gameId} className="hover:bg-slate-800/40 transition-colors">
                              <td className="py-2.5 px-4 font-sans font-bold text-slate-200 flex items-center gap-2">
                                <span>{GAME_DEFINITIONS.find((def) => def.id === g.gameId)?.icon ?? '🎮'}</span>
                                <span>{g.gameName}</span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-slate-300">{g.refundRequestsCount}</td>
                              <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{g.successfulRefundsCount}</td>
                              <td className="py-2.5 px-3 text-center text-amber-400">{g.pendingRefundsCount > 0 ? g.pendingRefundsCount : '—'}</td>
                              <td className="py-2.5 px-3 text-center text-rose-400">{g.failedRefundsCount > 0 ? g.failedRefundsCount : '—'}</td>
                              <td className="py-2.5 px-4 text-right font-bold text-rose-400">
                                🪙 {g.totalRefundedCoins.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {refundBreakdownTab === 'TIER' && (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Tournament Tier</th>
                            <th className="py-2.5 px-3 text-center">Entry Fee</th>
                            <th className="py-2.5 px-3 text-center">Requests</th>
                            <th className="py-2.5 px-3 text-center text-emerald-400">Successful</th>
                            <th className="py-2.5 px-3 text-center text-amber-400">Pending</th>
                            <th className="py-2.5 px-3 text-center text-rose-400">Failed</th>
                            <th className="py-2.5 px-4 text-right">Total Refunded Coins</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {analyticsData.refundAnalytics.byTier.map((t) => (
                            <tr key={t.tierCode} className="hover:bg-slate-800/40 transition-colors">
                              <td className="py-2.5 px-4 font-sans font-bold text-slate-200">
                                {t.tierName}
                              </td>
                              <td className="py-2.5 px-3 text-center text-amber-400 font-bold">{t.entryFee}🪙</td>
                              <td className="py-2.5 px-3 text-center text-slate-300">{t.refundRequestsCount}</td>
                              <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{t.successfulRefundsCount}</td>
                              <td className="py-2.5 px-3 text-center text-amber-400">{t.pendingRefundsCount > 0 ? t.pendingRefundsCount : '—'}</td>
                              <td className="py-2.5 px-3 text-center text-rose-400">{t.failedRefundsCount > 0 ? t.failedRefundsCount : '—'}</td>
                              <td className="py-2.5 px-4 text-right font-bold text-rose-400">
                                🪙 {t.totalRefundedCoins.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {refundBreakdownTab === 'DATE' && (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Date / Period</th>
                            <th className="py-2.5 px-3 text-center">Requests</th>
                            <th className="py-2.5 px-3 text-center text-emerald-400">Successful</th>
                            <th className="py-2.5 px-3 text-center text-amber-400">Pending</th>
                            <th className="py-2.5 px-3 text-center text-rose-400">Failed</th>
                            <th className="py-2.5 px-4 text-right">Total Refunded Coins</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {analyticsData.refundAnalytics.byDate.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-6 text-center text-slate-500 font-sans">
                                No refund records found for this period
                              </td>
                            </tr>
                          ) : (
                            analyticsData.refundAnalytics.byDate.map((d) => (
                              <tr key={d.date} className="hover:bg-slate-800/40 transition-colors">
                                <td className="py-2.5 px-4 font-sans font-bold text-slate-200">
                                  {d.label} <span className="text-[10px] text-slate-500 font-normal">({d.date})</span>
                                </td>
                                <td className="py-2.5 px-3 text-center text-slate-300">{d.refundRequestsCount}</td>
                                <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{d.successfulRefundsCount}</td>
                                <td className="py-2.5 px-3 text-center text-amber-400">{d.pendingRefundsCount > 0 ? d.pendingRefundsCount : '—'}</td>
                                <td className="py-2.5 px-3 text-center text-rose-400">{d.failedRefundsCount > 0 ? d.failedRefundsCount : '—'}</td>
                                <td className="py-2.5 px-4 text-right font-bold text-rose-400">
                                  🪙 {d.totalRefundedCoins.toLocaleString()}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}

                    {refundBreakdownTab === 'RECORDS' && (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Transaction / Refund ID</th>
                            <th className="py-2.5 px-3">Tournament</th>
                            <th className="py-2.5 px-3">Player</th>
                            <th className="py-2.5 px-3 text-right">Actual Refund</th>
                            <th className="py-2.5 px-3 text-center">Status</th>
                            <th className="py-2.5 px-4">Reason</th>
                            <th className="py-2.5 px-3 text-right">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {analyticsData.refundAnalytics.records.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-6 text-center text-slate-500 font-sans">
                                No recent refund transaction records found
                              </td>
                            </tr>
                          ) : (
                            analyticsData.refundAnalytics.records.map((r) => (
                              <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                                <td className="py-2 px-4 text-slate-400">#{r.id.slice(-8)}</td>
                                <td className="py-2 px-3 font-sans font-bold text-slate-200">{r.tournamentTitle}</td>
                                <td className="py-2 px-3 font-sans text-slate-300">{r.username}</td>
                                <td className="py-2 px-3 text-right font-bold text-rose-400">🪙 {r.amount.toLocaleString()}</td>
                                <td className="py-2 px-3 text-center">
                                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                    r.status === 'SUCCESS'
                                      ? 'bg-emerald-500/20 text-emerald-400'
                                      : r.status === 'PENDING'
                                      ? 'bg-amber-500/20 text-amber-400'
                                      : 'bg-rose-500/20 text-rose-400'
                                  }`}>
                                    {r.status}
                                  </span>
                                </td>
                                <td className="py-2 px-4 font-sans text-slate-400 text-[11px] truncate max-w-xs">{r.reason}</td>
                                <td className="py-2 px-3 text-right text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>

              {/* ========================================================================= */}
              {/* 5. TOURNAMENT SETTLEMENT ANALYTICS SECTION                                */}
              {/* ========================================================================= */}
              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <Scale className="size-4 text-purple-400" /> Tournament Settlement Analytics & Prize Payout Audit
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Authoritative prize settlement records, partial settlement tracking, and ledger validation
                    </p>
                  </div>

                  {/* Breakdown Dimension Switcher */}
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800 overflow-x-auto">
                    {[
                      { id: 'GAME', label: '🎮 By Game' },
                      { id: 'TIER', label: '⚡ By Tier' },
                      { id: 'DATE', label: '📅 By Date' },
                      { id: 'FAILED', label: `🚨 Failed (${analyticsData.settlementAnalytics.summary.failedSettlements})` },
                      { id: 'RECORDS', label: '📜 All Settlements' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setSettlementBreakdownTab(tab.id as any)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                          settlementBreakdownTab === tab.id
                            ? tab.id === 'FAILED' && analyticsData.settlementAnalytics.summary.failedSettlements > 0
                              ? 'bg-rose-600 text-white shadow font-black animate-pulse'
                              : 'bg-purple-600 text-white shadow font-black'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Failed Settlements High-Visibility Alert Banner */}
                {analyticsData.settlementAnalytics.summary.failedSettlements > 0 && (
                  <div className="rounded-2xl border border-rose-500/50 bg-rose-950/30 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-xl bg-rose-500 text-white flex items-center justify-center font-black text-lg">
                        ⚠️
                      </div>
                      <div>
                        <div className="text-sm font-black text-rose-200">
                          {analyticsData.settlementAnalytics.summary.failedSettlements} Failed Prize Settlements Require Attention
                        </div>
                        <div className="text-xs text-rose-300/80">
                          🪙 {analyticsData.settlementAnalytics.summary.totalFailedAmount.toLocaleString()} in failed prize payouts detected across completed tournaments.
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setSettlementBreakdownTab('FAILED')}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow"
                    >
                      Inspect Failed Settlements
                    </button>
                  </div>
                )}

                {/* 5 Core KPI Metric Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-4">
                    <div className="text-[11px] font-bold text-slate-400 uppercase">Total Settlements</div>
                    <div className="text-xl font-black text-white font-mono mt-1">
                      {analyticsData.settlementAnalytics.summary.totalSettlements}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Configured prize entries</div>
                  </div>

                  <div className="rounded-2xl bg-emerald-950/20 border border-emerald-800/40 p-4">
                    <div className="text-[11px] font-bold text-emerald-400 uppercase">Credited Settlements</div>
                    <div className="text-xl font-black text-emerald-400 font-mono mt-1">
                      {analyticsData.settlementAnalytics.summary.creditedSettlements}
                    </div>
                    <div className="text-[10px] text-emerald-500 font-mono mt-0.5">
                      🪙 {analyticsData.settlementAnalytics.summary.totalSettledAmount.toLocaleString()}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-amber-950/20 border border-amber-800/40 p-4">
                    <div className="text-[11px] font-bold text-amber-400 uppercase">Pending Settlements</div>
                    <div className="text-xl font-black text-amber-400 font-mono mt-1">
                      {analyticsData.settlementAnalytics.summary.pendingSettlements}
                    </div>
                    <div className="text-[10px] text-amber-500 font-mono mt-0.5">
                      🪙 {analyticsData.settlementAnalytics.summary.totalPendingAmount.toLocaleString()}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-rose-950/20 border border-rose-800/40 p-4">
                    <div className="text-[11px] font-bold text-rose-400 uppercase">Failed Settlements</div>
                    <div className="text-xl font-black text-rose-400 font-mono mt-1">
                      {analyticsData.settlementAnalytics.summary.failedSettlements}
                    </div>
                    <div className="text-[10px] text-rose-400 font-mono mt-0.5">
                      🪙 {analyticsData.settlementAnalytics.summary.totalFailedAmount.toLocaleString()}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-4 col-span-2 sm:col-span-1">
                    <div className="text-[11px] font-bold text-purple-400 uppercase">Partially Settled</div>
                    <div className="text-xl font-black text-purple-400 font-mono mt-1">
                      {analyticsData.settlementAnalytics.summary.partiallySettledTournaments}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Incomplete tournaments</div>
                  </div>
                </div>

                {/* Breakdown Tables (Game / Tier / Date / Failed / Records) */}
                <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
                  <div className="overflow-x-auto">
                    {settlementBreakdownTab === 'GAME' && (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Game Discipline</th>
                            <th className="py-2.5 px-3 text-center">Settlements</th>
                            <th className="py-2.5 px-3 text-center text-emerald-400">Credited</th>
                            <th className="py-2.5 px-3 text-center text-amber-400">Pending</th>
                            <th className="py-2.5 px-3 text-center text-rose-400">Failed</th>
                            <th className="py-2.5 px-3 text-center text-purple-400">Partially Settled</th>
                            <th className="py-2.5 px-4 text-right">Total Settled Coins</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {analyticsData.settlementAnalytics.byGame.map((g) => (
                            <tr key={g.gameId} className="hover:bg-slate-800/40 transition-colors">
                              <td className="py-2.5 px-4 font-sans font-bold text-slate-200 flex items-center gap-2">
                                <span>{GAME_DEFINITIONS.find((def) => def.id === g.gameId)?.icon ?? '🎮'}</span>
                                <span>{g.gameName}</span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-slate-300">{g.totalSettlements}</td>
                              <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{g.creditedSettlements}</td>
                              <td className="py-2.5 px-3 text-center text-amber-400">{g.pendingSettlements > 0 ? g.pendingSettlements : '—'}</td>
                              <td className="py-2.5 px-3 text-center text-rose-400">{g.failedSettlements > 0 ? g.failedSettlements : '—'}</td>
                              <td className="py-2.5 px-3 text-center text-purple-400">{g.partiallySettledTournaments > 0 ? g.partiallySettledTournaments : '—'}</td>
                              <td className="py-2.5 px-4 text-right font-bold text-emerald-400">
                                🪙 {g.totalSettledAmount.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {settlementBreakdownTab === 'TIER' && (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Tournament Tier</th>
                            <th className="py-2.5 px-3 text-center">Entry Fee</th>
                            <th className="py-2.5 px-3 text-center">Settlements</th>
                            <th className="py-2.5 px-3 text-center text-emerald-400">Credited</th>
                            <th className="py-2.5 px-3 text-center text-amber-400">Pending</th>
                            <th className="py-2.5 px-3 text-center text-rose-400">Failed</th>
                            <th className="py-2.5 px-3 text-center text-purple-400">Partially Settled</th>
                            <th className="py-2.5 px-4 text-right">Total Settled Coins</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {analyticsData.settlementAnalytics.byTier.map((t) => (
                            <tr key={t.tierCode} className="hover:bg-slate-800/40 transition-colors">
                              <td className="py-2.5 px-4 font-sans font-bold text-slate-200">{t.tierName}</td>
                              <td className="py-2.5 px-3 text-center text-amber-400 font-bold">{t.entryFee}🪙</td>
                              <td className="py-2.5 px-3 text-center text-slate-300">{t.totalSettlements}</td>
                              <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{t.creditedSettlements}</td>
                              <td className="py-2.5 px-3 text-center text-amber-400">{t.pendingSettlements > 0 ? t.pendingSettlements : '—'}</td>
                              <td className="py-2.5 px-3 text-center text-rose-400">{t.failedSettlements > 0 ? t.failedSettlements : '—'}</td>
                              <td className="py-2.5 px-3 text-center text-purple-400">{t.partiallySettledTournaments > 0 ? t.partiallySettledTournaments : '—'}</td>
                              <td className="py-2.5 px-4 text-right font-bold text-emerald-400">
                                🪙 {t.totalSettledAmount.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {settlementBreakdownTab === 'DATE' && (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Date / Period</th>
                            <th className="py-2.5 px-3 text-center">Settlements</th>
                            <th className="py-2.5 px-3 text-center text-emerald-400">Credited</th>
                            <th className="py-2.5 px-3 text-center text-amber-400">Pending</th>
                            <th className="py-2.5 px-3 text-center text-rose-400">Failed</th>
                            <th className="py-2.5 px-4 text-right">Total Settled Coins</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {analyticsData.settlementAnalytics.byDate.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-6 text-center text-slate-500 font-sans">
                                No settlement records found for this period
                              </td>
                            </tr>
                          ) : (
                            analyticsData.settlementAnalytics.byDate.map((d) => (
                              <tr key={d.date} className="hover:bg-slate-800/40 transition-colors">
                                <td className="py-2.5 px-4 font-sans font-bold text-slate-200">
                                  {d.label} <span className="text-[10px] text-slate-500 font-normal">({d.date})</span>
                                </td>
                                <td className="py-2.5 px-3 text-center text-slate-300">{d.totalSettlements}</td>
                                <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{d.creditedSettlements}</td>
                                <td className="py-2.5 px-3 text-center text-amber-400">{d.pendingSettlements > 0 ? d.pendingSettlements : '—'}</td>
                                <td className="py-2.5 px-3 text-center text-rose-400">{d.failedSettlements > 0 ? d.failedSettlements : '—'}</td>
                                <td className="py-2.5 px-4 text-right font-bold text-emerald-400">
                                  🪙 {d.totalSettledAmount.toLocaleString()}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}

                    {settlementBreakdownTab === 'FAILED' && (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-rose-800/50 bg-rose-950/40 text-[11px] font-bold text-rose-300 uppercase">
                            <th className="py-2.5 px-4">Prize ID</th>
                            <th className="py-2.5 px-3">Tournament</th>
                            <th className="py-2.5 px-3">Player</th>
                            <th className="py-2.5 px-3 text-center">Rank</th>
                            <th className="py-2.5 px-3 text-right">Prize Amount</th>
                            <th className="py-2.5 px-4">Error / Failure Detail</th>
                            <th className="py-2.5 px-3 text-center">Status</th>
                            <th className="py-2.5 px-3 text-right">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-rose-800/30 font-mono text-[11px]">
                          {analyticsData.settlementAnalytics.failedRecords.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="py-8 text-center text-emerald-400 font-sans font-bold">
                                🟢 No failed settlements detected! All tournament prize settlements are healthy.
                              </td>
                            </tr>
                          ) : (
                            analyticsData.settlementAnalytics.failedRecords.map((r) => (
                              <tr key={r.id} className="hover:bg-rose-950/30 transition-colors">
                                <td className="py-2.5 px-4 text-rose-400 font-bold">#{r.id.slice(-8)}</td>
                                <td className="py-2.5 px-3 font-sans font-bold text-slate-200">{r.tournamentTitle}</td>
                                <td className="py-2.5 px-3 font-sans text-slate-300">{r.username}</td>
                                <td className="py-2.5 px-3 text-center font-bold text-amber-400">Rank {r.rank}</td>
                                <td className="py-2.5 px-3 text-right font-bold text-rose-400">🪙 {r.amount.toLocaleString()}</td>
                                <td className="py-2.5 px-4 font-sans text-rose-300 text-[11px] truncate max-w-xs">{r.error || 'Payout transfer failed'}</td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className="inline-block px-2 py-0.5 rounded bg-rose-500 text-white text-[10px] font-black uppercase">
                                    FAILED
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}

                    {settlementBreakdownTab === 'RECORDS' && (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Prize ID</th>
                            <th className="py-2.5 px-3">Tournament</th>
                            <th className="py-2.5 px-3">Player</th>
                            <th className="py-2.5 px-3 text-center">Rank</th>
                            <th className="py-2.5 px-3 text-right">Prize</th>
                            <th className="py-2.5 px-3 text-center">Status</th>
                            <th className="py-2.5 px-3">Transaction ID</th>
                            <th className="py-2.5 px-3 text-right">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {analyticsData.settlementAnalytics.records.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="py-6 text-center text-slate-500 font-sans">
                                No settlement records found
                              </td>
                            </tr>
                          ) : (
                            analyticsData.settlementAnalytics.records.map((r) => (
                              <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                                <td className="py-2 px-4 text-slate-400">#{r.id.slice(-8)}</td>
                                <td className="py-2 px-3 font-sans font-bold text-slate-200">{r.tournamentTitle}</td>
                                <td className="py-2 px-3 font-sans text-slate-300">{r.username}</td>
                                <td className="py-2 px-3 text-center font-bold text-amber-400">
                                  {r.rank === 1 ? '🥇 1st' : r.rank === 2 ? '🥈 2nd' : r.rank === 3 ? '🥉 3rd' : '4️⃣ 4th'}
                                </td>
                                <td className="py-2 px-3 text-right font-bold text-emerald-400">🪙 {r.amount.toLocaleString()}</td>
                                <td className="py-2 px-3 text-center">
                                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                    r.status === 'PAID'
                                      ? 'bg-emerald-500/20 text-emerald-400'
                                      : r.status === 'PENDING'
                                      ? 'bg-amber-500/20 text-amber-400'
                                      : 'bg-rose-500/20 text-rose-400'
                                  }`}>
                                    {r.status}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-slate-400 truncate max-w-[120px]">{r.transactionId || '—'}</td>
                                <td className="py-2 px-3 text-right text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>

              {/* 6. 5-Tier Performance Analytics Grid */}
              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur">
                <h3 className="text-base font-black text-white flex items-center gap-2 mb-4">
                  <Layers className="size-4 text-indigo-400" /> Tier Performance (All 5 Tiers)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  {analyticsData.tiers.map((t) => (
                    <div key={t.tierCode} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-white">{t.tierName}</span>
                        <span className="text-xs font-mono text-amber-400 font-bold">{t.entryFee}🪙</span>
                      </div>
                      <div className="space-y-1 text-xs text-slate-400">
                        <div className="flex justify-between">
                          <span>Tournaments:</span>
                          <span className="font-bold text-slate-200">{t.tournamentsCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Registrations:</span>
                          <span className="font-bold text-slate-200">{t.registrationsCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Fill Rate:</span>
                          <span className="font-bold text-amber-400">{t.fillRatePercent}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Completion:</span>
                          <span className="font-bold text-emerald-400">{t.completionRatePercent}%</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-slate-800">
                          <span>Entries:</span>
                          <span className="font-mono text-slate-200">🪙 {t.entryFeesCollected.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Prizes:</span>
                          <span className="font-mono text-emerald-400">🪙 {t.prizesDistributed.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 5. 10-Game Analytics Performance Table */}
              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 overflow-hidden shadow-xl backdrop-blur">
                <div className="p-5 border-b border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <Trophy className="size-4 text-amber-400" /> Game Analytics (All 10 Games)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Discipline-level activity, completion, entry collection, and prize distribution
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        <th className="py-3 px-4">Game</th>
                        <th className="py-3 px-4 text-center">Tournaments</th>
                        <th className="py-3 px-4 text-center">Players</th>
                        <th className="py-3 px-4 text-center">Completed</th>
                        <th className="py-3 px-4 text-center">Cancelled</th>
                        <th className="py-3 px-4 text-right">Entry Collection</th>
                        <th className="py-3 px-4 text-right">Prizes Paid</th>
                        <th className="py-3 px-4 text-right">Refunds</th>
                        <th className="py-3 px-4 text-center">Completion %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {analyticsData.games.map((g) => (
                        <tr key={g.gameId} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-200 flex items-center gap-2">
                            <span>{GAME_DEFINITIONS.find((def) => def.id === g.gameId)?.icon ?? '🎮'}</span>
                            <span>{g.gameName}</span>
                          </td>
                          <td className="py-3 px-4 text-center font-mono text-slate-300">{g.tournamentsCount}</td>
                          <td className="py-3 px-4 text-center font-mono text-slate-300">{g.playersCount}</td>
                          <td className="py-3 px-4 text-center font-mono text-emerald-400 font-bold">{g.completedCount}</td>
                          <td className="py-3 px-4 text-center font-mono text-rose-400 font-bold">{g.cancelledCount}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-200">
                            🪙 {g.entryCollection.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                            🪙 {g.prizesDistributed.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-rose-400">
                            🪙 {g.refunds.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold">
                            <span className={g.completionRatePercent >= 70 ? 'text-emerald-400' : 'text-amber-400'}>
                              {g.completionRatePercent}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 6. 24-Hour Hourly Activity & Peak Hours Distribution */}
              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur">
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <Clock className="size-4 text-indigo-400" /> Hourly Tournament Activity & Peak Hours (24H)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Tournament volume and participant density per clock-hour
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2 mt-4">
                  {analyticsData.hourlyPerformance.map((h) => (
                    <div
                      key={h.hour}
                      className={`p-2.5 rounded-xl border text-center text-xs transition-all ${
                        h.isPeakHour
                          ? 'border-amber-500/50 bg-amber-500/10'
                          : h.isLowParticipationHour
                          ? 'border-slate-800/60 bg-slate-950/30'
                          : 'border-slate-800 bg-slate-950/60'
                      }`}
                    >
                      <div className="text-[10px] font-bold text-slate-400">{h.hourLabel}</div>
                      <div className="text-base font-black text-white font-mono mt-1">{h.tournamentsCount}</div>
                      <div className="text-[10px] text-slate-400">{h.registrationsCount} players</div>
                      {h.isPeakHour && (
                        <span className="inline-block mt-1 text-[9px] font-black uppercase text-amber-400 bg-amber-500/20 px-1 py-0.5 rounded">
                          🔥 Peak
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 7. Game × Tier 10×5 Heatmap Matrix */}
              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 overflow-hidden shadow-xl backdrop-blur">
                <div className="p-5 border-b border-slate-800">
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <Grid className="size-4 text-indigo-400" /> Game × Tier Participation Matrix
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Tournaments and fill rate cross-tabulation across all 10 games and 5 tiers
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold text-slate-400 uppercase">
                        <th className="py-3 px-4">Game</th>
                        <th className="py-3 px-4 text-center">🟢 Mini (5🪙)</th>
                        <th className="py-3 px-4 text-center">🔵 Basic (10🪙)</th>
                        <th className="py-3 px-4 text-center">🟣 Standard (25🪙)</th>
                        <th className="py-3 px-4 text-center">🟠 Premium (50🪙)</th>
                        <th className="py-3 px-4 text-center">🔴 Pro (100🪙)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {GAME_DEFINITIONS.map((g) => {
                        const m = analyticsData.gameTierMatrix[g.id];
                        return (
                          <tr key={g.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-4 font-bold text-slate-200 flex items-center gap-2">
                              <span>{g.icon}</span>
                              <span>{g.name}</span>
                            </td>
                            {TIER_ORDER.map((tCode) => {
                              const cell = m?.[tCode] || { count: 0, fillRate: 0 };
                              return (
                                <td key={tCode} className="py-3 px-4 text-center">
                                  <div className="font-mono font-bold text-slate-200">{cell.count} tourns</div>
                                  <div className="text-[10px] text-amber-400 font-mono">{cell.fillRate}% fill</div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 8. Player Analytics & Cohort Section */}
              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <Users className="size-4 text-sky-400" /> Player Analytics &amp; Participation Cohorts
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Authoritative player engagement, new vs returning cohort distribution, and average tournament volume
                    </p>
                  </div>

                  {/* Breakdown Dimension Switcher */}
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800 flex-wrap">
                    {[
                      { id: 'SUMMARY', label: '📊 Summary' },
                      { id: 'GAME', label: '🎮 By Game', count: analyticsData.playerAnalytics?.byGame?.length ?? 0 },
                      { id: 'TIER', label: '⚡ By Tier', count: analyticsData.playerAnalytics?.byTier?.length ?? 0 },
                      { id: 'DATE', label: '📅 By Date', count: analyticsData.playerAnalytics?.byDate?.length ?? 0 },
                      { id: 'COHORT', label: '👥 Activity Cohort', count: analyticsData.playerAnalytics?.cohorts?.length ?? 0 },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setPlayerBreakdownTab(tab.id as 'SUMMARY' | 'GAME' | 'TIER' | 'DATE' | 'COHORT')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          playerBreakdownTab === tab.id
                            ? 'bg-indigo-600 text-white shadow font-black'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4 Core Player KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30">
                    <span className="text-[10px] font-bold text-sky-400 uppercase">👥 Active Tournament Players</span>
                    <div className="text-2xl font-black text-white font-mono mt-1">
                      {(analyticsData.playerAnalytics?.summary.activeTournamentPlayers ?? analyticsData.playerCohort[0]?.activeTournamentPlayers ?? 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Distinct players in period</div>
                  </div>

                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase">🌟 New Tournament Players</span>
                    <div className="text-2xl font-black text-emerald-300 font-mono mt-1">
                      {(analyticsData.playerAnalytics?.summary.newTournamentPlayers ?? analyticsData.playerCohort[0]?.newTournamentPlayers ?? 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">1st time participants in cohort</div>
                  </div>

                  <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase">🔄 Returning Players</span>
                    <div className="text-2xl font-black text-indigo-300 font-mono mt-1">
                      {(analyticsData.playerAnalytics?.summary.returningTournamentPlayers ?? analyticsData.playerCohort[0]?.returningTournamentPlayers ?? 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Repeat competitors (&gt;1 event)</div>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                    <span className="text-[10px] font-bold text-amber-400 uppercase">📊 Avg Tournaments / Player</span>
                    <div className="text-2xl font-black text-amber-300 font-mono mt-1">
                      {(analyticsData.playerAnalytics?.summary.averageTournamentsPerPlayer ?? analyticsData.playerCohort[0]?.averageTournamentsPerPlayer ?? 0)}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Participation intensity</div>
                  </div>
                </div>

                {/* Privacy & Non-Mutation Notice */}
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Shield className="size-4 text-emerald-400 flex-shrink-0" />
                    <span>
                      <strong>Privacy &amp; Security Protected:</strong> Player email addresses, wallet balances, and private account data are omitted. Player IDs are anonymized. Read-only audit system.
                    </span>
                  </div>
                </div>

                {/* Sub-Views */}
                <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
                  {playerBreakdownTab === 'SUMMARY' ? (
                    <div className="p-5 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                          <div className="text-xs text-slate-400 font-bold">Total Player Registrations</div>
                          <div className="text-xl font-black text-white font-mono mt-1">
                            {(analyticsData.playerAnalytics?.summary.totalRegistrations ?? analyticsData.overview.totalRegistrations).toLocaleString()}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">Cumulative tournament entries</div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                          <div className="text-xs text-slate-400 font-bold">New Player Proportion</div>
                          <div className="text-xl font-black text-emerald-400 font-mono mt-1">
                            {(() => {
                              const active = analyticsData.playerAnalytics?.summary.activeTournamentPlayers || 1;
                              const newP = analyticsData.playerAnalytics?.summary.newTournamentPlayers || 0;
                              return Math.round((newP / active) * 100);
                            })()}%
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">Of active cohort players</div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                          <div className="text-xs text-slate-400 font-bold">Repeat Participation Rate</div>
                          <div className="text-xl font-black text-indigo-400 font-mono mt-1">
                            {(() => {
                              const active = analyticsData.playerAnalytics?.summary.activeTournamentPlayers || 1;
                              const retP = analyticsData.playerAnalytics?.summary.returningTournamentPlayers || 0;
                              return Math.round((retP / active) * 100);
                            })()}%
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">Retained active competitors</div>
                        </div>
                      </div>
                    </div>
                  ) : playerBreakdownTab === 'GAME' ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Game Discipline</th>
                            <th className="py-2.5 px-3 text-center">Active Players</th>
                            <th className="py-2.5 px-3 text-center">New Players</th>
                            <th className="py-2.5 px-3 text-center">Returning Players</th>
                            <th className="py-2.5 px-3 text-center">Total Entries</th>
                            <th className="py-2.5 px-4 text-right">Avg Entries / Player</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {(analyticsData.playerAnalytics?.byGame || []).map((bg) => (
                            <tr key={bg.gameId} className="hover:bg-slate-800/40 transition-colors">
                              <td className="py-2.5 px-4 font-sans font-bold text-slate-200 flex items-center gap-2">
                                <span>{GAME_DEFINITIONS.find((def) => def.id === bg.gameId)?.icon ?? '🎮'}</span>
                                <span>{bg.gameName}</span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-sky-400 font-bold">{bg.activePlayers}</td>
                              <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{bg.newPlayers}</td>
                              <td className="py-2.5 px-3 text-center text-indigo-400 font-bold">{bg.returningPlayers}</td>
                              <td className="py-2.5 px-3 text-center text-white font-bold">{bg.totalRegistrations}</td>
                              <td className="py-2.5 px-4 text-right font-black text-amber-400">{bg.averageTournamentsPerPlayer}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : playerBreakdownTab === 'TIER' ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Tournament Tier</th>
                            <th className="py-2.5 px-3 text-center">Entry Fee</th>
                            <th className="py-2.5 px-3 text-center">Active Players</th>
                            <th className="py-2.5 px-3 text-center">New Players</th>
                            <th className="py-2.5 px-3 text-center">Returning Players</th>
                            <th className="py-2.5 px-3 text-center">Total Entries</th>
                            <th className="py-2.5 px-4 text-right">Avg Entries / Player</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {(analyticsData.playerAnalytics?.byTier || []).map((bt) => (
                            <tr key={bt.tierCode} className="hover:bg-slate-800/40 transition-colors">
                              <td className="py-2.5 px-4 font-sans font-bold text-slate-200 flex items-center gap-2">
                                <span className="uppercase text-[10px] font-black text-amber-400">{bt.tierCode}</span>
                                <span>{bt.tierName}</span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-amber-400 font-mono font-bold">🪙 {bt.entryFee}</td>
                              <td className="py-2.5 px-3 text-center text-sky-400 font-bold">{bt.activePlayers}</td>
                              <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{bt.newPlayers}</td>
                              <td className="py-2.5 px-3 text-center text-indigo-400 font-bold">{bt.returningPlayers}</td>
                              <td className="py-2.5 px-3 text-center text-white font-bold">{bt.totalRegistrations}</td>
                              <td className="py-2.5 px-4 text-right font-black text-amber-400">{bt.averageTournamentsPerPlayer}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : playerBreakdownTab === 'DATE' ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Date</th>
                            <th className="py-2.5 px-3 text-center">Active Players</th>
                            <th className="py-2.5 px-3 text-center">New Players</th>
                            <th className="py-2.5 px-3 text-center">Returning Players</th>
                            <th className="py-2.5 px-3 text-center">Total Entries</th>
                            <th className="py-2.5 px-4 text-right">Avg Entries / Player</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {(analyticsData.playerAnalytics?.byDate || []).length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-400 font-sans">
                                No player activity records found for selected period.
                              </td>
                            </tr>
                          ) : (
                            (analyticsData.playerAnalytics?.byDate || []).map((bd) => (
                              <tr key={bd.date} className="hover:bg-slate-800/40 transition-colors">
                                <td className="py-2.5 px-4 font-bold text-slate-200">{bd.label}</td>
                                <td className="py-2.5 px-3 text-center text-sky-400 font-bold">{bd.activePlayers}</td>
                                <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{bd.newPlayers}</td>
                                <td className="py-2.5 px-3 text-center text-indigo-400 font-bold">{bd.returningPlayers}</td>
                                <td className="py-2.5 px-3 text-center text-white font-bold">{bd.totalRegistrations}</td>
                                <td className="py-2.5 px-4 text-right font-black text-amber-400">{bd.averageTournamentsPerPlayer}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Player Identifier (Masked)</th>
                            <th className="py-2.5 px-3 text-center">Tournaments Joined</th>
                            <th className="py-2.5 px-3 text-center">Games Played</th>
                            <th className="py-2.5 px-3 text-center">Best Rank</th>
                            <th className="py-2.5 px-3 text-center">Points Scored</th>
                            <th className="py-2.5 px-4 text-right">Last Active</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {(analyticsData.playerAnalytics?.cohorts || []).length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-400 font-sans">
                                No player activity records found for selected period.
                              </td>
                            </tr>
                          ) : (
                            (analyticsData.playerAnalytics?.cohorts || []).map((p) => (
                              <tr key={p.maskedId} className="hover:bg-slate-800/40 transition-colors">
                                <td className="py-2.5 px-4 text-sky-300 font-bold">{p.maskedId}</td>
                                <td className="py-2.5 px-3 text-center font-bold text-white">{p.tournamentsJoined}</td>
                                <td className="py-2.5 px-3 text-center text-indigo-300">{p.gamesPlayedCount} games</td>
                                <td className="py-2.5 px-3 text-center">
                                  {p.topRank === 1 ? (
                                    <span className="text-amber-400 font-bold">🥇 1st</span>
                                  ) : p.topRank === 2 ? (
                                    <span className="text-slate-300 font-bold">🥈 2nd</span>
                                  ) : p.topRank === 3 ? (
                                    <span className="text-amber-600 font-bold">🥉 3rd</span>
                                  ) : p.topRank > 0 ? (
                                    <span className="text-slate-400">#{p.topRank}</span>
                                  ) : (
                                    <span className="text-slate-600">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center text-amber-400 font-bold">{p.totalPoints}</td>
                                <td className="py-2.5 px-4 text-right text-slate-400 text-[10px]">
                                  {new Date(p.lastActiveAt).toLocaleDateString()}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* 9. Top Participation Section */}
              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <TrendingUp className="size-4 text-amber-400" /> Top Participation &amp; Popularity Analytics
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Most participated games, most popular tournament tiers, and peak activity time periods
                    </p>
                  </div>

                  {/* Breakdown Dimension Switcher */}
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800 flex-wrap">
                    {[
                      { id: 'OVERVIEW', label: '📊 Overview' },
                      { id: 'GAMES', label: '🎮 Most Participated Games', count: analyticsData.topParticipation?.games?.length ?? 10 },
                      { id: 'TIERS', label: '⚡ Tiers (Mini → Pro)', count: analyticsData.topParticipation?.tiers?.length ?? 5 },
                      { id: 'PERIODS', label: '⏰ Active Periods (24h)', count: analyticsData.topParticipation?.periods?.length ?? 24 },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setTopPartBreakdownTab(tab.id as 'OVERVIEW' | 'GAMES' | 'TIERS' | 'PERIODS')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          topPartBreakdownTab === tab.id
                            ? 'bg-indigo-600 text-white shadow font-black'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3 Key Highlight Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                    <span className="text-[10px] font-bold text-amber-400 uppercase">🎮 Most Participated Game</span>
                    <div className="text-xl font-black text-white font-mono mt-1 flex items-center gap-2">
                      <span>{GAME_DEFINITIONS.find((g) => g.id === analyticsData.topParticipation?.summary.topGame?.gameId)?.icon ?? '🎮'}</span>
                      <span className="truncate">{analyticsData.topParticipation?.summary.topGame?.gameName || '—'}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between font-mono">
                      <span>{analyticsData.topParticipation?.summary.topGame?.totalRegistrations ?? 0} players</span>
                      <span className="text-amber-400">{analyticsData.topParticipation?.summary.topGame?.tournamentsCount ?? 0} tourns</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase">⚡ Most Popular Tier</span>
                    <div className="text-xl font-black text-white font-mono mt-1 flex items-center gap-2">
                      <span className="uppercase text-amber-400 text-sm font-black">
                        {analyticsData.topParticipation?.summary.topTier?.tierCode || 'standard'}
                      </span>
                      <span>{analyticsData.topParticipation?.summary.topTier?.tierName || 'Standard'}</span>
                      <span className="text-xs text-slate-400 font-normal">
                        (🪙 {analyticsData.topParticipation?.summary.topTier?.entryFee ?? 25})
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between font-mono">
                      <span>{analyticsData.topParticipation?.summary.topTier?.totalRegistrations ?? 0} players</span>
                      <span className="text-indigo-400">{analyticsData.topParticipation?.summary.topTier?.tournamentsCount ?? 0} tourns</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30">
                    <span className="text-[10px] font-bold text-cyan-400 uppercase">⏰ Peak Tournament Period</span>
                    <div className="text-xl font-black text-white font-mono mt-1 flex items-center gap-2">
                      <span>🔥 {analyticsData.topParticipation?.summary.topPeriod?.hourLabel || '18:00'}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between font-mono">
                      <span>{analyticsData.topParticipation?.summary.topPeriod?.totalRegistrations ?? 0} players</span>
                      <span className="text-cyan-400">{analyticsData.topParticipation?.summary.topPeriod?.tournamentsCount ?? 0} tourns</span>
                    </div>
                  </div>
                </div>

                {/* Fair Play & Non-Mutation Notice */}
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Shield className="size-4 text-amber-400 flex-shrink-0" />
                    <span>
                      <strong>Fair Play &amp; Operational Guarantee:</strong> Participation metrics are purely for operational scheduling. Participation data is never used to determine player skill, winners, or modify leaderboard, wallet, or prize settlement logic.
                    </span>
                  </div>
                </div>

                {/* Sub-Views */}
                <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
                  {topPartBreakdownTab === 'OVERVIEW' ? (
                    <div className="p-5 space-y-6">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Top 3 Games */}
                        <div className="space-y-3">
                          <div className="text-xs font-bold text-slate-300 uppercase flex items-center gap-1.5">
                            <span>🎮</span> Top 3 Games
                          </div>
                          <div className="space-y-2">
                            {(analyticsData.topParticipation?.games || []).slice(0, 3).map((g) => (
                              <div key={g.gameId} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                  <span className="text-sm font-black text-amber-400 font-mono">#{g.rank}</span>
                                  <span>{GAME_DEFINITIONS.find((def) => def.id === g.gameId)?.icon ?? '🎮'}</span>
                                  <div>
                                    <div className="text-xs font-bold text-white">{g.gameName}</div>
                                    <div className="text-[10px] text-slate-500 font-mono">{g.tournamentsCount} tournaments</div>
                                  </div>
                                </div>
                                <div className="text-right font-mono">
                                  <div className="text-xs font-black text-white">{g.totalRegistrations}</div>
                                  <div className="text-[10px] text-amber-400">{g.fillRatePercent}% fill</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Top Tiers */}
                        <div className="space-y-3">
                          <div className="text-xs font-bold text-slate-300 uppercase flex items-center gap-1.5">
                            <span>⚡</span> Tier Popularity Ranking
                          </div>
                          <div className="space-y-2">
                            {(analyticsData.topParticipation?.tiers || []).slice(0, 3).map((t) => (
                              <div key={t.tierCode} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                  <span className="text-sm font-black text-indigo-400 font-mono">#{t.rank}</span>
                                  <div>
                                    <div className="text-xs font-bold text-white flex items-center gap-1">
                                      <span className="uppercase text-[10px] font-black text-amber-400">{t.tierCode}</span>
                                      <span>{t.tierName}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-mono">🪙 {t.entryFee} entry fee</div>
                                  </div>
                                </div>
                                <div className="text-right font-mono">
                                  <div className="text-xs font-black text-white">{t.totalRegistrations}</div>
                                  <div className="text-[10px] text-indigo-400">{t.tournamentsCount} tourns</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Top Hours */}
                        <div className="space-y-3">
                          <div className="text-xs font-bold text-slate-300 uppercase flex items-center gap-1.5">
                            <span>⏰</span> Peak Activity Hours
                          </div>
                          <div className="space-y-2">
                            {(analyticsData.topParticipation?.periods || []).slice(0, 3).map((p) => (
                              <div key={p.hour} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                  <span className="text-sm font-black text-cyan-400 font-mono">#{p.rank}</span>
                                  <div>
                                    <div className="text-xs font-bold text-white">{p.hourLabel}</div>
                                    <div className="text-[10px] text-slate-500 font-mono">{p.tournamentsCount} tournaments</div>
                                  </div>
                                </div>
                                <div className="text-right font-mono">
                                  <div className="text-xs font-black text-white">{p.totalRegistrations} players</div>
                                  <div className="text-[10px] text-cyan-400">
                                    {p.isPeakHour ? '🔥 Peak' : 'Active'}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : topPartBreakdownTab === 'GAMES' ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4 text-center">Rank</th>
                            <th className="py-2.5 px-4">Game Discipline</th>
                            <th className="py-2.5 px-3 text-center">Tournament Count</th>
                            <th className="py-2.5 px-3 text-center">Total Registrations</th>
                            <th className="py-2.5 px-4 text-right">Fill Rate (%)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {(analyticsData.topParticipation?.games || []).map((g) => (
                            <tr key={g.gameId} className="hover:bg-slate-800/40 transition-colors">
                              <td className="py-2.5 px-4 text-center font-bold">
                                {g.rank === 1 ? (
                                  <span className="text-amber-400 font-black">🥇 #1</span>
                                ) : g.rank === 2 ? (
                                  <span className="text-slate-300 font-black">🥈 #2</span>
                                ) : g.rank === 3 ? (
                                  <span className="text-amber-600 font-black">🥉 #3</span>
                                ) : (
                                  <span className="text-slate-500">#{g.rank}</span>
                                )}
                              </td>
                              <td className="py-2.5 px-4 font-sans font-bold text-slate-200 flex items-center gap-2">
                                <span>{GAME_DEFINITIONS.find((def) => def.id === g.gameId)?.icon ?? '🎮'}</span>
                                <span>{g.gameName}</span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-slate-300 font-bold">{g.tournamentsCount}</td>
                              <td className="py-2.5 px-3 text-center text-amber-400 font-bold">{g.totalRegistrations}</td>
                              <td className="py-2.5 px-4 text-right font-black text-white">{g.fillRatePercent}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : topPartBreakdownTab === 'TIERS' ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4 text-center">Rank</th>
                            <th className="py-2.5 px-4">Tournament Tier</th>
                            <th className="py-2.5 px-3 text-center">Entry Fee</th>
                            <th className="py-2.5 px-3 text-center">Tournament Count</th>
                            <th className="py-2.5 px-3 text-center">Total Registrations</th>
                            <th className="py-2.5 px-4 text-right">Fill Rate (%)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {(analyticsData.topParticipation?.tiers || []).map((t) => (
                            <tr key={t.tierCode} className="hover:bg-slate-800/40 transition-colors">
                              <td className="py-2.5 px-4 text-center font-bold">
                                {t.rank === 1 ? (
                                  <span className="text-amber-400 font-black">🥇 #1</span>
                                ) : t.rank === 2 ? (
                                  <span className="text-slate-300 font-black">🥈 #2</span>
                                ) : t.rank === 3 ? (
                                  <span className="text-amber-600 font-black">🥉 #3</span>
                                ) : (
                                  <span className="text-slate-500">#{t.rank}</span>
                                )}
                              </td>
                              <td className="py-2.5 px-4 font-sans font-bold text-slate-200 flex items-center gap-2">
                                <span className="uppercase text-[10px] font-black text-amber-400">{t.tierCode}</span>
                                <span>{t.tierName}</span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-amber-400 font-bold">🪙 {t.entryFee}</td>
                              <td className="py-2.5 px-3 text-center text-slate-300 font-bold">{t.tournamentsCount}</td>
                              <td className="py-2.5 px-3 text-center text-indigo-300 font-bold">{t.totalRegistrations}</td>
                              <td className="py-2.5 px-4 text-right font-black text-white">{t.fillRatePercent}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4 text-center">Rank</th>
                            <th className="py-2.5 px-4">Time Period (1 Hour Window)</th>
                            <th className="py-2.5 px-3 text-center">Tournaments Created</th>
                            <th className="py-2.5 px-3 text-center">Total Player Registrations</th>
                            <th className="py-2.5 px-4 text-right">Participation Intensity</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {(analyticsData.topParticipation?.periods || []).map((p) => (
                            <tr key={p.hour} className="hover:bg-slate-800/40 transition-colors">
                              <td className="py-2.5 px-4 text-center font-bold">
                                {p.rank === 1 ? (
                                  <span className="text-amber-400 font-black">🥇 #1</span>
                                ) : p.rank === 2 ? (
                                  <span className="text-slate-300 font-black">🥈 #2</span>
                                ) : p.rank === 3 ? (
                                  <span className="text-amber-600 font-black">🥉 #3</span>
                                ) : (
                                  <span className="text-slate-500">#{p.rank}</span>
                                )}
                              </td>
                              <td className="py-2.5 px-4 font-bold text-slate-200 flex items-center gap-2">
                                <span>{p.hourLabel}</span>
                                {p.isPeakHour && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[9px] font-black uppercase">
                                    🔥 Peak
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center text-slate-300 font-bold">{p.tournamentsCount}</td>
                              <td className="py-2.5 px-3 text-center text-cyan-300 font-bold">{p.totalRegistrations}</td>
                              <td className="py-2.5 px-4 text-right font-black text-white">
                                {p.isPeakHour ? 'High Participation' : p.totalRegistrations > 0 ? 'Moderate' : 'Low Activity'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* 10. Player Performance Section */}
              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <Award className="size-4 text-emerald-400" /> Player Performance &amp; Match Results
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Authoritative tournament wins, Top 4 podium finishes, and match win/loss records across games and tiers
                    </p>
                  </div>

                  {/* Breakdown Dimension Switcher */}
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800 flex-wrap">
                    {[
                      { id: 'SUMMARY', label: '📊 Summary' },
                      { id: 'GAME', label: '🎮 By Game', count: analyticsData.playerPerformance?.byGame?.length ?? 10 },
                      { id: 'TIER', label: '⚡ By Tier', count: analyticsData.playerPerformance?.byTier?.length ?? 5 },
                      { id: 'DATE', label: '📅 By Date', count: analyticsData.playerPerformance?.byDate?.length ?? 0 },
                      { id: 'PERFORMERS', label: '🏆 Top Performers', count: analyticsData.playerPerformance?.topPerformers?.length ?? 0 },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setPlayerPerfBreakdownTab(tab.id as 'SUMMARY' | 'GAME' | 'TIER' | 'DATE' | 'PERFORMERS')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          playerPerfBreakdownTab === tab.id
                            ? 'bg-indigo-600 text-white shadow font-black'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5 Core Performance KPI Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                    <span className="text-[10px] font-bold text-amber-400 uppercase">🏆 Tournament Wins</span>
                    <div className="text-xl font-black text-white font-mono mt-1">
                      {(analyticsData.playerPerformance?.summary.tournamentWins ?? 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Champions crowned</div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase">🎖️ Top 4 Finishes</span>
                    <div className="text-xl font-black text-indigo-300 font-mono mt-1">
                      {(analyticsData.playerPerformance?.summary.top4Finishes ?? 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Podium placements</div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                    <span className="text-[10px] font-bold text-slate-300 uppercase">⚔️ Matches Played</span>
                    <div className="text-xl font-black text-white font-mono mt-1">
                      {(analyticsData.playerPerformance?.summary.matchesPlayed ?? 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Competitive duels</div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase">🟢 Matches Won</span>
                    <div className="text-xl font-black text-emerald-400 font-mono mt-1">
                      {(analyticsData.playerPerformance?.summary.matchesWon ?? 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {analyticsData.playerPerformance?.summary.winRatePercent ?? 50}% win rate
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30">
                    <span className="text-[10px] font-bold text-rose-400 uppercase">🔴 Matches Lost</span>
                    <div className="text-xl font-black text-rose-400 font-mono mt-1">
                      {(analyticsData.playerPerformance?.summary.matchesLost ?? 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Match defeats</div>
                  </div>
                </div>

                {/* Fair Play & Privacy Protected Notice */}
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Shield className="size-4 text-emerald-400 flex-shrink-0" />
                    <span>
                      <strong>Fair Play &amp; Non-Mutation Protected:</strong> Performance data reflects authoritative tournament results. These metrics are strictly observational and are not used to determine winners or modify leaderboard, wallet, or prize settlement logic.
                    </span>
                  </div>
                </div>

                {/* Sub-Views */}
                <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
                  {playerPerfBreakdownTab === 'SUMMARY' ? (
                    <div className="p-5 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                          <div className="text-xs text-slate-400 font-bold">Overall Match Win Rate</div>
                          <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
                            {analyticsData.playerPerformance?.summary.winRatePercent ?? 50}%
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">Across all tournament matches</div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                          <div className="text-xs text-slate-400 font-bold">Podium Placement Ratio</div>
                          <div className="text-2xl font-black text-indigo-400 font-mono mt-1">
                            {(() => {
                              const totalRegs = analyticsData.overview.totalRegistrations || 1;
                              const top4 = analyticsData.playerPerformance?.summary.top4Finishes || 0;
                              return Math.min(100, Math.round((top4 / totalRegs) * 100));
                            })()}%
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">Top 4 finishes per registration</div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                          <div className="text-xs text-slate-400 font-bold">Championship Victory Ratio</div>
                          <div className="text-2xl font-black text-amber-400 font-mono mt-1">
                            {(() => {
                              const completed = analyticsData.overview.completedTournaments || 1;
                              const wins = analyticsData.playerPerformance?.summary.tournamentWins || 0;
                              return Math.min(100, Math.round((wins / completed) * 100));
                            })()}%
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">1st place crowns per completed event</div>
                        </div>
                      </div>
                    </div>
                  ) : playerPerfBreakdownTab === 'GAME' ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Game Discipline</th>
                            <th className="py-2.5 px-3 text-center">Tournaments</th>
                            <th className="py-2.5 px-3 text-center">Tournament Wins</th>
                            <th className="py-2.5 px-3 text-center">Top 4 Finishes</th>
                            <th className="py-2.5 px-3 text-center">Matches Played</th>
                            <th className="py-2.5 px-3 text-center">Matches Won</th>
                            <th className="py-2.5 px-3 text-center">Matches Lost</th>
                            <th className="py-2.5 px-4 text-right">Win Rate (%)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {(analyticsData.playerPerformance?.byGame || []).map((bg) => (
                            <tr key={bg.gameId} className="hover:bg-slate-800/40 transition-colors">
                              <td className="py-2.5 px-4 font-sans font-bold text-slate-200 flex items-center gap-2">
                                <span>{GAME_DEFINITIONS.find((def) => def.id === bg.gameId)?.icon ?? '🎮'}</span>
                                <span>{bg.gameName}</span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-slate-300 font-bold">{bg.tournamentsCount}</td>
                              <td className="py-2.5 px-3 text-center text-amber-400 font-bold">{bg.tournamentWins}</td>
                              <td className="py-2.5 px-3 text-center text-indigo-400 font-bold">{bg.top4Finishes}</td>
                              <td className="py-2.5 px-3 text-center text-white font-bold">{bg.matchesPlayed}</td>
                              <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{bg.matchesWon}</td>
                              <td className="py-2.5 px-3 text-center text-rose-400 font-bold">{bg.matchesLost}</td>
                              <td className="py-2.5 px-4 text-right font-black text-amber-400">{bg.winRatePercent}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : playerPerfBreakdownTab === 'TIER' ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Tournament Tier</th>
                            <th className="py-2.5 px-3 text-center">Entry Fee</th>
                            <th className="py-2.5 px-3 text-center">Tournaments</th>
                            <th className="py-2.5 px-3 text-center">Tournament Wins</th>
                            <th className="py-2.5 px-3 text-center">Top 4 Finishes</th>
                            <th className="py-2.5 px-3 text-center">Matches Played</th>
                            <th className="py-2.5 px-3 text-center">Matches Won</th>
                            <th className="py-2.5 px-3 text-center">Matches Lost</th>
                            <th className="py-2.5 px-4 text-right">Win Rate (%)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {(analyticsData.playerPerformance?.byTier || []).map((bt) => (
                            <tr key={bt.tierCode} className="hover:bg-slate-800/40 transition-colors">
                              <td className="py-2.5 px-4 font-sans font-bold text-slate-200 flex items-center gap-2">
                                <span className="uppercase text-[10px] font-black text-amber-400">{bt.tierCode}</span>
                                <span>{bt.tierName}</span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-amber-400 font-mono font-bold">🪙 {bt.entryFee}</td>
                              <td className="py-2.5 px-3 text-center text-slate-300 font-bold">{bt.tournamentsCount}</td>
                              <td className="py-2.5 px-3 text-center text-amber-400 font-bold">{bt.tournamentWins}</td>
                              <td className="py-2.5 px-3 text-center text-indigo-400 font-bold">{bt.top4Finishes}</td>
                              <td className="py-2.5 px-3 text-center text-white font-bold">{bt.matchesPlayed}</td>
                              <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{bt.matchesWon}</td>
                              <td className="py-2.5 px-3 text-center text-rose-400 font-bold">{bt.matchesLost}</td>
                              <td className="py-2.5 px-4 text-right font-black text-amber-400">{bt.winRatePercent}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : playerPerfBreakdownTab === 'DATE' ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Date</th>
                            <th className="py-2.5 px-3 text-center">Tournament Wins</th>
                            <th className="py-2.5 px-3 text-center">Top 4 Finishes</th>
                            <th className="py-2.5 px-3 text-center">Matches Played</th>
                            <th className="py-2.5 px-3 text-center">Matches Won</th>
                            <th className="py-2.5 px-3 text-center">Matches Lost</th>
                            <th className="py-2.5 px-4 text-right">Win Rate (%)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {(analyticsData.playerPerformance?.byDate || []).length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-8 text-center text-slate-400 font-sans">
                                No performance records found for selected period.
                              </td>
                            </tr>
                          ) : (
                            (analyticsData.playerPerformance?.byDate || []).map((bd) => (
                              <tr key={bd.date} className="hover:bg-slate-800/40 transition-colors">
                                <td className="py-2.5 px-4 font-bold text-slate-200">{bd.label}</td>
                                <td className="py-2.5 px-3 text-center text-amber-400 font-bold">{bd.tournamentWins}</td>
                                <td className="py-2.5 px-3 text-center text-indigo-400 font-bold">{bd.top4Finishes}</td>
                                <td className="py-2.5 px-3 text-center text-white font-bold">{bd.matchesPlayed}</td>
                                <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{bd.matchesWon}</td>
                                <td className="py-2.5 px-3 text-center text-rose-400 font-bold">{bd.matchesLost}</td>
                                <td className="py-2.5 px-4 text-right font-black text-amber-400">{bd.winRatePercent}%</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Player Identifier (Masked)</th>
                            <th className="py-2.5 px-3 text-center">Tournaments</th>
                            <th className="py-2.5 px-3 text-center">Wins 🏆</th>
                            <th className="py-2.5 px-3 text-center">Top 4 🎖️</th>
                            <th className="py-2.5 px-3 text-center">Matches Won 🟢</th>
                            <th className="py-2.5 px-3 text-center">Matches Lost 🔴</th>
                            <th className="py-2.5 px-3 text-center">Win Rate (%)</th>
                            <th className="py-2.5 px-3 text-center">Points</th>
                            <th className="py-2.5 px-3">Favorite Game</th>
                            <th className="py-2.5 px-4 text-right">Last Active</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {(analyticsData.playerPerformance?.topPerformers || []).length === 0 ? (
                            <tr>
                              <td colSpan={10} className="py-8 text-center text-slate-400 font-sans">
                                No top performer records found for selected period.
                              </td>
                            </tr>
                          ) : (
                            (analyticsData.playerPerformance?.topPerformers || []).map((p) => (
                              <tr key={p.maskedId} className="hover:bg-slate-800/40 transition-colors">
                                <td className="py-2.5 px-4 text-emerald-400 font-bold">{p.maskedId}</td>
                                <td className="py-2.5 px-3 text-center font-bold text-white">{p.tournamentsCount}</td>
                                <td className="py-2.5 px-3 text-center text-amber-400 font-bold">{p.tournamentWins}</td>
                                <td className="py-2.5 px-3 text-center text-indigo-400 font-bold">{p.top4Finishes}</td>
                                <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{p.matchesWon}</td>
                                <td className="py-2.5 px-3 text-center text-rose-400 font-bold">{p.matchesLost}</td>
                                <td className="py-2.5 px-3 text-center text-amber-300 font-bold">{p.winRatePercent}%</td>
                                <td className="py-2.5 px-3 text-center text-white font-bold">{p.totalPoints}</td>
                                <td className="py-2.5 px-3 font-sans text-slate-300 text-[11px]">{p.favoriteGame}</td>
                                <td className="py-2.5 px-4 text-right text-slate-400 text-[10px]">
                                  {new Date(p.lastActiveAt).toLocaleDateString()}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* 11. Win Rate Analytics Section */}
              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <Percent className="size-4 text-emerald-400" /> Match Win Rate &amp; Efficiency Analytics
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 font-mono">
                      Formula: Win Rate = (Matches Won ÷ Completed Matches) × 100 · Draws excluded from decisive win calculations
                    </p>
                  </div>

                  {/* Breakdown Dimension Switcher */}
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800 flex-wrap">
                    {[
                      { id: 'OVERVIEW', label: '📊 Overview' },
                      { id: 'GAME', label: '🎮 By Game', count: analyticsData.winRateAnalytics?.byGame?.length ?? 10 },
                      { id: 'TIER', label: '⚡ By Tier', count: analyticsData.winRateAnalytics?.byTier?.length ?? 5 },
                      { id: 'DATE', label: '📅 By Date', count: analyticsData.winRateAnalytics?.byDate?.length ?? 0 },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setWinRateBreakdownTab(tab.id as 'OVERVIEW' | 'GAME' | 'TIER' | 'DATE')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          winRateBreakdownTab === tab.id
                            ? 'bg-indigo-600 text-white shadow font-black'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5 Core Win Rate KPI Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase">📈 Overall Win Rate</span>
                    <div className="text-2xl font-black text-white font-mono mt-1">
                      {analyticsData.winRateAnalytics?.summary.overallWinRate ?? 50}%
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Across completed duels</div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase">⚔️ Completed Matches</span>
                    <div className="text-xl font-black text-indigo-300 font-mono mt-1">
                      {(analyticsData.winRateAnalytics?.summary.totalCompletedMatches ?? 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Authoritative results</div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/30">
                    <span className="text-[10px] font-bold text-sky-400 uppercase">🟢 Matches Won</span>
                    <div className="text-xl font-black text-white font-mono mt-1">
                      {(analyticsData.winRateAnalytics?.summary.totalMatchesWon ?? 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Decisive victories</div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30">
                    <span className="text-[10px] font-bold text-rose-400 uppercase">🔴 Matches Lost</span>
                    <div className="text-xl font-black text-rose-400 font-mono mt-1">
                      {(analyticsData.winRateAnalytics?.summary.totalMatchesLost ?? 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Decisive defeats</div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                    <span className="text-[10px] font-bold text-amber-400 uppercase">⚖️ Matches Drawn</span>
                    <div className="text-xl font-black text-amber-300 font-mono mt-1">
                      {(analyticsData.winRateAnalytics?.summary.totalMatchesDrawn ?? 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Excluded from win %</div>
                  </div>
                </div>

                {/* Mathematical Integrity & Non-Mutation Notice */}
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Shield className="size-4 text-emerald-400 flex-shrink-0" />
                    <span>
                      <strong>Authoritative Match Verification:</strong> Win rates are calculated strictly from completed match results and never from registrations or entry fees. Win rates do not alter tournament results, rankings, wallet balances, or prize distributions. Draws are excluded from decisive win rate calculations.
                    </span>
                  </div>
                </div>

                {/* Sub-Views */}
                <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
                  {winRateBreakdownTab === 'OVERVIEW' ? (
                    <div className="p-5 space-y-6">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                          <div className="text-xs text-slate-400 font-bold">Decisive Match Ratio</div>
                          <div className="text-2xl font-black text-white font-mono mt-1">
                            {(() => {
                              const total = analyticsData.winRateAnalytics?.summary.totalCompletedMatches || 1;
                              const decisive = analyticsData.winRateAnalytics?.summary.decisiveMatches || 0;
                              return Math.round((decisive / total) * 100);
                            })()}%
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {analyticsData.winRateAnalytics?.summary.decisiveMatches ?? 0} decisive outcomes
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                          <div className="text-xs text-slate-400 font-bold">Draw / Tie Rate</div>
                          <div className="text-2xl font-black text-amber-400 font-mono mt-1">
                            {(() => {
                              const total = analyticsData.winRateAnalytics?.summary.totalCompletedMatches || 1;
                              const drawn = analyticsData.winRateAnalytics?.summary.totalMatchesDrawn || 0;
                              return Math.round((drawn / total) * 100);
                            })()}%
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {analyticsData.winRateAnalytics?.summary.totalMatchesDrawn ?? 0} drawn matches
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                          <div className="text-xs text-slate-400 font-bold">Total Competitive Duels</div>
                          <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
                            {(analyticsData.winRateAnalytics?.summary.totalCompletedMatches ?? 0).toLocaleString()}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">Authoritatively verified</div>
                        </div>
                      </div>
                    </div>
                  ) : winRateBreakdownTab === 'GAME' ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Game Discipline</th>
                            <th className="py-2.5 px-3 text-center">Tournaments</th>
                            <th className="py-2.5 px-3 text-center">Completed Matches</th>
                            <th className="py-2.5 px-3 text-center">Matches Won</th>
                            <th className="py-2.5 px-3 text-center">Matches Lost</th>
                            <th className="py-2.5 px-3 text-center">Matches Drawn</th>
                            <th className="py-2.5 px-4 text-right">Win Rate (%)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {(analyticsData.winRateAnalytics?.byGame || []).map((bg) => (
                            <tr key={bg.gameId} className="hover:bg-slate-800/40 transition-colors">
                              <td className="py-2.5 px-4 font-sans font-bold text-slate-200 flex items-center gap-2">
                                <span>{GAME_DEFINITIONS.find((def) => def.id === bg.gameId)?.icon ?? '🎮'}</span>
                                <span>{bg.gameName}</span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-slate-300 font-bold">{bg.tournamentsCount}</td>
                              <td className="py-2.5 px-3 text-center text-white font-bold">{bg.completedMatches}</td>
                              <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{bg.matchesWon}</td>
                              <td className="py-2.5 px-3 text-center text-rose-400 font-bold">{bg.matchesLost}</td>
                              <td className="py-2.5 px-3 text-center text-amber-400 font-bold">{bg.matchesDrawn}</td>
                              <td className="py-2.5 px-4 text-right font-black text-emerald-400 font-mono text-xs">
                                {bg.winRatePercent}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : winRateBreakdownTab === 'TIER' ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Tournament Tier</th>
                            <th className="py-2.5 px-3 text-center">Entry Fee</th>
                            <th className="py-2.5 px-3 text-center">Tournaments</th>
                            <th className="py-2.5 px-3 text-center">Completed Matches</th>
                            <th className="py-2.5 px-3 text-center">Matches Won</th>
                            <th className="py-2.5 px-3 text-center">Matches Lost</th>
                            <th className="py-2.5 px-3 text-center">Matches Drawn</th>
                            <th className="py-2.5 px-4 text-right">Win Rate (%)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {(analyticsData.winRateAnalytics?.byTier || []).map((bt) => (
                            <tr key={bt.tierCode} className="hover:bg-slate-800/40 transition-colors">
                              <td className="py-2.5 px-4 font-sans font-bold text-slate-200 flex items-center gap-2">
                                <span className="uppercase text-[10px] font-black text-amber-400">{bt.tierCode}</span>
                                <span>{bt.tierName}</span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-amber-400 font-mono font-bold">🪙 {bt.entryFee}</td>
                              <td className="py-2.5 px-3 text-center text-slate-300 font-bold">{bt.tournamentsCount}</td>
                              <td className="py-2.5 px-3 text-center text-white font-bold">{bt.completedMatches}</td>
                              <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{bt.matchesWon}</td>
                              <td className="py-2.5 px-3 text-center text-rose-400 font-bold">{bt.matchesLost}</td>
                              <td className="py-2.5 px-3 text-center text-amber-400 font-bold">{bt.matchesDrawn}</td>
                              <td className="py-2.5 px-4 text-right font-black text-emerald-400 font-mono text-xs">
                                {bt.winRatePercent}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Date</th>
                            <th className="py-2.5 px-3 text-center">Completed Matches</th>
                            <th className="py-2.5 px-3 text-center">Matches Won</th>
                            <th className="py-2.5 px-3 text-center">Matches Lost</th>
                            <th className="py-2.5 px-3 text-center">Matches Drawn</th>
                            <th className="py-2.5 px-4 text-right">Win Rate (%)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {(analyticsData.winRateAnalytics?.byDate || []).length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-slate-400 font-sans">
                                No win rate records found for selected period.
                              </td>
                            </tr>
                          ) : (
                            (analyticsData.winRateAnalytics?.byDate || []).map((bd) => (
                              <tr key={bd.date} className="hover:bg-slate-800/40 transition-colors">
                                <td className="py-2.5 px-4 font-bold text-slate-200">{bd.label}</td>
                                <td className="py-2.5 px-3 text-center text-white font-bold">{bd.completedMatches}</td>
                                <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{bd.matchesWon}</td>
                                <td className="py-2.5 px-3 text-center text-rose-400 font-bold">{bd.matchesLost}</td>
                                <td className="py-2.5 px-3 text-center text-amber-400 font-bold">{bd.matchesDrawn}</td>
                                <td className="py-2.5 px-4 text-right font-black text-emerald-400 font-mono text-xs">
                                  {bd.winRatePercent}%
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* 12. Game-Specific Performance Analytics Section */}
              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <Gamepad2 className="size-4 text-sky-400" /> Game-Specific Performance Analytics
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Authoritative engine metrics, native scoring units, and verified match results across all 10 competitive games
                    </p>
                  </div>

                  {/* Filter Pills for All 10 Games */}
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800 flex-wrap max-w-full">
                    <button
                      onClick={() => setSelectedGameProfileId('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                        selectedGameProfileId === 'all'
                          ? 'bg-indigo-600 text-white shadow font-black'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      All Games (10)
                    </button>
                    {GAME_DEFINITIONS.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => setSelectedGameProfileId(g.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                          selectedGameProfileId === g.id
                            ? 'bg-sky-600 text-white shadow font-black'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span>{g.icon}</span>
                        <span className="hidden sm:inline">{g.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Non-Mutation & Native Engine Integrity Notice */}
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Shield className="size-4 text-sky-400 flex-shrink-0" />
                    <span>
                      <strong>Native Engine Verification:</strong> Displays only authoritative metrics derived from each game's engine (e.g. Chess wins/losses, Snooker frame score, Cricket runs/wickets, Carrom points, Table Tennis sets). Does not alter game rules, scoring, tournament results, leaderboard, wallet, or prize logic.
                    </span>
                  </div>
                </div>

                {/* Game Profiles Grid / Table */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(analyticsData.gameSpecificPerformance?.games || [])
                    .filter((g) => selectedGameProfileId === 'all' || g.gameId === selectedGameProfileId)
                    .map((g) => (
                      <div
                        key={g.gameId}
                        className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-3 hover:border-slate-700 transition-all"
                      >
                        {/* Game Header */}
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                          <div className="flex items-center gap-2.5">
                            <span className="text-2xl">{g.icon}</span>
                            <div>
                              <div className="text-sm font-black text-white">{g.gameName}</div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">{g.category}</span>
                                <span>•</span>
                                <span className="text-sky-400 font-mono">{g.mode}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right font-mono">
                            <div className="text-xs text-slate-400">Win Rate</div>
                            <div className="text-base font-black text-emerald-400">{g.winRatePercent}%</div>
                          </div>
                        </div>

                        {/* Engine Metrics Context */}
                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/60">
                          <div>
                            <span className="text-slate-500 block text-[9px] uppercase font-sans font-bold">Scoring Unit</span>
                            <span className="text-amber-300 font-bold">{g.scoreUnit}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[9px] uppercase font-sans font-bold">Result Format</span>
                            <span className="text-indigo-300 font-bold">{g.resultFormat}</span>
                          </div>
                        </div>

                        {/* Core Match Statistics */}
                        <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono pt-1">
                          <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                            <div className="text-slate-400">Tournaments</div>
                            <div className="text-xs font-black text-white mt-0.5">{g.tournamentsCount}</div>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                            <div className="text-slate-400">Completed</div>
                            <div className="text-xs font-black text-indigo-300 mt-0.5">{g.completedMatches}</div>
                          </div>
                          <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                            <div className="text-slate-400">Won / Lost / Draw</div>
                            <div className="text-xs font-black text-emerald-400 mt-0.5">
                              {g.matchesWon} / {g.matchesLost} / {g.matchesDrawn}
                            </div>
                          </div>
                        </div>

                        {/* High Score & Points Summary */}
                        <div className="flex items-center justify-between text-[11px] font-mono pt-1 text-slate-300 border-t border-slate-800/60">
                          <span>Avg Score: <strong className="text-white">{g.avgScorePerMatch}</strong></span>
                          <span>High Score: <strong className="text-amber-400">{g.highestMatchScore}</strong></span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* 13. Notification Analytics Section */}
              <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <Mail className="size-4 text-indigo-400" /> Notification & Delivery Analytics
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Authoritative tracking across Emails, In-App Notifications, and Socket.IO pushes (SENT / PENDING / FAILED)
                    </p>
                  </div>

                  {/* Breakdown Dimension Switcher */}
                  <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800 flex-wrap">
                    {[
                      { id: 'LOG', label: '📋 Notification Log', count: analyticsData.notificationAnalytics?.records?.length ?? 0 },
                      { id: 'GAME', label: '🎮 By Game', count: analyticsData.notificationAnalytics?.byGame?.length ?? 0 },
                      { id: 'TIER', label: '⚡ By Tier', count: analyticsData.notificationAnalytics?.byTier?.length ?? 0 },
                      { id: 'DATE', label: '📅 By Date', count: analyticsData.notificationAnalytics?.byDate?.length ?? 0 },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setNotifBreakdownTab(tab.id as 'LOG' | 'GAME' | 'TIER' | 'DATE')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          notifBreakdownTab === tab.id
                            ? 'bg-indigo-600 text-white shadow font-black'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5 Notification KPI Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase">✉️ Emails Sent</span>
                    <div className="text-xl font-black text-white font-mono mt-1">
                      {(analyticsData.notificationAnalytics?.summary.emailsSent ?? analyticsData.notifications.emailsSent).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">SMTP & SendGrid delivery</div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30">
                    <span className="text-[10px] font-bold text-rose-400 uppercase">⚠️ Emails Failed</span>
                    <div className="text-xl font-black text-rose-400 font-mono mt-1">
                      {(analyticsData.notificationAnalytics?.summary.emailsFailed ?? analyticsData.notifications.emailsFailed).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Delivery failures</div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase">🔔 In-App Notifications</span>
                    <div className="text-xl font-black text-white font-mono mt-1">
                      {(analyticsData.notificationAnalytics?.summary.inAppNotificationsSent ?? analyticsData.notifications.inAppNotificationsSent).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Persisted app alerts</div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-500/30">
                    <span className="text-[10px] font-bold text-cyan-400 uppercase">⚡ Socket Pushes</span>
                    <div className="text-xl font-black text-cyan-300 font-mono mt-1">
                      {(analyticsData.notificationAnalytics?.summary.socketNotificationsSent ?? analyticsData.notifications.inAppNotificationsSent).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Real-time Socket.IO</div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                    <span className="text-[10px] font-bold text-amber-400 uppercase">⏳ Pending Notifications</span>
                    <div className="text-xl font-black text-amber-300 font-mono mt-1">
                      {(analyticsData.notificationAnalytics?.summary.pendingNotifications ?? analyticsData.notifications.pendingNotifications).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">In queue / processing</div>
                  </div>
                </div>

                {/* Privacy & Non-Mutation Notice */}
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Shield className="size-4 text-emerald-400 flex-shrink-0" />
                    <span>
                      <strong>Privacy &amp; Security Protected:</strong> Recipient email addresses and player identifiers are masked. Notifications cannot be resent, modified, or deleted from this analytics page.
                    </span>
                  </div>
                </div>

                {/* Notification Sub-Views */}
                <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60">
                  {notifBreakdownTab === 'LOG' ? (
                    <div className="space-y-3 p-4">
                      {/* Secondary Log Filter Controls */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <span className="text-slate-400 font-bold">Channel:</span>
                          {(['ALL', 'EMAIL', 'IN_APP', 'SOCKET'] as const).map((ch) => (
                            <button
                              key={ch}
                              onClick={() => setNotifChannelFilter(ch)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                notifChannelFilter === ch
                                  ? 'bg-indigo-600 text-white font-black'
                                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                              }`}
                            >
                              {ch === 'ALL' ? 'All Channels' : ch === 'EMAIL' ? '✉️ Email' : ch === 'IN_APP' ? '🔔 In-App' : '⚡ Socket'}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <span className="text-slate-400 font-bold">Status:</span>
                          {(['ALL', 'SENT', 'PENDING', 'FAILED'] as const).map((st) => (
                            <button
                              key={st}
                              onClick={() => setNotifStatusFilter(st)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                notifStatusFilter === st
                                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-black'
                                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                              }`}
                            >
                              {st === 'ALL' ? 'All Statuses' : st === 'SENT' ? '🟢 SENT' : st === 'PENDING' ? '⏳ PENDING' : '🔴 FAILED'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Log Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                              <th className="py-2.5 px-4">Notification ID</th>
                              <th className="py-2.5 px-3">Tournament</th>
                              <th className="py-2.5 px-3">Game Discipline</th>
                              <th className="py-2.5 px-3 text-center">Tier</th>
                              <th className="py-2.5 px-3 text-center">Channel</th>
                              <th className="py-2.5 px-3">Event Type</th>
                              <th className="py-2.5 px-3">Recipient (Masked)</th>
                              <th className="py-2.5 px-3 text-center">Status</th>
                              <th className="py-2.5 px-3">Timestamp</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                            {(() => {
                              const rawRecords = analyticsData.notificationAnalytics?.records ?? [];
                              const filteredRecords = rawRecords.filter((rec) => {
                                if (notifChannelFilter !== 'ALL' && rec.channel !== notifChannelFilter) return false;
                                if (notifStatusFilter !== 'ALL' && rec.status !== notifStatusFilter) return false;
                                return true;
                              });

                              if (filteredRecords.length === 0) {
                                return (
                                  <tr>
                                    <td colSpan={9} className="py-8 text-center text-slate-400 font-sans">
                                      No notifications found matching selected filters.
                                    </td>
                                  </tr>
                                );
                              }

                              return filteredRecords.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                                  <td className="py-2.5 px-4 text-slate-400 font-mono">#{item.id.slice(-8)}</td>
                                  <td className="py-2.5 px-3 font-sans font-bold text-slate-200">
                                    <div>{item.tournamentTitle}</div>
                                    <div className="text-[10px] text-slate-500 font-mono">#{item.tournamentId.slice(-8)}</div>
                                  </td>
                                  <td className="py-2.5 px-3 font-sans text-slate-300 flex items-center gap-1.5 pt-3.5">
                                    <span>{GAME_DEFINITIONS.find((def) => def.id === item.gameId)?.icon ?? '🎮'}</span>
                                    <span>{GAME_DEFINITIONS.find((def) => def.id === item.gameId)?.name ?? item.gameId}</span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className="uppercase text-[10px] font-bold text-amber-400">{item.tierCode}</span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                      item.channel === 'EMAIL'
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-800/40'
                                        : item.channel === 'IN_APP'
                                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-800/40'
                                        : 'bg-cyan-500/20 text-cyan-300 border border-cyan-800/40'
                                    }`}>
                                      {item.channel}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 font-sans text-slate-300 text-[11px] max-w-xs truncate">
                                    {item.eventType}
                                  </td>
                                  <td className="py-2.5 px-3 text-indigo-300 font-mono text-[11px]">
                                    {item.recipientMasked}
                                  </td>
                                  <td className="py-2.5 px-3 text-center">
                                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                      item.status === 'SENT'
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-800/40'
                                        : item.status === 'PENDING'
                                        ? 'bg-amber-500/20 text-amber-400 border border-amber-800/40'
                                        : 'bg-rose-500/20 text-rose-400 border border-rose-800/40 animate-pulse'
                                    }`}>
                                      {item.status}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-400 text-[10px]">
                                    {new Date(item.createdAt).toLocaleTimeString()}
                                  </td>
                                </tr>
                              ));
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : notifBreakdownTab === 'GAME' ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Game Discipline</th>
                            <th className="py-2.5 px-3 text-center">Emails Sent</th>
                            <th className="py-2.5 px-3 text-center">Emails Failed</th>
                            <th className="py-2.5 px-3 text-center">In-App Sent</th>
                            <th className="py-2.5 px-3 text-center">Socket Sent</th>
                            <th className="py-2.5 px-3 text-center">Pending</th>
                            <th className="py-2.5 px-4 text-right">Total Notifications</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {(analyticsData.notificationAnalytics?.byGame || []).map((bg) => (
                            <tr key={bg.gameId} className="hover:bg-slate-800/40 transition-colors">
                              <td className="py-2.5 px-4 font-sans font-bold text-slate-200 flex items-center gap-2">
                                <span>{GAME_DEFINITIONS.find((def) => def.id === bg.gameId)?.icon ?? '🎮'}</span>
                                <span>{bg.gameName}</span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{bg.emailsSent}</td>
                              <td className="py-2.5 px-3 text-center text-rose-400 font-bold">{bg.emailsFailed}</td>
                              <td className="py-2.5 px-3 text-center text-indigo-400 font-bold">{bg.inAppSent}</td>
                              <td className="py-2.5 px-3 text-center text-cyan-400 font-bold">{bg.socketSent}</td>
                              <td className="py-2.5 px-3 text-center text-amber-400 font-bold">{bg.pending}</td>
                              <td className="py-2.5 px-4 text-right font-black text-white">{bg.total}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : notifBreakdownTab === 'TIER' ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Tournament Tier</th>
                            <th className="py-2.5 px-3 text-center">Emails Sent</th>
                            <th className="py-2.5 px-3 text-center">Emails Failed</th>
                            <th className="py-2.5 px-3 text-center">In-App Sent</th>
                            <th className="py-2.5 px-3 text-center">Socket Sent</th>
                            <th className="py-2.5 px-3 text-center">Pending</th>
                            <th className="py-2.5 px-4 text-right">Total Notifications</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {(analyticsData.notificationAnalytics?.byTier || []).map((bt) => (
                            <tr key={bt.tierCode} className="hover:bg-slate-800/40 transition-colors">
                              <td className="py-2.5 px-4 font-sans font-bold text-slate-200 flex items-center gap-2">
                                <span className="uppercase text-[10px] font-black text-amber-400">{bt.tierCode}</span>
                                <span>{bt.tierName}</span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{bt.emailsSent}</td>
                              <td className="py-2.5 px-3 text-center text-rose-400 font-bold">{bt.emailsFailed}</td>
                              <td className="py-2.5 px-3 text-center text-indigo-400 font-bold">{bt.inAppSent}</td>
                              <td className="py-2.5 px-3 text-center text-cyan-400 font-bold">{bt.socketSent}</td>
                              <td className="py-2.5 px-3 text-center text-amber-400 font-bold">{bt.pending}</td>
                              <td className="py-2.5 px-4 text-right font-black text-white">{bt.total}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-bold text-slate-400 uppercase">
                            <th className="py-2.5 px-4">Date</th>
                            <th className="py-2.5 px-3 text-center">Emails Sent</th>
                            <th className="py-2.5 px-3 text-center">Emails Failed</th>
                            <th className="py-2.5 px-3 text-center">In-App Sent</th>
                            <th className="py-2.5 px-3 text-center">Socket Sent</th>
                            <th className="py-2.5 px-3 text-center">Pending</th>
                            <th className="py-2.5 px-4 text-right">Total Notifications</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                          {(analyticsData.notificationAnalytics?.byDate || []).length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-8 text-center text-slate-400 font-sans">
                                No historical notification records found for selected period.
                              </td>
                            </tr>
                          ) : (
                            (analyticsData.notificationAnalytics?.byDate || []).map((bd) => (
                              <tr key={bd.date} className="hover:bg-slate-800/40 transition-colors">
                                <td className="py-2.5 px-4 font-bold text-slate-200">{bd.label}</td>
                                <td className="py-2.5 px-3 text-center text-emerald-400 font-bold">{bd.emailsSent}</td>
                                <td className="py-2.5 px-3 text-center text-rose-400 font-bold">{bd.emailsFailed}</td>
                                <td className="py-2.5 px-3 text-center text-indigo-400 font-bold">{bd.inAppSent}</td>
                                <td className="py-2.5 px-3 text-center text-cyan-400 font-bold">{bd.socketSent}</td>
                                <td className="py-2.5 px-3 text-center text-amber-400 font-bold">{bd.pending}</td>
                                <td className="py-2.5 px-4 text-right font-black text-white">{bd.total}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3. TOURNAMENT REPORTS & EXPORT ENGINE TAB                            */}
      {/* ===================================================================== */}
      {mainTab === 'REPORTS' && (
        <div className="space-y-6">
          {/* Main Reporting Controls Card */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileText className="size-5 text-indigo-400" />
                  Authoritative Tournament Reporting &amp; Export Engine
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Generate, preview, and download authoritative operational, financial, participation, settlement, and notification reports.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleGenerateReport}
                  disabled={isGeneratingReport}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs gap-1.5 shadow-md"
                >
                  {isGeneratingReport ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  {isGeneratingReport ? 'Generating Report...' : 'Generate & Preview Report'}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadReportCsv}
                  className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-xs font-bold gap-1.5"
                >
                  <Download className="size-3.5 text-emerald-400" /> Download CSV
                </Button>

                {generatedReport && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadReportJson}
                    className="border-purple-500/40 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 text-xs font-bold gap-1.5"
                  >
                    <Download className="size-3.5 text-purple-400" /> Download JSON
                  </Button>
                )}
              </div>
            </div>

            {/* Read-Only & Non-Mutation Guarantee Notice */}
            <div className="rounded-2xl border border-indigo-900/40 bg-indigo-950/20 p-3.5 flex items-center justify-between text-xs text-indigo-300">
              <div className="flex items-center gap-2.5">
                <Shield className="size-4 text-indigo-400 flex-shrink-0" />
                <span>
                  <strong>Authoritative Read-Only Guarantee:</strong> Report generation runs purely observational aggregations against database and wallet ledger records. It does not modify tournament results, player rankings, wallet balances, prizes, refunds, or notification logs. Datasets are safely buffered and capped at 1,000 records to ensure responsive performance on large datasets.
                </span>
              </div>
            </div>

            {/* Report Type Selector Pills */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                1. Select Report Category
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  {
                    id: 'TOURNAMENT' as TournamentReportType,
                    name: 'Tournament Report',
                    icon: '🏟️',
                    desc: 'Operational schedules, status, player counts & capacities',
                  },
                  {
                    id: 'FINANCIAL' as TournamentReportType,
                    name: 'Financial Report',
                    icon: '💰',
                    desc: 'Entry collections, prize distribution, refunds & profit',
                  },
                  {
                    id: 'PLAYER_PARTICIPATION' as TournamentReportType,
                    name: 'Player Participation',
                    icon: '👥',
                    desc: 'Tournaments played, wins, match stats & total prizes won',
                  },
                  {
                    id: 'SETTLEMENT' as TournamentReportType,
                    name: 'Settlement Report',
                    icon: '⚖️',
                    desc: 'Prize payout audit records, timestamps & failure logs',
                  },
                  {
                    id: 'NOTIFICATION' as TournamentReportType,
                    name: 'Notification Report',
                    icon: '🔔',
                    desc: 'Multi-channel notification delivery logs & status history',
                  },
                ].map((rep) => (
                  <button
                    key={rep.id}
                    onClick={() => {
                      setReportType(rep.id);
                      setGeneratedReport(null);
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      reportType === rep.id
                        ? 'border-indigo-500 bg-indigo-950/40 text-white shadow-lg ring-1 ring-indigo-500/50'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold text-sm text-white">
                      <span>{rep.icon}</span>
                      <span>{rep.name}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                      {rep.desc}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Comprehensive Filter Configuration Bar */}
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                2. Configure Scope &amp; Date Filters
              </label>

              {/* Timeframe Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { value: 'today', label: 'Today' },
                  { value: 'yesterday', label: 'Yesterday' },
                  { value: 'last7days', label: 'Last 7 Days' },
                  { value: 'last30days', label: 'Last 30 Days' },
                  { value: 'thismonth', label: 'This Month' },
                  { value: 'all', label: 'All Time' },
                  { value: 'custom', label: 'Custom Range' },
                ].map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setReportTimeFilter(p.value as TournamentAnalyticsTimeFilter)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      reportTimeFilter === p.value
                        ? 'bg-indigo-600 text-white shadow font-black'
                        : 'bg-slate-950/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Scope Dropdowns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                {reportTimeFilter === 'custom' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">From Date</label>
                      <input
                        type="date"
                        value={reportFromDate}
                        onChange={(e) => setReportFromDate(e.target.value)}
                        className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">To Date</label>
                      <input
                        type="date"
                        value={reportToDate}
                        onChange={(e) => setReportToDate(e.target.value)}
                        className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">Game Discipline</label>
                  <select
                    value={reportGame}
                    onChange={(e) => setReportGame(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="ALL">All 10 Games</option>
                    {GAME_DEFINITIONS.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">Tournament Tier</label>
                  <select
                    value={reportTier}
                    onChange={(e) => setReportTier(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="ALL">All 5 Tiers</option>
                    <option value="mini">🟢 Mini (5🪙)</option>
                    <option value="basic">🔵 Basic (10🪙)</option>
                    <option value="standard">🟣 Standard (25🪙)</option>
                    <option value="premium">🟠 Premium (50🪙)</option>
                    <option value="pro">🔴 Pro (100🪙)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">Tournament Status</label>
                  <select
                    value={reportStatus}
                    onChange={(e) => setReportStatus(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="LIVE">🟢 Live / In Progress</option>
                    <option value="UPCOMING">⏳ Upcoming</option>
                    <option value="REGISTRATION_OPEN">📝 Registration Open</option>
                    <option value="COMPLETED">🏆 Completed</option>
                    <option value="SETTLED">✅ Settled</option>
                    <option value="CANCELLED">❌ Cancelled</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Real-Time Live Preview Table */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-black text-white">
                  Report Live Preview
                </h3>
                {generatedReport && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {generatedReport.totalRecords} Records Found
                  </span>
                )}
              </div>

              {generatedReport && (
                <div className="text-xs text-slate-400 font-mono">
                  Generated at {new Date(generatedReport.generatedAt).toLocaleTimeString()}
                </div>
              )}
            </div>

            {isGeneratingReport ? (
              <div className="flex flex-col items-center justify-center py-20 bg-slate-950/40 rounded-2xl border border-slate-800">
                <Loader2 className="size-8 animate-spin text-indigo-400 mb-2" />
                <p className="text-xs text-slate-400">Querying authoritative records and formatting report...</p>
              </div>
            ) : !generatedReport ? (
              <div className="text-center py-16 bg-slate-950/40 rounded-2xl border border-slate-800 p-6 space-y-3">
                <FileText className="size-12 text-slate-600 mx-auto" />
                <p className="text-sm font-bold text-slate-300">No Report Generated Yet</p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Select your desired report type and filters above, then click <strong>"Generate &amp; Preview Report"</strong> to preview data before exporting.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleGenerateReport}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs gap-1.5 shadow"
                >
                  <RefreshCw className="size-3.5" /> Generate {reportType.replace('_', ' ')} Report
                </Button>
              </div>
            ) : generatedReport.rows.length === 0 ? (
              <div className="text-center py-16 bg-slate-950/40 rounded-2xl border border-slate-800 p-6 text-slate-400 text-xs">
                No matching records found for the selected date range and filter criteria.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60 max-h-[600px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-900/95 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider backdrop-blur">
                    <tr>
                      {generatedReport.headers.map((header) => (
                        <th key={header} className="py-3 px-4 whitespace-nowrap">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px] text-slate-300">
                    {generatedReport.rows.map((row, rowIdx) => (
                      <tr key={rowIdx} className="hover:bg-slate-800/40 transition-colors">
                        {generatedReport.headers.map((header) => {
                          const val = row[header];
                          const isCoinField = header.includes('Fee') || header.includes('Prize') || header.includes('Collected') || header.includes('Distributed') || header.includes('Refunds') || header.includes('Profit') || header.includes('Amount');
                          const isStatusField = header === 'Status';

                          return (
                            <td key={header} className="py-2.5 px-4 whitespace-nowrap">
                              {isStatusField ? (
                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  val === 'COMPLETED' || val === 'SETTLED' || val === 'PAID' || val === 'SENT'
                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                    : val === 'LIVE' || val === 'IN_PROGRESS' || val === 'REGISTRATION_OPEN'
                                    ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                                    : val === 'PENDING' || val === 'UPCOMING'
                                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                    : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                }`}>
                                  {val}
                                </span>
                              ) : isCoinField && typeof val === 'number' ? (
                                <span className="font-bold text-amber-300">
                                  🪙 {val.toLocaleString()}
                                </span>
                              ) : (
                                <span>{val !== undefined && val !== null ? String(val) : '—'}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 4. HOURLY SCHEDULER & PREVIEW TAB */}
      {/* ===================================================================== */}
      {mainTab === 'SCHEDULER' && (
        <div className="space-y-6">
          {/* Scheduler Manager Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl backdrop-blur">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Clock className="size-5 text-indigo-400" />
                  Hourly Tournament Scheduler Engine
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Automatically generates enabled 5-tier tournament instances at the top of every UTC hour
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant={schedulerInfo?.isPaused ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setShowPauseConfirm(true)}
                  className={`font-black text-xs gap-1.5 ${
                    schedulerInfo?.isPaused
                      ? 'bg-emerald-500 hover:bg-emerald-600 text-slate-950'
                      : 'border-rose-500/40 text-rose-400 hover:bg-rose-500/10'
                  }`}
                >
                  {schedulerInfo?.isPaused ? <Play className="size-4 fill-current" /> : <Pause className="size-4" />}
                  {schedulerInfo?.isPaused ? 'RESUME SCHEDULER' : 'PAUSE SCHEDULER'}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Status</span>
                <p className={`text-base font-black mt-1 ${schedulerInfo?.isPaused ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {schedulerInfo?.isPaused ? 'PAUSED' : 'ACTIVE & RUNNING'}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Cadence</span>
                <p className="text-base font-black text-slate-200 mt-1">Every 1 Hour (00:00 UTC)</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Active Tiers</span>
                <p className="text-base font-black text-indigo-300 mt-1">{schedulerInfo?.activeTiersCount ?? 5} Tiers</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Next Auto-Run</span>
                <p className="text-xs font-mono font-bold text-slate-300 mt-1.5">
                  {schedulerInfo?.nextRunAt ? new Date(schedulerInfo.nextRunAt).toLocaleTimeString() : 'Paused'}
                </p>
              </div>
            </div>
          </div>

          {/* Schedule Preview Grid */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-base font-bold text-white flex items-center gap-2">
                  <Calendar className="size-4 text-amber-400" />
                  Upcoming Hourly Tournament Schedule Preview
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Deterministic projection of tournaments generated in upcoming hours
                </p>
              </div>
            </div>

            {isSchedulerLoading ? (
              <div className="py-12 flex justify-center"><Loader2 className="size-6 animate-spin text-indigo-400" /></div>
            ) : schedulerPreview.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">No upcoming schedule slots available</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {schedulerPreview.map((slot, idx) => {
                  const visual = TOURNAMENT_TIER_VISUALS[slot.tierCode] || TOURNAMENT_TIER_VISUALS.standard;
                  const timeFormatted = new Date(slot.scheduledTime).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 hover:border-indigo-500/40 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            {timeFormatted}
                          </span>
                          <span className="text-xs font-bold text-white">{visual.badgeEmoji} {slot.tierName}</span>
                        </div>
                        <p className="text-xs text-slate-300 font-semibold mt-1.5">{slot.gameName}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-mono font-black text-emerald-400">🪙 {slot.prizePool.toLocaleString()}</div>
                        <div className="text-[10px] text-slate-500 font-mono">Fee: {slot.entryFee}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3. 5-TIER CONFIGURATION TAB */}
      {/* ===================================================================== */}
      {mainTab === 'TIERS' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl backdrop-blur">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sliders className="size-5 text-indigo-400" />
                Default 5-Tier Tournament Configuration
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure entry fees, player capacity, prize pools and 4-prize position breakdowns. Changes apply to future instances.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {TIER_ORDER.map((code) => {
                const visual = TOURNAMENT_TIER_VISUALS[code];
                const dbTier = tiersList.find((t) => t.code.toLowerCase() === code);

                const entryFee = dbTier?.entryFee ?? (code === 'mini' ? 5 : code === 'basic' ? 10 : code === 'standard' ? 25 : code === 'premium' ? 50 : 100);
                const prizePool = dbTier?.prizePool ?? (code === 'mini' ? 400 : code === 'basic' ? 1600 : code === 'standard' ? 10000 : code === 'premium' ? 22500 : 90000);
                const maxPlayers = dbTier?.maxPlayers ?? (code === 'mini' ? 100 : code === 'basic' ? 200 : code === 'standard' ? 500 : code === 'premium' ? 500 : 1000);
                const isActive = dbTier?.isActive ?? true;

                const prizes = calculatePrizes(prizePool);

                return (
                  <div
                    key={code}
                    className={`rounded-2xl p-4 border bg-slate-950/80 flex flex-col justify-between ${
                      isActive ? visual.borderClass : 'border-slate-800 opacity-60'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-black text-white flex items-center gap-1.5">
                          {visual.badgeEmoji} {visual.name}
                        </span>
                        <Badge variant={isActive ? 'success' : 'default'} className="text-[10px]">
                          {isActive ? 'ACTIVE' : 'DISABLED'}
                        </Badge>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between text-slate-400">
                          <span>Entry Fee:</span>
                          <span className="font-mono font-bold text-amber-400">🪙 {entryFee}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Max Players:</span>
                          <span className="font-mono text-slate-200">{maxPlayers}</span>
                        </div>
                        <div className="flex justify-between text-slate-400">
                          <span>Prize Pool:</span>
                          <span className="font-mono font-bold text-emerald-400">🪙 {prizePool.toLocaleString()}</span>
                        </div>
                      </div>

                      {/* 4 Prize Positions Breakdown */}
                      <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1 text-[11px]">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Prize Distribution</span>
                        <div className="flex justify-between text-slate-300">
                          <span>1st (50%):</span>
                          <span className="font-mono text-emerald-400">🪙 {prizes.p1.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-slate-300">
                          <span>2nd (25%):</span>
                          <span className="font-mono text-slate-300">🪙 {prizes.p2.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-slate-300">
                          <span>3rd (15%):</span>
                          <span className="font-mono text-slate-300">🪙 {prizes.p3.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-slate-300">
                          <span>4th (10%):</span>
                          <span className="font-mono text-slate-300">🪙 {prizes.p4.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingTier(dbTier || { id: code, name: visual.name, code, entryFee, prizePool, maxPlayers, isActive })}
                      className="mt-4 w-full text-xs h-8 border-slate-800 hover:bg-slate-800"
                    >
                      Edit Config
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 4. GAME-TIER MATRIX TAB */}
      {/* ===================================================================== */}
      {mainTab === 'GAME_MATRIX' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl backdrop-blur space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Grid className="size-5 text-indigo-400" />
                Game × Tournament Tier Configuration Matrix
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Manage tier eligibility across all 10 competitive games and 5 tournament tiers. Changes apply strictly to future tournament instances.
              </p>
            </div>
            {isMatrixSaving && (
              <div className="flex items-center gap-2 text-xs text-indigo-400 font-bold bg-indigo-500/10 px-3 py-1.5 rounded-xl border border-indigo-500/20">
                <Loader2 className="size-4 animate-spin" /> Saving Matrix...
              </div>
            )}
          </div>

          {/* Configuration Snapshot & Future Instance Scoping Banner */}
          <div className="rounded-2xl border border-indigo-900/40 bg-indigo-950/20 p-3.5 flex items-center justify-between text-xs text-indigo-300">
            <div className="flex items-center gap-2.5">
              <Shield className="size-4 text-indigo-400 flex-shrink-0" />
              <span>
                <strong>Configuration Snapshot Guarantee:</strong> Changes to Game × Tier availability apply only to future scheduled and on-demand tournament creations. Already created, open, or running tournaments maintain their immutable configuration snapshot. Game rules, wallet logic, prize distributions, and tournament brackets remain unaffected.
              </span>
            </div>
          </div>

          {/* Tier Source of Truth Summary Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {TIER_ORDER.map((code) => {
              const visual = TOURNAMENT_TIER_VISUALS[code];
              const tierConfig = (tiersList || []).find((t: any) => t.code === code) || {
                entryFee: code === 'mini' ? 5 : code === 'basic' ? 10 : code === 'standard' ? 25 : code === 'premium' ? 50 : 100,
                maxPlayers: code === 'mini' ? 64 : code === 'basic' ? 128 : code === 'standard' ? 256 : code === 'premium' ? 512 : 1000,
                prizePool: code === 'mini' ? 4500 : code === 'basic' ? 9000 : code === 'standard' ? 22500 : code === 'premium' ? 45000 : 90000,
              };
              return (
                <div key={code} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white flex items-center gap-1.5">
                      <span>{visual?.badgeEmoji || '🏆'}</span>
                      <span>{visual?.name || code}</span>
                    </span>
                    <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      🪙 {tierConfig.entryFee}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 flex justify-between">
                    <span>Max: {tierConfig.maxPlayers} players</span>
                    <span className="text-purple-300">Pool: 🪙{tierConfig.prizePool.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1 pt-1 border-t border-slate-800/80">
                    <button
                      onClick={() => handleToggleTierAllGames(code, true)}
                      className="flex-1 py-1 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-all text-center"
                    >
                      Enable All
                    </button>
                    <button
                      onClick={() => handleToggleTierAllGames(code, false)}
                      className="flex-1 py-1 rounded text-[10px] font-bold bg-slate-800 text-slate-400 hover:bg-slate-700 transition-all text-center"
                    >
                      Disable All
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive 10 Games × 5 Tiers Matrix Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="border-b border-slate-800 bg-slate-900/90 text-slate-300 uppercase font-bold text-[11px]">
                <tr>
                  <th className="px-5 py-3.5 min-w-[200px]">Game Discipline</th>
                  {TIER_ORDER.map((code) => {
                    const visual = TOURNAMENT_TIER_VISUALS[code];
                    return (
                      <th key={code} className="px-3 py-3.5 text-center min-w-[150px]">
                        <div className="flex items-center justify-center gap-1">
                          <span>{visual?.badgeEmoji}</span>
                          <span>{visual?.name}</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300 font-sans">
                {GAME_DEFINITIONS.map((g) => {
                  const availability = gameMatrix[g.id] || { mini: true, basic: true, standard: true, premium: true, pro: true };
                  return (
                    <tr key={g.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{g.icon ?? '🎮'}</span>
                            <span className="font-bold text-white text-sm">{g.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleToggleGameAllTiers(g.id, true)}
                              className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30"
                              title="Enable all tiers for this game"
                            >
                              All On
                            </button>
                            <button
                              onClick={() => handleToggleGameAllTiers(g.id, false)}
                              className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700"
                              title="Disable all tiers for this game"
                            >
                              All Off
                            </button>
                          </div>
                        </div>
                      </td>
                      {TIER_ORDER.map((code) => {
                        const enabled = availability[code] !== false;
                        const tierConfig = (tiersList || []).find((t: any) => t.code === code) || {
                          entryFee: code === 'mini' ? 5 : code === 'basic' ? 10 : code === 'standard' ? 25 : code === 'premium' ? 50 : 100,
                          maxPlayers: code === 'mini' ? 64 : code === 'basic' ? 128 : code === 'standard' ? 256 : code === 'premium' ? 512 : 1000,
                          prizePool: code === 'mini' ? 4500 : code === 'basic' ? 9000 : code === 'standard' ? 22500 : code === 'premium' ? 45000 : 90000,
                        };
                        return (
                          <td key={code} className="px-3 py-3 text-center">
                            <div className={`p-2.5 rounded-xl border transition-all space-y-1.5 ${
                              enabled
                                ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                                : 'bg-slate-900/40 border-slate-800 text-slate-500 opacity-60'
                            }`}>
                              <button
                                onClick={() => handleToggleGameTier(g.id, code)}
                                className={`w-full py-1 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                                  enabled
                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
                                }`}
                              >
                                {enabled ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                                <span>{enabled ? 'ENABLED' : 'DISABLED'}</span>
                              </button>
                              <div className="text-[10px] font-mono space-y-0.5 pt-0.5">
                                <div className="flex justify-between items-center text-slate-400">
                                  <span>Fee:</span>
                                  <span className="font-bold text-amber-400">🪙{tierConfig.entryFee}</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-400">
                                  <span>Max:</span>
                                  <span className="font-bold text-white">{tierConfig.maxPlayers}</span>
                                </div>
                                <div className="flex justify-between items-center text-slate-400">
                                  <span>Prize:</span>
                                  <span className="font-bold text-purple-300">🪙{tierConfig.prizePool.toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODALS */}
      {/* ===================================================================== */}

      {/* 1. Pause Scheduler Confirmation Modal */}
      {showPauseConfirm && (
        <Modal
          isOpen={showPauseConfirm}
          onClose={() => setShowPauseConfirm(false)}
          title={schedulerInfo?.isPaused ? 'Resume Hourly Scheduler?' : 'Pause Hourly Scheduler?'}
        >
          <div className="space-y-4 text-xs text-slate-300">
            <p>
              {schedulerInfo?.isPaused
                ? 'Resuming the scheduler will immediately start creating hourly tournaments from the next upcoming clock hour.'
                : 'Pausing the scheduler will stop automatic tournament creation at each clock hour. All currently running and registered tournaments will continue to run normally.'}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowPauseConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant={schedulerInfo?.isPaused ? 'primary' : 'danger'}
                size="sm"
                onClick={handleToggleScheduler}
                className="font-bold"
              >
                {schedulerInfo?.isPaused ? 'Confirm Resume' : 'Confirm Pause'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 2. Edit Tier Configuration Modal */}
      {editingTier && (
        <Modal
          isOpen={Boolean(editingTier)}
          onClose={() => setEditingTier(null)}
          title={`Configure ${editingTier.name} Tier`}
        >
          <form onSubmit={handleSaveTier} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-300 mb-1">Tier Name</label>
              <input
                type="text"
                value={editingTier.name}
                onChange={(e) => setEditingTier({ ...editingTier, name: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Entry Fee (Coins)</label>
                <input
                  type="number"
                  min="0"
                  value={editingTier.entryFee}
                  onChange={(e) => setEditingTier({ ...editingTier, entryFee: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white"
                  required
                />
              </div>
              <div>
                <label className="block font-bold text-slate-300 mb-1">Max Players</label>
                <input
                  type="number"
                  min="2"
                  max="10000"
                  value={editingTier.maxPlayers}
                  onChange={(e) => setEditingTier({ ...editingTier, maxPlayers: Math.max(2, parseInt(e.target.value) || 2) })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-300 mb-1">Prize Pool (Coins)</label>
              <input
                type="number"
                min="0"
                value={editingTier.prizePool}
                onChange={(e) => setEditingTier({ ...editingTier, prizePool: Math.max(0, parseInt(e.target.value) || 0) })}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white"
                required
              />
            </div>

            {/* Dynamic Prize Preview in Modal */}
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-1 text-[11px]">
              <span className="font-bold text-slate-400 block mb-1">Prize Distribution Preview (100%)</span>
              <div className="flex justify-between text-slate-300">
                <span>1st (50%):</span>
                <span className="font-mono font-bold text-emerald-400">🪙 {Math.round(editingTier.prizePool * 0.5).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>2nd (25%):</span>
                <span className="font-mono text-slate-300">🪙 {Math.round(editingTier.prizePool * 0.25).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>3rd (15%):</span>
                <span className="font-mono text-slate-300">🪙 {Math.round(editingTier.prizePool * 0.15).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>4th (10%):</span>
                <span className="font-mono text-slate-300">🪙 {Math.round(editingTier.prizePool * 0.1).toLocaleString()}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="tierActiveCheck"
                checked={editingTier.isActive}
                onChange={(e) => setEditingTier({ ...editingTier, isActive: e.target.checked })}
                className="rounded border-slate-700 bg-slate-900"
              />
              <label htmlFor="tierActiveCheck" className="text-xs font-bold text-slate-300 cursor-pointer">
                Enable Tier for Automatic Hourly Scheduling
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditingTier(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" className="font-bold">
                Save Configuration
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* 3. Exceptional Tournament Creation Modal */}
      {showCreateModal && (
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Create Exceptional Tournament"
        >
          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-300 mb-1">Game</label>
              <select
                value={form.gameId}
                onChange={(e) => setForm({ ...form, gameId: e.target.value as GameId })}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white"
              >
                {GAME_DEFINITIONS.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-300 mb-1">Tournament Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g., Saturday Snooker Championship"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Entry Fee (Coins)</label>
                <input
                  type="number"
                  min="0"
                  value={form.entryFee}
                  onChange={(e) => setForm({ ...form, entryFee: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-300 mb-1">Prize Pool (Coins)</label>
                <input
                  type="number"
                  min="0"
                  value={form.prizePool}
                  onChange={(e) => setForm({ ...form, prizePool: Math.max(0, parseInt(e.target.value) || 0) })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Max Players</label>
                <input
                  type="number"
                  min="2"
                  max="10000"
                  value={form.maxPlayers}
                  onChange={(e) => setForm({ ...form, maxPlayers: Math.max(2, parseInt(e.target.value) || 2) })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-300 mb-1">Start Time</label>
                <input
                  type="datetime-local"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white"
                  required
                />
              </div>
            </div>

            {/* Dynamic Prize Preview in Modal */}
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-1 text-[11px]">
              <span className="font-bold text-slate-400 block mb-1">Prize Distribution (50% / 25% / 15% / 10%)</span>
              <div className="flex justify-between text-slate-300">
                <span>1st:</span>
                <span className="font-mono font-bold text-emerald-400">🪙 {Math.round(form.prizePool * 0.5).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>2nd:</span>
                <span className="font-mono text-slate-300">🪙 {Math.round(form.prizePool * 0.25).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>3rd:</span>
                <span className="font-mono text-slate-300">🪙 {Math.round(form.prizePool * 0.15).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>4th:</span>
                <span className="font-mono text-slate-300">🪙 {Math.round(form.prizePool * 0.1).toLocaleString()}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isSubmitting}
                onClick={handleCreate}
                className="font-bold"
              >
                {isSubmitting ? 'Creating...' : 'Create Tournament'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Report Generator & CSV Export Modal */}
      {showReportModal && (
        <Modal
          isOpen={showReportModal}
          onClose={() => { setShowReportModal(false); setGeneratedReport(null); }}
          title="📊 Tournament Report Generator & Sanitized Export"
          size="lg"
        >
          <div className="space-y-4 text-xs">
            <p className="text-slate-400">
              Generate authoritative operational reports and export sanitized CSV data. No authentication tokens or sensitive user credentials are included.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Report Category</label>
                <select
                  value={reportType}
                  onChange={(e) => { setReportType(e.target.value as TournamentReportType); setGeneratedReport(null); }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white"
                >
                  <option value="TOURNAMENT">🏆 Tournaments Master Report</option>
                  <option value="FINANCIAL">💰 Financial & Ledger Reconciliation</option>
                  <option value="PLAYER_PARTICIPATION">👥 Player Participation Cohort</option>
                  <option value="SETTLEMENT">⚖️ Prize Settlement & Payouts</option>
                  <option value="NOTIFICATION">📨 Email & In-App Notification Logs</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Timeframe Scope</label>
                <select
                  value={reportTimeFilter}
                  onChange={(e) => { setReportTimeFilter(e.target.value as TournamentAnalyticsTimeFilter); setGeneratedReport(null); }}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white"
                >
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="last7days">Last 7 Days</option>
                  <option value="last30days">Last 30 Days</option>
                  <option value="thismonth">This Month</option>
                  <option value="custom">Custom Date Range</option>
                </select>
              </div>
            </div>

            {reportTimeFilter === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-400 mb-1">From Date</label>
                  <input
                    type="date"
                    value={reportFromDate}
                    onChange={(e) => setReportFromDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 mb-1">To Date</label>
                  <input
                    type="date"
                    value={reportToDate}
                    onChange={(e) => setReportToDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2 text-xs text-white"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Game Filter</label>
                <select
                  value={reportGame}
                  onChange={(e) => setReportGame(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white"
                >
                  <option value="ALL">All 10 Games</option>
                  {GAME_DEFINITIONS.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Tier Filter</label>
                <select
                  value={reportTier}
                  onChange={(e) => setReportTier(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white"
                >
                  <option value="ALL">All 5 Tiers</option>
                  <option value="mini">🟢 Mini (5🪙)</option>
                  <option value="basic">🔵 Basic (10🪙)</option>
                  <option value="standard">🟣 Standard (25🪙)</option>
                  <option value="premium">🟠 Premium (50🪙)</option>
                  <option value="pro">🔴 Pro (100🪙)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Status Filter</label>
                <select
                  value={reportStatus}
                  onChange={(e) => setReportStatus(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="COMPLETED">Completed / Settled</option>
                  <option value="IN_PROGRESS">Live / In Progress</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </div>

            {/* Preview Output */}
            {generatedReport && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span>Preview ({generatedReport.rows.length} rows)</span>
                  <span className="text-slate-500 font-mono text-[10px]">
                    Generated: {new Date(generatedReport.generatedAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="max-h-56 overflow-auto rounded-lg border border-slate-800 text-[11px]">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-900 text-slate-400">
                        {generatedReport.headers.map((h) => (
                          <th key={h} className="p-2 border-b border-slate-800 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {generatedReport.rows.slice(0, 10).map((row, i) => (
                        <tr key={i} className="hover:bg-slate-900/50 border-b border-slate-900">
                          {generatedReport.headers.map((h) => (
                            <td key={h} className="p-2 whitespace-nowrap text-slate-300 font-mono">
                              {String(row[h] ?? '—')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {generatedReport.rows.length > 10 && (
                  <p className="text-[10px] text-slate-500 text-right">Showing first 10 rows preview</p>
                )}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerateReport}
                disabled={isGeneratingReport}
                className="border-slate-700 bg-slate-900 text-xs font-bold gap-1.5"
              >
                {isGeneratingReport ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
                {isGeneratingReport ? 'Generating...' : 'Preview Report'}
              </Button>

              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowReportModal(false)}>
                  Close
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleDownloadReportCsv}
                  className="bg-emerald-600 hover:bg-emerald-500 font-black text-xs gap-1.5"
                >
                  <Download className="size-3.5" /> Download CSV Export
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Real-time Live Activity Stream Modal */}
      {showRealTimeDrawer && (
        <Modal
          isOpen={showRealTimeDrawer}
          onClose={() => setShowRealTimeDrawer(false)}
          title="⚡ Real-Time Operational Activity Stream"
        >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3 text-xs text-indigo-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`size-2 rounded-full ${socketStatus === 'connected' ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
                <span>Socket Channel: <strong>admin:analytics</strong></span>
              </div>
              <span className={`font-mono text-[11px] font-bold ${socketStatus === 'connected' ? 'text-emerald-400' : 'text-amber-400'}`}>
                Status: {socketStatus.toUpperCase()}
              </span>
            </div>

            {realTimeEvents.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                <Radio className="size-8 mx-auto mb-2 text-slate-600 animate-pulse" />
                No real-time events received yet in this active session.
              </div>
            ) : (
              <div className="space-y-2">
                {realTimeEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className={`p-3 rounded-xl border transition-all ${
                      evt.variant === 'danger'
                        ? 'bg-rose-950/20 border-rose-800/40 text-rose-200'
                        : evt.variant === 'warning'
                        ? 'bg-amber-950/20 border-amber-800/40 text-amber-200'
                        : evt.variant === 'success'
                        ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                        : 'bg-slate-900 border-slate-800 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="flex items-center gap-1.5">
                        <span className={`size-1.5 rounded-full ${
                          evt.variant === 'danger' ? 'bg-rose-400' : evt.variant === 'warning' ? 'bg-amber-400' : evt.variant === 'success' ? 'bg-emerald-400' : 'bg-indigo-400'
                        }`} />
                        {evt.title}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    {evt.details && (
                      <div className="text-[11px] text-slate-400 font-mono mt-1">
                        {evt.details}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 flex items-center justify-between border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRealTimeEvents([])}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Clear Stream Log
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowRealTimeDrawer(false)}
                className="text-xs font-bold"
              >
                Close Stream
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* DATA VALIDATION & FINANCIAL CROSS-CHECK AUDIT MODAL                       */}
      {/* ========================================================================= */}
      {showValidationModal && analyticsData?.validation && (
        <Modal
          isOpen={showValidationModal}
          onClose={() => setShowValidationModal(false)}
          title="Data Validation & Financial Integrity Scorecard"
          size="lg"
        >
          <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-1">
            {/* Overall Status Banner */}
            <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
              analyticsData.validation.status === 'CRITICAL_INCONSISTENCY'
                ? 'bg-rose-950/40 border-rose-800 text-rose-200'
                : analyticsData.validation.status === 'NEEDS_REVIEW'
                ? 'bg-amber-950/40 border-amber-800 text-amber-200'
                : 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
            }`}>
              <div className="flex items-center gap-3">
                <Shield className="size-6 shrink-0" />
                <div>
                  <div className="text-sm font-black uppercase tracking-wider">
                    Status: {analyticsData.validation.status === 'VALID' ? 'VALID & BALANCED' : 'NEEDS REVIEW'}
                  </div>
                  <div className="text-xs text-slate-300 mt-0.5">
                    Checked {analyticsData.validation.totalCheckedTournaments} tournaments, {analyticsData.validation.totalCheckedRegistrations} registrations, {analyticsData.validation.totalCheckedMatches} matches, {analyticsData.validation.totalCheckedPrizes} prizes, and {analyticsData.validation.totalCheckedRefunds} refunds against {analyticsData.validation.totalCheckedTransactions} ledger transactions.
                  </div>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleRunLiveAudit}
                disabled={isValidatingAudit}
                className="shrink-0 text-xs font-bold"
              >
                <RefreshCw className={`size-3.5 mr-1 ${isValidatingAudit ? 'animate-spin' : ''}`} />
                Live Re-Check
              </Button>
            </div>

            {/* Metrics Checklist Scorecard */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Integrity Metrics Verification</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/80">
                  <div className="text-[11px] font-bold text-slate-400">Tournament Counts</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {analyticsData.validation.metrics.tournamentCountMatches ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-emerald-400">
                        <CheckCircle2 className="size-3.5" /> Matched
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-bold text-rose-400">
                        <XCircle className="size-3.5" /> Discrepancy
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/80">
                  <div className="text-[11px] font-bold text-slate-400">Registration Counts</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {analyticsData.validation.metrics.registrationCountMatches ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-emerald-400">
                        <CheckCircle2 className="size-3.5" /> Matched
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-bold text-rose-400">
                        <XCircle className="size-3.5" /> Discrepancy
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/80">
                  <div className="text-[11px] font-bold text-slate-400">Entry Fee Ledger</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {analyticsData.validation.metrics.entryFeeTotalMatches ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-emerald-400">
                        <CheckCircle2 className="size-3.5" /> Balanced
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-bold text-amber-400">
                        <AlertTriangle className="size-3.5" /> Unbalanced
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/80">
                  <div className="text-[11px] font-bold text-slate-400">Prize Distributions</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {analyticsData.validation.metrics.prizeTotalMatches ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-emerald-400">
                        <CheckCircle2 className="size-3.5" /> Matched
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-bold text-rose-400">
                        <XCircle className="size-3.5" /> Discrepancy
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/80">
                  <div className="text-[11px] font-bold text-slate-400">Refund Totals</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {analyticsData.validation.metrics.refundTotalMatches ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-emerald-400">
                        <CheckCircle2 className="size-3.5" /> 100% Credited
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-bold text-rose-400">
                        <XCircle className="size-3.5" /> Missing
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/80">
                  <div className="text-[11px] font-bold text-slate-400">Settlement Ledger</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {analyticsData.validation.metrics.settlementTotalMatches ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-emerald-400">
                        <CheckCircle2 className="size-3.5" /> Verified
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-bold text-amber-400">
                        <AlertTriangle className="size-3.5" /> Unverified
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/80">
                  <div className="text-[11px] font-bold text-slate-400">Match Slots & Scores</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {analyticsData.validation.metrics.matchCountMatches ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-emerald-400">
                        <CheckCircle2 className="size-3.5" /> Non-negative
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-bold text-amber-400">
                        <AlertTriangle className="size-3.5" /> Negative Scores
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/80">
                  <div className="text-[11px] font-bold text-slate-400">Financial Ledger</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {analyticsData.validation.metrics.financialLedgerBalanced ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-emerald-400">
                        <CheckCircle2 className="size-3.5" /> Balanced
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-bold text-rose-400">
                        <XCircle className="size-3.5" /> Inconsistent
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Inconsistencies List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Detected Discrepancies ({analyticsData.validation.inconsistencies.length})
                </h4>
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  {(['ALL', 'CRITICAL', 'WARNING', 'FINANCIAL', 'REGISTRATION', 'PRIZE', 'REFUND'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setValidationFilterTab(tab)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                        validationFilterTab === tab
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {analyticsData.validation.inconsistencies.length === 0 ? (
                <div className="text-center py-10 rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-4">
                  <CheckCircle2 className="size-8 text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm font-bold text-white">No Data Inconsistencies Found</p>
                  <p className="text-xs text-slate-400 mt-0.5">All tournament records, registrations, and wallet transactions are completely in sync.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {analyticsData.validation.inconsistencies
                    .filter((item) => {
                      if (validationFilterTab === 'ALL') return true;
                      if (validationFilterTab === 'CRITICAL' || validationFilterTab === 'WARNING') return item.severity === validationFilterTab;
                      return item.category === validationFilterTab;
                    })
                    .map((item) => (
                      <div
                        key={item.id}
                        className={`p-3.5 rounded-xl border space-y-1.5 ${
                          item.severity === 'CRITICAL'
                            ? 'border-rose-800/60 bg-rose-950/20 text-rose-200'
                            : item.severity === 'WARNING'
                            ? 'border-amber-800/60 bg-amber-950/20 text-amber-200'
                            : 'border-slate-800 bg-slate-900 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                              item.severity === 'CRITICAL' ? 'bg-rose-500 text-white' : item.severity === 'WARNING' ? 'bg-amber-500 text-slate-950' : 'bg-slate-700 text-white'
                            }`}>
                              {item.severity}
                            </span>
                            <span className="font-mono text-xs font-bold text-white">{item.code}</span>
                            <span className="text-slate-400">·</span>
                            <span className="text-[11px] text-slate-400 uppercase font-semibold">{item.category}</span>
                          </div>
                          {item.tournamentId && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              Tourn: {item.tournamentTitle || item.tournamentId.slice(0, 12)}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-200 font-medium">{item.message}</p>

                        <div className="flex items-center justify-between gap-4 text-[11px] text-slate-400 pt-1 border-t border-slate-800/60 flex-wrap">
                          <div className="flex items-center gap-3 font-mono text-[10px]">
                            <span>Expected: <strong className="text-slate-200">{String(item.expected)}</strong></span>
                            <span>Actual: <strong className="text-slate-200">{String(item.actual)}</strong></span>
                            {item.discrepancy !== undefined && (
                              <span className="text-amber-400 font-bold">Diff: {String(item.discrepancy)}</span>
                            )}
                          </div>
                          <div className="text-indigo-300 font-medium text-[11px]">
                            Action: {item.suggestedAction}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <Button
                variant="primary"
                onClick={() => setShowValidationModal(false)}
                className="text-xs font-bold"
              >
                Close Audit Scorecard
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* DATA INTEGRITY ALERTS CENTER MODAL                                        */}
      {/* ========================================================================= */}
      {showAlertsDrawer && (
        <Modal
          isOpen={showAlertsDrawer}
          onClose={() => setShowAlertsDrawer(false)}
          title="Data Integrity Alerts Center"
          size="lg"
        >
          <div className="space-y-5 max-h-[80vh] overflow-y-auto pr-1">
            {/* Summary Counters */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div className="p-3 rounded-xl border border-rose-800/40 bg-rose-950/20 text-rose-300">
                <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Critical</div>
                <div className="text-xl font-black">{alertsStats.criticalCount}</div>
              </div>
              <div className="p-3 rounded-xl border border-amber-800/40 bg-amber-950/20 text-amber-300">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Open Alerts</div>
                <div className="text-xl font-black">{alertsStats.openCount}</div>
              </div>
              <div className="p-3 rounded-xl border border-indigo-800/40 bg-indigo-950/20 text-indigo-300">
                <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Under Review</div>
                <div className="text-xl font-black">{alertsStats.underReviewCount}</div>
              </div>
              <div className="p-3 rounded-xl border border-emerald-800/40 bg-emerald-950/20 text-emerald-300">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Resolved</div>
                <div className="text-xl font-black">{alertsStats.resolvedCount}</div>
              </div>
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-900 text-slate-300">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Tracked</div>
                <div className="text-xl font-black">{alertsStats.total}</div>
              </div>
            </div>

            {/* Filter Toolbar & Actions */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-slate-400 mr-1">Status:</span>
                {(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'ALL'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => {
                      setAlertFilterStatus(st);
                      setTimeout(loadIntegrityAlerts, 0);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      alertFilterStatus === st
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {st === 'ALL' ? 'All' : st.replace('_', ' ')}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleScanIntegrityAlerts}
                  disabled={isScanningAlerts}
                  className="text-xs font-bold"
                >
                  <RefreshCw className={`size-3.5 mr-1 ${isScanningAlerts ? 'animate-spin' : ''}`} />
                  Run Integrity Scan
                </Button>
              </div>
            </div>

            {/* Alerts List */}
            {isAlertsLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="size-6 animate-spin text-indigo-400 mb-2" />
                <p className="text-xs text-slate-400">Loading integrity alerts...</p>
              </div>
            ) : alertsList.length === 0 ? (
              <div className="text-center py-12 rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-6">
                <CheckCircle2 className="size-10 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-white">No {alertFilterStatus} Integrity Alerts</p>
                <p className="text-xs text-slate-400 mt-1">All tournament ledger entries, registrations, prizes, and refunds are consistent.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {alertsList.map((alert) => (
                  <div
                    key={alert.id || alert.alertId}
                    className={`p-4 rounded-2xl border space-y-2 transition-all ${
                      alert.status === 'RESOLVED'
                        ? 'border-emerald-800/40 bg-emerald-950/10 opacity-75'
                        : alert.severity === 'CRITICAL'
                        ? 'border-rose-800/60 bg-rose-950/20'
                        : alert.severity === 'HIGH'
                        ? 'border-amber-800/60 bg-amber-950/20'
                        : 'border-slate-800 bg-slate-900/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                          alert.severity === 'CRITICAL'
                            ? 'bg-rose-500 text-white'
                            : alert.severity === 'HIGH'
                            ? 'bg-amber-500 text-slate-950'
                            : alert.severity === 'MEDIUM'
                            ? 'bg-yellow-500 text-slate-950'
                            : 'bg-slate-700 text-white'
                        }`}>
                          {alert.severity}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                          alert.status === 'RESOLVED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : alert.status === 'UNDER_REVIEW'
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        }`}>
                          {alert.status}
                        </span>
                        <span className="font-mono text-xs font-bold text-white">
                          {alert.issueType.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Detected: {new Date(alert.detectedAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block">Tournament</span>
                        <span className="text-slate-200 font-medium">
                          {alert.tournamentTitle || `Tournament #${alert.tournamentId.slice(-6)}`}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block">Game / Tier</span>
                        <span className="text-slate-200 font-medium uppercase">
                          {alert.gameId} · {alert.tier}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block">Affected Record</span>
                        <span className="text-slate-300 font-mono text-[11px] truncate block">
                          {alert.affectedRecord}
                        </span>
                      </div>
                    </div>

                    {alert.details && (
                      <p className="text-xs text-slate-300 pt-1 border-t border-slate-800/60 font-medium">
                        {alert.details}
                      </p>
                    )}

                    {alert.status === 'RESOLVED' && (
                      <div className="p-2.5 rounded-xl border border-emerald-800/40 bg-emerald-950/20 text-xs text-emerald-300 space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span>Resolved by Admin: {alert.resolvedBy || 'Admin'}</span>
                          {alert.resolvedAt && <span>{new Date(alert.resolvedAt).toLocaleString()}</span>}
                        </div>
                        {alert.resolutionNotes && (
                          <p className="text-[11px] text-emerald-200/90 italic">
                            Notes: {alert.resolutionNotes}
                          </p>
                        )}
                      </div>
                    )}

                    {alert.status !== 'RESOLVED' && (
                      <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800/60">
                        {alert.status === 'OPEN' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUpdateAlertStatus(alert.alertId || alert.id, 'UNDER_REVIEW')}
                            disabled={isUpdatingAlert}
                            className="text-xs font-bold text-indigo-300 hover:text-white"
                          >
                            Mark Under Review
                          </Button>
                        )}
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setSelectedAlertForResolve(alert);
                            setResolutionNotesInput('');
                          }}
                          disabled={isUpdatingAlert}
                          className="text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                          <CheckCircle2 className="size-3.5 mr-1" />
                          Mark as Resolved
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <Button
                variant="outline"
                onClick={() => setShowAlertsDrawer(false)}
                className="text-xs font-bold"
              >
                Close Alerts Center
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* RESOLVE ALERT MODAL                                                       */}
      {/* ========================================================================= */}
      {selectedAlertForResolve && (
        <Modal
          isOpen={!!selectedAlertForResolve}
          onClose={() => setSelectedAlertForResolve(null)}
          title="Resolve Data Integrity Alert"
          size="md"
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-300">
              You are marking alert <strong className="text-white font-mono">{selectedAlertForResolve.issueType}</strong> for tournament <strong className="text-white">{selectedAlertForResolve.tournamentTitle}</strong> as <strong>RESOLVED</strong>.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Resolution Audit Notes</label>
              <textarea
                value={resolutionNotesInput}
                onChange={(e) => setResolutionNotesInput(e.target.value)}
                placeholder="Describe actions taken or verified (e.g., manually verified ledger entries, issued missing refund via admin console)..."
                rows={3}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 p-2.5 text-xs text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedAlertForResolve(null)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleUpdateAlertStatus(selectedAlertForResolve.alertId || selectedAlertForResolve.id, 'RESOLVED', resolutionNotesInput)}
                disabled={isUpdatingAlert}
                className="text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {isUpdatingAlert ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <CheckCircle2 className="size-3.5 mr-1" />}
                Confirm Resolution
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default AdminTournamentsPage;

