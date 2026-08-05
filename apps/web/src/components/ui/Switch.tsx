import React from 'react';
import { cn } from '../../lib/utils';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onCheckedChange,
  id,
  disabled,
  ...props
}) => (
  <button
    id={id}
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onCheckedChange(!checked)}
    className={cn(
      'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 outline-none',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500',
      checked ? 'bg-accent-500' : 'bg-slate-300 dark:bg-slate-700',
      disabled && 'opacity-40 pointer-events-none'
    )}
    {...props}
  >
    <span
      className={cn(
        'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
        checked && 'translate-x-5'
      )}
    />
  </button>
);
