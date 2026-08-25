import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShieldAlert,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Eye,
  RefreshCw,
  Play,
  FileCheck,
  Award,
  ArrowRight,
  Send,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminTournamentsApi } from '../../services/api/enterprise';
import type {
  TournamentDisputeSummary,
  TournamentDisputeDetail,
  TournamentDisputeStatus,
  TournamentDisputePriority,
  TournamentDisputeResolutionAction,
} from '@gaming-hub/shared';
import { GAME_DEFINITIONS } from '@gaming-hub/shared';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';

const gameById = new Map(GAME_DEFINITIONS.map((g) => [g.id, g]));

const PRIORITY_BADGE: Record<TournamentDisputePriority, { variant: 'danger' | 'warning' | 'default' | 'outline'; label: string }> = {
  CRITICAL: { variant: 'danger', label: 'CRITICAL (FINAL)' },
  HIGH: { variant: 'warning', label: 'HIGH' },
  NORMAL: { variant: 'default', label: 'NORMAL' },
  LOW: { variant: 'outline', label: 'LOW' },
};

const STATUS_BADGE: Record<TournamentDisputeStatus, { variant: 'danger' | 'warning' | 'success' | 'outline' | 'default'; label: string }> = {
  OPEN: { variant: 'danger', label: 'OPEN' },
  UNDER_REVIEW: { variant: 'warning', label: 'UNDER REVIEW' },
  RESOLVED: { variant: 'success', label: 'RESOLVED' },
  REJECTED: { variant: 'outline', label: 'REJECTED' },
  CLOSED: { variant: 'outline', label: 'CLOSED' },
};

