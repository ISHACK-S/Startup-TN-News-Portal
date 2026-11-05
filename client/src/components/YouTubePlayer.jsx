import { useTranslation } from 'react-i18next';
import { useState } from 'react';

export default function YouTubePlayer({ video, className = '' }) {
  const { t: tI18n } = useTranslation('public');
  const [playing, setPlaying] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  return (
    <div className={`youtube-player ${className}`.trim()}>
      {playing && video.embed_url ? (
        <iframe
          title={video.title}
          src={video.embed_url}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <button
          className="youtube-player-poster"
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play ${video.title}`}
          disabled={!video.embed_url}
        >
          {!posterFailed && video.thumbnail_url
            ? <img src={video.thumbnail_url} alt={video.thumbnail_alt || ''} loading="lazy" onError={() => setPosterFailed(true)} />
            : <span className="youtube-player-poster-fallback">{tI18n("Video preview unavailable", { defaultValue: "Video preview unavailable" })}</span>}
          {video.embed_url && <span className="youtube-player-play" aria-hidden="true">{tI18n("▶", { defaultValue: "▶" })}</span>}
        </button>
      )}
      <a className="youtube-player-fallback" href={video.watch_url} target="_blank" rel="noopener noreferrer">{tI18n("If playback is unavailable, watch on YouTube ↗", { defaultValue: "If playback is unavailable, watch on YouTube ↗" })} </a>
    </div>
  );
}
