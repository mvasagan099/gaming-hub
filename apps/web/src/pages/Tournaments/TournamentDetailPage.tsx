import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Trophy,
  Users,
  Swords,
  CalendarClock,
  Clock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Zap,
  XCircle,
  Play,
  Shield,
  DollarSign,
  Mail,
  Sparkles,
  Award,
  Video,
  ChevronRight,
  ChevronLeft,
  TrendingUp,
  Flame,
  Crown,
  Medal,
  Search,
  LogOut,
  AlertCircle,
  AlertOctagon,
  Gift,
} from 'lucide-react';
import {
  GAME_DEFINITIONS,
  TOURNAMENT_TIER_VISUALS,
  DEFAULT_TIER_PRIZE_DISTRIBUTION,
  type TournamentStatus,
  type TournamentLeaderboardResponse,
  type PrizeDistributionEntry,
} from '@gaming-hub/shared';
import { tournamentsApi } from '../../services/api/enterprise';
import { usePlayerTournamentStore } from '../../store/playerTournamentStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/Tabs';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/Skeleton';
import { PlayerBracketView } from '../../components/tournaments/PlayerBracketView';
import { DisputeReportModal } from '../../components/tournaments/DisputeReportModal';
import { TournamentTimeline } from '../../components/tournaments/TournamentTimeline';
import { ShieldAlert } from 'lucide-react';

const gameById = new Map(GAME_DEFINITIONS.map((g) => [g.id, g]));

const STATUS_BADGE: Record<
  string,
  { variant: 'success' | 'warning' | 'danger' | 'accent' | 'default' | 'outline'; label: string }
> = {
  DRAFT: { variant: 'outline', label: 'Draft' },
  REGISTRATION_OPEN: { variant: 'accent', label: 'Registration Open' },
  REGISTRATION_CLOSED: { variant: 'default', label: 'Registration Closed' },
  UPCOMING: { variant: 'default', label: 'Upcoming' },
  STARTING: { variant: 'warning', label: 'Starting Soon' },
  IN_PROGRESS: { variant: 'success', label: 'Live Now' },
  PAUSED: { variant: 'warning', label: 'Paused' },
  COMPLETED: { variant: 'accent', label: 'Completed' },
  SETTLING: { variant: 'warning', label: 'Settling' },
  SETTLED: { variant: 'success', label: 'Settled' },
  LIVE: { variant: 'success', label: 'Live Now' },
  CANCELLED: { variant: 'danger', label: 'Cancelled' },
};

const PLAYER_STATUS_BADGE: Record<
  string,
  { variant: 'success' | 'warning' | 'danger' | 'accent' | 'default' | 'outline'; label: string }
> = {
  REGISTERED: { variant: 'accent', label: '✓ Registered' },
  WAITING: { variant: 'warning', label: 'Waiting for Match' },
  MATCH_READY: { variant: 'accent', label: '🎮 Match Ready' },
  LIVE: { variant: 'success', label: 'Live Match 🔴' },
  ADVANCED: { variant: 'accent', label: 'Advanced ⭐' },
  ELIMINATED: { variant: 'danger', label: 'Eliminated' },
  WINNER: { variant: 'success', label: 'Champion 🏆' },
  COMPLETED: { variant: 'default', label: 'Completed' },
};

function formatCountdown(targetDate: string | null | undefined): string {
  if (!targetDate) return '';
  const diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) return '00:00:00';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function detectTier(title: string, entryFee: number): string {
  const t = title.toLowerCase();
  // IMPORTANT: check 'premium' BEFORE 'pro' — 'premium' contains the substring 'pro'
  if (t.includes('premium') || (entryFee >= 50 && entryFee < 100)) return 'premium';
  if (t.includes(' pro ') || t.startsWith('pro ') || t.endsWith(' pro') || t === 'pro' || entryFee >= 100) return 'pro';
  if (t.includes('standard') || (entryFee >= 25 && entryFee < 50)) return 'standard';
  if (t.includes('basic') || (entryFee >= 10 && entryFee < 25)) return 'basic';
  return 'mini';
}

function LiveCountdown({ target, label }: { target: string; label?: string }) {
  const [cd, setCd] = useState(() => formatCountdown(target));
  useEffect(() => {
    const update = () => setCd(formatCountdown(target));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [target]);

  const isExpired = cd === '00:00:00';

  return (
    <div className="flex items-center gap-1.5 font-mono">
      {label && <span className="text-slate-400 text-xs font-medium">{label}</span>}
      <span className={`text-sm font-black tabular-nums ${isExpired ? 'text-slate-500' : 'text-amber-300'}`}>
        {cd}
      </span>
    </div>
  );
}

function MatchDeadlineTimer({ deadline }: { deadline: string | null }) {
  const [timeLeft, setTimeLeft] = useState<string>('00:00');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!deadline) {
      setTimeLeft('10:00');
      return;
    }
    const update = () => {
      const diff = new Date(deadline).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('00:00');
        setIsExpired(true);
        return;
      }
      setIsExpired(false);
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  return (
    <div className="flex items-center gap-1.5 font-mono text-xs sm:text-sm font-black">
      <Clock className={`size-4 ${isExpired ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`} />
      <span className={isExpired ? 'text-rose-400' : 'text-amber-300'}>
        {timeLeft} {isExpired ? '(TIME EXPIRED)' : 'remaining'}
      </span>
    </div>
  );
}

interface RegistrationSuccessData {
  tournamentTitle: string;
  entryFee: number;
  startTime: string;
  registrationId: string;
  gameName: string;
}

