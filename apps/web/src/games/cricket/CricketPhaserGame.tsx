import React, { useEffect, useRef } from "react";
import Phaser from "phaser";
import { CricketScene } from "./phaser/scenes/CricketScene";

interface CricketPhaserGameProps {
  mode: "ai" | "multiplayer";
  role?: 'batting' | 'bowling';
  overs?: number;
  onGameOver?: (runs: number, wickets: number, won: boolean) => void;
  onGameEvent?: (type: string, data?: Record<string, unknown>) => void;
}

export function CricketPhaserGame({ mode, role, overs, onGameOver, onGameEvent }: CricketPhaserGameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const onGameOverRef = useRef(onGameOver);
  onGameOverRef.current = onGameOver;
  const onGameEventRef = useRef(onGameEvent);
  onGameEventRef.current = onGameEvent;

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

    // Override scaleManager transformX and transformY to account for object-fit: cover and CSS transforms
    const origTransformX = gameRef.current.scale.transformX.bind(gameRef.current.scale);
    const origTransformY = gameRef.current.scale.transformY.bind(gameRef.current.scale);

    gameRef.current.scale.transformX = function(pageX: number) {
      const canvas = this.canvas;
      if (!canvas) return origTransformX(pageX);
      const rect = canvas.getBoundingClientRect();
      const clientX = pageX - window.scrollX;
      const domX = clientX - rect.left;
      const W_dom = rect.width;
      const H_dom = rect.height;
      if (!W_dom || !H_dom) return origTransformX(pageX);

      const isMobile = window.innerWidth < 768;
      const s = isMobile ? Math.max(W_dom / 924, H_dom / 680) : Math.min(W_dom / 924, H_dom / 680);
      const renderedW = 924 * s;
      const offsetX = (W_dom - renderedW) / 2;
      return (domX - offsetX) / s;
    };

    gameRef.current.scale.transformY = function(pageY: number) {
      const canvas = this.canvas;
      if (!canvas) return origTransformY(pageY);
      const rect = canvas.getBoundingClientRect();
      const clientY = pageY - window.scrollY;
      const domY = clientY - rect.top;
      const W_dom = rect.width;
      const H_dom = rect.height;
      if (!W_dom || !H_dom) return origTransformY(pageY);

      const isMobile = window.innerWidth < 768;
      const s = isMobile ? Math.max(W_dom / 924, H_dom / 680) : Math.min(W_dom / 924, H_dom / 680);
      const renderedH = 680 * s;
      const offsetY = (H_dom - renderedH) / 2;
      return (domY - offsetY) / s;
    };

    // Listen for cricket game events emitted by CricketScene
    const handleGameEvent = (data: { type: string } & Record<string, unknown>) => {
      onGameEventRef.current?.(data.type, data);
    };
    gameRef.current.events.on('cricket:game_event', handleGameEvent);

    gameRef.current.scene.start("CricketScene", {
      mode,
      role: role ?? 'batting',
      overs: overs ?? 1,
      onGameOver: (...args: [number, number, boolean]) => onGameOverRef.current?.(...args),
    });

    return () => {
      if (gameRef.current) {
        gameRef.current.events.off('cricket:game_event', handleGameEvent);
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, role, overs]);

  return (
    <div className="relative mx-auto w-full flex-1 min-h-0 h-full md:aspect-[924/680] md:max-w-[min(98vw,calc((100dvh-2rem)*1.3588),1280px)] md:max-h-[calc(100dvh-2rem)] bg-[#090d16] rounded-xl md:rounded-2xl border-0 md:border md:border-slate-800 shadow-2xl overflow-hidden flex justify-center items-center">
      <div
        ref={containerRef}
        className="touch-none w-full h-full flex items-center justify-center scale-[0.85] md:scale-100 origin-center transition-transform [&>canvas]:!w-full [&>canvas]:!h-full [&>canvas]:!object-cover [&>canvas]:!m-0 [&>canvas]:!static md:[&>canvas]:!w-full md:[&>canvas]:!h-full md:[&>canvas]:!max-w-full md:[&>canvas]:!max-h-full md:[&>canvas]:!object-contain"
      />
    </div>
  );
}
