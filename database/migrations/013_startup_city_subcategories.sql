CREATE TABLE startup_city_subcategories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_startup_city_category_slug (category_id, slug),
  UNIQUE KEY uq_startup_city_id_category (id, category_id),
  CONSTRAINT fk_startup_city_category
    FOREIGN KEY (category_id) REFERENCES categories (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARACTER SET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO startup_city_subcategories (category_id, name, slug)
SELECT categories.id, cities.name, cities.slug
FROM categories
CROSS JOIN (
  SELECT 'Chennai' AS name, 'chennai' AS slug
  UNION ALL SELECT 'Coimbatore', 'coimbatore'
  UNION ALL SELECT 'Madurai', 'madurai'
  UNION ALL SELECT 'Trichy', 'trichy'
  UNION ALL SELECT 'Salem', 'salem'
  UNION ALL SELECT 'Erode', 'erode'
  UNION ALL SELECT 'Tirunelveli', 'tirunelveli'
  UNION ALL SELECT 'Cuddalore', 'cuddalore'
  UNION ALL SELECT 'Tanjore', 'tanjore'
  UNION ALL SELECT 'Hosur', 'hosur'
) AS cities
WHERE categories.slug = 'startups'
ON DUPLICATE KEY UPDATE name = VALUES(name);

ALTER TABLE articles
  ADD COLUMN startup_city_id BIGINT UNSIGNED NULL AFTER category_id,
  ADD KEY idx_articles_startup_city_category (startup_city_id, category_id),
  ADD CONSTRAINT fk_articles_startup_city_category
    FOREIGN KEY (startup_city_id, category_id)
    REFERENCES startup_city_subcategories (id, category_id)
    ON UPDATE CASCADE ON DELETE RESTRICT;
