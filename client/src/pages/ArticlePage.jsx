import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getArticle, getNews } from '../api/news.js';
import ArticleMeta, { formatDate } from '../components/ArticleMeta.jsx';
import ArticleContent from '../components/ArticleContent.jsx';
import NewsSearch from '../components/NewsSearch.jsx';
import RevealSection from '../components/RevealSection.jsx';
import StoryImage from '../components/StoryImage.jsx';
import { ErrorState, LoadingArticle } from '../components/NewsStates.jsx';

export default function ArticlePage() {
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
    setError('');
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
          message={error || 'This story may have moved or is no longer available.'}
          onRetry={error ? () => setAttempt((value) => value + 1) : undefined}
        />
        <Link className="text-link" to="/news/">← Back to latest news</Link>
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
        aria-label="Article reading progress"
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
          <nav className="article-breadcrumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link to="/news/">News</Link>
            {article.category_name && (
              <>
                <span aria-hidden="true">/</span>
                <Link to={article.category_slug ? `/news/?category=${article.category_slug}` : '/news/'}>
                  {article.category_name}
                </Link>
              </>
            )}
          </nav>
          <ArticleMeta article={article} />
          <h1>{article.title}</h1>
          {article.summary && <p className="article-dek">{article.summary}</p>}
          <div className="article-byline">
            <span>By <strong>{article.author_name}</strong></span>
            <span aria-hidden="true" className="byline-dot" />
            <span>{readingMinutes} min read</span>
          </div>
        </div>
        <span className="article-cover-mark" aria-hidden="true">STARTUPTN / NEWS</span>
      </header>

      <div className="article-body-wrap">
        <div className="article-layout">
          <div className="article-body">
            <div className="article-body-heading">
              <span className="eyebrow">The story</span>
              <span className="article-body-rule" aria-hidden="true" />
              <span className="article-body-reading">{readingMinutes} min read</span>
            </div>
            <div ref={readingAreaRef} className="article-reading-area">
              <ArticleContent content={article.content} />
              {article.source_url && (
                <p className="source-attribution">
                  Source: <a href={article.source_url} target="_blank" rel="noopener noreferrer">{article.source_url}</a>
                </p>
              )}
            </div>
            <div className="share-row" aria-label="Share this story">
              <span>Share this story</span>
              <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(articleUrl)}`} target="_blank" rel="noopener noreferrer" aria-label="Share on Facebook">f</a>
              <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(articleUrl)}`} target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn">in</a>
              <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(articleUrl)}&text=${shareText}`} target="_blank" rel="noopener noreferrer" aria-label="Share on X">𝕏</a>
              <a href={`mailto:?subject=${shareText}&body=${encodeURIComponent(articleUrl)}`} aria-label="Share by email">✉</a>
            </div>
          </div>
          <aside className="article-sidebar" aria-label="More from the newsroom">
            <section className="article-sidebar-panel article-search-panel">
              <span className="eyebrow">Explore the newsroom</span>
              <h2>Find a story</h2>
              <NewsSearch onSearch={(query) => navigate(`/news/${query ? `?q=${encodeURIComponent(query)}` : ''}`)} />
            </section>
            <section className="article-sidebar-panel article-info-panel">
              <span className="eyebrow">The details</span>
              <h2>About this story</h2>
              <dl>
                <div><dt>Published</dt><dd>{formatDate(article.published_at || article.created_at)}</dd></div>
                <div><dt>Written by</dt><dd>{article.author_name}</dd></div>
                <div><dt>Reading time</dt><dd>{readingMinutes} min</dd></div>
                {article.category_name && <div><dt>Section</dt><dd>{article.category_name}</dd></div>}
              </dl>
              {article.source_url && (
                <a className="article-sidebar-source" href={article.source_url} target="_blank" rel="noopener noreferrer">
                  View original source <span aria-hidden="true">↗</span>
                </a>
              )}
            </section>
            <section className="article-sidebar-panel article-recent-panel">
              <div className="article-sidebar-heading">
                <div><span className="eyebrow">Fresh from the desk</span><h2>Recent stories</h2></div>
                <Link to="/news/" aria-label="Browse all recent stories">All news <span aria-hidden="true">→</span></Link>
              </div>
              {recentStoriesError && <p className="article-sidebar-note">Recent stories are temporarily unavailable.</p>}
              {!recentStoriesError && recommendations.slice(0, 2).map((story) => (
                <RecentStory key={story.id} story={story} />
              ))}
              {!recentStoriesError && recommendations.length === 0 && (
                <p className="article-sidebar-note">More reporting from the newsroom will appear here soon.</p>
              )}
            </section>
          </aside>
        </div>
        {recommendations.length > 0 && (
          <RevealSection className="article-related" aria-labelledby="article-related-heading">
            <div className="article-related-heading">
              <div><span className="eyebrow">Continue exploring</span><h2 id="article-related-heading">More from the newsroom</h2></div>
              <Link className="text-link" to="/news/">All stories <span aria-hidden="true">→</span></Link>
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
  return (
    <article className="article-recent-story" data-reveal-item="" style={{ '--story-order': index }}>
      <Link
        className="article-recent-image"
        to={`/news/${encodeURIComponent(story.slug)}`}
        aria-label={`Read story: ${story.title}`}
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
