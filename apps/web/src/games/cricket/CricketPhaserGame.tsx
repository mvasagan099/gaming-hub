import React, { useEffect, useRef } from "react";
import Phaser from "phaser";
import { CricketScene } from "./phaser/scenes/CricketScene";

interface CricketPhaserGameProps {
  mode: "ai" | "multiplayer";
  role?: 'batting' | 'bowling';
  overs?: number;
  onGameOver?: (runs: number, wickets: number, won: boolean) => void;
}

export function CricketPhaserGame({ mode, role, overs, onGameOver }: CricketPhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const onGameOverRef = useRef(onGameOver);
  onGameOverRef.current = onGameOver;

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

    // Pass data to the scene. In multiplayer mode the scene reads the
    // authoritative state/events from the multiplayer store itself, so role
    // and overs are only meaningful for the local AI mode.
    gameRef.current.scene.start("CricketScene", {
      mode,
      role: role ?? 'batting',
      overs: overs ?? 5,
      onGameOver: (...args: [number, number, boolean]) => onGameOverRef.current?.(...args),
    });

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, role, overs]);

  return (
    <div className="relative mx-auto w-full max-w-[924px] aspect-[924/680] h-auto max-h-[85vh] bg-[#090d16] rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex justify-center items-center">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
