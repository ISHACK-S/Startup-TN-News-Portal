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
  { id: 'overview', label: 'Overview', group: 'Core dashboard', available: true },
  { id: 'news-articles', label: 'News Articles', group: 'Core dashboard', available: true },
  { id: 'profile-settings', label: 'Profile Settings', group: 'Core dashboard', available: false },
  { id: 'monthly-reports', label: 'Monthly Reports', group: 'Public-service management', available: false },
  { id: 'citizen-services', label: 'Citizen Services', group: 'Public-service management', available: false },
  { id: 'faq-management', label: 'FAQ Management', group: 'Public-service management', available: false },
  { id: 'police-stations', label: 'Police Stations', group: 'Public-service management', available: false },
  { id: 'helplines-registry', label: 'Helplines Registry', group: 'Public-service management', available: false },
  { id: 'portal-links', label: 'Portal Links', group: 'Public-service management', available: false },
  { id: 'web-stories', label: 'Web Stories', group: 'Content and media', available: false },
  { id: 'hero-slider', label: 'Hero Slider', group: 'Content and media', available: false },
  { id: 'video-media', label: 'Video & Media', group: 'Content and media', available: false },
  { id: 'media-library', label: 'Media Library', group: 'Content and media', available: false },
  { id: 'official-alerts', label: 'Official Alerts', group: 'Content and media', available: false },
  { id: 'access-control', label: 'Access Control', group: 'Access and account administration', available: true },
  { id: 'user-management', label: 'User Management', group: 'Access and account administration', available: true },
  { id: 'role-builder', label: 'Role Builder', group: 'Access and account administration', available: false },
  { id: 'session-management', label: 'Session Management', group: 'Access and account administration', available: false },
  { id: 'security-events', label: 'Security Events', group: 'Access and account administration', available: false },
  { id: 'audit-logs', label: 'Audit Logs', group: 'Access and account administration', available: false },
  { id: 'branding-theme-editor', label: 'Branding & Theme Editor', group: 'Website configuration', available: false },
  { id: 'menu-management', label: 'Menu Management', group: 'Website configuration', available: false },
  { id: 'footer-management', label: 'Footer Management', group: 'Website configuration', available: false },
  { id: 'seo-management', label: 'SEO Management', group: 'Website configuration', available: false },
  { id: 'system-configuration', label: 'System Configuration', group: 'System administration', available: false },
  { id: 'backup-restore', label: 'Backup & Restore', group: 'System administration', available: false },
  { id: 'api-key-configuration', label: 'API Key Configuration', group: 'System administration', available: false },
  { id: 'smtp-configuration', label: 'SMTP Configuration', group: 'System administration', available: false }
]);

export const BUILT_IN_ROLES = Object.freeze({
  Admin: 'admin',
  'Super Admin': 'super-admin'
});

export const PERMISSION_MODULE_IDS = Object.freeze(PERMISSION_MODULES.map(({ id }) => id));
export const PERMISSION_ROLE_KEYS = Object.freeze(Object.values(BUILT_IN_ROLES));
