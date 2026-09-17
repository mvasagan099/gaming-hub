import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { FullPageLoader } from "./ProtectedRoute";

/** Redirects already-authenticated users away from auth pages (login/signup/etc). */
export function PublicOnlyRoute() {
  const isLoading = useAuthStore((s) => s.isLoading);
  const session = useAuthStore((s) => s.session);
  const isPasswordRecovery = useAuthStore((s) => s.isPasswordRecovery);
  const isMfaRequired = useAuthStore((s) => s.isMfaRequired);

  if (isLoading) return <FullPageLoader />;
  if (isPasswordRecovery) return <Outlet />;
  if (isMfaRequired) return <Navigate to="/2fa" replace />;
  if (session) return <Navigate to="/" replace />;
  return <Outlet />;
}
