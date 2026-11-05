import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getFeaturedPublicVideo, getPublicVideoCategories, getPublicVideos } from '../api/news.js';
import { EmptyState, ErrorState } from '../components/NewsStates.jsx';
import YouTubePlayer from '../components/YouTubePlayer.jsx';

function publicationDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(date);
}

function VideoCard({ video }) {
  const { t: tI18n } = useTranslation('public');
  return (
    <article className="public-video-card">
      <Link to={`/videos/${video.id}`} className="public-video-card-link" aria-label={`View ${video.title}`}>
        <img src={video.thumbnail_url} alt={video.thumbnail_alt || ''} loading="lazy" />
      </Link>
      <div>
        <span className="eyebrow">{video.category}</span>
        <h2><Link to={`/videos/${video.id}`}>{video.title}</Link></h2>
        {video.description && <p>{video.description}</p>}
        <small>{publicationDate(video.published_at)}</small>
      </div>
    </article>
  );
}

export default function VideosPage() {
  const { t: tI18n } = useTranslation('public');
  const [result, setResult] = useState(null);
  const [featured, setFeatured] = useState(null);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      getPublicVideos({ page, limit: 12, category, signal: controller.signal }),
      getFeaturedPublicVideo({ signal: controller.signal }),
      getPublicVideoCategories({ signal: controller.signal })
    ])
      .then(([videos, featuredVideo, videoCategories]) => {
        setResult(videos);
        setFeatured(featuredVideo);
        setCategories(videoCategories);
      })
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, category, attempt]);

  return (
    <div className="site-shell public-content-page">
      <header className="section-heading public-page-heading">
        <span className="eyebrow">{tI18n("Watch & explore", { defaultValue: "Watch & explore" })}</span>
        <h1>{tI18n("Videos", { defaultValue: "Videos" })}</h1>
        <p>{tI18n("Interviews, founder stories and updates from across Tamil Nadu’s startup ecosystem.", { defaultValue: "Interviews, founder stories and updates from across Tamil Nadu’s startup ecosystem." })}</p>
      </header>
      {loading && <div role="status" className="public-content-loading">{tI18n("Loading videos…", { defaultValue: "Loading videos…" })}</div>}
      {!loading && error && <ErrorState message={error} onRetry={() => setAttempt((value) => value + 1)} />}
      {!loading && !error && <>
        {featured && !category && (
          <section className="public-featured-video" aria-labelledby="featured-video-heading">
            <div className="section-heading">
              <span className="eyebrow">{tI18n("Featured video ·", { defaultValue: "Featured video ·" })} {featured.category}</span>
              <h2 id="featured-video-heading">{featured.title}</h2>
            </div>
            <YouTubePlayer video={featured} />
            {featured.description && <p>{featured.description}</p>}
            <Link className="text-link" to={`/videos/${featured.id}`}>{tI18n("Video details →", { defaultValue: "Video details →" })}</Link>
          </section>
        )}
        <div className="public-video-toolbar">
          <h2>{category || 'Latest videos'}</h2>
          <label className="admin-field">
            <span>{tI18n("Filter by category", { defaultValue: "Filter by category" })}</span>
            <select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
              <option value="">{tI18n("All categories", { defaultValue: "All categories" })}</option>
              {categories.map((name) => <option value={name} key={name}>{name}</option>)}
            </select>
          </label>
        </div>
        {!result?.data?.length
          ? <EmptyState title={tI18n("No videos in this category", { defaultValue: "No videos in this category" })} message="Try another category or check back as new videos are published." />
          : <div className="public-video-grid">{result.data.map((video) => <VideoCard video={video} key={video.id} />)}</div>}
        {result?.pagination?.totalPages > 1 && <nav className="public-pagination" aria-label={tI18n("Video pagination", { defaultValue: "Video pagination" })}>
          <button className="button button--outline" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{tI18n("Previous", { defaultValue: "Previous" })}</button>
          <span>{tI18n("Page", { defaultValue: "Page" })} {page} {tI18n("of", { defaultValue: "of" })} {result.pagination.totalPages}</span>
          <button className="button button--outline" type="button" disabled={page >= result.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>{tI18n("Next", { defaultValue: "Next" })}</button>
        </nav>}
      </>}
    </div>
  );
}
