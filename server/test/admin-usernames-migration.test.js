import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const migrationUrl = new URL('../../database/migrations/012_admin_usernames.sql', import.meta.url);
const schemaUrl = new URL('../../database/schema.sql', import.meta.url);

describe('admin username migration', () => {
  it('adds a nullable, uniquely indexed username without changing existing account data', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    assert.match(migration, /ADD COLUMN username VARCHAR\(64\) NULL/);
    assert.match(migration, /ADD UNIQUE KEY uq_admins_username \(username\)/);
    assert.doesNotMatch(migration, /UPDATE admins|DELETE FROM admins|password_hash\s*=/i);
  });

  it('includes the same username column and uniqueness constraint for new databases', async () => {
    const schema = await readFile(schemaUrl, 'utf8');

    assert.match(schema, /username VARCHAR\(64\) NULL/);
    assert.match(schema, /UNIQUE KEY uq_admins_username \(username\)/);
  });
});
