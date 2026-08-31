import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameWrapper } from '../../components/GameWrapper';
import { useGameLoop } from '../shared/hooks/useGameLoop';
import { MultiplayerMatchPanel } from '../shared/components/MultiplayerMatchPanel';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import { SnakeVsWormsMultiplayerDriver } from './SnakeVsWormsMultiplayerDriver';
import type { SnakeVsWormsState, SnakeWormDirection } from '@gaming-hub/game-engine';
import { SNAKE_WORMS_VISUAL_CONFIG } from './constants/snakeVsWormsVisualConfig';
import { SnakeVsWorms3DRenderer, type Point2D } from './utils/snakeVsWorms3DRenderer';
import { SnakeVsWormsOverlays } from './components/SnakeVsWormsOverlays';
import { Trophy, Flame, Swords, Zap } from 'lucide-react';

interface SnakeVsWormsProps {
  mode: 'ai' | 'multiplayer';
  stake: number;
  onBack: () => void;
}

interface Snake {
  id: string;
  head: Point2D;
  segments: Point2D[];
  angle: number;
  targetAngle: number;
  skinKey: string;
  speed: number;
  isPlayer: boolean;
  dead: boolean;
  isBoosting: boolean;
  lengthFloat: number;
  name: string;
  respawnTime?: number;
}

interface Orb {
  id: number;
  x: number;
  y: number;
  type: 'normal' | 'golden' | 'boost';
  value: number;
  isLoot: boolean;
}

const CANVAS_WIDTH = SNAKE_WORMS_VISUAL_CONFIG.canvasWidth; // 900
const CANVAS_HEIGHT = SNAKE_WORMS_VISUAL_CONFIG.canvasHeight; // 600
const MAP_WIDTH = SNAKE_WORMS_VISUAL_CONFIG.mapWidth; // 2000
const MAP_HEIGHT = SNAKE_WORMS_VISUAL_CONFIG.mapHeight; // 2000
const BASE_SPEED = 220;
const SEG_DISTANCE = 11;
const GAME_ZOOM = 0.90; // 10% zoom out

const DIR_ANGLES: Record<SnakeWormDirection, number> = {
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: -Math.PI / 2,
};