export function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = usePlayerTournamentStore();
  const { detail, bracket, myStatus, currentMatch, dashboardData, walletBalance, isLoading, error, events, connected } =
    store;

  const [activeTab, setActiveTab] = useState('my-match');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [registrationSuccessData, setRegistrationSuccessData] = useState<RegistrationSuccessData | null>(null);
  const [disputeTargetMatch, setDisputeTargetMatch] = useState<{ matchId: string; roundNumber?: number } | null>(null);
  const [mySettlement, setMySettlement] = useState<any>(null);

  const [leaderboardData, setLeaderboardData] = useState<TournamentLeaderboardResponse | null>(null);
  const [leaderboardSearch, setLeaderboardSearch] = useState('');
  const [leaderboardStatus, setLeaderboardStatus] = useState('ALL');
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    if (!id) return;
    setIsLeaderboardLoading(true);
    try {
      const data = await tournamentsApi.leaderboardStandings(id, {
        page: leaderboardPage,
        pageSize: 25,
        search: leaderboardSearch.trim() || undefined,
        status: leaderboardStatus !== 'ALL' ? leaderboardStatus : undefined,
      });
      setLeaderboardData(data);
    } catch {
    } finally {
      setIsLeaderboardLoading(false);
    }
  }, [id, leaderboardPage, leaderboardSearch, leaderboardStatus]);

  useEffect(() => {
    if (!id) return;
    store.fetchAll(id);
    store.subscribe(id);
    tournamentsApi.settlement(id).then(setMySettlement).catch(() => undefined);
    fetchLeaderboard();
    return () => store.reset();
  }, [id, fetchLeaderboard]);

  const handleJoin = useCallback(async () => {
    if (!id || isJoining) return;
    setIsJoining(true);
    setJoinError(null);
    try {
      const res = await tournamentsApi.register(id);
      await store.fetchAll(id);
      setShowJoinModal(false);

      const gameName = gameById.get((detail?.gameId ?? '') as any)?.name ?? detail?.gameId ?? 'Match';
      setRegistrationSuccessData({
        tournamentTitle: detail?.title ?? 'Tournament',
        entryFee: res.entryFee ?? detail?.entryFee ?? 0,
        startTime: res.tournamentStartTime ?? detail?.startTime ?? new Date().toISOString(),
        registrationId: res.registrationId,
        gameName,
      });
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to join tournament');
    } finally {
      setIsJoining(false);
    }
  }, [id, isJoining, detail, store]);

  const handleEnterMatch = (matchId: string | null) => {
    if (!detail) return;
    if (matchId) {
      navigate(`/game/${detail.gameId}?matchId=${matchId}&tournamentId=${detail.id}`);
    } else {
      navigate(`/lobby/${detail.gameId}`);
    }
  };

  if (isLoading && !detail && !dashboardData) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-4">
        <Skeleton className="h-64 w-full rounded-3xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!detail && !dashboardData && !isLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Trophy className="size-14 text-slate-500" />
        <p className="text-lg font-bold text-slate-300">Tournament not found</p>
        <Button variant="ghost" onClick={() => navigate('/tournaments')} className="gap-2">
          <ArrowLeft className="size-4" /> Back to tournaments
        </Button>
      </div>
    );
  }

  const tourn = dashboardData?.tournament ?? {
    id: detail!.id,
    title: detail!.title,
    gameId: detail!.gameId,
    description: detail!.description,
    status: detail!.status,
    format: detail!.format,
    seedMethod: 'RANDOM',
    entryFee: detail!.entryFee,
    prizePool: detail!.prizePool,
    grossPool: detail!.grossPool || detail!.prizePool,
    minPlayers: detail!.minPlayers,
    maxPlayers: detail!.maxPlayers,
    registeredPlayers: detail!.registeredCount,
    availableSlots: Math.max(0, detail!.maxPlayers - detail!.registeredCount),
    currentRound: 1,
    totalRounds: bracket?.totalRounds ?? 1,
    remainingPlayers: detail!.registeredCount,
    startTime: detail!.startTime,
    stateVersion: detail!.stateVersion ?? 0,
    rules: {},
    prizeDistribution: detail!.prizeDistribution ?? [],
  };

  const pData = dashboardData?.player;
  const game = gameById.get(tourn.gameId as any);
  const tierCode = detectTier(tourn.title, tourn.entryFee);
  const vis = TOURNAMENT_TIER_VISUALS[tierCode] ?? TOURNAMENT_TIER_VISUALS.mini!;

  const statusInfo = STATUS_BADGE[tourn.status] ?? { variant: 'outline' as const, label: tourn.status };
  const playerStatus = pData?.status ?? (myStatus?.isRegistered ? (myStatus.eliminated ? 'ELIMINATED' : 'REGISTERED') : null);

  const isRegOpen = tourn.status === 'REGISTRATION_OPEN';
  const isLive = tourn.status === 'IN_PROGRESS' || tourn.status === 'LIVE';
  const isStarting = tourn.status === 'STARTING';
  const isCompleted = tourn.status === 'COMPLETED' || tourn.status === 'SETTLED';

  const isFull = tourn.registeredPlayers >= tourn.maxPlayers;
  const isAlmostFull = isRegOpen && !isFull && tourn.registeredPlayers / tourn.maxPlayers >= 0.8;
  const isRegistered = Boolean(pData || myStatus?.isRegistered || detail?.registered);

  const currentBal = walletBalance ?? 0;
  const balanceAfterJoin = currentBal - tourn.entryFee;
  const canAfford = balanceAfterJoin >= 0;

  const prizesList: Array<{ rank: number; label: string; emoji: string; percentage: number; amount: number }> = [
    { rank: 1, label: '1st Place (Champion)', emoji: '🥇', percentage: 50, amount: Math.floor((tourn.prizePool * 50) / 100) },
    { rank: 2, label: '2nd Place (Finalist)', emoji: '🥈', percentage: 25, amount: Math.floor((tourn.prizePool * 25) / 100) },
    { rank: 3, label: '3rd Place', emoji: '🥉', percentage: 15, amount: Math.floor((tourn.prizePool * 15) / 100) },
    { rank: 4, label: '4th Place', emoji: '4️⃣', percentage: 10, amount: Math.floor((tourn.prizePool * 10) / 100) },
  ];

  const matchData = dashboardData?.myCurrentMatch;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-3 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/tournaments')}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Back to Tournaments
        </button>

        {!connected && (
          <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
            <AlertTriangle className="size-3.5 animate-pulse" /> Reconnecting...
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          <XCircle className="size-4 shrink-0" /> {error}
          <button onClick={store.clearError} className="ml-auto text-rose-400 hover:text-rose-200">✕</button>
        </div>
      )}

      <div className="relative overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white via-slate-50 to-amber-500/5 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-6 sm:p-8 shadow-xl shadow-slate-200/50 dark:shadow-2xl backdrop-blur-xl transition-colors">
        <div className={`absolute top-0 right-0 h-64 w-64 bg-gradient-to-bl ${vis.gradientClass} blur-3xl pointer-events-none opacity-40`} />

        <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="space-y-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black border ${vis.badgeBgClass}`}>
                <span>{vis.badgeEmoji}</span>
                <span className="uppercase tracking-wider">{vis.name} TIER</span>
              </span>

              <Badge variant={statusInfo.variant} className="font-bold text-xs uppercase">
                {isLive ? 'LIVE NOW 🔴' : isAlmostFull ? 'ALMOST FULL' : isFull ? 'TOURNAMENT FULL' : statusInfo.label}
              </Badge>

              {playerStatus && tourn.status !== 'CANCELLED' && (
                <Badge variant={PLAYER_STATUS_BADGE[playerStatus]?.variant ?? 'default'} className="font-black text-xs">
                  {PLAYER_STATUS_BADGE[playerStatus]?.label ?? playerStatus}
                </Badge>
              )}

              {tourn.status === 'CANCELLED' && isRegistered && (
                <Badge variant="success" className="font-bold text-xs bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  {tourn.entryFee > 0 ? 'REFUNDED' : 'CANCELLED'}
                </Badge>
              )}

              {pData?.registrationSequence && (
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/80 px-2.5 py-0.5 rounded-full border border-slate-200 dark:border-slate-800">
                  Registered: #{pData.registrationSequence}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3.5">
              <span className="text-4xl sm:text-5xl drop-shadow-md">{game?.icon ?? '🏆'}</span>
              <div>
                <h1 className="text-2xl font-black text-slate-900 dark:text-white sm:text-3xl tracking-tight">
                  {tourn.title}
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm font-medium">
                  {game?.name ?? tourn.gameId} · {tourn.format.replace(/_/g, ' ')} · 10-Minute Match Limit
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-2.5 shadow-sm dark:shadow-none">
                <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Prize Pool</p>
                <p className="text-base font-black text-amber-600 dark:text-amber-400">🪙 {tourn.prizePool.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-2.5 shadow-sm dark:shadow-none">
                <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Entry Fee</p>
                <p className="text-base font-black text-slate-900 dark:text-slate-200">🪙 {tourn.entryFee.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-2.5 shadow-sm dark:shadow-none">
                <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Players</p>
                <p className="text-base font-black text-slate-900 dark:text-slate-200">
                  {tourn.registeredPlayers} <span className="text-xs text-slate-400 dark:text-slate-500">/ {tourn.maxPlayers}</span>
                  {tourn.status === 'CANCELLED' && (
                    <span className="ml-1.5 text-[10px] font-bold text-rose-500 dark:text-rose-400">
                      ({tourn.minPlayers ?? (tourn.title?.toLowerCase().includes('pro') ? 64 : tourn.title?.toLowerCase().includes('premium') ? 32 : tourn.title?.toLowerCase().includes('standard') ? 32 : tourn.title?.toLowerCase().includes('basic') ? 16 : 8)} min req)
                    </span>
                  )}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 p-2.5 shadow-sm dark:shadow-none">
                <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">Start Time</p>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                  {new Date(tourn.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>

          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col shrink-0">
            {isRegOpen && !isRegistered && (
              <Button
                size="lg"
                disabled={isFull || isJoining}
                loading={isJoining}
                onClick={() => setShowJoinModal(true)}
                className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black hover:from-amber-400 hover:to-orange-400 shadow-xl shadow-amber-500/25 px-8 py-6 text-base rounded-2xl"
              >
                {isFull ? 'TOURNAMENT FULL' : `JOIN TOURNAMENT (${tourn.entryFee} Coins)`}
              </Button>
            )}
          </div>
        </div>

        {isRegistered && (isRegOpen || isStarting) && (
          <div className="mt-6 rounded-2xl border border-emerald-500/40 bg-emerald-50 dark:bg-gradient-to-r dark:from-emerald-950/50 dark:via-slate-900 dark:to-teal-950/40 p-4.5 text-emerald-900 dark:text-emerald-200 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    ✓ YOU ARE REGISTERED IN THIS TOURNAMENT
                  </h3>
                  <p className="text-xs text-emerald-700 dark:text-emerald-300/80">
                    Registration Position: <span className="font-bold text-slate-900 dark:text-white">#{pData?.registrationSequence ?? 1}</span> · Seed: <span className="font-bold text-slate-900 dark:text-white">{pData?.seed ? `#${pData.seed}` : 'Pending Bracket Generation'}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-start sm:self-center bg-white dark:bg-slate-950/80 border border-emerald-500/30 px-3.5 py-2 rounded-xl shadow-sm">
                <LiveCountdown target={tourn.startTime} label="STARTS IN: " />
              </div>
            </div>
          </div>
        )}

        {playerStatus === 'WINNER' && (
          <div className="mt-6 rounded-2xl border border-amber-500/50 bg-amber-50 dark:bg-gradient-to-r dark:from-amber-500/20 dark:via-yellow-500/10 dark:to-amber-500/20 p-5 text-amber-900 dark:text-amber-200 shadow-xl">
            <div className="flex items-center gap-3">
              <Trophy className="size-8 text-amber-500 dark:text-amber-400 animate-bounce shrink-0" />
              <div className="flex-1">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">🏆 TOURNAMENT WINNER — CHAMPION</h3>
                <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-0.5">
                  Congratulations! You conquered all rounds and won the grand prize of{' '}
                  <span className="font-extrabold text-amber-600 dark:text-amber-400">
                    {(mySettlement?.prizeAmount ?? pData?.prizeWon ?? prizesList[0]!.amount).toLocaleString()} coins
                  </span>!
                </p>
                {mySettlement?.status === 'COMPLETED' || mySettlement?.status === 'PAID' ? (
                  <div className="mt-2.5 inline-flex items-center gap-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 text-xs text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      Credited to Wallet · Ref:{' '}
                      <span className="font-mono">{mySettlement.transactionId || 'COMPLETED'}</span>
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {playerStatus === 'ADVANCED' && (
          <div className="mt-6 rounded-2xl border border-teal-500/40 bg-teal-50 dark:bg-teal-950/40 p-4 text-teal-800 dark:text-teal-300">
            <div className="flex items-center gap-2.5">
              <Sparkles className="size-5 text-teal-500 dark:text-teal-400 animate-pulse" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                🎉 YOU ADVANCED TO ROUND {tourn.currentRound + 1}!
              </h3>
            </div>
            <p className="mt-1 text-xs text-teal-700 dark:text-teal-400/80">
              Waiting for the next opponent bracket match to complete. Check your registered email for live match notifications.
            </p>
          </div>
        )}

        {playerStatus === 'ELIMINATED' && (
          <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-50 dark:bg-rose-950/30 p-4 text-rose-800 dark:text-rose-300">
            <div className="flex items-center gap-2">
                <XCircle className="size-5 text-rose-500 dark:text-rose-400" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  TOURNAMENT ELIMINATED ({pData?.eliminatedInRound ? `Round ${pData.eliminatedInRound}` : 'Eliminated'})
                </h3>
              </div>
          </div>
        )}

        {tourn.status === 'CANCELLED' && (() => {
          const reason = (tourn as any).cancellationReason || (tourn as any).cancellationDetails?.reason || (tourn.rules as any)?.cancellationReason;
          const registered = (tourn as any).cancellationDetails?.registeredPlayers ?? tourn.registeredPlayers ?? (tourn as any).registeredCount ?? 0;
          const minRequired = tourn.minPlayers ?? (tourn as any).cancellationDetails?.minPlayers ?? (tourn.rules as any)?.minPlayersRequired ?? (
            tourn.title?.toLowerCase().includes('pro') ? 64 :
            tourn.title?.toLowerCase().includes('premium') ? 32 :
            tourn.title?.toLowerCase().includes('standard') ? 32 :
            tourn.title?.toLowerCase().includes('basic') ? 16 : 8
          );

          let headline = 'Minimum player requirement not met';
          let details = `This tournament required at least ${minRequired} players to start, but only ${registered} player${registered === 1 ? '' : 's'} registered before the registration deadline. The tournament was automatically cancelled.`;

          if (reason && reason !== 'MINIMUM_PLAYERS_NOT_REACHED' && !reason.includes('Insufficient players')) {
            if (reason === 'INSUFFICIENT_PLAYERS_AUTO_START' || reason.includes('auto-start')) {
              headline = 'Auto-start threshold not reached';
              details = `The tournament was set to auto-start, but did not reach the minimum player threshold (${registered}/${minRequired} players required).`;
            } else {
              headline = 'Cancelled by Platform Administration';
              details = `Reason: ${reason}`;
            }
          }

          return (
            <div className="mt-6 rounded-2xl border border-rose-500/40 bg-rose-50 dark:bg-gradient-to-r dark:from-rose-950/40 dark:via-red-950/20 dark:to-rose-950/40 p-5 text-rose-900 dark:text-rose-200">
              <div className="flex items-start gap-3.5">
                <AlertOctagon className="size-7 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                      TOURNAMENT CANCELLED
                    </h3>
                    <span className="rounded-md bg-rose-500/20 border border-rose-500/30 px-2 py-0.5 text-[11px] font-bold text-rose-600 dark:text-rose-300">
                      {headline}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 mt-1.5 leading-relaxed">
                    {details}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2.5">
                    <div className="rounded-xl border border-rose-500/20 bg-white/80 dark:bg-slate-900/80 px-3 py-1.5 text-xs font-semibold shadow-sm text-slate-700 dark:text-slate-200">
                      <span className="text-slate-400">Turnout:</span>{' '}
                      <span className="text-rose-600 dark:text-rose-400 font-bold">{registered}</span> / {minRequired} players required
                    </div>

                    {tourn.entryFee > 0 && isRegistered && (
                      <>
                        <div className="rounded-xl border border-rose-500/20 bg-white/80 dark:bg-slate-900/80 px-3 py-1.5 text-xs font-semibold shadow-sm text-slate-700 dark:text-slate-200">
                          <span className="text-slate-400">Entry Fee:</span>{' '}
                          <span className="font-bold text-slate-900 dark:text-white">{tourn.entryFee} coins</span>
                        </div>
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/80 dark:bg-emerald-950/40 px-3 py-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 shadow-sm">
                          <CheckCircle2 className="size-3.5" />
                          <span>100% REFUNDED TO WALLET</span>
                        </div>
                        <button
                          onClick={() => navigate('/wallet')}
                          className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 underline ml-auto"
                        >
                          View Wallet History →
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/70 p-5 sm:p-6 shadow-sm dark:shadow-none backdrop-blur-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Trophy className="size-4 text-amber-500 dark:text-amber-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Prize Distribution (Guaranteed {tourn.prizePool.toLocaleString()} Coins)
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">Top 4 Positions Paid</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {prizesList.map((p) => (
            <div
              key={p.rank}
              className={`rounded-2xl border p-3.5 flex flex-col justify-between transition-all ${
                p.rank === 1
                  ? 'border-amber-500/40 bg-gradient-to-b from-amber-500/15 via-amber-500/5 to-transparent'
                  : p.rank === 2
                  ? 'border-slate-400/30 bg-gradient-to-b from-slate-400/10 via-slate-400/5 to-transparent'
                  : p.rank === 3
                  ? 'border-amber-700/30 bg-gradient-to-b from-amber-700/10 via-amber-700/5 to-transparent'
                  : 'border-indigo-500/30 bg-gradient-to-b from-indigo-500/10 via-indigo-500/5 to-transparent'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xl">{p.emoji}</span>
                <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">{p.percentage}%</span>
              </div>
              <div className="mt-2">
                <p className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">{p.label}</p>
                <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-0.5">
                  🪙 {p.amount.toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Tabs value={activeTab} onChange={setActiveTab}>
        <TabsList className="bg-slate-100 dark:bg-slate-900/60 p-1 border border-slate-200 dark:border-slate-800 rounded-2xl flex-wrap">
          <TabsTrigger value="my-match" className="gap-1.5 text-xs">
            <Swords className="size-4" /> My Match / Lobby
          </TabsTrigger>
          <TabsTrigger value="bracket" className="gap-1.5 text-xs">
            <Trophy className="size-4" /> Bracket
          </TabsTrigger>
          <TabsTrigger value="standings" className="gap-1.5 text-xs">
            <TrendingUp className="size-4" /> Standings ({tourn.registeredPlayers})
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5 text-xs">
            <Flame className="size-4" /> Events ({events.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="my-match" className="mt-6 space-y-6">
          <TournamentTimeline
            tournamentStatus={tourn.status}
            isRegistered={isRegistered}
            currentRound={matchData?.roundNumber || 1}
            totalRounds={bracket?.rounds?.length || 3}
            activeMatchId={matchData?.matchId}
            onJoinMatch={(mId) => handleEnterMatch(mId)}
            onViewBracket={() => setActiveTab('bracket')}
            onViewWallet={() => navigate('/wallet')}
          />

          {matchData ? (
            <Card className="overflow-hidden border-slate-800 bg-slate-900/60 backdrop-blur">
              <CardHeader className="border-b border-slate-800/80 bg-slate-950/40 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Swords className="size-5 text-amber-400" />
                    <CardTitle className="text-lg font-black text-slate-100">
                      Round {matchData.roundNumber} Match
                    </CardTitle>
                  </div>
                  <Badge
                    variant={
                      matchData.status === 'IN_PROGRESS'
                        ? 'success'
                        : matchData.status === 'READY'
                        ? 'accent'
                        : 'default'
                    }
                  >
                    {matchData.status === 'IN_PROGRESS'
                      ? 'LIVE NOW'
                      : matchData.status === 'READY'
                      ? 'MATCH READY 🎮'
                      : matchData.status}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-6 text-center">
                  <div className="flex flex-col items-center">
                    <div className="size-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-2xl font-black text-amber-400">
                      {pData?.displayName?.[0] || 'Y'}
                    </div>
                    <div className="mt-2 font-bold text-slate-100">You ({pData?.displayName || pData?.username})</div>
                    <div className="mt-3 text-3xl font-black text-amber-400">{matchData.myScore}</div>
                  </div>

                  <div className="flex flex-col items-center justify-center space-y-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-500">VERSUS</span>
                    {matchData.matchDeadline && (
                      <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-1.5">
                        <MatchDeadlineTimer deadline={matchData.matchDeadline} />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="size-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl font-black text-slate-300">
                      {matchData.opponent?.displayName?.[0] || matchData.opponent?.username?.[0] || '?'}
                    </div>
                    <div className="mt-2 font-bold text-slate-100">
                      {matchData.opponent?.displayName || matchData.opponent?.username || 'Opponent'}
                    </div>
                    <div className="mt-3 text-3xl font-black text-slate-300">{matchData.opponentScore}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-xl bg-sky-950/30 border border-sky-500/30 p-3 text-xs text-sky-300">
                  <Mail className="size-4 text-sky-400 shrink-0" />
                  <span>Check your registered email account for instant server notifications and match alerts.</span>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-slate-800 text-slate-400 hover:text-amber-400 hover:border-amber-500/40 text-xs gap-1.5"
                    onClick={() => {
                      if (matchData.matchId) {
                        setDisputeTargetMatch({ matchId: matchData.matchId, roundNumber: matchData.roundNumber });
                      }
                    }}
                  >
                    <ShieldAlert className="size-3.5 text-amber-400" /> Report Result Dispute
                  </Button>

                  <Button
                    size="lg"
                    className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black hover:from-amber-400 hover:to-orange-400 shadow-lg shadow-amber-500/20 px-8 gap-2"
                    onClick={() => handleEnterMatch(matchData.matchId)}
                  >
                    <Play className="size-5 fill-current" /> JOIN MATCH
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : isRegistered && (isRegOpen || isStarting) ? (
            <Card className="border-slate-800 bg-slate-900/40">
              <CardContent className="p-8 text-center space-y-4">
                <div className="size-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                  <Clock className="size-8 text-emerald-400 animate-spin" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-black text-white">Waiting for Tournament Start</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    You are registered. When the registration window closes, the bracket will be seeded and Round 1 match assignments will be announced immediately.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 border border-slate-800 px-5 py-2.5">
                  <LiveCountdown target={tourn.startTime} label="STARTS IN: " />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-slate-800 bg-slate-900/40">
              <CardContent className="p-8 text-center space-y-3">
                <Trophy className="size-12 text-slate-600 mx-auto" />
                <h3 className="text-lg font-black text-slate-100">
                  {isRegOpen ? 'Registration is Open' : isCompleted ? 'Tournament Finished' : 'Tournament In Progress'}
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  {isRegOpen && !isRegistered
                    ? `Click "Join Tournament" above to secure your spot for ${tourn.entryFee} coins.`
                    : 'Check the Bracket tab to view current matches and player progression.'}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="bracket" className="mt-6 space-y-4">
          {bracket && bracket.rounds?.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>Hover or tap match slots to view match details. Your path is highlighted.</span>
                <span className="font-bold text-amber-400">Total Rounds: {bracket.totalRounds}</span>
              </div>
              <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-950/60 p-4">
                <PlayerBracketView
                  bracket={bracket}
                  myStatus={
                    myStatus ?? {
                      isRegistered: isRegistered,
                      seed: pData?.seed ?? null,
                      eliminated: pData?.eliminated ?? false,
                      eliminatedInRound: pData?.eliminatedInRound ?? null,
                      finalRank: pData?.finalRank ?? null,
                      currentRoundId: null,
                      currentMatchId: matchData?.matchId ?? null,
                      currentRound: matchData?.roundNumber ?? null,
                      opponent: matchData?.opponent
                        ? {
                            id: matchData.opponent.userId,
                            username: matchData.opponent.username,
                            displayName: matchData.opponent.displayName,
                            avatarUrl: matchData.opponent.avatarUrl,
                          }
                        : null,
                      matchStatus:
                        matchData?.status === 'READY' ||
                        matchData?.status === 'IN_PROGRESS' ||
                        matchData?.status === 'COMPLETED'
                          ? matchData.status
                          : 'PENDING',
                    }
                  }
                  players={tourn.registeredPlayers ? (detail?.players || []) : []}
                  onPlayMatch={(matchId) => handleEnterMatch(matchId)}
                />
              </div>
            </div>
          ) : (
            <Card className="border-slate-800 bg-slate-900/40">
              <CardContent className="py-12 text-center text-xs text-slate-400">
                Bracket will be generated once registration closes and the tournament starts.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ----------------------------------------------------------- */}
        {/* TAB 3: PROGRESS & STATS                                     */}
        {/* ----------------------------------------------------------- */}
        <TabsContent value="progress" className="mt-6 space-y-6">
          {/* Round Stepper */}
          <Card className="border-slate-800 bg-slate-900/60">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-bold text-slate-200">Tournament Round Progression</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <div className="flex flex-wrap items-center gap-3">
                {(dashboardData?.roundProgress || []).map((r) => (
                  <div
                    key={r.roundNumber}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold ${
                      r.status === 'COMPLETED'
                        ? 'border border-emerald-500/30 bg-emerald-950/30 text-emerald-300'
                        : r.status === 'CURRENT'
                        ? 'border border-amber-500/50 bg-amber-500/10 text-amber-300 animate-pulse'
                        : 'border border-slate-800 bg-slate-950/40 text-slate-500'
                    }`}
                  >
                    {r.status === 'COMPLETED' && <CheckCircle2 className="size-3.5 text-emerald-400" />}
                    {r.status === 'CURRENT' && <Zap className="size-3.5 text-amber-400" />}
                    <span>{r.name}</span>
                    <span className="text-[10px] opacity-75">
                      ({r.status === 'COMPLETED' ? '✓ Completed' : r.status === 'CURRENT' ? '● Current' : '○ Upcoming'})
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tournament-Specific Player Stats */}
          {dashboardData?.stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="border-slate-800 bg-slate-900/40 p-4 text-center">
                <div className="text-[11px] font-bold text-slate-400 uppercase">Matches Played</div>
                <div className="mt-1 text-2xl font-black text-slate-100">{dashboardData.stats.matchesPlayed}</div>
              </Card>
              <Card className="border-slate-800 bg-slate-900/40 p-4 text-center">
                <div className="text-[11px] font-bold text-slate-400 uppercase">Wins / Losses</div>
                <div className="mt-1 text-2xl font-black text-emerald-400">
                  {dashboardData.stats.wins} <span className="text-slate-600">/</span> <span className="text-rose-400">{dashboardData.stats.losses}</span>
                </div>
              </Card>
              <Card className="border-slate-800 bg-slate-900/40 p-4 text-center">
                <div className="text-[11px] font-bold text-slate-400 uppercase">Win Rate</div>
                <div className="mt-1 text-2xl font-black text-amber-400">{dashboardData.stats.winRate}%</div>
              </Card>
              <Card className="border-slate-800 bg-slate-900/40 p-4 text-center">
                <div className="text-[11px] font-bold text-slate-400 uppercase">Time-Limit Matches</div>
                <div className="mt-1 text-2xl font-black text-sky-400">{dashboardData.stats.timeLimitMatches}</div>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ----------------------------------------------------------- */}
        {/* TAB 4: MY MATCH HISTORY                                     */}
        {/* ----------------------------------------------------------- */}
        <TabsContent value="history" className="mt-6 space-y-4">
          {dashboardData?.myMatchHistory.length === 0 ? (
            <Card className="border-slate-800 bg-slate-900/40">
              <CardContent className="py-12 text-center text-xs text-slate-400">
                No match history recorded yet for this tournament.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {dashboardData?.myMatchHistory.map((m, idx) => (
                <Card key={idx} className="border-slate-800 bg-slate-900/60">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Badge variant={m.result === 'WIN' ? 'success' : m.result === 'LOSS' ? 'danger' : 'default'} className="font-bold px-2.5 py-1">
                        {m.result}
                      </Badge>
                      <div>
                        <div className="text-xs font-bold text-slate-200">
                          Round {m.roundNumber} vs {m.opponent?.displayName || m.opponent?.username || 'Opponent'}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>Score: {m.myScore}–{m.opponentScore}</span>
                          <span>·</span>
                          <span>Duration: {Math.floor(m.durationSeconds / 60)}m {m.durationSeconds % 60}s</span>
                          <span>·</span>
                          <span className="text-slate-500">Reason: {m.resultReason}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {m.matchId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-slate-400 hover:text-amber-400 hover:bg-slate-800/60 text-xs gap-1"
                          onClick={() => setDisputeTargetMatch({ matchId: m.matchId!, roundNumber: m.roundNumber })}
                        >
                          <ShieldAlert className="size-3.5" /> Report
                        </Button>
                      )}

                      {m.replayAvailable && m.matchId && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-slate-700 text-slate-300 hover:bg-slate-800 gap-1.5 text-xs"
                          onClick={() => navigate(`/game/${tourn.gameId}?replayMatchId=${m.matchId}`)}
                        >
                          <Video className="size-3.5" /> Watch Replay
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ----------------------------------------------------------- */}
        {/* TAB 5: LEADERBOARD & STANDINGS                              */}
        {/* ----------------------------------------------------------- */}
        <TabsContent value="standings" className="mt-6 space-y-6">
          {/* My Rank Highlight Banner */}
          {leaderboardData?.myRank && (
            <Card className="border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 dark:via-slate-900/60 to-transparent shadow-sm dark:shadow-none">
              <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="size-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center font-black text-amber-600 dark:text-amber-400 text-lg">
                    #{leaderboardData.myRank.rank}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-slate-900 dark:text-white">Your Tournament Standing</span>
                      <Badge variant="accent" className="text-[10px] px-1.5 py-0">YOU</Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {leaderboardData.myRank.wins} Wins · {leaderboardData.myRank.losses} Losses · {leaderboardData.myRank.points} Points
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      leaderboardData.myRank.status === 'CHAMPION' ? 'accent' :
                      leaderboardData.myRank.status === 'ADVANCED' ? 'success' :
                      leaderboardData.myRank.status === 'LIVE' ? 'warning' :
                      leaderboardData.myRank.status === 'ELIMINATED' ? 'danger' : 'default'
                    }
                    className="font-bold text-xs"
                  >
                    {leaderboardData.myRank.status}
                  </Badge>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400">Round {leaderboardData.myRank.currentRound}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Round Progress Tracker */}
          {leaderboardData && leaderboardData.roundProgress.length > 0 && (
            <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm dark:shadow-none">
              <CardHeader className="p-4 pb-2 border-b border-slate-200 dark:border-slate-800/80">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-2">
                  <TrendingUp className="size-3.5 text-amber-500 dark:text-amber-400" /> Bracket Round Progression
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  {leaderboardData.roundProgress.map((rp, idx) => (
                    <React.Fragment key={rp.roundNumber}>
                      <div
                        className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs border ${
                          rp.status === 'COMPLETED'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                            : rp.status === 'IN_PROGRESS'
                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300 animate-pulse'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <span className="font-bold">{rp.name}</span>
                        <span className="text-[10px] opacity-75 font-mono">({rp.playerCount}p)</span>
                      </div>
                      {idx < leaderboardData.roundProgress.length - 1 && (
                        <ChevronRight className="size-3 text-slate-400 dark:text-slate-600 shrink-0" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Search, Filter & Leaderboard Table */}
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden shadow-sm dark:shadow-none">
            <CardHeader className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/30">
              <div className="flex items-center gap-2">
                <Trophy className="size-4 text-amber-500 dark:text-amber-400" />
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Tournament Standings ({leaderboardData?.total ?? detail?.players.length ?? 0} Players)
                </CardTitle>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Search */}
                <div className="relative">
                  <Search className="size-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={leaderboardSearch}
                    onChange={(e) => {
                      setLeaderboardSearch(e.target.value);
                      setLeaderboardPage(1);
                    }}
                    placeholder="Search player..."
                    className="h-8 w-40 sm:w-48 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/60 pl-8 pr-3 text-xs text-slate-900 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                {/* Status Filter */}
                <select
                  value={leaderboardStatus}
                  onChange={(e) => {
                    setLeaderboardStatus(e.target.value);
                    setLeaderboardPage(1);
                  }}
                  aria-label="Filter leaderboard by player status"
                  className="h-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/60 px-2 text-xs text-slate-900 dark:text-slate-200 focus:border-amber-500 focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="CHAMPION">Champion</option>
                  <option value="ADVANCED">Advanced</option>
                  <option value="LIVE">Live Match</option>
                  <option value="WAITING">Waiting</option>
                  <option value="ELIMINATED">Eliminated</option>
                </select>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {isLeaderboardLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-lg bg-slate-100 dark:bg-slate-800/40" />
                  ))}
                </div>
              ) : !leaderboardData || leaderboardData.standings.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                  No player standings matching the filter criteria.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                        <th className="py-3 px-4 w-16">Rank</th>
                        <th className="py-3 px-4">Player</th>
                        <th className="py-3 px-4 text-center">Matches</th>
                        <th className="py-3 px-4 text-center">W / L</th>
                        <th className="py-3 px-4 text-center">Points</th>
                        <th className="py-3 px-4 text-center">Diff</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-right">Prize</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {leaderboardData.standings.map((s) => {
                        const isMe = s.userId === pData?.userId;
                        return (
                          <tr
                            key={s.userId}
                            className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                              isMe ? 'bg-amber-500/10 hover:bg-amber-500/15' : ''
                            }`}
                          >
                            <td className="py-3 px-4 font-mono font-bold">
                              {s.rank === 1 ? (
                                <span className="inline-flex items-center gap-1 text-amber-500 dark:text-amber-400 font-black">
                                  <Crown className="size-4 fill-amber-400" /> #1
                                </span>
                              ) : s.rank === 2 ? (
                                <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 font-black">
                                  <Medal className="size-4 fill-slate-400" /> #2
                                </span>
                              ) : s.rank === 3 ? (
                                <span className="inline-flex items-center gap-1 text-amber-700 font-black">
                                  <Medal className="size-4 fill-amber-700" /> #3
                                </span>
                              ) : s.rank === 4 ? (
                                <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-black">
                                  <span className="inline-flex items-center justify-center size-4 rounded-full bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold text-[10px]">4</span> #4
                                </span>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-500">#{s.rank}</span>
                              )}
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="size-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-700 dark:text-slate-300 text-xs shrink-0 border border-slate-200 dark:border-transparent">
                                  {s.displayName?.[0] || s.username?.[0] || 'U'}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-slate-900 dark:text-slate-200 truncate">{s.displayName || s.username}</span>
                                    {isMe && (
                                      <Badge variant="accent" className="text-[9px] px-1 py-0">YOU</Badge>
                                    )}
                                  </div>
                                  {s.seed && (
                                    <span className="text-[10px] text-slate-500 font-mono">Seed #{s.seed}</span>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4 text-center font-mono text-slate-700 dark:text-slate-300">{s.matchesPlayed}</td>
                            <td className="py-3 px-4 text-center font-mono">
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">{s.wins}W</span>{' '}
                              <span className="text-slate-400 dark:text-slate-500">/</span>{' '}
                              <span className="text-rose-600 dark:text-rose-400 font-bold">{s.losses}L</span>
                            </td>
                            <td className="py-3 px-4 text-center font-mono font-black text-amber-600 dark:text-amber-400">{s.points}</td>
                            <td className="py-3 px-4 text-center font-mono text-slate-600 dark:text-slate-400">
                              {s.scoreDiff > 0 ? `+${s.scoreDiff}` : s.scoreDiff}
                            </td>

                            <td className="py-3 px-4 text-center">
                              <Badge
                                variant={
                                  s.status === 'CHAMPION' ? 'accent' :
                                  s.status === 'ADVANCED' ? 'success' :
                                  s.status === 'LIVE' ? 'warning' :
                                  s.status === 'ELIMINATED' ? 'danger' : 'default'
                                }
                                className="text-[10px] font-bold"
                              >
                                {s.status}
                              </Badge>
                            </td>

                            <td className="py-3 px-4 text-right font-mono font-bold">
                              {s.prizeAmount ? (
                                <span className="text-amber-600 dark:text-amber-400">🪙 {s.prizeAmount.toLocaleString()}</span>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-600">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {leaderboardData && leaderboardData.total > leaderboardData.pageSize && (
                <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 px-4 py-3 bg-slate-50 dark:bg-slate-950/40 text-xs">
                  <span className="text-slate-500">
                    Showing {(leaderboardData.page - 1) * leaderboardData.pageSize + 1}–
                    {Math.min(leaderboardData.page * leaderboardData.pageSize, leaderboardData.total)} of{' '}
                    {leaderboardData.total}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-slate-200 dark:border-slate-800 gap-1"
                      disabled={leaderboardData.page <= 1}
                      onClick={() => setLeaderboardPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="size-3" /> Prev
                    </Button>
                    <span className="font-mono text-slate-600 dark:text-slate-400 px-2">
                      Page {leaderboardData.page} of {Math.ceil(leaderboardData.total / leaderboardData.pageSize)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-slate-200 dark:border-slate-800 gap-1"
                      disabled={leaderboardData.page >= Math.ceil(leaderboardData.total / leaderboardData.pageSize)}
                      onClick={() => setLeaderboardPage((p) => p + 1)}
                    >
                      Next <ChevronRight className="size-3" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----------------------------------------------------------- */}
        {/* TAB 6: REAL-TIME EVENTS                                     */}
        {/* ----------------------------------------------------------- */}
        <TabsContent value="events" className="mt-6">
          <Card className="border-slate-800 bg-slate-900/60">
            <CardContent className="p-4 space-y-2">
              {events.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400">No events logged yet.</p>
              ) : (
                events.map((evt) => (
                  <div key={evt.id} className="flex items-start gap-3 rounded-xl bg-slate-950/40 p-3 text-xs">
                    <Clock className="size-4 text-slate-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-200">{evt.message}</p>
                      <p className="text-[10px] text-slate-500">{evt.type}</p>
                    </div>
                    <time className="text-[10px] text-slate-500 shrink-0 font-mono">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </time>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ------------------------------------------------------------- */}
      {/* JOIN CONFIRMATION MODAL                                       */}
      {/* ------------------------------------------------------------- */}
      <Modal
        isOpen={showJoinModal}
        onClose={() => { setShowJoinModal(false); setJoinError(null); }}
        title="Register for Tournament"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowJoinModal(false)}>Cancel</Button>
            {canAfford ? (
              <Button
                variant="primary"
                loading={isJoining}
                disabled={!canAfford || isJoining}
                onClick={handleJoin}
                className="bg-amber-500 text-slate-950 font-bold hover:bg-amber-400"
              >
                Confirm & Register
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => {
                  setShowJoinModal(false);
                  navigate('/wallet');
                }}
                className="bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold hover:from-amber-400 hover:to-yellow-400"
              >
                ADD COINS
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none">
              <p className="text-slate-500 dark:text-slate-400 font-medium">Entry Fee</p>
              <p className="text-base font-black text-amber-600 dark:text-amber-400">🪙 {tourn.entryFee.toLocaleString()} Coins</p>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none">
              <p className="text-slate-500 dark:text-slate-400 font-medium">Prize Pool</p>
              <p className="text-base font-black text-emerald-600 dark:text-emerald-400">🪙 {tourn.prizePool.toLocaleString()} Coins</p>
            </div>
          </div>

          {/* Authoritative Financial Breakdown */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 p-3.5 space-y-2.5 shadow-sm dark:shadow-none">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Current Balance:</span>
              <span className="font-bold text-slate-900 dark:text-slate-200">🪙 {(walletBalance ?? 0).toLocaleString()} Coins</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Entry Fee:</span>
              <span className="font-bold text-amber-600 dark:text-amber-400">🪙 {tourn.entryFee.toLocaleString()} Coins</span>
            </div>
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between font-semibold">
              <span className="text-slate-700 dark:text-slate-300">Balance After Entry:</span>
              <span className={`font-bold ${canAfford ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                🪙 {balanceAfterJoin.toLocaleString()} Coins
              </span>
            </div>
          </div>

          {/* Insufficient Balance Experience */}
          {!canAfford && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-rose-500 dark:text-rose-400 font-bold uppercase tracking-wider text-xs">
                <AlertCircle className="size-4 shrink-0" />
                <span>INSUFFICIENT COINS</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs bg-white dark:bg-slate-950/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <div>
                  <p className="text-slate-500 text-[10px]">Required:</p>
                  <p className="font-bold text-slate-900 dark:text-slate-200">{tourn.entryFee.toLocaleString()} coins</p>
                </div>
                <div>
                  <p className="text-slate-500 text-[10px]">Available:</p>
                  <p className="font-bold text-rose-500 dark:text-rose-400">{(walletBalance ?? 0).toLocaleString()} coins</p>
                </div>
              </div>
              <Button
                variant="primary"
                onClick={() => {
                  setShowJoinModal(false);
                  navigate('/wallet');
                }}
                className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold hover:from-amber-400 hover:to-yellow-400 py-2.5 text-xs shadow-lg shadow-amber-500/20"
              >
                ADD COINS
              </Button>
            </div>
          )}

          {joinError && (
            <p className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-rose-500 dark:text-rose-400">
              {joinError}
            </p>
          )}
        </div>
      </Modal>

      {/* ------------------------------------------------------------- */}
      {/* REGISTRATION SUCCESS CONFIRMATION MODAL                       */}
      {/* ------------------------------------------------------------- */}
      {registrationSuccessData && (
        <Modal
          isOpen={Boolean(registrationSuccessData)}
          onClose={() => setRegistrationSuccessData(null)}
          title="Registration Confirmed"
          size="sm"
          footer={
            <Button
              variant="primary"
              onClick={() => setRegistrationSuccessData(null)}
              className="w-full bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400"
            >
              Done
            </Button>
          }
        >
          <div className="text-center space-y-4 py-2">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="size-8" />
            </div>

            <h3 className="text-lg font-black text-emerald-600 dark:text-emerald-400">
              ✓ Tournament Registration Successful
            </h3>

            <div className="bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-left space-y-2.5 text-xs shadow-sm dark:shadow-none">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Tournament:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{registrationSuccessData.tournamentTitle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Game:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{registrationSuccessData.gameName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Entry Fee:</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">{registrationSuccessData.entryFee.toLocaleString()} coins</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-2 font-semibold">
                <span className="text-slate-600 dark:text-slate-300">Prize Pool:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">🪙 {tourn.prizePool.toLocaleString()} coins</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Your match bracket position will update automatically when the tournament begins.
            </p>
          </div>
        </Modal>
      )}

      {/* Dispute / Report Modal */}
      {disputeTargetMatch && (
        <DisputeReportModal
          isOpen={Boolean(disputeTargetMatch)}
          onClose={() => setDisputeTargetMatch(null)}
          matchId={disputeTargetMatch.matchId}
          tournamentId={tourn.id}
          tournamentTitle={tourn.title}
          roundNumber={disputeTargetMatch.roundNumber}
          gameName={game?.name}
          onDisputeSubmitted={() => {
            store.fetchAll(tourn.id);
          }}
        />
      )}
    </div>
  );
}
