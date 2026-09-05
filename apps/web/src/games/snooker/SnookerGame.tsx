import React, { useEffect, useRef, useState, useCallback } from "react";
import toast from "react-hot-toast";
import {
  SnookerEngine,
  createInitialSnookerSetup,
  SNOOKER_TABLE_WIDTH,
  SNOOKER_TABLE_HEIGHT,
  SnookerRulesEngine,
  type SnookerBall,
  type SnookerPlayer,
  type SnookerState,
  type SnookerTrajectoryKeyframe,
  type SnookerTarget,
  type SnookerFrameStatus,
  type SnookerBallType,
  type SnookerFrameHistoryItem,
} from "@gaming-hub/game-engine";
import { SnookerTableRenderer } from "./rendering/SnookerTableRenderer";
import { SnookerBallRenderer } from "./rendering/SnookerBallRenderer";
import { SnookerCueRenderer } from "./rendering/SnookerCueRenderer";
import { Snooker3DCamera } from "./rendering/Snooker3DCamera";
import {
  SnookerHUD,
  SnookerPowerControl,
  SnookerMobilePowerMeter,
  SnookerSpinControl,
  SnookerGameOverModal,
  ColorPickerModal,
} from "./components/SnookerOverlays";
import { SnookerMultiplayerDriver } from "./SnookerMultiplayerDriver";
import { useMultiplayerStore } from "../../store/multiplayerStore";
import { GameWrapper } from "../../components/GameWrapper";
import { MultiplayerMatchPanel } from "../shared/components/MultiplayerMatchPanel";

interface SnookerGameProps {
  mode?: "ai" | "multiplayer";
  stake?: number;
  bestOf?: number;
  onBack: () => void;
}

