import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getCategories, getNews } from '../api/news.js';
import CategoryFilter from '../components/CategoryFilter.jsx';
import NewsSearch from '../components/NewsSearch.jsx';
import StoryCard from '../components/StoryCard.jsx';
import { EmptyState, ErrorState, StoryGridSkeleton } from '../components/NewsStates.jsx';

export default function NewsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const [categories, setCategories] = useState([]);
  const [categoryError, setCategoryError] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getCategories({ signal: controller.signal })
      .then(setCategories)
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') setCategoryError(fetchError.message);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getNews({ page, limit: 9, q: query || undefined, category: category || undefined, signal: controller.signal })
      .then(setResult)
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') setError(fetchError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, query, category, attempt]);

  const updateFilters = useCallback((updates) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(updates)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      if (!Object.hasOwn(updates, 'page')) next.delete('page');
      return next;
    });
  }, [setSearchParams]);

  const articles = result?.data ?? [];
  const pagination = result?.pagination;

  return (
    <div className="site-shell news-page">
      <div className="page-intro">
        <span className="eyebrow">The newsroom</span>
        <h1>Latest <em>news.</em></h1>
        <p>Reporting, perspectives and updates from across Tamil Nadu’s startup ecosystem.</p>
      </div>

      <div className="news-tools">
        <NewsSearch initialValue={query} onSearch={(value) => updateFilters({ q: value })} />
        <CategoryFilter
          categories={categories}
          selected={category}
          onChange={(value) => updateFilters({ category: value })}
          disabled={Boolean(categoryError) && categories.length === 0}
        />
        {categoryError && categories.length === 0 && (
          <p className="inline-error" role="status">
            Categories are temporarily unavailable. You can still search all published stories.
          </p>
        )}
      </div>

      {query && (
        <p className="results-label">
          Results for <strong>“{query}”</strong>{category && <> in <strong>{categories.find((item) => item.slug === category)?.name ?? category}</strong></>}
        </p>
      )}

      {loading && <StoryGridSkeleton count={6} />}
      {!loading && error && <ErrorState message={error} onRetry={() => setAttempt((value) => value + 1)} />}
      {!loading && !error && articles.length === 0 && (
        <EmptyState
          title={query || category ? 'No stories match those filters.' : 'The newsroom is getting ready.'}
          message={query || category
            ? 'Try a different search or select another category.'
            : 'No articles have been published yet. Please check back soon.'}
        />
      )}
      {!loading && !error && articles.length > 0 && (
        <>
          <div className="story-grid news-grid" key={`${category}-${query}-${page}`}>
            {articles.map((article) => <StoryCard article={article} key={article.id} />)}
          </div>
          {pagination?.totalPages > 1 && (
            <nav className="pagination" aria-label="News pages">
              <button
                className="button button--outline"
                type="button"
                disabled={page <= 1}
                onClick={() => updateFilters({ page: String(page - 1) })}
              >
                <span aria-hidden="true">←</span> Previous
              </button>
              <span aria-live="polite">Page {page} of {pagination.totalPages}</span>
              <button
                className="button button--outline"
                type="button"
                disabled={page >= pagination.totalPages}
                onClick={() => updateFilters({ page: String(page + 1) })}
              >
                Next <span aria-hidden="true">→</span>
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
