import { createBrowserRouter, Navigate } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import MainLayout from "../layouts/MainLayout";
import { AdminLayout } from "../layouts/AdminLayout";
import { LobbyPage } from "../pages/Lobby/LobbyPage";
import NotFoundPage from "../pages/NotFoundPage";
import { ErrorPage } from "../pages/ErrorPage";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { PublicOnlyRoute } from "../components/auth/PublicOnlyRoute";
import { AdminRoute } from "../components/admin/AdminRoute";
import { FeatureGate } from "../components/FeatureGate";
import { AUTH_CALLBACK_PATH, PASSWORD_RESET_PATH } from '@gaming-hub/shared';
import { AuthLinkAliasPage } from '../pages/Auth/AuthLinkAliasPage';

// Route-level code splitting: heavy pages (Phaser games, chess.js) load on
// demand instead of inflating the initial bundle.
const HomePage = lazy(() => import("../pages/Home/Home").then((m) => ({ default: m.Home })));
const GamePage = lazy(() => import("../pages/Games/GamePage").then((m) => ({ default: m.GamePage })));
const ProfilePage = lazy(() => import("../pages/Profile/ProfilePage").then((m) => ({ default: m.ProfilePage })));
const LeaderboardPage = lazy(() => import("../components/LeaderboardView").then((m) => ({ default: m.LeaderboardView })));
const SettingsPage = lazy(() => import("../pages/Settings/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const WalletPage = lazy(() => import("../pages/Wallet/WalletPage").then((m) => ({ default: m.WalletPage })));
const ReferralsPage = lazy(() => import("../pages/Referrals/ReferralsPage").then((m) => ({ default: m.ReferralsPage })));
const AnnouncementsPage = lazy(() => import("../pages/Announcements/AnnouncementsPage").then((m) => ({ default: m.AnnouncementsPage })));
const TicketsPage = lazy(() => import("../pages/Tickets/TicketsPage").then((m) => ({ default: m.TicketsPage })));
const MessagesPage = lazy(() => import("../pages/Messages/MessagesPage").then((m) => ({ default: m.MessagesPage })));
const TournamentsPage = lazy(() => import("../pages/Tournaments/TournamentsPage").then((m) => ({ default: m.TournamentsPage })));
const TournamentDetailPage = lazy(() => import("../pages/Tournaments/TournamentDetailPage").then((m) => ({ default: m.TournamentDetailPage })));
const TournamentHistoryPage = lazy(() => import("../pages/Tournaments/TournamentHistoryPage").then((m) => ({ default: m.TournamentHistoryPage })));
const TournamentLeaderboardPage = lazy(() => import("../pages/Tournaments/TournamentLeaderboardPage").then((m) => ({ default: m.TournamentLeaderboardPage })));
const SearchPage = lazy(() => import("../pages/Search/SearchPage").then((m) => ({ default: m.SearchPage })));
const FriendsPage = lazy(() => import("../pages/Friends/FriendsPage").then((m) => ({ default: m.FriendsPage })));
const AchievementsPage = lazy(() => import("../pages/Achievements/AchievementsPage").then((m) => ({ default: m.AchievementsPage })));
const NotificationsPage = lazy(() => import("../pages/Notifications/NotificationsPage").then((m) => ({ default: m.NotificationsPage })));
const LoginPage = lazy(() => import("../pages/Auth/LoginPage").then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import("../pages/Auth/SignupPage").then((m) => ({ default: m.SignupPage })));
const ForgotPasswordPage = lazy(() => import("../pages/Auth/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("../pages/Auth/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })));
const AuthCallbackPage = lazy(() => import("../pages/Auth/AuthCallbackPage").then((m) => ({ default: m.AuthCallbackPage })));
const TwoFactorPage = lazy(() => import("../pages/Auth/TwoFactorPage").then((m) => ({ default: m.TwoFactorPage })));
const KycPage = lazy(() => import("../pages/Kyc/KycPage").then((m) => ({ default: m.KycPage })));
const KycVerifyPage = lazy(() => import("../pages/Kyc/KycVerifyPage").then((m) => ({ default: m.KycVerifyPage })));
const AdminOverviewPage = lazy(() => import("../pages/admin/AdminOverviewPage").then((m) => ({ default: m.AdminOverviewPage })));
const AdminUsersPage = lazy(() => import("../pages/admin/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage })));
const AdminMatchesPage = lazy(() => import("../pages/admin/AdminMatchesPage").then((m) => ({ default: m.AdminMatchesPage })));
const AdminRoomsPage = lazy(() => import("../pages/admin/AdminRoomsPage").then((m) => ({ default: m.AdminRoomsPage })));
const AdminAuditPage = lazy(() => import("../pages/admin/AdminAuditPage").then((m) => ({ default: m.AdminAuditPage })));
const AdminSettingsPage = lazy(() => import("../pages/admin/AdminSettingsPage").then((m) => ({ default: m.AdminSettingsPage })));
const AdminFeaturesPage = lazy(() => import("../pages/admin/AdminFeaturesPage").then((m) => ({ default: m.AdminFeaturesPage })));
const AdminTournamentsPage = lazy(() => import("../pages/admin/AdminTournamentsPage").then((m) => ({ default: m.AdminTournamentsPage })));
const AdminTournamentDetailPage = lazy(() => import("../pages/admin/AdminTournamentDetailPage").then((m) => ({ default: m.AdminTournamentDetailPage })));
const AdminTournamentDisputesPage = lazy(() => import("../pages/admin/AdminTournamentDisputesPage").then((m) => ({ default: m.AdminTournamentDisputesPage })));
const AdminCouponsPage = lazy(() => import("../pages/admin/AdminCouponsPage").then((m) => ({ default: m.AdminCouponsPage })));
const AdminAnnouncementsPage = lazy(() => import("../pages/admin/AdminAnnouncementsPage").then((m) => ({ default: m.AdminAnnouncementsPage })));
const AdminCrmPage = lazy(() => import("../pages/admin/AdminCrmPage").then((m) => ({ default: m.AdminCrmPage })));
const AdminMonitoringPage = lazy(() => import("../pages/admin/AdminMonitoringPage").then((m) => ({ default: m.AdminMonitoringPage })));
const AdminAnalyticsPage = lazy(() => import("../pages/admin/AdminAnalyticsPage").then((m) => ({ default: m.AdminAnalyticsPage })));
const AdminErrorsPage = lazy(() => import("../pages/admin/AdminErrorsPage").then((m) => ({ default: m.AdminErrorsPage })));
const AdminAutomationPage = lazy(() => import("../pages/admin/AdminAutomationPage").then((m) => ({ default: m.AdminAutomationPage })));
const AdminSupportPage = lazy(() => import("../pages/admin/AdminSupportPage").then((m) => ({ default: m.AdminSupportPage })));
const AdminRolesPage = lazy(() => import("../pages/admin/AdminRolesPage").then((m) => ({ default: m.AdminRolesPage })));
const AdminKycPage = lazy(() => import("../pages/admin/AdminKycPage").then((m) => ({ default: m.AdminKycPage })));
const AdminGamesPage = lazy(() => import("../pages/admin/AdminGamesPage").then((m) => ({ default: m.AdminGamesPage })));
const AdminAppVersionPage = lazy(() => import("../pages/admin/AdminAppVersionPage").then((m) => ({ default: m.AdminAppVersionPage })));
const AdminAffiliatesPage = lazy(() => import("../pages/admin/AdminAffiliatesPage").then((m) => ({ default: m.AdminAffiliatesPage })));

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
  ...['/auth/reset-password', '/auth/verify-email', '/verify-email'].map(path => ({
    path, element: <AuthLinkAliasPage />, errorElement: <ErrorPage />,
  })),
  {
    path: AUTH_CALLBACK_PATH,
    element: <SuspensePage><AuthCallbackPage /></SuspensePage>,
    errorElement: <ErrorPage />,
  },
  {
    path: PASSWORD_RESET_PATH,
    element: <SuspensePage><ResetPasswordPage /></SuspensePage>,
    errorElement: <ErrorPage />,
  },
  {
    path: "/2fa",
    element: <SuspensePage><TwoFactorPage /></SuspensePage>,
    errorElement: <ErrorPage />,
  },
  {
    element: <PublicOnlyRoute />,
    errorElement: <ErrorPage />,
    children: [
      { path: "/login", element: <SuspensePage><LoginPage /></SuspensePage> },
      { path: "/signup", element: <SuspensePage><SignupPage /></SuspensePage> },
      { path: "/forgot-password", element: <SuspensePage><ForgotPasswordPage /></SuspensePage> },
    ],
  },
  {
    path: "/",
    element: <MainLayout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <SuspensePage><HomePage /></SuspensePage> },
      { path: "games/:slug", element: <SuspensePage><FeatureGate flag="games.enabled"><GamePage /></FeatureGate></SuspensePage> },
      { path: "game/:slug", element: <SuspensePage><FeatureGate flag="games.enabled"><GamePage /></FeatureGate></SuspensePage> },
      {
        element: <ProtectedRoute />,
        children: [
          { path: "lobby/:slug", element: <SuspensePage><FeatureGate flag="games.enabled"><LobbyPage /></FeatureGate></SuspensePage> },
          { path: "profile", element: <SuspensePage><ProfilePage /></SuspensePage> },
          { path: "profile/:tab", element: <SuspensePage><ProfilePage /></SuspensePage> },
          { path: "wallet", element: <SuspensePage><WalletPage /></SuspensePage> },
          { path: "settings", element: <SuspensePage><SettingsPage /></SuspensePage> },
          { path: "referrals", element: <SuspensePage><FeatureGate flag="social.referrals"><ReferralsPage /></FeatureGate></SuspensePage> },
          { path: "coupons", element: <Navigate to="/wallet" replace /> },
          { path: "announcements", element: <SuspensePage><FeatureGate flag="content.announcements"><AnnouncementsPage /></FeatureGate></SuspensePage> },
          { path: "tickets", element: <SuspensePage><FeatureGate flag="support.tickets"><TicketsPage /></FeatureGate></SuspensePage> },
          { path: "messages", element: <SuspensePage><FeatureGate flag="social.messaging"><MessagesPage /></FeatureGate></SuspensePage> },
          { path: "tournaments", element: <SuspensePage><FeatureGate flag="content.tournaments"><TournamentsPage /></FeatureGate></SuspensePage> },
          { path: "tournaments/:id", element: <SuspensePage><FeatureGate flag="content.tournaments"><TournamentDetailPage /></FeatureGate></SuspensePage> },
          { path: "tournaments/history", element: <SuspensePage><FeatureGate flag="content.tournaments"><TournamentHistoryPage /></FeatureGate></SuspensePage> },
          { path: "tournaments/leaderboard", element: <SuspensePage><FeatureGate flag="content.tournaments"><TournamentLeaderboardPage /></FeatureGate></SuspensePage> },
          { path: "search", element: <SuspensePage><SearchPage /></SuspensePage> },
          { path: "friends", element: <SuspensePage><FeatureGate flag="social.friends"><FriendsPage /></FeatureGate></SuspensePage> },
          { path: "achievements", element: <SuspensePage><AchievementsPage /></SuspensePage> },
          { path: "notifications", element: <SuspensePage><NotificationsPage /></SuspensePage> },
          { path: "kyc", element: <SuspensePage><FeatureGate flag="support.kyc"><KycPage /></FeatureGate></SuspensePage> },
          { path: "kyc/verify", element: <SuspensePage><FeatureGate flag="support.kyc"><KycVerifyPage /></FeatureGate></SuspensePage> }
        ],
      },
      { path: "leaderboard", element: <SuspensePage><FeatureGate flag="social.leaderboards"><LeaderboardPage /></FeatureGate></SuspensePage> },
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
          { path: "kyc", element: <SuspensePage><AdminKycPage /></SuspensePage> },
          { path: "roles", element: <SuspensePage><AdminRolesPage /></SuspensePage> },
          { path: "games", element: <SuspensePage><AdminGamesPage /></SuspensePage> },
          { path: "matches", element: <SuspensePage><AdminMatchesPage /></SuspensePage> },
          { path: "rooms", element: <SuspensePage><AdminRoomsPage /></SuspensePage> },
          { path: "tournaments", element: <SuspensePage><AdminTournamentsPage /></SuspensePage> },
          { path: "tournaments/disputes", element: <SuspensePage><AdminTournamentDisputesPage /></SuspensePage> },
          { path: "tournaments/:id", element: <SuspensePage><AdminTournamentDetailPage /></SuspensePage> },
          { path: "coupons", element: <SuspensePage><AdminCouponsPage /></SuspensePage> },
          { path: "affiliate", element: <Navigate to="/admin/affiliates" replace /> },
          { path: "affiliates", element: <SuspensePage><AdminAffiliatesPage /></SuspensePage> },
          { path: "announcements", element: <SuspensePage><AdminAnnouncementsPage /></SuspensePage> },
          { path: "crm", element: <SuspensePage><AdminCrmPage /></SuspensePage> },
          { path: "features", element: <SuspensePage><AdminFeaturesPage /></SuspensePage> },
          { path: "analytics", element: <SuspensePage><AdminAnalyticsPage /></SuspensePage> },
          { path: "monitoring", element: <SuspensePage><AdminMonitoringPage /></SuspensePage> },
          { path: "errors", element: <SuspensePage><AdminErrorsPage /></SuspensePage> },
          { path: "automation", element: <SuspensePage><AdminAutomationPage /></SuspensePage> },
          { path: "support", element: <SuspensePage><AdminSupportPage /></SuspensePage> },
          { path: "audit", element: <SuspensePage><AdminAuditPage /></SuspensePage> },
          { path: "settings", element: <SuspensePage><AdminSettingsPage /></SuspensePage> },
          { path: "app-version", element: <SuspensePage><AdminAppVersionPage /></SuspensePage> },
          { path: "*", element: <Navigate to="/admin" replace /> },
        ],
      },
    ],
  },
]);
