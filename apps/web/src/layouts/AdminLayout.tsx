import type { ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { cn } from '../utils/cn';

const NAV_ITEMS = [
  { path: '/admin', label: 'Overview', exact: true },
  { path: '/admin/users', label: 'Users' },
  { path: '/admin/matches', label: 'Matches' },
  { path: '/admin/rooms', label: 'Rooms' },
  { path: '/admin/tournaments', label: 'Tournaments' },
  { path: '/admin/coupons', label: 'Coupons' },
  { path: '/admin/announcements', label: 'Announcements' },
  { path: '/admin/crm', label: 'Support (CRM)' },
  { path: '/admin/support', label: 'Help Center' },
  { path: '/admin/features', label: 'Feature Flags' },
  { path: '/admin/analytics', label: 'Analytics' },
  { path: '/admin/monitoring', label: 'Monitoring' },
  { path: '/admin/errors', label: 'Error Center' },
  { path: '/admin/automation', label: 'Automation' },
  { path: '/admin/audit', label: 'Audit Logs' },
  { path: '/admin/settings', label: 'Settings' },
];

export function AdminLayout() {
  const location = useLocation();

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r border-border bg-card">
        <div className="flex h-16 items-center border-b border-border px-6">
          <h1 className="text-xl font-bold">Admin Panel</h1>
        </div>
        <nav className="space-y-1 p-4">
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact
              ? location.pathname === item.path
              : location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'block rounded-md px-4 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
