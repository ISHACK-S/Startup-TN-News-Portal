ALTER TABLE admins
  MODIFY COLUMN role VARCHAR(100) NOT NULL DEFAULT 'Admin',
  ADD KEY idx_admins_role (role);

ALTER TABLE permission_roles
  ADD COLUMN description VARCHAR(500) NOT NULL DEFAULT '' AFTER label,
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER is_builtin,
  ADD UNIQUE KEY uq_permission_roles_label (label);

UPDATE permission_roles
SET description = CASE role_key
      WHEN 'admin' THEN 'Built-in editorial administrator role.'
      WHEN 'super-admin' THEN 'Protected role with unrestricted administrative authority.'
      ELSE description
    END,
    is_active = 1
WHERE role_key IN ('admin', 'super-admin');