export const SnookerGame: React.FC<SnookerGameProps> = ({
  mode = "ai",
  stake = 100,
  bestOf = 1,
  onBack,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const room = useMultiplayerStore((s) => s.room);
  const mySeat = useMultiplayerStore((s) => s.mySeat) ?? 0;

  const player1Name = mode === "multiplayer" ? room?.players?.find((p) => p.seat === 0)?.displayName : undefined;
  const player2Name = mode === "multiplayer" ? room?.players?.find((p) => p.seat === 1)?.displayName : undefined;

  // Game Engine & Driver
  const localEngineRef = useRef<SnookerEngine | null>(null);
  const driverRef = useRef<SnookerMultiplayerDriver | null>(null);

  // Authoritative State Fields
  const [balls, setBalls] = useState<SnookerBall[]>(() => createInitialSnookerSetup());
  const [players, setPlayers] = useState<SnookerPlayer[]>([
    { seat: 0, userId: "player-1", score: 0, framesWon: 0, currentBreak: 0, highestBreak: 0, fouls: 0 },
    { seat: 1, userId: "player-2", score: 0, framesWon: 0, currentBreak: 0, highestBreak: 0, fouls: 0 },
  ]);
  const [currentSeat, setCurrentSeat] = useState(0);
  const [frameStatus, setFrameStatus] = useState<SnookerFrameStatus>("BREAK");
  const [targetBall, setTargetBall] = useState<SnookerTarget>("RED");
  const [redsRemaining, setRedsRemaining] = useState(15);
  const [currentBreak, setCurrentBreak] = useState(0);
  const [cueBallInHand, setCueBallInHand] = useState(false);
  const [inBaulkOnly, setInBaulkOnly] = useState(false);
  const [freeBallAvailable, setFreeBallAvailable] = useState(false);
  const [nominatedBall, setNominatedBall] = useState<SnookerBallType | null>(null);
  const [lastFoul, setLastFoul] = useState<string | null>(null);
  const [foulPoints, setFoulPoints] = useState(0);
  const [frameNumber, setFrameNumber] = useState(1);
  const [totalFrames, setTotalFrames] = useState(bestOf);
  const [player1Score, setPlayer1Score] = useState(0);
  const [player2Score, setPlayer2Score] = useState(0);
  const [player1FramesWon, setPlayer1FramesWon] = useState(0);
  const [player2FramesWon, setPlayer2FramesWon] = useState(0);
  const [player1HighestBreak, setPlayer1HighestBreak] = useState(0);
  const [player2HighestBreak, setPlayer2HighestBreak] = useState(0);
  const [frameHistory, setFrameHistory] = useState<SnookerFrameHistoryItem[]>([]);
  const [stateVersion, setStateVersion] = useState(1);
  const [winnerSeats, setWinnerSeats] = useState<number[]>([]);

  // 3D Perspective & Camera View State
  const [cameraMode, setCameraMode] = useState<"3d" | "2d">("3d");

  // Auto-rotate board to vertical on mobile viewports (< 768px)
  const [isRotated, setIsRotated] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth < 768;
    }
    return false;
  });
  const [showMobilePanel, setShowMobilePanel] = useState(false);

  // Carrom-Style Aiming & Pull-Back Power State
  const [aimAngle, setAimAngle] = useState(0);
  const [cuePower, setCuePower] = useState(0.45);
  const [strikeProgress, setStrikeProgress] = useState(0);
  const [spinX, setSpinX] = useState(0);
  const [spinY, setSpinY] = useState(0);
  const [isAiming, setIsAiming] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  // Turn Countdown Timer (20s)
  const [timeLeft, setTimeLeft] = useState(20);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Ref tracking drag state for precision pull-back
  const dragRef = useRef<{
    originX: number;
    originY: number;
    targetAngle: number;
    isPulling: boolean;
    hasPulled: boolean;
  }>({ originX: 0, originY: 0, targetAngle: 0, isPulling: false, hasPulled: false });

  // Web Audio Sound Effects
  const playSound = useCallback((type: "strike" | "pocket" | "cushion" | "foul") => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "strike") {
        osc.frequency.setValueAtTime(480, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.08);
      } else if (type === "pocket") {
        osc.frequency.setValueAtTime(240, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.22);
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.22);
      } else if (type === "foul") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(160, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch {
      // AudioContext fallback
    }
  }, [soundEnabled]);

  // Apply Authoritative State Helper
  const syncAuthoritativeState = useCallback((st: SnookerState) => {
    setBalls(st.balls);
    setPlayers(st.players);
    setCurrentSeat(st.currentPlayer);
    setFrameStatus(st.frameStatus);
    setTargetBall(st.targetBall);
    setRedsRemaining(st.redsRemaining);
    setCurrentBreak(Number(st.currentBreak) || 0);
    setPlayer1Score(Number(st.player1Score) || 0);
    setPlayer2Score(Number(st.player2Score) || 0);
    setPlayer1FramesWon(Number(st.player1FramesWon) || 0);
    setPlayer2FramesWon(Number(st.player2FramesWon) || 0);
    setPlayer1HighestBreak(Number(st.player1HighestBreak) || 0);
    setPlayer2HighestBreak(Number(st.player2HighestBreak) || 0);
    setCueBallInHand(Boolean(st.cueBallInHand));
    setInBaulkOnly(Boolean(st.inBaulkOnly));
    setFreeBallAvailable(Boolean(st.freeBallAvailable));
    setNominatedBall((st.nominatedBall as SnookerBallType) || null);
    setLastFoul(st.lastFoul ? String(st.lastFoul) : null);
    setFoulPoints(Number(st.foulPoints) || 0);
    setFrameNumber(Number(st.frameNumber) || 1);
    setTotalFrames(Number(st.totalFrames) || 1);
    setFrameHistory((st.frameHistory as unknown as SnookerFrameHistoryItem[]) || []);
    setStateVersion(Number(st.stateVersion) || 1);
    setWinnerSeats(st.winnerSeats || []);
    setStrikeProgress(0);
    setTimeLeft(20);
  }, []);

  const isMyTurn = (mode === "ai" && currentSeat === 0) || (mode === "multiplayer" && currentSeat === mySeat);

  // Keyframe Animation Replay Function
  const playKeyframes = useCallback((keyframes: SnookerTrajectoryKeyframe[], finalState: SnookerState) => {
    if (!keyframes || keyframes.length === 0) {
      syncAuthoritativeState(finalState);
      return;
    }

    setIsSimulating(true);
    playSound("strike");
    let frameIdx = 0;

    const animate = () => {
      if (frameIdx < keyframes.length) {
        const kf = keyframes[frameIdx];
        setBalls((prev) =>
          prev.map((b) => {
            const p = kf.pieces.find((pk) => pk.id === b.id);
            if (!p) return b;
            return {
              ...b,
              x: p.x,
              y: p.y,
              pocketed: p.pocketed,
              pocketIndex: p.pocketIndex,
            };
          })
        );
        frameIdx++;
        requestAnimationFrame(animate);
      } else {
        setIsSimulating(false);
        syncAuthoritativeState(finalState);

        if (finalState.lastFoul) playSound("foul");
        else playSound("pocket");
      }
    };

    requestAnimationFrame(animate);
  }, [playSound, syncAuthoritativeState]);

  // Initialize Mode (AI vs Multiplayer)
  useEffect(() => {
    if (mode === "ai") {
      const engine = new SnookerEngine(
        [
          { userId: "player-1", seat: 0 },
          { userId: "ai-bot", seat: 1 },
        ],
        undefined,
        { bestOf }
      );
      localEngineRef.current = engine;
      syncAuthoritativeState(engine.getState());
    } else {
      const driver = new SnookerMultiplayerDriver(
        mySeat,
        (state) => {
          syncAuthoritativeState(state);
        },
        (keyframes, targetState) => {
          playKeyframes(keyframes, targetState);
        },
        (angle, power) => {
          setAimAngle(angle);
          setCuePower(power);
        }
      );
      driverRef.current = driver;
      driver.start();
      return () => driver.stop();
    }
  }, [mode, mySeat, bestOf, playKeyframes, syncAuthoritativeState]);

  // Turn Timer Interval (20s)
  useEffect(() => {
    if (frameStatus === "FRAME_END" || frameStatus === "MATCH_END" || isSimulating) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (mode === "ai" && localEngineRef.current) {
            const timeoutRes = localEngineRef.current.handleTimeout("turn");
            if (timeoutRes.ok) {
              const st = timeoutRes.state as unknown as SnookerState;
              syncAuthoritativeState(st);
              toast.error("Turn timed out! 4-point penalty awarded to opponent.", { id: "snooker-timeout" });
            }
          } else if (mode === "multiplayer" && driverRef.current && isMyTurn) {
            driverRef.current.sendTimeout();
          }
          return 20;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [frameStatus, isSimulating, mode, isMyTurn, syncAuthoritativeState]);

  // AI Turn Automated Move Handler
  useEffect(() => {
    if (mode !== "ai" || currentSeat !== 1 || isSimulating || frameStatus === "FRAME_END" || frameStatus === "MATCH_END") return;

    const aiTimeout = setTimeout(() => {
      const engine = localEngineRef.current;
      if (!engine) return;

      // 1. If Cue Ball is in hand after a foul, AI places cue ball in the "D" first
      if (engine.state.cueBallInHand) {
        const placeX = 165;
        const placeY = 240 + (Math.random() - 0.5) * 30;
        const placeRes = engine.apply({ type: "place-cue-ball", x: placeX, y: placeY }, 1);
        if (placeRes.ok) {
          syncAuthoritativeState(placeRes.state as unknown as SnookerState);
        }
      }

      const cue = engine.state.balls.find((b) => b.type === "cue" && !b.pocketed);
      if (!cue) return;

      // 2. Handle AI color nomination in COLOR_PHASE or FREE_BALL
      if (engine.state.frameStatus === "COLOR_PHASE" && !engine.state.nominatedBall) {
        const availableColors: SnookerBallType[] = ["black", "pink", "blue", "brown", "green", "yellow"];
        const chosen = availableColors[Math.floor(Math.random() * availableColors.length)];
        engine.apply({ type: "nominate-color", color: chosen }, 1);
      }

      const legalTypes = SnookerRulesEngine.getLegalBallTypes(
        engine.state.targetBall,
        engine.state.freeBallAvailable,
        engine.state.nominatedBall
      );

      const targetBalls = engine.state.balls.filter(
        (b) => !b.pocketed && legalTypes.includes(b.type)
      );

      if (targetBalls.length === 0) return;

      let bestTarget = targetBalls[0];
      let bestDist = 9999;
      for (const t of targetBalls) {
        const d = Math.hypot(t.x - cue.x, t.y - cue.y);
        if (d < bestDist) {
          bestDist = d;
          bestTarget = t;
        }
      }

      const dx = bestTarget.x - cue.x;
      const dy = bestTarget.y - cue.y;
      const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.04;
      const power = 0.45 + Math.random() * 0.35;

      const shotId = `shot-ai-${Date.now()}`;
      const result = engine.apply({ type: "strike", angle, power, shotId }, 1);
      if (result.ok) {
        const nextState = result.state as unknown as SnookerState;
        if (nextState.keyframes) {
          playKeyframes(nextState.keyframes, nextState);
        }
      }
    }, 1200);

    return () => clearTimeout(aiTimeout);
  }, [currentSeat, mode, isSimulating, frameStatus, playKeyframes, syncAuthoritativeState]);

  const TABLE_PAD = 70;

  // Canvas Touch & Mouse Pointer Coordinates (with Rotation & 3D Unprojection)
  const getPointerCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { clickX: 0, clickY: 0 };
    const rect = canvas.getBoundingClientRect();

    if (isRotated) {
      // Screen space on canvas element (0 to 480 + 2*TABLE_PAD, 0 to 960 + 2*TABLE_PAD)
      const normX = (e.clientX - rect.left) * ((480 + TABLE_PAD * 2) / rect.width);
      const normY = (e.clientY - rect.top) * ((960 + TABLE_PAD * 2) / rect.height);

      const tableNormX = normX - TABLE_PAD;
      const tableNormY = normY - TABLE_PAD;

      // Inverse of: X' = y, Y' = 960 - x
      // Therefore: x = 960 - Y', y = X'
      const clickX = 960 - tableNormY;
      const clickY = tableNormX;
      return { clickX, clickY };
    } else {
      const scale = (SNOOKER_TABLE_WIDTH + TABLE_PAD * 2) / rect.width;
      const rawX = (e.clientX - rect.left) * scale - TABLE_PAD;
      const rawY = (e.clientY - rect.top) * scale - TABLE_PAD;
      const unproj = Snooker3DCamera.unproject(rawX, rawY, SNOOKER_TABLE_WIDTH, SNOOKER_TABLE_HEIGHT, cameraMode === "3d");
      return { clickX: unproj.x, clickY: unproj.y };
    }
  };

  // Canvas Touch & Mouse Pointer Interaction (with 3D Unprojection)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (isSimulating || (mode === "ai" && currentSeat !== 0) || (mode === "multiplayer" && currentSeat !== mySeat)) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Fallback
    }

    const { clickX, clickY } = getPointerCoords(e);

    const cueBall = balls.find((b) => b.type === "cue");
    if (!cueBall) return;

    // Handle Ball-in-Hand placement in the "D" with auto-clamping & seamless aim transition
    if (cueBallInHand) {
      const baulkX = 210; // SNOOKER_BAULK_X
      const centerY = 240; // SNOOKER_TABLE_CENTER_Y
      const dRadius = 58; // SNOOKER_D_RADIUS - 2

      let placeX = clickX;
      let placeY = clickY;

      // If user clicked outside the baulk area, auto-place in the "D"
      if (clickX > baulkX || Math.hypot(clickX - baulkX, clickY - centerY) > dRadius) {
        const curDx = Math.min(0, cueBall.x - baulkX);
        const curDy = cueBall.y - centerY;
        if (cueBall.x <= baulkX && Math.hypot(curDx, curDy) <= dRadius) {
          placeX = cueBall.x;
          placeY = cueBall.y;
        } else {
          placeX = baulkX - 25;
          placeY = centerY;
        }
      }

      if (mode === "ai" && localEngineRef.current) {
        const res = localEngineRef.current.apply({ type: "place-cue-ball", x: placeX, y: placeY }, currentSeat);
        if (res.ok) {
          syncAuthoritativeState(res.state as unknown as SnookerState);
        }
      } else if (mode === "multiplayer" && driverRef.current) {
        driverRef.current.sendPlaceCueBall(placeX, placeY);
        setCueBallInHand(false);
      }

      // Enter active aim state immediately after placing cue ball
      setIsAiming(true);
      const aimDx = clickX - placeX;
      const aimDy = clickY - placeY;
      const angle = Math.atan2(aimDy, aimDx);
      setAimAngle(angle);
      dragRef.current = { originX: clickX, originY: clickY, targetAngle: angle, isPulling: true, hasPulled: false };
      return;
    }

    const isTouchOrMobile = isRotated || e.pointerType === 'touch' || (typeof window !== "undefined" && window.innerWidth < 768);

    setIsAiming(true);
    const dx = clickX - cueBall.x;
    const dy = clickY - cueBall.y;
    const angle = Math.atan2(dy, dx);
    setAimAngle(angle);

    dragRef.current = {
      originX: clickX,
      originY: clickY,
      targetAngle: angle,
      isPulling: !isTouchOrMobile, // On mobile, touching/dragging on the board is strictly for aiming; shot is fired via the power meter
      hasPulled: false,
    };

    if (mode === "multiplayer" && driverRef.current) {
      driverRef.current.sendAim(angle, cuePower);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isSimulating || (mode === "ai" && currentSeat !== 0) || (mode === "multiplayer" && currentSeat !== mySeat)) return;

    const { clickX, clickY } = getPointerCoords(e);

    const cueBall = balls.find((b) => b.type === "cue");
    if (!cueBall || cueBall.pocketed || cueBallInHand) return;

    const isTouchOrMobile = isRotated || e.pointerType === 'touch' || (typeof window !== "undefined" && window.innerWidth < 768);

    if (isTouchOrMobile) {
      // Mobile View: Dragging anywhere on the board strictly aims towards touch position
      const newAngle = Math.atan2(clickY - cueBall.y, clickX - cueBall.x);
      setAimAngle(newAngle);
      dragRef.current.targetAngle = newAngle;

      if (mode === "multiplayer" && driverRef.current) {
        driverRef.current.sendAim(newAngle, cuePower);
      }
      return;
    }

    // Desktop PC: Pull-back power drag, mouse hover aim
    const targetAngle = dragRef.current.targetAngle ?? aimAngle;
    const backX = -Math.cos(targetAngle);
    const backY = -Math.sin(targetAngle);

    if (dragRef.current.isPulling) {
      const deltaX = clickX - dragRef.current.originX;
      const deltaY = clickY - dragRef.current.originY;

      // Project drag displacement onto reverse aim vector
      const pullDist = deltaX * backX + deltaY * backY;

      if (pullDist > 12) {
        // User is pulling back the cue to charge power
        dragRef.current.hasPulled = true;
        const rawPower = Math.min(1, Math.max(0, (pullDist - 12) / 120));
        const power = Math.max(0.05, Math.pow(rawPower, 1.1));
        setCuePower(power);

        if (mode === "multiplayer" && driverRef.current) {
          driverRef.current.sendAim(targetAngle, power);
        }
      }
    } else {
      // Continuous Mouse Hover Aiming (always track cursor position when moving mouse over table)
      const newAngle = Math.atan2(clickY - cueBall.y, clickX - cueBall.x);
      setAimAngle(newAngle);
      dragRef.current.targetAngle = newAngle;

      if (mode === "multiplayer" && driverRef.current) {
        driverRef.current.sendAim(newAngle, cuePower);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Fallback
    }

    if (!isAiming) return;
    setIsAiming(false);

    const isTouchOrMobile = isRotated || e.pointerType === 'touch' || (typeof window !== "undefined" && window.innerWidth < 768);

    if (!isTouchOrMobile && dragRef.current.isPulling) {
      const shouldShoot = dragRef.current.hasPulled && cuePower >= 0.05;
      dragRef.current.isPulling = false;
      dragRef.current.hasPulled = false;

      if (shouldShoot) {
        executeShotWithAnimation(cuePower);
      }
    } else {
      dragRef.current.isPulling = false;
      dragRef.current.hasPulled = false;
    }
  };

  // Shot Execution with Cue Forward Strike Impact Animation
  const executeShotWithAnimation = (power: number) => {
    if (isSimulating || cueBallInHand) return;
    if ((mode === "ai" && currentSeat !== 0) || (mode === "multiplayer" && currentSeat !== mySeat)) return;

    setIsSimulating(true); // Lock input immediately

    // Animate Cue Forward Strike (0 to 1 over 90ms)
    let startTime: number | null = null;
    const strikeAnim = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(1, elapsed / 90);
      setStrikeProgress(progress);

      if (progress < 1) {
        requestAnimationFrame(strikeAnim);
      } else {
        // Impact! Launch shot physics
        setStrikeProgress(0);
        const shotId = `shot-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

        if (mode === "ai" && localEngineRef.current) {
          const res = localEngineRef.current.apply(
            { type: "strike", angle: aimAngle, power, spinX, spinY, shotId },
            currentSeat
          );
          if (res.ok) {
            const nextState = res.state as unknown as SnookerState;
            if (nextState.keyframes) {
              playKeyframes(nextState.keyframes, nextState);
            }
          } else {
            setIsSimulating(false);
            toast.error(res.error || "Shot failed");
          }
        } else if (mode === "multiplayer" && driverRef.current) {
          driverRef.current
            .sendStrike(aimAngle, power, spinX, spinY, shotId)
            .then((res) => {
              if (!res.ok) {
                setIsSimulating(false);
                toast.error(res.error || "Shot rejected by server", { id: "snooker-shot-err" });
              }
            })
            .catch((err) => {
              setIsSimulating(false);
              toast.error("Network error sending shot", { id: "snooker-shot-err" });
            });
        }
      }
    };

    requestAnimationFrame(strikeAnim);
  };

  // Direct Shoot Button Execution (from sidebar)
  const handleDirectShoot = () => {
    executeShotWithAnimation(cuePower > 0.05 ? cuePower : 0.5);
  };

  // Nominate Color Action
  const handleNominateColor = (color: SnookerBallType) => {
    if (mode === "ai" && localEngineRef.current) {
      const res = localEngineRef.current.apply({ type: "nominate-color", color }, currentSeat);
      if (res.ok) {
        syncAuthoritativeState(res.state as unknown as SnookerState);
      }
    } else if (mode === "multiplayer" && driverRef.current) {
      driverRef.current.sendNominateColor(color);
      setNominatedBall(color);
    }
  };

  // Next Frame Action
  const handleNextFrame = () => {
    if (mode === "ai" && localEngineRef.current) {
      localEngineRef.current.startNextFrame();
      syncAuthoritativeState(localEngineRef.current.getState());
    } else if (mode === "multiplayer" && driverRef.current) {
      driverRef.current.sendNextFrame();
    }
  };

  // Live State Ref for High-Performance 60 FPS Canvas Render Loop (Zero Micro-Stutter)
  const renderStateRef = useRef({
    balls,
    aimAngle,
    cuePower,
    strikeProgress,
    isSimulating,
    cueBallInHand,
    targetBall,
    freeBallAvailable,
    nominatedBall,
    cameraMode,
    isMyTurn,
    isRotated,
  });

  // Sync live render refs continuously without restarting the animation loop
  useEffect(() => {
    renderStateRef.current = {
      balls,
      aimAngle,
      cuePower,
      strikeProgress,
      isSimulating,
      cueBallInHand,
      targetBall,
      freeBallAvailable,
      nominatedBall,
      cameraMode,
      isMyTurn,
      isRotated,
    };
  });

  // Main 60 FPS Render Loop (Single Persistent rAF Instance)
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const {
        balls: curBalls,
        aimAngle: curAimAngle,
        cuePower: curCuePower,
        strikeProgress: curStrikeProgress,
        isSimulating: curIsSimulating,
        cueBallInHand: curCueBallInHand,
        targetBall: curTargetBall,
        freeBallAvailable: curFreeBallAvailable,
        nominatedBall: curNominatedBall,
        cameraMode: curCameraMode,
        isMyTurn: curIsMyTurn,
        isRotated: curIsRotated,
      } = renderStateRef.current;

      const w = canvas.width;
      const h = canvas.height;
      const is3D = curCameraMode === "3d";

      ctx.clearRect(0, 0, w, h);

      if (curIsRotated) {
        // Vertical Rotated Table Rendering (90 deg Counterclockwise) with TABLE_PAD margin
        ctx.save();
        ctx.translate(TABLE_PAD, TABLE_PAD + 960);
        ctx.rotate(-Math.PI / 2);

        // 1. Draw 3D Snooker Table (Baulk line, D, spots, pockets)
        SnookerTableRenderer.drawTable(ctx, 960, 480, is3D);

        // 2. Draw 22 Snooker Balls with 3D Depth Scaling
        const cueBall = curBalls.find((b) => b.type === "cue");
        const legalTypes = SnookerRulesEngine.getLegalBallTypes(curTargetBall, curFreeBallAvailable, curNominatedBall);

        for (const b of curBalls) {
          const isTargetOn = legalTypes.includes(b.type);
          SnookerBallRenderer.drawBall(ctx, b, 960, isTargetOn, is3D, 480);
        }

        // 3. Draw 3D Cue Stick and Laser Aim Guide (Only when it's your turn and not simulating)
        const shouldDrawCue =
          curIsMyTurn &&
          cueBall &&
          !cueBall.pocketed &&
          !curCueBallInHand &&
          (!curIsSimulating || curStrikeProgress > 0);

        if (shouldDrawCue) {
          SnookerCueRenderer.drawAimGuide(ctx, cueBall, curBalls, curAimAngle, 960, is3D, 480);
          SnookerCueRenderer.drawCue(ctx, cueBall, curAimAngle, curCuePower, 960, curStrikeProgress, is3D, 480);
        }

        ctx.restore();
      } else {
        // Standard Horizontal Landscape Table Rendering with TABLE_PAD margin
        ctx.save();
        ctx.translate(TABLE_PAD, TABLE_PAD);

        SnookerTableRenderer.drawTable(ctx, 960, 480, is3D);

        // Draw Balls
        const cueBall = curBalls.find((b) => b.type === "cue");
        const legalTypes = SnookerRulesEngine.getLegalBallTypes(curTargetBall, curFreeBallAvailable, curNominatedBall);

        for (const b of curBalls) {
          const isTargetOn = legalTypes.includes(b.type);
          SnookerBallRenderer.drawBall(ctx, b, 960, isTargetOn, is3D, 480);
        }

        // Draw Cue Stick and Laser Aim Guide
        const shouldDrawCue =
          curIsMyTurn &&
          cueBall &&
          !cueBall.pocketed &&
          !curCueBallInHand &&
          (!curIsSimulating || curStrikeProgress > 0);

        if (shouldDrawCue) {
          SnookerCueRenderer.drawAimGuide(ctx, cueBall, curBalls, curAimAngle, 960, is3D, 480);
          SnookerCueRenderer.drawCue(ctx, cueBall, curAimAngle, curCuePower, 960, curStrikeProgress, is3D, 480);
        }

        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, []); // Run ONCE on mount! Zero re-subscriptions or animation loop cancellations on mouse move!

  const showColorPicker = isMyTurn && !isSimulating && (frameStatus === "COLOR_PHASE" || frameStatus === "FREE_BALL");

  return (
    <GameWrapper title="Snooker 3D" gameId="snooker" mode={mode} stake={stake} onBack={onBack} isFullscreen isGameOver={frameStatus === "MATCH_END"}>
      <div className="relative h-full w-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-between p-2 sm:p-3 select-none overflow-hidden">
        {/* Top Snooker Championship Broadcast HUD */}
        <SnookerHUD
          player1Name={player1Name}
          player2Name={player2Name}
          players={players}
          currentSeat={currentSeat}
          mySeat={mode === "ai" ? 0 : mySeat}
          timeLeft={timeLeft}
          maxTime={20}
          balls={balls}
          targetBall={targetBall}
          frameStatus={frameStatus}
          currentBreak={currentBreak}
          redsRemaining={redsRemaining}
          frameNumber={frameNumber}
          totalFrames={totalFrames}
          player1Score={player1Score}
          player2Score={player2Score}
          player1FramesWon={player1FramesWon}
          player2FramesWon={player2FramesWon}
          player1HighestBreak={player1HighestBreak}
          player2HighestBreak={player2HighestBreak}
          cueBallInHand={cueBallInHand}
          freeBallAvailable={freeBallAvailable}
          nominatedBall={nominatedBall}
          lastFoul={lastFoul}
          foulPoints={foulPoints}
          mode={mode}
          cameraMode={cameraMode}
          setCameraMode={setCameraMode}
          onBack={onBack}
          soundEnabled={soundEnabled}
          setSoundEnabled={setSoundEnabled}
          isRotated={isRotated}
          onToggleRotate={() => setIsRotated((prev) => !prev)}
          showMobileMatchPanelButton={mode === "multiplayer"}
          onOpenMobileMatchPanel={() => setShowMobilePanel(true)}
        />

        {/* Color Nomination Overlay */}
        {showColorPicker && (
          <ColorPickerModal
            onSelectColor={handleNominateColor}
            nominatedColor={nominatedBall}
            isFreeBall={frameStatus === "FREE_BALL"}
          />
        )}

        {/* Main Snooker Arena */}
        <div className="w-full flex-1 flex items-center justify-center max-w-7xl px-1 sm:px-2 my-auto overflow-hidden">
          {/* Snooker Table Container & Mobile Side Power Slider */}
          <div className="relative flex items-center justify-center gap-1.5 sm:gap-4 w-full max-w-[min(98vw,calc((100dvh-9.5rem)*2),1340px)]">
            {/* Snooker Table Main Canvas Container */}
            <div className={`relative ${isRotated ? 'aspect-[620/1100] max-h-[min(68vh,620px)] w-auto' : 'aspect-[1100/620] w-full max-w-[min(94vw,calc((100dvh-9.5rem)*2),1300px)] max-h-[calc(100dvh-9.5rem)]'} flex items-center justify-center`}>
              <canvas
                ref={canvasRef}
                width={isRotated ? 480 + TABLE_PAD * 2 : 960 + TABLE_PAD * 2}
                height={isRotated ? 960 + TABLE_PAD * 2 : 480 + TABLE_PAD * 2}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onContextMenu={(e) => e.preventDefault()}
                className="w-full h-full cursor-crosshair touch-none select-none block"
              />

              {/* Floating Pull-Back Power Meter Overlay inside Table (PC Landscape ONLY) */}
              {!isRotated && isAiming && isMyTurn && !isSimulating && dragRef.current.isPulling && (
                <div className="absolute bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 px-3.5 sm:px-6 py-1.5 sm:py-2.5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] flex flex-col items-center gap-1 sm:gap-1.5 animate-in fade-in zoom-in-95 pointer-events-none z-30">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <span className="text-[9px] sm:text-[10px] font-black tracking-widest text-slate-400 uppercase">
                      POWER
                    </span>
                    <div className="w-24 sm:w-40 h-2 sm:h-3 bg-slate-950 rounded-full p-0.5 border border-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-75 ${
                          cuePower < 0.05
                            ? "bg-slate-600"
                            : cuePower < 0.4
                            ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                            : cuePower < 0.75
                            ? "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]"
                            : "bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.5)]"
                        }`}
                        style={{ width: `${Math.max(5, cuePower * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] sm:text-xs font-mono font-black text-white">
                      {Math.round(cuePower * 100)}%
                    </span>
                  </div>
                  <div className="text-[9px] sm:text-[10px] font-bold text-amber-400">
                    {cuePower < 0.05 ? "Pull back further to shoot" : "Release to Strike"}
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Vertical Shot Power Level Meter (Side Drag Level & Release to Strike) */}
            {isRotated && (
              <div className="flex flex-col items-center justify-center shrink-0 animate-in fade-in slide-in-from-right-2">
                <SnookerMobilePowerMeter
                  power={cuePower}
                  setPower={(p) => {
                    setCuePower(p);
                    if (mode === "multiplayer" && driverRef.current) driverRef.current.sendAim(aimAngle, p);
                  }}
                  onShoot={(p) => {
                    if (isMyTurn && !isSimulating && !cueBallInHand) {
                      executeShotWithAnimation(p);
                    }
                  }}
                  disabled={!isMyTurn || isSimulating || cueBallInHand}
                />
              </div>
            )}
          </div>
        </div>

        {/* Centered Multiplayer Match Panel Modal */}
        {mode === "multiplayer" && showMobilePanel && (
          <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95">
              <div className="p-3 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
                <span className="text-xs font-black uppercase text-amber-400">Match Details & Chat</span>
                <button
                  onClick={() => setShowMobilePanel(false)}
                  className="px-2.5 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold cursor-pointer"
                >
                  Close
                </button>
              </div>
              <div className="p-3 overflow-y-auto flex-1">
                <MultiplayerMatchPanel />
              </div>
            </div>
          </div>
        )}

        {/* ═══ MOBILE BOTTOM CONTROLS BAR (Fine Aim Adjust + Spin & Quick Strike) ═══ */}
        {isMyTurn && !isSimulating && !cueBallInHand && (
          <div className="flex sm:hidden items-center justify-between gap-2.5 w-full max-w-sm px-3.5 py-2 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl z-20 shrink-0">
            {/* Fine-tune Aim buttons */}
            <div className="flex items-center gap-1">
              <span className="text-[9px] font-bold text-slate-400 uppercase mr-0.5">Aim:</span>
              <button
                type="button"
                onClick={() => {
                  const newAngle = aimAngle - 0.02;
                  setAimAngle(newAngle);
                  if (mode === "multiplayer" && driverRef.current) driverRef.current.sendAim(newAngle, cuePower);
                }}
                className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 active:bg-indigo-600 text-slate-200 font-black text-xs flex items-center justify-center cursor-pointer shadow-sm active:scale-95"
                title="Fine-tune Aim Left"
                aria-label="Fine-tune Aim Left"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => {
                  const newAngle = aimAngle + 0.02;
                  setAimAngle(newAngle);
                  if (mode === "multiplayer" && driverRef.current) driverRef.current.sendAim(newAngle, cuePower);
                }}
                className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 active:bg-indigo-600 text-slate-200 font-black text-xs flex items-center justify-center cursor-pointer shadow-sm active:scale-95"
                title="Fine-tune Aim Right"
                aria-label="Fine-tune Aim Right"
              >
                ▶
              </button>
            </div>

            {/* Cue Spin Status Indicator */}
            <div
              onClick={() => {
                setSpinX(0);
                setSpinY(0);
              }}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-800/80 border border-slate-700 cursor-pointer active:scale-95"
              title="Reset Cue Ball Spin"
            >
              <div className="relative w-5 h-5 rounded-full bg-gradient-to-tr from-slate-200 to-white border border-slate-400 shadow-inner flex items-center justify-center">
                <div
                  className="w-1 h-1 rounded-full bg-rose-500 shadow-sm transition-all"
                  style={{
                    transform: `translate(${spinX * 6}px, ${spinY * 6}px)`,
                  }}
                />
              </div>
              <span className="text-[9px] font-bold text-slate-300">Spin</span>
            </div>

            {/* Strike Action Button */}
            <button
              type="button"
              onClick={() => handleDirectShoot()}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 active:scale-95 transition-all cursor-pointer flex items-center gap-1 shrink-0"
              aria-label="Strike Cue Ball"
            >
              ⚡ SHOOT
            </button>
          </div>
        )}

        {/* Bottom Control Helpers (Desktop PC View) */}
        <div className="hidden sm:flex text-[11px] text-slate-500 font-medium items-center gap-4 sm:gap-6 pb-1">
          <span>● Drag cloth to Aim</span>
          <span>● Pull back cue to charge Shot Level</span>
          <span>● Release mouse to Strike</span>
        </div>

        {/* Frame / Match Over Modal */}
        {(frameStatus === "FRAME_END" || frameStatus === "MATCH_END") && (
          <SnookerGameOverModal
            frameStatus={frameStatus}
            winnerSeats={winnerSeats}
            mySeat={mode === "ai" ? 0 : mySeat}
            player1Score={player1Score}
            player2Score={player2Score}
            player1FramesWon={player1FramesWon}
            player2FramesWon={player2FramesWon}
            frameNumber={frameNumber}
            totalFrames={totalFrames}
            frameHistory={frameHistory}
            onNextFrame={frameStatus === "FRAME_END" ? handleNextFrame : undefined}
            onRematch={
              mode === "multiplayer"
                ? () => void useMultiplayerStore.getState().rematch()
                : frameStatus === "MATCH_END"
                ? () => {
                    const engine = new SnookerEngine(
                      [
                        { userId: "player-1", seat: 0 },
                        { userId: "ai-bot", seat: 1 },
                      ],
                      undefined,
                      { bestOf }
                    );
                    localEngineRef.current = engine;
                    syncAuthoritativeState(engine.getState());
                  }
                : undefined
            }
            onExit={onBack}
          />
        )}
      </div>
    </GameWrapper>
  );
};
export default SnookerGame;
