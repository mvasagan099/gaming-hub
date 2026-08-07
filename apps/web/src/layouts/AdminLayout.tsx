import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Shield,
  FileCheck,
  Swords,
  Gamepad2,
  Trophy,
  Ticket,
  Megaphone,
  Headset,
  HelpCircle,
  Flag,
  BarChart3,
  Activity,
  AlertTriangle,
  Cpu,
  History,
  Settings,
  ArrowLeft,
  Sun,
  Moon,
  ShieldCheck,
  Search,
  ChevronRight,
  Bell,
} from 'lucide-react';
import { cn } from '../utils/cn';
import { useTheme } from '../contexts/ThemeProvider';
import { useMe } from '../services/api/useMe';
import { useFeatureFlagsStore } from '../store/featureFlagsStore';
import { useEffect } from 'react';

const NAV_GROUPS = [
  {
    title: 'OVERVIEW',
    items: [
      { path: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
      { path: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
      { path: '/admin/monitoring', label: 'Monitoring', icon: Activity },
    ],
  },
  {
    title: 'MANAGEMENT',
    items: [
      { path: '/admin/users', label: 'Users', icon: Users },
      { path: '/admin/kyc', label: 'KYC Verification', icon: FileCheck },
      { path: '/admin/roles', label: 'Roles & Permissions', icon: Shield },
      { path: '/admin/matches', label: 'Matches', icon: Swords },
      { path: '/admin/rooms', label: 'Rooms', icon: Gamepad2 },
      { path: '/admin/tournaments', label: 'Tournaments', icon: Trophy },
      { path: '/admin/features', label: 'Feature Flags', icon: Flag },
    ],
  },
  {
    title: 'MARKETING & SUPPORT',
    items: [
      { path: '/admin/coupons', label: 'Coupons', icon: Ticket },
      { path: '/admin/announcements', label: 'Announcements', icon: Megaphone },
      { path: '/admin/crm', label: 'Support CRM', icon: Headset },
      { path: '/admin/support', label: 'Help Center', icon: HelpCircle },
    ],
  },
  {
    title: 'SYSTEM & LOGS',
    items: [
      { path: '/admin/errors', label: 'Error Center', icon: AlertTriangle },
      { path: '/admin/automation', label: 'Automation', icon: Cpu },
      { path: '/admin/audit', label: 'Audit Logs', icon: History },
      { path: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { effectiveTheme, setTheme } = useTheme();
  const { me } = useMe();
  const loadFlags = useFeatureFlagsStore((s) => s.loadFlags);

  useEffect(() => {
    void loadFlags();
  }, [loadFlags]);

  const allItems = NAV_GROUPS.flatMap((g) => g.items);
  const currentItem = allItems.find((n) =>
    n.exact ? location.pathname === n.path : location.pathname.startsWith(n.path),
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300">
      {/* Sidebar */}
      <aside className="w-64 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 backdrop-blur-md shrink-0">
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-slate-900 dark:text-white leading-none">
                Gaming Hub
              </h1>
              <span className="text-[10px] font-extrabold tracking-wider text-indigo-500 uppercase">
                ADMIN SUITE
              </span>
            </div>
          </div>
        </div>

        {/* Back to App Link */}
        <div className="p-3 border-b border-slate-200/60 dark:border-slate-800/60">
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-all group"
          >
            <ArrowLeft className="w-4 h-4 text-indigo-500 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to Gaming Hub</span>
          </button>
        </div>

        {/* Nav Links Grouped */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 custom-scrollbar">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="space-y-1">
              <div className="px-3 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                {group.title}
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.exact
                  ? location.pathname === item.path
                  : location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      'flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all duration-200 group',
                      isActive
                        ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-600/25'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white',
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        className={cn(
                          'w-4 h-4 transition-colors',
                          isActive
                            ? 'text-white'
                            : 'text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200',
                        )}
                      />
                      <span>{item.label}</span>
                    </div>
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Sidebar Footer User Info */}
        <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-black text-xs flex items-center justify-center shrink-0 shadow-sm">
              {(me?.user.displayName || me?.user.username || 'A').slice(0, 1).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {me?.user.displayName || me?.user.username || 'mvasagan099'}
              </div>
              <div className="text-[10px] font-extrabold text-emerald-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Super Admin
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-6 flex items-center justify-between shrink-0">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
            <Link to="/admin" className="hover:text-indigo-500 transition-colors">Admin</Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-900 dark:text-white">{currentItem?.label || 'Dashboard'}</span>
          </div>

          {/* Controls Right */}
          <div className="flex items-center gap-3">
            {/* Quick Search Input */}
            <div className="hidden md:flex items-center w-64 rounded-xl bg-slate-100 dark:bg-slate-800/80 px-3.5 py-1.5 border border-slate-200 dark:border-slate-700/60">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                placeholder="Quick search admin..."
                className="ml-2.5 w-full bg-transparent outline-none text-xs text-slate-900 dark:text-white placeholder-slate-400"
              />
            </div>

            {/* Health status pill */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>System Healthy</span>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={() => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
              title="Toggle Theme"
            >
              {effectiveTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Body View */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50 dark:bg-slate-950">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
