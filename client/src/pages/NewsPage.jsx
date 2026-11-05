import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getCategories, getNews } from '../api/news.js';
import CategoryFilter from '../components/CategoryFilter.jsx';
import NewsSearch from '../components/NewsSearch.jsx';
import RevealSection from '../components/RevealSection.jsx';
import StoryCard from '../components/StoryCard.jsx';
import { EmptyState, ErrorState, StoryGridSkeleton } from '../components/NewsStates.jsx';
import { usePublicPreferences } from '../contexts/PublicPreferencesContext.jsx';

export default function NewsPage() {
  const { t: tI18n } = useTranslation('public');
  const { translate: t } = usePublicPreferences();
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
    setError("");
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
        <span className="eyebrow">{t('The newsroom')}</span>
        <h1>{t('Latest')} <em>{t('news.')}</em></h1>
        <p>{t('Reporting, perspectives and updates from across Tamil Nadu’s startup ecosystem.')}</p>
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
            {t('Categories are temporarily unavailable. You can still search all published stories.')}
          </p>
        )}
      </div>

      {query && (
        <p className="results-label">
          {t('Results for')} <strong>{tI18n("“", { defaultValue: "“" })}{query}{tI18n("”", { defaultValue: "”" })}</strong>{category && <> {t('in')} <strong>{t(categories.find((item) => item.slug === category)?.name ?? category)}</strong></>}
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
          <RevealSection as="div" className="story-grid news-grid" key={`${category}-${query}-${page}`}>
            {articles.map((article) => <StoryCard article={article} key={article.id} />)}
          </RevealSection>
          {pagination?.totalPages > 1 && (
            <nav className="pagination" aria-label={t('News pages')}>
              <button
                className="button button--outline"
                type="button"
                disabled={page <= 1}
                onClick={() => updateFilters({ page: String(page - 1) })}
              >
                <span aria-hidden="true">{tI18n("←", { defaultValue: "←" })}</span> {t('Previous')}
              </button>
              <span aria-live="polite">{t('Page')} {page} {t('of')} {pagination.totalPages}</span>
              <button
                className="button button--outline"
                type="button"
                disabled={page >= pagination.totalPages}
                onClick={() => updateFilters({ page: String(page + 1) })}
              >
                {t('Next')} <span aria-hidden="true">{tI18n("→", { defaultValue: "→" })}</span>
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
