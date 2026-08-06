import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, Settings2, ShieldCheck, Trophy, Wallet, MapPin, Banknote, Phone, Gift, Ticket, Megaphone, MessageCircle, Swords, LifeBuoy, Users, Bell, Ban } from "lucide-react";
import { getCountry, getCurrency } from "@gaming-hub/shared";
import { useAuthStore } from "../../store/authStore";
import { useMe } from "../../services/api/useMe";
import { messagesApi } from "../../services/api/enterprise";
import type { BlockedUser } from "@gaming-hub/shared";
import { Skeleton, SkeletonCircle, SkeletonText } from "../../components/Skeleton";

export const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const { me, loading } = useMe();
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [blockedError, setBlockedError] = useState<string | null>(null);

  const loadBlocked = async () => {
    try {
      setBlocked(await messagesApi.blocked());
    } catch {
      setBlocked([]);
    }
  };

  useEffect(() => {
    if (session) void loadBlocked();
  }, [session]);

  const handleUnblock = async (blockedId: string) => {
    setBusyId(blockedId);
    setBlockedError(null);
    try {
      await messagesApi.unblock(blockedId);
      await loadBlocked();
    } catch (err) {
      setBlockedError(err instanceof Error ? err.message : "Failed to unblock user");
    } finally {
      setBusyId(null);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (loading || !me) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-4">
          <SkeletonCircle className="w-24 h-24 mx-auto" />
          <div className="space-y-2">
            <SkeletonText className="w-40 mx-auto h-6" />
            <SkeletonText className="w-24 mx-auto" />
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        </div>
      </div>
    );
  }

  const displayName = me.user.displayName || me.user.username || "Player";
  const avatarUrl = me.user.avatarUrl;
  const balance = me.wallet?.balance ?? 0;
  const stats = me.profile;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-4 transition-colors duration-300">
        <div className="w-24 h-24 rounded-3xl bg-indigo-600/20 border-2 border-indigo-500 flex items-center justify-center text-4xl font-black text-indigo-400 mx-auto shadow-2xl overflow-hidden">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            displayName.slice(0, 1).toUpperCase()
          )}
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">{displayName}</h2>
          <p className="text-xs text-indigo-400 font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 mt-0.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Level {stats?.level ?? 1} Competitor • {me.user.role}
          </p>
          {me.user.email && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{me.user.email}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
            <p className="text-slate-500 dark:text-slate-400 text-xs flex items-center justify-center gap-1">
              <Wallet className="w-3.5 h-3.5" /> Wallet Balance
            </p>
            <p className="text-xl font-black text-amber-400 mt-1">🪙 {balance.toLocaleString()}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
            <p className="text-slate-500 dark:text-slate-400 text-xs">Gems</p>
            <p className="text-xl font-black text-cyan-400 mt-1">💎 {stats?.gems ?? 0}</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 pt-2">
          <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700">
            <p className="text-lg font-black text-emerald-500">{stats?.wins ?? 0}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Wins</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700">
            <p className="text-lg font-black text-rose-500">{stats?.losses ?? 0}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Losses</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700">
            <p className="text-lg font-black text-slate-400">{stats?.draws ?? 0}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Draws</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700">
            <p className="text-lg font-black text-indigo-400">{stats?.xp ?? 0}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">XP</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            to="/settings"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-white transition-colors"
          >
            <Settings2 className="w-4 h-4" /> Settings
          </Link>
          <Link
            to="/leaderboard"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition-colors"
          >
            <Trophy className="w-4 h-4" /> Leaderboard
          </Link>
          <button
            onClick={() => void handleSignOut()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600/10 hover:bg-rose-600 hover:text-white text-xs font-bold text-rose-500 border border-rose-500/40 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </div>

      <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 transition-colors duration-300">
        <h3 className="text-sm font-black text-slate-900 dark:text-white">My stuff</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MenuLink to="/tournaments" icon={<Swords className="w-4 h-4" />} label="Tournaments" />
          <MenuLink to="/messages" icon={<MessageCircle className="w-4 h-4" />} label="Messages" />
          <MenuLink to="/friends" icon={<Users className="w-4 h-4" />} label="Friends" />
          <MenuLink to="/achievements" icon={<Trophy className="w-4 h-4" />} label="Achievements" />
          <MenuLink to="/notifications" icon={<Bell className="w-4 h-4" />} label="Notifications" />
          <MenuLink to="/announcements" icon={<Megaphone className="w-4 h-4" />} label="Announcements" />
          <MenuLink to="/referrals" icon={<Gift className="w-4 h-4" />} label="Referrals" />
          <MenuLink to="/coupons" icon={<Ticket className="w-4 h-4" />} label="Coupons" />
          <MenuLink to="/tickets" icon={<LifeBuoy className="w-4 h-4" />} label="Support" />
        </div>
      </div>

      <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 transition-colors duration-300">
        <h3 className="text-sm font-black text-slate-900 dark:text-white">
          Blocked users <span className="text-slate-400 dark:text-slate-500 font-semibold">({blocked.length})</span>
        </h3>
        {blockedError && (
          <p className="text-xs text-rose-500">{blockedError}</p>
        )}
        {blocked.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            You haven't blocked anyone. Blocked users can't message you.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {blocked.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-3">
                <div className="w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center text-sm font-black text-rose-500 overflow-hidden shrink-0">
                  {b.avatarUrl ? (
                    <img src={b.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (b.displayName || b.username || '?').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{b.displayName}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">@{b.username}</p>
                </div>
                <button
                  onClick={() => void handleUnblock(b.blockedId)}
                  disabled={busyId === b.blockedId}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 text-xs font-bold text-rose-500 transition-colors hover:border-rose-500/50 disabled:opacity-50"
                >
                  <Ban size={12} /> {busyId === b.blockedId ? "Unblocking..." : "Unblock"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {stats && (
        <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 transition-colors duration-300">
          <h3 className="text-sm font-black text-slate-900 dark:text-white">Account details</h3>
          <div className="grid grid-cols-2 gap-4">
            <Detail icon={<MapPin className="w-3.5 h-3.5" />} label="Country" value={stats.country ? getCountry(stats.country)?.name ?? stats.country : "—"} />
            <Detail icon={<Banknote className="w-3.5 h-3.5" />} label="Currency" value={stats.currency ? `${getCurrency(stats.currency)?.symbol ?? ""} ${stats.currency}`.trim() : "—"} />
            <Detail icon={<Phone className="w-3.5 h-3.5" />} label="Phone" value={stats.phone ?? "—"} />
            <Detail icon={<Gift className="w-3.5 h-3.5" />} label="Referral" value={stats.referredBy ?? "—"} />
          </div>
          {stats.dateOfBirth && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              Date of birth: {new Date(stats.dateOfBirth).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {session?.user && (
        <p className="text-center text-[10px] text-slate-400 dark:text-slate-500">
          Member since {new Date(me.user.createdAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
};

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">{label}</p>
        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{value}</p>
      </div>
    </div>
  );
}

function MenuLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3 text-sm font-bold text-slate-800 dark:text-white transition-colors hover:border-accent-500/50"
    >
      <span className="text-accent-500">{icon}</span>
      {label}
    </Link>
  );
}
