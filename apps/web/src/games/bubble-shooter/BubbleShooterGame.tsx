import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameWrapper } from '../../components/GameWrapper';
import { claimPracticeReward } from '../../services/api/practiceReward';
import { useGameLoop } from '../shared/hooks/useGameLoop';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import { MultiplayerMatchPanel } from '../shared/components/MultiplayerMatchPanel';
import { BUBBLE_SHOOTER_VISUAL_CONFIG, prefersReducedMotion } from './constants/bubbleShooterVisualConfig';
import { Bubble3DRenderer } from './utils/bubble3DRenderer';
import { BubbleShooterOverlays } from './components/BubbleShooterOverlays';
import { Trophy, Zap, Flame, RefreshCcw, HelpCircle, Shield } from 'lucide-react';

interface BubbleShooterProps {
  mode: 'ai' | 'multiplayer';
  stake: number;
  onBack: () => void;
}

// Server-authoritative state mirror
type RemoteBubble = { row: number; col: number; color: string; type: 'normal' | 'bomb' | 'rainbow' };
type RemotePlayer = {
  seat: number;
  name: string;
  grid: RemoteBubble[];
  topOffset: number;
  shotsFired: number;
  nextBubble: { color: string; type: 'normal' | 'bomb' | 'rainbow' };
  score: number;
  status: 'playing' | 'won' | 'eliminated';
};
type RemoteState = {
  players: RemotePlayer[];
  winnerSeats: number[];
  finished: boolean;
  result: 'none' | 'win' | 'draw';
};

const COLORS = ['#fb7185', '#818cf8', '#34d399', '#fbbf24', '#c084fc'];
const RADIUS = BUBBLE_SHOOTER_VISUAL_CONFIG.radius; // 16
const DIAMETER = RADIUS * 2; // 32
const ROWS = BUBBLE_SHOOTER_VISUAL_CONFIG.rows;
const COLS = BUBBLE_SHOOTER_VISUAL_CONFIG.cols;
const ROW_HEIGHT = RADIUS * Math.sqrt(3); // ~27.7
const CANVAS_WIDTH = BUBBLE_SHOOTER_VISUAL_CONFIG.canvasWidth; // 384
const CANVAS_HEIGHT = BUBBLE_SHOOTER_VISUAL_CONFIG.canvasHeight; // 580
const SHOOTER_X = CANVAS_WIDTH / 2;
const SHOOTER_Y = CANVAS_HEIGHT - 36;
const SPEED = BUBBLE_SHOOTER_VISUAL_CONFIG.speed; // 1200

type GridBubble = {
  row: number;
  col: number;
  x: number;
  y: number;
  color: string;
  type: 'normal' | 'bomb' | 'rainbow';
  popScale?: number;
};

type MovingBubble = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  type: 'normal' | 'bomb' | 'rainbow';
};

type FallingBubble = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vRot: number;
  color: string;
  type: 'normal' | 'bomb' | 'rainbow';
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

type FloatingText = {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
  scale: number;
};

function getGridX(row: number, col: number) {
  const xOffset = Math.abs(row % 2) === 0 ? RADIUS : DIAMETER;
  return xOffset + col * DIAMETER;
}

function getGridY(row: number, topOffset: number) {
  return RADIUS + (row + topOffset) * ROW_HEIGHT;
}

// ─── Multiplayer Opponent Mini-Board Preview ─────────────────────────────────
const OpponentMiniBoard: React.FC<{ player: RemotePlayer; name: string }> = ({ player, name }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scale = canvas.width / CANVAS_WIDTH;
    ctx.save();
    ctx.scale(scale, scale);

    // Dark arena background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    player.grid.forEach((b) => {
      const x = getGridX(b.row, b.col);
      const y = getGridY(b.row, player.topOffset);
      Bubble3DRenderer.drawBubble(ctx, x, y, b.color, b.type, RADIUS * 0.9);
    });

    ctx.restore();
  }, [player]);

  return (
    <div className="flex flex-col items-center bg-slate-900/90 border border-slate-800 p-3 rounded-2xl shadow-xl w-full">
      <div className="flex items-center justify-between w-full mb-1.5 px-1">
        <span className="text-xs font-bold text-slate-300 truncate">⚔️ {name}</span>
        <span className="text-xs font-black text-amber-400">{player.score} pts</span>
      </div>
      <canvas
        ref={canvasRef}
        width={160}
        height={240}
        className="rounded-xl border border-slate-800 bg-[#070b14] shadow-inner"
      />
    </div>
  );
};