export function AdminTournamentDisputesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [disputes, setDisputes] = useState<TournamentDisputeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || '');
  const [priorityFilter, setPriorityFilter] = useState<string>(searchParams.get('priority') || '');
  const [gameFilter, setGameFilter] = useState<string>(searchParams.get('gameId') || '');
  const [search, setSearch] = useState('');

  // Selected Dispute Detail for Review Modal
  const [selectedDisputeId, setSelectedDisputeId] = useState<string | null>(null);
  const [disputeDetail, setDisputeDetail] = useState<TournamentDisputeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Resolution Form State
  const [resolutionAction, setResolutionAction] = useState<TournamentDisputeResolutionAction>('CONFIRM_RESULT');
  const [adminNotes, setAdminNotes] = useState('');
  const [overrideWinnerId, setOverrideWinnerId] = useState('');
  const [overrideScoreA, setOverrideScoreA] = useState<number>(0);
  const [overrideScoreB, setOverrideScoreB] = useState<number>(0);
  const [justificationReason, setJustificationReason] = useState('');
  const [resolving, setResolving] = useState(false);

  const fetchDisputes = async () => {
    setLoading(true);
    try {
      const res = await adminTournamentsApi.listDisputes({
        page,
        pageSize,
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        gameId: gameFilter || undefined,
      });
      setDisputes(res.items);
      setTotal(res.total);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load tournament disputes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDisputes();
  }, [page, statusFilter, priorityFilter, gameFilter]);

  const openReviewModal = async (id: string) => {
    setSelectedDisputeId(id);
    setDetailLoading(true);
    try {
      const detail = await adminTournamentsApi.getDispute(id);
      setDisputeDetail(detail);
      setAdminNotes(detail.adminNotes || '');
      setOverrideWinnerId(detail.match.winnerIds?.[0] || '');
      setOverrideScoreA(detail.match.playerA.score);
      setOverrideScoreB(detail.match.playerB.score);
      setJustificationReason('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load dispute details');
      setSelectedDisputeId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeReviewModal = () => {
    setSelectedDisputeId(null);
    setDisputeDetail(null);
    setAdminNotes('');
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeDetail) return;

    if (resolutionAction === 'OVERRIDE_RESULT') {
      if (!justificationReason.trim() || justificationReason.trim().length < 5) {
        toast.error('Mandatory justification reason must be at least 5 characters for result override');
        return;
      }
      if (!overrideWinnerId) {
        toast.error('Please select the new match winner');
        return;
      }
    }

    setResolving(true);
    try {
      await adminTournamentsApi.resolveDispute(disputeDetail.id, {
        action: resolutionAction,
        adminNotes: adminNotes.trim(),
        newWinnerId: resolutionAction === 'OVERRIDE_RESULT' ? overrideWinnerId : undefined,
        newScoreA: resolutionAction === 'OVERRIDE_RESULT' ? overrideScoreA : undefined,
        newScoreB: resolutionAction === 'OVERRIDE_RESULT' ? overrideScoreB : undefined,
        justificationReason: resolutionAction === 'OVERRIDE_RESULT' ? justificationReason.trim() : undefined,
      });

      toast.success(`Dispute ${disputeDetail.disputeId} processed successfully!`);
      closeReviewModal();
      fetchDisputes();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to resolve dispute');
    } finally {
      setResolving(false);
    }
  };

  const openCount = disputes.filter((d) => d.status === 'OPEN').length;
  const criticalCount = disputes.filter((d) => d.priority === 'CRITICAL').length;
  const underReviewCount = disputes.filter((d) => d.status === 'UNDER_REVIEW').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/admin/tournaments')}
              className="text-xs font-bold text-slate-400 hover:text-white"
            >
              Tournaments
            </button>
            <span className="text-slate-600">/</span>
            <span className="text-xs font-bold text-amber-400">Disputes Queue</span>
          </div>
          <h1 className="text-2xl font-black text-slate-100 flex items-center gap-2.5 mt-1">
            <ShieldAlert className="size-7 text-amber-400" />
            Tournament Result Disputes & Verification
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Review player result reports against server-authoritative event logs, game state versions, and immutable SHA256 integrity snapshots.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDisputes}
            disabled={loading}
            className="border-slate-800 bg-slate-900/60 text-slate-300 gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => navigate('/admin/tournaments')}
            className="bg-slate-800 text-slate-200 hover:bg-slate-700 font-bold"
          >
            Back to Tournaments
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card className="border-slate-800 bg-slate-900/60 backdrop-blur">
          <CardContent className="p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Disputes</div>
            <div className="mt-1 text-2xl font-black text-slate-100">{total}</div>
          </CardContent>
        </Card>
        <Card className="border-rose-500/20 bg-rose-500/5 backdrop-blur">
          <CardContent className="p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-rose-400">Open Reports</div>
            <div className="mt-1 text-2xl font-black text-rose-300">{openCount}</div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5 backdrop-blur">
          <CardContent className="p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-400">Critical (Finals)</div>
            <div className="mt-1 text-2xl font-black text-amber-300">{criticalCount}</div>
          </CardContent>
        </Card>
        <Card className="border-indigo-500/20 bg-indigo-500/5 backdrop-blur">
          <CardContent className="p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-indigo-400">Under Review</div>
            <div className="mt-1 text-2xl font-black text-indigo-300">{underReviewCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by dispute ID or player..."
            className="w-full rounded-xl border border-slate-800 bg-slate-950/60 py-2 pl-9 pr-4 text-xs text-slate-100 outline-none focus:border-amber-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200"
        >
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="RESOLVED">Resolved</option>
          <option value="REJECTED">Rejected</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200"
        >
          <option value="">All Priorities</option>
          <option value="CRITICAL">Critical (Final)</option>
          <option value="HIGH">High</option>
          <option value="NORMAL">Normal</option>
          <option value="LOW">Low</option>
        </select>

        <select
          value={gameFilter}
          onChange={(e) => setGameFilter(e.target.value)}
          className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200"
        >
          <option value="">All Games</option>
          {GAME_DEFINITIONS.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>

      {/* Disputes Table */}
      <Card className="overflow-hidden border-slate-800 bg-slate-900/60 backdrop-blur">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3.5">Dispute ID</th>
                  <th className="px-4 py-3.5">Tournament & Game</th>
                  <th className="px-4 py-3.5">Match & Round</th>
                  <th className="px-4 py-3.5">Reported By</th>
                  <th className="px-4 py-3.5">Reason</th>
                  <th className="px-4 py-3.5">Priority</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Date</th>
                  <th className="px-4 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      Loading disputes...
                    </td>
                  </tr>
                ) : disputes.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      No disputes found matching current filters.
                    </td>
                  </tr>
                ) : (
                  disputes.map((d) => {
                    const game = d.gameId ? gameById.get(d.gameId as any) : undefined;
                    const pInfo = PRIORITY_BADGE[d.priority] || { variant: 'default' as const, label: d.priority };
                    const sInfo = STATUS_BADGE[d.status] || { variant: 'default' as const, label: d.status };

                    return (
                      <tr key={d.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-amber-400">
                          {d.disputeId}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-100 truncate max-w-[180px]">
                            {d.tournamentTitle || d.tournamentId}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {game?.name || d.gameId}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-200">Round {d.roundNumber}</div>
                          <div className="font-mono text-[10px] text-slate-500 truncate max-w-[120px]">{d.matchId}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-200">{d.userDisplayName || d.userName || d.userId}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-300">{d.reason.replace(/_/g, ' ')}</span>
                          <p className="text-[10px] text-slate-500 truncate max-w-[180px]">{d.description}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={pInfo.variant}>{pInfo.label}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={sInfo.variant}>{sInfo.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-[11px]">
                          {new Date(d.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openReviewModal(d.id)}
                            className="border-slate-700 bg-slate-800/80 text-amber-400 hover:bg-amber-500 hover:text-slate-950 font-bold gap-1"
                          >
                            <Eye className="size-3.5" />
                            Review
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

      {/* Review & Resolution Modal */}
      {selectedDisputeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
            {detailLoading || !disputeDetail ? (
              <div className="p-12 text-center text-slate-400">Loading dispute audit details...</div>
            ) : (
              <div>
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 py-4 sticky top-0 z-10">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 font-bold">
                      <ShieldAlert className="size-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-black text-slate-100">Dispute Review: {disputeDetail.disputeId}</h2>
                        <Badge variant={STATUS_BADGE[disputeDetail.status]?.variant || 'default'}>
                          {disputeDetail.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400">
                        {disputeDetail.tournament.title} · Round {disputeDetail.roundNumber}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={closeReviewModal}
                    className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                  >
                    &times;
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {/* Match Participants & Score Board */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                      Authoritative Match Result
                    </div>
                    <div className="grid grid-cols-3 items-center text-center gap-4">
                      {/* Player A */}
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-slate-200 truncate">
                          {disputeDetail.match.playerA.displayName} ({disputeDetail.match.playerA.username})
                        </div>
                        <div className="text-2xl font-black text-amber-400">{disputeDetail.match.playerA.score}</div>
                        {disputeDetail.match.winnerIds.includes(disputeDetail.match.playerA.id) && (
                          <Badge variant="success">Declared Winner</Badge>
                        )}
                      </div>

                      {/* VS & Result Reason */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">VS</span>
                        <div className="text-[11px] font-mono text-slate-400">
                          Reason: {disputeDetail.match.resultReason}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Events Recorded: {disputeDetail.authoritativeEventsSummary?.totalEvents ?? 0}
                        </div>
                      </div>

                      {/* Player B */}
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-slate-200 truncate">
                          {disputeDetail.match.playerB.displayName} ({disputeDetail.match.playerB.username})
                        </div>
                        <div className="text-2xl font-black text-amber-400">{disputeDetail.match.playerB.score}</div>
                        {disputeDetail.match.winnerIds.includes(disputeDetail.match.playerB.id) && (
                          <Badge variant="success">Declared Winner</Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Server Authoritative Integrity Reference */}
                  {disputeDetail.snapshot && (
                    <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-xs space-y-2">
                      <div className="flex items-center gap-2 font-bold text-indigo-300">
                        <FileCheck className="size-4 text-indigo-400" />
                        Server Authoritative Result Snapshot & SHA256 Integrity
                      </div>
                      <div className="font-mono text-[11px] text-slate-400 break-all bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                        Hash: {disputeDetail.snapshot.integrityHash}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                        <span>Verified: {disputeDetail.snapshot.isVerified ? 'YES (Tamper-Free)' : 'NO'}</span>
                        <span>State Version: v{disputeDetail.snapshot.stateVersion}</span>
                        <span>Review Status: {disputeDetail.snapshot.reviewStatus}</span>
                      </div>
                    </div>
                  )}

                  {/* Player Claim / Dispute Reason */}
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Player Claim ({disputeDetail.userName})
                      </span>
                      <Badge variant="warning">{disputeDetail.reason.replace(/_/g, ' ')}</Badge>
                    </div>
                    <p className="text-xs text-slate-200 bg-slate-900/80 p-3 rounded-xl border border-slate-800/80">
                      {disputeDetail.description}
                    </p>
                    {disputeDetail.evidenceUrls.length > 0 && (
                      <div className="pt-2">
                        <span className="text-[11px] text-slate-400 font-bold">Evidence Links:</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {disputeDetail.evidenceUrls.map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-[11px] text-amber-400 underline hover:text-amber-300"
                            >
                              <ExternalLink className="size-3" /> Evidence #{i + 1}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Resolution Controls Form */}
                  <form onSubmit={handleResolve} className="space-y-4 pt-2 border-t border-slate-800">
                    <div className="space-y-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                        Resolution Action
                      </label>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {(['CONFIRM_RESULT', 'REJECT_DISPUTE', 'REQUEST_REVIEW', 'OVERRIDE_RESULT'] as TournamentDisputeResolutionAction[]).map((act) => (
                          <button
                            key={act}
                            type="button"
                            onClick={() => setResolutionAction(act)}
                            className={`rounded-xl border p-2.5 text-center text-xs font-bold transition-all ${
                              resolutionAction === act
                                ? act === 'OVERRIDE_RESULT'
                                  ? 'border-rose-500 bg-rose-500/20 text-rose-300 shadow-sm'
                                  : 'border-amber-500 bg-amber-500/20 text-amber-300 shadow-sm'
                                : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                            }`}
                          >
                            {act.replace(/_/g, ' ')}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Result Override Inputs */}
                    {resolutionAction === 'OVERRIDE_RESULT' && (
                      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 space-y-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-rose-400">
                          <AlertTriangle className="size-4" />
                          WARNING: Authorized Result Override Pipeline
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Overriding this match will reconcile bracket slots, winner advancement, and recalculate settlement entries idempotently.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-300 mb-1">New Winner</label>
                            <select
                              value={overrideWinnerId}
                              onChange={(e) => setOverrideWinnerId(e.target.value)}
                              className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2 text-xs text-slate-100"
                            >
                              <option value={disputeDetail.match.playerA.id}>{disputeDetail.match.playerA.displayName} (Player A)</option>
                              <option value={disputeDetail.match.playerB.id}>{disputeDetail.match.playerB.displayName} (Player B)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-300 mb-1">Score A</label>
                            <input
                              type="number"
                              value={overrideScoreA}
                              onChange={(e) => setOverrideScoreA(Number(e.target.value))}
                              className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2 text-xs text-slate-100"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-300 mb-1">Score B</label>
                            <input
                              type="number"
                              value={overrideScoreB}
                              onChange={(e) => setOverrideScoreB(Number(e.target.value))}
                              className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2 text-xs text-slate-100"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-rose-400 mb-1">
                            Justification Reason (Mandatory Audit Log)
                          </label>
                          <textarea
                            value={justificationReason}
                            onChange={(e) => setJustificationReason(e.target.value)}
                            placeholder="Explain the technical evidence or rule justification for overriding this result..."
                            rows={2}
                            className="w-full rounded-xl border border-rose-500/40 bg-slate-950 p-2.5 text-xs text-slate-100 outline-none resize-none"
                          />
                        </div>
                      </div>
                    )}

                    {/* Admin Notes */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                        Internal Admin Notes (Private)
                      </label>
                      <textarea
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        placeholder="Internal notes about event analysis, replay review, or action rationale..."
                        rows={2}
                        className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-xs text-slate-100 outline-none resize-none"
                      />
                    </div>

                    {/* Submit Actions */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <Button type="button" variant="ghost" size="sm" onClick={closeReviewModal} disabled={resolving}>
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={resolving}
                        className={`font-bold gap-1.5 ${
                          resolutionAction === 'OVERRIDE_RESULT'
                            ? 'bg-rose-600 text-white hover:bg-rose-500'
                            : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                        }`}
                      >
                        <CheckCircle2 className="size-3.5" />
                        {resolving ? 'Executing...' : `Apply: ${resolutionAction.replace(/_/g, ' ')}`}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
