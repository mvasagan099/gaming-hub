import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameWrapper } from '../../components/GameWrapper';
import { useGameLoop } from '../shared/hooks/useGameLoop';
import { MultiplayerMatchPanel } from '../shared/components/MultiplayerMatchPanel';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import { claimPracticeReward } from '../../services/api/practiceReward';
import TableTennisMultiplayerDriver from './TableTennisMultiplayerDriver';
import type { TableTennisState } from '@gaming-hub/game-engine';
import { TABLE_TENNIS_VISUAL_CONFIG, type CameraState } from './constants/tableTennisVisualConfig';
import { TableTennis3DRenderer } from './utils/tableTennis3DRenderer';
import { TableTennisOverlays } from './components/TableTennisOverlays';
import { Timer } from 'lucide-react';

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

const CANVAS_WIDTH = TABLE_TENNIS_VISUAL_CONFIG.canvasWidth; // 800
const CANVAS_HEIGHT = TABLE_TENNIS_VISUAL_CONFIG.canvasHeight; // 520
const LOGICAL_WIDTH = TABLE_TENNIS_VISUAL_CONFIG.logicalWidth; // 600
const LOGICAL_HEIGHT = TABLE_TENNIS_VISUAL_CONFIG.logicalHeight; // 400
const PADDLE_HEIGHT = TABLE_TENNIS_VISUAL_CONFIG.paddleHeight; // 80

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
  const [isDeuce, setIsDeuce] = useState(false);
  const [, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('connected');
  const [pointAnimation, setPointAnimation] = useState<{ winner: number; reason: string } | null>(null);
  const [remainingTime, setRemainingTime] = useState(180);
  const [endReason, setEndReason] = useState<string | null>(null);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [rallyCount, setRallyCount] = useState(0);
  const rallyCountRef = useRef(0);
  const matchStartedAtMsRef = useRef<number | null>(null);

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
  const trailRef = useRef<Array<{ x: number; y: number }>>([]);
  const particlesRef = useRef<Particle[]>([]);
  const keysRef = useRef({ w: false, s: false, up: false, down: false, space: false });

  const driverRef = useRef<TableTennisMultiplayerDriver | null>(null);
  const multiplayerInitializedRef = useRef(false);

  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const room = useMultiplayerStore((s) => s.room);

  // Derive player names
  const p1Name = mode === 'multiplayer'
    ? (room?.players?.find((p) => p.seat === 0)?.displayName || 'Player 1')
    : 'You';
  const p2Name = mode === 'multiplayer'
    ? (room?.players?.find((p) => p.seat === 1)?.displayName || 'Player 2')
    : 'AI Master';

  // Match Timer Countdown
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

  useEffect(() => {
    stateRef.current.gameState = gameState;
  }, [gameState]);

  const spawnParticles = useCallback((x: number, y: number, color: string, count = 12, speedMult = 1) => {
    const proj = TableTennis3DRenderer.project(x, y, 10);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 * speedMult;
      particlesRef.current.push({
        x: proj.x,
        y: proj.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.45,
        maxLife: 0.45,
        color,
      });
    }
  }, []);

  // Multiplayer Driver Lifecycle
  useEffect(() => {
    if (mode === 'multiplayer' && room && !multiplayerInitializedRef.current) {
      const names = room.players.map((p) => p.displayName || `Player ${(p.seat ?? 0) + 1}`);
      names.sort((a, b) => {
        const seatA = room.players.find((p) => p.displayName === a)?.seat ?? 0;
        const seatB = room.players.find((p) => p.displayName === b)?.seat ?? 0;
        return seatA - seatB;
      });

      const driver = new TableTennisMultiplayerDriver(mySeat, names);
      driverRef.current = driver;

      driver.setOnStateUpdate((state: TableTennisState) => {
        if (!state || !state.players) return;

        const p1State = state.players[0];
        const p2State = state.players[1];

        if (mySeat === 0 && p2State) {
          p2Ref.current.y = p2State.paddleY;
          p2Ref.current.vy = p2State.paddleVelocity;
        } else if (mySeat === 1 && p1State) {
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

        if (typeof state.rallyCount === 'number') {
          rallyCountRef.current = state.rallyCount;
          setRallyCount(state.rallyCount);
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
        setIsDeuce(!!state.deuce);
        setConnectionStatus('connected');
      });

      driver.setOnPointScored((winnerSeat: number, reason: string) => {
        spawnParticles(ballRef.current.x, ballRef.current.y, winnerSeat === 0 ? '#f43f5e' : '#3b82f6', 20, 1.5);
        setPointAnimation({ winner: winnerSeat, reason });
        setTimeout(() => setPointAnimation(null), 1400);
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
  }, [mode, room, mySeat, spawnParticles]);

  // Keyboard Handlers (Left/Right & Up/Down support)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode === 'multiplayer') {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
          keysRef.current.up = true;
        }
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' || e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
          keysRef.current.down = true;
        }
        if (e.key === ' ') {
          keysRef.current.space = true;
          handleMultiplayerServe();
        }
      } else {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' || e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
          keysRef.current.w = true;
        }
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' || e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
          keysRef.current.s = true;
        }
        if (e.key === ' ') {
          keysRef.current.space = true;
          handleServe();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (mode === 'multiplayer') {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
          keysRef.current.up = false;
        }
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' || e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
          keysRef.current.down = false;
        }
        if (e.key === ' ') keysRef.current.space = false;
      } else {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' || e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
          keysRef.current.w = false;
        }
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' || e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
          keysRef.current.s = false;
        }
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

  const handleServe = useCallback(() => {
    const state = stateRef.current;
    if (state.gameState === 'serving') {
      state.gameState = 'playing';
      setGameState('playing');
      const ball = ballRef.current;
      ball.speed = 5.5;
      ball.vx = state.server === 1 ? ball.speed : -ball.speed;
      ball.vy = (Math.random() - 0.5) * 4;
      ball.inPlay = true;
      trailRef.current = [];
      rallyCountRef.current = 0;
      setRallyCount(0);
    }
  }, []);

  const handleMultiplayerServe = useCallback(() => {
    if (driverRef.current?.canServe()) {
      const angle = (Math.random() - 0.5) * 30;
      driverRef.current.sendServe(angle, 5.5);
    }
  }, []);

  const handleScore = useCallback((player: 1 | 2) => {
    const state = stateRef.current;
    if (player === 1) state.p1Score++;
    else state.p2Score++;

    setP1Score(state.p1Score);
    setP2Score(state.p2Score);
    rallyCountRef.current = 0;
    setRallyCount(0);

    spawnParticles(ballRef.current.x, ballRef.current.y, '#facc15', 24, 2);

    if ((state.p1Score >= 11 || state.p2Score >= 11) && Math.abs(state.p1Score - state.p2Score) >= 2) {
      state.gameState = 'gameover';
      state.winner = state.p1Score > state.p2Score ? 1 : 2;
      setGameState('gameover');
      setWinner(state.winner);
    } else {
      const totalPoints = state.p1Score + state.p2Score;
      const isD = state.p1Score >= 10 && state.p2Score >= 10;
      const servesPerTurn = isD ? 1 : 2;

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
    rallyCountRef.current = 0;
    setRallyCount(0);
    setRewardClaimed(false);
  }, []);

  // Practice Reward Claim
  useEffect(() => {
    if (winner === 1 && !rewardClaimed && mode !== 'multiplayer') {
      void claimPracticeReward('table-tennis');
      setRewardClaimed(true);
    }
  }, [winner, rewardClaimed, mode]);

  // ─── 60 FPS Game Loop ───────────────────────────────────────────────────────
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

    const paddleSpeed = 340 * dt;

    if (mode === 'multiplayer' && driverRef.current) {
      if (mySeat === 0) {
        if (keys.up || keys.w) p1.targetY -= paddleSpeed;
        if (keys.down || keys.s) p1.targetY += paddleSpeed;
        p1.targetY = Math.max(0, Math.min(LOGICAL_HEIGHT - PADDLE_HEIGHT, p1.targetY));
        p1.vy = (p1.targetY - p1.y);
        p1.y += (p1.targetY - p1.y) * 0.4;
      } else if (mySeat === 1) {
        if (keys.up || keys.w) p2TargetYRef.current -= paddleSpeed;
        if (keys.down || keys.s) p2TargetYRef.current += paddleSpeed;
        p2TargetYRef.current = Math.max(0, Math.min(LOGICAL_HEIGHT - PADDLE_HEIGHT, p2TargetYRef.current));
        p2.vy = (p2TargetYRef.current - p2.y);
        p2.y += (p2TargetYRef.current - p2.y) * 0.4;
      }

      const paddleY = mySeat === 0 ? p1.y : p2.y;
      const velocity = mySeat === 0 ? p1.vy : p2.vy;
      driverRef.current.sendPaddleMove(paddleY, velocity);

      if (ball.inPlay) {
        trailRef.current.push({ x: ball.x, y: ball.y });
        if (trailRef.current.length > 8) trailRef.current.shift();
        ball.x += ball.vx * (dt * 60);
        ball.y += ball.vy * (dt * 60);
      }
    } else {
      // Single Player / AI Mode
      if (keys.w) p1.targetY -= paddleSpeed;
      if (keys.s) p1.targetY += paddleSpeed;
      p1.vy = (p1.targetY - p1.y);
      p1.y += (p1.targetY - p1.y) * 0.35;

      if (state.gameState === 'playing' && ball.inPlay && ball.vx > 0) {
        const targetY = ball.y - 40;
        if (p2.y < targetY - 10) p2.y += paddleSpeed * 0.85;
        else if (p2.y > targetY + 10) p2.y -= paddleSpeed * 0.85;
      } else {
        const centerY = LOGICAL_HEIGHT / 2 - 40;
        if (p2.y < centerY - 10) p2.y += paddleSpeed * 0.5;
        else if (p2.y > centerY + 10) p2.y -= paddleSpeed * 0.5;
      }

      if (state.server === 2 && state.gameState === 'serving' && Math.random() < 0.02) {
        handleServe();
      }
    }

    p1.y = Math.max(0, Math.min(LOGICAL_HEIGHT - PADDLE_HEIGHT, p1.y));
    p1.targetY = Math.max(0, Math.min(LOGICAL_HEIGHT - PADDLE_HEIGHT, p1.targetY));
    p2.y = Math.max(0, Math.min(LOGICAL_HEIGHT - PADDLE_HEIGHT, p2.y));

    if (state.gameState === 'serving' && mode !== 'multiplayer') {
      if (state.server === 1) {
        ball.x = 44;
        ball.y = p1.y + 40;
      } else {
        ball.x = LOGICAL_WIDTH - 44;
        ball.y = p2.y + 40;
      }
    } else if (state.gameState === 'playing' && mode !== 'multiplayer' && ball.inPlay) {
      trailRef.current.push({ x: ball.x, y: ball.y });
      if (trailRef.current.length > 8) trailRef.current.shift();

      ball.x += ball.vx * (dt * 60);
      ball.y += ball.vy * (dt * 60);

      // Top and Bottom table boundary cushions
      if (ball.y <= 6) {
        ball.y = 6;
        ball.vy *= -1;
        spawnParticles(ball.x, 0, '#ffffff', 4, 0.5);
      }
      if (ball.y >= LOGICAL_HEIGHT - 6) {
        ball.y = LOGICAL_HEIGHT - 6;
        ball.vy *= -1;
        spawnParticles(ball.x, LOGICAL_HEIGHT, '#ffffff', 4, 0.5);
      }

      const ballRadius = 6;

      // P1 Paddle Collision
      if (ball.vx < 0 && ball.x - ballRadius <= 36 && ball.x + ballRadius >= 20 && ball.y >= p1.y - ballRadius && ball.y <= p1.y + 80 + ballRadius) {
        ball.x = 36 + ballRadius;
        ball.speed = Math.min(ball.speed * 1.05, 12.5);
        ball.vx = ball.speed;

        const hitPos = (ball.y - (p1.y + 40)) / 40;
        ball.vy = hitPos * 5.2 + (p1.vy * 0.02);
        spawnParticles(ball.x, ball.y, '#f43f5e', 10);
        rallyCountRef.current++;
        setRallyCount(rallyCountRef.current);
      }

      // P2 Paddle Collision
      if (ball.vx > 0 && ball.x + ballRadius >= LOGICAL_WIDTH - 36 && ball.x - ballRadius <= LOGICAL_WIDTH - 20 && ball.y >= p2.y - ballRadius && ball.y <= p2.y + 80 + ballRadius) {
        ball.x = LOGICAL_WIDTH - 36 - ballRadius;
        ball.speed = Math.min(ball.speed * 1.05, 12.5);
        ball.vx = -ball.speed;

        const hitPos = (ball.y - (p2.y + 40)) / 40;
        ball.vy = hitPos * 5.2;
        spawnParticles(ball.x, ball.y, '#3b82f6', 10);
        rallyCountRef.current++;
        setRallyCount(rallyCountRef.current);
      }

      if (ball.x < -20) handleScore(2);
      if (ball.x > LOGICAL_WIDTH + 20) handleScore(1);
    }

    // Particle decay
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i]!;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt;
      if (p.life <= 0) particlesRef.current.splice(i, 1);
    }

    // Determine Dynamic Camera State
    let cameraState: CameraState = 'RALLY';
    if (state.gameState === 'gameover') {
      cameraState = 'MATCH_END';
    } else if (pointAnimation !== null) {
      cameraState = 'POINT_END';
    } else if (state.gameState === 'serving') {
      cameraState = 'SERVE';
    } else if (ball.inPlay && Math.abs(ball.vx) > 7.5) {
      cameraState = 'BALL_FOLLOW';
    }

    // ── 3D Perspective Render ──
    TableTennis3DRenderer.renderScene(
      ctx,
      p1.y,
      p1.vy,
      p2.y,
      p2.vy,
      ball,
      trailRef.current,
      particlesRef.current,
      cameraState,
      dt
    );
  }, true);

  // ── Input Coordinates Mapping (Horizontal Paddle Movement across Near Baseline) ──
  const handlePointerMove = (clientX: number) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const canvasX = (clientX - rect.left) * (CANVAS_WIDTH / rect.width);

    // Near table baseline extends from x=125 to x=675 across table width (400 logical units)
    const baselineLeft = 125;
    const baselineRight = 675;
    const u = Math.max(0, Math.min(1, (canvasX - baselineLeft) / (baselineRight - baselineLeft)));
    const targetPaddlePos = u * (LOGICAL_HEIGHT - PADDLE_HEIGHT);
    const clampedY = Math.max(0, Math.min(LOGICAL_HEIGHT - PADDLE_HEIGHT, targetPaddlePos));

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
    handlePointerMove(e.clientX);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches[0]) {
      handlePointerMove(e.touches[0].clientX);
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
      <div className="flex flex-col lg:flex-row items-center justify-center gap-4 w-full max-w-6xl relative mx-auto h-full p-2 lg:p-3 select-none overflow-y-auto">
        
        {/* CENTER 3D COURT CONTAINER */}
        <div className="relative flex flex-col items-center justify-center w-full max-w-[min(94vw,75dvh,840px)] shrink-0">
          
          {/* TOP BROADCAST TOURNAMENT SCOREBOARD HUD */}
          <div className="w-full bg-slate-950/85 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-2 sm:p-2.5 mb-2.5 flex items-center justify-between shadow-2xl gap-2">
            
            {/* Player 1 Card (Red / Foreground) */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-rose-500/20 to-rose-600/30 border border-rose-500/50 flex items-center justify-center font-black text-xs text-rose-400 shrink-0">
                P1
              </div>
              <div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <span className="text-xs sm:text-sm font-black text-slate-100 uppercase tracking-wide truncate max-w-[75px] sm:max-w-[150px]">
                    {p1Name}
                  </span>
                  {p1Sets > 0 && (
                    <span className="px-1 py-0.5 rounded bg-rose-500/20 text-[9px] sm:text-[10px] font-black text-rose-400 border border-rose-500/30">
                      {p1Sets}S
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${currentServer === 1 ? 'bg-rose-400 animate-pulse' : 'bg-slate-600'}`} />
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-rose-400/90">
                    {currentServer === 1 ? '● Serve' : 'Ready'}
                  </span>
                </div>
              </div>
            </div>

            {/* Large Center Score Board & Match Timer */}
            <div className="flex items-center gap-2 sm:gap-4 bg-slate-900/90 px-3 sm:px-6 py-1 rounded-xl border border-slate-800 shadow-inner shrink-0">
              <span className="text-xl sm:text-3xl font-black font-mono tracking-tight text-rose-400">
                {String(p1Score).padStart(2, '0')}
              </span>
              <div className="flex flex-col items-center px-0.5 sm:px-1">
                <div className="flex items-center gap-1 text-slate-400">
                  <Timer className={`w-3 h-3 ${remainingTime <= 30 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`} />
                  <span className={`text-[9px] sm:text-[10px] font-black font-mono ${remainingTime <= 30 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`}>
                    {Math.floor(remainingTime / 60).toString().padStart(2, '0')}:{(remainingTime % 60).toString().padStart(2, '0')}
                  </span>
                </div>
                <span className="text-xs font-black text-slate-600">:</span>
              </div>
              <span className="text-xl sm:text-3xl font-black font-mono tracking-tight text-sky-400">
                {String(p2Score).padStart(2, '0')}
              </span>
            </div>

            {/* Player 2 Card (Blue / Background) */}
            <div className="flex items-center gap-2 sm:gap-3 text-right">
              <div>
                <div className="flex items-center justify-end gap-1 sm:gap-2">
                  {p2Sets > 0 && (
                    <span className="px-1 py-0.5 rounded bg-sky-500/20 text-[9px] sm:text-[10px] font-black text-sky-400 border border-sky-500/30">
                      {p2Sets}S
                    </span>
                  )}
                  <span className="text-xs sm:text-sm font-black text-slate-100 uppercase tracking-wide truncate max-w-[75px] sm:max-w-[150px]">
                    {p2Name}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-sky-400/90">
                    {currentServer === 2 ? '● Serve' : 'Ready'}
                  </span>
                  <span className={`w-1.5 h-1.5 rounded-full ${currentServer === 2 ? 'bg-sky-400 animate-pulse' : 'bg-slate-600'}`} />
                </div>
              </div>
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-sky-500/20 to-sky-600/30 border border-sky-500/50 flex items-center justify-center font-black text-xs text-sky-400 shrink-0">
                P2
              </div>
            </div>

          </div>

          {/* MAIN 3D TABLE TENNIS CANVAS */}
          <div className="relative w-full aspect-[800/520] bg-[#070b14] rounded-3xl overflow-hidden border-2 border-indigo-500/30 shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex justify-center items-center">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              onMouseMove={handleMouseMove}
              onTouchMove={handleTouchMove}
              onClick={handleCanvasClick}
              className="w-full h-full object-contain cursor-crosshair"
            />

            {/* Broadcast Overlays */}
            <TableTennisOverlays
              isGameOver={gameState === 'gameover'}
              winner={winner}
              mySeat={mySeat}
              p1Score={p1Score}
              p2Score={p2Score}
              p1Name={p1Name}
              p2Name={p2Name}
              isMultiplayer={mode === 'multiplayer'}
              endReason={endReason}
              isMatchPoint={isMatchPoint}
              isDeuce={isDeuce}
              pointAnimation={pointAnimation}
              isServing={gameState === 'serving'}
              currentServer={currentServer}
              rallyCount={rallyCount}
              onReplay={resetGame}
              onExit={onBack}
            />
          </div>
        </div>

        {/* MULTIPLAYER PANEL */}
        {mode === 'multiplayer' && (
          <div className="hidden xl:block flex-shrink-0 self-start">
            <MultiplayerMatchPanel compact />
          </div>
        )}
      </div>
    </GameWrapper>
  );
};

export default TableTennisGame;
