import { pool } from '../database/pool.js';
import { HttpError } from '../errors/http-error.js';

const ARTICLE_FIELDS = [
  'title',
  'slug',
  'summary',
  'content',
  'cover_image_url',
  'source_url',
  'category_id',
  'author_name',
  'status',
  'is_featured'
];

function pagination(page, limit, total) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit)
  };
}

function searchClause(search, columns) {
  if (!search) {
    return { sql: '', values: [] };
  }

  const escaped = search.replace(/[\\%_]/g, '\\$&');
  const pattern = `%${escaped}%`;
  return {
    sql: ` AND (${columns.map((column) => `${column} LIKE ? ESCAPE '\\\\'`).join(' OR ')})`,
    values: columns.map(() => pattern)
  };
}

function filtersFor(query, { publicOnly = false } = {}) {
  const clauses = [];
  const values = [];

  if (publicOnly) {
    clauses.push("a.status = 'published'", 'a.published_at IS NOT NULL');
  } else if (query.status) {
    clauses.push('a.status = ?');
    values.push(query.status);
  }

  if (query.category) {
    clauses.push('c.slug = ?');
    values.push(query.category);
  }

  const search = searchClause(query.q, ['a.title', 'a.summary', 'a.content']);
  return {
    sql: `${clauses.length ? `WHERE ${clauses.join(' AND ')}` : 'WHERE 1 = 1'}${search.sql}`,
    values: [...values, ...search.values]
  };
}

function articleSelect() {
  return `SELECT a.id, a.title, a.slug, a.summary, a.content, a.cover_image_url,
                 a.source_url, a.category_id, c.name AS category_name, c.slug AS category_slug,
                 a.author_name, a.admin_id, a.status, a.is_featured, a.published_at,
                 a.created_at, a.updated_at
          FROM articles a
          INNER JOIN categories c ON c.id = a.category_id`;
}

function publicArticleSelect() {
  return `SELECT a.id, a.title, a.slug, a.summary, a.content, a.cover_image_url,
                 a.source_url, a.category_id, c.name AS category_name, c.slug AS category_slug,
                 a.author_name, a.is_featured, a.published_at, a.created_at, a.updated_at
          FROM articles a
          INNER JOIN categories c ON c.id = a.category_id`;
}

export async function listCategories(database = pool) {
  const [rows] = await database.execute(
    'SELECT id, name, slug, description FROM categories ORDER BY name ASC'
  );
  return rows;
}

export async function listPublicArticles(query, database = pool) {
  const filters = filtersFor(query, { publicOnly: true });
  const offset = (query.page - 1) * query.limit;
  const [[countRow]] = await database.execute(
    `SELECT COUNT(*) AS total FROM articles a INNER JOIN categories c ON c.id = a.category_id ${filters.sql}`,
    filters.values
  );
  const [articles] = await database.execute(
    `${publicArticleSelect()} ${filters.sql}
     ORDER BY a.is_featured DESC, a.published_at DESC
     LIMIT ? OFFSET ?`,
    [...filters.values, query.limit, offset]
  );

  return {
    data: articles,
    pagination: pagination(query.page, query.limit, Number(countRow.total))
  };
}

export async function listAdminArticles(query, database = pool) {
  const filters = filtersFor(query);
  const offset = (query.page - 1) * query.limit;
  const [[countRow]] = await database.execute(
    `SELECT COUNT(*) AS total FROM articles a INNER JOIN categories c ON c.id = a.category_id ${filters.sql}`,
    filters.values
  );
  const [articles] = await database.execute(
    `${articleSelect()} ${filters.sql}
     ORDER BY a.updated_at DESC, a.id DESC
     LIMIT ? OFFSET ?`,
    [...filters.values, query.limit, offset]
  );

  return {
    data: articles,
    pagination: pagination(query.page, query.limit, Number(countRow.total))
  };
}

export async function getPublicArticle(slug, database = pool) {
  const [rows] = await database.execute(
    `${publicArticleSelect()}
     WHERE a.slug = ? AND a.status = 'published' AND a.published_at IS NOT NULL
     LIMIT 1`,
    [slug]
  );
  return rows[0] ?? null;
}

export async function getAdminArticle(id, database = pool) {
  const [rows] = await database.execute(`${articleSelect()} WHERE a.id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

export async function createArticle(article, adminId, database = pool) {
  await requireCategory(article.category_id, database);
  const publishedAt = article.status === 'published' ? new Date() : null;
  try {
    const [result] = await database.execute(
      `INSERT INTO articles
         (title, slug, summary, content, cover_image_url, source_url, category_id,
          author_name, admin_id, status, is_featured, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        article.title,
        article.slug,
        article.summary,
        article.content,
        article.cover_image_url ?? null,
        article.source_url ?? null,
        article.category_id,
        article.author_name,
        adminId,
        article.status,
        article.is_featured,
        publishedAt
      ]
    );

    return getArticleById(result.insertId, database);
  } catch (error) {
    throw translateArticleWriteError(error);
  }
}

export async function updateArticle({ id, ...updates }, database = pool) {
  const [existingRows] = await database.execute('SELECT id FROM articles WHERE id = ? LIMIT 1', [id]);
  const existing = existingRows[0];
  if (!existing) {
    throw new HttpError(404, 'Article not found.');
  }
  if (updates.category_id !== undefined) {
    await requireCategory(updates.category_id, database);
  }

  const fields = ARTICLE_FIELDS.filter((field) => Object.hasOwn(updates, field));
  const assignments = fields.map((field) => `${field} = ?`);
  const values = fields.map((field) => updates[field] ?? null);

  if (updates.status === 'published') {
    assignments.push('published_at = COALESCE(published_at, CURRENT_TIMESTAMP)');
  } else if (updates.status === 'draft') {
    assignments.push('published_at = NULL');
  }

  try {
    await database.execute(
      `UPDATE articles SET ${assignments.join(', ')} WHERE id = ?`,
      [...values, id]
    );

    return getArticleById(id, database);
  } catch (error) {
    throw translateArticleWriteError(error);
  }
}

export async function deleteArticle(id, database = pool) {
  const [result] = await database.execute('DELETE FROM articles WHERE id = ?', [id]);
  if (result.affectedRows === 0) {
    throw new HttpError(404, 'Article not found.');
  }
}

async function getArticleById(id, database) {
  const [rows] = await database.execute(`${articleSelect()} WHERE a.id = ? LIMIT 1`, [id]);
  if (!rows[0]) {
    throw new HttpError(404, 'Article not found.');
  }
  return rows[0];
}

async function requireCategory(categoryId, database) {
  const [rows] = await database.execute('SELECT id FROM categories WHERE id = ? LIMIT 1', [categoryId]);
  if (!rows[0]) {
    throw new HttpError(400, 'The selected category does not exist.');
  }
}

function translateArticleWriteError(error) {
  if (error.code === 'ER_DUP_ENTRY') {
    return new HttpError(409, 'An article with this slug already exists.');
  }
  if (error.code === 'ER_NO_REFERENCED_ROW_2') {
    return new HttpError(400, 'The selected category does not exist.', { cause: error });
  }
  return error;
}
