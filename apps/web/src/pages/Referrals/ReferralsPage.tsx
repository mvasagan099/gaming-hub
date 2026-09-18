import { useEffect, useState } from 'react';
import { Copy, Gift, Trophy, Users, Coins, Percent, ArrowUpRight, TrendingUp } from 'lucide-react';
import { referralsApi } from '../../services/api/enterprise';
import type {
  AffiliateCommissionRecord,
  Referral,
  ReferralLeaderboardEntry,
  ReferralSummary,
} from '@gaming-hub/shared';
import { Skeleton } from '../../components/Skeleton';
import { Button } from '../../components/ui/Button';

export const ReferralsPage: React.FC = () => {
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [list, setList] = useState<Referral[]>([]);
  const [leaderboard, setLeaderboard] = useState<ReferralLeaderboardEntry[]>([]);
  const [commissions, setCommissions] = useState<AffiliateCommissionRecord[]>([]);
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
      const [s, l, lb, comms] = await Promise.all([
        referralsApi.summary(),
        referralsApi.list(1, 50),
        referralsApi.leaderboard(),
        referralsApi.commissions(1, 20).catch(() => ({ items: [], total: 0 })),
      ]);
      setSummary(s);
      setList(l.items);
      setLeaderboard(lb);
      setCommissions(comms.items);
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
  const aff = summary?.affiliate;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Referrals & Affiliates</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {aff?.affiliateEnabled === false
            ? "Affiliate rewards are currently unavailable."
            : aff?.affiliateMode === "ONE_TIME"
            ? `Earn ${aff?.commissionPercent ?? 5}% when your referred player makes their first eligible Gaming Hub wallet deposit.`
            : `Earn ${aff?.commissionPercent ?? 5}% on every eligible Gaming Hub wallet deposit made by your referred players.`}
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : error ? (
        <div className="rounded-2xl border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-600">{error}</div>
      ) : (
        <>
          {/* Referral Code Hero Card */}
          {summary && (
            <div className="rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-600 p-6 sm:p-8 text-white shadow-xl">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-100">
                <Gift size={16} /> Your referral code
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <code className="rounded-2xl bg-white/20 px-5 py-2.5 text-2xl sm:text-3xl font-black tracking-widest backdrop-blur-md shadow-inner">
                  {summary.code}
                </code>
                <Button variant="primary" size="sm" onClick={() => void handleCopy()} className="rounded-xl">
                  <Copy className="mr-1.5 h-4 w-4" />
                  {copied ? 'Copied!' : 'Copy Code'}
                </Button>
              </div>
              <p className="mt-3 text-xs text-emerald-100/90">
                Share this link: <span className="font-mono bg-white/10 px-2 py-0.5 rounded-lg select-all">{inviteUrl}</span>
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm">
                  <p className="text-2xl font-black">{summary.totalReferrals}</p>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-100 font-bold">Total Referred</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm">
                  <p className="text-2xl font-black">{summary.completedReferrals}</p>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-100 font-bold">Completed</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm">
                  <p className="text-2xl font-black">{summary.pendingReferrals}</p>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-100 font-bold">Pending</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm">
                  <p className="text-2xl font-black flex items-center gap-1.5">
                    <Coins className="w-5 h-5 text-amber-300" />
                    {(aff?.totalAffiliateEarnings ?? summary.totalCommission ?? 0).toLocaleString()}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-emerald-100 font-bold">Total Earned</p>
                </div>
              </div>
            </div>
          )}

          {/* Referred By Card or Code Input */}
          {summary?.referredByCode ? (
            <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <Gift className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Referred by</p>
                  <p className="text-base font-black text-slate-900 dark:text-white">
                    @{summary.referrerUsername || 'Friend'}{' '}
                    <span className="text-xs font-mono font-normal text-emerald-600 dark:text-emerald-400">
                      ({summary.referredByCode})
                    </span>
                  </p>
                  {summary.referredStatus !== 'REWARDED' && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Referral active. Commission triggers on wallet deposit.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1 text-xs font-bold">
                  Linked
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 shadow-sm">
              <h2 className="text-base font-black text-slate-900 dark:text-white">Have a referral code?</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Support your referrer when you make deposits to your Gaming Hub wallet.
              </p>
              {applied ? (
                <p className="mt-3 text-xs font-bold text-emerald-500">Referral code applied successfully!</p>
              ) : (
                <div className="mt-4 flex max-w-sm gap-2">
                  <input
                    type="text"
                    value={applyCode}
                    onChange={(e) => setApplyCode(e.target.value.toUpperCase())}
                    placeholder="Enter referral code"
                    className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm text-slate-900 dark:text-white uppercase font-mono tracking-wider focus:outline-none focus:border-indigo-500"
                  />
                  <Button variant="primary" size="sm" onClick={handleApply} disabled={submitting || !applyCode.trim()}>
                    {submitting ? 'Applying...' : 'Apply'}
                  </Button>
                </div>
              )}
              {applyError && <p className="mt-2 text-xs font-semibold text-red-500">{applyError}</p>}
            </div>
          )}

          {/* Ongoing Affiliate Earnings Section */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-500" /> Affiliate Deposit Commissions
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {aff?.affiliateEnabled === false
                    ? "Affiliate rewards are currently unavailable."
                    : aff?.affiliateMode === "ONE_TIME"
                    ? `Earn ${aff?.commissionPercent ?? 5}% when your referred player makes their first eligible Gaming Hub wallet deposit.`
                    : `Earn ${aff?.commissionPercent ?? 5}% on every eligible Gaming Hub wallet deposit made by your referred players.`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-500/10 text-slate-600 dark:text-slate-300 px-3 py-1 text-xs font-semibold">
                  {aff?.affiliateMode === "ONE_TIME" ? "First Deposit Only" : "Every Deposit"}
                </span>
                <span className="rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-3 py-1 text-xs font-black flex items-center gap-1">
                  <Percent className="w-3.5 h-3.5" /> {aff?.commissionPercent ?? 5}% Commission Rate
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-sm">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Referred</p>
                <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{aff?.totalReferredUsers ?? summary?.totalReferrals ?? 0}</p>
                <p className="mt-1 text-[11px] text-slate-400">Total accounts joined</p>
              </div>
              <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-sm">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Active Referrals</p>
                <p className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400">{aff?.activeReferrals ?? summary?.completedReferrals ?? 0}</p>
                <p className="mt-1 text-[11px] text-slate-400">Qualified or deposited</p>
              </div>
              <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-sm">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Affiliate</p>
                <p className="mt-2 text-2xl font-black text-amber-500 flex items-center gap-1.5">
                  <Coins className="w-5 h-5 text-amber-400" />
                  {(aff?.totalAffiliateEarnings ?? 0).toLocaleString()}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">Lifetime deposit bonus</p>
              </div>
              <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-sm">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">This Month</p>
                <p className="mt-2 text-2xl font-black text-indigo-500 flex items-center gap-1.5">
                  <Coins className="w-5 h-5 text-indigo-400" />
                  {(aff?.thisMonthEarnings ?? 0).toLocaleString()}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">Current month earnings</p>
              </div>
            </div>

            {/* Commissions History Table */}
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900 dark:text-white">Recent Deposit Commissions</span>
                <span className="text-xs text-slate-500">{commissions.length} recorded</span>
              </div>
              {commissions.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  {aff?.affiliateMode === "ONE_TIME"
                    ? `No affiliate commissions yet. When referred players make their first Gaming Hub wallet deposit, your ${aff?.commissionPercent ?? 5}% bonus will appear here!`
                    : `No affiliate commissions yet. When referred players make a Gaming Hub wallet deposit, your ${aff?.commissionPercent ?? 5}% bonus will appear here!`}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-slate-500 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-3">Referee</th>
                        <th className="px-6 py-3">Wallet Deposit</th>
                        <th className="px-6 py-3">Rate</th>
                        <th className="px-6 py-3">Commission</th>
                        <th className="px-6 py-3">Date</th>
                        <th className="px-6 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {commissions.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-6 py-3.5 font-mono font-bold text-slate-900 dark:text-white">
                            @{c.refereeUsername || 'player'}
                          </td>
                          <td className="px-6 py-3.5 text-slate-700 dark:text-slate-300 font-semibold">
                            {c.depositAmount.toLocaleString()} MAIN
                          </td>
                          <td className="px-6 py-3.5 text-slate-500 font-medium">
                            {c.commissionPercent}%
                          </td>
                          <td className="px-6 py-3.5 font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <Coins className="w-3.5 h-3.5 text-amber-400 inline" /> +{c.commissionAmount.toLocaleString()} BONUS
                          </td>
                          <td className="px-6 py-3.5 text-slate-500">
                            {new Date(c.createdAt).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-3.5">
                            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              c.status === 'COMPLETED'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                            }`}>
                              {c.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Referrals & Leaderboard side-by-side */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Users size={16} className="text-emerald-500" /> Your Referrals
              </div>
              {list.length === 0 ? (
                <p className="p-6 text-sm text-slate-500 dark:text-slate-400">No referrals yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
                  {list.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-6 py-3.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {r.referredUser?.displayName ?? 'Player'}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Joined {new Date(r.createdAt).toLocaleDateString()}
                          {r.status === 'PENDING' && ' • Commission activates on deposit'}
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        r.status === 'REWARDED'
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : 'bg-amber-500/10 text-amber-600'
                      }`}>
                        {r.status === 'REWARDED' ? 'REWARDED' : 'PENDING'}
                      </span>
                      <span className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                        {r.status === 'REWARDED' ? (
                          <>
                            <Coins className="w-3.5 h-3.5 text-amber-400 inline-block" /> +{r.commission} BONUS
                          </>
                        ) : (
                          <span className="text-slate-400 font-normal text-[11px]">Deposit pending</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Trophy size={16} className="text-amber-500" /> Top Referrers
              </div>
              {leaderboard.length === 0 ? (
                <p className="p-6 text-sm text-slate-500 dark:text-slate-400">No referrers yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
                  {leaderboard.map((entry) => (
                    <li key={entry.userId} className="flex items-center gap-3 px-6 py-3.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
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
