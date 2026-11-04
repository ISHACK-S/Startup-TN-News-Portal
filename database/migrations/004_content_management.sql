CREATE TABLE IF NOT EXISTS media_assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cloudinary_public_id VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  secure_url VARCHAR(2048) NOT NULL,
  resource_type VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'image',
  format VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  width INT UNSIGNED NULL,
  height INT UNSIGNED NULL,
  bytes BIGINT UNSIGNED NULL,
  original_filename VARCHAR(255) NULL,
  uploaded_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_media_assets_cloudinary_id (cloudinary_public_id),
  KEY idx_media_assets_created (created_at, id),
  KEY idx_media_assets_format (format),
  CONSTRAINT fk_media_assets_uploader
    FOREIGN KEY (uploaded_by) REFERENCES admins (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS web_stories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(180) NOT NULL,
  slug VARCHAR(200) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  description VARCHAR(500) NULL,
  status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NULL,
  published_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_web_stories_slug (slug),
  KEY idx_web_stories_status_published (status, published_at),
  CONSTRAINT fk_web_stories_admin
    FOREIGN KEY (created_by) REFERENCES admins (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS web_story_slides (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  story_id BIGINT UNSIGNED NOT NULL,
  position INT UNSIGNED NOT NULL,
  image_url VARCHAR(2048) NOT NULL,
  alt_text VARCHAR(255) NOT NULL,
  caption VARCHAR(500) NULL,
  link_url VARCHAR(2048) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_web_story_slide_position (story_id, position),
  KEY idx_web_story_slides_story (story_id, position),
  CONSTRAINT fk_web_story_slides_story
    FOREIGN KEY (story_id) REFERENCES web_stories (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS hero_slides (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  description VARCHAR(1000) NULL,
  image_url VARCHAR(2048) NOT NULL,
  alt_text VARCHAR(255) NOT NULL,
  destination_url VARCHAR(2048) NULL,
  article_id BIGINT UNSIGNED NULL,
  display_order INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NULL,
  published_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hero_slides_publication_order (status, published_at, display_order, id),
  CONSTRAINT fk_hero_slides_article
    FOREIGN KEY (article_id) REFERENCES articles (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_hero_slides_admin
    FOREIGN KEY (created_by) REFERENCES admins (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS media_videos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  source_url VARCHAR(2048) NOT NULL,
  provider VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  embed_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  thumbnail_url VARCHAR(2048) NULL,
  thumbnail_alt VARCHAR(255) NULL,
  category VARCHAR(100) NULL,
  display_order INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NULL,
  published_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_media_videos_publication_order (status, published_at, display_order, id),
  KEY idx_media_videos_provider (provider),
  CONSTRAINT fk_media_videos_admin
    FOREIGN KEY (created_by) REFERENCES admins (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

UPDATE permission_modules
SET is_available = 1, is_active = 1
WHERE module_id IN ('media-library', 'web-stories', 'hero-slider', 'video-media');
