import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useMe } from "../../services/api/useMe";

export function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Loading…</p>
      </div>
    </div>
  );
}

export function ProtectedRoute() {
  const isLoading = useAuthStore((s) => s.isLoading);
  const session = useAuthStore((s) => s.session);
  const isPasswordRecovery = useAuthStore((s) => s.isPasswordRecovery);
  const isMfaRequired = useAuthStore((s) => s.isMfaRequired);
  const location = useLocation();
  const { me, loading: meLoading } = useMe();

  if (isLoading || (session && meLoading && !me)) return <FullPageLoader />;
  if (!session || isPasswordRecovery) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (isMfaRequired || (me?.profile?.twoFactorEnabled && me?.mfaVerified === false)) {
    return <Navigate to="/2fa" state={{ from: location }} replace />;
  }
  return <Outlet />;
}
