import React, { useRef, useEffect, useState } from 'react';
import { GameWrapper } from '../../components/GameWrapper';
import { claimPracticeReward } from '../../services/api/practiceReward';
import { useGameLoop } from '../shared/hooks/useGameLoop';
import { MultiplayerMatchPanel } from '../shared/components/MultiplayerMatchPanel';

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
  lengthFloat: number; // For smooth draining during boost
}

interface Orb {
  id: number;
  x: number;
  y: number;
  color: string;
  value: number;
  isLoot: boolean; // Loot dropped from dead snakes or boost glows more
}

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 600;
const MAP_WIDTH = 2500;
const MAP_HEIGHT = 2500;
const SEGMENT_SPACING = 10;
const BASE_SPEED = 200;
const BOOST_SPEED = 400;
const TURN_SPEED = 8;
const BOOST_DRAIN_RATE = 2.5; // segments lost per second while boosting

const PLAYER_COLOR = '#10b981'; // Emerald
const ENEMY_COLORS = ['#f43f5e', '#a855f7', '#3b82f6', '#f59e0b', '#ec4899', '#06b6d4'];

export const SnakeVsWormsGame: React.FC<SnakeVsWormsProps> = ({ mode, stake, onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [length, setLength] = useState(15);
  const [kills, setKills] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [rewardClaimed, setRewardClaimed] = useState(false);

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

  // Input Listeners for Boost
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') inputRef.current.isBoosting = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') inputRef.current.isBoosting = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Init Game
  const initGame = () => {
    const state = gameStateRef.current;
    
    // Player
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

    // AI Enemies
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

    // Initial Orbs
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
  }, [gameOver]); 

  const spawnOrb = (x: number, y: number, color: string, value: number, isLoot: boolean) => {
    if (!gameStateRef.current) return;
    gameStateRef.current.orbs.push({
      id: gameStateRef.current.orbIdCounter++,
      x,
      y,
      color,
      value,
      isLoot
    });
  };

  const spawnParticles = (x: number, y: number, color: string, count: number, speedMult = 1) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 50 * speedMult;
      gameStateRef.current.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        maxLife: 0.3 + Math.random() * 0.5,
        color
      });
    }
  };

  useGameLoop((dt) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!gameOver) {
      const state = gameStateRef.current;
      const player = state.snakes.find(s => s.isPlayer);

      // 1. Camera Logic (Track Player)
      if (player && !player.dead) {
        // Smooth camera follow
        const targetCamX = player.head.x - CANVAS_WIDTH / 2;
        const targetCamY = player.head.y - CANVAS_HEIGHT / 2;
        state.camera.x += (targetCamX - state.camera.x) * 5 * dt;
        state.camera.y += (targetCamY - state.camera.y) * 5 * dt;
        
        // Clamp Camera
        state.camera.x = Math.max(0, Math.min(MAP_WIDTH - CANVAS_WIDTH, state.camera.x));
        state.camera.y = Math.max(0, Math.min(MAP_HEIGHT - CANVAS_HEIGHT, state.camera.y));

        // Player targeting based on mouse relative to camera
        const worldMouseX = inputRef.current.mouseX + state.camera.x;
        const worldMouseY = inputRef.current.mouseY + state.camera.y;
        
        const dx = worldMouseX - player.head.x;
        const dy = worldMouseY - player.head.y;
        player.targetAngle = Math.atan2(dy, dx);
        
        // Player Boost Logic
        player.isBoosting = inputRef.current.isBoosting && player.segments.length > 5;
      }

      // 2. Snake Movement & Logic
      for (const snake of state.snakes) {
        if (snake.dead) continue;

        // AI behavior
        if (!snake.isPlayer) {
          if (Math.random() < 0.02) {
            snake.targetAngle += (Math.random() - 0.5) * Math.PI;
          }
          
          // Seek Food
          if (Math.random() < 0.05) {
            let closestFood = null;
            let minDist = 300;
            for (const orb of state.orbs) {
               if (orb.isLoot) {
                  const dx = orb.x - snake.head.x;
                  const dy = orb.y - snake.head.y;
                  const dist = Math.sqrt(dx*dx + dy*dy);
                  if (dist < minDist) {
                     minDist = dist;
                     closestFood = orb;
                  }
               }
            }
            if (closestFood) {
               snake.targetAngle = Math.atan2(closestFood.y - snake.head.y, closestFood.x - snake.head.x);
            }
          }

          // Random Boosting
          if (snake.segments.length > 10 && Math.random() < 0.01) {
             snake.isBoosting = true;
          }
          if (snake.isBoosting && Math.random() < 0.05) {
             snake.isBoosting = false;
          }
          if (snake.segments.length <= 5) snake.isBoosting = false;

          // Edge avoidance
          const margin = 100;
          if (snake.head.x < margin || snake.head.x > MAP_WIDTH - margin || 
              snake.head.y < margin || snake.head.y > MAP_HEIGHT - margin) {
            const centerX = MAP_WIDTH / 2;
            const centerY = MAP_HEIGHT / 2;
            snake.targetAngle = Math.atan2(centerY - snake.head.y, centerX - snake.head.x);
          }
        }

        // Apply Boost
        snake.speed = snake.isBoosting ? BOOST_SPEED : BASE_SPEED;

        // Drain length if boosting
        if (snake.isBoosting) {
          snake.lengthFloat -= BOOST_DRAIN_RATE * dt;
          if (snake.lengthFloat <= -1 && snake.segments.length > 5) {
             snake.lengthFloat = 0;
             const tail = snake.segments.pop();
             if (tail) {
                // Drop a tiny orb at the tail
                if (Math.random() > 0.5) {
                   spawnOrb(tail.x, tail.y, snake.color, 0.5, false);
                }
             }
             if (snake.isPlayer) setLength(snake.segments.length);
          }
        }

        // Smooth angle turning
        let diff = snake.targetAngle - snake.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        
        snake.angle += Math.max(-TURN_SPEED * dt, Math.min(TURN_SPEED * dt, diff));

        // Move head
        snake.head.x += Math.cos(snake.angle) * snake.speed * dt;
        snake.head.y += Math.sin(snake.angle) * snake.speed * dt;

        // Bounds checking
        if (snake.head.x < 0) snake.head.x = 0;
        if (snake.head.x > MAP_WIDTH) snake.head.x = MAP_WIDTH;
        if (snake.head.y < 0) snake.head.y = 0;
        if (snake.head.y > MAP_HEIGHT) snake.head.y = MAP_HEIGHT;

        // Inverse kinematic segments
        let prevX = snake.head.x;
        let prevY = snake.head.y;
        
        for (let i = 0; i < snake.segments.length; i++) {
          const seg = snake.segments[i];
          const dx = prevX - seg.x;
          const dy = prevY - seg.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist > SEGMENT_SPACING) {
            const ratio = (dist - SEGMENT_SPACING) / dist;
            seg.x += dx * ratio;
            seg.y += dy * ratio;
          }
          prevX = seg.x;
          prevY = seg.y;
        }

        // Boost Trail Particles
        if (snake.isBoosting && Math.random() > 0.3) {
           const tail = snake.segments[snake.segments.length - 1];
           if (tail) spawnParticles(tail.x, tail.y, snake.color, 1, 0.2);
        }
      }

      // 3. Food Collisions
      for (const snake of state.snakes) {
        if (snake.dead) continue;
        const eatRadius = 25; // generous hit box
        for (let i = state.orbs.length - 1; i >= 0; i--) {
          const orb = state.orbs[i];
          const dx = snake.head.x - orb.x;
          const dy = snake.head.y - orb.y;
          if (Math.sqrt(dx * dx + dy * dy) < eatRadius) { 
            state.orbs.splice(i, 1);
            // Grow
            let growAmount = Math.ceil(orb.value);
            for (let v = 0; v < growAmount; v++) {
              snake.segments.push({ ...snake.segments[snake.segments.length - 1] });
            }
            if (snake.isPlayer) {
              setLength(snake.segments.length);
            }
            
            // Particles
            spawnParticles(orb.x, orb.y, orb.color, 4, 1.5);

            // Respawn normal orbs to maintain density
            if (state.orbs.length < 300) {
              spawnOrb(Math.random() * MAP_WIDTH, Math.random() * MAP_HEIGHT, Math.random() > 0.5 ? '#38bdf8' : '#10b981', 1, false);
            }
          }
        }
      }

      // 4. Snake Collisions (Death)
      for (let i = 0; i < state.snakes.length; i++) {
        const snake1 = state.snakes[i];
        if (snake1.dead) continue;

        for (let j = 0; j < state.snakes.length; j++) {
          if (i === j) continue;
          const snake2 = state.snakes[j];
          if (snake2.dead) continue;

          for (const seg of snake2.segments) {
            const dx = snake1.head.x - seg.x;
            const dy = snake1.head.y - seg.y;
            if (Math.sqrt(dx * dx + dy * dy) < 12) {
              // Snake1 dies
              snake1.dead = true;
              
              // Drop big loot
              for (let k = 0; k < snake1.segments.length; k += 2) {
                spawnOrb(snake1.segments[k].x, snake1.segments[k].y, snake1.color, 3, true);
              }
              spawnParticles(snake1.head.x, snake1.head.y, '#ffffff', 20, 2);

              if (snake1.isPlayer) {
                setGameOver(true);
              } else if (snake2.isPlayer) {
                setKills(k => k + 1);
                
                // Respawn AI elsewhere
                setTimeout(() => {
                  if (gameStateRef.current && !gameOver) {
                     snake1.head = { x: Math.random() * MAP_WIDTH, y: Math.random() * MAP_HEIGHT };
                     snake1.segments = Array(15).fill({ ...snake1.head });
                     snake1.dead = false;
                     snake1.isBoosting = false;
                     snake1.speed = BASE_SPEED;
                  }
                }, 3000);
              }
              break; // exit segment loop
            }
          }
        }
      }

      // Update Particles
      for (let i = state.particles.length - 1; i >= 0; i--) {
         const p = state.particles[i];
         p.x += p.vx * dt;
         p.y += p.vy * dt;
         p.life -= dt;
         if (p.life <= 0) state.particles.splice(i, 1);
      }
    }

    // === DRAW === //
    const state = gameStateRef.current;
    
    ctx.fillStyle = '#020617'; // slate-950
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Translate context by camera
    ctx.translate(-state.camera.x, -state.camera.y);

    // Arena Grid Background
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.05)';
    ctx.lineWidth = 1;
    
    // Only draw grid lines in view
    const startX = Math.floor(state.camera.x / 50) * 50;
    const startY = Math.floor(state.camera.y / 50) * 50;
    
    for (let x = startX; x < state.camera.x + canvas.width; x += 50) {
      if (x < 0 || x > MAP_WIDTH) continue;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, MAP_HEIGHT); ctx.stroke();
    }
    for (let y = startY; y < state.camera.y + canvas.height; y += 50) {
      if (y < 0 || y > MAP_HEIGHT) continue;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(MAP_WIDTH, y); ctx.stroke();
    }

    // Arena Borders
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Draw Orbs
    for (const orb of state.orbs) {
      // Frustum culling
      if (orb.x < state.camera.x - 20 || orb.x > state.camera.x + canvas.width + 20) continue;
      if (orb.y < state.camera.y - 20 || orb.y > state.camera.y + canvas.height + 20) continue;

      ctx.fillStyle = orb.color;
      ctx.beginPath();
      const radius = orb.isLoot ? 6 + Math.sin(Date.now() / 150) * 1.5 : 4;
      ctx.arc(orb.x, orb.y, radius, 0, Math.PI * 2);
      ctx.fill();
      
      if (orb.isLoot) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = orb.color;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Draw Particles
    for (const p of state.particles) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // Draw Snakes (Bodies first)
    for (const snake of state.snakes) {
      if (snake.dead) continue;
      
      // Basic bounding box check
      const minX = Math.min(snake.head.x, ...snake.segments.map(s => s.x));
      const maxX = Math.max(snake.head.x, ...snake.segments.map(s => s.x));
      const minY = Math.min(snake.head.y, ...snake.segments.map(s => s.y));
      const maxY = Math.max(snake.head.y, ...snake.segments.map(s => s.y));
      
      if (maxX < state.camera.x - 50 || minX > state.camera.x + canvas.width + 50 ||
          maxY < state.camera.y - 50 || minY > state.camera.y + canvas.height + 50) {
         continue; // Culled
      }

      ctx.fillStyle = snake.color;
      
      if (snake.isBoosting) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = snake.color;
      }

      for (let i = snake.segments.length - 1; i >= 0; i--) {
        const seg = snake.segments[i];
        const radius = Math.max(5, 12 - (i * 0.1));
        
        ctx.beginPath();
        ctx.arc(seg.x, seg.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Inner highlight pattern
        if (i % 2 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.beginPath(); ctx.arc(seg.x, seg.y, radius / 2, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = snake.color; // reset
        }
      }
      ctx.shadowBlur = 0;

      // Draw Head
      ctx.fillStyle = snake.isPlayer ? '#ffffff' : snake.color;
      ctx.beginPath();
      ctx.arc(snake.head.x, snake.head.y, 14, 0, Math.PI * 2);
      ctx.fill();
      
      // Eyes
      const eyeOffsetX = Math.cos(snake.angle + Math.PI/2) * 6;
      const eyeOffsetY = Math.sin(snake.angle + Math.PI/2) * 6;
      const eyeFwdX = Math.cos(snake.angle) * 5;
      const eyeFwdY = Math.sin(snake.angle) * 5;

      const eyeColor = snake.isBoosting ? '#f43f5e' : '#000000';
      ctx.fillStyle = eyeColor;
      ctx.beginPath(); ctx.arc(snake.head.x + eyeOffsetX + eyeFwdX, snake.head.y + eyeOffsetY + eyeFwdY, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(snake.head.x - eyeOffsetX + eyeFwdX, snake.head.y - eyeOffsetY + eyeFwdY, 3, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();

    // 5. Draw Minimap (HUD)
    const mapSize = 120;
    const mapScale = mapSize / MAP_WIDTH;
    const mapX = canvas.width - mapSize - 20;
    const mapY = canvas.height - mapSize - 20;

    // Minimap bg
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(mapX, mapY, mapSize, mapSize, 8); ctx.fill(); ctx.stroke();

    // Minimap entities
    for (const snake of state.snakes) {
      if (snake.dead) continue;
      const px = mapX + snake.head.x * mapScale;
      const py = mapY + snake.head.y * mapScale;
      
      ctx.fillStyle = snake.isPlayer ? '#10b981' : 'rgba(244, 63, 94, 0.8)';
      ctx.beginPath();
      ctx.arc(px, py, snake.isPlayer ? 3 : 2, 0, Math.PI*2);
      ctx.fill();
    }
    
    // Viewport box on minimap
    const vpx = mapX + state.camera.x * mapScale;
    const vpy = mapY + state.camera.y * mapScale;
    const vpw = canvas.width * mapScale;
    const vph = canvas.height * mapScale;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vpx, vpy, vpw, vph);

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

  const handleMouseDown = () => { inputRef.current.isBoosting = true; };
  const handleMouseUp = () => { inputRef.current.isBoosting = false; };

  const handleRestart = () => {
    initGame();
  };

  return (
    <GameWrapper title="Snake vs Worms Slither Arena" gameId="snake-vs-worms" mode={mode} stake={stake} onBack={onBack} isFullscreen>
      <div className="flex flex-col lg:flex-row items-center justify-center gap-8 w-full max-w-6xl relative">
        
        {gameOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in rounded-3xl">
            <div className="bg-[#0f172a] border border-rose-500/30 p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm w-full mx-4">
              <div className="text-6xl mb-4">💀</div>
              <h2 className="text-4xl font-black uppercase tracking-widest text-center mb-2 text-rose-500">
                WASTED
              </h2>
              <p className="text-slate-300 text-lg text-center mb-6 font-bold">
                Length: {length}m | Eliminations: {kills}
              </p>
              
              {kills >= 3 && (
                <div className="bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 mb-6">
                  🪙 +50 Coins (Assassin Bonus!)
                </div>
              )}

              <button
                onClick={handleRestart}
                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black text-lg uppercase rounded-xl transition-all shadow-lg shadow-emerald-500/25"
              >
                Slither Again
              </button>
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
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">WORM LENGTH</span>
            <p className="text-5xl font-black text-emerald-400 mt-2 filter drop-shadow-md">{length}<span className="text-2xl text-emerald-600">m</span></p>
          </div>
          <div className="text-center w-full bg-slate-900/80 p-6 rounded-2xl border border-slate-800 shadow-inner relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent"></div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">ELIMINATIONS</span>
            <p className="text-5xl font-black text-amber-400 mt-2 filter drop-shadow-md">{kills}</p>
          </div>
          
          <div className="w-full mt-4 space-y-3 bg-slate-900/40 p-4 rounded-2xl border border-slate-800/50">
             <div className="flex items-center gap-3 text-sm font-medium text-slate-300">
               <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">🖱️</div>
               Steer with Mouse
             </div>
             <div className="flex items-center gap-3 text-sm font-medium text-slate-300">
               <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-emerald-700/50 text-emerald-400 text-xs font-bold">LMB</div>
               Hold to Sprint / Boost
             </div>
             <div className="flex items-center gap-3 text-sm font-medium text-slate-300">
               <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-rose-700/50 text-rose-400 font-bold">!</div>
               Trap enemies to win
             </div>
          </div>
        </div>

        {/* Multiplayer Panel */}
        {mode === 'multiplayer' && (
          <div className="hidden xl:block flex-shrink-0 self-start">
            <MultiplayerMatchPanel compact />
          </div>
        )}

      </div>
    </GameWrapper>
  );
};
