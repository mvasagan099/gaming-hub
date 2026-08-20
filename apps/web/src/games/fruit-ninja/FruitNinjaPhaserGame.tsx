import React, { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { FruitNinjaScene } from "./phaser/scenes/FruitNinjaScene";
import { FRUIT_NINJA_VISUAL_CONFIG } from "./phaser/constants/fruitNinjaVisualConfig";
import { FruitNinjaOverlays } from "./components/FruitNinjaOverlays";

interface FruitNinjaPhaserProps {
  mode: "classic" | "zen";
  isMultiplayer?: boolean;
  onBack: () => void;
  onReplay: () => void;
}

export const FruitNinjaPhaserGame: React.FC<FruitNinjaPhaserProps> = ({
  mode,
  isMultiplayer = false,
  onBack,
  onReplay,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [gameInstance, setGameInstance] = useState<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: FRUIT_NINJA_VISUAL_CONFIG.stageWidth,
      height: FRUIT_NINJA_VISUAL_CONFIG.stageHeight,
      parent: containerRef.current,
      backgroundColor: "#070b14",
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [FruitNinjaScene],
      physics: {
        default: "arcade",
        arcade: {
          gravity: { x: 0, y: FRUIT_NINJA_VISUAL_CONFIG.gravity },
          debug: false,
        },
      },
    };

    const game = new Phaser.Game(config);
    setGameInstance(game);
    game.registry.set("mode", mode);
    game.registry.set("isMultiplayer", isMultiplayer);

    return () => {
      game.destroy(true);
      setGameInstance(null);
    };
  }, [mode, isMultiplayer]);

  return (
    <div className="relative mx-auto w-full max-w-5xl aspect-[8/5] max-h-[82vh] bg-gradient-to-b from-[#070b14] via-[#090f1d] to-[#070b14] rounded-3xl overflow-hidden border border-amber-500/20 shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex justify-center items-center select-none">
      {/* Ambient background glow flares */}
      <div className="pointer-events-none absolute -top-32 -left-32 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl" />

      {/* Phaser Canvas */}
      <div ref={containerRef} className="w-full h-full flex justify-center items-center" />

      {/* Glassmorphic Victory / Defeat / Game Over Overlays */}
      <FruitNinjaOverlays
        game={gameInstance}
        isMultiplayer={isMultiplayer}
        onReplay={onReplay}
        onClose={onBack}
      />
    </div>
  );
};

export default FruitNinjaPhaserGame;
