import { useEffect, useState } from 'react';
import { getPublicVideos } from '../api/news.js';
import { EmptyState, ErrorState } from '../components/NewsStates.jsx';

function PublicVideoPlayer({ video }) {
  const [playing, setPlaying] = useState(false);
  if (video.thumbnail_url && !playing) {
    return <button className="public-video-poster" type="button" onClick={() => setPlaying(true)} aria-label={`Play ${video.title}`}>
      <img src={video.thumbnail_url} alt={video.thumbnail_alt || ''} loading="lazy" />
      <span aria-hidden="true">▶</span>
    </button>;
  }
  return <iframe
    title={video.title}
    src={video.embed_url}
    loading="lazy"
    sandbox="allow-scripts allow-same-origin allow-presentation"
    allow="encrypted-media; picture-in-picture"
    allowFullScreen
  />;
}

export default function VideosPage() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    getPublicVideos({ page, signal: controller.signal })
      .then(setResult)
      .catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, attempt]);

  return <div className="site-shell public-content-page">
    <header className="section-heading public-page-heading"><span className="eyebrow">Watch & explore</span><h1>Video & Media</h1><p>Published video features from the newsroom.</p></header>
    {loading && <div role="status" className="public-content-loading">Loading videos…</div>}
    {!loading && error && <ErrorState message={error} onRetry={() => setAttempt((value) => value + 1)} />}
    {!loading && !error && !result?.data?.length && <EmptyState title="No published videos yet" message="The newsroom will add videos here when they are ready." />}
    {!loading && !error && result?.data?.length > 0 && <>
      <div className="public-video-grid">{result.data.map((video) => <article className="public-video-card" key={video.id}>
        <PublicVideoPlayer video={video} />
        <div><span className="eyebrow">{video.category || video.provider}</span><h2>{video.title}</h2>{video.description && <p>{video.description}</p>}
          <a className="text-link" href={video.source_url} target="_blank" rel="noopener noreferrer">Open video at {video.provider} ↗</a></div>
      </article>)}</div>
      {result.pagination?.totalPages > 1 && <nav className="public-pagination" aria-label="Video pagination">
        <button className="button button--outline" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {result.pagination.totalPages}</span>
        <button className="button button--outline" type="button" disabled={page >= result.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
      </nav>}
    </>}
  </div>;
}
