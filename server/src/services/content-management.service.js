import { pool } from '../database/pool.js';
import { HttpError } from '../errors/http-error.js';

function pagination(page, limit, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

function searchClause(query, columns) {
  if (!query) return { sql: '', values: [] };
  const escaped = query.replace(/[\\%_]/g, '\\$&');
  const pattern = `%${escaped}%`;
  return {
    sql: ` AND (${columns.map((column) => `${column} LIKE ? ESCAPE '\\\\'`).join(' OR ')})`,
    values: columns.map(() => pattern)
  };
}

async function pagedQuery(database, { countSql, dataSql, values, page, limit }) {
  const [[count]] = await database.execute(countSql, values);
  const [data] = await database.execute(dataSql, [...values, limit, (page - 1) * limit]);
  return { data, pagination: pagination(page, limit, Number(count.total)) };
}

async function inTransaction(database, operation) {
  await database.beginTransaction();
  try {
    const result = await operation();
    await database.commit();
    return result;
  } catch (error) {
    try {
      await database.rollback();
    } catch {
      throw new Error('The content update failed and its rollback could not be confirmed.');
    }
    throw error;
  }
}

function translateDuplicate(error, message) {
  if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, message, { cause: error });
  throw error;
}

export async function registerMediaAsset(asset, filename, adminId, database = pool) {
  const publicId = asset.provider_id;
  if (!publicId || !asset.url) throw new HttpError(502, 'The image provider returned incomplete asset details.');
  await database.execute(
    `INSERT INTO media_assets
       (cloudinary_public_id, secure_url, resource_type, format, width, height, bytes, original_filename, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [
      publicId,
      asset.url,
      asset.resource_type ?? 'image',
      asset.format ?? null,
      asset.width ?? null,
      asset.height ?? null,
      asset.bytes ?? null,
      filename?.slice(0, 255) ?? null,
      adminId ?? null
    ]
  );
  const [rows] = await database.execute(
    `SELECT id, cloudinary_public_id, secure_url, resource_type, format, width, height,
            bytes, original_filename, created_at
     FROM media_assets WHERE cloudinary_public_id = ? LIMIT 1`,
    [publicId]
  );
  if (!rows[0]) throw new HttpError(500, 'The uploaded media could not be registered.');
  return rows[0];
}

export async function listMediaAssets(query, database = pool) {
  const filters = [];
  const values = [];
  if (query.format) {
    filters.push('format = ?');
    values.push(query.format);
  }
  const search = searchClause(query.q, ['original_filename', 'cloudinary_public_id']);
  const where = `WHERE 1 = 1${filters.length ? ` AND ${filters.join(' AND ')}` : ''}${search.sql}`;
  const args = [...values, ...search.values];
  return pagedQuery(database, {
    countSql: `SELECT COUNT(*) AS total FROM media_assets ${where}`,
    dataSql: `SELECT id, cloudinary_public_id, secure_url, resource_type, format, width, height,
                     bytes, original_filename, created_at
              FROM media_assets ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    values: args,
    page: query.page,
    limit: query.limit
  });
}

