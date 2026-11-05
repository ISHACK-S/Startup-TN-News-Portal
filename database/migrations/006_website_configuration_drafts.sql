CREATE TABLE IF NOT EXISTS site_configuration_drafts (
  config_key VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  config_value JSON NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (config_key),
  KEY idx_site_configuration_drafts_updated_by (updated_by),
  CONSTRAINT fk_site_configuration_drafts_admin
    FOREIGN KEY (updated_by) REFERENCES admins (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
