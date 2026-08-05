import React, { useState } from 'react';
import { GameWrapper } from '../../components/GameWrapper';
import { useUserStore } from '../../store/useUserStore';
import { CricketPhaserGame } from './CricketPhaserGame';

interface CricketProps {
  mode: 'ai' | 'multiplayer';
  stake: number;
  onBack: () => void;
}

export const CricketGame: React.FC<CricketProps> = ({ mode, stake, onBack }) => {
  const [playerRole, setPlayerRole] = useState<'batting' | 'bowling' | null>(null);
  const [matchOvers, setMatchOvers] = useState<number>(1);
  const [gameOver, setGameOver] = useState(false);
  const [finalRuns, setFinalRuns] = useState(0);
  const [finalWickets, setFinalWickets] = useState(0);
  const [isWin, setIsWin] = useState(false);
  
  const { addCoins } = useUserStore();

  const handleGameOver = (runs: number, wickets: number, won: boolean) => {
    setFinalRuns(runs);
    setFinalWickets(wickets);
    setIsWin(won);
    setGameOver(true);
    if (won) {
      setTimeout(() => addCoins(50), 1000);
    }
  };

  const handleReplay = () => {
    setGameOver(false);
    setPlayerRole(null); // Reset role on replay
  };

  return (
    <GameWrapper title="Cricket World Premier League" gameId="cricket" mode={mode} stake={stake} onBack={onBack} isFullscreen>
      <div className="flex flex-col lg:flex-row items-center justify-center gap-8 w-full max-w-5xl relative">
        
        {!playerRole ? (
          <div className="flex flex-col items-center justify-center w-full max-w-2xl mx-auto p-8 bg-[#090d16] rounded-3xl border border-slate-800 shadow-2xl">
            <h2 className="text-4xl font-black uppercase tracking-widest text-center mb-8 text-white">
              Match Setup
            </h2>
            
            <div className="mb-8 w-full flex flex-col items-center">
              <h3 className="text-xl font-bold text-slate-300 mb-4">Select Format</h3>
              <div className="flex gap-4">
                {[1, 3, 5].map(overs => (
                  <button
                    key={overs}
                    onClick={() => setMatchOvers(overs)}
                    className={`px-6 py-3 rounded-xl font-bold transition-all border-2 ${
                      matchOvers === overs 
                        ? 'bg-amber-500 border-amber-400 text-slate-900 shadow-[0_0_15px_rgba(245,158,11,0.5)]' 
                        : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'
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
                className="flex flex-col items-center justify-center p-8 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-2xl transition-all shadow-lg hover:-translate-y-1 hover:shadow-amber-500/20 group w-full sm:w-64"
              >
                <div className="text-6xl mb-4 group-hover:scale-110 transition-transform duration-300">🏏</div>
                <span className="text-xl font-bold text-white uppercase tracking-wider">Play as Batsman</span>
                <span className="text-sm text-slate-400 mt-2 text-center">Chase down the target score!</span>
              </button>
              
              <button
                onClick={() => setPlayerRole('bowling')}
                className="flex flex-col items-center justify-center p-8 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-2xl transition-all shadow-lg hover:-translate-y-1 hover:shadow-red-500/20 group w-full sm:w-64"
              >
                <div className="text-6xl mb-4 group-hover:scale-110 transition-transform duration-300">⚾</div>
                <span className="text-xl font-bold text-white uppercase tracking-wider">Play as Bowler</span>
                <span className="text-sm text-slate-400 mt-2 text-center">Defend the target score!</span>
              </button>
            </div>
          </div>
        ) : gameOver ? (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in rounded-3xl">
            <div className="bg-[#0f172a] border border-amber-500/30 p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm w-full mx-4">
              <div className="text-6xl mb-4">🏆</div>
              <h2 className={`text-3xl font-black uppercase tracking-widest text-center mb-2 ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                {isWin ? 'YOU WIN!' : 'YOU LOSE!'}
              </h2>
              <p className="text-slate-300 text-lg text-center mb-6 font-bold">
                Final Score: {finalRuns} / {finalWickets}
              </p>
              
              {isWin && (
                <div className="bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 mb-6">
                  🪙 Match Won! +50 Coins
                </div>
              )}

              <div className="flex gap-3 w-full">
                <button
                  onClick={handleReplay}
                  className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg"
                >
                  Replay
                </button>
                <button
                  onClick={onBack}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all border border-slate-700"
                >
                  Exit
                </button>
              </div>
            </div>
          </div>
        ) : (
          <CricketPhaserGame mode={mode} role={playerRole} overs={matchOvers} onGameOver={handleGameOver} />
        )}
      </div>
    </GameWrapper>
  );
};
