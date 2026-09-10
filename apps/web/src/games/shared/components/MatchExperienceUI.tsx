/**
 * Match Experience UI Components
 * 
 * Production-ready React components for match_found,
 * countdowns, rank changes, and player experience.
 */

import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Swords, Zap, Trophy, TrendingUp, TrendingDown, Sparkles, X, Coins } from "lucide-react";
import confetti from "canvas-confetti";
import type { RankTier } from "@gaming-hub/db";
import { useMultiplayerStore } from "../../../store/multiplayerStore";

interface MatchFoundModalProps {
  onAccept: () => void;
  onDecline: () => void;
  opponent: {
    displayName: string;
    avatarUrl?: string;
    tier: RankTier;
    rating: number;
  };
  gameId: string;
  stake: number;
  timeLimit?: number;
}

export function MatchFoundModal({
  onAccept,
  onDecline,
  opponent,
  gameId,
  stake,
  timeLimit = 30,
}: MatchFoundModalProps) {
  const [countdown, setCountdown] = useState(timeLimit);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          onDecline();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onDecline]);

  const handleAccept = () => {
    setAccepted(true);
    onAccept();
  };

  const orbColors = ["from-blue-500 to-purple-600", "from-purple-500 to-pink-600", "from-green-500 to-teal-600"];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 max-w-md w-full mx-4 shadow-2xl border border-slate-700"
        >
          <div className="text-center space-y-6">
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="space-y-2"
            >
              <div className="flex items-center justify-center gap-3">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="w-12 h-12"
                >
                  <Swords className="w-12 h-12 text-indigo-400" />
                </motion.div>
              </div>
              <h2 className="text-3xl font-black text-white">Match Found!</h2>
              <p className="text-sm text-slate-400">
                Game: <span className="font-bold text-white">{gameId}</span>
              </p>
            </motion.div>

            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="bg-slate-800/50 rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-center justify-center gap-3">
                <img
                  src={opponent.avatarUrl ?? `https://api.dicebear.com/7.x/identicon/svg?seed=${opponent.displayName}`}
                  alt={opponent.displayName}
                  className="w-16 h-16 rounded-xl border-2 border-indigo-500"
                />
                <div className="text-left">
                  <p className="text-lg font-bold text-white">{opponent.displayName}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold">
                      {opponent.tier}
                    </span>
                    <span className="text-xs text-slate-400">
                      {opponent.rating} MMR
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="bg-gradient-to-r from-amber-900/30 to-amber-800/20 rounded-xl p-3 border border-amber-700/30"
            >
              <div className="flex items-center justify-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-slate-300 text-sm">Entry Stake:</span>
                <span className="text-lg font-black text-amber-400 flex items-center gap-1">
                  <Coins className="w-4 h-4 text-amber-400 shrink-0" /> {stake}
                </span>
              </div>
            </motion.div>

            <div className="relative pt-4">
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-32 h-32 transform -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    className="text-slate-700"
                  />
                  <motion.circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    className={countdown <= 10 ? "text-red-500" : "text-indigo-500"}
                    strokeDasharray="352"
                    initial={{ strokeDashoffset: 0 }}
                    animate={{
                      strokeDashoffset: 352 - (352 * countdown) / timeLimit,
                    }}
                    transition={{ duration: 1, ease: "linear" }}
                  />
                </svg>
              </div>
              <div className="relative z-10 text-6xl font-black text-white">
                {countdown}
              </div>
            </div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="grid grid-cols-2 gap-3"
            >
              <button
                onClick={handleAccept}
                disabled={accepted}
                className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold rounded-xl hover:from-green-500 hover:to-emerald-500 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Trophy className="w-5 h-5" />
                Accept
              </button>
              <button
                onClick={onDecline}
                disabled={accepted}
                className="px-6 py-3 bg-gradient-to-r from-red-600 to-rose-600 text-white font-bold rounded-xl hover:from-red-500 hover:to-rose-500 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Decline
              </button>
            </motion.div>

            <p className="text-xs text-slate-500">
              Match will be automatically declined in {countdown} seconds
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

interface RankChangeAnimationProps {
  oldTier: RankTier;
  newTier: RankTier;
  oldRating: number;
  newRating: number;
  isPromotion: boolean;
  onClose: () => void;
}

