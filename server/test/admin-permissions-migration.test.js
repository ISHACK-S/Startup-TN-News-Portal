import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  runAdminPermissionsMigration,
  runModuleCatalogMigration,
  runRoleBuilderMigration
} from '../scripts/migrate-admin-authorization.js';
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULE_IDS,
  PERMISSION_MODULES,
  PERMISSION_ROLE_KEYS
} from '../src/permissions/registry.js';

const migrationId = '002_admin_permissions';
const tableColumns = {
  permission_roles: ['role_key', 'label', 'is_builtin'],
  permission_actions: ['action_id', 'label'],
  permission_modules: ['module_id', 'label', 'description', 'navigation_group', 'is_available', 'is_active'],
  role_permission_limits: ['role_key', 'module_id', 'action_id', 'max_allowed'],
  role_module_permissions: ['role_key', 'module_id', 'action_id', 'is_allowed'],
  account_permission_overrides: ['admin_id', 'module_id', 'action_id', 'is_allowed'],
  admin_permission_audit: ['audit_id', 'actor_admin_id', 'target_admin_id', 'operation', 'details', 'created_at']
};

function createMigrationConnection({ tables = [], applied = false, missingModule, missingAction } = {}) {
  const state = {
    tables: new Set(tables),
    columns: new Map(tables.map((table) => [table, new Set(tableColumns[table] ?? [])])),
    applied: new Set(applied ? [migrationId] : []),
    modules: new Set(tables.length ? PERMISSION_MODULE_IDS.filter((id) => id !== missingModule) : []),
    actions: new Set(tables.length ? PERMISSION_ACTIONS.filter((id) => id !== missingAction) : []),
    roles: new Set(tables.length ? PERMISSION_ROLE_KEYS : []),
    limitCount: tables.length ? PERMISSION_ROLE_KEYS.length * PERMISSION_MODULE_IDS.length * PERMISSION_ACTIONS.length : 0,
    permissionCount: tables.length ? PERMISSION_ROLE_KEYS.length * PERMISSION_MODULE_IDS.length * PERMISSION_ACTIONS.length : 0,
    releases: 0,
    executedStatements: 0
  };
  const connection = {
    async execute(sql, values = []) {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('RELEASE_LOCK')) {
        state.releases += 1;
        return [[{ released: 1 }]];
      }
      if (sql.startsWith('SELECT migration_id FROM schema_migrations')) {
        return [[state.applied.has(values[0]) ? { migration_id: values[0] } : undefined].filter(Boolean)];
      }
      if (sql.includes('information_schema.TABLES')) {
        return [[...state.tables].map((table_name) => ({ table_name }))];
      }
      if (sql.includes('information_schema.COLUMNS')) {
        return [[...state.columns].flatMap(([table_name, columns]) =>
          [...columns].map((column_name) => ({ table_name, column_name }))
        )];
      }
      if (sql === 'SELECT module_id FROM permission_modules') {
        return [[...state.modules].map((module_id) => ({ module_id }))];
      }
      if (sql === 'SELECT module_id, label, navigation_group FROM permission_modules') {
        return [[...state.modules].map((module_id) => {
          const module = PERMISSION_MODULES.find(({ id }) => id === module_id);
          return {
            module_id,
            label: module?.label ?? module_id,
            navigation_group: module?.group ?? 'Obsolete'
          };
        })];
      }
      if (sql === 'SELECT action_id FROM permission_actions') {
        return [[...state.actions].map((action_id) => ({ action_id }))];
      }
      if (sql === 'SELECT role_key FROM permission_roles') {
        return [[...state.roles].map((role_key) => ({ role_key }))];
      }
      if (sql.startsWith('SELECT') && sql.includes('AS limit_count')) {
        return [[...state.roles].map((role_key) => ({
          role_key,
          limit_count: state.limitCount / Math.max(state.roles.size, 1),
          permission_count: state.permissionCount / Math.max(state.roles.size, 1)
        }))];
      }
      if (sql.startsWith('CREATE TABLE ')) {
        const table = sql.match(/^CREATE TABLE ([a-z_]+)/)[1];
        state.tables.add(table);
        state.columns.set(table, new Set(tableColumns[table]));
        state.executedStatements += 1;
        return [{ affectedRows: 0 }];
      }
      if (sql.startsWith('INSERT INTO permission_modules')) {
        state.modules = new Set(PERMISSION_MODULE_IDS);
      }
      if (sql.startsWith('INSERT INTO permission_actions')) {
        state.actions = new Set(PERMISSION_ACTIONS);
      }
      if (sql.startsWith('INSERT INTO permission_roles')) {
        state.roles = new Set(PERMISSION_ROLE_KEYS);
      }
      if (sql.startsWith('INSERT INTO role_permission_limits')) {
        state.limitCount = PERMISSION_ROLE_KEYS.length * PERMISSION_MODULE_IDS.length * PERMISSION_ACTIONS.length;
      }
      if (sql.startsWith('INSERT INTO role_module_permissions')) {
        state.permissionCount = PERMISSION_ROLE_KEYS.length * PERMISSION_MODULE_IDS.length * PERMISSION_ACTIONS.length;
      }
      if (sql.startsWith('DELETE FROM permission_modules')) {
        state.modules = new Set(PERMISSION_MODULE_IDS);
        state.limitCount = PERMISSION_ROLE_KEYS.length * PERMISSION_MODULE_IDS.length * PERMISSION_ACTIONS.length;
        state.permissionCount = PERMISSION_ROLE_KEYS.length * PERMISSION_MODULE_IDS.length * PERMISSION_ACTIONS.length;
      }
      if (sql.startsWith('INSERT INTO schema_migrations')) state.applied.add(values[0]);
      state.executedStatements += 1;
      return [{ affectedRows: 1 }];
    }
  };
  return { connection, state };
}