export const BubbleShooterGame: React.FC<BubbleShooterProps> = ({ mode, stake, onBack }) => {
  const isMultiplayer = mode === 'multiplayer';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const gameState = useMultiplayerStore((s) => s.gameState);
  const winner = useMultiplayerStore((s) => s.winner);
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const isSpectator = useMultiplayerStore((s) => s.isSpectator);
  const room = useMultiplayerStore((s) => s.room);
  const roomPlayers = room?.players ?? [];

  const [score, setScore] = useState(0);
  const [shotsUntilDrop, setShotsUntilDrop] = useState(2);
  const [bestCombo, setBestCombo] = useState(0);
  const [poppedCount, setPoppedCount] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [win, setWin] = useState(false);
  const [lose, setLose] = useState(false);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [showRules, setShowRules] = useState(false);

  // Game State Refs
  const gridRef = useRef<GridBubble[]>([]);
  const shotsFiredRef = useRef(0);
  const nextBubbleRef = useRef<{ color: string; type: 'normal' | 'bomb' | 'rainbow' }>({ color: COLORS[0]!, type: 'normal' });
  const loadedBubbleRef = useRef<{ color: string; type: 'normal' | 'bomb' | 'rainbow' }>({ color: COLORS[1]!, type: 'normal' });
  const movingBubbleRef = useRef<MovingBubble | null>(null);
  const fallingBubblesRef = useRef<FallingBubble[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const mousePosRef = useRef({ x: SHOOTER_X, y: 0 });
  const topOffsetRef = useRef(0);
  const screenShakeRef = useRef(0);
  const shootingRef = useRef(false);
  const comboStreakRef = useRef(0);

  const getNextBubble = useCallback((): { color: string; type: 'normal' | 'bomb' | 'rainbow' } => {
    const rand = Math.random();
    if (rand < 0.03) return { color: '#000000', type: 'bomb' };
    if (rand < 0.06) return { color: '#ffffff', type: 'rainbow' };

    if (gridRef.current.length > 0) {
      const activeColors = Array.from(new Set(gridRef.current.filter((b) => b.type === 'normal').map((b) => b.color)));
      if (activeColors.length > 0) {
        return { color: activeColors[Math.floor(Math.random() * activeColors.length)]!, type: 'normal' };
      }
    }
    return { color: COLORS[Math.floor(Math.random() * COLORS.length)]!, type: 'normal' };
  }, []);

  const initGrid = useCallback(() => {
    topOffsetRef.current = 0;
    shotsFiredRef.current = 0;
    screenShakeRef.current = 0;
    comboStreakRef.current = 0;
    setShotsUntilDrop(2);

    const initialRows = 5;
    const grid: GridBubble[] = [];
    for (let r = 0; r < initialRows; r++) {
      const cols = Math.abs(r % 2) === 0 ? COLS : COLS - 1;
      for (let c = 0; c < cols; c++) {
        grid.push({
          row: r,
          col: c,
          x: getGridX(r, c),
          y: getGridY(r, 0),
          color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
          type: 'normal',
        });
      }
    }
    gridRef.current = grid;
    loadedBubbleRef.current = getNextBubble();
    nextBubbleRef.current = getNextBubble();
  }, [getNextBubble]);

  useEffect(() => {
    if (!isMultiplayer) {
      initGrid();
    }
  }, [initGrid, isMultiplayer]);

  // Multiplayer State Synchronization
  useEffect(() => {
    if (!isMultiplayer || !gameState || mySeat == null) return;
    const s = gameState as unknown as RemoteState;
    const me = (s.players ?? []).find((p) => p.seat === mySeat);
    if (!me) return;

    gridRef.current = me.grid.map((b) => ({
      ...b,
      x: getGridX(b.row, b.col),
      y: getGridY(b.row, me.topOffset),
    }));
    topOffsetRef.current = me.topOffset;
    shotsFiredRef.current = me.shotsFired;
    setShotsUntilDrop(2 - (me.shotsFired % 2));
    nextBubbleRef.current = me.nextBubble;
    movingBubbleRef.current = null;
    shootingRef.current = false;
    setScore(me.score);

    const won = me.status === 'won' || s.winnerSeats.includes(mySeat);
    if (won) {
      setWin(true);
      setGameOver(false);
      setLose(false);
    } else if (me.status === 'eliminated' && !s.finished) {
      setGameOver(true);
      setWin(false);
      setLose(false);
    } else if (s.finished) {
      setLose(true);
      setWin(false);
      setGameOver(false);
    } else {
      setWin(false);
      setGameOver(false);
      setLose(false);
    }
  }, [gameState, mySeat, isMultiplayer]);

  // ─── 60 FPS Game Loop ───────────────────────────────────────────────────────
  useGameLoop((dt) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const spawnParticles = (x: number, y: number, color: string, count = 10) => {
      const theme = BUBBLE_SHOOTER_VISUAL_CONFIG.bubbleThemes[color];
      const pColors = theme ? theme.particles : [color, '#ffffff'];

      for (let i = 0; i < count; i++) {
        const pColor = pColors[Math.floor(Math.random() * pColors.length)]!;
        particlesRef.current.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 550,
          vy: (Math.random() - 0.5) * 550 - 80,
          life: 0.6,
          maxLife: 0.6,
          color: pColor,
          size: Math.random() * 4 + 2,
        });
      }
    };

    const spawnFloatingText = (x: number, y: number, text: string, color: string) => {
      floatingTextsRef.current.push({
        x,
        y,
        text,
        life: 1.2,
        maxLife: 1.2,
        color,
        scale: 1.3,
      });
    };

    const triggerScreenShake = (intensity: number) => {
      if (!prefersReducedMotion()) {
        screenShakeRef.current = intensity;
      }
    };

    const getGridNeighbors = (row: number, col: number) => {
      const neighbors = [
        [0, -1], [0, 1], [-1, 0], [1, 0],
      ];
      if (row % 2 === 0) {
        neighbors.push([-1, -1], [1, -1]);
      } else {
        neighbors.push([-1, 1], [1, 1]);
      }
      return neighbors.map((n) => ({ r: row + n[0]!, c: col + n[1]! }));
    };

    const checkMatches = (startRow: number, startCol: number, color: string) => {
      const matched: GridBubble[] = [];
      const toCheck = [{ r: startRow, c: startCol }];
      const visited = new Set<string>();
      visited.add(`${startRow},${startCol}`);

      while (toCheck.length > 0) {
        const { r, c } = toCheck.pop()!;
        const bubble = gridRef.current.find((b) => b.row === r && b.col === c);
        if (bubble && (bubble.color === color || bubble.type === 'rainbow')) {
          matched.push(bubble);
          const neighbors = getGridNeighbors(r, c);
          for (const n of neighbors) {
            const key = `${n.r},${n.c}`;
            if (!visited.has(key)) {
              visited.add(key);
              toCheck.push(n);
            }
          }
        }
      }
      return matched;
    };

    const getBombRadius = (startRow: number, startCol: number) => {
      const matched: GridBubble[] = [];
      const n1 = getGridNeighbors(startRow, startCol);
      const allN = new Set([`${startRow},${startCol}`]);
      n1.forEach((n) => allN.add(`${n.r},${n.c}`));

      n1.forEach((n) => {
        const n2 = getGridNeighbors(n.r, n.c);
        n2.forEach((nn) => allN.add(`${nn.r},${nn.c}`));
      });

      gridRef.current.forEach((b) => {
        if (allN.has(`${b.row},${b.col}`)) matched.push(b);
      });
      return matched;
    };

    const dropFloatingBubbles = () => {
      const visited = new Set<string>();
      const toCheck = gridRef.current
        .filter((b) => b.row === -topOffsetRef.current)
        .map((b) => ({ r: b.row, c: b.col }));
      toCheck.forEach((b) => visited.add(`${b.r},${b.c}`));

      while (toCheck.length > 0) {
        const { r, c } = toCheck.pop()!;
        const neighbors = getGridNeighbors(r, c);
        for (const n of neighbors) {
          const key = `${n.r},${n.c}`;
          if (!visited.has(key) && gridRef.current.some((b) => b.row === n.r && b.col === n.c)) {
            visited.add(key);
            toCheck.push(n);
          }
        }
      }

      const floating = gridRef.current.filter((b) => !visited.has(`${b.row},${b.col}`));
      if (floating.length > 0) {
        // Convert to physical falling bubbles with rotation and gravity
        floating.forEach((b) => {
          spawnParticles(b.x, b.y, b.color, 5);
          fallingBubblesRef.current.push({
            x: b.x,
            y: b.y,
            vx: (Math.random() - 0.5) * 160,
            vy: -Math.random() * 120,
            rotation: 0,
            vRot: (Math.random() - 0.5) * 8,
            color: b.color,
            type: b.type,
          });
        });

        gridRef.current = gridRef.current.filter((b) => visited.has(`${b.row},${b.col}`));

        const pts = floating.length * 30;
        setScore((s) => s + pts);
        setPoppedCount((p) => p + floating.length);

        if (floating.length >= 2) {
          spawnFloatingText(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20, `+${pts} DROP!`, '#38bdf8');
          triggerScreenShake(7);
        }
      }
    };

    const addNewRow = () => {
      topOffsetRef.current += 1;
      const r = -topOffsetRef.current;
      const cols = Math.abs(r % 2) === 0 ? COLS : COLS - 1;
      for (let c = 0; c < cols; c++) {
        gridRef.current.push({
          row: r,
          col: c,
          x: getGridX(r, c),
          y: getGridY(r, topOffsetRef.current),
          color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
          type: 'normal',
        });
      }

      gridRef.current.forEach((b) => {
        b.y = getGridY(b.row, topOffsetRef.current);
      });
      triggerScreenShake(4);
    };

    const checkGameOver = () => {
      const isOver = gridRef.current.some((b) => b.y + RADIUS >= SHOOTER_Y - 10);
      if (isOver) {
        setGameOver(true);
      }
    };

    const snapBubble = (bubble: MovingBubble) => {
      let bestRow = 0;
      let bestCol = 0;
      let minDst = Infinity;

      const maxRowsToCheck = 25;
      for (let r = -topOffsetRef.current; r < -topOffsetRef.current + maxRowsToCheck; r++) {
        const cols = Math.abs(r % 2) === 0 ? COLS : COLS - 1;
        for (let c = 0; c < cols; c++) {
          const existing = gridRef.current.find((b) => b.row === r && b.col === c);
          if (!existing) {
            const gx = getGridX(r, c);
            const gy = getGridY(r, topOffsetRef.current);
            const dst = Math.hypot(gx - bubble.x, gy - bubble.y);
            if (dst < minDst) {
              minDst = dst;
              bestRow = r;
              bestCol = c;
            }
          }
        }
      }

      let matchColor = bubble.color;
      let matched: GridBubble[] = [];

      // Handle Rainbow Wildcard
      if (bubble.type === 'rainbow') {
        const neighbors = getGridNeighbors(bestRow, bestCol);
        let foundColor = false;
        for (const n of neighbors) {
          const neigh = gridRef.current.find((b) => b.row === n.r && b.col === n.c);
          if (neigh && neigh.type === 'normal') {
            matchColor = neigh.color;
            foundColor = true;
            break;
          }
        }
        if (!foundColor) matchColor = COLORS[Math.floor(Math.random() * COLORS.length)]!;
      }

      // Add to grid
      const newBubble: GridBubble = {
        row: bestRow,
        col: bestCol,
        x: getGridX(bestRow, bestCol),
        y: getGridY(bestRow, topOffsetRef.current),
        color: matchColor,
        type: bubble.type,
      };
      gridRef.current.push(newBubble);

      if (bubble.type === 'bomb') {
        matched = getBombRadius(bestRow, bestCol);
      } else {
        matched = checkMatches(bestRow, bestCol, matchColor);
      }

      if (matched.length >= 3 || bubble.type === 'bomb') {
        // Success match
        comboStreakRef.current += 1;
        if (comboStreakRef.current > bestCombo) {
          setBestCombo(comboStreakRef.current);
        }

        matched.forEach((b) => spawnParticles(b.x, b.y, b.color, bubble.type === 'bomb' ? 16 : 8));
        gridRef.current = gridRef.current.filter((b) => !matched.includes(b));

        const pts = matched.length * 10 * (bubble.type === 'bomb' ? 2 : 1) + (comboStreakRef.current > 1 ? comboStreakRef.current * 10 : 0);
        setScore((s) => s + pts);
        setPoppedCount((p) => p + matched.length);

        if (matched.length >= 4 || bubble.type === 'bomb' || comboStreakRef.current >= 2) {
          const label = bubble.type === 'bomb'
            ? '💣 BOOM!'
            : comboStreakRef.current >= 3
              ? `⚡ ${comboStreakRef.current}x COMBO!`
              : '✨ GREAT!';
          spawnFloatingText(newBubble.x, newBubble.y, label, bubble.type === 'bomb' ? '#f43f5e' : '#10b981');
          triggerScreenShake(bubble.type === 'bomb' ? 14 : 5);
        }

        dropFloatingBubbles();
      } else {
        comboStreakRef.current = 0;
        spawnFloatingText(newBubble.x, newBubble.y, 'MISS', '#94a3b8');
      }

      // Increment shot counter & drop row every 2 shots
      shotsFiredRef.current += 1;
      const left = 2 - (shotsFiredRef.current % 2);
      setShotsUntilDrop(left === 0 ? 2 : left);

      if (shotsFiredRef.current >= 2) {
        shotsFiredRef.current = 0;
        addNewRow();
      }

      if (gridRef.current.length === 0) {
        setWin(true);
      } else {
        checkGameOver();
      }
    };

    // ── Update Logic ──
    const update = () => {
      // Screen shake decay
      if (screenShakeRef.current > 0) {
        screenShakeRef.current -= dt * 25;
        if (screenShakeRef.current < 0) screenShakeRef.current = 0;
      }

      // Moving Bubble Physics
      if (movingBubbleRef.current) {
        const b = movingBubbleRef.current;
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        // Fading tail particles
        if (Math.random() < 0.4) {
          particlesRef.current.push({
            x: b.x + (Math.random() - 0.5) * 4,
            y: b.y + (Math.random() - 0.5) * 4,
            vx: -b.vx * 0.1,
            vy: -b.vy * 0.1,
            life: 0.25,
            maxLife: 0.25,
            color: b.color,
            size: 3,
          });
        }

        // Wall collisions
        if (b.x - RADIUS < 0) { b.x = RADIUS; b.vx *= -1; }
        if (b.x + RADIUS > CANVAS_WIDTH) { b.x = CANVAS_WIDTH - RADIUS; b.vx *= -1; }
        if (b.y - RADIUS < 0) {
          b.y = RADIUS;
          if (!isMultiplayer) snapBubble(b);
          movingBubbleRef.current = null;
          return;
        }

        // Bubble collisions
        let hit = false;
        for (const gb of gridRef.current) {
          const dst = Math.hypot(b.x - gb.x, b.y - gb.y);
          if (dst < DIAMETER - 2) {
            hit = true;
            break;
          }
        }

        if (hit) {
          if (!isMultiplayer) snapBubble(b);
          movingBubbleRef.current = null;
        }
      }

      // Falling Detached Bubbles Physics
      fallingBubblesRef.current.forEach((fb) => {
        fb.x += fb.vx * dt;
        fb.y += fb.vy * dt;
        fb.vy += BUBBLE_SHOOTER_VISUAL_CONFIG.timing.dropGravity * dt;
        fb.rotation += fb.vRot * dt;
      });
      fallingBubblesRef.current = fallingBubblesRef.current.filter((fb) => fb.y < CANVAS_HEIGHT + 50);

      // Particle physics
      particlesRef.current.forEach((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 1200 * dt;
        p.life -= dt;
      });
      particlesRef.current = particlesRef.current.filter((p) => p.life > 0);

      // Floating text popups
      floatingTextsRef.current.forEach((t) => {
        t.y -= 45 * dt;
        t.life -= dt;
      });
      floatingTextsRef.current = floatingTextsRef.current.filter((t) => t.life > 0);
    };

    // ── Raycast Trajectory Math ──
    const getTrajectoryPoints = () => {
      if (movingBubbleRef.current) return { points: [], phantom: undefined };

      const points: Array<{ x: number; y: number }> = [{ x: SHOOTER_X, y: SHOOTER_Y }];
      let tx = SHOOTER_X;
      let ty = SHOOTER_Y;

      const dx = mousePosRef.current.x - SHOOTER_X;
      const dy = mousePosRef.current.y - SHOOTER_Y;
      const angle = Math.atan2(dy, dx);

      let tvx = Math.cos(angle);
      let tvy = Math.sin(angle);

      let bounces = 0;
      const step = 4;
      let hit = false;
      let phantom: { x: number; y: number; color: string; type: 'normal' | 'bomb' | 'rainbow' } | undefined;

      for (let iter = 0; iter < 450 && !hit; iter++) {
        tx += tvx * step;
        ty += tvy * step;

        if (tx - RADIUS <= 0) {
          tx = RADIUS;
          tvx *= -1;
          points.push({ x: tx, y: ty });
          bounces++;
        } else if (tx + RADIUS >= CANVAS_WIDTH) {
          tx = CANVAS_WIDTH - RADIUS;
          tvx *= -1;
          points.push({ x: tx, y: ty });
          bounces++;
        }

        if (ty - RADIUS <= 0) {
          hit = true;
          points.push({ x: tx, y: ty });
          break;
        }

        for (const gb of gridRef.current) {
          if (Math.hypot(tx - gb.x, ty - gb.y) < DIAMETER - 1) {
            hit = true;
            points.push({ x: tx, y: ty });
            phantom = {
              x: tx,
              y: ty,
              color: loadedBubbleRef.current.color,
              type: loadedBubbleRef.current.type,
            };
            break;
          }
        }
        if (bounces > BUBBLE_SHOOTER_VISUAL_CONFIG.aimGuide.bounceLimit) break;
      }

      if (!hit && points[points.length - 1]?.x !== tx) {
        points.push({ x: tx, y: ty });
      }

      return { points, phantom };
    };

    // ── Drawing Frame ──
    const draw = () => {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.save();
      if (screenShakeRef.current > 0) {
        const sx = (Math.random() - 0.5) * screenShakeRef.current;
        const sy = (Math.random() - 0.5) * screenShakeRef.current;
        ctx.translate(sx, sy);
      }

      // 1. Dark Dojo / Arena Gradient Background
      const arenaGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      arenaGrad.addColorStop(0, '#090f1d');
      arenaGrad.addColorStop(0.5, '#070b14');
      arenaGrad.addColorStop(1, '#05070c');
      ctx.fillStyle = arenaGrad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Central ambient spotlight glow
      const spotGrad = ctx.createRadialGradient(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 20, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 240);
      spotGrad.addColorStop(0, 'rgba(56, 189, 248, 0.06)');
      spotGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = spotGrad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Subtle hexagonal grid guidelines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      for (let y = getGridY(-topOffsetRef.current, topOffsetRef.current); y < CANVAS_HEIGHT - 60; y += ROW_HEIGHT) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
        ctx.stroke();
      }

      // Danger Line (Shooter Threshold)
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(0, SHOOTER_Y - 10);
      ctx.lineTo(CANVAS_WIDTH, SHOOTER_Y - 10);
      ctx.stroke();
      ctx.setLineDash([]);

      // 2. Bubble Grid
      gridRef.current.forEach((b) => {
        Bubble3DRenderer.drawBubble(ctx, b.x, b.y, b.color, b.type);
      });

      // 3. Falling Detached Bubbles
      fallingBubblesRef.current.forEach((fb) => {
        Bubble3DRenderer.drawBubble(ctx, fb.x, fb.y, fb.color, fb.type, RADIUS, 0.9, 1.0, fb.rotation);
      });

      // 4. Moving In-Flight Bubble
      if (movingBubbleRef.current) {
        const b = movingBubbleRef.current;
        Bubble3DRenderer.drawBubble(ctx, b.x, b.y, b.color, b.type, RADIUS * 1.08);
      }

      // 5. Particles
      particlesRef.current.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // 6. Floating Text Popups
      floatingTextsRef.current.forEach((t) => {
        ctx.save();
        ctx.globalAlpha = t.life / t.maxLife;
        ctx.fillStyle = t.color;
        ctx.font = '900 16px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 6;
        ctx.fillText(t.text, t.x, t.y);
        ctx.restore();
      });

      // 7. Aiming Trajectory Guide
      if (!movingBubbleRef.current && !gameOver && !win && !lose && !showRules) {
        const { points, phantom } = getTrajectoryPoints();
        Bubble3DRenderer.drawAimGuide(ctx, points, phantom);
      }

      // 8. 3D Shooter Cannon
      const dx = mousePosRef.current.x - SHOOTER_X;
      const dy = mousePosRef.current.y - SHOOTER_Y;
      const angle = Math.atan2(dy, dx);

      Bubble3DRenderer.drawShooter(
        ctx,
        SHOOTER_X,
        SHOOTER_Y,
        angle,
        loadedBubbleRef.current.color,
        loadedBubbleRef.current.type,
        nextBubbleRef.current.color,
        nextBubbleRef.current.type,
        !!movingBubbleRef.current
      );

      ctx.restore();
    };

    update();
    draw();
  }, !(gameOver || win || lose || showRules));

  // ─── Input Handlers (Mouse & Touch) ─────────────────────────────────────────
  const updateAimCoords = (clientX: number, clientY: number) => {
    if (!canvasRef.current || movingBubbleRef.current || gameOver || win || lose) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    let dx = x - SHOOTER_X;
    let dy = y - SHOOTER_Y;
    if (dy > -15) dy = -15; // Clamp so player cannot aim down

    mousePosRef.current = { x: SHOOTER_X + dx, y: SHOOTER_Y + dy };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    updateAimCoords(e.clientX, e.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const touch = e.touches[0];
    if (touch) updateAimCoords(touch.clientX, touch.clientY);
  };

  const canShoot = useCallback(() => {
    if (mySeat == null || isSpectator) return false;
    const s = gameState as unknown as RemoteState | null;
    if (!s || s.finished) return false;
    const me = (s.players ?? []).find((p) => p.seat === mySeat);
    return !!me && me.status === 'playing';
  }, [gameState, mySeat, isSpectator]);

  const handleShoot = () => {
    if (movingBubbleRef.current || gameOver || win || lose || showRules) return;

    const dx = mousePosRef.current.x - SHOOTER_X;
    const dy = mousePosRef.current.y - SHOOTER_Y;
    const angle = Math.atan2(dy, dx);

    if (isMultiplayer) {
      if (shootingRef.current || !canShoot()) return;
      shootingRef.current = true;
      movingBubbleRef.current = {
        x: SHOOTER_X,
        y: SHOOTER_Y,
        vx: Math.cos(angle) * SPEED,
        vy: Math.sin(angle) * SPEED,
        color: nextBubbleRef.current.color,
        type: nextBubbleRef.current.type,
      };

      void useMultiplayerStore.getState().sendGameAction({ type: 'shoot', angle }).then((res) => {
        if (!res.ok) {
          shootingRef.current = false;
          movingBubbleRef.current = null;
        }
      });
      return;
    }

    movingBubbleRef.current = {
      x: SHOOTER_X,
      y: SHOOTER_Y,
      vx: Math.cos(angle) * SPEED,
      vy: Math.sin(angle) * SPEED,
      color: loadedBubbleRef.current.color,
      type: loadedBubbleRef.current.type,
    };

    // Cycle Next Bubble into Loaded slot
    loadedBubbleRef.current = nextBubbleRef.current;
    nextBubbleRef.current = getNextBubble();
  };

  useEffect(() => {
    if (win && !rewardClaimed && !isMultiplayer) {
      void claimPracticeReward('bubble-shooter');
      setRewardClaimed(true);
    }
  }, [win, rewardClaimed, isMultiplayer]);

  const handleReplay = () => {
    if (isMultiplayer) {
      void useMultiplayerStore.getState().rematch();
      return;
    }
    setScore(0);
    setBestCombo(0);
    setPoppedCount(0);
    setGameOver(false);
    setWin(false);
    setLose(false);
    setRewardClaimed(false);
    movingBubbleRef.current = null;
    fallingBubblesRef.current = [];
    particlesRef.current = [];
    floatingTextsRef.current = [];
    initGrid();
  };

  const remoteState = gameState as unknown as RemoteState | null;
  const serverPlayers = isMultiplayer && remoteState ? remoteState.players ?? [] : [];
  const winnerSeats = isMultiplayer
    ? remoteState?.winnerSeats ?? winner?.winnerSeats ?? []
    : [];
  const namesBySeat: Record<number, string> = {};
  for (const p of roomPlayers) {
    if (p.seat != null) namesBySeat[p.seat] = p.displayName;
  }
  const winnerSeat = winnerSeats[0] != null ? winnerSeats[0] : null;
  const winnerName = winnerSeat != null ? (namesBySeat[winnerSeat] ?? `Player ${winnerSeat + 1}`) : null;

  return (
    <GameWrapper title="Bubble Shooter 3D" gameId="bubble-shooter" mode={mode} stake={stake} onBack={onBack} isFullscreen>
      <div className="flex flex-col lg:flex-row items-center justify-center gap-6 w-full max-w-6xl relative mx-auto h-full p-2 lg:p-4 select-none">
        
        {/* CENTER PLAYFIELD CONTAINER */}
        <div className="relative flex flex-col items-center justify-center w-full max-w-[440px] shrink-0">
          
          {/* TOP MODERN HUD PILLS */}
          <div className="w-full flex items-center justify-between gap-2.5 mb-2.5 px-1">
            {/* Score Pill */}
            <div className="flex-1 py-2 px-3.5 bg-slate-900/90 border border-amber-500/40 rounded-2xl flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Score</span>
              </div>
              <span className="text-base font-black font-mono text-white">{score.toLocaleString()}</span>
            </div>

            {/* Shots Until Drop Pill */}
            <div className="py-2 px-3.5 bg-slate-900/90 border border-rose-500/40 rounded-2xl flex items-center gap-2 shadow-lg">
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              <div className="text-center">
                <span className="text-[9px] font-bold text-slate-400 uppercase block">Drop in</span>
                <span className="text-xs font-black text-rose-400">{shotsUntilDrop} Shots</span>
              </div>
            </div>

            {/* Rules Button */}
            <button
              onClick={() => setShowRules(true)}
              className="p-2.5 bg-slate-900/90 border border-indigo-500/40 hover:border-indigo-400 rounded-2xl text-indigo-400 transition-colors shadow-lg"
              title="View Rules"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>

          {/* MAIN 3D CANVAS PLAYFIELD */}
          <div className="relative w-full aspect-[384/580] max-h-[82vh] bg-[#070b14] rounded-3xl overflow-hidden border-2 border-indigo-500/30 shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex justify-center items-center">
            {/* Ambient Background Glow Flares */}
            <div className="pointer-events-none absolute -top-24 -left-24 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -right-24 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />

            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              onMouseMove={handleMouseMove}
              onClick={handleShoot}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleShoot}
              className="w-full h-full object-contain cursor-crosshair"
            />

            {/* Glassmorphic Overlays */}
            <BubbleShooterOverlays
              isWin={win}
              isGameOver={gameOver}
              isLose={lose}
              score={score}
              bestCombo={bestCombo}
              poppedCount={poppedCount}
              isMultiplayer={isMultiplayer}
              winnerName={winnerName}
              showRules={showRules}
              onCloseRules={() => setShowRules(false)}
              onReplay={handleReplay}
              onExit={onBack}
            />
          </div>
        </div>

        {/* MULTIPLAYER / OPPONENT SIDE PANEL */}
        {isMultiplayer && (
          <div className="w-full max-w-xs flex flex-col gap-4">
            <div className="bg-slate-900/90 p-5 rounded-3xl border border-slate-800 shadow-2xl">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-3 text-center">Scoreboard</span>
              <div className="space-y-2">
                {serverPlayers.map((p) => {
                  const isMe = p.seat === mySeat;
                  const statusColor =
                    p.status === 'won'
                      ? 'text-emerald-400 border-emerald-500/40 bg-emerald-950/40'
                      : p.status === 'eliminated'
                        ? 'text-rose-400 border-rose-500/40 bg-rose-950/40'
                        : 'text-slate-300 border-slate-700 bg-slate-800/60';
                  const statusLabel =
                    p.status === 'won' ? 'Won' : p.status === 'eliminated' ? 'Out' : 'Playing';
                  return (
                    <div
                      key={p.seat}
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left ${
                        isMe ? 'border-indigo-500/50 bg-indigo-950/40' : 'border-slate-800 bg-slate-900/40'
                      }`}
                    >
                      <span className="text-xs font-bold text-slate-200 truncate">
                        {isMe ? 'You' : (namesBySeat[p.seat] ?? p.name)}
                        {isMe && <span className="ml-1 text-indigo-400">•</span>}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-black text-amber-400">{p.score}</span>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live Opponent Board Preview */}
            <div className="w-full space-y-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block text-center">Live Opponent</span>
              {serverPlayers
                .filter((p) => p.seat !== mySeat)
                .map((opp) => (
                  <OpponentMiniBoard key={opp.seat} player={opp} name={namesBySeat[opp.seat] ?? opp.name} />
                ))}
            </div>

            <div className="hidden xl:block">
              <MultiplayerMatchPanel compact />
            </div>
          </div>
        )}
      </div>
    </GameWrapper>
  );
};

export default BubbleShooterGame;
