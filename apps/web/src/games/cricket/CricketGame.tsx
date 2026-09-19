import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { CricketState } from '@gaming-hub/game-engine';
import { GameWrapper } from '../../components/GameWrapper';
import { CricketPhaserGame } from './CricketPhaserGame';
import { MultiplayerMatchPanel } from '../shared/components/MultiplayerMatchPanel';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import { CricketTossUI } from './components/CricketTossUI';
import { CricketOverlays } from './components/CricketOverlays';
import { Users, X } from 'lucide-react';

interface CricketProps {
  mode: 'ai' | 'multiplayer';
  stake: number;
  onBack: () => void;
}

const EMPTY_PLAYERS: any[] = [];

// ─── Live Scoreboard Sidebar ──────────────────────────────────────────────────

interface LiveScoreboardProps {
  remoteState: CricketState | null;
  mySeat: number | null;
  namesBySeat: Record<number, string>;
  isMyTurn: boolean;
}

const LiveScoreboard: React.FC<LiveScoreboardProps> = ({ remoteState, mySeat, namesBySeat, isMyTurn }) => {
  const s = remoteState;
  if (!s) return null;

  const currentInning = s.inning ?? 1;
  const score1 = s.team1Score ?? 0;
  const wkts1 = s.team1Wickets ?? 0;
  const score2 = s.team2Score ?? 0;
  const wkts2 = s.team2Wickets ?? 0;
  const overs = `${s.currentOver ?? 0}.${s.currentBall ?? 0}/${s.totalOvers ?? 1}`;
  const target = s.target ?? null;
  const rr = (() => {
    const ballsBowled = (s.currentOver ?? 0) * 6 + (s.currentBall ?? 0);
    const currentScore = s.battingTeam === 0 ? score1 : score2;
    return ballsBowled > 0 ? (currentScore / (ballsBowled / 6)).toFixed(1) : '0.0';
  })();

  const player1Name = namesBySeat[0] ?? 'Player 1';
  const player2Name = namesBySeat[1] ?? 'Player 2';

  const actorLabel = (() => {
    if (!s.currentActor || s.finished) return null;
    if (s.currentActor === 'bowler') {
      return s.bowlingTeam === mySeat ? 'YOUR TURN · BOWL' : `${namesBySeat[s.bowlingTeam ?? (1 - (mySeat ?? 0))] ?? 'Opponent'} bowling…`;
    }
    if (s.currentActor === 'batsman') {
      return s.battingTeam === mySeat ? 'YOUR TURN · BAT' : `${namesBySeat[s.battingTeam ?? (1 - (mySeat ?? 0))] ?? 'Opponent'} batting…`;
    }
    return null;
  })();

  const isMyActor = (s.currentActor === 'bowler' && s.bowlingTeam === mySeat) ||
                    (s.currentActor === 'batsman' && s.battingTeam === mySeat);

  return (
    <div className="flex flex-col gap-3 w-full max-w-[300px]">

      {/* Turn Banner */}
      {actorLabel && (
        <div className={`
          flex items-center justify-center gap-2.5 px-4 py-3 rounded-2xl
          font-black text-xs uppercase tracking-widest border transition-all
          ${isMyActor
            ? 'bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-emerald-500/20 text-emerald-400 border-emerald-500/40'
            : 'bg-slate-900/90 text-slate-400 border-slate-800'}
        `}>
          <span className={`w-2.5 h-2.5 rounded-full ${isMyActor ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500 animate-pulse'}`} />
          <span>{actorLabel}</span>
        </div>
      )}

      {/* Scoreboard Card */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 shadow-xl backdrop-blur-xl space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Scorecard</span>
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wide">INN {currentInning}</span>
        </div>

        {/* Team 1 */}
        <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${mySeat === 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-800 bg-slate-950/40'}`}>
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 font-black text-xs flex-shrink-0">
            {mySeat === 0 ? 'Y' : 'O'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-slate-400 font-bold truncate flex items-center gap-1">
              {player1Name}
              {mySeat === 0 && <span className="text-[9px] text-amber-400 font-black uppercase">(YOU)</span>}
            </div>
            <div className="text-xl font-black text-white leading-none mt-0.5">
              {score1}<span className="text-slate-500 text-xs font-bold ml-1">/{wkts1}</span>
            </div>
          </div>
          <div className="text-[10px] font-bold text-slate-500 uppercase">T1</div>
        </div>

        {/* Team 2 */}
        <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${mySeat === 1 ? 'border-sky-500/30 bg-sky-500/5' : 'border-slate-800 bg-slate-950/40'}`}>
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-400 to-sky-600 flex items-center justify-center text-slate-950 font-black text-xs flex-shrink-0">
            {mySeat === 1 ? 'Y' : 'O'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-slate-400 font-bold truncate flex items-center gap-1">
              {player2Name}
              {mySeat === 1 && <span className="text-[9px] text-sky-400 font-black uppercase">(YOU)</span>}
            </div>
            <div className="text-xl font-black text-white leading-none mt-0.5">
              {score2}<span className="text-slate-500 text-xs font-bold ml-1">/{wkts2}</span>
            </div>
          </div>
          <div className="text-[10px] font-bold text-slate-500 uppercase">T2</div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800">
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Overs</span>
            <span className="text-xs font-black text-slate-200">{overs}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">RR</span>
            <span className="text-xs font-black text-amber-400">{rr}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Target</span>
            <span className="text-xs font-black text-sky-400">{target ?? '--'}</span>
          </div>
        </div>
      </div>

      {/* Multiplayer Match Panel (player profiles & controls) */}
      <MultiplayerMatchPanel compact />
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const CricketGame: React.FC<CricketProps> = ({ mode, stake, onBack }) => {
  const isMultiplayer = mode === 'multiplayer';

  const [playerRole, setPlayerRole] = useState<'batting' | 'bowling' | null>(null);
  const [matchOvers, setMatchOvers] = useState<number>(1);
  const [aiGameOver, setAiGameOver] = useState(false);
  const [finalRuns, setFinalRuns] = useState(0);
  const [finalWickets, setFinalWickets] = useState(0);
  const [isWin, setIsWin] = useState(false);
  const [showTossUI, setShowTossUI] = useState(false);
  const [tossComplete, setTossComplete] = useState(false);
  const [showMobilePanel, setShowMobilePanel] = useState(false);

  // ── Broadcast HUD state ───────────────────────────────────────────────────
  const [gameEvent, setGameEvent] = useState<{ type: string; runs?: number } | null>(null);
  const [overHistory, setOverHistory] = useState<string[]>([]);
  const eventTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
  }, []);

  const gameState = useMultiplayerStore((s) => s.gameState);
  const winner = useMultiplayerStore((s) => s.winner);
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const isSpectator = useMultiplayerStore((s) => s.isSpectator);
  const room = useMultiplayerStore((s) => s.room);
  const roomPlayers = room?.players ?? EMPTY_PLAYERS;
  const rematchState = useMultiplayerStore((s) => s.rematchState);
  const myUserId = roomPlayers.find((p) => p.seat === mySeat)?.id;
  const myRematchRequested = Boolean(myUserId && rematchState?.requestedBy?.includes(myUserId));

  const remoteState = isMultiplayer ? (gameState as unknown as CricketState | null) : null;

  const namesBySeat: Record<number, string> = {};
  for (const p of roomPlayers) {
    if (p.seat != null) namesBySeat[p.seat] = p.displayName;
  }

  useEffect(() => {
    if (isMultiplayer && remoteState) {
      if (!remoteState.finished && !winner) {
        if (remoteState.currentActor === 'toss' && remoteState.tossWinner == null) {
          setShowTossUI(true);
          setTossComplete(false);
        }
      }
      if (remoteState.tossWinner != null) {
        setShowTossUI(false);
        setTossComplete(true);
      }
    }
  }, [isMultiplayer, remoteState, winner]);

  const matchStarted = isMultiplayer ? Boolean(remoteState) : Boolean(playerRole);
  const matchFinished = isMultiplayer
    ? Boolean(remoteState?.finished || winner)
    : aiGameOver;

  const handleGameOver = useCallback((runs: number, wickets: number, won: boolean) => {
    setFinalRuns(runs);
    setFinalWickets(wickets);
    setIsWin(won);
    setAiGameOver(true);
  }, []);

  const handleGameEvent = useCallback((type: string, data?: Record<string, unknown>) => {
    if (eventTimerRef.current) clearTimeout(eventTimerRef.current);
    const runs = data?.runs as number | undefined;
    setGameEvent({ type, runs });

    // Update over history for ball tracker
    if (type === 'four') setOverHistory(prev => [...prev.slice(-5), '4']);
    else if (type === 'six') setOverHistory(prev => [...prev.slice(-5), '6']);
    else if (type === 'wicket') setOverHistory(prev => [...prev.slice(-5), 'W']);
    else if (type === 'runs' && runs != null) setOverHistory(prev => [...prev.slice(-5), String(runs)]);

    // Clear banner after 2.5s
    eventTimerRef.current = setTimeout(() => setGameEvent(null), 2500);
  }, []);

  const handleReplay = () => {
    if (isMultiplayer) {
      if (rematchState?.active && rematchState.requestedBy.length > 0 && !myRematchRequested) {
        void useMultiplayerStore.getState().acceptRematch();
      } else {
        void useMultiplayerStore.getState().requestRematch();
      }
      return;
    }
    setAiGameOver(false);
    setPlayerRole(null);
  };

  const winnerSeats = isMultiplayer
    ? winner?.winnerSeats ?? remoteState?.winnerSeats ?? []
    : [];
  const winnerSeat = winnerSeats.length > 0 ? winnerSeats[0] : (remoteState?.winner ?? null);
  const winnerName = winnerSeat != null
    ? (namesBySeat[winnerSeat] ?? `Player ${winnerSeat + 1}`)
    : null;
  const isMultiWin = winnerSeat != null && winnerSeat === mySeat;

  const scoreOf = (team: number | null | undefined) =>
    team == null
      ? ''
      : `${team === 0 ? remoteState?.team1Score : remoteState?.team2Score}/${team === 0 ? remoteState?.team1Wickets : remoteState?.team2Wickets}`;

  const isMyTurn = remoteState
    ? (remoteState.currentActor === 'bowler' && remoteState.bowlingTeam === mySeat) ||
      (remoteState.currentActor === 'batsman' && remoteState.battingTeam === mySeat)
    : false;

  const currentInning = remoteState?.inning ?? 1;
  const score1 = remoteState?.team1Score ?? 0;
  const wkts1 = remoteState?.team1Wickets ?? 0;
  const score2 = remoteState?.team2Score ?? 0;
  const wkts2 = remoteState?.team2Wickets ?? 0;
  const oversStr = `${remoteState?.currentOver ?? 0}.${remoteState?.currentBall ?? 0}/${remoteState?.totalOvers ?? 1}`;
  const targetVal = remoteState?.target ?? null;
  const runRateVal = (() => {
    const ballsBowled = ((remoteState?.currentOver ?? 0) * 6) + (remoteState?.currentBall ?? 0);
    const currentScore = remoteState?.battingTeam === 0 ? score1 : score2;
    return ballsBowled > 0 ? (currentScore / (ballsBowled / 6)).toFixed(1) : '0.0';
  })();

  const player1Name = namesBySeat[0] ?? 'Player 1';
  const player2Name = namesBySeat[1] ?? 'Player 2';

  const actorLabel = (() => {
    if (!remoteState || !remoteState.currentActor || remoteState.finished) return null;
    if (remoteState.currentActor === 'bowler') {
      return remoteState.bowlingTeam === mySeat ? 'YOUR TURN · BOWL' : `${namesBySeat[remoteState.bowlingTeam ?? (1 - (mySeat ?? 0))] ?? 'Opponent'} bowling…`;
    }
    if (remoteState.currentActor === 'batsman') {
      return remoteState.battingTeam === mySeat ? 'YOUR TURN · BAT' : `${namesBySeat[remoteState.battingTeam ?? (1 - (mySeat ?? 0))] ?? 'Opponent'} batting…`;
    }
    return null;
  })();

  const isMyActor = remoteState
    ? (remoteState.currentActor === 'bowler' && remoteState.bowlingTeam === mySeat) ||
      (remoteState.currentActor === 'batsman' && remoteState.battingTeam === mySeat)
    : false;

  // ── Waiting state ─────────────────────────────────────────────────────────

  if (isMultiplayer && !matchStarted) {
    return (
      <GameWrapper title="Cricket World Premier League" gameId="cricket" mode={mode} stake={stake} onBack={onBack} isFullscreen isGameOver={true}>
        <div className="flex flex-col items-center justify-center w-full max-w-xl mx-auto gap-8 relative z-10">
          <div className="flex flex-col items-center justify-center w-full p-10 bg-slate-900/70 backdrop-blur-xl rounded-[2rem] border border-white/10 shadow-[0_8px_40px_rgba(0,0,0,0.5)] text-center">
            {/* Ambient glow */}
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-48 h-48 bg-amber-500/10 blur-[80px] rounded-full pointer-events-none" />

            <div className="text-6xl mb-5 animate-bounce">🏏</div>
            <h2 className="text-3xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 mb-3">
              Waiting for Match
            </h2>
            <p className="text-slate-400 mb-8 text-sm">
              All players must join before the match begins.
            </p>

            <div className="flex items-center gap-3 mb-8">
              <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-slate-300 text-sm font-semibold">Connecting players…</span>
            </div>

            <MultiplayerMatchPanel />
          </div>
        </div>
      </GameWrapper>
    );
  }

  // ── Main game render ───────────────────────────────────────────────────────

  return (
    <GameWrapper title="Cricket World Premier League" gameId="cricket" mode={mode} stake={stake} onBack={onBack} isFullscreen isGameOver={matchFinished || (!isMultiplayer && !playerRole)}>
      <div className="relative h-full w-full flex flex-col xl:flex-row items-center justify-center gap-0 xl:gap-6 max-w-7xl mx-auto z-10 p-0 select-none overflow-hidden xl:overflow-y-auto my-auto">

        {/* ── AI: Role picker ── */}
        {!isMultiplayer && !playerRole && (
          <div className="flex flex-col items-center justify-center w-full max-w-xl mx-auto my-auto p-6 sm:p-10 bg-slate-900/85 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.7)] animate-in fade-in zoom-in-95 duration-200">
            <h2 className="text-3xl sm:text-4xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 text-center mb-2">
              Match Setup
            </h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center mb-8">
              Quick 1-Over Blitz Match
            </p>

            <div className="flex flex-col sm:flex-row gap-5 w-full justify-center">
              {[
                { role: 'batting' as const, icon: '🏏', label: 'Play as Batsman', sub: 'Chase down the target!', color: 'blue', hoverFrom: 'hover:from-blue-900/40', glow: 'rgba(59,130,246,0.5)' },
                { role: 'bowling' as const, icon: '⚾', label: 'Play as Bowler', sub: 'Defend the target!', color: 'red', hoverFrom: 'hover:from-red-900/40', glow: 'rgba(239,68,68,0.5)' },
              ].map(opt => (
                <button
                  key={opt.role}
                  onClick={() => setPlayerRole(opt.role)}
                  className={`flex flex-col items-center justify-center p-8 bg-gradient-to-b from-slate-800/80 to-slate-900/80 ${opt.hoverFrom} hover:to-slate-900/80 border border-white/10 hover:border-${opt.color}-500/50 rounded-[2rem] transition-all duration-300 shadow-xl hover:-translate-y-2 group w-full sm:w-60 relative overflow-hidden`}
                  style={{ '--hover-glow': opt.glow } as any}
                >
                  <div className="text-7xl mb-5 group-hover:scale-110 transition-transform duration-500 drop-shadow-lg">{opt.icon}</div>
                  <span className="text-base font-black text-white uppercase tracking-wider">{opt.label}</span>
                  <span className="text-xs text-slate-400 mt-2 text-center">{opt.sub}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Multiplayer: initializing spinner ── */}
        {isMultiplayer && !matchStarted && (
          <div className="flex flex-col items-center justify-center w-full max-w-sm mx-auto p-10 bg-slate-900/70 backdrop-blur-xl rounded-[2rem] border border-white/10 text-center gap-6">
            <div className="text-6xl">🏏</div>
            <h2 className="text-2xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500">
              Initializing Match
            </h2>
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-slate-300 text-sm">Preparing toss…</span>
            </div>
          </div>
        )}

        {/* ── Main Game Area ── */}
        {(playerRole || (isMultiplayer && matchStarted)) && (
          <>
            {/* Phaser canvas + Mobile Top HUD */}
            <div className="flex flex-col items-center justify-center flex-1 min-h-0 w-full h-full">
              {/* ═══ MOBILE TOP LIVE SCOREBOARD BAR (< xl) ═══ */}
              {isMultiplayer && remoteState && (
                <div className="xl:hidden w-full max-w-lg bg-[#0d1322]/95 backdrop-blur-xl border border-slate-800/90 rounded-xl p-1.5 shadow-xl mb-1 select-none shrink-0">
                  {/* Turn indicator pill */}
                  {actorLabel && (
                    <div className={`flex items-center justify-center gap-1.5 px-2.5 py-0.5 rounded-lg font-extrabold text-[9px] uppercase tracking-wider border mb-1 transition-all ${
                      isMyActor
                        ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/40'
                        : 'bg-slate-900/90 text-slate-400 border-slate-800'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isMyActor ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500 animate-pulse'}`} />
                      <span>{actorLabel}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-1.5">
                    {/* Team 1 */}
                    <div className={`flex-1 flex items-center gap-1.5 p-1 rounded-lg border transition-all ${
                      mySeat === 0 ? 'border-amber-500/40 bg-amber-950/20' : 'border-slate-800 bg-slate-900/60'
                    }`}>
                      <div className="w-6 h-6 rounded bg-amber-500/20 border border-amber-500/40 flex items-center justify-center font-black text-[9px] text-amber-300 shrink-0">
                        {mySeat === 0 ? 'YOU' : 'T1'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider truncate">
                          {player1Name} {mySeat === 0 && <span className="text-amber-400 font-black">•</span>}
                        </div>
                        <div className="text-sm font-black font-mono text-white leading-none mt-0.5">
                          {score1}<span className="text-slate-400 text-[10px] font-bold">/{wkts1}</span>
                        </div>
                      </div>
                    </div>

                    {/* Center Match Stats & Details Toggle */}
                    <div className="flex flex-col items-center justify-center px-1 shrink-0">
                      <div className="flex items-center gap-0.5 text-[8px] font-mono text-slate-300 font-bold">
                        <span className="text-slate-400">OV:</span> <span className="text-white font-black">{oversStr}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[8px] font-bold">
                        <span className="text-amber-400 font-mono">RR {runRateVal}</span>
                        {targetVal != null && <span className="text-sky-400 font-mono">TGT {targetVal}</span>}
                      </div>
                      <button
                        onClick={() => setShowMobilePanel(true)}
                        className="text-[8px] font-bold text-indigo-400 hover:text-indigo-300 underline flex items-center gap-0.5 cursor-pointer"
                        title="Open Match Details & Chat"
                      >
                        <Users className="w-2.5 h-2.5" /> Details
                      </button>
                    </div>

                    {/* Team 2 */}
                    <div className={`flex-1 flex items-center justify-end gap-1.5 p-1 rounded-lg border transition-all ${
                      mySeat === 1 ? 'border-sky-500/40 bg-sky-950/20' : 'border-slate-800 bg-slate-900/60'
                    }`}>
                      <div className="min-w-0 flex-1 text-right">
                        <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider truncate">
                          {player2Name} {mySeat === 1 && <span className="text-sky-400 font-black">•</span>}
                        </div>
                        <div className="text-sm font-black font-mono text-white leading-none mt-0.5">
                          {score2}<span className="text-slate-400 text-[10px] font-bold">/{wkts2}</span>
                        </div>
                      </div>
                      <div className="w-6 h-6 rounded bg-sky-500/20 border border-sky-500/40 flex items-center justify-center font-black text-[9px] text-sky-300 shrink-0">
                        {mySeat === 1 ? 'YOU' : 'T2'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <CricketPhaserGame
                mode={mode}
                role={isMultiplayer ? 'batting' : (playerRole ?? 'batting')}
                overs={isMultiplayer ? 5 : matchOvers}
                onGameOver={isMultiplayer ? undefined : handleGameOver}
                onGameEvent={handleGameEvent}
              />
            </div>

            {/* Sidebar (Desktop >= xl) */}
            {isMultiplayer && (
              <div className="hidden xl:block flex-shrink-0 self-start pt-2">
                <LiveScoreboard
                  remoteState={remoteState}
                  mySeat={mySeat}
                  namesBySeat={namesBySeat}
                  isMyTurn={isMyTurn}
                />
              </div>
            )}

            {/* ═══ MOBILE CENTERED MULTIPLAYER DETAILS MODAL ═══ */}
            {isMultiplayer && showMobilePanel && (
              <div className="xl:hidden fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
                <div
                  className="fixed inset-0"
                  onClick={() => setShowMobilePanel(false)}
                  aria-hidden="true"
                />
                <div className="relative z-10 bg-slate-900/98 border border-slate-700/80 rounded-3xl p-4 max-h-[88vh] w-full max-w-sm overflow-y-auto flex flex-col gap-3 shadow-[0_20px_50px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-200 custom-scrollbar">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                        <Users size={15} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-white leading-tight">Match Details & Chat</h3>
                        {room && <p className="text-[10px] text-slate-400 font-mono">Room: <span className="font-bold text-indigo-300">{room.code}</span></p>}
                      </div>
                    </div>
                    <button
                      onClick={() => setShowMobilePanel(false)}
                      className="p-1.5 rounded-full text-slate-400 hover:text-white bg-slate-800 transition-colors cursor-pointer"
                      aria-label="Close modal"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Match Panel & Chat */}
                  <div className="w-full flex justify-center py-1">
                    <MultiplayerMatchPanel compact={false} showControls={true} showChat={true} className="w-full max-w-full" />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ══ CRICKET OVERLAYS — BROADCAST HUD + GAME-OVER MODAL ══ */}
      <CricketOverlays
        isGameOver={matchFinished}
        isWin={isMultiplayer ? isMultiWin : isWin}
        isDraw={isMultiplayer && winnerSeats.length === 0}
        score={isMultiplayer ? (remoteState ? (mySeat === 0 ? remoteState.team1Score : remoteState.team2Score) : 0) : finalRuns}
        wickets={isMultiplayer ? (remoteState ? (mySeat === 0 ? remoteState.team1Wickets : remoteState.team2Wickets) : 0) : finalWickets}
        overs={isMultiplayer ? (remoteState ? `${remoteState.currentOver}.${remoteState.currentBall}` : '0.0') : `${matchOvers}.0`}
        target={isMultiplayer ? (remoteState?.target ?? null) : null}
        wonBy={isMultiplayer && winnerName ? `Winner: ${winnerName}` : undefined}
        stake={stake}
        isMultiplayer={isMultiplayer}
        onReplay={handleReplay}
        onExit={onBack}
        showBroadcastHUD={matchStarted && !matchFinished}
        gameEvent={gameEvent}
        overHistory={overHistory}
        liveScore={isMultiplayer ? (remoteState ? (mySeat === 0 ? remoteState.team1Score : remoteState.team2Score) : 0) : undefined}
        liveWickets={isMultiplayer ? (remoteState ? (mySeat === 0 ? remoteState.team1Wickets : remoteState.team2Wickets) : 0) : undefined}
        liveOvers={isMultiplayer ? (remoteState ? `${remoteState.currentOver}.${remoteState.currentBall}/${remoteState.totalOvers}` : '0.0') : undefined}
        liveTarget={isMultiplayer ? (remoteState?.target ?? null) : null}
        runRate={isMultiplayer && remoteState ? (() => {
          const balls = (remoteState.currentOver ?? 0) * 6 + (remoteState.currentBall ?? 0);
          const sc = remoteState.battingTeam === 0 ? remoteState.team1Score : remoteState.team2Score;
          return balls > 0 ? (sc / (balls / 6)).toFixed(1) : '0.0';
        })() : undefined}
        inning={isMultiplayer ? (remoteState?.inning as 1 | 2 ?? 1) : 1}
        teamName={isMultiplayer ? (namesBySeat[mySeat ?? 0] ?? 'YOU') : (playerRole === 'batting' ? 'BATTING' : 'BOWLING')}
      />

      {/* ══ TOSS UI ══ */}
      {isMultiplayer && showTossUI && remoteState && (
        <CricketTossUI onTossComplete={() => {
          setShowTossUI(false);
          setTossComplete(true);
        }} />
      )}
    </GameWrapper>
  );
};
