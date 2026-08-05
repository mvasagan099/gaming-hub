import { GameWrapper } from "../../components/GameWrapper";
import PhaserGame from "./components/PhaserGame";

interface SnakeLadderPageProps {
  mode?: "ai" | "multiplayer";
  stake?: number;
  onBack?: () => void;
}

export function SnakeLadderPage({ mode = 'ai', stake = 10, onBack = () => {} }: SnakeLadderPageProps) {
  return (
    <GameWrapper title="Snake & Ladder" gameId="snake-ladder" mode={mode} stake={stake} onBack={onBack} isFullscreen>
      <div className="w-full h-full flex items-center justify-center overflow-hidden">
        <PhaserGame />
      </div>
    </GameWrapper>
  );
}

export default SnakeLadderPage;
