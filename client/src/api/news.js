const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

async function request(path, { signal } = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: { Accept: 'application/json' },
      signal
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Unable to connect to StartupTN News. Check your connection and try again.');
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('The news service returned an unexpected response.');
  }

  if (!response.ok) {
    const message = payload?.error?.message || 'Something went wrong while loading the news.';
    throw new Error(message);
  }

  return payload;
}

export function getCategories({ signal } = {}) {
  return request('/categories', { signal }).then((result) => result.data);
}

export function getNews({ page = 1, limit = 9, q, category, signal } = {}) {
  const search = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q) search.set('q', q);
  if (category) search.set('category', category);
  return request(`/news?${search.toString()}`, { signal });
}

export function getArticle(slug, { signal } = {}) {
  return request(`/news/${encodeURIComponent(slug)}`, { signal }).then((result) => result.data);
}

export function getPublicWebStories({ page = 1, limit = 20, q, signal } = {}) {
  const search = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q) search.set('q', q);
  return request(`/web-stories?${search}`, { signal });
}

export function getPublicWebStory(slug, { signal } = {}) {
  return request(`/web-stories/${encodeURIComponent(slug)}`, { signal }).then((result) => result.data);
}

export function getPublicHeroSlides({ signal } = {}) {
  return request('/hero-slides?page=1&limit=50', { signal });
}

export function getPublicVideos({ page = 1, limit = 20, signal } = {}) {
  return request(`/videos?page=${page}&limit=${limit}`, { signal });
}
