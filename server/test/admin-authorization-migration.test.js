import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runAdminAuthorizationMigration } from '../scripts/migrate-admin-authorization.js';

const migrationId = '001_admin_authorization';
const columnDefinitions = {
  role: { column_type: "enum('Admin','Super Admin')", is_nullable: 'NO', column_default: 'Admin' },
  is_active: { column_type: 'tinyint(1)', is_nullable: 'NO', column_default: '1' },
  auth_version: { column_type: 'int unsigned', is_nullable: 'NO', column_default: '0' }
};

function createMigrationDatabase({ columns = {}, admins = [], applied = false } = {}) {
  const state = {
    columns: new Map(Object.entries(columns)),
    admins: structuredClone(admins),
    applied: new Set(applied ? [migrationId] : []),
    alters: 0,
    releases: 0
  };
  const connection = {
    async execute(sql, values = []) {
      if (sql.startsWith('CREATE TABLE IF NOT EXISTS schema_migrations')) return [{ affectedRows: 0 }];
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('RELEASE_LOCK')) {
        state.releases += 1;
        return [[{ released: 1 }]];
      }
      if (sql.startsWith('SELECT migration_id FROM schema_migrations')) {
        return [[state.applied.has(values[0]) ? { migration_id: values[0] } : undefined].filter(Boolean)];
      }
      if (sql.includes('FROM information_schema.COLUMNS')) {
        return [[...state.columns].map(([column_name, definition]) => ({ column_name, ...definition }))];
      }
      if (sql.startsWith('ALTER TABLE admins')) {
        state.alters += 1;
        for (const [name, definition] of Object.entries(columnDefinitions)) {
          state.columns.set(name, { ...definition });
        }
        state.admins.forEach((admin) => Object.assign(admin, {
          role: 'Admin',
          is_active: 1,
          auth_version: 0
        }));
        return [{ affectedRows: 0 }];
      }
      if (sql.startsWith('UPDATE admins')) {
        state.admins.forEach((admin) => {
          if (admin.role == null) admin.role = 'Admin';
        });
        return [{ affectedRows: 0 }];
      }
      if (sql.startsWith('INSERT INTO schema_migrations')) {
        state.applied.add(values[0]);
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected migration SQL in test double: ${sql}`);
    }
  };
  return { connection, state };
}

describe('admin authorization database migration', () => {
  it('backfills existing accounts as Admin and is safe to rerun without changing editorial or session data', async () => {
    const records = [
      { id: 8, name: 'Existing', email: 'existing@example.com', password_hash: 'unchanged-hash' },
      { id: 23, name: 'Another', email: 'another@example.com', password_hash: 'another-hash' }
    ];
    const { connection, state } = createMigrationDatabase({
      admins: records,
      applied: false
    });
    const articles = [{ id: 41, admin_id: 8, title: 'Existing article' }];
    const sessions = [{ session_id: 'session-record', session_data: '{"adminId":8}' }];

    const first = await runAdminAuthorizationMigration(connection);
    const second = await runAdminAuthorizationMigration(connection);

    assert.deepEqual(first, { applied: true, migrationId });
    assert.deepEqual(second, { applied: false, migrationId });
    assert.equal(state.alters, 1);
    assert.equal(state.releases, 2);
    assert.deepEqual(state.admins.map(({ id, role, is_active, auth_version }) => ({
      id, role, is_active, auth_version
    })), [
      { id: 8, role: 'Admin', is_active: 1, auth_version: 0 },
      { id: 23, role: 'Admin', is_active: 1, auth_version: 0 }
    ]);
    assert.deepEqual(state.admins.map(({ password_hash }) => password_hash), ['unchanged-hash', 'another-hash']);
    assert.deepEqual(articles, [{ id: 41, admin_id: 8, title: 'Existing article' }]);
    assert.deepEqual(sessions, [{ session_id: 'session-record', session_data: '{"adminId":8}' }]);
  });

  it('fails closed on a partial unrecorded schema and releases the migration lock', async () => {
    const { connection, state } = createMigrationDatabase({
      columns: { role: columnDefinitions.role }
    });

    await assert.rejects(runAdminAuthorizationMigration(connection), /partial admins authorization schema/);
    assert.equal(state.alters, 0);
    assert.equal(state.releases, 1);
    assert.equal(state.applied.size, 0);
  });

  it('refuses to accept an already-recorded migration if its schema no longer matches', async () => {
    const { connection, state } = createMigrationDatabase({
      columns: { ...columnDefinitions, auth_version: { ...columnDefinitions.auth_version, column_default: '4' } },
      applied: true
    });

    await assert.rejects(runAdminAuthorizationMigration(connection), /admins\.auth_version column does not match/);
    assert.equal(state.alters, 0);
    assert.equal(state.releases, 1);
  });
});
