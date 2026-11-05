import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getArticle, getNews } from '../api/news.js';
import ArticleMeta, { formatDate } from '../components/ArticleMeta.jsx';
import ArticleContent from '../components/ArticleContent.jsx';
import NewsSearch from '../components/NewsSearch.jsx';
import RevealSection from '../components/RevealSection.jsx';
import StoryImage from '../components/StoryImage.jsx';
import { ErrorState, LoadingArticle } from '../components/NewsStates.jsx';
import { usePublicPreferences } from '../contexts/PublicPreferencesContext.jsx';

export default function ArticlePage() {
  const { t: tI18n } = useTranslation('public');
  const { language, translate: t } = usePublicPreferences();
  const { slug } = useParams();
  const navigate = useNavigate();
  const [article, setArticle] = useState(null);
  const [recentStories, setRecentStories] = useState([]);
  const [recentStoriesError, setRecentStoriesError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [readingProgress, setReadingProgress] = useState(0);
  const readingAreaRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setArticle(null);
    getArticle(slug, { signal: controller.signal })
      .then(setArticle)
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') setError(fetchError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [slug, attempt]);

  useEffect(() => {
    const controller = new AbortController();
    setRecentStories([]);
    setRecentStoriesError('');
    getNews({ page: 1, limit: 9, signal: controller.signal })
      .then((result) => setRecentStories(result.data))
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') setRecentStoriesError(fetchError.message);
      });
    return () => controller.abort();
  }, [slug]);

  useEffect(() => {
    if (!article) return undefined;
    let frame = 0;
    const updateProgress = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const area = readingAreaRef.current;
        if (!area) return;
        const start = area.getBoundingClientRect().top + window.scrollY;
        const marker = window.scrollY + window.innerHeight * 0.45;
        const progress = Math.max(0, Math.min(100, ((marker - start) / area.offsetHeight) * 100));
        setReadingProgress(progress);
      });
    };
    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', updateProgress);
      window.removeEventListener('resize', updateProgress);
    };
  }, [article]);

  const recommendations = useMemo(() => recentStories
    .filter((story) => story.id !== article?.id)
    .sort((first, second) => (
      Number(second.category_slug === article?.category_slug)
      - Number(first.category_slug === article?.category_slug)
    ))
    .slice(0, 3), [article, recentStories]);

  if (loading) return <LoadingArticle />;
  if (error || !article) {
    return (
      <div className="site-shell article-error">
        <ErrorState
          message={t(error || 'This story may have moved, or is no longer available.')}
          onRetry={error ? () => setAttempt((value) => value + 1) : undefined}
        />
        <Link className="text-link" to="/news/">{tI18n("←", { defaultValue: "←" })} {t('Back to latest news')}</Link>
      </div>
    );
  }

  const articleUrl = `${window.location.origin}/news/${encodeURIComponent(article.slug)}`;
  const shareText = encodeURIComponent(article.title);
  const wordCount = article.content
    .replace(/!\[[^\]\r\n]*\]\(https:\/\/[^)\s]+\)/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 220));

  return (
    <article className="article-page">
      <div
        className="reading-progress"
        role="progressbar"
        aria-label={t('Article reading progress')}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(readingProgress)}
      >
        <span style={{ transform: `scaleX(${readingProgress / 100})` }} />
      </div>
      <header className="article-cover">
        <StoryImage
          className="article-hero-image"
          src={article.cover_image_url}
          alt=""
          priority
        />
        <div className="article-cover-shade" />
        <div className="article-heading site-shell">
          <nav className="article-breadcrumbs" aria-label={t('Breadcrumb')}>
            <Link to="/">{t('Home')}</Link>
            <span aria-hidden="true">{tI18n("/", { defaultValue: "/" })}</span>
            <Link to="/news/">{t('News')}</Link>
            {article.category_name && (
              <>
                <span aria-hidden="true">{tI18n("/", { defaultValue: "/" })}</span>
                <Link to={article.category_slug ? `/news/?category=${article.category_slug}` : '/news/'}>
                  {t(article.category_name)}
                </Link>
              </>
            )}
          </nav>
          <ArticleMeta article={article} />
          <h1>{article.title}</h1>
          {article.summary && <p className="article-dek">{article.summary}</p>}
          <div className="article-byline">
            <span>{t('By')} <strong>{article.author_name}</strong></span>
            <span aria-hidden="true" className="byline-dot" />
            <span>{readingMinutes} {t('min read')}</span>
          </div>
        </div>
        <span className="article-cover-mark" aria-hidden="true">{tI18n("STARTUPTN / NEWS", { defaultValue: "STARTUPTN / NEWS" })}</span>
      </header>

      <div className="article-body-wrap">
        <div className="article-layout">
          <div className="article-body">
            <div className="article-body-heading">
              <span className="eyebrow">{t('The story')}</span>
              <span className="article-body-rule" aria-hidden="true" />
              <span className="article-body-reading">{readingMinutes} {t('min read')}</span>
            </div>
            <div ref={readingAreaRef} className="article-reading-area">
              <ArticleContent content={article.content} />
              {article.source_url && (
                <p className="source-attribution">
                  {t('Source:')} <a href={article.source_url} target="_blank" rel="noopener noreferrer">{article.source_url}</a>
                </p>
              )}
            </div>
            <div className="share-row" aria-label={t('Share this story')}>
              <span>{t('Share this story')}</span>
              <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(articleUrl)}`} target="_blank" rel="noopener noreferrer" aria-label={t('Share on Facebook')}>{tI18n("f", { defaultValue: "f" })}</a>
              <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(articleUrl)}`} target="_blank" rel="noopener noreferrer" aria-label={t('Share on LinkedIn')}>{tI18n("in", { defaultValue: "in" })}</a>
              <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(articleUrl)}&text=${shareText}`} target="_blank" rel="noopener noreferrer" aria-label={t('Share on X')}>{tI18n("𝕏", { defaultValue: "𝕏" })}</a>
              <a href={`mailto:?subject=${shareText}&body=${encodeURIComponent(articleUrl)}`} aria-label={t('Share by email')}>{tI18n("✉", { defaultValue: "✉" })}</a>
            </div>
          </div>
          <aside className="article-sidebar" aria-label={t('More from the newsroom')}>
            <section className="article-sidebar-panel article-search-panel">
              <span className="eyebrow">{t('Explore the newsroom')}</span>
              <h2>{t('Find a story')}</h2>
              <NewsSearch onSearch={(query) => navigate(`/news/${query ? `?q=${encodeURIComponent(query)}` : ''}`)} />
            </section>
            <section className="article-sidebar-panel article-info-panel">
              <span className="eyebrow">{t('The details')}</span>
              <h2>{t('About this story')}</h2>
              <dl>
                <div><dt>{t('Published')}</dt><dd>{formatDate(article.published_at || article.created_at, language)}</dd></div>
                <div><dt>{t('Written by')}</dt><dd>{article.author_name}</dd></div>
                <div><dt>{t('Reading time')}</dt><dd>{readingMinutes} {t('min')}</dd></div>
                {article.category_name && <div><dt>{t('Section')}</dt><dd>{t(article.category_name)}</dd></div>}
              </dl>
              {article.source_url && (
                <a className="article-sidebar-source" href={article.source_url} target="_blank" rel="noopener noreferrer">
                  {t('View original source')} <span aria-hidden="true">{tI18n("↗", { defaultValue: "↗" })}</span>
                </a>
              )}
            </section>
            <section className="article-sidebar-panel article-recent-panel">
              <div className="article-sidebar-heading">
                <div><span className="eyebrow">{t('Fresh from the desk')}</span><h2>{t('Recent stories')}</h2></div>
                <Link to="/news/" aria-label={t('Browse all recent stories')}>{t('All news')} <span aria-hidden="true">{tI18n("→", { defaultValue: "→" })}</span></Link>
              </div>
              {recentStoriesError && <p className="article-sidebar-note">{t('Recent stories are temporarily unavailable.')}</p>}
              {!recentStoriesError && recommendations.slice(0, 2).map((story) => (
                <RecentStory key={story.id} story={story} />
              ))}
              {!recentStoriesError && recommendations.length === 0 && (
                <p className="article-sidebar-note">{t('More reporting from the newsroom will appear here soon.')}</p>
              )}
            </section>
          </aside>
        </div>
        {recommendations.length > 0 && (
          <RevealSection className="article-related" aria-labelledby="article-related-heading">
            <div className="article-related-heading">
              <div><span className="eyebrow">{t('Continue exploring')}</span><h2 id="article-related-heading">{t('More from the newsroom')}</h2></div>
              <Link className="text-link" to="/news/">{t('All stories')} <span aria-hidden="true">{tI18n("→", { defaultValue: "→" })}</span></Link>
            </div>
            <div className="article-related-grid">
              {recommendations.map((story, index) => (
                <RecentStory key={story.id} story={story} index={index} />
              ))}
            </div>
          </RevealSection>
        )}
      </div>
    </article>
  );
}

function RecentStory({ story, index = 0 }) {
  const { t: tI18n } = useTranslation('public');
  const { translate: t } = usePublicPreferences();
  return (
    <article className="article-recent-story" data-reveal-item="" style={{ '--story-order': index }}>
      <Link
        className="article-recent-image"
        to={`/news/${encodeURIComponent(story.slug)}`}
        aria-label={`${t('Read story')}: ${story.title}`}
      >
        <StoryImage src={story.cover_image_url} alt="" />
      </Link>
      <div>
        <ArticleMeta article={story} />
        <h3><Link to={`/news/${encodeURIComponent(story.slug)}`}>{story.title}</Link></h3>
      </div>
    </article>
  );
}
