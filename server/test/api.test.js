import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { PERMISSION_ACTIONS, PERMISSION_MODULES } from '../src/permissions/registry.js';

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
const activityLogs = [];
let uploadedBuffer;
let imageUploadFailure = false;
let mediaAssets = [];

const categories = [
  { id: 1, name: 'Startups', slug: 'startups', description: null },
  { id: 2, name: 'Funding', slug: 'funding', description: null }
];
const startupCities = [
  { id: 1, name: 'Chennai', slug: 'chennai', category_id: 1 },
  { id: 2, name: 'Coimbatore', slug: 'coimbatore', category_id: 1 },
  { id: 3, name: 'Madurai', slug: 'madurai', category_id: 1 },
  { id: 4, name: 'Trichy', slug: 'trichy', category_id: 1 },
  { id: 5, name: 'Salem', slug: 'salem', category_id: 1 },
  { id: 6, name: 'Erode', slug: 'erode', category_id: 1 },
  { id: 7, name: 'Tirunelveli', slug: 'tirunelveli', category_id: 1 },
  { id: 8, name: 'Cuddalore', slug: 'cuddalore', category_id: 1 },
  { id: 9, name: 'Tanjore', slug: 'tanjore', category_id: 1 },
  { id: 10, name: 'Hosur', slug: 'hosur', category_id: 1 }
];
const admin = {
  id: 1,
  name: 'Test Admin',
  username: 'test-admin',
  email: 'admin@example.com',
  role: 'Admin',
  is_active: 1,
  auth_version: 0
};

