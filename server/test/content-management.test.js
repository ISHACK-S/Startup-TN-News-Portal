import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  heroCreateSchema,
  heroPatchSchema,
  videoCreateSchema,
  webStoryCreateSchema
} from '../src/validation/content-management.schemas.js';
import {
  createHeroSlide,
  createVideo,
  createWebStory,
  getFeaturedVideo,
  getPublicVideo,
  listVideos,
  parseYouTubeVideo,
  registerMediaAsset,
  updateHeroSlide,
  updateVideo,
  updateWebStory
} from '../src/services/content-management.service.js';

describe('content management validation', () => {
  it('accepts a fully-described story and rejects unknown fields', () => {
    const story = {
      title: 'Tamil Nadu founders',
      slug: 'tamil-nadu-founders',
      status: 'draft',
      slides: [{
        image_url: 'https://res.cloudinary.com/startuptn/image/upload/one.webp',
        alt_text: 'Founders speaking at a forum'
      }]
    };
    assert.equal(webStoryCreateSchema.safeParse(story).success, true);
    assert.equal(webStoryCreateSchema.safeParse({ ...story, admin_id: 1 }).success, false);
  });

  it('accepts only HTTPS YouTube and Vimeo URLs and known fields', () => {
    const base = {
      title: 'Founder interview',
      source_url: 'https://youtu.be/abcdefghijk',
      category: 'Interviews',
      display_order: 0,
      status: 'draft'
    };
    assert.equal(videoCreateSchema.safeParse(base).success, true);
    assert.equal(videoCreateSchema.safeParse({ ...base, source_url: 'https://example.com/embed/unsafe' }).success, false);
    assert.equal(videoCreateSchema.safeParse({ ...base, source_url: 'http://youtu.be/abcdefghijk' }).success, false);
    assert.equal(videoCreateSchema.safeParse({ ...base, source_url: 'https://vimeo.com/1234567' }).success, false);
    assert.equal(videoCreateSchema.safeParse({ ...base, category: 'Public Services' }).success, false);
    assert.equal(videoCreateSchema.safeParse({ ...base, iframe: '<iframe>' }).success, false);
    for (const source_url of [
      'https://www.youtube.com/watch?v=abcdefghijk',
      'https://www.youtube.com/shorts/abcdefghijk',
      'https://www.youtube.com/embed/abcdefghijk',
      'https://youtu.be/abcdefghijk'
    ]) assert.equal(videoCreateSchema.safeParse({ ...base, source_url }).success, true);
  });

  it('accepts supported YouTube URL forms and rejects lookalike domains', () => {
    for (const sourceUrl of [
      'https://youtu.be/abcdefghijk',
      'https://youtube.com/watch?v=abcdefghijk',
      'https://www.youtube.com/shorts/abcdefghijk',
      'https://m.youtube.com/embed/abcdefghijk'
    ]) {
      assert.equal(parseYouTubeVideo(sourceUrl).embed_url, 'https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0');
    }
    for (const sourceUrl of [
      'https://youtube.com.evil.example/watch?v=abcdefghijk',
      'https://www.youtube.com.evil.example/embed/abcdefghijk',
      'https://user@youtube.com/watch?v=abcdefghijk',
      'https://youtube.com:444/watch?v=abcdefghijk',
      'https://vimeo.com/1234567'
    ]) assert.throws(() => parseYouTubeVideo(sourceUrl), /YouTube/);
  });

  it('rejects hero creation and patch values that specify two destinations', () => {
    const create = {
      title: 'Featured story',
      image_url: 'https://res.cloudinary.com/startuptn/image/upload/hero.webp',
      alt_text: 'Featured story',
      destination_url: 'https://example.com/story',
      article_id: 7,
      display_order: 0
    };
    assert.equal(heroCreateSchema.safeParse(create).success, false);
    assert.equal(heroPatchSchema.safeParse({
      destination_url: 'https://example.com/story',
      article_id: 7
    }).success, false);
  });

  it('accepts either hero destination on its own', () => {
    const base = {
      title: 'Featured story',
      image_url: 'https://res.cloudinary.com/startuptn/image/upload/hero.webp',
      alt_text: 'Featured story',
      display_order: 0
    };
    assert.equal(heroCreateSchema.safeParse({
      ...base,
      destination_url: 'https://example.com/story'
    }).success, true);
    assert.equal(heroCreateSchema.safeParse({ ...base, article_id: 7 }).success, true);
  });
});

