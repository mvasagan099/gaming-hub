import { GameWrapper } from "../../components/GameWrapper";
import PhaserGame from "./components/PhaserGame";
import { useMultiplayerStore } from "../../store/multiplayerStore";

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
      <div className="w-full h-full flex items-center justify-center overflow-hidden">
        <PhaserGame mode={isMultiplayer ? "pvp" : "ai"} players={players} seat={seat} names={names} />
      </div>
    </GameWrapper>
  );
}

export default SnakeLadderPage;
