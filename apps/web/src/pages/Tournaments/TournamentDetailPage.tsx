import React, { useEffect, useState, useCallback } from 'react';
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
} from 'lucide-react';
import { GAME_DEFINITIONS } from '@gaming-hub/shared';
import type { TournamentStatus, TournamentLeaderboardResponse } from '@gaming-hub/shared';
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
import { ShieldAlert } from 'lucide-react';

const gameById = new Map(GAME_DEFINITIONS.map((g) => [g.id, g]));

const STATUS_BADGE: Record<string, { variant: 'success' | 'warning' | 'danger' | 'accent' | 'default' | 'outline'; label: string }> = {
  DRAFT: { variant: 'outline', label: 'Draft' },
  REGISTRATION_OPEN: { variant: 'accent', label: 'Registration Open' },
  REGISTRATION_CLOSED: { variant: 'default', label: 'Registration Closed' },
  UPCOMING: { variant: 'default', label: 'Upcoming' },
  STARTING: { variant: 'warning', label: 'Starting Soon' },
  IN_PROGRESS: { variant: 'success', label: 'In Progress' },
  PAUSED: { variant: 'warning', label: 'Paused' },
  COMPLETED: { variant: 'accent', label: 'Completed' },
  SETTLING: { variant: 'warning', label: 'Settling' },
  SETTLED: { variant: 'success', label: 'Settled' },
  LIVE: { variant: 'success', label: 'Live' },
  CANCELLED: { variant: 'danger', label: 'Cancelled' },
};

const PLAYER_STATUS_BADGE: Record<string, { variant: 'success' | 'warning' | 'danger' | 'accent' | 'default' | 'outline'; label: string }> = {
  REGISTERED: { variant: 'default', label: 'Registered' },
  WAITING: { variant: 'warning', label: 'Waiting for Match' },
  MATCH_READY: { variant: 'accent', label: 'Match Ready' },
  LIVE: { variant: 'success', label: 'Live Match' },
  ADVANCED: { variant: 'accent', label: 'Advanced' },
  ELIMINATED: { variant: 'danger', label: 'Eliminated' },
  WINNER: { variant: 'success', label: 'Champion 🏆' },
  COMPLETED: { variant: 'default', label: 'Completed' },
};

function CountdownTimer({ target }: { target: string }) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    const tick = () => {
      const diff = new Date(target).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining('00:00:00');
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return <span className="tabular-nums font-mono font-bold text-amber-300">{remaining}</span>;
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
    <div className="flex items-center gap-1.5 font-mono text-sm font-black">
      <Clock className={`size-4 ${isExpired ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`} />
      <span className={isExpired ? 'text-rose-400' : 'text-amber-300'}>
        {timeLeft} {isExpired ? '(TIME EXPIRED)' : 'remaining'}
      </span>
    </div>
  );
}

