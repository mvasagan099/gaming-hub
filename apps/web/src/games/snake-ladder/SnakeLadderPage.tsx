import { GameWrapper } from "../../components/GameWrapper";
import PhaserGame from "./components/PhaserGame";
import { useMultiplayerStore } from "../../store/multiplayerStore";
import { MultiplayerMatchPanel } from "../shared/components/MultiplayerMatchPanel";

interface SnakeLadderPageProps {
  mode?: "ai" | "multiplayer";
  stake?: number;
  onBack?: () => void;
}

export function SnakeLadderPage({ mode = 'ai', stake = 10, onBack = () => {} }: SnakeLadderPageProps) {
  const room = useMultiplayerStore((s) => s.room);
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const isSpectator = useMultiplayerStore((s) => s.isSpectator);

  const isMultiplayer = mode === "multiplayer";
  const participants = room?.players ?? [];
  const players = isMultiplayer && participants.length > 0 ? participants.length : 2;
  const names = isMultiplayer
    ? [...participants]
        .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0))
        .map((p) => p.displayName)
    : [];
  const seat = isMultiplayer ? (isSpectator ? null : mySeat) : null;

  return (
    <GameWrapper title="Snake & Ladder" gameId="snake-ladder" mode={mode} stake={stake} onBack={onBack} isFullscreen>
      <div className="flex flex-col lg:flex-row items-center justify-center gap-6 w-full h-full">
        <div className="flex items-center justify-center overflow-hidden">
          <PhaserGame mode={isMultiplayer ? "pvp" : "ai"} players={players} seat={seat} names={names} />
        </div>
        {isMultiplayer && (
          <div className="hidden lg:block flex-shrink-0">
            <MultiplayerMatchPanel compact />
          </div>
        )}
      </div>
    </GameWrapper>
  );
}

export default SnakeLadderPage;
