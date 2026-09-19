import React, { useState, useEffect, useRef } from 'react';
import { useMultiplayerStore } from '../../../store/multiplayerStore';
import type { CricketState } from '@gaming-hub/game-engine';

/* ── Animated coin ─────────────────────────────────────────────────────────── */
const CoinFlip: React.FC<{ spinning: boolean; result?: string }> = ({ spinning, result }) => {
  return (
    <div className="relative flex items-center justify-center" style={{ perspective: '600px', width: '120px', height: '120px' }}>
      <div
        style={{
          width: '120px',
          height: '120px',
          borderRadius: '50%',
          transformStyle: 'preserve-3d',
          animation: spinning ? 'coinSpin 0.4s linear infinite' : 'none',
          boxShadow: '0 0 40px rgba(245,158,11,0.6), 0 0 80px rgba(245,158,11,0.2)',
          background: 'radial-gradient(circle at 35% 35%, #fde68a, #f59e0b 50%, #b45309)',
          border: '4px solid #fbbf24',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '48px',
          userSelect: 'none',
        }}
      >
        {result === 'heads' ? '👑' : result === 'tails' ? '🌟' : '🏏'}
      </div>
      <style>{`
        @keyframes coinSpin {
          0% { transform: rotateY(0deg); }
          100% { transform: rotateY(360deg); }
        }
      `}</style>
    </div>
  );
};

/* ── Toss result banner ────────────────────────────────────────────────────── */
const ResultBanner: React.FC<{ message: string; won: boolean }> = ({ message, won }) => (
  <div className="flex flex-col items-center gap-3 animate-in fade-in zoom-in duration-500">
    <div className="text-6xl animate-bounce">{won ? '🎉' : '🏏'}</div>
    <div className={`text-4xl font-black uppercase tracking-widest text-transparent bg-clip-text ${won ? 'bg-gradient-to-r from-emerald-300 to-emerald-500' : 'bg-gradient-to-r from-slate-300 to-slate-500'}`}>
      {won ? 'YOU WON!' : 'TOSS LOST'}
    </div>
    <p className="text-base text-slate-300 text-center font-medium max-w-xs leading-relaxed">{message}</p>
    <div className="flex items-center gap-2 mt-2">
      <div className="w-2 h-2 bg-amber-400 rounded-full animate-ping" />
      <span className="text-xs text-slate-400 uppercase tracking-widest font-bold">Match starts in a moment…</span>
    </div>
  </div>
);

