import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, useLocation, useNavigate, Navigate } from 'react-router-dom';
const SnakeLadder = lazy(() => import("../../games/snake-ladder").then(m => ({ default: m.SnakeLadder })));
const LudoGame = lazy(() => import("../../games/ludo/LudoGame").then(m => ({ default: m.LudoGame })));
const ChessGame = lazy(() => import("../../games/chess/ChessGame").then(m => ({ default: m.ChessGame })));
const CarromGame = lazy(() => import("../../games/carrom/CarromGame").then(m => ({ default: m.CarromGame })));
const FruitNinjaGame = lazy(() => import("../../games/fruit-ninja/FruitNinjaGame").then(m => ({ default: m.FruitNinjaGame })));
const BubbleShooterGame = lazy(() => import("../../games/bubble-shooter/BubbleShooterGame").then(m => ({ default: m.BubbleShooterGame })));
const TableTennisGame = lazy(() => import("../../games/table-tennis/TableTennisGame").then(m => ({ default: m.TableTennisGame })));
const SnakeVsWormsGame = lazy(() => import("../../games/snake-vs-worms/SnakeVsWormsGame").then(m => ({ default: m.SnakeVsWormsGame })));
const SnookerGame = lazy(() => import("../../games/snooker/SnookerGame").then(m => ({ default: m.SnookerGame })));
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

  // Trap browser/hardware back button or mobile swipe gesture during active match
  useEffect(() => {
    if (mode !== 'multiplayer' || room?.status !== 'playing' || isExiting) return;

    window.history.pushState({ matchGuarded: true }, '');

    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      window.history.pushState({ matchGuarded: true }, '');
      setShowExitConfirm(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [mode, room?.status, isExiting]);

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
    <Suspense fallback={<div role="status" className="p-10 text-center">Loading game…</div>}>{game}</Suspense>
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
