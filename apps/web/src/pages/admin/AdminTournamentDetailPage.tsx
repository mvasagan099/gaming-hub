import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Shield, ShieldAlert, Trophy, Swords, Users, DollarSign, Activity, Clock, Zap, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import type { TournamentStatus } from '@gaming-hub/shared';
import { GAME_DEFINITIONS } from '@gaming-hub/shared';
import { adminApi, type AdminTournamentDetail, type AdminTournamentBracket, type TournamentHealthReport, type TournamentReconcileResult } from '../../services/api/enterprise';
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

const HEALTH_ICONS = {
  HEALTHY: <CheckCircle2 className="size-5 text-emerald-500" />,
  WARNING: <AlertTriangle className="size-5 text-amber-500" />,
  ERROR: <XCircle className="size-5 text-rose-500" />,
};

const HEALTH_VARIANT: Record<string, 'success' | 'warning' | 'danger'> = {
  HEALTHY: 'success',
  WARNING: 'warning',
  ERROR: 'danger',
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
  const [detail, setDetail] = useState<AdminTournamentDetail | null>(null);
  const [bracket, setBracket] = useState<AdminTournamentBracket | null>(null);
  const [health, setHealth] = useState<TournamentHealthReport | null>(null);
  const [reconcileResult, setReconcileResult] = useState<TournamentReconcileResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [confirmAction, setConfirmAction] = useState<ActionDef | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const { connect, disconnect, events, connected } = useAdminTournamentStore();

  const loadDetail = useCallback(async () => {
    if (!id) return;
    try {
      const data = await adminApi.tournamentDetail(id);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load detail');
    }
  }, [id]);

  const loadBracket = useCallback(async () => {
    if (!id) return;
    try {
      const data = await adminApi.tournamentBracket(id);
      setBracket(data);
    } catch { /* bracket may not exist yet */ }
  }, [id]);

  const loadHealth = useCallback(async () => {
    if (!id) return;
    try {
      const data = await adminApi.tournamentHealth(id);
      setHealth(data);
    } catch { /* health may not be available */ }
  }, [id]);

  const loadAll = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      await Promise.all([loadDetail(), loadBracket(), loadHealth()]);
    } finally {
      setIsLoading(false);
    }
  }, [id, loadDetail, loadBracket, loadHealth]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (id) connect(id);
    return () => disconnect();
  }, [id, connect, disconnect]);

  useEffect(() => {
    if (events.length > 0) {
      loadDetail();
      if (activeTab === 'bracket') loadBracket();
      if (activeTab === 'health') loadHealth();
    }
  }, [events.length]);

  const flash = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const executeAction = async (actionDef: ActionDef) => {
    setConfirmAction(null);
    setIsActionLoading(true);
    setError(null);
    try {
      await actionDef.action();
      flash(`${actionDef.label} executed`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${actionDef.label} failed`);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReconcile = async () => {
    if (!id) return;
    setIsActionLoading(true);
    setError(null);
    try {
      const result = await adminApi.tournamentReconcile(id);
      setReconcileResult(result);
      flash('Reconciliation complete');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reconcile failed');
    } finally {
      setIsActionLoading(false);
    }
  };

  const getAvailableActions = (status: string): ActionDef[] => {
    const actions: ActionDef[] = [];
    if (!id) return actions;

    switch (status) {
      case 'DRAFT':
        actions.push({ label: 'Open Registration', variant: 'primary', action: () => adminApi.openRegistration(id) });
        break;
      case 'REGISTRATION_OPEN':
        actions.push({ label: 'Close Registration', variant: 'secondary', action: () => adminApi.closeRegistration(id) });
        actions.push({ label: 'Start Tournament', variant: 'primary', action: () => adminApi.startTournament(id) });
        break;
      case 'REGISTRATION_CLOSED':
      case 'UPCOMING':
        actions.push({ label: 'Start Tournament', variant: 'primary', action: () => adminApi.startTournament(id) });
        break;
      case 'STARTING':
      case 'IN_PROGRESS':
        actions.push({ label: 'Pause', variant: 'warning' as never, action: () => adminApi.pauseTournament(id) });
        actions.push({ label: 'Cancel', variant: 'danger', action: () => adminApi.cancelTournament(id, cancelReason || undefined), requiresConfirm: true, confirmMessage: 'Cancel this tournament? This cannot be undone.' });
        break;
      case 'PAUSED':
        actions.push({ label: 'Resume', variant: 'primary', action: () => adminApi.resumeTournament(id) });
        actions.push({ label: 'Cancel', variant: 'danger', action: () => adminApi.cancelTournament(id, cancelReason || undefined), requiresConfirm: true, confirmMessage: 'Cancel this tournament? This cannot be undone.' });
        break;
      case 'COMPLETED':
      case 'ENDED':
        actions.push({ label: 'Settle', variant: 'primary', action: () => adminApi.settleTournament(id) });
        break;
    }
    return actions;
  };

  const playerMap = useMemo(() => {
    const map = new Map<string, { id: string; username: string; displayName: string }>();
    if (detail?.players) {
      for (const p of detail.players) {
        map.set(p.userId, { id: p.userId, username: p.user?.username ?? p.userId.slice(0, 8), displayName: p.user?.displayName ?? p.userId.slice(0, 8) });
      }
    }
    return map;
  }, [detail?.players]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-400">Tournament not found</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate('/admin/tournaments')}>
          <ArrowLeft className="size-4" /> Back to list
        </Button>
      </div>
    );
  }

  const actions = getAvailableActions(detail.status);

  return (
    <div className="min-h-screen space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => navigate('/admin/tournaments')}
            className="mb-2 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            <ArrowLeft className="size-3" /> Tournaments
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">{detail.title}</h1>
            <Badge variant={STATUS_VARIANT[detail.status] ?? 'default'}>
              {detail.status?.replace(/_/g, ' ')}
            </Badge>
            <Badge variant={connected ? 'success' : 'outline'} className="text-xs">
              {connected ? 'Live' : 'Disconnected'}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {gameById.get(detail.gameId)?.name ?? detail.gameId} · {detail.format?.replace(/_/g, ' ')} · Created {new Date(detail.createdAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <Button variant="outline" loading={isActionLoading} onClick={handleReconcile}>
            <Shield className="size-4" /> Reconcile
          </Button>
        </div>
      </div>

      {/* Messages */}
      {successMessage && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
          {successMessage}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="bracket">Bracket</TabsTrigger>
          <TabsTrigger value="matches">Matches</TabsTrigger>
          <TabsTrigger value="players">Players</TabsTrigger>
          <TabsTrigger value="prizes">Prizes</TabsTrigger>
          <TabsTrigger value="settlement">Settlement</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Users className="size-5 text-slate-400" />
                  <div>
                    <p className="text-xs text-slate-500">Players</p>
                    <p className="text-lg font-bold">{detail._count?.players ?? detail.players?.length ?? 0}/{detail.maxPlayers}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <DollarSign className="size-5 text-slate-400" />
                  <div>
                    <p className="text-xs text-slate-500">Prize Pool</p>
                    <p className="text-lg font-bold">{(detail.grossPool || detail.prizePool).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Trophy className="size-5 text-slate-400" />
                  <div>
                    <p className="text-xs text-slate-500">Entry Fee</p>
                    <p className="text-lg font-bold">{detail.entryFee.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Swords className="size-5 text-slate-400" />
                  <div>
                    <p className="text-xs text-slate-500">Rounds</p>
                    <p className="text-lg font-bold">{detail._count?.rounds ?? detail.rounds?.length ?? 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Game</dt>
                    <dd className="font-medium">{gameById.get(detail.gameId)?.name ?? detail.gameId}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Format</dt>
                    <dd className="font-medium">{detail.format?.replace(/_/g, ' ')}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Seed Method</dt>
                    <dd className="font-medium">{detail.seedMethod?.replace(/_/g, ' ')}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">State Version</dt>
                    <dd className="font-medium">{detail.stateVersion}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Min / Max Players</dt>
                    <dd className="font-medium">{detail.minPlayers} / {detail.maxPlayers}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Schedule</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Start Time</dt>
                    <dd className="font-medium">{detail.startTime ? new Date(detail.startTime).toLocaleString() : '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Registration Ends</dt>
                    <dd className="font-medium">{detail.registrationEndsAt ? new Date(detail.registrationEndsAt).toLocaleString() : '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">End Time</dt>
                    <dd className="font-medium">{detail.endTime ? new Date(detail.endTime).toLocaleString() : '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Settled At</dt>
                    <dd className="font-medium">{detail.settledAt ? new Date(detail.settledAt).toLocaleString() : '—'}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>

          {detail.description && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{detail.description}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Bracket Tab */}
        <TabsContent value="bracket" className="mt-6">
          {bracket ? (
            <AdminTournamentBracketView bracket={bracket} playerMap={playerMap} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-sm text-slate-400">
                Bracket not available yet
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Matches Tab */}
        <TabsContent value="matches" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Rounds & Matches ({detail.rounds?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.rounds && detail.rounds.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 dark:border-slate-700">
                      <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                        <th className="pb-2 pr-4">Round</th>
                        <th className="pb-2 pr-4">Match</th>
                        <th className="pb-2 pr-4">Status</th>
                        <th className="pb-2 pr-4">Player A</th>
                        <th className="pb-2 pr-4">Player B</th>
                        <th className="pb-2 pr-4 text-center">Score</th>
                        <th className="pb-2 pr-4">Winner</th>
                        <th className="pb-2">BYE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {detail.rounds.map((round) => {
                        const playerA = detail.players?.find((p) => p.userId === round.playerAId);
                        const playerB = detail.players?.find((p) => p.userId === round.playerBId);
                        const winner = detail.players?.find((p) => p.userId === round.winnerId);
                        return (
                          <tr key={round.id} className="text-slate-600 dark:text-slate-400">
                            <td className="py-2 pr-4 font-medium">R{round.roundNumber}</td>
                            <td className="py-2 pr-4">M{round.matchNumber}</td>
                            <td className="py-2 pr-4">
                              <Badge variant={
                                round.status === 'FINISHED' ? 'success' :
                                round.status === 'ACTIVE' ? 'accent' : 'outline'
                              }>
                                {round.status}
                              </Badge>
                            </td>
                            <td className="py-2 pr-4">{playerA?.user?.username ?? round.playerAId?.slice(0, 8) ?? '—'}</td>
                            <td className="py-2 pr-4">{playerB?.user?.username ?? round.playerBId?.slice(0, 8) ?? '—'}</td>
                            <td className="py-2 pr-4 text-center tabular-nums">{round.playerAScore} - {round.playerBScore}</td>
                            <td className="py-2 pr-4">{winner?.user?.username ?? '—'}</td>
                            <td className="py-2">{round.isBye ? '✓' : ''}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">No rounds yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Players Tab */}
        <TabsContent value="players" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Registered Players ({detail.players?.length ?? 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.players && detail.players.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 dark:border-slate-700">
                      <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                        <th className="pb-2 pr-4">Seed</th>
                        <th className="pb-2 pr-4">Player</th>
                        <th className="pb-2 pr-4">Final Rank</th>
                        <th className="pb-2 pr-4">Eliminated</th>
                        <th className="pb-2 pr-4">Elim. Round</th>
                        <th className="pb-2">Registered</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {detail.players.map((p) => (
                        <tr key={p.id} className="text-slate-600 dark:text-slate-400">
                          <td className="py-2 pr-4 tabular-nums">{p.seed ?? '—'}</td>
                          <td className="py-2 pr-4 font-medium text-slate-900 dark:text-slate-100">
                            {p.user?.username ?? p.userId.slice(0, 8)}
                          </td>
                          <td className="py-2 pr-4">{p.finalRank ?? '—'}</td>
                          <td className="py-2 pr-4">
                            <Badge variant={p.eliminated ? 'danger' : 'success'}>
                              {p.eliminated ? 'Eliminated' : 'Active'}
                            </Badge>
                          </td>
                          <td className="py-2 pr-4">{p.eliminatedInRound ?? '—'}</td>
                          <td className="py-2">{new Date(p.registeredAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">No players registered</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Prizes Tab */}
        <TabsContent value="prizes" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Prize Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.prizes && detail.prizes.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 dark:border-slate-700">
                      <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                        <th className="pb-2 pr-4">Rank</th>
                        <th className="pb-2 pr-4">Player</th>
                        <th className="pb-2 pr-4 text-right">Amount</th>
                        <th className="pb-2 pr-4">Status</th>
                        <th className="pb-2">Paid At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {detail.prizes.map((prize, i) => {
                        const player = detail.players?.find((p) => p.userId === prize.userId);
                        return (
                          <tr key={i} className="text-slate-600 dark:text-slate-400">
                            <td className="py-2 pr-4 font-bold">#{prize.rank}</td>
                            <td className="py-2 pr-4 font-medium text-slate-900 dark:text-slate-100">
                              {player?.user?.username ?? prize.userId.slice(0, 8)}
                            </td>
                            <td className="py-2 pr-4 text-right tabular-nums font-semibold">
                              {prize.amount.toLocaleString()}
                            </td>
                            <td className="py-2 pr-4">
                              <Badge variant={prize.status === 'PAID' ? 'success' : 'outline'}>
                                {prize.status}
                              </Badge>
                            </td>
                            <td className="py-2">{prize.paidAt ? new Date(prize.paidAt).toLocaleString() : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">No prizes configured</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settlement Tab */}
        <TabsContent value="settlement" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Settlement</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Status</dt>
                  <dd>
                    <Badge variant={detail.status === 'SETTLED' ? 'success' : 'outline'}>
                      {detail.status === 'SETTLED' ? 'Settled' : 'Not Settled'}
                    </Badge>
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Settled At</dt>
                  <dd className="font-medium">{detail.settledAt ? new Date(detail.settledAt).toLocaleString() : '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Total Prize Distributed</dt>
                  <dd className="font-medium tabular-nums">
                    {detail.prizes?.reduce((sum, p) => sum + p.amount, 0).toLocaleString() ?? 0}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Paid Out</dt>
                  <dd className="font-medium tabular-nums">
                    {detail.prizes?.filter((p) => p.status === 'PAID').reduce((sum, p) => sum + p.amount, 0).toLocaleString() ?? 0}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Health Tab */}
        <TabsContent value="health" className="mt-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Health Report</CardTitle>
                  <Button variant="outline" size="sm" loading={isActionLoading} onClick={loadHealth}>
                    <Activity className="size-4" /> Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {health ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      {HEALTH_ICONS[health.health]}
                      <Badge variant={HEALTH_VARIANT[health.health]}>
                        {health.health}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                        <p className="text-xs text-slate-500">Active Matches</p>
                        <p className="text-lg font-bold">{health.activeMatches}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                        <p className="text-xs text-slate-500">Pending Matches</p>
                        <p className="text-lg font-bold">{health.pendingMatches}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                        <p className="text-xs text-slate-500">Completed</p>
                        <p className="text-lg font-bold">{health.completedMatches}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                        <p className="text-xs text-slate-500">Missing</p>
                        <p className="text-lg font-bold">{health.missingMatches}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-slate-400">Health data not available</p>
                )}
              </CardContent>
            </Card>

            {reconcileResult && (
              <Card>
                <CardHeader>
                  <CardTitle>Reconcile Result</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Status</dt>
                      <dd className="font-medium">{reconcileResult.status}</dd>
                    </div>
                    {reconcileResult.repaired.length > 0 && (
                      <div>
                        <dt className="text-sm text-slate-500 mb-1">Repaired</dt>
                        <dd className="flex flex-wrap gap-1">
                          {reconcileResult.repaired.map((r, i) => (
                            <Badge key={i} variant="success">{r}</Badge>
                          ))}
                        </dd>
                      </div>
                    )}
                    {reconcileResult.warnings.length > 0 && (
                      <div>
                        <dt className="text-sm text-slate-500 mb-1">Warnings</dt>
                        <dd className="flex flex-wrap gap-1">
                          {reconcileResult.warnings.map((w, i) => (
                            <Badge key={i} variant="warning">{w}</Badge>
                          ))}
                        </dd>
                      </div>
                    )}
                    {reconcileResult.errors.length > 0 && (
                      <div>
                        <dt className="text-sm text-slate-500 mb-1">Errors</dt>
                        <dd className="flex flex-wrap gap-1">
                          {reconcileResult.errors.map((e, i) => (
                            <Badge key={i} variant="danger">{e}</Badge>
                          ))}
                        </dd>
                      </div>
                    )}
                  </dl>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Events Tab */}
        <TabsContent value="events" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Live Events</CardTitle>
            </CardHeader>
            <CardContent>
              {events.length > 0 ? (
                <div className="space-y-2">
                  {events.map((evt) => (
                    <div key={evt.id} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                      <Clock className="size-4 mt-0.5 text-slate-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{evt.message}</p>
                        <p className="text-xs text-slate-500">{evt.type}</p>
                      </div>
                      <time className="text-xs text-slate-400 shrink-0">
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </time>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-slate-400">No events yet — connect to receive live updates</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirm Modal */}
      <Modal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={confirmAction?.label}
        description={confirmAction?.confirmMessage}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button
              variant={confirmAction?.variant ?? 'danger'}
              loading={isActionLoading}
              onClick={() => confirmAction && executeAction(confirmAction)}
            >
              Confirm
            </Button>
          </>
        }
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Reason (optional)</label>
          <input
            type="text"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            placeholder="Cancellation reason"
          />
        </div>
      </Modal>
    </div>
  );
}
