import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Award,
  Bell,
  CheckCheck,
  ChevronRight,
  Filter,
  Gift,
  Loader2,
  Medal,
  Megaphone,
  MessageSquare,
  Sparkles,
  Swords,
  Ticket,
  Trash2,
  Trophy,
  UserPlus,
  Wallet,
  XCircle,
} from "lucide-react";
import { notificationsApi, notifyNotificationChanged } from "../../services/api/enterprise";
import type { AppNotification, NotificationType } from "@gaming-hub/shared";
import { Skeleton } from "../../components/Skeleton";
import { Button } from "../../components/ui/Button";

// ─── Helpers ───────────────────────────────────────────────────────────────

const TYPE_ICONS: Partial<Record<NotificationType, React.ComponentType<{ className?: string }>>> = {
  MATCH_INVITE: Swords,
  FRIEND_REQUEST: UserPlus,
  FRIEND_ACCEPTED: UserPlus,
  MATCH_RESULT: Trophy,
  TOURNAMENT: Trophy,
  SYSTEM: Bell,
  REFERRAL: Gift,
  COUPON: Ticket,
  ANNOUNCEMENT: Megaphone,
  MESSAGE: MessageSquare,
  SUPPORT: Ticket,
  PROMOTION: Gift,
  WALLET: Wallet,
  ACHIEVEMENT: Award,
  SYSTEM_ALERT: XCircle,
};

const TYPE_COLORS: Partial<Record<NotificationType, string>> = {
  MATCH_INVITE: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  FRIEND_REQUEST: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  FRIEND_ACCEPTED: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  MATCH_RESULT: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  TOURNAMENT: "text-violet-500 bg-violet-500/10 border-violet-500/20",
  SYSTEM: "text-slate-400 bg-slate-500/10 border-slate-500/20",
  REFERRAL: "text-pink-500 bg-pink-500/10 border-pink-500/20",
  COUPON: "text-orange-500 bg-orange-500/10 border-orange-500/20",
  ANNOUNCEMENT: "text-cyan-500 bg-cyan-500/10 border-cyan-500/20",
  MESSAGE: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  SUPPORT: "text-teal-500 bg-teal-500/10 border-teal-500/20",
  PROMOTION: "text-pink-500 bg-pink-500/10 border-pink-500/20",
  WALLET: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  ACHIEVEMENT: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20",
  SYSTEM_ALERT: "text-rose-500 bg-rose-500/10 border-rose-500/20",
};

/** Formats date into relative human time (e.g., "5m ago", "2h ago") */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (isNaN(date.getTime())) return "";
  if (diffSec < 45) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Determines navigation target based on notification type/data */
function getActionRoute(n: AppNotification): string | null {
  const data = n.data as Record<string, string> | null;
  if (data?.url) return data.url;

  switch (n.type) {
    case "MATCH_INVITE":
    case "MATCH_RESULT":
      return data?.gameId ? `/lobby/${data.gameId}` : "/leaderboard";
    case "FRIEND_REQUEST":
    case "FRIEND_ACCEPTED":
      return "/friends";
    case "TOURNAMENT":
      return "/tournaments";
    case "ACHIEVEMENT":
      return "/achievements";
    case "REFERRAL":
      return "/referrals";
    case "COUPON":
      return "/coupons";
    case "WALLET":
      return "/wallet";
    case "MESSAGE":
      return "/messages";
    case "ANNOUNCEMENT":
      return "/announcements";
    default:
      return null;
  }
}

/** Action label for notification card badge */
function getActionLabel(type: NotificationType): string | null {
  switch (type) {
    case "MATCH_INVITE":
      return "Join Match";
    case "FRIEND_REQUEST":
    case "FRIEND_ACCEPTED":
      return "View Friends";
    case "TOURNAMENT":
      return "View Tournament";
    case "ACHIEVEMENT":
      return "View Badge";
    case "COUPON":
      return "Redeem Coupon";
    case "REFERRAL":
      return "Claim Reward";
    case "WALLET":
      return "Open Wallet";
    case "MESSAGE":
      return "Open Chat";
    default:
      return null;
  }
}

type CategoryFilter = "ALL" | "UNREAD" | "MATCHES" | "SOCIAL" | "REWARDS" | "SYSTEM";

