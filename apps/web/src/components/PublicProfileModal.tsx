import React from "react";
import {
  X,
  Trophy,
  Swords,
  Crown,
  Medal,
  Calendar,
  MapPin,
  Lock,
  Zap,
  Target,
  Sparkles,
  Gamepad2,
  CheckCircle2,
} from "lucide-react";
import { usePublicProfile } from "../services/api/usePublicProfile";
import { Skeleton } from "./Skeleton";
import { Button } from "./ui/Button";
import { cn } from "../lib/utils";

interface PublicProfileModalProps {
  userId: string | null;
  onClose: () => void;
}

export const PublicProfileModal: React.FC<PublicProfileModalProps> = ({ userId, onClose }) => {
  const { profile, loading } = usePublicProfile(userId);

  if (!userId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Top Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content Area */}
        <div className="overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
          {loading && !profile ? (
            <div className="space-y-6 py-8">
              <div className="flex items-center gap-4">
                <Skeleton className="w-20 h-20 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="w-40 h-6" />
                  <Skeleton className="w-24 h-4" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-2xl" />
                ))}
              </div>
            </div>
          ) : !profile ? (
            <div className="text-center py-12 space-y-3">
              <Trophy className="w-12 h-12 text-slate-400 dark:text-slate-500 mx-auto" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Player Not Found</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Could not retrieve player statistics.</p>
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          ) : profile.isPrivate ? (
            <div className="text-center py-12 space-y-4">
              <div className="relative w-20 h-20 mx-auto">
                {profile.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-slate-200 dark:border-slate-700" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-accent-500/20 border border-accent-500/30 flex items-center justify-center font-black text-2xl text-accent-500 dark:text-accent-400">
                    {(profile.displayName || profile.username || "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">{profile.displayName || profile.username}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">@{profile.username}</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 max-w-sm mx-auto">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">This player's profile and game statistics are private.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Hero Banner */}
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div className="relative">
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt=""
                      className="w-20 h-20 rounded-full object-cover ring-4 ring-accent-500/30 shadow-lg"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-accent-600 to-indigo-500 border border-white/20 flex items-center justify-center font-black text-2xl text-white shadow-lg">
                      {(profile.displayName || profile.username || "?").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  {profile.isOnline && (
                    <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                  )}
                </div>

                <div className="flex-1 text-center sm:text-left space-y-1">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                      {profile.displayName || profile.username}
                    </h2>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-accent-500/15 border border-accent-500/30 text-accent-600 dark:text-accent-400 text-xs font-black">
                      <Zap className="w-3 h-3" /> LVL {profile.level}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">@{profile.username}</p>

                  {profile.bio && <p className="text-xs text-slate-600 dark:text-slate-300 italic pt-1">{profile.bio}</p>}

                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-2 text-[11px] text-slate-500 dark:text-slate-400">
                    {profile.country && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400 dark:text-slate-500" /> {profile.country}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400 dark:text-slate-500" /> Joined{" "}
                      {new Date(profile.joinedAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Performance Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-center shadow-sm dark:shadow-none">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Games</p>
                  <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{profile.gamesPlayed.toLocaleString()}</p>
                </div>
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center shadow-sm dark:shadow-none">
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Wins</p>
                  <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{profile.wins.toLocaleString()}</p>
                </div>
                <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-center shadow-sm dark:shadow-none">
                  <p className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Win Rate</p>
                  <p className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-0.5">{profile.winRate.toFixed(1)}%</p>
                </div>
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center shadow-sm dark:shadow-none">
                  <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">Tournament Wins</p>
                  <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-0.5">{profile.tournamentStats.wins}</p>
                </div>
              </div>

              {/* Game Ratings & Statistics Breakdown */}
              {profile.gameStats.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    <Gamepad2 className="w-4 h-4 text-accent-500 dark:text-accent-400" /> GAME RATINGS & PERFORMANCE
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {profile.gameStats.map((gs) => (
                      <div
                        key={gs.gameId}
                        className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 shadow-sm dark:shadow-none"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-xl">{gs.icon}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-900 dark:text-white truncate">{gs.gameName}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                              {gs.wins}W · {gs.losses}L · {gs.winRate}% win rate
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-black text-accent-600 dark:text-accent-400">{gs.rating}</p>
                          <p className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500">Rating</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Matches */}
              {profile.recentMatches.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    <Target className="w-4 h-4 text-emerald-500 dark:text-emerald-400" /> RECENT MATCHES
                  </div>
                  <div className="space-y-2">
                    {profile.recentMatches.slice(0, 5).map((m) => (
                      <div
                        key={m.matchId}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 text-xs shadow-sm dark:shadow-none"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-base">{m.icon}</span>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 dark:text-slate-200 truncate">{m.gameName}</p>
                            {m.opponent && (
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                vs {m.opponent.displayName || m.opponent.username}
                              </p>
                            )}
                          </div>
                        </div>
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-md text-[10px] font-black uppercase",
                            m.result === "WIN"
                              ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                              : m.result === "LOSS"
                                ? "bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                                : "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30",
                          )}
                        >
                          {m.result}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Achievements Showcase */}
              {profile.achievements.recent.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-400" /> ACHIEVEMENTS ({profile.achievements.unlockedCount} / {profile.achievements.totalCount})
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {profile.achievements.recent.map((ach) => (
                      <div
                        key={ach.code}
                        className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 flex items-center gap-2 min-w-0 shadow-sm dark:shadow-none"
                      >
                        <span className="text-xl">{ach.icon || "🏆"}</span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate">{ach.title}</p>
                          <p className="text-[9px] text-slate-500 dark:text-slate-400 truncate">{ach.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