/* ── Main component ────────────────────────────────────────────────────────── */
export const CricketTossUI: React.FC<{ onTossComplete?: () => void }> = ({ onTossComplete }) => {
  const gameState = useMultiplayerStore((s) => s.gameState as unknown as CricketState | null);
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const room = useMultiplayerStore((s) => s.room);
  const roomPlayers = room?.players ?? [];

  const [tossCalled, setTossCalled] = useState(false);
  const [calling, setCalling] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const [iWon, setIWon] = useState(false);
  const [coinSpinning, setCoinSpinning] = useState(false);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  const resultShownRef = useRef(false);
  const timersRef = useRef<NodeJS.Timeout[]>([]);

  const safeTimeout = (fn: () => void, delay: number) => {
    const id = setTimeout(fn, delay);
    timersRef.current.push(id);
    return id;
  };

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  const currentActor = gameState?.currentActor;
  const currentSeat = gameState?.currentSeat;
  const tossWinner = gameState?.tossWinner;
  const battingFirst = gameState?.battingFirst;

  const isTossCallTurn = currentActor === 'toss' && currentSeat === mySeat;
  const isTossChoiceTurn = currentActor === 'toss-choice' && currentSeat === mySeat;

  useEffect(() => {
    if (
      tossWinner != null &&
      battingFirst != null &&
      currentActor !== 'toss' &&
      currentActor !== 'toss-choice' &&
      !resultShownRef.current
    ) {
      resultShownRef.current = true;
      const won = tossWinner === mySeat;
      const battingOrBowling = battingFirst === mySeat ? 'bat' : 'bowl';
      setIWon(won);

      if (won) {
        setResultMessage(`You won the toss and chose to ${battingOrBowling} first!`);
      } else {
        const opponentName = roomPlayers.find((p) => p.seat === tossWinner)?.displayName || 'Opponent';
        const opponentChoice = battingFirst === tossWinner ? 'bat' : 'bowl';
        setResultMessage(`${opponentName} won the toss and chose to ${opponentChoice} first.`);
      }

      setCoinSpinning(false);
      safeTimeout(() => {
        setShowResult(true);
        safeTimeout(() => {
          onTossComplete?.();
        }, 2500);
      }, 300);
    }
  }, [tossWinner, battingFirst, currentActor, mySeat, roomPlayers, onTossComplete]);

  const handleTossCall = async (call: 'heads' | 'tails') => {
    if (calling || !isTossCallTurn) return;
    setCalling(true);
    setTossCalled(true);
    setCoinSpinning(true);

    try {
      const result = await useMultiplayerStore.getState().sendGameAction({ type: 'toss-call', call });
      if (!result.ok) {
        setTossCalled(false);
        setCalling(false);
        setCoinSpinning(false);
      }
    } catch {
      setTossCalled(false);
      setCalling(false);
      setCoinSpinning(false);
    }
  };

  const handleTossChoice = async (choice: 'bat' | 'bowl') => {
    if (choosing || !isTossChoiceTurn) return;
    setChoosing(true);
    try {
      const result = await useMultiplayerStore.getState().sendGameAction({
        type: 'toss-choice',
        choice,
      });
      if (!result.ok) {
        setChoosing(false);
      }
    } catch {
      setChoosing(false);
    }
  };

  // If already past toss phase and result banner has completed, render nothing
  if (
    currentActor !== 'toss' &&
    currentActor !== 'toss-choice' &&
    !showResult
  ) {
    return null;
  }

  /* ── 1. Show toss result banner ── */
  if (showResult) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xl animate-in fade-in duration-300">
        <div className="relative bg-gradient-to-b from-slate-900/95 to-slate-950/98 border border-white/10 p-10 rounded-[2.5rem] shadow-[0_0_80px_rgba(0,0,0,0.8)] flex flex-col items-center max-w-sm w-full mx-4 gap-8 overflow-hidden">
          <div className={`absolute -top-24 -left-24 w-48 h-48 rounded-full ${iWon ? 'bg-emerald-500/15' : 'bg-slate-500/10'} blur-[80px]`} />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-amber-500/10 blur-[80px]" />
          <div className="relative z-10">
            <ResultBanner message={resultMessage} won={iWon} />
          </div>
        </div>
      </div>
    );
  }

  /* ── 2. Toss Choice phase: I won the toss ── */
  if (isTossChoiceTurn) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xl animate-in fade-in duration-300">
        <div className="relative bg-gradient-to-b from-slate-900/95 to-slate-950/98 border border-white/10 p-10 rounded-[2.5rem] shadow-[0_0_80px_rgba(0,0,0,0.8)] flex flex-col items-center max-w-sm w-full mx-4 gap-8 overflow-hidden">
          <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-emerald-500/20 blur-[80px]" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-amber-500/15 blur-[80px]" />

          <div className="relative z-10 flex flex-col items-center gap-6 w-full">
            <div className="text-5xl animate-bounce">👑</div>
            <div className="text-center">
              <h2 className="text-3xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-amber-300 mb-2">
                YOU WON THE TOSS!
              </h2>
              <p className="text-slate-300 text-sm font-medium">
                Select whether you want to bat or bowl first:
              </p>
            </div>

            <div className="flex gap-4 w-full">
              <button
                onClick={() => handleTossChoice('bat')}
                onMouseEnter={() => setHoveredBtn('bat')}
                onMouseLeave={() => setHoveredBtn(null)}
                disabled={choosing}
                className={`
                  flex-1 flex flex-col items-center gap-3 py-5 px-4 rounded-2xl
                  font-black tracking-widest uppercase text-base transition-all duration-200
                  border-2 ${hoveredBtn === 'bat'
                    ? 'bg-emerald-500 border-emerald-300 text-slate-950 scale-105 shadow-[0_0_30px_rgba(16,185,129,0.5)]'
                    : 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 hover:scale-105'
                  }
                `}
              >
                <span className="text-3xl">🏏</span>
                <span>BAT FIRST</span>
              </button>

              <button
                onClick={() => handleTossChoice('bowl')}
                onMouseEnter={() => setHoveredBtn('bowl')}
                onMouseLeave={() => setHoveredBtn(null)}
                disabled={choosing}
                className={`
                  flex-1 flex flex-col items-center gap-3 py-5 px-4 rounded-2xl
                  font-black tracking-widest uppercase text-base transition-all duration-200
                  border-2 ${hoveredBtn === 'bowl'
                    ? 'bg-sky-500 border-sky-300 text-white scale-105 shadow-[0_0_30px_rgba(14,165,233,0.5)]'
                    : 'bg-sky-500/15 border-sky-500/50 text-sky-300 hover:scale-105'
                  }
                `}
              >
                <span className="text-3xl">🎯</span>
                <span>BOWL FIRST</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── 3. Toss Choice phase: Opponent won the toss ── */
  if (currentActor === 'toss-choice' && !isTossChoiceTurn) {
    const winnerName =
      roomPlayers.find((p) => p.seat === tossWinner)?.displayName ||
      `Player ${(tossWinner ?? 0) + 1}`;

    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xl animate-in fade-in duration-300">
        <div className="relative bg-gradient-to-b from-slate-900/95 to-slate-950/98 border border-white/10 p-10 rounded-[2.5rem] shadow-[0_0_80px_rgba(0,0,0,0.8)] flex flex-col items-center max-w-sm w-full mx-4 gap-8 overflow-hidden">
          <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-amber-500/15 blur-[80px]" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-slate-700/20 blur-[80px]" />

          <div className="relative z-10 flex flex-col items-center gap-6">
            <div className="text-5xl">🪙</div>
            <div className="text-center">
              <h2 className="text-2xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 mb-2">
                Toss Decided
              </h2>
              <div className="flex items-center justify-center gap-3 text-slate-300">
                <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-semibold">{winnerName} is choosing to bat or bowl…</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── 4. Toss Calling phase: Opponent calling ── */
  if (currentActor === 'toss' && !isTossCallTurn) {
    const callerName =
      roomPlayers.find((p) => p.seat === currentSeat)?.displayName ||
      `Player ${(currentSeat ?? 0) + 1}`;

    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xl animate-in fade-in duration-300">
        <div className="relative bg-gradient-to-b from-slate-900/95 to-slate-950/98 border border-white/10 p-10 rounded-[2.5rem] shadow-[0_0_80px_rgba(0,0,0,0.8)] flex flex-col items-center max-w-sm w-full mx-4 gap-8 overflow-hidden">
          <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-amber-500/15 blur-[80px]" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-amber-600/10 blur-[80px]" />

          <div className="relative z-10 flex flex-col items-center gap-6">
            <CoinFlip spinning={true} />
            <div className="text-center">
              <h2 className="text-2xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 mb-2">
                Toss in Progress
              </h2>
              <div className="flex items-center justify-center gap-3 text-slate-300">
                <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-semibold">{callerName} is calling the toss…</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── 5. Toss Calling phase: My turn to call toss ── */
  if (isTossCallTurn) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xl animate-in fade-in duration-300">
        <div className="relative bg-gradient-to-b from-slate-900/95 to-slate-950/98 border border-white/10 p-10 rounded-[2.5rem] shadow-[0_0_80px_rgba(0,0,0,0.8)] flex flex-col items-center max-w-sm w-full mx-4 gap-8 overflow-hidden">
          <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-amber-500/15 blur-[80px]" />
          <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-amber-600/10 blur-[80px]" />

          <div className="relative z-10 flex flex-col items-center gap-6 w-full">
            <CoinFlip spinning={coinSpinning} />

            <div className="text-center">
              <h2 className="text-3xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 mb-1">
                Call the Toss!
              </h2>
              <p className="text-slate-400 text-sm">
                {tossCalled ? 'Waiting for the coin to land…' : 'Choose heads or tails'}
              </p>
            </div>

            {!tossCalled ? (
              <div className="flex gap-4 w-full">
                {(['heads', 'tails'] as const).map((side) => (
                  <button
                    key={side}
                    onClick={() => handleTossCall(side)}
                    onMouseEnter={() => setHoveredBtn(side)}
                    onMouseLeave={() => setHoveredBtn(null)}
                    disabled={calling}
                    className={`
                      flex-1 flex flex-col items-center gap-3 py-5 px-4 rounded-2xl
                      font-black tracking-widest uppercase text-base transition-all duration-200
                      border-2 ${hoveredBtn === side
                        ? side === 'heads'
                          ? 'bg-amber-500 border-amber-300 text-slate-900 scale-105 shadow-[0_0_30px_rgba(245,158,11,0.5)]'
                          : 'bg-sky-500 border-sky-300 text-white scale-105 shadow-[0_0_30px_rgba(14,165,233,0.5)]'
                        : side === 'heads'
                          ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 hover:scale-105'
                          : 'bg-sky-500/10 border-sky-500/50 text-sky-300 hover:scale-105'
                      }
                    `}
                  >
                    <span className="text-3xl">{side === 'heads' ? '👑' : '🌟'}</span>
                    <span>{side}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 px-6 py-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
                <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <span className="text-amber-300 font-bold text-sm">Tossing the coin…</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
};