// ─── Component ─────────────────────────────────────────────────────────────

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CategoryFilter>("ALL");

  const load = async (pageNum = 1, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);

    try {
      const [dataPage, countRes] = await Promise.all([
        notificationsApi.list(pageNum, 25),
        notificationsApi.unreadCount(),
      ]);

      if (append) {
        setItems((prev) => [...prev, ...dataPage.items]);
      } else {
        setItems(dataPage.items);
      }
      setTotal(dataPage.total);
      setUnread(countRes.count);
      setPage(pageNum);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  const handleMarkRead = async (n: AppNotification, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (n.readAt) return;

    setBusyId(n.id);
    try {
      await notificationsApi.markRead(n.id);
      setItems((prev) =>
        prev.map((item) =>
          item.id === n.id ? { ...item, readAt: new Date().toISOString() } : item
        )
      );
      setUnread((u) => Math.max(0, u - 1));
      notifyNotificationChanged();
    } catch {
      toast.error("Failed to update notification");
    } finally {
      setBusyId(null);
    }
  };

  const handleNotificationClick = async (n: AppNotification) => {
    if (!n.readAt) {
      await handleMarkRead(n);
    }
    const route = getActionRoute(n);
    if (route) {
      navigate(route);
    }
  };

  const handleMarkAll = async () => {
    try {
      await notificationsApi.markAllRead();
      setItems((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }))
      );
      setUnread(0);
      notifyNotificationChanged();
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Failed to mark all as read");
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setBusyId(id);
    try {
      await notificationsApi.delete(id);
      const target = items.find((n) => n.id === id);
      setItems((prev) => prev.filter((n) => n.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      if (target && !target.readAt) {
        setUnread((u) => Math.max(0, u - 1));
        notifyNotificationChanged();
      }
      toast.success("Notification deleted");
    } catch {
      toast.error("Failed to delete notification");
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteAll = async () => {
    if (items.length === 0) return;
    try {
      await notificationsApi.deleteAll();
      setItems([]);
      setTotal(0);
      setUnread(0);
      notifyNotificationChanged();
      toast.success("Notification history cleared");
    } catch {
      toast.error("Failed to clear notifications");
    }
  };

  // Filter items by active tab
  const filteredItems = items.filter((n) => {
    switch (activeTab) {
      case "UNREAD":
        return !n.readAt;
      case "MATCHES":
        return ["MATCH_INVITE", "MATCH_RESULT", "TOURNAMENT"].includes(n.type);
      case "SOCIAL":
        return ["FRIEND_REQUEST", "FRIEND_ACCEPTED", "MESSAGE"].includes(n.type);
      case "REWARDS":
        return ["REFERRAL", "COUPON", "WALLET", "PROMOTION", "ACHIEVEMENT"].includes(n.type);
      case "SYSTEM":
        return ["SYSTEM", "ANNOUNCEMENT", "SYSTEM_ALERT", "SUPPORT"].includes(n.type);
      default:
        return true;
    }
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            Notifications
            {unread > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500 text-white animate-pulse">
                {unread} new
              </span>
            )}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Stay updated with matches, achievements, friend invites, and rewards.
          </p>
        </div>

        {/* Global Action buttons */}
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <Button variant="outline" size="sm" onClick={() => void handleMarkAll()}>
              <CheckCheck className="h-3.5 w-3.5 mr-1" /> Mark all read
            </Button>
          )}
          {items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleDeleteAll()}
              className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear all
            </Button>
          )}
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar border-b border-slate-200 dark:border-slate-800">
        {[
          { id: "ALL", label: "All", count: total },
          { id: "UNREAD", label: "Unread", count: unread },
          { id: "MATCHES", label: "Matches" },
          { id: "SOCIAL", label: "Social" },
          { id: "REWARDS", label: "Rewards" },
          { id: "SYSTEM", label: "System" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as CategoryFilter)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
              activeTab === tab.id
                ? "bg-accent-500 text-white shadow-md shadow-accent-500/20"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  activeTab === tab.id ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-center text-sm text-rose-500">
          <p className="font-bold">{error}</p>
          <button
            onClick={() => void load(1)}
            className="mt-3 px-4 py-1.5 rounded-xl bg-rose-500 text-white text-xs font-bold"
          >
            Retry
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-12 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3 text-slate-400">
            <Bell className="h-6 w-6" />
          </div>
          <p className="text-base font-black text-slate-900 dark:text-white">
            {activeTab === "UNREAD" ? "No unread notifications" : "No notifications found"}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {activeTab === "UNREAD"
              ? "You've read all your notifications! Check back later for match invites and rewards."
              : "When you receive match invites, rewards, or friend requests, they will show up here."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <ul className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/80 shadow-xl">
            {filteredItems.map((n) => {
              const Icon = TYPE_ICONS[n.type] ?? Bell;
              const route = getActionRoute(n);
              const actionText = getActionLabel(n.type);
              const isUnread = !n.readAt;

              return (
                <li
                  key={n.id}
                  onClick={() => void handleNotificationClick(n)}
                  className={`group relative flex items-start gap-4 px-5 py-4 cursor-pointer transition-all duration-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                    isUnread ? "bg-accent-500/5 dark:bg-accent-500/10" : ""
                  }`}
                >
                  {/* Left Icon with Colored Ring */}
                  <div
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${
                      TYPE_COLORS[n.type] ?? "bg-slate-500/10 text-slate-400 border-slate-500/20"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  {/* Body Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-slate-900 dark:text-white">
                        {n.title}
                      </span>
                      {isUnread && (
                        <span className="h-2 w-2 rounded-full bg-accent-500 animate-pulse" />
                      )}
                      <span className="ml-auto text-[10px] font-bold text-slate-400 shrink-0">
                        {formatRelativeTime(n.createdAt)}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {n.body}
                    </p>

                    {/* Action chip if clickable */}
                    {actionText && (
                      <div className="mt-2.5 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-[10px] font-black text-accent-500 group-hover:text-accent-400 uppercase tracking-wider bg-accent-500/10 px-2.5 py-1 rounded-lg border border-accent-500/20">
                          {actionText} <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Quick Action / Delete Buttons */}
                  <div className="flex items-center gap-1 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    {isUnread && (
                      <button
                        onClick={(e) => void handleMarkRead(n, e)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-accent-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        title="Mark as read"
                      >
                        <CheckCheck className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => void handleDelete(n.id, e)}
                      disabled={busyId === n.id}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                      title="Delete notification"
                    >
                      {busyId === n.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Load More Button */}
          {items.length < total && (
            <div className="text-center pt-4">
              <Button
                variant="outline"
                onClick={() => void load(page + 1, true)}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                  </span>
                ) : (
                  `Load More (${total - items.length} remaining)`
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
