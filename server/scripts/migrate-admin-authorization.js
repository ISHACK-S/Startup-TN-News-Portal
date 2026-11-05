import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULE_IDS,
  PERMISSION_MODULES,
  PERMISSION_ROLE_KEYS
} from '../src/permissions/registry.js';

const MIGRATION_ID = '001_admin_authorization';
const MIGRATION_FILE = new URL('../../database/migrations/001_admin_authorization.sql', import.meta.url);
const PERMISSIONS_MIGRATION_ID = '002_admin_permissions';
const PERMISSIONS_MIGRATION_FILE = new URL('../../database/migrations/002_admin_permissions.sql', import.meta.url);
const MODULE_CATALOG_MIGRATION_ID = '007_startuptn_module_catalog';
const MODULE_CATALOG_MIGRATION_FILE = new URL('../../database/migrations/007_startuptn_module_catalog.sql', import.meta.url);
const CUSTOM_ROLES_MIGRATION_ID = '008_custom_admin_roles';
const ROLE_BUILDER_MIGRATION_ID = '003_enable_role_builder';
const ROLE_BUILDER_MIGRATION_FILE = new URL('../../database/migrations/003_enable_role_builder.sql', import.meta.url);
const CONTENT_MANAGEMENT_MIGRATION_ID = '004_content_management';
const CONTENT_MANAGEMENT_MIGRATION_FILE = new URL('../../database/migrations/004_content_management.sql', import.meta.url);
const WEBSITE_CONFIGURATION_MIGRATION_ID = '005_website_configuration';
const WEBSITE_CONFIGURATION_MIGRATION_FILE = new URL('../../database/migrations/005_website_configuration.sql', import.meta.url);
const WEBSITE_CONFIGURATION_COLUMNS = ['config_key', 'config_value', 'updated_by', 'updated_at'];
const WEBSITE_CONFIGURATION_DRAFTS_MIGRATION_ID = '006_website_configuration_drafts';
const WEBSITE_CONFIGURATION_DRAFTS_MIGRATION_FILE = new URL('../../database/migrations/006_website_configuration_drafts.sql', import.meta.url);
const WEBSITE_CONFIGURATION_DRAFTS_COLUMNS = ['config_key', 'config_value', 'updated_by', 'updated_at'];
const YOUTUBE_VIDEO_CATALOG_MIGRATION_ID = '009_youtube_video_catalog';
const YOUTUBE_VIDEO_CATALOG_MIGRATION_FILE = new URL('../../database/migrations/009_youtube_video_catalog.sql', import.meta.url);
const ADMIN_ACTIVITY_MIGRATION_ID = '010_admin_activity_reports';
const ADMIN_ACTIVITY_MIGRATION_FILE = new URL('../../database/migrations/010_admin_activity_reports.sql', import.meta.url);
const ADMIN_ACTIVITY_COLUMNS = [
  'activity_id', 'actor_admin_id', 'actor_name', 'actor_email', 'actor_role',
  'action_type', 'module_id', 'description', 'record_id', 'occurred_at',
  'status', 'changes', 'correlation_id'
];
const ADMIN_ACTIVITY_INDEXES = [
  'PRIMARY', 'idx_admin_activity_correlation',
  'idx_admin_activity_actor_time',
  'idx_admin_activity_role_time',
  'idx_admin_activity_module_time',
  'idx_admin_activity_action_time',
  'idx_admin_activity_time'
];
const YOUTUBE_VIDEO_CATALOG_INDEXES = [
  'uq_media_videos_provider_embed',
  'idx_media_videos_category_status_published'
];
const WEBSITE_CONFIGURATION_MODULES = ['branding-theme-editor', 'menu-management', 'footer-management'];
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

