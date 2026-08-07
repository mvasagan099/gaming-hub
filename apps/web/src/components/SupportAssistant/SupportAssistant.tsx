import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle, MessageCircle, X, Minimize2, Maximize2 } from "lucide-react";
import { useSupportStore } from "../../store/supportStore";
import { useLocation } from "react-router-dom";
import { useTheme } from "../../contexts/ThemeProvider";
import { SupportPanel } from "./SupportPanel";
import { supportApi } from "../../services/api/support";
import { cn } from "../../utils/cn";

export function SupportAssistant() {
  const {
    isOpen,
    isMinimized,
    hasUnread,
    currentPage,
    setCurrentPage,
    setPageContent,
    setCategories,
    setSupportedPages,
    setLoading,
    setError,
    open,
    close,
    toggle,
    minimize,
    maximize,
    setHasUnread,
  } = useSupportStore();

  const location = useLocation();
  const { effectiveTheme } = useTheme();

  // Track current page and load content
  useEffect(() => {
    const pageRoute = location.pathname;
    if (pageRoute !== currentPage) {
      setCurrentPage(pageRoute);
      loadPageContent(pageRoute);
    }
  }, [location.pathname, currentPage, setCurrentPage]);

  // Load initial data
  useEffect(() => {
    loadCategories();
    loadSupportedPages();
  }, []);

  async function loadPageContent(pageRoute: string) {
    setLoading(true);
    setError(null);
    try {
      const content = await supportApi.getPageContent(pageRoute);
      setPageContent(content);
    } catch (err) {
      console.error("Failed to load support content:", err);
      setError("Failed to load support content");
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories() {
    try {
      const categories = await supportApi.listCategories();
      setCategories(categories);
    } catch (err) {
      console.error("Failed to load categories:", err);
    }
  }

  async function loadSupportedPages() {
    try {
      const pages = await supportApi.getSupportedPages();
      setSupportedPages(pages);
    } catch (err) {
      console.error("Failed to load supported pages:", err);
    }
  }

  const fabVariants = {
    initial: { scale: 0, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0, opacity: 0 },
  };

  const panelVariants = {
    initial: { opacity: 0, y: 20, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 20, scale: 0.95 },
  };

  return (
    <>
      {/* Floating Action Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            variants={fabVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={open}
            className={cn(
              "fixed bottom-4 right-4 z-[100] flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300",
              "hover:scale-110 hover:shadow-xl active:scale-95",
              effectiveTheme === "dark"
                ? "bg-accent-500 text-white shadow-accent-500/30"
                : "bg-indigo-600 text-white shadow-indigo-600/30"
            )}
            aria-label="Open support assistant"
          >
            {hasUnread ? (
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex h-4 w-4 rounded-full bg-rose-500"></span>
              </span>
            ) : null}
            <HelpCircle className="h-6 w-6" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Support Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            variants={panelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={cn(
              "fixed z-[100] flex flex-col overflow-hidden rounded-2xl shadow-2xl",
              isMinimized
                ? "bottom-4 right-4 h-14 w-72"
                : "bottom-4 right-4 h-[600px] w-full max-w-[400px] sm:h-[650px]",
              effectiveTheme === "dark"
                ? "bg-slate-900 border border-slate-800"
                : "bg-white border border-slate-200"
            )}
          >
            {/* Header */}
            <div
              className={cn(
                "flex h-14 shrink-0 items-center justify-between px-4",
                effectiveTheme === "dark"
                  ? "border-b border-slate-800 bg-slate-900/95"
                  : "border-b border-slate-200 bg-white/95"
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full",
                    effectiveTheme === "dark" ? "bg-accent-500/20 text-accent-400" : "bg-indigo-100 text-indigo-600"
                  )}
                >
                  <MessageCircle className="h-4 w-4" />
                </div>
                <span
                  className={cn(
                    "font-semibold",
                    effectiveTheme === "dark" ? "text-slate-100" : "text-slate-900"
                  )}
                >
                  {isMinimized ? "Help Center" : "Support Assistant"}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {isMinimized ? (
                  <button
                    onClick={maximize}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                      effectiveTheme === "dark"
                        ? "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    )}
                    aria-label="Maximize"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={minimize}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                      effectiveTheme === "dark"
                        ? "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    )}
                    aria-label="Minimize"
                  >
                    <Minimize2 className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={close}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                    effectiveTheme === "dark"
                      ? "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  )}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Panel Content */}
            {!isMinimized && <SupportPanel />}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