describe('hero slide persistence validation', () => {
  it('rejects conflicting destinations before issuing create or update SQL', async () => {
    const statements = [];
    const database = {
      async execute(sql) {
        statements.push(sql);
        if (sql.startsWith('SELECT h.id')) {
          return [[{
            id: 1,
            article_id: 7,
            destination_url: null,
            status: 'draft'
          }]];
        }
        throw new Error(`Unexpected SQL in Hero Slider test: ${sql}`);
      }
    };
    const conflicting = {
      title: 'Featured story',
      image_url: 'https://res.cloudinary.com/startuptn/image/upload/hero.webp',
      alt_text: 'Featured story',
      destination_url: 'https://example.com/story',
      article_id: 7,
      display_order: 0,
      status: 'draft'
    };

    await assert.rejects(createHeroSlide(conflicting, 3, database), /Choose either a published article/);
    await assert.rejects(
      updateHeroSlide(1, { destination_url: 'https://example.com/story' }, database),
      /Choose either a published article/
    );
    assert.equal(statements.length, 1);
  });
});

describe('web story persistence', () => {
  function fakeDatabase() {
    const state = { story: null, slides: [], begins: 0, commits: 0, rollbacks: 0 };
    return {
      state,
      async beginTransaction() { state.begins += 1; },
      async commit() { state.commits += 1; },
      async rollback() { state.rollbacks += 1; },
      async execute(sql, values = []) {
        if (sql.startsWith('INSERT INTO web_stories')) {
          state.story = {
            id: 1, title: values[0], slug: values[1], description: values[2],
            status: values[3], published_at: values[5], created_at: new Date(), updated_at: new Date()
          };
          return [{ insertId: 1 }];
        }
        if (sql.startsWith('SELECT id, title, slug, description, status')) {
          const matches = state.story && (sql.includes('WHERE id = ?')
            ? state.story.id === Number(values[0])
            : state.story.slug === values[0]) ? [{ ...state.story }] : [];
          return [matches];
        }
        if (sql.startsWith('SELECT id, position, image_url, alt_text')) {
          return [state.slides.map((slide) => ({ ...slide })).sort((a, b) => a.position - b.position)];
        }
        if (sql.startsWith('SELECT id FROM web_story_slides')) {
          return [state.slides.map(({ id }) => ({ id }))];
        }
        if (sql.startsWith('DELETE FROM web_story_slides')) {
          state.slides = [];
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('INSERT INTO web_story_slides')) {
          state.slides.push({
            id: state.slides.length + 1, story_id: values[0], position: values[1],
            image_url: values[2], alt_text: values[3], caption: values[4], link_url: values[5]
          });
          return [{ insertId: state.slides.length }];
        }
        if (sql.startsWith('SELECT id, status FROM web_stories')) {
          return [state.story?.id === Number(values[0]) ? [{ id: 1, status: state.story.status }] : []];
        }
        if (sql.startsWith('UPDATE web_stories SET')) {
          const assignment = sql.match(/^UPDATE web_stories SET (.+) WHERE id = \?$/)[1];
          const fields = assignment.split(', ').filter((field) => field.endsWith(' = ?'))
            .map((field) => field.split(' = ')[0]);
          fields.forEach((field, index) => { state.story[field] = values[index]; });
          return [{ affectedRows: 1 }];
        }
        throw new Error(`Unexpected SQL in content-management test: ${sql}`);
      }
    };
  }

  it('persists and reorders slides transactionally', async () => {
    const database = fakeDatabase();
    const first = {
      image_url: 'https://res.cloudinary.com/startuptn/image/upload/one.webp',
      alt_text: 'First panel'
    };
    const second = {
      image_url: 'https://res.cloudinary.com/startuptn/image/upload/two.webp',
      alt_text: 'Second panel'
    };
    const created = await createWebStory({
      title: 'Founders', slug: 'founders', status: 'draft', slides: [first, second]
    }, 3, database);
    assert.deepEqual(created.slides.map(({ position }) => position), [0, 1]);

    const updated = await updateWebStory(1, { slides: [second, first] }, database);
    assert.deepEqual(updated.slides.map(({ alt_text }) => alt_text), ['Second panel', 'First panel']);
    assert.equal(database.state.begins, 2);
    assert.equal(database.state.commits, 2);
    assert.equal(database.state.rollbacks, 0);
  });

  it('refuses to publish a story without slides', async () => {
    const database = fakeDatabase();
    await assert.rejects(createWebStory({
      title: 'Empty story', slug: 'empty-story', status: 'published', slides: []
    }, 1, database), /at least one slide/);
    assert.equal(database.state.begins, 0);
  });
});

