import React, { useEffect, useRef } from "react";
import Phaser from "phaser";
import { ChessScene } from "./phaser/scenes/ChessScene";
import { ChessOverlays } from "./components/ChessOverlays";

interface ChessPhaserGameProps {
  mode: "ai" | "pvp";
  level: number;
  theme: "classic" | "wood" | "cyber";
  onBack: () => void;
  onReplay: () => void;
}

export const ChessPhaserGame: React.FC<ChessPhaserGameProps> = ({ mode, level, theme, onBack, onReplay }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [gameInstance, setGameInstance] = React.useState<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 924,   // 20 padding + 640 board + 20 gap + 224 sidebar + 20 padding
      height: 680,  // 20 padding + 640 board + 20 padding
      parent: containerRef.current,
      backgroundColor: "#090d16",
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [ChessScene],
      physics: {
        default: "arcade",
      },
    };

    const game = new Phaser.Game(config);
    setGameInstance(game);

    // Send vars to registry
    game.registry.set("mode", mode);
    game.registry.set("aiLevel", level);
    game.registry.set("theme", theme);

    return () => {
      game.destroy(true);
      setGameInstance(null);
    };
  }, [mode, level, theme]);

  return (
    <div className="relative mx-auto w-full max-w-[924px] aspect-[924/680] h-auto max-h-[75vh] bg-[#090d16] rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex justify-center items-center">
      <div ref={containerRef} className="w-full h-full" />
      <ChessOverlays 
        game={gameInstance} 
        onReplay={onReplay} 
        onClose={onBack} 
      />
    </div>
  );
};

export default ChessPhaserGame;
