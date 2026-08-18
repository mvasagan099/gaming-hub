import React from "react";
import { useMultiplayerStore } from "../../../store/multiplayerStore";
import { Bell, Trophy, AlertTriangle, UserCheck, Flame, X } from "lucide-react";
import type { NotificationPriority } from "@gaming-hub/shared";

export const InGameNotificationBanner: React.FC = () => {
  const activeNotification = useMultiplayerStore((s) => s.activeNotification);
  const dismissNotification = useMultiplayerStore((s) => s.dismissNotification);

  if (!activeNotification) return null;

  const getPriorityStyles = (priority: NotificationPriority) => {
    switch (priority) {
      case "HIGH":
        return {
          container: "bg-amber-500/10 dark:bg-amber-500/20 border-amber-500/50 text-amber-900 dark:text-amber-200 shadow-lg shadow-amber-500/10",
          iconBg: "bg-amber-500 text-white",
          icon: <Flame className="w-5 h-5 animate-pulse" />,
        };
      case "MEDIUM":
        return {
          container: "bg-cyan-500/10 dark:bg-cyan-500/20 border-cyan-500/50 text-cyan-900 dark:text-cyan-200 shadow-lg shadow-cyan-500/10",
          iconBg: "bg-cyan-500 text-white",
          icon: <Bell className="w-5 h-5" />,
        };
      case "LOW":
      default:
        return {
          container: "bg-slate-500/10 dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-200 shadow-md",
          iconBg: "bg-slate-500 text-white",
          icon: <Bell className="w-5 h-5" />,
        };
    }
  };

  const getEventIcon = (eventType: string, priority: NotificationPriority) => {
    if (eventType.includes("WIN") || eventType.includes("SETTLEMENT") || eventType.includes("FINISHED")) {
      return <Trophy className="w-5 h-5" />;
    }
    if (eventType.includes("FORFEIT") || eventType.includes("DISCONNECTED")) {
      return <AlertTriangle className="w-5 h-5" />;
    }
    if (eventType.includes("READY") || eventType.includes("RECONNECTED")) {
      return <UserCheck className="w-5 h-5" />;
    }
    return getPriorityStyles(priority).icon;
  };

  const styles = getPriorityStyles(activeNotification.priority);
  const icon = getEventIcon(activeNotification.eventType, activeNotification.priority);

  return (
    <div
      id="in-game-notification-banner"
      role="alert"
      aria-live="polite"
      className="fixed top-20 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4 animate-in fade-in slide-in-from-top-4 duration-300"
    >
      <div
        className={`flex items-center gap-3 p-3.5 rounded-xl border backdrop-blur-md transition-all ${styles.container}`}
      >
        <div className={`p-2 rounded-lg flex-shrink-0 ${styles.iconBg}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold truncate leading-snug">{activeNotification.title}</h4>
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-70 px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 ml-2">
              {activeNotification.priority}
            </span>
          </div>
          <p className="text-xs opacity-90 mt-0.5 leading-relaxed">{activeNotification.message}</p>
        </div>
        <button
          onClick={() => dismissNotification(activeNotification.id)}
          className="p-1 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors opacity-70 hover:opacity-100 flex-shrink-0 ml-1"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
