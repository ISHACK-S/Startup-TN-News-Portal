import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminArticles } from '../../api/admin.js';
import ArticleMeta, { formatDate } from '../../components/ArticleMeta.jsx';
import { AdminEmpty, AdminError, AdminLoading } from '../components/AdminStates.jsx';
import { useAdminAuth } from '../AdminAuthContext.jsx';
import { useAdminPermissions } from '../AdminPermissionContext.jsx';

export default function AdminDashboardPage() {
  const { t: tI18n } = useTranslation('admin');
  const { admin } = useAdminAuth();
  const { permissions, hasPermission } = useAdminPermissions();
  const [counts, setCounts] = useState({ published: 0, draft: 0 });
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError("");
    if (!hasPermission('news-articles', 'view')) {
      setRecent([]);
      setLoading(false);
      return;
    }
    try {
      const [published, drafts, articles] = await Promise.all([
        getAdminArticles({ status: 'published', limit: 1, signal }),
        getAdminArticles({ status: 'draft', limit: 1, signal }),
        getAdminArticles({ limit: 5, signal })
      ]);
      setCounts({
        published: published.pagination.total,
        draft: drafts.pagination.total
      });
      setRecent(articles.data);
    } catch (loadError) {
      if (loadError.name !== 'AbortError') setError(loadError.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [hasPermission]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [attempt, load]);

  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">{tI18n("Administrative overview", { defaultValue: "Administrative overview" })}</span>
          <h1>{tI18n("Overview", { defaultValue: "Overview" })}</h1>
          <p>{tI18n("Your workspace and editorial activity, tailored to your access.", { defaultValue: "Your workspace and editorial activity, tailored to your access." })}</p>
        </div>
        <span className="admin-role-pill">{admin?.role}</span>
      </div>

      <section className="admin-panel admin-welcome-panel">
        <div>
          <span className="admin-eyebrow">{tI18n("Your access", { defaultValue: "Your access" })}</span>
          <h2>{tI18n("Welcome back,", { defaultValue: "Welcome back," })} {admin?.name}</h2>
          <p>{tI18n("Your role is", { defaultValue: "Your role is" })} <strong>{admin?.role}</strong>{tI18n(". Available modules and actions are enforced by the server.", { defaultValue: ". Available modules and actions are enforced by the server." })}</p>
        </div>
        <div className="admin-dashboard-actions" aria-label={tI18n("Quick actions", { defaultValue: "Quick actions" })}>
          {hasPermission('news-articles', 'create') && (
            <Link className="admin-button admin-button--primary" to="/admin/news/new">{tI18n("＋ New article", { defaultValue: "＋ New article" })}</Link>
          )}
          {hasPermission('news-articles', 'view') && (
            <Link className="admin-button admin-button--secondary" to="/admin/news">{tI18n("Manage articles", { defaultValue: "Manage articles" })}</Link>
          )}
          {hasPermission('role-builder', 'view') && (
            <Link className="admin-button admin-button--secondary" to="/admin/role-builder">{tI18n("Manage roles", { defaultValue: "Manage roles" })}</Link>
          )}
        </div>
      </section>

      {error && <AdminError message={error} onRetry={() => setAttempt((value) => value + 1)} />}
      {loading && <AdminLoading label="Loading your newsroom…" />}
      {!loading && !error && (
        <>
          {hasPermission('news-articles', 'view') && (
            <section className="admin-stat-grid" aria-label={tI18n("Article totals", { defaultValue: "Article totals" })}>
              <StatCard label="Published articles" value={counts.published} detail="Visible to the public" tone="red" />
              <StatCard label="Drafts" value={counts.draft} detail="In editorial review" />
              <StatCard label="Total articles" value={counts.published + counts.draft} detail="Across all statuses" />
            </section>
          )}

          {hasPermission('news-articles', 'view') && <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <span className="admin-eyebrow">{tI18n("Recently updated", { defaultValue: "Recently updated" })}</span>
                <h2>{tI18n("Latest articles", { defaultValue: "Latest articles" })}</h2>
              </div>
              <Link className="admin-inline-link" to="/admin/news">{tI18n("Manage articles", { defaultValue: "Manage articles" })} <span aria-hidden="true">{tI18n("→", { defaultValue: "→" })}</span></Link>
            </div>
            {recent.length ? (
              <div className="admin-recent-list">
                {recent.map((article) => (
                  <Link className="admin-recent-item" to={`/admin/news/${article.id}/edit`} key={article.id}>
                    <span className="admin-recent-copy">
                      <strong>{article.title}</strong>
                      <span><ArticleMeta article={article} /></span>
                    </span>
                    <StatusBadge status={article.status} />
                    <span className="admin-recent-date">{formatDate(article.updated_at)}</span>
                    <span className="admin-row-arrow" aria-hidden="true">{tI18n("→", { defaultValue: "→" })}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <AdminEmpty
                title={tI18n("Your newsroom is ready.", { defaultValue: "Your newsroom is ready." })}
                message="Create a draft or publish your first story to get started."
              />
            )}
          </section>}

          <section className="admin-panel admin-available-modules">
            <div className="admin-panel-heading">
              <div>
                <span className="admin-eyebrow">{tI18n("Permission-aware workspace", { defaultValue: "Permission-aware workspace" })}</span>
                <h2>{tI18n("Available modules", { defaultValue: "Available modules" })}</h2>
              </div>
            </div>
            <div className="admin-module-list">
              {(permissions?.modules ?? [])
                .filter((module) => module.isVisible && module.isAvailable && module.isActive)
                .map((module) => (
                  <span className="admin-module-chip" key={module.moduleId}>
                    <strong>{module.label}</strong>
                    <small>{module.navigationGroup}</small>
                  </span>
                ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export function StatusBadge({ status }) {
  const { t: tI18n } = useTranslation('admin');
  return <span className={`admin-status admin-status--${status}`}>{status === 'published' ? 'Published' : 'Draft'}</span>;
}

function StatCard({ label, value, detail, tone }) {
  const { t: tI18n } = useTranslation('admin');
  return (
    <article className={`admin-stat-card${tone ? ` admin-stat-card--${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
