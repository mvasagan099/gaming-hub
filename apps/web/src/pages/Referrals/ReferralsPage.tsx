import { useEffect, useState } from 'react';
import { Copy, Gift, Trophy, Users, Coins } from 'lucide-react';
import { referralsApi } from '../../services/api/enterprise';
import type { Referral, ReferralLeaderboardEntry, ReferralSummary } from '@gaming-hub/shared';
import { Skeleton } from '../../components/Skeleton';
import { Button } from '../../components/ui/Button';

export const ReferralsPage: React.FC = () => {
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [list, setList] = useState<Referral[]>([]);
  const [leaderboard, setLeaderboard] = useState<ReferralLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyCode, setApplyCode] = useState('');
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, l, lb] = await Promise.all([
        referralsApi.summary(),
        referralsApi.list(1, 50),
        referralsApi.leaderboard(),
      ]);
      setSummary(s);
      setList(l.items);
      setLeaderboard(lb);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load referrals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleApply = async () => {
    if (!applyCode.trim()) return;
    setSubmitting(true);
    setApplyError(null);
    try {
      await referralsApi.apply(applyCode.trim());
      setApplied(true);
      setApplyCode('');
      await load();
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Failed to apply referral code');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!summary?.code) return;
    try {
      await navigator.clipboard.writeText(summary.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const inviteUrl = summary ? `${window.location.origin}/signup?ref=${summary.code}` : '';

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Referrals</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Invite friends and earn coins when they join and play.
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : error ? (
        <div className="rounded-2xl border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-600">{error}</div>
      ) : (
        <>
          {summary && (
            <div className="rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-600 p-6 text-white shadow-lg">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-100">
                <Gift size={16} /> Your referral code
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <code className="rounded-xl bg-white/15 px-4 py-2 text-2xl font-black tracking-widest">
                  {summary.code}
                </code>
                <Button variant="primary" size="sm" onClick={() => void handleCopy()}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <p className="mt-3 text-xs text-emerald-100">Share this link: <span className="font-mono">{inviteUrl}</span></p>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl bg-white/10 p-3">
                  <p className="text-2xl font-black">{summary.totalReferrals}</p>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-100">Total</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3">
                  <p className="text-2xl font-black">{summary.completedReferrals}</p>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-100">Completed</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3">
                  <p className="text-2xl font-black">{summary.pendingReferrals}</p>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-100">Pending</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3">
                  <p className="text-2xl font-black flex items-center gap-1.5">
                    <Coins className="w-5 h-5 text-amber-300" />
                    {summary.totalCommission.toLocaleString()}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-100">Earned</p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6">
            <h3 className="text-sm font-black text-slate-900 dark:text-white mb-3">
              {applied ? 'Referral code applied' : 'Have a referral code?'}
            </h3>
            {applied ? (
              <p className="text-sm text-emerald-600">Your bonus is on its way. Keep an eye on your wallet.</p>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={applyCode}
                  onChange={(e) => setApplyCode(e.target.value)}
                  placeholder="Enter referral code"
                  className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm text-slate-900 dark:text-white"
                />
                <Button variant="primary" size="sm" onClick={handleApply} disabled={submitting || !applyCode.trim()}>
                  {submitting ? 'Applying...' : 'Apply'}
                </Button>
              </div>
            )}
            {applyError && <p className="mt-2 text-xs text-red-500">{applyError}</p>}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Users size={16} className="text-emerald-500" /> Your referrals
              </div>
              {list.length === 0 ? (
                <p className="p-6 text-sm text-slate-500 dark:text-slate-400">No referrals yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {list.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-6 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {r.referredUser?.displayName ?? 'Player'}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Joined {new Date(r.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-xs ${r.status === 'REWARDED' ? 'bg-emerald-500/10 text-emerald-600' : r.status === 'COMPLETED' ? 'bg-blue-500/10 text-blue-600' : 'bg-slate-500/10 text-slate-600'}`}>
                        {r.status}
                      </span>
                      <span className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                        <Coins className="w-3.5 h-3.5 text-amber-400 inline-block" /> {r.commission}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Trophy size={16} className="text-amber-500" /> Top referrers
              </div>
              {leaderboard.length === 0 ? (
                <p className="p-6 text-sm text-slate-500 dark:text-slate-400">No referrers yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {leaderboard.map((entry) => (
                    <li key={entry.userId} className="flex items-center gap-3 px-6 py-3">
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${entry.rank <= 3 ? 'bg-amber-500/20 text-amber-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                        {entry.rank}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {entry.displayName}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">@{entry.username}</p>
                      </div>
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                        {entry.referralCount} invites
                      </span>
                      <span className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                        <Coins className="w-3.5 h-3.5 text-amber-400 inline-block" /> {entry.commission}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