async function verifyPermissionSchema(connection, { allowObsoleteModules = false } = {}) {
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
    (!allowObsoleteModules && moduleIds.size !== PERMISSION_MODULE_IDS.length)
    || PERMISSION_MODULE_IDS.some((moduleId) => !moduleIds.has(moduleId))
  ) {
    throw new Error(`The module registry does not match migration ${PERMISSIONS_MIGRATION_ID}.`);
  }
  if (!allowObsoleteModules) {
    const [registeredModules] = await connection.execute(
      'SELECT module_id, label, navigation_group FROM permission_modules'
    );
    const moduleDetails = new Map(registeredModules.map((module) => [module.module_id, module]));
    for (const { id, label, group } of PERMISSION_MODULES) {
      const actual = moduleDetails.get(id);
      if (actual?.label !== label || actual?.navigation_group !== group) {
        throw new Error(`The module details do not match migration ${MODULE_CATALOG_MIGRATION_ID}.`);
      }
    }
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

  const [permissionCounts] = await connection.execute(
    `SELECT roles.role_key,
            (SELECT COUNT(*) FROM role_permission_limits AS limits
             WHERE limits.role_key = roles.role_key) AS limit_count,
            (SELECT COUNT(*) FROM role_module_permissions AS grants
             WHERE grants.role_key = roles.role_key) AS permission_count
     FROM permission_roles AS roles`
  );
  const expectedPermissionRows = PERMISSION_MODULE_IDS.length * PERMISSION_ACTIONS.length;
  if (permissionCounts.some((row) => (
    Number(row.limit_count) !== expectedPermissionRows
    || Number(row.permission_count) !== expectedPermissionRows
  ))) {
    throw new Error(`The built-in permissions do not match migration ${PERMISSIONS_MIGRATION_ID}.`);
  }
}

