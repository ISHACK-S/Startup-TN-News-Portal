import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import bcrypt from 'bcrypt';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
process.env.MYSQL_HOST = '127.0.0.1';
process.env.MYSQL_PORT = '3306';
process.env.MYSQL_DATABASE = 'startuptn_test';
process.env.MYSQL_USER = 'test';
process.env.MYSQL_PASSWORD = 'test';
process.env.MYSQL_SSL = 'false';

let app;
let database;
let databaseAvailable = true;
let articles;
let adminHash;
const uploadedImageBufferSizes = [];
let uploadedBuffer;
let imageUploadFailure = false;

const categories = [
  { id: 1, name: 'Startups', slug: 'startups', description: null },
  { id: 2, name: 'Funding', slug: 'funding', description: null }
];
const admin = { id: 1, name: 'Test Admin', email: 'admin@example.com' };

function filterArticles(sql, values) {
  let params = [...values];
  let selected = [...articles];

  if (sql.includes("a.status = 'published'")) {
    selected = selected.filter((article) => article.status === 'published' && article.published_at);
  } else if (sql.includes('a.status = ?')) {
    const status = params.shift();
    selected = selected.filter((article) => article.status === status);
  }
  if (sql.includes('c.slug = ?')) {
    const categorySlug = params.shift();
    selected = selected.filter((article) => article.category_slug === categorySlug);
  }
  if (sql.includes('LIKE ?')) {
    const likeValues = [];
    while (params.length && typeof params[0] === 'string' && params[0].startsWith('%')) {
      likeValues.push(params.shift().replace(/^%|%$/g, '').replace(/\\([\\%_])/g, '$1').toLowerCase());
    }
    const needle = likeValues[0] ?? '';
    selected = selected.filter((article) =>
      [article.title, article.summary, article.content].some((value) => value.toLowerCase().includes(needle))
    );
  }
  return { selected, params };
}

