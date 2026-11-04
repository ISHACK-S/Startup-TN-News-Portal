import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  runContentManagementMigration
} from '../scripts/migrate-admin-authorization.js';

const expectedTables = {
  media_assets: ['cloudinary_public_id', 'secure_url', 'resource_type', 'format', 'width', 'height', 'bytes', 'original_filename', 'uploaded_by', 'created_at'],
  web_stories: ['title', 'slug', 'description', 'status', 'created_by', 'published_at', 'created_at', 'updated_at'],
  web_story_slides: ['story_id', 'position', 'image_url', 'alt_text', 'caption', 'link_url'],
  hero_slides: ['title', 'description', 'image_url', 'alt_text', 'destination_url', 'article_id', 'display_order', 'status', 'created_by', 'published_at'],
  media_videos: ['title', 'description', 'source_url', 'provider', 'embed_id', 'thumbnail_url', 'thumbnail_alt', 'category', 'display_order', 'status', 'created_by', 'published_at']
};
const moduleIds = ['media-library', 'web-stories', 'hero-slider', 'video-media'];

function migrationConnection({ partial = false, applied = false, legacyCheck = false } = {}) {
  const state = {
    tables: new Set(partial ? ['media_assets', 'web_stories', 'web_story_slides'] : []),
    columns: new Map(partial ? [
      ['media_assets', new Set(expectedTables.media_assets)],
      ['web_stories', new Set(expectedTables.web_stories)],
      ['web_story_slides', new Set(expectedTables.web_story_slides)]
    ] : []),
    applied,
    legacyCheck,
    modules: new Map(moduleIds.map((id) => [id, { module_id: id, is_available: 0, is_active: 0 }])),
    releases: 0,
    createdTables: [],
    migrationInserts: 0
  };
  const connection = {
    async execute(sql, values = []) {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('RELEASE_LOCK')) {
        state.releases += 1;
        return [[{ released: 1 }]];
      }
      if (sql.startsWith('SELECT migration_id FROM schema_migrations')) {
        return [[state.applied ? { migration_id: values[0] } : undefined].filter(Boolean)];
      }
      if (sql.includes('information_schema.TABLE_CONSTRAINTS')) {
        return [[state.legacyCheck ? { constraint_name: 'chk_hero_slide_destination' } : undefined].filter(Boolean)];
      }
      if (sql.startsWith('ALTER TABLE hero_slides DROP CHECK')) {
        state.legacyCheck = false;
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('information_schema.TABLES')) {
        return [[...state.tables].map((table_name) => ({ table_name }))];
      }
      if (sql.includes('information_schema.COLUMNS')) {
        return [[...state.columns].flatMap(([table_name, columns]) =>
          [...columns].map((column_name) => ({ table_name, column_name }))
        )];
      }
      if (sql.includes('SELECT module_id, is_available, is_active FROM permission_modules')) {
        return [[...state.modules.values()]];
      }
      if (sql.startsWith('CREATE TABLE IF NOT EXISTS ')) {
        const table = sql.match(/^CREATE TABLE IF NOT EXISTS ([a-z_]+)/)[1];
        if (!state.tables.has(table)) {
          state.tables.add(table);
          state.columns.set(table, new Set(expectedTables[table]));
          state.createdTables.push(table);
        }
        return [{ affectedRows: 0 }];
      }
      if (sql.startsWith('UPDATE permission_modules')) {
        for (const module of state.modules.values()) {
          module.is_available = 1;
          module.is_active = 1;
        }
        return [{ affectedRows: 4 }];
      }
      if (sql.startsWith('INSERT INTO schema_migrations')) {
        state.applied = true;
        state.migrationInserts += 1;
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected migration SQL: ${sql}`);
    }
  };
  return { connection, state };
}

describe('content-management migration', () => {
  it('creates and verifies the registry tables and module availability, and safely reruns', async () => {
    const { connection, state } = migrationConnection();
    assert.deepEqual(await runContentManagementMigration(connection), {
      applied: true,
      migrationId: '004_content_management'
    });
    assert.equal(state.tables.size, 5);
    assert.equal(state.migrationInserts, 1);
    assert.ok([...state.modules.values()].every((module) => module.is_available === 1 && module.is_active === 1));
    assert.deepEqual(await runContentManagementMigration(connection), {
      applied: false,
      migrationId: '004_content_management'
    });
    assert.equal(state.releases, 2);
  });

  it('resumes partial DDL without recreating existing tables and removes only the legacy check', async () => {
    const { connection, state } = migrationConnection({ partial: true, legacyCheck: true });
    assert.deepEqual(await runContentManagementMigration(connection), {
      applied: true,
      migrationId: '004_content_management'
    });
    assert.deepEqual(state.createdTables.sort(), ['hero_slides', 'media_videos']);
    assert.equal(state.tables.size, 5);
    assert.equal(state.legacyCheck, false);
    assert.equal(state.migrationInserts, 1);
  });

  it('does not record the migration until all schema and module checks pass', async () => {
    const { connection, state } = migrationConnection();
    state.modules.delete('hero-slider');
    await assert.rejects(runContentManagementMigration(connection), /permissions do not match/);
    assert.equal(state.migrationInserts, 0);
    assert.equal(state.applied, false);
  });

  it('preserves the article foreign key and publication index without the incompatible check', async () => {
    const migration = await readFile(
      new URL('../../database/migrations/004_content_management.sql', import.meta.url),
      'utf8'
    );
    assert.match(migration, /FOREIGN KEY \(article_id\) REFERENCES articles \(id\)\s+ON UPDATE CASCADE ON DELETE SET NULL/);
    assert.doesNotMatch(migration, /chk_hero_slide_destination|CHECK\s*\(\s*article_id/i);
    assert.match(migration, /KEY idx_hero_slides_publication_order/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS hero_slides/);
  });

  it('fails closed on conflicting schemas without adding a migration record', async () => {
    const partial = migrationConnection({ partial: true });
    partial.state.columns.get('web_stories').delete('slug');
    await assert.rejects(runContentManagementMigration(partial.connection), /web_stories table does not match/);

    const conflicting = migrationConnection({ applied: true });
    conflicting.state.tables = new Set(Object.keys(expectedTables));
    conflicting.state.columns = new Map(Object.entries(expectedTables).map(([name, columns]) => [name, new Set(columns)]));
    conflicting.state.columns.get('media_videos').delete('embed_id');
    await assert.rejects(runContentManagementMigration(conflicting.connection), /media_videos table does not match/);
    assert.equal(partial.state.releases, 1);
    assert.equal(conflicting.state.releases, 1);
    assert.equal(partial.state.migrationInserts, 0);
  });
});
