import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  PERMISSION_ROLE_KEYS
} from '../src/permissions/registry.js';
import { runCustomRolesMigration } from '../scripts/migrate-admin-authorization.js';

const migrationId = '008_custom_admin_roles';
const tableColumns = {
  permission_roles: ['role_key', 'label', 'is_builtin'],
  permission_actions: ['action_id', 'label'],
  permission_modules: ['module_id', 'label', 'description', 'navigation_group', 'is_available', 'is_active'],
  role_permission_limits: ['role_key', 'module_id', 'action_id', 'max_allowed'],
  role_module_permissions: ['role_key', 'module_id', 'action_id', 'is_allowed'],
  account_permission_overrides: ['admin_id', 'module_id', 'action_id', 'is_allowed'],
  admin_permission_audit: ['audit_id', 'actor_admin_id', 'target_admin_id', 'operation', 'details', 'created_at']
};
const permissionRowCount = PERMISSION_MODULES.length * PERMISSION_ACTIONS.length;

function createMigrationDatabase() {
  const state = {
    applied: new Set(['007_startuptn_module_catalog']),
    columns: new Map([
      ...Object.entries(tableColumns).flatMap(([table_name, columnNames]) =>
        columnNames.map((column_name) => [`${table_name}.${column_name}`, { table_name, column_name }])
      ),
      ['admins.role', {
        table_name: 'admins',
        column_name: 'role',
        column_type: "enum('admin','super admin')"
      }]
    ]),
    indexes: new Set(),
    roles: PERMISSION_ROLE_KEYS.map((role_key) => ({
      role_key,
      label: role_key === 'admin' ? 'Admin' : 'Super Admin',
      description: '',
      is_builtin: 1,
      is_active: 1
    })),
    alterStatements: [],
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
        return [[state.applied.has(values[0]) ? { migration_id: values[0] } : undefined].filter(Boolean)];
      }
      if (sql.includes('FROM information_schema.COLUMNS')) {
        return [[...state.columns.values()]];
      }
      if (sql.includes('FROM information_schema.STATISTICS')) {
        return [[...state.indexes].map((index_name) => ({ index_name }))];
      }
      if (sql.includes('FROM information_schema.TABLES')) {
        return [[...Object.keys(tableColumns)].map((table_name) => ({ table_name }))];
      }
      if (sql.startsWith('ALTER TABLE admins MODIFY COLUMN role')) {
        state.alterStatements.push(sql);
        state.columns.set('admins.role', {
          table_name: 'admins',
          column_name: 'role',
          column_type: 'varchar(100)'
        });
        return [{ affectedRows: 0 }];
      }
      if (sql.startsWith('ALTER TABLE admins ADD KEY idx_admins_role')) {
        state.alterStatements.push(sql);
        state.indexes.add('idx_admins_role');
        return [{ affectedRows: 0 }];
      }
      if (sql.startsWith('ALTER TABLE permission_roles ADD COLUMN')) {
        state.alterStatements.push(sql);
        state.columns.set('permission_roles.description', {
          table_name: 'permission_roles',
          column_name: 'description',
          column_type: 'varchar(500)'
        });
        state.columns.set('permission_roles.is_active', {
          table_name: 'permission_roles',
          column_name: 'is_active',
          column_type: 'tinyint(1)'
        });
        return [{ affectedRows: 0 }];
      }
      if (sql.startsWith('ALTER TABLE permission_roles ADD UNIQUE KEY uq_permission_roles_label')) {
        state.alterStatements.push(sql);
        state.indexes.add('uq_permission_roles_label');
        return [{ affectedRows: 0 }];
      }
      if (sql.startsWith('SELECT label FROM permission_roles GROUP BY label')) return [[]];
      if (sql.startsWith('UPDATE permission_roles')) return [{ affectedRows: 2 }];
      if (sql.startsWith('SELECT module_id FROM permission_modules')) {
        return [[...PERMISSION_MODULES.map(({ id: module_id }) => ({ module_id }))]];
      }
      if (sql.startsWith('SELECT module_id, label, navigation_group FROM permission_modules')) {
        return [[...PERMISSION_MODULES.map(({ id: module_id, label, group: navigation_group }) => ({
          module_id, label, navigation_group
        }))]];
      }
      if (sql.startsWith('SELECT action_id FROM permission_actions')) {
        return [[...PERMISSION_ACTIONS.map((action_id) => ({ action_id }))]];
      }
      if (sql.startsWith('SELECT role_key FROM permission_roles')) {
        return [[...state.roles.map(({ role_key }) => ({ role_key }))]];
      }
      if (sql.startsWith('SELECT roles.role_key')) {
        return [[...state.roles.map((role) => ({
          ...role,
          limit_count: permissionRowCount,
          permission_count: permissionRowCount
        }))]];
      }
      if (sql.startsWith('SELECT role_key, label, description, is_builtin, is_active FROM permission_roles')) {
        return [[...state.roles]];
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

describe('custom admin role database migration', () => {
  it('extends the existing schema, verifies required indexes, and safely verifies the recorded migration on rerun', async () => {
    const { connection, state } = createMigrationDatabase();

    const first = await runCustomRolesMigration(connection);
    const second = await runCustomRolesMigration(connection);

    assert.deepEqual(first, { applied: true, migrationId });
    assert.deepEqual(second, { applied: false, migrationId });
    assert.equal(state.alterStatements.length, 4);
    assert.equal(state.columns.get('admins.role').column_type, 'varchar(100)');
    assert.ok(state.columns.has('permission_roles.description'));
    assert.ok(state.columns.has('permission_roles.is_active'));
    assert.deepEqual(state.indexes, new Set(['idx_admins_role', 'uq_permission_roles_label']));
    assert.equal(state.applied.has(migrationId), true);
    assert.equal(state.releases, 2);
  });
});
