import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from './AdminAuthContext.jsx';
import { AdminPermissionsProvider } from './AdminPermissionContext.jsx';

export function ProtectedAdmin() {
  const { admin, checking } = useAdminAuth();
  const location = useLocation();

  if (checking) {
    return <div className="admin-auth-loading" role="status">Checking your admin session…</div>;
  }
  if (!admin) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }
  return <AdminPermissionsProvider><Outlet /></AdminPermissionsProvider>;
}

export function ProtectedSuperAdmin() {
  const { admin, checking } = useAdminAuth();

  if (checking) {
    return <div className="admin-auth-loading" role="status">Checking your admin session…</div>;
  }
  if (admin?.role !== 'Super Admin') {
    return <Navigate to="/admin" replace />;
  }
  return <Outlet />;
}

export default function AdminRoutes() {
  return <AdminAuthProvider><Outlet /></AdminAuthProvider>;
}
