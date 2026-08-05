import { Search, Bell, UserCircle2, Sun, Moon, Contrast, LogOut, Gamepad2, Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTheme } from "../../contexts/ThemeProvider";
import { useAuthStore } from "../../store/authStore";
import { useUIStore } from "../../store/uiStore";
import { useMe } from "../../services/api/useMe";
import { Skeleton } from "../Skeleton";

interface NavbarProps {
  onLogoClick?: () => void;
}

export default function Navbar({ onLogoClick }: NavbarProps) {
  const navigate = useNavigate();
  const { theme, setTheme, effectiveTheme, contrast, setContrast } = useTheme();
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const { me, loading } = useMe();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors duration-300">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <button
          onClick={() => {
            if (onLogoClick) onLogoClick();
            else navigate('/');
          }}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          aria-label="Gaming Hub home"
        >
          <Gamepad2 className="w-7 h-7 text-accent-500" />
          <h1 className="hidden sm:block text-xl font-bold text-slate-900 dark:text-white transition-colors duration-300">
            Gaming Hub
          </h1>
        </button>

        <div className="hidden md:flex items-center w-72 lg:w-96 rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-2 border border-slate-200 dark:border-slate-700/50 transition-colors duration-300">
          <Search size={18} className="text-slate-400" />
          <input
            placeholder="Search games..."
            className="ml-3 w-full bg-transparent outline-none text-xs text-slate-900 dark:text-white placeholder-slate-400"
            onChange={(e) => navigate(`/?search=${encodeURIComponent(e.target.value)}`)}
            aria-label="Search games"
          />
        </div>

        <div className="flex items-center gap-2 sm:gap-3 text-slate-500 dark:text-slate-300">
          <button
            onClick={() => setPaletteOpen(true)}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Search everything (Ctrl K)"
            title="Search (Ctrl K)"
          >
            <Search size={20} />
          </button>

          <button
            onClick={() => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label={`Switch to ${effectiveTheme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Theme: ${theme} (${effectiveTheme})`}
          >
            {effectiveTheme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          <button
            onClick={() => setContrast(contrast === 'high' ? 'normal' : 'high')}
            className={`p-2 rounded-full transition-colors ${
              contrast === 'high'
                ? "bg-accent-500/15 text-accent-500"
                : "hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
            aria-label={`High contrast ${contrast === 'high' ? 'off' : 'on'}`}
            aria-pressed={contrast === 'high'}
            title="Toggle high contrast"
          >
            <Contrast size={20} />
          </button>

          {session && (
            <button
              onClick={() => navigate('/profile')}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative"
              aria-label="Notifications"
              title="View profile"
            >
              <Bell size={20} />
              {me && me.unreadNotifications > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {me.unreadNotifications > 9 ? "9+" : me.unreadNotifications}
                </span>
              )}
            </button>
          )}

          {!session ? (
            <Link
              to="/login"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-500 hover:bg-accent-600 text-white text-xs font-bold transition-colors"
            >
              <UserCircle2 size={18} />
              Sign in
            </Link>
          ) : loading ? (
            <div className="flex items-center gap-2">
              <Skeleton className="w-16 h-6" />
              <Skeleton className="w-8 h-8 rounded-full" />
            </div>
          ) : me ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/wallet')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 hover:border-amber-500/50 transition-colors"
                title="Wallet"
              >
                <span className="text-xs font-semibold text-amber-500">🪙</span>
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                  {me.wallet ? me.wallet.balance.toLocaleString() : "…"}
                </span>
              </button>
              <button
                onClick={() => navigate('/profile')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-accent-500/50 transition-colors"
                title="Profile"
              >
                <span className="w-6 h-6 rounded-full bg-accent-600 flex items-center justify-center text-[11px] font-black text-white">
                  {me.user.avatarUrl ? (
                    <img src={me.user.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (me.user.displayName || me.user.username || "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden sm:flex flex-col items-start leading-tight">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {me.user.displayName || me.user.username}
                  </span>
                </span>
              </button>
              <button
                onClick={() => void handleSignOut()}
                className="p-2 rounded-full hover:bg-rose-100 dark:hover:bg-rose-500/10 text-slate-500 dark:text-slate-300 hover:text-rose-500 transition-colors"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <Loader2 className="w-5 h-5 animate-spin text-accent-400" />
          )}
        </div>
      </div>
    </header>
  );
}
