import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getNews } from '../api/news.js';
import ArticleMeta from '../components/ArticleMeta.jsx';
import NewsTicker from '../components/NewsTicker.jsx';
import RevealSection from '../components/RevealSection.jsx';
import StoryCard from '../components/StoryCard.jsx';
import StoryImage from '../components/StoryImage.jsx';
import { EmptyState, ErrorState } from '../components/NewsStates.jsx';

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
  const supporting = useMemo(
    () => articles.filter((article) => article.id !== featured?.id).slice(0, 3),
    [articles, featured]
  );
  const latest = articles.filter((article) => article.id !== featured?.id);
  const tickerArticles = articles.slice(0, 5);
  const trending = articles.filter((article) => article.is_featured && article.id !== featured?.id);
  const categorySections = ['Startups', 'Funding', 'Events', 'Policy', 'Innovation', 'Ecosystem']
    .map((name) => ({
      name,
      slug: name.toLowerCase(),
      articles: articles.filter((article) => article.category_name?.toLowerCase() === name.toLowerCase()).slice(0, 3)
    }))
    .filter((category) => category.articles.length > 0);

  return (
    <>
      <section className="edition-strip">
        <div className="site-shell edition-inner">
          <span className="edition-mark" aria-hidden="true" />
          <p>Latest from Tamil Nadu’s startup ecosystem</p>
          <Link to="/news/">Explore the latest <span aria-hidden="true">→</span></Link>
        </div>
      </section>
      <div className="site-shell home-content">
        {loading && <HomeLoading />}
        {!loading && error && <ErrorState message={error} onRetry={() => setAttempt((value) => value + 1)} />}
        {!loading && !error && !featured && (
          <section className="home-empty-wrap" aria-label="No published stories">
            <EmptyState
              title="The newsroom is getting ready."
              message="There are no published stories just yet. Check back soon for verified news and updates from Tamil Nadu’s startup ecosystem."
            />
            <Link className="button button--outline" to="/news/">Explore the newsroom <span aria-hidden="true">→</span></Link>
          </section>
        )}

        {!loading && !error && featured && (
          <>
            <NewsTicker articles={tickerArticles} />

            <RevealSection
              className={`front-page-lead${supporting.length === 0 ? ' front-page-lead--solo' : ''}`}
              aria-labelledby="featured-heading"
            >
              <div className="front-page-lead-main">
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
                  <span className="eyebrow eyebrow--gold">Featured story</span>
                  <ArticleMeta article={featured} />
                  <h1 id="featured-heading">
                    <Link to={`/news/${encodeURIComponent(featured.slug)}`}>{featured.title}</Link>
                  </h1>
                  {featured.summary && <p>{featured.summary}</p>}
                  <Link className="button button--gold" to={`/news/${encodeURIComponent(featured.slug)}`}>
                    Read the story <span aria-hidden="true">↗</span>
                  </Link>
                </div>
              </div>
              <aside className="lead-support" aria-labelledby="lead-support-heading">
                <div className="section-heading section-heading--row lead-support-heading">
                  <div>
                    <span className="eyebrow">The newsroom</span>
                    <h2 id="lead-support-heading">More headlines</h2>
                  </div>
                  <Link className="text-link" to="/news/" aria-label="Browse all latest news">All news →</Link>
                </div>
                {supporting.length > 0 ? supporting.map((article) => (
                  <SupportingStory article={article} key={article.id} />
                )) : (
                  <p className="single-story-note">More reporting from the ecosystem will appear here as it is published.</p>
                )}
              </aside>
            </RevealSection>

            <RevealSection
              className={`latest-section${latest.length === 0 ? ' latest-section--empty' : ''}`}
              aria-labelledby="latest-heading"
            >
              <div className="section-heading section-heading--row">
                <div>
                  <span className="eyebrow">New reporting and updates</span>
                  <h2 id="latest-heading">Latest news</h2>
                </div>
                <Link className="text-link section-more" to="/news/">
                  All news <span aria-hidden="true">→</span>
                </Link>
              </div>
              {latest.length > 0 ? (
                <div className={`story-grid${latest.length === 1 ? ' story-grid--single' : latest.length === 2 ? ' story-grid--double' : ''}`}>
                  {latest.map((article, index) => (
                    <StoryCard
                      article={article}
                      featured={latest.length === 1 || (latest.length >= 3 && index === 0)}
                      index={index}
                      key={article.id}
                    />
                  ))}
                </div>
              ) : (
                <p className="single-story-note">The published stories above are the latest from the newsroom.</p>
              )}
              {result?.pagination?.total > articles.length && (
                <div className="center-action">
                  <Link className="button button--outline" to="/news/">Browse all stories</Link>
                </div>
              )}
            </RevealSection>

            {trending.length > 0 && (
              <RevealSection className="trending-section" aria-labelledby="trending-heading">
                <div className="section-heading section-heading--row">
                  <div>
                    <span className="eyebrow">Featured picks from the newsroom</span>
                    <h2 id="trending-heading">Featured stories</h2>
                  </div>
                </div>
                <div className="trending-list">
                  {trending.map((article, index) => (
                    <SupportingStory article={article} key={article.id} index={index + 1} />
                  ))}
                </div>
              </RevealSection>
            )}

            {categorySections.length > 0 && (
              <RevealSection
                className={`category-sections${categorySections.length === 1 ? ' category-sections--single' : ''}`}
                aria-label="Latest by category"
              >
                {categorySections.map((category, index) => (
                  <section
                    className={`category-section${index % 2 ? ' category-section--alternate' : ''}${index === 0 && category.articles.length >= 3 ? ' category-section--lead' : ''}${index > 0 && category.articles.length >= 3 ? ' category-section--wide' : ''}`}
                    key={category.slug}
                    aria-labelledby={`category-${category.slug}`}
                  >
                    <div className="section-heading section-heading--row">
                      <div>
                        <span className="eyebrow">From the ecosystem</span>
                        <h2 id={`category-${category.slug}`}>{category.name}</h2>
                      </div>
                      <Link className="text-link" to={`/news/?category=${category.slug}`}>
                        More {category.name} <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                    <div className={`story-grid category-story-grid${category.articles.length === 1 ? ' category-story-grid--single' : category.articles.length === 2 ? ' category-story-grid--double' : ''}`}>
                      {category.articles.map((article, storyIndex) => (
                        <StoryCard
                          article={article}
                          featured={index === 0 && category.articles.length >= 3 && storyIndex === 0}
                          index={storyIndex}
                          key={article.id}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </RevealSection>
            )}
          </>
        )}
      </div>
    </>
  );
}

function SupportingStory({ article, index }) {
  return (
    <article className={`supporting-story${index ? ' supporting-story--numbered' : ''}`}>
      {index && <span className="supporting-story-number" aria-hidden="true">{String(index).padStart(2, '0')}</span>}
      <Link
        className="supporting-story-image"
        to={`/news/${encodeURIComponent(article.slug)}`}
        aria-label={`Read story: ${article.title}`}
      >
        <StoryImage src={article.cover_image_url} alt="" />
      </Link>
      <div className="supporting-story-copy">
        <ArticleMeta article={article} />
        <h3><Link to={`/news/${encodeURIComponent(article.slug)}`}>{article.title}</Link></h3>
      </div>
    </article>
  );
}

function HomeLoading() {
  return (
    <div className="home-loading" aria-label="Loading news" aria-busy="true">
      <div className="home-loading-lead skeleton" />
      <div className="home-loading-support">
        <div className="skeleton skeleton-line skeleton-medium" />
        {[0, 1, 2].map((item) => (
          <div className="home-loading-row" key={item}>
            <div className="skeleton home-loading-thumb" />
            <div className="home-loading-row-copy">
              <div className="skeleton skeleton-line skeleton-short" />
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line skeleton-medium" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
