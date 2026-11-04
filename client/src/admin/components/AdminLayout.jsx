import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../AdminAuthContext.jsx';
import { useAdminPermissions } from '../AdminPermissionContext.jsx';
import { AdminError, AdminLoading } from './AdminStates.jsx';

const navigationGroups = [
  {
    label: 'Dashboard',
    items: [{ id: 'overview', path: '/admin', icon: 'dashboard' }]
  },
  {
    label: 'Content Management',
    items: [
      { id: 'news-articles', path: '/admin/news', icon: 'news' },
      { id: 'web-stories', path: '/admin/web-stories', icon: 'stories' },
      { id: 'hero-slider', path: '/admin/hero-slider', icon: 'hero' },
      { id: 'video-media', path: '/admin/videos', icon: 'video' },
      { id: 'media-library', path: '/admin/media-library', icon: 'media' },
      { id: 'official-alerts' }
    ]
  },
  {
    label: 'Public Information & Services',
    items: [
      { id: 'monthly-reports' },
      { id: 'citizen-services' },
      { id: 'faq-management' },
      { id: 'police-stations' },
      { id: 'helplines-registry' },
      { id: 'portal-links' }
    ]
  },
  {
    label: 'Administration',
    items: [
      { id: 'user-management', path: '/admin/access-control/users', icon: 'users' },
      { id: 'role-builder', path: '/admin/role-builder', icon: 'roles' },
      { id: 'access-control', path: '/admin/access-control/permissions', icon: 'access' },
      { id: 'session-management' },
      { id: 'security-events' },
      { id: 'audit-logs' }
    ]
  },
  {
    label: 'Website Configuration',
    items: [
      { id: 'branding-theme-editor' },
      { id: 'menu-management' },
      { id: 'footer-management' },
      { id: 'seo-management' }
    ]
  },
  {
    label: 'System',
    items: [
      { id: 'system-configuration' },
      { id: 'backup-restore' },
      { id: 'api-key-configuration' },
      { id: 'smtp-configuration' }
    ]
  }
];

export default function AdminLayout() {
  const { admin, signOut } = useAdminAuth();
  const { permissions, loading: permissionsLoading, error: permissionsError, hasPermission, refreshPermissions } = useAdminPermissions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState({ Dashboard: true, 'Content Management': true, Administration: true });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function logout() {
    setError('');
    try {
      await signOut();
      navigate('/admin/login', { replace: true });
    } catch (logoutError) {
      setError(logoutError.message);
    }
  }

  return (
    <div className="admin-app">
      <aside className={`admin-sidebar${menuOpen ? ' admin-sidebar--open' : ''}`}>
        <Link className="admin-brand" to="/admin" aria-label="StartupTN News admin dashboard">
          <span className="admin-brand-word">Startup<span>TN</span></span>
          <span className="admin-brand-subtitle">ADMINISTRATION</span>
        </Link>
        <nav className="admin-nav" aria-label="Admin navigation">
          {permissionsLoading && <AdminLoading label="Loading modules…" />}
          {permissionsError && <AdminError message={permissionsError} onRetry={refreshPermissions} />}
          {!permissionsLoading && !permissionsError && navigationGroups.map((group) => {
            const items = group.items
              .map((item) => ({
                ...item,
                module: permissions?.modules?.find((module) => module.moduleId === item.id)
              }))
              .filter((item) => item.path && item.module?.isAvailable && item.module?.isActive
                && hasPermission(item.id, 'view'));
            if (!items.length) return null;
            const isExpanded = Boolean(expanded[group.label]);
            return (
              <section className="admin-nav-group" key={group.label}>
                <button
                  type="button"
                  className="admin-nav-group-toggle"
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded((current) => ({ ...current, [group.label]: !isExpanded }))}
                >
                  <span>{group.label}</span>
                  <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
                </button>
                {isExpanded && (
                  <div className="admin-nav-group-items">
                    {items.map((item) => (
                      <NavLink
                        key={item.id}
                        to={item.path}
                        end={item.id === 'overview'}
                        onClick={() => setMenuOpen(false)}
                      >
                        <AdminIcon name={item.icon ?? 'module'} />
                        {item.module.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          {!permissionsLoading && !permissionsError && !permissions?.modules?.some((module) => module.isVisible) && (
            <p className="admin-nav-empty">No modules are currently assigned to this account.</p>
          )}
        </nav>
        <div className="admin-sidebar-bottom">
          {hasPermission('profile-settings') ? (
            <NavLink className="admin-profile-link" to="/admin/profile" onClick={() => setMenuOpen(false)}>
              <AdminIcon name="profile" /> Profile Settings
            </NavLink>
          ) : (
            <span className="admin-profile-link admin-profile-link--disabled" aria-disabled="true">
              <AdminIcon name="profile" /> Profile Settings <small>Unavailable</small>
            </span>
          )}
          <Link to="/" className="admin-back-link">View Public Site ↗</Link>
          <p>Independent editorial project</p>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <button
            className="admin-menu-toggle"
            type="button"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close admin navigation' : 'Open admin navigation'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
          </button>
          <div className="admin-breadcrumb"><span>StartupTN News</span><span aria-hidden="true">/</span><strong>Administration</strong></div>
          <div className="admin-account">
            <span className="admin-avatar" aria-hidden="true">{admin?.name?.slice(0, 1).toUpperCase() ?? 'A'}</span>
            <span className="admin-account-identity">
              <span className="admin-account-name">{admin?.name}</span>
              <span className="admin-account-role">{admin?.role}</span>
            </span>
            <button type="button" className="admin-logout" onClick={logout}>Log out</button>
          </div>
        </header>
        <main className="admin-content">
          {error && <div className="admin-alert admin-alert--error" role="alert">{error}</div>}
          <Outlet />
        </main>
      </div>
      {menuOpen && <button className="admin-scrim" type="button" aria-label="Close admin navigation" onClick={() => setMenuOpen(false)} />}
    </div>
  );
}

function AdminIcon({ name }) {
  const icons = {
    dashboard: <><rect x="3" y="3" width="7" height="8" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="15" width="7" height="6" rx="1" /></>,
    access: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5a5.5 5.5 0 0 1 11 0V20M16 8h5M18.5 5.5v5" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v1" /></>,
    roles: <><path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
    profile: <><circle cx="12" cy="8" r="3" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
    news: <><path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v14H3.5V6A1.5 1.5 0 0 1 5 4.5Z" /><path d="M7.5 9h9M7.5 12.5h9M7.5 16h6" /></>
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24">{icons[name] ?? icons.news}</svg>;
}
