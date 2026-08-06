import { Home, Trophy, User, Settings, Wallet, Gift, Ticket, Megaphone, MessageCircle, Swords, LifeBuoy, Bell, Users, Medal } from "lucide-react";
import { NavLink } from "react-router-dom";

const menus = [
  { name: "Home", icon: Home, path: "/" },
  { name: "Leaderboard", icon: Trophy, path: "/leaderboard" },
  { name: "Profile", icon: User, path: "/profile" },
  { name: "Wallet", icon: Wallet, path: "/wallet" },
  { name: "Tournaments", icon: Swords, path: "/tournaments" },
  { name: "Messages", icon: MessageCircle, path: "/messages" },
  { name: "Friends", icon: Users, path: "/friends" },
  { name: "Achievements", icon: Medal, path: "/achievements" },
  { name: "Notifications", icon: Bell, path: "/notifications" },
  { name: "Announcements", icon: Megaphone, path: "/announcements" },
  { name: "Referrals", icon: Gift, path: "/referrals" },
  { name: "Coupons", icon: Ticket, path: "/coupons" },
  { name: "Support", icon: LifeBuoy, path: "/tickets" },
  { name: "Settings", icon: Settings, path: "/settings" },
];

interface SidebarProps {
  isExpanded: boolean;
}

export default function Sidebar({ isExpanded }: SidebarProps) {
  return (
    <aside className={`hidden md:flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-shrink-0 transition-all duration-300 overflow-y-auto h-full ${isExpanded ? 'w-64' : 'w-20'}`}>

      <nav className={`space-y-2 py-6 ${isExpanded ? 'px-4' : 'px-2'}`}>

        {menus.map((menu) => (
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
