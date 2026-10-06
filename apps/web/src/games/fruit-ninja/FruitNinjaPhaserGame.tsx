import React, { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { FruitNinjaScene } from "./phaser/scenes/FruitNinjaScene";
import { FRUIT_NINJA_VISUAL_CONFIG } from "./phaser/constants/fruitNinjaVisualConfig";
import { FruitNinjaOverlays } from "./components/FruitNinjaOverlays";
import { RotateCcw } from "lucide-react";

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

  const [isMobilePortrait, setIsMobilePortrait] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 1024 && window.innerHeight > window.innerWidth;
  });

  const stageWidthRef = useRef<number>(FRUIT_NINJA_VISUAL_CONFIG.stageWidth);

  useEffect(() => {
    const handleResize = () => {
      setIsMobilePortrait(window.innerWidth < 1024 && window.innerHeight > window.innerWidth);
      if (gameInstance) {
        gameInstance.scale.refresh();
      }
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, [gameInstance]);

  useEffect(() => {
    if (!containerRef.current) return;

    const isMobile = window.innerWidth < 1024;
    const longDim = Math.max(window.innerWidth, window.innerHeight);
    const shortDim = Math.min(window.innerWidth, window.innerHeight);
    const aspect = shortDim > 0 ? longDim / shortDim : 16 / 10;

    // Dynamically size stageWidth on mobile to fill the entire phone screen aspect ratio
    const stageWidth = isMobile
      ? Math.max(960, Math.round(600 * aspect))
      : FRUIT_NINJA_VISUAL_CONFIG.stageWidth; // 960 on desktop PC
    const stageHeight = 600;

    stageWidthRef.current = stageWidth;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: stageWidth,
      height: stageHeight,
      parent: containerRef.current,
      backgroundColor: "#23140a",
      scale: {
        mode: isMobile ? Phaser.Scale.NONE : Phaser.Scale.FIT,
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
    game.registry.set("isMobilePortrait", isMobilePortrait);

    return () => {
      game.destroy(true);
      setGameInstance(null);
    };
  }, [mode, isMultiplayer]);

  useEffect(() => {
    if (gameInstance) {
      gameInstance.registry.set("isMobilePortrait", isMobilePortrait);
    }
  }, [isMobilePortrait, gameInstance]);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobilePortrait || !gameInstance) return;
    const canvas = containerRef.current?.querySelector("canvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const scene = gameInstance.scene.getScene("FruitNinjaScene") as FruitNinjaScene | undefined;
    if (!scene) return;

    const stageWidth = stageWidthRef.current;

    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i]!;
      const relX = (touch.clientY - rect.top) / rect.height;
      const relY = (rect.right - touch.clientX) / rect.width;
      const gameX = Math.max(0, Math.min(stageWidth, relX * stageWidth));
      const gameY = Math.max(0, Math.min(600, relY * 600));
      scene.startCustomSlice(gameX, gameY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobilePortrait || !gameInstance) return;
    const canvas = containerRef.current?.querySelector("canvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const scene = gameInstance.scene.getScene("FruitNinjaScene") as FruitNinjaScene | undefined;
    if (!scene) return;

    const stageWidth = stageWidthRef.current;

    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i]!;
      const relX = (touch.clientY - rect.top) / rect.height;
      const relY = (rect.right - touch.clientX) / rect.width;
      const gameX = Math.max(0, Math.min(stageWidth, relX * stageWidth));
      const gameY = Math.max(0, Math.min(600, relY * 600));
      scene.handleCustomSlice(gameX, gameY);
    }
  };

  return (
    <>
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        style={
          isMobilePortrait
            ? {
                position: "fixed",
                top: "50%",
                left: "50%",
                width: "100dvh",
                height: "100dvw",
                transform: "translate(-50%, -50%) rotate(90deg)",
                transformOrigin: "center center",
              }
            : undefined
        }
        className={`relative ${
          isMobilePortrait
            ? "w-[100dvh] h-[100dvw] flex-shrink-0 z-40"
            : `mx-auto w-full ${isMultiplayer ? "max-w-[min(100%,calc((100dvh-4.5rem)*1.6))]" : "max-w-[min(96vw,calc((100dvh-5rem)*1.6),1280px)]"} aspect-[8/5] max-h-[calc(100dvh-4.5rem)] h-auto rounded-3xl border border-amber-500/20 shadow-[0_20px_50px_rgba(0,0,0,0.85)]`
        } bg-gradient-to-b from-[#070b14] via-[#090f1d] to-[#070b14] overflow-hidden flex justify-center items-center select-none touch-none`}
      >
        {/* Ambient background glow flares */}
        <div className="pointer-events-none absolute -top-32 -left-32 w-80 h-80 bg-rose-500/10 rounded-full blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-32 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl" />

        {/* Phaser Canvas */}
        <div
          ref={containerRef}
          className={`w-full h-full flex justify-center items-center pointer-events-auto ${
            isMobilePortrait ? "[&>canvas]:!w-full [&>canvas]:!h-full [&>canvas]:!object-fill" : ""
          }`}
        />

        {/* Floating In-Game Landscape Controls on Mobile Portrait */}
        {isMobilePortrait && !isMultiplayer && (
          <div className="absolute top-3 right-3 z-30 flex items-center gap-2 pointer-events-auto">
            <button
              onClick={onReplay}
              className="p-2 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-300 hover:text-white shadow-lg active:scale-95 transition-all cursor-pointer"
              title="Restart Match"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      {/* Result controls stay upright, outside the rotated/clipped arena. */}
      <FruitNinjaOverlays
        game={gameInstance}
        isMultiplayer={isMultiplayer}
        onReplay={onReplay}
        onClose={onBack}
      />
    </>
  );
};

export default FruitNinjaPhaserGame;
