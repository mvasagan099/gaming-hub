/**
 * CarromMultiplayer — Multiplayer Carrom board with high-end visuals and UI.
 *
 * Design updates:
 * 1. Rich 3D canvas rendering: Wood grain texture, metallic brass corner accents,
 *    3D coin bevels, polished ivory/ebony finish, ruby queen, glowing striker.
 * 2. Glassmorphism UI panel: Unified scoreboard, live turn banners, queen indicator.
 * 3. Perfect layout scaling: Non-clipping flex container with responsive canvas sizing.
 * 4. Sleek striker placement slider: Translucent control bar with metallic thumb & status alerts.
 */

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useLayoutEffect,
} from "react";
import confetti from "canvas-confetti";
import toast from "react-hot-toast";
import { GameWrapper } from "../../components/GameWrapper";
import { MultiplayerMatchPanel } from "../shared/components/MultiplayerMatchPanel";
import { useMultiplayerStore } from "../../store/multiplayerStore";
import CarromMultiplayerDriver, {
  CLIENT_SIZE,
  mapToClient,
  worldToView,
  viewToWorld,
  type PocketEventInfo,
} from "./CarromMultiplayerDriver";
import type { CarromRemoteState } from "./CarromMultiplayerDriver";
import type { CarromTrajectoryKeyframe } from "@gaming-hub/game-engine";
import { Crown, Sparkles, CheckCircle2, AlertTriangle, Play, RefreshCw, X, MessageSquare, Clock } from "lucide-react";
import { CarromBoardRenderer } from "./rendering/CarromBoardRenderer";
import { CarromPieceRenderer } from "./rendering/CarromPieceRenderer";
import { CarromEffectsRenderer } from "./rendering/CarromEffectsRenderer";
import { CarromHUD, CarromGameOverModal } from "./components/CarromOverlays";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocalCoin {
  id: string;
  type: "white" | "black" | "queen" | "striker";
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mass: number;
  active: boolean;
  pocketed?: boolean;
  angle: number;
  spin: number;
  spinVel: number;
  trail: Array<{ x: number; y: number }>;
  pocketing?: {
    startX?: number;
    startY?: number;
    px: number;
    py: number;
    startTime?: number;
    durationMs?: number;
    scale: number;
    alpha: number;
    progress?: number;
    shotId?: number | string;
    pocketIndex?: number;
  };
}

interface ActiveTrajectory {
  shotId: number;
  keyframes: CarromTrajectoryKeyframe[];
  startTime: number;
  durationMs: number;
  targetState: CarromRemoteState;
  pocketEvents: PocketEventInfo[];
}

interface PowderParticle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
}

