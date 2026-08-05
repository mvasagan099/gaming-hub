import React from 'react';
import { cn } from '../../lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const textareaId =
      id || (label ? `textarea-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={textareaId} className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          aria-invalid={error ? true : undefined}
          className={cn(
            'w-full bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100',
            'rounded-xl border border-slate-300 dark:border-slate-700 px-3.5 py-2.5 min-h-24 resize-y',
            'placeholder:text-slate-400 dark:placeholder:text-slate-500',
            'focus:outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25',
            error && 'border-rose-500 focus:border-rose-500 focus:ring-rose-500/25',
            className
          )}
          {...props}
        />
        {error ? (
          <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
        ) : hint ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
        ) : null}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
