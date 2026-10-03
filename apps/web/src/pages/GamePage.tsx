import { useEffect, lazy, Suspense } from "react";
import { useParams, Link } from "react-router-dom";
import { apiClient } from "../services/api/client";
import { isGameId } from "@gaming-hub/shared";
const SnakeLadder = lazy(() => import("../games/snake-ladder").then(m => ({ default: m.SnakeLadder })));
const LudoGame = lazy(() => import("../games/ludo/LudoGame").then(m => ({ default: m.LudoGame })));
const ChessGame = lazy(() => import("../games/chess/ChessGame").then(m => ({ default: m.ChessGame })));
const CarromGame = lazy(() => import("../games/carrom/CarromGame").then(m => ({ default: m.CarromGame })));
const FruitNinjaGame = lazy(() => import("../games/fruit-ninja/FruitNinjaGame").then(m => ({ default: m.FruitNinjaGame })));
const BubbleShooterGame = lazy(() => import("../games/bubble-shooter/BubbleShooterGame").then(m => ({ default: m.BubbleShooterGame })));
const TableTennisGame = lazy(() => import("../games/table-tennis/TableTennisGame").then(m => ({ default: m.TableTennisGame })));
const SnakeVsWormsGame = lazy(() => import("../games/snake-vs-worms/SnakeVsWormsGame").then(m => ({ default: m.SnakeVsWormsGame })));
const SnookerGame = lazy(() => import("../games/snooker/SnookerGame").then(m => ({ default: m.SnookerGame })));

export default function GamePage() {
  const { slug } = useParams();

  useEffect(() => {
    if (slug && isGameId(slug)) {
      apiClient.post(`/games/${slug}/record-play`).catch(() => undefined);
    }
  }, [slug]);

  const handleBack = () => {
    window.location.href = "/";
  };

  const renderGame = () => {
  switch (slug) {
    case "snake-ladder":
      return <SnakeLadder mode="ai" stake={100} onBack={handleBack} />;
    case "ludo":
      return <LudoGame mode="ai" stake={100} onBack={handleBack} />;
    case "chess":
      return <ChessGame mode="ai" stake={100} onBack={handleBack} />;
    case "carrom":
      return <CarromGame mode="ai" stake={100} onBack={handleBack} />;
    case "fruit-ninja":
      return <FruitNinjaGame mode="ai" stake={100} onBack={handleBack} />;
    case "bubble-shooter":
      return <BubbleShooterGame mode="ai" stake={100} onBack={handleBack} />;
    case "table-tennis":
      return <TableTennisGame mode="ai" stake={100} onBack={handleBack} />;
    case "snake-vs-worms":
      return <SnakeVsWormsGame mode="ai" stake={100} onBack={handleBack} />;
    case "snooker":
      return <SnookerGame mode="ai" stake={100} onBack={handleBack} />;
    default:
      return (
        <div className="p-10 text-center">
          <h1 className="text-4xl font-bold">Game not found</h1>
          <p className="mt-4 text-slate-400">This game is unavailable.</p>
          <Link to="/" className="mt-6 inline-block bg-blue-600 px-4 py-2 rounded-lg font-bold">
            Back to Home
          </Link>
        </div>
      );
  }
  };
  return <Suspense fallback={<div role="status" className="p-10 text-center">Loading game…</div>}>{renderGame()}</Suspense>;
}
