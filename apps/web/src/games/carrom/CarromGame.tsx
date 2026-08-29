import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameWrapper } from '../../components/GameWrapper';
import confetti from 'canvas-confetti';
import toast from 'react-hot-toast';
import { claimPracticeReward } from '../../services/api/practiceReward';
import { useGameLoop } from '../shared/hooks/useGameLoop';
import { MultiplayerMatchPanel } from '../shared/components/MultiplayerMatchPanel';
import { useMultiplayerStore } from '../../store/multiplayerStore';
import CarromMultiplayerDriver, { type CarromRemoteState } from './CarromMultiplayerDriver';
import type { CarromCoin, CarromStriker, CarromPlayer } from '@gaming-hub/game-engine';
import CarromMultiplayer from './CarromMultiplayer';
import { CarromBoardRenderer } from './rendering/CarromBoardRenderer';
import { CarromPieceRenderer } from './rendering/CarromPieceRenderer';
import { CarromEffectsRenderer } from './rendering/CarromEffectsRenderer';

interface CarromGameProps {
  mode: 'ai' | 'multiplayer';
  stake: number;
  onBack: () => void;
}

/**
 * Thin router: multiplayer → CarromMultiplayer (new, clean),
 * AI → CarromAI (original single-player implementation below).
 */
export const CarromGame: React.FC<CarromGameProps> = ({ mode, stake, onBack }) => {
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const room = useMultiplayerStore((s) => s.room);

  if (mode === 'multiplayer') {
    const names = (room?.players ?? [])
      .slice()
      .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0))
      .map((p) => p.displayName || `Player ${(p.seat ?? 0) + 1}`);

    return (
      <CarromMultiplayer
        mySeat={mySeat ?? 0}
        playerNames={names}
        stake={stake}
        onBack={onBack}
      />
    );
  }

  return <CarromAI mode={mode} stake={stake} onBack={onBack} />;
};

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
  angle?: number;      // visual spin angle (radians)
  trail?: Array<{ x: number; y: number }>; // motion trail positions
  pocketing?: {
    pocketX: number;
    pocketY: number;
    scale: number;
    opacity: number;
  };
}

const BOARD_WIDTH = 400;
const BOARD_HEIGHT = 400;
// Wall bounce boundary — slightly inside the visual frame so coins naturally settle
// and can reach the pocket holes at x/y ≈ 32
const BORDER_SIZE = 22;
const POCKET_RADIUS = 20;
const POCKETS = [
  { x: 30, y: 30 },
  { x: BOARD_WIDTH - 30, y: 30 },
  { x: 30, y: BOARD_HEIGHT - 30 },
  { x: BOARD_WIDTH - 30, y: BOARD_HEIGHT - 30 },
];
// Pocket capture must mirror the server's authoritative physics scaled 600→400 (×2/3):
// server captures ≤12 (moving) / ≤6 (stationary) units; corner cutout zone ≤ 30+12 units.
const POCKET_CAPTURE_MOVING = 8;
const POCKET_CAPTURE_STATIONARY = 4;
const POCKET_CUTOUT_ZONE = POCKET_RADIUS + 8;

const STRIKER_START_X = BOARD_WIDTH / 2;
const STRIKER_START_Y = BOARD_HEIGHT - 62;
// Realistic carrom speed: full-power shot at ~18 canvas-px/frame (≈1080 px/s at 60fps)
// This produces a satisfying 0.8-2 second shot duration with proper friction decay
const SHOT_MAX_SPEED = 18;
// Trail history: stores last N positions per coin for motion-blur effect
const TRAIL_LENGTH = 6;

// Striker placement range — allows full movement across the entire baseline track between the red end circles (86px to 314px, offset ±114px).
const STRIKER_POS_MIN = -114;
const STRIKER_POS_MAX = 114;
const PLACEMENT_CLEARANCE = 23.33;

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
  const coinR = 10;
  const d = coinR * 2; // 20 (center-to-center distance for touching coins)

  coins.push({
    id: 'striker',
    type: 'striker',
    x: STRIKER_START_X,
    y: STRIKER_START_Y,
    vx: 0,
    vy: 0,
    radius: 12,
    mass: 2.5,
    color: '#0284c7',
    active: true,
    angle: 0,
    trail: []
  });

  const positions: { x: number; y: number }[] = [
    { x: cx, y: cy } // Queen
  ];

  // Ring 1: 6 coins around Queen
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI * 2) / 6;
    positions.push({
      x: cx + Math.cos(angle) * d,
      y: cy + Math.sin(angle) * d,
    });
  }

  // Ring 2: 12 coins in authentic hexagonal close packing (6 corner coins at 2*d and 6 edge coins at d*sqrt(3))
  const cornerDist = d * 2; // 40
  const edgeDist = d * Math.sqrt(3); // ~34.64
  for (let i = 0; i < 6; i++) {
    const cornerAngle = (i * Math.PI * 2) / 6;
    const edgeAngle = cornerAngle + Math.PI / 6;

    // Corner coin
    positions.push({
      x: cx + Math.cos(cornerAngle) * cornerDist,
      y: cy + Math.sin(cornerAngle) * cornerDist,
    });

    // Edge coin
    positions.push({
      x: cx + Math.cos(edgeAngle) * edgeDist,
      y: cy + Math.sin(edgeAngle) * edgeDist,
    });
  }

  const types: CoinType[] = [
    "queen",
    // Ring 1 (6 coins alternating)
    "white", "black", "white", "black", "white", "black",
    // Ring 2 (12 coins alternating)
    "black", "white", "black", "white", "black", "white", "black", "white", "black", "white", "black", "white",
  ];

  for (let i = 0; i < positions.length && i < types.length; i++) {
    const type = types[i];
    coins.push({
      id: `coin-${i}`,
      type: type ?? 'white',
      x: positions[i].x,
      y: positions[i].y,
      vx: 0,
      vy: 0,
      radius: type === 'queen' ? 10 : 9.5,
      mass: 1,
      color: type === 'queen' ? '#dc2626' : type === 'white' ? '#ffffff' : '#09090b',
      active: true
    });
  }

  return coins;
}

