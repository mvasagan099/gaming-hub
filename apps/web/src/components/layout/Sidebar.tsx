import { Home, Trophy, User, Settings, Wallet, Gift, Ticket, Megaphone, MessageCircle, Swords, LifeBuoy, Bell, Users, Medal, X, Gamepad2 } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useFeatureFlagsStore } from "../../store/featureFlagsStore";

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
  { name: "Coupons", icon: Ticket, path: "/coupons", flag: "content.coupons" },
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
                <div className="w-8 h-8 rounded-xl bg-accent-500/20 text-accent-500 flex items-center justify-center">
                  <Gamepad2 className="w-5 h-5" />
                </div>
                <span className="font-black text-sm text-slate-900 dark:text-white">Navigation</span>
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
            <nav className="flex-1 overflow-y-auto p-3 space-y-1 pb-10">
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
          </div>
        </div>
      )}
    </>
  );
}

