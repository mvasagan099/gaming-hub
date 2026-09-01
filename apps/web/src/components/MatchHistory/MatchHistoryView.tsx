import React, { useState, useEffect } from "react";
import {
  Trophy,
  Clock,
  Swords,
  Play,
  RotateCcw,
  Eye,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Award,
  BarChart3,
  Calendar,
  Flame,
  X,
} from "lucide-react";
import { apiClient } from "../../services/api/client";
import { ReplayModal } from "../Replay/ReplayModal";
import type {
  MatchHistoryRecord,
  MatchSummaryView,
  GlobalPlayerStatistics,
} from "@gaming-hub/shared";
import toast from "react-hot-toast";

const ALL_GAMES = [
  { id: "all", name: "All Games" },
  { id: "snooker", name: "Snooker" },
  { id: "chess", name: "Chess" },
  { id: "cricket", name: "Cricket" },
  { id: "carrom", name: "Carrom" },
  { id: "fruit-ninja", name: "Fruit Ninja" },
  { id: "bubble-shooter", name: "Bubble Shooter" },
  { id: "table-tennis", name: "Table Tennis" },
  { id: "snake-vs-worms", name: "Snake vs Worms" },
  { id: "ludo", name: "Ludo" },
  { id: "snake-ladder", name: "Snake & Ladder" },
];

