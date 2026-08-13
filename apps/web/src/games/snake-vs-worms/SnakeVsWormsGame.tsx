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
    if (mode === 'multiplayer' && room && mySeat !== null) {
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

      return () => {
        driver.stop();
        driverRef.current = null;
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
        const isMe = p.seat === mySeat;
        const color = p.seat === 0 ? '#10b981' : '#3b82f6';

        if (p.status === 'eliminated') {
          if (p.body && p.body[0]) {
            const pHead = p.body[0];
            ctx.fillStyle = 'rgba(239, 68, 68, 0.6)';
            ctx.beginPath();
            ctx.arc(pHead.x, pHead.y, 14, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${p.name} (ELIMINATED)`, pHead.x, pHead.y - 20);
          }
          continue;
        }

        // 1. Draw smooth curved body stroke connecting segments
        if (p.body && p.body.length > 1) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 26;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          if (p.isBoosting) {
            ctx.shadowBlur = 16;
            ctx.shadowColor = color;
          }

          ctx.beginPath();
          ctx.moveTo(p.body[0].x, p.body[0].y);

          for (let i = 1; i < p.body.length - 1; i++) {
            const xc = (p.body[i].x + p.body[i + 1].x) / 2;
            const yc = (p.body[i].y + p.body[i + 1].y) / 2;
            ctx.quadraticCurveTo(p.body[i].x, p.body[i].y, xc, yc);
          }
          ctx.lineTo(p.body[p.body.length - 1].x, p.body[p.body.length - 1].y);
          ctx.stroke();
          ctx.shadowBlur = 0;

          // 2. Draw decorative inner scale spots along body
          for (let i = 1; i < p.body.length; i += 2) {
            const seg = p.body[i];
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.beginPath();
            ctx.arc(seg.x, seg.y, 5, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (p.body && p.body[0]) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(p.body[0].x, p.body[0].y, 14, 0, Math.PI * 2);
          ctx.fill();
        }

        // 3. Draw Head & Eyes
        const pHead = p.body[0];
        const pNext = p.body[1] || pHead;
        if (pHead) {
          const headAngle = Math.atan2(pHead.y - pNext.y, pHead.x - pNext.x);

          ctx.save();
          ctx.translate(pHead.x, pHead.y);
          ctx.rotate(headAngle);

          // Head Circle
          ctx.fillStyle = isMe ? '#34d399' : color;
          ctx.beginPath();
          ctx.arc(0, 0, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Eye Sockets & Pupils
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(6, -6, 5, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(6, 6, 5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#0f172a';
          ctx.beginPath(); ctx.arc(8, -6, 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(8, 6, 2.5, 0, Math.PI * 2); ctx.fill();

          ctx.restore();

          // Name Tag
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(p.name, pHead.x, pHead.y - 24);
        }
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

        // Wall boundary collision elimination
        if (snake.head.x <= 10 || snake.head.x >= MAP_WIDTH - 10 || snake.head.y <= 10 || snake.head.y >= MAP_HEIGHT - 10) {
          snake.dead = true;
          for (const seg of snake.segments) {
            state.orbs.push({
              id: state.orbIdCounter++,
              x: seg.x + (Math.random() - 0.5) * 10,
              y: seg.y + (Math.random() - 0.5) * 10,
              color: snake.color,
              value: 2,
              isLoot: true,
            });
          }
          if (snake.isPlayer) {
            setGameOver(true);
          }
          continue;
        }

        // Head-to-Opponent Body & Head-to-Head collision check
        for (const other of state.snakes) {
          if (other === snake || other.dead) continue;

          // Head-to-Head collision
          const headDist = Math.hypot(other.head.x - snake.head.x, other.head.y - snake.head.y);
          if (headDist < 22) {
            if (snake.segments.length < other.segments.length) {
              snake.dead = true;
            } else if (snake.segments.length > other.segments.length) {
              other.dead = true;
              if (snake.isPlayer) setKills(k => k + 1);
            } else {
              snake.dead = true;
              other.dead = true;
            }
            if (snake.isPlayer && snake.dead) setGameOver(true);
            if (other.isPlayer && other.dead) setGameOver(true);
            break;
          }

          // Head-to-Body collision
          const hitsBody = other.segments.some(seg => Math.hypot(seg.x - snake.head.x, seg.y - snake.head.y) < 16);
          if (hitsBody) {
            snake.dead = true;
            for (const seg of snake.segments) {
              state.orbs.push({
                id: state.orbIdCounter++,
                x: seg.x + (Math.random() - 0.5) * 10,
                y: seg.y + (Math.random() - 0.5) * 10,
                color: snake.color,
                value: 2,
                isLoot: true,
              });
            }
            if (other.isPlayer) setKills(k => k + 1);
            if (snake.isPlayer) setGameOver(true);
            break;
          }
        }

        if (snake.dead) continue;

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

        // Orb collection & Physical Growth
        for (let i = state.orbs.length - 1; i >= 0; i--) {
          const orb = state.orbs[i];
          const odx = orb.x - snake.head.x;
          const ody = orb.y - snake.head.y;
          if (Math.hypot(odx, ody) < 22) {
            state.orbs.splice(i, 1);

            // Add segment to tail for physical growth
            const lastSeg = snake.segments[snake.segments.length - 1] || snake.head;
            snake.segments.push({ x: lastSeg.x, y: lastSeg.y });

            if (snake.isPlayer) {
              setLength(l => l + orb.value);
            }

            // Spawn replacement orb so food map remains populated
            state.orbs.push({
              id: state.orbIdCounter++,
              x: Math.random() * MAP_WIDTH,
              y: Math.random() * MAP_HEIGHT,
              color: Math.random() > 0.5 ? '#38bdf8' : '#f43f5e',
              value: 1,
              isLoot: false,
            });
          }
        }
      }

      // Respawn AI snakes that died so arena stays filled
      for (const snake of state.snakes) {
        if (!snake.isPlayer && snake.dead) {
          const rx = Math.random() * (MAP_WIDTH - 100) + 50;
          const ry = Math.random() * (MAP_HEIGHT - 100) + 50;
          snake.head = { x: rx, y: ry };
          snake.segments = Array(10 + Math.floor(Math.random() * 15)).fill({ x: rx, y: ry });
          snake.dead = false;
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

      if (snake.segments && snake.segments.length > 1) {
        ctx.strokeStyle = snake.color;
        ctx.lineWidth = 22;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(snake.segments[0].x, snake.segments[0].y);

        for (let i = 1; i < snake.segments.length - 1; i++) {
          const xc = (snake.segments[i].x + snake.segments[i + 1].x) / 2;
          const yc = (snake.segments[i].y + snake.segments[i + 1].y) / 2;
          ctx.quadraticCurveTo(snake.segments[i].x, snake.segments[i].y, xc, yc);
        }
        ctx.lineTo(snake.segments[snake.segments.length - 1].x, snake.segments[snake.segments.length - 1].y);
        ctx.stroke();
      }

      // Head & Eyes
      const head = snake.head;
      const nextSeg = snake.segments[0] || head;
      const headAngle = Math.atan2(head.y - nextSeg.y, head.x - nextSeg.x);

      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.rotate(headAngle);

      ctx.fillStyle = snake.color;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(5, -5, 4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(5, 5, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); ctx.arc(6.5, -5, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(6.5, 5, 2, 0, Math.PI * 2); ctx.fill();

      ctx.restore();
    }

    ctx.restore();
  }, mode === 'multiplayer' || !gameOver);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    inputRef.current.mouseX = mouseX;
    inputRef.current.mouseY = mouseY;

    if (mode === 'multiplayer' && driverRef.current && multiplayerState) {
      const me = multiplayerState.players.find(p => p.seat === mySeat);
      if (me && me.body && me.body[0]) {
        const head = me.body[0];
        const camX = Math.max(0, Math.min(MAP_WIDTH - CANVAS_WIDTH, head.x - CANVAS_WIDTH / 2));
        const camY = Math.max(0, Math.min(MAP_HEIGHT - CANVAS_HEIGHT, head.y - CANVAS_HEIGHT / 2));
        const worldMouseX = mouseX + camX;
        const worldMouseY = mouseY + camY;

        const dx = worldMouseX - head.x;
        const dy = worldMouseY - head.y;
        if (Math.hypot(dx, dy) > 25) {
          let dir: SnakeWormDirection | null = null;
          if (Math.abs(dx) > Math.abs(dy)) {
            dir = dx > 0 ? 'right' : 'left';
          } else {
            dir = dy > 0 ? 'down' : 'up';
          }
          if (dir) {
            driverRef.current.sendDirection(dir);
          }
        }
      }
    }
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
