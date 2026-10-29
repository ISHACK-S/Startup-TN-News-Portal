export function StoryGridSkeleton({ count = 6 }) {
  return (
    <div className="story-grid" aria-label="Loading news" aria-busy="true">
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
  return (
    <div className="article-loading site-shell" aria-label="Loading article" aria-busy="true">
      <div className="skeleton skeleton-line skeleton-short" />
      <div className="skeleton skeleton-line title-line" />
      <div className="skeleton skeleton-image article-loading-image" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line" />
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state-panel state-panel--error" role="alert">
      <span className="state-kicker">A small pause</span>
      <h2>We couldn’t load the news.</h2>
      <p>{message || 'Please check your connection and try again.'}</p>
      {onRetry && <button className="button button--outline" type="button" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function EmptyState({ title = 'No stories found', message = 'Try another search or category.' }) {
  return (
    <div className="state-panel">
      <span className="state-kicker">The newsroom</span>
      <h2>{title}</h2>
      <p>{message}</p>
    </div>
  );
}
