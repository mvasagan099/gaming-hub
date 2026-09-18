import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Shield,
  Trophy,
  Swords,
  Users,
  DollarSign,
  Clock,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  Mail,
  Activity,
  Award,
  History,
  Timer,
  AlertOctagon,
  Eye,
  Coins,
} from 'lucide-react';
import type { TournamentStatus, TournamentRefundSummary, TournamentCancellationPreview } from '@gaming-hub/shared';
import { GAME_DEFINITIONS } from '@gaming-hub/shared';
import {
  adminApi,
  type AdminTournamentBracket,
  type TournamentControlCenterData,
  type ControlCenterMatch,
  type ControlCenterPlayer,
} from '../../services/api/enterprise';
import { useAdminTournamentStore } from '../../store/adminTournamentStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/Tabs';
import { Modal } from '../../components/ui/Modal';
import { AdminTournamentBracketView } from '../../components/admin/tournaments/AdminTournamentBracket';

const gameById = new Map<string, (typeof GAME_DEFINITIONS)[number]>(GAME_DEFINITIONS.map((g) => [g.id, g]));

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default' | 'accent' | 'outline'> = {
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

interface ActionDef {
  label: string;
  action: () => Promise<unknown>;
  variant: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  requiresConfirm?: boolean;
  confirmMessage?: string;
  disabled?: boolean;
}

