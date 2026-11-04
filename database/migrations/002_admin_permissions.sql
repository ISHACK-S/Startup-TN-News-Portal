CREATE TABLE permission_roles (
  role_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  label VARCHAR(100) NOT NULL,
  is_builtin TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_key)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE permission_actions (
  action_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  label VARCHAR(100) NOT NULL,
  PRIMARY KEY (action_id)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE permission_modules (
  module_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  label VARCHAR(150) NOT NULL,
  description VARCHAR(500) NOT NULL,
  navigation_group VARCHAR(100) NOT NULL,
  is_available TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (module_id),
  KEY idx_permission_modules_group (navigation_group, module_id)
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE role_permission_limits (
  role_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  module_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  action_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  max_allowed TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (role_key, module_id, action_id),
  KEY idx_role_permission_limits_module (module_id, action_id),
  CONSTRAINT fk_role_permission_limits_role FOREIGN KEY (role_key)
    REFERENCES permission_roles (role_key) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_role_permission_limits_module FOREIGN KEY (module_id)
    REFERENCES permission_modules (module_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_role_permission_limits_action FOREIGN KEY (action_id)
    REFERENCES permission_actions (action_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE role_module_permissions (
  role_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  module_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  action_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  is_allowed TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (role_key, module_id, action_id),
  KEY idx_role_module_permissions_module (module_id, action_id),
  CONSTRAINT fk_role_module_permissions_role FOREIGN KEY (role_key)
    REFERENCES permission_roles (role_key) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_role_module_permissions_module FOREIGN KEY (module_id)
    REFERENCES permission_modules (module_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_role_module_permissions_action FOREIGN KEY (action_id)
    REFERENCES permission_actions (action_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE account_permission_overrides (
  admin_id BIGINT UNSIGNED NOT NULL,
  module_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  action_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  is_allowed TINYINT(1) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (admin_id, module_id, action_id),
  KEY idx_account_permission_overrides_module (module_id, action_id),
  CONSTRAINT fk_account_permission_overrides_admin FOREIGN KEY (admin_id)
    REFERENCES admins (id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_account_permission_overrides_module FOREIGN KEY (module_id)
    REFERENCES permission_modules (module_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_account_permission_overrides_action FOREIGN KEY (action_id)
    REFERENCES permission_actions (action_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE admin_permission_audit (
  audit_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_admin_id BIGINT UNSIGNED NOT NULL,
  target_admin_id BIGINT UNSIGNED NULL,
  operation VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  details JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (audit_id),
  KEY idx_admin_permission_audit_actor_time (actor_admin_id, created_at),
  KEY idx_admin_permission_audit_target_time (target_admin_id, created_at),
  CONSTRAINT fk_admin_permission_audit_actor FOREIGN KEY (actor_admin_id)
    REFERENCES admins (id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_admin_permission_audit_target FOREIGN KEY (target_admin_id)
    REFERENCES admins (id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO permission_roles (role_key, label, is_builtin) VALUES
  ('admin', 'Admin', 1),
  ('super-admin', 'Super Admin', 1);

INSERT INTO permission_actions (action_id, label) VALUES
  ('view', 'View'),
  ('create', 'Create'),
  ('edit', 'Edit'),
  ('publish', 'Publish'),
  ('delete', 'Delete'),
  ('manage', 'Manage'),
  ('configure', 'Configure');

INSERT INTO permission_modules
  (module_id, label, description, navigation_group, is_available, is_active)
VALUES
  ('overview', 'Overview', 'View the existing editorial dashboard overview.', 'Core dashboard', 1, 1),
  ('news-articles', 'News Articles', 'Create, edit, publish, and manage news articles.', 'Core dashboard', 1, 1),
  ('profile-settings', 'Profile Settings', 'Manage an administrator profile and credentials.', 'Core dashboard', 0, 0),
  ('monthly-reports', 'Monthly Reports', 'Prepare and view monthly activity reports.', 'Public-service management', 0, 0),
  ('citizen-services', 'Citizen Services', 'Manage public citizen-service information.', 'Public-service management', 0, 0),
  ('faq-management', 'FAQ Management', 'Manage frequently asked questions.', 'Public-service management', 0, 0),
  ('police-stations', 'Police Stations', 'Manage a public police-station directory.', 'Public-service management', 0, 0),
  ('helplines-registry', 'Helplines Registry', 'Manage public helpline information.', 'Public-service management', 0, 0),
  ('portal-links', 'Portal Links', 'Manage links to official portals.', 'Public-service management', 0, 0),
  ('web-stories', 'Web Stories', 'Create and publish web stories.', 'Content and media', 0, 0),
  ('hero-slider', 'Hero Slider', 'Manage featured homepage slider items.', 'Content and media', 0, 0),
  ('video-media', 'Video & Media', 'Manage video and media content.', 'Content and media', 0, 0),
  ('media-library', 'Media Library', 'Browse and manage uploaded media assets.', 'Content and media', 0, 0),
  ('official-alerts', 'Official Alerts', 'Create and publish official alerts.', 'Content and media', 0, 0),
  ('access-control', 'Access Control', 'Manage administrator access and permissions.', 'Access and account administration', 1, 1),
  ('user-management', 'User Management', 'Manage existing administrator accounts.', 'Access and account administration', 1, 1),
  ('role-builder', 'Role Builder', 'Create and configure administrative roles.', 'Access and account administration', 0, 0),
  ('session-management', 'Session Management', 'Review and revoke administrator sessions.', 'Access and account administration', 0, 0),
  ('security-events', 'Security Events', 'Review security events and alerts.', 'Access and account administration', 0, 0),
  ('audit-logs', 'Audit Logs', 'Review administrative audit history.', 'Access and account administration', 0, 0),
  ('branding-theme-editor', 'Branding & Theme Editor', 'Configure supported site branding and themes.', 'Website configuration', 0, 0),
  ('menu-management', 'Menu Management', 'Configure public navigation menus.', 'Website configuration', 0, 0),
  ('footer-management', 'Footer Management', 'Configure public site footer content.', 'Website configuration', 0, 0),
  ('seo-management', 'SEO Management', 'Configure search metadata and indexing settings.', 'Website configuration', 0, 0),
  ('system-configuration', 'System Configuration', 'Configure application-level settings.', 'System administration', 0, 0),
  ('backup-restore', 'Backup & Restore', 'Create and restore protected backups.', 'System administration', 0, 0),
  ('api-key-configuration', 'API Key Configuration', 'Configure protected service credentials.', 'System administration', 0, 0),
  ('smtp-configuration', 'SMTP Configuration', 'Configure outbound email delivery.', 'System administration', 0, 0);

INSERT INTO role_permission_limits (role_key, module_id, action_id, max_allowed)
SELECT roles.role_key, modules.module_id, actions.action_id,
       CASE
         WHEN roles.role_key = 'super-admin' THEN 1
         WHEN modules.module_id IN (
           'access-control', 'user-management', 'role-builder', 'session-management',
           'security-events', 'audit-logs', 'branding-theme-editor', 'menu-management',
           'footer-management', 'seo-management', 'system-configuration', 'backup-restore',
           'api-key-configuration', 'smtp-configuration'
         ) THEN 0
         WHEN actions.action_id = 'configure' THEN 0
         ELSE 1
       END
FROM permission_roles AS roles
CROSS JOIN permission_modules AS modules
CROSS JOIN permission_actions AS actions;

INSERT INTO role_module_permissions (role_key, module_id, action_id, is_allowed)
SELECT roles.role_key, modules.module_id, actions.action_id,
       CASE
         WHEN roles.role_key = 'super-admin' THEN 1
         WHEN modules.module_id = 'overview' AND actions.action_id = 'view' THEN 1
         WHEN modules.module_id = 'news-articles'
           AND actions.action_id IN ('view', 'create', 'edit', 'publish', 'delete', 'manage') THEN 1
         ELSE 0
       END
FROM permission_roles AS roles
CROSS JOIN permission_modules AS modules
CROSS JOIN permission_actions AS actions;
