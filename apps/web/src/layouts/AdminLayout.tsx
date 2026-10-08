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
  Coins,
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
  Smartphone,
  Menu,
} from 'lucide-react';
import { cn } from '../utils/cn';
import { useTheme } from '../contexts/ThemeProvider';
import { useMe } from '../services/api/useMe';
import { useFeatureFlagsStore } from '../store/featureFlagsStore';
import { openMfaModal } from '../components/auth/MfaVerificationModal';
import { MobileBackButton } from '../components/layout/MobileBackButton';
import { useEffect, useState, useMemo } from 'react';
import { hasPermission, type Permission, type DbUserRole } from '@gaming-hub/shared';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  permission?: Permission;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'OVERVIEW',
    items: [
      { path: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
      { path: '/admin/analytics', label: 'Analytics', icon: BarChart3, permission: 'admin:analytics:view' },
      { path: '/admin/monitoring', label: 'Monitoring', icon: Activity, permission: 'admin:monitoring:view' },
    ],
  },
  {
    title: 'MANAGEMENT',
    items: [
      { path: '/admin/users', label: 'Users', icon: Users, permission: 'admin:users:view' },
      { path: '/admin/kyc', label: 'KYC Verification', icon: FileCheck, permission: 'admin:kyc:view' },
      { path: '/admin/roles', label: 'Roles & Permissions', icon: Shield, permission: 'admin:roles:view' },
      { path: '/admin/games', label: 'Games Management', icon: Gamepad2, permission: 'admin:games:view' },
      { path: '/admin/matches', label: 'Matches', icon: Swords, permission: 'admin:matches:view' },
      { path: '/admin/rooms', label: 'Rooms', icon: Gamepad2, permission: 'admin:rooms:view' },
      { path: '/admin/tournaments', label: 'Tournaments', icon: Trophy, permission: 'admin:tournaments:view' },
      { path: '/admin/features', label: 'Feature Flags', icon: Flag, permission: 'admin:features:view' },
    ],
  },
  {
    title: 'MARKETING & SUPPORT',
    items: [
      { path: '/admin/affiliates', label: 'Affiliates', icon: Coins, permission: 'admin:referrals:view' },
      { path: '/admin/coupons', label: 'Coupons', icon: Ticket, permission: 'admin:coupons:view' },
      { path: '/admin/announcements', label: 'Announcements', icon: Megaphone, permission: 'admin:announcements:view' },
      { path: '/admin/crm', label: 'Support CRM', icon: Headset, permission: 'admin:crm:view' },
      { path: '/admin/support', label: 'Help Center', icon: HelpCircle, permission: 'admin:crm:view' },
    ],
  },
  {
    title: 'SYSTEM & LOGS',
    items: [
      { path: '/admin/errors', label: 'Error Center', icon: AlertTriangle, permission: 'admin:errors:view' },
      { path: '/admin/automation', label: 'Automation', icon: Cpu, permission: 'admin:automation:view' },
      { path: '/admin/audit', label: 'Audit Logs', icon: History, permission: 'admin:audit:view' },
      { path: '/admin/settings', label: 'Settings', icon: Settings, permission: 'admin:settings:view' },
      { path: '/admin/app-version', label: 'App Version', icon: Smartphone, permission: 'admin:settings:view' },
    ],
  },
];

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { effectiveTheme, setTheme } = useTheme();
  const { me, reload } = useMe();
  const loadFlags = useFeatureFlagsStore((s) => s.loadFlags);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    void loadFlags();
  }, [loadFlags]);

  useEffect(() => {
    const onMfaVerified = () => {
      reload();
    };
    window.addEventListener('gaming-hub:mfa-verified', onMfaVerified);
    return () => window.removeEventListener('gaming-hub:mfa-verified', onMfaVerified);
  }, [reload]);

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  const userRole = (me?.user?.role as DbUserRole) || 'USER';
  const customPermissions = (me as unknown as { customPermissions?: Permission[] })?.customPermissions || [];

  const filteredGroups = useMemo(() => {
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!item.permission || userRole === 'ADMIN') return true;
        return hasPermission(userRole, item.permission, customPermissions);
      }),
    })).filter((group) => group.items.length > 0);
  }, [userRole, customPermissions]);

  const allItems = filteredGroups.flatMap((g) => g.items);
  const currentItem = allItems.find((n) =>
    n.exact ? location.pathname === n.path : location.pathname.startsWith(n.path),
  );

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300">
      {/* Desktop Sidebar (lg+) */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 backdrop-blur-md shrink-0">
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="Gaming Hub"
              className="w-9 h-9 rounded-xl object-contain shadow-md shadow-indigo-500/20"
            />
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
          {filteredGroups.map((group) => (
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
                {me?.user.displayName || me?.user.username || 'Admin'}
              </div>
              {me?.user.username && (
                <div className="text-[10px] font-semibold text-indigo-400 truncate">
                  {me.user.username.startsWith('@') ? me.user.username : `@${me.user.username}`}
                </div>
              )}
              <div className="text-[10px] font-extrabold text-emerald-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {userRole === 'ADMIN' ? 'Super Admin' : userRole === 'MODERATOR' ? 'Moderator' : 'Staff'}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Slide-Over Drawer (lg:hidden) */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex animate-in fade-in duration-200">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setIsMobileOpen(false)}
          />
          <div className="relative w-[280px] max-w-[85vw] h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-300">
            <div className="h-16 flex items-center justify-between px-5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <span className="text-sm font-black text-slate-900 dark:text-white">Admin Suite</span>
              </div>
              <button
                onClick={() => setIsMobileOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                ✕
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
              {filteredGroups.map((group) => (
                <div key={group.title} className="space-y-1">
                  <div className="px-3 text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
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
                        onClick={() => setIsMobileOpen(false)}
                        className={cn(
                          'flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all',
                          isActive
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between shrink-0">
          {/* Breadcrumbs & Mobile Menu Trigger */}
          <div className="flex items-center gap-2.5">
            <MobileBackButton fallback="/" />
            <button
              onClick={() => setIsMobileOpen(true)}
              className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Open Admin Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
              <Link to="/admin" className="hover:text-indigo-500 transition-colors">Admin</Link>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-900 dark:text-white truncate max-w-[120px] sm:max-w-none">
                {currentItem?.label || 'Dashboard'}
              </span>
            </div>
          </div>

          {/* Controls Right */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Quick Search Input */}
            <div className="hidden md:flex items-center w-56 lg:w-64 rounded-xl bg-slate-100 dark:bg-slate-800/80 px-3.5 py-1.5 border border-slate-200 dark:border-slate-700/60">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                placeholder="Quick search admin..."
                className="ml-2.5 w-full bg-transparent outline-none text-xs text-slate-900 dark:text-white placeholder-slate-400"
              />
            </div>

            {/* Health status pill */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Healthy</span>
            </div>

            {/* 2FA Session Status Pill / Action */}
            {me?.mfaVerified ? (
              <div
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold"
                title="Two-factor authentication session is active"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>2FA Active</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => openMfaModal('Authenticate your admin session with 2FA to authorize privileged actions.')}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 text-xs font-bold transition-all shadow-sm"
                title="Click to verify your 2FA security session"
              >
                <Shield className="w-3.5 h-3.5 text-amber-500" />
                <span>Verify 2FA</span>
              </button>
            )}

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
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-slate-50 dark:bg-slate-950">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
