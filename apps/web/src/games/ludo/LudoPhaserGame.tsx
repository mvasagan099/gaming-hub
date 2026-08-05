import React, { useEffect, useRef } from "react";
import Phaser from "phaser";
import { LudoScene } from "./phaser/scenes/LudoScene";

interface LudoPhaserGameProps {
  mode: "ai" | "pvp";
  players: number;
  online?: boolean;
  seat?: number | null;
  names?: string[];
}

export const LudoPhaserGame: React.FC<LudoPhaserGameProps> = ({ mode, players, online = false, seat = null, names = [] }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 1024,
      height: 800,
      parent: containerRef.current,
      backgroundColor: "#090d16",
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [LudoScene],
      physics: {
        default: "arcade",
      },
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    game.registry.set("mode", mode);
    game.registry.set("players", players);
    game.registry.set("online", online);
    game.registry.set("seat", seat);
    game.registry.set("names", names);

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [mode, players, online, seat, names]);

  return (
    <div className="relative mx-auto w-full max-w-[1024px] aspect-[1024/800] h-auto max-h-[85vh] bg-[#090d16] rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex justify-center items-center">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};

export default LudoPhaserGame;
