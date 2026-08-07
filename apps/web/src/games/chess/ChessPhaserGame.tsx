import React, { useEffect, useRef } from "react";
import Phaser from "phaser";
import { ChessScene } from "./phaser/scenes/ChessScene";
import { ChessOverlays } from "./components/ChessOverlays";
import { ChessMatchPanel } from "./components/ChessMatchPanel";

interface ChessPhaserGameProps {
  mode: "ai" | "pvp";
  level: number;
  theme: "classic" | "wood" | "cyber";
  online?: boolean;
  players?: number;
  seat?: number | null;
  names?: string[];
  onBack: () => void;
  onReplay: () => void;
}

export const ChessPhaserGame: React.FC<ChessPhaserGameProps> = ({
  mode,
  level,
  theme,
  online = false,
  players = 2,
  seat = null,
  names = [],
  onBack,
  onReplay,
}) => {
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
    game.registry.set("online", online);
    game.registry.set("players", players);
    game.registry.set("seat", seat);
    game.registry.set("names", names);

    return () => {
      game.destroy(true);
      setGameInstance(null);
    };
  }, [mode, level, theme]);

  return (
    <div className="relative mx-auto w-full max-w-6xl aspect-auto h-[75vh] max-h-[800px] bg-[#090d16] rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex gap-4 p-4">
      <div ref={containerRef} className="flex-1 h-full" />
      {online && <ChessMatchPanel game={gameInstance} />}
      <ChessOverlays
        game={gameInstance}
        online={online}
        onReplay={onReplay}
        onClose={onBack}
      />
    </div>
  );
};

export default ChessPhaserGame;
