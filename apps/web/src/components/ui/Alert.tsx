import React from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '../../lib/utils';

type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps {
  variant?: AlertVariant;
  title?: React.ReactNode;
  children?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const config: Record<AlertVariant, { icon: React.ReactNode; classes: string; iconColor: string }> = {
  info: {
    icon: <Info className="w-4 h-4" />,
    classes:
      'bg-accent-500/10 text-accent-700 dark:text-accent-300 ring-1 ring-accent-500/30',
    iconColor: 'text-accent-500',
  },
  success: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    classes:
      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30',
    iconColor: 'text-emerald-500',
  },
  warning: {
    icon: <TriangleAlert className="w-4 h-4" />,
    classes:
      'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30',
    iconColor: 'text-amber-500',
  },
  danger: {
    icon: <AlertCircle className="w-4 h-4" />,
    classes: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/30',
    iconColor: 'text-rose-500',
  },
};

export const Alert: React.FC<AlertProps> = ({
  variant = 'info',
  title,
  children,
  onDismiss,
  className,
}) => {
  const { icon, classes, iconColor } = config[variant];

  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-2xl p-4 text-sm', classes, className)}
    >
      <span className={cn('mt-0.5 shrink-0', iconColor)} aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5 text-xs opacity-90')}>{children}</div>}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 rounded-md p-1 opacity-70 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
