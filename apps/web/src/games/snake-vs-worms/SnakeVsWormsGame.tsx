import React, { useRef, useEffect, useState } from 'react';
import { GameWrapper } from '../../components/GameWrapper';
import { claimPracticeReward } from '../../services/api/practiceReward';
import { useGameLoop } from '../shared/hooks/useGameLoop';
import { MultiplayerMatchPanel } from '../shared/components/MultiplayerMatchPanel';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import { SnakeVsWormsMultiplayerDriver } from './SnakeVsWormsMultiplayerDriver';
import type { SnakeVsWormsState, SnakeWormDirection } from '@gaming-hub/game-engine';

interface SnakeVsWormsProps {
  mode: 'ai' | 'multiplayer';
  stake: number;
  onBack: () => void;
}

interface Point {
  x: number;
  y: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

interface Snake {
  id: string;
  head: Point;
  segments: Point[];
  angle: number;
  targetAngle: number;
  color: string;
  speed: number;
  isPlayer: boolean;
  dead: boolean;
  isBoosting: boolean;
  lengthFloat: number;
}

interface Orb {
  id: number;
  x: number;
  y: number;
  color: string;
  value: number;
  isLoot: boolean;
}

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 600;
const MAP_WIDTH = 2000;
const MAP_HEIGHT = 2000;
const BASE_SPEED = 200;

const PLAYER_COLOR = '#10b981'; // Emerald
const ENEMY_COLORS = ['#f43f5e', '#a855f7', '#3b82f6', '#f59e0b', '#ec4899', '#06b6d4'];

export const SnakeVsWormsGame: React.FC<SnakeVsWormsProps> = ({ mode, stake, onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [length, setLength] = useState(15);
  const [kills, setKills] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [rewardClaimed, setRewardClaimed] = useState(false);

  // Multiplayer state
  const [multiplayerState, setMultiplayerState] = useState<SnakeVsWormsState | null>(null);
  const [mpWinner, setMpWinner] = useState<number | null>(null);
  const driverRef = useRef<SnakeVsWormsMultiplayerDriver | null>(null);
  const multiplayerInitializedRef = useRef(false);

  const mySeat = useMultiplayerStore(s => s.mySeat);
  const room = useMultiplayerStore(s => s.room);

  const inputRef = useRef({
    mouseX: CANVAS_WIDTH / 2,
    mouseY: CANVAS_HEIGHT / 2,
    isBoosting: false
  });

  const gameStateRef = useRef({
    snakes: [] as Snake[],
    orbs: [] as Orb[],
    particles: [] as Particle[],
    orbIdCounter: 0,
    camera: { x: 0, y: 0 }
  });

  // Reward logic
  useEffect(() => {
    if (gameOver && kills >= 3 && !rewardClaimed) {
      setRewardClaimed(true);
      setTimeout(() => void claimPracticeReward('snake-vs-worms'), 1000);
    }
  }, [gameOver, kills, rewardClaimed]);

  // Multiplayer setup
  useEffect(() => {
    if (mode === 'multiplayer' && room && !multiplayerInitializedRef.current) {
      const names = room.players.map(p => p.displayName || `Player ${(p.seat ?? 0) + 1}`);
      const driver = new SnakeVsWormsMultiplayerDriver(mySeat, names);
      driverRef.current = driver;

      driver.setOnStateUpdate((state: SnakeVsWormsState) => {
        setMultiplayerState(state);
        if (state.finished) {
          setGameOver(true);
          const winSeat = state.winnerSeats && state.winnerSeats.length > 0 ? state.winnerSeats[0] : null;
          setMpWinner(winSeat);
        }
      });

      driver.setOnMatchComplete((winSeat: number | null) => {
        setMpWinner(winSeat);
        setGameOver(true);
      });

      driver.start();
      multiplayerInitializedRef.current = true;

      return () => {
        driver.stop();
      };
    }
  }, [mode, room, mySeat]);

  // Input Listeners for controls and boost
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        inputRef.current.isBoosting = true;
        if (mode === 'multiplayer' && driverRef.current) {
          driverRef.current.sendBoostStart();
        }
      }

      if (mode === 'multiplayer' && driverRef.current) {
        let dir: SnakeWormDirection | null = null;
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') dir = 'up';
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') dir = 'down';
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') dir = 'left';
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') dir = 'right';
        if (dir) driverRef.current.sendDirection(dir);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        inputRef.current.isBoosting = false;
        if (mode === 'multiplayer' && driverRef.current) {
          driverRef.current.sendBoostStop();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [mode]);

  // Single-player AI Init
  const initGame = () => {
    if (mode === 'multiplayer') return;

    const state = gameStateRef.current;
    
    const player: Snake = {
      id: 'player',
      head: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 },
      segments: Array(15).fill({ x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 }),
      angle: 0,
      targetAngle: 0,
      color: PLAYER_COLOR,
      speed: BASE_SPEED,
      isPlayer: true,
      dead: false,
      isBoosting: false,
      lengthFloat: 15
    };

    const enemies: Snake[] = Array(12).fill(null).map((_, i) => {
      const x = Math.random() * MAP_WIDTH;
      const y = Math.random() * MAP_HEIGHT;
      return {
        id: `ai-${i}`,
        head: { x, y },
        segments: Array(10 + Math.floor(Math.random() * 20)).fill({ x, y }),
        angle: Math.random() * Math.PI * 2,
        targetAngle: Math.random() * Math.PI * 2,
        color: ENEMY_COLORS[i % ENEMY_COLORS.length],
        speed: BASE_SPEED,
        isPlayer: false,
        dead: false,
        isBoosting: false,
        lengthFloat: 0
      };
    });

    const orbs: Orb[] = Array(300).fill(null).map((_, i) => ({
      id: i,
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
      color: Math.random() > 0.5 ? '#38bdf8' : '#f43f5e',
      value: 1,
      isLoot: false
    }));

    state.snakes = [player, ...enemies];
    state.orbs = orbs;
    state.particles = [];
    state.orbIdCounter = 1000;
    
    setLength(15);
    setKills(0);
    setGameOver(false);
    setRewardClaimed(false);
  };

  useEffect(() => {
    initGame();
  }, [gameOver, mode]);

  // Main Render Loop
  useGameLoop((dt) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // ----------------------------------------------------
    // MULTIPLAYER REAL-TIME SHARED 2000x2000 ARENA RENDER
    // ----------------------------------------------------
    if (mode === 'multiplayer' && multiplayerState) {
      const mpState = multiplayerState;
      const me = mpState.players.find(p => p.seat === mySeat) || mpState.players[0];
      const head = me.body[0] || { x: 1000, y: 1000 };

      // Camera follows local player head inside the 2000x2000 shared world
      const camX = Math.max(0, Math.min(MAP_WIDTH - CANVAS_WIDTH, head.x - CANVAS_WIDTH / 2));
      const camY = Math.max(0, Math.min(MAP_HEIGHT - CANVAS_HEIGHT, head.y - CANVAS_HEIGHT / 2));

      ctx.save();
      ctx.translate(-camX, -camY);

      // Draw Grid Background
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.5)';
      ctx.lineWidth = 1;
      const gridSize = 80;
      for (let x = 0; x <= MAP_WIDTH; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MAP_HEIGHT); ctx.stroke();
      }
      for (let y = 0; y <= MAP_HEIGHT; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MAP_WIDTH, y); ctx.stroke();
      }

