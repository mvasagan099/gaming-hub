import React, { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { LudoScene } from "./phaser/scenes/LudoScene";

interface LudoPhaserGameProps {
  mode: "ai" | "pvp";
  players: number;
  online?: boolean;
  seat?: number | null;
  names?: string[];
}

export const LudoPhaserGame: React.FC<LudoPhaserGameProps> = ({
  mode,
  players,
  online = false,
  seat = null,
  names = [],
}) => {
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

    const gameWidth = isPortrait ? 720 : 1200;
    const gameHeight = isPortrait ? 1080 : 800;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: gameWidth,
      height: gameHeight,
      parent: containerRef.current,
      backgroundColor: "#070b14",
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
    game.registry.set("isPortrait", isPortrait);

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, [mode, players, online, seat, names, isPortrait]);

  return (
    <div
      className={`relative mx-auto w-full ${
        isPortrait
          ? "max-w-[min(98vw,720px)] aspect-[720/1080] max-h-[calc(100dvh-5.5rem)]"
          : "max-w-[min(98vw,calc((100dvh-5rem)*1.5),1440px)] aspect-[1200/800] max-h-[calc(100dvh-4.5rem)]"
      } h-auto bg-[#070b14] rounded-3xl border border-slate-800/80 shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden flex justify-center items-center backdrop-blur-md`}
    >
      {/* Subtle ambient lighting flares behind the board */}
      <div className="absolute -top-32 -left-32 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};

export default LudoPhaserGame;
