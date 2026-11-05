import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { getPublicVideo } from '../api/news.js';
import YouTubePlayer from './YouTubePlayer.jsx';

export default function ArticleVideoEmbed({ id }) {
  const { t: tI18n } = useTranslation('public');
  const [video, setVideo] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    getPublicVideo(id, { signal: controller.signal })
      .then(setVideo)
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message);
      });
    return () => controller.abort();
  }, [id]);

  if (error) return <p className="article-video-unavailable" role="status">{tI18n("This video is no longer available.", { defaultValue: "This video is no longer available." })}</p>;
  if (!video) return <div className="article-video-loading" role="status">{tI18n("Loading video…", { defaultValue: "Loading video…" })}</div>;
  return <YouTubePlayer video={video} className="article-video-embed" />;
}
