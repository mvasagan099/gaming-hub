import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameWrapper } from '../../components/GameWrapper';
import confetti from 'canvas-confetti';
import toast from 'react-hot-toast';
import { claimPracticeReward } from '../../services/api/practiceReward';
import { useGameLoop } from '../shared/hooks/useGameLoop';
import { MultiplayerMatchPanel } from '../shared/components/MultiplayerMatchPanel';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import CarromMultiplayerDriver from './CarromMultiplayerDriver';
import type { CarromCoin, CarromStriker, CarromPlayer } from '@gaming-hub/game-engine';

interface CarromGameProps {
  mode: 'ai' | 'multiplayer';
  stake: number;
  onBack: () => void;
}

type CoinType = 'striker' | 'queen' | 'white' | 'black';

interface LocalCoin {
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
const POCKET_RADIUS = 16;
const POCKETS = [
  { x: 32, y: 32 },
  { x: BOARD_WIDTH - 32, y: 32 },
  { x: 32, y: BOARD_HEIGHT - 32 },
  { x: BOARD_WIDTH - 32, y: BOARD_HEIGHT - 32 },
];

const STRIKER_START_X = BOARD_WIDTH / 2;
const STRIKER_START_Y = BOARD_HEIGHT - 62;

function mapServerToLocal(
  x: number,
  y: number,
  vx: number,
  vy: number,
  mySeat: number | null
): { x: number; y: number; vx: number; vy: number } {
  const scale = BOARD_WIDTH / 600;
  if (mySeat === 1) {
    return {
      x: (600 - x) * scale,
      y: (600 - y) * scale,
      vx: -vx * scale,
      vy: -vy * scale,
    };
  }
  return {
    x: x * scale,
    y: y * scale,
    vx: vx * scale,
    vy: vy * scale,
  };
}

function createInitialCoins(): LocalCoin[] {
  const coins: LocalCoin[] = [];
  const cx = BOARD_WIDTH / 2;
  const cy = BOARD_HEIGHT / 2;
  const radius = 20;

  coins.push({ id: 'striker', type: 'striker', x: STRIKER_START_X, y: STRIKER_START_Y, vx: 0, vy: 0, radius: 11, mass: 2.5, color: '#0284c7', active: true });

  const types: CoinType[] = [
    "queen",
    "white", "white", "white", "white", "white", "white",
    "white", "white", "white",
    "black", "black", "black", "black", "black", "black", "black", "black", "black",
  ];

  const positions: { x: number; y: number }[] = [{ x: cx, y: cy }];
  
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI * 2) / 6;
    positions.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
  
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI * 2) / 12;
    positions.push({ x: cx + Math.cos(angle) * radius * 2, y: cy + Math.sin(angle) * radius * 2 });
  }

  for (let i = 0; i < positions.length && i < types.length; i++) {
    const type = types[i];
    coins.push({
      id: `coin-${i}`,
      type: type ?? 'white',
      x: positions[i].x,
      y: positions[i].y,
      vx: 0,
      vy: 0,
      radius: type === 'queen' ? 10 : 9,
      mass: 1,
      color: type === 'queen' ? '#dc2626' : type === 'white' ? '#ffffff' : '#09090b',
      active: true
    });
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
  
  const coinsRef = useRef<LocalCoin[]>(createInitialCoins());
  const rulesRef = useRef({
    queenStatus: 'unpocketed' as 'unpocketed' | 'pocketed_needs_cover' | 'covered',
    queenPocketedBy: null as 'player' | 'ai' | null,
    dueOwed: { white: 0, black: 0 }
  });
  const turnScoreRef = useRef({ white: 0, black: 0, queen: false, foul: false });

  const mySeat = useMultiplayerStore(s => s.mySeat);
  const room = useMultiplayerStore(s => s.room);
  const driverRef = useRef<CarromMultiplayerDriver | null>(null);
  const multiplayerInitializedRef = useRef(false);

  useEffect(() => {
    if (mode === 'multiplayer' && room && !multiplayerInitializedRef.current) {
      const names = room.players.map(p => p.displayName || `Player ${(p.seat ?? 0) + 1}`);
      names.sort((a, b) => {
        const seatA = room.players.find(p => p.displayName === a)?.seat ?? 0;
        const seatB = room.players.find(p => p.displayName === b)?.seat ?? 0;
        return seatA - seatB;
      });
      
      const driver = new CarromMultiplayerDriver(mySeat, names);
      driverRef.current = driver;
      
      driver.setOnStateUpdate((state) => {
        console.log("[CarromGame] State update from server:", {
          mySeat,
          currentSeat: state.currentSeat,
          strikerPlacementPhase: state.strikerPlacementPhase,
          strikerPlacementSeat: state.strikerPlacementSeat,
          coins: state.coins.length,
          activeCoins: state.coins.filter(c => !c.pocketed).length,
          strikerX: state.striker?.x,
          strikerY: state.striker?.y,
          finished: state.finished
        });
        
        const serverCoins = state.coins;
        const mappedCoins: LocalCoin[] = serverCoins.map(c => {
          const rawType = c.type as string;
          const pos = mapServerToLocal(c.x, c.y, c.vx, c.vy, mySeat);
          return {
            id: c.id,
            type: rawType === 'striker' ? 'striker' : rawType === 'queen' ? 'queen' : (c.type as CoinType),
            x: pos.x,
            y: pos.y,
            vx: pos.vx,
            vy: pos.vy,
            radius: rawType === 'queen' ? 10 : rawType === 'striker' ? 11 : 9,
            mass: rawType === 'striker' ? 2.5 : 1,
            color: rawType === 'queen' ? '#dc2626' : rawType === 'white' ? '#ffffff' : '#09090b',
            active: !c.pocketed
          };
        });

        if (state.striker) {
          const pos = mapServerToLocal(state.striker.x, state.striker.y, state.striker.vx, state.striker.vy, mySeat);
          mappedCoins.push({
            id: 'striker',
            type: 'striker',
            x: pos.x,
            y: pos.y,
            vx: pos.vx,
            vy: pos.vy,
            radius: 11,
            mass: 2.5,
            color: '#0284c7',
            active: !state.striker.pocketed
          });
        }
        
        coinsRef.current = mappedCoins;
        
        const myPlayer = state.players.find(p => p.seat === mySeat);
        const opponentPlayer = state.players.find(p => p.seat !== mySeat);
        
        setScore({
          white: mySeat === 0 ? (myPlayer?.score ?? 0) : (opponentPlayer?.score ?? 0),
          black: mySeat === 1 ? (myPlayer?.score ?? 0) : (opponentPlayer?.score ?? 0)
        });
        
        const isMyTurn = state.currentSeat === mySeat;
        const isPlacement = state.strikerPlacementPhase;
        
        setCurrentPlayer(isMyTurn ? 'player' : 'ai');
        setStrikerPhase(isPlacement ? 'positioning' : 'aiming');
        
        if (state.finished) {
          setGameOver(true);
        }
        
        setUiTrigger(t => t + 1);
      });
      
      driver.setOnCoinPocketed((coinId, coinType, _pocketIndex) => {
        console.log("[CarromGame] Coin pocketed:", coinId, coinType);
        const coin = coinsRef.current.find(c => c.id === coinId);
        if (coin) {
          coin.active = false;
          coin.vx = 0;
          coin.vy = 0;
        }
        confetti();
      });
      
      driver.setOnStrikerPlaced((x, y, _seat) => {
        console.log("[CarromGame] Striker placed:", x, y);
        const striker = coinsRef.current.find(c => c.type === 'striker');
        if (striker) {
          const pos = mapServerToLocal(x, y, 0, 0, mySeat);
          striker.x = pos.x;
          striker.y = pos.y;
        }
        setStrikerPhase('aiming');
      });
      
      driver.setOnFoul((reason) => {
        toast.error(`Foul: ${reason}`, { id: 'foul' });
      });
      
      driver.setOnWin((winnerSeat) => {
        const isMe = winnerSeat === mySeat;
        setGameOver(true);
        if (isMe) {
          confetti({ particleCount: 100 });
        }
      });
      
      driver.setOnTurnChange((newSeat) => {
        console.log("[CarromGame] onTurnChange called with newSeat:", newSeat, "mySeat:", mySeat, "currentSeat from driver.getCurrentSeat():", driverRef.current?.getCurrentSeat());
        // This should match what's coming through state.currentSeat
      });
      
      driver.start();
      multiplayerInitializedRef.current = true;
      
      return () => {
        driver.stop();
        driverRef.current = null;
        multiplayerInitializedRef.current = false;
      };
    }
  }, [mode, room, mySeat]);

  useEffect(() => {
    if (gameOver || mode === 'multiplayer') return;
    
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
         striker.y = 70;
         
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
  }, [currentPlayer, isTurnActive, gameOver, showRules, mode]);

  useEffect(() => {
    if (gameOver || mode === 'multiplayer') return;
    if (gameOver || score.white >= 9 || score.black >= 9) return;
    const rules = rulesRef.current;
    if (rules.queenStatus === 'covered' && (score.white >= 9 || score.black >= 9) && !rewardClaimed) {
      setRewardClaimed(true);
      if (score.white >= 9) setTimeout(() => void claimPracticeReward('carrom'), 1000);
    }
  }, [gameOver, score, rewardClaimed, uiTrigger, mode]);

  useEffect(() => {
    if (gameOver || mode === 'multiplayer') return;
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
  }, [gameOver, isTurnActive, showRules, currentPlayer, mode]);

  useGameLoop((dt) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
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

      if (c.x - c.radius < BORDER_SIZE) { c.x = BORDER_SIZE + c.radius; c.vx *= -1; }
      if (c.x + c.radius > BOARD_WIDTH - BORDER_SIZE) { c.x = BOARD_WIDTH - BORDER_SIZE - c.radius; c.vx *= -1; }
      if (c.y - c.radius < BORDER_SIZE) { c.y = BORDER_SIZE + c.radius; c.vy *= -1; }
      if (c.y + c.radius > BOARD_HEIGHT - BORDER_SIZE) { c.y = BOARD_HEIGHT - BORDER_SIZE - c.radius; c.vy *= -1; }
    }

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
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          c1.x -= nx * (overlap / 2);
          c1.y -= ny * (overlap / 2);
          c2.x += nx * (overlap / 2);
          c2.y += ny * (overlap / 2);

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

    if (mode === 'ai') {
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

      if (isTurnActive && !anyMoving) {
        setIsTurnActive(false);

        const rules = rulesRef.current;
        const turnStats = turnScoreRef.current;
        let nextPlayer = currentPlayer;

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

        if (turnStats.queen) {
           rules.queenStatus = 'pocketed_needs_cover';
           rules.queenPocketedBy = currentPlayer;
           toast('Queen pocketed! Must cover on next shot.', { id: 'q-pocket' });
        }

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

        const striker = coins.find(c => c.type === 'striker');
        if (striker) {
          striker.x = BOARD_WIDTH / 2 + (nextPlayer === 'player' ? strikerPos : 0);
          striker.y = nextPlayer === 'player' ? STRIKER_START_Y : 62;
          striker.vx = 0;
          striker.vy = 0;
        }
        setStrikerPhase('positioning');
        setTimeLeft(60);
      }
    } else if (mode === 'multiplayer') {
      if (isTurnActive && !anyMoving) {
        setIsTurnActive(false);
        setStrikerPhase('positioning');
      }
    }

    renderBoard(ctx, coins, dragState, dragStart, currentAim, strikerPhase, currentPlayer, isTurnActive, gameOver, strikerPos);

  }, true);

  const renderBoard = useCallback((
    ctx: CanvasRenderingContext2D,
    coins: LocalCoin[],
    dragState: string,
    dragStart: { x: number; y: number },
    currentAim: { x: number; y: number },
    strikerPhase: string,
    currentPlayer: string,
    isTurnActive: boolean,
    gameOver: boolean,
    strikerPos: number
  ) => {
    ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    const width = BOARD_WIDTH;
    const height = BOARD_HEIGHT;
    const cx = width / 2;
    const cy = height / 2;
    const dark = '#1a1008';
    const redColor = '#cc1a1a';
    const bgColor = '#f5dba0';

    const frameRadius = 24;
    const frameColor = '#2e1806';

    ctx.fillStyle = frameColor;
    ctx.beginPath();
    ctx.moveTo(frameRadius, 0);
    ctx.lineTo(width - frameRadius, 0);
    ctx.quadraticCurveTo(width, 0, width, frameRadius);
    ctx.lineTo(width, height - frameRadius);
    ctx.quadraticCurveTo(width, height, width - frameRadius, height);
    ctx.lineTo(frameRadius, height);
    ctx.quadraticCurveTo(0, height, 0, height - frameRadius);
    ctx.lineTo(0, frameRadius);
    ctx.quadraticCurveTo(0, 0, frameRadius, 0);
    ctx.closePath();
    ctx.fill();

    const sm = 18;

    ctx.fillStyle = bgColor;
    ctx.fillRect(sm, sm, width - sm * 2, height - sm * 2);

    ctx.save();
    ctx.rect(sm, sm, width - sm * 2, height - sm * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(180, 120, 40, 0.07)';
    ctx.lineWidth = 1.5;
    for (let gy = sm + 6; gy < height - sm; gy += 8) {
      ctx.beginPath();
      ctx.moveTo(sm, gy);
      ctx.lineTo(width - sm, gy);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.8;
    ctx.strokeRect(sm + 1, sm + 1, width - sm * 2 - 2, height - sm * 2 - 2);

    const pocketR = 13;
    const pocketHole = 16;
    const pc = sm + 14;
    const pocketPos = [
      { x: pc, y: pc },
      { x: width - pc, y: pc },
      { x: pc, y: height - pc },
      { x: width - pc, y: height - pc },
    ];
    pocketPos.forEach((p) => {
      ctx.fillStyle = '#0d0804';
      ctx.beginPath();
      ctx.arc(p.x, p.y, pocketHole, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#e0d8c8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, pocketR, 0, Math.PI * 2);
      ctx.stroke();
    });

    const capsuleOffset = 62;
    const capsuleHalf = 8;
    const capStart = 86;
    const capEnd = 314;
    const capRedR = 9;

    const drawCapsule = (ax: number, ay: number, bx: number, by: number, isVert: boolean) => {
      ctx.strokeStyle = dark;
      ctx.fillStyle = bgColor;

      ctx.beginPath();
      if (!isVert) {
        ctx.rect(ax, ay - capsuleHalf, bx - ax, capsuleHalf * 2);
      } else {
        ctx.rect(ax - capsuleHalf, ay, capsuleHalf * 2, by - ay);
      }
      ctx.fill();

      ctx.lineWidth = 2.5;
      ctx.beginPath();
      if (!isVert) {
        ctx.moveTo(ax, ay - capsuleHalf);
        ctx.lineTo(bx, ay - capsuleHalf);
      } else {
        ctx.moveTo(ax - capsuleHalf, ay);
        ctx.lineTo(ax - capsuleHalf, by);
      }
      ctx.stroke();

      ctx.lineWidth = 1.2;
      ctx.beginPath();
      if (!isVert) {
        ctx.moveTo(ax, ay + capsuleHalf);
        ctx.lineTo(bx, ay + capsuleHalf);
      } else {
        ctx.moveTo(ax + capsuleHalf, ay);
        ctx.lineTo(ax + capsuleHalf, by);
      }
      ctx.stroke();

      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (!isVert) {
        ctx.arc(ax, ay, capsuleHalf, -Math.PI / 2, Math.PI / 2, true);
        ctx.arc(bx, ay, capsuleHalf, Math.PI / 2, -Math.PI / 2, true);
      } else {
        ctx.arc(ax, ay, capsuleHalf, -Math.PI, 0, true);
        ctx.arc(ax, by, capsuleHalf, 0, Math.PI, true);
      }
      ctx.stroke();

      [[ax, ay], [bx, by]].forEach(([rcx, rcy]) => {
        ctx.fillStyle = redColor;
        ctx.strokeStyle = dark;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(rcx, rcy, capRedR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    };

    drawCapsule(capStart, sm + capsuleOffset - sm, capEnd, sm + capsuleOffset - sm, false);
    drawCapsule(capStart, height - (sm + capsuleOffset - sm), capEnd, height - (sm + capsuleOffset - sm), false);
    drawCapsule(sm + capsuleOffset - sm, capStart, sm + capsuleOffset - sm, capEnd, true);
    drawCapsule(width - (sm + capsuleOffset - sm), capStart, width - (sm + capsuleOffset - sm), capEnd, true);

    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 56, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#c41a1a';
    ctx.beginPath();
    ctx.arc(cx, cy, 55, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.arc(cx, cy, 44, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, 44, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#1a0808';
    ctx.beginPath();
    ctx.arc(cx, cy, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = dark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#cc1a1a';
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    for (const c of coins) {
      if (!c.active) continue;
      
      if (c.type === 'striker' && !isTurnActive && !gameOver) {
        if (currentPlayer === 'player') {
          c.x = BOARD_WIDTH / 2 + strikerPos;
          // In multiplayer, Player 0 places at bottom, Player 1 at top
          if (mode === 'multiplayer') {
            c.y = mySeat === 0 ? STRIKER_START_Y : 62;
          } else {
            c.y = STRIKER_START_Y;
          }
        } else {
          c.y = 62;
        }
      }

      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(c.x + 2, c.y + 3, c.radius, 0, Math.PI * 2);
      ctx.fill();

      let isOverlapping = false;
      if (c.type === 'striker' && strikerPhase === 'positioning' && currentPlayer === 'player' && !isTurnActive && !gameOver) {
         for (const other of coins) {
            if (other.type === 'striker' || !other.active) continue;
            if (Math.hypot(c.x - other.x, c.y - other.y) < c.radius + other.radius) {
               isOverlapping = true; break;
            }
         }
      }

      if (c.type === 'striker') {
        const grad = ctx.createRadialGradient(c.x - c.radius * 0.3, c.y - c.radius * 0.3, c.radius * 0.1, c.x, c.y, c.radius);
        if (isOverlapping) {
          grad.addColorStop(0, '#fca5a5'); grad.addColorStop(1, '#ef4444');
        } else if (strikerPhase === 'aiming' && currentPlayer === 'player' && !isTurnActive && !gameOver) {
          grad.addColorStop(0, '#fef08a'); grad.addColorStop(1, '#eab308');
        } else {
          grad.addColorStop(0, '#7dd3fc'); grad.addColorStop(1, '#0284c7');
        }
        ctx.fillStyle = grad;
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        if (isOverlapping) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 6px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('MOVE', c.x, c.y);
        }
      } else if (c.type === 'queen') {
        ctx.fillStyle = '#cc1a1a';
        ctx.strokeStyle = '#8b0000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,180,180,0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radius * 0.55, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const isWhite = c.type === 'white';
        const outerColor = isWhite ? '#e8c990' : '#2a1205';
        const innerColor = isWhite ? '#f5dba0' : '#1a0808';
        const ringColor = isWhite ? '#1a0808' : '#8a6a40';
        const highlightColor = isWhite ? 'rgba(255,255,255,0.5)' : 'rgba(180,120,50,0.25)';

        ctx.fillStyle = outerColor;
        ctx.strokeStyle = '#1a1008';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = ringColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radius * 0.65, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = innerColor;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radius * 0.55, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = ringColor;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radius * 0.18, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = highlightColor;
        ctx.beginPath();
        ctx.arc(c.x - c.radius * 0.3, c.y - c.radius * 0.3, c.radius * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
    }

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
        
        ctx.beginPath();
        ctx.arc(striker.x, striker.y, striker.radius + (powerRatio * 5), 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.setLineDash([]);
      }
    }
  }, []);

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameOver || isTurnActive || showRules) return;
    
    if (mode === 'multiplayer') {
      if (!driverRef.current?.isMyTurn()) return;
      if (driverRef.current.canPlaceStriker()) {
        const striker = coinsRef.current.find(c => c.type === 'striker');
        if (striker) {
          driverRef.current.sendPlaceStriker(striker.x);
        }
      }
    }
    if (mode === 'ai' && currentPlayer === 'ai') return;
    
    const { x, y } = getCanvasCoords(e);
    
    const striker = coinsRef.current.find(c => c.type === 'striker');
    let overlap = false;
    if (striker) {
       for (const c of coinsRef.current) {
          if (c.type === 'striker' || !c.active) continue;
          const dx = c.x - striker.x;
          const dy = c.y - striker.y;
          if (Math.hypot(dx, dy) < c.radius + striker.radius) {
             overlap = true;
             break;
          }
       }
    }

    if (overlap) {
       toast.error('Cannot shoot! Reposition striker off overlapping coins first using the slider.', { id: 'overlap-error' });
       return;
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
      console.warn("Failed to set pointer capture", err);
    }

    setDragState('dragging');
    setDragStart({ x, y });
    setCurrentAim({ x, y });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragState !== 'dragging') return;
    const { x, y } = getCanvasCoords(e);
    setCurrentAim({ x, y });
  };

  const handlePointerUp = () => {
    if (dragState === 'dragging') {
      const striker = coinsRef.current.find(c => c.type === 'striker');
      if (striker) {
        const dx = dragStart.x - currentAim.x;
        const dy = dragStart.y - currentAim.y;
        const pullDist = Math.hypot(dx, dy);
        
         if (pullDist > 10) { 
           const maxPull = 150;
           const forceMagnitude = Math.min(pullDist / maxPull, 1) * 22;
           
           const angle = Math.atan2(dy, dx);
           const power = Math.min(pullDist / maxPull, 1);
           
           if (mode === 'multiplayer' && driverRef.current) {
             driverRef.current.sendStrike(angle, power);
             
             striker.vx = Math.cos(angle) * forceMagnitude;
             striker.vy = Math.sin(angle) * forceMagnitude;
             setIsTurnActive(true);
             setStrikerPhase('positioning');
             setTimeLeft(60);
           } else {
             striker.vx = Math.cos(angle) * forceMagnitude;
             striker.vy = Math.sin(angle) * forceMagnitude;
             setIsTurnActive(true);
             setStrikerPhase('positioning');
             setTimeLeft(60);
           }
         }
      }
    }
    setDragState('idle');
  };

  const handleStrikerPosChange = (val: number) => {
    setStrikerPos(val);
    const striker = coinsRef.current.find(c => c.type === 'striker');
    if (striker) { 
      striker.x = BOARD_WIDTH / 2 + val; 
      striker.y = STRIKER_START_Y; 
    }
  };

  const handleConfirmStrikerPlacement = () => {
    if (mode === 'multiplayer' && driverRef.current && strikerPhase === 'positioning') {
      const striker = coinsRef.current.find(c => c.type === 'striker');
      if (striker) {
        driverRef.current.sendPlaceStriker(striker.x);
        setStrikerPhase('aiming');
      }
    }
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
      <div className="flex flex-col lg:flex-row items-center lg:items-start justify-center gap-6 lg:gap-8 w-full max-w-6xl relative h-full overflow-y-auto lg:overflow-y-visible py-4 px-2 custom-scrollbar">
        
        {gameOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in rounded-3xl">
            <div className="bg-[#0f172a] border border-amber-500/30 p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm w-full mx-4">
              <div className="text-6xl mb-4">{score.white >= 9 ? '🏆' : '❌'}</div>
              <h2 className={`text-3xl font-black uppercase tracking-widest text-center mb-2 ${score.white >= 9 ? 'text-emerald-400' : 'text-rose-500'}`}>
                {score.white >= 9 ? 'YOU WIN!' : 'GAME OVER'}
              </h2>
              <p className="text-slate-300 text-sm text-center mb-6 font-bold">
                White: {score.white} / 9 | Black: {score.black} / 9
              </p>
              
              {score.white >= 9 && mode === 'ai' && (
                <div className="bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 mb-6">
                  🪙 +50 Coins Added!
                </div>
              )}

              <div className="flex gap-3 w-full">
                {mode === 'ai' && (
                  <button
                    onClick={handleReplay}
                    className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg"
                  >
                    Replay
                  </button>
                )}
                {mode === 'multiplayer' && (
                  <button
                    onClick={() => useMultiplayerStore.getState().requestRematch()}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg"
                  >
                    Rematch
                  </button>
                )}
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

        {showRules && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in rounded-3xl">
            <div className="bg-slate-900 border border-indigo-500/30 p-8 rounded-3xl shadow-2xl flex flex-col max-w-md w-full mx-4">
              <h2 className="text-2xl font-black uppercase tracking-wider text-center text-white mb-6">
                🎯 How to Play
              </h2>
              
              <ul className="space-y-4 mb-8">
                <li className="flex items-start gap-3">
                  <span className="text-amber-500 font-bold">1.</span>
                  <p className="text-slate-300 text-sm">
                    {mode === 'multiplayer' 
                      ? <>You play as <strong className="text-white">{mySeat === 0 ? 'White' : 'Black'}</strong>. Your opponent plays as <strong className="text-slate-500">{mySeat === 0 ? 'Black' : 'White'}</strong>.</>
                      : <>You play as <strong className="text-white">White</strong>. The AI plays as <strong className="text-slate-500">Black</strong>.</>
                    }
                  </p>
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

        <div className="flex flex-col items-center gap-3 w-full" style={{ maxWidth: '440px' }}>
          <div className="relative w-full" style={{ aspectRatio: '1' }}>
            <canvas
              ref={canvasRef}
              width={400}
              height={400}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`w-full h-full object-contain touch-none shadow-[0_20px_60px_rgba(0,0,0,0.7)] rounded-[28px] ${dragState === 'idle' && currentPlayer === 'player' ? 'cursor-grab' : currentPlayer === 'ai' ? 'cursor-not-allowed' : 'cursor-grabbing'}`}
            />
          </div>

          {!isTurnActive && !gameOver && strikerPhase === 'positioning' && currentPlayer === 'player' && (
            <div className="w-full flex flex-col items-center gap-2">
              <div
                className="relative w-full flex items-center px-4"
                style={{ height: '48px' }}
              >
                <div
                  className="absolute inset-x-4 rounded-full"
                  style={{
                    height: '34px',
                    background: 'linear-gradient(180deg, #c48a3c 0%, #e8a84a 40%, #9a6120 100%)',
                    border: '2px solid #6b3d0f',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.45), inset 0 2px 4px rgba(255,255,255,0.15)',
                  }}
                >
                  <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-full" style={{ height: '8px', background: 'rgba(0,0,0,0.2)' }} />
                </div>

                <input
                  type="range"
                  min={-115}
                  max={115}
                  value={strikerPos}
                  onChange={(e) => handleStrikerPosChange(Number(e.target.value))}
                  className="relative w-full h-full opacity-0 cursor-grab z-10"
                  style={{ WebkitAppearance: 'none' }}
                />

                <div
                  className="absolute top-1/2 -translate-y-1/2 pointer-events-none z-20 flex items-center justify-center rounded-full shadow-lg"
                  style={{
                    width: '36px',
                    height: '36px',
                    left: `calc(${((strikerPos + 115) / 230) * 100}% - ${((strikerPos + 115) / 230) * 36}px + 0px)`,
                    background: 'radial-gradient(circle at 35% 35%, #7dd3fc, #0284c7)',
                    border: '2.5px solid rgba(255,255,255,0.6)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                  }}
                />
              </div>
              
              
              <p className="text-xs text-slate-400 font-semibold tracking-widest uppercase">Slide to position striker</p>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-3 lg:gap-4 glass-panel p-4 lg:p-6 rounded-3xl border border-slate-800 w-full max-w-[270px] h-auto max-h-[80vh] overflow-y-auto custom-scrollbar">
          
          <div className="w-full flex justify-center mb-2">
             <div className={`px-4 py-2 rounded-full font-black text-sm uppercase shadow-lg transition-colors ${currentPlayer === 'player' ? 'bg-emerald-500 text-white animate-pulse' : 'bg-rose-500 text-white'}`}>
                {mode === 'multiplayer' 
                  ? (currentPlayer === 'player' ? 'Your Turn' : 'Opponent\'s Turn')
                  : (currentPlayer === 'player' ? 'Your Turn' : 'AI Turn')
                }
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
          
          {mode === 'ai' && (
            <>
              <div className="mt-4 w-full flex flex-col items-center">
                <div className={`text-4xl font-black tabular-nums transition-colors ${timeLeft <= 10 ? 'text-rose-500 animate-pulse' : 'text-slate-200'}`}>
                  00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}
                </div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                  {currentPlayer === 'ai' ? 'AI THINKING...' : 'TURN TIMER'}
                </p>
              </div>
            </>
          )}
          
          <p className="text-xs text-slate-400 italic text-center mt-4 px-2">
            {currentPlayer === 'ai' 
              ? 'Wait for opponent to shoot.' 
              : strikerPhase === 'positioning' 
                ? 'Drag to position striker.' 
                : 'Tap striker to reposition. Drag board to shoot!'}
          </p>
        </div>

        {mode === 'multiplayer' && (
          <div className="w-full lg:w-auto flex-shrink-0 lg:self-start mt-4 lg:mt-0">
            <MultiplayerMatchPanel compact />
          </div>
        )}

      </div>
    </GameWrapper>
  );
};
