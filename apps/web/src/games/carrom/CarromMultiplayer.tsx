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
} from "./CarromMultiplayerDriver";
import type { CarromRemoteState } from "./CarromMultiplayerDriver";
import { Crown, Sparkles, CheckCircle2, AlertTriangle, Play, RefreshCw, X } from "lucide-react";

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
  angle: number;
  trail: Array<{ x: number; y: number }>;
  pocketing?: { px: number; py: number; scale: number; alpha: number };
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
  { x: 38, y: 38 },
  { x: W - 38, y: 38 },
  { x: 38, y: H - 38 },
  { x: W - 38, y: H - 38 },
];
// Pocket capture radius in client coords (server uses 12px, scaled: 12×5/6≈10)
const POCKET_CAP = 10;
// Pocket visual radius (server POCKET_RADIUS=30 × 5/6=25, use 24 for clean look)
const POCKET_DRAW_R = 24;
// Pocket capture thresholds (client-space)
const CAP_MOVING = POCKET_CAP;
const CAP_STILL = POCKET_CAP * 0.55;
// Matches server pocket cutout zone: (POCKET_RADIUS 30 + 12 = 42) × 5/6 = 35
const POCKET_ZONE = 35;

const STRIKER_Y = H - 78;
const STRIKER_SLIDER_MIN = -120;
const STRIKER_SLIDER_MAX = 120;

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

  return coins;
}

// ─── High-End Drawing Helpers ────────────────────────────────────────────────

