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
const ReferralsPage = lazy(() => import("../pages/Referrals/ReferralsPage").then((m) => ({ default: m.ReferralsPage })));
const CouponsPage = lazy(() => import("../pages/Coupons/CouponsPage").then((m) => ({ default: m.CouponsPage })));
const AnnouncementsPage = lazy(() => import("../pages/Announcements/AnnouncementsPage").then((m) => ({ default: m.AnnouncementsPage })));
const TicketsPage = lazy(() => import("../pages/Tickets/TicketsPage").then((m) => ({ default: m.TicketsPage })));
const MessagesPage = lazy(() => import("../pages/Messages/MessagesPage").then((m) => ({ default: m.MessagesPage })));
const TournamentsPage = lazy(() => import("../pages/Tournaments/TournamentsPage").then((m) => ({ default: m.TournamentsPage })));
const SearchPage = lazy(() => import("../pages/Search/SearchPage").then((m) => ({ default: m.SearchPage })));
const FriendsPage = lazy(() => import("../pages/Friends/FriendsPage").then((m) => ({ default: m.FriendsPage })));
const AchievementsPage = lazy(() => import("../pages/Achievements/AchievementsPage").then((m) => ({ default: m.AchievementsPage })));
const NotificationsPage = lazy(() => import("../pages/Notifications/NotificationsPage").then((m) => ({ default: m.NotificationsPage })));
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
const AdminFeaturesPage = lazy(() => import("../pages/admin/AdminFeaturesPage").then((m) => ({ default: m.AdminFeaturesPage })));
const AdminTournamentsPage = lazy(() => import("../pages/admin/AdminTournamentsPage").then((m) => ({ default: m.AdminTournamentsPage })));
const AdminCouponsPage = lazy(() => import("../pages/admin/AdminCouponsPage").then((m) => ({ default: m.AdminCouponsPage })));
const AdminAnnouncementsPage = lazy(() => import("../pages/admin/AdminAnnouncementsPage").then((m) => ({ default: m.AdminAnnouncementsPage })));
const AdminCrmPage = lazy(() => import("../pages/admin/AdminCrmPage").then((m) => ({ default: m.AdminCrmPage })));
const AdminMonitoringPage = lazy(() => import("../pages/admin/AdminMonitoringPage").then((m) => ({ default: m.AdminMonitoringPage })));
const AdminAnalyticsPage = lazy(() => import("../pages/admin/AdminAnalyticsPage").then((m) => ({ default: m.AdminAnalyticsPage })));
const AdminErrorsPage = lazy(() => import("../pages/admin/AdminErrorsPage").then((m) => ({ default: m.AdminErrorsPage })));
const AdminAutomationPage = lazy(() => import("../pages/admin/AdminAutomationPage").then((m) => ({ default: m.AdminAutomationPage })));

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
          { path: "referrals", element: <SuspensePage><ReferralsPage /></SuspensePage> },
          { path: "coupons", element: <SuspensePage><CouponsPage /></SuspensePage> },
          { path: "announcements", element: <SuspensePage><AnnouncementsPage /></SuspensePage> },
          { path: "tickets", element: <SuspensePage><TicketsPage /></SuspensePage> },
          { path: "messages", element: <SuspensePage><MessagesPage /></SuspensePage> },
          { path: "tournaments", element: <SuspensePage><TournamentsPage /></SuspensePage> },
          { path: "search", element: <SuspensePage><SearchPage /></SuspensePage> },
          { path: "friends", element: <SuspensePage><FriendsPage /></SuspensePage> },
          { path: "achievements", element: <SuspensePage><AchievementsPage /></SuspensePage> },
          { path: "notifications", element: <SuspensePage><NotificationsPage /></SuspensePage> },
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
          { path: "tournaments", element: <SuspensePage><AdminTournamentsPage /></SuspensePage> },
          { path: "coupons", element: <SuspensePage><AdminCouponsPage /></SuspensePage> },
          { path: "announcements", element: <SuspensePage><AdminAnnouncementsPage /></SuspensePage> },
          { path: "crm", element: <SuspensePage><AdminCrmPage /></SuspensePage> },
          { path: "features", element: <SuspensePage><AdminFeaturesPage /></SuspensePage> },
          { path: "analytics", element: <SuspensePage><AdminAnalyticsPage /></SuspensePage> },
          { path: "monitoring", element: <SuspensePage><AdminMonitoringPage /></SuspensePage> },
          { path: "errors", element: <SuspensePage><AdminErrorsPage /></SuspensePage> },
          { path: "automation", element: <SuspensePage><AdminAutomationPage /></SuspensePage> },
          { path: "audit", element: <SuspensePage><AdminAuditPage /></SuspensePage> },
          { path: "settings", element: <SuspensePage><AdminSettingsPage /></SuspensePage> },
        ],
      },
    ],
  },
]);
