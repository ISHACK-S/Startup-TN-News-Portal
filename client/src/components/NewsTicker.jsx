import { useTranslation } from 'react-i18next';
import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePublicPreferences } from '../contexts/PublicPreferencesContext.jsx';

export default function NewsTicker({ articles }) {
  const { t: tI18n } = useTranslation('public');
  const { translate: t } = usePublicPreferences();
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
    <nav className={`news-ticker${looping ? ' news-ticker--looping' : ''}`} aria-label={t('Recent headlines')}>
      <span className="news-ticker-label">
        <i aria-hidden="true" />
        <span>{t('Latest')}</span>
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
                      <span className="news-ticker-meta">{t(article.category_name)}</span>
                    )}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="news-ticker-empty">{t('Published stories from the Tamil Nadu startup ecosystem.')}</p>
      )}
      <Link className="news-ticker-more" to="/news/" aria-label={t('Browse all latest headlines')}>
        {t('All news')} <span aria-hidden="true">{tI18n("↗", { defaultValue: "↗" })}</span>
      </Link>
    </nav>
  );
}
