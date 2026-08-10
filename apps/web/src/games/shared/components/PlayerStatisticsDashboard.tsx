/**
 * Player Statistics Dashboard Components
 * 
 * Comprehensive player stats display with:
 * - Overall statistics
 * - Per-game breakdown
 * - Rating history graphs
 * - Achievement showcase
 * - Recent matches
 * - Performance trends
 */

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Target,
  Clock,
  Star,
  Zap,
  Crown,
  Medal,
  Award,
  Calendar,
  Gamepad2,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";

interface PlayerStatsDashboardProps {
  userId: string;
}

export function PlayerStatsDashboard({ userId }: PlayerStatsDashboardProps) {
  const [profile, setProfile] = useState<any>(null);
  const [gameStats, setGameStats] = useState<any[]>([]);
  const [ratingHistory, setRatingHistory] = useState<any[]>([]);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [recentMatches, setRecentMatches] = useState<any[]>([]);

  useEffect(() => {
    fetchPlayerData();
  }, [userId]);

  const fetchPlayerData = async () => {
    const mockProfile = {
      username: "ProGamer123",
      displayName: "Pro Gamer",
      level: 42,
      xp: 125000,
      totalWins: 342,
      totalLosses: 128,
      totalDraws: 45,
      winRate: 66.7,
      currentStreak: 5,
      longestStreak: 12,
      gamesPlayed: 515,
      favoriteGame: "chess",
      bestPerformance: {
        game: "chess",
        rating: 1825,
        tier: "DIAMOND",
      },
    };

    const mockGameStats = [
      {
        gameId: "chess",
        gamesPlayed: 150,
        wins: 98,
        losses: 42,
        draws: 10,
        winRate: 65.3,
        rating: 1825,
        tier: "DIAMOND",
        averageMatchDuration: 420,
        fastestWin: 180,
        longestWinStreak: 8,
      },
      {
        gameId: "ludo",
        gamesPlayed: 120,
        wins: 72,
        losses: 40,
        draws: 8,
        winRate: 60.0,
        rating: 1450,
        tier: "GOLD",
        averageMatchDuration: 600,
        fastestWin: 300,
        longestWinStreak: 6,
      },
      {
        gameId: "bubble-shooter",
        gamesPlayed: 100,
        wins: 68,
        losses: 28,
        draws: 4,
        winRate: 68.0,
        rating: 1620,
        tier: "PLATINUM",
        averageMatchDuration: 300,
        fastestWin: 120,
        longestWinStreak: 10,
      },
    ];

    const mockRatingHistory = [
      { date: "2025-01", rating: 1600 },
      { date: "2025-02", rating: 1650 },
      { date: "2025-03", rating: 1580 },
      { date: "2025-04", rating: 1720 },
      { date: "2025-05", rating: 1780 },
      { date: "2025-06", rating: 1825 },
    ];

    const mockAchievements = [
      { id: 1, title: "First Win", description: "Win your first match", unlocked: true, icon: "🏆" },
      { id: 2, title: "10 Win Streak", description: "Win 10 matches in a row", unlocked: true, icon: "🔥" },
      { id: 3, title: "Diamond Tier", description: "Reach Diamond tier", unlocked: true, icon: "💎" },
      { id: 4, title: "Play 500 Games", description: "Play 500 matches total", unlocked: false, icon: "🎮" },
      { id: 5, title: "Win Rate 70%", description: "Achieve 70% win rate", unlocked: false, icon: "⭐" },
    ];

    const mockRecentMatches = [
      {
        matchId: "1",
        gameId: "chess",
        result: "win",
        ratingChange: +16,
        opponent: "Player456",
        duration: 420,
        playedAt: "2 hours ago",
      },
      {
        matchId: "2",
        gameId: "ludo",
        result: "loss",
        ratingChange: -12,
        opponent: "Player789",
        duration: 600,
        playedAt: "4 hours ago",
      },
      {
        matchId: "3",
        gameId: "bubble-shooter",
        result: "win",
        ratingChange: +18,
        opponent: "Player321",
        duration: 280,
        playedAt: "6 hours ago",
      },
    ];

    setProfile(mockProfile);
    setGameStats(mockGameStats);
    setRatingHistory(mockRatingHistory);
    setAchievements(mockAchievements);
    setRecentMatches(mockRecentMatches);
  };

  if (!profile) return <div>Loading...</div>;

  const radarData = gameStats.map((stat) => ({
    game: stat.gameId,
    winRate: stat.winRate,
    gamesPlayed: (stat.gamesPlayed / 200) * 100,
    rating: (stat.rating / 2000) * 100,
  }));

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-indigo-900/50 to-purple-900/50 rounded-3xl p-8 border border-indigo-700/30"
      >
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-black text-white">{profile.displayName}</h1>
            <p className="text-slate-400 mt-1">@{profile.username}</p>
            <div className="flex items-center gap-3 mt-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-indigo-600/20 rounded-xl border border-indigo-500/30">
                <Star className="w-5 h-5 text-indigo-400" />
                <span className="text-lg font-bold text-indigo-300">
                  Level {profile.level}
                </span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-600/20 rounded-xl border border-amber-500/30">
                <Zap className="w-5 h-5 text-amber-400" />
                <span className="text-lg font-bold text-amber-300">
                  {profile.xp.toLocaleString()} XP
                </span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-5xl font-black text-emerald-400">
              {profile.winRate}%
            </div>
            <div className="text-sm text-slate-400 mt-1">Win Rate</div>
          </div>
        </div>
      </motion.div>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700"
        >
          <div className="flex items-center gap-3">
            <Trophy className="w-8 h-8 text-yellow-400" />
            <div>
              <div className="text-3xl font-black text-white">{profile.totalWins}</div>
              <div className="text-sm text-slate-400">Wins</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700"
        >
          <div className="flex items-center gap-3">
            <Gamepad2 className="w-8 h-8 text-blue-400" />
            <div>
              <div className="text-3xl font-black text-white">{profile.gamesPlayed}</div>
              <div className="text-sm text-slate-400">Matches</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700"
        >
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-emerald-400" />
            <div>
              <div className="text-3xl font-black text-white">{profile.currentStreak}</div>
              <div className="text-sm text-slate-400">Win Streak</div>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700"
        >
          <div className="flex items-center gap-3">
            <Crown className="w-8 h-8 text-amber-400" />
            <div>
              <div className="text-xl font-black text-white">{profile.bestPerformance.tier}</div>
              <div className="text-sm text-slate-400">Highest Tier</div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Rating Trend */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700"
      >
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <BarChart3 className="w-6 h-6" />
          Rating Trend
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={ratingHistory}>
            <defs>
              <linearGradient id="colorRating" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#818cf8" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" stroke="#9ca3af" />
            <YAxis domain={[1500, 2000]} stroke="#9ca3af" />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1e293b",
                border: "1px solid #475569",
                borderRadius: "8px",
              }}
            />
            <Area
              type="monotone"
              dataKey="rating"
              stroke="#818cf8"
              fillOpacity={1}
              fill="url(#colorRating)"
              strokeWidth={3}
            />
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Game Breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700"
      >
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Medal className="w-6 h-6" />
          Game Performance
        </h3>
        <div className="space-y-4">
          {gameStats.map((stat, index) => (
            <div
              key={stat.gameId}
              className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="text-2xl font-bold text-white capitalize">
                    {stat.gameId.replace(/-/g, " ")}
                  </div>
                  <span className="px-3 py-1 bg-amber-600/20 text-amber-300 rounded-full text-sm font-bold">
                    {stat.tier}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-white">{stat.rating}</div>
                  <div className="text-xs text-slate-400">Rating</div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3 text-center">
                <div>
                  <div className="text-lg font-bold text-white">{stat.gamesPlayed}</div>
                  <div className="text-xs text-slate-400">Games</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-emerald-400">{stat.wins}</div>
                  <div className="text-xs text-slate-400">Wins</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-red-400">{stat.losses}</div>
                  <div className="text-xs text-slate-400">Losses</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-indigo-400">{stat.winRate}%</div>
                  <div className="text-xs text-slate-400">Win Rate</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Achievements */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700"
      >
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Award className="w-6 h-6" />
          Achievements
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {achievements.map((achievement) => (
            <motion.div
              key={achievement.id}
              whileHover={{ scale: 1.05 }}
              className={`bg-slate-900/50 rounded-xl p-4 text-center border ${
                achievement.unlocked
                  ? "border-amber-500/30 bg-amber-600/10"
                  : "border-slate-700/30 opacity-50"
              }`}
            >
              <div className="text-4xl mb-2">{achievement.icon}</div>
              <div className="text-sm font-bold text-white">{achievement.title}</div>
              <div className="text-xs text-slate-400 mt-1">{achievement.description}</div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Recent Matches */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700"
      >
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Calendar className="w-6 h-6" />
          Recent Matches
        </h3>
        <div className="space-y-3">
          {recentMatches.map((match) => (
            <div
              key={match.matchId}
              className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    match.result === "win"
                      ? "bg-emerald-600/20 border border-emerald-500/30"
                      : match.result === "loss"
                      ? "bg-red-600/20 border border-red-500/30"
                      : "bg-amber-600/20 border border-amber-500/30"
                  }`}
                >
                  {match.result === "win" ? (
                    <Trophy className="w-6 h-6 text-emerald-400" />
                  ) : match.result === "loss" ? (
                    <TrendingDown className="w-6 h-6 text-red-400" />
                  ) : (
                    <Minus className="w-6 h-6 text-amber-400" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-bold text-white capitalize">
                    {match.gameId.replace(/-/g, " ")}
                  </div>
                  <div className="text-xs text-slate-400">
                    vs {match.opponent} • {match.duration}s
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div
                  className={`text-lg font-bold ${
                    match.ratingChange > 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {match.ratingChange > 0 ? "+" : ""}
                  {match.ratingChange}
                </div>
                <div className="text-xs text-slate-400">{match.playedAt}</div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
