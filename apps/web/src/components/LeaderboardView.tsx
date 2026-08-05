import React from 'react';
import type { LeaderboardEntry } from '../types';
import { Trophy, Medal, Crown } from 'lucide-react';

const mockLeaderboard: LeaderboardEntry[] = [
  { rank: 1, username: 'ShadowNinja99', avatar: '🥷', score: 14200, coinsWon: 45000 },
  { rank: 2, username: 'QueenGambit', avatar: '👑', score: 12850, coinsWon: 38200 },
  { rank: 3, username: 'ViperStriker', avatar: '🐍', score: 11400, coinsWon: 29000 },
  { rank: 4, username: 'MasterLudoPro', avatar: '🎲', score: 9800, coinsWon: 21500 },
  { rank: 5, username: 'CricketKing7', avatar: '🏏', score: 8750, coinsWon: 18000 },
];

export const LeaderboardView: React.FC = () => {
  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-wider">
          <Trophy className="w-3.5 h-3.5" /> GLOBAL HALL OF FAME
        </div>
        <h2 className="text-3xl font-black text-slate-900 dark:text-white transition-colors duration-300">Leaderboards & Champions</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors duration-300">Top gaming champions ranked by weekly win streak & rewards.</p>
      </div>

      <div className="glass-panel rounded-3xl border border-slate-200 dark:border-slate-800 p-6 overflow-hidden shadow-2xl transition-colors duration-300">
        <div className="space-y-3">
          {mockLeaderboard.map((entry) => {
            const isTop3 = entry.rank <= 3;
            return (
              <div
                key={entry.rank}
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

                  <span className="text-2xl">{entry.avatar}</span>
                  <div>
                    <p className="font-extrabold text-slate-900 dark:text-white text-sm">{entry.username}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">Rating Score: {entry.score} pts</p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-sm font-black text-amber-400 flex items-center gap-1">
                    🪙 {entry.coinsWon.toLocaleString()}
                  </span>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">Won this week</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
