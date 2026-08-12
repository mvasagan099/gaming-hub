import React, { useEffect, useRef } from "react";
import Phaser from "phaser";
import { FruitNinjaScene } from "./phaser/scenes/FruitNinjaScene";

interface FruitNinjaPhaserProps {
  mode: "classic" | "zen";
  isMultiplayer?: boolean;
}

export const FruitNinjaPhaserGame: React.FC<FruitNinjaPhaserProps> = ({ mode, isMultiplayer = false }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 800,
      height: 500,
      parent: containerRef.current,
      backgroundColor: "#070402",
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [FruitNinjaScene],
      physics: {
        default: "arcade",
        arcade: {
          gravity: { x: 0, y: 350 }, // downward gravity
          debug: false,
        },
      },
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;
    game.registry.set("mode", mode);
    game.registry.set("isMultiplayer", isMultiplayer);

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [mode]);

  return (
    <div className="relative mx-auto w-full max-w-5xl aspect-[8/5] h-auto max-h-[85vh] bg-[#070402] rounded-2xl overflow-hidden border border-slate-700/50 shadow-inner flex justify-center items-center">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};

export default FruitNinjaPhaserGame;
