import React, { useEffect, useRef } from "react";
import Phaser from "phaser";
import BootScene from "../phaser/scenes/BootScene";
import PreloadScene from "../phaser/scenes/PreloadScene";
import SnakeLadderScene from "../phaser/scenes/SnakeLadderScene";

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: 1024,
      height: 800,
      backgroundColor: "#0f172a",
      scene: [BootScene, PreloadScene, SnakeLadderScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    game.registry.set("mode", mode);
    game.registry.set("players", players);
    game.registry.set("seat", seat);
    game.registry.set("names", names);

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [mode, players, seat, names]);

  return (
    <div className="relative mx-auto w-full max-w-5xl aspect-[1024/800] h-auto max-h-[calc(100vh-140px)] rounded-2xl overflow-hidden border border-slate-700/50 shadow-2xl flex justify-center items-center">
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center overflow-hidden"
      />
    </div>
  );
}

