import { useEffect } from "react";
import { createGame, destroyGame } from "../phaser/Game";

export interface PhaserGameProps {
  mode?: "ai" | "pvp";
  players?: number;
  seat?: number | null;
  names?: string[];
}

export default function PhaserGame({
  mode = "ai",
  players = 2,
  seat = null,
  names = [],
}: PhaserGameProps) {
  useEffect(() => {
    createGame({ mode, players, seat, names });

    return () => destroyGame();
  }, []);

  return (
    <div
      id="game-container"
      className="flex items-center justify-center max-w-full max-h-full overflow-hidden"
    />
  );
}
