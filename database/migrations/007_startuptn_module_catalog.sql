DELETE FROM account_permission_overrides
WHERE module_id NOT IN (
  'overview', 'news-articles', 'web-stories', 'hero-slider',
  'video-media', 'media-library', 'user-management', 'role-builder',
  'access-control', 'branding-theme-editor', 'menu-management',
  'footer-management', 'seo-management'
);

DELETE FROM role_module_permissions
WHERE module_id NOT IN (
  'overview', 'news-articles', 'web-stories', 'hero-slider',
  'video-media', 'media-library', 'user-management', 'role-builder',
  'access-control', 'branding-theme-editor', 'menu-management',
  'footer-management', 'seo-management'
);

DELETE FROM role_permission_limits
WHERE module_id NOT IN (
  'overview', 'news-articles', 'web-stories', 'hero-slider',
  'video-media', 'media-library', 'user-management', 'role-builder',
  'access-control', 'branding-theme-editor', 'menu-management',
  'footer-management', 'seo-management'
);

DELETE FROM permission_modules
WHERE module_id NOT IN (
  'overview', 'news-articles', 'web-stories', 'hero-slider',
  'video-media', 'media-library', 'user-management', 'role-builder',
  'access-control', 'branding-theme-editor', 'menu-management',
  'footer-management', 'seo-management'
);

UPDATE permission_modules
SET label = CASE module_id
      WHEN 'branding-theme-editor' THEN 'Branding & Theme'
      ELSE label
    END,
    navigation_group = CASE
      WHEN module_id = 'overview' THEN 'Dashboard'
      WHEN module_id IN ('news-articles', 'web-stories', 'hero-slider') THEN 'Content Management'
      WHEN module_id IN ('video-media', 'media-library') THEN 'Media Management'
      WHEN module_id IN ('user-management', 'role-builder', 'access-control') THEN 'Administration'
      WHEN module_id IN ('branding-theme-editor', 'menu-management', 'footer-management', 'seo-management')
        THEN 'Website Management'
    END
WHERE module_id IN (
  'overview', 'news-articles', 'web-stories', 'hero-slider',
  'video-media', 'media-library', 'user-management', 'role-builder',
  'access-control', 'branding-theme-editor', 'menu-management',
  'footer-management', 'seo-management'
);
