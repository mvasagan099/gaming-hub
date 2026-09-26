import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { FullPageLoader } from "./ProtectedRoute";

/** Redirects already-authenticated users away from auth pages (login/signup/etc). */
export function PublicOnlyRoute() {
  const isLoading = useAuthStore((s) => s.isLoading);
  const session = useAuthStore((s) => s.session);
  const isPasswordRecovery = useAuthStore((s) => s.isPasswordRecovery);
  const isMfaRequired = useAuthStore((s) => s.isMfaRequired);
  const location = useLocation();
  const stateObj = location.state as { require2FA?: boolean } | null;

  if (isLoading) return <FullPageLoader />;
  if (isPasswordRecovery) return <Outlet />;
  // If 2FA is pending or explicitly requested, allow remaining on /login to enter code
  if (isMfaRequired || stateObj?.require2FA) return <Outlet />;
  if (session) return <Navigate to="/" replace />;
  return <Outlet />;
}