describe('media registry and video persistence', () => {
  it('registers Cloudinary assets idempotently and retains safe metadata', async () => {
    const records = new Map();
    const database = {
      async execute(sql, values = []) {
        if (sql.startsWith('INSERT INTO media_assets')) {
          if (!records.has(values[0])) {
            records.set(values[0], {
              id: records.size + 1,
              cloudinary_public_id: values[0],
              secure_url: values[1],
              resource_type: values[2],
              format: values[3],
              width: values[4],
              height: values[5],
              bytes: values[6],
              original_filename: values[7],
              created_at: new Date()
            });
          }
          return [{ affectedRows: 1 }];
        }
        if (sql.includes('FROM media_assets WHERE cloudinary_public_id = ?')) {
          return [[records.get(values[0])].filter(Boolean)];
        }
        throw new Error(`Unexpected media query: ${sql}`);
      }
    };
    const upload = {
      provider_id: 'startuptn-news/articles/portrait',
      url: 'https://res.cloudinary.com/startuptn/image/upload/portrait.webp',
      resource_type: 'image', format: 'webp', width: 900, height: 1400, bytes: 78342
    };
    const first = await registerMediaAsset(upload, 'portrait.webp', 7, database);
    const second = await registerMediaAsset(upload, 'portrait.webp', 7, database);
    assert.equal(first.id, second.id);
    assert.equal(records.size, 1);
    assert.equal(first.height, 1400);
    assert.equal(first.original_filename, 'portrait.webp');
  });

  it('stores allowlisted provider identifiers and emits canonical safe embed URLs', async () => {
    const state = { video: null };
    const database = {
      async execute(sql, values = []) {
        if (sql.startsWith('SELECT id FROM media_videos WHERE provider')) return [[]];
        if (sql.startsWith('INSERT INTO media_videos')) {
          state.video = {
            id: 5, title: values[0], description: values[1], source_url: values[2],
            provider: values[3], embed_id: values[4], thumbnail_url: values[5],
            thumbnail_alt: values[6], category: values[7], is_featured: values[8],
            display_order: values[9], status: values[10], published_at: values[12],
            created_at: new Date(), updated_at: new Date()
          };
          return [{ insertId: state.video.id }];
        }
        if (sql.startsWith('SELECT id, title, description, source_url, provider, embed_id')) {
          return [[state.video?.id === Number(values[0]) ? { ...state.video } : undefined].filter(Boolean)];
        }
        if (sql.startsWith('UPDATE media_videos SET')) {
          const assignments = sql.match(/^UPDATE media_videos SET (.+) WHERE id = \?$/)[1].split(', ');
          let index = 0;
          for (const assignment of assignments) {
            if (assignment.endsWith(' = ?')) state.video[assignment.split(' = ')[0]] = values[index++];
          }
          return [{ affectedRows: 1 }];
        }
        throw new Error(`Unexpected video query: ${sql}`);
      }
    };
    const created = await createVideo({
      title: 'Founder conversation',
      source_url: 'https://www.youtube.com/watch?v=abcdefghijk',
      category: 'Interviews',
      is_featured: true,
      display_order: 0,
      status: 'draft'
    }, 3, database);
    assert.equal(created.provider, 'youtube');
    assert.equal(created.embed_url, 'https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0');
    assert.equal(created.thumbnail_url, 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');
    assert.equal(created.is_featured, true);

    const updated = await updateVideo(5, { source_url: 'https://www.youtube.com/shorts/zyxwvutsrq1' }, database);
    assert.equal(updated.provider, 'youtube');
    assert.equal(updated.embed_url, 'https://www.youtube-nocookie.com/embed/zyxwvutsrq1?rel=0');
  });

  it('returns only published YouTube videos from public queries and resolves a featured published record', async () => {
    const statements = [];
    const video = {
      id: 8,
      title: 'Founder story',
      source_url: 'https://youtu.be/abcdefghijk',
      provider: 'youtube',
      embed_id: 'abcdefghijk',
      status: 'published',
      is_featured: 1,
      published_at: new Date(),
      thumbnail_url: null
    };
    const database = {
      async execute(sql) {
        statements.push(sql);
        if (sql.startsWith('SELECT COUNT(*) AS total FROM media_videos')) return [[{ total: 1 }]];
        if (sql.includes('ORDER BY published_at DESC')) return [[video]];
        if (sql.startsWith('SELECT id, title, description, source_url')) return [[video]];
        throw new Error(`Unexpected public video query: ${sql}`);
      }
    };
    const result = await listVideos({ page: 1, limit: 3 }, database, { publicOnly: true });
    assert.equal(result.data.length, 1);
    assert.match(statements[0], /provider = 'youtube'/);
    assert.match(statements[0], /status = 'published'/);
    assert.equal(statements.some((sql) => sql.includes('SUM(status')), false);
    assert.equal((await getPublicVideo(8, database)).id, 8);
    assert.equal((await getFeaturedVideo(database)).id, 8);
    assert.match(statements.at(-1), /is_featured = 1 AND status = 'published'/);
  });
});