export function RankChangeAnimation({
  oldTier,
  newTier,
  oldRating,
  newRating,
  isPromotion,
  onClose,
}: RankChangeAnimationProps) {
  useEffect(() => {
    if (isPromotion) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#FFD700", "#FFA500", "#FF6347", "#4169E1", "#9370DB"],
      });
    }
  }, [isPromotion]);

  const tierColors: Record<RankTier, string> = {
    BRONZE: "from-amber-700 to-amber-600",
    SILVER: "from-slate-400 to-slate-300",
    GOLD: "from-yellow-500 to-yellow-400",
    PLATINUM: "from-cyan-500 to-cyan-400",
    DIAMOND: "from-blue-600 to-blue-500",
    MASTER: "from-purple-600 to-purple-500",
    GRANDMASTER: "from-red-600 to-red-500",
    LEGEND: "from-gradient-to-r from-yellow-400 via-pink-500 to-purple-600",
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 1 }}
        className="fixed inset-0 bg-black/90 backdrop-blur-xl z-50 flex items-center justify-center"
      >
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", duration: 1 }}
          className="text-center space-y-8"
        >
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-center">
              {isPromotion ? (
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <TrendingUp className="w-20 h-20 text-green-400" />
                </motion.div>
              ) : (
                <TrendingDown className="w-20 h-20 text-red-400" />
              )}
            </div>

            <div className="flex items-center justify-center gap-4">
              <motion.div
                initial={{ x: -100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="text-center"
              >
                <div
                  className={`text-4xl font-black bg-gradient-to-r ${tierColors[oldTier]} bg-clip-text text-transparent opacity-50`}
                >
                  {oldTier}
                </div>
                <div className="text-2xl text-slate-500 mt-2">
                  {oldRating} MMR
                </div>
              </motion.div>

              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1.2, type: "spring" }}
                className="flex items-center"
              >
                <Sparkles className="w-16 h-16 text-indigo-400" />
              </motion.div>

              <motion.div
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 1.5 }}
                className="text-center"
              >
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                  className={`text-4xl font-black bg-gradient-to-r ${tierColors[newTier]} bg-clip-text text-transparent`}
                >
                  {newTier}
                </motion.div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.8 }}
                  className="text-2xl text-white mt-2 font-bold"
                >
                  {newRating} MMR
                </motion.div>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2 }}
              className="pt-8"
            >
              <button
                onClick={onClose}
                className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg"
              >
                Continue
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

interface ReadyCheckCountdownProps {
  players: Array<{
    id: string;
    displayName: string;
    avatarUrl?: string;
    isReady: boolean;
  }>;
  countdown: number;
  onReady: () => void;
}

export function ReadyCheckCountdown({
  players,
  countdown,
  onReady,
}: ReadyCheckCountdownProps) {
  const userId = useMultiplayerStore((s) => s.room?.hostId);
  const isReady = players.find((p) => p.id === userId)?.isReady ?? false;

  return (
    <div className="rounded-2xl bg-slate-900/80 border border-slate-700/60 p-6 space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-bold text-white">Match Starting</h3>
        <p className="text-sm text-slate-400">
          All players must ready up before the match starts
        </p>
      </div>

      <div className="flex justify-center">
        <div className="text-5xl font-mono font-black text-amber-400">
          {countdown}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {players.map((player) => (
          <div
            key={player.id}
            className={`flex items-center gap-3 p-3 rounded-xl border ${
              player.isReady
                ? "bg-emerald-900/20 border-emerald-500/30"
                : "bg-slate-800 border-slate-700"
            }`}
          >
            <img
              src={player.avatarUrl ?? `https://api.dicebear.com/7.x/identicon/svg?seed=${player.displayName}`}
              alt={player.displayName}
              className="w-10 h-10 rounded-lg"
            />
            <div className="flex-1">
              <p className="text-sm font-bold text-white">{player.displayName}</p>
              <p
                className={`text-xs font-bold ${
                  player.isReady ? "text-emerald-400" : "text-slate-500"
                }`}
              >
                {player.isReady ? "Ready" : "Not Ready"}
              </p>
            </div>
          </div>
        ))}
      </div>

      {!isReady && (
        <button
          onClick={onReady}
          className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-bold rounded-xl hover:from-green-500 hover:to-emerald-500 transition-all shadow-lg"
        >
          Ready Up
        </button>
      )}
    </div>
  );
}

export function NetworkQualityIndicator() {
  const [ping, setPing] = useState(45);
  const [jitter, setJitter] = useState(5);

  useEffect(() => {
    const interval = setInterval(() => {
      setPing(Math.floor(Math.random() * 100) + 20);
      setJitter(Math.floor(Math.random() * 30));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const quality =
    ping < 50 && jitter < 20
      ? "excellent"
      : ping < 100 && jitter < 40
      ? "good"
      : ping < 150 && jitter < 60
      ? "fair"
      : "poor";

  const colors = {
    excellent: "bg-emerald-500",
    good: "bg-green-500",
    fair: "bg-amber-500",
    poor: "bg-red-500",
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700">
      <div className={`w-2 h-2 rounded-full ${colors[quality]} animate-pulse`} />
      <span className="text-xs font-bold text-slate-300">{ping}ms</span>
      <span className="text-xs text-slate-500">
        (±{jitter}ms)
      </span>
    </div>
  );
}
