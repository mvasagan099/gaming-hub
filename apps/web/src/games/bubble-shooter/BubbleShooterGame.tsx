import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameWrapper } from '../../components/GameWrapper';
import { claimPracticeReward } from '../../services/api/practiceReward';
import { useGameLoop } from '../shared/hooks/useGameLoop';
import { useMultiplayerStore } from '../../store/multiplayerStore';

interface BubbleShooterProps {
  mode: 'ai' | 'multiplayer';
  stake: number;
  onBack: () => void;
}

// Server-authoritative state mirror (see packages/game-engine/src/bubble-shooter).
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

// Brighter colors
const COLORS = ['#fb7185', '#818cf8', '#34d399', '#fbbf24', '#c084fc']; // Brighter versions of rose, indigo, emerald, amber, purple
const SPECIALS = ['bomb', 'rainbow'];
const RADIUS = 11;
const DIAMETER = RADIUS * 2;
const ROWS = 15; // Max rows before game over
const COLS = 13; // Max cols in a normal row
const ROW_HEIGHT = RADIUS * Math.sqrt(3);
const CANVAS_WIDTH = COLS * DIAMETER; // 13 * 22 = 286
const CANVAS_HEIGHT = 460;
const SHOOTER_X = CANVAS_WIDTH / 2;
const SHOOTER_Y = CANVAS_HEIGHT - 25;
const SPEED = 850;

type GridBubble = { row: number; col: number; x: number; y: number; color: string; type: 'normal' | 'bomb' | 'rainbow' };
type MovingBubble = { x: number; y: number; vx: number; vy: number; color: string; type: 'normal' | 'bomb' | 'rainbow' };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type FloatingText = { x: number; y: number; text: string; life: number; color: string };

function getGridX(row: number, col: number) {
  const xOffset = (Math.abs(row % 2) === 0) ? RADIUS : DIAMETER;
  return xOffset + col * DIAMETER;
}
function getGridY(row: number, topOffset: number) {
  return RADIUS + (row + topOffset) * ROW_HEIGHT;
}