export async function getMediaAsset(id, database = pool) {
  const [rows] = await database.execute(
    `SELECT id, cloudinary_public_id, secure_url, resource_type, format, width, height,
            bytes, original_filename, created_at
     FROM media_assets WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

function storyColumns() {
  return `SELECT id, title, slug, description, status, published_at, created_at, updated_at
          FROM web_stories`;
}

async function getWebStoryDetail(id, database) {
  const [stories] = await database.execute(`${storyColumns()} WHERE id = ? LIMIT 1`, [id]);
  if (!stories[0]) return null;
  const [slides] = await database.execute(
    `SELECT id, position, image_url, alt_text, caption, link_url
     FROM web_story_slides WHERE story_id = ? ORDER BY position ASC`,
    [id]
  );
  return { ...stories[0], slides };
}

export async function listWebStories(query, database = pool, { publicOnly = false } = {}) {
  const filters = [];
  const values = [];
  if (publicOnly) filters.push("status = 'published'", 'published_at IS NOT NULL');
  else if (query.status) {
    filters.push('status = ?');
    values.push(query.status);
  }
  const search = searchClause(query.q, ['title', 'description']);
  const where = `WHERE ${filters.length ? filters.join(' AND ') : '1 = 1'}${search.sql}`;
  const args = [...values, ...search.values];
  return pagedQuery(database, {
    countSql: `SELECT COUNT(*) AS total FROM web_stories ${where}`,
    dataSql: `SELECT web_stories.*,
                     (SELECT image_url FROM web_story_slides WHERE story_id = web_stories.id ORDER BY position ASC LIMIT 1) AS cover_image_url,
                     (SELECT COUNT(*) FROM web_story_slides WHERE story_id = web_stories.id) AS slide_count
              FROM web_stories ${where}
              ORDER BY web_stories.updated_at DESC, web_stories.id DESC LIMIT ? OFFSET ?`,
    values: args,
    page: query.page,
    limit: query.limit
  });
}

export async function getAdminWebStory(id, database = pool) {
  return getWebStoryDetail(id, database);
}

export async function getPublicWebStory(slug, database = pool) {
  const [rows] = await database.execute(
    `${storyColumns()} WHERE slug = ? AND status = 'published' AND published_at IS NOT NULL LIMIT 1`,
    [slug]
  );
  if (!rows[0]) return null;
  const [slides] = await database.execute(
    `SELECT position, image_url, alt_text, caption, link_url
     FROM web_story_slides WHERE story_id = ? ORDER BY position ASC`,
    [rows[0].id]
  );
  return { ...rows[0], slides };
}

async function insertStorySlides(storyId, slides, database) {
  await database.execute('DELETE FROM web_story_slides WHERE story_id = ?', [storyId]);
  for (const [position, slide] of slides.entries()) {
    await database.execute(
      `INSERT INTO web_story_slides (story_id, position, image_url, alt_text, caption, link_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [storyId, position, slide.image_url, slide.alt_text, slide.caption ?? null, slide.link_url ?? null]
    );
  }
}

