import { createBrowserRouter } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import {
  HomePage,
  GamePage,
  ProfilePage,
  LeaderboardPage,
  SettingsPage
} from "../pages";
import { LobbyPage } from "../pages/Lobby/LobbyPage";
import NotFoundPage from "../pages/NotFoundPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <MainLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "games/:slug", element: <GamePage /> },
      { path: "game/:slug", element: <GamePage /> },
      { path: "lobby/:slug", element: <LobbyPage /> },
      { path: "profile", element: <ProfilePage /> },
      { path: "leaderboard", element: <LeaderboardPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
