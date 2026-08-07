import React, { useState, useEffect } from 'react';
import { useMultiplayerStore } from '../../../store/multiplayerStore';
import type { CricketState } from '@gaming-hub/game-engine';

export const CricketTossUI: React.FC<{ onTossComplete?: () => void }> = ({ onTossComplete }) => {
  const gameState = useMultiplayerStore((s) => s.gameState as unknown as CricketState | null);
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const roomPlayers = useMultiplayerStore((s) => s.room?.players ?? []);
  
  const [tossCalled, setTossCalled] = useState(false);
  const [calling, setCalling] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  
  const isMyTurn = gameState?.currentActor === "toss" && gameState.currentSeat === mySeat;
  const tossResult = gameState?.tossResult;
  const tossWinner = gameState?.tossWinner;
  const battingFirst = gameState?.battingFirst;
  
  useEffect(() => {
    if (tossWinner != null && battingFirst != null && !showResult) {
      const isWinner = tossWinner === mySeat;
      const battingOrBowling = battingFirst === mySeat ? 'bat' : 'bowl';
      
      if (isWinner) {
        setResultMessage(`You won the toss! You chose to ${battingOrBowling} first.`);
      } else {
        const opponentName = roomPlayers.find(p => p.seat === tossWinner)?.displayName || 'Opponent';
        const opponentChoice = battingFirst === tossWinner ? 'bat' : 'bowl';
        setResultMessage(`${opponentName} won the toss and chose to ${opponentChoice} first.`);
      }
      
      setShowResult(true);
      
      setTimeout(() => {
        onTossComplete?.();
      }, 3000);
    }
  }, [tossWinner, battingFirst, mySeat, showResult, roomPlayers, onTossComplete]);
  
  const handleTossCall = async (call: 'heads' | 'tails') => {
    if (calling || !isMyTurn) return;
    
    setCalling(true);
    setTossCalled(true);
    
    try {
      const result = await useMultiplayerStore.getState().sendGameAction({
        type: 'toss-call',
        call,
      });
      
      if (!result.ok) {
        setTossCalled(false);
        setCalling(false);
      }
    } catch (error) {
      console.error('Toss call failed:', error);
      setTossCalled(false);
      setCalling(false);
    }
  };
  
  if (showResult) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-500">
        <div className="bg-[#0f172a]/90 border border-white/10 p-10 rounded-[2rem] shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col items-center max-w-md w-full mx-4">
          <div className="text-6xl mb-6 animate-bounce">🏏</div>
          <h2 className="text-3xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 text-center mb-6">
            {resultMessage}
          </h2>
          <p className="text-slate-400 text-center">
            The match will begin shortly...
          </p>
        </div>
      </div>
    );
  }
  
  if (!isMyTurn && gameState?.currentActor === "toss") {
    const playerName = roomPlayers.find(p => p.seat === gameState.currentSeat)?.displayName || `Player ${(gameState.currentSeat ?? 0) + 1}`;
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-500">
        <div className="bg-[#0f172a]/90 border border-white/10 p-10 rounded-[2rem] shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col items-center max-w-md w-full mx-4">
          <div className="text-6xl mb-6">🏏</div>
          <h2 className="text-3xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 text-center mb-6">
            Toss in Progress
          </h2>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-300 text-lg">{playerName} is calling the toss...</p>
          </div>
        </div>
      </div>
    );
  }
  
  if (!isMyTurn) return null;
  
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-500">
      <div className="bg-[#0f172a]/90 border border-white/10 p-10 rounded-[2rem] shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col items-center max-w-md w-full mx-4">
        <div className="text-6xl mb-6">🏏</div>
        <h2 className="text-3xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 text-center mb-4">
          Call the Toss!
        </h2>
        <p className="text-slate-400 text-center mb-8">
          Choose heads or tails to determine who bats first
        </p>
        
        <div className="flex gap-6 w-full">
          <button
            onClick={() => handleTossCall('heads')}
            disabled={calling || tossCalled}
            className={`flex-1 py-6 px-8 rounded-2xl font-black tracking-widest uppercase text-2xl transition-all duration-300 ${
              calling || tossCalled
                ? 'bg-slate-800/50 border-slate-700/50 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-900 border-2 border-amber-400 hover:scale-105 hover:shadow-[0_0_30px_rgba(245,158,11,0.4)]'
            }`}
          >
            {calling ? '...' : 'Heads'}
          </button>
          
          <button
            onClick={() => handleTossCall('tails')}
            disabled={calling || tossCalled}
            className={`flex-1 py-6 px-8 rounded-2xl font-black tracking-widest uppercase text-2xl transition-all duration-300 ${
              calling || tossCalled
                ? 'bg-slate-800/50 border-slate-700/50 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-900 border-2 border-amber-400 hover:scale-105 hover:shadow-[0_0_30px_rgba(245,158,11,0.4)]'
            }`}
          >
            {calling ? '...' : 'Tails'}
          </button>
        </div>
        
        {calling && (
          <p className="text-amber-400 text-sm mt-4">Calling toss...</p>
        )}
      </div>
    </div>
  );
};
