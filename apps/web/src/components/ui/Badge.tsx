import React from 'react';
import { cn } from '../../lib/utils';

type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'outline';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:
    'bg-slate-200 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200',
  accent:
    'bg-accent-500/15 text-accent-600 dark:text-accent-400 ring-1 ring-accent-500/30',
  success:
    'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500/30',
  warning:
    'bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-1 ring-amber-500/30',
  danger:
    'bg-rose-500/15 text-rose-700 dark:text-rose-400 ring-1 ring-rose-500/30',
  outline:
    'bg-transparent text-slate-600 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-600',
};

export const Badge: React.FC<BadgeProps> = ({ variant = 'default', className, children, ...props }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
      variantClasses[variant],
      className
    )}
    {...props}
  >
    {children}
  </span>
);
Badge.displayName = 'Badge';