function filterArticles(sql, values) {
  let params = [...values];
  let selected = [...articles];

  if (sql.includes("a.status = 'published'")) {
    selected = selected.filter((article) => article.status === 'published' && article.published_at);
  } else if (sql.includes('a.status = ?')) {
    const status = params.shift();
    selected = selected.filter((article) => article.status === status);
  }
  if (/\bc\.slug = \?/.test(sql)) {
    const categorySlug = params.shift();
    selected = selected.filter((article) => article.category_slug === categorySlug);
  }
  if (sql.includes("c.slug = 'startups'")) {
    selected = selected.filter((article) => article.category_slug === 'startups');
  }
  if (sql.includes('sc.slug = ?')) {
    const citySlug = params.shift();
    selected = selected.filter((article) => article.startup_city_slug === citySlug);
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
      if (sql.startsWith('INSERT INTO admin_activity_logs')) {
        activityLogs.push(values);
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('INSERT INTO media_assets')) {
        const [publicId, secureUrl, resourceType, format, width, height, bytes, originalFilename] = values;
        if (!mediaAssets.some((asset) => asset.cloudinary_public_id === publicId)) {
          mediaAssets.push({
            id: mediaAssets.length + 1,
            cloudinary_public_id: publicId,
            secure_url: secureUrl,
            resource_type: resourceType,
            format,
            width,
            height,
            bytes,
            original_filename: originalFilename,
            created_at: new Date()
          });
        }
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('FROM media_assets WHERE cloudinary_public_id = ?')) {
        return [mediaAssets.filter((asset) => asset.cloudinary_public_id === values[0])];
      }
      if (sql.includes('FROM admins WHERE username = ?')) {
        return [[admin.username === values[0] ? { ...admin, password_hash: adminHash } : undefined].filter(Boolean)];
      }
      if (sql.includes('WHERE email = ?')
          && sql.includes('EXISTS (SELECT 1 FROM admins WHERE username IS NULL)')) {
        return [[admin.email === values[0] && admin.username == null
          ? { ...admin, password_hash: adminHash }
          : undefined].filter(Boolean)];
      }
      if (sql.includes('FROM admins WHERE id = ?')) {
        return [[admin.id === Number(values[0]) ? { ...admin } : undefined].filter(Boolean)];
      }
      if (sql.startsWith('SELECT role_key, is_active FROM permission_roles WHERE label = ?')) {
        const role = values[0] === 'Super Admin' ? 'super-admin' : 'admin';
        return [[{ role_key: role, is_active: 1 }]];
      }
      if (sql.startsWith('SELECT modules.module_id')) {
        const roleKey = values[0];
        const accountId = Number(values[2]);
        const protectedModules = new Set([
          'access-control', 'user-management', 'role-builder', 'branding-theme-editor',
          'menu-management', 'footer-management', 'seo-management'
        ]);
        return [[...PERMISSION_MODULES.flatMap((module) => PERMISSION_ACTIONS.map((actionId) => {
          const isSuperAdmin = roleKey === 'super-admin';
          const isAdminEditorialGrant = module.id === 'news-articles'
            && ['view', 'create', 'edit', 'publish', 'delete', 'manage'].includes(actionId);
          const isOverviewView = module.id === 'overview' && actionId === 'view';
          const maxAllowed = isSuperAdmin
            || (!protectedModules.has(module.id) && actionId !== 'configure');
          return {
            module_id: module.id,
            label: module.label,
            description: `${module.label} module`,
            navigation_group: module.group,
            is_available: module.available ? 1 : 0,
            is_active: module.available ? 1 : 0,
            action_id: actionId,
            max_allowed: maxAllowed ? 1 : 0,
            is_allowed: isSuperAdmin || isAdminEditorialGrant || isOverviewView ? 1 : 0,
            override_allowed: null,
            admin_id: accountId
          };
        }))]];
      }
      if (sql.startsWith('SELECT id, name, slug, description FROM categories')) {
        return [[...categories]];
      }
      if (sql.startsWith('SELECT sc.id, sc.name, sc.slug')) {
        return [[...startupCities.map(({ id, name, slug }) => ({ id, name, slug }))]];
      }
      if (sql.includes('FROM startup_city_subcategories sc') && sql.includes('WHERE sc.id = ?')) {
        const city = startupCities.find((entry) => entry.id === Number(values[0]));
        return [[city ? { id: city.id } : undefined].filter(Boolean)];
      }
      if (sql.includes('FROM categories WHERE id = ?')) {
        const category = categories.find((entry) => entry.id === Number(values[0]));
        return [[category ? { id: category.id, slug: category.slug } : undefined].filter(Boolean)];
      }
      if (sql.startsWith('SELECT COUNT(*) AS total FROM articles')) {
        const { selected } = filterArticles(sql, values);
        return [[{ total: selected.length }]];
      }
      if (sql.startsWith('SELECT id FROM articles WHERE id = ?')) {
        const article = articles.find((entry) => entry.id === Number(values[0]));
        return [[article ? { id: article.id } : undefined].filter(Boolean)];
      }
      if (sql.startsWith('SELECT id, category_id, startup_city_id FROM articles WHERE id = ?')) {
        const article = articles.find((entry) => entry.id === Number(values[0]));
        return [[article ? {
          id: article.id,
          category_id: article.category_id,
          startup_city_id: article.startup_city_id ?? null
        } : undefined].filter(Boolean)];
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
          title, slug, summary, content, coverImageUrl, sourceUrl, categoryId, startupCityId,
          authorName, adminId, status, isFeatured, publishedAt
        ] = values;
        if (articles.some((article) => article.slug === slug)) {
          const error = new Error('Duplicate slug');
          error.code = 'ER_DUP_ENTRY';
          throw error;
        }
        const category = categories.find((entry) => entry.id === categoryId);
        const city = startupCities.find((entry) => entry.id === startupCityId);
        const inserted = {
          id: Math.max(0, ...articles.map((article) => article.id)) + 1,
          title, slug, summary, content, cover_image_url: coverImageUrl, source_url: sourceUrl,
          category_id: categoryId, category_name: category.name, category_slug: category.slug,
          startup_city_id: startupCityId, startup_city_name: city?.name ?? null,
          startup_city_slug: city?.slug ?? null,
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
            if (name === 'startup_city_id') {
              const city = startupCities.find((entry) => entry.id === value);
              article.startup_city_name = city?.name ?? null;
              article.startup_city_slug = city?.slug ?? null;
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
  mediaAssets = [];
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

  it('requires an authenticated session and content-specific permissions for each new admin module', async () => {
    const paths = [
      '/api/admin/media',
      '/api/admin/web-stories',
      '/api/admin/hero-slides',
      '/api/admin/videos'
    ];
    for (const path of paths) {
      assert.equal((await request(app).get(path)).status, 401, `${path} must require authentication`);
    }

    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({
      username: admin.username,
      password: 'correct-test-password'
    });
    assert.equal(login.status, 200);
    for (const path of paths) {
      assert.equal((await agent.get(path)).status, 403, `${path} must enforce the effective module permission`);
    }
  });

  it('validates login fields and does not create a session on failure', async () => {
    const invalid = await request(app).post('/api/auth/login').send({ username: 'bad', password: '' });
    assert.equal(invalid.status, 400);

    const rejected = await request(app)
      .post('/api/auth/login')
      .send({ username: 'unknown-user', password: 'wrong-password' });
    assert.equal(rejected.status, 401);
    assert.equal(rejected.body.error.message, 'Invalid username or password.');
  });

  it('rejects cross-origin state-changing requests', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://untrusted.example')
      .send({ username: admin.username, password: 'correct-test-password' });
    assert.equal(response.status, 403);
  });

  it('keeps drafts private from both public news routes and public article lookup', async () => {
    const agent = request.agent(app);
    const login = await agent
      .post('/api/auth/login')
      .send({ username: admin.username, password: 'correct-test-password' });
    assert.equal(login.status, 200);
    assert.equal(login.body.data.admin.role, 'Admin');
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
    await agent.post('/api/auth/login').send({ username: admin.username, password: 'correct-test-password' });
    activityLogs.length = 0;

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
    const creationActivity = activityLogs.find((activity) => activity[4] === 'article.published');
    assert.ok(creationActivity);
    assert.equal(creationActivity[0], admin.id);
    assert.equal(creationActivity[3], admin.role);
    assert.equal(creationActivity[7], String(created.body.data.id));

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
      content: 'Updated article content',
      cover_image_url: 'https://res.cloudinary.com/startuptn/image/upload/startuptn-news/articles/updated.png'
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.data.status, 'draft');
    assert.equal(patched.body.data.published_at, null);
    assert.equal(
      patched.body.data.cover_image_url,
      'https://res.cloudinary.com/startuptn/image/upload/startuptn-news/articles/updated.png'
    );
    const editActivity = activityLogs.find((activity) => activity[4] === 'article.unpublished');
    assert.ok(editActivity);
    assert.match(editActivity[9], /"content"/);
    assert.doesNotMatch(editActivity[9], /Updated article content/);
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

  it('creates, filters, edits, and clears optional Startup city assignments', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: admin.username, password: 'correct-test-password' });

    const cities = await request(app).get('/api/startup-cities');
    assert.equal(cities.status, 200);
    assert.equal(cities.body.data.length, 10);

    const createStartup = (title, slug, startup_city_id = null) => agent.post('/api/admin/articles').send({
      title,
      slug,
      summary: `${title} summary`,
      content: `${title} body`,
      category_id: 1,
      startup_city_id,
      author_name: 'Reporter',
      status: 'published'
    });
    const unassigned = await createStartup('Unassigned startup story', 'unassigned-startup-story');
    const chennai = await createStartup('Chennai startup story', 'chennai-startup-story', 1);
    const coimbatore = await createStartup('Coimbatore startup story', 'coimbatore-startup-story', 2);
    assert.equal(unassigned.status, 201);
    assert.equal(unassigned.body.data.startup_city_id, null);
    assert.equal(chennai.status, 201);
    assert.equal(chennai.body.data.startup_city_name, 'Chennai');
    assert.equal(coimbatore.status, 201);
    assert.equal(coimbatore.body.data.startup_city_slug, 'coimbatore');

    const allStartupStories = await request(app).get('/api/news?category=startups&limit=50');
    const startupSlugs = allStartupStories.body.data.map((article) => article.slug);
    assert.ok(startupSlugs.includes('unassigned-startup-story'));
    assert.ok(startupSlugs.includes('chennai-startup-story'));
    assert.ok(startupSlugs.includes('coimbatore-startup-story'));

    const chennaiStories = await request(app).get('/api/news?city=chennai');
    assert.deepEqual(
      chennaiStories.body.data.map((article) => article.slug),
      ['chennai-startup-story'],
      JSON.stringify(chennaiStories.body)
    );
    const coimbatoreStories = await request(app).get('/api/news?category=startups&city=coimbatore');
    assert.deepEqual(coimbatoreStories.body.data.map((article) => article.slug), ['coimbatore-startup-story']);
    const articleDetail = await request(app).get('/api/news/chennai-startup-story');
    assert.equal(articleDetail.body.data.startup_city_name, 'Chennai');

    const assignedToExisting = await agent.patch('/api/admin/articles/').send({
      id: unassigned.body.data.id,
      startup_city_id: 3
    });
    assert.equal(assignedToExisting.status, 200);
    assert.equal(assignedToExisting.body.data.startup_city_name, 'Madurai');

    const invalidCity = await createStartup('Invalid city story', 'invalid-city-story', 999);
    assert.equal(invalidCity.status, 400);
    const cityOnOtherCategory = await agent.post('/api/admin/articles').send({
      title: 'Funding city story',
      slug: 'funding-city-story',
      summary: 'Funding summary',
      content: 'Funding body',
      category_id: 2,
      startup_city_id: 1,
      author_name: 'Reporter'
    });
    assert.equal(cityOnOtherCategory.status, 400);

    const changedCategory = await agent.patch('/api/admin/articles/').send({
      id: chennai.body.data.id,
      category_id: 2
    });
    assert.equal(changedCategory.status, 200);
    assert.equal(changedCategory.body.data.category_slug, 'funding');
    assert.equal(changedCategory.body.data.startup_city_id, null);
  });

  it('returns categories and clears the authenticated session on logout', async () => {
    const categoryResponse = await request(app).get('/api/categories');
    assert.equal(categoryResponse.status, 200);
    assert.equal(categoryResponse.body.data.length, 2);
    const cityResponse = await request(app).get('/api/startup-cities');
    assert.equal(cityResponse.status, 200);
    assert.equal(cityResponse.body.data.length, 10);

    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: admin.username, password: 'correct-test-password' });
    assert.equal((await agent.get('/api/auth/me')).body.data.authenticated, true);
    assert.equal((await agent.get('/api/auth/me')).body.data.admin.role, 'Admin');
    assert.equal((await agent.post('/api/auth/logout')).status, 200);
    assert.equal((await agent.get('/api/auth/me')).body.data.authenticated, false);
  });

  it('rejects stale-role sessions and permits the current Super Admin session to manage articles', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: admin.username, password: 'correct-test-password' });

    admin.role = 'Super Admin';
    admin.auth_version += 1;
    const staleRequest = await agent.get('/api/admin/articles');
    assert.equal(staleRequest.status, 401);
    assert.equal((await agent.post('/api/auth/logout')).status, 200);

    const login = await agent.post('/api/auth/login').send({
      username: admin.username,
      password: 'correct-test-password'
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.data.admin.role, 'Super Admin');
    const me = await agent.get('/api/auth/me');
    assert.equal(me.body.data.authenticated, true);
    assert.equal(me.body.data.admin.role, 'Super Admin');

    const editorialAccess = await agent.get('/api/admin/articles');
    assert.equal(editorialAccess.status, 200);
    const created = await agent.post('/api/admin/articles').send({
      title: 'Super Admin story',
      slug: 'super-admin-story',
      summary: 'Created by the Super Admin',
      content: 'Editorial access remains available.',
      category_id: 1,
      author_name: 'StartupTN',
      status: 'draft'
    });
    assert.equal(created.status, 201);
    const published = await agent.patch('/api/admin/articles').send({
      id: created.body.data.id,
      status: 'published'
    });
    assert.equal(published.status, 200);
    assert.equal(published.body.data.status, 'published');
    assert.equal((await agent.delete('/api/admin/articles').send({ id: created.body.data.id })).status, 200);

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/r8cAAAAASUVORK5CYII=',
      'base64'
    );
    const upload = await agent
      .post('/api/admin/uploads')
      .attach('image', png, { filename: 'super-admin.png', contentType: 'image/png' });
    assert.equal(upload.status, 201);
    admin.role = 'Admin';
    admin.auth_version += 1;
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
    await agent.post('/api/auth/login').send({ username: admin.username, password: 'correct-test-password' });

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
