ALTER TABLE admins
  ADD COLUMN username VARCHAR(64) NULL AFTER name,
  ADD UNIQUE KEY uq_admins_username (username);
