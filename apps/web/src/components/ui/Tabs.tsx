import React, { createContext, useContext, useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '../../lib/utils';

interface TabsContextValue {
  value: string;
  onChange: (value: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tabs components must be used within <Tabs>');
  return ctx;
}

export interface TabsProps {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ value, onChange, children, className }) => {
  const baseId = useId();
  return (
    <TabsContext.Provider value={{ value, onChange, baseId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
};

export const TabsList: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => {
  const { baseId } = useTabsContext();
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      id={`${baseId}-list`}
      className={cn(
        'inline-flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1',
        className
      )}
    >
      {children}
    </div>
  );
};

export const TabsTrigger: React.FC<{
  value: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}> = ({ value, children, className, disabled }) => {
  const { value: current, onChange, baseId } = useTabsContext();
  const active = current === value;

  return (
    <button
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-selected={active}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={active ? 0 : -1}
      disabled={disabled}
      onClick={() => onChange(value)}
      className={cn(
        'relative rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors outline-none',
        active
          ? 'text-slate-900 dark:text-white'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
        disabled && 'opacity-40 pointer-events-none',
        className
      )}
    >
      {active && (
        <motion.span
          layoutId={`tab-active-${baseId}`}
          className="absolute inset-0 rounded-lg bg-white dark:bg-slate-700 shadow-sm"
          transition={{ duration: 0.18, ease: 'easeOut' }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  );
};

export const TabsContent: React.FC<{
  value: string;
  children: React.ReactNode;
  className?: string;
}> = ({ value, children, className }) => {
  const { value: current, baseId } = useTabsContext();
  const reduceMotion = useReducedMotion();

  if (current !== value) return null;

  return (
    <motion.div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
};
