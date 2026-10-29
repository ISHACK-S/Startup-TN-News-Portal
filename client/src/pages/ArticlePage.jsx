import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getArticle } from '../api/news.js';
import ArticleMeta, { formatDate } from '../components/ArticleMeta.jsx';
import ArticleContent from '../components/ArticleContent.jsx';
import StoryImage from '../components/StoryImage.jsx';
import { ErrorState, LoadingArticle } from '../components/NewsStates.jsx';

export default function ArticlePage() {
  const { slug } = useParams();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

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

  return (
    <article className="article-page">
      <header className="article-cover">
        <StoryImage
          className="article-hero-image"
          src={article.cover_image_url}
          alt=""
          priority
        />
        <div className="article-cover-shade" />
        <div className="article-heading site-shell">
          <Link className="back-link" to="/news/">← All stories</Link>
          <ArticleMeta article={article} />
          <h1>{article.title}</h1>
          {article.summary && <p className="article-dek">{article.summary}</p>}
          <div className="article-byline">
            <span>By <strong>{article.author_name}</strong></span>
            <span aria-hidden="true" className="byline-dot" />
            <time dateTime={article.published_at || article.created_at}>
              {formatDate(article.published_at || article.created_at)}
            </time>
          </div>
        </div>
        <span className="article-cover-mark" aria-hidden="true">STARTUPTN / NEWS</span>
      </header>

      <div className="article-body-wrap">
        <div className="article-body">
          <div className="article-body-heading">
            <span className="eyebrow">The story</span>
            <span className="article-body-rule" aria-hidden="true" />
          </div>
          <ArticleContent content={article.content} />
          {article.source_url && (
            <p className="source-attribution">
              Source: <a href={article.source_url} target="_blank" rel="noopener noreferrer">{article.source_url}</a>
            </p>
          )}
          <div className="share-row" aria-label="Share this story">
            <span>Share this story</span>
            <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(articleUrl)}`} target="_blank" rel="noopener noreferrer" aria-label="Share on Facebook">f</a>
            <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(articleUrl)}`} target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn">in</a>
            <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(articleUrl)}&text=${shareText}`} target="_blank" rel="noopener noreferrer" aria-label="Share on X">𝕏</a>
            <a href={`mailto:?subject=${shareText}&body=${encodeURIComponent(articleUrl)}`} aria-label="Share by email">✉</a>
          </div>
        </div>
      </div>
    </article>
  );
}
