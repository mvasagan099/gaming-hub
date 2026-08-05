import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trophy, Medal, Crown, LogIn } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { apiClient } from "../services/api/client";
import { Skeleton } from "./Skeleton";
import { EmptyState } from "./EmptyState";
import { Button } from "./ui/Button";

interface LeaderboardItem {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  gameId: string;
  score: number;
  wins: number;
  gamesPlayed: number;
  winRate: number;
}

export const LeaderboardView: React.FC = () => {
  const session = useAuthStore((s) => s.session);
  const [items, setItems] = useState<LeaderboardItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!session) {
      setItems(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setItems(null);
    setError(null);
    apiClient
      .get<{ items: LeaderboardItem[] }>("/leaderboard/overall?page=1&pageSize=20")
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the leaderboard");
      });
    return () => {
      cancelled = true;
    };
  }, [session, nonce]);

  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-wider">
          <Trophy className="w-3.5 h-3.5" /> GLOBAL HALL OF FAME
        </div>
        <h2 className="text-3xl font-black text-slate-900 dark:text-white transition-colors duration-300">
          Leaderboards & Champions
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors duration-300">
          Top players ranked by cumulative rating points.
        </p>
      </div>

      {!session ? (
        <EmptyState
          icon={<LogIn className="w-6 h-6 text-accent-400" />}
          title="Sign in to view the leaderboard"
          description="Leaderboards are tied to your account. Sign in to see the top players."
          action={
            <Link to="/login">
              <Button variant="primary" size="sm">Sign in</Button>
            </Link>
          }
        />
      ) : error ? (
        <EmptyState
          icon={<Trophy className="w-6 h-6 text-rose-400" />}
          title="Could not load the leaderboard"
          description={error}
          action={
            <Button variant="primary" size="sm" onClick={() => setNonce((n) => n + 1)}>
              Retry
            </Button>
          }
        />
      ) : items === null ? (
        <div className="glass-panel rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-4 flex-1">
                <Skeleton className="w-6 h-6 rounded-full" />
                <Skeleton className="w-10 h-10 rounded-full" />
                <Skeleton className="w-32 h-4" />
              </div>
              <Skeleton className="w-20 h-4" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Trophy className="w-6 h-6 text-slate-400" />}
          title="No rankings yet"
          description="Play a few matches to appear on the leaderboard."
        />
      ) : (
        <div className="glass-panel rounded-3xl border border-slate-200 dark:border-slate-800 p-6 overflow-hidden shadow-2xl transition-colors duration-300">
          <div className="space-y-3">
            {items.map((entry) => {
              const isTop3 = entry.rank <= 3;
              return (
                <div
                  key={entry.userId}
                  className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                    entry.rank === 1
                      ? 'bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border-amber-500/40 shadow-lg shadow-amber-500/5 text-slate-900 dark:text-white'
                      : entry.rank === 2
                        ? 'bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white'
                        : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm">
                      {entry.rank === 1 && <Crown className="w-6 h-6 text-amber-400" />}
                      {entry.rank === 2 && <Medal className="w-5 h-5 text-slate-300" />}
                      {entry.rank === 3 && <Medal className="w-5 h-5 text-amber-600" />}
                      {entry.rank > 3 && <span className="text-slate-500">#{entry.rank}</span>}
                    </div>

                    {entry.avatarUrl ? (
                      <img
                        src={entry.avatarUrl}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-accent-500/20 border border-accent-500/30 flex items-center justify-center text-sm font-black text-accent-400">
                        {(entry.displayName || entry.username || "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-extrabold text-slate-900 dark:text-white text-sm">
                        {entry.displayName || entry.username}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Rating: {entry.score} pts • {entry.wins} wins / {entry.gamesPlayed} games
                        {entry.gamesPlayed > 0 && ` • ${entry.winRate.toFixed(0)}%`}
                      </p>
                    </div>
                  </div>

                  {isTop3 && (
                    <div className="text-right">
                      <span className="text-sm font-black text-amber-400">
                        {entry.score.toLocaleString()} pts
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
