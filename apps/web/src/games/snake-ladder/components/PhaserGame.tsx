import React, { useEffect, useRef, useState } from "react";
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

  const [isPortrait, setIsPortrait] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 768 && window.innerHeight > window.innerWidth;
  });

  useEffect(() => {
    const handleResize = () => {
      const portrait = window.innerWidth < 768 && window.innerHeight > window.innerWidth;
      setIsPortrait((prev) => (prev !== portrait ? portrait : prev));
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const gameWidth = isPortrait ? 720 : 1024;
    const gameHeight = isPortrait ? 1080 : 800;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: gameWidth,
      height: gameHeight,
      backgroundColor: "#0b1120",
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
    game.registry.set("isPortrait", isPortrait);

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [mode, players, seat, names, isPortrait]);

  return (
    <div
      className={`relative mx-auto w-full ${
        isPortrait
          ? "max-w-[min(98vw,720px)] aspect-[720/1080] max-h-[calc(100dvh-5.5rem)]"
          : "max-w-[min(94vw,70dvh,920px)] aspect-[1024/800]"
      } h-auto rounded-2xl overflow-hidden border border-slate-700/50 shadow-2xl flex justify-center items-center`}
    >
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center overflow-hidden"
      />
    </div>
  );
}
