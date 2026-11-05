import i18n from './index.js';

const MODULE_LABELS = {
  overview: 'Overview',
  'news-articles': 'News Articles',
  'web-stories': 'Web Stories',
  'hero-slider': 'Hero Slider',
  'video-media': 'Video & Media',
  'media-library': 'Media Library',
  'user-management': 'User Management',
  'role-builder': 'Role Builder',
  'access-control': 'Access Control',
  'branding-theme-editor': 'Branding & Theme',
  'menu-management': 'Menu Management',
  'footer-management': 'Footer Management',
  'seo-management': 'SEO Management'
};

const ACTION_LABELS = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  publish: 'Publish',
  delete: 'Delete',
  manage: 'Manage',
  configure: 'Configure'
};

function translate(value) {
  return i18n.t(value, { ns: 'admin', defaultValue: value });
}

export function translateAdminModuleLabel(moduleId, fallbackLabel) {
  const fallback = fallbackLabel || moduleId;
  return translate(MODULE_LABELS[moduleId] ?? fallback);
}

export function translatePermissionAction(actionId) {
  return translate(ACTION_LABELS[actionId] ?? actionId);
}
