import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '../../utils/cn';
import { isHomePage, goBackOrHome } from '../../utils/navigation';

export interface MobileBackButtonProps {
  /**
   * Optional fallback route if there is no previous in-app history entry.
   * Defaults to '/'.
   */
  fallback?: string;
  /**
   * Optional custom click handler to intercept the back action
   * (e.g., for custom exit confirmation dialogs).
   */
  onClick?: () => void;
  /**
   * Optional additional CSS classes to customize positioning or styling.
   */
  className?: string;
  /**
   * Optional text label (e.g. "Back") shown on slightly wider mobile screens.
   */
  showLabel?: boolean;
}

/**
 * Global Mobile Back Button
 * - Rendered only on mobile/tablet viewports (< 768px).
 * - Automatically hidden on Home route ('/', '/home', '/dashboard').
 * - Respects in-app navigation history with safe fallback to Home ('/').
 * - Styled according to Gaming Hub glassmorphism & purple accent theme.
 */
export const MobileBackButton: React.FC<MobileBackButtonProps> = ({
  fallback = '/',
  onClick,
  className,
  showLabel = false,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Do NOT render on Home or root aliases
  if (isHomePage(location.pathname)) {
    return null;
  }

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (onClick) {
      onClick();
    } else {
      goBackOrHome(navigate, fallback);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Go back"
      title="Go back"
      className={cn(
        'inline-flex items-center justify-center gap-1.5 h-9 min-w-[36px] px-2.5 rounded-xl',
        'bg-slate-100/90 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/90',
        'border border-slate-200/80 dark:border-slate-700/60 shadow-xs',
        'text-slate-700 dark:text-slate-200 hover:text-purple-600 dark:hover:text-purple-400 hover:border-purple-500/50',
        'active:scale-95 transition-all duration-150 shrink-0 cursor-pointer select-none',
        className
      )}
    >
      <ArrowLeft className="w-4 h-4 shrink-0" />
      {showLabel && <span className="text-xs font-semibold">Back</span>}
    </button>
  );
};

export const BackButton = MobileBackButton;
export default MobileBackButton;
