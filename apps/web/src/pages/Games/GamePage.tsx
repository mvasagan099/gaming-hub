import React, { useState } from 'react';
import { useParams, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { SnakeLadder } from '../../games/snake-ladder';
import { LudoGame } from '../../games/ludo/LudoGame';
import { ChessGame } from '../../games/chess/ChessGame';
import { CarromGame } from '../../games/carrom/CarromGame';
import { FruitNinjaGame } from '../../games/fruit-ninja/FruitNinjaGame';
import { BubbleShooterGame } from '../../games/bubble-shooter/BubbleShooterGame';
import { TableTennisGame } from '../../games/table-tennis/TableTennisGame';
import { SnakeVsWormsGame } from '../../games/snake-vs-worms/SnakeVsWormsGame';
import { SnookerGame } from '../../games/snooker/SnookerGame';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import { isGameId } from '@gaming-hub/shared';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { goBackOrHome } from '../../utils/navigation';

export const GamePage: React.FC = () => {
  const params = useParams<{ gameId?: string; slug?: string }>();
  const gameId = params.slug || params.gameId;
  const location = useLocation();
  const navigate = useNavigate();

  const state = location.state as { mode?: 'ai' | 'multiplayer'; stake?: number } | null;
  const mode = state?.mode || 'ai';
  const stake = state?.stake !== undefined ? state.stake : (mode === 'multiplayer' ? 100 : 0);

  const room = useMultiplayerStore((s) => s.room);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  if (!gameId || !isGameId(gameId)) {
    return <Navigate to="/" replace />;
  }

  const onBack = () => setShowExitConfirm(true);

  const confirmExit = async () => {
    if (isExiting) return;
    setIsExiting(true);
    if (mode === 'multiplayer') {
      await useMultiplayerStore.getState().leaveRoom();
      navigate(`/lobby/${gameId}`);
    } else {
      goBackOrHome(navigate);
    }
  };

  if (mode === 'multiplayer' && !isExiting) {
    const canPlayOnline =
      !!room && room.gameId === gameId && (room.status === 'playing' || room.status === 'ended');
    if (!canPlayOnline) {
      return <Navigate to={`/lobby/${gameId}`} replace state={{ mode, stake }} />;
    }
  }

  let game: React.ReactNode = null;
  switch (gameId) {
    case 'snake-ladder': game = <SnakeLadder mode={mode} stake={stake} onBack={onBack} />; break;
    case 'ludo': game = <LudoGame mode={mode} stake={stake} onBack={onBack} />; break;
    case 'chess': game = <ChessGame mode={mode} stake={stake} onBack={onBack} />; break;
    case 'carrom': game = <CarromGame mode={mode} stake={stake} onBack={onBack} />; break;
    case 'fruit-ninja': game = <FruitNinjaGame mode={mode} stake={stake} onBack={onBack} />; break;
    case 'bubble-shooter': game = <BubbleShooterGame mode={mode} stake={stake} onBack={onBack} />; break;
    case 'table-tennis': game = <TableTennisGame mode={mode} stake={stake} onBack={onBack} />; break;
    case 'snake-vs-worms': game = <SnakeVsWormsGame mode={mode} stake={stake} onBack={onBack} />; break;
    case 'snooker': game = <SnookerGame mode={mode} stake={stake} onBack={onBack} />; break;
  }

  return <>
    {game}
    <ConfirmDialog
      isOpen={showExitConfirm}
      onClose={() => setShowExitConfirm(false)}
      title="Exit Game?"
      message="Are you sure you want to exit the game?"
      cancelText="Cancel"
      confirmText="Exit Game"
      variant="danger"
      icon="warning"
      isLoading={isExiting}
      onConfirm={confirmExit}
    />
  </>;
};
