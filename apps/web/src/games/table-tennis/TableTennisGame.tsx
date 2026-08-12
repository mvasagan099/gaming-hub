import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameWrapper } from '../../components/GameWrapper';
import { useGameLoop } from '../shared/hooks/useGameLoop';
import { MultiplayerMatchPanel } from '../shared/components/MultiplayerMatchPanel';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import TableTennisMultiplayerDriver from './TableTennisMultiplayerDriver';
import type { TableTennisState, TableTennisBall } from '@gaming-hub/game-engine';

interface TableTennisProps {
  mode: 'ai' | 'multiplayer';
  stake: number;
  onBack: () => void;
}

type GameState = 'waiting' | 'playing' | 'serving' | 'gameover';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 400;
const PADDLE_HEIGHT = 80;

export const TableTennisGame: React.FC<TableTennisProps> = ({ mode, stake, onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  const [gameState, setGameState] = useState<GameState>('serving');
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  const [p1Sets, setP1Sets] = useState(0);
  const [p2Sets, setP2Sets] = useState(0);
  const [winner, setWinner] = useState<1 | 2 | null>(null);
  const [currentServer, setCurrentServer] = useState<1 | 2>(1);
  const [isMatchPoint, setIsMatchPoint] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('connected');
  const [pointAnimation, setPointAnimation] = useState<{ winner: number; reason: string } | null>(null);
  const [remainingTime, setRemainingTime] = useState(180);
  const [endReason, setEndReason] = useState<string | null>(null);
  const matchStartedAtMsRef = useRef<number | null>(null);

  useEffect(() => {
    if (gameState === 'gameover') return;
    const interval = setInterval(() => {
      if (matchStartedAtMsRef.current) {
        const elapsed = Math.max(0, Math.floor((Date.now() - matchStartedAtMsRef.current) / 1000));
        setRemainingTime(Math.max(0, 180 - elapsed));
      }
    }, 500);
    return () => clearInterval(interval);
  }, [gameState]);

  const stateRef = useRef({
    gameState: 'serving' as GameState,
    server: 1 as 1 | 2,
    p1Score: 0,
    p2Score: 0,
    winner: null as 1 | 2 | null,
  });

  const p1Ref = useRef({ y: 160, vy: 0, targetY: 160 });
  const p2Ref = useRef({ y: 160, vy: 0 });
  const p2TargetYRef = useRef(160);
  const ballRef = useRef({ x: 300, y: 200, vx: 0, vy: 0, speed: 5, inPlay: false });
  const trailRef = useRef<{x: number, y: number}[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  
  const keysRef = useRef({ w: false, s: false, up: false, down: false, space: false });
  
  const driverRef = useRef<TableTennisMultiplayerDriver | null>(null);
  const multiplayerInitializedRef = useRef(false);
  
  const mySeat = useMultiplayerStore(s => s.mySeat);
  const room = useMultiplayerStore(s => s.room);
  const gameStateFromStore = useMultiplayerStore(s => s.gameState);
  const winnerFromStore = useMultiplayerStore(s => s.winner);

  useEffect(() => {
    stateRef.current.gameState = gameState;
  }, [gameState]);

  useEffect(() => {
    if (mode === 'multiplayer' && room && !multiplayerInitializedRef.current) {
      const names = room.players.map(p => p.displayName || `Player ${(p.seat ?? 0) + 1}`);
      names.sort((a, b) => {
        const seatA = room.players.find(p => p.displayName === a)?.seat ?? 0;
        const seatB = room.players.find(p => p.displayName === b)?.seat ?? 0;
        return seatA - seatB;
      });
      
      const driver = new TableTennisMultiplayerDriver(mySeat, names);
      driverRef.current = driver;
      
      driver.setOnStateUpdate((state: TableTennisState) => {
        if (!state || !state.players) return;
        
        const p1State = state.players[0];
        const p2State = state.players[1];
        
        if (mySeat === 0) {
          p2Ref.current.y = p2State.paddleY;
          p2Ref.current.vy = p2State.paddleVelocity;
        } else if (mySeat === 1) {
          p1Ref.current.y = p1State.paddleY;
          p1Ref.current.vy = p1State.paddleVelocity;
        }
        
        if (p1State && p2State) {
          setP1Score(p1State.score);
          setP2Score(p2State.score);
          setP1Sets(p1State.setsWon);
          setP2Sets(p2State.setsWon);
          stateRef.current.p1Score = p1State.score;
          stateRef.current.p2Score = p2State.score;
        }
        
        if (state.ball && state.ball.inPlay) {
          ballRef.current = {
            x: state.ball.x,
            y: state.ball.y,
            vx: state.ball.vx,
            vy: state.ball.vy,
            speed: state.ball.speed,
            inPlay: true,
          };
        }
        
        setCurrentServer(state.servingSeat === 0 ? 1 : 2);
        stateRef.current.server = state.servingSeat === 0 ? 1 : 2;
        
        if (state.phase === 'serve' && state.waitingForServe) {
          setGameState('serving');
          stateRef.current.gameState = 'serving';
        } else if (state.phase === 'rally') {
          setGameState('playing');
          stateRef.current.gameState = 'playing';
        } else if (state.phase === 'finished' || state.finished) {
          setGameState('gameover');
          stateRef.current.gameState = 'gameover';
        }
        
        if (state.matchStartedAtMs) {
          matchStartedAtMsRef.current = state.matchStartedAtMs;
        }
        if (state.endReason) {
          setEndReason(state.endReason);
        }
        
        setIsMatchPoint(state.matchPointSeat !== null);
        setConnectionStatus('connected');
      });
      
      driver.setOnPointScored((winnerSeat: number, _reason: string) => {
        spawnParticles(ballRef.current.x, ballRef.current.y, winnerSeat === 0 ? '#f43f5e' : '#3b82f6', 30, 2);
        setPointAnimation({ winner: winnerSeat, reason: _reason });
        setTimeout(() => setPointAnimation(null), 1500);
      });
      
      driver.setOnMatchComplete((winnerSeat: number) => {
        setWinner(winnerSeat === 0 ? 1 : 2);
        setGameState('gameover');
        stateRef.current.winner = winnerSeat === 0 ? 1 : 2;
        stateRef.current.gameState = 'gameover';
      });
      
      driver.start();
      multiplayerInitializedRef.current = true;
      
      driver.sendReady();
      
      return () => {
        driver.stop();
        driverRef.current = null;
        multiplayerInitializedRef.current = false;
      };
    }
  }, [mode, room, mySeat]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode === 'multiplayer') {
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keysRef.current.up = true;
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keysRef.current.down = true;
        if (e.key === ' ') {
          keysRef.current.space = true;
          handleMultiplayerServe();
        }
      } else {
        if (e.key === 'w' || e.key === 'W') keysRef.current.w = true;
        if (e.key === 's' || e.key === 'S') keysRef.current.s = true;
        if (e.key === 'ArrowUp') keysRef.current.up = true;
        if (e.key === 'ArrowDown') keysRef.current.down = true;
        if (e.key === ' ') {
          keysRef.current.space = true;
          handleServe();
        }
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (mode === 'multiplayer') {
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keysRef.current.up = false;
        if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keysRef.current.down = false;
        if (e.key === ' ') keysRef.current.space = false;
      } else {
        if (e.key === 'w' || e.key === 'W') keysRef.current.w = false;
        if (e.key === 's' || e.key === 'S') keysRef.current.s = false;
        if (e.key === 'ArrowUp') keysRef.current.up = false;
        if (e.key === 'ArrowDown') keysRef.current.down = false;
        if (e.key === ' ') keysRef.current.space = false;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [mode]);

  const spawnParticles = useCallback((x: number, y: number, color: string, count: number, speedMult: number = 1) => {
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
  }, []);

  const handleServe = useCallback(() => {
    const state = stateRef.current;
    if (state.gameState === 'serving') {
      state.gameState = 'playing';
      setGameState('playing');
      const ball = ballRef.current;
      ball.speed = 5;
      ball.vx = state.server === 1 ? ball.speed : -ball.speed;
      ball.vy = (Math.random() - 0.5) * 4;
      ball.inPlay = true;
      trailRef.current = [];
    }
  }, []);

  const handleMultiplayerServe = useCallback(() => {
    if (driverRef.current?.canServe()) {
      const angle = (Math.random() - 0.5) * 30;
      driverRef.current.sendServe(angle, 5);
    }
  }, []);

  const handleScore = useCallback((player: 1 | 2) => {
    const state = stateRef.current;
    if (player === 1) state.p1Score++;
    else state.p2Score++;

    setP1Score(state.p1Score);
    setP2Score(state.p2Score);

    spawnParticles(ballRef.current.x, ballRef.current.y, '#facc15', 30, 2);

    if ((state.p1Score >= 11 || state.p2Score >= 11) && Math.abs(state.p1Score - state.p2Score) >= 2) {
      state.gameState = 'gameover';
      state.winner = state.p1Score > state.p2Score ? 1 : 2;
      setGameState('gameover');
      setWinner(state.winner);
    } else {
      const totalPoints = state.p1Score + state.p2Score;
      const isDeuce = state.p1Score >= 10 && state.p2Score >= 10;
      const servesPerTurn = isDeuce ? 1 : 2;
      
      if (totalPoints % servesPerTurn === 0) {
        state.server = state.server === 1 ? 2 : 1;
      }
      
      state.gameState = 'serving';
      setGameState('serving');
      setCurrentServer(state.server);
      ballRef.current.inPlay = false;
    }
  }, [spawnParticles]);

  const resetGame = useCallback(() => {
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
    setCurrentServer(1);
    trailRef.current = [];
    particlesRef.current = [];
    ballRef.current.inPlay = false;
  }, []);

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

    const paddleSpeed = 300 * dt;

    if (mode === 'multiplayer' && driverRef.current) {
      if (mySeat === 0) {
        if (keys.up || keys.w) p1.targetY -= paddleSpeed;
        if (keys.down || keys.s) p1.targetY += paddleSpeed;
        p1.targetY = Math.max(0, Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, p1.targetY));
        p1.y += (p1.targetY - p1.y) * 0.4;
      } else if (mySeat === 1) {
        if (keys.up || keys.w) p2TargetYRef.current -= paddleSpeed;
        if (keys.down || keys.s) p2TargetYRef.current += paddleSpeed;
        p2TargetYRef.current = Math.max(0, Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, p2TargetYRef.current));
        p2.y += (p2TargetYRef.current - p2.y) * 0.4;
      }
      
      const paddleY = mySeat === 0 ? p1.y : p2.y;
      const velocity = mySeat === 0 ? (p1.y - p1.targetY) : (p2.y - p2TargetYRef.current);
      driverRef.current.sendPaddleMove(paddleY, velocity);
      
      if (ball.inPlay) {
        trailRef.current.push({ x: ball.x, y: ball.y });
        if (trailRef.current.length > 10) trailRef.current.shift();
        ball.x += ball.vx * (dt * 60);
        ball.y += ball.vy * (dt * 60);
      }
    } else {
      if (keys.w) p1.targetY -= paddleSpeed;
      if (keys.s) p1.targetY += paddleSpeed;
      p1.y += (p1.targetY - p1.y) * 0.3;
      
      if (state.gameState === 'playing' && ball.inPlay && ball.vx > 0) {
        const targetY = ball.y - 40;
        if (p2.y < targetY - 10) p2.y += paddleSpeed * 0.8;
        else if (p2.y > targetY + 10) p2.y -= paddleSpeed * 0.8;
      } else {
        const centerY = CANVAS_HEIGHT / 2 - 40;
        if (p2.y < centerY - 10) p2.y += paddleSpeed * 0.5;
        else if (p2.y > centerY + 10) p2.y -= paddleSpeed * 0.5;
      }
      
      if (state.server === 2 && state.gameState === 'serving' && Math.random() < 0.02) {
        handleServe();
      }
    }

    p1.y = Math.max(0, Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, p1.y));
    p1.targetY = Math.max(0, Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, p1.targetY));
    p2.y = Math.max(0, Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, p2.y));

    if (state.gameState === 'serving' && mode !== 'multiplayer') {
      if (state.server === 1) {
        ball.x = 40;
        ball.y = p1.y + 40;
      } else {
        ball.x = CANVAS_WIDTH - 40;
        ball.y = p2.y + 40;
      }
    } else if (state.gameState === 'playing' && mode !== 'multiplayer' && ball.inPlay) {
      trailRef.current.push({ x: ball.x, y: ball.y });
      if (trailRef.current.length > 10) trailRef.current.shift();

      ball.x += ball.vx * (dt * 60);
      ball.y += ball.vy * (dt * 60);

      if (ball.y <= 4) {
        ball.y = 4;
        ball.vy *= -1;
        spawnParticles(ball.x, 0, '#ffffff', 5, 0.5);
      }
      if (ball.y >= CANVAS_HEIGHT - 4) {
        ball.y = CANVAS_HEIGHT - 4;
        ball.vy *= -1;
        spawnParticles(ball.x, CANVAS_HEIGHT, '#ffffff', 5, 0.5);
      }

      const ballRadius = 6;
      
      if (ball.vx < 0 && ball.x - ballRadius <= 32 && ball.x + ballRadius >= 20 && ball.y >= p1.y - ballRadius && ball.y <= p1.y + 80 + ballRadius) {
        ball.x = 32 + ballRadius;
        ball.speed = Math.min(ball.speed * 1.05, 12);
        ball.vx = ball.speed;
        
        const hitPos = (ball.y - (p1.y + 40)) / 40;
        ball.vy = hitPos * 5 + ((p1.y - p1.targetY) * 0.01);
        
        spawnParticles(ball.x, ball.y, '#f43f5e', 10);
      }
      
      if (ball.vx > 0 && ball.x + ballRadius >= CANVAS_WIDTH - 32 && ball.x - ballRadius <= CANVAS_WIDTH - 20 && ball.y >= p2.y - ballRadius && ball.y <= p2.y + 80 + ballRadius) {
        ball.x = CANVAS_WIDTH - 32 - ballRadius;
        ball.speed = Math.min(ball.speed * 1.05, 12);
        ball.vx = -ball.speed;
        
        const hitPos = (ball.y - (p2.y + 40)) / 40;
        ball.vy = hitPos * 5;
        
        spawnParticles(ball.x, ball.y, '#3b82f6', 10);
      }

      if (ball.x < -20) handleScore(2);
      if (ball.x > CANVAS_WIDTH + 20) handleScore(1);
    }

    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt;
      if (p.life <= 0) particlesRef.current.splice(i, 1);
    }

    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    grad.addColorStop(0, '#022c22');
    grad.addColorStop(1, '#064e3b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.strokeStyle = 'rgba(16, 185, 129, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < CANVAS_WIDTH; i += 40) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, CANVAS_HEIGHT); ctx.stroke();
    }
    for (let i = 0; i < CANVAS_HEIGHT; i += 40) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(CANVAS_WIDTH, i); ctx.stroke();
    }

    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(CANVAS_WIDTH / 2, 0);
    ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.beginPath();
    ctx.arc(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, 40, 0, Math.PI * 2);
    ctx.stroke();

    particlesRef.current.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    if (trailRef.current.length > 0 && mode !== 'multiplayer') {
      ctx.beginPath();
      ctx.moveTo(trailRef.current[0].x, trailRef.current[0].y);
      for (let i = 1; i < trailRef.current.length; i++) {
        ctx.lineTo(trailRef.current[i].x, trailRef.current[i].y);
      }
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.4)';
      ctx.lineWidth = 6;
      ctx.stroke();
    }

    if (ball.inPlay || mode === 'multiplayer') {
      ctx.fillStyle = '#fef08a';
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

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
    drawPaddle(CANVAS_WIDTH - 32, p2.y, '#3b82f6', '#2563eb');

  }, true);

  const handlePointerMoveY = (clientY: number) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleY = CANVAS_HEIGHT / rect.height;
    const y = (clientY - rect.top) * scaleY - PADDLE_HEIGHT / 2;
    const clampedY = Math.max(0, Math.min(CANVAS_HEIGHT - PADDLE_HEIGHT, y));
    
    if (mode === 'multiplayer') {
      if (mySeat === 0) {
        p1Ref.current.targetY = clampedY;
      } else if (mySeat === 1) {
        p2TargetYRef.current = clampedY;
      }
    } else {
      p1Ref.current.targetY = clampedY;
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    handlePointerMoveY(e.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches[0]) {
      handlePointerMoveY(e.touches[0].clientY);
    }
  };

  const handleCanvasClick = () => {
    if (mode === 'multiplayer') {
      handleMultiplayerServe();
    } else if (gameState === 'serving') {
      handleServe();
    }
  };

  return (
    <GameWrapper title="Table Tennis 3D Pro" gameId="table-tennis" mode={mode} stake={stake} onBack={onBack} isFullscreen>
      <div className="flex flex-col lg:flex-row items-center justify-center gap-8 w-full max-w-5xl">
        
        <div className="relative group w-full max-w-full lg:max-w-[800px]">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            onMouseMove={handleMouseMove}
            onTouchMove={handleTouchMove}
            onClick={handleCanvasClick}
            className="rounded-3xl border-4 border-emerald-500/30 shadow-[0_0_50px_rgba(16,185,129,0.3)] bg-emerald-950 w-full h-auto max-h-[80vh] object-contain cursor-crosshair transition-transform duration-300 group-hover:scale-[1.01]"
          />
          
          {mode === 'multiplayer' && connectionStatus !== 'connected' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-3xl">
              <div className="bg-slate-900/90 px-8 py-4 rounded-2xl border border-yellow-500/30">
                <p className="text-yellow-400 font-bold animate-pulse">
                  {connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Disconnected'}
                </p>
              </div>
            </div>
          )}
          
          {pointAnimation && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-black/60 px-8 py-4 rounded-2xl backdrop-blur-sm border border-emerald-500/30 animate-pulse">
                <p className="text-emerald-400 font-bold text-xl">
                  {pointAnimation.winner === 0 ? 'Player 1' : 'Player 2'} Scored!
                </p>
              </div>
            </div>
          )}
          
          {gameState === 'serving' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-black/60 px-8 py-4 rounded-2xl backdrop-blur-sm animate-pulse border border-emerald-500/30">
                <p className="text-emerald-400 font-bold text-xl tracking-widest">
                  {currentServer === (mySeat === 0 ? 1 : (mySeat === 1 ? 2 : 1)) ? 'YOUR SERVE' : 'OPPONENT SERVING'}
                </p>
                {(mode !== 'multiplayer' || (mode === 'multiplayer' && currentServer === (mySeat === 0 ? 1 : 2))) && (
                  <p className="text-slate-400 text-sm mt-1">Click or press SPACE to serve</p>
                )}
              </div>
            </div>
          )}

          {gameState === 'gameover' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 rounded-3xl backdrop-blur-sm z-10">
              <div className="flex flex-col items-center gap-5 p-8 bg-slate-900/90 rounded-3xl border border-slate-700 shadow-2xl scale-105">
                <h2 className={`text-4xl font-black ${winner === null ? 'text-amber-400' : (winner === (mySeat === 0 ? 1 : 2) ? 'text-emerald-400' : 'text-rose-400')}`}>
                  {winner === null ? 'DRAW MATCH!' : (winner === (mySeat === 0 ? 1 : 2) ? 'YOU WIN!' : 'OPPONENT WINS!')}
                </h2>
                <div className="text-3xl text-white font-black tracking-wider">
                  {p1Score} - {p2Score}
                </div>
                <div className="text-xs font-black text-slate-400 uppercase tracking-widest bg-slate-800 px-4 py-1.5 rounded-full border border-slate-700">
                  Reason: {endReason === "TIME_EXPIRED" ? "TIME EXPIRED" : "SCORE LIMIT REACHED"}
                </div>
                {mode === 'ai' && (
                  <button 
                    onClick={resetGame}
                    className="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-full transition-colors uppercase tracking-wider mt-2"
                  >
                    Play Again
                  </button>
                )}
                {mode === 'multiplayer' && (
                  <div className="flex gap-4 mt-2">
                    <button 
                      onClick={() => useMultiplayerStore.getState().requestRematch()}
                      className="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-full transition-colors uppercase tracking-wider"
                    >
                      Rematch
                    </button>
                    <button 
                      onClick={onBack}
                      className="px-8 py-3 bg-slate-600 hover:bg-slate-500 text-white font-bold rounded-full transition-colors uppercase tracking-wider"
                    >
                      Leave
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6 w-full max-w-xs">
          <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col items-center shadow-xl">
            <span className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Match Timer</span>
            <div className={`px-4 py-1.5 rounded-full border mb-4 font-mono font-black text-2xl tracking-wider transition-all ${remainingTime <= 30 ? 'bg-red-500/20 border-red-500/50 text-red-400 animate-pulse' : 'bg-slate-900/60 border-slate-700 text-emerald-400'}`}>
              {Math.floor(remainingTime / 60).toString().padStart(2, '0')}:{(remainingTime % 60).toString().padStart(2, '0')}
            </div>

            <span className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Match Score</span>
            <div className="flex items-center gap-6 text-5xl font-black">
              <div className={`flex flex-col items-center ${currentServer === 1 ? 'scale-110 opacity-100' : 'opacity-70'} transition-all`}>
                <span className="text-rose-500">{p1Score}</span>
                {currentServer === 1 && <div className="w-2 h-2 rounded-full bg-rose-500 mt-2 animate-bounce"/>}
              </div>
              <span className="text-slate-600 mb-4">-</span>
              <div className={`flex flex-col items-center ${currentServer === 2 ? 'scale-110 opacity-100' : 'opacity-70'} transition-all`}>
                <span className="text-blue-500">{p2Score}</span>
                {currentServer === 2 && <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 animate-bounce"/>}
              </div>
            </div>
            {isMatchPoint && (
              <div className="mt-3 px-4 py-1 bg-yellow-500/20 border border-yellow-500/40 rounded-full">
                <span className="text-yellow-400 font-bold text-sm animate-pulse">MATCH POINT!</span>
              </div>
            )}
          </div>

          <div className="glass-panel p-6 rounded-3xl border border-slate-800 text-sm text-slate-400">
            <h3 className="text-white font-bold mb-3 uppercase tracking-wider text-xs">Controls</h3>
            <ul className="space-y-2">
              <li><strong className="text-rose-400">Player 1:</strong> Mouse or W/S</li>
              {mode === 'multiplayer' && <li><strong className="text-blue-400">Player 2:</strong> Up/Down Arrows or W/S</li>}
              {mode === 'ai' && <li><strong className="text-blue-400">AI:</strong> Automatic</li>}
              <li><strong className="text-emerald-400">Serve:</strong> Spacebar or Click</li>
            </ul>
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
