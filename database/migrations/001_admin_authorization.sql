ALTER TABLE admins
  ADD COLUMN role ENUM('Admin', 'Super Admin') NOT NULL DEFAULT 'Admin',
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN auth_version INT UNSIGNED NOT NULL DEFAULT 0;

UPDATE admins
SET role = 'Admin'
WHERE role IS NULL;
