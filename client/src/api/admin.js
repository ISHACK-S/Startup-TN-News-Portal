import { apiRequest } from './client.js';

function contentQuery(path, { page = 1, limit = 20, q, status, format, provider, signal } = {}) {
  const search = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q) search.set('q', q);
  if (status) search.set('status', status);
  if (format) search.set('format', format);
  if (provider) search.set('provider', provider);
  return apiRequest(`${path}?${search}`, { signal });
}

function createContent(path, data) {
  return apiRequest(path, { method: 'POST', body: data }).then((result) => result.data);
}

function updateContent(path, id, data) {
  return apiRequest(`${path}/${encodeURIComponent(id)}`, { method: 'PATCH', body: data }).then((result) => result.data);
}

function deleteContent(path, id) {
  return apiRequest(`${path}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

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

export function getAdminUsers({ page = 1, limit = 10, q, signal } = {}) {
  const search = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q) search.set('q', q);
  return apiRequest(`/admin/access-control/users?${search.toString()}`, { signal });
}

export function createAdminUser(account) {
  return apiRequest('/admin/access-control/users', {
    method: 'POST',
    body: account
  }).then((result) => result.data);
}

export function updateAdminUser(id, changes) {
  return apiRequest(`/admin/access-control/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: changes
  });
}

export function getPermissionModules({ signal } = {}) {
  return apiRequest('/admin/access-control/permissions/modules', { signal })
    .then((result) => result.data);
}

export function getMyAdminPermissions({ signal } = {}) {
  return apiRequest('/admin/access-control/permissions/me', { signal })
    .then((result) => result.data);
}

export function getPermissionRoles({ signal } = {}) {
  return apiRequest('/admin/access-control/permissions/roles', { signal })
    .then((result) => result.data);
}

export function updatePermissionModule(moduleId, changes) {
  return apiRequest(
    `/admin/access-control/permissions/modules/${encodeURIComponent(moduleId)}`,
    { method: 'PATCH', body: changes }
  ).then((result) => result.data);
}

export function getRolePermissions(roleKey, { signal } = {}) {
  return apiRequest(
    `/admin/access-control/permissions/roles/${encodeURIComponent(roleKey)}/permissions`,
    { signal }
  ).then((result) => result.data);
}

export function updateRolePermissions(roleKey, permissions) {
  return apiRequest(
    `/admin/access-control/permissions/roles/${encodeURIComponent(roleKey)}/permissions`,
    { method: 'PATCH', body: { permissions } }
  ).then((result) => result.data);
}

export function getAdminPermissions(adminId, { signal } = {}) {
  return apiRequest(
    `/admin/access-control/permissions/accounts/${encodeURIComponent(adminId)}/permissions`,
    { signal }
  ).then((result) => result.data);
}

export function updateAdminPermissionOverrides(adminId, overrides) {
  return apiRequest(
    `/admin/access-control/permissions/accounts/${encodeURIComponent(adminId)}/overrides`,
    { method: 'PUT', body: { overrides } }
  ).then((result) => result.data);
}

export function removeAdminPermissionOverride(adminId, moduleId, actionId) {
  return apiRequest(
    `/admin/access-control/permissions/accounts/${encodeURIComponent(adminId)}/overrides/${encodeURIComponent(moduleId)}/${encodeURIComponent(actionId)}`,
    { method: 'DELETE' }
  ).then((result) => result.data);
}

export function getAdminMediaAssets(options = {}) {
  return contentQuery('/admin/media', options);
}

export function getAdminMediaAsset(id, { signal } = {}) {
  return apiRequest(`/admin/media/${encodeURIComponent(id)}`, { signal }).then((result) => result.data);
}

export function getAdminWebStories(options = {}) {
  return contentQuery('/admin/web-stories', options);
}

export function getAdminWebStory(id, { signal } = {}) {
  return apiRequest(`/admin/web-stories/${encodeURIComponent(id)}`, { signal }).then((result) => result.data);
}

export const createAdminWebStory = (data) => createContent('/admin/web-stories', data);
export const updateAdminWebStory = (id, data) => updateContent('/admin/web-stories', id, data);
export const deleteAdminWebStory = (id) => deleteContent('/admin/web-stories', id);

export function getAdminHeroSlides(options = {}) {
  return contentQuery('/admin/hero-slides', options);
}

export const createAdminHeroSlide = (data) => createContent('/admin/hero-slides', data);
export const updateAdminHeroSlide = (id, data) => updateContent('/admin/hero-slides', id, data);
export const deleteAdminHeroSlide = (id) => deleteContent('/admin/hero-slides', id);

export function getAdminVideos(options = {}) {
  return contentQuery('/admin/videos', options);
}

export const createAdminVideo = (data) => createContent('/admin/videos', data);
export const updateAdminVideo = (id, data) => updateContent('/admin/videos', id, data);
export const deleteAdminVideo = (id) => deleteContent('/admin/videos', id);
