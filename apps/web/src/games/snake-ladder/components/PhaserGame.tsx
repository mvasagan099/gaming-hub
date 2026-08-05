import { useEffect } from "react";
import { createGame, destroyGame } from "../phaser/Game";

export default function PhaserGame() {
  useEffect(() => {
    createGame();

    return () => destroyGame();
  }, []);

  return (
    <div
      id="game-container"
      className="flex items-center justify-center max-w-full max-h-full overflow-hidden"
    />
  );
}
