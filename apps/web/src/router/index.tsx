import { createBrowserRouter } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import MainLayout from "../layouts/MainLayout";
import { AdminLayout } from "../layouts/AdminLayout";
import { LobbyPage } from "../pages/Lobby/LobbyPage";
import NotFoundPage from "../pages/NotFoundPage";
import { ErrorPage } from "../pages/ErrorPage";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { PublicOnlyRoute } from "../components/auth/PublicOnlyRoute";
import { AdminRoute } from "../components/admin/AdminRoute";

// Route-level code splitting: heavy pages (Phaser games, chess.js) load on
// demand instead of inflating the initial bundle.
const HomePage = lazy(() => import("../pages/Home/Home").then((m) => ({ default: m.Home })));
const GamePage = lazy(() => import("../pages/Games/GamePage").then((m) => ({ default: m.GamePage })));
const ProfilePage = lazy(() => import("../pages/Profile/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const LeaderboardPage = lazy(() => import("../components/LeaderboardView").then((m) => ({ default: m.LeaderboardView })));
const SettingsPage = lazy(() => import("../pages/Settings/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const WalletPage = lazy(() => import("../pages/Wallet/WalletPage").then((m) => ({ default: m.WalletPage })));
const LoginPage = lazy(() => import("../pages/Auth/LoginPage").then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import("../pages/Auth/SignupPage").then((m) => ({ default: m.SignupPage })));
const ForgotPasswordPage = lazy(() => import("../pages/Auth/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("../pages/Auth/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })));
const AdminOverviewPage = lazy(() => import("../pages/admin/AdminOverviewPage").then((m) => ({ default: m.AdminOverviewPage })));
const AdminUsersPage = lazy(() => import("../pages/admin/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })));
const AdminMatchesPage = lazy(() => import("../pages/admin/AdminMatchesPage").then((m) => ({ default: m.AdminMatchesPage })));
const AdminRoomsPage = lazy(() => import("../pages/admin/AdminRoomsPage").then((m) => ({ default: m.AdminRoomsPage })));
const AdminAuditPage = lazy(() => import("../pages/admin/AdminAuditPage").then((m) => ({ default: m.AdminAuditPage })));
const AdminSettingsPage = lazy(() => import("../pages/admin/AdminSettingsPage").then((m) => ({ default: m.AdminSettingsPage })));

const SuspensePage = ({ children }: { children: ReactNode }) => (
  <Suspense
    fallback={
      <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Loading">
        <div className="size-8 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
      </div>
    }
  >
    {children}
  </Suspense>
);

export const router = createBrowserRouter([
  {
    element: <PublicOnlyRoute />,
    errorElement: <ErrorPage />,
    children: [
      { path: "/login", element: <SuspensePage><LoginPage /></SuspensePage> },
      { path: "/signup", element: <SuspensePage><SignupPage /></SuspensePage> },
      { path: "/forgot-password", element: <SuspensePage><ForgotPasswordPage /></SuspensePage> },
      { path: "/reset-password", element: <SuspensePage><ResetPasswordPage /></SuspensePage> },
    ],
  },
  {
    path: "/",
    element: <MainLayout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <SuspensePage><HomePage /></SuspensePage> },
      { path: "games/:slug", element: <SuspensePage><GamePage /></SuspensePage> },
      { path: "game/:slug", element: <SuspensePage><GamePage /></SuspensePage> },
      {
        element: <ProtectedRoute />,
        children: [
          { path: "lobby/:slug", element: <SuspensePage><LobbyPage /></SuspensePage> },
          { path: "profile", element: <SuspensePage><ProfilePage /></SuspensePage> },
          { path: "wallet", element: <SuspensePage><WalletPage /></SuspensePage> },
          { path: "settings", element: <SuspensePage><SettingsPage /></SuspensePage> },
        ],
      },
      { path: "leaderboard", element: <SuspensePage><LeaderboardPage /></SuspensePage> },
      { path: "*", element: <SuspensePage><NotFoundPage /></SuspensePage> },
    ],
  },
  {
    element: <AdminRoute />,
    errorElement: <ErrorPage />,
    children: [
      {
        path: "/admin",
        element: <AdminLayout />,
        children: [
          { index: true, element: <SuspensePage><AdminOverviewPage /></SuspensePage> },
          { path: "users", element: <SuspensePage><AdminUsersPage /></SuspensePage> },
          { path: "matches", element: <SuspensePage><AdminMatchesPage /></SuspensePage> },
          { path: "rooms", element: <SuspensePage><AdminRoomsPage /></SuspensePage> },
          { path: "audit", element: <SuspensePage><AdminAuditPage /></SuspensePage> },
          { path: "settings", element: <SuspensePage><AdminSettingsPage /></SuspensePage> },
        ],
      },
    ],
  },
]);
