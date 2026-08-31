import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameWrapper } from '../../components/GameWrapper';
import { useGameLoop } from '../shared/hooks/useGameLoop';
import { MultiplayerMatchPanel } from '../shared/components/MultiplayerMatchPanel';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import TableTennisMultiplayerDriver from './TableTennisMultiplayerDriver';
import type { TableTennisState } from '@gaming-hub/game-engine';
import { TABLE_TENNIS_VISUAL_CONFIG, type CameraState } from './constants/tableTennisVisualConfig';
import { TableTennis3DRenderer } from './utils/tableTennis3DRenderer';
import { TableTennisOverlays } from './components/TableTennisOverlays';
import { Timer, Users, X, LogOut } from 'lucide-react';

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
const PORTRAIT_CANVAS_WIDTH = 480;
const PORTRAIT_CANVAS_HEIGHT = 800;
const LOGICAL_WIDTH = TABLE_TENNIS_VISUAL_CONFIG.logicalWidth; // 600
const LOGICAL_HEIGHT = TABLE_TENNIS_VISUAL_CONFIG.logicalHeight; // 400
const PADDLE_HEIGHT = TABLE_TENNIS_VISUAL_CONFIG.paddleHeight; // 80

export const TableTennisGame: React.FC<TableTennisProps> = ({ mode, stake, onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isPortrait, setIsPortrait] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 1024 && window.innerHeight > window.innerWidth;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsPortrait(window.innerWidth < 1024 && window.innerHeight > window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const [gameState, setGameState] = useState<GameState>('serving');
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  const [p1Sets, setP1Sets] = useState(0);
  const [p2Sets, setP2Sets] = useState(0);
  const [winner, setWinner] = useState<1 | 2 | null>(null);
  const [currentServer, setCurrentServer] = useState<1 | 2>(1);
  const [isMatchPoint, setIsMatchPoint] = useState(false);
  const [isDeuce, setIsDeuce] = useState(false);
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('connected');
  const [pointAnimation, setPointAnimation] = useState<{ winner: number; reason: string } | null>(null);
  const [remainingTime, setRemainingTime] = useState(180);
  const [endReason, setEndReason] = useState<string | null>(null);
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
    const isP2 = mode === 'multiplayer' && mySeat === 1;
    const rx = isP2 ? LOGICAL_WIDTH - x : x;
    const ry = isP2 ? LOGICAL_HEIGHT - y : y;
    const proj = TableTennis3DRenderer.project(rx, ry, 10);
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
  }, [mode, mySeat]);

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
        spawnParticles(ballRef.current.x, ballRef.current.y, winnerSeat === mySeat ? '#10b981' : '#f43f5e', 20, 1.5);
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
  }, []);

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
        // In Player 2's inverted camera, moving left on screen increases targetY
        if (keys.up || keys.w) p2TargetYRef.current += paddleSpeed;
        if (keys.down || keys.s) p2TargetYRef.current -= paddleSpeed;
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

    // ── 3D Perspective Render (Flip to Near Side for Player 2) ──
    const isP2View = mode === 'multiplayer' && mySeat === 1;

    const nearY = isP2View ? (LOGICAL_HEIGHT - PADDLE_HEIGHT) - p2.y : p1.y;
    const nearVy = isP2View ? -p2.vy : p1.vy;
    const farY = isP2View ? (LOGICAL_HEIGHT - PADDLE_HEIGHT) - p1.y : p2.y;
    const farVy = isP2View ? -p1.vy : p2.vy;

    const renderBall = isP2View
      ? {
          x: LOGICAL_WIDTH - ball.x,
          y: LOGICAL_HEIGHT - ball.y,
          vx: -ball.vx,
          vy: -ball.vy,
          speed: ball.speed,
          inPlay: ball.inPlay,
        }
      : ball;

    const renderTrail = isP2View
      ? trailRef.current.map((t) => ({ x: LOGICAL_WIDTH - t.x, y: LOGICAL_HEIGHT - t.y }))
      : trailRef.current;

    TableTennis3DRenderer.renderScene(
      ctx,
      nearY,
      nearVy,
      farY,
      farVy,
      renderBall,
      renderTrail,
      particlesRef.current,
      cameraState,
      dt,
      isPortrait,
      isP2View ? 'blue' : 'red',
      isP2View ? 'red' : 'blue'
    );
  }, true);

  // ── Input Coordinates Mapping (Horizontal Paddle Movement across Near Baseline) ──
  const handlePointerMove = (clientX: number) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const canvasW = isPortrait ? PORTRAIT_CANVAS_WIDTH : CANVAS_WIDTH;
    const canvasH = isPortrait ? PORTRAIT_CANVAS_HEIGHT : CANVAS_HEIGHT;
    const baselineLeft = isPortrait ? 45 : 125;
    const baselineRight = isPortrait ? 435 : 675;

    const scale = Math.min(rect.width / canvasW, rect.height / canvasH);
    const renderedW = canvasW * scale;
    const offsetX = (rect.width - renderedW) / 2;
    const canvasX = (clientX - rect.left - offsetX) / scale;

    const u = Math.max(0, Math.min(1, (canvasX - baselineLeft) / (baselineRight - baselineLeft)));
    const targetPaddlePos = u * (LOGICAL_HEIGHT - PADDLE_HEIGHT);
    const clampedY = Math.max(0, Math.min(LOGICAL_HEIGHT - PADDLE_HEIGHT, targetPaddlePos));

    if (mode === 'multiplayer') {
      if (mySeat === 0) {
        p1Ref.current.targetY = clampedY;
      } else if (mySeat === 1) {
        // Player 2's screen left-to-right u maps to (LOGICAL_HEIGHT - PADDLE_HEIGHT) - clampedY in logical coordinates
        p2TargetYRef.current = (LOGICAL_HEIGHT - PADDLE_HEIGHT) - clampedY;
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
    <GameWrapper title="Table Tennis 3D Pro" gameId="table-tennis" mode={mode} stake={stake} onBack={onBack} isFullscreen isGameOver={gameState === 'gameover'}>
      <div className="flex flex-col lg:flex-row items-center justify-center gap-0 lg:gap-4 w-full max-w-6xl relative mx-auto h-full p-0 lg:p-3 select-none overflow-hidden lg:overflow-y-auto">
        
        {/* CENTER 3D COURT CONTAINER */}
        <div className="relative flex flex-col items-center justify-center w-full h-full lg:h-auto flex-1 lg:flex-initial lg:max-w-[min(96vw,calc((100dvh-7rem)*1.54),1200px)] shrink-0 overflow-hidden">
          
          {/* TOP BROADCAST TOURNAMENT SCOREBOARD HUD */}
          <div className="absolute top-2 left-2 right-2 z-20 pointer-events-none lg:pointer-events-auto lg:relative lg:top-auto lg:left-auto lg:right-auto w-auto lg:w-full bg-slate-950/80 lg:bg-slate-950/85 backdrop-blur-xl border border-slate-800/80 rounded-xl sm:rounded-2xl p-1.5 sm:p-2.5 lg:mb-2.5 flex items-center justify-between shadow-2xl gap-1.5 sm:gap-2">
            
            {/* Left Card: Always LOCAL PLAYER (Foreground / Near side) */}
            <div className="flex items-center gap-1.5 sm:gap-3">
              <div className={`w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl border flex items-center justify-center font-black text-[11px] sm:text-xs shrink-0 ${
                mySeat === 1
                  ? 'bg-gradient-to-br from-sky-500/20 to-sky-600/30 border-sky-500/50 text-sky-400'
                  : 'bg-gradient-to-br from-rose-500/20 to-rose-600/30 border-rose-500/50 text-rose-400'
              }`}>
                {mySeat === 1 ? 'P2' : 'P1'}
              </div>
              <div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <span className="text-[11px] sm:text-sm font-black text-slate-100 uppercase tracking-wide truncate max-w-[65px] sm:max-w-[150px]">
                    {mySeat === 1 ? p2Name : p1Name}
                  </span>
                  {(mySeat === 1 ? p2Sets : p1Sets) > 0 && (
                    <span className={`px-1 py-0.5 rounded text-[8px] sm:text-[10px] font-black border ${
                      mySeat === 1
                        ? 'bg-sky-500/20 text-sky-400 border-sky-500/30'
                        : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                    }`}>
                      {(mySeat === 1 ? p2Sets : p1Sets)}S
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 sm:gap-1.5 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    (mySeat === 1 ? currentServer === 2 : currentServer === 1)
                      ? (mySeat === 1 ? 'bg-sky-400 animate-pulse' : 'bg-rose-400 animate-pulse')
                      : 'bg-slate-600'
                  }`} />
                  <span className={`text-[8px] sm:text-[10px] font-bold uppercase tracking-wider ${
                    mySeat === 1 ? 'text-sky-400/90' : 'text-rose-400/90'
                  }`}>
                    {(mySeat === 1 ? currentServer === 2 : currentServer === 1) ? '● Serve' : 'Ready'}
                  </span>
                </div>
              </div>
            </div>

            {/* Large Center Score Board & Match Timer */}
            <div className="flex items-center gap-1.5 sm:gap-4 bg-slate-900/90 px-2 sm:px-6 py-0.5 sm:py-1 rounded-lg sm:rounded-xl border border-slate-800 shadow-inner shrink-0 pointer-events-auto">
              <span className={`text-lg sm:text-3xl font-black font-mono tracking-tight ${
                mySeat === 1 ? 'text-sky-400' : 'text-rose-400'
              }`}>
                {String(mySeat === 1 ? p2Score : p1Score).padStart(2, '0')}
              </span>
              <div className="flex flex-col items-center px-0.5 sm:px-1">
                <div className="flex items-center gap-1 text-slate-400">
                  <Timer className={`w-2.5 h-2.5 sm:w-3 sm:h-3 ${remainingTime <= 30 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`} />
                  <span className={`text-[8px] sm:text-[10px] font-black font-mono ${remainingTime <= 30 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`}>
                    {Math.floor(remainingTime / 60).toString().padStart(2, '0')}:{(remainingTime % 60).toString().padStart(2, '0')}
                  </span>
                </div>
                <span className="text-[10px] sm:text-xs font-black text-slate-600 leading-none">:</span>
              </div>
              <span className={`text-lg sm:text-3xl font-black font-mono tracking-tight ${
                mySeat === 1 ? 'text-rose-400' : 'text-sky-400'
              }`}>
                {String(mySeat === 1 ? p1Score : p2Score).padStart(2, '0')}
              </span>
              {mode === 'multiplayer' ? (
                <button
                  onClick={() => setShowMobilePanel(true)}
                  className="xl:hidden p-1 sm:p-2 rounded-lg sm:rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/50 text-indigo-300 flex items-center gap-1 text-[9px] sm:text-[10px] font-bold shadow-lg transition-all active:scale-95 cursor-pointer ml-1 sm:ml-2"
                  title="Match Details & Chat"
                >
                  <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">Details</span>
                </button>
              ) : (
                <button
                  onClick={onBack}
                  className="p-1 sm:px-2.5 sm:py-1 rounded-lg sm:rounded-xl bg-rose-600/20 hover:bg-rose-600 border border-rose-500/40 text-rose-300 hover:text-white flex items-center gap-1 text-[9px] sm:text-[10px] font-bold shadow-lg transition-all active:scale-95 cursor-pointer ml-1 sm:ml-2"
                  title="Exit Game"
                >
                  <LogOut className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">Exit</span>
                </button>
              )}
            </div>

            {/* Right Card: Always OPPONENT (Background / Far side) */}
            <div className="flex items-center gap-1.5 sm:gap-3 text-right">
              <div>
                <div className="flex items-center justify-end gap-1 sm:gap-2">
                  {(mySeat === 1 ? p1Sets : p2Sets) > 0 && (
                    <span className={`px-1 py-0.5 rounded text-[8px] sm:text-[10px] font-black border ${
                      mySeat === 1
                        ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                        : 'bg-sky-500/20 text-sky-400 border-sky-500/30'
                    }`}>
                      {(mySeat === 1 ? p1Sets : p2Sets)}S
                    </span>
                  )}
                  <span className="text-[11px] sm:text-sm font-black text-slate-100 uppercase tracking-wide truncate max-w-[65px] sm:max-w-[150px]">
                    {mySeat === 1 ? p1Name : p2Name}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-1 sm:gap-1.5 mt-0.5">
                  <span className={`text-[8px] sm:text-[10px] font-bold uppercase tracking-wider ${
                    mySeat === 1 ? 'text-rose-400/90' : 'text-sky-400/90'
                  }`}>
                    {(mySeat === 1 ? currentServer === 1 : currentServer === 2) ? '● Serve' : 'Ready'}
                  </span>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    (mySeat === 1 ? currentServer === 1 : currentServer === 2)
                      ? (mySeat === 1 ? 'bg-rose-400 animate-pulse' : 'bg-sky-400 animate-pulse')
                      : 'bg-slate-600'
                  }`} />
                </div>
              </div>
              <div className={`w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl border flex items-center justify-center font-black text-[11px] sm:text-xs shrink-0 ${
                mySeat === 1
                  ? 'bg-gradient-to-br from-rose-500/20 to-rose-600/30 border-rose-500/50 text-rose-400'
                  : 'bg-gradient-to-br from-sky-500/20 to-sky-600/30 border-sky-500/50 text-sky-400'
              }`}>
                {mySeat === 1 ? 'P1' : 'P2'}
              </div>
            </div>

          </div>

          {/* MAIN 3D TABLE TENNIS CANVAS */}
          <div className="relative w-full h-full flex-1 lg:flex-initial lg:aspect-[800/520] bg-[#070b14] rounded-none lg:rounded-3xl overflow-hidden border-0 lg:border-2 lg:border-indigo-500/30 shadow-none lg:shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex justify-center items-center">
            <canvas
              ref={canvasRef}
              width={isPortrait ? PORTRAIT_CANVAS_WIDTH : CANVAS_WIDTH}
              height={isPortrait ? PORTRAIT_CANVAS_HEIGHT : CANVAS_HEIGHT}
              onMouseMove={handleMouseMove}
              onMouseDown={(e) => handlePointerMove(e.clientX)}
              onTouchStart={(e) => {
                if (e.touches[0]) handlePointerMove(e.touches[0].clientX);
              }}
              onTouchMove={handleTouchMove}
              onClick={handleCanvasClick}
              className="w-full h-full object-contain cursor-crosshair touch-none"
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

        {/* MULTIPLAYER PANEL (DESKTOP >= xl) */}
        {mode === 'multiplayer' && (
          <div className="hidden xl:block flex-shrink-0 self-start">
            <MultiplayerMatchPanel compact />
          </div>
        )}

        {/* ═══ MOBILE CENTERED MULTIPLAYER DETAILS MODAL ═══ */}
        {mode === 'multiplayer' && showMobilePanel && (
          <div className="xl:hidden fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
            <div
              className="fixed inset-0"
              onClick={() => setShowMobilePanel(false)}
              aria-hidden="true"
            />
            <div className="relative z-10 bg-slate-900/98 border border-slate-700/80 rounded-3xl p-4 max-h-[88vh] w-full max-w-sm overflow-y-auto flex flex-col gap-3 shadow-[0_20px_50px_rgba(0,0,0,0.8)] animate-in zoom-in-95 duration-200 custom-scrollbar">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                    <Users size={15} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white leading-tight">Match Details & Chat</h3>
                    {room && <p className="text-[10px] text-slate-400 font-mono">Room: <span className="font-bold text-indigo-300">{room.code}</span></p>}
                  </div>
                </div>
                <button
                  onClick={() => setShowMobilePanel(false)}
                  className="p-1.5 rounded-full text-slate-400 hover:text-white bg-slate-800 transition-colors cursor-pointer"
                  aria-label="Close panel"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Match Panel & Chat */}
              <div className="w-full flex justify-center py-1">
                <MultiplayerMatchPanel compact={false} showControls={true} showChat={true} className="w-full max-w-full" />
              </div>
            </div>
          </div>
        )}
      </div>
    </GameWrapper>
  );
};

export default TableTennisGame;
