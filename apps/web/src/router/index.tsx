import { createBrowserRouter } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import {
  HomePage,
  GamePage,
  ProfilePage,
  LeaderboardPage,
  SettingsPage,
  WalletPage,
} from "../pages";
import { LobbyPage } from "../pages/Lobby/LobbyPage";
import NotFoundPage from "../pages/NotFoundPage";
import { ErrorPage } from "../pages/ErrorPage";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { PublicOnlyRoute } from "../components/auth/PublicOnlyRoute";
import { LoginPage } from "../pages/Auth/LoginPage";
import { SignupPage } from "../pages/Auth/SignupPage";
import { ForgotPasswordPage } from "../pages/Auth/ForgotPasswordPage";
import { ResetPasswordPage } from "../pages/Auth/ResetPasswordPage";

export const router = createBrowserRouter([
  {
    element: <PublicOnlyRoute />,
    errorElement: <ErrorPage />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/signup", element: <SignupPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
      { path: "/reset-password", element: <ResetPasswordPage /> },
    ],
  },
  {
    path: "/",
    element: <MainLayout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "games/:slug", element: <GamePage /> },
      { path: "game/:slug", element: <GamePage /> },
      {
        element: <ProtectedRoute />,
        children: [
          { path: "lobby/:slug", element: <LobbyPage /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "wallet", element: <WalletPage /> },
          { path: "settings", element: <SettingsPage /> },
        ],
      },
      { path: "leaderboard", element: <LeaderboardPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
