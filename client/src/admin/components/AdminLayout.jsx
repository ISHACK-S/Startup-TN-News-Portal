import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../AdminAuthContext.jsx';
import { useAdminPermissions } from '../AdminPermissionContext.jsx';
import { AdminError, AdminLoading } from './AdminStates.jsx';
import LanguageSelector from '../../components/LanguageSelector.jsx';

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
      { id: 'hero-slider', path: '/admin/hero-slider', icon: 'hero' }
    ]
  },
  {
    label: 'Media Management',
    items: [
      { id: 'video-media', path: '/admin/videos', icon: 'video' },
      { id: 'media-library', path: '/admin/media-library', icon: 'media' }
    ]
  },
  {
    label: 'Administration',
    items: [
      { id: 'user-management', path: '/admin/access-control/users', icon: 'users' },
      { id: 'role-builder', path: '/admin/role-builder', icon: 'roles' },
      { id: 'access-control', path: '/admin/access-control/permissions', icon: 'access' }
    ]
  },
  {
    label: 'Website Management',
    items: [
      { id: 'branding-theme-editor', path: '/admin/branding', icon: 'branding', navigationLabel: 'Branding & Theme' },
      { id: 'menu-management', path: '/admin/menu-management', icon: 'menu', navigationLabel: 'Menu Management' },
      { id: 'footer-management', path: '/admin/footer-management', icon: 'footer', navigationLabel: 'Footer Editor' },
      { id: 'seo-management' }
    ]
  },
  {
    label: 'Reports',
    items: [{ id: 'monthly-reports', path: '/admin/monthly-reports', icon: 'reports', navigationLabel: 'Monthly Reports', superAdminOnly: true }]
  }
];

export default function AdminLayout() {
  const { t: tI18n } = useTranslation('admin');
  const { admin, signOut } = useAdminAuth();
  const { permissions, loading: permissionsLoading, error: permissionsError, hasPermission, refreshPermissions } = useAdminPermissions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState({
    Dashboard: true,
    'Content Management': true,
    'Media Management': true,
    Administration: true,
    'Website Management': true,
    Reports: true
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  async function logout() {
    setError("");
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
        <Link className="admin-brand" to="/admin" aria-label={tI18n("StartupTN News admin dashboard", { defaultValue: "StartupTN News admin dashboard" })}>
          <span className="admin-brand-word">{tI18n("Startup", { defaultValue: "Startup" })}<span>{tI18n("TN", { defaultValue: "TN" })}</span></span>
          <span className="admin-brand-subtitle">{tI18n("ADMINISTRATION", { defaultValue: "ADMINISTRATION" })}</span>
        </Link>
        <nav className="admin-nav" aria-label={tI18n("Admin navigation", { defaultValue: "Admin navigation" })}>
          {permissionsLoading && <AdminLoading label="Loading modules…" />}
          {permissionsError && <AdminError message={permissionsError} onRetry={refreshPermissions} />}
          {!permissionsLoading && !permissionsError && navigationGroups.map((group) => {
            const items = group.items
              .filter((item) => !item.superAdminOnly || admin?.role === 'Super Admin')
              .map((item) => ({
                ...item,
                module: permissions?.modules?.find((module) => module.moduleId === item.id)
              }))
              .filter((item) => item.path && (item.superAdminOnly
                || (item.module?.isAvailable && item.module?.isActive && hasPermission(item.id, 'view'))));
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
                  <span>{tI18n(group.label, { defaultValue: group.label })}</span>
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
                        {tI18n(item.navigationLabel ?? item.module.label, {
                          defaultValue: item.navigationLabel ?? item.module.label
                        })}
                      </NavLink>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          {!permissionsLoading && !permissionsError && !permissions?.modules?.some((module) => module.isVisible) && (
            <p className="admin-nav-empty">{tI18n("No modules are currently assigned to this account.", { defaultValue: "No modules are currently assigned to this account." })}</p>
          )}
        </nav>
        <div className="admin-sidebar-bottom">
          <NavLink className="admin-profile-link" to="/admin/profile" onClick={() => setMenuOpen(false)}>
            <AdminIcon name="profile" /> {tI18n("Profile Settings", { defaultValue: "Profile Settings" })} </NavLink>
          <Link to="/" className="admin-back-link">{tI18n("View Public Site ↗", { defaultValue: "View Public Site ↗" })}</Link>
          <p>{tI18n("Independent editorial project", { defaultValue: "Independent editorial project" })}</p>
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
          <div className="admin-breadcrumb"><span>{tI18n("StartupTN News", { defaultValue: "StartupTN News" })}</span><span aria-hidden="true">{tI18n("/", { defaultValue: "/" })}</span><strong>{tI18n("Administration", { defaultValue: "Administration" })}</strong></div>
          <LanguageSelector className="admin-language-toggle" />
          <div className="admin-account">
            <span className="admin-avatar" aria-hidden="true">{admin?.name?.slice(0, 1).toUpperCase() ?? 'A'}</span>
            <span className="admin-account-identity">
              <span className="admin-account-name">{admin?.name}</span>
              <span className="admin-account-role">{admin?.role}</span>
            </span>
            <button type="button" className="admin-logout" onClick={logout}>{tI18n("Log out", { defaultValue: "Log out" })}</button>
          </div>
        </header>
        <main className="admin-content">
          {error && <div className="admin-alert admin-alert--error" role="alert">{error}</div>}
          <Outlet />
        </main>
      </div>
      {menuOpen && <button className="admin-scrim" type="button" aria-label={tI18n("Close admin navigation", { defaultValue: "Close admin navigation" })} onClick={() => setMenuOpen(false)} />}
    </div>
  );
}

function AdminIcon({ name }) {
  const { t: tI18n } = useTranslation('admin');
  const icons = {
    dashboard: <><rect x="3" y="3" width="7" height="8" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="15" width="7" height="6" rx="1" /></>,
    access: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5a5.5 5.5 0 0 1 11 0V20M16 8h5M18.5 5.5v5" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v1" /></>,
    roles: <><path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
    profile: <><circle cx="12" cy="8" r="3" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
    reports: <><path d="M4 19V5" /><path d="M4 19h17" /><path d="m7 15 3-4 3 2 5-7" /></>,
    news: <><path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v14H3.5V6A1.5 1.5 0 0 1 5 4.5Z" /><path d="M7.5 9h9M7.5 12.5h9M7.5 16h6" /></>,
    branding: <><path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-3Z" /><path d="M8 12h8M12 8v8" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="7" cy="6" r="1" /><circle cx="7" cy="12" r="1" /><circle cx="7" cy="18" r="1" /></>,
    footer: <><path d="M4 5h16M4 19h16M6 9h12v6H6z" /><path d="M9 12h6" /></>
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24">{icons[name] ?? icons.news}</svg>;
}
