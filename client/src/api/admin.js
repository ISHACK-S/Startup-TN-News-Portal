import { apiRequest } from './client.js';

export function login(credentials) {
  return apiRequest('/auth/login', { method: 'POST', body: credentials }).then((result) => result.data.admin);
}

export function logout() {
  return apiRequest('/auth/logout', { method: 'POST', body: {} });
}

export function getSession({ signal } = {}) {
  return apiRequest('/auth/me', { signal }).then((result) => result.data);
}

export function getAdminArticles({ page = 1, limit = 10, q, category, status, signal } = {}) {
  const search = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q) search.set('q', q);
  if (category) search.set('category', category);
  if (status) search.set('status', status);
  return apiRequest(`/admin/articles?${search.toString()}`, { signal });
}

export function getAdminArticle(id, { signal } = {}) {
  return apiRequest(`/admin/articles/${encodeURIComponent(id)}`, { signal }).then((result) => result.data);
}

export function createAdminArticle(article) {
  return apiRequest('/admin/articles', { method: 'POST', body: article }).then((result) => result.data);
}

export function updateAdminArticle(id, article) {
  return apiRequest('/admin/articles/', {
    method: 'PATCH',
    body: { id: Number(id), ...article }
  }).then((result) => result.data);
}

export function deleteAdminArticle(id) {
  return apiRequest('/admin/articles/', { method: 'DELETE', body: { id: Number(id) } });
}
