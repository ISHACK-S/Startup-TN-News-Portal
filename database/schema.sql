CREATE TABLE IF NOT EXISTS admins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admins_email (email)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS admin_sessions (
  session_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at INT UNSIGNED NOT NULL,
  session_data MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  PRIMARY KEY (session_id),
  KEY idx_admin_sessions_expires_at (expires_at)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  description VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name),
  UNIQUE KEY uq_categories_slug (slug)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS articles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(280) NOT NULL,
  summary TEXT NOT NULL,
  content LONGTEXT NOT NULL,
  cover_image_url VARCHAR(2048) NULL,
  source_url VARCHAR(2048) NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  author_name VARCHAR(150) NOT NULL,
  admin_id BIGINT UNSIGNED NULL,
  status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  published_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_articles_slug (slug),
  KEY idx_articles_category_id (category_id),
  KEY idx_articles_admin_id (admin_id),
  KEY idx_articles_status_published_at (status, published_at),
  KEY idx_articles_featured_published_at (is_featured, published_at),
  CONSTRAINT fk_articles_category
    FOREIGN KEY (category_id) REFERENCES categories (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_articles_admin
    FOREIGN KEY (admin_id) REFERENCES admins (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT chk_articles_publication_state
    CHECK (
      (status = 'draft' AND published_at IS NULL)
      OR (status = 'published' AND published_at IS NOT NULL)
    )
) ENGINE=InnoDB
  DEFAULT CHARACTER SET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO categories (name, slug) VALUES
  ('Startups', 'startups'),
  ('Funding', 'funding'),
  ('Events', 'events'),
  ('Policy', 'policy'),
  ('Innovation', 'innovation'),
  ('Ecosystem', 'ecosystem')
ON DUPLICATE KEY UPDATE name = name;
