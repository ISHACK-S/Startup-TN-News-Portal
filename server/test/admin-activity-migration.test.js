import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runAdminActivityReportsMigration } from '../scripts/migrate-admin-authorization.js';

const expectedColumns = [
  'activity_id', 'actor_admin_id', 'actor_name', 'actor_email', 'actor_role',
  'action_type', 'module_id', 'description', 'record_id', 'occurred_at',
  'status', 'changes', 'correlation_id'
];
const expectedIndexes = [
  'PRIMARY', 'idx_admin_activity_correlation', 'idx_admin_activity_actor_time',
  'idx_admin_activity_role_time', 'idx_admin_activity_module_time',
  'idx_admin_activity_action_time', 'idx_admin_activity_time'
];

function migrationConnection({ table = false, applied = false, partial = false } = {}) {
  const state = {
    table,
    applied,
    columns: new Set(partial ? ['activity_id', 'actor_admin_id'] : expectedColumns),
    indexes: new Set(partial ? ['PRIMARY'] : expectedIndexes),
    migrationInserts: 0,
    releases: 0,
    createStatements: 0
  };
  const connection = {
    async execute(sql, values = []) {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('RELEASE_LOCK')) {
        state.releases += 1;
        return [[{ released: 1 }]];
      }
      if (sql.startsWith('SELECT migration_id FROM schema_migrations')) {
        return [[...(state.applied ? [{ migration_id: values[0] }] : [])]];
      }
      if (sql.includes('information_schema.TABLES')) {
        return [[...(state.table ? [{ table_name: 'admin_activity_logs' }] : [])]];
      }
      if (sql.includes('information_schema.COLUMNS')) {
        return [[...state.columns].map((column_name) => ({ column_name }))];
      }
      if (sql.includes('information_schema.STATISTICS')) {
        return [[...state.indexes].map((index_name) => ({ index_name }))];
      }
      if (sql.startsWith('CREATE TABLE admin_activity_logs')) {
        state.createStatements += 1;
        state.table = true;
        state.columns = new Set(expectedColumns);
        state.indexes = new Set(expectedIndexes);
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

describe('administrative activity migration', () => {
  it('creates the indexed activity table and records the migration idempotently', async () => {
    const { connection, state } = migrationConnection();
    assert.deepEqual(await runAdminActivityReportsMigration(connection), {
      applied: true,
      migrationId: '010_admin_activity_reports'
    });
    assert.equal(state.createStatements, 1);
    assert.equal(state.migrationInserts, 1);
    assert.deepEqual(await runAdminActivityReportsMigration(connection), {
      applied: false,
      migrationId: '010_admin_activity_reports'
    });
    assert.equal(state.createStatements, 1);
    assert.equal(state.releases, 2);
  });

  it('refuses to record a partial pre-existing table as a successful migration', async () => {
    const { connection, state } = migrationConnection({ table: true, partial: true });
    await assert.rejects(runAdminActivityReportsMigration(connection), /does not match/);
    assert.equal(state.migrationInserts, 0);
    assert.equal(state.releases, 1);
  });

  it('keeps historical snapshots without destructive statements or cascading account deletion', async () => {
    const migration = await readFile(
      new URL('../../database/migrations/010_admin_activity_reports.sql', import.meta.url),
      'utf8'
    );
    assert.match(migration, /actor_admin_id BIGINT UNSIGNED NULL/);
    assert.match(migration, /actor_name VARCHAR/);
    assert.match(migration, /actor_email VARCHAR/);
    assert.match(migration, /actor_role VARCHAR/);
    assert.match(migration, /idx_admin_activity_actor_time/);
    assert.match(migration, /idx_admin_activity_module_time/);
    assert.match(migration, /idx_admin_activity_action_time/);
    assert.match(migration, /idx_admin_activity_time/);
    assert.doesNotMatch(migration, /\b(DROP|DELETE|TRUNCATE|UPDATE)\b/i);
    assert.match(migration, /idx_admin_activity_correlation/);
    assert.doesNotMatch(migration, /FOREIGN KEY/i);
  });
});
