import React from "react";
import {
  CheckCircle2,
  Clock,
  Swords,
  Trophy,
  Wallet,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";
import { Button } from "../ui/Button";
import type { TournamentTimelineStep, TournamentTimelineStatus } from "@gaming-hub/shared";

interface TournamentTimelineProps {
  steps?: TournamentTimelineStep[];
  currentRound?: number;
  totalRounds?: number;
  tournamentStatus?: string;
  isRegistered?: boolean;
  activeMatchId?: string | null;
  onJoinMatch?: (matchId: string) => void;
  onViewBracket?: () => void;
  onViewWallet?: () => void;
  className?: string;
}

export const TournamentTimeline: React.FC<TournamentTimelineProps> = ({
  steps,
  currentRound = 1,
  totalRounds = 3,
  tournamentStatus = "IN_PROGRESS",
  isRegistered = true,
  activeMatchId,
  onJoinMatch,
  onViewBracket,
  onViewWallet,
  className = "",
}) => {
  // Default steps generator if not explicitly passed
  const defaultSteps: TournamentTimelineStep[] = steps || [
    {
      id: "registered",
      label: "Registered",
      description: isRegistered ? "Registration confirmed" : "Not registered",
      status: isRegistered ? "COMPLETED" : "UPCOMING",
    },
    {
      id: "reg_closed",
      label: "Registration Closed",
      description: tournamentStatus !== "REGISTRATION_OPEN" && tournamentStatus !== "UPCOMING" ? "Participants locked" : "Pending cutoff",
      status: tournamentStatus !== "REGISTRATION_OPEN" && tournamentStatus !== "UPCOMING" ? "COMPLETED" : "UPCOMING",
    },
    {
      id: "started",
      label: "Tournament Started",
      description: tournamentStatus === "IN_PROGRESS" || tournamentStatus === "COMPLETED" || tournamentStatus === "SETTLED" ? "Bracket generated" : "Waiting for start",
      status: tournamentStatus === "IN_PROGRESS" || tournamentStatus === "COMPLETED" || tournamentStatus === "SETTLED" ? "COMPLETED" : "UPCOMING",
    },
    {
      id: "match_assigned",
      label: activeMatchId ? "Match Ready" : `Round ${currentRound}`,
      description: activeMatchId ? "Opponent assigned" : "Waiting for opponent",
      status: activeMatchId ? "ACTIVE" : (currentRound > 1 ? "COMPLETED" : "UPCOMING"),
    },
    {
      id: "progression",
      label: currentRound >= totalRounds ? "Final Round" : `Round ${currentRound} of ${totalRounds}`,
      description: currentRound >= totalRounds ? "Championship match" : "Knockout advancement",
      status: tournamentStatus === "COMPLETED" || tournamentStatus === "SETTLED" ? "COMPLETED" : "ACTIVE",
    },
    {
      id: "settlement",
      label: "Prize Settlement",
      description: tournamentStatus === "SETTLED" ? "Prizes credited to wallet" : "Automatic on conclusion",
      status: tournamentStatus === "SETTLED" ? "COMPLETED" : (tournamentStatus === "COMPLETED" ? "ACTIVE" : "UPCOMING"),
    },
  ];

  const getStatusIcon = (status: TournamentTimelineStatus, id: string) => {
    switch (status) {
      case "COMPLETED":
        return <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
      case "ACTIVE":
        if (id === "match_assigned") return <Swords className="w-5 h-5 text-amber-500 dark:text-amber-400 animate-pulse" />;
        if (id === "settlement") return <Wallet className="w-5 h-5 text-purple-500 dark:text-purple-400 animate-pulse" />;
        return <Clock className="w-5 h-5 text-blue-500 dark:text-blue-400 animate-pulse" />;
      case "FAILED":
        return <AlertCircle className="w-5 h-5 text-rose-500 dark:text-rose-400" />;
      default:
        return <div className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-600" />;
    }
  };

  return (
    <div className={`bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 sm:p-6 shadow-md shadow-slate-200/50 dark:shadow-none backdrop-blur-sm transition-colors ${className}`}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500 dark:text-amber-400" />
            Tournament Progression Timeline
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time authoritative tracking from registration to prize settlement
          </p>
        </div>

        {activeMatchId && (
          <Button
            size="sm"
            variant="primary"
            onClick={() => onJoinMatch?.(activeMatchId)}
            className="w-full sm:w-auto bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-bold shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
          >
            <Swords className="w-4 h-4" />
            Join Match Now
          </Button>
        )}
      </div>

      {/* Horizontal / Flow list (mobile friendly with scroll) */}
      <div className="relative">
        <div className="flex flex-col md:flex-row items-stretch md:items-start justify-between gap-4 relative">
          {defaultSteps.map((step, idx) => {
            const isLast = idx === defaultSteps.length - 1;
            return (
              <div
                key={step.id}
                className="flex-1 flex flex-row md:flex-col items-start md:items-center text-left md:text-center relative group"
              >
                {/* Connecting Line */}
                {!isLast && (
                  <div className="hidden md:block absolute top-5 left-1/2 w-full h-0.5 bg-slate-200 dark:bg-slate-800 z-0">
                    <div
                      className={`h-full transition-all duration-500 ${
                        step.status === "COMPLETED" ? "bg-emerald-500/50" : "bg-slate-200 dark:bg-slate-800"
                      }`}
                    />
                  </div>
                )}

                {/* Node icon */}
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border z-10 transition-all ${
                    step.status === "COMPLETED"
                      ? "bg-emerald-50 dark:bg-slate-900 border-emerald-500 shadow-sm shadow-emerald-500/20"
                      : step.status === "ACTIVE"
                      ? "bg-amber-50 dark:bg-slate-900 border-amber-400 shadow-md shadow-amber-400/20"
                      : "bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                  }`}
                >
                  {getStatusIcon(step.status, step.id)}
                </div>

                {/* Content */}
                <div className="ml-3 md:ml-0 md:mt-3 flex-1">
                  <div className="flex items-center md:justify-center gap-2">
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{step.label}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{step.description}</p>
                  {step.timestamp && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-1 font-mono">{step.timestamp}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Action Bar for Tournament Navigation */}
      <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <ShieldCheck className="w-4 h-4 text-blue-500 dark:text-blue-400" />
          <span>Server-authoritative state & 10-minute timers</span>
        </div>

        <div className="flex items-center gap-2">
          {onViewBracket && (
            <Button size="sm" variant="secondary" onClick={onViewBracket} className="text-xs h-8 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700">
              View Bracket
            </Button>
          )}
          {onViewWallet && (
            <Button size="sm" variant="secondary" onClick={onViewWallet} className="text-xs h-8 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700">
              View Wallet
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