function createFakeDatabase() {
  return {
    async execute(sql, values = []) {
      if (sql === 'SELECT 1') {
        if (!databaseAvailable) throw new Error('Database connection failed.');
        return [[{ ok: 1 }]];
      }
      if (sql.includes('FROM admins WHERE email = ?')) {
        return [[admin.email === values[0] ? { ...admin, password_hash: adminHash } : undefined].filter(Boolean)];
      }
      if (sql.startsWith('SELECT id, name, slug, description FROM categories')) {
        return [[...categories]];
      }
      if (sql.includes('FROM categories WHERE id = ?')) {
        const category = categories.find((entry) => entry.id === Number(values[0]));
        return [[category ? { id: category.id } : undefined].filter(Boolean)];
      }
      if (sql.startsWith('SELECT COUNT(*) AS total FROM articles')) {
        const { selected } = filterArticles(sql, values);
        return [[{ total: selected.length }]];
      }
      if (sql.startsWith('SELECT id FROM articles WHERE id = ?')) {
        const article = articles.find((entry) => entry.id === Number(values[0]));
        return [[article ? { id: article.id } : undefined].filter(Boolean)];
      }
      if (sql.includes('FROM articles a') && sql.includes('WHERE a.id = ?')) {
        const article = articles.find((entry) => entry.id === Number(values[0]));
        return [[article ? { ...article } : undefined].filter(Boolean)];
      }
      if (sql.includes('FROM articles a') && sql.includes('WHERE a.slug = ?')) {
        const article = articles.find(
          (entry) => entry.slug === values[0] && entry.status === 'published' && entry.published_at
        );
        if (!article) return [[]];
        const result = { ...article };
        if (!sql.includes('a.admin_id')) delete result.admin_id;
        return [[result]];
      }
      if (sql.includes('FROM articles a')) {
        const { selected, params } = filterArticles(sql, values);
        const limit = Number(params.at(-2));
        const offset = Number(params.at(-1));
        const rows = selected.slice(offset, offset + limit).map((article) => {
          const result = { ...article };
          if (!sql.includes('a.admin_id')) delete result.admin_id;
          return result;
        });
        return [rows];
      }
      if (sql.startsWith('INSERT INTO articles')) {
        const [
          title, slug, summary, content, coverImageUrl, sourceUrl, categoryId,
          authorName, adminId, status, isFeatured, publishedAt
        ] = values;
        if (articles.some((article) => article.slug === slug)) {
          const error = new Error('Duplicate slug');
          error.code = 'ER_DUP_ENTRY';
          throw error;
        }
        const category = categories.find((entry) => entry.id === categoryId);
        const inserted = {
          id: Math.max(0, ...articles.map((article) => article.id)) + 1,
          title, slug, summary, content, cover_image_url: coverImageUrl, source_url: sourceUrl,
          category_id: categoryId, category_name: category.name, category_slug: category.slug,
          author_name: authorName, admin_id: adminId, status, is_featured: isFeatured,
          published_at: publishedAt, created_at: new Date(), updated_at: new Date()
        };
        articles.push(inserted);
        return [{ insertId: inserted.id }];
      }
      if (sql.startsWith('UPDATE articles SET')) {
        const id = Number(values.at(-1));
        const article = articles.find((entry) => entry.id === id);
        const fields = sql.match(/^UPDATE articles SET (.+) WHERE id = \?$/)[1].split(', ');
        let valueIndex = 0;
        for (const field of fields) {
          const name = field.split(' = ')[0];
          if (field.endsWith(' = ?')) {
            const value = values[valueIndex++];
            const key = name === 'cover_image_url' ? 'cover_image_url' : name;
            article[key] = value;
            if (name === 'category_id') {
              const category = categories.find((entry) => entry.id === value);
              article.category_name = category.name;
              article.category_slug = category.slug;
            }
            if (name === 'status' && value === 'draft') article.published_at = null;
          } else if (name === 'published_at' && field.endsWith('CURRENT_TIMESTAMP)')) {
            article.published_at ??= new Date();
          } else if (name === 'published_at' && field.endsWith('NULL')) {
            article.published_at = null;
          }
        }
        article.updated_at = new Date();
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('DELETE FROM articles WHERE id = ?')) {
        const index = articles.findIndex((entry) => entry.id === Number(values[0]));
        if (index < 0) return [{ affectedRows: 0 }];
        articles.splice(index, 1);
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Unexpected SQL in API test: ${sql}`);
    }
  };
}

before(async () => {
  adminHash = await bcrypt.hash('correct-test-password', 4);
  articles = [];
  const [{ createApp }, { default: session }, { HttpError }] = await Promise.all([
    import('../src/app.js'),
    import('express-session'),
    import('../src/errors/http-error.js')
  ]);
  database = createFakeDatabase();
  app = createApp({
    database,
    sessionStore: new session.MemoryStore(),
    imageUploader: async (buffer, detectedType) => {
      uploadedBuffer = buffer;
      uploadedImageBufferSizes.push(buffer.length);
      assert.equal(detectedType.mime, 'image/png');
      if (imageUploadFailure) {
        throw new HttpError(502, 'The image provider could not complete the upload.');
      }
      return {
        url: 'https://res.cloudinary.com/startuptn/image/upload/startuptn-news/articles/test.png',
        provider_id: 'startuptn-news/articles/test'
      };
    }
  });
});

describe('admin authentication and article API', () => {
  it('reports healthy and unavailable database states', async () => {
    const healthy = await request(app).get('/api/health');
    assert.equal(healthy.status, 200);
    assert.deepEqual(healthy.body, { status: 'ok', database: 'connected' });

    databaseAvailable = false;
    const unavailable = await request(app).get('/api/health');
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.error.message, 'The database is unavailable.');
    databaseAvailable = true;
  });

  it('rejects unauthenticated admin API requests', async () => {
    const response = await request(app).get('/api/admin/articles/');
    assert.equal(response.status, 401);
    assert.equal(response.body.error.message, 'Authentication is required.');

    const missing = await request(app).get('/api/not-a-route');
    assert.equal(missing.status, 404);
    assert.equal(typeof missing.body.error.message, 'string');
  });

  it('validates login fields and does not create a session on failure', async () => {
    const invalid = await request(app).post('/api/auth/login').send({ email: 'bad', password: '' });
    assert.equal(invalid.status, 400);

    const rejected = await request(app)
      .post('/api/auth/login')
      .send({ email: admin.email, password: 'wrong-password' });
    assert.equal(rejected.status, 401);
    assert.equal(rejected.body.error.message, 'Invalid email or password.');
  });

  it('rejects cross-origin state-changing requests', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://untrusted.example')
      .send({ email: admin.email, password: 'correct-test-password' });
    assert.equal(response.status, 403);
  });

  it('keeps drafts private from both public news routes and public article lookup', async () => {
    const agent = request.agent(app);
    const login = await agent
      .post('/api/auth/login')
      .send({ email: admin.email, password: 'correct-test-password' });
    assert.equal(login.status, 200);
    assert.match(login.headers['set-cookie'][0], /HttpOnly/i);
    assert.match(login.headers['set-cookie'][0], /SameSite=Strict/i);
    assert.equal(Object.hasOwn(login.body.data.admin, 'password_hash'), false);

    const created = await agent.post('/api/admin/articles/').send({
      title: 'Private draft',
      slug: 'private-draft',
      summary: 'Draft summary',
      content: 'Draft content',
      category_id: 1,
      author_name: 'StartupTN',
      status: 'draft'
    });
    assert.equal(created.status, 201);

    for (const url of ['/api/news', '/api/news/']) {
      const listing = await request(app).get(url);
      assert.equal(listing.status, 200);
      assert.equal(listing.body.data.length, 0);
    }
    const detail = await request(app).get('/api/news/private-draft');
    assert.equal(detail.status, 404);
  });

  it('validates article input, rejects duplicate slugs, and performs CRUD', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: admin.email, password: 'correct-test-password' });

    const invalid = await agent.post('/api/admin/articles').send({
      title: 'Invalid category',
      slug: 'invalid-category',
      summary: 'Summary',
      content: 'Body',
      category_id: 999,
      author_name: 'Reporter'
    });
    assert.equal(invalid.status, 400);

    const created = await agent.post('/api/admin/articles').send({
      title: 'Published story',
      slug: 'published-story',
      summary: 'A searchable summary',
      content: 'Full article content',
      cover_image_url: 'https://res.cloudinary.com/startuptn/image/upload/startuptn-news/articles/test.png',
      category_id: 2,
      author_name: 'Reporter',
      status: 'published',
      is_featured: true
    });
    assert.equal(created.status, 201);
    assert.ok(created.body.data.published_at);
    assert.equal(
      created.body.data.cover_image_url,
      'https://res.cloudinary.com/startuptn/image/upload/startuptn-news/articles/test.png'
    );

    const duplicate = await agent.post('/api/admin/articles').send({
      title: 'Duplicate story',
      slug: 'published-story',
      summary: 'Summary',
      content: 'Body',
      category_id: 2,
      author_name: 'Reporter'
    });
    assert.equal(duplicate.status, 409);

    const publicListing = await request(app).get('/api/news?q=searchable&category=funding');
    assert.equal(publicListing.status, 200);
    assert.equal(publicListing.body.data.length, 1);
    assert.equal(publicListing.body.pagination.total, 1);
    assert.equal(Object.hasOwn(publicListing.body.data[0], 'admin_id'), false);
    const publicDetail = await request(app).get('/api/news/published-story');
    assert.equal(publicDetail.status, 200);
    assert.equal(Object.hasOwn(publicDetail.body.data, 'admin_id'), false);
    const badPagination = await request(app).get('/api/news?page=0&limit=1000');
    assert.equal(badPagination.status, 400);

    const patched = await agent.patch('/api/admin/articles/').send({
      id: created.body.data.id,
      status: 'draft',
      title: 'Updated story',
      cover_image_url: 'https://res.cloudinary.com/startuptn/image/upload/startuptn-news/articles/updated.png'
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.data.status, 'draft');
    assert.equal(patched.body.data.published_at, null);
    assert.equal(
      patched.body.data.cover_image_url,
      'https://res.cloudinary.com/startuptn/image/upload/startuptn-news/articles/updated.png'
    );
    const unpublishedListing = await request(app).get('/api/news?q=Updated');
    assert.equal(unpublishedListing.status, 200);
    assert.equal(unpublishedListing.body.data.some((article) => article.id === created.body.data.id), false);
    const unpublishedDetail = await request(app).get('/api/news/published-story');
    assert.equal(unpublishedDetail.status, 404);

    const adminList = await agent.get('/api/admin/articles?status=draft');
    assert.equal(adminList.status, 200);
    assert.ok(adminList.body.data.some((article) => article.id === created.body.data.id));
    const adminDetail = await agent.get(`/api/admin/articles/${created.body.data.id}`);
    assert.equal(adminDetail.status, 200);
    assert.equal(adminDetail.body.data.id, created.body.data.id);

    const removed = await agent.delete('/api/admin/articles/').send({ id: created.body.data.id });
    assert.equal(removed.status, 200);
    const missing = await agent.delete('/api/admin/articles/').send({ id: created.body.data.id });
    assert.equal(missing.status, 404);
  });

  it('returns categories and clears the authenticated session on logout', async () => {
    const categoryResponse = await request(app).get('/api/categories');
    assert.equal(categoryResponse.status, 200);
    assert.equal(categoryResponse.body.data.length, 2);

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: admin.email, password: 'correct-test-password' });
    assert.equal((await agent.get('/api/auth/me')).body.data.authenticated, true);
    assert.equal((await agent.post('/api/auth/logout')).status, 200);
    assert.equal((await agent.get('/api/auth/me')).body.data.authenticated, false);
  });

  it('persists and expires sessions through the MySQL session store contract', async () => {
    const { MySqlSessionStore } = await import('../src/database/session-store.js');
    const sessions = new Map();
    const database = {
      async execute(sql, values = []) {
        if (sql.startsWith('INSERT INTO admin_sessions')) {
          sessions.set(values[0], { session_data: values[2], expires_at: values[1] });
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('SELECT session_data, expires_at')) {
          const row = sessions.get(values[0]);
          return [[row ? { ...row } : undefined].filter(Boolean)];
        }
        if (sql.startsWith('UPDATE admin_sessions')) {
          const row = sessions.get(values[1]);
          if (row) row.expires_at = values[0];
          return [{ affectedRows: row ? 1 : 0 }];
        }
        if (sql.startsWith('DELETE FROM admin_sessions')) {
          sessions.delete(values[0]);
          return [{ affectedRows: 1 }];
        }
        throw new Error(`Unexpected session SQL in test: ${sql}`);
      }
    };
    const store = new MySqlSessionStore(database);
    const callStore = (method, ...args) =>
      new Promise((resolve, reject) => store[method](...args, (error, value) => (error ? reject(error) : resolve(value))));
    const sessionData = { adminId: 1, cookie: { expires: new Date(Date.now() + 60_000) } };

    await callStore('set', 'session-id', sessionData);
    const restored = await callStore('get', 'session-id');
    assert.equal(restored.adminId, sessionData.adminId);
    assert.equal(
      new Date(restored.cookie.expires).getTime(),
      sessionData.cookie.expires.getTime()
    );
    await callStore('touch', 'session-id', sessionData);
    await callStore('destroy', 'session-id');
    assert.equal(await callStore('get', 'session-id'), null);
    sessions.set('expired-session', {
      session_data: JSON.stringify(sessionData),
      expires_at: Math.floor(Date.now() / 1000) - 1
    });
    assert.equal(await callStore('get', 'expired-session'), null);
    assert.equal(sessions.has('expired-session'), false);
    store.close();
  });

  it('requires an admin, validates image content, enforces the size limit, and returns Cloudinary metadata', async () => {
    const unauthenticated = await request(app)
      .post('/api/admin/uploads')
      .attach('image', Buffer.from('not an image'), { filename: 'photo.png', contentType: 'image/png' });
    assert.equal(unauthenticated.status, 401);

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: admin.email, password: 'correct-test-password' });

    const invalid = await agent
      .post('/api/admin/uploads')
      .attach('image', Buffer.from('not an image'), { filename: 'photo.png', contentType: 'image/png' });
    assert.equal(invalid.status, 415);

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/r8cAAAAASUVORK5CYII=',
      'base64'
    );
    const uploaded = await agent
      .post('/api/admin/uploads')
      .attach('image', png, { filename: 'untrusted-name.bin', contentType: 'application/octet-stream' });
    assert.equal(uploaded.status, 201);
    assert.equal(
      uploaded.body.data.url,
      'https://res.cloudinary.com/startuptn/image/upload/startuptn-news/articles/test.png'
    );
    assert.equal(uploaded.body.data.provider_id, 'startuptn-news/articles/test');
    assert.ok(uploadedImageBufferSizes[0] > 0);
    assert.ok(uploadedBuffer.every((byte) => byte === 0));

    imageUploadFailure = true;
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const failedUpload = await agent
        .post('/api/admin/uploads')
        .attach('image', png, { filename: 'failure.png', contentType: 'image/png' });
      assert.equal(failedUpload.status, 502);
      assert.equal(
        failedUpload.body.error.message,
        'The image provider could not complete the upload.'
      );
      assert.ok(uploadedBuffer.every((byte) => byte === 0));
    } finally {
      imageUploadFailure = false;
      console.error = originalConsoleError;
    }

    const oversized = await agent
      .post('/api/admin/uploads')
      .attach('image', Buffer.alloc(5 * 1024 * 1024 + 1, 0), {
        filename: 'large.png',
        contentType: 'image/png'
      });
    assert.equal(oversized.status, 413);
    assert.match(oversized.body.error.message, /5 MB limit/);
  });
});
