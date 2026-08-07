import React from 'react';
import { useParams, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { SnakeLadder } from '../../games/snake-ladder';
import { LudoGame } from '../../games/ludo/LudoGame';
import { ChessGame } from '../../games/chess/ChessGame';
import { CarromGame } from '../../games/carrom/CarromGame';
import { FruitNinjaGame } from '../../games/fruit-ninja/FruitNinjaGame';
import { BubbleShooterGame } from '../../games/bubble-shooter/BubbleShooterGame';
import { TableTennisGame } from '../../games/table-tennis/TableTennisGame';
import { SnakeVsWormsGame } from '../../games/snake-vs-worms/SnakeVsWormsGame';
import { CricketGame } from '../../games/cricket/CricketGame';
import { useMultiplayerStore } from '../../store/multiplayerStore';

export const GamePage: React.FC = () => {
  const params = useParams<{ gameId?: string; slug?: string }>();
  const gameId = params.slug || params.gameId;
  const location = useLocation();
  const navigate = useNavigate();

  const state = location.state as { mode?: 'ai' | 'multiplayer'; stake?: number } | null;
  const mode = state?.mode || 'ai';
  const stake = state?.stake || 100;

  const room = useMultiplayerStore((s) => s.room);

  const onBack = () => {
    if (mode === 'multiplayer') {
      void useMultiplayerStore.getState().leaveRoom();
      navigate(`/lobby/${gameId}`);
    } else {
      navigate('/');
    }
  };

  if (mode === 'multiplayer') {
    const canPlayOnline =
      !!room && room.gameId === gameId && (room.status === 'playing' || room.status === 'ended');
    if (!canPlayOnline) {
      return <Navigate to={`/lobby/${gameId}`} replace state={{ mode, stake }} />;
    }
  }

  switch (gameId) {
    case 'snake-ladder': return <SnakeLadder mode={mode} stake={stake} onBack={onBack} />;
    case 'ludo': return <LudoGame mode={mode} stake={stake} onBack={onBack} />;
    case 'chess': return <ChessGame mode={mode} stake={stake} onBack={onBack} />;
    case 'carrom': return <CarromGame mode={mode} stake={stake} onBack={onBack} />;
    case 'fruit-ninja': return <FruitNinjaGame mode={mode} stake={stake} onBack={onBack} />;
    case 'bubble-shooter': return <BubbleShooterGame mode={mode} stake={stake} onBack={onBack} />;
    case 'table-tennis': return <TableTennisGame mode={mode} stake={stake} onBack={onBack} />;
    case 'snake-vs-worms': return <SnakeVsWormsGame mode={mode} stake={stake} onBack={onBack} />;
    case 'cricket': return <CricketGame mode={mode} stake={stake} onBack={onBack} />;
    default: return <div className="text-center py-12">Game not found</div>;
  }
};