export const MatchHistoryView: React.FC<{ userId?: string }> = ({ userId }) => {
  const [selectedTab, setSelectedTab] = useState<"history" | "stats">("history");
  const [resultFilter, setResultFilter] = useState<"ALL" | "WIN" | "LOSS" | "TOURNAMENT">("ALL");
  const [gameFilter, setGameFilter] = useState<string>("all");
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [historyItems, setHistoryItems] = useState<MatchHistoryRecord[]>([]);
  const [stats, setStats] = useState<GlobalPlayerStatistics | null>(null);

  // Modal States
  const [selectedSummary, setSelectedSummary] = useState<MatchSummaryView | null>(null);
  const [selectedReplayMatchId, setSelectedReplayMatchId] = useState<string | null>(null);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "15",
      });
      if (gameFilter && gameFilter !== "all") params.append("gameId", gameFilter);
      if (resultFilter === "WIN") params.append("result", "WIN");
      if (resultFilter === "LOSS") params.append("result", "LOSS");
      if (resultFilter === "TOURNAMENT") params.append("isTournament", "true");

      const res = await apiClient.get<{ items: MatchHistoryRecord[]; totalPages: number }>(
        `/games/history?${params.toString()}`
      );
      setHistoryItems(res.items || []);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      toast.error("Failed to load match history");
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const targetUserId = userId || "me";
      const res = await apiClient.get<GlobalPlayerStatistics>(`/players/${targetUserId}/statistics`);
      setStats(res);
    } catch (err) {
      console.warn("Failed to load player stats", err);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [resultFilter, gameFilter, page]);

  useEffect(() => {
    loadStats();
  }, [userId]);

  const handleOpenSummary = async (matchId: string) => {
    try {
      const summary = await apiClient.get<MatchSummaryView>(`/matches/${matchId}/summary`);
      setSelectedSummary(summary);
    } catch (err) {
      toast.error("Could not fetch match summary");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Subtabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl">
          <button
            onClick={() => setSelectedTab("history")}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              selectedTab === "history"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Match History</span>
          </button>
          <button
            onClick={() => setSelectedTab("stats")}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              selectedTab === "stats"
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Game Statistics</span>
          </button>
        </div>

        {/* Global Summary Badge */}
        {stats && (
          <div className="flex items-center gap-4 text-xs font-bold text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>{stats.winRate}% Win Rate</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-rose-500" />
              <span>{stats.totalMatches} Matches</span>
            </span>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: MATCH HISTORY LIST */}
      {/* ========================================================================= */}
      {selectedTab === "history" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900/80 p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            {/* Result Filters */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {(["ALL", "WIN", "LOSS", "TOURNAMENT"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    setResultFilter(r);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    resultFilter === r
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {r === "ALL" ? "All Matches" : r === "WIN" ? "Wins" : r === "LOSS" ? "Losses" : "Tournaments"}
                </button>
              ))}
            </div>

            {/* Game Selector */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={gameFilter}
                onChange={(e) => {
                  setGameFilter(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white font-bold text-xs border-none outline-none cursor-pointer"
              >
                {ALL_GAMES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Matches List */}
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-bold text-slate-400">Loading Matches...</p>
            </div>
          ) : historyItems.length === 0 ? (
            <div className="py-16 text-center rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 p-8 space-y-2">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No match records found.</p>
              <p className="text-xs text-slate-400">Complete matches in online multiplayer to see your history!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historyItems.map((item) => {
                const isWin = item.resultType === "WIN";
                const isDraw = item.resultType === "DRAW";
                const isTournament = Boolean(item.tournamentInfo?.isTournament);

                return (
                  <div
                    key={item.matchId}
                    className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800/90 hover:border-blue-500/40 dark:hover:border-blue-500/40 shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    {/* Left details */}
                    <div className="flex items-center gap-3.5">
                      <div
                        className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 ${
                          isWin
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                            : isDraw
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                            : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                        }`}
                      >
                        {isWin ? "W" : isDraw ? "D" : "L"}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-black text-sm text-slate-900 dark:text-white capitalize">
                            {item.gameType.replace("-", " ")}
                          </h4>
                          {isTournament && (
                            <span className="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-400 font-black text-[10px] uppercase">
                              Tournament
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase tracking-wider ${
                              item.resultReason === "TIME_LIMIT"
                                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                : item.resultReason === "TIMEOUT"
                                ? "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                            }`}
                          >
                            {item.resultReason}
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          vs <span className="font-bold text-slate-700 dark:text-slate-200">{item.player2?.username || "Opponent"}</span>
                          {" • "}
                          <span>Score: {item.player1.score} - {item.player2?.score ?? 0}</span>
                        </p>
                      </div>
                    </div>

                    {/* Middle stats & duration */}
                    <div className="flex items-center gap-4 text-xs font-bold text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{Math.floor(item.durationSeconds / 60)}m {item.durationSeconds % 60}s</span>
                      </div>

                      <div className="text-right">
                        <span
                          className={`font-black ${
                            isWin
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-500"
                          }`}
                        >
                          {isWin ? `+${item.entryFee * 2}` : `-${item.entryFee}`} coins
                        </span>
                      </div>
                    </div>

                    {/* Right buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleOpenSummary(item.matchId)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Summary</span>
                      </button>
                      <button
                        onClick={() => setSelectedReplayMatchId(item.matchId)}
                        className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 fill-white" />
                        <span>Replay</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-xs font-bold text-slate-500">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: GAME SPECIFIC & GLOBAL STATISTICS */}
      {/* ========================================================================= */}
      {selectedTab === "stats" && stats && (
        <div className="space-y-6">
          {/* Global Statistics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-400 font-bold block mb-1">Win Rate</span>
              <span className="text-2xl font-black text-emerald-500">{stats.winRate}%</span>
              <span className="text-[11px] text-slate-400 block mt-1">{stats.totalWins} Wins / {stats.totalLosses} Losses</span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-400 font-bold block mb-1">Total Matches</span>
              <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.totalMatches}</span>
              <span className="text-[11px] text-slate-400 block mt-1">{stats.gamesPlayed} Different Games</span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-400 font-bold block mb-1">Average Duration</span>
              <span className="text-2xl font-black text-blue-500">
                {Math.floor(stats.averageMatchDuration / 60)}m {stats.averageMatchDuration % 60}s
              </span>
              <span className="text-[11px] text-slate-400 block mt-1">Shortest: {stats.shortestMatch}s</span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800">
              <span className="text-xs text-slate-400 font-bold block mb-1">Time Limit Matches</span>
              <span className="text-2xl font-black text-amber-500">{stats.timeLimitMatches}</span>
              <span className="text-[11px] text-slate-400 block mt-1">10-Min Strategy Monitored</span>
            </div>
          </div>

          {/* Game-Specific Breakdowns */}
          <div className="space-y-4">
            <h3 className="font-black text-base text-slate-900 dark:text-white flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" />
              <span>Game-Specific Performance</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Snooker Card */}
              {stats.gameStats.snooker && (
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <span className="font-black text-sm text-slate-900 dark:text-white">Snooker</span>
                    <span className="text-xs font-bold text-emerald-500">{stats.gameStats.snooker.winRate}% Win Rate</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Highest Break</span>
                      <span className="font-black text-slate-900 dark:text-white">{stats.gameStats.snooker.highestBreak}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Average Break</span>
                      <span className="font-black text-slate-900 dark:text-white">{stats.gameStats.snooker.averageBreak}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Avg Duration</span>
                      <span className="font-black text-slate-900 dark:text-white">{stats.gameStats.snooker.averageDuration}s</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Chess Card */}
              {stats.gameStats.chess && (
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <span className="font-black text-sm text-slate-900 dark:text-white">Chess</span>
                    <span className="text-xs font-bold text-emerald-500">{stats.gameStats.chess.winRate}% Win Rate</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Wins / Losses</span>
                      <span className="font-black text-slate-900 dark:text-white">{stats.gameStats.chess.wins} / {stats.gameStats.chess.losses}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Draws</span>
                      <span className="font-black text-slate-900 dark:text-white">{stats.gameStats.chess.draws}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Avg Duration</span>
                      <span className="font-black text-slate-900 dark:text-white">{stats.gameStats.chess.averageDuration}s</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Cricket Card */}
              {stats.gameStats.cricket && (
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <span className="font-black text-sm text-slate-900 dark:text-white">Cricket</span>
                    <span className="text-xs font-bold text-emerald-500">{stats.gameStats.cricket.runs} Total Runs</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Highest Score</span>
                      <span className="font-black text-slate-900 dark:text-white">{stats.gameStats.cricket.highestScore}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Average Runs</span>
                      <span className="font-black text-slate-900 dark:text-white">{stats.gameStats.cricket.averageRuns}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Matches</span>
                      <span className="font-black text-slate-900 dark:text-white">{stats.gameStats.cricket.matches}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Carrom Card */}
              {stats.gameStats.carrom && (
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                    <span className="font-black text-sm text-slate-900 dark:text-white">Carrom</span>
                    <span className="text-xs font-bold text-emerald-500">{stats.gameStats.carrom.points} Total Points</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Highest Score</span>
                      <span className="font-black text-slate-900 dark:text-white">{stats.gameStats.carrom.highestScore}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Wins / Losses</span>
                      <span className="font-black text-slate-900 dark:text-white">{stats.gameStats.carrom.wins} / {stats.gameStats.carrom.losses}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Avg Duration</span>
                      <span className="font-black text-slate-900 dark:text-white">{stats.gameStats.carrom.averageDuration}s</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MATCH SUMMARY MODAL (Requirement 2) */}
      {/* ========================================================================= */}
      {selectedSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="relative w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 text-white shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-black text-lg text-white capitalize">{selectedSummary.game}</h3>
              <button
                onClick={() => setSelectedSummary(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Big Result Badge */}
            <div className="text-center py-4 space-y-2">
              <div
                className={`inline-block px-4 py-1.5 rounded-full font-black text-sm uppercase tracking-widest ${
                  selectedSummary.result === "WIN"
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : selectedSummary.result === "DRAW"
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                }`}
              >
                {selectedSummary.result}
              </div>
              <div className="text-2xl font-black tracking-tight text-white">
                {selectedSummary.formattedScore}
              </div>
            </div>

            {/* Duration and Reason details */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Duration</span>
                <span className="font-bold text-white">{selectedSummary.matchDuration}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Result Reason</span>
                <span className="font-bold text-white capitalize">{selectedSummary.resultReason}</span>
              </div>
            </div>

            <button
              onClick={() => setSelectedSummary(null)}
              className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors"
            >
              Close Summary
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REPLAY MODAL */}
      {/* ========================================================================= */}
      {selectedReplayMatchId && (
        <ReplayModal
          matchId={selectedReplayMatchId}
          onClose={() => setSelectedReplayMatchId(null)}
        />
      )}
    </div>
  );
};
