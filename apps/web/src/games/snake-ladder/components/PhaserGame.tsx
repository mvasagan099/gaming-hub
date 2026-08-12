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
    <div className="relative mx-auto w-full max-w-5xl aspect-[1024/800] h-auto max-h-[calc(100vh-140px)] rounded-2xl overflow-hidden border border-slate-700/50 shadow-2xl flex justify-center items-center">
      <div
        id="game-container"
        className="w-full h-full flex items-center justify-center overflow-hidden"
      />
    </div>
  );
}
