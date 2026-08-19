import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Trophy, Users, Swords, CalendarClock, Clock,
  Loader2, CheckCircle2, AlertTriangle, Zap, XCircle, Play,
} from 'lucide-react';
import { GAME_DEFINITIONS } from '@gaming-hub/shared';
import type { TournamentStatus, BracketSlotStatus } from '@gaming-hub/shared';
import { tournamentsApi } from '../../services/api/enterprise';
import { usePlayerTournamentStore } from '../../store/playerTournamentStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/Tabs';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/Skeleton';
import { PlayerBracketView } from '../../components/tournaments/PlayerBracketView';

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
  ENDED: { variant: 'outline', label: 'Ended' },
  CANCELLED: { variant: 'danger', label: 'Cancelled' },
};

const MATCH_STATUS_BADGE: Record<string, { variant: 'success' | 'warning' | 'accent' | 'outline' | 'default'; label: string }> = {
  PENDING: { variant: 'outline', label: 'Pending' },
  READY: { variant: 'accent', label: 'Match Ready' },
  IN_PROGRESS: { variant: 'success', label: 'In Progress' },
  COMPLETED: { variant: 'default', label: 'Completed' },
  BYE: { variant: 'default', label: 'BYE' },
};

function CountdownTimer({ target }: { target: string }) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    const tick = () => {
      const diff = new Date(target).getTime() - Date.now();
      if (diff <= 0) { setRemaining('00:00:00'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return <span className="tabular-nums font-mono text-lg font-black">{remaining}</span>;
}

export function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const store = usePlayerTournamentStore();
  const { detail, bracket, myStatus, currentMatch, walletBalance, isLoading, error, events, connected } = store;

  const [activeTab, setActiveTab] = useState('bracket');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState(false);

  useEffect(() => {
    if (!id) return;
    store.fetchAll(id);
    store.subscribe(id);
    return () => store.reset();
  }, [id]);

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

  if (isLoading && !detail) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="mt-4 grid grid-cols-3 gap-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="mt-4 h-64 rounded-2xl" />
      </div>
    );
  }

  if (!detail && !isLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Trophy className="size-12 text-slate-400" />
        <p className="text-slate-500">Tournament not found</p>
        <Button variant="ghost" onClick={() => navigate('/tournaments')}>
          <ArrowLeft className="size-4" /> Back to tournaments
        </Button>
      </div>
    );
  }

  if (!detail) return null;

  const game = gameById.get(detail.gameId);
  const statusInfo = STATUS_BADGE[detail.status] ?? { variant: 'outline' as const, label: detail.status };
  const isRegOpen = detail.status === 'REGISTRATION_OPEN';
  const isFull = detail.registeredCount >= detail.maxPlayers;
  const isRegistered = detail.registered || myStatus?.isRegistered;
  const regEndsAt = detail.startTime;

  const balanceAfterJoin = (walletBalance ?? 0) - detail.entryFee;
  const canAfford = balanceAfterJoin >= 0;

  // Derive player state for UI
  const playerState = getPlayerState(detail.status, myStatus, currentMatch);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      {/* Back link */}
      <button
        onClick={() => navigate('/tournaments')}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
      >
        <ArrowLeft className="size-3" /> Tournaments
      </button>

      {/* Banner */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/60">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{game?.icon ?? '🏆'}</span>
            <div>
              <h1 className="text-2xl font-black">{detail.title}</h1>
              <p className="text-sm text-white/80">{game?.name ?? detail.gameId} · {detail.format.replace(/_/g, ' ')}</p>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-800">
          <div className="p-4 text-center">
            <p className="text-2xl font-black text-amber-500">🪙 {detail.entryFee.toLocaleString()}</p>
            <p className="text-[10px] font-semibold uppercase text-slate-500">Entry Fee</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-2xl font-black text-emerald-500">🪙 {detail.prizePool.toLocaleString()}</p>
            <p className="text-[10px] font-semibold uppercase text-slate-500">Prize Pool</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-2xl font-black text-slate-900 dark:text-white">
              {detail.registeredCount}<span className="text-lg text-slate-400">/{detail.maxPlayers}</span>
            </p>
            <p className="text-[10px] font-semibold uppercase text-slate-500">Players</p>
          </div>
        </div>

        {/* Time info */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3 dark:border-slate-800">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <CalendarClock className="size-4" />
            {isRegOpen ? (
              <span>Registration closes in <CountdownTimer target={regEndsAt} /></span>
            ) : (
              <span>Starts {new Date(detail.startTime).toLocaleString()}</span>
            )}
          </div>
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
        </div>
      </div>

      {/* Connection indicator */}
      {!connected && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-3.5" /> Reconnecting...
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-400">
          <XCircle className="size-4 shrink-0" /> {error}
          <button onClick={store.clearError} className="ml-auto text-rose-400 hover:text-rose-600">✕</button>
        </div>
      )}
      {registerSuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-4 shrink-0" /> Registered successfully!
        </div>
      )}

      {/* Player status area */}
      {playerState && (
        <PlayerStatusArea
          state={playerState}
          myStatus={myStatus}
          detail={detail}
          onPlay={() => {
            if (currentMatch?.matchId) {
              navigate(`/lobby/${detail.gameId}?matchId=${currentMatch.matchId}`);
            }
          }}
        />
      )}

      {/* Action area */}
      <div className="flex flex-wrap gap-3">
        {/* Not registered + reg open */}
        {isRegOpen && !isRegistered && (
          <Button
            variant="gold"
            size="lg"
            disabled={isFull || isJoining}
            loading={isJoining}
            onClick={() => setShowJoinModal(true)}
          >
            {isFull ? 'Registration Full' : 'Join Tournament'}
          </Button>
        )}

        {/* Registered + waiting */}
        {isRegistered && (detail.status === 'REGISTRATION_OPEN' || detail.status === 'REGISTRATION_CLOSED' || detail.status === 'UPCOMING' || detail.status === 'STARTING') && (
          <div className="flex items-center gap-3">
            <Badge variant="success" className="px-3 py-1.5 text-sm">
              <CheckCircle2 className="mr-1.5 size-3.5" /> Registered
            </Badge>
            {myStatus?.seed && (
              <span className="text-sm text-slate-500">Seed #{myStatus.seed}</span>
            )}
            {detail.status !== 'CANCELLED' && (
              <Button variant="outline" size="sm" loading={isJoining} onClick={handleCancel}>
                Cancel Registration
              </Button>
            )}
          </div>
        )}

        {/* Match ready */}
        {currentMatch && (currentMatch.status === 'READY' || currentMatch.status === 'IN_PROGRESS') && (
          <Button
            variant="primary"
            size="lg"
            onClick={() => navigate(`/lobby/${detail.gameId}?matchId=${currentMatch.matchId}`)}
          >
            <Play className="mr-2 size-4" /> Play Now
          </Button>
        )}
      </div>

      {/* Countdown for starting */}
      {detail.status === 'STARTING' && (
        <Card>
          <CardContent className="flex items-center gap-4 py-6">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/10">
              <Zap className="size-6 text-amber-500" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 dark:text-white">Tournament Starting</h3>
              <p className="text-sm text-slate-500">Get ready! The tournament is about to begin.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs: Bracket, Players */}
      <Tabs value={activeTab} onChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="bracket">Bracket</TabsTrigger>
          <TabsTrigger value="players">Players ({detail.registeredCount})</TabsTrigger>
          <TabsTrigger value="events">Events ({events.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="bracket" className="mt-4">
          {bracket && myStatus ? (
            <PlayerBracketView
              bracket={bracket}
              myStatus={myStatus}
              players={detail.players}
              onPlayMatch={(matchId) => navigate(`/lobby/${detail.gameId}?matchId=${matchId}`)}
            />
          ) : bracket ? (
            <PlayerBracketView
              bracket={bracket}
              myStatus={myStatus ?? { isRegistered: false, seed: null, eliminated: false, eliminatedInRound: null, finalRank: null, currentRoundId: null, currentMatchId: null, currentRound: null, opponent: null, matchStatus: null }}
              players={detail.players}
              onPlayMatch={(matchId) => navigate(`/lobby/${detail.gameId}?matchId=${matchId}`)}
            />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-slate-400">
                {detail.status === 'REGISTRATION_OPEN' || detail.status === 'UPCOMING'
                  ? 'Bracket will be generated when the tournament starts.'
                  : 'Bracket not available yet.'}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="players" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {detail.players.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-400">No players registered yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {detail.players.map((p) => (
                    <div key={p.userId} className="flex items-center gap-3 px-5 py-3">
                      <span className="w-8 text-center text-sm font-bold text-slate-400">
                        {p.seed ? `#${p.seed}` : '—'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {p.displayName || p.username}
                        </p>
                      </div>
                      {p.result != null && (
                        <span className="text-xs text-slate-500">#{p.result}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          <Card>
            <CardContent>
              {events.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-400">No events yet.</p>
              ) : (
                <div className="space-y-2">
                  {events.map((evt) => (
                    <div key={evt.id} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                      <Clock className="mt-0.5 size-4 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{evt.message}</p>
                        <p className="text-xs text-slate-500">{evt.type}</p>
                      </div>
                      <time className="shrink-0 text-xs text-slate-400">
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </time>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Join Confirmation Modal */}
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
            >
              Join
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs text-slate-500">Entry Fee</p>
              <p className="text-lg font-black text-amber-500">🪙 {detail.entryFee.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs text-slate-500">Prize Pool</p>
              <p className="text-lg font-black text-emerald-500">🪙 {detail.prizePool.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs text-slate-500">Players</p>
              <p className="text-lg font-black text-slate-900 dark:text-white">
                {detail.registeredCount}/{detail.maxPlayers}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
              <p className="text-xs text-slate-500">Your Balance</p>
              <p className="text-lg font-black text-slate-900 dark:text-white">
                🪙 {(walletBalance ?? 0).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Balance after */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Balance after join</span>
              <span className={`text-lg font-bold ${canAfford ? 'text-emerald-500' : 'text-rose-500'}`}>
                🪙 {balanceAfterJoin.toLocaleString()}
              </span>
            </div>
          </div>

          {!canAfford && (
            <p className="rounded-xl bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
              Insufficient balance. You need {detail.entryFee.toLocaleString()} coins to enter.
            </p>
          )}

          {joinError && (
            <p className="rounded-xl bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
              {joinError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player state derivation
// ---------------------------------------------------------------------------

interface PlayerStateInfo {
  label: string;
  variant: 'success' | 'warning' | 'danger' | 'accent' | 'default' | 'outline';
  detail: string;
  showPlay: boolean;
  showWaiting: boolean;
  waitingMessage: string;
  isBye: boolean;
  byeRound: number | null;
  isWinner: boolean;
  isEliminated: boolean;
  isFinalist: boolean;
  finalRank: number | null;
}

function getPlayerState(
  tournamentStatus: string,
  myStatus: import('@gaming-hub/shared').TournamentPlayerStatus | null,
  currentMatch: import('@gaming-hub/shared').TournamentCurrentMatchResponse | null,
): PlayerStateInfo | null {
  if (!myStatus || !myStatus.isRegistered) return null;

  const eliminated = myStatus.eliminated;
  const hasMatch = currentMatch != null;
  const matchReady = hasMatch && (currentMatch!.status === 'READY' || currentMatch!.status === 'IN_PROGRESS');
  const matchStatus = myStatus.matchStatus;

  // BYE
  if (matchStatus === 'BYE' || (tournamentStatus === 'IN_PROGRESS' && !hasMatch && !eliminated)) {
    return {
      label: 'BYE',
      variant: 'default',
      detail: myStatus.currentRound ? `You advanced to Round ${myStatus.currentRound}` : 'You received a BYE',
      showPlay: false,
      showWaiting: !hasMatch,
      waitingMessage: 'Waiting for next match...',
      isBye: true,
      byeRound: myStatus.currentRound,
      isWinner: false,
      isEliminated: false,
      isFinalist: false,
      finalRank: null,
    };
  }

  // Eliminated
  if (eliminated) {
    const isFinalist = myStatus.finalRank != null && myStatus.finalRank <= 3;
    return {
      label: isFinalist ? 'FINALIST' : 'ELIMINATED',
      variant: isFinalist ? 'accent' : 'danger',
      detail: myStatus.finalRank
        ? `Final Rank: #${myStatus.finalRank}`
        : myStatus.eliminatedInRound
          ? `Eliminated in Round ${myStatus.eliminatedInRound}`
          : 'Eliminated',
      showPlay: false,
      showWaiting: false,
      waitingMessage: '',
      isBye: false,
      byeRound: null,
      isWinner: false,
      isEliminated: true,
      isFinalist,
      finalRank: myStatus.finalRank,
    };
  }

  // Current match ready
  if (matchReady && currentMatch) {
    const isFinal = currentMatch.roundNumber >= (currentMatch.roundNumber); // simplified
    return {
      label: 'MATCH READY',
      variant: 'accent',
      detail: `Round ${currentMatch.roundNumber} — vs ${currentMatch.opponent?.username ?? 'TBD'}`,
      showPlay: true,
      showWaiting: false,
      waitingMessage: '',
      isBye: false,
      byeRound: null,
      isWinner: false,
      isEliminated: false,
      isFinalist: false,
      finalRank: null,
    };
  }

  // Waiting for opponent
  if (tournamentStatus === 'IN_PROGRESS' && !hasMatch && !eliminated) {
    return {
      label: 'WAITING',
      variant: 'warning',
      detail: myStatus.currentRound ? `Round ${myStatus.currentRound} — Waiting for opponent` : 'Waiting for next match',
      showPlay: false,
      showWaiting: true,
      waitingMessage: 'Waiting for opponent...',
      isBye: false,
      byeRound: null,
      isWinner: false,
      isEliminated: false,
      isFinalist: false,
      finalRank: null,
    };
  }

  // Tournament completed — winner
  if (tournamentStatus === 'COMPLETED' || tournamentStatus === 'SETTLED') {
    if (myStatus.finalRank === 1) {
      return {
        label: 'TOURNAMENT WINNER',
        variant: 'success',
        detail: '1st Place — Prize pending settlement',
        showPlay: false,
        showWaiting: false,
        waitingMessage: '',
        isBye: false,
        byeRound: null,
        isWinner: true,
        isEliminated: false,
        isFinalist: false,
        finalRank: 1,
      };
    }
    return {
      label: myStatus.finalRank ? `RANK #${myStatus.finalRank}` : 'COMPLETED',
      variant: 'outline',
      detail: myStatus.finalRank ? `Finished #${myStatus.finalRank}` : 'Tournament completed',
      showPlay: false,
      showWaiting: false,
      waitingMessage: '',
      isBye: false,
      byeRound: null,
      isWinner: false,
      isEliminated: true,
      isFinalist: myStatus.finalRank != null && myStatus.finalRank <= 3,
      finalRank: myStatus.finalRank,
    };
  }

  // Registered, waiting for start
  return {
    label: 'REGISTERED',
    variant: 'success',
    detail: myStatus.seed ? `Seed #${myStatus.seed} — Waiting for tournament to start` : 'Registered — Waiting for tournament',
    showPlay: false,
    showWaiting: false,
    waitingMessage: '',
    isBye: false,
    byeRound: null,
    isWinner: false,
    isEliminated: false,
    isFinalist: false,
    finalRank: null,
  };
}

// ---------------------------------------------------------------------------
// Player Status Area component
// ---------------------------------------------------------------------------

function PlayerStatusArea({
  state,
  myStatus,
  detail,
  onPlay,
}: {
  state: PlayerStateInfo;
  myStatus: import('@gaming-hub/shared').TournamentPlayerStatus | null;
  detail: import('@gaming-hub/shared').TournamentDetail;
  onPlay: () => void;
}) {
  const variantStyles: Record<string, string> = {
    success: 'border-emerald-500/30 bg-emerald-500/5',
    warning: 'border-amber-500/30 bg-amber-500/5',
    danger: 'border-rose-500/30 bg-rose-500/5',
    accent: 'border-indigo-500/30 bg-indigo-500/5',
    default: 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50',
    outline: 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
  };

  return (
    <Card className={variantStyles[state.variant]}>
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/80 dark:bg-slate-900/80">
          {state.isWinner ? (
            <Trophy className="size-6 text-amber-500" />
          ) : state.isEliminated ? (
            <XCircle className="size-6 text-rose-500" />
          ) : state.showPlay ? (
            <Play className="size-6 text-indigo-500" />
          ) : state.isBye ? (
            <Zap className="size-6 text-amber-500" />
          ) : (
            <Clock className="size-6 text-slate-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-black text-slate-900 dark:text-white">{state.label}</h3>
            {myStatus?.seed && !state.isEliminated && (
              <span className="text-xs text-slate-500">Seed #{myStatus.seed}</span>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{state.detail}</p>
        </div>
        <div className="flex items-center gap-2">
          {state.showPlay && (
            <Button variant="primary" onClick={onPlay}>
              <Play className="mr-2 size-4" /> Play Now
            </Button>
          )}
          {state.showWaiting && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" />
              {state.waitingMessage}
            </div>
          )}
          {state.isWinner && detail.status === 'SETTLED' && (
            <Badge variant="success">Prize Settled</Badge>
          )}
          {state.isWinner && detail.status !== 'SETTLED' && (
            <Badge variant="warning">Settlement Pending</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
