import { useTranslation } from 'react-i18next';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getNews } from '../api/news.js';
import { getPublicHeroSlides } from '../api/news.js';
import ArticleMeta from '../components/ArticleMeta.jsx';
import NewsTicker from '../components/NewsTicker.jsx';
import RevealSection from '../components/RevealSection.jsx';
import StoryCard from '../components/StoryCard.jsx';
import StoryImage from '../components/StoryImage.jsx';
import HomeHeroSlider from '../components/HomeHeroSlider.jsx';
import HomeVideosSection from '../components/HomeVideosSection.jsx';
import { EmptyState, ErrorState } from '../components/NewsStates.jsx';
import { usePublicPreferences } from '../contexts/PublicPreferencesContext.jsx';

export default function HomePage() {
  const { t: tI18n } = useTranslation('public');
  const { translate: t } = usePublicPreferences();
  const [result, setResult] = useState(null);
  const [heroSlides, setHeroSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      getPublishedArticles(controller.signal),
      getPublicHeroSlides({ signal: controller.signal }).catch((failure) => {
        if (failure.name === 'AbortError') throw failure;
        return { data: [] };
      })
    ])
      .then(([news, slider]) => {
        setResult(news);
        setHeroSlides(slider.data ?? []);
      })
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') setError(fetchError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);

  const fetchedArticles = result?.data ?? [];
  const articles = fetchedArticles.slice(0, 9);
  const featured = useMemo(
    () => fetchedArticles.find((article) => article.is_featured) ?? fetchedArticles[0],
    [fetchedArticles]
  );
  const recentArticles = useMemo(
    () => [...fetchedArticles].sort(
      (a, b) => Date.parse(b.published_at) - Date.parse(a.published_at)
    ),
    [fetchedArticles]
  );
  const moreHeadlines = useMemo(() => recentArticles.slice(0, 10), [recentArticles]);
  const latest = articles.filter((article) => article.id !== featured?.id);
  const tickerArticles = recentArticles.slice(0, 5);
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
      <div className="home-ticker-band">
        <div className="site-shell home-ticker-shell">
          <NewsTicker articles={tickerArticles} />
        </div>
      </div>
      <div className="site-shell home-content">
        {loading && <HomeLoading />}
        {!loading && error && <ErrorState message={error} onRetry={() => setAttempt((value) => value + 1)} />}
        {!loading && !error && !featured && !heroSlides.length && (
          <section className="home-empty-wrap" aria-label={t('No published stories')}>
            <EmptyState
              title={tI18n("The newsroom is getting ready.", { defaultValue: "The newsroom is getting ready." })}
              message={t('There are no published stories just yet. Check back soon for verified news and updates from Tamil Nadu’s startup ecosystem.')}
            />
            <Link className="button button--outline" to="/news/">{t('Explore the newsroom')} <span aria-hidden="true">{tI18n("→", { defaultValue: "→" })}</span></Link>
          </section>
        )}

        {!loading && !error && (featured || heroSlides.length > 0) && (
          <>
            <RevealSection
              className={`front-page-lead${moreHeadlines.length === 0 ? ' front-page-lead--solo' : ''}`}
              aria-labelledby="featured-heading"
            >
              {heroSlides.length > 0 ? <HomeHeroSlider slides={heroSlides} /> : <div className="front-page-lead-main">
                <Link
                  className="featured-image-link"
                  to={`/news/${encodeURIComponent(featured.slug)}`}
                  aria-label={`Read featured story: ${featured.title}`}
                >
                  <StoryImage
                    src={featured.cover_image_url}
                    alt=""
                    priority
                    articleSlug={featured.slug}
                    className="featured-image"
                  />
                </Link>
                <div className="featured-copy">
                  <h1 id="featured-heading">
                    <Link to={`/news/${encodeURIComponent(featured.slug)}`}>{featured.title}</Link>
                  </h1>
                  <Link className="button button--gold" to={`/news/${encodeURIComponent(featured.slug)}`}>
                    {t('Read the story')} <span aria-hidden="true">{tI18n("↗", { defaultValue: "↗" })}</span>
                  </Link>
                </div>
              </div>}
              <MoreHeadlines articles={moreHeadlines} />
            </RevealSection>

            <RevealSection
              className={`latest-section${latest.length === 0 ? ' latest-section--empty' : ''}`}
              aria-labelledby="latest-heading"
            >
              <div className="section-heading section-heading--row">
                <div>
                  <span className="eyebrow">{t('New reporting and updates')}</span>
                  <h2 id="latest-heading">{t('Latest news')}</h2>
                </div>
                <Link className="text-link section-more" to="/news/">
                  {t('All news')} <span aria-hidden="true">{tI18n("→", { defaultValue: "→" })}</span>
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
                <p className="single-story-note">{t('The published stories above are the latest from the newsroom.')}</p>
              )}
              {result?.pagination?.total > articles.length && (
                <div className="center-action">
                  <Link className="button button--outline" to="/news/">{t('Browse all stories')}</Link>
                </div>
              )}
            </RevealSection>

            <HomeVideosSection />

            {trending.length > 0 && (
              <RevealSection className="trending-section" aria-labelledby="trending-heading">
                <div className="section-heading section-heading--row">
                  <div>
                    <span className="eyebrow">{t('Featured picks from the newsroom')}</span>
                    <h2 id="trending-heading">{t('Featured stories')}</h2>
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
                aria-label={t('Latest by category')}
              >
                {categorySections.map((category, index) => (
                  <section
                    className={`category-section${index % 2 ? ' category-section--alternate' : ''}${index === 0 && category.articles.length >= 3 ? ' category-section--lead' : ''}${index > 0 && category.articles.length >= 3 ? ' category-section--wide' : ''}`}
                    key={category.slug}
                    aria-labelledby={`category-${category.slug}`}
                  >
                    <div className="section-heading section-heading--row">
                      <div>
                        <span className="eyebrow">{t('From the ecosystem')}</span>
                        <h2 id={`category-${category.slug}`}>{t(category.name)}</h2>
                      </div>
                      <Link className="text-link" to={`/news/?category=${category.slug}`}>
                        {t('More')} {t(category.name)} <span aria-hidden="true">{tI18n("→", { defaultValue: "→" })}</span>
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

async function getPublishedArticles(signal) {
  const firstPage = await getNews({ page: 1, limit: 50, signal });
  const totalPages = firstPage.pagination?.totalPages ?? 1;
  const remainingPages = await Promise.all(
    Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) =>
      getNews({ page: index + 2, limit: 50, signal })
    )
  );
  return {
    ...firstPage,
    data: [firstPage, ...remainingPages].flatMap((page) => page.data)
  };
}

function MoreHeadlines({ articles }) {
  const { t: tI18n } = useTranslation('public');
  const { translate: t } = usePublicPreferences();
  const listRef = useRef(null);
  const [looping, setLooping] = useState(false);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;

    const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const measure = () => {
      const firstSequence = list.firstElementChild;
      setLooping(Boolean(
        articles.length &&
        !motionPreference?.matches &&
        firstSequence &&
        firstSequence.offsetHeight > list.clientHeight
      ));
    };

    measure();
    motionPreference?.addEventListener?.('change', measure);
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => {
        window.removeEventListener('resize', measure);
        motionPreference?.removeEventListener?.('change', measure);
      };
    }

    const observer = new ResizeObserver(measure);
    observer.observe(list);
    if (list.firstElementChild) observer.observe(list.firstElementChild);
    return () => {
      observer.disconnect();
      motionPreference?.removeEventListener?.('change', measure);
    };
  }, [articles]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || !looping) return undefined;

    let frameId = 0;
    let interactionTimer = 0;
    let lastTimestamp = 0;
    let scrollPosition = list.scrollTop;
    let interactionPaused = false;

    const resumeAfterInteraction = () => {
      interactionPaused = false;
      interactionTimer = 0;
      scrollPosition = list.scrollTop;
      lastTimestamp = 0;
    };
    const pauseForInteraction = () => {
      interactionPaused = true;
      lastTimestamp = 0;
      window.clearTimeout(interactionTimer);
      interactionTimer = window.setTimeout(resumeAfterInteraction, 3000);
    };

    const animate = (timestamp) => {
      const delta = lastTimestamp ? Math.max(timestamp - lastTimestamp, 0) : 0;
      lastTimestamp = interactionPaused ? 0 : timestamp;

      const firstSequence = list.firstElementChild;
      const loopHeight = firstSequence?.offsetHeight ?? 0;
      if (!interactionPaused && loopHeight > list.clientHeight) {
        scrollPosition = (scrollPosition + delta * 0.016) % loopHeight;
        list.scrollTop = scrollPosition;
      }
      frameId = window.requestAnimationFrame(animate);
    };
    list.addEventListener('wheel', pauseForInteraction, { passive: true });
    list.addEventListener('touchstart', pauseForInteraction, { passive: true });
    list.addEventListener('touchmove', pauseForInteraction, { passive: true });
    list.addEventListener('touchend', pauseForInteraction, { passive: true });
    list.addEventListener('touchcancel', pauseForInteraction, { passive: true });
    list.addEventListener('keydown', pauseForInteraction);
    frameId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(interactionTimer);
      list.removeEventListener('wheel', pauseForInteraction);
      list.removeEventListener('touchstart', pauseForInteraction);
      list.removeEventListener('touchmove', pauseForInteraction);
      list.removeEventListener('touchend', pauseForInteraction);
      list.removeEventListener('touchcancel', pauseForInteraction);
      list.removeEventListener('keydown', pauseForInteraction);
    };
  }, [looping]);

  return (
    <aside className="lead-support" aria-labelledby="lead-support-heading">
      <div className="section-heading section-heading--row lead-support-heading">
        <div>
          <span className="eyebrow">{t('The newsroom')}</span>
          <h2 id="lead-support-heading">{t('More headlines')}</h2>
        </div>
        <Link className="text-link" to="/news/" aria-label={t('Browse all latest news')}>{t('All news')} {tI18n("→", { defaultValue: "→" })}</Link>
      </div>
      {articles.length > 0 ? (
        <div
          className="lead-support-list"
          ref={listRef}
          role="region"
          aria-label={t('More headlines list')}
          tabIndex={0}
        >
          <div className="lead-support-sequence">
            {articles.map((article) => (
              <SupportingStory article={article} key={article.id} />
            ))}
          </div>
          {looping && (
            <div className="lead-support-sequence" aria-hidden="true" inert>
              {articles.map((article) => (
                <SupportingStory article={article} key={`loop-${article.id}`} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="single-story-note">{t('More reporting from the ecosystem will appear here as it is published.')}</p>
      )}
    </aside>
  );
}

function SupportingStory({ article, index }) {
  const { t: tI18n } = useTranslation('public');
  const { translate: t } = usePublicPreferences();
  return (
    <article className={`supporting-story${index ? ' supporting-story--numbered' : ''}`}>
      {index && <span className="supporting-story-number" aria-hidden="true">{String(index).padStart(2, '0')}</span>}
      <Link
        className="supporting-story-image"
        to={`/news/${encodeURIComponent(article.slug)}`}
        aria-label={`${t('Read story')}: ${article.title}`}
      >
        <StoryImage src={article.cover_image_url} alt="" articleSlug={article.slug} />
      </Link>
      <div className="supporting-story-copy">
        <ArticleMeta article={article} />
        <h3><Link to={`/news/${encodeURIComponent(article.slug)}`}>{article.title}</Link></h3>
      </div>
    </article>
  );
}

function HomeLoading() {
  const { t: tI18n } = useTranslation('public');
  const { translate: t } = usePublicPreferences();
  return (
    <div className="home-loading" aria-label={t('Loading news')} aria-busy="true">
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
