import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useMe } from '../../services/api/useMe';

export function AdminRoute() {
  const user = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);
  const { me, loading } = useMe();

  if (!user && !session) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#090d16]">
        <div className="w-8 h-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (!me) {
    return <Navigate to="/login" replace />;
  }

  const role = me?.user?.role || (user?.app_metadata?.role as string) || (user?.user_metadata?.role as string);
  const isStaff = role === 'ADMIN' || role === 'MODERATOR' || role === 'CUSTOM';

  if (!isStaff) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