function drawBoard(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const frameR = 28;
  const sm = 22; // frame thickness
  const dark = "#201004";
  const surfaceColor = "#f5e4b0";

  // 1. Outer mahogany frame
  ctx.fillStyle = "#3d1c08";
  ctx.beginPath();
  ctx.moveTo(frameR, 0);
  ctx.lineTo(w - frameR, 0);
  ctx.quadraticCurveTo(w, 0, w, frameR);
  ctx.lineTo(w, h - frameR);
  ctx.quadraticCurveTo(w, h, w - frameR, h);
  ctx.lineTo(frameR, h);
  ctx.quadraticCurveTo(0, h, 0, h - frameR);
  ctx.lineTo(0, frameR);
  ctx.quadraticCurveTo(0, 0, frameR, 0);
  ctx.closePath();
  ctx.fill();

  // Subtle inner highlight on frame edge
  ctx.strokeStyle = "rgba(255,190,100,0.10)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 2. Playing surface (maple/cream)
  const surfGrad = ctx.createRadialGradient(w / 2, h / 2, 60, w / 2, h / 2, w / 2);
  surfGrad.addColorStop(0, "#f7e8bd");
  surfGrad.addColorStop(0.6, "#edd49d");
  surfGrad.addColorStop(1, "#e0c07a");
  ctx.fillStyle = surfGrad;
  ctx.fillRect(sm, sm, w - sm * 2, h - sm * 2);

  // Wood grain lines (subtle)
  ctx.save();
  ctx.beginPath();
  ctx.rect(sm, sm, w - sm * 2, h - sm * 2);
  ctx.clip();
  ctx.strokeStyle = "rgba(150,95,25,0.035)";
  ctx.lineWidth = 1;
  for (let gy = sm + 5; gy < h - sm; gy += 7) {
    ctx.beginPath();
    ctx.moveTo(sm, gy);
    ctx.lineTo(w - sm, gy);
    ctx.stroke();
  }
  ctx.restore();

  // Inner surface border
  ctx.strokeStyle = dark;
  ctx.lineWidth = 2;
  ctx.strokeRect(sm + 1, sm + 1, w - sm * 2 - 2, h - sm * 2 - 2);

  // 3. Pockets — clean black holes with subtle depth gradient
  POCKETS.forEach((p) => {
    // Outer shadow ring
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, POCKET_DRAW_R + 3, 0, Math.PI * 2);
    ctx.fill();

    // Deep hole
    const pg = ctx.createRadialGradient(p.x - 3, p.y - 3, 2, p.x, p.y, POCKET_DRAW_R);
    pg.addColorStop(0, "#2a1405");
    pg.addColorStop(0.5, "#0d0501");
    pg.addColorStop(1, "#000000");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(p.x, p.y, POCKET_DRAW_R, 0, Math.PI * 2);
    ctx.fill();

    // Metallic silver/dark rim highlight
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(p.x, p.y, POCKET_DRAW_R, 0, Math.PI * 2);
    ctx.stroke();
  });

  // 4. Baselines — double-line capsule tracks with red end circles matching reference UI
  const capsuleHalf = 8;
  const capStart = 107.5;
  const capEnd = 392.5;
  const capY1 = 77.5;  // top baseline
  const capY2 = 422.5; // bottom baseline
  const capRedR = 9;

  function drawCapsuleTrack(ax: number, ay: number, bx: number, by: number, isVert: boolean) {
    ctx.fillStyle = surfaceColor;
    ctx.strokeStyle = dark;

    // Fill track interior
    ctx.beginPath();
    if (!isVert) {
      ctx.rect(ax, ay - capsuleHalf, bx - ax, capsuleHalf * 2);
    } else {
      ctx.rect(ax - capsuleHalf, ay, capsuleHalf * 2, by - ay);
    }
    ctx.fill();

    // Top / Left border line
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    if (!isVert) {
      ctx.moveTo(ax, ay - capsuleHalf);
      ctx.lineTo(bx, ay - capsuleHalf);
    } else {
      ctx.moveTo(ax - capsuleHalf, ay);
      ctx.lineTo(ax - capsuleHalf, by);
    }
    ctx.stroke();

    // Bottom / Right border line
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    if (!isVert) {
      ctx.moveTo(ax, ay + capsuleHalf);
      ctx.lineTo(bx, ay + capsuleHalf);
    } else {
      ctx.moveTo(ax + capsuleHalf, ay);
      ctx.lineTo(ax + capsuleHalf, by);
    }
    ctx.stroke();

    // End arcs
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    if (!isVert) {
      ctx.arc(ax, ay, capsuleHalf, -Math.PI / 2, Math.PI / 2, true);
      ctx.arc(bx, ay, capsuleHalf, Math.PI / 2, -Math.PI / 2, true);
    } else {
      ctx.arc(ax, ay, capsuleHalf, -Math.PI, 0, true);
      ctx.arc(ax, by, capsuleHalf, 0, Math.PI, true);
    }
    ctx.stroke();

    // Red Circles at the ends of baseline track
    [[ax, ay], [bx, by]].forEach(([rcx, rcy]) => {
      const rg = ctx.createRadialGradient(rcx - 2, rcy - 2, 1, rcx, rcy, capRedR);
      rg.addColorStop(0, "#ef4444");
      rg.addColorStop(0.5, "#dc2626");
      rg.addColorStop(1, "#991b1b");
      ctx.fillStyle = rg;
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(rcx, rcy, capRedR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  drawCapsuleTrack(capStart, capY1, capEnd, capY1, false); // top horizontal
  drawCapsuleTrack(capStart, capY2, capEnd, capY2, false); // bottom horizontal
  drawCapsuleTrack(capY1, capStart, capY1, capEnd, true);  // left vertical
  drawCapsuleTrack(capY2, capStart, capY2, capEnd, true);  // right vertical

  // 5. Center mandala pattern
  const cx = w / 2;
  const cy = h / 2;

  // Outer red circle
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(cx, cy, 62, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#c41a1a";
  ctx.beginPath();
  ctx.arc(cx, cy, 61, 0, Math.PI * 2);
  ctx.fill();

  // Middle cream ring
  ctx.fillStyle = surfaceColor;
  ctx.beginPath();
  ctx.arc(cx, cy, 48, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, 48, 0, Math.PI * 2);
  ctx.stroke();

  // Black ring
  ctx.fillStyle = "#1a0808";
  ctx.beginPath();
  ctx.arc(cx, cy, 36, 0, Math.PI * 2);
  ctx.fill();

  // Inner cream ring
  ctx.fillStyle = surfaceColor;
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, Math.PI * 2);
  ctx.stroke();

  // Red center circle
  const centerGrad = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, 9);
  centerGrad.addColorStop(0, "#f87171");
  centerGrad.addColorStop(1, "#991b1b");
  ctx.fillStyle = centerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Center pin dot
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawCoin(
  ctx: CanvasRenderingContext2D,
  c: LocalCoin,
  isCurrentShooterWhite: boolean,
  strikerPhase: "placing" | "aiming",
  isMyTurn: boolean,
  isTurnActive: boolean
): void {
  const { x, y, radius: r, type } = c;

  if (c.pocketing) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, c.pocketing.alpha);
    ctx.translate(c.x, c.y);
    ctx.scale(c.pocketing.scale, c.pocketing.scale);
    _drawCoinBody(ctx, 0, 0, r, type, isCurrentShooterWhite, strikerPhase, isMyTurn, isTurnActive, c);
    ctx.restore();
    return;
  }

  // Realistic Drop Shadow
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.arc(x + 2.5, y + 3.5, r, 0, Math.PI * 2);
  ctx.fill();

  _drawCoinBody(ctx, x, y, r, type, isCurrentShooterWhite, strikerPhase, isMyTurn, isTurnActive, c);
}

function _drawCoinBody(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  type: string,
  isCurrentShooterWhite: boolean,
  strikerPhase: "placing" | "aiming",
  isMyTurn: boolean,
  isTurnActive: boolean,
  c: LocalCoin
): void {
  if (type === "striker") {
    // Striker - High-Tech Glossy Metallic Disc
    const grad = ctx.createRadialGradient(
      x - r * 0.35, y - r * 0.35, r * 0.05,
      x, y, r
    );
    if (isCurrentShooterWhite) {
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.5, "#e2e8f0");
      grad.addColorStop(1, "#94a3b8");
    } else {
      grad.addColorStop(0, "#64748b");
      grad.addColorStop(0.6, "#334155");
      grad.addColorStop(1, "#0f172a");
    }
    ctx.fillStyle = grad;
    ctx.strokeStyle = isCurrentShooterWhite ? "rgba(15,23,42,0.9)" : "rgba(248,250,252,0.8)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Inner Striker Ring & Crosshair Mark
    ctx.strokeStyle = isCurrentShooterWhite ? "rgba(30,41,59,0.4)" : "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
    ctx.stroke();

    // Center Gem Accent
    ctx.fillStyle = isCurrentShooterWhite ? "#0284c7" : "#38bdf8";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
    ctx.fill();

  } else if (type === "queen") {
    // Queen - Ruby Red 3D Sphere with Gold Concentric Ring
    const qg = ctx.createRadialGradient(
      x - r * 0.35, y - r * 0.35, r * 0.05,
      x, y, r
    );
    qg.addColorStop(0, "#f87171");
    qg.addColorStop(0.4, "#dc2626");
    qg.addColorStop(1, "#7f1d1d");
    ctx.fillStyle = qg;
    ctx.strokeStyle = "#450a0a";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Gold Concentric Ring
    ctx.strokeStyle = "#fef08a";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.58, 0, Math.PI * 2);
    ctx.stroke();

    // Crown Center Dot
    ctx.fillStyle = "#fff1f2";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
    ctx.fill();

  } else {
    // White vs Black Carrom Coins (3D Bevel & Concentric Grooves)
    const isW = type === "white";
    const outerC = isW ? "#fef08a" : "#2d1a0e";
    const innerC = isW ? "#fffbeb" : "#1a0b04";
    const ringC = isW ? "#a16207" : "#78350f";
    const hlC = isW ? "rgba(255,255,255,0.7)" : "rgba(245,158,11,0.25)";

    // Outer disc
    ctx.fillStyle = outerC;
    ctx.strokeStyle = "#1c0d02";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Concentric Groove Ring
    ctx.strokeStyle = ringC;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.64, 0, Math.PI * 2);
    ctx.stroke();

    // Inner disc
    ctx.fillStyle = innerC;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.52, 0, Math.PI * 2);
    ctx.fill();

    // Center dot
    ctx.fillStyle = ringC;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.18, 0, Math.PI * 2);
    ctx.fill();

    // Gloss Specular Highlight
    ctx.fillStyle = hlC;
    ctx.beginPath();
    ctx.arc(x - r * 0.32, y - r * 0.32, r * 0.26, 0, Math.PI * 2);
    ctx.fill();
  }
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
  const turnFramesRef = useRef(0);
  const pendingStateRef = useRef<CarromRemoteState | null>(null);
  const hasInitRef = useRef(false);
  const lastPlaceSentRef = useRef(0);

  // UI state
  const [dragState, setDragState] = useState<"idle" | "dragging" | "placing_striker">("idle");
  const dragStartRef = useRef({ x: 0, y: 0 });
  const currentAimRef = useRef({ x: 0, y: 0 });
  const [dragAim, setDragAim] = useState({ sx: 0, sy: 0, ex: 0, ey: 0, power: 0 });

  const [strikerPos, setStrikerPos] = useState(0);
  const strikerPosRef = useRef(0);

  const [gamePhase, setGamePhase] = useState<"placing" | "aiming">("placing");
  const gamePhasRef = useRef<"placing" | "aiming">("placing");

  const [isMyTurn, setIsMyTurn] = useState(false);
  const isMyTurnRef = useRef(false);

  const [isTurnActive, setIsTurnActive] = useState(false);

  const [scores, setScores] = useState<{ seat0: number; seat1: number }>({ seat0: 0, seat1: 0 });
  const [queenCovered, setQueenCovered] = useState(false);
  const [queenPocketed, setQueenPocketed] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [winnerSeat, setWinnerSeat] = useState<number | null>(null);
  const [showRules, setShowRules] = useState(true);
  const [strikerOverlap, setStrikerOverlap] = useState(false);

  const room = useMultiplayerStore((s) => s.room);

  // ── Driver setup ──────────────────────────────────────────────────────────

  useEffect(() => {
    const driver = new CarromMultiplayerDriver(mySeat, playerNames);
    driverRef.current = driver;

    driver.onStateUpdate = (state) => {
      const { isNew, angle, power, strikerPos: serverStriker, bySeat } =
        driver.consumeNewStrike();

      if (isNew) {
        const seat = mySeatRef.current;
        if (isTurnActiveRef.current || bySeat === seat) {
          pendingStateRef.current = state;
          if (!isTurnActiveRef.current) {
            applyServerState(state);
            pendingStateRef.current = null;
          }
          return;
        }

        const striker = coinsRef.current.find((c) => c.type === "striker");
        if (striker && serverStriker) {
          const sp = mapToClient(serverStriker.x, serverStriker.y, seat);
          striker.x = sp.x;
          striker.y = sp.y;
          striker.active = true;
          striker.vx = 0;
          striker.vy = 0;
          striker.trail = [];
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
        return;
      }

      if (isTurnActiveRef.current) {
        // Physics is still running — queue the state for when it settles.
        pendingStateRef.current = state;
        return;
      }

      applyServerState(state);
    };

    driver.onCoinPocketed = (_id, _type, _pocket) => {
      confetti({ particleCount: 35, spread: 50, origin: { x: 0.5, y: 0.5 } });
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

      // Queen status (relative to this player)
      const myPlayer = state.players.find((p) => p.seat === seat);
      setQueenCovered(!!myPlayer?.queenCovered);
      setQueenPocketed(!!myPlayer?.queenPocketed);

      const prevPhase = gamePhasRef.current;
      const prevTurn = isMyTurnRef.current;
      const myTurn = state.currentSeat === seat;
      const phase: "placing" | "aiming" = state.strikerPlacementPhase ? "placing" : "aiming";
      isMyTurnRef.current = myTurn;
      gamePhasRef.current = phase;
      setIsMyTurn(myTurn);
      setGamePhase(phase);

      // Only initialize slider position when entering placing phase or turn changed
      if (phase === "placing" && (prevPhase !== "placing" || prevTurn !== myTurn)) {
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
        if (lc.active && !lc.pocketing) {
          let nearestP = POCKETS[0];
          let minDist = Math.hypot(lc.x - POCKETS[0].x, lc.y - POCKETS[0].y);
          for (const p of POCKETS) {
            const d = Math.hypot(lc.x - p.x, lc.y - p.y);
            if (d < minDist) { minDist = d; nearestP = p; }
          }
          lc.pocketing = { px: nearestP.x, py: nearestP.y, scale: 1, alpha: 1 };
          lc.vx = 0; lc.vy = 0;
        } else if (!lc.pocketing) {
          lc.active = false;
          lc.vx = 0; lc.vy = 0;
        }
      } else {
        // Coin is active on server — restore it (handles foul coin-returned case).
        lc.active = true;
        lc.pocketing = undefined;
        const cp = mapToClient(sc.x, sc.y, seat);
        const dist = Math.hypot(lc.x - cp.x, lc.y - cp.y);
        if (dist > 5) {
          lc.x = cp.x;
          lc.y = cp.y;
        } else if (dist > 0.1) {
          lc.x += (cp.x - lc.x) * 0.4;
          lc.y += (cp.y - lc.y) * 0.4;
        }
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
        striker.y = isMyTurnNow ? STRIKER_Y : 78;
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

    if (isTurnActiveRef.current) {
      turnFramesRef.current++;
      const stepFactor = 1 / SUB_STEPS;
      // Server uses innerMin=33 scaled to client: 33×(5/6)=27.5 ≈ BORDER=25
      const innerMin = BORDER;
      const innerMax = W - BORDER;
      const frictionStep = Math.pow(FRICTION_PER_FRAME, stepFactor);

      for (let step = 0; step < SUB_STEPS; step++) {
        for (const c of coins) {
          if (!c.active || c.pocketing) continue;
          c.x += c.vx * stepFactor;
          c.y += c.vy * stepFactor;

          const spd = Math.hypot(c.vx, c.vy);
          if (spd > 1.5) {
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
            if (Math.hypot(c.x - p.x, c.y - p.y) < POCKET_ZONE) {
              inPocketZone = true;
              break;
            }
          }

          if (!inPocketZone) {
            if (c.x - r < innerMin) { c.x = innerMin + r; c.vx = Math.abs(c.vx) * wallR; }
            else if (c.x + r > innerMax) { c.x = innerMax - r; c.vx = -Math.abs(c.vx) * wallR; }
            if (c.y - r < innerMin) { c.y = innerMin + r; c.vy = Math.abs(c.vy) * wallR; }
            else if (c.y + r > innerMax) { c.y = innerMax - r; c.vy = -Math.abs(c.vy) * wallR; }
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
              const dvn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;

              if (dvn > 0) {
                // Match server: striker collisions use 0.90, coin-coin use 0.82
                const restit = a.type === "striker" || b.type === "striker" ? 0.90 : 0.82;
                const imp = -(2 * a.mass * b.mass * dvn) / (a.mass + b.mass) * restit;
                a.vx += (imp * nx) / a.mass;
                a.vy += (imp * ny) / a.mass;
                b.vx -= (imp * nx) / b.mass;
                b.vy -= (imp * ny) / b.mass;
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

      for (const c of coins) {
        if (!c.active || c.pocketing) continue;
        for (const p of POCKETS) {
          const dx = p.x - c.x;
          const dy = p.y - c.y;
          const dist = Math.hypot(dx, dy);
          if (dist <= 25) {
            let isPocketed = false;
            if (dist <= 15) {
              isPocketed = true;
            } else {
              const dotProduct = c.vx * dx + c.vy * dy;
              if (dotProduct > 0 || Math.hypot(c.vx, c.vy) > 0.04) {
                isPocketed = true;
              }
            }

            if (isPocketed) {
              c.pocketing = { px: p.x, py: p.y, scale: 1, alpha: 1 };
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

    for (const c of coins) {
      if (!c.pocketing) continue;
      c.pocketing.scale = Math.max(0, c.pocketing.scale - 0.065);
      c.pocketing.alpha = Math.max(0, c.pocketing.alpha - 0.065);
      c.x += (c.pocketing.px - c.x) * 0.32;
      c.y += (c.pocketing.py - c.y) * 0.32;
      if (c.pocketing.scale <= 0.04) {
        c.active = false;
        c.pocketing = undefined;
      } else {
        // Pocketing animation still running — keep turn active so settle
        // doesn't fire while striker/coin is still shrinking into the pocket.
        anyMoving = true;
      }
    }

    if (
      isTurnActiveRef.current &&
      !anyMoving &&
      turnFramesRef.current >= 10  // at least 10 frames with no movement
    ) {
      // Only settle if we have a confirmed server state waiting.
      // If pendingStateRef is null, the server hasn't confirmed yet — wait.
      const state = pendingStateRef.current;
      if (state !== null) {
        clearSettleTimeout();
        isTurnActiveRef.current = false;
        setIsTurnActive(false);
        turnFramesRef.current = 0;
        pendingStateRef.current = null;
        applyServerState(state);
      }
    }

    // Render Canvas
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

    // Motion Trails
    for (const c of coins) {
      if (!c.active || c.trail.length < 2) continue;
      const tc =
        c.type === "striker" ? "56,189,248" :
        c.type === "queen" ? "244,63,94" :
        c.type === "white" ? "250,204,21" : "148,163,184";
      for (let ti = 0; ti < c.trail.length; ti++) {
        const tp = c.trail[ti];
        const a = ((ti + 1) / c.trail.length) * 0.22;
        const tr = c.radius * (0.4 + 0.35 * (ti / c.trail.length));
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, tr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${tc},${a.toFixed(2)})`;
        ctx.fill();
      }
    }

    // Striker placement positioning
    const striker = coins.find((c) => c.type === "striker");
    if (striker && !isTurnActiveRef.current && !gameOver) {
      if (isMyTurnRef.current) {
        if (gamePhasRef.current === "placing") {
          striker.x = W / 2 + strikerPosRef.current;
        }
        striker.y = STRIKER_Y;
      } else {
        const oppStrikerX = driverRef.current?.lastState?.striker?.x;
        if (oppStrikerX !== undefined) {
          striker.x = mapToClient(oppStrikerX, 0, mySeatRef.current).x;
        }
        striker.y = 78;
      }
    }

    const latestState = driverRef.current?.lastState;
    const shooterSeat = latestState?.currentSeat ?? mySeatRef.current;
    const shooterIsWhite = shooterSeat === 0;

    let isOverlap = false;
    if (
      striker &&
      gamePhasRef.current === "placing" &&
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
      drawCoin(ctx, c, shooterIsWhite, gamePhasRef.current, isMyTurnRef.current, isTurnActiveRef.current);
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

    rafRef.current = requestAnimationFrame(animate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState, dragAim, gameOver]);

  useLayoutEffect(() => {
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  // ── Pointer Handlers ──────────────────────────────────────────────────────

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

    const { x, y } = getCanvasCoords(e);
    const phase = gamePhasRef.current;

    if (phase === "placing") {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      setDragState("placing_striker");
      const newPos = Math.max(STRIKER_SLIDER_MIN, Math.min(STRIKER_SLIDER_MAX, x - W / 2));
      updateStrikerPos(newPos);
      return;
    }

    const striker = coinsRef.current.find((c) => c.type === "striker");
    if (!striker) return;

    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    setDragState("dragging");
    dragStartRef.current = { x, y };
    currentAimRef.current = { x, y };
    setDragAim({ sx: x, sy: y, ex: x, ey: y, power: 0 });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);

    if (dragState === "placing_striker") {
      const newPos = Math.max(STRIKER_SLIDER_MIN, Math.min(STRIKER_SLIDER_MAX, x - W / 2));
      updateStrikerPos(newPos);
      return;
    }

    if (dragState !== "dragging") return;
    currentAimRef.current = { x, y };
    const { x: sx, y: sy } = dragStartRef.current;
    const pullDist = Math.hypot(sx - x, sy - y);
    const power = Math.min(pullDist / 160, 1);
    setDragAim({ sx, sy, ex: x, ey: y, power });
  };

  const handlePointerUp = () => {
    if (dragState === "placing_striker") {
      setDragState("idle");
      const striker = coinsRef.current.find((c) => c.type === "striker");
      if (striker && driverRef.current?.canPlaceStriker()) {
        driverRef.current.sendPlaceStriker(striker.x);
      }
      return;
    }

    if (dragState !== "dragging") { setDragState("idle"); return; }
    setDragState("idle");

    const { x: sx, y: sy } = dragStartRef.current;
    const { x: ex, y: ey } = currentAimRef.current;
    const dx = sx - ex;
    const dy = sy - ey;
    const pullDist = Math.hypot(dx, dy);

    if (pullDist < 12) return;

    const power = Math.min(pullDist / 160, 1);
    const angle = Math.atan2(dy, dx);

    const striker = coinsRef.current.find((c) => c.type === "striker");
    if (!striker || !driverRef.current?.canStrike()) return;

    // Immediately start local physics so the shot feels responsive.
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
      if (driver.canPlaceStriker()) {
        await driver.sendPlaceStriker(striker.x);
      }
      const res = await driver.sendStrike(angle, power);
      if (!res.ok) {
        // Shot rejected — cancel local animation and restore state.
        clearSettleTimeout();
        striker.vx = 0; striker.vy = 0; striker.trail = [];
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

  function updateStrikerPos(val: number) {
    strikerPosRef.current = val;
    setStrikerPos(val);
    const striker = coinsRef.current.find((c) => c.type === "striker");
    if (!striker) return;
    striker.x = W / 2 + val;
    striker.y = STRIKER_Y;

    const now = Date.now();
    if (now - lastPlaceSentRef.current >= 200 && driverRef.current?.canPlaceStriker()) {
      lastPlaceSentRef.current = now;
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

  function handleConfirmPlacement() {
    if (!driverRef.current?.canPlaceStriker()) return;
    if (checkStrikerOverlap()) {
      toast.error("Striker overlaps a coin — move it first", { id: "overlap" });
      return;
    }
    const striker = coinsRef.current.find((c) => c.type === "striker");
    if (striker) {
      lastPlaceSentRef.current = Date.now();
      driverRef.current.sendPlaceStriker(striker.x);
    }
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

  return (
    <GameWrapper
      title="Carrom"
      gameId="carrom"
      mode="multiplayer"
      stake={stake}
      onBack={onBack}
      isFullscreen
    >
      {/* ── Main Container (No vertical overflow clipping!) ── */}
      <div className="w-full h-full flex flex-col xl:flex-row items-center justify-center gap-6 p-2 md:p-4 overflow-y-auto max-w-7xl mx-auto custom-scrollbar">

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

        {/* ═══ BOARD & SLIDER SECTION ═══ */}
        <div className="flex flex-col items-center gap-3 flex-shrink-0">
          {/* Canvas Wrapper */}
          <div className="relative shadow-[0_25px_70px_rgba(0,0,0,0.85)] rounded-[32px] p-1 bg-slate-900/60 border border-slate-800" style={{ width: `${W}px`, maxWidth: "92vw", aspectRatio: "1" }}>
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className={`w-full h-full object-contain touch-none rounded-[28px] ${
                dragState === "dragging"
                  ? "cursor-grabbing"
                  : isMyTurn && !isTurnActive
                  ? "cursor-grab"
                  : "cursor-not-allowed"
              }`}
            />

            {/* Waiting Turn Floating Pill */}
            {!isMyTurn && !gameOver && (
              <div className="absolute bottom-5 inset-x-0 flex justify-center pointer-events-none">
                <div className="bg-slate-950/80 backdrop-blur-md text-slate-200 text-xs font-extrabold px-4 py-2 rounded-full border border-slate-800 shadow-xl flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                  <span>Waiting for {oppName}&apos;s move…</span>
                </div>
              </div>
            )}
          </div>

          {/* Striker Slider Controls */}
          {isMyTurn && gamePhase === "placing" && !isTurnActive && !gameOver && (
            <div className="w-full flex flex-col items-center gap-2" style={{ maxWidth: `${W}px` }}>
              <div className="relative w-full flex items-center px-4" style={{ height: "50px" }}>
                {/* Track */}
                <div
                  className="absolute inset-x-4 rounded-full border border-slate-700/80 shadow-lg"
                  style={{
                    height: "32px",
                    background: "linear-gradient(180deg,#1e293b 0%,#0f172a 100%)",
                  }}
                >
                  <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-full h-1.5 bg-slate-700/60" />
                </div>

                {/* Range Input */}
                <input
                  type="range"
                  min={STRIKER_SLIDER_MIN}
                  max={STRIKER_SLIDER_MAX}
                  value={strikerPos}
                  onChange={(e) => updateStrikerPos(Number(e.target.value))}
                  onPointerUp={() => {
                    const striker = coinsRef.current.find((c) => c.type === "striker");
                    if (striker && driverRef.current?.canPlaceStriker()) {
                      driverRef.current.sendPlaceStriker(striker.x);
                    }
                  }}
                  className="relative w-full h-full opacity-0 cursor-grab z-10"
                  style={{ WebkitAppearance: "none" }}
                />

                {/* Metallic Thumb */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 pointer-events-none z-20 flex items-center justify-center rounded-full shadow-xl transition-transform"
                  style={{
                    width: "38px", height: "38px",
                    left: `calc(${((strikerPos - STRIKER_SLIDER_MIN) / (STRIKER_SLIDER_MAX - STRIKER_SLIDER_MIN)) * 100}% - ${((strikerPos - STRIKER_SLIDER_MIN) / (STRIKER_SLIDER_MAX - STRIKER_SLIDER_MIN)) * 38}px + 0px)`,
                    background: "radial-gradient(circle at 35% 35%,#38bdf8,#0284c7)",
                    border: "2px solid #ffffff",
                    boxShadow: "0 0 15px rgba(56,189,248,0.5)",
                  }}
                />
              </div>

              <div className="flex items-center justify-between w-full px-2">
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Position Striker
                </span>
                <button
                  onClick={handleConfirmPlacement}
                  className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black uppercase rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Confirm Position
                </button>
              </div>

              {strikerOverlap && (
                <div className="flex items-center gap-1.5 text-xs text-rose-400 font-bold uppercase tracking-widest animate-pulse mt-1">
                  <AlertTriangle className="w-4 h-4" /> Overlaps a coin — move striker
                </div>
              )}
            </div>
          )}

          {/* Aiming Hint */}
          {isMyTurn && gamePhase === "aiming" && !isTurnActive && !gameOver && (
            <p className="text-xs text-indigo-300 font-bold text-center tracking-wide animate-pulse">
              Drag <strong>backwards</strong> from striker to set force & aim angle
            </p>
          )}
        </div>

        {/* ═══ SIDEBAR PANEL (Unified Glassmorphism Card) ═══ */}
        <div className="flex flex-col gap-4 w-full max-w-[320px] flex-shrink-0">

          {/* Turn Banner */}
          <div className={`flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all border ${
            isMyTurn
              ? "bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-emerald-950/50"
              : "bg-slate-900/90 text-slate-400 border-slate-800 shadow-slate-950/50"
          }`}>
            {isTurnActive ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <span>Shot In Motion…</span>
              </>
            ) : isMyTurn ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>YOUR TURN ({gamePhase === "placing" ? "PLACE" : "AIM"})</span>
              </>
            ) : (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500 animate-pulse" />
                <span>OPPONENT&apos;S TURN</span>
              </>
            )}
          </div>

          {/* Score & Match Progress Card */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 shadow-xl backdrop-blur-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Match Scoreboard</span>
              <span className="text-[10px] font-bold text-amber-400">First to 9</span>
            </div>

            {/* My Score Row */}
            <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${isMyTurn ? "border-emerald-500/30 bg-emerald-500/5" : "border-slate-800 bg-slate-950/40"}`}>
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
            <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${!isMyTurn ? "border-indigo-500/30 bg-indigo-500/5" : "border-slate-800 bg-slate-950/40"}`}>
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
              <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${
                queenCovered
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : queenPocketed
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse"
                  : "bg-slate-800 text-slate-400 border-slate-700"
              }`}>
                {queenCovered ? "Covered ✓" : queenPocketed ? "Needs Cover!" : "On Board"}
              </span>
            </div>
          </div>

          {/* Multiplayer Match Panel (Player profiles & Controls) */}
          <MultiplayerMatchPanel compact />
        </div>

      </div>
    </GameWrapper>
  );
};

export default CarromMultiplayer;
