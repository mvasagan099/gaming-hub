import React from "react";
import type { PlayerColor } from "../phaser/types/ludo.types";
import { LUDO_TOKEN_PALETTES } from "../phaser/managers/LudoTokenRenderer";

export interface LudoToken3DProps {
  color: PlayerColor;
  player?: string;
  position?: number;
  isActive?: boolean;
  isSelectable?: boolean;
  isSelected?: boolean;
  isMoving?: boolean;
  isCaptured?: boolean;
  isInHome?: boolean;
  initial?: string;
  size?: number;
  className?: string;
  onClick?: () => void;
}

export const TokenShadow: React.FC<{ size: number; isLifted?: boolean }> = ({ size, isLifted = false }) => (
  <div
    className="absolute pointer-events-none transition-all duration-150 rounded-full"
    style={{
      width: `${size * 1.15}px`,
      height: `${size * 0.45}px`,
      left: `${size * 0.05 + (isLifted ? 2 : 0)}px`,
      top: `${size * 0.75 + (isLifted ? 6 : 2)}px`,
      background: "radial-gradient(ellipse at center, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0) 80%)",
      transform: isLifted ? "scale(0.85)" : "scale(1)",
      filter: "blur(1.5px)",
    }}
  />
);

export const TokenBase: React.FC<{ color: PlayerColor; size: number }> = ({ color, size }) => {
  const p = LUDO_TOKEN_PALETTES[color];
  const hexRim = `#${p.rimDark.toString(16).padStart(6, "0")}`;
  return (
    <div
      className="absolute rounded-full pointer-events-none"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        top: "3px",
        left: "0px",
        backgroundColor: hexRim,
        boxShadow: `0 2px 4px rgba(0,0,0,0.5)`,
      }}
    />
  );
};

export const TokenBody: React.FC<{ color: PlayerColor; size: number }> = ({ color, size }) => {
  const p = LUDO_TOKEN_PALETTES[color];
  const hexBody = `#${p.body.toString(16).padStart(6, "0")}`;
  const hexBodyDark = `#${p.bodyDark.toString(16).padStart(6, "0")}`;
  const hexTopCap = `#${p.topCap.toString(16).padStart(6, "0")}`;
  const hexTopCapLight = `#${p.topCapLight.toString(16).padStart(6, "0")}`;

  return (
    <div
      className="relative rounded-full overflow-hidden flex items-center justify-center pointer-events-none shadow-md"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: `radial-gradient(circle at 35% 30%, ${hexTopCapLight} 0%, ${hexTopCap} 30%, ${hexBody} 65%, ${hexBodyDark} 100%)`,
        border: `1.5px solid rgba(255,255,255,0.25)`,
      }}
    >
      {/* Concentric inner bevel disc */}
      <div
        className="rounded-full flex items-center justify-center"
        style={{
          width: `${size * 0.76}px`,
          height: `${size * 0.76}px`,
          background: `radial-gradient(circle at 35% 30%, ${hexTopCapLight} 0%, ${hexTopCap} 45%, ${hexBody} 100%)`,
          boxShadow: `inset 0 1px 2px rgba(255,255,255,0.6), inset 0 -1px 2px rgba(0,0,0,0.4)`,
        }}
      />
    </div>
  );
};

export const TokenHighlight: React.FC<{ size: number }> = ({ size }) => (
  <>
    {/* Top-left specular catch-light glint */}
    <div
      className="absolute rounded-full pointer-events-none"
      style={{
        width: `${size * 0.22}px`,
        height: `${size * 0.16}px`,
        top: `${size * 0.18}px`,
        left: `${size * 0.22}px`,
        background: "radial-gradient(ellipse at center, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.5) 60%, rgba(255,255,255,0) 100%)",
        transform: "rotate(-25deg)",
      }}
    />
    {/* Subtle specular crescent */}
    <div
      className="absolute rounded-full pointer-events-none"
      style={{
        width: `${size * 0.65}px`,
        height: `${size * 0.65}px`,
        top: `${size * 0.12}px`,
        left: `${size * 0.12}px`,
        borderTop: "1.5px solid rgba(255,255,255,0.45)",
        borderLeft: "1px solid rgba(255,255,255,0.25)",
      }}
    />
  </>
);

export const TokenIcon: React.FC<{ initial?: string; strokeColor: string; size: number }> = ({
  initial,
  strokeColor,
  size,
}) => {
  if (!initial) return null;
  return (
    <span
      className="absolute inset-0 flex items-center justify-center font-black text-white pointer-events-none select-none"
      style={{
        fontSize: `${Math.round(size * 0.32)}px`,
        textShadow: `0 1px 2px #000, 0 0 2px ${strokeColor}`,
        fontFamily: "Outfit, sans-serif",
      }}
    >
      {initial}
    </span>
  );
};

/**
 * Premium 3D Physical Ludo Board Game Token Component.
 * Pure presentation component following the strict 5-layer physical token design.
 */
export const LudoToken3D: React.FC<LudoToken3DProps> = ({
  color,
  isActive = false,
  isSelectable = false,
  isSelected = false,
  isMoving = false,
  initial,
  size = 32,
  className = "",
  onClick,
}) => {
  const p = LUDO_TOKEN_PALETTES[color];
  const isLifted = isMoving || isSelected;

  return (
    <div
      onClick={onClick}
      className={`relative inline-flex items-center justify-center cursor-pointer transition-transform duration-150 ${className}`}
      style={{
        width: `${size}px`,
        height: `${size + 4}px`,
        transform: isSelected
          ? "scale(1.12) translateY(-4px)"
          : isActive || isSelectable
            ? "scale(1.08)"
            : "scale(1.0)",
      }}
    >
      {/* 1. Contact Shadow Layer */}
      <TokenShadow size={size} isLifted={isLifted} />

      {/* Radiant Aura for Active / Selectable Tokens */}
      {(isActive || isSelectable) && (
        <div
          className="absolute rounded-full animate-pulse pointer-events-none"
          style={{
            width: `${size * 1.3}px`,
            height: `${size * 1.3}px`,
            top: `${-size * 0.15}px`,
            left: `${-size * 0.15}px`,
            boxShadow: `0 0 10px 2px #${p.glow.toString(16).padStart(6, "0")}`,
            border: `1.5px solid rgba(255,255,255,0.7)`,
          }}
        />
      )}

      {/* 2. 3D Dark Rim / Base Skirt */}
      <TokenBase color={color} size={size} />

      {/* 3. Volumetric Rounded 3D Body */}
      <TokenBody color={color} size={size} />

      {/* 4. Top-Left Specular Catch-Light & Crescent */}
      <TokenHighlight size={size} />

      {/* 5. Central Player Initial / Crest */}
      <TokenIcon initial={initial} strokeColor={p.textStroke} size={size} />
    </div>
  );
};
