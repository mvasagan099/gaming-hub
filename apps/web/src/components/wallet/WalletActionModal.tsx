import React, { useEffect, useId, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

export interface WalletActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  isProcessing?: boolean;
  maxWidth?: "sm" | "md" | "lg";
  children: React.ReactNode;
  footer?: React.ReactNode;
  hideClose?: boolean;
  className?: string;
}

const maxWidthMap = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

export const WalletActionModal: React.FC<WalletActionModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  icon,
  badge,
  isProcessing = false,
  maxWidth = "md",
  children,
  footer,
  hideClose = false,
  className,
}) => {
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // Handle ESC key (disabled if processing)
  useEffect(() => {
    if (!isOpen || isProcessing) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, isProcessing, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
          {/* Backdrop with blur */}
          <motion.div
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-md"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              if (!isProcessing) onClose();
            }}
          />

          {/* Modal Card Panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            className={cn(
              "relative w-full rounded-t-[2.25rem] sm:rounded-[2rem]",
              "bg-slate-900/95 dark:bg-slate-900/95 border border-slate-700/60 dark:border-slate-800",
              "text-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)]",
              "p-6 sm:p-8 max-h-[92dvh] overflow-y-auto outline-none z-10",
              "safe-area-bottom",
              maxWidthMap[maxWidth],
              className
            )}
            initial={
              reduceMotion
                ? false
                : { opacity: 0, scale: 0.96, y: 16 }
            }
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              reduceMotion
                ? undefined
                : { opacity: 0, scale: 0.96, y: 16 }
            }
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Close Button */}
            {!hideClose && !isProcessing && (
              <button
                type="button"
                onClick={onClose}
                className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* Header */}
            {(title || icon || badge) && (
              <div className="flex items-start gap-4 mb-6">
                {icon && (
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 shadow-inner">
                    {icon}
                  </div>
                )}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {title && (
                      <h3 id={titleId} className="text-xl sm:text-2xl font-black text-white tracking-tight">
                        {title}
                      </h3>
                    )}
                    {badge}
                  </div>
                  {description && (
                    <p className="mt-1 text-xs sm:text-sm text-slate-400 leading-relaxed">
                      {description}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Modal Body */}
            <div>{children}</div>

            {/* Footer */}
            {footer && (
              <div className="mt-6 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-end gap-3">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
