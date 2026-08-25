import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Sidebar from "../components/layout/Sidebar";
import BottomNav from "../components/layout/BottomNav";
import PageHeader from "../components/layout/PageHeader";
import AnimatedOutlet from "../components/layout/AnimatedOutlet";
import { SupportAssistant } from "../components/SupportAssistant";
import { MatchmakingSearchModal } from "../components/Matchmaking/MatchmakingSearchModal";
import { MatchFoundModal } from "../components/Matchmaking/MatchFoundModal";
import { useFeatureFlagsStore } from "../store/featureFlagsStore";
import { useMe } from "../services/api/useMe";

function MaintenanceScreen() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <div className="flex flex-col items-center justify-center text-center p-10 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/60 max-w-md">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-2xl mb-4">
          🔧
        </div>
        <h3 className="text-base font-black text-slate-900 dark:text-white">We&apos;re under maintenance</h3>
        <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
          The platform is temporarily offline for scheduled maintenance. Please check back soon.
        </p>
      </div>
    </div>
  );
}

export default function MainLayout() {
  const location = useLocation();
  const isGamePage =
    location.pathname.startsWith("/games/") || location.pathname.startsWith("/game/");
  const isLobbyPage = location.pathname.startsWith("/lobby/");
  const hideChrome = isGamePage || isLobbyPage;
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const flags = useFeatureFlagsStore((s) => s.flags);
  const loadFlags = useFeatureFlagsStore((s) => s.loadFlags);
  const { me } = useMe();

  useEffect(() => {
    void loadFlags();
  }, [loadFlags]);

  // Auto-collapse sidebar & mobile drawer on navigation
  useEffect(() => {
    setIsSidebarExpanded(false);
    setIsMobileDrawerOpen(false);
  }, [location.pathname]);

  const isAdmin = me?.user.role === "ADMIN";
  const isMaintenance = flags ? flags["infra.maintenance"] === true : false;
  if (isMaintenance && !isAdmin) {
    return <MaintenanceScreen />;
  }

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white flex flex-col transition-colors duration-300">
      <Navbar
        onLogoClick={() => setIsSidebarExpanded((prev) => !prev)}
        onMenuClick={() => setIsMobileDrawerOpen(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          isExpanded={isSidebarExpanded}
          isMobileOpen={isMobileDrawerOpen}
          onCloseMobile={() => setIsMobileDrawerOpen(false)}
        />

        <main className={`flex-1 p-3 sm:p-4 flex flex-col ${isGamePage ? "overflow-hidden" : "overflow-y-auto"} pb-20 md:pb-4`}>
          {!hideChrome && <PageHeader />}
          <AnimatedOutlet />
        </main>
      </div>

      <BottomNav onMoreClick={() => setIsMobileDrawerOpen(true)} />
      
      {/* Support Assistant - Available on all pages */}
      <SupportAssistant />

      {/* Global Multiplayer Matchmaking Modals */}
      <MatchmakingSearchModal />
      <MatchFoundModal />
    </div>
  );
}
