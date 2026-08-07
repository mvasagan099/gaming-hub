import { Home, Trophy, User, Settings, Wallet, Gift, Ticket, Megaphone, MessageCircle, Swords, LifeBuoy, Bell, Users, Medal } from "lucide-react";
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
}

export default function Sidebar({ isExpanded }: SidebarProps) {
  const flags = useFeatureFlagsStore((s) => s.flags);
  const visibleMenus = menus.filter((menu) =>
    menu.flag ? (flags ? flags[menu.flag] !== false : true) : true,
  );

  return (
    <aside className={`hidden md:flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-shrink-0 transition-all duration-300 h-full min-h-0 ${isExpanded ? 'w-64' : 'w-20'}`}>

      <nav className={`flex-1 overflow-y-auto space-y-2 py-6 ${isExpanded ? 'px-4' : 'px-2'}`}>

        {visibleMenus.map((menu) => (
          <NavLink
            key={menu.path}
            to={menu.path}
            className={({ isActive }) =>
              `flex items-center rounded-lg p-3 transition-colors duration-300 ${
                isActive
                  ? "bg-accent-500 text-white font-bold shadow-sm shadow-accent-500/30"
                  : "hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              } ${isExpanded ? 'gap-3 justify-start' : 'justify-center'}`
            }
            title={!isExpanded ? menu.name : undefined}
          >
            <menu.icon size={20} className="shrink-0" />
            {isExpanded && <span>{menu.name}</span>}
          </NavLink>
        ))}

      </nav>

    </aside>
  );
}
