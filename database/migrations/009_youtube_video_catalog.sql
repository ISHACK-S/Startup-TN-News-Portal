ALTER TABLE media_videos
  ADD COLUMN is_featured TINYINT(1) NOT NULL DEFAULT 0 AFTER category,
  ADD UNIQUE KEY uq_media_videos_provider_embed (provider, embed_id),
  ADD KEY idx_media_videos_category_status_published (category, status, published_at);
