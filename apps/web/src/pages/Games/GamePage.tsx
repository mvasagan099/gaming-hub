import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useParams, useLocation, useNavigate, Navigate, useBlocker } from 'react-router-dom';
const SnakeLadder = lazy(() => import("../../games/snake-ladder").then(m => ({ default: m.SnakeLadder })));
const LudoGame = lazy(() => import("../../games/ludo/LudoGame").then(m => ({ default: m.LudoGame })));
const ChessGame = lazy(() => import("../../games/chess/ChessGame").then(m => ({ default: m.ChessGame })));
const CarromGame = lazy(() => import("../../games/carrom/CarromGame").then(m => ({ default: m.CarromGame })));
const FruitNinjaGame = lazy(() => import("../../games/fruit-ninja/FruitNinjaGame").then(m => ({ default: m.FruitNinjaGame })));
const BubbleShooterGame = lazy(() => import("../../games/bubble-shooter/BubbleShooterGame").then(m => ({ default: m.BubbleShooterGame })));
const TableTennisGame = lazy(() => import("../../games/table-tennis/TableTennisGame").then(m => ({ default: m.TableTennisGame })));
const SnakeVsWormsGame = lazy(() => import("../../games/snake-vs-worms/SnakeVsWormsGame").then(m => ({ default: m.SnakeVsWormsGame })));
const SnookerGame = lazy(() => import("../../games/snooker/SnookerGame").then(m => ({ default: m.SnookerGame })));
const ReplayModal = lazy(() => import("../../components/Replay/ReplayModal").then(m => ({ default: m.ReplayModal })));
import { useMultiplayerStore } from '../../store/multiplayerStore';
import { isGameId } from '@gaming-hub/shared';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { goBackOrHome } from '../../utils/navigation';
import { registerBackButtonHandler } from '../../services/native/capacitorAppService';

export const GamePage: React.FC = () => {
  const params = useParams<{ gameId?: string; slug?: string }>();
  const gameId = params.slug || params.gameId;
  const location = useLocation();
  const navigate = useNavigate();

  const state = location.state as { mode?: 'ai' | 'multiplayer'; stake?: number } | null;
  const replayMatchId = new URLSearchParams(location.search).get('replayMatchId');
  const tournamentMatchId = new URLSearchParams(location.search).get('matchId');
  const mode = replayMatchId ? 'ai' : state?.mode || 'ai';
  const stake = state?.stake !== undefined ? state.stake : (mode === 'multiplayer' ? 100 : 0);

  const room = useMultiplayerStore((s) => s.room);
  const matchId = useMultiplayerStore((s) => s.matchId);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const exitInProgress = useRef(false);
  const activeRoute = useRef<{ gameId: string | undefined; mode: string } | null>(null);

  // Visible Exit confirms first; normal Back navigation leaves through cleanup.
  // Drivers clean up their listeners on unmount; this route owns room membership.
  useEffect(() => {
    activeRoute.current = { gameId, mode };
    exitInProgress.current = false;
    setIsExiting(false);
    setShowExitConfirm(false);
    const currentRoom = useMultiplayerStore.getState().room;
    const roomId = mode === 'multiplayer' && currentRoom && currentRoom.gameId === gameId ? currentRoom.id : null;
    return () => {
      activeRoute.current = null;
      // React StrictMode replays effects without leaving the page. Let that
      // immediate remount cancel the leave, but still leave on real navigation.
      queueMicrotask(() => {
        const replacement = activeRoute.current;
        if (replacement?.gameId === gameId && replacement?.mode === mode) return;
        const store = useMultiplayerStore.getState();
        if (roomId && store.room?.id === roomId) void store.leaveRoom();
      });
    };
  }, [gameId, mode]);

  const isMultiplayerPlaying =
    mode === 'multiplayer' &&
    !isExiting &&
    !exitInProgress.current &&
    !replayMatchId &&
    !tournamentMatchId &&
    !!room &&
    room.gameId === gameId &&
    (room.status === 'playing' || room.status === 'starting');

  const blocker = useBlocker(Boolean(isMultiplayerPlaying));

  // Native mobile back button handler
  useEffect(() => {
    if (!isMultiplayerPlaying) return;
    return registerBackButtonHandler(() => {
      setShowExitConfirm(true);
      return true;
    });
  }, [isMultiplayerPlaying]);

  // Tab close or page refresh warning during active match
  useEffect(() => {
    if (!isMultiplayerPlaying) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isMultiplayerPlaying]);

  if (!gameId || !isGameId(gameId)) {
    return <Navigate to="/" replace />;
  }

  if (tournamentMatchId && !replayMatchId) {
    return <Navigate to={`/lobby/${gameId}${location.search}`} replace />;
  }

  if (replayMatchId) {
    return <Suspense fallback={<div role="status" className="p-10 text-center">Loading replay…</div>}>
      <ReplayModal key={replayMatchId} matchId={replayMatchId} onClose={() => goBackOrHome(navigate)} />
    </Suspense>;
  }

  const onBack = () => setShowExitConfirm(true);

  const confirmExit = async () => {
    if (exitInProgress.current) return;
    exitInProgress.current = true;
    setShowExitConfirm(false);
    setIsExiting(true);
    const owner = activeRoute.current;
    if (mode === 'multiplayer') {
      await useMultiplayerStore.getState().leaveRoom();
      // Back may have already navigated while the leave ACK was in flight.
      if (activeRoute.current !== owner) return;
    }
    if (blocker.state === 'blocked') {
      blocker.proceed();
    } else {
      goBackOrHome(navigate, mode === 'multiplayer' ? `/lobby/${gameId}` : '/');
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
    {/* A new authoritative match owns a fresh game instance, including its
        animations, result modal and driver. Room membership remains intact. */}
    <Suspense key={mode === 'multiplayer' ? matchId : gameId} fallback={<div role="status" className="p-10 text-center">Loading game…</div>}>{game}</Suspense>
    <ConfirmDialog
      layer="game"
      isOpen={showExitConfirm || blocker.state === 'blocked'}
      onClose={() => {
        setShowExitConfirm(false);
        if (blocker.state === 'blocked') {
          blocker.reset();
        }
      }}
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
