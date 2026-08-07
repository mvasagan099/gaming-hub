/**
 * Post-Match Experience Components
 * 
 * Comprehensive post-match UI with:
 * - Detailed statistics
 * - Performance charts
 * - Rating changes
 * - Rewards breakdown
 * - Rematch options
 */

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Trophy,
  Zap,
  Star,
  Clock,
  Target,
  Sword,
  Shield,
  BarChart3,
  Crown,
  ArrowRight,
  RotateCcw,
  Home,
  Share2,
  Download,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { RankTier } from "@prisma/client";

interface PostMatchSummaryProps {
  matchId: string;
  playerId: string;
  result: "win" | "loss" | "draw";
  gameId: string;
  duration: number;
  onClose: () => void;
  onRematch: () => void;
  onHome: () => void;
}

export function PostMatchSummary({
  matchId,
  playerId,
  result,
  gameId,
  duration,
  onClose,
  onRematch,
  onHome,
}: PostMatchSummaryProps) {
  const [stats, setStats] = useState<any>(null);
  const [ratingChange, setRatingChange] = useState<any>(null);
  const [rewards, setRewards] = useState<any>(null);

  useEffect(() => {
    fetchMatchData();
  }, [matchId]);

  const fetchMatchData = async () => {
    const mockStats = {
      moves: 42,
      captures: 5,
      accuracy: 87.5,
      timePerMove: 3.2,
      criticalMoments: 3,
      mistakes: 2,
      bestMove: "Qxe4+",
      playerPerformance: [
        { move: 1, accuracy: 90 },
        { move: 5, accuracy: 95 },
        { move: 10, accuracy: 88 },
        { move: 15, accuracy: 92 },
        { move: 20, accuracy: 85 },
        { move: 25, accuracy: 90 },
        { move: 30, accuracy: 93 },
      ],
      moveAnalysis: [
        { category: "Brilliant", count: 5, color: "#22c55e" },
        { category: "Great", count: 12, color: "#3b82f6" },
        { category: "Good", count: 18, color: "#eab308" },
        { category: "Inaccuracy", count: 5, color: "#f97316" },
        { category: "Mistake", count: 2, color: "#ef4444" },
      ],
    };

    const mockRatingChange = {
      oldRating: 1542,
      newRating: result === "win" ? 1558 : result === "loss" ? 1540 : 1545,
      change: result === "win" ? "+16" : result === "loss" ? "-12" : "+3",
      oldTier: "GOLD",
      newTier: result === "win" ? "PLATINUM" : "GOLD",
      tierProgress: result === "win" ? 10 : 60,
    };

    const mockRewards = {
      coins: result === "win" ? 180 : result === "loss" ? 50 : 100,
      xp: result === "win" ? 250 : result === "loss" ? 75 : 125,
      achievements: result === "win" ? ["First Win of the Day", "3 Win Streak"] : [],
      bonusXp: result === "win" ? 50 : 0,
    };

    setStats(mockStats);
    setRatingChange(mockRatingChange);
    setRewards(mockRewards);
  };

  if (!stats || !ratingChange || !rewards) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500" />
      </div>
    );
  }

  const resultColors = {
    win: "from-green-600 to-emerald-600",
    loss: "from-red-600 to-rose-600",
    draw: "from-amber-600 to-yellow-600",
  };

  const resultText = {
    win: "Victory!",
    loss: "Defeat",
    draw: "Draw",
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 1 }}
        className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", duration: 0.5 }}
          className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-slate-700 shadow-2xl"
        >
          <div className="space-y-8">
            {/* Header */}
            <div className="text-center space-y-4">
              <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className={`text-6xl font-black ${
                  result === "win"
                    ? "text-green-400"
                    : result === "loss"
                    ? "text-red-400"
                    : "text-amber-400"
                }`}
              >
                {resultText[result]}
              </motion.div>
              <div className="flex items-center justify-center gap-2 text-slate-400">
                <Clock className="w-4 h-4" />
                <span>{Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, "0")}</span>
              </div>
            </div>

            {/* Rating Change */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700"
            >
              <div className="grid grid-cols-2 gap-8">
                <div className="text-center">
                  <p className="text-sm text-slate-400 mb-2">Previous Rating</p>
                  <p className="text-4xl font-black text-white">
                    {ratingChange.oldRating}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    {ratingChange.oldTier}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-slate-400 mb-2">New Rating</p>
                  <p className="text-4xl font-black text-white">
                    {ratingChange.newRating}
                  </p>
                  <p className="text-sm text-amber-400 mt-1 font-bold">
                    {ratingChange.newTier}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 mt-4">
                {result === "win" ? (
                  <TrendingUp className="w-6 h-6 text-green-400" />
                ) : result === "loss" ? (
                  <TrendingDown className="w-6 h-6 text-red-400" />
                ) : (
                  <ArrowRight className="w-6 h-6 text-amber-400" />
                )}
                <span
                  className={`text-2xl font-bold ${
                    result === "win"
                      ? "text-green-400"
                      : result === "loss"
                      ? "text-red-400"
                      : "text-amber-400"
                  }`}
                >
                  {ratingChange.change}
                </span>
              </div>
            </motion.div>

            {/* Performance Stats */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700"
            >
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
                <BarChart3 className="w-5 h-5" />
                Performance Analysis
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-900/50 rounded-xl p-4 text-center">
                  <p className="text-3xl font-black text-white">{stats.moves}</p>
                  <p className="text-xs text-slate-400 mt-1">Moves</p>
                </div>
                <div className="bg-slate-900/50 rounded-xl p-4 text-center">
                  <p className="text-3xl font-black text-emerald-400">
                    {stats.accuracy}%
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Accuracy</p>
                </div>
                <div className="bg-slate-900/50 rounded-xl p-4 text-center">
                  <p className="text-3xl font-black text-amber-400">
                    {stats.timePerMove}s
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Avg Time</p>
                </div>
                <div className="bg-slate-900/50 rounded-xl p-4 text-center">
                  <p className="text-3xl font-black text-red-400">
                    {stats.mistakes}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Mistakes</p>
                </div>
              </div>

              {stats.playerPerformance && (
                <div className="mt-6">
                  <p className="text-sm font-bold text-white mb-3">
                    Accuracy Over Time
                  </p>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={stats.playerPerformance}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="move" stroke="#9ca3af" />
                      <YAxis domain={[0, 100]} stroke="#9ca3af" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1e293b",
                          border: "1px solid #475569",
                          borderRadius: "8px",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="accuracy"
                        stroke="#818cf8"
                        strokeWidth={2}
                        dot={{ fill: "#818cf8", strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </motion.div>

            {/* Move Analysis */}
            {stats.moveAnalysis && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700"
              >
                <h3 className="text-lg font-bold text-white mb-6">
                  Move Quality Distribution
                </h3>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={stats.moveAnalysis}
                      dataKey="count"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                    >
                      {stats.moveAnalysis.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1e293b",
                        border: "1px solid #475569",
                        borderRadius: "8px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-4">
                  {stats.moveAnalysis.map((item: any) => (
                    <div key={item.category} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm text-slate-300">
                        {item.category}: {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Rewards */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="bg-gradient-to-r from-amber-900/30 to-amber-800/20 rounded-2xl p-6 border border-amber-700/30"
            >
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
                <Crown className="w-5 h-5 text-amber-400" />
                Rewards Earned
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-900/50 rounded-xl p-4 flex items-center gap-3">
                  <Zap className="w-8 h-8 text-amber-400" />
                  <div>
                    <p className="text-2xl font-black text-amber-400">
                      +{rewards.coins}
                    </p>
                    <p className="text-xs text-slate-400">Coins</p>
                  </div>
                </div>
                <div className="bg-slate-900/50 rounded-xl p-4 flex items-center gap-3">
                  <Star className="w-8 h-8 text-indigo-400" />
                  <div>
                    <p className="text-2xl font-black text-indigo-400">
                      +{rewards.xp}
                    </p>
                    <p className="text-xs text-slate-400">XP</p>
                  </div>
                </div>
              </div>
              {rewards.achievements && rewards.achievements.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {rewards.achievements.map((achievement: string) => (
                    <div
                      key={achievement}
                      className="px-3 py-1 bg-indigo-600/20 rounded-full border border-indigo-500/30 text-sm text-indigo-300 font-bold"
                    >
                      🏆 {achievement}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            {/* Actions */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="grid grid-cols-2 gap-4"
            >
              <button
                onClick={onRematch}
                className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold rounded-xl hover:from-green-500 hover:to-emerald-500 transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-5 h-5" />
                Request Rematch
              </button>
              <button
                onClick={onHome}
                className="px-6 py-3 bg-gradient-to-r from-slate-600 to-slate-700 text-white font-bold rounded-xl hover:from-slate-500 hover:to-slate-600 transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <Home className="w-5 h-5" />
                Return Home
              </button>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export function LeaderboardPositionChange({
  previousRank,
  currentRank,
}: {
  previousRank: number;
  currentRank: number;
}) {
  const change = previousRank - currentRank;
  const improved = change > 0;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-xl border border-slate-700">
      <span className="text-sm text-slate-400">Leaderboard:</span>
      <span className="text-2xl font-black text-white">#{currentRank}</span>
      {change !== 0 && (
        <div
          className={`flex items-center gap-1 ${
            improved ? "text-green-400" : "text-red-400"
          }`}
        >
          {improved ? (
            <TrendingUp className="w-4 h-4" />
          ) : (
            <TrendingDown className="w-4 h-4" />
          )}
          <span className="text-sm font-bold">
            {improved ? "+" : ""}
            {change}
          </span>
        </div>
      )}
    </div>
  );
}

export function ShareMatchButton({ matchId }: { matchId: string }) {
  const handleShare = async () => {
    const url = `${window.location.origin}/match/${matchId}`;
    if (navigator.share) {
      await navigator.share({
        title: "Check out my match!",
        url,
      });
    } else {
      await navigator.clipboard.writeText(url);
      alert("Link copied to clipboard!");
    }
  };

  return (
    <button
      onClick={handleShare}
      className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-all flex items-center gap-2"
    >
      <Share2 className="w-4 h-4" />
      Share
    </button>
  );
}
