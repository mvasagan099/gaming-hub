import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { FullPageLoader } from "./ProtectedRoute";

/** Redirects already-authenticated users away from auth pages (login/signup/etc). */
export function PublicOnlyRoute() {
  const isLoading = useAuthStore((s) => s.isLoading);
  const session = useAuthStore((s) => s.session);

  if (isLoading) return <FullPageLoader />;
  if (session) return <Navigate to="/" replace />;
  return <Outlet />;
}