export function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = usePlayerTournamentStore();
  const { detail, bracket, myStatus, currentMatch, dashboardData, walletBalance, isLoading, error, events, connected } = store;

  const [activeTab, setActiveTab] = useState('my-match');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState(false);
  const [disputeTargetMatch, setDisputeTargetMatch] = useState<{ matchId: string; roundNumber?: number } | null>(null);
  const [mySettlement, setMySettlement] = useState<any>(null);

  // Leaderboard state
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
      // ignore
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
    if (!id) return;
    setIsJoining(true);
    setJoinError(null);
    try {
      await tournamentsApi.register(id);
      await store.fetchAll(id);
      setShowJoinModal(false);
      setRegisterSuccess(true);
      setTimeout(() => setRegisterSuccess(false), 4000);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to join tournament');
    } finally {
      setIsJoining(false);
    }
  }, [id, store]);

  const handleCancel = useCallback(async () => {
    if (!id) return;
    setIsJoining(true);
    setJoinError(null);
    try {
      await tournamentsApi.cancel(id);
      await store.fetchAll(id);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to cancel registration');
    } finally {
      setIsJoining(false);
    }
  }, [id, store]);

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
        <Skeleton className="h-56 w-full rounded-3xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-96 rounded-3xl" />
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
    prizeDistribution: [],
  };

  const pData = dashboardData?.player;
  const game = gameById.get(tourn.gameId as any);
  const statusInfo = STATUS_BADGE[tourn.status] ?? { variant: 'outline' as const, label: tourn.status };
  const playerStatus = pData?.status ?? (myStatus?.isRegistered ? (myStatus.eliminated ? 'ELIMINATED' : 'REGISTERED') : null);

  const isRegOpen = tourn.status === 'REGISTRATION_OPEN';
  const isFull = tourn.registeredPlayers >= tourn.maxPlayers;
  const isRegistered = Boolean(pData || myStatus?.isRegistered || detail?.registered);

  const balanceAfterJoin = (walletBalance ?? 0) - tourn.entryFee;
  const canAfford = balanceAfterJoin >= 0;

  const matchData = dashboardData?.myCurrentMatch;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      {/* Top Back Navigation */}
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

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          <XCircle className="size-4 shrink-0" /> {error}
          <button onClick={store.clearError} className="ml-auto text-rose-400 hover:text-rose-200">✕</button>
        </div>
      )}
      {registerSuccess && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          <CheckCircle2 className="size-4 shrink-0" /> Registered successfully for {tourn.title}!
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 1. HERO BANNER                                                */}
      {/* ------------------------------------------------------------- */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusInfo.variant} className="font-bold text-xs uppercase">
                {statusInfo.label}
              </Badge>
              {playerStatus && (
                <Badge variant={PLAYER_STATUS_BADGE[playerStatus]?.variant ?? 'default'} className="font-bold text-xs">
                  {PLAYER_STATUS_BADGE[playerStatus]?.label ?? playerStatus}
                </Badge>
              )}
              {pData?.registrationSequence && (
                <span className="text-xs font-semibold text-slate-400">
                  Reg #{pData.registrationSequence}
                </span>
              )}
              {pData?.seed && (
                <span className="text-xs font-semibold text-sky-400">
                  Seed #{pData.seed}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-4xl">{game?.icon ?? '🏆'}</span>
              <div>
                <h1 className="text-2xl font-black text-white sm:text-3xl tracking-tight">
                  {tourn.title}
                </h1>
                <p className="text-xs text-slate-400 sm:text-sm">
                  {game?.name ?? tourn.gameId} · {tourn.format.replace(/_/g, ' ')}
                </p>
              </div>
            </div>

            {/* Quick Specs */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 pt-1">
              <span className="flex items-center gap-1.5 text-amber-400 font-bold">
                <DollarSign className="size-4" /> Prize Pool: {tourn.prizePool.toLocaleString()} coins
              </span>
              <span className="flex items-center gap-1.5 text-slate-400">
                <Users className="size-4" /> Players: {tourn.registeredPlayers}/{tourn.maxPlayers} ({tourn.availableSlots} slots left)
              </span>
              <span className="flex items-center gap-1.5 text-slate-400">
                <CalendarClock className="size-4" /> Starts: {new Date(tourn.startTime).toLocaleTimeString()}
              </span>
            </div>
          </div>

          {/* Registration / Action area */}
          <div className="flex flex-col gap-2.5 sm:flex-row lg:flex-col shrink-0">
            {isRegOpen && !isRegistered && (
              <Button
                size="lg"
                disabled={isFull || isJoining}
                loading={isJoining}
                onClick={() => setShowJoinModal(true)}
                className="bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black hover:from-amber-400 hover:to-orange-400 shadow-lg shadow-amber-500/20 px-8 py-6 text-base"
              >
                {isFull ? 'Registration Full' : `Join Tournament (${tourn.entryFee} coins)`}
              </Button>
            )}

            {isRegistered && isRegOpen && (
              <Button
                variant="outline"
                size="sm"
                loading={isJoining}
                onClick={handleCancel}
                className="border-rose-500/40 text-rose-400 hover:bg-rose-950/40"
              >
                Cancel Registration
              </Button>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* CHAMPION / ADVANCED / ELIMINATED CELEBRATION BANNERS          */}
        {/* ------------------------------------------------------------- */}
        {playerStatus === 'WINNER' && (
          <div className="mt-6 rounded-2xl border border-amber-500/50 bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-amber-500/20 p-5 text-amber-200 shadow-xl">
            <div className="flex items-center gap-3">
              <Trophy className="size-8 text-amber-400 animate-bounce shrink-0" />
              <div className="flex-1">
                <h3 className="text-xl font-black text-white">🏆 TOURNAMENT WINNER — CHAMPION</h3>
                <p className="text-xs text-amber-300/90 mt-0.5">
                  Congratulations! You conquered all rounds and won the grand prize of{' '}
                  <span className="font-extrabold text-amber-400">
                    {(mySettlement?.prizeAmount ?? pData?.prizeWon ?? tourn.prizePool).toLocaleString()} coins
                  </span>!
                </p>
                {mySettlement?.status === 'COMPLETED' || mySettlement?.status === 'PAID' ? (
                  <div className="mt-2.5 inline-flex items-center gap-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 text-xs text-emerald-300">
                    <CheckCircle2 className="size-4 text-emerald-400" />
                    <span>
                      Credited to Wallet · Ref:{' '}
                      <span className="font-mono">{mySettlement.transactionId || 'COMPLETED'}</span>
                    </span>
                  </div>
                ) : mySettlement?.status === 'PENDING' || mySettlement?.status === 'PROCESSING' ? (
                  <div className="mt-2.5 inline-flex items-center gap-2 rounded-lg bg-amber-500/20 border border-amber-500/40 px-3 py-1 text-xs text-amber-300">
                    <Clock className="size-4 text-amber-400 animate-spin" />
                    <span>Prize settlement in progress...</span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {playerStatus !== 'WINNER' && mySettlement && mySettlement.prizeAmount > 0 && (
          <div className="mt-6 rounded-2xl border border-indigo-500/50 bg-indigo-950/40 p-4 text-indigo-200">
            <div className="flex items-center gap-3">
              <Award className="size-7 text-indigo-400 shrink-0" />
              <div>
                <h3 className="font-bold text-sm text-white">
                  🎉 #{mySettlement.rank} Place Finish — {mySettlement.prizeAmount.toLocaleString()} Coins Prize
                </h3>
                {mySettlement.status === 'COMPLETED' || mySettlement.status === 'PAID' ? (
                  <p className="text-xs text-emerald-300 mt-1 flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5" />
                    Prize credited to your wallet ({mySettlement.transactionId || 'COMPLETED'})
                  </p>
                ) : (
                  <p className="text-xs text-indigo-300/80 mt-1">Prize settlement processing</p>
                )}
              </div>
            </div>
          </div>
        )}

        {playerStatus === 'ADVANCED' && (
          <div className="mt-6 rounded-2xl border border-teal-500/40 bg-teal-950/40 p-4 text-teal-300">
            <div className="flex items-center gap-2.5">
              <Sparkles className="size-5 text-teal-400 animate-pulse" />
              <h3 className="font-bold text-sm text-white">
                🎉 YOU ADVANCED TO ROUND {tourn.currentRound + 1}!
              </h3>
            </div>
            <p className="mt-1 text-xs text-teal-400/80">
              Waiting for the next opponent bracket match to complete. Check your registered email for live match notifications.
            </p>
          </div>
        )}

        {playerStatus === 'ELIMINATED' && (
          <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-950/30 p-4 text-rose-300">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <XCircle className="size-5 text-rose-400" />
                <h3 className="font-bold text-sm text-white">
                  TOURNAMENT ELIMINATED ({pData?.eliminatedInRound ? `Round ${pData.eliminatedInRound}` : 'Eliminated'})
                </h3>
              </div>
              {dashboardData?.myMatchHistory.length ? (
                <span className="text-xs text-rose-400/80">
                  {dashboardData.myMatchHistory.length} matches played in this tournament.
                </span>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TABS NAVIGATION                                               */}
      {/* ------------------------------------------------------------- */}
      <Tabs value={activeTab} onChange={setActiveTab}>
        <TabsList className="bg-slate-900/60 p-1 border border-slate-800 rounded-2xl">
          <TabsTrigger value="my-match" className="gap-1.5">
            <Swords className="size-4" /> My Match
          </TabsTrigger>
          <TabsTrigger value="bracket" className="gap-1.5">
            <Trophy className="size-4" /> Bracket
          </TabsTrigger>
          <TabsTrigger value="progress" className="gap-1.5">
            <TrendingUp className="size-4" /> Progress & Stats
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <Clock className="size-4" /> My Match History ({dashboardData?.myMatchHistory.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="players" className="gap-1.5">
            <Users className="size-4" /> Players ({tourn.registeredPlayers})
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5">
            <Flame className="size-4" /> Events ({events.length})
          </TabsTrigger>
        </TabsList>

        {/* ----------------------------------------------------------- */}
        {/* TAB 1: MY MATCH HUB                                         */}
        {/* ----------------------------------------------------------- */}
        <TabsContent value="my-match" className="mt-6 space-y-6">
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
                  <Badge variant={matchData.status === 'IN_PROGRESS' ? 'success' : matchData.status === 'READY' ? 'accent' : 'default'}>
                    {matchData.status === 'IN_PROGRESS' ? 'LIVE NOW' : matchData.status === 'READY' ? 'MATCH READY' : matchData.status}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                {/* Players & Live Score Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-6 text-center">
                  {/* Player You */}
                  <div className="flex flex-col items-center">
                    <div className="size-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-2xl font-black text-amber-400">
                      {pData?.displayName?.[0] || 'Y'}
                    </div>
                    <div className="mt-2 font-bold text-slate-100">You ({pData?.displayName || pData?.username})</div>
                    {pData?.seed && <span className="text-xs text-slate-400">Seed #{pData.seed}</span>}
                    <div className="mt-3 text-3xl font-black text-amber-400">{matchData.myScore}</div>
                  </div>

                  {/* VS & Timer */}
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-500">VERSUS</span>
                    {matchData.matchDeadline && (
                      <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-1.5">
                        <MatchDeadlineTimer deadline={matchData.matchDeadline} />
                      </div>
                    )}
                    <span className="text-[11px] text-slate-500">10-Minute Match Limit</span>
                  </div>

                  {/* Opponent */}
                  <div className="flex flex-col items-center">
                    <div className="size-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl font-black text-slate-300">
                      {matchData.opponent?.displayName?.[0] || matchData.opponent?.username?.[0] || '?'}
                    </div>
                    <div className="mt-2 font-bold text-slate-100">
                      {matchData.opponent?.displayName || matchData.opponent?.username || 'Opponent'}
                    </div>
                    {matchData.opponent?.seed && (
                      <span className="text-xs text-slate-400">Seed #{matchData.opponent.seed}</span>
                    )}
                    <div className="mt-3 text-3xl font-black text-slate-300">{matchData.opponentScore}</div>
                  </div>
                </div>

                {/* Email reminder notice */}
                <div className="flex items-center gap-2 rounded-xl bg-sky-950/30 border border-sky-500/30 p-3 text-xs text-sky-300">
                  <Mail className="size-4 text-sky-400 shrink-0" />
                  <span>Check your registered email account for instant server notifications and match alerts.</span>
                </div>

                {/* Action CTAs */}
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
                    <ShieldAlert className="size-3.5 text-amber-400" /> Report Match Result
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
          ) : playerStatus === 'ADVANCED' ? (
            <Card className="border-teal-500/30 bg-teal-950/20">
              <CardContent className="p-8 text-center space-y-3">
                <Sparkles className="size-12 text-teal-400 mx-auto animate-pulse" />
                <h3 className="text-lg font-black text-white">You Have Advanced to the Next Round!</h3>
                <p className="text-xs text-teal-300/80 max-w-md mx-auto">
                  Your opponent's match is currently in progress. As soon as both players are finalized, your match will transition to MATCH READY.
                </p>
              </CardContent>
            </Card>
          ) : playerStatus === 'ELIMINATED' ? (
            <Card className="border-slate-800 bg-slate-900/40">
              <CardContent className="p-8 text-center space-y-3">
                <XCircle className="size-12 text-rose-500 mx-auto" />
                <h3 className="text-lg font-black text-slate-100">Tournament Eliminated</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  You are no longer active in the bracket. You can watch the remaining matches in the Bracket view or review your replays in Match History.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setActiveTab('history')}
                  className="border-slate-700 text-slate-200"
                >
                  View Match History
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-slate-800 bg-slate-900/40">
              <CardContent className="p-8 text-center space-y-3">
                <Clock className="size-12 text-slate-500 mx-auto animate-spin" />
                <h3 className="text-lg font-black text-slate-100">Waiting for Next Match</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  {tourn.status === 'REGISTRATION_OPEN' || tourn.status === 'UPCOMING'
                    ? 'Matches will be scheduled automatically when registration closes and the tournament begins.'
                    : 'The tournament orchestrator is assembling current round matches. Please stand by.'}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ----------------------------------------------------------- */}
        {/* TAB 2: BRACKET VIEW                                         */}
        {/* ----------------------------------------------------------- */}
        <TabsContent value="bracket" className="mt-6 space-y-4">
          {bracket ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>Hover or tap match slots to view match details. Your path is highlighted.</span>
                <span className="font-bold text-amber-400">Total Rounds: {bracket.totalRounds}</span>
              </div>
              <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-950/60 p-4">
                <PlayerBracketView
                  bracket={bracket}
                  myStatus={myStatus ?? {
                    isRegistered: true,
                    seed: pData?.seed ?? null,
                    eliminated: pData?.eliminated ?? false,
                    eliminatedInRound: pData?.eliminatedInRound ?? null,
                    finalRank: pData?.finalRank ?? null,
                    currentRoundId: null,
                    currentMatchId: matchData?.matchId ?? null,
                    currentRound: matchData?.roundNumber ?? null,
                    opponent: matchData?.opponent ? { id: matchData.opponent.userId, username: matchData.opponent.username, displayName: matchData.opponent.displayName, avatarUrl: matchData.opponent.avatarUrl } : null,
                    matchStatus: matchData?.status === 'READY' || matchData?.status === 'IN_PROGRESS' || matchData?.status === 'COMPLETED' ? matchData.status : 'PENDING',
                  }}
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
        <TabsContent value="players" className="mt-6 space-y-6">
          {/* My Rank Highlight Banner */}
          {leaderboardData?.myRank && (
            <Card className="border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-slate-900/60 to-slate-900/60">
              <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="size-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center font-black text-amber-400 text-lg">
                    #{leaderboardData.myRank.rank}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-white">Your Tournament Standing</span>
                      <Badge variant="accent" className="text-[10px] px-1.5 py-0">YOU</Badge>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
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
                  <span className="text-xs font-mono text-slate-400">Round {leaderboardData.myRank.currentRound}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Round Progress Tracker */}
          {leaderboardData && leaderboardData.roundProgress.length > 0 && (
            <Card className="border-slate-800 bg-slate-900/60">
              <CardHeader className="p-4 pb-2 border-b border-slate-800/80">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <TrendingUp className="size-3.5 text-amber-400" /> Bracket Round Progression
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  {leaderboardData.roundProgress.map((rp, idx) => (
                    <React.Fragment key={rp.roundNumber}>
                      <div
                        className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs border ${
                          rp.status === 'COMPLETED'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                            : rp.status === 'IN_PROGRESS'
                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 animate-pulse'
                            : 'border-slate-800 bg-slate-950/40 text-slate-500'
                        }`}
                      >
                        <span className="font-bold">{rp.name}</span>
                        <span className="text-[10px] opacity-75 font-mono">({rp.playerCount}p)</span>
                      </div>
                      {idx < leaderboardData.roundProgress.length - 1 && (
                        <ChevronRight className="size-3 text-slate-600 shrink-0" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Search, Filter & Leaderboard Table */}
          <Card className="border-slate-800 bg-slate-900/60 overflow-hidden">
            <CardHeader className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/30">
              <div className="flex items-center gap-2">
                <Trophy className="size-4 text-amber-400" />
                <CardTitle className="text-sm font-bold text-slate-100">
                  Tournament Leaderboard ({leaderboardData?.total ?? detail?.players.length ?? 0} Players)
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
                    className="h-8 w-40 sm:w-48 rounded-lg border border-slate-800 bg-slate-950/60 pl-8 pr-3 text-xs text-slate-200 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
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
                  className="h-8 rounded-lg border border-slate-800 bg-slate-950/60 px-2 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
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
                    <Skeleton key={i} className="h-10 w-full rounded-lg bg-slate-800/40" />
                  ))}
                </div>
              ) : !leaderboardData || leaderboardData.standings.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No player standings matching the filter criteria.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/50 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
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
                    <tbody className="divide-y divide-slate-800/60">
                      {leaderboardData.standings.map((s) => {
                        const isMe = s.userId === pData?.userId;
                        return (
                          <tr
                            key={s.userId}
                            className={`transition-colors hover:bg-slate-800/40 ${
                              isMe ? 'bg-amber-500/10 hover:bg-amber-500/15' : ''
                            }`}
                          >
                            <td className="py-3 px-4 font-mono font-bold">
                              {s.rank === 1 ? (
                                <span className="inline-flex items-center gap-1 text-amber-400 font-black">
                                  <Crown className="size-4 fill-amber-400" /> #1
                                </span>
                              ) : s.rank === 2 ? (
                                <span className="inline-flex items-center gap-1 text-slate-300 font-black">
                                  <Medal className="size-4 fill-slate-400" /> #2
                                </span>
                              ) : s.rank === 3 ? (
                                <span className="inline-flex items-center gap-1 text-amber-700 font-black">
                                  <Medal className="size-4 fill-amber-700" /> #3
                                </span>
                              ) : (
                                <span className="text-slate-500">#{s.rank}</span>
                              )}
                            </td>

                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="size-7 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-300 text-xs shrink-0">
                                  {s.displayName?.[0] || s.username?.[0] || 'U'}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-slate-200 truncate">{s.displayName || s.username}</span>
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

                            <td className="py-3 px-4 text-center font-mono text-slate-300">{s.matchesPlayed}</td>
                            <td className="py-3 px-4 text-center font-mono">
                              <span className="text-emerald-400 font-bold">{s.wins}W</span>{' '}
                              <span className="text-slate-500">/</span>{' '}
                              <span className="text-rose-400 font-bold">{s.losses}L</span>
                            </td>
                            <td className="py-3 px-4 text-center font-mono font-black text-amber-400">{s.points}</td>
                            <td className="py-3 px-4 text-center font-mono text-slate-400">
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
                                <span className="text-amber-400">🪙 {s.prizeAmount.toLocaleString()}</span>
                              ) : (
                                <span className="text-slate-600">—</span>
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
                <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3 bg-slate-950/40 text-xs">
                  <span className="text-slate-500">
                    Showing {(leaderboardData.page - 1) * leaderboardData.pageSize + 1}–
                    {Math.min(leaderboardData.page * leaderboardData.pageSize, leaderboardData.total)} of{' '}
                    {leaderboardData.total}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-slate-800 gap-1"
                      disabled={leaderboardData.page <= 1}
                      onClick={() => setLeaderboardPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="size-3" /> Prev
                    </Button>
                    <span className="font-mono text-slate-400 px-2">
                      Page {leaderboardData.page} of {Math.ceil(leaderboardData.total / leaderboardData.pageSize)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-slate-800 gap-1"
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
        title="Join Tournament"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowJoinModal(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={isJoining}
              disabled={!canAfford}
              onClick={handleJoin}
              className="bg-amber-500 text-slate-950 font-bold hover:bg-amber-400"
            >
              Confirm Registration
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-900 p-3 border border-slate-800">
              <p className="text-slate-500">Entry Fee</p>
              <p className="text-base font-black text-amber-400">🪙 {tourn.entryFee.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-slate-900 p-3 border border-slate-800">
              <p className="text-slate-500">Prize Pool</p>
              <p className="text-base font-black text-emerald-400">🪙 {tourn.prizePool.toLocaleString()}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
            <div className="flex justify-between text-slate-400">
              <span>Your Current Balance</span>
              <span className="font-bold text-slate-200">🪙 {(walletBalance ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Balance After Entry</span>
              <span className={`font-bold ${canAfford ? 'text-emerald-400' : 'text-rose-400'}`}>
                🪙 {balanceAfterJoin.toLocaleString()}
              </span>
            </div>
          </div>

          {!canAfford && (
            <p className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-rose-400">
              Insufficient coin balance. You need {tourn.entryFee.toLocaleString()} coins to enter.
            </p>
          )}

          {joinError && (
            <p className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-rose-400">
              {joinError}
            </p>
          )}
        </div>
      </Modal>

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
