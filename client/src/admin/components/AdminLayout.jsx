import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../AdminAuthContext.jsx';

export default function AdminLayout() {
  const { admin, signOut } = useAdminAuth();
  const [menuOpen, setMenuOpen] = useState(false);
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
          <span className="admin-brand-subtitle">EDITORIAL WORKSPACE</span>
        </Link>
        <div className="admin-nav-label">Workspace</div>
        <nav className="admin-nav" aria-label="Admin navigation">
          <NavLink to="/admin" end onClick={() => setMenuOpen(false)}>
            <AdminIcon name="dashboard" /> Overview
          </NavLink>
          <NavLink to="/admin/news" onClick={() => setMenuOpen(false)}>
            <AdminIcon name="news" /> Articles
          </NavLink>
        </nav>
        <div className="admin-sidebar-bottom">
          <Link to="/" className="admin-back-link">← View public site</Link>
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
          <div className="admin-breadcrumb"><span>StartupTN News</span><span aria-hidden="true">/</span><strong>Admin</strong></div>
          <div className="admin-account">
            <span className="admin-avatar" aria-hidden="true">{admin?.name?.slice(0, 1).toUpperCase() ?? 'A'}</span>
            <span className="admin-account-name">{admin?.name}</span>
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
  if (name === 'dashboard') {
    return <svg aria-hidden="true" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="8" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="15" width="7" height="6" rx="1" /></svg>;
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v14H3.5V6A1.5 1.5 0 0 1 5 4.5Z" /><path d="M7.5 9h9M7.5 12.5h9M7.5 16h6" /></svg>;
}
