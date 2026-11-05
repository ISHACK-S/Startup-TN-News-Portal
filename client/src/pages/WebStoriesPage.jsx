import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublicWebStories } from '../api/news.js';
import { EmptyState, ErrorState } from '../components/NewsStates.jsx';

export default function WebStoriesPage() {
  const { t: tI18n } = useTranslation('public');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getPublicWebStories({ page, signal: controller.signal })
      .then(setResult)
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, attempt]);

  return (
    <div className="site-shell public-content-page">
      <header className="section-heading public-page-heading">
        <span className="eyebrow">{tI18n("Visual reporting", { defaultValue: "Visual reporting" })}</span>
        <h1>{tI18n("Web Stories", { defaultValue: "Web Stories" })}</h1>
        <p>{tI18n("Short visual stories from across Tamil Nadu’s startup ecosystem.", { defaultValue: "Short visual stories from across Tamil Nadu’s startup ecosystem." })}</p>
      </header>
      {loading && <div role="status" className="public-content-loading">{tI18n("Loading stories…", { defaultValue: "Loading stories…" })}</div>}
      {!loading && error && <ErrorState message={error} onRetry={() => setAttempt((value) => value + 1)} />}
      {!loading && !error && !result?.data?.length && <EmptyState title={tI18n("No published stories yet", { defaultValue: "No published stories yet" })} message="Check back soon for visual stories from the newsroom." />}
      {!loading && !error && result?.data?.length > 0 && <>
        <div className="public-stories-grid">
          {result.data.map((story) => (
            <Link className="public-story-card" key={story.id} to={`/stories/${encodeURIComponent(story.slug)}`}>
              {story.cover_image_url && <img src={story.cover_image_url} alt="" loading="lazy" />}
              <span className="eyebrow">{tI18n("Web story ·", { defaultValue: "Web story ·" })} {story.slide_count ?? 0} {tI18n("slides", { defaultValue: "slides" })}</span>
              <h2>{story.title}</h2>
              {story.description && <p>{story.description}</p>}
            </Link>
          ))}
        </div>
        {result.pagination?.totalPages > 1 && <nav className="public-pagination" aria-label={tI18n("Story pagination", { defaultValue: "Story pagination" })}>
          <button type="button" className="button button--outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{tI18n("Previous", { defaultValue: "Previous" })}</button>
          <span>{tI18n("Page", { defaultValue: "Page" })} {page} {tI18n("of", { defaultValue: "of" })} {result.pagination.totalPages}</span>
          <button type="button" className="button button--outline" disabled={page >= result.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>{tI18n("Next", { defaultValue: "Next" })}</button>
        </nav>}
      </>}
    </div>
  );
}
