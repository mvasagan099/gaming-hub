import { Home, Trophy, User, Settings, Wallet, Gift, Megaphone, MessageCircle, Swords, LifeBuoy, Bell, Users, Medal, X, Gamepad2, Sun, Moon } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useFeatureFlagsStore } from "../../store/featureFlagsStore";
import { useTheme } from "../../contexts/ThemeProvider";

const menus = [
  { name: "Home", icon: Home, path: "/", flag: null },
  { name: "Leaderboard", icon: Trophy, path: "/leaderboard", flag: "social.leaderboards" },
  { name: "Profile", icon: User, path: "/profile", flag: null },
  { name: "Wallet", icon: Wallet, path: "/wallet", flag: null },
  { name: "Tournaments", icon: Swords, path: "/tournaments", flag: "content.tournaments" },
  { name: "Messages", icon: MessageCircle, path: "/messages", flag: "social.messaging" },
  { name: "Friends", icon: Users, path: "/friends", flag: "social.friends" },
  { name: "Achievements", icon: Medal, path: "/achievements", flag: null },
  { name: "Notifications", icon: Bell, path: "/notifications", flag: null },
  { name: "Announcements", icon: Megaphone, path: "/announcements", flag: "content.announcements" },
  { name: "Referrals", icon: Gift, path: "/referrals", flag: "social.referrals" },
  { name: "Support", icon: LifeBuoy, path: "/tickets", flag: "support.tickets" },
  { name: "Settings", icon: Settings, path: "/settings", flag: null },
];

interface SidebarProps {
  isExpanded: boolean;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export default function Sidebar({ isExpanded, isMobileOpen = false, onCloseMobile }: SidebarProps) {
  const flags = useFeatureFlagsStore((s) => s.flags);
  const { setTheme, effectiveTheme } = useTheme();

  const toggleTheme = () => {
    const nextTheme = effectiveTheme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  };

  const visibleMenus = menus.filter((menu) =>
    menu.flag ? (flags ? flags[menu.flag] !== false : true) : true,
  );

  return (
    <>
      {/* ── 1. Desktop Sidebar ────────────────────────────────────────────── */}
      <aside className={`hidden md:flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-shrink-0 transition-all duration-300 h-full min-h-0 ${isExpanded ? 'w-64' : 'w-20'}`}>
        <nav className={`flex-1 overflow-y-auto space-y-1.5 py-4 ${isExpanded ? 'px-3.5' : 'px-2'}`}>
          {visibleMenus.map((menu) => (
            <NavLink
              key={menu.path}
              to={menu.path}
              className={({ isActive }) =>
                `flex items-center rounded-xl p-3 transition-colors duration-200 ${
                  isActive
                    ? "bg-accent-500 text-white font-bold shadow-sm shadow-accent-500/30"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium"
                } ${isExpanded ? 'gap-3 justify-start' : 'justify-center'}`
              }
              title={!isExpanded ? menu.name : undefined}
            >
              <menu.icon size={20} className="shrink-0" />
              {isExpanded && <span className="text-xs">{menu.name}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Desktop Theme Change Button */}
        <div className={`p-2 border-t border-slate-200 dark:border-slate-800 shrink-0 ${isExpanded ? 'px-3' : 'px-2'}`}>
          <button
            type="button"
            onClick={toggleTheme}
            className={`w-full flex items-center rounded-xl p-3 transition-all duration-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium cursor-pointer ${
              isExpanded ? 'gap-3 justify-between' : 'justify-center'
            }`}
            title={!isExpanded ? `Switch to ${effectiveTheme === 'dark' ? 'Light' : 'Dark'} Mode` : undefined}
            aria-label={`Switch to ${effectiveTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {effectiveTheme === 'dark' ? (
                <Sun size={20} className="shrink-0 text-amber-400" />
              ) : (
                <Moon size={20} className="shrink-0 text-indigo-500" />
              )}
              {isExpanded && (
                <span className="text-xs font-semibold truncate">
                  {effectiveTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                </span>
              )}
            </div>
            {isExpanded && (
              <div className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 shrink-0 ${effectiveTheme === 'dark' ? 'bg-slate-700 justify-end' : 'bg-indigo-500 justify-start'}`}>
                <div className="w-3 h-3 rounded-full bg-white shadow-sm" />
              </div>
            )}
          </button>
        </div>
      </aside>

      {/* ── 2. Mobile Slide-Over Drawer Modal ─────────────────────────────── */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex animate-in fade-in duration-200">
          {/* Backdrop Overlay */}
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobile}
          />

          {/* Drawer Content Panel */}
          <div className="relative w-[280px] max-w-[85vw] h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-300">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <img
                  src="/logo.png"
                  alt="Gaming Hub"
                  className="w-8 h-8 rounded-xl object-contain shadow-sm"
                />
                <span className="font-black text-sm text-slate-900 dark:text-white">Gaming Hub</span>
              </div>
              <button
                onClick={onCloseMobile}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            {/* Menu List */}
            <nav className="flex-1 overflow-y-auto p-3 space-y-1 pb-4">
              {visibleMenus.map((menu) => (
                <NavLink
                  key={menu.path}
                  to={menu.path}
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-3.5 py-3 text-xs font-bold transition-colors ${
                      isActive
                        ? "bg-accent-500 text-white shadow-md shadow-accent-500/30"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`
                  }
                >
                  <menu.icon size={18} className="shrink-0" />
                  <span>{menu.name}</span>
                </NavLink>
              ))}
            </nav>

            {/* Mobile Theme Change Button */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50/60 dark:bg-slate-900/60">
              <button
                type="button"
                onClick={toggleTheme}
                className="w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer shadow-sm active:scale-[0.98]"
                aria-label={`Switch to ${effectiveTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
              >
                <div className="flex items-center gap-2.5">
                  {effectiveTheme === 'dark' ? (
                    <Sun size={18} className="text-amber-400 shrink-0" />
                  ) : (
                    <Moon size={18} className="text-indigo-500 shrink-0" />
                  )}
                  <span>{effectiveTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                </div>
                <div className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 shrink-0 ${effectiveTheme === 'dark' ? 'bg-slate-700 justify-end' : 'bg-indigo-500 justify-start'}`}>
                  <div className="w-3 h-3 rounded-full bg-white shadow-sm" />
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

