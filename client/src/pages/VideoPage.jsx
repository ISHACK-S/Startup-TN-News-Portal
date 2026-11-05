import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPublicVideo, getPublicVideos } from '../api/news.js';
import { EmptyState, ErrorState } from '../components/NewsStates.jsx';
import YouTubePlayer from '../components/YouTubePlayer.jsx';

function publicationDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(date);
}

export default function VideoPage() {
  const { t: tI18n } = useTranslation('public');
  const { id } = useParams();
  const [video, setVideo] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [relatedError, setRelatedError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setVideo(null);
    setRelated([]);
    setLoading(true);
    setError("");
    getPublicVideo(id, { signal: controller.signal })
      .then(setVideo)
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, attempt]);

  useEffect(() => {
    if (!video) return undefined;
    const controller = new AbortController();
    setRelatedError('');
    getPublicVideos({ page: 1, limit: 12, category: video.category, signal: controller.signal })
      .then((result) => setRelated(result.data.filter((item) => String(item.id) !== String(video.id)).slice(0, 3)))
      .catch((failure) => {
        if (failure.name !== 'AbortError') setRelatedError(failure.message);
      });
    return () => controller.abort();
  }, [video]);

  if (loading) return <div className="site-shell public-content-loading" role="status">{tI18n("Loading video…", { defaultValue: "Loading video…" })}</div>;
  if (error || !video) {
    return <div className="site-shell public-content-page">
      <ErrorState message={error || 'This video may have moved, or is no longer available.'} onRetry={() => setAttempt((value) => value + 1)} />
      <Link className="text-link" to="/videos">{tI18n("← All videos", { defaultValue: "← All videos" })}</Link>
    </div>;
  }

  return (
    <article className="site-shell public-content-page public-video-detail">
      <Link className="text-link" to="/videos">{tI18n("← All videos", { defaultValue: "← All videos" })}</Link>
      <header className="public-video-detail-heading">
        <span className="eyebrow">{video.category}</span>
        <h1>{video.title}</h1>
        <p>{publicationDate(video.published_at)}</p>
      </header>
      <YouTubePlayer video={video} className="youtube-player--detail" />
      {video.description && <div className="public-video-description"><p>{video.description}</p></div>}
      <section className="related-videos" aria-labelledby="related-videos-heading">
        <div className="section-heading section-heading--row">
          <div><span className="eyebrow">{tI18n("More to watch", { defaultValue: "More to watch" })}</span><h2 id="related-videos-heading">{tI18n("Related videos", { defaultValue: "Related videos" })}</h2></div>
          <Link className="text-link" to="/videos">{tI18n("View all videos →", { defaultValue: "View all videos →" })}</Link>
        </div>
        {relatedError && <ErrorState message={relatedError} />}
        {!relatedError && related.length > 0
          ? <div className="public-video-grid">{related.map((item) => (
            <article className="public-video-card" key={item.id}>
              <Link to={`/videos/${item.id}`} className="public-video-card-link" aria-label={`View ${item.title}`}>
                <img src={item.thumbnail_url} alt={item.thumbnail_alt || ''} loading="lazy" />
              </Link>
              <div><span className="eyebrow">{item.category}</span><h2><Link to={`/videos/${item.id}`}>{item.title}</Link></h2></div>
            </article>
          ))}</div>
          : !relatedError && <EmptyState title={tI18n("No related videos yet", { defaultValue: "No related videos yet" })} message="Explore the full video collection for more." />}
      </section>
    </article>
  );
}
