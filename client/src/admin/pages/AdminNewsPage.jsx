import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteAdminArticle, getAdminArticles, updateAdminArticle } from '../../api/admin.js';
import { formatDate } from '../../components/ArticleMeta.jsx';
import { AdminEmpty, AdminError, AdminLoading, ConfirmDialog } from '../components/AdminStates.jsx';
import { StatusBadge } from './AdminDashboardPage.jsx';

export default function AdminNewsPage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      setResult(await getAdminArticles({
        page,
        limit: 10,
        q: query || undefined,
        status: status || undefined,
        signal
      }));
    } catch (loadError) {
      if (loadError.name !== 'AbortError') setError(loadError.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, query, status]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, attempt]);

  function submitSearch(event) {
    event.preventDefault();
    setPage(1);
    setQuery(search.trim());
  }

  async function togglePublish(article) {
    setError('');
    setNotice('');
    const wasPublished = article.status === 'published';
    try {
      await updateAdminArticle(article.id, {
        status: wasPublished ? 'draft' : 'published'
      });
      setNotice(wasPublished ? 'Article moved to drafts.' : 'Article published successfully.');
      setAttempt((value) => value + 1);
    } catch (actionError) {
      setError(actionError.message);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    setError('');
    try {
      await deleteAdminArticle(pendingDelete.id);
      setNotice('Article deleted.');
      setPendingDelete(null);
      setAttempt((value) => value + 1);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setDeleteBusy(false);
    }
  }

  const articles = result?.data ?? [];
  const pagination = result?.pagination;

  return (
    <div className="admin-page">
      <div className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">Your editorial pipeline</span>
          <h1>Articles</h1>
          <p>Search, review and manage stories for publication.</p>
        </div>
        <Link className="admin-button admin-button--primary" to="/admin/news/new">＋ New article</Link>
      </div>

      {notice && <div className="admin-alert admin-alert--success" role="status">{notice}</div>}
      {error && <AdminError message={error} onRetry={() => setAttempt((value) => value + 1)} />}

      <section className="admin-panel admin-article-panel">
        <div className="admin-article-toolbar">
          <form className="admin-search-form" role="search" onSubmit={submitSearch}>
            <label className="sr-only" htmlFor="admin-article-search">Search articles</label>
            <input
              id="admin-article-search"
              type="search"
              placeholder="Search headlines and summaries"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="submit" className="admin-button admin-button--secondary">Search</button>
          </form>
          <label className="admin-status-select-label">
            <span className="sr-only">Filter by article status</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="published">Published</option>
              <option value="draft">Drafts</option>
            </select>
          </label>
        </div>

        {loading && <AdminLoading label="Loading articles…" />}
        {!loading && !error && articles.length === 0 && (
          <AdminEmpty
            title={query || status ? 'No matching articles.' : 'No articles yet.'}
            message={query || status
              ? 'Try another search or status filter.'
              : 'Create your first article to begin building the publication.'}
          />
        )}
        {!loading && articles.length > 0 && (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">Headline</th>
                    <th scope="col">Category</th>
                    <th scope="col">Updated</th>
                    <th scope="col">Status</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((article) => (
                    <tr key={article.id}>
                      <td className="admin-table-title">
                        <Link to={`/admin/news/${article.id}/edit`}>{article.title}</Link>
                        <span className="admin-table-slug">/{article.slug}</span>
                      </td>
                      <td>{article.category_name}</td>
                      <td>{formatDate(article.updated_at)}</td>
                      <td><StatusBadge status={article.status} /></td>
                      <td className="admin-table-actions">
                        <Link to={`/admin/news/${article.id}/edit`}>Edit</Link>
                        <button type="button" onClick={() => togglePublish(article)}>
                          {article.status === 'published' ? 'Unpublish' : 'Publish'}
                        </button>
                        <button className="admin-table-delete" type="button" onClick={() => setPendingDelete(article)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination?.totalPages > 1 && (
              <nav className="admin-pagination" aria-label="Article pages">
                <span>{pagination.total} articles</span>
                <div>
                  <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Previous</button>
                  <span>Page {page} of {pagination.totalPages}</span>
                  <button type="button" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next →</button>
                </div>
              </nav>
            )}
          </>
        )}
      </section>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this article?"
          message={`“${pendingDelete.title}” will be permanently removed. This cannot be undone. Its image will remain in Cloudinary.`}
          confirmLabel="Delete article"
          busy={deleteBusy}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
