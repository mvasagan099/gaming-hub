import React, { useRef, useEffect, useState } from 'react';
import { GameWrapper } from '../../components/GameWrapper';
import confetti from 'canvas-confetti';
import toast from 'react-hot-toast';
import { claimPracticeReward } from '../../services/api/practiceReward';
import { useGameLoop } from '../shared/hooks/useGameLoop';

interface CarromGameProps {
  mode: 'ai' | 'multiplayer';
  stake: number;
  onBack: () => void;
}

type CoinType = 'striker' | 'queen' | 'white' | 'black';

interface Coin {
  id: string;
  type: CoinType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mass: number;
  color: string;
  active: boolean;
}

const BOARD_WIDTH = 400;
const BOARD_HEIGHT = 400;
const BORDER_SIZE = 25;
const POCKET_RADIUS = 20;
const POCKETS = [
  { x: 35, y: 35 },
  { x: BOARD_WIDTH - 35, y: 35 },
  { x: 35, y: BOARD_HEIGHT - 35 },
  { x: BOARD_WIDTH - 35, y: BOARD_HEIGHT - 35 },
];

const STRIKER_START_X = BOARD_WIDTH / 2;
const STRIKER_START_Y = BOARD_HEIGHT - 70;

function createInitialCoins(): Coin[] {
  const coins: Coin[] = [];
  const cx = BOARD_WIDTH / 2;
  const cy = BOARD_HEIGHT / 2;

  // Striker
  coins.push({ id: 'striker', type: 'striker', x: STRIKER_START_X, y: STRIKER_START_Y, vx: 0, vy: 0, radius: 14, mass: 3, color: '#0284c7', active: true });

  // Queen
  coins.push({ id: 'queen', type: 'queen', x: cx, y: cy, vx: 0, vy: 0, radius: 10, mass: 1, color: '#dc2626', active: true });

  let wCount = 0;
  let bCount = 0;
  
  // Helper to add coin
  const addWB = (r: number, angle: number) => {
    const isWhite = (wCount < 9 && bCount < 9) ? (Math.random() > 0.5) : (wCount < 9);
    const type = isWhite ? 'white' : 'black';
    if (isWhite) wCount++; else bCount++;
    
    coins.push({
      id: `${type}-${Date.now()}-${Math.random()}`,
      type,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
      vx: 0,
      vy: 0,
      radius: 9,
      mass: 1,
      color: type === 'white' ? '#ffffff' : '#09090b',
      active: true
    });
  };

  // Ring 1 (6 pieces)
  for (let i = 0; i < 6; i++) {
    addWB(20, (i * Math.PI) / 3);
  }

  // Ring 2 (12 pieces)
  for (let i = 0; i < 12; i++) {
    addWB(40, (i * Math.PI) / 6);
  }

  return coins;
}