interface FloatingPop {
  id: number;
  text: string;
  color: string;
  x: number;
  y: number;
  alpha: number;
  scale: number;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
  r: number;
  maxR: number;
  alpha: number;
  color: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const W = CLIENT_SIZE; // 500
const H = CLIENT_SIZE; // 500
const BORDER = 27.5; // Matches server innerMin (33 × 5/6)
const POCKET_R = 17; // physics pocket radius (for capture zone calc)
const POCKETS = [
  { x: 37.5, y: 37.5 },
  { x: W - 37.5, y: 37.5 },
  { x: 37.5, y: H - 37.5 },
  { x: W - 37.5, y: H - 37.5 },
];
// Server canonical pocket coordinates (600x600)
const SERVER_POCKETS = [
  { x: 45, y: 45 },
  { x: 555, y: 45 },
  { x: 45, y: 555 },
  { x: 555, y: 555 },
];

function getViewPocket(pocketIndex: number, seat: number): { x: number; y: number } {
  const sp = SERVER_POCKETS[pocketIndex] || SERVER_POCKETS[0];
  return worldToView(sp.x, sp.y, seat);
}

// Pocket capture radius in client coords (server POCKET_RADIUS=30, scaled: 30×5/6 = 25)
const POCKET_CAP = 25;
// Inner pocket threshold (server uses 22px, scaled: 22×5/6 = 18.33)
const POCKET_CAP_INNER = 18.33;
// Pocket visual radius (server POCKET_RADIUS=30 × 5/6=25)
const POCKET_DRAW_R = 25;
// Matches server pocket hole: (POCKET_RADIUS 30) × 5/6 = 25
const POCKET_ZONE = 25;

const STRIKER_Y = H - 77.5; // 422.5 (matches server BASE_LINE_Y 507 × 5/6)
const OPPONENT_STRIKER_Y = 77.5; // 77.5 (matches server 93 × 5/6)
const STRIKER_SLIDER_MIN = -142.5; // Left red circle center (107.5 - 250)
const STRIKER_SLIDER_MAX = 142.5;  // Right red circle center (392.5 - 250)

// Server maxSpeed=27 × scale(5/6)=22.5
const SHOT_MAX_SPEED = 22.5;
const TRAIL_LEN = 7;
const FRICTION_PER_FRAME = 0.985;
const SUB_STEPS = 12;
// Matches server MIN_VELOCITY (0.06 × 5/6 = 0.05)
const MIN_VEL = 0.05;
// How many frames must pass with no movement before declaring the turn settled
const TURN_START_GRACE = 6;

// ─── Physics helpers ─────────────────────────────────────────────────────────

function buildLocalCoin(
  id: string,
  type: "white" | "black" | "queen" | "striker",
  x: number,
  y: number
): LocalCoin {
  // Server radii scaled to client: striker 18×(5/6)=15, coin/queen 15×(5/6)=12.5
  const r = type === "striker" ? 15 : type === "queen" ? 12.5 : 12.5;
  // Server masses: striker=2, coin=1
  const mass = type === "striker" ? 2 : 1;
  const initialSpin = ((id.charCodeAt(id.length - 1) || 0) * 1.618) % (Math.PI * 2);
  return {
    id,
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: r,
    mass,
    active: true,
    angle: 0,
    spin: initialSpin,
    spinVel: 0,
    trail: [],
  };
}

function fromServerState(
  state: CarromRemoteState,
  mySeat: number
): LocalCoin[] {
  const coins: LocalCoin[] = [];

  for (const sc of state.coins) {
    if (sc.pocketed) continue;
    const rawType = sc.type as string;
    const ctype =
      rawType === "queen"
        ? "queen"
        : rawType === "white"
        ? "white"
        : "black";
    const pos = mapToClient(sc.x, sc.y, mySeat);
    const c = buildLocalCoin(sc.id, ctype, pos.x, pos.y);
    coins.push(c);
  }

  // Striker
  const ss = state.striker;
  if (ss && !ss.pocketed) {
    const sp = mapToClient(ss.x, ss.y, mySeat);
    coins.push(buildLocalCoin("striker", "striker", sp.x, sp.y));
  } else {
    coins.push(
      buildLocalCoin("striker", "striker", W / 2, STRIKER_Y)
    );
  }

  console.log(`[CarromMultiplayer] (Seat ${mySeat}) Initialized coins from server:`, coins.map(c => `${c.id}=${c.type}`).join(", "));

  return coins;
}

// ─── 3D Drawing Delegations ──────────────────────────────────────────────────

function drawBoard(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  CarromBoardRenderer.drawBoard(ctx, w, h);
}

function drawCoin(
  ctx: CanvasRenderingContext2D,
  c: LocalCoin,
  isCurrentShooterWhite: boolean,
  isMyTurn: boolean,
  isTurnActive: boolean
): void {
  CarromPieceRenderer.drawCoin(ctx, c, isCurrentShooterWhite, isMyTurn, isTurnActive);
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  mySeat: number;
  playerNames: string[];
  stake: number;
  onBack: () => void;
}

const CarromMultiplayer: React.FC<Props> = ({
  mySeat,
  playerNames,
  stake,
  onBack,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const driverRef = useRef<CarromMultiplayerDriver | null>(null);
  const coinsRef = useRef<LocalCoin[]>([]);
  const floatsRef = useRef<FloatingPop[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);
  const particlesRef = useRef<PowderParticle[]>([]);
  const rafRef = useRef<number>(0);
  const mySeatRef = useRef(mySeat);
  mySeatRef.current = mySeat;
  // Safety timeout to force-settle physics if server is slow
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSettleTimeout = () => {
    if (settleTimeoutRef.current) {
      clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }
  };

  // Animation state
  const isTurnActiveRef = useRef(false);
  const activeTrajectoryRef = useRef<ActiveTrajectory | null>(null);
  const turnFramesRef = useRef(0);
  const pendingStateRef = useRef<CarromRemoteState | null>(null);
  const authoritativeShotRef = useRef<{
    shotId: number | null;
    pocketedCoinIds: Set<string>;
    pocketEvents: Map<string, number>;
    targetState: CarromRemoteState;
  } | null>(null);
  const hasInitRef = useRef(false);
  const lastPlaceSentRef = useRef(0);
  const remoteTargetStrikerXRef = useRef<number | null>(null);
  const processedPocketEventsRef = useRef<Set<string>>(new Set());
  const shotAnimCountRef = useRef<Record<string | number, number>>({});
  const shotDupCountRef = useRef<Record<string | number, number>>({});

  // UI state
  const [dragState, setDragState] = useState<"idle" | "dragging" | "placing_striker">("idle");
  const dragStartRef = useRef({ x: 0, y: 0 });
  const currentAimRef = useRef({ x: 0, y: 0 });
  const [dragAim, setDragAim] = useState({ sx: 0, sy: 0, ex: 0, ey: 0, power: 0 });

  const [strikerPos, setStrikerPos] = useState(0);
  const strikerPosRef = useRef(0);

  const [isMyTurn, setIsMyTurn] = useState(false);
  const isMyTurnRef = useRef(false);

  const [isTurnActive, setIsTurnActive] = useState(false);

  const [scores, setScores] = useState<{ seat0: number; seat1: number }>({ seat0: 0, seat1: 0 });
  const [queenCovered, setQueenCovered] = useState(false);
  const [queenPocketed, setQueenPocketed] = useState(false);
  const [queenState, setQueenState] = useState<"ON_BOARD" | "PENDING_COVER" | "COVERED">("ON_BOARD");
  const [pendingQueenOwner, setPendingQueenOwner] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [winnerSeat, setWinnerSeat] = useState<number | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [strikerOverlap, setStrikerOverlap] = useState(false);
  const serverOffsetRef = useRef<number>(0);
  const turnExpiresAtRef = useRef<number | null>(null);
  const turnNumberRef = useRef<number>(0);
  const lastLoggedSecRef = useRef<number>(-1);
  const [turnSecondsRemaining, setTurnSecondsRemaining] = useState<number>(30);
  const [turnExpiresAt, setTurnExpiresAt] = useState<number | null>(null);
  const [turnNumber, setTurnNumber] = useState<number>(1);

  const room = useMultiplayerStore((s) => s.room);

  // ── Driver setup ──────────────────────────────────────────────────────────

  useEffect(() => {
    const driver = new CarromMultiplayerDriver(mySeat, playerNames);
    driverRef.current = driver;

    driver.onStateUpdate = (state) => {
      const strikeInfo = driver.consumeNewStrike();
      const {
        isNew,
        shotId,
        angle,
        power,
        strikerPos: serverStriker,
        bySeat,
        pocketedCoinIds,
        pocketEvents,
        keyframes,
      } = strikeInfo;

      if (isNew) {
        const seat = mySeatRef.current;
        console.log("[CarromMultiplayer] REMOTE_SHOT_RECEIVED", {
          shotId,
          playerSeat: seat,
          bySeat,
          hasKeyframes: !!keyframes?.length,
          totalKeyframes: keyframes?.length,
        });

        authoritativeShotRef.current = {
          shotId,
          pocketedCoinIds: new Set(pocketedCoinIds),
          pocketEvents: new Map(pocketEvents.map((pe) => [pe.coinId, pe.pocketIndex])),
          targetState: state,
        };

        if (keyframes && keyframes.length > 1) {
          const lastKf = keyframes[keyframes.length - 1];
          const durationMs = Math.max(400, Math.min(lastKf.frame * 16.67, 3000));

          activeTrajectoryRef.current = {
            shotId: shotId ?? Date.now(),
            keyframes,
            startTime: performance.now(),
            durationMs,
            targetState: state,
            pocketEvents,
          };

          console.log("[CarromMultiplayer] ANIMATION_START", {
            shotId,
            playerSeat: seat,
            totalKeyframes: keyframes.length,
            durationMs,
          });

          isTurnActiveRef.current = true;
          turnFramesRef.current = 0;
          setIsTurnActive(true);
          pendingStateRef.current = state;

          clearSettleTimeout();
          settleTimeoutRef.current = setTimeout(() => {
            if (isTurnActiveRef.current) {
              isTurnActiveRef.current = false;
              turnFramesRef.current = 0;
              setIsTurnActive(false);
              activeTrajectoryRef.current = null;
              const s = pendingStateRef.current || driverRef.current?.lastState;
              pendingStateRef.current = null;
              if (s) applyServerState(s);
            }
          }, durationMs + 600);

          return;
        }

        if (isTurnActiveRef.current || bySeat === seat) {
          pendingStateRef.current = state;
          if (!isTurnActiveRef.current) {
            applyServerState(state);
            pendingStateRef.current = null;
          }
          return;
        }

        // Remote player fallback (if no keyframes)
        const striker = coinsRef.current.find((c) => c.type === "striker");
        if (striker && serverStriker) {
          const sp = worldToView(serverStriker.x, serverStriker.y, seat);
          striker.x = sp.x;
          striker.y = sp.y;
          striker.active = true;
          striker.vx = 0;
          striker.vy = 0;
          striker.trail = [];
          striker.pocketing = undefined;
        }

        // Convert server angle to local canvas angle (seat-1 sees 180° rotation)
        const localAngle = seat === 1 ? angle + Math.PI : angle;
        const forceMag = power * SHOT_MAX_SPEED;
        if (striker) {
          striker.vx = Math.cos(localAngle) * forceMag;
          striker.vy = Math.sin(localAngle) * forceMag;
        }

        isTurnActiveRef.current = true;
        turnFramesRef.current = 0;
        setIsTurnActive(true);
        pendingStateRef.current = state;

        clearSettleTimeout();
        settleTimeoutRef.current = setTimeout(() => {
          if (isTurnActiveRef.current) {
            isTurnActiveRef.current = false;
            turnFramesRef.current = 0;
            setIsTurnActive(false);
            const s = pendingStateRef.current || driverRef.current?.lastState;
            pendingStateRef.current = null;
            if (s) applyServerState(s);
          }
        }, 4000);

        return;
      }

      if (isTurnActiveRef.current) {
        // Physics is still running — queue the state for when it settles.
        pendingStateRef.current = state;
        if (authoritativeShotRef.current) {
          authoritativeShotRef.current.targetState = state;
        }
        return;
      }

      applyServerState(state);
    };

    driver.onCoinPocketed = (_id, _type, _pocket) => {
      // Coin pocketed - celebration confetti blast removed
    };

    driver.onCoinReturned = (_id, type) => {
      toast(`${type === "queen" ? "Queen" : "Coin"} returned to board`, {
        id: "coin-returned",
        duration: 2500,
      });
    };

    driver.onQueenReturned = (reason) => {
      toast(
        reason === "foul"
          ? "Queen returned — foul forfeits pending cover"
          : "Queen not covered — returned to board",
        { id: "queen-returned", duration: 2500 }
      );
    };

    driver.onFoul = (reason) => {
      toast.error(`Foul: ${reason}`, { id: "foul", duration: 3000 });
    };

    driver.onWin = (seat) => {
      setWinnerSeat(seat);
      setGameOver(true);
      if (seat === mySeat) {
        confetti({ particleCount: 140, spread: 85 });
      }
    };

    driver.onStrikerPositionUpdate = (data) => {
      if (isTurnActiveRef.current) return;
      const seat = mySeatRef.current;
      // Convert canonical world X to player's local view X
      const viewPos = worldToView(data.x, 0, seat);
      remoteTargetStrikerXRef.current = viewPos.x;
    };

    driver.start();

    return () => {
      driver.stop();
      driverRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mySeat]);

  // ── Server state application ──────────────────────────────────────────────

  const applyServerState = useCallback(
    (state: CarromRemoteState) => {
      const seat = mySeatRef.current;
      // Sync coins and reposition striker to server-confirmed locations.
      syncCoinsToServer(state, true);

      // Scores
      const s0 = state.players.find((p) => p.seat === 0)?.score ?? 0;
      const s1 = state.players.find((p) => p.seat === 1)?.score ?? 0;
      setScores({ seat0: s0, seat1: s1 });

      // Queen status (authoritative server state)
      const myPlayer = state.players.find((p) => p.seat === seat);
      const qState = state.queenState ?? (myPlayer?.queenCovered ? "COVERED" : myPlayer?.queenPocketed ? "PENDING_COVER" : "ON_BOARD");
      setQueenState(qState);
      setPendingQueenOwner(state.pendingQueenOwner ?? null);
      setQueenCovered(qState === "COVERED" || !!myPlayer?.queenCovered);
      setQueenPocketed(qState === "COVERED" || qState === "PENDING_COVER" || !!myPlayer?.queenPocketed);

      const prevTurn = isMyTurnRef.current;
      const myTurn = state.currentSeat === seat;
      isMyTurnRef.current = myTurn;
      setIsMyTurn(myTurn);

      if (typeof state.turnNumber === "number" && state.turnNumber < turnNumberRef.current) {
        console.log("[CARROM TIMER] Ignoring stale state packet", { stateTurn: state.turnNumber, currentTurn: turnNumberRef.current });
        return;
      }
      if (typeof state.turnNumber === "number") {
        turnNumberRef.current = state.turnNumber;
        setTurnNumber(state.turnNumber);
      }

      const serverTs = (state as any).serverTimestamp ?? state.lastActionAtMs ?? state.turnStartedAt;
      if (serverTs) {
        serverOffsetRef.current = serverTs - Date.now();
      }

      const exp = state.turnExpiresAt ?? (state.turnStartedAtMs ? state.turnStartedAtMs + 30000 : null);
      turnExpiresAtRef.current = exp;
      setTurnExpiresAt(exp);

      // Initialize mover slider position when gaining turn or awarded an extra turn
      if (myTurn && (prevTurn !== myTurn || state.strikerPlacementPhase)) {
        remoteTargetStrikerXRef.current = null;
        const sx = state.striker?.x;
        const initialOffset = sx !== undefined ? mapToClient(sx, 0, seat).x - W / 2 : 0;
        const clampedOffset = Math.max(STRIKER_SLIDER_MIN, Math.min(STRIKER_SLIDER_MAX, initialOffset));
        setStrikerPos(clampedOffset);
        strikerPosRef.current = clampedOffset;
      }

      if (state.finished) setGameOver(true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  function syncCoinsToServer(state: CarromRemoteState, repositionStriker: boolean): void {
    const seat = mySeatRef.current;

    if (!hasInitRef.current) {
      hasInitRef.current = true;
      coinsRef.current = fromServerState(state, seat);
      return;
    }

    // Build a lookup of server coins by id for fast access.
    const serverCoinMap = new Map(state.coins.map(c => [c.id, c]));

    for (const lc of coinsRef.current) {
      if (lc.type === "striker") continue;
      const sc = serverCoinMap.get(lc.id);
      if (!sc) continue;

      if (sc.pocketed) {
        lc.active = false;
        lc.pocketed = true;
        lc.pocketing = undefined;
        lc.vx = 0;
        lc.vy = 0;
      } else {
        // Coin is active on server — snap directly to authoritative position & update type
        lc.active = true;
        lc.pocketed = false;
        lc.pocketing = undefined;
        const rawType = sc.type as string;
        lc.type = rawType === "queen" ? "queen" : rawType === "white" ? "white" : "black";
        const cp = mapToClient(sc.x, sc.y, seat);
        lc.x = cp.x;
        lc.y = cp.y;
        lc.vx = 0; lc.vy = 0;
        lc.trail = [];
      }
    }

    // Add any coins that were returned to the board (foul penalty) but not yet in local list.
    for (const sc of state.coins) {
      if (sc.pocketed) continue;
      const exists = coinsRef.current.some(lc => lc.id === sc.id);
      if (!exists) {
        const rawType = sc.type as string;
        const ctype = rawType === "queen" ? "queen" : rawType === "white" ? "white" : "black";
        const pos = mapToClient(sc.x, sc.y, seat);
        coinsRef.current.push(buildLocalCoin(sc.id, ctype, pos.x, pos.y));
      }
    }

    if (repositionStriker) {
      const striker = coinsRef.current.find((c) => c.type === "striker");
      if (striker) {
        const isMyTurnNow = state.currentSeat === seat;
        const sx = state.striker?.x;
        striker.x = sx !== undefined ? mapToClient(sx, 0, seat).x : W / 2;
        striker.y = isMyTurnNow ? STRIKER_Y : OPPONENT_STRIKER_Y;
        striker.vx = 0; striker.vy = 0;
        striker.trail = [];
        // CRITICAL: clear pocketing animation so the striker doesn't render
        // as a ghost after a foul (server creates fresh striker with pocketed=false).
        striker.pocketing = undefined;
        striker.active = !state.striker?.pocketed;
      }
    }
  }

  // ── Game Loop ─────────────────────────────────────────────────────────────

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const coins = coinsRef.current;
    let anyMoving = false;

    if (activeTrajectoryRef.current) {
      anyMoving = true;
      const traj = activeTrajectoryRef.current;
      const elapsed = performance.now() - traj.startTime;
      const progress = Math.min(1, elapsed / traj.durationMs);
      const lastKf = traj.keyframes[traj.keyframes.length - 1];
      const maxSimFrame = lastKf.frame || 1;
      const currentSimFrame = progress * maxSimFrame;

      let k1 = traj.keyframes[0];
      let k2 = lastKf;
      for (let i = 0; i < traj.keyframes.length - 1; i++) {
        if (traj.keyframes[i].frame <= currentSimFrame && traj.keyframes[i + 1].frame >= currentSimFrame) {
          k1 = traj.keyframes[i];
          k2 = traj.keyframes[i + 1];
          break;
        }
      }

      const span = k2.frame - k1.frame || 1;
      const alpha = Math.max(0, Math.min(1, (currentSimFrame - k1.frame) / span));

      const k1Map = new Map(k1.pieces.map((p) => [p.id, p]));
      const k2Map = new Map(k2.pieces.map((p) => [p.id, p]));

      const seat = mySeatRef.current;

      for (const c of coins) {
        if (c.pocketed || c.pocketing) continue;
        const p1 = k1Map.get(c.id);
        const p2 = k2Map.get(c.id);

        if (p2 && p2.pocketed && typeof p2.pocketIndex === "number") {
          const matchId = useMultiplayerStore.getState().matchId ?? "match";
          const pocketKey = `${traj.shotId}:${c.id}`;
          const eventId = `${traj.shotId}:${c.id}:${p2.pocketIndex}`;

          if (processedPocketEventsRef.current.has(pocketKey)) {
            shotDupCountRef.current[traj.shotId] = (shotDupCountRef.current[traj.shotId] || 0) + 1;
            console.warn("[CARROM] DUPLICATE_POCKET_EVENT_IGNORED", {
              matchId,
              shotId: traj.shotId,
              coinId: c.id,
              coinType: c.type,
              pocketIndex: p2.pocketIndex,
              eventId,
              pocketKey,
            });
            continue;
          }
          processedPocketEventsRef.current.add(pocketKey);
          shotAnimCountRef.current[traj.shotId] = (shotAnimCountRef.current[traj.shotId] || 0) + 1;

          console.log("[CARROM] POCKET_ANIMATION_STARTED", {
            matchId,
            shotId: traj.shotId,
            coinId: c.id,
            coinType: c.type,
            pocketIndex: p2.pocketIndex,
            eventId,
            animationState: "pocketing",
          });

          const p = getViewPocket(p2.pocketIndex, seat);
          c.pocketing = {
            startX: c.x,
            startY: c.y,
            px: p.x,
            py: p.y,
            startTime: performance.now(),
            durationMs: 140,
            scale: 1,
            alpha: 1,
            progress: 0,
            shotId: traj.shotId,
            pocketIndex: p2.pocketIndex,
          };
          c.vx = 0;
          c.vy = 0;

          const txt =
            c.type === "queen" ? "👑 QUEEN!" :
            c.type === "white" ? "⚪ +1" :
            c.type === "black" ? "⚫ +1" : "❌ FOUL";
          const col =
            c.type === "queen" ? "#f43f5e" :
            c.type === "white" ? "#facc15" :
            c.type === "black" ? "#cbd5e1" : "#ef4444";

          floatsRef.current.push({
            id: Math.random(),
            text: txt, color: col,
            x: p.x, y: p.y - 12,
            alpha: 1, scale: 1.2,
          });
          ripplesRef.current.push({
            id: Math.random(),
            x: p.x, y: p.y,
            r: 10, maxR: 38, alpha: 0.9, color: col,
          });
          continue;
        }

        if (p1 && p2) {
          const worldX = p1.x + (p2.x - p1.x) * alpha;
          const worldY = p1.y + (p2.y - p1.y) * alpha;
          const viewPos = worldToView(worldX, worldY, seat);

          const dx = viewPos.x - c.x;
          const dy = viewPos.y - c.y;
          const spd = Math.hypot(dx, dy);

          c.x = viewPos.x;
          c.y = viewPos.y;
          c.vx = dx;
          c.vy = dy;
          c.active = true;

          if (spd > 0.3) {
            c.spin = (c.spin || 0) + spd * 0.05;
            c.trail.push({ x: c.x, y: c.y });
            if (c.trail.length > TRAIL_LEN) c.trail.shift();
          } else if (c.trail.length > 0) {
            c.trail.shift();
          }

          if (spd > 2.8 && Math.random() < 0.25) {
            particlesRef.current.push({
              id: Math.random(),
              x: c.x,
              y: c.y,
              vx: (Math.random() - 0.5) * 2,
              vy: (Math.random() - 0.5) * 2,
              size: 1.2 + Math.random() * 1.5,
              alpha: 0.8,
              color: c.type === "striker" ? "rgba(56,189,248,0.9)" : "rgba(254,240,138,0.8)",
            });
          }
        }
      }

      if (progress >= 1) {
        const matchId = useMultiplayerStore.getState().matchId ?? "match";
        console.log("[CARROM] SHOT_SUMMARY", {
          matchId,
          shotId: traj.shotId,
          shooterId: `seat-${traj.targetState.lastActionSeat ?? 0}`,
          pocketedCoins: traj.pocketEvents.map((pe) => ({
            coinId: pe.coinId,
            coinType: pe.coinType,
            pocketIndex: pe.pocketIndex,
          })),
          pocketEventCount: traj.pocketEvents.length,
          animationEventCount: shotAnimCountRef.current[traj.shotId] || 0,
          duplicateEventCount: shotDupCountRef.current[traj.shotId] || 0,
          finalTurnPlayerId: `seat-${traj.targetState.currentSeat}`,
        });
        console.log("[CarromMultiplayer] ANIMATION_COMPLETE", {
          shotId: traj.shotId,
          playerSeat: seat,
        });
        activeTrajectoryRef.current = null;
        isTurnActiveRef.current = false;
        turnFramesRef.current = 0;
        setIsTurnActive(false);
        clearSettleTimeout();
        applyServerState(traj.targetState);
      }
    } else if (isTurnActiveRef.current) {
      turnFramesRef.current++;
      const stepFactor = 1 / SUB_STEPS;
      // Server uses innerMin=33 scaled to client: 33×(5/6)=27.5 ≈ BORDER=27.5
      const innerMin = BORDER;
      const innerMax = W - BORDER;
      const frictionStep = Math.pow(FRICTION_PER_FRAME, stepFactor);

      for (let step = 0; step < SUB_STEPS; step++) {
        for (const c of coins) {
          if (!c.active || c.pocketing) continue;
          c.x += c.vx * stepFactor;
          c.y += c.vy * stepFactor;

          // Integrate realistic visual spin
          c.spin = (c.spin || 0) + (c.spinVel || 0) * stepFactor;
          c.spinVel = (c.spinVel || 0) * Math.pow(0.97, stepFactor);

          const spd = Math.hypot(c.vx, c.vy);
          if (spd > 1.2) {
            c.trail.push({ x: c.x, y: c.y });
            if (c.trail.length > TRAIL_LEN) c.trail.shift();
          } else if (c.trail.length > 0) {
            c.trail.shift();
          }

          const r = c.radius;
          // Match server wall restitution: striker=0.75, coin=0.70
          const wallR = c.type === "striker" ? 0.75 : 0.70;

          let inPocketZone = false;
          for (const p of POCKETS) {
            if (Math.hypot(c.x - p.x, c.y - p.y) <= POCKET_ZONE) {
              inPocketZone = true;
              break;
            }
          }

          if (!inPocketZone) {
            if (c.x - r < innerMin) {
              c.x = innerMin + r;
              c.vx = Math.abs(c.vx) * wallR;
              c.spinVel = (c.spinVel || 0) + c.vy * 0.04;
            } else if (c.x + r > innerMax) {
              c.x = innerMax - r;
              c.vx = -Math.abs(c.vx) * wallR;
              c.spinVel = (c.spinVel || 0) - c.vy * 0.04;
            }
            if (c.y - r < innerMin) {
              c.y = innerMin + r;
              c.vy = Math.abs(c.vy) * wallR;
              c.spinVel = (c.spinVel || 0) - c.vx * 0.04;
            } else if (c.y + r > innerMax) {
              c.y = innerMax - r;
              c.vy = -Math.abs(c.vy) * wallR;
              c.spinVel = (c.spinVel || 0) + c.vx * 0.04;
            }
          }

          c.vx *= frictionStep;
          c.vy *= frictionStep;
          if (Math.abs(c.vx) < MIN_VEL) c.vx = 0;
          if (Math.abs(c.vy) < MIN_VEL) c.vy = 0;
          if (c.vx !== 0 || c.vy !== 0) anyMoving = true;
        }

        for (let i = 0; i < coins.length; i++) {
          for (let j = i + 1; j < coins.length; j++) {
            const a = coins[i], b = coins[j];
            if (!a.active || !b.active || a.pocketing || b.pocketing) continue;

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = a.radius + b.radius;

            if (dist < minDist && dist > 0) {
              const nx = dx / dist;
              const ny = dy / dist;
              const dvx = a.vx - b.vx;
              const dvy = a.vy - b.vy;
              const dvn = dvx * nx + dvy * ny;

              if (dvn > 0) {
                // Match server: striker collisions use 0.90, coin-coin use 0.82
                const restit = a.type === "striker" || b.type === "striker" ? 0.90 : 0.82;
                const imp = -(2 * a.mass * b.mass * dvn) / (a.mass + b.mass) * restit;
                a.vx += (imp * nx) / a.mass;
                a.vy += (imp * ny) / a.mass;
                b.vx -= (imp * nx) / b.mass;
                b.vy -= (imp * ny) / b.mass;

                // Tangential torque imparts visual spin
                const tx = -ny;
                const ty = nx;
                const dvt = dvx * tx + dvy * ty;
                const spinImpulse = dvt * 0.16;
                a.spinVel = (a.spinVel || 0) + spinImpulse / a.radius;
                b.spinVel = (b.spinVel || 0) - spinImpulse / b.radius;

                // High-speed powder sparks on impact
                if (dvn > 2.2) {
                  const contactX = a.x + nx * a.radius;
                  const contactY = a.y + ny * a.radius;
                  const count = Math.min(5, Math.floor(dvn * 0.6));
                  const pCol =
                    a.type === "striker" || b.type === "striker"
                      ? "rgba(56,189,248,0.95)"
                      : "rgba(254,240,138,0.9)";
                  for (let k = 0; k < count; k++) {
                    const sp = 0.5 + Math.random() * (dvn * 0.18);
                    const ang = Math.random() * Math.PI * 2;
                    particlesRef.current.push({
                      id: Math.random(),
                      x: contactX,
                      y: contactY,
                      vx: Math.cos(ang) * sp,
                      vy: Math.sin(ang) * sp,
                      size: 1.2 + Math.random() * 1.6,
                      alpha: 0.9,
                      color: pCol,
                    });
                  }
                }
              }

              const overlap = minDist - dist;
              const tm = a.mass + b.mass;
              a.x -= nx * overlap * (b.mass / tm);
              a.y -= ny * overlap * (b.mass / tm);
              b.x += nx * overlap * (a.mass / tm);
              b.y += ny * overlap * (a.mass / tm);
            }
          }
        }
      }

      // Pocket Capture
      for (const c of coins) {
        if (!c.active || c.pocketing) continue;

        for (const p of POCKETS) {
          const dx = p.x - c.x;
          const dy = p.y - c.y;
          const dist = Math.hypot(dx, dy);
          if (dist <= POCKET_CAP) {
            let isPocketed = false;
            if (dist <= POCKET_CAP_INNER) {
              isPocketed = true;
            } else {
              const dotProduct = c.vx * dx + c.vy * dy;
              if (dotProduct > 0 || Math.hypot(c.vx, c.vy) < 3.33) {
                isPocketed = true;
              }
            }

            if (isPocketed) {
              c.pocketing = {
                startX: c.x,
                startY: c.y,
                px: p.x,
                py: p.y,
                startTime: performance.now(),
                durationMs: 140,
                scale: 1,
                alpha: 1,
                progress: 0,
              };
              c.vx = 0; c.vy = 0;

              const txt =
                c.type === "queen" ? "👑 QUEEN!" :
                c.type === "white" ? "⚪ +1" :
                c.type === "black" ? "⚫ +1" : "❌ FOUL";
              const col =
                c.type === "queen" ? "#f43f5e" :
                c.type === "white" ? "#facc15" :
                c.type === "black" ? "#cbd5e1" : "#ef4444";

              floatsRef.current.push({
                id: Math.random(),
                text: txt, color: col,
                x: p.x, y: p.y - 12,
                alpha: 1, scale: 1.2,
              });
              ripplesRef.current.push({
                id: Math.random(),
                x: p.x, y: p.y,
                r: 10, maxR: 38, alpha: 0.9, color: col,
              });
              break;
            }
          }
        }
      }
    } else {
      for (const c of coins) {
        if (c.pocketing) anyMoving = true;
      }
    }

    // Realistic 3D pocket gravity suction & depth drop (easeInCubic acceleration into the hole)
    for (const c of coins) {
      if (!c.pocketing) continue;
      const pElapsed = performance.now() - (c.pocketing.startTime || performance.now());
      const duration = c.pocketing.durationMs || 140;
      const pt = Math.min(1, pElapsed / duration);
      const eased = pt * pt * pt; // easeInCubic: natural acceleration into hole
      const startX = c.pocketing.startX !== undefined ? c.pocketing.startX : c.x;
      const startY = c.pocketing.startY !== undefined ? c.pocketing.startY : c.y;
      c.x = startX + (c.pocketing.px - startX) * eased;
      c.y = startY + (c.pocketing.py - startY) * eased;
      c.pocketing.scale = Math.max(0, 1 - 0.65 * eased);
      c.pocketing.alpha = Math.max(0, 1 - pt * pt);
      c.spin = (c.spin || 0) + 0.15;
      if (pt >= 1) {
        const matchId = useMultiplayerStore.getState().matchId ?? "match";
        const pIndex = c.pocketing.pocketIndex ?? 0;
        const pShotId = c.pocketing.shotId ?? "shot";
        const pEventId = `${pShotId}:${c.id}:${pIndex}`;
        console.log("[CARROM] POCKET_ANIMATION_COMPLETED", {
          matchId,
          shotId: pShotId,
          coinId: c.id,
          coinType: c.type,
          pocketIndex: pIndex,
          eventId: pEventId,
          animationState: "pocketed",
        });
        c.active = false;
        c.pocketed = true;
        c.pocketing = undefined;
      } else {
        anyMoving = true;
      }
    }

    // Update authoritative turn timer
    if (turnExpiresAtRef.current && !isTurnActiveRef.current && !gameOver) {
      const currentServerTime = Date.now() + serverOffsetRef.current;
      const remMs = Math.max(0, turnExpiresAtRef.current - currentServerTime);
      const remSec = Math.ceil(remMs / 1000);
      setTurnSecondsRemaining(remSec);

      if (remSec !== lastLoggedSecRef.current) {
        lastLoggedSecRef.current = remSec;
        console.log("[CARROM TIMER] TICK", {
          turnNumber: turnNumberRef.current,
          playerId: isMyTurnRef.current ? "you" : "opponent",
          remaining: remSec,
        });
      }
    }

    if (
      isTurnActiveRef.current &&
      !activeTrajectoryRef.current &&
      !anyMoving &&
      turnFramesRef.current >= 10  // at least 10 frames with no movement
    ) {
      // Settle using pendingStateRef or driver's last confirmed state
      const state = pendingStateRef.current || driverRef.current?.lastState;
      if (state) {
        clearSettleTimeout();
        isTurnActiveRef.current = false;
        setIsTurnActive(false);
        turnFramesRef.current = 0;
        pendingStateRef.current = null;
        authoritativeShotRef.current = null;
        applyServerState(state);
      }
    }

    // Render Canvas with High-DPI support
    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 2, 3) : 2;
    const targetW = Math.round(W * dpr);
    const targetH = Math.round(H * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    drawBoard(ctx, W, H);

    // Ripples
    for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
      const rip = ripplesRef.current[i];
      rip.r += 1.2; rip.alpha -= 0.035;
      if (rip.alpha <= 0 || rip.r >= rip.maxR) { ripplesRef.current.splice(i, 1); continue; }
      ctx.save();
      ctx.strokeStyle = rip.color;
      ctx.globalAlpha = rip.alpha;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Motion Trails with Velocity-Responsive Glow
    for (const c of coins) {
      if (!c.active || c.trail.length < 2) continue;
      const tc =
        c.type === "striker" ? "56,189,248" :
        c.type === "queen" ? "244,63,94" :
        c.type === "white" ? "250,204,21" : "148,163,184";
      for (let ti = 0; ti < c.trail.length; ti++) {
        const tp = c.trail[ti];
        const a = ((ti + 1) / c.trail.length) * 0.28;
        const tr = c.radius * (0.35 + 0.55 * (ti / c.trail.length));
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, tr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${tc},${a.toFixed(2)})`;
        ctx.fill();
      }
    }

    // Render Powder Dust Particles
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.alpha -= 0.04;
      if (p.alpha <= 0) {
        particlesRef.current.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Striker placement positioning
    const striker = coins.find((c) => c.type === "striker");
    if (striker && !isTurnActiveRef.current && !gameOver) {
      if (isMyTurnRef.current) {
        striker.x = W / 2 + strikerPosRef.current;
        striker.y = STRIKER_Y;
      } else {
        const targetX =
          remoteTargetStrikerXRef.current !== null
            ? remoteTargetStrikerXRef.current
            : driverRef.current?.lastState?.striker?.x !== undefined
            ? mapToClient(driverRef.current.lastState.striker.x, 0, mySeatRef.current).x
            : W / 2;
        striker.x += (targetX - striker.x) * 0.25;
        striker.y = OPPONENT_STRIKER_Y;
      }
    }

    const latestState = driverRef.current?.lastState;
    const shooterSeat = latestState?.currentSeat ?? mySeatRef.current;
    const shooterIsWhite = shooterSeat === 0;

    let isOverlap = false;
    if (
      striker &&
      isMyTurnRef.current &&
      !isTurnActiveRef.current
    ) {
      for (const c of coins) {
        if (c.type === "striker" || !c.active || c.pocketing) continue;
        if (Math.hypot(c.x - striker.x, c.y - striker.y) < c.radius + striker.radius) {
          isOverlap = true;
          break;
        }
      }
    }

    for (const c of coins) {
      if (!c.active && !c.pocketing) continue;
      drawCoin(ctx, c, shooterIsWhite, isMyTurnRef.current, isTurnActiveRef.current);
    }

    if (isOverlap && striker && striker.active) {
      ctx.strokeStyle = "#f43f5e";
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(striker.x, striker.y, striker.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Aim Line & Power Arc
    if (dragState === "dragging" && !isTurnActiveRef.current && !gameOver && striker && striker.active) {
      const { sx, sy, ex, ey, power } = dragAim;
      const dx = sx - ex; const dy = sy - ey;
      const pullDist = Math.hypot(dx, dy);
      if (pullDist > 5) {
        const dirX = dx / pullDist;
        const dirY = dy / pullDist;

        let lineEndX = striker.x + dirX * 400;
        let lineEndY = striker.y + dirY * 400;
        let hitCoin: LocalCoin | null = null;
        let hitGhostX = 0, hitGhostY = 0;

        for (const c of coins) {
          if (c.type === "striker" || !c.active || c.pocketing) continue;
          const combR = striker.radius + c.radius;
          const vx = c.x - striker.x;
          const vy = c.y - striker.y;
          const t = vx * dirX + vy * dirY;
          if (t <= 0) continue;
          const perpSq = vx * vx + vy * vy - t * t;
          if (perpSq >= combR * combR) continue;
          const d = t - Math.sqrt(combR * combR - perpSq);
          const gx = striker.x + dirX * d;
          const gy = striker.y + dirY * d;
          if (d > 0 && d < Math.hypot(lineEndX - striker.x, lineEndY - striker.y)) {
            lineEndX = gx; lineEndY = gy;
            hitCoin = c; hitGhostX = gx; hitGhostY = gy;
          }
        }

        ctx.save();
        ctx.strokeStyle = `rgba(${Math.round(255 * power)},${Math.round(255 * (1 - power))},80,0.95)`;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.moveTo(striker.x, striker.y);
        ctx.lineTo(lineEndX, lineEndY);
        ctx.stroke();
        ctx.setLineDash([]);

        if (hitCoin) {
          ctx.strokeStyle = "rgba(255,255,255,0.75)";
          ctx.fillStyle = "rgba(255,255,255,0.15)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(hitGhostX, hitGhostY, striker.radius, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();

          const cvx = hitCoin.x - hitGhostX;
          const cvy = hitCoin.y - hitGhostY;
          const cl = Math.hypot(cvx, cvy) || 1;
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(hitCoin.x, hitCoin.y);
          ctx.lineTo(hitCoin.x + (cvx / cl) * 65, hitCoin.y + (cvy / cl) * 65);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.strokeStyle = `rgba(${Math.round(255 * power)},${Math.round(255 * (1 - power))},80,0.95)`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(striker.x, striker.y, striker.radius + 4 + power * 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Floating text pops
    for (let i = floatsRef.current.length - 1; i >= 0; i--) {
      const fp = floatsRef.current[i];
      fp.y -= 0.85; fp.alpha -= 0.02;
      if (fp.alpha <= 0) { floatsRef.current.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = fp.alpha;
      ctx.font = "900 14px system-ui,sans-serif";
      ctx.fillStyle = fp.color;
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 5;
      ctx.fillText(fp.text, fp.x, fp.y);
      ctx.restore();
    }

    ctx.restore(); // Restore high-DPI scaling transformation

    rafRef.current = requestAnimationFrame(animate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState, dragAim, gameOver]);

  useLayoutEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  // ── Pointer Handlers (Exclusively for Aiming & Shooting) ────────────────────

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (gameOver || isTurnActiveRef.current || showRules) return;
    if (!isMyTurnRef.current) return;

    const striker = coinsRef.current.find((c) => c.type === "striker");
    if (!striker || !striker.active) return;

    const { x, y } = getCanvasCoords(e);

    // Canvas interaction is strictly for AIMING & SHOOTING from the current striker position.
    // The striker cannot be dragged horizontally across the canvas to reposition it.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    setDragState("dragging");
    // Aim line always anchors to the fixed striker position
    dragStartRef.current = { x: striker.x, y: striker.y };
    currentAimRef.current = { x, y };
    setDragAim({ sx: striker.x, sy: striker.y, ex: x, ey: y, power: 0 });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragState !== "dragging") return;

    const striker = coinsRef.current.find((c) => c.type === "striker");
    if (!striker) return;

    const { x, y } = getCanvasCoords(e);
    currentAimRef.current = { x, y };

    const sx = striker.x;
    const sy = striker.y;
    const pullDist = Math.hypot(sx - x, sy - y);
    const power = Math.min(pullDist / 160, 1);
    setDragAim({ sx, sy, ex: x, ey: y, power });
  };

  const handlePointerUp = () => {
    if (dragState !== "dragging") {
      setDragState("idle");
      return;
    }
    setDragState("idle");

    const striker = coinsRef.current.find((c) => c.type === "striker");
    if (!striker || !driverRef.current?.canStrike()) return;

    const sx = striker.x;
    const sy = striker.y;
    const { x: ex, y: ey } = currentAimRef.current;
    const dx = sx - ex;
    const dy = sy - ey;
    const pullDist = Math.hypot(dx, dy);

    // Minimum pull threshold to avoid accidental micro-clicks
    if (pullDist < 12) return;

    if (turnSecondsRemaining <= 0) {
      toast.error("Time's up! Turn expired.", { id: "turn-timeout" });
      return;
    }

    // Check if striker overlaps any coin before shooting
    if (checkStrikerOverlap()) {
      toast.error("Striker overlaps a coin — slide mover to a clear spot", { id: "overlap" });
      return;
    }

    const power = Math.min(pullDist / 160, 1);
    const angle = Math.atan2(dy, dx);

    // Immediately start local physics so the shot feels ultra-responsive.
    striker.vx = Math.cos(angle) * power * SHOT_MAX_SPEED;
    striker.vy = Math.sin(angle) * power * SHOT_MAX_SPEED;
    striker.trail = [];
    isTurnActiveRef.current = true;
    turnFramesRef.current = 0;
    setIsTurnActive(true);

    clearSettleTimeout();
    settleTimeoutRef.current = setTimeout(() => {
      if (isTurnActiveRef.current) {
        isTurnActiveRef.current = false;
        turnFramesRef.current = 0;
        setIsTurnActive(false);
        const s = pendingStateRef.current || driverRef.current?.lastState;
        pendingStateRef.current = null;
        if (s) applyServerState(s);
      }
    }, 4000);

    const executeShot = async () => {
      const driver = driverRef.current;
      if (!driver) return;
      const res = await driver.sendStrike(angle, power, striker.x);
      if (!res.ok) {
        // Shot rejected — cancel local animation and restore state.
        clearSettleTimeout();
        striker.vx = 0;
        striker.vy = 0;
        striker.trail = [];
        isTurnActiveRef.current = false;
        turnFramesRef.current = 0;
        setIsTurnActive(false);
        const s = driverRef.current?.lastState;
        if (s) applyServerState(s);
        toast.error(res.error ?? "Shot rejected", { id: "shot-rejected" });
      }
    };
    executeShot();
  };

  // ── Striker Mover (Exclusively for Horizontal Positioning) ──────────────────

  function updateStrikerPos(val: number) {
    if (isTurnActiveRef.current || !isMyTurnRef.current) return;
    const clampedVal = Math.max(STRIKER_SLIDER_MIN, Math.min(STRIKER_SLIDER_MAX, val));
    strikerPosRef.current = clampedVal;
    setStrikerPos(clampedVal);

    const striker = coinsRef.current.find((c) => c.type === "striker");
    if (!striker) return;
    striker.x = W / 2 + clampedVal;
    striker.y = STRIKER_Y;

    // Check overlap reactively
    setStrikerOverlap(checkStrikerOverlap());

    // Live 30 FPS network throttled broadcast (~33ms)
    const now = Date.now();
    if (now - lastPlaceSentRef.current >= 33 && driverRef.current?.canPlaceStriker()) {
      lastPlaceSentRef.current = now;
      driverRef.current.sendLiveStrikerPosition(striker.x);
    }
  }

  function handleMoverRelease() {
    if (isTurnActiveRef.current || !isMyTurnRef.current) return;
    const striker = coinsRef.current.find((c) => c.type === "striker");
    if (striker && driverRef.current?.canPlaceStriker()) {
      lastPlaceSentRef.current = Date.now();
      driverRef.current.sendLiveStrikerPosition(striker.x);
      driverRef.current.sendPlaceStriker(striker.x);
    }
  }

  function checkStrikerOverlap(): boolean {
    const striker = coinsRef.current.find((c) => c.type === "striker");
    if (!striker) return false;
    for (const c of coinsRef.current) {
      if (c.type === "striker" || !c.active || c.pocketing) continue;
      if (Math.hypot(c.x - striker.x, c.y - striker.y) < striker.radius + c.radius) return true;
    }
    return false;
  }

  function getTimerVisualClass(sec: number) {
    if (sec <= 0) return "text-rose-500 font-black border-rose-500/50 bg-rose-500/20";
    if (sec <= 5) return "text-rose-400 font-black border-rose-500/40 bg-rose-500/15 animate-pulse";
    if (sec <= 10) return "text-amber-400 font-extrabold border-amber-500/40 bg-amber-500/15";
    return "text-emerald-400 font-bold border-emerald-500/30 bg-emerald-500/10";
  }

  function formatTime(sec: number) {
    if (sec <= 0) return "TIME'S UP";
    const s = Math.max(0, Math.min(30, sec));
    return `00:${s.toString().padStart(2, "0")}`;
  }

  // ── Scores & Player Info ──────────────────────────────────────────────────

  const myColor = mySeat === 0 ? "white" : "black";
  const myScore = mySeat === 0 ? scores.seat0 : scores.seat1;
  const oppScore = mySeat === 0 ? scores.seat1 : scores.seat0;
  // Queen gives +3 bonus points; pocketed coins count is capped at 9
  const myPocketed = Math.min(9, myScore >= 3 && queenCovered ? Math.max(0, myScore - 3) : myScore);
  const oppPocketed = Math.min(9, oppScore);
  const myName = driverRef.current?.getPlayerName(mySeat) ?? "You";
  const oppName = driverRef.current?.getPlayerName(1 - mySeat) ?? "Opponent";
  const isWinner = winnerSeat === mySeat;
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  return (
    <GameWrapper
      title="Carrom"
      gameId="carrom"
      mode="multiplayer"
      stake={stake}
      onBack={onBack}
      isFullscreen
    >
      {/* ── Main Responsive Viewport Container ── */}
      <div className="w-full h-full flex flex-col lg:flex-row items-center justify-center gap-3 lg:gap-6 p-2 sm:p-4 overflow-hidden select-none max-w-[1600px] mx-auto">

        {/* ═══ GAME OVER MODAL ═══ */}
        {gameOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in p-4">
            <div className="relative bg-slate-900/90 border border-white/10 rounded-3xl p-8 shadow-2xl flex flex-col items-center max-w-sm w-full overflow-hidden">
              <div className={`absolute inset-0 rounded-3xl opacity-20 blur-2xl ${isWinner ? "bg-emerald-500" : "bg-rose-500"}`} />
              <div className="relative z-10 flex flex-col items-center gap-4 w-full">
                <div className="text-6xl animate-bounce">{isWinner ? "🏆" : "💔"}</div>
                <h2 className={`text-3xl font-black uppercase tracking-widest ${isWinner ? "text-emerald-400" : "text-rose-400"}`}>
                  {isWinner ? "YOU WIN!" : "GAME OVER"}
                </h2>
                {winnerSeat !== null && (
                  <p className="text-slate-300 text-xs font-bold uppercase tracking-wider">
                    {winnerSeat === mySeat ? myName : oppName} won the match
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3 w-full mt-2">
                  <div className="bg-slate-800/80 rounded-2xl p-3 text-center border border-slate-700">
                    <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-1">{myName}</div>
                    <div className="text-2xl font-black text-amber-400">{myPocketed}/9</div>
                    <div className="text-[10px] text-slate-500 font-bold uppercase">{myColor} coins</div>
                  </div>
                  <div className="bg-slate-800/80 rounded-2xl p-3 text-center border border-slate-700">
                    <div className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mb-1">{oppName}</div>
                    <div className="text-2xl font-black text-slate-300">{oppPocketed}/9</div>
                    <div className="text-[10px] text-slate-500 font-bold uppercase">{myColor === "white" ? "black" : "white"} coins</div>
                  </div>
                </div>
                <div className="flex gap-3 w-full mt-2">
                  <button
                    onClick={() => useMultiplayerStore.getState().requestRematch()}
                    className="flex-1 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black text-xs uppercase rounded-xl shadow-lg transition-all flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-4 h-4" /> Rematch
                  </button>
                  <button
                    onClick={onBack}
                    className="flex-1 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-1.5"
                  >
                    <X className="w-4 h-4" /> Exit
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ HOW TO PLAY OVERLAY ═══ */}
        {showRules && !gameOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in p-4">
            <div className="bg-slate-900/95 border border-indigo-500/30 rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col max-w-md w-full relative overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" /> Carrom Multiplayer
                </h2>
                <button
                  onClick={() => setShowRules(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <ul className="space-y-3 mb-6">
                {[
                  <>You play as <strong className="text-white">{myColor === "white" ? "⚪ White" : "⚫ Black"}</strong>. Pocket all 9 of your coins to win.</>,
                  <>Position striker along your baseline using the <strong>slider</strong> or direct touch.</>,
                  <>Drag <strong>backwards</strong> from striker to aim with laser trajectory line, release to shoot.</>,
                  <><strong>Queen (🔴):</strong> After pocketing Queen, you MUST pocket your coin on the next shot to cover it.</>,
                  <><strong>Foul:</strong> Pocketing striker costs turn & returns one scored piece.</>,
                ].map((rule, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="bg-indigo-500/20 text-indigo-400 text-xs font-black w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border border-indigo-500/30">
                      {i + 1}
                    </span>
                    <p className="text-slate-300 text-xs leading-relaxed">{rule}</p>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => setShowRules(false)}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-black text-xs uppercase rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-current" /> Start Game
              </button>
            </div>
          </div>
        )}

        {/* ═══ MOBILE TOP HUD (Visible on screens < lg) ═══ */}
        <div className="lg:hidden w-full max-w-[min(94vw,480px)] flex items-center justify-between gap-2 px-3 py-1.5 rounded-2xl bg-slate-900/90 border border-slate-800/80 backdrop-blur-md shadow-lg flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${myColor === "white" ? "bg-white text-slate-950 border border-slate-300" : "bg-slate-950 text-white border border-slate-700"}`}>
              {myColor === "white" ? "W" : "B"}
            </span>
            <span className="text-xs font-black text-amber-400">{myPocketed}/9</span>
            <span className="text-[10px] font-bold text-slate-500">vs</span>
            <span className="text-xs font-black text-slate-300">{oppPocketed}/9</span>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${myColor !== "white" ? "bg-white text-slate-950 border border-slate-300" : "bg-slate-950 text-white border border-slate-700"}`}>
              {myColor !== "white" ? "W" : "B"}
            </span>
          </div>

          <div className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 border ${
            isTurnActive
              ? "bg-slate-800 text-slate-400 border-slate-700"
              : isMyTurn
              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
              : "bg-slate-900 text-slate-400 border-slate-800"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isMyTurn ? "bg-emerald-400 animate-ping" : "bg-slate-500"}`} />
            <span>{isTurnActive ? "Moving…" : isMyTurn ? "Your Turn" : "Opponent"}</span>
            {!isTurnActive && !gameOver && (
              <span className={`ml-1 font-mono text-[10px] px-1.5 py-0.5 rounded border shadow-sm ${getTimerVisualClass(turnSecondsRemaining)}`}>
                {formatTime(turnSecondsRemaining)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border transition-all ${
              queenState === "COVERED" || queenCovered
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : queenState === "PENDING_COVER"
                ? (pendingQueenOwner === mySeat ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-md shadow-amber-950/40 animate-pulse font-black" : "bg-purple-500/20 text-purple-300 border-purple-500/40 animate-pulse font-bold")
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}>
              👑 {queenState === "COVERED" || queenCovered ? "Covered" : queenState === "PENDING_COVER" ? (pendingQueenOwner === mySeat ? "COVER IT!" : "Cover Attempt") : "Queen"}
            </span>
            <button
              onClick={() => setShowMobileSidebar(true)}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 text-[10px] font-bold"
              title="Match Details & Chat"
            >
              <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
            </button>
          </div>
        </div>

        {/* ═══ BOARD & SLIDER SECTION (Responsive flex column) ═══ */}
        <div className="flex-1 flex flex-col items-center justify-center min-w-0 max-h-full py-1">
          {/* Dynamic Responsive Canvas Wrapper */}
          <div
            className="relative shadow-[0_25px_70px_rgba(0,0,0,0.85)] rounded-[24px] sm:rounded-[32px] p-1 bg-slate-900/60 border border-slate-800 flex-shrink-0 w-[min(94vw,calc(100vh-230px),480px)] lg:w-[min(calc(100vh-170px),calc(100vw-420px),720px)] aspect-square"
          >
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`w-full h-full object-contain touch-none rounded-[20px] sm:rounded-[28px] ${
                dragState === "dragging"
                  ? "cursor-grabbing"
                  : isMyTurn && !isTurnActive
                  ? "cursor-grab"
                  : "cursor-not-allowed"
              }`}
            />

            {/* Waiting Turn Floating Pill */}
            {!isMyTurn && !gameOver && (
              <div className="absolute bottom-4 inset-x-0 flex justify-center pointer-events-none">
                <div className="bg-slate-950/80 backdrop-blur-md text-slate-200 text-[11px] sm:text-xs font-extrabold px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-slate-800 shadow-xl flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span>Waiting for {oppName}&apos;s move…</span>
                </div>
              </div>
            )}
          </div>

          {/* ═══ STRIKER MOVER (Dedicated Left/Right Positioning Control) ═══ */}
          {isMyTurn && !isTurnActive && !gameOver && (
            <div className="w-[min(94vw,calc(100vh-230px),480px)] lg:w-[min(calc(100vh-170px),calc(100vw-420px),720px)] flex flex-col items-center gap-1.5 mt-2 flex-shrink-0">
              {/* Header Label */}
              <div className="flex items-center justify-between w-full px-2">
                <span className="text-[10px] sm:text-[11px] text-cyan-400 font-extrabold uppercase tracking-widest flex items-center gap-1">
                  ◀ STRIKER MOVER ▶
                </span>
                <span className="text-[10px] text-slate-400 font-bold tracking-wider">
                  Drag to slide striker left/right
                </span>
              </div>

              {/* Slider Track & Mover Handle */}
              <div className="relative w-full flex items-center px-3 sm:px-4" style={{ height: "42px" }}>
                {/* Track Background */}
                <div
                  className="absolute inset-x-3 sm:inset-x-4 rounded-full border border-cyan-500/30 shadow-lg shadow-cyan-950/40"
                  style={{
                    height: "28px",
                    background: "linear-gradient(180deg,#0f172a 0%,#020617 100%)",
                  }}
                >
                  <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-full h-1 bg-gradient-to-r from-cyan-500/40 via-cyan-400/80 to-cyan-500/40" />
                </div>

                {/* Range Input for Mover */}
                <input
                  type="range"
                  min={STRIKER_SLIDER_MIN}
                  max={STRIKER_SLIDER_MAX}
                  value={strikerPos}
                  onChange={(e) => updateStrikerPos(Number(e.target.value))}
                  onPointerUp={handleMoverRelease}
                  className="relative w-full h-full opacity-0 cursor-ew-resize z-10"
                  style={{ WebkitAppearance: "none" }}
                  title="Drag to position the striker horizontally"
                />

                {/* Metallic Glowing Mover Thumb */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 pointer-events-none z-20 flex items-center justify-center rounded-full shadow-2xl transition-transform"
                  style={{
                    width: "36px",
                    height: "36px",
                    left: `calc(${((strikerPos - STRIKER_SLIDER_MIN) / (STRIKER_SLIDER_MAX - STRIKER_SLIDER_MIN)) * 100}% - ${((strikerPos - STRIKER_SLIDER_MIN) / (STRIKER_SLIDER_MAX - STRIKER_SLIDER_MIN)) * 36}px + 0px)`,
                    background: "radial-gradient(circle at 35% 35%,#38bdf8,#0284c7)",
                    border: "2.5px solid #ffffff",
                    boxShadow: "0 0 18px rgba(56,189,248,0.7), 0 4px 10px rgba(0,0,0,0.6)",
                  }}
                >
                  <span className="text-[11px] text-white font-black">↔</span>
                </div>
              </div>

              {/* Instructions & Overlap Feedback */}
              <div className="flex items-center justify-between w-full px-2 text-[10px] sm:text-[11px]">
                <span className="text-amber-400 font-bold tracking-wide flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" /> 1. Drag mover to position
                </span>
                <span className="text-cyan-300 font-bold tracking-wide">
                  2. Pull striker backwards to aim & shoot
                </span>
              </div>

              {strikerOverlap && (
                <div className="flex items-center gap-1.5 text-xs text-rose-400 font-bold uppercase tracking-widest animate-pulse mt-0.5">
                  <AlertTriangle className="w-4 h-4" /> Overlaps a coin — slide mover to a clear spot
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══ DESKTOP SIDEBAR PANEL (Unified Glassmorphism Card) ═══ */}
        <div className="hidden lg:flex flex-col gap-3 w-[320px] xl:w-[360px] h-full max-h-[min(calc(100vh-110px),760px)] flex-shrink-0 overflow-y-auto custom-scrollbar pr-1">

          {/* Turn Banner & 30s Authoritative Timer */}
          <div className={`flex items-center justify-between px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all border ${
            isMyTurn
              ? "bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-emerald-950/50"
              : "bg-slate-900/90 text-slate-400 border-slate-800 shadow-slate-950/50"
          }`}>
            <div className="flex items-center gap-2">
              {isTurnActive ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>Shot In Motion…</span>
                </>
              ) : isMyTurn ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>YOUR TURN</span>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-500 animate-pulse" />
                  <span>OPPONENT&apos;S TURN</span>
                </>
              )}
            </div>

            {!isTurnActive && !gameOver && (
              <div className={`px-2.5 py-1 rounded-xl text-[11px] font-mono tracking-wider flex items-center gap-1.5 border shadow-sm ${getTimerVisualClass(turnSecondsRemaining)}`}>
                <Clock className="w-3.5 h-3.5" />
                <span>{formatTime(turnSecondsRemaining)}</span>
              </div>
            )}
          </div>

          {/* Score & Match Progress Card */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-3.5 shadow-xl backdrop-blur-xl space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Match Scoreboard</span>
              <span className="text-[10px] font-bold text-amber-400">First to 9</span>
            </div>

            {/* My Score Row */}
            <div className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${isMyTurn ? "border-emerald-500/30 bg-emerald-500/5" : "border-slate-800 bg-slate-950/40"}`}>
              <div className={`w-6 h-6 rounded-full shadow-md flex items-center justify-center flex-shrink-0 font-black text-[10px] ${myColor === "white" ? "bg-white text-slate-950 border border-slate-300" : "bg-slate-950 text-white border border-slate-700"}`}>
                {myColor === "white" ? "W" : "B"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-200 font-extrabold truncate flex items-center gap-1.5">
                  {myName} <span className="text-[9px] text-emerald-400 font-black uppercase">(YOU)</span>
                </div>
                <div className="text-lg font-black text-amber-400 leading-none mt-0.5">
                  {myPocketed} <span className="text-slate-500 text-xs font-bold">/ 9</span>
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className={`w-2 h-2 rounded-full ${i < myPocketed ? (myColor === "white" ? "bg-amber-400" : "bg-sky-400") : "bg-slate-800"}`} />
                ))}
              </div>
            </div>

            {/* Opponent Score Row */}
            <div className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${!isMyTurn ? "border-indigo-500/30 bg-indigo-500/5" : "border-slate-800 bg-slate-950/40"}`}>
              <div className={`w-6 h-6 rounded-full shadow-md flex items-center justify-center flex-shrink-0 font-black text-[10px] ${myColor !== "white" ? "bg-white text-slate-950 border border-slate-300" : "bg-slate-950 text-white border border-slate-700"}`}>
                {myColor !== "white" ? "W" : "B"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-200 font-extrabold truncate">
                  {oppName}
                </div>
                <div className="text-lg font-black text-slate-300 leading-none mt-0.5">
                  {oppPocketed} <span className="text-slate-500 text-xs font-bold">/ 9</span>
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className={`w-2 h-2 rounded-full ${i < oppPocketed ? (myColor !== "white" ? "bg-amber-400" : "bg-sky-400") : "bg-slate-800"}`} />
                ))}
              </div>
            </div>

            {/* Queen Status Pill */}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-rose-500" />
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Queen</span>
              </div>
              <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border transition-all ${
                queenState === "COVERED" || queenCovered
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : queenState === "PENDING_COVER"
                  ? (pendingQueenOwner === mySeat ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-md shadow-amber-950/40 animate-pulse font-black" : "bg-purple-500/20 text-purple-300 border-purple-500/40 animate-pulse font-bold")
                  : "bg-slate-800 text-slate-400 border-slate-700"
              }`}>
                {queenState === "COVERED" || queenCovered ? "Covered ✓" : queenState === "PENDING_COVER" ? (pendingQueenOwner === mySeat ? "COVER IT!" : "Opponent Covering") : "On Board"}
              </span>
            </div>
          </div>

          {/* Multiplayer Match Panel (Player profiles & Controls & Chat) */}
          <MultiplayerMatchPanel compact />
        </div>

        {/* ═══ MOBILE SLIDE-UP SIDEBAR MODAL ═══ */}
        {showMobileSidebar && (
          <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/75 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border-t border-slate-700 rounded-t-3xl p-4 max-h-[85vh] overflow-y-auto space-y-4 shadow-2xl custom-scrollbar">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" /> Match Details & Chat
                </h3>
                <button
                  onClick={() => setShowMobileSidebar(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-white bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mobile Scoreboard */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                  <span>First to 9 Points</span>
                  <span className="text-emerald-400">{queenCovered ? "Queen Covered" : queenPocketed ? "Queen Needs Cover" : "Queen Active"}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">{myName} (YOU)</div>
                    <div className="text-xl font-black text-amber-400">{myPocketed}/9</div>
                  </div>
                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 text-center">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">{oppName}</div>
                    <div className="text-xl font-black text-slate-300">{oppPocketed}/9</div>
                  </div>
                </div>
              </div>

              {/* Match Panel & Chat */}
              <MultiplayerMatchPanel compact />
            </div>
          </div>
        )}

      </div>
    </GameWrapper>
  );
};

export default CarromMultiplayer;