export function AdminTournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<TournamentControlCenterData | null>(null);
  const [bracket, setBracket] = useState<AdminTournamentBracket | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Interactive Match Details & Override Modal State
  const [selectedMatch, setSelectedMatch] = useState<ControlCenterMatch | null>(null);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideWinnerId, setOverrideWinnerId] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [isOverrideSubmitting, setIsOverrideSubmitting] = useState(false);

  // Settlements State
  const [settlementSummary, setSettlementSummary] = useState<import('@gaming-hub/shared').TournamentSettlementSummary | null>(null);
  const [settlementStatusFilter, setSettlementStatusFilter] = useState<string>('ALL');
  const [showRetryModal, setShowRetryModal] = useState(false);
  const [retryTargetPrizeId, setRetryTargetPrizeId] = useState<string | undefined>(undefined);
  const [retryReason, setRetryReason] = useState('');
  const [isRetrySubmitting, setIsRetrySubmitting] = useState(false);

  // Refunds & Cancellation State
  const [refundSummary, setRefundSummary] = useState<TournamentRefundSummary | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellationPreview, setCancellationPreview] = useState<TournamentCancellationPreview | null>(null);
  const [isCancelPreviewLoading, setIsCancelPreviewLoading] = useState(false);
  const [cancelJustification, setCancelJustification] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [showRefundRetryModal, setShowRefundRetryModal] = useState(false);
  const [retryRefundTargetUserId, setRetryRefundTargetUserId] = useState<string | undefined>(undefined);
  const [retryRefundReason, setRetryRefundReason] = useState('');
  const [isRefundRetrySubmitting, setIsRefundRetrySubmitting] = useState(false);

  // Filters & Search
  const [matchRoundFilter, setMatchRoundFilter] = useState<string>('ALL');
  const [matchStatusFilter, setMatchStatusFilter] = useState<string>('ALL');
  const [matchSearch, setMatchSearch] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');

  // General Action Loading
  const [confirmAction, setConfirmAction] = useState<ActionDef | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const { connect, disconnect, events, connected } = useAdminTournamentStore();

  const loadControlCenter = useCallback(async () => {
    if (!id) return;
    try {
      const ccData = await adminApi.tournamentControlCenter(id);
      setData(ccData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tournament control center data');
    }
  }, [id]);

  const loadBracket = useCallback(async () => {
    if (!id) return;
    try {
      const bData = await adminApi.tournamentBracket(id);
      setBracket(bData);
    } catch {
      // Bracket may not be generated yet
    }
  }, [id]);

  const loadSettlements = useCallback(async () => {
    if (!id) return;
    try {
      const sData = await adminApi.tournamentSettlements(id, settlementStatusFilter);
      setSettlementSummary(sData);
    } catch {
      // Settlements may not exist yet if tournament is still early stage
    }
  }, [id, settlementStatusFilter]);

  const loadRefunds = useCallback(async () => {
    if (!id) return;
    try {
      const rData = await adminApi.tournamentRefunds(id);
      setRefundSummary(rData);
    } catch {
      // Refunds not applicable yet
    }
  }, [id]);

  const loadAll = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      await Promise.all([loadControlCenter(), loadBracket(), loadSettlements(), loadRefunds()]);
    } finally {
      setIsLoading(false);
    }
  }, [id, loadControlCenter, loadBracket, loadSettlements, loadRefunds]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (id) connect(id);
    return () => disconnect();
  }, [id, connect, disconnect]);

  useEffect(() => {
    if (events.length > 0) {
      loadControlCenter();
      if (activeTab === 'bracket') loadBracket();
    }
  }, [events.length, activeTab, loadControlCenter, loadBracket]);

  const flash = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  const executeAction = async (actionDef: ActionDef) => {
    setConfirmAction(null);
    setIsActionLoading(true);
    setError(null);
    try {
      await actionDef.action();
      flash(`${actionDef.label} executed successfully`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${actionDef.label} failed`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRunRecovery = async () => {
    setIsActionLoading(true);
    setError(null);
    try {
      await adminApi.recoverTournaments();
      flash('Crash-Safe Tournament State Recovery & Resume executed');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recovery run failed');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleOverrideResult = async () => {
    if (!id || !selectedMatch || !overrideWinnerId || !overrideReason.trim()) return;
    setIsOverrideSubmitting(true);
    setError(null);
    try {
      await adminApi.overrideTournamentResult(id, selectedMatch.slotId, overrideWinnerId, overrideReason.trim());
      flash('Administrative match result override applied and audited');
      setShowOverrideModal(false);
      setSelectedMatch(null);
      setOverrideReason('');
      setOverrideWinnerId('');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Result override failed');
    } finally {
      setIsOverrideSubmitting(false);
    }
  };

  const handleRetrySettlements = async () => {
    if (!id || !retryReason.trim()) return;
    setIsRetrySubmitting(true);
    setError(null);
    try {
      await adminApi.retryTournamentSettlements(id, retryReason.trim(), retryTargetPrizeId);
      flash('Tournament prize settlement retry processed successfully');
      setShowRetryModal(false);
      setRetryTargetPrizeId(undefined);
      setRetryReason('');
      await loadSettlements();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Settlement retry failed');
    } finally {
      setIsRetrySubmitting(false);
    }
  };

  const openCancelModal = async () => {
    if (!id) return;
    setIsCancelPreviewLoading(true);
    setShowCancelModal(true);
    setCancelJustification('');
    try {
      const preview = await adminApi.tournamentCancellationPreview(id);
      setCancellationPreview(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cancellation preview');
    } finally {
      setIsCancelPreviewLoading(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!id || !cancelJustification.trim()) return;
    setIsCancelling(true);
    setError(null);
    try {
      await adminApi.cancelTournament(id, cancelJustification.trim());
      flash('Tournament cancelled and refund processing initiated');
      setShowCancelModal(false);
      setCancelJustification('');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tournament cancellation failed');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRetryRefund = async () => {
    if (!id || !retryRefundReason.trim()) return;
    setIsRefundRetrySubmitting(true);
    setError(null);
    try {
      await adminApi.retryTournamentRefunds(id, retryRefundReason.trim(), retryRefundTargetUserId);
      flash('Tournament refund retry executed successfully');
      setShowRefundRetryModal(false);
      setRetryRefundTargetUserId(undefined);
      setRetryRefundReason('');
      await loadRefunds();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refund retry failed');
    } finally {
      setIsRefundRetrySubmitting(false);
    }
  };

  const getAvailableActions = (status: TournamentStatus): ActionDef[] => {
    const actions: ActionDef[] = [];
    if (!id) return actions;

    switch (status) {
      case 'DRAFT':
        actions.push({ label: 'Open Registration', variant: 'primary', action: () => adminApi.openRegistration(id) });
        actions.push({ label: 'Cancel Tournament', variant: 'danger', action: openCancelModal });
        break;
      case 'REGISTRATION_OPEN':
        actions.push({ label: 'Close Registration', variant: 'secondary', action: () => adminApi.closeRegistration(id) });
        actions.push({ label: 'Start Tournament', variant: 'primary', action: () => adminApi.startTournament(id) });
        actions.push({ label: 'Cancel Tournament', variant: 'danger', action: openCancelModal });
        break;
      case 'REGISTRATION_CLOSED':
      case 'UPCOMING':
        actions.push({ label: 'Start Tournament', variant: 'primary', action: () => adminApi.startTournament(id) });
        actions.push({ label: 'Cancel Tournament', variant: 'danger', action: openCancelModal });
        break;
      case 'STARTING':
      case 'IN_PROGRESS':
        actions.push({ label: 'Pause', variant: 'outline', action: () => adminApi.pauseTournament(id) });
        actions.push({ label: 'Cancel Tournament', variant: 'danger', action: openCancelModal });
        break;
      case 'PAUSED':
        actions.push({ label: 'Resume', variant: 'primary', action: () => adminApi.resumeTournament(id) });
        actions.push({ label: 'Cancel Tournament', variant: 'danger', action: openCancelModal });
        break;
      case 'COMPLETED':
      case 'ENDED':
        actions.push({ label: 'Settle Tournament', variant: 'primary', action: () => adminApi.settleTournament(id) });
        break;
    }
    return actions;
  };

  const playerMap = useMemo(() => {
    const map = new Map<string, { id: string; username: string; displayName: string }>();
    if (data?.players) {
      for (const p of data.players) {
        map.set(p.userId, { id: p.userId, username: p.username, displayName: p.displayName });
      }
    }
    return map;
  }, [data?.players]);

  const filteredMatches = useMemo(() => {
    if (!data?.matches) return [];
    return data.matches.filter((m) => {
      if (matchRoundFilter !== 'ALL' && m.roundNumber !== Number(matchRoundFilter)) return false;
      if (matchStatusFilter !== 'ALL') {
        if (matchStatusFilter === 'LIVE' && m.status !== 'IN_PROGRESS') return false;
        if (matchStatusFilter === 'COMPLETED' && m.status !== 'COMPLETED') return false;
        if (matchStatusFilter === 'WAITING' && m.status !== 'PENDING' && m.status !== 'READY') return false;
        if (matchStatusFilter === 'BYE' && !m.isBye) return false;
        if (matchStatusFilter === 'STUCK' && !m.isStuck) return false;
      }
      if (matchSearch.trim()) {
        const q = matchSearch.toLowerCase();
        const pAName = m.playerA?.displayName?.toLowerCase() ?? '';
        const pBName = m.playerB?.displayName?.toLowerCase() ?? '';
        const mId = m.matchId?.toLowerCase() ?? '';
        if (!pAName.includes(q) && !pBName.includes(q) && !mId.includes(q)) return false;
      }
      return true;
    });
  }, [data?.matches, matchRoundFilter, matchStatusFilter, matchSearch]);

  const filteredPlayers = useMemo(() => {
    if (!data?.players) return [];
    if (!playerSearch.trim()) return data.players;
    const q = playerSearch.toLowerCase();
    return data.players.filter(
      (p) =>
        p.displayName.toLowerCase().includes(q) ||
        p.username.toLowerCase().includes(q) ||
        p.userId.toLowerCase().includes(q) ||
        String(p.seed).includes(q),
    );
  }, [data?.players, playerSearch]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <Loader2 className="size-8 animate-spin text-indigo-500" />
        <p className="text-sm font-medium text-slate-500">Loading Tournament Control Center...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-20 text-center">
        <p className="text-slate-400">Tournament not found</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate('/admin/tournaments')}>
          <ArrowLeft className="size-4" /> Back to tournaments
        </Button>
      </div>
    );
  }

  const { tournament, summary, notifications, timeLimitMetrics, auditLogs } = data;
  const actions = getAvailableActions(tournament.status);
  const roundOptions = Array.from(new Set(data.matches.map((m) => m.roundNumber))).sort((a, b) => a - b);

  return (
    <div className="min-h-screen space-y-6 pb-12">
      {/* Top Breadcrumb & Control Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button
            onClick={() => navigate('/admin/tournaments')}
            className="hidden items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            <ArrowLeft className="size-3" /> Tournaments Control Center
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{tournament.title}</h1>
            <Badge variant={STATUS_VARIANT[tournament.status] ?? 'default'}>
              {tournament.status.replace(/_/g, ' ')}
            </Badge>
            <Badge variant={connected ? 'success' : 'outline'} className="text-xs">
              <span className="mr-1.5 inline-block size-2 rounded-full bg-emerald-500 animate-pulse" />
              {connected ? 'Real-Time Sync' : 'Polling'}
            </Badge>
            <Badge variant="outline" className="text-xs font-mono">
              v{tournament.stateVersion}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {gameById.get(tournament.gameId)?.name ?? tournament.gameId} · {tournament.format.replace(/_/g, ' ')} · Seeding: {tournament.seedMethod.replace(/_/g, ' ')}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((action) => (
            <Button
              key={action.label}
              variant={action.variant}
              loading={isActionLoading}
              onClick={() => {
                if (action.requiresConfirm) {
                  setConfirmAction(action);
                } else {
                  executeAction(action);
                }
              }}
            >
              {action.label}
            </Button>
          ))}
          <Button variant="outline" loading={isActionLoading} onClick={handleRunRecovery} title="Reconcile and recover active tournaments, deadlines, and round progressions">
            <RefreshCw className="size-4" /> Run Recovery
          </Button>
        </div>
      </div>

      {/* Alert Notices */}
      {successMessage && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0" />
          {successMessage}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-400 flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Live Summary Metric KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card className="bg-slate-900/40 backdrop-blur border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <Users className="size-4 text-indigo-400" /> Players
            </div>
            <p className="mt-2 text-2xl font-black text-slate-100">
              {summary.registeredPlayers} <span className="text-sm font-medium text-slate-500">/ {summary.maxPlayers}</span>
            </p>
            <p className="mt-1 text-xs text-slate-400">{summary.availableSlots} available slots</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 backdrop-blur border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <Trophy className="size-4 text-amber-400" /> Round
            </div>
            <p className="mt-2 text-2xl font-black text-slate-100">
              R{summary.currentRound} <span className="text-sm font-medium text-slate-500">/ R{summary.totalRounds}</span>
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {summary.remainingPlayers} active · {summary.eliminatedPlayers} eliminated
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 backdrop-blur border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <Activity className="size-4 text-emerald-400" /> Active Matches
            </div>
            <p className="mt-2 text-2xl font-black text-emerald-400">{summary.activeMatches}</p>
            <p className="mt-1 text-xs text-slate-400">{summary.completedMatches} completed</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 backdrop-blur border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <Timer className="size-4 text-rose-400" /> Time-Limit Matches
            </div>
            <p className="mt-2 text-2xl font-black text-slate-100">{summary.timeLimitMatches}</p>
            <p className="mt-1 text-xs text-slate-400">{timeLimitMetrics.timeLimitPercentage}% cap frequency</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 backdrop-blur border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <DollarSign className="size-4 text-teal-400" /> Prize Pool
            </div>
            <p className="mt-2 text-2xl font-black text-slate-100">{tournament.grossPool || tournament.prizePool}</p>
            <p className="mt-1 text-xs text-slate-400">Fee: {tournament.entryFee} coins</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 backdrop-blur border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <Shield className="size-4 text-sky-400" /> System Health
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              {summary.healthStatus === 'HEALTHY' ? (
                <>
                  <CheckCircle2 className="size-5 text-emerald-500" />
                  <span className="text-lg font-bold text-emerald-400">HEALTHY</span>
                </>
              ) : (
                <>
                  <AlertOctagon className="size-5 text-amber-500" />
                  <span className="text-lg font-bold text-amber-400">ATTENTION</span>
                </>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {summary.stuckMatches > 0 ? `${summary.stuckMatches} stuck matches` : 'All matches normal'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Control Center Tabs */}
      <Tabs value={activeTab} onChange={setActiveTab}>
        <TabsList className="bg-slate-900/80 p-1 border border-slate-800">
          <TabsTrigger value="overview">Overview & Metrics</TabsTrigger>
          <TabsTrigger value="matches">
            Live Matches ({data.matches.length})
            {summary.activeMatches > 0 && (
              <span className="ml-1.5 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                {summary.activeMatches}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="bracket">Interactive Bracket</TabsTrigger>
          <TabsTrigger value="registration">
            Registration & Seeding ({data.players.length})
          </TabsTrigger>
          <TabsTrigger value="settlements">
            Settlements
            {settlementSummary && settlementSummary.failedCount > 0 && (
              <span className="ml-1.5 rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-400">
                {settlementSummary.failedCount} Failed
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="refunds">
            Refunds & Cancellations
            {refundSummary && refundSummary.failedCount > 0 && (
              <span className="ml-1.5 rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-400">
                {refundSummary.failedCount} Failed
              </span>
            )}
            {refundSummary && refundSummary.overallRefundStatus === 'REFUNDED' && (
              <span className="ml-1.5 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                ✓
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="notifications">Email & Notifications</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        {/* ================================================================= */}
        {/* Tab 1: Overview & Metrics */}
        {/* ================================================================= */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Swords className="size-4 text-indigo-400" /> Tournament Specifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="divide-y divide-slate-800 text-sm">
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-400">Game Discipline</dt>
                    <dd className="font-semibold text-slate-200">{gameById.get(tournament.gameId)?.name ?? tournament.gameId}</dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-400">Tournament Format</dt>
                    <dd className="font-semibold text-slate-200">{tournament.format.replace(/_/g, ' ')}</dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-400">Seeding Strategy</dt>
                    <dd className="font-semibold text-slate-200">{tournament.seedMethod.replace(/_/g, ' ')}</dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-400">Match Limit</dt>
                    <dd className="font-semibold text-slate-200">10 Minutes Server-Authoritative</dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-400">Total Rounds</dt>
                    <dd className="font-semibold text-slate-200">{summary.totalRounds} Single-Elimination Rounds</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Clock className="size-4 text-amber-400" /> Schedule & Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="divide-y divide-slate-800 text-sm">
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-400">Tournament Start</dt>
                    <dd className="font-semibold text-slate-200">{new Date(tournament.startTime).toLocaleString()}</dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-400">Registration Closes</dt>
                    <dd className="font-semibold text-slate-200">
                      {tournament.registrationEndsAt ? new Date(tournament.registrationEndsAt).toLocaleString() : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-400">Ended At</dt>
                    <dd className="font-semibold text-slate-200">
                      {tournament.endTime ? new Date(tournament.endTime).toLocaleString() : 'In Progress / Open'}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="text-slate-400">Settled At</dt>
                    <dd className="font-semibold text-slate-200">
                      {tournament.settledAt ? new Date(tournament.settledAt).toLocaleString() : 'Unsettled'}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>

          {/* Time-Limit Cap Analytics Card */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Timer className="size-4 text-rose-400" /> 10-Minute Match Duration & Time-Limit Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-xs text-slate-400">Normal Completions</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-400">{timeLimitMetrics.normalCompletionCount}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-xs text-slate-400">10m Time-Limit Completions</p>
                  <p className="mt-1 text-2xl font-bold text-rose-400">{timeLimitMetrics.timeLimitCount}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-xs text-slate-400">Time-Limit Frequency</p>
                  <p className="mt-1 text-2xl font-bold text-indigo-400">{timeLimitMetrics.timeLimitPercentage}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================= */}
        {/* Tab 2: Live Matches Monitor */}
        {/* ================================================================= */}
        <TabsContent value="matches" className="mt-6 space-y-4">
          {/* Match Filter & Search Toolbar */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search player name, display name, match ID..."
                  value={matchSearch}
                  onChange={(e) => setMatchSearch(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 pl-9 pr-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Round Selector */}
              <select
                value={matchRoundFilter}
                onChange={(e) => setMatchRoundFilter(e.target.value)}
                className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-1.5 text-sm text-slate-200 focus:outline-none"
              >
                <option value="ALL">All Rounds</option>
                {roundOptions.map((r) => (
                  <option key={r} value={r}>
                    Round {r}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={matchStatusFilter}
                onChange={(e) => setMatchStatusFilter(e.target.value)}
                className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-1.5 text-sm text-slate-200 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="LIVE">Live Matches Only</option>
                <option value="COMPLETED">Completed</option>
                <option value="WAITING">Waiting / Ready</option>
                <option value="BYE">BYEs</option>
                <option value="STUCK">Stuck / Expired</option>
              </select>
            </CardContent>
          </Card>

          {/* Match Table */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-800 bg-slate-950/40">
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-4">Slot</th>
                      <th className="py-3 px-4">Player 1</th>
                      <th className="py-3 px-4">Player 2</th>
                      <th className="py-3 px-4 text-center">Score</th>
                      <th className="py-3 px-4">Status / Timer</th>
                      <th className="py-3 px-4">Winner</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredMatches.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-500">
                          No matches matching filter criteria
                        </td>
                      </tr>
                    ) : (
                      filteredMatches.map((m) => {
                        const isLive = m.status === 'IN_PROGRESS';
                        const minutesRemaining = m.remainingMs != null ? Math.floor(m.remainingMs / 60000) : null;
                        const secondsRemaining = m.remainingMs != null ? Math.floor((m.remainingMs % 60000) / 1000) : null;

                        return (
                          <tr key={m.slotId} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-3 px-4 font-mono text-xs text-slate-400">
                              R{m.roundNumber}·M{m.matchNumber}
                            </td>
                            <td className="py-3 px-4">
                              {m.playerA ? (
                                <div className="flex items-center gap-1.5 font-medium text-slate-200">
                                  {m.playerA.seed && (
                                    <span className="text-[10px] rounded bg-indigo-500/20 px-1 py-0.5 text-indigo-400 font-mono">
                                      #{m.playerA.seed}
                                    </span>
                                  )}
                                  <span>{m.playerA.displayName}</span>
                                </div>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {m.isBye ? (
                                <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30">
                                  BYE ADVANCEMENT
                                </Badge>
                              ) : m.playerB ? (
                                <div className="flex items-center gap-1.5 font-medium text-slate-200">
                                  {m.playerB.seed && (
                                    <span className="text-[10px] rounded bg-indigo-500/20 px-1 py-0.5 text-indigo-400 font-mono">
                                      #{m.playerB.seed}
                                    </span>
                                  )}
                                  <span>{m.playerB.displayName}</span>
                                </div>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center font-mono font-bold text-slate-200">
                              {m.playerA ? m.playerA.score : 0} - {m.playerB ? m.playerB.score : 0}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={
                                    m.isStuck ? 'danger' :
                                    isLive ? 'success' :
                                    m.status === 'COMPLETED' ? 'accent' : 'outline'
                                  }
                                >
                                  {m.isStuck ? 'STUCK' : isLive ? 'LIVE' : m.status}
                                </Badge>
                                {isLive && minutesRemaining != null && (
                                  <span className="text-xs font-mono text-emerald-400">
                                    {String(minutesRemaining).padStart(2, '0')}:{String(secondsRemaining).padStart(2, '0')}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              {m.winnerId ? (
                                <span className="font-semibold text-emerald-400">
                                  {m.winnerId === m.playerA?.id ? m.playerA?.displayName : m.playerB?.displayName}
                                </span>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedMatch(m)}
                                className="text-xs"
                              >
                                <Eye className="size-3.5 mr-1" /> Details
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================= */}
        {/* Tab 3: Interactive Bracket */}
        {/* ================================================================= */}
        <TabsContent value="bracket" className="mt-6">
          {bracket ? (
            <AdminTournamentBracketView bracket={bracket} playerMap={playerMap} />
          ) : (
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="py-12 text-center text-sm text-slate-400">
                Bracket will be generated when registration closes or tournament starts.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ================================================================= */}
        {/* Tab 4: Registration & Seeding */}
        {/* ================================================================= */}
        <TabsContent value="registration" className="mt-6 space-y-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search registered player by username, display name, user ID..."
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 pl-9 pr-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="text-right text-xs text-slate-400">
                <span className="font-bold text-slate-200">{filteredPlayers.length}</span> players registered
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-800 bg-slate-950/40">
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-4">Reg #</th>
                      <th className="py-3 px-4">Seed</th>
                      <th className="py-3 px-4">Player</th>
                      <th className="py-3 px-4">User ID</th>
                      <th className="py-3 px-4">Rating</th>
                      <th className="py-3 px-4">Registered At</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredPlayers.map((p) => (
                      <tr key={p.userId} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-indigo-400">#{p.registrationSequence}</td>
                        <td className="py-3 px-4 font-mono text-slate-300">{p.seed ? `#${p.seed}` : '—'}</td>
                        <td className="py-3 px-4 font-semibold text-slate-200">{p.displayName}</td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">{p.userId}</td>
                        <td className="py-3 px-4 font-mono text-amber-400">{p.rating}</td>
                        <td className="py-3 px-4 text-slate-400">{new Date(p.registeredAt).toLocaleString()}</td>
                        <td className="py-3 px-4">
                          <Badge
                            variant={
                              p.status === 'CHAMPION' ? 'success' :
                              p.status === 'ACTIVE' ? 'accent' :
                              p.status === 'ELIMINATED' ? 'danger' : 'outline'
                            }
                          >
                            {p.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================= */}
        {/* Tab 5: Settlements & Prize Distribution */}
        {/* ================================================================= */}
        <TabsContent value="settlements" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4 flex items-center gap-3">
                <Trophy className="size-6 text-amber-400" />
                <div>
                  <p className="text-xs text-slate-400">Prize Pool</p>
                  <p className="text-xl font-bold text-amber-400">
                    {(settlementSummary?.prizePool ?? data?.tournament.prizePool ?? 0).toLocaleString()} Coins
                  </p>
                  <p className="text-[10px] text-slate-500">{settlementSummary?.totalPrizesCount ?? 0} Prize Positions</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle2 className="size-6 text-emerald-400" />
                <div>
                  <p className="text-xs text-slate-400">Paid Out</p>
                  <p className="text-xl font-bold text-emerald-400">
                    {(settlementSummary?.totalPaidAmount ?? 0).toLocaleString()} Coins
                  </p>
                  <p className="text-[10px] text-slate-500">{settlementSummary?.completedCount ?? 0} Settled</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4 flex items-center gap-3">
                <Clock className="size-6 text-indigo-400" />
                <div>
                  <p className="text-xs text-slate-400">Pending / Processing</p>
                  <p className="text-xl font-bold text-indigo-300">{settlementSummary?.pendingCount ?? 0}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="size-6 text-rose-400" />
                <div>
                  <p className="text-xs text-slate-400">Failed / Retries</p>
                  <p className="text-xl font-bold text-rose-400">{settlementSummary?.failedCount ?? 0}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4 flex items-center gap-3">
                <Shield className="size-6 text-cyan-400" />
                <div>
                  <p className="text-xs text-slate-400">Settlement Status</p>
                  <Badge
                    variant={
                      settlementSummary?.overallSettlementStatus === 'SETTLED' ? 'success' :
                      settlementSummary?.overallSettlementStatus === 'PARTIALLY_SETTLED' ? 'warning' :
                      settlementSummary?.overallSettlementStatus === 'SETTLEMENT_FAILED' ? 'danger' :
                      settlementSummary?.overallSettlementStatus === 'PROCESSING' ? 'accent' : 'outline'
                    }
                    className="mt-1 font-bold text-xs"
                  >
                    {settlementSummary?.overallSettlementStatus ?? 'NOT_STARTED'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Coins className="size-5 text-amber-400" /> Prize Settlements Ledger
              </CardTitle>
              <div className="flex items-center gap-3">
                <select
                  value={settlementStatusFilter}
                  onChange={(e) => setSettlementStatusFilter(e.target.value)}
                  className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="COMPLETED">Completed / Paid</option>
                  <option value="PENDING">Pending</option>
                  <option value="FAILED">Failed</option>
                </select>
                {settlementSummary && settlementSummary.failedCount > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs"
                    onClick={() => {
                      setRetryTargetPrizeId(undefined);
                      setShowRetryModal(true);
                    }}
                  >
                    Retry Failed Settlements ({settlementSummary.failedCount})
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-800 bg-slate-950/40">
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-4">Rank</th>
                      <th className="py-3 px-4">Player</th>
                      <th className="py-3 px-4">Prize Amount</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Transaction Ref</th>
                      <th className="py-3 px-4">Paid / Attempted</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {!settlementSummary || settlementSummary.settlements.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          No prize settlements found
                        </td>
                      </tr>
                    ) : (
                      settlementSummary.settlements.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-800/30 transition-colors text-xs">
                          <td className="py-3 px-4 font-mono font-bold text-amber-400">
                            {s.rank === 1 ? '🥇 1st' : s.rank === 2 ? '🥈 2nd' : s.rank === 3 ? '🥉 3rd' : `#${s.rank}`}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-200">{s.displayName || s.username || s.userId}</div>
                            <div className="font-mono text-[10px] text-slate-500">{s.userId}</div>
                          </td>
                          <td className="py-3 px-4 font-bold text-amber-400 font-mono">
                            {s.prizeAmount.toLocaleString()} Coins
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant={
                                s.status === 'COMPLETED' || s.status === 'PAID' ? 'success' :
                                s.status === 'PROCESSING' ? 'accent' :
                                s.status === 'FAILED' ? 'danger' : 'outline'
                              }
                            >
                              {s.status}
                            </Badge>
                            {s.failureReason && (
                              <p className="mt-1 font-mono text-[10px] text-rose-400 truncate max-w-xs" title={s.failureReason}>
                                {s.failureReason}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                            {s.transactionId ?? '—'}
                          </td>
                          <td className="py-3 px-4 text-slate-400">
                            {s.paidAt ? new Date(s.paidAt).toLocaleString() : s.lastAttemptAt ? new Date(s.lastAttemptAt).toLocaleString() : '—'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {s.status === 'FAILED' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
                                onClick={() => {
                                  setRetryTargetPrizeId(s.id);
                                  setShowRetryModal(true);
                                }}
                              >
                                Retry
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================= */}
        {/* Tab 5b: Refunds & Cancellation Monitor */}
        {/* ================================================================= */}
        <TabsContent value="refunds" className="mt-6 space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4 flex items-center gap-3">
                <Users className="size-6 text-indigo-400" />
                <div>
                  <p className="text-xs text-slate-400">Registered Players</p>
                  <p className="text-xl font-bold text-slate-100">{refundSummary?.totalPlayersCount ?? data?.players.length ?? 0}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4 flex items-center gap-3">
                <DollarSign className="size-6 text-amber-400" />
                <div>
                  <p className="text-xs text-slate-400">Total Entry Collected</p>
                  <p className="text-xl font-bold text-amber-400">
                    {(refundSummary?.totalRefundableAmount ?? (data?.players.length ?? 0) * (data?.tournament.entryFee ?? 0)).toLocaleString()} Coins
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle2 className="size-6 text-emerald-400" />
                <div>
                  <p className="text-xs text-slate-400">Total Refunded</p>
                  <p className="text-xl font-bold text-emerald-400">
                    {(refundSummary?.totalRefundedAmount ?? 0).toLocaleString()} Coins
                  </p>
                  <p className="text-[10px] text-slate-500">{refundSummary?.completedCount ?? 0} Completed</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="size-6 text-rose-400" />
                <div>
                  <p className="text-xs text-slate-400">Failed Refunds</p>
                  <p className="text-xl font-bold text-rose-400">{refundSummary?.failedCount ?? 0}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4 flex items-center gap-3">
                <Shield className="size-6 text-cyan-400" />
                <div>
                  <p className="text-xs text-slate-400">Refund Status</p>
                  <Badge
                    variant={
                      refundSummary?.overallRefundStatus === 'REFUNDED' ? 'success' :
                      refundSummary?.overallRefundStatus === 'PARTIALLY_REFUNDED' ? 'warning' :
                      refundSummary?.overallRefundStatus === 'FAILED' ? 'danger' :
                      refundSummary?.overallRefundStatus === 'PROCESSING' ? 'accent' : 'outline'
                    }
                    className="mt-1 font-bold text-xs"
                  >
                    {refundSummary?.overallRefundStatus ?? 'NOT_REQUIRED'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Coins className="size-5 text-emerald-400" /> Tournament Entry Fee Refund Monitor
              </CardTitle>
              <div className="flex items-center gap-3">
                {refundSummary && refundSummary.failedCount > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs"
                    onClick={() => {
                      setRetryRefundTargetUserId(undefined);
                      setShowRefundRetryModal(true);
                    }}
                  >
                    Retry Failed Refunds ({refundSummary.failedCount})
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="text-xs" onClick={loadRefunds}>
                  <RefreshCw className="size-3.5 mr-1" /> Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-800 bg-slate-950/40">
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-4">Player</th>
                      <th className="py-3 px-4">Entry Fee Charged</th>
                      <th className="py-3 px-4">Refund Amount</th>
                      <th className="py-3 px-4">Refund Status</th>
                      <th className="py-3 px-4">Original Entry Debit Tx</th>
                      <th className="py-3 px-4">Refund Credit Tx</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {!refundSummary || refundSummary.refunds.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          {data.tournament.entryFee === 0 ? 'Free tournament — no entry fee refunds required' : 'No refund records recorded for this tournament'}
                        </td>
                      </tr>
                    ) : (
                      refundSummary.refunds.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-800/30 transition-colors text-xs">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-200">{r.displayName || r.username || r.userId}</div>
                            <div className="font-mono text-[10px] text-slate-500">{r.userId}</div>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-300 font-medium">
                            {r.entryFee} Coins
                          </td>
                          <td className="py-3 px-4 font-bold text-emerald-400 font-mono">
                            {r.refundAmount} Coins
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant={
                                r.status === 'REFUNDED' ? 'success' :
                                r.status === 'PROCESSING' ? 'accent' :
                                r.status === 'FAILED' ? 'danger' : 'outline'
                              }
                            >
                              {r.status}
                            </Badge>
                            {r.failureReason && (
                              <p className="mt-1 font-mono text-[10px] text-rose-400 truncate max-w-xs" title={r.failureReason}>
                                {r.failureReason}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                            {r.originalTransactionId ?? '—'}
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-emerald-400">
                            {r.refundTransactionId ?? '—'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {r.status === 'FAILED' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
                                onClick={() => {
                                  setRetryRefundTargetUserId(r.userId);
                                  setShowRefundRetryModal(true);
                                }}
                              >
                                Retry
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================= */}
        {/* Tab 6: Email & Notifications */}
        {/* ================================================================= */}
        <TabsContent value="notifications" className="mt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4 flex items-center gap-3">
                <Mail className="size-6 text-indigo-400" />
                <div>
                  <p className="text-xs text-slate-400">Total Notifications</p>
                  <p className="text-xl font-bold text-slate-100">{notifications.totalSent}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle2 className="size-6 text-emerald-400" />
                <div>
                  <p className="text-xs text-slate-400">Successfully Delivered</p>
                  <p className="text-xl font-bold text-emerald-400">{notifications.totalSent}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="size-6 text-amber-400" />
                <div>
                  <p className="text-xs text-slate-400">Failed / Retried</p>
                  <p className="text-xl font-bold text-slate-100">0</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-base font-bold">Recent Notification Dispatch Log</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-800 bg-slate-950/40">
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-4">Event Type</th>
                      <th className="py-3 px-4">Recipient</th>
                      <th className="py-3 px-4">Idempotency Reference</th>
                      <th className="py-3 px-4">Dispatched At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {notifications.recent.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500">
                          No notifications recorded yet
                        </td>
                      </tr>
                    ) : (
                      notifications.recent.map((n, idx) => (
                        <tr key={idx} className="text-xs">
                          <td className="py-2.5 px-4 font-mono font-bold text-indigo-400">{n.eventType}</td>
                          <td className="py-2.5 px-4 font-mono text-slate-300">{n.playerId}</td>
                          <td className="py-2.5 px-4 font-mono text-slate-500">{n.referenceId}</td>
                          <td className="py-2.5 px-4 text-slate-400">{new Date(n.sentAt).toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================= */}
        {/* Tab 6: Audit Log */}
        {/* ================================================================= */}
        <TabsContent value="audit" className="mt-6 space-y-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <History className="size-4 text-indigo-400" /> Tournament Activity Audit Trail
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-800 bg-slate-950/40">
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-500">
                          No audit log entries for this tournament
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log.id} className="text-xs">
                          <td className="py-2.5 px-4 text-slate-400">{new Date(log.createdAt).toLocaleString()}</td>
                          <td className="py-2.5 px-4 font-mono font-bold text-indigo-400">{log.action}</td>
                          <td className="py-2.5 px-4 font-mono text-slate-300">
                            {log.actorType} {log.actorId ? `(${log.actorId.slice(0, 8)})` : ''}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-400">
                            {JSON.stringify(log.meta)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Match Details Modal */}
      {selectedMatch && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedMatch(null)}
          title={`Match Details: R${selectedMatch.roundNumber}·M${selectedMatch.matchNumber}`}
        >
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div>
                <p className="text-xs text-slate-400">Player A</p>
                <p className="font-bold text-slate-200">{selectedMatch.playerA?.displayName ?? '—'}</p>
                <p className="text-xs text-slate-400">Score: {selectedMatch.playerA?.score ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Player B</p>
                <p className="font-bold text-slate-200">{selectedMatch.playerB?.displayName ?? (selectedMatch.isBye ? 'BYE' : '—')}</p>
                <p className="text-xs text-slate-400">Score: {selectedMatch.playerB?.score ?? 0}</p>
              </div>
            </div>

            <dl className="divide-y divide-slate-800 text-xs">
              <div className="flex justify-between py-2">
                <dt className="text-slate-400">Status</dt>
                <dd className="font-bold text-slate-200">{selectedMatch.status}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-slate-400">Match ID</dt>
                <dd className="font-mono text-slate-300">{selectedMatch.matchId ?? 'Not spawned yet'}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-slate-400">Started At</dt>
                <dd className="text-slate-300">{selectedMatch.startedAt ? new Date(selectedMatch.startedAt).toLocaleString() : '—'}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-slate-400">Deadline</dt>
                <dd className="text-slate-300">{selectedMatch.matchDeadline ? new Date(selectedMatch.matchDeadline).toLocaleString() : '—'}</dd>
              </div>
              {selectedMatch.resultReason && (
                <div className="flex justify-between py-2">
                  <dt className="text-slate-400">Result Reason</dt>
                  <dd className="font-semibold text-amber-400">{selectedMatch.resultReason}</dd>
                </div>
              )}
            </dl>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                className="text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
                onClick={() => {
                  setOverrideWinnerId(selectedMatch.playerA?.id ?? '');
                  setShowOverrideModal(true);
                }}
              >
                Emergency Override Result
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedMatch(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Emergency Override Modal */}
      {showOverrideModal && selectedMatch && (
        <Modal
          isOpen={true}
          onClose={() => setShowOverrideModal(false)}
          title="Emergency Match Result Override"
        >
          <div className="space-y-4 text-sm">
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs">
              ⚠️ <strong>Admin Audit Notice:</strong> This overrides match outcome, propagates the winner in the bracket, and creates a permanent audited log.
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Select Winner</label>
              <select
                value={overrideWinnerId}
                onChange={(e) => setOverrideWinnerId(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 p-2 text-sm text-slate-200 focus:outline-none"
              >
                {selectedMatch.playerA && (
                  <option value={selectedMatch.playerA.id}>
                    {selectedMatch.playerA.displayName} (Player A)
                  </option>
                )}
                {selectedMatch.playerB && (
                  <option value={selectedMatch.playerB.id}>
                    {selectedMatch.playerB.displayName} (Player B)
                  </option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Override Reason (Required)</label>
              <textarea
                placeholder="Specify the reason for this administrative intervention..."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 p-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button variant="ghost" onClick={() => setShowOverrideModal(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={isOverrideSubmitting}
                disabled={!overrideReason.trim()}
                onClick={handleOverrideResult}
              >
                Confirm Override
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <Modal
          isOpen={true}
          onClose={() => setConfirmAction(null)}
          title={`Confirm Action: ${confirmAction.label}`}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              {confirmAction.confirmMessage ?? `Are you sure you want to execute ${confirmAction.label}?`}
            </p>
            {confirmAction.label.toLowerCase().includes('cancel') && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Cancellation Reason</label>
                <input
                  type="text"
                  placeholder="Reason for cancellation..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 p-2 text-sm text-slate-200 focus:outline-none"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <Button variant="ghost" onClick={() => setConfirmAction(null)}>
                Cancel
              </Button>
              <Button
                variant={confirmAction.variant}
                loading={isActionLoading}
                onClick={() => executeAction(confirmAction)}
              >
                Proceed
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Retry Settlements Modal */}
      {showRetryModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowRetryModal(false)}
          title={retryTargetPrizeId ? "Retry Individual Prize Settlement" : "Retry All Failed Prize Settlements"}
        >
          <div className="space-y-4 text-sm">
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs">
              ⚠️ <strong>Safe Idempotent Execution:</strong> This will safely re-trigger settlement for failed or pending prizes. Already completed payouts are strictly protected from double-crediting.
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Administrative Justification Reason (Required)
              </label>
              <textarea
                placeholder="Reason for triggering prize settlement retry..."
                value={retryReason}
                onChange={(e) => setRetryReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 p-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button variant="ghost" onClick={() => setShowRetryModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={isRetrySubmitting}
                disabled={!retryReason.trim()}
                onClick={handleRetrySettlements}
              >
                Execute Retry
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Cancellation Confirmation & Preview Modal */}
      {showCancelModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowCancelModal(false)}
          title="Confirm Tournament Cancellation & Refund Protection"
        >
          <div className="space-y-4 text-sm">
            {isCancelPreviewLoading ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2">
                <Loader2 className="size-6 animate-spin text-rose-500" />
                <p className="text-xs text-slate-400">Loading cancellation financial preview...</p>
              </div>
            ) : cancellationPreview ? (
              <>
                {cancellationPreview.blockingReason ? (
                  <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs">
                    🚫 <strong>Cancellation Blocked:</strong> {cancellationPreview.blockingReason}
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs">
                    ⚠️ <strong>Irreversible Action:</strong> Cancelling this tournament will permanently stop it and automatically execute full entry fee refunds to all registered players via the authoritative coin wallet ledger.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div>
                    <span className="text-slate-400">Tournament:</span>
                    <p className="font-semibold text-slate-200">{cancellationPreview.title}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Current Status:</span>
                    <p className="font-semibold text-slate-200">{cancellationPreview.status}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Registered Players:</span>
                    <p className="font-semibold text-slate-200">
                      {cancellationPreview.registeredPlayers} / {cancellationPreview.maxPlayers} (Min: {cancellationPreview.minPlayers})
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Entry Fee:</span>
                    <p className="font-semibold text-slate-200">{cancellationPreview.entryFee} Coins</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Total Entry Collection:</span>
                    <p className="font-bold text-amber-400 font-mono">{cancellationPreview.totalEntryCollection.toLocaleString()} Coins</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Total Refundable Amount:</span>
                    <p className="font-bold text-emerald-400 font-mono">{cancellationPreview.totalRefundableAmount.toLocaleString()} Coins</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Administrative Cancellation Reason (Required)
                  </label>
                  <textarea
                    placeholder="e.g., Minimum players not reached / Technical maintenance / Event reschedule..."
                    value={cancelJustification}
                    onChange={(e) => setCancelJustification(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg bg-slate-950 border border-slate-800 p-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <Button variant="ghost" onClick={() => setShowCancelModal(false)}>
                    Close
                  </Button>
                  <Button
                    variant="danger"
                    loading={isCancelling}
                    disabled={!cancellationPreview.canCancel || !cancelJustification.trim()}
                    onClick={handleConfirmCancel}
                  >
                    Confirm Cancellation & Refund All
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </Modal>
      )}

      {/* Retry Refund Modal */}
      {showRefundRetryModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowRefundRetryModal(false)}
          title={retryRefundTargetUserId ? "Retry Individual Player Refund" : "Retry All Failed Refunds"}
        >
          <div className="space-y-4 text-sm">
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs">
              ⚠️ <strong>Idempotent Safe Execution:</strong> This will retry the refund transaction against the wallet ledger. Already refunded players are strictly protected from double credits.
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Administrative Justification Reason (Required)
              </label>
              <textarea
                placeholder="Reason for triggering refund retry..."
                value={retryRefundReason}
                onChange={(e) => setRetryRefundReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 p-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <Button variant="ghost" onClick={() => setShowRefundRetryModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={isRefundRetrySubmitting}
                disabled={!retryRefundReason.trim()}
                onClick={handleRetryRefund}
              >
                Execute Refund Retry
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
