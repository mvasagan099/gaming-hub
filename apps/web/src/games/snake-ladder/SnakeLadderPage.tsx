import { useState, useMemo } from "react";
import { MessageSquare, Users, X, Swords } from "lucide-react";
import { GameWrapper } from "../../components/GameWrapper";
import PhaserGame from "./components/PhaserGame";
import { useMultiplayerStore } from "../../store/multiplayerStore";
import { MultiplayerMatchPanel } from "../shared/components/MultiplayerMatchPanel";

interface SnakeLadderPageProps {
  mode?: "ai" | "multiplayer";
  stake?: number;
  onBack?: () => void;
}

export function SnakeLadderPage({ mode = 'ai', stake = 10, onBack = () => {} }: SnakeLadderPageProps) {
  const room = useMultiplayerStore((s) => s.room);
  const mySeat = useMultiplayerStore((s) => s.mySeat);
  const isSpectator = useMultiplayerStore((s) => s.isSpectator);
  const [showMobilePanel, setShowMobilePanel] = useState(false);

  const isMultiplayer = mode === "multiplayer";
  const participants = room?.players ?? [];
  const maxPlayers = room?.maxPlayers ?? 2;

  const namesKey = isMultiplayer
    ? participants
        .map((p) => `${p.seat ?? 0}:${p.displayName}`)
        .sort()
        .join("|")
    : "";

  const names = useMemo(() => {
    if (!isMultiplayer) return [];
    return [...participants]
      .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0))
      .map((p) => p.displayName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiplayer, namesKey]);

  const players = isMultiplayer && names.length > 0 ? names.length : (isMultiplayer ? maxPlayers : 2);
  const seat = isMultiplayer ? (isSpectator ? null : mySeat) : null;

  return (
    <GameWrapper title="Snake & Ladder" gameId="snake-ladder" mode={mode} stake={stake} onBack={onBack} isFullscreen>
      <div className="flex flex-col lg:flex-row items-center justify-center gap-3 xl:gap-5 w-full h-full p-0 sm:p-2 lg:p-3 relative overflow-hidden">
        <div className={`flex items-center justify-center overflow-hidden w-full h-full ${isMultiplayer ? "lg:flex-1 lg:min-w-0 lg:min-h-0" : ""}`}>
          <PhaserGame mode={isMultiplayer ? "pvp" : "ai"} players={players} seat={seat} names={names} />
        </div>

        {/* Desktop Sidebar Panel */}
        {isMultiplayer && (
          <div className="hidden lg:flex flex-col flex-shrink-0 h-full max-h-[calc(100dvh-4.25rem)] justify-center py-1">
            <div className="overflow-y-auto max-h-full pr-1.5 custom-scrollbar">
              <MultiplayerMatchPanel compact />
            </div>
          </div>
        )}

        {/* Mobile Multiplayer Floating Toggle Button */}
        {isMultiplayer && room && (
          <button
            onClick={() => setShowMobilePanel(true)}
            className="lg:hidden fixed bottom-5 left-4 z-[70] flex items-center gap-2 px-3.5 py-2 rounded-full bg-slate-900/95 text-white font-bold text-xs border border-indigo-500/50 shadow-2xl backdrop-blur-md hover:bg-indigo-950 transition-all cursor-pointer group active:scale-95"
            aria-label="Open Match Details & Chat"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <Swords size={14} className="text-amber-400" />
            <span>Match Details</span>
            <MessageSquare size={13} className="text-indigo-300 ml-0.5" />
          </button>
        )}

        {/* Mobile Multiplayer Modal - Centered */}
        {isMultiplayer && room && showMobilePanel && (
          <div className="lg:hidden fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
            <div
              className="fixed inset-0"
              onClick={() => setShowMobilePanel(false)}
              aria-hidden="true"
            />
            <div className="relative z-10 bg-slate-900/98 border border-slate-700/80 rounded-3xl p-4 max-h-[88vh] w-full max-w-sm overflow-y-auto flex flex-col gap-3 shadow-[0_20px_50px_rgba(0,0,0,0.8)] animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                    <Users size={15} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white leading-tight">Multiplayer Match Panel</h3>
                    <p className="text-[10px] text-slate-400">Room: <span className="font-mono font-bold text-indigo-300">{room.code}</span></p>
                  </div>
                </div>
                <button
                  onClick={() => setShowMobilePanel(false)}
                  className="p-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  aria-label="Close panel"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="py-1 flex justify-center">
                <MultiplayerMatchPanel compact={false} showControls={true} showChat={true} />
              </div>
            </div>
          </div>
        )}
      </div>
    </GameWrapper>
  );
}

export default SnakeLadderPage;
