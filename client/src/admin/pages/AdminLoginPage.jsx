import { useTranslation } from 'react-i18next';
import { useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../AdminAuthContext.jsx';

export default function AdminLoginPage() {
  const { t: tI18n } = useTranslation('admin');
  const { admin, checking, sessionError, signIn } = useAdminAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();

  if (checking) return <div className="admin-auth-loading" role="status">{tI18n("Checking your admin session…", { defaultValue: "Checking your admin session…" })}</div>;
  if (admin && !submitting.current) return <Navigate to="/admin" replace />;

  async function submit(event) {
    event.preventDefault();
    setError("");
    submitting.current = true;
    setBusy(true);
    try {
      await signIn({ username: username.trim(), password });
      const destination = location.state?.from?.pathname;
      navigate(destination?.startsWith('/admin') && destination !== '/admin/login' ? destination : '/admin', {
        replace: true
      });
    } catch (loginError) {
      submitting.current = false;
      setError(loginError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-card">
        <Link className="admin-login-brand" to="/" aria-label={tI18n("StartupTN News home", { defaultValue: "StartupTN News home" })}>
          <span className="admin-brand-word">{tI18n("Startup", { defaultValue: "Startup" })}<span>{tI18n("TN", { defaultValue: "TN" })}</span></span>
          <span className="admin-brand-subtitle">{tI18n("NEWS · IDEAS · ECOSYSTEM", { defaultValue: "NEWS · IDEAS · ECOSYSTEM" })}</span>
        </Link>
        <div className="admin-login-intro">
          <span className="admin-eyebrow">{tI18n("Editorial workspace", { defaultValue: "Editorial workspace" })}</span>
          <h1>{tI18n("Welcome back.", { defaultValue: "Welcome back." })}</h1>
          <p>{tI18n("Sign in with your authorized newsroom account.", { defaultValue: "Sign in with your authorized newsroom account." })}</p>
        </div>
        {sessionError && <p className="admin-form-error" role="alert">{sessionError}</p>}
        <form className="admin-form" onSubmit={submit}>
          <label htmlFor="admin-username">{tI18n("Username", { defaultValue: "Username" })}</label>
          <input
            id="admin-username"
            name="username"
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <label htmlFor="admin-password">{tI18n("Password", { defaultValue: "Password" })}</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && <p className="admin-form-error" role="alert">{error}</p>}
          <button className="admin-button admin-button--primary admin-login-submit" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="admin-login-footnote">{tI18n("Access is limited to provisioned editorial accounts.", { defaultValue: "Access is limited to provisioned editorial accounts." })}</p>
      </section>
    </main>
  );
}
