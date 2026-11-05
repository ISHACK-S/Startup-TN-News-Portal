import { apiDownload, apiRequest } from './client.js';

function contentQuery(path, { page = 1, limit = 20, q, status, format, provider, category, featured, signal } = {}) {
  const search = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q) search.set('q', q);
  if (status) search.set('status', status);
  if (format) search.set('format', format);
  if (provider) search.set('provider', provider);
  if (category) search.set('category', category);
  if (featured !== undefined) search.set('featured', String(featured));
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

export function getMyAdminProfile({ signal } = {}) {
  return apiRequest('/auth/profile', { signal }).then((result) => result.data.profile);
}

export function updateMyAdminProfile(changes) {
  return apiRequest('/auth/profile', { method: 'PATCH', body: changes });
}

export function changeMyAdminPassword(changes) {
  return apiRequest('/auth/profile/password', { method: 'PATCH', body: changes });
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

export function getAdminWebsiteConfiguration({ signal } = {}) {
  return apiRequest('/admin/site-config', { signal }).then((result) => result.data);
}

export function saveAdminWebsiteConfiguration(section, configuration) {
  return apiRequest(`/admin/site-config/${encodeURIComponent(section)}`, {
    method: 'PUT',
    body: configuration
  }).then((result) => result.data.configuration);
}

export function publishAdminWebsiteConfiguration(section) {
  return apiRequest(`/admin/site-config/${encodeURIComponent(section)}/publish`, {
    method: 'POST',
    body: {}
  }).then((result) => result.data.configuration);
}

export function getPermissionRoles({ signal } = {}) {
  return apiRequest('/admin/access-control/permissions/roles', { signal })
    .then((result) => result.data);
}

export function createPermissionRole(role) {
  return apiRequest('/admin/access-control/permissions/roles', {
    method: 'POST',
    body: role
  }).then((result) => result.data);
}

export function getPermissionRole(roleKey, { signal } = {}) {
  return apiRequest(
    `/admin/access-control/permissions/roles/${encodeURIComponent(roleKey)}`,
    { signal }
  ).then((result) => result.data);
}

export function updatePermissionRole(roleKey, changes) {
  return apiRequest(
    `/admin/access-control/permissions/roles/${encodeURIComponent(roleKey)}`,
    { method: 'PATCH', body: changes }
  ).then((result) => result.data);
}

export function deletePermissionRole(roleKey) {
  return apiRequest(
    `/admin/access-control/permissions/roles/${encodeURIComponent(roleKey)}`,
    { method: 'DELETE' }
  ).then((result) => result.data);
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

function monthlyReportQuery(filters) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && value !== undefined && value !== null) search.set(key, String(value));
  }
  return search.toString();
}

export function getAdminMonthlyActivityReport(filters, { signal } = {}) {
  return apiRequest(`/admin/monthly-reports?${monthlyReportQuery(filters)}`, { signal })
    .then((result) => result.data);
}

export function getAdminActivityDetails(activityId, { signal } = {}) {
  return apiRequest(`/admin/monthly-reports/${encodeURIComponent(activityId)}`, { signal })
    .then((result) => result.data);
}

export function exportAdminMonthlyActivityReport(format, filters, { signal } = {}) {
  if (!['csv', 'pdf'].includes(format)) throw new TypeError('Unsupported activity report export format.');
  return apiDownload(`/admin/monthly-reports/export.${format}?${monthlyReportQuery(filters)}`, { signal });
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
