import { useTranslation } from 'react-i18next';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { getMyAdminPermissions } from '../api/admin.js';
import { AdminError, AdminLoading } from './components/AdminStates.jsx';

const AdminPermissionContext = createContext(null);

export function AdminPermissionsProvider({ children }) {
  const { t: tI18n } = useTranslation('admin');
  const [permissions, setPermissions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPermissions = useCallback(async ({ signal, silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const current = await getMyAdminPermissions({ signal });
      setPermissions(current);
      setError("");
      return current;
    } catch (loadError) {
      if (loadError.name !== 'AbortError') {
        setPermissions(null);
        setError(loadError.message);
      }
      throw loadError;
    } finally {
      if (!silent && !signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadPermissions({ signal: controller.signal }).catch(() => {});
    return () => controller.abort();
  }, [loadPermissions]);

  const refreshPermissions = useCallback(() => {
    loadPermissions().catch(() => {});
  }, [loadPermissions]);

  useEffect(() => {
    const refreshSilently = () => {
      if (document.visibilityState === 'visible') loadPermissions({ silent: true }).catch(() => {});
    };
    const interval = window.setInterval(refreshSilently, 30000);
    window.addEventListener('focus', refreshSilently);
    document.addEventListener('visibilitychange', refreshSilently);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshSilently);
      document.removeEventListener('visibilitychange', refreshSilently);
    };
  }, [loadPermissions]);

  const value = useMemo(() => ({
    permissions,
    loading,
    error,
    hasPermission: (moduleId, actionId = 'view') => Boolean(
      permissions?.modules?.find((module) => module.moduleId === moduleId)?.actions?.[actionId]
    ),
    refreshPermissions
  }), [permissions, loading, error, refreshPermissions]);

  return <AdminPermissionContext.Provider value={value}>{children}</AdminPermissionContext.Provider>;
}

export function useAdminPermissions() {
  const context = useContext(AdminPermissionContext);
  if (!context) throw new Error('useAdminPermissions must be used within AdminPermissionsProvider.');
  return context;
}

export function RequireAdminPermission({ moduleId, actionId = 'view' }) {
  const { t: tI18n } = useTranslation('admin');
  const { loading, error, hasPermission, refreshPermissions } = useAdminPermissions();

  if (loading) return <AdminLoading label="Loading your permissions…" />;
  if (error) return <AdminError message={error} onRetry={refreshPermissions} />;
  if (!hasPermission(moduleId, actionId)) {
    return (
      <section className="admin-denied" role="alert">
        <span className="admin-eyebrow">{tI18n("Access restricted", { defaultValue: "Access restricted" })}</span>
        <h1>{tI18n("You don’t have access to this module.", { defaultValue: "You don’t have access to this module." })}</h1>
        <p>{tI18n("Your current permissions do not allow this page. Contact a Super Admin if you need access.", { defaultValue: "Your current permissions do not allow this page. Contact a Super Admin if you need access." })}</p>
      </section>
    );
  }
  return <Outlet />;
}
