import React, { useRef, useEffect, useState } from 'react';
import { GameWrapper } from '../../components/GameWrapper';
import { useGameLoop } from '../shared/hooks/useGameLoop';

interface TableTennisProps {
  mode: 'ai' | 'multiplayer';
  stake: number;
  onBack: () => void;
}

type GameState = 'playing' | 'serving' | 'gameover';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

export const TableTennisGame: React.FC<TableTennisProps> = ({ mode, stake, onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // React State for UI
  const [gameState, setGameState] = useState<GameState>('serving');
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  const [winner, setWinner] = useState<1 | 2 | null>(null);

  // Mutable Game State for Loop (avoids re-renders)
  const stateRef = useRef({
    gameState: 'serving' as GameState,
    server: 1 as 1 | 2,
    p1Score: 0,
    p2Score: 0,
    winner: null as 1 | 2 | null
  });

  const p1Ref = useRef({ y: 160, vy: 0, targetY: 160 });
  const p2Ref = useRef({ y: 160, vy: 0 });
  const ballRef = useRef({ x: 300, y: 200, vx: 0, vy: 0, speed: 5 });
  const trailRef = useRef<{x: number, y: number}[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  
  const keysRef = useRef({ w: false, s: false, up: false, down: false, space: false });

  // Sync React state to refs and vice-versa
  useEffect(() => {
    stateRef.current.gameState = gameState;
  }, [gameState]);

  // Input Handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'w' || e.key === 'W') keysRef.current.w = true;
      if (e.key === 's' || e.key === 'S') keysRef.current.s = true;
      if (e.key === 'ArrowUp') keysRef.current.up = true;
      if (e.key === 'ArrowDown') keysRef.current.down = true;
      if (e.key === ' ') {
        keysRef.current.space = true;
        handleServe();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'w' || e.key === 'W') keysRef.current.w = false;
      if (e.key === 's' || e.key === 'S') keysRef.current.s = false;
      if (e.key === 'ArrowUp') keysRef.current.up = false;
      if (e.key === 'ArrowDown') keysRef.current.down = false;
      if (e.key === ' ') keysRef.current.space = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const spawnParticles = (x: number, y: number, color: string, count: number, speedMult: number = 1) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 * speedMult;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        maxLife: 0.5 + Math.random() * 0.5,
        color
      });
    }
  };

  const handleServe = () => {
    const state = stateRef.current;
    if (state.gameState === 'serving') {
      state.gameState = 'playing';
      setGameState('playing');
      const ball = ballRef.current;
      ball.speed = 5;
      ball.vx = state.server === 1 ? ball.speed : -ball.speed;
      ball.vy = (Math.random() - 0.5) * 4;
      trailRef.current = [];
    }
  };

  const handleScore = (player: 1 | 2) => {
    const state = stateRef.current;
    if (player === 1) state.p1Score++;
    else state.p2Score++;

    setP1Score(state.p1Score);
    setP2Score(state.p2Score);

    spawnParticles(ballRef.current.x, ballRef.current.y, '#facc15', 30, 2); // Explosion

    // Check Win Condition (first to 11, win by 2)
    if ((state.p1Score >= 11 || state.p2Score >= 11) && Math.abs(state.p1Score - state.p2Score) >= 2) {
      state.gameState = 'gameover';
      state.winner = state.p1Score > state.p2Score ? 1 : 2;
      setGameState('gameover');
      setWinner(state.winner);
    } else {
      // Switch server every 2 points (or every point after 10-10)
      const totalPoints = state.p1Score + state.p2Score;
      const isDeuce = state.p1Score >= 10 && state.p2Score >= 10;
      const servesPerTurn = isDeuce ? 1 : 2;
      
      if (totalPoints % servesPerTurn === 0) {
        state.server = state.server === 1 ? 2 : 1;
      }
      
      state.gameState = 'serving';
      setGameState('serving');
    }
  };

  const resetGame = () => {
    const state = stateRef.current;
    state.p1Score = 0;
    state.p2Score = 0;
    state.server = 1;
    state.winner = null;
    state.gameState = 'serving';
    setP1Score(0);
    setP2Score(0);
    setWinner(null);
    setGameState('serving');
    trailRef.current = [];
    particlesRef.current = [];
  };

  useGameLoop((dt) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = stateRef.current;
    const ball = ballRef.current;
    const p1 = p1Ref.current;
    const p2 = p2Ref.current;
    const keys = keysRef.current;

    // Movement speeds
    const paddleSpeed = 300 * dt;
    const p1PrevY = p1.y;
    const p2PrevY = p2.y;

    // Player 1 Movement (Mouse or W/S)
    if (keys.w) p1.targetY -= paddleSpeed;
    if (keys.s) p1.targetY += paddleSpeed;
    p1.y += (p1.targetY - p1.y) * 0.3; // Smooth mouse/keyboard following
    
    // Player 2 Movement (AI or Up/Down)
    if (mode === 'multiplayer') {
      if (keys.up) p2.y -= paddleSpeed;
      if (keys.down) p2.y += paddleSpeed;
    } else {
      // AI
      if (state.gameState === 'playing' && ball.vx > 0) {
        // Predict interception point roughly (adds delay/imperfection)
        const targetY = ball.y - 40;
        if (p2.y < targetY - 10) p2.y += paddleSpeed * 0.8; // slightly slower than player to make it beatable
        else if (p2.y > targetY + 10) p2.y -= paddleSpeed * 0.8;
      } else {
        // Return to center
        const centerY = canvas.height / 2 - 40;
        if (p2.y < centerY - 10) p2.y += paddleSpeed * 0.5;
        else if (p2.y > centerY + 10) p2.y -= paddleSpeed * 0.5;
      }
    }

    // Clamp Paddles
    p1.y = Math.max(0, Math.min(canvas.height - 80, p1.y));
    p1.targetY = Math.max(0, Math.min(canvas.height - 80, p1.targetY));
    p2.y = Math.max(0, Math.min(canvas.height - 80, p2.y));

    // Calculate Paddle Velocities (for spin/smash)
    p1.vy = (p1.y - p1PrevY) / dt;
    p2.vy = (p2.y - p2PrevY) / dt;

    if (state.gameState === 'serving') {
      // Attach ball to server's paddle
      if (state.server === 1) {
        ball.x = 40;
        ball.y = p1.y + 40;
      } else {
        ball.x = canvas.width - 40;
        ball.y = p2.y + 40;
      }
      // AI auto-serves after a short delay (simulated by random chance here)
      if (state.server === 2 && mode === 'ai' && Math.random() < 0.02) {
        handleServe();
      }
    } else if (state.gameState === 'playing') {
      // Trail
      trailRef.current.push({ x: ball.x, y: ball.y });
      if (trailRef.current.length > 10) trailRef.current.shift();

      // Ball Update
      ball.x += ball.vx * (dt * 60);
      ball.y += ball.vy * (dt * 60);

      // Wall Bounces
      if (ball.y <= 4) {
        ball.y = 4;
        ball.vy *= -1;
        spawnParticles(ball.x, 0, '#ffffff', 5, 0.5);
      }
      if (ball.y >= canvas.height - 4) {
        ball.y = canvas.height - 4;
        ball.vy *= -1;
        spawnParticles(ball.x, canvas.height, '#ffffff', 5, 0.5);
      }

      // Paddle Collisions
      const ballRadius = 6;
      
      // P1 Hit
      if (ball.vx < 0 && ball.x - ballRadius <= 32 && ball.x + ballRadius >= 20 && ball.y >= p1.y - ballRadius && ball.y <= p1.y + 80 + ballRadius) {
        ball.x = 32 + ballRadius;
        ball.speed = Math.min(ball.speed * 1.05, 12);
        ball.vx = ball.speed;
        
        // Spin & Smash
        const hitPos = (ball.y - (p1.y + 40)) / 40; // -1 to 1
        ball.vy = hitPos * 5 + (p1.vy * 0.01); // Transfer some paddle velocity
        
        spawnParticles(ball.x, ball.y, '#f43f5e', 10);
      }
      
      // P2 Hit
      if (ball.vx > 0 && ball.x + ballRadius >= canvas.width - 32 && ball.x - ballRadius <= canvas.width - 20 && ball.y >= p2.y - ballRadius && ball.y <= p2.y + 80 + ballRadius) {
        ball.x = canvas.width - 32 - ballRadius;
        ball.speed = Math.min(ball.speed * 1.05, 12);
        ball.vx = -ball.speed;
        
        const hitPos = (ball.y - (p2.y + 40)) / 40;
        ball.vy = hitPos * 5 + (p2.vy * 0.01);

        spawnParticles(ball.x, ball.y, '#3b82f6', 10);
      }

      // Scoring
      if (ball.x < -20) handleScore(2);
      if (ball.x > canvas.width + 20) handleScore(1);
    }

    // Update Particles
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt;
      if (p.life <= 0) particlesRef.current.splice(i, 1);
    }

    // === RENDER === //
    
    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#022c22');
    grad.addColorStop(1, '#064e3b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid lines for 3D feel
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 40) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 40) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
    }

    // Net
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Center circle
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 40, 0, Math.PI * 2);
    ctx.stroke();

    // Draw Particles
    particlesRef.current.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    // Trail
    if (trailRef.current.length > 0) {
      ctx.beginPath();
      ctx.moveTo(trailRef.current[0].x, trailRef.current[0].y);
      for (let i = 1; i < trailRef.current.length; i++) {
        ctx.lineTo(trailRef.current[i].x, trailRef.current[i].y);
      }
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.4)';
      ctx.lineWidth = 6;
      ctx.stroke();
    }

    // Ball
    ctx.fillStyle = '#fef08a';
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Paddles
    const drawPaddle = (x: number, y: number, color: string, glow: string) => {
      ctx.fillStyle = color;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.roundRect(x, y, 12, 80, 6);
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    drawPaddle(20, p1.y, '#f43f5e', '#e11d48');
    drawPaddle(canvas.width - 32, p2.y, '#3b82f6', '#2563eb');

  }, true);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleY = canvas.height / rect.height;
    let y = (e.clientY - rect.top) * scaleY;
    
    // Center paddle on mouse
    p1Ref.current.targetY = y - 40;
  };

  const handleCanvasClick = () => {
    if (gameState === 'serving') handleServe();
  };

  return (
    <GameWrapper title="Table Tennis 3D Pro" gameId="table-tennis" mode={mode} stake={stake} onBack={onBack} isFullscreen>
      <div className="flex flex-col lg:flex-row items-center justify-center gap-8 w-full max-w-5xl">
        
        {/* Game Canvas Container */}
        <div className="relative group w-full max-w-full lg:max-w-[800px]">
          <canvas
            ref={canvasRef}
            width={600}
            height={400}
            onMouseMove={handleMouseMove}
            onClick={handleCanvasClick}
            className="rounded-3xl border-4 border-emerald-500/30 shadow-[0_0_50px_rgba(16,185,129,0.3)] bg-emerald-950 w-full h-auto max-h-[80vh] object-contain cursor-crosshair transition-transform duration-300 group-hover:scale-[1.01]"
          />
          
          {/* Overlays */}
          {gameState === 'serving' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-black/60 px-8 py-4 rounded-2xl backdrop-blur-sm animate-pulse border border-emerald-500/30">
                <p className="text-emerald-400 font-bold text-xl tracking-widest">
                  {stateRef.current.server === 1 ? 'YOUR SERVE' : 'OPPONENT SERVING'}
                </p>
                {stateRef.current.server === 1 && (
                  <p className="text-slate-400 text-sm mt-1">Click or press SPACE to serve</p>
                )}
              </div>
            </div>
          )}

          {gameState === 'gameover' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 rounded-3xl backdrop-blur-sm z-10">
              <div className="flex flex-col items-center gap-6 p-8 bg-slate-900/80 rounded-3xl border border-slate-700 shadow-2xl scale-110">
                <h2 className={`text-5xl font-black ${winner === 1 ? 'text-rose-400' : 'text-blue-400'}`}>
                  {winner === 1 ? 'PLAYER 1 WINS!' : (mode === 'ai' ? 'AI WINS!' : 'PLAYER 2 WINS!')}
                </h2>
                <div className="text-2xl text-slate-300 font-bold mb-4">
                  {p1Score} - {p2Score}
                </div>
                <button 
                  onClick={resetGame}
                  className="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-full transition-colors uppercase tracking-wider"
                >
                  Play Again
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Score Board UI */}
        <div className="flex flex-col gap-6 w-full max-w-xs">
          <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col items-center shadow-xl">
            <span className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Match Score</span>
            <div className="flex items-center gap-6 text-5xl font-black">
              <div className={`flex flex-col items-center ${stateRef.current.server === 1 ? 'scale-110 opacity-100' : 'opacity-70'} transition-all`}>
                <span className="text-rose-500">{p1Score}</span>
                {stateRef.current.server === 1 && <div className="w-2 h-2 rounded-full bg-rose-500 mt-2 animate-bounce"/>}
              </div>
              <span className="text-slate-600 mb-4">-</span>
              <div className={`flex flex-col items-center ${stateRef.current.server === 2 ? 'scale-110 opacity-100' : 'opacity-70'} transition-all`}>
                <span className="text-blue-500">{p2Score}</span>
                {stateRef.current.server === 2 && <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 animate-bounce"/>}
              </div>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-3xl border border-slate-800 text-sm text-slate-400">
            <h3 className="text-white font-bold mb-3 uppercase tracking-wider text-xs">Controls</h3>
            <ul className="space-y-2">
              <li><strong className="text-rose-400">Player 1:</strong> Mouse or W/S</li>
              {mode === 'multiplayer' && <li><strong className="text-blue-400">Player 2:</strong> Up/Down Arrows</li>}
              <li><strong className="text-emerald-400">Serve:</strong> Spacebar or Click</li>
            </ul>
          </div>
        </div>

      </div>
    </GameWrapper>
  );
};