export const CarromGame: React.FC<CarromGameProps> = ({ mode, stake, onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState({ white: 0, black: 0 });
  
  const [dragState, setDragState] = useState<'idle' | 'dragging_striker' | 'dragging'>('idle');
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [currentAim, setCurrentAim] = useState({ x: 0, y: 0 });
  const [strikerPos, setStrikerPos] = useState(0);
  const [strikerPhase, setStrikerPhase] = useState<'positioning' | 'aiming'>('positioning');
  const [timeLeft, setTimeLeft] = useState(60);
  
  const [gameOver, setGameOver] = useState(false);
  const [showRules, setShowRules] = useState(true);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [isTurnActive, setIsTurnActive] = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState<'player' | 'ai'>('player');
  const [aiThinking, setAiThinking] = useState(false);
  const [uiTrigger, setUiTrigger] = useState(0);
  
  const coinsRef = useRef<Coin[]>(createInitialCoins());
  const rulesRef = useRef({
    queenStatus: 'unpocketed' as 'unpocketed' | 'pocketed_needs_cover' | 'covered',
    queenPocketedBy: null as 'player' | 'ai' | null,
    dueOwed: { white: 0, black: 0 }
  });
  const turnScoreRef = useRef({ white: 0, black: 0, queen: false, foul: false });

  useEffect(() => {
    if (gameOver || isTurnActive || showRules || currentPlayer !== 'ai') return;
    
    setAiThinking(true);
    const timer = setTimeout(() => {
      const coins = coinsRef.current;
      const blacks = coins.filter(c => c.type === 'black' && c.active);
      const striker = coins.find(c => c.type === 'striker');
      
      if (!striker || blacks.length === 0) return;

      let bestTarget = blacks[0];
      let bestPocket = POCKETS[0];
      let minPenalty = Infinity;
      
      for (const b of blacks) {
         for (const p of POCKETS) {
           const dist = Math.hypot(b.x - p.x, b.y - p.y);
           if (dist < minPenalty) {
             minPenalty = dist;
             bestTarget = b;
             bestPocket = p;
           }
         }
      }

      if (bestTarget && bestPocket) {
         const aimAngle = Math.atan2(bestPocket.y - bestTarget.y, bestPocket.x - bestTarget.x);
         const impactX = bestTarget.x - Math.cos(aimAngle) * 23; 
         const impactY = bestTarget.y - Math.sin(aimAngle) * 23;
         
         let aiX = Math.max(85, Math.min(315, impactX));
         
         // Slide left/right if overlapping a coin
         let valid = false;
         for (let offset = 0; offset <= 115; offset += 5) {
            for (const sign of [1, -1]) {
               const testX = aiX + offset * sign;
               if (testX < 85 || testX > 315) continue;
               
               let overlap = false;
               for (const c of coins) {
                  if (c.type === 'striker' || !c.active) continue;
                  if (Math.hypot(testX - c.x, 70 - c.y) < striker.radius + c.radius) {
                     overlap = true;
                     break;
                  }
               }
               if (!overlap) {
                  aiX = testX;
                  valid = true;
                  break;
               }
            }
            if (valid) break;
         }

         striker.x = aiX;
         striker.y = 70; // AI shoots from top
         
         setTimeout(() => {
           const shootAngle = Math.atan2(impactY - striker.y, impactX - striker.x);
           const forceMagnitude = 18; 
           striker.vx = Math.cos(shootAngle) * forceMagnitude;
           striker.vy = Math.sin(shootAngle) * forceMagnitude;
           setIsTurnActive(true);
           setTimeLeft(60);
           setAiThinking(false);
         }, 1500); 
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [currentPlayer, isTurnActive, gameOver, showRules]);

  useEffect(() => {
    if (gameOver || score.white >= 9 || score.black >= 9) return;
    const rules = rulesRef.current;
    if (rules.queenStatus === 'covered' && (score.white >= 9 || score.black >= 9) && !rewardClaimed) {
      setRewardClaimed(true);
      if (score.white >= 9) setTimeout(() => void claimPracticeReward('carrom'), 1000);
    }
  }, [gameOver, score, rewardClaimed, uiTrigger]);

  useEffect(() => {
    if (gameOver || isTurnActive || showRules || currentPlayer === 'ai') {
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          toast.error('Time is up! Opponent\'s turn.', { id: 'timeout-toast' });
          setCurrentPlayer('ai');
          setDragState('idle');
          
          const striker = coinsRef.current.find(c => c.type === 'striker');
          if (striker) {
            striker.x = BOARD_WIDTH / 2;
            striker.y = 70;
            striker.vx = 0;
            striker.vy = 0;
          }
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameOver, isTurnActive, showRules, currentPlayer]);

  useGameLoop((dt) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
      // 1. Physics Step
      let anyMoving = false;
      const coins = coinsRef.current;

      for (let i = 0; i < coins.length; i++) {
        const c = coins[i];
        if (!c.active) continue;

        c.x += c.vx * (dt * 60);
        c.y += c.vy * (dt * 60);
        
        const friction = Math.pow(0.985, dt * 60);
        c.vx *= friction;
        c.vy *= friction;

        if (Math.abs(c.vx) < 0.05) c.vx = 0;
        if (Math.abs(c.vy) < 0.05) c.vy = 0;

        if (c.vx !== 0 || c.vy !== 0) anyMoving = true;

        // Wall Bounces
        if (c.x - c.radius < BORDER_SIZE) { c.x = BORDER_SIZE + c.radius; c.vx *= -1; }
        if (c.x + c.radius > BOARD_WIDTH - BORDER_SIZE) { c.x = BOARD_WIDTH - BORDER_SIZE - c.radius; c.vx *= -1; }
        if (c.y - c.radius < BORDER_SIZE) { c.y = BORDER_SIZE + c.radius; c.vy *= -1; }
        if (c.y + c.radius > BOARD_HEIGHT - BORDER_SIZE) { c.y = BOARD_HEIGHT - BORDER_SIZE - c.radius; c.vy *= -1; }
      }

      // Collisions
      for (let i = 0; i < coins.length; i++) {
        for (let j = i + 1; j < coins.length; j++) {
          const c1 = coins[i];
          const c2 = coins[j];
          if (!c1.active || !c2.active) continue;
          
          if (!isTurnActive && (c1.type === 'striker' || c2.type === 'striker')) continue;

          const dx = c2.x - c1.x;
          const dy = c2.y - c1.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = c1.radius + c2.radius;

          if (dist < minDist) {
            // Resolve overlap
            const overlap = minDist - dist;
            const nx = dx / dist;
            const ny = dy / dist;
            c1.x -= nx * (overlap / 2);
            c1.y -= ny * (overlap / 2);
            c2.x += nx * (overlap / 2);
            c2.y += ny * (overlap / 2);

            // 1D Elastic Collision along normal
            const kx = c1.vx - c2.vx;
            const ky = c1.vy - c2.vy;
            const p = 2.0 * (nx * kx + ny * ky) / (c1.mass + c2.mass);

            c1.vx -= p * c2.mass * nx;
            c1.vy -= p * c2.mass * ny;
            c2.vx += p * c1.mass * nx;
            c2.vy += p * c1.mass * ny;
          }
        }
      }

      // Pocket Logic
      let scoredWhite = 0;
      let scoredBlack = 0;
      let strikerFoulThisFrame = false;
      
      for (let i = 0; i < coins.length; i++) {
        const c = coins[i];
        if (!c.active) continue;

        for (const p of POCKETS) {
          const dx = c.x - p.x;
          const dy = c.y - p.y;
          if (Math.sqrt(dx * dx + dy * dy) < POCKET_RADIUS) {
            c.active = false;
            c.vx = 0;
            c.vy = 0;

            if (c.type === 'white') {
               scoredWhite++;
               turnScoreRef.current.white++;
            }
            else if (c.type === 'black') {
               scoredBlack++;
               turnScoreRef.current.black++;
            }
            else if (c.type === 'queen') {
               turnScoreRef.current.queen = true;
            }
            else if (c.type === 'striker') {
               turnScoreRef.current.foul = true;
               strikerFoulThisFrame = true;
            }
          }
        }
      }

      if (scoredWhite > 0 || scoredBlack > 0) {
        setScore(prev => {
          const nw = prev.white + scoredWhite;
          const nb = prev.black + scoredBlack;
          return { white: nw, black: nb };
        });
        if (scoredWhite > 0) confetti();
      }

      if (strikerFoulThisFrame) {
        const striker = coins.find(c => c.type === 'striker');
        if (striker) {
          striker.active = true;
          striker.x = STRIKER_START_X;
          striker.y = STRIKER_START_Y;
          striker.vx = 0;
          striker.vy = 0;
        }
      }

      // Check turn end
      if (isTurnActive && !anyMoving) {
        setIsTurnActive(false);

        const rules = rulesRef.current;
        const turnStats = turnScoreRef.current;
        let nextPlayer = currentPlayer;

        // 1. Queen Cover Check
        if (rules.queenStatus === 'pocketed_needs_cover' && rules.queenPocketedBy === currentPlayer) {
            const scoredOwn = (currentPlayer === 'player' && turnStats.white > 0) || (currentPlayer === 'ai' && turnStats.black > 0);
            if (scoredOwn) {
                rules.queenStatus = 'covered';
                toast.success('Queen Covered!', { id: 'q-cover' });
            } else {
                rules.queenStatus = 'unpocketed';
                rules.queenPocketedBy = null;
                toast.error('Failed to cover Queen!', { id: 'q-fail' });
                const q = coins.find(c => c.type === 'queen');
                if (q) {
                    q.active = true;
                    q.x = BOARD_WIDTH / 2;
                    q.y = BOARD_HEIGHT / 2;
                }
            }
        }

        // 2. Queen Pocketed THIS turn
        if (turnStats.queen) {
           rules.queenStatus = 'pocketed_needs_cover';
           rules.queenPocketedBy = currentPlayer;
           toast('Queen pocketed! Must cover on next shot.', { id: 'q-pocket' });
        }

        // 3. Foul Check
        if (turnStats.foul) {
           if (currentPlayer === 'player') rules.dueOwed.white++;
           else rules.dueOwed.black++;
           toast.error('Striker Foul! Due owed.', { id: 'foul' });
           nextPlayer = currentPlayer === 'player' ? 'ai' : 'player';
        } else {
           const scoredOwn = (currentPlayer === 'player' && turnStats.white > 0) || (currentPlayer === 'ai' && turnStats.black > 0);
           if (!scoredOwn && !turnStats.queen) {
               nextPlayer = currentPlayer === 'player' ? 'ai' : 'player';
           }
        }

        // 4. Process Dues & Win Condition
        setScore(prev => {
           let newWhite = prev.white;
           let newBlack = prev.black;
           let wTaken = 0; let bTaken = 0;
           
           if (rules.dueOwed.white > 0 && newWhite > 0) {
              const take = Math.min(rules.dueOwed.white, newWhite);
              newWhite -= take; rules.dueOwed.white -= take; wTaken = take;
           }
           if (rules.dueOwed.black > 0 && newBlack > 0) {
              const take = Math.min(rules.dueOwed.black, newBlack);
              newBlack -= take; rules.dueOwed.black -= take; bTaken = take;
           }

           if (wTaken > 0 || bTaken > 0) {
              let spawnedW = 0; let spawnedB = 0;
              for (const c of coins) {
                 if (!c.active) {
                    const rx = BOARD_WIDTH/2 + (Math.random() - 0.5) * 40;
                    const ry = BOARD_HEIGHT/2 + (Math.random() - 0.5) * 40;
                    if (c.type === 'white' && spawnedW < wTaken) {
                       c.active = true; c.x = rx; c.y = ry; spawnedW++;
                    }
                    if (c.type === 'black' && spawnedB < bTaken) {
                       c.active = true; c.x = rx; c.y = ry; spawnedB++;
                    }
                 }
              }
           }

           if (rules.queenStatus === 'covered') {
              if (newWhite >= 9) setTimeout(() => setGameOver(true), 500);
              if (newBlack >= 9) setTimeout(() => setGameOver(true), 500);
           }

           return { white: newWhite, black: newBlack };
        });

        setCurrentPlayer(nextPlayer);
        turnScoreRef.current = { white: 0, black: 0, queen: false, foul: false };
        setUiTrigger(t => t + 1);

        // Reset Striker position
        const striker = coins.find(c => c.type === 'striker');
        if (striker) {
          striker.x = BOARD_WIDTH / 2 + (nextPlayer === 'player' ? strikerPos : 0);
          striker.y = nextPlayer === 'player' ? STRIKER_START_Y : 70;
          striker.vx = 0;
          striker.vy = 0;
        }
        setStrikerPhase('positioning');
        setTimeLeft(60);
      }

      // 2. Rendering
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Wood Board Frame
      const frameGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      frameGrad.addColorStop(0, '#5c2205');
      frameGrad.addColorStop(1, '#3a1301');
      ctx.fillStyle = frameGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Board Surface
      const surfaceGrad = ctx.createRadialGradient(BOARD_WIDTH/2, BOARD_HEIGHT/2, 50, BOARD_WIDTH/2, BOARD_HEIGHT/2, 250);
      surfaceGrad.addColorStop(0, '#fef3c7');
      surfaceGrad.addColorStop(1, '#fde68a');
      ctx.fillStyle = surfaceGrad;
      ctx.fillRect(BORDER_SIZE, BORDER_SIZE, canvas.width - (BORDER_SIZE*2), canvas.height - (BORDER_SIZE*2));

      // Carrom Baselines
      const baselineOffset = 70;
      const baselineGap = 10;
      const baselineCircleRadius = 7;
      const bPadding = 85;

      const drawBaseline = (x1: number, y1: number, x2: number, y2: number, isVertical: boolean) => {
         ctx.strokeStyle = '#92400e';
         ctx.lineWidth = 1;
         
         ctx.beginPath();
         if (isVertical) {
           ctx.moveTo(x1 - baselineGap/2, y1); ctx.lineTo(x2 - baselineGap/2, y2);
           ctx.moveTo(x1 + baselineGap/2, y1); ctx.lineTo(x2 + baselineGap/2, y2);
         } else {
           ctx.moveTo(x1, y1 - baselineGap/2); ctx.lineTo(x2, y2 - baselineGap/2);
           ctx.moveTo(x1, y1 + baselineGap/2); ctx.lineTo(x2, y2 + baselineGap/2);
         }
         ctx.stroke();
         
         ctx.fillStyle = '#ef4444';
         ctx.beginPath();
         ctx.arc(x1, y1, baselineCircleRadius, 0, Math.PI * 2);
         ctx.fill();
         ctx.stroke();

         ctx.beginPath();
         ctx.arc(x2, y2, baselineCircleRadius, 0, Math.PI * 2);
         ctx.fill();
         ctx.stroke();
      };
      
      drawBaseline(bPadding, BOARD_HEIGHT - baselineOffset, BOARD_WIDTH - bPadding, BOARD_HEIGHT - baselineOffset, false);
      drawBaseline(bPadding, baselineOffset, BOARD_WIDTH - bPadding, baselineOffset, false);
      drawBaseline(baselineOffset, bPadding, baselineOffset, BOARD_HEIGHT - bPadding, true);
      drawBaseline(BOARD_WIDTH - baselineOffset, bPadding, BOARD_WIDTH - baselineOffset, BOARD_HEIGHT - bPadding, true);

      // 4 Pockets
      ctx.fillStyle = '#1e293b';
      POCKETS.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, POCKET_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      });

      // Center Circle
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(BOARD_WIDTH / 2, BOARD_HEIGHT / 2, 45, 0, Math.PI * 2);
      ctx.stroke();

      // Render Coins
      for (const c of coins) {
        if (!c.active) continue;
        
        // Force striker position to match slider if not active
        if (c.type === 'striker' && !isTurnActive && !gameOver && currentPlayer === 'player') {
          c.x = BOARD_WIDTH / 2 + strikerPos;
        }

        // Draw shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.arc(c.x + 2, c.y + 3, c.radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw coin with gradient
        let isOverlapping = false;
        if (c.type === 'striker' && strikerPhase === 'positioning' && currentPlayer === 'player' && !isTurnActive && !gameOver) {
           for (const other of coins) {
              if (other.type === 'striker' || !other.active) continue;
              if (Math.hypot(c.x - other.x, c.y - other.y) < c.radius + other.radius) {
                 isOverlapping = true; break;
              }
           }
        }

        const coinGrad = ctx.createRadialGradient(c.x - c.radius/3, c.y - c.radius/3, c.radius/5, c.x, c.y, c.radius);
        if (c.type === 'striker') {
          if (isOverlapping) {
            coinGrad.addColorStop(0, '#fca5a5');
            coinGrad.addColorStop(1, '#ef4444');
            ctx.strokeStyle = '#fee2e2';
          } else if (strikerPhase === 'aiming' && currentPlayer === 'player' && !isTurnActive && !gameOver) {
            coinGrad.addColorStop(0, '#fef08a');
            coinGrad.addColorStop(1, '#eab308');
            ctx.strokeStyle = '#fef9c3';
          } else {
            coinGrad.addColorStop(0, '#38bdf8');
            coinGrad.addColorStop(1, '#0284c7');
            ctx.strokeStyle = '#e0f2fe';
          }
        } else if (c.type === 'queen') {
          coinGrad.addColorStop(0, '#f87171');
          coinGrad.addColorStop(1, '#dc2626');
        } else if (c.type === 'white') {
          coinGrad.addColorStop(0, '#ffffff');
          coinGrad.addColorStop(1, '#cbd5e1');
        } else {
          coinGrad.addColorStop(0, '#52525b');
          coinGrad.addColorStop(1, '#09090b');
        }

        ctx.fillStyle = coinGrad;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = c.type === 'striker' ? 2 : 1;
        if (c.type !== 'striker') ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.stroke();

        if (isOverlapping) {
           ctx.fillStyle = '#ffffff';
           ctx.font = 'bold 7px sans-serif';
           ctx.textAlign = 'center';
           ctx.textBaseline = 'middle';
           ctx.fillText('MOVE', c.x, c.y - 3);
           ctx.fillText('AWAY', c.x, c.y + 5);
        }
      }

      // Aiming Line
      if (!isTurnActive && !gameOver && dragState === 'dragging') {
        const striker = coins.find(c => c.type === 'striker');
        if (striker && striker.active) {
          const dx = dragStart.x - currentAim.x;
          const dy = dragStart.y - currentAim.y;
          const angle = Math.atan2(dy, dx);
          
          const pullDist = Math.sqrt(dx * dx + dy * dy);
          const maxPull = 150;
          const powerRatio = Math.min(pullDist / maxPull, 1);
          
          const lineLength = powerRatio * 150;
          const aimX = striker.x + Math.cos(angle) * lineLength;
          const aimY = striker.y + Math.sin(angle) * lineLength;

          ctx.strokeStyle = `rgba(${255 * powerRatio}, ${255 * (1 - powerRatio)}, 0, 0.8)`;
          ctx.lineWidth = 3;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(striker.x, striker.y);
          ctx.lineTo(aimX, aimY);
          ctx.stroke();
          
          // Draw power indicator circle at striker
          ctx.beginPath();
          ctx.arc(striker.x, striker.y, striker.radius + (powerRatio * 5), 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.setLineDash([]);
        }
    }
  }, true);

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    // Use offsetX/Y to avoid CSS transform skewing
    return {
      x: (e.nativeEvent.offsetX / canvas.clientWidth) * canvas.width,
      y: (e.nativeEvent.offsetY / canvas.clientHeight) * canvas.height
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameOver || isTurnActive || showRules || currentPlayer === 'ai') return;
    const { x, y } = getCanvasCoords(e);
    
    if (strikerPhase === 'positioning') {
       setDragState('dragging_striker');
       setStrikerPos(Math.min(115, Math.max(-115, x - BOARD_WIDTH / 2)));
    } else {
       const striker = coinsRef.current.find(c => c.type === 'striker');
       if (striker) {
          const dx = x - striker.x;
          const dy = y - striker.y;
          if (Math.sqrt(dx*dx + dy*dy) < striker.radius + 15) {
             setStrikerPhase('positioning');
             setDragState('dragging_striker');
             return;
          }
       }
       setDragState('dragging');
       setDragStart({ x, y });
       setCurrentAim({ x, y });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragState === 'idle') return;
    const { x, y } = getCanvasCoords(e);
    if (dragState === 'dragging_striker') {
       setStrikerPos(Math.min(115, Math.max(-115, x - BOARD_WIDTH / 2)));
    } else {
       setCurrentAim({ x, y });
    }
  };

  const handlePointerUp = () => {
    if (dragState === 'dragging_striker') {
       const striker = coinsRef.current.find(c => c.type === 'striker');
       let overlap = false;
       if (striker) {
          for (const c of coinsRef.current) {
             if (c.type === 'striker' || !c.active) continue;
             const dx = c.x - striker.x;
             const dy = c.y - striker.y;
             if (Math.sqrt(dx*dx + dy*dy) < c.radius + striker.radius) {
                overlap = true;
                break;
             }
          }
       }

       if (overlap) {
          toast.error('Cannot place striker over a coin!', { id: 'overlap-error' });
       } else {
          setStrikerPhase('aiming');
       }
    } else if (dragState === 'dragging') {
      const striker = coinsRef.current.find(c => c.type === 'striker');
      if (striker) {
        const dx = dragStart.x - currentAim.x;
        const dy = dragStart.y - currentAim.y;
        const pullDist = Math.sqrt(dx * dx + dy * dy);
        
        if (pullDist > 10) { 
           const maxPull = 150;
           const forceMagnitude = Math.min(pullDist / maxPull, 1) * 22; 
           
           const angle = Math.atan2(dy, dx);
           striker.vx = Math.cos(angle) * forceMagnitude;
           striker.vy = Math.sin(angle) * forceMagnitude;
           setIsTurnActive(true);
           setStrikerPhase('positioning');
           setTimeLeft(60);
        }
      }
    }
    setDragState('idle');
  };

  const handleReplay = () => {
    setScore({ white: 0, black: 0 });
    setGameOver(false);
    setRewardClaimed(false);
    setStrikerPos(0);
    setStrikerPhase('positioning');
    setDragState('idle');
    setTimeLeft(60);
    setCurrentPlayer('player');
    rulesRef.current = { queenStatus: 'unpocketed', queenPocketedBy: null, dueOwed: { white: 0, black: 0 } };
    turnScoreRef.current = { white: 0, black: 0, queen: false, foul: false };
    coinsRef.current = createInitialCoins();
    setIsTurnActive(false);
  };

  return (
    <GameWrapper title="Real Carrom 3D" gameId="carrom" mode={mode} stake={stake} onBack={onBack} isFullscreen>
      <div className="flex flex-col lg:flex-row items-center justify-center gap-8 w-full max-w-5xl relative">
        
        {/* GAME OVER OVERLAY */}
        {gameOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in rounded-3xl">
            <div className="bg-[#0f172a] border border-amber-500/30 p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm w-full mx-4">
              <div className="text-6xl mb-4">{score.white >= 9 ? '🏆' : '❌'}</div>
              <h2 className={`text-3xl font-black uppercase tracking-widest text-center mb-2 ${score.white >= 9 ? 'text-emerald-400' : 'text-rose-500'}`}>
                {score.white >= 9 ? 'YOU WIN!' : 'GAME OVER'}
              </h2>
              <p className="text-slate-300 text-sm text-center mb-6 font-bold">
                White Pocketed: {score.white} / 9
              </p>
              
              {score.white >= 9 && (
                <div className="bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 mb-6">
                  🪙 +50 Coins Added!
                </div>
              )}

              <div className="flex gap-3 w-full">
                <button
                  onClick={handleReplay}
                  className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg"
                >
                  Replay
                </button>
                <button
                  onClick={onBack}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all border border-slate-700"
                >
                  Exit
                </button>
              </div>
            </div>
          </div>
        )}

        {/* RULES OVERLAY */}
        {showRules && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in rounded-3xl">
            <div className="bg-slate-900 border border-indigo-500/30 p-8 rounded-3xl shadow-2xl flex flex-col max-w-md w-full mx-4">
              <h2 className="text-2xl font-black uppercase tracking-wider text-center text-white mb-6">
                🎯 How to Play
              </h2>
              
              <ul className="space-y-4 mb-8">
                <li className="flex items-start gap-3">
                  <span className="text-amber-500 font-bold">1.</span>
                  <p className="text-slate-300 text-sm">You play as <strong className="text-white">White</strong>. The AI plays as <strong className="text-slate-500">Black</strong>.</p>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-amber-500 font-bold">2.</span>
                  <p className="text-slate-300 text-sm">Drag anywhere on the board to <strong>position your striker</strong> along the baseline.</p>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-amber-500 font-bold">3.</span>
                  <p className="text-slate-300 text-sm">Release to lock position (striker turns yellow). Then drag backwards to <strong>aim and shoot</strong>.</p>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-amber-500 font-bold">4.</span>
                  <p className="text-slate-300 text-sm"><strong>The Queen:</strong> If you pocket the red Queen, you must pocket another piece on your next shot to "cover" it, else it respawns!</p>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-amber-500 font-bold">5.</span>
                  <p className="text-slate-300 text-sm"><strong>Fouls:</strong> Pocketing the striker costs you a turn AND returns one of your scored pieces to the board!</p>
                </li>
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

        <div className="relative perspective-[1200px] w-full max-w-[600px]">
          <canvas
            ref={canvasRef}
            width={400}
            height={400}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            style={{
              transform: "rotateX(20deg) rotateZ(0deg) translateY(-5px)",
              transformStyle: "preserve-3d"
            }}
            className={`rounded-[2rem] border-8 border-[#3a1301] shadow-[0_40px_60px_-15px_rgba(0,0,0,0.8)] bg-amber-950 w-full object-contain touch-none ${dragState === 'idle' && currentPlayer === 'player' ? 'cursor-grab' : currentPlayer === 'ai' ? 'cursor-not-allowed' : 'cursor-grabbing'}`}
          />
        </div>

        <div className="flex flex-col items-center gap-3 lg:gap-4 glass-panel p-4 lg:p-6 rounded-3xl border border-slate-800 w-full max-w-xs h-auto max-h-[80vh] overflow-y-auto custom-scrollbar">
          
          {/* Turn Indicator */}
          <div className="w-full flex justify-center mb-2">
             <div className={`px-4 py-2 rounded-full font-black text-sm uppercase shadow-lg transition-colors ${currentPlayer === 'player' ? 'bg-emerald-500 text-white animate-pulse' : 'bg-rose-500 text-white'}`}>
                {currentPlayer === 'player' ? 'Your Turn' : 'AI Turn'}
             </div>
          </div>

          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 mt-2">SCORE BOARD</h3>

          <div className="w-full grid grid-cols-3 gap-2 text-center bg-slate-900/80 p-4 rounded-xl border border-slate-800">
            <div className="flex flex-col items-center">
              <div className="w-4 h-4 rounded-full bg-white mb-2 shadow-sm border border-slate-300"></div>
              <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">White</p>
              <p className="text-xl font-black text-amber-400 mt-1">{score.white}</p>
            </div>
            
            <div className="flex flex-col items-center border-l border-r border-slate-700 px-2">
              <div className="w-4 h-4 rounded-full bg-rose-500 mb-2 shadow-sm border border-rose-300"></div>
              <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Queen</p>
              <p className="text-[10px] font-black text-amber-400 mt-1 uppercase">
                 {rulesRef.current.queenStatus === 'covered' ? 'Covered' : rulesRef.current.queenStatus === 'pocketed_needs_cover' ? 'Needs Cover' : 'Unpocketed'}
              </p>
            </div>

            <div className="flex flex-col items-center">
              <div className="w-4 h-4 rounded-full bg-slate-950 mb-2 shadow-sm border border-slate-800"></div>
              <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Black</p>
              <p className="text-xl font-black text-slate-200 mt-1">{score.black}</p>
            </div>
          </div>
          <div className="mt-4 w-full flex flex-col items-center">
            <div className={`text-4xl font-black tabular-nums transition-colors ${timeLeft <= 10 ? 'text-rose-500 animate-pulse' : 'text-slate-200'}`}>
              00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
              {currentPlayer === 'ai' ? 'AI THINKING...' : 'TURN TIMER'}
            </p>
            
            <p className="text-xs text-slate-400 italic text-center mt-4 px-2">
              {currentPlayer === 'ai' 
                ? 'Wait for opponent to shoot.' 
                : strikerPhase === 'positioning' 
                  ? 'Drag to position striker.' 
                  : 'Tap striker to reposition. Drag board to shoot!'}
            </p>
          </div>
        </div>
      </div>
    </GameWrapper>
  );
};