function verifyAdminColumns(columns) {
  for (const [name, expected] of Object.entries(EXPECTED_COLUMNS)) {
    const actual = columns.get(name);
    const actualType = normalizedColumnType(actual?.column_type);
    const typeMatches = name === 'role'
      ? actualType === normalizedColumnType(expected.type) || actualType === 'varchar(100)'
      : actualType === normalizedColumnType(expected.type);
    if (
      !actual
      || !typeMatches
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
      await verifyPermissionSchema(connection, { allowObsoleteModules: true });
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

export async function runCustomRolesMigration(connection) {
  const [lockRows] = await connection.execute(
    "SELECT GET_LOCK('startuptn_news_schema_migrations', 30) AS acquired"
  );
  if (Number(lockRows[0]?.acquired) !== 1) {
    throw new Error('Could not acquire the database migration lock.');
  }

  try {
    const [prerequisiteRows] = await connection.execute(
      'SELECT migration_id FROM schema_migrations WHERE migration_id = ? LIMIT 1',
      [MODULE_CATALOG_MIGRATION_ID]
    );
    if (!prerequisiteRows.length) {
      throw new Error(`Migration ${MODULE_CATALOG_MIGRATION_ID} must be applied before ${CUSTOM_ROLES_MIGRATION_ID}.`);
    }

    const [appliedRows] = await connection.execute(
      'SELECT migration_id FROM schema_migrations WHERE migration_id = ? LIMIT 1',
      [CUSTOM_ROLES_MIGRATION_ID]
    );
    const [columns] = await connection.execute(
      `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, COLUMN_TYPE AS column_type
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND ((TABLE_NAME = 'admins' AND COLUMN_NAME = 'role')
           OR (TABLE_NAME = 'permission_roles' AND COLUMN_NAME IN ('description', 'is_active')))`
    );
    const columnMap = new Map(columns.map((column) => [`${column.table_name}.${column.column_name}`, column]));
    if (!columnMap.has('admins.role')) {
      throw new Error(`The role schema does not match migration ${CUSTOM_ROLES_MIGRATION_ID}.`);
    }
    const [indexes] = await connection.execute(
      `SELECT TABLE_NAME AS table_name, INDEX_NAME AS index_name
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND ((TABLE_NAME = 'admins' AND INDEX_NAME = 'idx_admins_role')
           OR (TABLE_NAME = 'permission_roles' AND INDEX_NAME = 'uq_permission_roles_label'))`
    );
    const indexNames = new Set(indexes.map(({ index_name }) => index_name));

    if (!appliedRows.length) {
      const [duplicateLabels] = await connection.execute(
        'SELECT label FROM permission_roles GROUP BY label HAVING COUNT(*) > 1 LIMIT 1'
      );
      if (duplicateLabels.length) {
        throw new Error(`Duplicate permission role labels must be resolved before ${CUSTOM_ROLES_MIGRATION_ID}.`);
      }

      const adminRole = columnMap.get('admins.role');
      if (normalizedColumnType(adminRole.column_type) !== 'varchar(100)') {
        await connection.execute(
          "ALTER TABLE admins MODIFY COLUMN role VARCHAR(100) NOT NULL DEFAULT 'Admin'"
        );
      }
      if (!indexNames.has('idx_admins_role')) {
        await connection.execute('ALTER TABLE admins ADD KEY idx_admins_role (role)');
      }
      if (!columnMap.has('permission_roles.description') || !columnMap.has('permission_roles.is_active')) {
        const additions = [];
        if (!columnMap.has('permission_roles.description')) {
          additions.push("ADD COLUMN description VARCHAR(500) NOT NULL DEFAULT '' AFTER label");
        }
        if (!columnMap.has('permission_roles.is_active')) {
          additions.push('ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER is_builtin');
        }
        await connection.execute(`ALTER TABLE permission_roles ${additions.join(', ')}`);
      }
      if (!indexNames.has('uq_permission_roles_label')) {
        await connection.execute(
          'ALTER TABLE permission_roles ADD UNIQUE KEY uq_permission_roles_label (label)'
        );
      }
      await connection.execute(
        `UPDATE permission_roles
         SET description = CASE role_key
               WHEN 'admin' THEN 'Built-in editorial administrator role.'
               WHEN 'super-admin' THEN 'Protected role with unrestricted administrative authority.'
               ELSE description
             END,
             is_active = 1
         WHERE role_key IN ('admin', 'super-admin')`
      );
    }

    const [verifiedColumns] = await connection.execute(
      `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, COLUMN_TYPE AS column_type
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND ((TABLE_NAME = 'admins' AND COLUMN_NAME = 'role')
           OR (TABLE_NAME = 'permission_roles' AND COLUMN_NAME IN ('description', 'is_active')))`
    );
    const verified = new Map(verifiedColumns.map((column) => [`${column.table_name}.${column.column_name}`, column]));
    if (
      normalizedColumnType(verified.get('admins.role')?.column_type) !== 'varchar(100)'
      || !verified.has('permission_roles.description')
      || !verified.has('permission_roles.is_active')
    ) {
      throw new Error(`The role schema does not match migration ${CUSTOM_ROLES_MIGRATION_ID}.`);
    }
    const [verifiedIndexes] = await connection.execute(
      `SELECT TABLE_NAME AS table_name, INDEX_NAME AS index_name
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND ((TABLE_NAME = 'admins' AND INDEX_NAME = 'idx_admins_role')
           OR (TABLE_NAME = 'permission_roles' AND INDEX_NAME = 'uq_permission_roles_label'))`
    );
    const verifiedIndexNames = new Set(verifiedIndexes.map(({ index_name }) => index_name));
    if (!verifiedIndexNames.has('idx_admins_role') || !verifiedIndexNames.has('uq_permission_roles_label')) {
      throw new Error(`The role indexes do not match migration ${CUSTOM_ROLES_MIGRATION_ID}.`);
    }
    await verifyPermissionSchema(connection);

    const [roleRows] = await connection.execute(
      'SELECT role_key, label, description, is_builtin, is_active FROM permission_roles'
    );
    if (
      !PERMISSION_ROLE_KEYS.every((roleKey) => roleRows.some((row) => (
        row.role_key === roleKey && Number(row.is_builtin) === 1 && Number(row.is_active) === 1
      )))
    ) {
      throw new Error(`The protected built-in roles do not match migration ${CUSTOM_ROLES_MIGRATION_ID}.`);
    }
    if (!appliedRows.length) {
      await connection.execute(
        'INSERT INTO schema_migrations (migration_id) VALUES (?)',
        [CUSTOM_ROLES_MIGRATION_ID]
      );
    }
    return { applied: !appliedRows.length, migrationId: CUSTOM_ROLES_MIGRATION_ID };
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

export async function runModuleCatalogMigration(connection) {
  const [lockRows] = await connection.execute(
    "SELECT GET_LOCK('startuptn_news_schema_migrations', 30) AS acquired"
  );
  if (Number(lockRows[0]?.acquired) !== 1) {
    throw new Error('Could not acquire the database migration lock.');
  }

  try {
    const [permissionMigrationRows] = await connection.execute(
      'SELECT migration_id FROM schema_migrations WHERE migration_id = ? LIMIT 1',
      [PERMISSIONS_MIGRATION_ID]
    );
    if (!permissionMigrationRows.length) {
      throw new Error(`Migration ${PERMISSIONS_MIGRATION_ID} must be applied before ${MODULE_CATALOG_MIGRATION_ID}.`);
    }

    const [appliedRows] = await connection.execute(
      'SELECT migration_id FROM schema_migrations WHERE migration_id = ? LIMIT 1',
      [MODULE_CATALOG_MIGRATION_ID]
    );
    if (appliedRows.length) {
      await verifyPermissionSchema(connection);
      return { applied: false, migrationId: MODULE_CATALOG_MIGRATION_ID };
    }

    const sql = await readFile(MODULE_CATALOG_MIGRATION_FILE, 'utf8');
    const statements = sql.split(';').map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) {
      await connection.execute(statement);
    }

    await verifyPermissionSchema(connection);
    await connection.execute(
      'INSERT INTO schema_migrations (migration_id) VALUES (?)',
      [MODULE_CATALOG_MIGRATION_ID]
    );
    return { applied: true, migrationId: MODULE_CATALOG_MIGRATION_ID };
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

export async function runWebsiteConfigurationMigration(connection) {
  const [lockRows] = await connection.execute(
    "SELECT GET_LOCK('startuptn_news_schema_migrations', 30) AS acquired"
  );
  if (Number(lockRows[0]?.acquired) !== 1) {
    throw new Error('Could not acquire the database migration lock.');
  }

  try {
    const [appliedRows] = await connection.execute(
      'SELECT migration_id FROM schema_migrations WHERE migration_id = ? LIMIT 1',
      [WEBSITE_CONFIGURATION_MIGRATION_ID]
    );
    const [tableRows] = await connection.execute(
      `SELECT TABLE_NAME AS table_name
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_configuration'`
    );
    const [columnRows] = await connection.execute(
      `SELECT COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_configuration'`
    );
    const columns = new Set(columnRows.map(({ column_name }) => column_name));
    if (
      tableRows.length
      && WEBSITE_CONFIGURATION_COLUMNS.some((column) => !columns.has(column))
    ) {
      throw new Error(`The site_configuration table does not match migration ${WEBSITE_CONFIGURATION_MIGRATION_ID}.`);
    }

    const [modules] = await connection.execute(
      `SELECT module_id, is_available, is_active FROM permission_modules
       WHERE module_id IN (${WEBSITE_CONFIGURATION_MODULES.map(() => '?').join(', ')})`,
      WEBSITE_CONFIGURATION_MODULES
    );
    if (modules.length !== WEBSITE_CONFIGURATION_MODULES.length) {
      throw new Error(`The website-configuration modules are missing; apply ${PERMISSIONS_MIGRATION_ID} first.`);
    }

    const statements = (await readFile(WEBSITE_CONFIGURATION_MIGRATION_FILE, 'utf8'))
      .split(';').map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) {
      if (appliedRows.length && statement.startsWith('UPDATE permission_modules')) continue;
      await connection.execute(statement);
    }

    const [verifiedTables] = await connection.execute(
      `SELECT TABLE_NAME AS table_name
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_configuration'`
    );
    const [verifiedColumns] = await connection.execute(
      `SELECT COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_configuration'`
    );
    const verifiedColumnNames = new Set(verifiedColumns.map(({ column_name }) => column_name));
    if (
      !verifiedTables.length
      || WEBSITE_CONFIGURATION_COLUMNS.some((column) => !verifiedColumnNames.has(column))
    ) {
      throw new Error(`The site_configuration table does not match migration ${WEBSITE_CONFIGURATION_MIGRATION_ID}.`);
    }

    const [verifiedModules] = await connection.execute(
      `SELECT module_id, is_available, is_active FROM permission_modules
       WHERE module_id IN (${WEBSITE_CONFIGURATION_MODULES.map(() => '?').join(', ')})`,
      WEBSITE_CONFIGURATION_MODULES
    );
    if (
      verifiedModules.length !== WEBSITE_CONFIGURATION_MODULES.length
      || (!appliedRows.length && verifiedModules.some((module) =>
        Number(module.is_available) !== 1 || Number(module.is_active) !== 1
      ))
    ) {
      throw new Error(`The website-configuration modules do not match migration ${WEBSITE_CONFIGURATION_MIGRATION_ID}.`);
    }

    if (!appliedRows.length) {
      await connection.execute(
        'INSERT INTO schema_migrations (migration_id) VALUES (?)',
        [WEBSITE_CONFIGURATION_MIGRATION_ID]
      );
    }
    return { applied: !appliedRows.length, migrationId: WEBSITE_CONFIGURATION_MIGRATION_ID };
  } finally {
    await connection.execute("SELECT RELEASE_LOCK('startuptn_news_schema_migrations')");
  }
}

export async function runWebsiteConfigurationDraftsMigration(connection) {
  const [lockRows] = await connection.execute(
    "SELECT GET_LOCK('startuptn_news_schema_migrations', 30) AS acquired"
  );
  if (Number(lockRows[0]?.acquired) !== 1) {
    throw new Error('Could not acquire the database migration lock.');
  }

  try {
    const [appliedRows] = await connection.execute(
      'SELECT migration_id FROM schema_migrations WHERE migration_id = ? LIMIT 1',
      [WEBSITE_CONFIGURATION_DRAFTS_MIGRATION_ID]
    );
    const [prerequisiteRows] = await connection.execute(
      `SELECT TABLE_NAME AS table_name FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_configuration'`
    );
    if (!prerequisiteRows.length) {
      throw new Error(`Apply ${WEBSITE_CONFIGURATION_MIGRATION_ID} before ${WEBSITE_CONFIGURATION_DRAFTS_MIGRATION_ID}.`);
    }

    const [existingTables] = await connection.execute(
      `SELECT TABLE_NAME AS table_name FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_configuration_drafts'`
    );
    const [existingColumns] = await connection.execute(
      `SELECT COLUMN_NAME AS column_name FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_configuration_drafts'`
    );
    const existingColumnNames = new Set(existingColumns.map(({ column_name }) => column_name));
    if (
      existingTables.length
      && WEBSITE_CONFIGURATION_DRAFTS_COLUMNS.some((column) => !existingColumnNames.has(column))
    ) {
      throw new Error(`The site_configuration_drafts table does not match migration ${WEBSITE_CONFIGURATION_DRAFTS_MIGRATION_ID}.`);
    }

    const statements = (await readFile(WEBSITE_CONFIGURATION_DRAFTS_MIGRATION_FILE, 'utf8'))
      .split(';').map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) await connection.execute(statement);

    const [verifiedTables] = await connection.execute(
      `SELECT TABLE_NAME AS table_name FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_configuration_drafts'`
    );
    const [verifiedColumns] = await connection.execute(
      `SELECT COLUMN_NAME AS column_name FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'site_configuration_drafts'`
    );
    const verifiedColumnNames = new Set(verifiedColumns.map(({ column_name }) => column_name));
    if (
      !verifiedTables.length
      || WEBSITE_CONFIGURATION_DRAFTS_COLUMNS.some((column) => !verifiedColumnNames.has(column))
    ) {
      throw new Error(`The site_configuration_drafts table does not match migration ${WEBSITE_CONFIGURATION_DRAFTS_MIGRATION_ID}.`);
    }

    if (!appliedRows.length) {
      await connection.execute(
        'INSERT INTO schema_migrations (migration_id) VALUES (?)',
        [WEBSITE_CONFIGURATION_DRAFTS_MIGRATION_ID]
      );
    }
    return {
      applied: !appliedRows.length,
      migrationId: WEBSITE_CONFIGURATION_DRAFTS_MIGRATION_ID
    };
  } finally {
    await connection.execute("SELECT RELEASE_LOCK('startuptn_news_schema_migrations')");
  }
}

export async function runYouTubeVideoCatalogMigration(connection) {
  const [lockRows] = await connection.execute(
    "SELECT GET_LOCK('startuptn_news_schema_migrations', 30) AS acquired"
  );
  if (Number(lockRows[0]?.acquired) !== 1) {
    throw new Error('Could not acquire the database migration lock.');
  }

  try {
    const [appliedRows] = await connection.execute(
      'SELECT migration_id FROM schema_migrations WHERE migration_id = ? LIMIT 1',
      [YOUTUBE_VIDEO_CATALOG_MIGRATION_ID]
    );
    const [tableRows] = await connection.execute(
      `SELECT TABLE_NAME AS table_name FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'media_videos'`
    );
    if (!tableRows.length) {
      throw new Error(`The media_videos table is missing; apply ${CONTENT_MANAGEMENT_MIGRATION_ID} first.`);
    }

    const [columnRows] = await connection.execute(
      `SELECT COLUMN_NAME AS column_name FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'media_videos'`
    );
    const columns = new Set(columnRows.map(({ column_name }) => column_name));
    const [indexRows] = await connection.execute(
      `SELECT INDEX_NAME AS index_name FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'media_videos'
       GROUP BY INDEX_NAME`
    );
    const indexes = new Set(indexRows.map(({ index_name }) => index_name));

    if (!indexes.has('uq_media_videos_provider_embed')) {
      const [duplicates] = await connection.execute(
        `SELECT provider, embed_id FROM media_videos
         GROUP BY provider, embed_id HAVING COUNT(*) > 1 LIMIT 1`
      );
      if (duplicates.length) {
        throw new Error(
          `Duplicate video provider/IDs must be reviewed before applying ${YOUTUBE_VIDEO_CATALOG_MIGRATION_ID}.`
        );
      }
    }
    if (!columns.has('is_featured')) {
      await connection.execute(
        'ALTER TABLE media_videos ADD COLUMN is_featured TINYINT(1) NOT NULL DEFAULT 0 AFTER category'
      );
    }
    if (!indexes.has('uq_media_videos_provider_embed')) {
      await connection.execute(
        'ALTER TABLE media_videos ADD UNIQUE KEY uq_media_videos_provider_embed (provider, embed_id)'
      );
    }
    if (!indexes.has('idx_media_videos_category_status_published')) {
      await connection.execute(
        'ALTER TABLE media_videos ADD KEY idx_media_videos_category_status_published (category, status, published_at)'
      );
    }

    const [verifiedColumns] = await connection.execute(
      `SELECT COLUMN_NAME AS column_name FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'media_videos'`
    );
    const [verifiedIndexes] = await connection.execute(
      `SELECT INDEX_NAME AS index_name FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'media_videos'
       GROUP BY INDEX_NAME`
    );
    const verifiedColumnNames = new Set(verifiedColumns.map(({ column_name }) => column_name));
    const verifiedIndexNames = new Set(verifiedIndexes.map(({ index_name }) => index_name));
    if (
      !verifiedColumnNames.has('is_featured')
      || YOUTUBE_VIDEO_CATALOG_INDEXES.some((name) => !verifiedIndexNames.has(name))
    ) {
      throw new Error(`The media_videos table does not match ${YOUTUBE_VIDEO_CATALOG_MIGRATION_ID}.`);
    }

    if (!appliedRows.length) {
      await connection.execute(
        'INSERT INTO schema_migrations (migration_id) VALUES (?)',
        [YOUTUBE_VIDEO_CATALOG_MIGRATION_ID]
      );
    }
    return {
      applied: !appliedRows.length,
      migrationId: YOUTUBE_VIDEO_CATALOG_MIGRATION_ID
    };
  } finally {
    await connection.execute("SELECT RELEASE_LOCK('startuptn_news_schema_migrations')");
  }
}

export async function runAdminActivityReportsMigration(connection) {
  const [lockRows] = await connection.execute(
    "SELECT GET_LOCK('startuptn_news_schema_migrations', 30) AS acquired"
  );
  if (Number(lockRows[0]?.acquired) !== 1) {
    throw new Error('Could not acquire the database migration lock.');
  }

  try {
    const [appliedRows] = await connection.execute(
      'SELECT migration_id FROM schema_migrations WHERE migration_id = ? LIMIT 1',
      [ADMIN_ACTIVITY_MIGRATION_ID]
    );
    const [tableRows] = await connection.execute(
      `SELECT TABLE_NAME AS table_name FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_activity_logs'`
    );
    if (!tableRows.length) {
      if (appliedRows.length) {
        throw new Error(`Migration ${ADMIN_ACTIVITY_MIGRATION_ID} is recorded but its table is missing.`);
      }
      const migrationSql = await readFile(ADMIN_ACTIVITY_MIGRATION_FILE, 'utf8');
      await connection.execute(migrationSql.trim().replace(/;$/, ''));
    }

    const [columnRows] = await connection.execute(
      `SELECT COLUMN_NAME AS column_name FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_activity_logs'`
    );
    const columns = new Set(columnRows.map(({ column_name }) => column_name));
    const [indexRows] = await connection.execute(
      `SELECT INDEX_NAME AS index_name FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_activity_logs'
       GROUP BY INDEX_NAME`
    );
    const indexes = new Set(indexRows.map(({ index_name }) => index_name));
    if (
      ADMIN_ACTIVITY_COLUMNS.some((column) => !columns.has(column))
      || ADMIN_ACTIVITY_INDEXES.some((index) => !indexes.has(index))
    ) {
      throw new Error(`The admin_activity_logs table does not match ${ADMIN_ACTIVITY_MIGRATION_ID}.`);
    }

    if (!appliedRows.length) {
      await connection.execute(
        'INSERT INTO schema_migrations (migration_id) VALUES (?)',
        [ADMIN_ACTIVITY_MIGRATION_ID]
      );
    }
    return {
      applied: !appliedRows.length,
      migrationId: ADMIN_ACTIVITY_MIGRATION_ID
    };
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
      await runModuleCatalogMigration(connection),
      await runCustomRolesMigration(connection),
      await runRoleBuilderMigration(connection),
      await runContentManagementMigration(connection),
      await runWebsiteConfigurationMigration(connection),
      await runWebsiteConfigurationDraftsMigration(connection),
      await runYouTubeVideoCatalogMigration(connection),
      await runAdminActivityReportsMigration(connection)
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
