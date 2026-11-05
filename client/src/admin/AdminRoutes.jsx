import { useTranslation } from 'react-i18next';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from './AdminAuthContext.jsx';
import { AdminPermissionsProvider } from './AdminPermissionContext.jsx';

export function ProtectedAdmin() {
  const { t: tI18n } = useTranslation('admin');
  const { admin, checking } = useAdminAuth();
  const location = useLocation();

  if (checking) {
    return <div className="admin-auth-loading" role="status">{tI18n("Checking your admin session…", { defaultValue: "Checking your admin session…" })}</div>;
  }
  if (!admin) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }
  return <AdminPermissionsProvider><Outlet /></AdminPermissionsProvider>;
}

export function ProtectedSuperAdmin() {
  const { t: tI18n } = useTranslation('admin');
  const { admin, checking } = useAdminAuth();

  if (checking) {
    return <div className="admin-auth-loading" role="status">{tI18n("Checking your admin session…", { defaultValue: "Checking your admin session…" })}</div>;
  }
  if (admin?.role !== 'Super Admin') {
    return <Navigate to="/admin" replace />;
  }
  return <Outlet />;
}

export default function AdminRoutes() {
  const { t: tI18n } = useTranslation('admin');
  return <AdminAuthProvider><Outlet /></AdminAuthProvider>;
}