      // Draw Outer World Boundary
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 8;
      ctx.strokeRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

      // Draw Shared Food
      for (const food of mpState.food) {
        const color = food.type === 'golden' ? '#f59e0b' : (food.type === 'boost' ? '#06b6d4' : '#10b981');
        const radius = food.type === 'golden' ? 10 : 7;

        ctx.fillStyle = color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = color;
        ctx.beginPath();
        ctx.arc(food.x, food.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Draw Shared Players (P1 Emerald Snake, P2 Blue Worm)
      for (const p of mpState.players) {
        if (p.status === 'eliminated') continue;
        const isMe = p.seat === mySeat;
        const color = p.seat === 0 ? '#10b981' : '#3b82f6';

        // Draw body segments
        for (let i = p.body.length - 1; i >= 0; i--) {
          const seg = p.body[i];
          const segRadius = Math.max(8, 14 - i * 0.1);

          ctx.fillStyle = color;
          if (p.isBoosting) {
            ctx.shadowBlur = 12;
            ctx.shadowColor = color;
          }
          ctx.beginPath();
          ctx.arc(seg.x, seg.y, segRadius, 0, Math.PI * 2);
          ctx.fill();

          if (i % 2 === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.beginPath();
            ctx.arc(seg.x, seg.y, segRadius / 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.shadowBlur = 0;

        // Draw Head & Name Tag
        const pHead = p.body[0];
        ctx.fillStyle = isMe ? '#ffffff' : color;
        ctx.beginPath();
        ctx.arc(pHead.x, pHead.y, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.name, pHead.x, pHead.y - 22);
      }

      ctx.restore();
      return;
    }

    // ----------------------------------------------------
    // SINGLE PLAYER / PRACTICE MODE LOOP
    // ----------------------------------------------------
    if (!gameOver) {
      const state = gameStateRef.current;
      const player = state.snakes.find(s => s.isPlayer);

      if (player && !player.dead) {
        const targetCamX = player.head.x - CANVAS_WIDTH / 2;
        const targetCamY = player.head.y - CANVAS_HEIGHT / 2;
        state.camera.x += (targetCamX - state.camera.x) * 5 * dt;
        state.camera.y += (targetCamY - state.camera.y) * 5 * dt;
        
        state.camera.x = Math.max(0, Math.min(MAP_WIDTH - CANVAS_WIDTH, state.camera.x));
        state.camera.y = Math.max(0, Math.min(MAP_HEIGHT - CANVAS_HEIGHT, state.camera.y));

        const worldMouseX = inputRef.current.mouseX + state.camera.x;
        const worldMouseY = inputRef.current.mouseY + state.camera.y;
        
        const dx = worldMouseX - player.head.x;
        const dy = worldMouseY - player.head.y;
        player.targetAngle = Math.atan2(dy, dx);
        
        player.isBoosting = inputRef.current.isBoosting && player.segments.length > 5;
      }

      for (const snake of state.snakes) {
        if (snake.dead) continue;

        if (!snake.isPlayer) {
          if (Math.random() < 0.02) {
            snake.targetAngle += (Math.random() - 0.5) * Math.PI;
          }
        }

        let diff = snake.targetAngle - snake.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        snake.angle += diff * Math.min(1, 8 * dt);

        const currentSpeed = snake.isBoosting ? 400 : BASE_SPEED;
        snake.head.x += Math.cos(snake.angle) * currentSpeed * dt;
        snake.head.y += Math.sin(snake.angle) * currentSpeed * dt;

        snake.head.x = Math.max(20, Math.min(MAP_WIDTH - 20, snake.head.x));
        snake.head.y = Math.max(20, Math.min(MAP_HEIGHT - 20, snake.head.y));

        let prev = snake.head;
        for (let i = 0; i < snake.segments.length; i++) {
          const seg = snake.segments[i];
          const sdx = prev.x - seg.x;
          const sdy = prev.y - seg.y;
          const dist = Math.hypot(sdx, sdy);
          if (dist > 10) {
            const angle = Math.atan2(sdy, sdx);
            seg.x = prev.x - Math.cos(angle) * 10;
            seg.y = prev.y - Math.sin(angle) * 10;
          }
          prev = seg;
        }

        for (let i = state.orbs.length - 1; i >= 0; i--) {
          const orb = state.orbs[i];
          const odx = orb.x - snake.head.x;
          const ody = orb.y - snake.head.y;
          if (Math.hypot(odx, ody) < 20) {
            state.orbs.splice(i, 1);
            if (snake.isPlayer) {
              setLength(l => l + orb.value);
            }
          }
        }
      }
    }

    // Render Canvas
    ctx.save();
    ctx.translate(-gameStateRef.current.camera.x, -gameStateRef.current.camera.y);

    ctx.strokeStyle = 'rgba(30, 41, 59, 0.5)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= MAP_WIDTH; x += 100) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MAP_HEIGHT); ctx.stroke();
    }
    for (let y = 0; y <= MAP_HEIGHT; y += 100) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MAP_WIDTH, y); ctx.stroke();
    }

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    for (const orb of gameStateRef.current.orbs) {
      ctx.fillStyle = orb.color;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, orb.isLoot ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const snake of gameStateRef.current.snakes) {
      if (snake.dead) continue;
      ctx.fillStyle = snake.color;
      for (const seg of snake.segments) {
        ctx.beginPath();
        ctx.arc(seg.x, seg.y, 10, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(snake.head.x, snake.head.y, 12, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }, !gameOver);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    inputRef.current.mouseX = (e.clientX - rect.left) * scaleX;
    inputRef.current.mouseY = (e.clientY - rect.top) * scaleY;
  };

  const handleMouseDown = () => {
    inputRef.current.isBoosting = true;
    if (mode === 'multiplayer' && driverRef.current) {
      driverRef.current.sendBoostStart();
    }
  };

  const handleMouseUp = () => {
    inputRef.current.isBoosting = false;
    if (mode === 'multiplayer' && driverRef.current) {
      driverRef.current.sendBoostStop();
    }
  };

  const handleRestart = () => {
    if (mode === 'multiplayer') {
      useMultiplayerStore.getState().requestRematch();
      setGameOver(false);
    } else {
      initGame();
    }
  };

  return (
    <GameWrapper title="Snake vs Worms Slither Arena" gameId="snake-vs-worms" mode={mode} stake={stake} onBack={onBack} isFullscreen>
      <div className="flex flex-col lg:flex-row items-center justify-center gap-8 w-full max-w-6xl relative">
        
        {gameOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in rounded-3xl">
            <div className="bg-[#0f172a] border border-rose-500/30 p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm w-full mx-4">
              <div className="text-6xl mb-4">🏆</div>
              <h2 className={`text-4xl font-black uppercase tracking-widest text-center mb-2 ${mpWinner === null ? 'text-amber-400' : (mpWinner === mySeat ? 'text-emerald-400' : 'text-rose-500')}`}>
                {mode === 'multiplayer' ? (mpWinner === null ? 'DRAW MATCH!' : (mpWinner === mySeat ? 'YOU WIN!' : 'OPPONENT WINS!')) : 'GAME OVER'}
              </h2>

              {mode === 'multiplayer' ? (
                <div className="flex gap-4 mt-4 w-full">
                  <button
                    onClick={handleRestart}
                    className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl uppercase tracking-wider"
                  >
                    Rematch
                  </button>
                  <button
                    onClick={onBack}
                    className="flex-1 py-3 bg-slate-600 hover:bg-slate-500 text-white font-bold rounded-xl uppercase tracking-wider"
                  >
                    Leave
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleRestart}
                  className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black text-lg uppercase rounded-xl transition-all shadow-lg shadow-emerald-500/25"
                >
                  Slither Again
                </button>
              )}
            </div>
          </div>
        )}

        <div className="relative group w-full max-w-full lg:max-w-[900px]">
           <canvas
             ref={canvasRef}
             width={CANVAS_WIDTH}
             height={CANVAS_HEIGHT}
             onMouseMove={handleMouseMove}
             onMouseDown={handleMouseDown}
             onMouseUp={handleMouseUp}
             onMouseLeave={handleMouseUp}
             className="rounded-3xl border-4 border-emerald-900 shadow-[0_0_40px_rgba(16,185,129,0.15)] bg-[#020617] w-full h-auto max-h-[85vh] object-contain cursor-crosshair"
           />
        </div>

        <div className="flex flex-col items-center gap-6 glass-panel p-6 rounded-3xl border border-slate-800 w-full max-w-xs shrink-0 shadow-2xl">
          <div className="text-center w-full bg-slate-900/80 p-6 rounded-2xl border border-slate-800 shadow-inner relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent"></div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              {mode === 'multiplayer' && multiplayerState ? (mySeat === 0 ? 'P1 SCORE (SNAKE)' : 'P2 SCORE (WORM)') : 'SCORE'}
            </span>
            <p className="text-5xl font-black text-emerald-400 mt-2 filter drop-shadow-md">
              {mode === 'multiplayer' && multiplayerState ? (multiplayerState.players.find(p => p.seat === mySeat)?.score || 0) : length}
            </p>
          </div>

          <div className="w-full space-y-3 bg-slate-900/40 p-4 rounded-2xl border border-slate-800/50 text-sm text-slate-300">
             <div className="font-bold text-white uppercase text-xs tracking-wider">Controls</div>
             <div><strong className="text-emerald-400">Move:</strong> Arrow Keys or WASD</div>
             <div><strong className="text-cyan-400">Boost:</strong> Hold Spacebar or Mouse Click</div>
             <div><strong className="text-rose-400">Goal:</strong> Collect food and eliminate opponent!</div>
          </div>
        </div>

        {mode === 'multiplayer' && (
          <div className="hidden xl:block flex-shrink-0 self-start">
            <MultiplayerMatchPanel compact />
          </div>
        )}

      </div>
    </GameWrapper>
  );
};
