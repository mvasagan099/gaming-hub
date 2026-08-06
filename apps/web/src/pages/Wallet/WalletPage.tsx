import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  SlidersHorizontal,
  Wallet as WalletIcon,
  Receipt,
  Coins,
  Gift,
  Lock,
  Star,
  Percent,
  Download,
} from "lucide-react";
import type {
  Transaction,
  TransactionReferenceType,
  Wallet,
  WalletBalanceType,
} from "@gaming-hub/shared";
import { apiClient, ApiError } from "../../services/api/client";
import { walletApi } from "../../services/api/enterprise";
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
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  REFERRAL: "Referral reward",
  COUPON: "Coupon",
  TOURNAMENT_ENTRY: "Tournament entry",
  TOURNAMENT_PRIZE: "Tournament prize",
  LOCKED_CREDIT: "Locked credit",
  REWARD_CREDIT: "Reward credit",
  CASHBACK_CREDIT: "Cashback",
  WAGER_REFUND: "Wager refund",
  REVERSAL: "Reversal",
};

const WALLET_TABS: Array<{ value: WalletBalanceType; label: string }> = [
  { value: "MAIN", label: "Main" },
  { value: "BONUS", label: "Bonus" },
  { value: "LOCKED", label: "Locked" },
  { value: "REWARD", label: "Reward" },
  { value: "CASHBACK", label: "Cashback" },
];

const REFERENCE_FILTERS: Array<TransactionReferenceType> = [
  "DEPOSIT",
  "WITHDRAWAL",
  "MATCH_WAGER",
  "MATCH_PAYOUT",
  "BONUS",
  "REFERRAL",
  "COUPON",
  "PRACTICE",
  "TOURNAMENT_ENTRY",
  "TOURNAMENT_PRIZE",
  "LOCKED_CREDIT",
  "REWARD_CREDIT",
  "CASHBACK_CREDIT",
  "ADMIN",
];

const WALLET_ICONS: Record<WalletBalanceType, React.ReactNode> = {
  MAIN: <WalletIcon size={14} />,
  BONUS: <Gift size={14} />,
  LOCKED: <Lock size={14} />,
  REWARD: <Star size={14} />,
  CASHBACK: <Percent size={14} />,
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
  const [txs, setTxs] = useState<{ items: Transaction[]; total: number; page: number; pageSize: number } | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<WalletBalanceType>("MAIN");
  const [refFilter, setRefFilter] = useState<TransactionReferenceType | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      apiClient.get<Wallet>("/wallet"),
      walletApi.transactions(page, PAGE_SIZE, filter, refFilter || undefined),
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
  }, [page, filter, refFilter]);

  const totalPages = txs ? Math.max(1, Math.ceil(txs.total / txs.pageSize)) : 1;

  const exportCsv = () => {
    if (!txs || txs.items.length === 0) return;
    const header = ["Date", "Type", "Wallet", "Reference", "Amount", "Balance After"];
    const rows = txs.items.map((t) => [
      new Date(t.createdAt).toISOString(),
      t.type,
      t.walletType,
      REFERENCE_LABELS[t.referenceType] ?? t.referenceType,
      t.type === "DEBIT" ? `-${t.amount}` : String(t.amount),
      String(t.balanceAfter),
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wallet-${filter.toLowerCase()}-statement.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Wallet</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Your balances, wagering activity, and rewards.
        </p>
      </div>

      {loading && !wallet ? (
        <Skeleton className="h-32 w-full" />
      ) : wallet ? (
        <>
          <div className="rounded-3xl bg-gradient-to-br from-accent-600 via-accent-500 to-accent-700 p-6 text-white shadow-lg">
            <div className="flex items-center gap-2 text-indigo-100 text-xs font-bold uppercase tracking-widest">
              <WalletIcon size={16} /> Main Balance
            </div>
            <div className="mt-2 text-4xl font-black">🪙 {wallet.balance.toLocaleString()}</div>
            <div className="mt-1 text-xs text-indigo-200">Playable coins for wagering matches</div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SubBalanceCard label="Bonus" value={wallet.bonusBalance} icon={<Gift size={16} />} />
            <SubBalanceCard label="Locked" value={wallet.lockedBalance} icon={<Lock size={16} />} />
            <SubBalanceCard label="Reward" value={wallet.rewardBalance} icon={<Star size={16} />} />
            <SubBalanceCard label="Cashback" value={wallet.cashbackBalance} icon={<Percent size={16} />} />
          </div>
        </>
      ) : null}

      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Receipt size={16} className="text-accent-500" /> Transaction history
          </div>
          <div className="flex flex-wrap gap-1">
            {WALLET_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  setFilter(tab.value);
                  setPage(1);
                }}
                className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filter === tab.value
                    ? "bg-accent-500 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                }`}
              >
                {WALLET_ICONS[tab.value]}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2">
          <select
            value={refFilter}
            onChange={(e) => {
              setRefFilter(e.target.value as TransactionReferenceType | "");
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-500"
          >
            <option value="">All reference types</option>
            {REFERENCE_FILTERS.map((r) => (
              <option key={r} value={r}>{REFERENCE_LABELS[r]}</option>
            ))}
          </select>
          <Button variant="ghost" size="sm" onClick={exportCsv} disabled={!txs || txs.items.length === 0}>
            <Download size={14} /> Export CSV
          </Button>
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

function SubBalanceCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {icon} {label}
      </div>
      <div className="mt-1.5 text-xl font-black text-slate-900 dark:text-white">
        🪙 {value.toLocaleString()}
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
