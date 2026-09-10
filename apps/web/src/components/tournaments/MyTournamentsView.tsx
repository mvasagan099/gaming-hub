import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Trophy,
  Users,
  Swords,
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Mail,
  Sparkles,
  Calendar,
  DollarSign,
  ChevronRight,
  Shield,
  Loader2,
  Medal,
  Crown,
  Layers,
  Coins,
} from 'lucide-react';
import { GAME_DEFINITIONS, type PlayerTournamentCareerStats } from '@gaming-hub/shared';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Skeleton } from '../Skeleton';
import { usePlayerTournamentStore } from '../../store/playerTournamentStore';
import { useAuthStore } from '../../store/authStore';
import { tournamentsApi, type PlayerMyTournamentsItem } from '../../services/api/enterprise';

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

function formatCountdown(targetDate: string | null): string {
  if (!targetDate) return '';
  const diff = new Date(targetDate).getTime() - Date.now();
  if (diff <= 0) return '00:00 remaining';
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} remaining`;
}

export function MyTournamentsView() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const { myTournaments, fetchMyTournaments, isLoading, error } = usePlayerTournamentStore();
  const [careerStats, setCareerStats] = useState<PlayerTournamentCareerStats | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'REGISTERED' | 'COMPLETED' | 'WON'>('ALL');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchMyTournaments();
    if (session?.user?.id) {
      tournamentsApi.playerCareerStats(session.user.id)
        .then(setCareerStats)
        .catch(() => undefined);
    }
  }, [fetchMyTournaments, session?.user?.id]);

  const filteredTournaments = myTournaments.filter((t) => {
    if (filter === 'ACTIVE') {
      if (t.status !== 'IN_PROGRESS' && t.myStatus !== 'MATCH_READY' && t.myStatus !== 'LIVE' && t.myStatus !== 'ADVANCED' && t.myStatus !== 'WAITING') {
        return false;
      }
    } else if (filter === 'REGISTERED') {
      if (t.myStatus !== 'REGISTERED') return false;
    } else if (filter === 'COMPLETED') {
      if (t.status !== 'COMPLETED' && t.status !== 'SETTLED' && t.myStatus !== 'ELIMINATED') return false;
    } else if (filter === 'WON') {
      if (t.myStatus !== 'WINNER') return false;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.gameId.toLowerCase().includes(q) ||
        t.myResultSummary.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Find most urgent active tournament for Hero card
  const activeHeroTourn = myTournaments.find(
    (t) => t.myStatus === 'MATCH_READY' || t.myStatus === 'LIVE' || t.myStatus === 'ADVANCED' || (t.status === 'IN_PROGRESS' && !t.eliminated)
  );

  const handleJoinMatch = (tournament: PlayerMyTournamentsItem) => {
    if (!tournament.myCurrentMatch?.matchId) {
      navigate(`/tournaments/${tournament.tournamentId}`);
      return;
    }
    navigate(`/game/${tournament.gameId}?matchId=${tournament.myCurrentMatch.matchId}&tournamentId=${tournament.tournamentId}`);
  };

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------- */}
      {/* 0. CAREER TOURNAMENT STATS PROFILE SUMMARY                    */}
      {/* ------------------------------------------------------------- */}
      {careerStats && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-md backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Trophy className="size-4 text-amber-500 dark:text-amber-400" /> Career Tournament Statistics
            </h3>
            <span className="text-xs font-mono text-amber-600 dark:text-amber-400 font-bold">
              {careerStats.rankingScore} Ranking Pts
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950/40 p-3 text-center">
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400">Played</div>
              <div className="mt-1 text-xl font-black text-slate-900 dark:text-white font-mono">{careerStats.tournamentsPlayed}</div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950/40 p-3 text-center">
              <div className="text-xs font-bold text-amber-600 dark:text-amber-400">1st Place</div>
              <div className="mt-1 text-xl font-black text-amber-600 dark:text-amber-400 font-mono">{careerStats.tournamentWins}</div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950/40 p-3 text-center">
              <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Top 4 Finishes</div>
              <div className="mt-1 text-xl font-black text-indigo-600 dark:text-indigo-400 font-mono">{careerStats.topFourFinishes}</div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950/40 p-3 text-center">
              <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Win Rate</div>
              <div className="mt-1 text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">{careerStats.winRate}%</div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950/40 p-3 text-center">
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400">Matches Won</div>
              <div className="mt-1 text-xl font-black text-slate-800 dark:text-slate-200 font-mono">{careerStats.totalMatchesWon}</div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950/40 p-3 text-center">
              <div className="text-xs font-bold text-amber-600 dark:text-amber-400">Total Prizes</div>
              <div className="mt-1 text-xl font-black text-amber-600 dark:text-amber-400 font-mono flex items-center justify-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-500" />
                {careerStats.totalPrizesWon.toLocaleString()}
              </div>
            </div>
          </div>

          {/* 5 Tier Breakdown */}
          {careerStats.tierBreakdown && careerStats.tierBreakdown.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800/80">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                <Layers className="size-3" /> Tier Participation
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {careerStats.tierBreakdown.map((t) => (
                  <div key={t.tierCode} className="rounded-lg border border-slate-200 dark:border-slate-800/60 bg-slate-50 dark:bg-slate-950/30 p-2 text-xs">
                    <div className="font-bold text-slate-700 dark:text-slate-300">{t.tierName}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {t.tournamentsPlayed} Played · <span className="text-amber-600 dark:text-amber-400 font-bold">{t.tournamentsWon} Won</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 1. CURRENT ACTIVE TOURNAMENT HERO CARD                        */}
      {/* ------------------------------------------------------------- */}
      {activeHeroTourn && (
        <div className="relative overflow-hidden rounded-3xl border border-amber-500/40 bg-gradient-to-br from-amber-50/80 via-white to-slate-50 dark:from-amber-950/40 dark:via-slate-900/90 dark:to-slate-950 p-6 shadow-xl dark:shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="absolute -right-12 -top-12 size-48 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <Badge variant="warning" className="gap-1 px-3 py-1 font-bold text-xs uppercase tracking-wider">
                  <Sparkles className="size-3.5 animate-pulse" /> Active Tournament
                </Badge>
                <Badge variant={STATUS_BADGE[activeHeroTourn.status]?.variant ?? 'default'}>
                  {STATUS_BADGE[activeHeroTourn.status]?.label ?? activeHeroTourn.status}
                </Badge>
                <Badge variant={PLAYER_STATUS_BADGE[activeHeroTourn.myStatus]?.variant ?? 'default'}>
                  {PLAYER_STATUS_BADGE[activeHeroTourn.myStatus]?.label ?? activeHeroTourn.myStatus}
                </Badge>
              </div>

              <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                🏆 {activeHeroTourn.title}
              </h2>

              <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600 dark:text-slate-300 sm:text-sm">
                <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <Swords className="size-4" /> Round {activeHeroTourn.currentRound} of {activeHeroTourn.totalRounds}
                </span>
                <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <Users className="size-4" /> Players Remaining: {activeHeroTourn.remainingPlayers}
                </span>
                {activeHeroTourn.mySeed && (
                  <span className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
                    <Shield className="size-4" /> Seed #{activeHeroTourn.mySeed}
                  </span>
                )}
              </div>

              {/* YOUR MATCH INFO */}
              {activeHeroTourn.myCurrentMatch ? (
                <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    YOUR MATCH
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-base font-bold text-slate-900 dark:text-slate-100">
                      You vs{' '}
                      <span className="text-amber-600 dark:text-amber-400">
                        {activeHeroTourn.myCurrentMatch.opponent?.displayName ||
                          activeHeroTourn.myCurrentMatch.opponent?.username ||
                          'Opponent'}
                      </span>
                      {activeHeroTourn.myCurrentMatch.opponent?.seed && (
                        <span className="ml-1 text-xs text-slate-500">
                          (Seed #{activeHeroTourn.myCurrentMatch.opponent.seed})
                        </span>
                      )}
                    </div>
                    <Badge variant={activeHeroTourn.myCurrentMatch.status === 'IN_PROGRESS' ? 'success' : 'accent'}>
                      {activeHeroTourn.myCurrentMatch.status === 'IN_PROGRESS' ? 'LIVE NOW' : 'MATCH READY'}
                    </Badge>
                  </div>

                  {activeHeroTourn.myCurrentMatch.matchDeadline && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-300 font-mono">
                      <Clock className="size-3.5" />
                      {formatCountdown(activeHeroTourn.myCurrentMatch.matchDeadline)}
                    </div>
                  )}

                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <Mail className="size-3 text-sky-500 dark:text-sky-400" />
                    <span>Check your registered email for match reminders and server alerts.</span>
                  </div>
                </div>
              ) : activeHeroTourn.myStatus === 'ADVANCED' ? (
                <div className="mt-3 rounded-2xl border border-teal-500/30 bg-teal-50 dark:bg-teal-950/30 p-4 text-teal-800 dark:text-teal-300">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <CheckCircle2 className="size-4 text-teal-600 dark:text-teal-400" /> 🎉 You Advanced to Round {activeHeroTourn.currentRound + 1}!
                  </div>
                  <p className="mt-1 text-xs text-teal-700 dark:text-teal-400/80">
                    Waiting for the next opponent's match to conclude. You will receive an email and in-app alert once ready.
                  </p>
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-4 text-slate-500 dark:text-slate-400 text-xs">
                  ⏳ Waiting for your next match to be generated by tournament orchestrator.
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2.5 sm:flex-row lg:flex-col shrink-0">
              {activeHeroTourn.myCurrentMatch && (
                <Button
                  size="lg"
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black hover:from-amber-400 hover:to-orange-400 shadow-lg shadow-amber-500/20 gap-2 text-base px-6 py-6"
                  onClick={() => handleJoinMatch(activeHeroTourn)}
                >
                  <Play className="size-5 fill-current" /> JOIN MATCH
                </Button>
              )}
              <Button
                variant="outline"
                size="lg"
                className="w-full border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/80 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 gap-2 shadow-sm"
                onClick={() => navigate(`/tournaments/${activeHeroTourn.tournamentId}`)}
              >
                View Tournament Dashboard <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. FILTER BAR & SEARCH                                        */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/60 p-1">
          {(['ALL', 'ACTIVE', 'REGISTERED', 'COMPLETED', 'WON'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                filter === tab
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab === 'WON' ? '🏆 Won (Champions)' : tab}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search my tournaments..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:border-amber-500 focus:outline-none sm:w-64 shadow-sm dark:shadow-none transition-colors"
        />
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. TOURNAMENT LIST CARDS                                      */}
      {/* ------------------------------------------------------------- */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : filteredTournaments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-12 text-center shadow-sm">
          <Trophy className="size-12 text-slate-400 dark:text-slate-600 mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">No Tournaments Found</h3>
          <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
            {filter === 'ALL'
              ? "You haven't registered for any tournaments yet. Explore the tournament hub to join upcoming cups!"
              : `No tournaments matching filter "${filter}".`}
          </p>
          <Button
            className="mt-4 bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 shadow-sm"
            onClick={() => navigate('/tournaments')}
          >
            Explore Tournaments
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTournaments.map((t) => {
            const game = gameById.get(t.gameId as any);
            return (
              <Card
                key={t.tournamentId}
                className="group relative flex flex-col justify-between overflow-hidden border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 backdrop-blur transition-all duration-200 hover:border-amber-500/50 hover:bg-slate-50 dark:hover:bg-slate-900/80 shadow-sm cursor-pointer"
                onClick={() => navigate(`/tournaments/${t.tournamentId}`)}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex size-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-base">
                        {game?.icon || '🎮'}
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          {game?.name || t.gameId}
                        </div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 line-clamp-1 group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors">
                          {t.title}
                        </h4>
                      </div>
                    </div>
                    <Badge variant={PLAYER_STATUS_BADGE[t.myStatus]?.variant ?? 'default'} className="text-[10px] px-2 py-0.5">
                      {PLAYER_STATUS_BADGE[t.myStatus]?.label ?? t.myStatus}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="p-4 pt-2 space-y-3">
                  {/* Result Summary Bar */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950/60 p-2.5">
                    <div className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">My Result</div>
                    <div className="mt-0.5 text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                      <span>{t.myResultSummary}</span>
                      {t.prizeWon != null && t.prizeWon > 0 && (
                        <span className="text-teal-600 dark:text-teal-400 font-extrabold flex items-center gap-1">
                          <DollarSign className="size-3" /> +{t.prizeWon} won
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Specs */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-slate-100 dark:bg-slate-800/40 p-1.5">
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Round</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200">
                        {t.currentRound} / {t.totalRounds}
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-100 dark:bg-slate-800/40 p-1.5">
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Players</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200">
                        {t.registeredPlayers} / {t.maxPlayers}
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-100 dark:bg-slate-800/40 p-1.5">
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Prize Pool</div>
                      <div className="font-bold text-amber-600 dark:text-amber-400">{t.prizePool}</div>
                    </div>
                  </div>

                  {/* Seed & Registration Pos */}
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800/60">
                    <span>Reg #{t.myRegistrationSequence}</span>
                    {t.mySeed && <span>Seed #{t.mySeed}</span>}
                    <span className="text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                      View Dashboard <ChevronRight className="size-3" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>

  );
}
