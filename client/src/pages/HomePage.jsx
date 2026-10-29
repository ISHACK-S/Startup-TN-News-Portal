import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getNews } from '../api/news.js';
import ArticleMeta from '../components/ArticleMeta.jsx';
import StoryCard from '../components/StoryCard.jsx';
import StoryImage from '../components/StoryImage.jsx';
import { EmptyState, ErrorState, StoryGridSkeleton } from '../components/NewsStates.jsx';

export default function HomePage() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getNews({ page: 1, limit: 9, signal: controller.signal })
      .then(setResult)
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') setError(fetchError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);

  const articles = result?.data ?? [];
  const featured = useMemo(
    () => articles.find((article) => article.is_featured) ?? articles[0],
    [articles]
  );
  const latest = useMemo(
    () => articles.filter((article) => article.id !== featured?.id).slice(0, 6),
    [articles, featured]
  );

  return (
    <>
      <section className="edition-strip">
        <div className="site-shell edition-inner">
          <span className="edition-mark" aria-hidden="true" />
          <p>Ideas in motion. Progress in focus.</p>
          <Link to="/news/">Explore the latest <span aria-hidden="true">→</span></Link>
        </div>
      </section>
      <div className="site-shell home-content">
        <div className="section-heading home-heading">
          <div>
            <span className="eyebrow">The StartupTN briefing</span>
            <h1>Stories shaping <em>tomorrow.</em></h1>
          </div>
          <p>News, people and ideas moving Tamil Nadu’s startup ecosystem forward.</p>
        </div>

        {loading && <StoryGridSkeleton count={3} />}
        {!loading && error && <ErrorState message={error} onRetry={() => setAttempt((value) => value + 1)} />}
        {!loading && !error && !featured && (
          <EmptyState
            title="A new chapter starts here."
            message="There are no published stories just yet. Check back soon for the latest from Tamil Nadu’s startup ecosystem."
          />
        )}

        {!loading && !error && featured && (
          <>
            <section className="featured-story" aria-labelledby="featured-heading">
              <Link
                className="featured-image-link"
                to={`/news/${encodeURIComponent(featured.slug)}`}
                aria-label={`Read featured story: ${featured.title}`}
              >
                <StoryImage
                  src={featured.cover_image_url}
                  alt=""
                  priority
                  className="featured-image"
                />
              </Link>
              <div className="featured-copy">
                <span className="eyebrow eyebrow--red">The lead story</span>
                <ArticleMeta article={featured} />
                <h2 id="featured-heading">
                  <Link to={`/news/${encodeURIComponent(featured.slug)}`}>{featured.title}</Link>
                </h2>
                {featured.summary && <p>{featured.summary}</p>}
                <Link className="button button--red" to={`/news/${encodeURIComponent(featured.slug)}`}>
                  Read the story <span aria-hidden="true">→</span>
                </Link>
              </div>
            </section>

            <section className="latest-section" aria-labelledby="latest-heading">
              <div className="section-heading section-heading--row">
                <div>
                  <span className="eyebrow">Fresh from the ecosystem</span>
                  <h2 id="latest-heading">Latest stories</h2>
                </div>
                <Link className="text-link section-more" to="/news/">
                  All news <span aria-hidden="true">→</span>
                </Link>
              </div>
              {latest.length > 0 ? (
                <div className="story-grid">
                  {latest.map((article) => <StoryCard article={article} key={article.id} />)}
                </div>
              ) : (
                <p className="single-story-note">You’re all caught up on the latest stories.</p>
              )}
              {result?.pagination?.total > articles.length && (
                <div className="center-action">
                  <Link className="button button--outline" to="/news/">Browse all stories</Link>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
