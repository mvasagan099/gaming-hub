import React, { useEffect, useRef } from "react";
import Phaser from "phaser";
import { ChessScene } from "./phaser/scenes/ChessScene";
import { ChessOverlays } from "./components/ChessOverlays";
import { ChessDesktopSidebar, ChessMobileTop, ChessMobileBottom } from "./components/ChessMatchPanel";
import { CHESS_DESIGN_CONFIG } from "./phaser/constants/chessAnimationConfig";

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
      width:  CHESS_DESIGN_CONFIG.canvasWidth,
      height: CHESS_DESIGN_CONFIG.canvasHeight,
      parent: containerRef.current,
      backgroundColor: "#070b14",
      transparent: false,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      scene: [ChessScene],
      physics: { default: "arcade" },
    };

    const game = new Phaser.Game(config);
    setGameInstance(game);

    game.registry.set("mode",    mode);
    game.registry.set("aiLevel", level);
    game.registry.set("theme",   theme);
    game.registry.set("online",  online);
    game.registry.set("players", players);
    game.registry.set("seat",    seat);
    game.registry.set("names",   names);

    return () => {
      game.destroy(true);
      setGameInstance(null);
    };
  }, [mode, level, theme, online, players, seat, names]);

  return (
    /* ── Outer Arena Wrapper ── */
    <div className="relative w-full max-w-7xl mx-auto flex flex-col lg:flex-row items-center lg:items-stretch justify-center gap-2 sm:gap-4 px-2 py-1 sm:py-3 select-none">

      {/* ── Deep Space Background & Board Halo ── */}
      {/* Top-left warm ambient */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-40"
        style={{ background: "radial-gradient(circle, rgba(180,110,30,0.18) 0%, transparent 70%)" }} />
      {/* Bottom-right cool ambient */}
      <div className="pointer-events-none absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full opacity-30"
        style={{ background: "radial-gradient(circle, rgba(30,60,180,0.15) 0%, transparent 70%)" }} />
      {/* Centre board glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="w-[720px] h-[720px] rounded-full opacity-25"
          style={{ background: "radial-gradient(circle, rgba(200,150,40,0.20) 0%, transparent 65%)" }} />
      </div>

      {/* ── Mobile Layout Column (< lg) & Board ── */}
      <div className="relative flex flex-col items-center justify-center gap-2 w-full max-w-[min(96vw,520px)] lg:max-w-none lg:w-auto">
        {/* Mobile Top HUD (Opponent Card & Clock) */}
        <div className="w-full lg:hidden flex justify-center">
          <ChessMobileTop game={gameInstance} />
        </div>

        {/* ── 3D Elevated Chess Board ── */}
        <div className="relative flex-shrink-0 flex flex-col items-center justify-center">
          {/* Board outer glow ring */}
          <div className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              boxShadow: "0 0 50px 10px rgba(180, 120, 30, 0.14), 0 25px 60px rgba(0,0,0,0.75)",
            }} />

          {/* Phaser canvas mount */}
          <div
            ref={containerRef}
            className="w-full max-w-[min(94vw,calc(100dvh-8rem),760px)] aspect-square rounded-2xl overflow-hidden shadow-2xl"
            style={{
              perspective: "1400px",
            }}
          />

          {/* Edge vignette over board */}
          <div className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at center, transparent 55%, rgba(5,8,18,0.60) 100%)",
            }} />
        </div>

        {/* Mobile Bottom HUD (Player Card & Action Controls) */}
        <div className="w-full lg:hidden flex justify-center">
          <ChessMobileBottom game={gameInstance} />
        </div>
      </div>

      {/* ── Desktop Unified Match Sidebar (>= lg) ── */}
      <div className="hidden lg:flex w-[300px] xl:w-[320px] flex-shrink-0 justify-center">
        <ChessDesktopSidebar game={gameInstance} />
      </div>

      {/* ── Overlays (Promotion, Resign Confirm, Victory) ── */}
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
