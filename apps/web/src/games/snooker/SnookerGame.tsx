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
import {
  SnookerHUD,
  SnookerPowerControl,
  SnookerSpinControl,
  SnookerGameOverModal,
  ColorPickerModal,
} from "./components/SnookerOverlays";
import { SnookerMultiplayerDriver } from "./SnookerMultiplayerDriver";
import { useMultiplayerStore } from "../../store/multiplayerStore";

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
  const mySeat = useMultiplayerStore((s) => s.mySeat) ?? 0;

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

  // Aiming, Power & Spin
  const [aimAngle, setAimAngle] = useState(0);
  const [cuePower, setCuePower] = useState(0.55);
  const [spinX, setSpinX] = useState(0);
  const [spinY, setSpinY] = useState(0);
  const [isAiming, setIsAiming] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  // Turn Countdown Timer (20s)
  const [timeLeft, setTimeLeft] = useState(20);
  const [soundEnabled, setSoundEnabled] = useState(true);

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
    setTimeLeft(20);
  }, []);

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
      return () => driver.destroy();
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
          }
          return 20;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [frameStatus, isSimulating, mode, syncAuthoritativeState]);

  // AI Turn Automated Move Handler
  useEffect(() => {
    if (mode !== "ai" || currentSeat !== 1 || isSimulating || frameStatus === "FRAME_END" || frameStatus === "MATCH_END") return;

    const aiTimeout = setTimeout(() => {
      const engine = localEngineRef.current;
      if (!engine) return;

      const cue = engine.state.balls.find((b) => b.type === "cue" && !b.pocketed);
      if (!cue) return;

      // Handle AI color nomination in COLOR_PHASE or FREE_BALL
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
  }, [currentSeat, mode, isSimulating, frameStatus, playKeyframes]);

  // Canvas Mouse & Touch Interaction
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isSimulating || (mode === "ai" && currentSeat !== 0) || (mode === "multiplayer" && currentSeat !== mySeat)) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = SNOOKER_TABLE_WIDTH / rect.width;
    const clickX = (e.clientX - rect.left) * scale;
    const clickY = (e.clientY - rect.top) * scale;

    const cueBall = balls.find((b) => b.type === "cue");
    if (!cueBall) return;

    // Handle Ball-in-Hand placement in the "D"
    if (cueBallInHand) {
      if (mode === "ai" && localEngineRef.current) {
        const res = localEngineRef.current.apply({ type: "place-cue-ball", x: clickX, y: clickY }, currentSeat);
        if (res.ok) {
          syncAuthoritativeState(res.state as unknown as SnookerState);
        } else {
          toast.error(res.error || "Must place cue ball inside the 'D'");
        }
      } else if (mode === "multiplayer" && driverRef.current) {
        driverRef.current.sendPlaceCueBall(clickX, clickY, stateVersion);
        setCueBallInHand(false);
      }
      return;
    }

    setIsAiming(true);
    const angle = Math.atan2(clickY - cueBall.y, clickX - cueBall.x);
    setAimAngle(angle);

    if (mode === "multiplayer" && driverRef.current) {
      driverRef.current.sendAim(angle, cuePower);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isAiming || isSimulating) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = SNOOKER_TABLE_WIDTH / rect.width;
    const clickX = (e.clientX - rect.left) * scale;
    const clickY = (e.clientY - rect.top) * scale;

    const cueBall = balls.find((b) => b.type === "cue");
    if (!cueBall) return;

    const angle = Math.atan2(clickY - cueBall.y, clickX - cueBall.x);
    setAimAngle(angle);

    if (mode === "multiplayer" && driverRef.current) {
      driverRef.current.sendAim(angle, cuePower);
    }
  };

  const handlePointerUp = () => {
    setIsAiming(false);
  };

  // Nominate Color Action
  const handleNominateColor = (color: SnookerBallType) => {
    if (mode === "ai" && localEngineRef.current) {
      const res = localEngineRef.current.apply({ type: "nominate-color", color }, currentSeat);
      if (res.ok) {
        syncAuthoritativeState(res.state as unknown as SnookerState);
      }
    } else if (mode === "multiplayer" && driverRef.current) {
      driverRef.current.sendNominateColor(color, stateVersion);
      setNominatedBall(color);
    }
  };

  // Shot Execution
  const executeShot = () => {
    if (isSimulating || cueBallInHand) return;
    if ((mode === "ai" && currentSeat !== 0) || (mode === "multiplayer" && currentSeat !== mySeat)) return;

    const shotId = `shot-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    if (mode === "ai" && localEngineRef.current) {
      const res = localEngineRef.current.apply(
        { type: "strike", angle: aimAngle, power: cuePower, spinX, spinY, shotId, expectedStateVersion: stateVersion },
        currentSeat
      );
      if (res.ok) {
        const nextState = res.state as unknown as SnookerState;
        if (nextState.keyframes) {
          playKeyframes(nextState.keyframes, nextState);
        }
      } else {
        toast.error(res.error || "Shot failed");
      }
    } else if (mode === "multiplayer" && driverRef.current) {
      driverRef.current.sendStrike(aimAngle, cuePower, spinX, spinY, shotId, stateVersion);
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

  // Main 60 FPS Render Loop
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // 1. Draw 3D Snooker Table (Baulk line, D, spots, pockets)
      SnookerTableRenderer.drawTable(ctx, w, h);

      // 2. Draw 22 Snooker Balls
      const cueBall = balls.find((b) => b.type === "cue");
      const legalTypes = SnookerRulesEngine.getLegalBallTypes(targetBall, freeBallAvailable, nominatedBall);

      for (const b of balls) {
        const isTargetOn = legalTypes.includes(b.type);
        SnookerBallRenderer.drawBall(ctx, b, w, isTargetOn);
      }

      // 3. Draw Cue Stick and Laser Aim Guide when aiming
      if (cueBall && !cueBall.pocketed && !isSimulating && !cueBallInHand) {
        SnookerCueRenderer.drawAimGuide(ctx, cueBall, balls, aimAngle, w);
        SnookerCueRenderer.drawCue(ctx, cueBall, aimAngle, cuePower, w);
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [balls, aimAngle, cuePower, isSimulating, cueBallInHand, targetBall, freeBallAvailable, nominatedBall]);

  const isMyTurn = (mode === "ai" && currentSeat === 0) || (mode === "multiplayer" && currentSeat === mySeat);
  const showColorPicker = isMyTurn && !isSimulating && (frameStatus === "COLOR_PHASE" || frameStatus === "FREE_BALL");

  return (
    <div className="relative min-h-screen w-full bg-slate-950 flex flex-col items-center justify-between p-4 select-none overflow-hidden">
      {/* Top Snooker Broadcast HUD */}
      <SnookerHUD
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
        onBack={onBack}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
      />

      {/* Color Nomination Overlay */}
      {showColorPicker && (
        <ColorPickerModal
          onSelectColor={handleNominateColor}
          nominatedColor={nominatedBall}
          isFreeBall={frameStatus === "FREE_BALL"}
        />
      )}

      {/* Center 12ft Snooker Table Area */}
      <div className="relative flex items-center justify-center my-auto w-full max-w-5xl">
        <canvas
          ref={canvasRef}
          width={960}
          height={480}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="w-full max-w-4xl h-auto aspect-[2/1] rounded-3xl shadow-2xl cursor-crosshair touch-none border border-slate-800"
        />

        {/* Right Floating Control Sidebar (Power + Spin + Shoot) */}
        <div className="absolute right-[-70px] top-1/2 -translate-y-1/2 flex flex-col gap-4 items-center">
          <SnookerPowerControl
            power={cuePower}
            setPower={setCuePower}
            disabled={isSimulating}
          />
          <SnookerSpinControl
            spinX={spinX}
            spinY={spinY}
            setSpin={(x, y) => {
              setSpinX(x);
              setSpinY(y);
            }}
          />
          <button
            onClick={executeShot}
            disabled={isSimulating || cueBallInHand || !isMyTurn}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 disabled:opacity-40 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 transition-all uppercase tracking-wider cursor-pointer disabled:cursor-not-allowed"
          >
            SHOOT
          </button>
        </div>
      </div>

      {/* Bottom Info Bar */}
      <div className="text-xs text-slate-500 font-medium flex items-center gap-4">
        <span>● Drag to Aim</span>
        <span>● Adjust Power & Spin</span>
        <span>● Red $\to$ Color $\to$ Clearance Sequence</span>
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
            mode === "ai" && frameStatus === "MATCH_END"
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
  );
};
export default SnookerGame;
