const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);

export function getYouTubeVideoId(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== 'https:' || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password || url.port) {
      return null;
    }
    const id = url.hostname.toLowerCase() === 'youtu.be'
      ? url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1]
      : url.pathname === '/watch'
        ? url.searchParams.get('v')
        : url.pathname.match(/^\/(?:embed|shorts)\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
    return /^[A-Za-z0-9_-]{11}$/.test(id ?? '') ? id : null;
  } catch {
    return null;
  }
}

export function getYouTubeThumbnailUrl(sourceUrl) {
  const id = getYouTubeVideoId(sourceUrl);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
}

export function getYouTubeEmbedUrl(sourceUrl) {
  const id = getYouTubeVideoId(sourceUrl);
  return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : '';
}
