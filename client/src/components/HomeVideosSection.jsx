import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublicVideos } from '../api/news.js';
import { ErrorState } from './NewsStates.jsx';
import RevealSection from './RevealSection.jsx';

export default function HomeVideosSection() {
  const { t: tI18n } = useTranslation('public');
  const [videos, setVideos] = useState([]);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    getPublicVideos({ page: 1, limit: 3, signal: controller.signal })
      .then((result) => setVideos(result.data.slice(0, 3)))
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message);
      });
    return () => controller.abort();
  }, [attempt]);

  if (!videos.length && !error) return null;

  return (
    <RevealSection className="home-videos-section" aria-labelledby="home-videos-heading">
      <div className="section-heading section-heading--row">
        <div>
          <span className="eyebrow">{tI18n("Watch & explore", { defaultValue: "Watch & explore" })}</span>
          <h2 id="home-videos-heading">{tI18n("Videos", { defaultValue: "Videos" })}</h2>
        </div>
        <Link className="text-link section-more" to="/videos">{tI18n("View all videos", { defaultValue: "View all videos" })} <span aria-hidden="true">{tI18n("→", { defaultValue: "→" })}</span></Link>
      </div>
      {error
        ? <ErrorState message={error} onRetry={() => setAttempt((value) => value + 1)} />
        : <div className="home-video-grid">
        {videos.map((video) => (
          <Link className="home-video-card" to={`/videos/${video.id}`} key={video.id}>
            <img src={video.thumbnail_url} alt={video.thumbnail_alt || ''} loading="lazy" />
            <span className="home-video-category">{video.category}</span>
            <h3>{video.title}</h3>
          </Link>
        ))}
      </div>}
    </RevealSection>
  );
}