describe('admin permissions database migration', () => {
  it('contains every stable module ID and applies the complete schema once', async () => {
    const sql = await readFile(new URL('../../database/migrations/002_admin_permissions.sql', import.meta.url), 'utf8');
    for (const moduleId of PERMISSION_MODULE_IDS) assert.ok(sql.includes(`'${moduleId}'`));

    const { connection, state } = createMigrationConnection();
    const first = await runAdminPermissionsMigration(connection);
    const second = await runAdminPermissionsMigration(connection);
    assert.deepEqual(first, { applied: true, migrationId });
    assert.deepEqual(second, { applied: false, migrationId });
    assert.equal(state.tables.size, 7);
    assert.equal(state.modules.size, PERMISSION_MODULE_IDS.length);
    assert.equal(state.actions.size, PERMISSION_ACTIONS.length);
    assert.equal(state.limitCount, 2 * PERMISSION_MODULE_IDS.length * PERMISSION_ACTIONS.length);
    assert.equal(state.permissionCount, 2 * PERMISSION_MODULE_IDS.length * PERMISSION_ACTIONS.length);
    assert.equal(state.releases, 2);
  });

  it('fails closed on partial schema and recorded migrations with missing registry data', async () => {
    const partial = createMigrationConnection({ tables: ['permission_modules'] });
    await assert.rejects(runAdminPermissionsMigration(partial.connection), /partial permission schema/);
    assert.equal(partial.state.releases, 1);
    assert.equal(partial.state.applied.size, 0);

    const conflicting = createMigrationConnection({
      tables: Object.keys(tableColumns),
      applied: true,
      missingModule: 'web-stories'
    });
    await assert.rejects(runAdminPermissionsMigration(conflicting.connection), /module registry/);
    assert.equal(conflicting.state.releases, 1);

    const conflictingActions = createMigrationConnection({
      tables: Object.keys(tableColumns),
      applied: true,
      missingAction: 'configure'
    });
    await assert.rejects(runAdminPermissionsMigration(conflictingActions.connection), /action registry/);
    assert.equal(conflictingActions.state.releases, 1);
  });

  it('cleans obsolete module records and their grants while preserving built-in roles', async () => {
    const { connection, state } = createMigrationConnection({
      tables: Object.keys(tableColumns),
      applied: true
    });
    const obsoleteIds = [
      'profile-settings', 'monthly-reports', 'citizen-services', 'faq-management',
      'police-stations', 'helplines-registry', 'portal-links', 'official-alerts',
      'session-management', 'security-events', 'audit-logs', 'system-configuration',
      'backup-restore', 'api-key-configuration', 'smtp-configuration'
    ];
    for (const id of obsoleteIds) state.modules.add(id);
    state.limitCount += PERMISSION_ROLE_KEYS.length * obsoleteIds.length * PERMISSION_ACTIONS.length;
    state.permissionCount += PERMISSION_ROLE_KEYS.length * obsoleteIds.length * PERMISSION_ACTIONS.length;

    const sql = await readFile(new URL('../../database/migrations/007_startuptn_module_catalog.sql', import.meta.url), 'utf8');
    for (const table of ['account_permission_overrides', 'role_module_permissions', 'role_permission_limits', 'permission_modules']) {
      assert.match(sql, new RegExp(`DELETE FROM ${table}`));
    }

    assert.deepEqual(await runModuleCatalogMigration(connection), {
      applied: true,
      migrationId: '007_startuptn_module_catalog'
    });
    assert.deepEqual(state.modules, new Set(PERMISSION_MODULE_IDS));
    assert.deepEqual(state.roles, new Set(PERMISSION_ROLE_KEYS));
    assert.equal(state.limitCount, PERMISSION_ROLE_KEYS.length * PERMISSION_MODULE_IDS.length * PERMISSION_ACTIONS.length);
    assert.equal(state.permissionCount, PERMISSION_ROLE_KEYS.length * PERMISSION_MODULE_IDS.length * PERMISSION_ACTIONS.length);
    assert.equal(state.applied.has('007_startuptn_module_catalog'), true);

    assert.deepEqual(await runModuleCatalogMigration(connection), {
      applied: false,
      migrationId: '007_startuptn_module_catalog'
    });
    assert.equal(state.releases, 2);
  });

  it('enables the implemented Role Builder module once and verifies repeat runs', async () => {
    const state = { applied: false, available: 0, active: 0, lockReleases: 0 };
    const connection = {
      async execute(sql, values = []) {
        if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
        if (sql.includes('RELEASE_LOCK')) {
          state.lockReleases += 1;
          return [[{ released: 1 }]];
        }
        if (sql.startsWith('SELECT migration_id FROM schema_migrations')) {
          return [[state.applied ? { migration_id: values[0] } : undefined].filter(Boolean)];
        }
        if (sql.includes("FROM permission_modules WHERE module_id = 'role-builder'")) {
          return [[{
            module_id: 'role-builder',
            is_available: state.available,
            is_active: state.active
          }]];
        }
        if (sql.startsWith('UPDATE permission_modules')) {
          state.available = 1;
          state.active = 1;
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('INSERT INTO schema_migrations')) {
          state.applied = true;
          return [{ affectedRows: 1 }];
        }
        throw new Error(`Unexpected migration SQL: ${sql}`);
      }
    };

    assert.deepEqual(await runRoleBuilderMigration(connection), {
      applied: true,
      migrationId: '003_enable_role_builder'
    });
    state.active = 0;
    assert.deepEqual(await runRoleBuilderMigration(connection), {
      applied: false,
      migrationId: '003_enable_role_builder'
    });
    assert.equal(state.available, 1);
    assert.equal(state.active, 0);
    assert.equal(state.lockReleases, 2);
  });
});
