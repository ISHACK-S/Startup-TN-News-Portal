import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULE_IDS,
  PERMISSION_ROLE_KEYS
} from '../src/permissions/registry.js';

const MIGRATION_ID = '001_admin_authorization';
const MIGRATION_FILE = new URL('../../database/migrations/001_admin_authorization.sql', import.meta.url);
const PERMISSIONS_MIGRATION_ID = '002_admin_permissions';
const PERMISSIONS_MIGRATION_FILE = new URL('../../database/migrations/002_admin_permissions.sql', import.meta.url);
const ROLE_BUILDER_MIGRATION_ID = '003_enable_role_builder';
const ROLE_BUILDER_MIGRATION_FILE = new URL('../../database/migrations/003_enable_role_builder.sql', import.meta.url);
const CONTENT_MANAGEMENT_MIGRATION_ID = '004_content_management';
const CONTENT_MANAGEMENT_MIGRATION_FILE = new URL('../../database/migrations/004_content_management.sql', import.meta.url);
const CONTENT_TABLES = {
  media_assets: ['cloudinary_public_id', 'secure_url', 'resource_type', 'format', 'width', 'height', 'bytes', 'original_filename', 'uploaded_by', 'created_at'],
  web_stories: ['title', 'slug', 'description', 'status', 'created_by', 'published_at', 'created_at', 'updated_at'],
  web_story_slides: ['story_id', 'position', 'image_url', 'alt_text', 'caption', 'link_url'],
  hero_slides: ['title', 'description', 'image_url', 'alt_text', 'destination_url', 'article_id', 'display_order', 'status', 'created_by', 'published_at'],
  media_videos: ['title', 'description', 'source_url', 'provider', 'embed_id', 'thumbnail_url', 'thumbnail_alt', 'category', 'display_order', 'status', 'created_by', 'published_at']
};
const EXPECTED_COLUMNS = {
  role: { type: "enum('admin','super admin')", default: 'Admin' },
  is_active: { type: 'tinyint(1)', default: '1' },
  auth_version: { type: 'int unsigned', default: '0' }
};

function normalizedColumnType(value) {
  return String(value).replace(/\s+/g, '').toLowerCase();
}

async function readAdminColumns(connection) {
  const [rows] = await connection.execute(
    `SELECT COLUMN_NAME AS column_name, COLUMN_TYPE AS column_type,
            IS_NULLABLE AS is_nullable, COLUMN_DEFAULT AS column_default
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'admins'
       AND COLUMN_NAME IN ('role', 'is_active', 'auth_version')`
  );
  return new Map(rows.map((row) => [row.column_name, row]));
}

const PERMISSION_TABLE_COLUMNS = {
  permission_roles: ['role_key', 'label', 'is_builtin'],
  permission_actions: ['action_id', 'label'],
  permission_modules: ['module_id', 'label', 'description', 'navigation_group', 'is_available', 'is_active'],
  role_permission_limits: ['role_key', 'module_id', 'action_id', 'max_allowed'],
  role_module_permissions: ['role_key', 'module_id', 'action_id', 'is_allowed'],
  account_permission_overrides: ['admin_id', 'module_id', 'action_id', 'is_allowed'],
  admin_permission_audit: ['audit_id', 'actor_admin_id', 'target_admin_id', 'operation', 'details', 'created_at']
};

async function readPermissionTables(connection) {
  const [rows] = await connection.execute(
    `SELECT TABLE_NAME AS table_name
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN (${Object.keys(PERMISSION_TABLE_COLUMNS).map(() => '?').join(', ')})`,
    Object.keys(PERMISSION_TABLE_COLUMNS)
  );
  return new Set(rows.map(({ table_name }) => table_name));
}

