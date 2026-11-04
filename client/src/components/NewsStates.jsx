import { usePublicPreferences } from '../contexts/PublicPreferencesContext.jsx';

export function StoryGridSkeleton({ count = 6 }) {
  const { translate: t } = usePublicPreferences();
  return (
    <div className="story-grid" aria-label={t('Loading news')} aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton-card" key={index}>
          <div className="skeleton skeleton-image" />
          <div className="skeleton-copy">
            <div className="skeleton skeleton-line skeleton-short" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line skeleton-medium" />
            <div className="skeleton skeleton-line skeleton-short" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LoadingArticle() {
  const { translate: t } = usePublicPreferences();
  return (
    <div className="article-loading site-shell" aria-label={t('Loading article')} aria-busy="true">
      <div className="skeleton skeleton-line skeleton-short" />
      <div className="skeleton skeleton-line title-line" />
      <div className="skeleton skeleton-image article-loading-image" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line" />
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  const { translate: t } = usePublicPreferences();
  return (
    <div className="state-panel state-panel--error" role="alert">
      <span className="state-kicker">{t('A small pause')}</span>
      <h2>{t('We couldn’t load the news.')}</h2>
      <p>{t(message || 'Please check your connection and try again.')}</p>
      {onRetry && <button className="button button--outline" type="button" onClick={onRetry}>{t('Try again')}</button>}
    </div>
  );
}

export function EmptyState({ title = 'No stories found', message = 'Try another search or category.' }) {
  const { translate: t } = usePublicPreferences();
  return (
    <div className="state-panel">
      <span className="state-kicker">{t('The newsroom')}</span>
      <h2>{t(title)}</h2>
      <p>{t(message)}</p>
    </div>
  );
}