export const BubbleShooterGame: React.FC<BubbleShooterProps> = ({ mode, stake, onBack }) => {
  const isMultiplayer = mode === 'multiplayer';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const gameState = useMultiplayerStore((s) => s.gameState);
  const winner = useMultiplayerStore((s) => s.winner);
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const isSpectator = useMultiplayerStore((s) => s.isSpectator);
  const roomPlayers = useMultiplayerStore((s) => s.room?.players ?? []);
  
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [win, setWin] = useState(false);
  const [lose, setLose] = useState(false);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [showRules, setShowRules] = useState(true);

  // Game State Refs
  const gridRef = useRef<GridBubble[]>([]);
  
  // Shot counter for row drop (every 2 shots)
  const shotsFiredRef = useRef(0);

  const nextBubbleRef = useRef<{color: string, type: 'normal' | 'bomb' | 'rainbow'}>({ color: COLORS[0], type: 'normal' });
  const movingBubbleRef = useRef<MovingBubble | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const mousePosRef = useRef({ x: SHOOTER_X, y: 0 });
  const topOffsetRef = useRef(0);
  const screenShakeRef = useRef(0);
  const shootingRef = useRef(false);

  const getNextBubble = useCallback((): {color: string, type: 'normal' | 'bomb' | 'rainbow'} => {
    // 3% chance for a bomb, 3% chance for a rainbow
    const rand = Math.random();
    if (rand < 0.03) return { color: '#000000', type: 'bomb' };
    if (rand < 0.06) return { color: '#ffffff', type: 'rainbow' };
    
    // Otherwise pick a color from existing bubbles
    if (gridRef.current.length > 0) {
      const activeColors = Array.from(new Set(gridRef.current.filter(b => b.type === 'normal').map(b => b.color)));
      if (activeColors.length > 0) {
        return { color: activeColors[Math.floor(Math.random() * activeColors.length)], type: 'normal' };
      }
    }
    return { color: COLORS[Math.floor(Math.random() * COLORS.length)], type: 'normal' };
  }, []);

  const initGrid = useCallback(() => {
    topOffsetRef.current = 0;
    shotsFiredRef.current = 0;
    screenShakeRef.current = 0;
    
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
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          type: 'normal'
        });
      }
    }
    gridRef.current = grid;
    nextBubbleRef.current = getNextBubble();
  }, [getNextBubble]);

  useEffect(() => {
    if (!isMultiplayer) {
      initGrid();
    }
  }, [initGrid, isMultiplayer]);

  // In multiplayer the board, score and next bubble are authoritative from the
  // server. Apply my player's board on every `game:state` / `game:over`.
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

  useGameLoop((dt) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const spawnParticles = (x: number, y: number, color: string, count = 8) => {
      for (let i = 0; i < count; i++) {
        particlesRef.current.push({
          x, y,
          vx: (Math.random() - 0.5) * 600,
          vy: (Math.random() - 0.5) * 600,
          life: 1.0,
          color: color === '#ffffff' ? COLORS[Math.floor(Math.random()*COLORS.length)] : color
        });
      }
    };

    const spawnFloatingText = (x: number, y: number, text: string, color: string) => {
       floatingTextsRef.current.push({ x, y, text, life: 1.5, color });
    };

    const triggerScreenShake = (intensity: number) => {
       screenShakeRef.current = intensity;
    };

    const getGridNeighbors = (row: number, col: number) => {
      const neighbors = [
        [0, -1], [0, 1], [-1, 0], [1, 0]
      ];
      if (row % 2 === 0) {
        neighbors.push([-1, -1], [1, -1]);
      } else {
        neighbors.push([-1, 1], [1, 1]);
      }
      return neighbors.map(n => ({ r: row + n[0], c: col + n[1] }));
    };

    const checkMatches = (startRow: number, startCol: number, color: string) => {
      const matched: GridBubble[] = [];
      const toCheck = [{ r: startRow, c: startCol }];
      const visited = new Set<string>();
      visited.add(`${startRow},${startCol}`);

      while (toCheck.length > 0) {
        const { r, c } = toCheck.pop()!;
        const bubble = gridRef.current.find(b => b.row === r && b.col === c);
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
       n1.forEach(n => allN.add(`${n.r},${n.c}`));
       
       n1.forEach(n => {
          const n2 = getGridNeighbors(n.r, n.c);
          n2.forEach(nn => allN.add(`${nn.r},${nn.c}`));
       });

       gridRef.current.forEach(b => {
          if (allN.has(`${b.row},${b.col}`)) matched.push(b);
       });
       return matched;
    };

    const dropFloatingBubbles = () => {
      const visited = new Set<string>();
      const toCheck = gridRef.current.filter(b => b.row === -topOffsetRef.current).map(b => ({ r: b.row, c: b.col }));
      toCheck.forEach(b => visited.add(`${b.r},${b.c}`));

      while (toCheck.length > 0) {
        const { r, c } = toCheck.pop()!;
        const neighbors = getGridNeighbors(r, c);
        for (const n of neighbors) {
          const key = `${n.r},${n.c}`;
          if (!visited.has(key) && gridRef.current.some(b => b.row === n.r && b.col === n.c)) {
            visited.add(key);
            toCheck.push(n);
          }
        }
      }

      const floating = gridRef.current.filter(b => !visited.has(`${b.row},${b.col}`));
      if (floating.length > 0) {
        floating.forEach(b => spawnParticles(b.x, b.y, b.color, 4));
        gridRef.current = gridRef.current.filter(b => visited.has(`${b.row},${b.col}`));
        
        const pts = floating.length * 30;
        setScore(s => s + pts);
        if (floating.length > 2) {
           spawnFloatingText(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, `+${pts} DROP!`, '#38bdf8');
           triggerScreenShake(8);
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
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          type: 'normal'
        });
      }
      
      gridRef.current.forEach(b => {
        b.y = getGridY(b.row, topOffsetRef.current);
      });
      triggerScreenShake(3); 
    };

    const checkGameOver = () => {
      const isOver = gridRef.current.some(b => b.y + RADIUS >= SHOOTER_Y - 5);
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
          const existing = gridRef.current.find(b => b.row === r && b.col === c);
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

      // Handle Rainbow: take color of nearest neighbor
      if (bubble.type === 'rainbow') {
         const neighbors = getGridNeighbors(bestRow, bestCol);
         let foundColor = false;
         for (const n of neighbors) {
            const neigh = gridRef.current.find(b => b.row === n.r && b.col === n.c);
            if (neigh && neigh.type === 'normal') {
               matchColor = neigh.color;
               foundColor = true;
               break;
            }
         }
         if (!foundColor) matchColor = COLORS[Math.floor(Math.random() * COLORS.length)];
      }

      // Add to grid temporarily to evaluate matches
      const newBubble: GridBubble = { row: bestRow, col: bestCol, x: getGridX(bestRow, bestCol), y: getGridY(bestRow, topOffsetRef.current), color: matchColor, type: bubble.type };
      gridRef.current.push(newBubble);

      if (bubble.type === 'bomb') {
         matched = getBombRadius(bestRow, bestCol);
      } else {
         matched = checkMatches(bestRow, bestCol, matchColor);
      }

      if (matched.length >= 3 || bubble.type === 'bomb') {
        // Success
        matched.forEach(b => spawnParticles(b.x, b.y, b.color, bubble.type === 'bomb' ? 12 : 6));
        gridRef.current = gridRef.current.filter(b => !matched.includes(b));
        
        const pts = matched.length * 10 * (bubble.type === 'bomb' ? 2 : 1);
        setScore(s => s + pts);
        
        if (matched.length >= 5 || bubble.type === 'bomb') {
           spawnFloatingText(newBubble.x, newBubble.y, bubble.type === 'bomb' ? "BOOM!" : "GREAT!", bubble.type === 'bomb' ? '#f43f5e' : '#10b981');
           triggerScreenShake(bubble.type === 'bomb' ? 15 : 6);
        }

        dropFloatingBubbles();
      } else {
         // Did not match
         spawnFloatingText(newBubble.x, newBubble.y, "MISS!", '#94a3b8');
      }

      // Increment shot counter and check for row drop (every 2 shots)
      shotsFiredRef.current += 1;
      if (shotsFiredRef.current >= 2) {
         shotsFiredRef.current = 0;
         addNewRow();
      }

      // Check win/loss
      if (gridRef.current.length === 0) {
        setWin(true);
      } else {
        checkGameOver();
      }
    };

    const update = () => {
      // Screen shake decay
      if (screenShakeRef.current > 0) {
         screenShakeRef.current -= dt * 30;
         if (screenShakeRef.current < 0) screenShakeRef.current = 0;
      }

      if (movingBubbleRef.current) {
        const b = movingBubbleRef.current;
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        // Wall collisions
        if (b.x - RADIUS < 0) { b.x = RADIUS; b.vx *= -1; }
        if (b.x + RADIUS > CANVAS_WIDTH) { b.x = CANVAS_WIDTH - RADIUS; b.vx *= -1; }
        if (b.y - RADIUS < 0) {
          b.y = RADIUS;
          // Multiplayer: the server resolves the shot; the local flight is a
          // prediction only, so stop here without mutating the board.
          if (!isMultiplayer) {
            snapBubble(b);
          }
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
          if (!isMultiplayer) {
            snapBubble(b);
          }
          movingBubbleRef.current = null;
        }
      }

      // Particles
      particlesRef.current.forEach(p => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 1800 * dt; // gravity
        p.life -= 2.0 * dt;
      });
      particlesRef.current = particlesRef.current.filter(p => p.life > 0);

      // Floating Texts
      floatingTextsRef.current.forEach(t => {
         t.y -= 40 * dt;
         t.life -= dt;
      });
      floatingTextsRef.current = floatingTextsRef.current.filter(t => t.life > 0);
    };

    const drawBubble = (x: number, y: number, color: string, type: 'normal'|'bomb'|'rainbow', alpha: number = 1.0) => {
       ctx.save();
       ctx.globalAlpha = alpha;
       
       if (type === 'bomb') {
          // Draw bomb
          ctx.fillStyle = '#1e293b';
          ctx.beginPath(); ctx.arc(x, y, RADIUS, 0, Math.PI * 2); ctx.fill();
          // highlight
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.beginPath(); ctx.arc(x - 3, y - 3, RADIUS/3, 0, Math.PI * 2); ctx.fill();
          // fuse
          ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x + RADIUS/2, y - RADIUS/2); ctx.lineTo(x + RADIUS + 2, y - RADIUS - 2); ctx.stroke();
          // spark
          if (Math.random() > 0.5) {
             ctx.fillStyle = '#fef08a';
             ctx.beginPath(); ctx.arc(x + RADIUS + 2, y - RADIUS - 2, 2, 0, Math.PI*2); ctx.fill();
          }
       } else if (type === 'rainbow') {
          // Draw rainbow (radial with multiple stops)
          const grad = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, RADIUS);
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.3, COLORS[0]);
          grad.addColorStop(0.6, COLORS[2]);
          grad.addColorStop(1, COLORS[1]);
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(x, y, RADIUS, 0, Math.PI * 2); ctx.fill();
       } else {
          // Base vibrant color
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(x, y, RADIUS - 0.5, 0, Math.PI * 2); ctx.fill();
          
          // Subtle 3D shading overlay (white highlight to slightly dark edge)
          const grad = ctx.createRadialGradient(x - 3, y - 3, 0, x, y, RADIUS);
          grad.addColorStop(0, 'rgba(255,255,255,0.7)');
          grad.addColorStop(0.4, 'rgba(255,255,255,0)');
          grad.addColorStop(0.7, 'rgba(0,0,0,0)');
          grad.addColorStop(1, 'rgba(0,0,0,0.5)'); // Slightly dark edge for 3D feel
          
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(x, y, RADIUS - 0.5, 0, Math.PI * 2); ctx.fill();
          
          // Outer gloss reflection
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.beginPath(); ctx.ellipse(x, y - RADIUS/2.5, RADIUS/1.8, RADIUS/4, 0, 0, Math.PI * 2); ctx.fill();
       }
       ctx.restore();
    };

    const drawTrajectory = () => {
       if (movingBubbleRef.current) return;
       
       let tx = SHOOTER_X;
       let ty = SHOOTER_Y;
       
       const dx = mousePosRef.current.x - SHOOTER_X;
       const dy = mousePosRef.current.y - SHOOTER_Y;
       const angle = Math.atan2(dy, dx);
       
       let tvx = Math.cos(angle);
       let tvy = Math.sin(angle);
       
       ctx.strokeStyle = 'rgba(255,255,255,0.4)';
       ctx.lineWidth = 2;
       ctx.setLineDash([4, 6]);
       ctx.beginPath();
       ctx.moveTo(tx, ty);

       // Simulate raycast
       let bounces = 0;
       const step = 4;
       let hit = false;

       for(let iter = 0; iter < 400 && !hit; iter++) {
          tx += tvx * step;
          ty += tvy * step;

          if (tx - RADIUS <= 0) { tx = RADIUS; tvx *= -1; ctx.lineTo(tx, ty); bounces++; }
          else if (tx + RADIUS >= CANVAS_WIDTH) { tx = CANVAS_WIDTH - RADIUS; tvx *= -1; ctx.lineTo(tx, ty); bounces++; }
          
          if (ty - RADIUS <= 0) { hit = true; ctx.lineTo(tx, ty); break; }

          for (const gb of gridRef.current) {
            if (Math.hypot(tx - gb.x, ty - gb.y) < DIAMETER - 1) {
               hit = true;
               ctx.lineTo(tx, ty);
               
               // Draw predicted placement phantom
               drawBubble(tx, ty, nextBubbleRef.current.color, nextBubbleRef.current.type, 0.5);
               break;
            }
          }
          if (bounces > 3) break; // limit bounces
       }
       
       if (!hit) ctx.lineTo(tx, ty);
       ctx.stroke();
       ctx.setLineDash([]);
    };

    const draw = () => {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.save();
      if (screenShakeRef.current > 0) {
         const sx = (Math.random() - 0.5) * screenShakeRef.current;
         const sy = (Math.random() - 0.5) * screenShakeRef.current;
         ctx.translate(sx, sy);
      }

      // Background Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      for (let y = getGridY(-topOffsetRef.current, topOffsetRef.current); y < CANVAS_HEIGHT; y += ROW_HEIGHT) {
         ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke();
      }

      // Grid
      gridRef.current.forEach(b => {
         drawBubble(b.x, b.y, b.color, b.type);
      });

      // Moving Bubble
      if (movingBubbleRef.current) {
        const b = movingBubbleRef.current;
        drawBubble(b.x, b.y, b.color, b.type);
      }

      // Particles
      particlesRef.current.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, RADIUS / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      });

      // Floating Texts
      floatingTextsRef.current.forEach(t => {
         ctx.fillStyle = t.color;
         ctx.globalAlpha = t.life;
         ctx.font = '900 16px sans-serif';
         ctx.textAlign = 'center';
         ctx.fillText(t.text, t.x, t.y);
         ctx.globalAlpha = 1.0;
      });

      // Trajectory
      drawTrajectory();

      // Shooter Base
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(SHOOTER_X, SHOOTER_Y, RADIUS + 15, 0, Math.PI * 2);
      ctx.fill();
      
      // Cannon Barrel (aimed at mouse)
      const dx = mousePosRef.current.x - SHOOTER_X;
      const dy = mousePosRef.current.y - SHOOTER_Y;
      const angle = Math.atan2(dy, dx);
      ctx.save();
      ctx.translate(SHOOTER_X, SHOOTER_Y);
      ctx.rotate(angle);
      ctx.fillStyle = '#334155';
      ctx.fillRect(0, -RADIUS, RADIUS*2.5, RADIUS*2);
      ctx.restore();

      // Next Bubble to shoot (loaded)
      if (!movingBubbleRef.current) {
        drawBubble(SHOOTER_X, SHOOTER_Y, nextBubbleRef.current.color, nextBubbleRef.current.type);
      }

      ctx.restore();
    };

    update();
    draw();
  }, !(gameOver || win || lose || showRules));

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || movingBubbleRef.current || gameOver || win || lose) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Scale factor to convert CSS pixels to Canvas internal pixels
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    // Calculate angle but clamp it so you can't shoot downwards
    let dx = x - SHOOTER_X;
    let dy = y - SHOOTER_Y;
    if (dy > -10) dy = -10; // Prevent shooting down
    
    mousePosRef.current = { x: SHOOTER_X + dx, y: SHOOTER_Y + dy };
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

    // Multiplayer: the server owns the board. Fire the current next bubble and
    // animate a local prediction while the authoritative state round-trips.
    if (isMultiplayer) {
      if (shootingRef.current || !canShoot()) return;
      shootingRef.current = true;
      movingBubbleRef.current = {
        x: SHOOTER_X,
        y: SHOOTER_Y,
        vx: Math.cos(angle) * SPEED,
        vy: Math.sin(angle) * SPEED,
        color: nextBubbleRef.current.color,
        type: nextBubbleRef.current.type
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
      color: nextBubbleRef.current.color,
      type: nextBubbleRef.current.type
    };

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
    setGameOver(false);
    setWin(false);
    setLose(false);
    setRewardClaimed(false);
    movingBubbleRef.current = null;
    particlesRef.current = [];
    floatingTextsRef.current = [];
    initGrid();
  };

  const remoteState = gameState as unknown as RemoteState | null;
  const serverPlayers = isMultiplayer && remoteState ? remoteState.players ?? [] : [];
  const winnerSeats = isMultiplayer
    ? remoteState?.winnerSeats ?? winner?.winnerSeats ?? []
    : [];
  const matchFinished = isMultiplayer
    ? Boolean(remoteState?.finished || winner)
    : false;
  const namesBySeat: Record<number, string> = {};
  for (const p of roomPlayers) {
    if (p.seat != null) namesBySeat[p.seat] = p.displayName;
  }
  const winnerSeat = winnerSeats[0] != null ? winnerSeats[0] : null;
  const winnerName = winnerSeat != null
    ? (namesBySeat[winnerSeat] ?? `Player ${winnerSeat + 1}`)
    : null;

  return (
    <GameWrapper title="Bubble Shooter Master" gameId="bubble-shooter" mode={mode} stake={stake} onBack={onBack} isFullscreen>
      <div className="flex flex-col lg:flex-row items-center justify-center gap-8 w-full max-w-6xl relative mx-auto h-full p-4 lg:p-8">
        
        {/* LEFT SIDEBAR: SCORE */}
        <div className="flex flex-col items-center gap-6 glass-panel p-8 rounded-3xl border border-slate-800 w-full max-w-xs shrink-0 order-2 lg:order-1 shadow-2xl">
          <div className="text-center w-full bg-slate-900/80 p-6 rounded-2xl border border-slate-800 shadow-inner relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent"></div>
             <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Score</span>
             <p className="text-5xl font-black text-amber-400 mt-2 filter drop-shadow-md">{score}</p>
          </div>
          <div className="w-full mt-4 space-y-3 bg-slate-900/40 p-4 rounded-2xl border border-slate-800/50">
             <h3 className="text-white font-bold mb-3 uppercase tracking-wider text-xs">How to Play</h3>
             <ul className="space-y-3">
               <li className="flex items-start gap-3 text-sm text-slate-300">
                 <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center shrink-0 border border-emerald-700/50 text-emerald-400 font-bold text-xs">1</div>
                 Aim with your mouse, click to shoot.
               </li>
               <li className="flex items-start gap-3 text-sm text-slate-300">
                 <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center shrink-0 border border-emerald-700/50 text-emerald-400 font-bold text-xs">2</div>
                 Match 3 or more bubbles of the same color to pop them.
               </li>
             </ul>
          </div>
        </div>
        
        {/* CENTER GAME CANVAS */}
        <div className="relative group w-full flex-1 max-w-[500px] flex items-center justify-center order-1 lg:order-2 h-full">
           
          {/* RULES OVERLAY */}
          {showRules && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in rounded-3xl">
              <div className="bg-slate-900 border border-indigo-500/30 p-8 rounded-3xl shadow-2xl flex flex-col max-w-[280px] w-full mx-4">
                <h2 className="text-2xl font-black uppercase tracking-wider text-center text-white mb-6">🎯 Rules</h2>
                <ul className="space-y-3 mb-8">
                  <li className="text-slate-300 text-sm">🔵 <b>Match 3+</b> to pop bubbles.</li>
                  <li className="text-slate-300 text-sm">🔴 <b>Drop:</b> Every 2 shots, the ceiling drops a row!</li>
                  <li className="text-slate-300 text-sm">💥 <b>Bomb:</b> Destroys everything nearby.</li>
                  <li className="text-slate-300 text-sm">🌈 <b>Rainbow:</b> Matches any color.</li>
                </ul>
                <button
                  onClick={() => setShowRules(false)}
                  className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-black text-sm uppercase rounded-xl transition-all shadow-lg shadow-indigo-500/25"
                >
                  Let's Play!
                </button>
              </div>
            </div>
          )}

          {/* WIN/LOSS OVERLAY */}
          {(gameOver || win || lose) && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in rounded-3xl">
              <div className="bg-slate-900 border border-amber-500/30 p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-[280px] w-full mx-4">
                <div className="text-6xl mb-4">{win ? '🏆' : gameOver ? '⏳' : winnerSeats.length === 0 ? '🤝' : '❌'}</div>
                <h2 className={`text-3xl font-black uppercase tracking-widest text-center mb-2 ${win ? 'text-emerald-400' : 'text-rose-500'}`}>
                  {win ? 'YOU WIN!' : gameOver ? "YOU'RE OUT!" : winnerSeats.length === 0 ? 'DRAW!' : 'GAME OVER'}
                </h2>
                <p className="text-slate-300 text-sm text-center mb-6 font-bold">
                  Final Score: {score}
                </p>

                {lose && winnerName && (
                  <div className="bg-indigo-950/50 border border-indigo-500/30 text-indigo-300 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 mb-6">
                    🏁 {winnerName} cleared their board!
                  </div>
                )}

                {win && !isMultiplayer && (
                  <div className="bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 mb-6">
                    🪙 +50 Coins Added!
                  </div>
                )}

                {gameOver && !matchFinished && (
                  <p className="text-slate-400 text-xs text-center mb-6 font-bold">
                    Waiting for the match to end...
                  </p>
                )}

                <div className="flex gap-3 w-full">
                  {!(gameOver && !matchFinished) && (
                    <button
                      onClick={handleReplay}
                      className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg text-sm"
                    >
                      {isMultiplayer ? 'Rematch' : 'Replay'}
                    </button>
                  )}
                  <button
                    onClick={onBack}
                    className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all border border-slate-700 text-sm"
                  >
                    Exit
                  </button>
                </div>
              </div>
            </div>
          )}

          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            onMouseMove={handleMouseMove}
            onClick={handleShoot}
            className="bg-[#0f172a] rounded-3xl border-4 border-indigo-900/50 shadow-[0_0_50px_rgba(99,102,241,0.15)] cursor-crosshair w-full max-w-[600px] h-auto max-h-[85vh] object-contain transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>

          {/* RIGHT SIDEBAR: SHOTS TILL DROP / SCOREBOARD */}
          <div className="flex flex-col items-center gap-6 glass-panel p-8 rounded-3xl border border-slate-800 w-full max-w-xs shrink-0 order-3 shadow-2xl">
            {isMultiplayer ? (
              <div className="text-center w-full bg-slate-900/80 p-6 rounded-2xl border border-slate-800 shadow-inner relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent"></div>
                 <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Scoreboard</span>
                 <div className="w-full mt-3 space-y-2">
                   {serverPlayers.length === 0 && (
                     <p className="text-xs text-slate-500 font-bold">Waiting for the match to start...</p>
                   )}
                   {serverPlayers.map((p) => {
                     const isMe = p.seat === mySeat;
                     const statusColor =
                       p.status === 'won' ? 'text-emerald-400 border-emerald-500/40 bg-emerald-950/40'
                       : p.status === 'eliminated' ? 'text-rose-400 border-rose-500/40 bg-rose-950/40'
                       : 'text-slate-300 border-slate-700 bg-slate-800/60';
                     const statusLabel =
                       p.status === 'won' ? 'Won' : p.status === 'eliminated' ? 'Out' : 'Playing';
                     return (
                       <div key={p.seat} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left ${isMe ? 'border-indigo-500/50 bg-indigo-950/40' : 'border-slate-800 bg-slate-900/40'}`}>
                         <span className="text-xs font-bold text-slate-200 truncate">
                           {isMe ? 'You' : (namesBySeat[p.seat] ?? p.name)}
                           {isMe && <span className="ml-1 text-indigo-400">•</span>}
                         </span>
                         <span className="flex items-center gap-2 shrink-0">
                           <span className="text-xs font-black text-amber-400">{p.score}</span>
                           <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${statusColor}`}>{statusLabel}</span>
                         </span>
                       </div>
                     );
                   })}
                 </div>
              </div>
            ) : (
              <div className="text-center w-full bg-slate-900/80 p-6 rounded-2xl border border-slate-800 shadow-inner relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-rose-500 to-transparent"></div>
                 <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Shots Till Drop</span>
                 <p className="text-3xl font-black text-rose-500 mt-2 filter drop-shadow-md">Every 2</p>
              </div>
            )}
          
          <div className="w-full mt-4 space-y-3 bg-slate-900/40 p-4 rounded-2xl border border-slate-800/50">
             <h3 className="text-white font-bold mb-3 uppercase tracking-wider text-xs">Power-Ups</h3>
             <ul className="space-y-4">
               <li className="flex items-center gap-3 text-sm text-slate-300">
                 <div className="w-8 h-8 rounded-full bg-slate-800 border-2 border-[#fb923c] flex items-center justify-center shrink-0">💣</div>
                 <div>
                   <strong className="text-white block text-xs">Bomb Bubble</strong>
                   <span className="text-xs text-slate-400">Destroys a large area.</span>
                 </div>
               </li>
               <li className="flex items-center gap-3 text-sm text-slate-300">
                 <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-rose-500 via-emerald-500 to-indigo-500 border border-slate-600 flex items-center justify-center shrink-0">✨</div>
                 <div>
                   <strong className="text-white block text-xs">Rainbow Bubble</strong>
                   <span className="text-xs text-slate-400">Matches any color.</span>
                 </div>
               </li>
             </ul>
          </div>
        </div>

      </div>
    </GameWrapper>
  );
};
