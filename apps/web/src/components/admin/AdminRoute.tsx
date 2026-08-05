import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

export function AdminRoute() {
  const user = useAuthStore((s) => s.user);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isAdmin = user.app_metadata?.role === 'ADMIN' || user.user_metadata?.role === 'ADMIN';

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
