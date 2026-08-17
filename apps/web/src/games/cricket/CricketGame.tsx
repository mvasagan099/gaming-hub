import React, { useState, useEffect, useCallback } from 'react';
import type { CricketState } from '@gaming-hub/game-engine';
import { GameWrapper } from '../../components/GameWrapper';
import { claimPracticeReward } from '../../services/api/practiceReward';
import { CricketPhaserGame } from './CricketPhaserGame';
import { MultiplayerMatchPanel } from '../shared/components/MultiplayerMatchPanel';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import { CricketTossUI } from './components/CricketTossUI';

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
  const overs = `${s.currentOver ?? 0}.${s.currentBall ?? 0}/${s.totalOvers ?? 5}`;
  const target = s.target ?? null;
  const rr = (() => {
    const ballsBowled = (s.currentOver ?? 0) * 6 + (s.currentBall ?? 0);
    const currentScore = currentInning === 1 ? score1 : score2;
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

  const gameState = useMultiplayerStore((s) => s.gameState);
  const winner = useMultiplayerStore((s) => s.winner);
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const isSpectator = useMultiplayerStore((s) => s.isSpectator);
  const roomPlayers = useMultiplayerStore((s) => s.room?.players) ?? EMPTY_PLAYERS;
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
    if (won) {
      setTimeout(() => void claimPracticeReward('cricket'), 1000);
    }
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

  // ── Waiting state ─────────────────────────────────────────────────────────

  if (isMultiplayer && !matchStarted) {
    return (
      <GameWrapper title="Cricket World Premier League" gameId="cricket" mode={mode} stake={stake} onBack={onBack} isFullscreen>
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
    <GameWrapper title="Cricket World Premier League" gameId="cricket" mode={mode} stake={stake} onBack={onBack} isFullscreen>
      <div className="flex flex-col xl:flex-row items-center xl:items-start justify-center gap-6 w-full max-w-7xl mx-auto relative z-10 p-2">

        {/* ── AI: Role picker ── */}
        {!isMultiplayer && !playerRole && (
          <div className="flex flex-col items-center justify-center w-full max-w-xl mx-auto p-10 bg-slate-900/70 backdrop-blur-xl rounded-[2rem] border border-white/10 shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
            <h2 className="text-4xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 text-center mb-10">
              Match Setup
            </h2>

            <div className="mb-10 w-full flex flex-col items-center">
              <h3 className="text-xs font-black text-slate-400 mb-4 uppercase tracking-widest">Select Format</h3>
              <div className="flex gap-3">
                {[1, 3, 5].map(overs => (
                  <button
                    key={overs}
                    onClick={() => setMatchOvers(overs)}
                    className={`px-7 py-3 rounded-2xl font-black transition-all duration-300 border-2 text-sm ${
                      matchOvers === overs
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.3)] scale-105'
                        : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:border-white/20'
                    }`}
                  >
                    {overs} Over{overs > 1 ? 's' : ''}
                  </button>
                ))}
              </div>
            </div>

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
            {/* Phaser canvas */}
            <div className="flex flex-col items-center flex-shrink-0 w-full xl:w-auto">
              <CricketPhaserGame
                mode={mode}
                role={isMultiplayer ? 'batting' : (playerRole ?? 'batting')}
                overs={isMultiplayer ? 5 : matchOvers}
                onGameOver={isMultiplayer ? undefined : handleGameOver}
              />
            </div>

            {/* Sidebar */}
            {isMultiplayer && (
              <div className="flex-shrink-0 w-full xl:w-auto flex justify-center xl:block xl:self-start xl:pt-2">
                <LiveScoreboard
                  remoteState={remoteState}
                  mySeat={mySeat}
                  namesBySeat={namesBySeat}
                  isMyTurn={isMyTurn}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* ══ MULTIPLAYER GAME OVER OVERLAY ══ */}
      {isMultiplayer && matchFinished && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xl p-4 animate-in fade-in duration-300">
          <div className="relative bg-gradient-to-b from-slate-900/95 to-slate-950/98 border border-white/15 p-8 rounded-[2.5rem] shadow-[0_0_80px_rgba(0,0,0,0.8)] flex flex-col items-center max-w-md w-full mx-auto overflow-hidden text-center">
            {/* Glow */}
            <div className={`absolute -top-32 -left-32 w-64 h-64 rounded-full blur-[100px] opacity-20 ${isMultiWin ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <div className="absolute -bottom-32 -right-32 w-64 h-64 rounded-full blur-[100px] opacity-20 bg-amber-500" />

            <div className="text-7xl mb-4 relative z-10 animate-bounce">
              {isSpectator ? '🏏' : winnerSeats.length === 0 ? '🤝' : isMultiWin ? '🏆' : '💔'}
            </div>
            <h2 className={`text-4xl font-black uppercase tracking-widest mb-1 relative z-10 ${
              isSpectator ? 'text-slate-300'
              : winnerSeats.length === 0 ? 'text-amber-400'
              : isMultiWin ? 'text-emerald-400' : 'text-rose-400'
            }`}>
              {isSpectator
                ? 'MATCH COMPLETE'
                : winnerSeats.length === 0
                  ? "IT'S A TIE!"
                  : isMultiWin
                    ? 'VICTORY!'
                    : 'DEFEAT!'}
            </h2>
            {winnerName && (
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-black mb-6 relative z-10 uppercase tracking-widest">
                👑 Winner: <span className="font-extrabold text-white">{winnerName}</span>
              </div>
            )}

            {/* Score grid */}
            <div className="grid grid-cols-2 gap-3 w-full mb-8 relative z-10">
              {[0, 1].map(team => (
                <div key={team} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center">
                  <div className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-0.5">
                    {namesBySeat[team] ?? `Player ${team + 1}`}
                    {team === mySeat && <span className="text-amber-400 ml-1">(YOU)</span>}
                  </div>
                  <div className={`text-2xl font-black ${team === 0 ? 'text-amber-400' : 'text-sky-400'}`}>
                    {remoteState ? scoreOf(team) : '-'}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 w-full relative z-10">
              <button
                onClick={handleReplay}
                disabled={isMultiplayer && myRematchRequested}
                className={`flex-1 py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black tracking-widest uppercase rounded-2xl transition-all text-sm shadow-[0_0_30px_rgba(245,158,11,0.4)] ${
                  isMultiplayer && myRematchRequested
                    ? 'opacity-60 cursor-not-allowed'
                    : 'hover:from-amber-400 hover:to-amber-500 hover:scale-105'
                }`}
              >
                {isMultiplayer && myRematchRequested
                  ? '⏳ Waiting…'
                  : isMultiplayer && rematchState?.active && rematchState.requestedBy.length > 0
                  ? '✓ Accept Rematch'
                  : '🔄 Rematch'}
              </button>
              <button
                onClick={onBack}
                className="flex-1 py-4 bg-white/10 hover:bg-white/20 text-white font-black tracking-widest uppercase rounded-2xl transition-all border border-white/10 text-sm hover:scale-105"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ AI GAME OVER OVERLAY ══ */}
      {!isMultiplayer && aiGameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xl p-4 animate-in fade-in duration-300">
          <div className="relative bg-gradient-to-b from-slate-900/95 to-slate-950/98 border border-white/15 p-8 rounded-[2.5rem] shadow-[0_0_80px_rgba(0,0,0,0.8)] flex flex-col items-center max-w-sm w-full mx-auto overflow-hidden text-center">
            <div className={`absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full blur-[80px] opacity-20 ${isWin ? 'bg-emerald-500' : 'bg-rose-500'}`} />

            <div className="text-7xl mb-4 relative z-10 animate-bounce">{isWin ? '🏆' : '💔'}</div>
            <h2 className={`text-4xl font-black uppercase tracking-widest mb-2 relative z-10 ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isWin ? 'VICTORY!' : 'DEFEAT!'}
            </h2>
            <p className="text-slate-300 text-base mb-6 font-bold relative z-10">
              Final Score: <span className="text-amber-400 text-xl font-extrabold">{finalRuns}</span>
              <span className="text-slate-500 mx-1">/</span>
              <span className="text-white text-xl font-extrabold">{finalWickets}</span>
            </p>

            {isWin && (
              <div className="bg-emerald-950/90 border border-emerald-500/50 text-emerald-400 px-6 py-3 rounded-2xl text-xs font-black flex items-center gap-3 mb-6 shadow-[0_0_20px_rgba(16,185,129,0.3)] relative z-10 uppercase tracking-widest">
                🪙 Match Won! +50 Coins
              </div>
            )}

            <div className="flex gap-3 w-full relative z-10">
              <button
                onClick={handleReplay}
                className="flex-1 py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black tracking-widest uppercase rounded-2xl transition-all shadow-[0_0_30px_rgba(245,158,11,0.4)] hover:scale-105 text-sm"
              >
                🔄 Replay
              </button>
              <button
                onClick={onBack}
                className="flex-1 py-4 bg-white/10 hover:bg-white/20 text-white font-black tracking-widest uppercase rounded-2xl transition-all border border-white/10 hover:scale-105 text-sm"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}

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
