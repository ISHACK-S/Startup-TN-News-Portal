export const PERMISSION_ACTIONS = Object.freeze([
  'view',
  'create',
  'edit',
  'publish',
  'delete',
  'manage',
  'configure'
]);

export const PERMISSION_MODULES = Object.freeze([
  { id: 'overview', label: 'Overview', group: 'Dashboard', available: true },
  { id: 'news-articles', label: 'News Articles', group: 'Content Management', available: true },
  { id: 'web-stories', label: 'Web Stories', group: 'Content Management', available: false },
  { id: 'hero-slider', label: 'Hero Slider', group: 'Content Management', available: false },
  { id: 'video-media', label: 'Video & Media', group: 'Media Management', available: false },
  { id: 'media-library', label: 'Media Library', group: 'Media Management', available: false },
  { id: 'user-management', label: 'User Management', group: 'Administration', available: true },
  { id: 'role-builder', label: 'Role Builder', group: 'Administration', available: false },
  { id: 'access-control', label: 'Access Control', group: 'Administration', available: true },
  { id: 'branding-theme-editor', label: 'Branding & Theme', group: 'Website Management', available: true },
  { id: 'menu-management', label: 'Menu Management', group: 'Website Management', available: true },
  { id: 'footer-management', label: 'Footer Management', group: 'Website Management', available: true },
  { id: 'seo-management', label: 'SEO Management', group: 'Website Management', available: false }
]);

export const BUILT_IN_ROLES = Object.freeze({
  Admin: 'admin',
  'Super Admin': 'super-admin'
});

export const PERMISSION_MODULE_IDS = Object.freeze(PERMISSION_MODULES.map(({ id }) => id));
export const PERMISSION_ROLE_KEYS = Object.freeze(Object.values(BUILT_IN_ROLES));
