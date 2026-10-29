import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminArticles } from '../../api/admin.js';
import ArticleMeta, { formatDate } from '../../components/ArticleMeta.jsx';
import { AdminEmpty, AdminError, AdminLoading } from '../components/AdminStates.jsx';

export default function AdminDashboardPage() {
  const [counts, setCounts] = useState({ published: 0, draft: 0 });
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError('');
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
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [attempt, load]);

  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">Good work starts with a clear view</span>
          <h1>Overview</h1>
          <p>Here’s the latest activity across your newsroom.</p>
        </div>
        <Link className="admin-button admin-button--primary" to="/admin/news/new">＋ New article</Link>
      </div>

      {error && <AdminError message={error} onRetry={() => setAttempt((value) => value + 1)} />}
      {loading && <AdminLoading label="Loading your newsroom…" />}
      {!loading && !error && (
        <>
          <section className="admin-stat-grid" aria-label="Article totals">
            <StatCard label="Published articles" value={counts.published} detail="Visible to the public" tone="red" />
            <StatCard label="Drafts" value={counts.draft} detail="In editorial review" />
            <StatCard label="Total articles" value={counts.published + counts.draft} detail="Across all statuses" />
          </section>

          <section className="admin-panel">
            <div className="admin-panel-heading">
              <div>
                <span className="admin-eyebrow">Recently updated</span>
                <h2>Latest articles</h2>
              </div>
              <Link className="admin-inline-link" to="/admin/news">Manage articles <span aria-hidden="true">→</span></Link>
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
                    <span className="admin-row-arrow" aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            ) : (
              <AdminEmpty
                title="Your newsroom is ready."
                message="Create a draft or publish your first story to get started."
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function StatusBadge({ status }) {
  return <span className={`admin-status admin-status--${status}`}>{status === 'published' ? 'Published' : 'Draft'}</span>;
}

function StatCard({ label, value, detail, tone }) {
  return (
    <article className={`admin-stat-card${tone ? ` admin-stat-card--${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
