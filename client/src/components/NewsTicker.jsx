import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

export default function NewsTicker({ articles }) {
  const viewportRef = useRef(null);
  const groupRef = useRef(null);
  const [looping, setLooping] = useState(false);
  const [duration, setDuration] = useState(30);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const group = groupRef.current;
    if (!viewport || !group || !articles.length) return undefined;

    const measure = () => {
      const contentWidth = group.scrollWidth;
      const viewportWidth = viewport.clientWidth;
      const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const needsLoop = !prefersReducedMotion && contentWidth > viewportWidth + 1;
      setLooping(needsLoop);
      setDuration(Math.max(24, contentWidth / 42));
    };

    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(group);
    return () => observer.disconnect();
  }, [articles]);

  return (
    <nav className={`news-ticker${looping ? ' news-ticker--looping' : ''}`} aria-label="Recent headlines">
      <span className="news-ticker-label">
        <i aria-hidden="true" />
        <span>Latest</span>
      </span>
      {articles.length > 0 ? (
        <div className="news-ticker-items" ref={viewportRef}>
          <div
            className={`news-ticker-track${looping ? ' news-ticker-track--looping' : ''}`}
            style={{ '--ticker-duration': `${duration}s` }}
          >
            {[false, ...(looping ? [true] : [])].map((duplicate) => (
              <div
                className="news-ticker-group"
                aria-hidden={duplicate ? 'true' : undefined}
                inert={duplicate || undefined}
                key={duplicate ? 'duplicate' : 'stories'}
                ref={duplicate ? undefined : groupRef}
              >
                {articles.map((article) => (
                  <Link key={article.id} to={`/news/${encodeURIComponent(article.slug)}`}>
                    <span className="news-ticker-title">{article.title}</span>
                    {article.category_name && (
                      <span className="news-ticker-meta">{article.category_name}</span>
                    )}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="news-ticker-empty">Published stories from the Tamil Nadu startup ecosystem.</p>
      )}
      <Link className="news-ticker-more" to="/news/" aria-label="Browse all latest headlines">
        All news <span aria-hidden="true">↗</span>
      </Link>
    </nav>
  );
}
