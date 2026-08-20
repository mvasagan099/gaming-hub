import React, { useState, useEffect, useCallback } from 'react';
import { Trophy, XCircle, RotateCcw, Sparkles, Award, Zap, LogOut, Flame, Shield, ArrowRight } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// EVENT BANNER (FOUR / SIX / WICKET)
// ─────────────────────────────────────────────────────────────────────────────

interface EventBannerProps {
  event: { type: string; runs?: number } | null;
}

const EVENT_CONFIG: Record<string, { label: string; icon: string; bg: string; text: string; glow: string }> = {
  four:   { label: 'FOUR!',         icon: '🔥', bg: 'from-amber-600 to-orange-500', text: 'text-white', glow: 'shadow-amber-500/60'  },
  six:    { label: 'MAXIMUM SIX!',  icon: '🚀', bg: 'from-emerald-600 to-cyan-500', text: 'text-white', glow: 'shadow-emerald-500/60' },
  wicket: { label: 'WICKET!',       icon: '⚡', bg: 'from-rose-700 to-pink-600',    text: 'text-white', glow: 'shadow-rose-500/60'    },
};

export const CricketEventBanner: React.FC<EventBannerProps> = ({ event }) => {
  const [visible, setVisible] = useState(false);
  const [currentEvent, setCurrentEvent] = useState<{ type: string; runs?: number } | null>(null);

  useEffect(() => {
    if (!event) return;
    setCurrentEvent(event);
    setVisible(true);

    const t = setTimeout(() => setVisible(false), 2200);
    return () => clearTimeout(t);
  }, [event]);

  if (!visible || !currentEvent) return null;

  const cfg = EVENT_CONFIG[currentEvent.type];
  if (!cfg) return null;

  return (
    <div className={`
      pointer-events-none absolute inset-x-0 flex justify-center
      ${currentEvent.type === 'wicket' ? 'top-[28%]' : 'top-[22%]'}
      z-40
    `}>
      <div className={`
        flex flex-col items-center gap-1
        animate-in zoom-in-75 fade-in duration-200
        px-8 py-3 rounded-2xl border border-white/20
        bg-gradient-to-r ${cfg.bg}
        shadow-2xl ${cfg.glow}
        select-none
      `}>
        <div className="flex items-center gap-3">
          <span className="text-3xl leading-none">{cfg.icon}</span>
          <span className={`text-3xl font-black tracking-widest uppercase ${cfg.text} drop-shadow-lg`}>
            {cfg.label}
          </span>
          {currentEvent.runs && currentEvent.type !== 'wicket' && (
            <span className="text-3xl font-black text-white/80">{currentEvent.runs}</span>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// LIVE BROADCAST SCOREBAR (bottom-left, TV style)
// ─────────────────────────────────────────────────────────────────────────────

interface BroadcastScorebarProps {
  score: number;
  wickets: number;
  overs: string;
  target?: number | null;
  runRate?: string;
  reqRunRate?: string;
  teamName?: string;
  inning?: 1 | 2;
}

export const BroadcastScorebar: React.FC<BroadcastScorebarProps> = ({
  score, wickets, overs, target, runRate, reqRunRate, teamName = 'BATTING', inning = 1,
}) => (
  <div className="pointer-events-none absolute bottom-4 left-4 z-30 select-none">
    <div className="
      flex flex-col min-w-[200px]
      bg-slate-950/92 backdrop-blur-md
      border border-slate-700/60 rounded-xl overflow-hidden
      shadow-[0_4px_24px_rgba(0,0,0,0.8)]
    ">
      {/* Top header bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-amber-600/90 to-orange-600/80">
        <span className="text-[9px] font-black tracking-[0.18em] text-white uppercase">
          🏏 {teamName}
        </span>
        <span className="ml-auto text-[9px] font-bold text-amber-100/80">INN {inning}</span>
      </div>

      {/* Main score */}
      <div className="flex items-end gap-1 px-3 pt-2 pb-1">
        <span className="text-3xl font-black text-white font-mono leading-none tabular-nums">
          {score}
        </span>
        <span className="text-base font-bold text-slate-400 leading-none mb-0.5">
          / {wickets}
        </span>
        <span className="ml-auto text-sm font-bold text-sky-400 leading-none mb-0.5 font-mono">
          {overs}
          <span className="text-[10px] text-slate-500 font-semibold ml-0.5">ov</span>
        </span>
      </div>

      {/* Run rates & target */}
      <div className="flex items-center gap-3 px-3 pb-2 border-t border-slate-800/80 pt-1.5">
        {runRate && (
          <div className="flex flex-col">
            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">CRR</span>
            <span className="text-xs font-bold text-slate-300 font-mono">{runRate}</span>
          </div>
        )}
        {target && (
          <div className="flex flex-col">
            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Target</span>
            <span className="text-xs font-bold text-amber-400 font-mono">{target}</span>
          </div>
        )}
        {reqRunRate && (
          <div className="flex flex-col ml-auto">
            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">RRR</span>
            <span className="text-xs font-bold text-rose-400 font-mono">{reqRunRate}</span>
          </div>
        )}
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// OVER BALL TRACKER
// ─────────────────────────────────────────────────────────────────────────────

interface OverTrackerProps {
  overHistory: string[];
}

const BALL_STYLES: Record<string, string> = {
  '0': 'bg-slate-700 text-slate-400 border-slate-600',
  '1': 'bg-slate-600 text-white border-slate-500',
  '2': 'bg-blue-700/80 text-blue-100 border-blue-500',
  '3': 'bg-sky-700/80 text-sky-100 border-sky-500',
  '4': 'bg-amber-500 text-slate-950 border-amber-400 shadow-amber-500/40 shadow-sm font-black',
  '6': 'bg-emerald-500 text-white border-emerald-400 shadow-emerald-500/40 shadow-sm font-black',
  'W': 'bg-rose-600 text-white border-rose-400 shadow-rose-500/40 shadow-sm font-black',
};

export const OverTracker: React.FC<OverTrackerProps> = ({ overHistory }) => {
  const balls = [...overHistory];
  while (balls.length < 6) balls.push('');

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-30 select-none">
      <div className="
        flex flex-col items-center gap-1.5
        bg-slate-950/88 backdrop-blur-sm
        border border-slate-700/60 rounded-xl
        px-4 py-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.7)]
      ">
        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-[0.15em]">
          This Over
        </span>
        <div className="flex items-center gap-1.5">
          {balls.map((ball, i) => (
            <div
              key={i}
              className={`
                w-7 h-7 rounded-full border flex items-center justify-center
                text-[10px] font-bold transition-all
                ${ball ? BALL_STYLES[ball] ?? 'bg-slate-700 text-slate-300 border-slate-600'
                       : 'bg-slate-900 border-slate-800'}
              `}
            >
              {ball}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CRICKET OVERLAYS — GAME OVER / INNINGS BREAK (preserved + enhanced)
// ─────────────────────────────────────────────────────────────────────────────

interface CricketOverlaysProps {
  isGameOver: boolean;
  isWin: boolean;
  isDraw?: boolean;
  isInningsBreak?: boolean;
  score: number;
  wickets: number;
  overs: string;
  target?: number | null;
  wonBy?: string;
  isMultiplayer: boolean;
  onReplay: () => void;
  onExit: () => void;

  // Broadcast HUD props
  liveScore?: number;
  liveWickets?: number;
  liveOvers?: string;
  liveTarget?: number | null;
  runRate?: string;
  reqRunRate?: string;
  overHistory?: string[];
  showBroadcastHUD?: boolean;
  gameEvent?: { type: string; runs?: number } | null;
  inning?: 1 | 2;
  teamName?: string;
}

export const CricketOverlays: React.FC<CricketOverlaysProps> = ({
  isGameOver,
  isWin,
  isDraw,
  isInningsBreak,
  score,
  wickets,
  overs,
  target,
  wonBy,
  isMultiplayer,
  onReplay,
  onExit,
  liveScore,
  liveWickets,
  liveOvers,
  liveTarget,
  runRate,
  reqRunRate,
  overHistory,
  showBroadcastHUD = false,
  gameEvent,
  inning = 1,
  teamName,
}) => {
  return (
    <>
      {/* ── Broadcast HUD (always visible during play) ─────────────────────── */}
      {showBroadcastHUD && !isGameOver && !isInningsBreak && (
        <>
          <BroadcastScorebar
            score={liveScore ?? 0}
            wickets={liveWickets ?? 0}
            overs={liveOvers ?? '0.0'}
            target={liveTarget}
            runRate={runRate}
            reqRunRate={reqRunRate}
            teamName={teamName}
            inning={inning}
          />
          {overHistory && overHistory.length > 0 && (
            <OverTracker overHistory={overHistory} />
          )}
        </>
      )}

      {/* ── Event Banner ───────────────────────────────────────────────────── */}
      {showBroadcastHUD && !isGameOver && !isInningsBreak && (
        <CricketEventBanner event={gameEvent ?? null} />
      )}

      {/* ── Game Over / Innings Break Modal ────────────────────────────────── */}
      {(isGameOver || isInningsBreak) && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in select-none">
          {/* Ambient background glow */}
          <div className={`pointer-events-none absolute w-96 h-96 rounded-full blur-3xl opacity-40 ${
            isWin || isInningsBreak ? 'bg-amber-500' : 'bg-rose-600'
          }`} />

          {/* Main Glassmorphic Modal */}
          <div className={`
            relative flex flex-col items-center w-full max-w-sm p-6 sm:p-7
            bg-slate-900/95 backdrop-blur-2xl
            border-2 rounded-3xl shadow-[0_0_60px_rgba(0,0,0,0.9)]
            transform animate-in zoom-in-95 duration-200
            ${isWin || isInningsBreak ? 'border-amber-500/60 shadow-amber-500/20' : 'border-rose-500/60 shadow-rose-500/20'}
          `}>
            {/* Floating Top Badge */}
            <div className={`
              w-16 h-16 rounded-2xl flex items-center justify-center border-2 mb-3 shadow-lg transform -translate-y-2
              ${isWin || isInningsBreak
                ? 'bg-gradient-to-tr from-amber-500/30 to-amber-400/10 border-amber-500/70 shadow-amber-500/30 animate-bounce'
                : 'bg-gradient-to-tr from-rose-500/30 to-rose-400/10 border-rose-500/70 shadow-rose-500/30'
              }
            `}>
              {isWin || isInningsBreak ? (
                <Trophy className="w-9 h-9 text-amber-400" />
              ) : (
                <XCircle className="w-9 h-9 text-rose-400" />
              )}
            </div>

            {/* Outcome Header */}
            <h2 className={`
              text-2xl sm:text-3xl font-black tracking-wider uppercase text-center
              ${isWin || isInningsBreak ? 'text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]' : 'text-rose-400 drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]'}
            `}>
              {isInningsBreak
                ? 'INNINGS COMPLETE!'
                : isWin
                  ? 'MATCH VICTORY!'
                  : isDraw
                    ? 'MATCH TIED!'
                    : 'MATCH DEFEAT'}
            </h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center mt-0.5 mb-4">
              {isInningsBreak
                ? `Target: ${target ?? score + 1} Runs`
                : wonBy
                  ? wonBy
                  : isWin
                    ? 'Outstanding Batting & Bowling!'
                    : 'Better luck next time!'}
            </p>

            {/* Bento Stat Grid */}
            <div className="grid grid-cols-2 gap-2.5 w-full mb-4">
              {/* Final Score */}
              <div className="col-span-2 p-3.5 bg-slate-950/70 border border-slate-800 rounded-2xl flex items-center justify-between shadow-inner">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center border border-amber-500/40 text-amber-400">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Scorecard</p>
                    <p className="text-xs text-amber-400/80 font-semibold">Total Runs / Wickets</p>
                  </div>
                </div>
                <span className="text-2xl font-black font-mono text-white tracking-tight">
                  {score} <span className="text-sm font-bold text-slate-500">/ {wickets}</span>
                </span>
              </div>

              {/* Overs */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap className="w-3.5 h-3.5 text-sky-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Overs</span>
                </div>
                <span className="text-lg font-black font-mono text-sky-400">
                  {overs} <span className="text-[10px] text-slate-500 font-bold uppercase">Ov</span>
                </span>
              </div>

              {/* Target */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-2xl flex flex-col justify-between">
                <div className="flex items-center gap-1.5 mb-1">
                  <Flame className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Target</span>
                </div>
                <span className="text-lg font-black font-mono text-emerald-400">
                  {target ? target : 'Set'}
                </span>
              </div>
            </div>

            {/* Practice Reward Badge */}
            {isWin && !isMultiplayer && (
              <div className="w-full py-2.5 px-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl font-bold text-xs text-emerald-400 mb-4 flex items-center justify-center gap-2 shadow-sm">
                <Sparkles className="w-4 h-4 animate-pulse" />
                <span>+50 Coins Practice Reward Claimed!</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-2.5 w-full">
              <button
                onClick={onReplay}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.35)] transform hover:scale-[1.02] active:scale-[0.98] transition-all tracking-wider uppercase flex items-center justify-center gap-2"
              >
                {isInningsBreak ? (
                  <>
                    <ArrowRight className="w-4 h-4" /> Start 2nd Innings
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" /> {isMultiplayer ? 'Request Rematch' : 'Play Again'}
                  </>
                )}
              </button>
              <button
                onClick={onExit}
                className="w-full py-3 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white font-bold text-xs rounded-xl border border-slate-700/80 transition-colors uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5" /> Exit to Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CricketOverlays;
