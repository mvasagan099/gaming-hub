import React, { useState, useEffect } from 'react';
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
  const roomPlayers = useMultiplayerStore((s) => s.room?.players ?? []);

  const remoteState = isMultiplayer ? (gameState as unknown as CricketState | null) : null;
  
  useEffect(() => {
    if (isMultiplayer && remoteState) {
      if (remoteState.currentActor === 'toss' && !tossComplete) {
        setShowTossUI(true);
      } else if (remoteState.tossWinner != null) {
        setShowTossUI(false);
        setTossComplete(true);
      }
    }
  }, [isMultiplayer, remoteState, tossComplete]);

  const matchStarted = isMultiplayer ? Boolean(remoteState) : Boolean(playerRole);
  const matchFinished = isMultiplayer
    ? Boolean(remoteState?.finished || winner)
    : aiGameOver;

  const handleGameOver = (runs: number, wickets: number, won: boolean) => {
    setFinalRuns(runs);
    setFinalWickets(wickets);
    setIsWin(won);
    setAiGameOver(true);
    if (won) {
      setTimeout(() => void claimPracticeReward('cricket'), 1000);
    }
  };

  const handleReplay = () => {
    if (isMultiplayer) {
      void useMultiplayerStore.getState().requestRematch();
      return;
    }
    setAiGameOver(false);
    setPlayerRole(null); // Reset role on replay
  };

  // Multiplayer result data
  const namesBySeat: Record<number, string> = {};
  for (const p of roomPlayers) {
    if (p.seat != null) namesBySeat[p.seat] = p.displayName;
  }
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

  // ---------------------------------------------------------------- render

  if (isMultiplayer && !matchStarted) {
    return (
      <GameWrapper title="Cricket World Premier League" gameId="cricket" mode={mode} stake={stake} onBack={onBack} isFullscreen>
        <div className="flex flex-col lg:flex-row items-center justify-center gap-8 w-full max-w-5xl relative z-10">
          <div className="flex flex-col items-center justify-center w-full max-w-2xl mx-auto p-10 bg-[#0f172a]/60 backdrop-blur-xl rounded-[2rem] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] text-center">
            <div className="text-6xl mb-6">🏏</div>
            <h2 className="text-3xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 mb-4 drop-shadow-sm">
              Waiting for Match
            </h2>
            <p className="text-slate-400 mb-8">
              Waiting for all players to join and ready up...
            </p>
            <div className="hidden lg:block">
              <MultiplayerMatchPanel />
            </div>
          </div>
        </div>
      </GameWrapper>
    );
  }

  return (
    <GameWrapper title="Cricket World Premier League" gameId="cricket" mode={mode} stake={stake} onBack={onBack} isFullscreen>
      <div className="flex flex-col lg:flex-row items-center justify-center gap-8 w-full max-w-5xl relative z-10">

        {!isMultiplayer && !playerRole ? (
          <div className="flex flex-col lg:flex-row items-start justify-center gap-6 w-full">
            <div className="flex flex-col items-center justify-center w-full max-w-2xl mx-auto p-10 bg-[#0f172a]/60 backdrop-blur-xl rounded-[2rem] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              <h2 className="text-4xl md:text-5xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 text-center mb-10 drop-shadow-sm">
                Match Setup
              </h2>
              
              <div className="mb-10 w-full flex flex-col items-center">
                <h3 className="text-lg font-bold text-slate-400 mb-4 uppercase tracking-widest">Select Format</h3>
                <div className="flex gap-4">
                  {[1, 3, 5].map(overs => (
                    <button
                      key={overs}
                      onClick={() => setMatchOvers(overs)}
                      className={`px-8 py-3 rounded-2xl font-bold transition-all duration-300 border-2 ${
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

              <div className="flex flex-col sm:flex-row gap-6 w-full justify-center">
                <button
                  onClick={() => setPlayerRole('batting')}
                  className="flex flex-col items-center justify-center p-8 bg-gradient-to-b from-slate-800/80 to-slate-900/80 hover:from-blue-900/40 hover:to-slate-900/80 border border-white/10 hover:border-blue-500/50 rounded-[2rem] transition-all duration-300 shadow-xl hover:-translate-y-2 hover:shadow-[0_10px_40px_-10px_rgba(59,130,246,0.5)] group w-full sm:w-64 relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="text-7xl mb-6 group-hover:scale-110 transition-transform duration-500 drop-shadow-lg relative z-10">🏏</div>
                  <span className="text-xl font-bold text-white uppercase tracking-wider relative z-10">Play as Batsman</span>
                  <span className="text-sm text-slate-400 mt-2 text-center relative z-10">Chase down the target score!</span>
                </button>
                
                <button
                  onClick={() => setPlayerRole('bowling')}
                  className="flex flex-col items-center justify-center p-8 bg-gradient-to-b from-slate-800/80 to-slate-900/80 hover:from-red-900/40 hover:to-slate-900/80 border border-white/10 hover:border-red-500/50 rounded-[2rem] transition-all duration-300 shadow-xl hover:-translate-y-2 hover:shadow-[0_10px_40px_-10px_rgba(239,68,68,0.5)] group w-full sm:w-64 relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="text-7xl mb-6 group-hover:scale-110 transition-transform duration-500 drop-shadow-lg relative z-10">⚾</div>
                  <span className="text-xl font-bold text-white uppercase tracking-wider relative z-10">Play as Bowler</span>
                  <span className="text-sm text-slate-400 mt-2 text-center relative z-10">Defend the target score!</span>
                </button>
              </div>
            </div>
          </div>
        ) : isMultiplayer && !matchStarted ? (
          <div className="flex flex-col items-center justify-center w-full max-w-2xl mx-auto p-10 bg-[#0f172a]/60 backdrop-blur-xl rounded-[2rem] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] text-center">
            <div className="text-6xl mb-6">🏏</div>
            <h2 className="text-3xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 mb-4 drop-shadow-sm">
              Initializing Match
            </h2>
            <p className="text-slate-400 mb-8">
              The toss is being prepared...
            </p>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-slate-300">Loading...</span>
            </div>
          </div>
        ) : isMultiplayer && matchFinished ? (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-500 rounded-3xl">
            <div className="bg-[#0f172a]/90 border border-white/10 p-10 rounded-[2rem] shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col items-center max-w-md w-full mx-4 relative overflow-hidden">
              <div className={`absolute -top-32 -left-32 w-64 h-64 rounded-full blur-[100px] opacity-20 ${isMultiWin ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
              
              <div className="text-7xl mb-6 drop-shadow-lg relative z-10">🏆</div>
              <h2 className={`text-4xl font-black uppercase tracking-widest text-center mb-2 drop-shadow-sm relative z-10 ${
                isSpectator ? 'text-slate-300'
                : winnerSeats.length === 0 ? 'text-amber-400'
                : isMultiWin ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {isSpectator
                  ? 'MATCH COMPLETE'
                  : winnerSeats.length === 0
                    ? "IT'S A TIE!"
                    : isMultiWin
                      ? 'YOU WIN!'
                      : 'YOU LOSE!'}
              </h2>
              {winnerName && (
                <p className="text-slate-300 text-xl text-center mb-4 font-bold relative z-10">
                  Winner: <span className="text-amber-400">{winnerName}</span>
                </p>
              )}
              <div className="flex gap-4 mb-8 relative z-10">
                <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-center">
                  <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                    {namesBySeat[0] ?? 'Team 1'}
                  </div>
                  <div className="text-2xl font-black text-white">
                    {remoteState ? scoreOf(0) : '-'}
                  </div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-center">
                  <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                    {namesBySeat[1] ?? 'Team 2'}
                  </div>
                  <div className="text-2xl font-black text-white">
                    {remoteState ? scoreOf(1) : '-'}
                  </div>
                </div>
              </div>

              <div className="flex gap-4 w-full relative z-10">
                <button
                  onClick={handleReplay}
                  className="flex-1 py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-900 font-black tracking-widest uppercase rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-amber-500/50 hover:scale-105 duration-300"
                >
                  Rematch
                </button>
                <button
                  onClick={onBack}
                  className="flex-1 py-4 bg-white/10 hover:bg-white/20 text-white font-bold tracking-widest uppercase rounded-2xl transition-all border border-white/10 backdrop-blur-sm hover:scale-105 duration-300"
                >
                  Exit
                </button>
              </div>
            </div>
          </div>
        ) : !isMultiplayer && aiGameOver ? (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-500 rounded-3xl">
            <div className="bg-[#0f172a]/90 border border-white/10 p-10 rounded-[2rem] shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col items-center max-w-sm w-full mx-4 relative overflow-hidden">
              <div className={`absolute -top-32 -left-32 w-64 h-64 rounded-full blur-[100px] opacity-20 ${isWin ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
              
              <div className="text-7xl mb-6 drop-shadow-lg relative z-10">🏆</div>
              <h2 className={`text-4xl font-black uppercase tracking-widest text-center mb-2 drop-shadow-sm relative z-10 ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                {isWin ? 'YOU WIN!' : 'YOU LOSE!'}
              </h2>
              <p className="text-slate-300 text-xl text-center mb-8 font-bold relative z-10">
                Final Score: <span className="text-white">{finalRuns}</span> / <span className="text-white">{finalWickets}</span>
              </p>
              
              {isWin && (
                <div className="bg-gradient-to-r from-emerald-950/80 to-emerald-900/80 border border-emerald-500/50 text-emerald-400 px-6 py-3 rounded-2xl text-sm font-bold flex items-center gap-3 mb-8 shadow-[0_0_20px_rgba(16,185,129,0.2)] relative z-10">
                  <span className="text-xl">🪙</span> Match Won! +50 Coins
                </div>
              )}

              <div className="flex gap-4 w-full relative z-10">
                <button
                  onClick={handleReplay}
                  className="flex-1 py-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-900 font-black tracking-widest uppercase rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-amber-500/50 hover:scale-105 duration-300"
                >
                  Replay
                </button>
                <button
                  onClick={onBack}
                  className="flex-1 py-4 bg-white/10 hover:bg-white/20 text-white font-bold tracking-widest uppercase rounded-2xl transition-all border border-white/10 backdrop-blur-sm hover:scale-105 duration-300"
                >
                  Exit
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row items-center justify-center gap-6 w-full">
            <CricketPhaserGame
              mode={mode}
              role={isMultiplayer ? 'batting' : (playerRole ?? 'batting')}
              overs={isMultiplayer ? 5 : matchOvers}
              onGameOver={isMultiplayer ? undefined : handleGameOver}
            />
            {mode === 'multiplayer' && (
              <div className="hidden lg:block flex-shrink-0 self-start">
                <MultiplayerMatchPanel compact />
              </div>
            )}
          </div>
        )}
        
        {isMultiplayer && showTossUI && remoteState && (
          <CricketTossUI onTossComplete={() => {
            console.log('[CricketGame] Toss complete callback');
            setShowTossUI(false);
            setTossComplete(true);
          }} />
        )}
      </div>
    </GameWrapper>
  );
};