export const SnakeVsWormsGame: React.FC<SnakeVsWormsProps> = ({ mode, stake, onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [length, setLength] = useState(15);
  const [kills, setKills] = useState(0);
  const [score, setScore] = useState(0);
  const [boostEnergy, setBoostEnergy] = useState(100);
  const [gameOver, setGameOver] = useState(false);
  const [isWin, setIsWin] = useState(false);

  // Multiplayer state
  const [multiplayerState, setMultiplayerState] = useState<SnakeVsWormsState | null>(null);
  const [mpWinner, setMpWinner] = useState<number | null>(null);
  const driverRef = useRef<SnakeVsWormsMultiplayerDriver | null>(null);

  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const room = useMultiplayerStore((s) => s.room);

  const inputRef = useRef({
    mouseX: CANVAS_WIDTH / 2 + 100,
    mouseY: CANVAS_HEIGHT / 2,
    hasPointer: false,
    isBoosting: false,
  });

  const gameStateRef = useRef({
    snakes: [] as Snake[],
    orbs: [] as Orb[],
    camera: { x: MAP_WIDTH / 2 - CANVAS_WIDTH / 2, y: MAP_HEIGHT / 2 - CANVAS_HEIGHT / 2 },
    orbIdCounter: 1,
  });

  const mpRenderStateRef = useRef<Map<number, { body: Point2D[]; angle: number }>>(new Map());
  const animTimeRef = useRef(0);

  // Single-player AI Init
  const initGame = useCallback(() => {
    if (mode === 'multiplayer') return;

    const state = gameStateRef.current;
    const startX = MAP_WIDTH / 2;
    const startY = MAP_HEIGHT / 2;

    const player: Snake = {
      id: 'player',
      head: { x: startX, y: startY },
      segments: Array.from({ length: 15 }, (_, i) => ({ x: startX - i * SEG_DISTANCE, y: startY })),
      angle: 0,
      targetAngle: 0,
      skinKey: 'player',
      speed: BASE_SPEED,
      isPlayer: true,
      dead: false,
      isBoosting: false,
      lengthFloat: 15,
      name: 'You (Dragon)',
    };

    const skinKeys = ['ruby', 'amethyst', 'p2', 'gold', 'cyan'];
    const enemies: Snake[] = Array(12).fill(null).map((_, i) => {
      let x = startX;
      let y = startY;
      while (Math.hypot(x - startX, y - startY) < 350) {
        x = 180 + Math.random() * (MAP_WIDTH - 360);
        y = 180 + Math.random() * (MAP_HEIGHT - 360);
      }
      const initialSegCount = 12 + Math.floor(Math.random() * 16);
      const angle = Math.random() * Math.PI * 2;
      return {
        id: `ai-${i}`,
        head: { x, y },
        segments: Array.from({ length: initialSegCount }, (_, segIdx) => ({
          x: x - Math.cos(angle) * segIdx * SEG_DISTANCE,
          y: y - Math.sin(angle) * segIdx * SEG_DISTANCE,
        })),
        angle,
        targetAngle: angle,
        skinKey: skinKeys[i % skinKeys.length]!,
        speed: BASE_SPEED,
        isPlayer: false,
        dead: false,
        isBoosting: false,
        lengthFloat: initialSegCount,
        name: `Worm Bot ${i + 1}`,
      };
    });

    const orbs: Orb[] = Array(320).fill(null).map((_, i) => {
      const rand = Math.random();
      const type: 'normal' | 'golden' | 'boost' = rand < 0.12 ? 'golden' : rand < 0.22 ? 'boost' : 'normal';
      return {
        id: i,
        x: 50 + Math.random() * (MAP_WIDTH - 100),
        y: 50 + Math.random() * (MAP_HEIGHT - 100),
        type,
        value: type === 'golden' ? 5 : type === 'boost' ? 2 : 1,
        isLoot: false,
      };
    });

    state.snakes = [player, ...enemies];
    state.orbs = orbs;
    state.camera = { x: startX - CANVAS_WIDTH / 2, y: startY - CANVAS_HEIGHT / 2 };
    state.orbIdCounter = 1000;

    inputRef.current.mouseX = CANVAS_WIDTH / 2 + 100;
    inputRef.current.mouseY = CANVAS_HEIGHT / 2;

    setLength(15);
    setKills(0);
    setScore(0);
    setBoostEnergy(100);
    setGameOver(false);
    setIsWin(false);
    setRewardClaimed(false);
  }, [mode]);

  useEffect(() => {
    initGame();
  }, [initGame]);

  // Multiplayer Driver Lifecycle
  useEffect(() => {
    setGameOver(false);
    setMpWinner(null);

    if (mode === 'multiplayer' && room && mySeat !== null) {
      const names = room.players.map((p) => p.displayName || `Player ${(p.seat ?? 0) + 1}`);
      const driver = new SnakeVsWormsMultiplayerDriver(mySeat, names);
      driverRef.current = driver;

      driver.setOnStateUpdate((state: SnakeVsWormsState) => {
        setMultiplayerState(state);
        if (state.finished && state.gameStatus === 'finished') {
          setGameOver(true);
          const winSeat = state.winnerSeats && state.winnerSeats.length > 0 ? state.winnerSeats[0]! : null;
          setMpWinner(winSeat);
          setIsWin(winSeat === mySeat);
        }
      });

      driver.setOnMatchComplete((winSeat: number | null) => {
        setMpWinner(winSeat);
        setIsWin(winSeat === mySeat);
        setGameOver(true);
      });

      driver.start();

      return () => {
        driver.stop();
        driverRef.current = null;
      };
    }
  }, [mode, room, mySeat]);

  // Keyboard Steering & Boost
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
        if (dir) {
          inputRef.current.hasPointer = false;
          driverRef.current.sendDirection(dir);
        }
      } else {
        // Single player keyboard steering
        const player = gameStateRef.current.snakes.find((s) => s.isPlayer);
        if (player) {
          if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') player.targetAngle = -Math.PI / 2;
          if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') player.targetAngle = Math.PI / 2;
          if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') player.targetAngle = Math.PI;
          if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') player.targetAngle = 0;
        }
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

  // Pointer Coordinates
  const updatePointer = (clientX: number, clientY: number) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const s = Math.max(rect.width / CANVAS_WIDTH, rect.height / CANVAS_HEIGHT);
    const renderedW = CANVAS_WIDTH * s;
    const renderedH = CANVAS_HEIGHT * s;
    const offsetX = (rect.width - renderedW) / 2;
    const offsetY = (rect.height - renderedH) / 2;
    inputRef.current.mouseX = (clientX - rect.left - offsetX) / s;
    inputRef.current.mouseY = (clientY - rect.top - offsetY) / s;
    inputRef.current.hasPointer = true;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    updatePointer(e.clientX, e.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches[0]) updatePointer(e.touches[0].clientX, e.touches[0].clientY);
  };

  // ─── 60 FPS Main Loop ───────────────────────────────────────────────────────
  useGameLoop((dt) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    animTimeRef.current += dt;
    const animTime = animTimeRef.current;

    const rect = canvas.getBoundingClientRect();
    const isPortrait = rect.width > 0 && rect.height > 0 && rect.width < rect.height;
    // Mobile portrait view: zoom out (0.50) so field is spacious and snakes are normal sized
    const currentZoom = isPortrait ? 0.50 : 0.90;

    // ──────────────────────────────────────────────────────────────────────────
    // 1. MULTIPLAYER RENDERING MODE
    // ──────────────────────────────────────────────────────────────────────────
    if (mode === 'multiplayer' && multiplayerState) {
      const mpState = multiplayerState;
      const me = mpState.players.find((p) => p.seat === mySeat) || mpState.players[0]!;
      const meHeadTarget = me.body[0] || { x: 1000, y: 1000 };

      // ── Process Mouse / Touch Steering in Multiplayer ──
      if (driverRef.current && me && me.status === 'active' && me.body[0] && inputRef.current.hasPointer) {
        const screenHeadX = CANVAS_WIDTH / 2 + (me.body[0].x - (gameStateRef.current.camera.x + CANVAS_WIDTH / 2)) * currentZoom;
        const screenHeadY = CANVAS_HEIGHT / 2 + (me.body[0].y - (gameStateRef.current.camera.y + CANVAS_HEIGHT / 2)) * currentZoom;
        const dx = inputRef.current.mouseX - screenHeadX;
        const dy = inputRef.current.mouseY - screenHeadY;

        if (Math.hypot(dx, dy) > 20) {
          let desiredDir: SnakeWormDirection;
          if (Math.abs(dx) > Math.abs(dy)) {
            desiredDir = dx > 0 ? 'right' : 'left';
          } else {
            desiredDir = dy > 0 ? 'down' : 'up';
          }

          // Handle 180-degree turn avoidance (steer into orthogonal axis first)
          if (
            (me.direction === 'left' && desiredDir === 'right') ||
            (me.direction === 'right' && desiredDir === 'left')
          ) {
            if (Math.abs(dy) > 10) desiredDir = dy > 0 ? 'down' : 'up';
          } else if (
            (me.direction === 'up' && desiredDir === 'down') ||
            (me.direction === 'down' && desiredDir === 'up')
          ) {
            if (Math.abs(dx) > 10) desiredDir = dx > 0 ? 'right' : 'left';
          }

          driverRef.current.sendDirection(desiredDir);
        }
      }

      // ── Smooth Player Interpolation ──
      const renderMap = mpRenderStateRef.current;
      for (const p of mpState.players) {
        if (!p.body || p.body.length === 0) continue;
        let pState = renderMap.get(p.seat);
        if (!pState || pState.body.length !== p.body.length) {
          pState = {
            body: p.body.map((pt) => ({ x: pt.x, y: pt.y })),
            angle: DIR_ANGLES[p.direction] ?? 0,
          };
          renderMap.set(p.seat, pState);
        }

        const lerpFactor = Math.min(1, 20 * dt);
        for (let i = 0; i < p.body.length; i++) {
          const targetPt = p.body[i]!;
          const currPt = pState.body[i] || { x: targetPt.x, y: targetPt.y };
          currPt.x += (targetPt.x - currPt.x) * lerpFactor;
          currPt.y += (targetPt.y - currPt.y) * lerpFactor;
          pState.body[i] = currPt;
        }

        // Rotate Head towards authoritative p.direction
        const targetAngle = DIR_ANGLES[p.direction] ?? 0;
        let angleDiff = targetAngle - pState.angle;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        pState.angle += angleDiff * Math.min(1, 16 * dt);
      }

      const myRenderState = renderMap.get(me.seat);
      const head = (myRenderState && myRenderState.body[0]) || meHeadTarget;

      // Smooth Camera Follow
      const targetCamX = Math.max(0, Math.min(MAP_WIDTH - CANVAS_WIDTH, head.x - CANVAS_WIDTH / 2));
      const targetCamY = Math.max(0, Math.min(MAP_HEIGHT - CANVAS_HEIGHT, head.y - CANVAS_HEIGHT / 2));
      const cam = gameStateRef.current.camera;
      cam.x += (targetCamX - cam.x) * 6.5 * dt;
      cam.y += (targetCamY - cam.y) * 6.5 * dt;

      ctx.fillStyle = '#05070e';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.save();
      ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
      ctx.scale(currentZoom, currentZoom);
      ctx.translate(-CANVAS_WIDTH / 2, -CANVAS_HEIGHT / 2);
      ctx.translate(-cam.x, -cam.y);

      // Draw 3D Arena
      SnakeVsWorms3DRenderer.drawArena(ctx, cam.x, cam.y, animTime);

      // Draw 3D Food
      for (const food of mpState.food) {
        SnakeVsWorms3DRenderer.drawFood(ctx, food.x, food.y, food.type, animTime);
      }

      // Draw 3D Players
      for (const p of mpState.players) {
        const isMe = p.seat === mySeat;
        const skinKey = p.seat === 0 ? 'player' : 'p2';
        const renderState = renderMap.get(p.seat);
        const pBody = renderState ? renderState.body : p.body;
        const pAngle = renderState ? renderState.angle : DIR_ANGLES[p.direction] ?? 0;

        SnakeVsWorms3DRenderer.drawCreature(
          ctx,
          pBody,
          pAngle,
          skinKey,
          isMe,
          p.isBoosting,
          p.name,
          animTime,
          p.status === 'eliminated'
        );
      }

      ctx.restore();

      // Draw Radar Minimap
      const radarPlayers = mpState.players.map((p) => ({
        x: p.body[0]?.x || 0,
        y: p.body[0]?.y || 0,
        isMe: p.seat === mySeat,
        color: p.seat === 0 ? '#10b981' : '#3b82f6',
        dead: p.status === 'eliminated',
      }));
      SnakeVsWorms3DRenderer.drawRadar(ctx, CANVAS_WIDTH, CANVAS_HEIGHT, radarPlayers, MAP_WIDTH, MAP_HEIGHT, isPortrait);
      return;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. SINGLE PLAYER AI ARENA MODE
    // ──────────────────────────────────────────────────────────────────────────
    const state = gameStateRef.current;
    const player = state.snakes.find((s) => s.isPlayer);

    // 1. Player Steering
    if (player && !player.dead && !gameOver) {
      if (inputRef.current.hasPointer) {
        const screenHeadX = CANVAS_WIDTH / 2 + (player.head.x - (state.camera.x + CANVAS_WIDTH / 2)) * currentZoom;
        const screenHeadY = CANVAS_HEIGHT / 2 + (player.head.y - (state.camera.y + CANVAS_HEIGHT / 2)) * currentZoom;
        const dx = inputRef.current.mouseX - screenHeadX;
        const dy = inputRef.current.mouseY - screenHeadY;

        if (Math.hypot(dx, dy) > 16) {
          player.targetAngle = Math.atan2(dy, dx);
        }
      }

      // Smooth Angle Interpolation
      let angleDiff = player.targetAngle - player.angle;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      player.angle += angleDiff * Math.min(1, 10 * dt);

      // Boost mechanics
      player.isBoosting = inputRef.current.isBoosting && boostEnergy > 5;
      if (player.isBoosting) {
        setBoostEnergy((e) => Math.max(0, e - dt * 25));
        player.speed = BASE_SPEED * 1.75;
      } else {
        setBoostEnergy((e) => Math.min(100, e + dt * 10));
        player.speed = BASE_SPEED;
      }
    }

    // 2. Dead AI Respawn Handler
    const skinKeys = ['ruby', 'amethyst', 'p2', 'gold', 'cyan'];
    state.snakes.forEach((snake, idx) => {
      if (snake.dead && !snake.isPlayer) {
        if (!snake.respawnTime) snake.respawnTime = Date.now() + 2500;
        if (Date.now() >= snake.respawnTime) {
          // Respawn AI bot
          const rx = 180 + Math.random() * (MAP_WIDTH - 360);
          const ry = 180 + Math.random() * (MAP_HEIGHT - 360);
          const segCount = 12 + Math.floor(Math.random() * 16);
          const angle = Math.random() * Math.PI * 2;

          snake.head = { x: rx, y: ry };
          snake.segments = Array.from({ length: segCount }, (_, sIdx) => ({
            x: rx - Math.cos(angle) * sIdx * SEG_DISTANCE,
            y: ry - Math.sin(angle) * sIdx * SEG_DISTANCE,
          }));
          snake.angle = angle;
          snake.targetAngle = angle;
          snake.skinKey = skinKeys[idx % skinKeys.length]!;
          snake.speed = BASE_SPEED;
          snake.dead = false;
          snake.lengthFloat = segCount;
          snake.respawnTime = undefined;
        }
      }
    });

    // 3. Move All Snakes & Segment IK Following
    state.snakes.forEach((snake) => {
      if (snake.dead) return;

      if (!snake.isPlayer) {
        // AI wandering & turning
        if (Math.random() < 0.035) {
          snake.targetAngle += (Math.random() - 0.5) * 1.4;
        }
        let diff = snake.targetAngle - snake.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        snake.angle += diff * Math.min(1, 4.5 * dt);
      }

      // Move Head
      snake.head.x += Math.cos(snake.angle) * snake.speed * dt;
      snake.head.y += Math.sin(snake.angle) * snake.speed * dt;

      // Arena Wall Collisions
      if (snake.head.x < 18 || snake.head.x > MAP_WIDTH - 18 || snake.head.y < 18 || snake.head.y > MAP_HEIGHT - 18) {
        snake.dead = true;
        // Drop loot on death
        snake.segments.forEach((seg, sIdx) => {
          if (sIdx % 2 === 0) {
            state.orbs.push({
              id: state.orbIdCounter++,
              x: seg.x + (Math.random() - 0.5) * 10,
              y: seg.y + (Math.random() - 0.5) * 10,
              type: 'golden',
              value: 3,
              isLoot: true,
            });
          }
        });
        if (snake.isPlayer) setGameOver(true);
      }

      // Inverse Kinematics Body Following
      snake.segments[0] = { x: snake.head.x, y: snake.head.y };
      for (let i = 1; i < snake.segments.length; i++) {
        const prev = snake.segments[i - 1]!;
        const curr = snake.segments[i]!;
        const angle = Math.atan2(prev.y - curr.y, prev.x - curr.x);
        curr.x = prev.x - Math.cos(angle) * SEG_DISTANCE;
        curr.y = prev.y - Math.sin(angle) * SEG_DISTANCE;
      }

      // Food Collection
      state.orbs = state.orbs.filter((orb) => {
        const dist = Math.hypot(snake.head.x - orb.x, snake.head.y - orb.y);
        if (dist < 22) {
          snake.lengthFloat += orb.value * 0.35;
          if (snake.isPlayer) {
            setScore((s) => s + orb.value * 10);
            setLength(Math.floor(snake.lengthFloat));
          }
          if (Math.floor(snake.lengthFloat) > snake.segments.length) {
            const last = snake.segments[snake.segments.length - 1]!;
            snake.segments.push({ x: last.x, y: last.y });
          }
          return false;
        }
        return true;
      });

      // Body-to-body Collisions
      state.snakes.forEach((other) => {
        if (other.id === snake.id || other.dead) return;
        for (let i = 2; i < other.segments.length; i++) {
          const seg = other.segments[i]!;
          if (Math.hypot(snake.head.x - seg.x, snake.head.y - seg.y) < 14) {
            snake.dead = true;
            // Spawn loot orbs along snake corpse
            snake.segments.forEach((sSeg, sIdx) => {
              if (sIdx % 2 === 0) {
                state.orbs.push({
                  id: state.orbIdCounter++,
                  x: sSeg.x + (Math.random() - 0.5) * 8,
                  y: sSeg.y + (Math.random() - 0.5) * 8,
                  type: 'golden',
                  value: 3,
                  isLoot: true,
                });
              }
            });

            if (other.isPlayer) setKills((k) => k + 1);
            if (snake.isPlayer) setGameOver(true);
            break;
          }
        }
      });
    });

    // 4. Replenish Food Orbs
    while (state.orbs.length < 320) {
      const rand = Math.random();
      const type: 'normal' | 'golden' | 'boost' = rand < 0.12 ? 'golden' : rand < 0.22 ? 'boost' : 'normal';
      state.orbs.push({
        id: state.orbIdCounter++,
        x: 50 + Math.random() * (MAP_WIDTH - 100),
        y: 50 + Math.random() * (MAP_HEIGHT - 100),
        type,
        value: type === 'golden' ? 5 : type === 'boost' ? 2 : 1,
        isLoot: false,
      });
    }

    // 5. Camera Following Player
    if (player) {
      const targetCamX = Math.max(0, Math.min(MAP_WIDTH - CANVAS_WIDTH, player.head.x - CANVAS_WIDTH / 2));
      const targetCamY = Math.max(0, Math.min(MAP_HEIGHT - CANVAS_HEIGHT, player.head.y - CANVAS_HEIGHT / 2));
      state.camera.x += (targetCamX - state.camera.x) * 7.5 * dt;
      state.camera.y += (targetCamY - state.camera.y) * 7.5 * dt;
    }

    ctx.fillStyle = '#05070e';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.save();
    ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
    ctx.scale(currentZoom, currentZoom);
    ctx.translate(-CANVAS_WIDTH / 2, -CANVAS_HEIGHT / 2);
    ctx.translate(-state.camera.x, -state.camera.y);

    // Draw 3D Arena
    SnakeVsWorms3DRenderer.drawArena(ctx, state.camera.x, state.camera.y, animTime);

    // Draw 3D Food Orbs
    state.orbs.forEach((orb) => {
      SnakeVsWorms3DRenderer.drawFood(ctx, orb.x, orb.y, orb.type, animTime);
    });

    // Draw 3D Creatures
    state.snakes.forEach((snake) => {
      SnakeVsWorms3DRenderer.drawCreature(
        ctx,
        snake.segments,
        snake.angle,
        snake.skinKey,
        snake.isPlayer,
        snake.isBoosting,
        snake.name,
        animTime,
        snake.dead
      );
    });

    ctx.restore();

    // Draw Radar Minimap
    const radarSnakes = state.snakes.map((s) => ({
      x: s.head.x,
      y: s.head.y,
      isMe: s.isPlayer,
      color: s.isPlayer ? '#10b981' : '#ef4444',
      dead: s.dead,
    }));
    SnakeVsWorms3DRenderer.drawRadar(ctx, CANVAS_WIDTH, CANVAS_HEIGHT, radarSnakes, MAP_WIDTH, MAP_HEIGHT, isPortrait);
  }, true);

  return (
    <GameWrapper title="Snake vs Worms 3D" gameId="snake-vs-worms" mode={mode} stake={stake} onBack={onBack} isFullscreen isGameOver={gameOver}>
      <div className="flex flex-col lg:flex-row items-center justify-center gap-0 lg:gap-6 w-full max-w-6xl relative mx-auto h-full p-0 lg:p-4 select-none overflow-hidden lg:overflow-y-auto">
        
        {/* CENTER 3D ARENA CONTAINER */}
        <div className="relative flex flex-col items-center justify-center w-full h-full lg:h-auto flex-1 lg:flex-initial lg:max-w-[min(96vw,calc((100dvh-7rem)*1.5),1280px)] shrink-0 overflow-hidden">
          
          {/* TOP MODERN ARCADE HUD */}
          <div className="absolute top-2 left-2 right-2 z-20 pointer-events-none lg:pointer-events-auto lg:relative lg:top-auto lg:left-auto lg:right-auto w-auto lg:w-full grid grid-cols-2 sm:grid-cols-4 lg:flex items-center justify-between gap-1.5 sm:gap-2 lg:gap-3 lg:mb-2.5 px-1">
            
            {/* Score & Length Pill */}
            <div className="p-1.5 sm:p-2.5 bg-slate-900/80 lg:bg-slate-900/90 backdrop-blur-md border border-emerald-500/40 rounded-xl sm:rounded-2xl flex items-center justify-between shadow-lg pointer-events-auto">
              <div className="flex items-center gap-1 sm:gap-2">
                <Trophy className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
                <span className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase">Mass</span>
              </div>
              <span className="text-[11px] sm:text-base font-black font-mono text-white ml-1">{score.toLocaleString()}</span>
            </div>

            {/* Length Pill */}
            <div className="p-1.5 sm:p-2.5 px-2 sm:px-3 bg-slate-900/80 lg:bg-slate-900/90 backdrop-blur-md border border-indigo-500/40 rounded-xl sm:rounded-2xl flex items-center justify-between sm:justify-center gap-1.5 shadow-lg pointer-events-auto">
              <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-indigo-400 shrink-0" />
              <div className="text-right sm:text-center">
                <span className="text-[7px] sm:text-[9px] font-bold text-slate-400 uppercase block">Length</span>
                <span className="text-[9px] sm:text-xs font-black text-indigo-400">{length} Segs</span>
              </div>
            </div>

            {/* Kills Pill */}
            <div className="p-1.5 sm:p-2.5 px-2 sm:px-3 bg-slate-900/80 lg:bg-slate-900/90 backdrop-blur-md border border-rose-500/40 rounded-xl sm:rounded-2xl flex items-center justify-between sm:justify-center gap-1.5 shadow-lg pointer-events-auto">
              <Swords className="w-3 h-3 sm:w-4 sm:h-4 text-rose-400 shrink-0" />
              <div className="text-right sm:text-center">
                <span className="text-[7px] sm:text-[9px] font-bold text-slate-400 uppercase block">Kills</span>
                <span className="text-[9px] sm:text-xs font-black text-rose-400">{kills} Slain</span>
              </div>
            </div>

            {/* Boost Energy Bar */}
            <div className="p-1.5 sm:p-2.5 bg-slate-900/80 lg:bg-slate-900/90 backdrop-blur-md border border-amber-500/40 rounded-xl sm:rounded-2xl flex flex-col justify-center shadow-lg pointer-events-auto">
              <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                <div className="flex items-center gap-1">
                  <Flame className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 shrink-0" />
                  <span className="text-[7px] sm:text-[9px] font-bold text-slate-400 uppercase">Boost</span>
                </div>
                <span className="text-[8px] sm:text-[10px] font-black font-mono text-amber-400">{Math.round(boostEnergy)}%</span>
              </div>
              <div className="w-full h-1 sm:h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-75 rounded-full"
                  style={{ width: `${boostEnergy}%` }}
                />
              </div>
            </div>

          </div>

          {/* MAIN 3D CANVAS ARENA */}
          <div className="relative w-full h-full flex-1 lg:flex-initial lg:h-auto lg:aspect-[900/600] bg-[#070b14] rounded-none lg:rounded-3xl overflow-hidden border-0 lg:border-2 lg:border-indigo-500/30 shadow-none lg:shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex justify-center items-center">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              onMouseMove={handleMouseMove}
              onMouseDown={(e) => updatePointer(e.clientX, e.clientY)}
              onTouchStart={(e) => {
                if (e.touches[0]) updatePointer(e.touches[0].clientX, e.touches[0].clientY);
              }}
              onTouchMove={handleTouchMove}
              className="w-full h-full object-cover lg:object-contain cursor-crosshair touch-none"
            />

            {/* Mobile Boost Touch Button */}
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                inputRef.current.isBoosting = true;
                if (mode === 'multiplayer' && driverRef.current) {
                  driverRef.current.sendBoostStart();
                }
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                e.stopPropagation();
                inputRef.current.isBoosting = false;
                if (mode === 'multiplayer' && driverRef.current) {
                  driverRef.current.sendBoostStop();
                }
              }}
              onPointerLeave={() => {
                inputRef.current.isBoosting = false;
                if (mode === 'multiplayer' && driverRef.current) {
                  driverRef.current.sendBoostStop();
                }
              }}
              className="lg:hidden absolute bottom-6 right-6 z-20 w-16 h-16 rounded-full bg-gradient-to-tr from-amber-500/80 to-rose-500/80 active:from-amber-600 active:to-rose-600 border-2 border-white/40 shadow-2xl backdrop-blur-md flex flex-col items-center justify-center text-white active:scale-95 transition-transform select-none touch-none"
            >
              <Flame className="w-6 h-6 text-amber-200 animate-pulse" />
              <span className="text-[9px] font-black tracking-widest uppercase">Boost</span>
            </button>

            {/* Glassmorphic Overlays */}
            <SnakeVsWormsOverlays
              isGameOver={gameOver}
              isWin={isWin}
              score={score}
              length={length}
              kills={kills}
              isMultiplayer={mode === 'multiplayer'}
              winnerName={mpWinner !== null ? `Player ${mpWinner + 1}` : null}
              onReplay={initGame}
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

export default SnakeVsWormsGame;
