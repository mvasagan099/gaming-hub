import { useParams, Link } from "react-router-dom";
import { SnakeLadder } from "../games/snake-ladder";
import { LudoGame } from "../games/ludo/LudoGame";
import { ChessGame } from "../games/chess/ChessGame";
import { CarromGame } from "../games/carrom/CarromGame";
import { FruitNinjaGame } from "../games/fruit-ninja/FruitNinjaGame";
import { BubbleShooterGame } from "../games/bubble-shooter/BubbleShooterGame";
import { TableTennisGame } from "../games/table-tennis/TableTennisGame";
import { SnakeVsWormsGame } from "../games/snake-vs-worms/SnakeVsWormsGame";
import { CricketGame } from "../games/cricket/CricketGame";
import { SnookerGame } from "../games/snooker/SnookerGame";

export default function GamePage() {
  const { slug } = useParams();

  const handleBack = () => {
    window.location.href = "/";
  };

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
    case "cricket":
      return <CricketGame mode="ai" stake={100} onBack={handleBack} />;
    case "snooker":
      return <SnookerGame mode="ai" stake={100} onBack={handleBack} />;
    default:
      return (
        <div className="p-10 text-center">
          <h1 className="text-4xl font-bold capitalize">{slug}</h1>
          <p className="mt-4 text-slate-400">Game coming soon...</p>
          <Link to="/" className="mt-6 inline-block bg-blue-600 px-4 py-2 rounded-lg font-bold">
            Back to Home
          </Link>
        </div>
      );
  }
}