export async function createWebStory(input, adminId, database) {
  if (input.status === 'published' && !input.slides.length) {
    throw new HttpError(400, 'Add at least one slide before publishing a story.');
  }
  return inTransaction(database, async () => {
    try {
      const [result] = await database.execute(
        `INSERT INTO web_stories (title, slug, description, status, created_by, published_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          input.title, input.slug, input.description ?? null, input.status, adminId,
          input.status === 'published' ? new Date() : null
        ]
      );
      await insertStorySlides(result.insertId, input.slides, database);
      return getWebStoryDetail(result.insertId, database);
    } catch (error) {
      translateDuplicate(error, 'A web story with this slug already exists.');
    }
  });
}

export async function updateWebStory(id, updates, database) {
  return inTransaction(database, async () => {
    const [existingRows] = await database.execute(
      'SELECT id, status FROM web_stories WHERE id = ? LIMIT 1 FOR UPDATE',
      [id]
    );
    if (!existingRows[0]) throw new HttpError(404, 'Web story not found.');
    const [slideRows] = await database.execute(
      'SELECT id FROM web_story_slides WHERE story_id = ?',
      [id]
    );
    const slideCount = updates.slides?.length ?? slideRows.length;
    if (updates.status === 'published' && !slideCount) {
      throw new HttpError(400, 'Add at least one slide before publishing a story.');
    }
    const fields = ['title', 'slug', 'description', 'status'].filter((field) => Object.hasOwn(updates, field));
    const assignments = fields.map((field) => `${field} = ?`);
    const values = fields.map((field) => updates[field] ?? null);
    if (updates.status === 'published') assignments.push('published_at = COALESCE(published_at, CURRENT_TIMESTAMP)');
    if (updates.status === 'draft') assignments.push('published_at = NULL');
    if (assignments.length) {
      try {
        await database.execute(
          `UPDATE web_stories SET ${assignments.join(', ')} WHERE id = ?`,
          [...values, id]
        );
      } catch (error) {
        translateDuplicate(error, 'A web story with this slug already exists.');
      }
    }
    if (updates.slides) await insertStorySlides(id, updates.slides, database);
    return getWebStoryDetail(id, database);
  });
}

export async function deleteWebStory(id, database = pool) {
  const [result] = await database.execute('DELETE FROM web_stories WHERE id = ?', [id]);
  if (!result.affectedRows) throw new HttpError(404, 'Web story not found.');
}

const HERO_SELECT = `SELECT h.id, h.title, h.description, h.image_url, h.alt_text,
                            h.destination_url, h.article_id, a.slug AS article_slug,
                            h.display_order, h.status, h.published_at, h.created_at, h.updated_at
                     FROM hero_slides h
                     LEFT JOIN articles a ON a.id = h.article_id`;

export async function listHeroSlides(query, database = pool, { publicOnly = false } = {}) {
  const filters = [];
  const values = [];
  if (publicOnly) {
    filters.push("h.status = 'published'", 'h.published_at IS NOT NULL', "(h.article_id IS NULL OR (a.status = 'published' AND a.published_at IS NOT NULL))");
  } else if (query.status) {
    filters.push('h.status = ?');
    values.push(query.status);
  }
  const search = searchClause(query.q, ['h.title', 'h.description']);
  const where = `WHERE ${filters.length ? filters.join(' AND ') : '1 = 1'}${search.sql}`;
  const args = [...values, ...search.values];
  return pagedQuery(database, {
    countSql: `SELECT COUNT(*) AS total FROM hero_slides h LEFT JOIN articles a ON a.id = h.article_id ${where}`,
    dataSql: `${HERO_SELECT} ${where} ORDER BY h.display_order ASC, h.id ASC LIMIT ? OFFSET ?`,
    values: args,
    page: query.page,
    limit: query.limit
  });
}

export async function getHeroSlide(id, database = pool) {
  const [rows] = await database.execute(`${HERO_SELECT} WHERE h.id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

async function validateHeroArticle(articleId, status, database) {
  if (!articleId || status !== 'published') return;
  const [rows] = await database.execute(
    "SELECT id FROM articles WHERE id = ? AND status = 'published' AND published_at IS NOT NULL LIMIT 1",
    [articleId]
  );
  if (!rows[0]) throw new HttpError(400, 'The linked article must be published before the slide.');
}

function validateHeroDestination(input) {
  if (input.article_id != null && input.destination_url != null) {
    throw new HttpError(400, 'Choose either a published article or a destination URL, not both.');
  }
}

function heroValues(input, adminId) {
  return [
    input.title, input.description ?? null, input.image_url, input.alt_text,
    input.destination_url ?? null, input.article_id ?? null, input.display_order,
    input.status, adminId, input.status === 'published' ? new Date() : null
  ];
}

export async function createHeroSlide(input, adminId, database = pool) {
  validateHeroDestination(input);
  await validateHeroArticle(input.article_id, input.status, database);
  const [result] = await database.execute(
    `INSERT INTO hero_slides
       (title, description, image_url, alt_text, destination_url, article_id, display_order, status, created_by, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    heroValues(input, adminId)
  );
  return getHeroSlide(result.insertId, database);
}

export async function updateHeroSlide(id, updates, database = pool) {
  const current = await getHeroSlide(id, database);
  if (!current) throw new HttpError(404, 'Hero slide not found.');
  const merged = { ...current, ...updates };
  validateHeroDestination(merged);
  await validateHeroArticle(merged.article_id, merged.status, database);
  const allowed = ['title', 'description', 'image_url', 'alt_text', 'destination_url', 'article_id', 'display_order', 'status'];
  const fields = allowed.filter((field) => Object.hasOwn(updates, field));
  const assignments = fields.map((field) => `${field} = ?`);
  const values = fields.map((field) => updates[field] ?? null);
  if (updates.status === 'published') assignments.push('published_at = COALESCE(published_at, CURRENT_TIMESTAMP)');
  if (updates.status === 'draft') assignments.push('published_at = NULL');
  if (assignments.length) {
    await database.execute(`UPDATE hero_slides SET ${assignments.join(', ')} WHERE id = ?`, [...values, id]);
  }
  return getHeroSlide(id, database);
}

export async function deleteHeroSlide(id, database = pool) {
  const [result] = await database.execute('DELETE FROM hero_slides WHERE id = ?', [id]);
  if (!result.affectedRows) throw new HttpError(404, 'Hero slide not found.');
}

function videoEmbed(sourceUrl) {
  const url = new URL(sourceUrl);
  const host = url.hostname.toLowerCase();
  let provider;
  let id;
  if (['youtu.be', 'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
    provider = 'youtube';
    id = host === 'youtu.be'
      ? url.pathname.split('/')[1]
      : url.searchParams.get('v') ?? url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
    if (!/^[A-Za-z0-9_-]{11}$/.test(id ?? '')) throw new HttpError(400, 'The YouTube video URL is invalid.');
    return { provider, embed_id: id, embed_url: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  provider = 'vimeo';
  id = url.pathname.match(/\/(?:video\/)?(\d{5,12})\/?$/)?.[1];
  if (!id) throw new HttpError(400, 'The Vimeo video URL is invalid.');
  return { provider, embed_id: id, embed_url: `https://player.vimeo.com/video/${id}` };
}

const VIDEO_SELECT = `SELECT id, title, description, source_url, provider, embed_id,
                             thumbnail_url, thumbnail_alt, category, display_order,
                             status, published_at, created_at, updated_at
                      FROM media_videos`;

function addVideoEmbed(video) {
  return { ...video, embed_url: videoEmbed(video.source_url).embed_url };
}

export async function listVideos(query, database = pool, { publicOnly = false } = {}) {
  const filters = [];
  const values = [];
  if (publicOnly) filters.push("status = 'published'", 'published_at IS NOT NULL');
  else if (query.status) {
    filters.push('status = ?');
    values.push(query.status);
  }
  if (query.provider) {
    filters.push('provider = ?');
    values.push(query.provider);
  }
  const search = searchClause(query.q, ['title', 'description', 'category']);
  const where = `WHERE ${filters.length ? filters.join(' AND ') : '1 = 1'}${search.sql}`;
  const args = [...values, ...search.values];
  const result = await pagedQuery(database, {
    countSql: `SELECT COUNT(*) AS total FROM media_videos ${where}`,
    dataSql: `${VIDEO_SELECT} ${where} ORDER BY display_order ASC, id ASC LIMIT ? OFFSET ?`,
    values: args,
    page: query.page,
    limit: query.limit
  });
  return { ...result, data: result.data.map(addVideoEmbed) };
}

export async function getVideo(id, database = pool) {
  const [rows] = await database.execute(`${VIDEO_SELECT} WHERE id = ? LIMIT 1`, [id]);
  return rows[0] ? addVideoEmbed(rows[0]) : null;
}

function videoValues(input) {
  const parsed = videoEmbed(input.source_url);
  return [
    input.title, input.description ?? null, input.source_url, parsed.provider, parsed.embed_id,
    input.thumbnail_url ?? null, input.thumbnail_alt ?? null, input.category ?? null,
    input.display_order, input.status, input.status === 'published' ? new Date() : null
  ];
}

export async function createVideo(input, adminId, database = pool) {
  const values = videoValues(input);
  const [result] = await database.execute(
    `INSERT INTO media_videos
       (title, description, source_url, provider, embed_id, thumbnail_url, thumbnail_alt,
        category, display_order, status, created_by, published_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [...values.slice(0, 10), adminId, values[10]]
  );
  return getVideo(result.insertId, database);
}

export async function updateVideo(id, updates, database = pool) {
  const current = await getVideo(id, database);
  if (!current) throw new HttpError(404, 'Video entry not found.');
  const merged = { ...current, ...updates };
  const derived = videoEmbed(merged.source_url);
  const fields = ['title', 'description', 'source_url', 'thumbnail_url', 'thumbnail_alt', 'category', 'display_order', 'status']
    .filter((field) => Object.hasOwn(updates, field));
  const assignments = fields.map((field) => `${field} = ?`);
  const values = fields.map((field) => updates[field] ?? null);
  if (Object.hasOwn(updates, 'source_url')) {
    assignments.push('provider = ?', 'embed_id = ?');
    values.push(derived.provider, derived.embed_id);
  }
  if (updates.status === 'published') assignments.push('published_at = COALESCE(published_at, CURRENT_TIMESTAMP)');
  if (updates.status === 'draft') assignments.push('published_at = NULL');
  if (assignments.length) await database.execute(
    `UPDATE media_videos SET ${assignments.join(', ')} WHERE id = ?`,
    [...values, id]
  );
  return getVideo(id, database);
}

export async function deleteVideo(id, database = pool) {
  const [result] = await database.execute('DELETE FROM media_videos WHERE id = ?', [id]);
  if (!result.affectedRows) throw new HttpError(404, 'Video entry not found.');
}
