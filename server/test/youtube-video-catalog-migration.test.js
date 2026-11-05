import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runYouTubeVideoCatalogMigration } from '../scripts/migrate-admin-authorization.js';

function migrationConnection({ applied = false, duplicate = false, partial = false } = {}) {
  const state = {
    applied,
    duplicate,
    columns: new Set(partial ? ['title', 'category'] : ['title', 'category', 'is_featured']),
    indexes: new Set(partial ? ['PRIMARY'] : [
      'PRIMARY',
      'uq_media_videos_provider_embed',
      'idx_media_videos_category_status_published'
    ]),
    alters: [],
    migrationInserts: 0,
    releases: 0
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
      if (sql.includes('information_schema.TABLES')) return [[{ table_name: 'media_videos' }]];
      if (sql.includes('information_schema.COLUMNS')) {
        return [[...state.columns].map((column_name) => ({ column_name }))];
      }
      if (sql.includes('information_schema.STATISTICS')) {
        return [[...state.indexes].map((index_name) => ({ index_name }))];
      }
      if (sql.includes('GROUP BY provider, embed_id')) {
        return [[state.duplicate ? { provider: 'youtube', embed_id: 'abcdefghijk' } : undefined].filter(Boolean)];
      }
      if (sql.startsWith('ALTER TABLE media_videos ADD COLUMN')) {
        state.alters.push(sql);
        state.columns.add('is_featured');
        return [{ affectedRows: 0 }];
      }
      if (sql.startsWith('ALTER TABLE media_videos ADD UNIQUE KEY')) {
        state.alters.push(sql);
        state.indexes.add('uq_media_videos_provider_embed');
        return [{ affectedRows: 0 }];
      }
      if (sql.startsWith('ALTER TABLE media_videos ADD KEY')) {
        state.alters.push(sql);
        state.indexes.add('idx_media_videos_category_status_published');
        return [{ affectedRows: 0 }];
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

describe('YouTube video catalog migration', () => {
  it('adds featured metadata and indexes, records the migration, and safely reruns', async () => {
    const { connection, state } = migrationConnection({ partial: true });
    assert.deepEqual(await runYouTubeVideoCatalogMigration(connection), {
      applied: true,
      migrationId: '009_youtube_video_catalog'
    });
    assert.equal(state.alters.length, 3);
    assert.equal(state.migrationInserts, 1);
    assert.deepEqual(await runYouTubeVideoCatalogMigration(connection), {
      applied: false,
      migrationId: '009_youtube_video_catalog'
    });
    assert.equal(state.releases, 2);
  });

  it('detects existing duplicate video IDs before changing schema', async () => {
    const { connection, state } = migrationConnection({ duplicate: true, partial: true });
    await assert.rejects(runYouTubeVideoCatalogMigration(connection), /Duplicate video provider\/IDs/);
    assert.equal(state.alters.length, 0);
    assert.equal(state.migrationInserts, 0);
    assert.equal(state.releases, 1);
  });

  it('defines an additive migration without dropping or rewriting existing video data', async () => {
    const migration = await readFile(
      new URL('../../database/migrations/009_youtube_video_catalog.sql', import.meta.url),
      'utf8'
    );
    assert.match(migration, /ADD COLUMN is_featured TINYINT\(1\) NOT NULL DEFAULT 0/);
    assert.match(migration, /ADD UNIQUE KEY uq_media_videos_provider_embed \(provider, embed_id\)/);
    assert.doesNotMatch(migration, /\b(DROP|DELETE|TRUNCATE|UPDATE)\b/i);
  });
});
