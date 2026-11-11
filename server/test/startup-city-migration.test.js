import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../../database/migrations/013_startup_city_subcategories.sql', import.meta.url);
const schemaUrl = new URL('../../database/schema.sql', import.meta.url);
const citySlugs = [
  'chennai', 'coimbatore', 'madurai', 'trichy', 'salem',
  'erode', 'tirunelveli', 'cuddalore', 'tanjore', 'hosur'
];

describe('Startup city subcategory migration', () => {
  it('preserves existing articles and constrains city assignments to the Startup category', async () => {
    const migration = await readFile(migrationUrl, 'utf8');
    assert.match(migration, /CREATE TABLE startup_city_subcategories/i);
    assert.match(migration, /WHERE categories\.slug = 'startups'/i);
    assert.match(migration, /ADD COLUMN startup_city_id BIGINT UNSIGNED NULL/i);
    assert.match(migration, /FOREIGN KEY \(startup_city_id, category_id\)/i);
    assert.match(migration, /REFERENCES startup_city_subcategories \(id, category_id\)/i);
    assert.doesNotMatch(migration, /\bDELETE\s+FROM\s+articles\b/i);
    for (const slug of citySlugs) assert.match(migration, new RegExp(`'${slug}'`, 'i'));
  });

  it('includes the nullable relationship and city seed data in the fresh-install schema', async () => {
    const schema = await readFile(schemaUrl, 'utf8');
    assert.match(schema, /startup_city_id BIGINT UNSIGNED NULL/i);
    assert.match(schema, /FOREIGN KEY \(startup_city_id, category_id\)/i);
    assert.match(schema, /WHERE categories\.slug = 'startups'/i);
    for (const slug of citySlugs) assert.match(schema, new RegExp(`'${slug}'`, 'i'));
  });
});
