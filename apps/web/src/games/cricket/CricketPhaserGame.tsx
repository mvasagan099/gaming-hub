import React, { useEffect, useRef } from "react";
import Phaser from "phaser";
import { CricketScene } from "./phaser/scenes/CricketScene";

interface CricketPhaserGameProps {
  mode: "ai" | "multiplayer";
  role: 'batting' | 'bowling';
  overs: number;
  onGameOver: (runs: number, wickets: number, won: boolean) => void;
}

export function CricketPhaserGame({ mode, role, overs, onGameOver }: CricketPhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 924,
      height: 680,
      parent: containerRef.current,
      backgroundColor: "#090d16",
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      physics: {
        default: "arcade",
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false,
        },
      },
      scene: [CricketScene],
    };

    gameRef.current = new Phaser.Game(config);

    // Pass data to the scene
    gameRef.current.scene.start("CricketScene", { mode, role, overs, onGameOver });

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [mode, role, onGameOver]);

  return (
    <div className="relative mx-auto w-full max-w-[924px] aspect-[924/680] h-auto max-h-[85vh] bg-[#090d16] rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex justify-center items-center">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
