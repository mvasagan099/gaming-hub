import { useState, useRef, useEffect } from "react";
import {
  Bell,
  UserCircle2,
  Sun,
  Moon,
  LogOut,
  Gamepad2,
  Loader2,
  ShieldCheck,
  Menu,
  User,
  ChevronDown,
  Lock,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTheme } from "../../contexts/ThemeProvider";
import { useAuthStore } from "../../store/authStore";
import { useSettingsStore } from "../../store/settingsStore";
import { useMe } from "../../services/api/useMe";
import { Skeleton } from "../Skeleton";

interface NavbarProps {
  onLogoClick?: () => void;
  onMenuClick?: () => void;
}

export default function Navbar({ onLogoClick, onMenuClick }: NavbarProps) {
  const navigate = useNavigate();
  const { theme, setTheme, effectiveTheme } = useTheme();
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const settings = useSettingsStore((s) => s.settings);
  const { me, loading } = useMe();

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const siteName = settings?.general?.siteName || "Gaming Hub";
  const logoUrl = settings?.general?.logoUrl || "";

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [userMenuOpen]);

  const handleSignOut = async () => {
    setUserMenuOpen(false);
    await signOut();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors duration-300">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-2 px-3 sm:px-6">
        {/* Left Brand + Hamburger */}
        <div className="flex items-center gap-2 sm:gap-3">
          {onMenuClick && (
            <button
              onClick={onMenuClick}
              className="md:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Open Navigation Menu"
            >
              <Menu size={22} />
            </button>
          )}

          <button
            onClick={() => {
              if (onLogoClick) onLogoClick();
              else navigate('/');
            }}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
            aria-label={`${siteName} home`}
          >
            {logoUrl ? (
              <img src={logoUrl} alt={siteName} className="w-7 h-7 object-cover rounded-lg" />
            ) : (
              <Gamepad2 className="w-7 h-7 text-accent-500 shrink-0" />
            )}
            <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight truncate max-w-[130px] sm:max-w-none">
              {siteName}
            </h1>
          </button>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 text-slate-500 dark:text-slate-300">
          {session && (
            <button
              onClick={() => navigate('/notifications')}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative"
              aria-label="Notifications"
              title="Notifications"
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
              {((me.user as { role?: string })?.role === "ADMIN") && (
                <button
                  onClick={() => navigate('/admin')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 hover:bg-indigo-500/20 text-indigo-500 dark:text-indigo-400 font-extrabold text-xs transition-colors"
                  title="Admin Dashboard"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span className="hidden sm:inline">Admin</span>
                </button>
              )}

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

              {/* User Profile Pill & Dropdown */}
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border transition-all cursor-pointer select-none ${
                    userMenuOpen
                      ? "border-accent-500 ring-2 ring-accent-500/20 bg-slate-200/70 dark:bg-slate-700/80"
                      : "border-slate-200 dark:border-slate-700 hover:border-accent-500/50"
                  }`}
                  aria-expanded={userMenuOpen}
                  aria-haspopup="true"
                  aria-label="User account menu"
                  title="User Account Menu"
                >
                  <span className="w-6 h-6 rounded-full bg-accent-600 flex items-center justify-center text-[11px] font-black text-white shrink-0 shadow-sm">
                    {me.user.avatarUrl ? (
                      <img src={me.user.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (me.user.displayName || me.user.username || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden sm:flex flex-col items-start leading-tight max-w-[130px]">
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate w-full text-left">
                      {me.user.displayName || me.user.username}
                    </span>
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                      userMenuOpen ? "rotate-180 text-accent-500" : ""
                    }`}
                  />
                </button>

                {/* Dropdown Menu Modal */}
                {userMenuOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 w-72 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-800 shadow-2xl shadow-slate-900/10 dark:shadow-slate-950/50 py-2 z-50 animate-in fade-in zoom-in-95 duration-150"
                    role="menu"
                    aria-orientation="vertical"
                  >
                    {/* User Info Header */}
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800/80">
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-500 to-accent-700 flex items-center justify-center text-sm font-black text-white shadow-md shrink-0">
                          {me.user.avatarUrl ? (
                            <img src={me.user.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (me.user.displayName || me.user.username || "?").slice(0, 1).toUpperCase()}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                            {me.user.displayName || me.user.username}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {me.user.email || me.user.username}
                          </p>
                        </div>
                      </div>

                      {/* Mini balance tag */}
                      <div className="mt-2.5 flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/50 text-xs">
                        <span className="text-slate-500 dark:text-slate-400 font-medium">Balance</span>
                        <span className="font-extrabold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <span>🪙</span>
                          <span>{me.wallet ? me.wallet.balance.toLocaleString() : "0"} coins</span>
                        </span>
                      </div>
                    </div>

                    {/* Navigation Menu Items */}
                    <div className="py-1 px-1.5 space-y-0.5">
                      {/* Profile Option */}
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          navigate("/profile?tab=profile");
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-accent-600 dark:hover:text-accent-400 transition-colors text-left group cursor-pointer"
                        role="menuitem"
                      >
                        <span className="w-8 h-8 rounded-lg bg-accent-500/10 text-accent-600 dark:text-accent-400 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                          <User size={16} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold leading-tight">My Profile</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Personal details & account status</p>
                        </div>
                      </button>

                      {/* Security & Password Option */}
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          navigate("/profile?tab=security");
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors text-left group cursor-pointer"
                        role="menuitem"
                      >
                        <span className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                          <Lock size={16} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold leading-tight">Security & Password</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Password, 2FA & active sessions</p>
                        </div>
                      </button>

                      {/* Theme Toggle Option */}
                      <div className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                            {effectiveTheme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
                          </span>
                          <div>
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 leading-tight">Theme</p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-normal capitalize">
                              {effectiveTheme} mode
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTheme(effectiveTheme === "dark" ? "light" : "dark")}
                          className="px-2.5 py-1 rounded-lg bg-slate-200/70 dark:bg-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:bg-accent-500 hover:text-white dark:hover:bg-accent-500 dark:hover:text-white transition-all cursor-pointer"
                        >
                          Switch to {effectiveTheme === "dark" ? "Light" : "Dark"}
                        </button>
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

                    {/* Logout Option */}
                    <div className="py-1 px-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          void handleSignOut();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors text-left group cursor-pointer"
                        role="menuitem"
                      >
                        <span className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                          <LogOut size={16} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold leading-tight">Log Out</p>
                          <p className="text-[10px] text-rose-400/80 dark:text-rose-400/60 font-normal">Sign out of this session</p>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <Loader2 className="w-5 h-5 animate-spin text-accent-400" />
          )}
        </div>
      </div>
    </header>
  );
}