async function readPermissionColumns(connection) {
  const [rows] = await connection.execute(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN (${Object.keys(PERMISSION_TABLE_COLUMNS).map(() => '?').join(', ')})`,
    Object.keys(PERMISSION_TABLE_COLUMNS)
  );
  return rows.reduce((columns, row) => {
    if (!columns.has(row.table_name)) columns.set(row.table_name, new Set());
    columns.get(row.table_name).add(row.column_name);
    return columns;
  }, new Map());
}

async function verifyPermissionSchema(connection) {
  const tables = await readPermissionTables(connection);
  const columns = await readPermissionColumns(connection);
  for (const [tableName, expectedColumns] of Object.entries(PERMISSION_TABLE_COLUMNS)) {
    const actualColumns = columns.get(tableName);
    if (!tables.has(tableName) || expectedColumns.some((column) => !actualColumns?.has(column))) {
      throw new Error(`The ${tableName} table does not match migration ${PERMISSIONS_MIGRATION_ID}.`);
    }
  }

  const [moduleRows] = await connection.execute('SELECT module_id FROM permission_modules');
  const moduleIds = new Set(moduleRows.map(({ module_id }) => module_id));
  if (
    moduleIds.size !== PERMISSION_MODULE_IDS.length
    || PERMISSION_MODULE_IDS.some((moduleId) => !moduleIds.has(moduleId))
  ) {
    throw new Error(`The module registry does not match migration ${PERMISSIONS_MIGRATION_ID}.`);
  }

  const [actionRows] = await connection.execute('SELECT action_id FROM permission_actions');
  const actionIds = new Set(actionRows.map(({ action_id }) => action_id));
  if (
    actionIds.size !== PERMISSION_ACTIONS.length
    || PERMISSION_ACTIONS.some((actionId) => !actionIds.has(actionId))
  ) {
    throw new Error(`The action registry does not match migration ${PERMISSIONS_MIGRATION_ID}.`);
  }

  const [roleRows] = await connection.execute('SELECT role_key FROM permission_roles');
  const roleKeys = new Set(roleRows.map(({ role_key }) => role_key));
  if (PERMISSION_ROLE_KEYS.some((roleKey) => !roleKeys.has(roleKey))) {
    throw new Error(`The built-in role registry does not match migration ${PERMISSIONS_MIGRATION_ID}.`);
  }

  const expectedPermissionRows = PERMISSION_ROLE_KEYS.length
    * PERMISSION_MODULE_IDS.length
    * PERMISSION_ACTIONS.length;
  const [permissionCounts] = await connection.execute(
    `SELECT
       (SELECT COUNT(*) FROM role_permission_limits) AS limit_count,
       (SELECT COUNT(*) FROM role_module_permissions) AS permission_count`
  );
  if (
    Number(permissionCounts[0]?.limit_count) !== expectedPermissionRows
    || Number(permissionCounts[0]?.permission_count) !== expectedPermissionRows
  ) {
    throw new Error(`The built-in permissions do not match migration ${PERMISSIONS_MIGRATION_ID}.`);
  }
}

function verifyAdminColumns(columns) {
  for (const [name, expected] of Object.entries(EXPECTED_COLUMNS)) {
    const actual = columns.get(name);
    if (
      !actual
      || normalizedColumnType(actual.column_type) !== normalizedColumnType(expected.type)
      || actual.is_nullable !== 'NO'
      || String(actual.column_default) !== expected.default
    ) {
      throw new Error(`The admins.${name} column does not match migration ${MIGRATION_ID}.`);
    }
  }
}

export async function runAdminPermissionsMigration(connection) {
  const [lockRows] = await connection.execute(
    "SELECT GET_LOCK('startuptn_news_schema_migrations', 30) AS acquired"
  );
  if (Number(lockRows[0]?.acquired) !== 1) {
    throw new Error('Could not acquire the database migration lock.');
  }

  try {
    const [appliedRows] = await connection.execute(
      'SELECT migration_id FROM schema_migrations WHERE migration_id = ? LIMIT 1',
      [PERMISSIONS_MIGRATION_ID]
    );
    if (appliedRows.length > 0) {
      await verifyPermissionSchema(connection);
      return { applied: false, migrationId: PERMISSIONS_MIGRATION_ID };
    }

    const tables = await readPermissionTables(connection);
    if (tables.size > 0) {
      throw new Error(
        `A partial permission schema exists without migration ${PERMISSIONS_MIGRATION_ID}; inspect it before proceeding.`
      );
    }

    const migrationSql = await readFile(PERMISSIONS_MIGRATION_FILE, 'utf8');
    const statements = migrationSql
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await connection.execute(statement);
    }

    await verifyPermissionSchema(connection);
    await connection.execute(
      'INSERT INTO schema_migrations (migration_id) VALUES (?)',
      [PERMISSIONS_MIGRATION_ID]
    );
    return { applied: true, migrationId: PERMISSIONS_MIGRATION_ID };
  } finally {
    await connection.execute("SELECT RELEASE_LOCK('startuptn_news_schema_migrations')");
  }
}

export async function runAdminAuthorizationMigration(connection) {
  await connection.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       migration_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
       applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (migration_id)
     ) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
  );

  const [lockRows] = await connection.execute(
    "SELECT GET_LOCK('startuptn_news_schema_migrations', 30) AS acquired"
  );
  if (Number(lockRows[0]?.acquired) !== 1) {
    throw new Error('Could not acquire the database migration lock.');
  }

  try {
    const [appliedRows] = await connection.execute(
      'SELECT migration_id FROM schema_migrations WHERE migration_id = ? LIMIT 1',
      [MIGRATION_ID]
    );
    const columns = await readAdminColumns(connection);

    if (appliedRows.length > 0) {
      verifyAdminColumns(columns);
      return { applied: false, migrationId: MIGRATION_ID };
    }

    if (columns.size > 0 && columns.size < Object.keys(EXPECTED_COLUMNS).length) {
      throw new Error(
        `A partial admins authorization schema exists without migration ${MIGRATION_ID}; inspect it before proceeding.`
      );
    }

    if (columns.size === 0) {
      const migrationSql = await readFile(MIGRATION_FILE, 'utf8');
      const statements = migrationSql
        .split(';')
        .map((statement) => statement.trim())
        .filter(Boolean);

      for (const statement of statements) {
        await connection.execute(statement);
      }
    }

    const updatedColumns = await readAdminColumns(connection);
    verifyAdminColumns(updatedColumns);
    await connection.execute("UPDATE admins SET role = 'Admin' WHERE role IS NULL");
    await connection.execute(
      'INSERT INTO schema_migrations (migration_id) VALUES (?)',
      [MIGRATION_ID]
    );
    return { applied: true, migrationId: MIGRATION_ID };
  } finally {
    await connection.execute("SELECT RELEASE_LOCK('startuptn_news_schema_migrations')");
  }
}

export async function runRoleBuilderMigration(connection) {
  const [lockRows] = await connection.execute(
    "SELECT GET_LOCK('startuptn_news_schema_migrations', 30) AS acquired"
  );
  if (Number(lockRows[0]?.acquired) !== 1) {
    throw new Error('Could not acquire the database migration lock.');
  }

  try {
    const [appliedRows] = await connection.execute(
      'SELECT migration_id FROM schema_migrations WHERE migration_id = ? LIMIT 1',
      [ROLE_BUILDER_MIGRATION_ID]
    );
    const [moduleRows] = await connection.execute(
      `SELECT module_id, is_available, is_active
       FROM permission_modules WHERE module_id = 'role-builder' LIMIT 1`
    );
    const module = moduleRows[0];
    if (!module) {
      throw new Error(`The role-builder module is missing; apply ${PERMISSIONS_MIGRATION_ID} first.`);
    }

    if (appliedRows.length > 0) {
      if (Number(module.is_available) !== 1) {
        throw new Error(`The role-builder module does not match migration ${ROLE_BUILDER_MIGRATION_ID}.`);
      }
      return { applied: false, migrationId: ROLE_BUILDER_MIGRATION_ID };
    }

    const migrationSql = await readFile(ROLE_BUILDER_MIGRATION_FILE, 'utf8');
    for (const statement of migrationSql.split(';').map((sql) => sql.trim()).filter(Boolean)) {
      await connection.execute(statement);
    }
    const [updatedRows] = await connection.execute(
      `SELECT module_id, is_available, is_active
       FROM permission_modules WHERE module_id = 'role-builder' LIMIT 1`
    );
    if (Number(updatedRows[0]?.is_available) !== 1 || Number(updatedRows[0]?.is_active) !== 1) {
      throw new Error(`The role-builder module does not match migration ${ROLE_BUILDER_MIGRATION_ID}.`);
    }
    await connection.execute(
      'INSERT INTO schema_migrations (migration_id) VALUES (?)',
      [ROLE_BUILDER_MIGRATION_ID]
    );
    return { applied: true, migrationId: ROLE_BUILDER_MIGRATION_ID };
  } finally {
    await connection.execute("SELECT RELEASE_LOCK('startuptn_news_schema_migrations')");
  }
}

export async function runContentManagementMigration(connection) {
  const [lockRows] = await connection.execute(
    "SELECT GET_LOCK('startuptn_news_schema_migrations', 30) AS acquired"
  );
  if (Number(lockRows[0]?.acquired) !== 1) {
    throw new Error('Could not acquire the database migration lock.');
  }

  try {
    const [appliedRows] = await connection.execute(
      'SELECT migration_id FROM schema_migrations WHERE migration_id = ? LIMIT 1',
      [CONTENT_MANAGEMENT_MIGRATION_ID]
    );
    const tableNames = Object.keys(CONTENT_TABLES);
    const [existingTableRows] = await connection.execute(
      `SELECT TABLE_NAME AS table_name
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (${tableNames.map(() => '?').join(', ')})`,
      tableNames
    );
    const existingTables = new Set(existingTableRows.map(({ table_name }) => table_name));
    const [existingColumnRows] = await connection.execute(
      `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (${tableNames.map(() => '?').join(', ')})`,
      tableNames
    );
    const existingColumns = existingColumnRows.reduce((result, row) => {
      if (!result.has(row.table_name)) result.set(row.table_name, new Set());
      result.get(row.table_name).add(row.column_name);
      return result;
    }, new Map());
    for (const [tableName, expectedColumns] of Object.entries(CONTENT_TABLES)) {
      if (
        existingTables.has(tableName)
        && expectedColumns.some((column) => !existingColumns.get(tableName)?.has(column))
      ) {
        throw new Error(`The ${tableName} table does not match migration ${CONTENT_MANAGEMENT_MIGRATION_ID}.`);
      }
    }

    const [legacyChecks] = await connection.execute(
      `SELECT CONSTRAINT_NAME AS constraint_name
       FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'hero_slides'
         AND CONSTRAINT_NAME = 'chk_hero_slide_destination'
         AND CONSTRAINT_TYPE = 'CHECK'`
    );
    if (legacyChecks.length) {
      await connection.execute(
        'ALTER TABLE hero_slides DROP CHECK chk_hero_slide_destination'
      );
    }

    const migrationSql = await readFile(CONTENT_MANAGEMENT_MIGRATION_FILE, 'utf8');
    const statements = migrationSql.split(';').map((sql) => sql.trim()).filter(Boolean);
    for (const statement of statements) {
      if (appliedRows.length && statement.startsWith('UPDATE permission_modules')) continue;
      await connection.execute(statement);
    }

    const [columnRows] = await connection.execute(
      `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN (${tableNames.map(() => '?').join(', ')})`,
      tableNames
    );
    const columns = columnRows.reduce((result, row) => {
      if (!result.has(row.table_name)) result.set(row.table_name, new Set());
      result.get(row.table_name).add(row.column_name);
      return result;
    }, new Map());
    for (const [tableName, expectedColumns] of Object.entries(CONTENT_TABLES)) {
      if (expectedColumns.some((column) => !columns.get(tableName)?.has(column))) {
        throw new Error(`The ${tableName} table does not match migration ${CONTENT_MANAGEMENT_MIGRATION_ID}.`);
      }
    }

    const moduleIds = ['media-library', 'web-stories', 'hero-slider', 'video-media'];
    const [modules] = await connection.execute(
      `SELECT module_id, is_available, is_active FROM permission_modules
       WHERE module_id IN (${moduleIds.map(() => '?').join(', ')})`,
      moduleIds
    );
    if (modules.length !== moduleIds.length || modules.some((module) =>
      Number(module.is_available) !== 1
      || (!appliedRows.length && Number(module.is_active) !== 1)
    )) {
      throw new Error(`The content-management permissions do not match migration ${CONTENT_MANAGEMENT_MIGRATION_ID}.`);
    }

    if (!appliedRows.length) {
      await connection.execute(
        'INSERT INTO schema_migrations (migration_id) VALUES (?)',
        [CONTENT_MANAGEMENT_MIGRATION_ID]
      );
    }
    return { applied: !appliedRows.length, migrationId: CONTENT_MANAGEMENT_MIGRATION_ID };
  } finally {
    await connection.execute("SELECT RELEASE_LOCK('startuptn_news_schema_migrations')");
  }
}

async function main() {
  const { pool } = await import('../src/database/pool.js');
  const connection = await pool.getConnection();
  try {
    const results = [
      await runAdminAuthorizationMigration(connection),
      await runAdminPermissionsMigration(connection),
      await runRoleBuilderMigration(connection),
      await runContentManagementMigration(connection)
    ];
    for (const result of results) {
      console.info(result.applied
        ? `Applied database migration ${result.migrationId}.`
        : `Database migration ${result.migrationId} is already applied.`);
    }
  } finally {
    connection.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
