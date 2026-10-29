import { useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../AdminAuthContext.jsx';

export default function AdminLoginPage() {
  const { admin, checking, sessionError, signIn } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();

  if (checking) return <div className="admin-auth-loading" role="status">Checking your admin session…</div>;
  if (admin && !submitting.current) return <Navigate to="/admin" replace />;

  async function submit(event) {
    event.preventDefault();
    setError('');
    submitting.current = true;
    setBusy(true);
    try {
      await signIn({ email: email.trim(), password });
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
        <Link className="admin-login-brand" to="/" aria-label="StartupTN News home">
          <span className="admin-brand-word">Startup<span>TN</span></span>
          <span className="admin-brand-subtitle">NEWS · IDEAS · ECOSYSTEM</span>
        </Link>
        <div className="admin-login-intro">
          <span className="admin-eyebrow">Editorial workspace</span>
          <h1>Welcome back.</h1>
          <p>Sign in with your authorized newsroom account.</p>
        </div>
        {sessionError && <p className="admin-form-error" role="alert">{sessionError}</p>}
        <form className="admin-form" onSubmit={submit}>
          <label htmlFor="admin-email">Email address</label>
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label htmlFor="admin-password">Password</label>
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
        <p className="admin-login-footnote">Access is limited to provisioned editorial accounts.</p>
      </section>
    </main>
  );
}
