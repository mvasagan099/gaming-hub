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
              "fixed bottom-20 right-4 md:bottom-6 md:right-6 z-[100] flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300",
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
              "fixed z-[100] flex flex-col overflow-hidden rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-800 transition-all duration-300",
              isMinimized
                ? "bottom-20 right-4 md:bottom-6 md:right-6 h-14 w-72"
                : "bottom-20 right-4 md:bottom-6 md:right-6 h-[calc(100vh-8rem)] max-h-[620px] w-[calc(100vw-2rem)] sm:w-[420px]",
              effectiveTheme === "dark" ? "bg-slate-900" : "bg-white"
            )}
          >
            {/* Header */}
            <div className="flex h-14 shrink-0 items-center justify-between px-5 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white border-b border-indigo-700/40">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300">
                  <MessageCircle className="h-4 w-4 text-indigo-300" />
                </div>
                <span className="font-extrabold text-sm tracking-tight text-white">
                  {isMinimized ? "Help Center" : "Support Assistant"}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {isMinimized ? (
                  <button
                    onClick={maximize}
                    className="flex h-8 w-8 items-center justify-center rounded-xl text-indigo-200 hover:bg-white/10 hover:text-white transition-colors"
                    aria-label="Maximize"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={minimize}
                    className="flex h-8 w-8 items-center justify-center rounded-xl text-indigo-200 hover:bg-white/10 hover:text-white transition-colors"
                    aria-label="Minimize"
                  >
                    <Minimize2 className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={close}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-indigo-200 hover:bg-white/10 hover:text-white transition-colors"
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
