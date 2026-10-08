import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  X,
  Play,
  Pause,
  RotateCcw,
  FastForward,
  ChevronLeft,
  ChevronRight,
  Shield,
  Clock,
  Trophy,
  Activity,
} from "lucide-react";
import { apiClient } from "../../services/api/client";
import type { ReplayPackage, ReplayEventRecord } from "@gaming-hub/shared";
import { summarizeReplayData, replayStepDuration } from "./replayPresentation";
import { CarromReplayBoard } from "./CarromReplayBoard";
import toast from "react-hot-toast";

interface ReplayModalProps {
  matchId: string;
  onClose: () => void;
}

export const ReplayModal: React.FC<ReplayModalProps> = ({ matchId, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [replayPkg, setReplayPkg] = useState<ReplayPackage | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    setLoading(true);
    setReplayPkg(null);
    setCurrentStep(0);
    setIsPlaying(false);
    apiClient
      .get<ReplayPackage>(`/matches/${encodeURIComponent(matchId)}/replay`, { signal: controller.signal })
      .then((data) => {
        if (mounted) {
          clearTimeout(timeout);
          if (!Array.isArray(data.events) || !data.metadata || !data.initialState || !data.finalState) {
            throw new Error("Replay data is incomplete");
          }
          setReplayPkg(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          clearTimeout(timeout);
          toast.error("Failed to load match replay: " + (err instanceof Error ? err.message : "Not found"));
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      controller.abort();
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
    };
  }, [matchId]);

  useEffect(() => {
    if (!isPlaying || !replayPkg || replayPkg.events.length === 0) {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
      return;
    }

    const interval = replayStepDuration(replayPkg.events[currentStep]) / speed;
    playTimerRef.current = setTimeout(() => {
      if (currentStep >= replayPkg.events.length - 1) setIsPlaying(false);
      else setCurrentStep(currentStep + 1);
    }, interval);

    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
    };
  }, [isPlaying, speed, replayPkg, currentStep]);

  const handleRestart = () => {
    setIsPlaying(false);
    setCurrentStep(0);
  };

  const handleStepBack = () => {
    setIsPlaying(false);
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    if (!replayPkg) return;
    setCurrentStep((prev) => Math.min(replayPkg.events.length - 1, prev + 1));
  };

  const totalEvents = replayPkg?.events.length ?? 0;
  const currentEvent: ReplayEventRecord | undefined = replayPkg?.events[currentStep];

  const eventPreview = useMemo(() => currentEvent
    ? JSON.stringify(summarizeReplayData({ action: currentEvent.actionData, result: currentEvent.resultData }), null, 2)
    : "", [currentEvent]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-3xl bg-slate-900 border border-slate-800 text-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-lg text-white capitalize">
                  {replayPkg?.gameId ? `${replayPkg.gameId.replace("-", " ")} Replay` : "Match Replay"}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Authoritative
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Match ID: <span className="font-mono">{matchId.slice(0, 12)}...</span>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-bold text-slate-400">Loading Authoritative Replay...</p>
            </div>
          ) : !replayPkg ? (
            <div className="py-16 text-center text-slate-400">
              <p className="font-bold text-base">Replay not found or corrupted.</p>
            </div>
          ) : (
            <>
              {/* Match Metadata Pill Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-2.5">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold">Result</span>
                    <span className="font-black text-white">{replayPkg.metadata.resultReason}</span>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold">Duration</span>
                    <span className="font-black text-white">{Math.round(replayPkg.metadata.durationMs / 1000)}s</span>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-2.5">
                  <Activity className="w-4 h-4 text-purple-400" />
                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold">Total Actions</span>
                    <span className="font-black text-white">{totalEvents}</span>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center gap-2.5">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold">Checksum</span>
                    <span className="font-mono text-emerald-300">{replayPkg.checksum?.slice(0, 8) ?? "Not recorded"}</span>
                  </div>
                </div>
              </div>

              {replayPkg.gameId === "carrom" && <CarromReplayBoard
                event={currentEvent} fallbackState={currentEvent?.resultData.state ?? (Object.keys(replayPkg.initialState).length ? replayPkg.initialState : replayPkg.finalState)}
                isPlaying={isPlaying} speed={speed} />}
              {/* Event Board / State Visualizer */}
              <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-bold uppercase tracking-wider">
                    Step {totalEvents > 0 ? currentStep + 1 : 0} of {totalEvents}
                  </span>
                  {currentEvent && (
                    <span className="px-2 py-0.5 rounded-lg bg-blue-500/20 text-blue-400 font-mono font-bold">
                      {currentEvent.eventType}
                    </span>
                  )}
                </div>

                {currentEvent ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold mb-1">Player</span>
                        <span className="font-bold text-white">{currentEvent.playerId}</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                        <span className="text-slate-400 block text-[10px] uppercase font-bold mb-1">Sequence / Version</span>
                        <span className="font-mono font-bold text-white">Seq #{currentEvent.sequence} (v{currentEvent.stateVersion})</span>
                      </div>
                    </div>

                    <details className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80 font-mono text-xs text-slate-300 overflow-x-auto max-h-48">
                      <summary className="text-[10px] text-slate-400 uppercase font-bold mb-1 cursor-pointer">Action details</summary>
                      <pre className="text-[11px] text-blue-300">
                        {eventPreview}
                      </pre>
                    </details>
                  </div>
                ) : (
                  <div className="py-10 text-center text-slate-500 text-xs font-bold">
                    No recorded actions are available for this match.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Playback Controls (Responsive Mobile & Desktop) */}
        {replayPkg && (
          <div className="p-4 sm:p-6 border-t border-slate-800 bg-slate-950/80 space-y-3">
            {/* Timeline Slider */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono text-slate-400 w-10 text-right">{totalEvents ? currentStep + 1 : 0}</span>
              <input
                type="range"
                min={0}
                max={Math.max(0, totalEvents - 1)}
                value={currentStep}
                onChange={(e) => {
                  setIsPlaying(false);
                  setCurrentStep(Number(e.target.value));
                }}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <span className="text-[11px] font-mono text-slate-400 w-10">{totalEvents}</span>
            </div>

            {/* Buttons row */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleRestart}
                  title="Restart"
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={handleStepBack}
                  disabled={currentStep <= 0}
                  title="Step Back"
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-40 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    if (!isPlaying && currentStep >= totalEvents - 1) setCurrentStep(0);
                    setIsPlaying(!isPlaying);
                  }}
                  disabled={totalEvents === 0}
                  title={isPlaying ? "Pause" : "Play"}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-blue-500/25 transition-all"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
                  <span>{isPlaying ? "Pause" : "Play"}</span>
                </button>
                <button
                  onClick={handleStepForward}
                  disabled={currentStep >= totalEvents - 1}
                  title="Step Forward"
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-40 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Speed Switcher */}
              <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl">
                {[0.5, 1, 2].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      speed === s
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
