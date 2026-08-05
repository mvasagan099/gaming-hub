import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Sidebar from "../components/layout/Sidebar";
import BottomNav from "../components/layout/BottomNav";
import PageHeader from "../components/layout/PageHeader";
import AnimatedOutlet from "../components/layout/AnimatedOutlet";

export default function MainLayout() {
  const location = useLocation();
  const isGamePage =
    location.pathname.startsWith("/games/") || location.pathname.startsWith("/game/");
  const isLobbyPage = location.pathname.startsWith("/lobby/");
  const hideChrome = isGamePage || isLobbyPage;
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);

  // Auto-collapse sidebar on navigation
  useEffect(() => {
    setIsSidebarExpanded(false);
  }, [location.pathname]);

  return (
    <div className="h-screen w-full overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white flex flex-col transition-colors duration-300">
      <Navbar onLogoClick={() => setIsSidebarExpanded(prev => !prev)} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar isExpanded={isSidebarExpanded} />

        <main className={`flex-1 p-4 flex flex-col ${isGamePage ? "overflow-hidden" : "overflow-y-scroll"} pb-20 md:pb-4`}>
          {!hideChrome && <PageHeader />}
          <AnimatedOutlet />
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
