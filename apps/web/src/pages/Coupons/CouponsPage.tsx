import { useEffect, useState } from 'react';
import { Ticket as TicketIcon, Gift, Sparkles } from 'lucide-react';
import { couponsApi } from '../../services/api/enterprise';
import type { CouponRedemption } from '@gaming-hub/shared';
import { Skeleton } from '../../components/Skeleton';
import { Button } from '../../components/ui/Button';

export const CouponsPage: React.FC = () => {
  const [redemptions, setRedemptions] = useState<CouponRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemed, setRedeemed] = useState<{ code: string; value: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await couponsApi.redemptions(1, 50);
      setRedemptions(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load coupons');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRedeem = async () => {
    if (!code.trim()) return;
    setSubmitting(true);
    setRedeemError(null);
    setRedeemed(null);
    try {
      const result = await couponsApi.redeem(code.trim());
      setRedeemed({ code: result.code, value: result.value });
      setCode('');
      await load();
    } catch (err) {
      setRedeemError(err instanceof Error ? err.message : 'Failed to redeem coupon');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Coupons</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Redeem promotional codes for bonus coins.
        </p>
      </div>

      <div className="rounded-3xl bg-gradient-to-br from-violet-600 via-purple-500 to-fuchsia-600 p-6 text-white shadow-lg">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-violet-100">
          <Gift size={16} /> Redeem a coupon
        </div>
        {redeemed ? (
          <div className="mt-3 rounded-xl bg-white/15 p-4">
            <p className="text-lg font-black">🎉 {redeemed.code} redeemed!</p>
            <p className="text-sm text-violet-100">🪙 {redeemed.value.toLocaleString()} added to your wallet.</p>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleRedeem()}
              placeholder="Enter coupon code"
              className="flex-1 rounded-xl bg-white/15 px-4 py-2 text-sm font-bold tracking-widest text-white placeholder-white/50 outline-none ring-white/30 focus:ring-2"
            />
            <Button variant="primary" size="sm" onClick={handleRedeem} disabled={submitting || !code.trim()}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {submitting ? 'Redeeming...' : 'Redeem'}
            </Button>
          </div>
        )}
        {redeemError && <p className="mt-2 text-xs text-white/90">{redeemError}</p>}
      </div>

      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <TicketIcon size={16} className="text-purple-500" /> Redemption history
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : error ? (
          <p className="p-6 text-sm text-red-500">{error}</p>
        ) : redemptions.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 dark:text-slate-400">No redemptions yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {redemptions.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-6 py-3">
                <span className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 shrink-0">
                  <TicketIcon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{r.coupon.title}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {r.coupon.code} · {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-sm font-black text-emerald-500">+🪙 {r.value.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