const CarromAI: React.FC<CarromGameProps> = ({ mode, stake, onBack }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState({ white: 0, black: 0 });
  
  const [dragState, setDragState] = useState<'idle' | 'dragging_striker' | 'dragging'>('idle');
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [currentAim, setCurrentAim] = useState({ x: 0, y: 0 });
  const [strikerPos, setStrikerPos] = useState(0);
  const [strikerPhase, setStrikerPhase] = useState<'positioning' | 'aiming'>('positioning');
  const [timeLeft, setTimeLeft] = useState(20);
  
  const [gameOver, setGameOver] = useState(false);
  const [showRules, setShowRules] = useState(true);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [isTurnActive, setIsTurnActive] = useState(false);
  const [currentPlayer, setCurrentPlayer] = useState<'player' | 'ai'>('player');
  const [aiThinking, setAiThinking] = useState(false);
  const [uiTrigger, setUiTrigger] = useState(0);
  // Multiplayer queen state driven by the server (two-shot cover rule).
  const [queenStatus, setQueenStatus] = useState<'unpocketed' | 'pocketed_needs_cover' | 'covered'>('unpocketed');
  
  const coinsRef = useRef<LocalCoin[]>(createInitialCoins());
  const rulesRef = useRef({
    queenStatus: 'unpocketed' as 'unpocketed' | 'pocketed_needs_cover' | 'covered',
    queenPocketedBy: null as 'player' | 'ai' | null,
    dueOwed: { white: 0, black: 0 }
  });
  const turnScoreRef = useRef({ white: 0, black: 0, queen: false, foul: false });
  const floatingPopsRef = useRef<Array<{ id: number; text: string; color: string; x: number; y: number; opacity: number; scale: number }>>([]);
  const pocketRipplesRef = useRef<Array<{ id: number; x: number; y: number; radius: number; maxRadius: number; opacity: number; color: string }>>([]);

  const mySeat = useMultiplayerStore(s => s.mySeat);
  const room = useMultiplayerStore(s => s.room);
  const remoteGameState = useMultiplayerStore(s => s.gameState) as any;
  const currentSeatFromServer = remoteGameState?.currentSeat;

  // Ref so the game-loop closure always reads the latest seat without re-creating renderBoard
  const mySeatRef = useRef<number | null>(null);
  // Sync immediately (not just via useEffect) so applyServerState always has the correct seat
  mySeatRef.current = mySeat;

  const driverRef = useRef<CarromMultiplayerDriver | null>(null);

  const isMyTurn = mode === 'multiplayer'
    ? (mySeat !== null && mySeat !== undefined && currentSeatFromServer !== undefined 
        ? Number(currentSeatFromServer) === Number(mySeat)
        : (driverRef.current ? driverRef.current.isMyTurn() : (currentPlayer === 'player')))
    : (currentPlayer === 'player');

  // True when the striker (at its current slider position) overlaps an active coin.
  // Mirrors the server's placement validation so the client can warn before confirming.
  const strikerOverlapsCoin = (): boolean => {
    const striker = coinsRef.current.find(c => c.type === 'striker');
    if (!striker) return false;
    for (const c of coinsRef.current) {
      if (c.type === 'striker' || !c.active) continue;
      if (Math.hypot(c.x - striker.x, c.y - striker.y) < PLACEMENT_CLEARANCE) return true;
    }
    return false;
  };
  const placementOverlapping = strikerPhase === 'positioning' && isMyTurn && !isTurnActive && strikerOverlapsCoin();

  const pendingServerStateRef = useRef<CarromRemoteState | null>(null);
  const lastAnimatedActionAtRef = useRef<number | null>(null);
  // Throttle slider-tick place-striker sends so a fast drag doesn't flood the
  // server with actions (which rate limits reject, stalling the turn).
  const lastPlaceSendAtRef = useRef(0);
  const isTurnActiveRef = useRef(false);
  useEffect(() => { isTurnActiveRef.current = isTurnActive; }, [isTurnActive]);

  const hasInitializedCoinsRef = useRef(false);
  // Guard: count frames since isTurnActive became true.
  // Prevents the game-loop from triggering turn-end on the very first frame when
  // isTurnActive just flipped to true but coins haven't received velocity yet.
  const turnActiveFramesRef = useRef(0);

  const applyServerState = useCallback((state: CarromRemoteState) => {
    // Always read directly from store for seat — never fall back to 0, as seat 0 is a valid seat
    // and defaulting to it for seat-1 players causes inverted turn calculation.
    const currentSeat = mySeatRef.current ?? useMultiplayerStore.getState().mySeat;
    if (currentSeat === null || currentSeat === undefined) {
      console.warn('[CarromGame] applyServerState called before mySeat is known, skipping');
      return;
    }

    if (!hasInitializedCoinsRef.current) {
      hasInitializedCoinsRef.current = true;
      const mappedCoins: LocalCoin[] = state.coins.map(c => {
        const rawType = c.type as string;
        const pos = mapServerToLocal(c.x, c.y, c.vx, c.vy, currentSeat);
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
          active: !c.pocketed,
          angle: 0,
          trail: [] as Array<{ x: number; y: number }>
        };
      });

      if (state.striker) {
        const pos = mapServerToLocal(state.striker.x, state.striker.y, 0, 0, currentSeat);
        mappedCoins.push({
          id: 'striker',
          type: 'striker',
          x: pos.x,
          y: pos.y,
          vx: 0,
          vy: 0,
          radius: 11,
          mass: 2.5,
          color: '#0284c7',
          active: !state.striker.pocketed,
          angle: 0,
          trail: [] as Array<{ x: number; y: number }>
        });
      }
      coinsRef.current = mappedCoins;
    } else {
      // Board already populated — update coin positions & pocketed flags to match server ground truth!
      for (const localCoin of coinsRef.current) {
        if (localCoin.type === 'striker') continue;
        const serverCoin = state.coins?.find((c: any) => c.id === localCoin.id);
        if (serverCoin) {
          if (serverCoin.pocketed) {
            if (localCoin.active && !localCoin.pocketing) {
              // Find nearest pocket to localCoin for smooth drop-in animation
              let nearestPocket = POCKETS[0];
              let minDist = Infinity;
              for (const p of POCKETS) {
                const d = Math.hypot(localCoin.x - p.x, localCoin.y - p.y);
                if (d < minDist) {
                  minDist = d;
                  nearestPocket = p;
                }
              }
              if (minDist < 60) {
                localCoin.pocketing = {
                  pocketX: nearestPocket.x,
                  pocketY: nearestPocket.y,
                  scale: 1.0,
                  opacity: 1.0,
                };
                localCoin.vx = 0;
                localCoin.vy = 0;
              } else {
                localCoin.active = false;
                localCoin.vx = 0;
                localCoin.vy = 0;
              }
            } else if (!localCoin.pocketing) {
              localCoin.active = false;
            }
          } else {
            // Active coin — update position to match server ground truth!
            localCoin.active = true;
            localCoin.pocketing = undefined;
            const pos = mapServerToLocal(serverCoin.x, serverCoin.y, 0, 0, currentSeat);
            localCoin.x = pos.x;
            localCoin.y = pos.y;
            localCoin.vx = 0;
            localCoin.vy = 0;
          }
        }
      }

      // Reset striker for current turn (position reflects the server-confirmed placement)
      const isMyTurn = state.currentSeat === currentSeat;
      const striker = coinsRef.current.find(c => c.type === 'striker');
      if (striker) {
        const sx = state.striker?.x;
        striker.x = sx !== undefined ? mapServerToLocal(sx, 0, 0, 0, currentSeat).x : BOARD_WIDTH / 2;
        striker.y = isMyTurn ? STRIKER_START_Y : 62;
        striker.vx = 0;
        striker.vy = 0;
        striker.active = !state.striker?.pocketed;
      }
      setStrikerPos(Math.round(Math.max(STRIKER_POS_MIN, Math.min(STRIKER_POS_MAX, (striker?.x ?? BOARD_WIDTH / 2) - BOARD_WIDTH / 2))));
    }

    const myPlayer = state.players.find(p => p.seat === currentSeat);
    const opponentPlayer = state.players.find(p => p.seat !== currentSeat);
    setScore({
      white: currentSeat === 0 ? (myPlayer?.score ?? 0) : (opponentPlayer?.score ?? 0),
      black: currentSeat === 1 ? (myPlayer?.score ?? 0) : (opponentPlayer?.score ?? 0)
    });

    // Queen cover state comes from the server (two-shot cover rule).
    setQueenStatus(
      myPlayer?.queenCovered
        ? 'covered'
        : myPlayer?.queenPocketed
          ? 'pocketed_needs_cover'
          : 'unpocketed',
    );

    // NOTE: applyServerState is called in TWO situations:
    //   1. When no animation is running (state update arrives outside a shot)
    //   2. At the END of the game-loop when animation finishes
    // In case 2 the caller already sets currentPlayer/strikerPhase AFTER this call,
    // so setting them here is also safe — the caller will immediately overwrite with
    // identical values derived from the same state.
    const isMyTurn = state.currentSeat === currentSeat;
    setCurrentPlayer(isMyTurn ? 'player' : 'ai');
    setStrikerPhase(state.strikerPlacementPhase ? 'positioning' : 'aiming');

    if (state.finished) setGameOver(true);
    setUiTrigger(t => t + 1);
  }, []);

  // Stable driver identity: only re-create when the seat assignment changes.
  // Room updates (timers, readiness, etc.) must NOT tear down the driver.
  useEffect(() => {
    if (mode !== 'multiplayer') return;
    // Wait until we have a valid seat assignment
    if (mySeat == null) return;

    mySeatRef.current = mySeat;

    // Stop any existing driver before creating a new one
    if (driverRef.current) {
      driverRef.current.stop();
      driverRef.current = null;
    }

    const names = (room?.players ?? [])
      .slice()
      .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0))
      .map(p => p.displayName || `Player ${(p.seat ?? 0) + 1}`);

    const driver = new CarromMultiplayerDriver(mySeat, names);
    driverRef.current = driver;

    driver.onStateUpdate = (state: CarromRemoteState) => {
      const currentSeat = mySeatRef.current;
      if (currentSeat === null || currentSeat === undefined) return;

      const lastAction = state.lastAction as { type?: string; angle?: number; power?: number } | null;
      const lastActionAt = state.lastActionAtMs ?? null;

      console.log('[CarromGame] STATE UPDATE - mySeat:', currentSeat,
        '| serverCurrentSeat:', state.currentSeat,
        '| lastActionSeat:', state.lastActionSeat,
        '| strikerPlacementPhase:', state.strikerPlacementPhase);

      const isNewStrike =
        lastAction?.type === 'strike' &&
        lastActionAt !== null &&
        lastActionAt !== lastAnimatedActionAtRef.current;

      if (isNewStrike) {
        lastAnimatedActionAtRef.current = lastActionAt;
        pendingServerStateRef.current = state;

        // Synchronize all coins to state.coins BEFORE starting shot animation!
        for (const localCoin of coinsRef.current) {
          if (localCoin.type === 'striker') continue;
          const serverCoin = state.coins?.find((c: any) => c.id === localCoin.id);
          if (serverCoin && !serverCoin.pocketed) {
            localCoin.active = true;
            localCoin.pocketing = undefined;
            const pos = mapServerToLocal(serverCoin.x, serverCoin.y, 0, 0, currentSeat);
            localCoin.x = pos.x;
            localCoin.y = pos.y;
            localCoin.vx = 0;
            localCoin.vy = 0;
          }
        }

        if (state.lastActionSeat !== currentSeat) {
          // Opponent shot — animate using striker velocity; let collision physics scatter coins.
          const angle = lastAction.angle ?? 0;
          const power = lastAction.power ?? 1;

          const CLIENT_MAX_SPEED = SHOT_MAX_SPEED;
          const forceMagnitude = power * CLIENT_MAX_SPEED;

          // Seat 1 sees the board rotated 180°, so flip the angle
          const localAngle = currentSeat === 1 ? angle + Math.PI : angle;

          const striker = coinsRef.current.find(c => c.type === 'striker');
          if (striker) {
            if (state.striker) {
              const pos = mapServerToLocal(state.striker.x, state.striker.y, 0, 0, currentSeat);
              striker.x = pos.x;
              striker.y = pos.y;
            }
            striker.vx = Math.cos(localAngle) * forceMagnitude;
            striker.vy = Math.sin(localAngle) * forceMagnitude;
          }

          setIsTurnActive(true);
        } else {
          // Local player shot: local animation already in progress
          setIsTurnActive(true);
        }
        return;
      }

      if (isTurnActiveRef.current) {
        pendingServerStateRef.current = state;
        return;
      }

      applyServerState(state);
    };

    driver.onCoinPocketed = () => {
      // Coin pocketed - celebration confetti blast removed
    };

    driver.onFoul = (reason: string) => {
      toast.error(`Foul: ${reason}`, { id: 'foul' });
    };

    driver.onCoinReturned = (_coinId: string, coinType: string) => {
      toast(`${coinType === 'queen' ? 'Queen' : 'Coin'} returned to the board (striker foul penalty)`, { id: 'coin-returned' });
    };

    driver.onQueenReturned = (reason: string) => {
      toast(
        reason === 'foul'
          ? 'Queen returned: the foul forfeits the pending cover'
          : 'Failed to cover the queen - it returns to the board',
        { id: 'queen-returned' },
      );
    };

    driver.onWin = (winnerSeat: number) => {
      setGameOver(true);
      if (winnerSeat === mySeatRef.current) confetti({ particleCount: 100 });
    };

    // onTurnEnd is intentionally a no-op here.
    // Turn updates are driven exclusively by the game-loop once animation settles.
    driver.onTurnEnd = (_nextSeat: number) => { /* handled in game-loop */ };

    driver.start();

    return () => {
      driver.stop();
      driverRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, mySeat, applyServerState]); // ← intentionally excludes `room` to avoid restarting on room updates


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
           striker.vx = Math.cos(shootAngle) * SHOT_MAX_SPEED;
           striker.vy = Math.sin(shootAngle) * SHOT_MAX_SPEED;
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
    if (gameOver || isTurnActive || showRules) return;
    if (mode === 'ai' && currentPlayer === 'ai') return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (mode === 'ai' && currentPlayer === 'player') {
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
          }
          return 20;
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

    // Run client physics only during active animation (isTurnActive) or in AI mode.
    // In multiplayer idle state, positions come exclusively from the server.
    if (mode === 'ai' || isTurnActive) {
      // Fixed 12 sub-steps per frame step (1/12 step size) matching server physics exactly
      const maxSubSteps = 12;
      const stepFactor = 1 / maxSubSteps; // 1/12

      const innerMin = BORDER_SIZE;
      const innerMax = BOARD_WIDTH - BORDER_SIZE;

      for (let step = 0; step < maxSubSteps; step++) {
        // 1. Integrate positions using fixed stepFactor
        for (let i = 0; i < coins.length; i++) {
          const c = coins[i];
          if (!c.active) continue;

          c.x += c.vx * stepFactor;
          c.y += c.vy * stepFactor;

          // Visual spin: angle proportional to tangential speed
          const speed = Math.hypot(c.vx, c.vy);
          if (c.angle !== undefined) {
            c.angle += speed * stepFactor * 0.05;
          }

          // Motion trail: record position at each sub-step for blur effect
          if (speed > 1.5 && c.trail !== undefined) {
            c.trail.push({ x: c.x, y: c.y });
            if (c.trail.length > TRAIL_LENGTH) c.trail.shift();
          } else if (c.trail !== undefined) {
            // Fade out trail when slow
            if (c.trail.length > 0) c.trail.shift();
          }

          const r = c.radius;
          const wallRestitution = c.type === 'striker' ? 0.75 : 0.70;
          
          // Check if coin is in a pocket corner cutout zone (skip straight wall clamping near corners)
          let inPocketZone = false;
          for (const p of POCKETS) {
            if (Math.hypot(c.x - p.x, c.y - p.y) < POCKET_CUTOUT_ZONE) {
              inPocketZone = true;
              break;
            }
          }

          if (!inPocketZone) {
            if (c.x - r < innerMin) {
              c.x = innerMin + r;
              c.vx = Math.abs(c.vx) * wallRestitution;
            } else if (c.x + r > innerMax) {
              c.x = innerMax - r;
              c.vx = -Math.abs(c.vx) * wallRestitution;
            }

            if (c.y - r < innerMin) {
              c.y = innerMin + r;
              c.vy = Math.abs(c.vy) * wallRestitution;
            } else if (c.y + r > innerMax) {
              c.y = innerMax - r;
              c.vy = -Math.abs(c.vy) * wallRestitution;
            }
          }

          // Friction: 0.985 per 60fps frame (1/12 power per substep)
          const friction = Math.pow(0.985, stepFactor);
          c.vx *= friction;
          c.vy *= friction;

          if (Math.abs(c.vx) < 0.04) c.vx = 0;
          if (Math.abs(c.vy) < 0.04) c.vy = 0;

          if (c.vx !== 0 || c.vy !== 0) anyMoving = true;
        }


        // 2. Circle-circle collisions with realistic momentum transfer and restitution
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

            if (dist < minDist && dist > 0) {
              const nx = dx / dist;
              const ny = dy / dist;

              const dvx = c1.vx - c2.vx;
              const dvy = c1.vy - c2.vy;
              const dvn = dvx * nx + dvy * ny;

              // Collision condition: dvn > 0 means objects are approaching each other.
              // (n points from c1→c2; relative velocity (v1-v2)·n > 0 ⇒ c1 moves toward c2)
              if (dvn > 0) {
                const restitution = (c1.type === 'striker' || c2.type === 'striker') ? 0.90 : 0.82;
                // Impulse magnitude (negated so that c1 is pushed BACK from c2)
                const jImpulse = -(2 * c1.mass * c2.mass * dvn) / (c1.mass + c2.mass) * restitution;

                c1.vx += (jImpulse * nx) / c1.mass;
                c1.vy += (jImpulse * ny) / c1.mass;
                c2.vx -= (jImpulse * nx) / c2.mass;
                c2.vy -= (jImpulse * ny) / c2.mass;
              }

              // Overlap resolution proportional to inverse mass
              const overlap = minDist - dist;
              const totalMass = c1.mass + c2.mass;
              c1.x -= nx * overlap * (c2.mass / totalMass);
              c1.y -= ny * overlap * (c2.mass / totalMass);
              c2.x += nx * overlap * (c1.mass / totalMass);
              c2.y += ny * overlap * (c1.mass / totalMass);
            }
          }
        }
      }
    } else {
      // Multiplayer idle: just check whether any coin still has residual velocity
      // Also count pocketing animations as "moving" so turn-end waits for them to finish.
      for (const c of coins) {
        if (c.active && (c.vx !== 0 || c.vy !== 0)) anyMoving = true;
        if (c.pocketing) anyMoving = true; // pocketing animation still running
      }
    }

    // Check pocket collisions during animation loop (all modes)
    let scoredWhite = 0;
    let scoredBlack = 0;
    let strikerFoulThisFrame = false;
    
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (!c.active) continue;

      for (const p of POCKETS) {
        const pdx = p.x - c.x;
        const pdy = p.y - c.y;
        const pdist = Math.hypot(pdx, pdy);
        const isMovingTowards = c.vx * pdx + c.vy * pdy > 0 || Math.hypot(c.vx, c.vy) > 0.05;

        if (pdist <= POCKET_CAPTURE_STATIONARY || (pdist <= POCKET_CAPTURE_MOVING && isMovingTowards)) {
          if (!c.pocketing) {
            c.pocketing = {
              pocketX: p.x,
              pocketY: p.y,
              scale: 1.0,
              opacity: 1.0,
            };
            c.vx = 0;
            c.vy = 0;

            const popText = c.type === 'queen' ? '👑 QUEEN!' : c.type === 'white' ? '⚪ +1 WHITE' : c.type === 'black' ? '⚫ +1 BLACK' : '❌ FOUL!';
            const popColor = c.type === 'queen' ? '#f43f5e' : c.type === 'white' ? '#fbbf24' : c.type === 'black' ? '#38bdf8' : '#ef4444';
            
            floatingPopsRef.current.push({
              id: Math.random(),
              text: popText,
              color: popColor,
              x: p.x,
              y: p.y - 12,
              opacity: 1.0,
              scale: 1.2,
            });

            pocketRipplesRef.current.push({
              id: Math.random(),
              x: p.x,
              y: p.y,
              radius: 12,
              maxRadius: 38,
              opacity: 0.95,
              color: c.type === 'queen' ? '#f43f5e' : c.type === 'white' ? '#fbbf24' : '#38bdf8',
            });

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
    }

    // Step coin pocketing animations (pull-in, shrink, fade down)
    for (const c of coins) {
      if (c.pocketing) {
        c.pocketing.scale = Math.max(0.02, c.pocketing.scale - 0.07);
        c.pocketing.opacity = Math.max(0, c.pocketing.opacity - 0.07);
        c.x += (c.pocketing.pocketX - c.x) * 0.35;
        c.y += (c.pocketing.pocketY - c.y) * 0.35;

        if (c.pocketing.scale <= 0.05 || c.pocketing.opacity <= 0.05) {
          c.active = false;
          c.pocketing = undefined;
          setUiTrigger(t => t + 1);
        }
      }
    }

    if (mode === 'ai') {


      if (scoredWhite > 0 || scoredBlack > 0) {
        setScore(prev => {
          const nw = prev.white + scoredWhite;
          const nb = prev.black + scoredBlack;
          return { white: nw, black: nb };
        });
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

           const pocketedW = coins.filter(c => c.type === 'white' && !c.active).length;
           const pocketedB = coins.filter(c => c.type === 'black' && !c.active).length;
           const queenPocketed = !coins.some(c => c.type === 'queen' && c.active);

           if ((pocketedW >= 9 || pocketedB >= 9) && queenPocketed) {
              setTimeout(() => setGameOver(true), 500);
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
        setTimeLeft(20);
      }
    } else if (mode === 'multiplayer') {
      if (isTurnActive) {
        turnActiveFramesRef.current++;
      } else {
        turnActiveFramesRef.current = 0;
      }

      // Wait at least 10 frames after turn started before allowing turn-end.
      // This prevents the edge case where setIsTurnActive(true) and !anyMoving
      // coincide on the same frame before coins have received velocity.
      const hasEnoughFrames = turnActiveFramesRef.current >= 10;

      if (isTurnActive && !anyMoving && hasEnoughFrames) {
        setIsTurnActive(false);
        turnActiveFramesRef.current = 0;

        const stateToApply = pendingServerStateRef.current || driverRef.current?.lastState;
        if (stateToApply) {
          pendingServerStateRef.current = null;

          // Apply server state (scores, coin positions, pocketed flags, striker reset)
          applyServerState(stateToApply);

          // *** SINGLE AUTHORITATIVE TURN UPDATE ***
          // This is the ONLY place in multiplayer that updates currentPlayer and strikerPhase.
          // We derive them directly from the server state once animation has completely stopped.
          const mySeatNow = mySeatRef.current ?? useMultiplayerStore.getState().mySeat ?? 0;
          const isMyTurnNow = stateToApply.currentSeat === mySeatNow;

          console.log('[CarromGame] TURN END - mySeat:', mySeatNow,
            '| serverCurrentSeat:', stateToApply.currentSeat,
            '| isMyTurn:', isMyTurnNow,
            '| strikerPlacementPhase:', stateToApply.strikerPlacementPhase);

          setCurrentPlayer(isMyTurnNow ? 'player' : 'ai');
          setStrikerPhase(stateToApply.strikerPlacementPhase ? 'positioning' : 'aiming');
          setStrikerPos(0);

          // Reconcile pocketed coins with server ground-truth once motion has ceased
          for (const localCoin of coinsRef.current) {
            if (localCoin.type === 'striker') continue;
            const serverCoin = stateToApply.coins?.find((c: any) => c.id === localCoin.id);
            if (serverCoin) {
              if (serverCoin.pocketed) {
                localCoin.active = false;
                localCoin.vx = 0;
                localCoin.vy = 0;
              } else if (!localCoin.active) {
                // Coin returned to the board (queen restored / due owed)
                localCoin.active = true;
                localCoin.pocketing = undefined;
                const pos = mapServerToLocal(serverCoin.x, serverCoin.y, 0, 0, mySeatNow);
                localCoin.x = pos.x;
                localCoin.y = pos.y;
                localCoin.vx = 0;
                localCoin.vy = 0;
              }
            }
          }
        }
      }
    }


    renderBoard(ctx, coins, dragState, dragStart, currentAim, strikerPhase, currentPlayer, isTurnActive, gameOver, strikerPos, mySeatRef.current);

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
    strikerPos: number,
    mySeatParam: number | null
  ) => {
    ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    CarromBoardRenderer.drawBoard(ctx, BOARD_WIDTH, BOARD_HEIGHT);

    // --- Render Expanding Pocket Energy Ripples ---
    for (let i = pocketRipplesRef.current.length - 1; i >= 0; i--) {
      const rip = pocketRipplesRef.current[i];
      rip.radius += 1.3;
      rip.opacity -= 0.038;
      if (rip.opacity <= 0 || rip.radius >= rip.maxRadius) {
        pocketRipplesRef.current.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.strokeStyle = rip.color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = Math.max(0, rip.opacity);
      ctx.beginPath();
      ctx.arc(rip.x, rip.y, rip.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // --- Motion trail pass (drawn before coins so trails are behind) ---
    for (const c of coins) {
      if (!c.active || !c.trail || c.trail.length < 2) continue;
      const trailColor = c.type === 'striker' ? '56,189,248' : c.type === 'queen' ? '244,63,94' : c.type === 'white' ? '250,204,21' : '148,163,184';
      for (let ti = 0; ti < c.trail.length; ti++) {
        const tp = c.trail[ti];
        const alpha = ((ti + 1) / c.trail.length) * 0.25;
        const trailRadius = c.radius * (0.45 + 0.35 * (ti / c.trail.length));
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, trailRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${trailColor},${alpha.toFixed(2)})`;
        ctx.fill();
      }
    }

    const shooterIsWhite =
      mySeatParam === null
        ? currentPlayer === 'player'
        : currentPlayer === 'player'
          ? mySeatParam === 0
          : mySeatParam === 1;

    for (const c of coins) {
      if (!c.active && !c.pocketing) continue;

      if (c.type === 'striker' && !isTurnActive && !gameOver) {
        if (currentPlayer === 'player') {
          if (strikerPhase === 'positioning') {
            c.x = BOARD_WIDTH / 2 + strikerPos;
          }
          c.y = STRIKER_START_Y;
        } else {
          c.y = 62;
        }
      }

      CarromPieceRenderer.drawCoin(
        ctx,
        {
          id: c.id,
          type: c.type,
          x: c.x,
          y: c.y,
          radius: c.radius,
          active: c.active,
          spin: c.angle,
          pocketing: c.pocketing ? {
            scale: c.pocketing.scale,
            alpha: c.pocketing.opacity,
            px: c.pocketing.pocketX,
            py: c.pocketing.pocketY,
          } : undefined,
        },
        shooterIsWhite,
        isMyTurn,
        isTurnActive
      );
    }

    // --- Render Animated Floating Score Text Pops ---
    for (let i = floatingPopsRef.current.length - 1; i >= 0; i--) {
      const pop = floatingPopsRef.current[i];
      pop.y -= 0.9;
      pop.opacity -= 0.022;
      if (pop.opacity <= 0) {
        floatingPopsRef.current.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.max(0, pop.opacity);
      ctx.font = '900 13px system-ui, sans-serif';
      ctx.fillStyle = pop.color;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 6;
      ctx.fillText(pop.text, pop.x, pop.y);
      ctx.restore();
    }

    if (!isTurnActive && !gameOver && dragState === 'dragging') {
      const striker = coins.find(c => c.type === 'striker');
      if (striker && striker.active) {
        const dx = dragStart.x - currentAim.x;
        const dy = dragStart.y - currentAim.y;
        const pullDist = Math.hypot(dx, dy);

        if (pullDist > 5) {
          const maxPull = 150;
          const powerRatio = Math.min(pullDist / maxPull, 1);
          const angle = Math.atan2(dy, dx);
          const dirX = Math.cos(angle);
          const dirY = Math.sin(angle);

          // 1. Raycast against active coins to find first impact
          let closestHit: { coin: LocalCoin; dist: number; ghostX: number; ghostY: number } | null = null;
          const strikerR = striker.radius;

          for (const c of coins) {
            if (c.type === 'striker' || !c.active) continue;
            const combinedR = strikerR + c.radius;
            const vx = c.x - striker.x;
            const vy = c.y - striker.y;

            // Project coin position onto ray
            const t = vx * dirX + vy * dirY;
            if (t <= 0) continue; // Behind striker

            // Perpendicular distance to ray
            const perpDistSq = (vx * vx + vy * vy) - (t * t);
            if (perpDistSq >= combinedR * combinedR) continue; // No collision

            // Exact collision distance along ray
            const d = t - Math.sqrt(combinedR * combinedR - perpDistSq);
            if (d > 0 && (!closestHit || d < closestHit.dist)) {
              const ghostX = striker.x + dirX * d;
              const ghostY = striker.y + dirY * d;
              closestHit = { coin: c, dist: d, ghostX, ghostY };
            }
          }

          // 2. Determine aim line end point
          let lineEndX = striker.x + dirX * 300;
          let lineEndY = striker.y + dirY * 300;

          if (closestHit) {
            lineEndX = closestHit.ghostX;
            lineEndY = closestHit.ghostY;
          } else {
            // Raycast to board cushions
            const minX = BORDER_SIZE + strikerR;
            const maxX = BOARD_WIDTH - BORDER_SIZE - strikerR;
            const minY = BORDER_SIZE + strikerR;
            const maxY = BOARD_HEIGHT - BORDER_SIZE - strikerR;

            let tMin = 300;
            if (dirX > 0) tMin = Math.min(tMin, (maxX - striker.x) / dirX);
            else if (dirX < 0) tMin = Math.min(tMin, (minX - striker.x) / dirX);
            if (dirY > 0) tMin = Math.min(tMin, (maxY - striker.y) / dirY);
            else if (dirY < 0) tMin = Math.min(tMin, (minY - striker.y) / dirY);

            lineEndX = striker.x + dirX * tMin;
            lineEndY = striker.y + dirY * tMin;
          }

          // Draw main laser aim line (dotted gradient)
          ctx.save();
          ctx.strokeStyle = `rgba(${Math.round(255 * powerRatio)}, ${Math.round(255 * (1 - powerRatio))}, 50, 0.9)`;
          ctx.lineWidth = 2.5;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(striker.x, striker.y);
          ctx.lineTo(lineEndX, lineEndY);
          ctx.stroke();

          if (closestHit) {
            // Draw Ghost Striker Circle at impact
            const { coin: targetCoin, ghostX, ghostY } = closestHit;
            ctx.setLineDash([]);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.lineWidth = 1.5;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.beginPath();
            ctx.arc(ghostX, ghostY, strikerR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Target Coin Impact Vector
            const cVecX = targetCoin.x - ghostX;
            const cVecY = targetCoin.y - ghostY;
            const cLen = Math.hypot(cVecX, cVecY) || 1;
            const targetDirX = cVecX / cLen;
            const targetDirY = cVecY / cLen;

            // Draw Target Coin Trajectory Line
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(targetCoin.x, targetCoin.y);
            ctx.lineTo(targetCoin.x + targetDirX * 60, targetCoin.y + targetDirY * 60);
            ctx.stroke();

            // Striker Deflection Line
            const dot = dirX * targetDirX + dirY * targetDirY;
            const defDirX = dirX - dot * targetDirX;
            const defDirY = dirY - dot * targetDirY;
            const defLen = Math.hypot(defDirX, defDirY) || 1;

            ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(ghostX, ghostY);
            ctx.lineTo(ghostX + (defDirX / defLen) * 45, ghostY + (defDirY / defLen) * 45);
            ctx.stroke();
          }

          // Draw Glowing Power Ring around Striker
          ctx.setLineDash([]);
          ctx.strokeStyle = `rgba(${Math.round(255 * powerRatio)}, ${Math.round(255 * (1 - powerRatio))}, 50, 0.9)`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(striker.x, striker.y, striker.radius + 3 + powerRatio * 6, 0, Math.PI * 2);
          ctx.stroke();

          ctx.restore();
        }
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
    
    if (mode === 'multiplayer' && !driverRef.current?.isMyTurn()) return;
    if (mode === 'ai' && currentPlayer === 'ai') return;

    const { x, y } = getCanvasCoords(e);

    // Interactive board baseline touch-positioning
    if (strikerPhase === 'positioning' && y > 240) {
      const newPos = Math.max(STRIKER_POS_MIN, Math.min(STRIKER_POS_MAX, x - BOARD_WIDTH / 2));
      handleStrikerPosChange(newPos);

      const striker = coinsRef.current.find(c => c.type === 'striker');
      if (striker) {
        const distToStriker = Math.hypot(x - striker.x, y - striker.y);
        if (distToStriker <= striker.radius + 18) {
          if (mode === 'multiplayer' && driverRef.current?.canPlaceStriker()) {
            if (strikerOverlapsCoin()) {
              toast.error('Striker overlaps a coin — move it before confirming.', { id: 'overlap-error' });
              return;
            }
            driverRef.current.sendPlaceStriker(striker.x);
            setStrikerPhase('aiming');
          } else if (mode === 'ai') {
            setStrikerPhase('aiming');
          }
        }
      }
    }
    
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

    if (mode === 'ai' && overlap) {
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
           const power = Math.min(pullDist / maxPull, 1);
           const CLIENT_MAX_SPEED = SHOT_MAX_SPEED;
           const forceMagnitude = power * CLIENT_MAX_SPEED;
           const angle = Math.atan2(dy, dx);

           if (mode === 'multiplayer' && driverRef.current) {
             striker.vx = Math.cos(angle) * forceMagnitude;
             striker.vy = Math.sin(angle) * forceMagnitude;
             setIsTurnActive(true);
             setStrikerPhase('positioning');
             setStrikerPos(0);
             setTimeLeft(20);
             driverRef.current.sendStrike(angle, power).then(res => {
               if (!res.ok) {
                 toast.error(res.error ? `Shot rejected: ${res.error}` : 'Shot rejected by server', { id: 'strike-rejected' });
               }
             });
           } else {
             striker.vx = Math.cos(angle) * forceMagnitude;
             striker.vy = Math.sin(angle) * forceMagnitude;
             setIsTurnActive(true);
             setStrikerPhase('positioning');
             setStrikerPos(0);
             setTimeLeft(20);
           }
         }
      }
    }
    setDragState('idle');
  };

  const handleStrikerPosChange = (val: number) => {
    setStrikerPos(val);
    const striker = coinsRef.current.find(c => c.type === 'striker');
    if (!striker) return;
    striker.x = BOARD_WIDTH / 2 + val;
    striker.y = STRIKER_START_Y;
    if (mode === 'multiplayer' && driverRef.current?.canPlaceStriker()) {
      const now = Date.now();
      if (now - lastPlaceSendAtRef.current >= 200) {
        lastPlaceSendAtRef.current = now;
        driverRef.current.sendPlaceStriker(striker.x);
      }
    }
  };

  const confirmStrikerPos = () => {
    if (mode !== 'multiplayer') return;
    const striker = coinsRef.current.find(c => c.type === 'striker');
    if (!striker || !driverRef.current?.canPlaceStriker()) return;
    lastPlaceSendAtRef.current = Date.now();
    driverRef.current.sendPlaceStriker(striker.x);
  };

  const handleConfirmStrikerPlacement = () => {
    if (mode === 'multiplayer' && driverRef.current?.canPlaceStriker()) {
      const striker = coinsRef.current.find(c => c.type === 'striker');
      if (striker) {
        if (strikerOverlapsCoin()) {
          toast.error('Striker overlaps a coin — move it before confirming.', { id: 'overlap-error' });
          return;
        }
        driverRef.current.sendPlaceStriker(striker.x);
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
    setTimeLeft(20);
    setCurrentPlayer('player');
    rulesRef.current = { queenStatus: 'unpocketed', queenPocketedBy: null, dueOwed: { white: 0, black: 0 } };
    turnScoreRef.current = { white: 0, black: 0, queen: false, foul: false };
    coinsRef.current = createInitialCoins();
    setIsTurnActive(false);
  };

  const pocketedWhiteCount = coinsRef.current.filter(c => c.type === 'white' && !c.active).length;
  const pocketedBlackCount = coinsRef.current.filter(c => c.type === 'black' && !c.active).length;
  const isPlayerWinner = mode === 'multiplayer' 
    ? (mySeat === 0 ? pocketedWhiteCount >= 9 : pocketedBlackCount >= 9)
    : pocketedWhiteCount >= 9;

  return (
    <GameWrapper title="Real Carrom 3D" gameId="carrom" mode={mode} stake={stake} onBack={onBack} isFullscreen>
      <div className="flex flex-col lg:flex-row items-center lg:items-start justify-center gap-6 lg:gap-8 w-full max-w-6xl relative h-full overflow-y-auto lg:overflow-y-visible py-4 px-2 custom-scrollbar">
        
        {gameOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in rounded-3xl">
            <div className="bg-[#0f172a] border border-amber-500/30 p-8 rounded-3xl shadow-2xl flex flex-col items-center max-w-sm w-full mx-4">
              <div className="text-6xl mb-4">{isPlayerWinner ? '🏆' : '❌'}</div>
              <h2 className={`text-3xl font-black uppercase tracking-widest text-center mb-2 ${isPlayerWinner ? 'text-emerald-400' : 'text-rose-500'}`}>
                {isPlayerWinner ? 'YOU WIN!' : 'GAME OVER'}
              </h2>
              <p className="text-slate-300 text-sm text-center mb-6 font-bold">
                White: {pocketedWhiteCount} / 9 | Black: {pocketedBlackCount} / 9
              </p>
              
              {isPlayerWinner && mode === 'ai' && (
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
                  <p className="text-slate-300 text-sm">Drag anywhere on the board or slider to <strong>position your striker</strong> along the baseline.</p>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-amber-500 font-bold">3.</span>
                  <p className="text-slate-300 text-sm">Drag backwards from the striker to <strong>aim and shoot</strong> using the laser trajectory line.</p>
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

        {/* ── MOBILE TOP HUD: Compact Scoreboard & Turn Status (< lg) ── */}
        <div className="flex lg:hidden flex-col gap-1.5 w-full max-w-[min(94vw,440px)] select-none">
          {/* Score Bar */}
          <div className="flex items-center justify-between gap-2 p-2 bg-[#0b0f1a]/95 backdrop-blur-xl border border-slate-800/80 rounded-2xl shadow-lg">
            {/* White (You) */}
            <div className="flex items-center gap-2 bg-slate-900/90 px-2.5 py-1.5 rounded-xl border border-emerald-500/30">
              <div className="w-4 h-4 rounded-full bg-white border border-slate-300 shadow-sm" />
              <div>
                <div className="text-[9px] font-black text-emerald-400 uppercase leading-none">White (You)</div>
                <div className="text-sm font-black text-amber-400 leading-none mt-0.5">{pocketedWhiteCount} / 9</div>
              </div>
            </div>

            {/* Queen Status Pill */}
            <div className="flex flex-col items-center">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">Queen</span>
              <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border transition-all ${
                rulesRef.current.queenStatus === 'covered'
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                  : rulesRef.current.queenStatus === 'pocketed_needs_cover'
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/50 animate-pulse"
                  : "bg-slate-800 text-slate-400 border-slate-700"
              }`}>
                👑 {rulesRef.current.queenStatus === 'covered' ? 'Covered' : rulesRef.current.queenStatus === 'pocketed_needs_cover' ? 'Needs Cover' : 'Unpocketed'}
              </span>
            </div>

            {/* Black (AI / Opponent) */}
            <div className="flex items-center gap-2 bg-slate-900/90 px-2.5 py-1.5 rounded-xl border border-slate-800">
              <div className="text-right">
                <div className="text-[9px] font-black text-slate-400 uppercase leading-none">Black (AI)</div>
                <div className="text-sm font-black text-slate-200 leading-none mt-0.5">{pocketedBlackCount} / 9</div>
              </div>
              <div className="w-4 h-4 rounded-full bg-slate-950 border border-slate-700 shadow-sm" />
            </div>
          </div>

          {/* Turn & Timer Sub-bar */}
          <div className="flex items-center justify-between px-2.5 py-1 bg-slate-900/80 border border-slate-800/80 rounded-xl">
            <div className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
              isMyTurn
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isMyTurn ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'}`} />
              <span>{isMyTurn ? 'YOUR TURN' : 'AI THINKING…'}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className={`font-mono text-xs font-black tracking-widest ${timeLeft <= 10 ? 'text-rose-400 animate-pulse' : 'text-slate-300'}`}>
                00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}
              </span>
              <button
                onClick={() => setShowRules(true)}
                className="text-[10px] text-slate-400 hover:text-white font-bold underline cursor-pointer"
              >
                Rules
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 w-full max-w-[min(94vw,50dvh,420px)]">
          <div className="relative w-full aspect-square">
            <canvas
              ref={canvasRef}
              width={400}
              height={400}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`w-full h-full object-contain touch-none shadow-[0_20px_60px_rgba(0,0,0,0.7)] rounded-[28px] ${dragState === 'idle' && isMyTurn ? 'cursor-grab' : !isMyTurn ? 'cursor-not-allowed' : 'cursor-grabbing'}`}
            />
          </div>

          {!isTurnActive && !gameOver && strikerPhase === 'positioning' && isMyTurn && (
            <div className="w-full flex flex-col items-center gap-1.5">
              <div
                className="relative w-full flex items-center px-4"
                style={{ height: '44px' }}
              >
                <div
                  className="absolute inset-x-4 rounded-full"
                  style={{
                    height: '32px',
                    background: 'linear-gradient(180deg, #c48a3c 0%, #e8a84a 40%, #9a6120 100%)',
                    border: '2px solid #6b3d0f',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.45), inset 0 2px 4px rgba(255,255,255,0.15)',
                  }}
                >
                  <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-full" style={{ height: '8px', background: 'rgba(0,0,0,0.2)' }} />
                </div>

                <input
                  type="range"
                  min={STRIKER_POS_MIN}
                  max={STRIKER_POS_MAX}
                  value={strikerPos}
                  onChange={(e) => handleStrikerPosChange(Number(e.target.value))}
                  onPointerUp={confirmStrikerPos}
                  className="relative w-full h-full opacity-0 cursor-grab z-10"
                  style={{ WebkitAppearance: 'none' }}
                />

                <div
                  className="absolute top-1/2 -translate-y-1/2 pointer-events-none z-20 flex items-center justify-center rounded-full shadow-lg"
                  style={{
                    width: '34px',
                    height: '34px',
                    left: `calc(${((strikerPos - STRIKER_POS_MIN) / (STRIKER_POS_MAX - STRIKER_POS_MIN)) * 100}% - ${((strikerPos - STRIKER_POS_MIN) / (STRIKER_POS_MAX - STRIKER_POS_MIN)) * 34}px + 0px)`,
                    background: 'radial-gradient(circle at 35% 35%, #ffffff, #f1f5f9 50%, #cbd5e1 100%)',
                    border: '2.5px solid rgba(255,255,255,0.95)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
                  }}
                />
              </div>
              
              <p className="text-[11px] text-slate-400 font-semibold tracking-wider uppercase text-center">Slide mover or tap baseline to position striker</p>
              {placementOverlapping && (
                <p className="text-[11px] text-rose-400 font-bold uppercase tracking-widest animate-pulse">
                  Striker overlaps a coin - move it
                </p>
              )}
            </div>
          )}

          {/* Aim / Wait Instructions on mobile */}
          <div className="lg:hidden w-full text-center min-h-[20px]">
            {(!isMyTurn || currentPlayer === 'ai') ? (
              <p className="text-[11px] text-slate-400 italic">Wait for opponent to shoot…</p>
            ) : strikerPhase !== 'positioning' ? (
              <p className="text-[11px] text-emerald-400 font-bold tracking-wide">🎯 Drag backwards from striker to aim &amp; shoot!</p>
            ) : null}
          </div>
        </div>

        {/* ── DESKTOP SIDEBAR PANEL (>= lg) ── */}
        <div className="hidden lg:flex flex-col items-center gap-3 lg:gap-4 glass-panel p-4 lg:p-6 rounded-3xl border border-slate-800 w-full max-w-[270px] h-auto max-h-[80vh] overflow-y-auto custom-scrollbar">
          
          {(() => {
            const myColor = mode === 'multiplayer' ? (mySeat === 1 ? 'black' : 'white') : 'white';
            return (
              <>
                <div className="w-full flex flex-col items-center gap-2 mb-1">
                   <div className={`px-4 py-2 rounded-full font-black text-sm uppercase shadow-lg transition-colors ${isMyTurn ? 'bg-emerald-500 text-white animate-pulse' : 'bg-rose-500 text-white'}`}>
                      {mode === 'multiplayer' 
                        ? (isMyTurn ? 'Your Turn' : "Opponent's Turn")
                        : (currentPlayer === 'player' ? 'Your Turn' : 'AI Turn')
                      }
                   </div>

                   <div className={`px-3 py-1.5 rounded-full font-extrabold text-xs flex items-center gap-2 shadow border ${myColor === 'white' ? 'bg-slate-100 text-slate-900 border-slate-300' : 'bg-slate-950 text-white border-slate-700'}`}>
                      <div className={`w-3 h-3 rounded-full ${myColor === 'white' ? 'bg-white border border-slate-400' : 'bg-slate-900 border border-slate-600'}`} />
                      <span>YOUR COINS: <strong className="uppercase">{myColor}</strong></span>
                   </div>
                </div>

                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">SCORE BOARD</h3>

                <div className="w-full grid grid-cols-3 gap-1.5 text-center bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                  <div className={`flex flex-col items-center p-1.5 rounded-lg transition-all ${myColor === 'white' ? 'bg-emerald-500/15 border border-emerald-500/40 ring-1 ring-emerald-500/30' : ''}`}>
                    <div className="w-4 h-4 rounded-full bg-white mb-1 shadow-sm border border-slate-300"></div>
                    <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest flex items-center gap-1">
                      White {myColor === 'white' && <span className="text-[9px] text-emerald-400 font-black">(YOU)</span>}
                    </p>
                    <p className="text-base font-black text-amber-400 mt-1">
                      {coinsRef.current.filter(c => c.type === 'white' && (!c.active || c.pocketing !== undefined)).length} / 9
                    </p>
                  </div>
                  
                  <div className="flex flex-col items-center border-l border-r border-slate-700 px-1 p-1.5">
                    <div className="w-4 h-4 rounded-full bg-rose-500 mb-1 shadow-sm border border-rose-300"></div>
                    <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Queen</p>
                    <p className="text-[9px] font-black text-amber-400 mt-1 uppercase">
                       {mode === 'ai'
                         ? (rulesRef.current.queenStatus === 'covered' ? 'Covered' : rulesRef.current.queenStatus === 'pocketed_needs_cover' ? 'Needs Cover' : 'Unpocketed')
                         : (queenStatus === 'covered' ? 'Covered' : queenStatus === 'pocketed_needs_cover' ? 'Needs Cover' : 'Unpocketed')}
                    </p>
                  </div>

                  <div className={`flex flex-col items-center p-1.5 rounded-lg transition-all ${myColor === 'black' ? 'bg-emerald-500/15 border border-emerald-500/40 ring-1 ring-emerald-500/30' : ''}`}>
                    <div className="w-4 h-4 rounded-full bg-slate-950 mb-1 shadow-sm border border-slate-800"></div>
                    <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest flex items-center gap-1">
                      Black {myColor === 'black' && <span className="text-[9px] text-emerald-400 font-black">(YOU)</span>}
                    </p>
                    <p className="text-base font-black text-slate-200 mt-1">
                      {coinsRef.current.filter(c => c.type === 'black' && (!c.active || c.pocketing !== undefined)).length} / 9
                    </p>
                  </div>
                </div>
              </>
            );
          })()}
          
          <div className="mt-4 w-full flex flex-col items-center">
            <div className={`text-4xl font-black tabular-nums transition-colors ${timeLeft <= 10 ? 'text-rose-500 animate-pulse' : 'text-slate-200'}`}>
              00:{timeLeft < 10 ? `0${timeLeft}` : timeLeft}
            </div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
              {mode === 'multiplayer'
                ? (isMyTurn ? 'YOUR TURN TIMER' : 'OPPONENT TIMER')
                : (currentPlayer === 'ai' ? 'AI THINKING...' : 'TURN TIMER')}
            </p>
          </div>

          <p className="text-xs text-slate-400 italic text-center mt-4 px-2">
            {currentPlayer === 'ai' || (mode === 'multiplayer' && !isMyTurn)
              ? 'Wait for opponent to shoot.' 
              : strikerPhase === 'positioning' 
                ? 'Slide or tap board to position striker.'
                : 'Drag backwards to aim and release to shoot!'}
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

