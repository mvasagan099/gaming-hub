import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  SlidersHorizontal,
  Wallet as WalletIcon,
  Receipt,
  Coins,
} from "lucide-react";
import type { Transaction, TransactionPage, TransactionReferenceType, Wallet } from "@gaming-hub/shared";
import { apiClient, ApiError } from "../../services/api/client";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { Button } from "../../components/ui/Button";

const PAGE_SIZE = 10;

const REFERENCE_LABELS: Record<TransactionReferenceType, string> = {
  MATCH_WAGER: "Match wager",
  MATCH_PAYOUT: "Match payout",
  ADMIN: "Admin adjustment",
  BONUS: "Bonus",
  PRACTICE: "Practice win",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WalletPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [txs, setTxs] = useState<TransactionPage | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      apiClient.get<Wallet>("/wallet"),
      apiClient.get<TransactionPage>(`/wallet/transactions?page=${page}&pageSize=${PAGE_SIZE}`),
    ])
      .then(([w, t]) => {
        if (cancelled) return;
        setWallet(w);
        setTxs(t);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError) setError(err.message);
        else setError("Failed to load wallet");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page]);

  const totalPages = txs ? Math.max(1, Math.ceil(txs.total / txs.pageSize)) : 1;

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Wallet</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Your balance, wagering activity, and practice rewards.
        </p>
      </div>

      {loading && !wallet ? (
        <Skeleton className="h-32 w-full" />
      ) : wallet ? (
        <div className="rounded-3xl bg-gradient-to-br from-accent-600 via-accent-500 to-accent-700 p-6 text-white shadow-lg">
          <div className="flex items-center gap-2 text-indigo-100 text-xs font-bold uppercase tracking-widest">
            <WalletIcon size={16} /> Balance
          </div>
          <div className="mt-2 text-4xl font-black">🪙 {wallet.balance.toLocaleString()}</div>
          <div className="mt-1 text-xs text-indigo-200">Playable coins for wagering matches</div>
        </div>
      ) : null}

      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <Receipt size={16} className="text-accent-500" /> Transaction history
        </div>

        {loading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6">
            <EmptyState icon={<Receipt size={24} />} title="Could not load transactions" description={error} />
          </div>
        ) : txs && txs.items.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Coins size={24} />}
              title="No transactions yet"
              description="Wager on a match or beat the AI in practice mode to see activity here."
              action={
                <Link to="/">
                  <Button variant="primary" size="sm">Browse games</Button>
                </Link>
              }
            />
          </div>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {txs?.items.map((t) => (
                <TransactionRow key={t.id} t={t} />
              ))}
            </ul>

            <div className="px-6 py-4 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TransactionRow({ t }: { t: Transaction }) {
  const isCredit = t.type === "CREDIT";
  const icon =
    isCredit ? (
      <ArrowDownLeft size={16} className="text-emerald-500" />
    ) : t.type === "ADJUST" ? (
      <SlidersHorizontal size={16} className="text-amber-500" />
    ) : (
      <ArrowUpRight size={16} className="text-rose-500" />
    );

  const sign = t.type === "DEBIT" ? "-" : "+";

  return (
    <li className="flex items-center gap-4 px-6 py-4">
      <span className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
          {REFERENCE_LABELS[t.referenceType] ?? t.referenceType}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatDate(t.createdAt)}</p>
      </div>
      <div className="text-right shrink-0">
        <p
          className={`text-sm font-black ${
            isCredit ? "text-emerald-500" : t.type === "ADJUST" ? "text-amber-500" : "text-rose-500"
          }`}
        >
          {sign}
          {t.amount.toLocaleString()}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">bal {t.balanceAfter.toLocaleString()}</p>
      </div>
    </li>
  );
}
