import { pool } from '../database/pool.js';
import { deleteAdminSessions } from '../database/session-store.js';
import { HttpError } from '../errors/http-error.js';
import {
  BUILT_IN_ROLES,
  PERMISSION_ACTIONS,
  PERMISSION_MODULE_IDS,
  PERMISSION_ROLE_KEYS
} from '../permissions/registry.js';

const ACCESS_CONTROL_MODULE = 'access-control';

async function roleKeyFor(role, database) {
  const builtInRoleKey = BUILT_IN_ROLES[role];
  if (builtInRoleKey) return builtInRoleKey;
  const [rows] = await database.execute(
    'SELECT role_key, is_active FROM permission_roles WHERE label = ? LIMIT 1',
    [role]
  );
  if (!rows[0]) {
    throw new HttpError(503, 'Permission data is unavailable.');
  }
  if (Number(rows[0].is_active) !== 1) {
    throw new HttpError(403, 'The assigned administrator role is inactive or unavailable.');
  }
  return rows[0].role_key;
}

function assertKnownModule(moduleId) {
  if (!PERMISSION_MODULE_IDS.includes(moduleId)) {
    throw new HttpError(400, 'The module identifier is not supported.');
  }
}

function assertKnownAction(actionId) {
  if (!PERMISSION_ACTIONS.includes(actionId)) {
    throw new HttpError(400, 'The permission action is not supported.');
  }
}

async function lockAndVerifySuperAdmin(database, actorAdminId) {
  const [rows] = await database.execute(
    'SELECT id, role, is_active FROM admins ORDER BY id FOR UPDATE'
  );
  const actor = rows.find((row) => String(row.id) === String(actorAdminId));
  if (!actor || actor.role !== 'Super Admin' || Number(actor.is_active) !== 1) {
    throw new HttpError(403, 'Super Admin privileges are required.');
  }
  return rows;
}

function withTransaction(operation) {
  return async (database, ...args) => {
    let started = false;
    try {
      await database.beginTransaction();
      started = true;
      const result = await operation(database, ...args);
      await database.commit();
      started = false;
      return result;
    } catch (error) {
      if (started) {
        try {
          await database.rollback();
        } catch {
          throw new Error('The permission update failed and its rollback could not be confirmed.');
        }
      }
      throw error;
    }
  };
}

async function readModuleRows(database) {
  const [rows] = await database.execute(
    `SELECT module_id, label, description, navigation_group, is_available, is_active
     FROM permission_modules ORDER BY navigation_group, module_id`
  );
  return rows;
}

export async function listPermissionModules(database = pool) {
  const rows = await readModuleRows(database);
  if (
    rows.length !== PERMISSION_MODULE_IDS.length
    || PERMISSION_MODULE_IDS.some((moduleId) => !rows.some((row) => row.module_id === moduleId))
  ) {
    throw new HttpError(503, 'Permission data is unavailable.');
  }
  const moduleOrder = new Map(PERMISSION_MODULE_IDS.map((moduleId, index) => [moduleId, index]));
  rows.sort((left, right) => moduleOrder.get(left.module_id) - moduleOrder.get(right.module_id));
  return rows.map((row) => ({
    moduleId: row.module_id,
    label: row.label,
    description: row.description,
    navigationGroup: row.navigation_group,
    isAvailable: Number(row.is_available) === 1,
    isActive: Number(row.is_active) === 1,
    implementationStatus: Number(row.is_available) === 1 ? 'implemented' : 'planned'
  }));
}

export async function listPermissionRoles(database = pool) {
  const [rows] = await database.execute(
    `SELECT roles.role_key, roles.label, roles.description, roles.is_builtin, roles.is_active,
            (SELECT COUNT(*) FROM admins WHERE admins.role = roles.label) AS assigned_count
     FROM permission_roles AS roles ORDER BY roles.is_builtin DESC, roles.label`
  );
  const roles = rows.map((row) => ({
    roleKey: row.role_key,
    label: row.label,
    role: row.label,
    description: row.description,
    isActive: Number(row.is_active) === 1,
    isBuiltIn: Number(row.is_builtin) === 1,
    isEditable: row.role_key !== BUILT_IN_ROLES['Super Admin'],
    assignedCount: Number(row.assigned_count)
  }));
  const builtInRoles = new Set(roles.filter((role) => role.isBuiltIn).map((role) => role.roleKey));
  if (
    PERMISSION_ROLE_KEYS.some((roleKey) => !builtInRoles.has(roleKey))
  ) {
    throw new HttpError(503, 'Permission data is unavailable.');
  }
  if (roles.some((role) => role.isBuiltIn !== PERMISSION_ROLE_KEYS.includes(role.roleKey))) {
    throw new HttpError(503, 'Permission data is inconsistent.');
  }
  return roles;
}

async function readPermissionMatrix(database, roleKey, adminId) {
  const [rows] = await database.execute(
    `SELECT modules.module_id, modules.label, modules.description,
            modules.navigation_group, modules.is_available, modules.is_active,
            actions.action_id, limits.max_allowed, role_permissions.is_allowed,
            overrides.is_allowed AS override_allowed
     FROM permission_modules AS modules
     CROSS JOIN permission_actions AS actions
     LEFT JOIN role_permission_limits AS limits
       ON limits.module_id = modules.module_id
      AND limits.action_id = actions.action_id
      AND limits.role_key = ?
     LEFT JOIN role_module_permissions AS role_permissions
       ON role_permissions.module_id = modules.module_id
      AND role_permissions.action_id = actions.action_id
      AND role_permissions.role_key = ?
     LEFT JOIN account_permission_overrides AS overrides
       ON overrides.module_id = modules.module_id
      AND overrides.action_id = actions.action_id
      AND overrides.admin_id = ?`,
    [roleKey, roleKey, adminId ?? null]
  );

  const expectedRows = PERMISSION_MODULE_IDS.length * PERMISSION_ACTIONS.length;
  if (rows.length !== expectedRows) {
    throw new HttpError(503, 'Permission data is unavailable.');
  }

  const modules = new Map();
  for (const row of rows) {
    if (
      !PERMISSION_MODULE_IDS.includes(row.module_id)
      || !PERMISSION_ACTIONS.includes(row.action_id)
      || row.max_allowed === null
      || row.is_allowed === null
    ) {
      throw new HttpError(503, 'Permission data is unavailable.');
    }
    if (!modules.has(row.module_id)) {
      modules.set(row.module_id, {
        moduleId: row.module_id,
        label: row.label,
        description: row.description,
        navigationGroup: row.navigation_group,
        isAvailable: Number(row.is_available) === 1,
        isActive: Number(row.is_active) === 1,
        roleActions: {},
        limits: {},
        overrides: {},
        actions: {}
      });
    }

    const module = modules.get(row.module_id);
    const roleAllowed = Number(row.is_allowed) === 1;
    const maxAllowed = Number(row.max_allowed) === 1;
    const override = row.override_allowed === null || row.override_allowed === undefined
      ? null
      : Number(row.override_allowed) === 1;
    if (!maxAllowed && (roleAllowed || override === true)) {
      throw new HttpError(503, 'Permission data is inconsistent.');
    }
    const granted = override ?? roleAllowed;
    module.roleActions[row.action_id] = roleAllowed;
    module.limits[row.action_id] = maxAllowed;
    module.overrides[row.action_id] = override;
    module.actions[row.action_id] = Boolean(
      granted
      && maxAllowed
      && module.isAvailable
      && module.isActive
    );
  }

  if (modules.size !== PERMISSION_MODULE_IDS.length) {
    throw new HttpError(503, 'Permission data is unavailable.');
  }
  return PERMISSION_MODULE_IDS.map((moduleId) => {
    const module = modules.get(moduleId);
    if (!module) throw new HttpError(503, 'Permission data is unavailable.');
    return {
      ...module,
      implementationStatus: module.isAvailable ? 'implemented' : 'planned',
      isVisible: module.actions.view
    };
  });
}

export async function resolvePermissionsForAdmin(role, adminId, database = pool) {
  const roleKey = await roleKeyFor(role, database);
  const modules = await readPermissionMatrix(database, roleKey, adminId);
  return { role, modules };
}

export async function resolvePermissionForAdmin(role, adminId, moduleId, actionId, database = pool) {
  assertKnownModule(moduleId);
  assertKnownAction(actionId);
  const permissions = await resolvePermissionsForAdmin(role, adminId, database);
  return Boolean(permissions.modules.find((module) => module.moduleId === moduleId)?.actions[actionId]);
}

export async function getRolePermissions(roleKey, database = pool) {
  const [roleRows] = await database.execute(
    'SELECT role_key, label, description, is_builtin, is_active FROM permission_roles WHERE role_key = ? LIMIT 1',
    [roleKey]
  );
  const roleData = roleRows[0];
  if (!roleData) throw new HttpError(404, 'The role was not found.');
  const modules = await readPermissionMatrix(database, roleKey, null);
  return {
    roleKey,
    role: roleData.label,
    label: roleData.label,
    description: roleData.description,
    isBuiltIn: Number(roleData.is_builtin) === 1,
    isActive: Number(roleData.is_active) === 1,
    modules
  };
}

export async function getRoleDetails(roleKey, database = pool) {
  const [rows] = await database.execute(
    `SELECT roles.role_key, roles.label, roles.description, roles.is_builtin, roles.is_active,
            (SELECT COUNT(*) FROM admins WHERE admins.role = roles.label) AS assigned_count
     FROM permission_roles AS roles WHERE roles.role_key = ? LIMIT 1`,
    [roleKey]
  );
  const role = rows[0];
  if (!role) throw new HttpError(404, 'The role was not found.');
  return {
    roleKey: role.role_key,
    label: role.label,
    description: role.description,
    isBuiltIn: Number(role.is_builtin) === 1,
    isActive: Number(role.is_active) === 1,
    assignedCount: Number(role.assigned_count)
  };
}

export async function getAccountPermissions(adminId, database = pool) {
  const [rows] = await database.execute(
    'SELECT id, role, is_active FROM admins WHERE id = ? LIMIT 1',
    [adminId]
  );
  const admin = rows[0];
  if (!admin) throw new HttpError(404, 'The administrator account was not found.');
  return {
    adminId: admin.id,
    role: admin.role,
    isActive: Number(admin.is_active) === 1,
    ...(await resolvePermissionsForAdmin(admin.role, admin.id, database))
  };
}

export const updateModuleActivation = withTransaction(
  async (database, actorAdminId, moduleId, isActive) => {
    assertKnownModule(moduleId);
    await lockAndVerifySuperAdmin(database, actorAdminId);
    const [rows] = await database.execute(
      `SELECT module_id, is_available, is_active
       FROM permission_modules WHERE module_id = ? LIMIT 1 FOR UPDATE`,
      [moduleId]
    );
    const module = rows[0];
    if (!module) throw new HttpError(404, 'The module was not found.');
    if (
      isActive
      && Number(module.is_available) !== 1
    ) {
      throw new HttpError(409, 'This module is not implemented and cannot be activated.');
    }
    if (moduleId === ACCESS_CONTROL_MODULE && !isActive) {
      throw new HttpError(409, 'Access Control cannot be deactivated.');
    }

    const changed = Number(module.is_active) !== Number(isActive);
    if (changed) {
      await database.execute(
        'UPDATE permission_modules SET is_active = ? WHERE module_id = ?',
        [isActive ? 1 : 0, moduleId]
      );
      await writeAudit(database, actorAdminId, null, 'module.activation.updated', {
        moduleId,
        isActive
      });
    }
    return {
      moduleId,
      isAvailable: Number(module.is_available) === 1,
      isActive,
      changed
    };
  }
);

async function validateRolePermissions(database, roleKey, permissions) {
  const changes = [];
  for (const permission of permissions) {
    assertKnownModule(permission.moduleId);
    for (const [actionId, isAllowed] of Object.entries(permission.actions)) {
      assertKnownAction(actionId);
      const [limitRows] = await database.execute(
        `SELECT max_allowed FROM role_permission_limits
         WHERE role_key = ? AND module_id = ? AND action_id = ? LIMIT 1`,
        [roleKey, permission.moduleId, actionId]
      );
      if (!limitRows[0]) throw new HttpError(503, 'Permission data is unavailable.');
      if (isAllowed && Number(limitRows[0].max_allowed) !== 1) {
        throw new HttpError(403, 'This role cannot be granted that permission.');
      }
      changes.push({ moduleId: permission.moduleId, actionId, isAllowed });
    }
  }
  return changes;
}

async function persistRolePermissions(database, roleKey, changes) {
  for (const change of changes) {
    await database.execute(
      `INSERT INTO role_module_permissions (role_key, module_id, action_id, is_allowed)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE is_allowed = VALUES(is_allowed)`,
      [roleKey, change.moduleId, change.actionId, change.isAllowed ? 1 : 0]
    );
  }
}

async function getRoleRow(database, roleKey, { forUpdate = false } = {}) {
  const [rows] = await database.execute(
    `SELECT role_key, label, description, is_builtin, is_active
     FROM permission_roles WHERE role_key = ? LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [roleKey]
  );
  if (!rows[0]) throw new HttpError(404, 'The role was not found.');
  return rows[0];
}

export const updateRolePermissions = withTransaction(
  async (database, actorAdminId, roleKey, permissions) => {
    const admins = await lockAndVerifySuperAdmin(database, actorAdminId);
    const role = await getRoleRow(database, roleKey, { forUpdate: true });
    if (role.role_key === BUILT_IN_ROLES['Super Admin']) {
      throw new HttpError(400, 'Super Admin permissions are fixed to preserve full administrative authority.');
    }
    const changes = await validateRolePermissions(database, roleKey, permissions);
    await persistRolePermissions(database, roleKey, changes);
    await writeAudit(database, actorAdminId, null, 'role.permissions.updated', {
      roleKey,
      permissions: changes
    });
    return getRolePermissions(roleKey, database);
  }
);

export const createCustomRole = withTransaction(
  async (database, actorAdminId, input) => {
    await lockAndVerifySuperAdmin(database, actorAdminId);
    const [duplicates] = await database.execute(
      'SELECT role_key FROM permission_roles WHERE role_key = ? OR label = ? LIMIT 1 FOR UPDATE',
      [input.roleKey, input.label]
    );
    if (duplicates.length) throw new HttpError(409, 'A role with that name or identifier already exists.');

    await database.execute(
      `INSERT INTO permission_roles (role_key, label, description, is_builtin, is_active)
       VALUES (?, ?, ?, 0, ?)`,
      [input.roleKey, input.label, input.description, input.isActive ? 1 : 0]
    );
    await database.execute(
      `INSERT INTO role_permission_limits (role_key, module_id, action_id, max_allowed)
       SELECT ?, module_id, action_id, max_allowed
       FROM role_permission_limits WHERE role_key = ?`,
      [input.roleKey, BUILT_IN_ROLES.Admin]
    );
    await database.execute(
      `INSERT INTO role_module_permissions (role_key, module_id, action_id, is_allowed)
       SELECT ?, module_id, action_id, 0
       FROM role_permission_limits WHERE role_key = ?`,
      [input.roleKey, input.roleKey]
    );
    const changes = await validateRolePermissions(database, input.roleKey, input.permissions ?? []);
    await persistRolePermissions(database, input.roleKey, changes);
    await writeAudit(database, actorAdminId, null, 'role.custom.created', {
      roleKey: input.roleKey,
      label: input.label,
      description: input.description,
      isActive: input.isActive,
      permissions: changes
    });
    return getRolePermissions(input.roleKey, database);
  }
);

export const updateCustomRole = withTransaction(
  async (database, actorAdminId, roleKey, changes) => {
    const admins = await lockAndVerifySuperAdmin(database, actorAdminId);
    const role = await getRoleRow(database, roleKey, { forUpdate: true });
    if (Number(role.is_builtin) === 1) {
      throw new HttpError(400, 'Built-in system roles cannot be edited as custom roles.');
    }
    const nextLabel = changes.label ?? role.label;
    const nextDescription = changes.description ?? role.description;
    const nextIsActive = changes.isActive ?? Number(role.is_active) === 1;
    const [duplicates] = await database.execute(
      'SELECT role_key FROM permission_roles WHERE label = ? AND role_key <> ? LIMIT 1 FOR UPDATE',
      [nextLabel, roleKey]
    );
    if (duplicates.length) throw new HttpError(409, 'A role with that name already exists.');

    const [assignedAdmins] = await database.execute(
      'SELECT id FROM admins WHERE role = ? ORDER BY id FOR UPDATE',
      [role.label]
    );
    await database.execute(
      'UPDATE permission_roles SET label = ?, description = ?, is_active = ? WHERE role_key = ?',
      [nextLabel, nextDescription, nextIsActive ? 1 : 0, roleKey]
    );

    const identityOrStatusChanged = nextLabel !== role.label
      || nextIsActive !== (Number(role.is_active) === 1);
    if (identityOrStatusChanged && assignedAdmins.length) {
      if (nextLabel !== role.label) {
        await database.execute(
          'UPDATE admins SET role = ?, auth_version = auth_version + 1 WHERE role = ?',
          [nextLabel, role.label]
        );
      } else {
        await database.execute(
          'UPDATE admins SET auth_version = auth_version + 1 WHERE role = ?',
          [role.label]
        );
      }
      for (const assignedAdmin of assignedAdmins) {
        await deleteAdminSessions(database, assignedAdmin.id);
      }
    }

    let permissionChanges = [];
    if (changes.permissions) {
      permissionChanges = await validateRolePermissions(database, roleKey, changes.permissions);
      await persistRolePermissions(database, roleKey, permissionChanges);
    }
    await writeAudit(database, actorAdminId, null, 'role.custom.updated', {
      roleKey,
      previousLabel: role.label,
      label: nextLabel,
      description: nextDescription,
      isActive: nextIsActive,
      permissions: permissionChanges
    });
    return getRolePermissions(roleKey, database);
  }
);

export const deleteCustomRole = withTransaction(
  async (database, actorAdminId, roleKey) => {
    await lockAndVerifySuperAdmin(database, actorAdminId);
    const role = await getRoleRow(database, roleKey, { forUpdate: true });
    if (Number(role.is_builtin) === 1) {
      throw new HttpError(400, 'Built-in system roles cannot be deleted.');
    }
    const [assignedAdmins] = await database.execute(
      'SELECT id FROM admins WHERE role = ? ORDER BY id FOR UPDATE',
      [role.label]
    );
    if (assignedAdmins.length) {
      throw new HttpError(
        409,
        `This role is assigned to ${assignedAdmins.length} administrator account(s). Reassign those accounts in User Management before deleting the role.`
      );
    }
    await writeAudit(database, actorAdminId, null, 'role.custom.deleted', {
      roleKey,
      label: role.label
    });
    await database.execute('DELETE FROM role_module_permissions WHERE role_key = ?', [roleKey]);
    await database.execute('DELETE FROM role_permission_limits WHERE role_key = ?', [roleKey]);
    await database.execute('DELETE FROM permission_roles WHERE role_key = ?', [roleKey]);
    return { roleKey, deleted: true };
  }
);

export const updateAccountPermissionOverrides = withTransaction(
  async (database, actorAdminId, adminId, overrides) => {
    const accounts = await lockAndVerifySuperAdmin(database, actorAdminId);
    const target = accounts.find((row) => String(row.id) === String(adminId));
    if (!target) throw new HttpError(404, 'The administrator account was not found.');
    const roleKey = await roleKeyFor(target.role, database);
    if (target.role === 'Super Admin') {
      throw new HttpError(400, 'Account-specific overrides cannot reduce or alter Super Admin authority.');
    }

    const changes = [];
    for (const override of overrides) {
      assertKnownModule(override.moduleId);
      assertKnownAction(override.actionId);
      const [limitRows] = await database.execute(
        `SELECT max_allowed FROM role_permission_limits
         WHERE role_key = ? AND module_id = ? AND action_id = ? LIMIT 1`,
        [roleKey, override.moduleId, override.actionId]
      );
      if (!limitRows[0]) throw new HttpError(503, 'Permission data is unavailable.');
      if (override.isAllowed === true && Number(limitRows[0].max_allowed) !== 1) {
        throw new HttpError(403, 'This account cannot be granted that permission.');
      }
      changes.push(override);
    }

    const [existingRows] = await database.execute(
      `SELECT module_id, action_id, is_allowed
       FROM account_permission_overrides WHERE admin_id = ? FOR UPDATE`,
      [adminId]
    );
    const existing = new Map(existingRows.map((row) =>
      [`${row.module_id}:${row.action_id}`, Number(row.is_allowed) === 1]
    ));
    const changed = changes.filter((change) => {
      const key = `${change.moduleId}:${change.actionId}`;
      const previous = existing.has(key) ? existing.get(key) : null;
      return previous !== change.isAllowed;
    });

    for (const change of changed) {
      if (change.isAllowed === null) {
        await database.execute(
          `DELETE FROM account_permission_overrides
           WHERE admin_id = ? AND module_id = ? AND action_id = ?`,
          [adminId, change.moduleId, change.actionId]
        );
      } else {
        await database.execute(
          `INSERT INTO account_permission_overrides (admin_id, module_id, action_id, is_allowed)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE is_allowed = VALUES(is_allowed)`,
          [adminId, change.moduleId, change.actionId, change.isAllowed ? 1 : 0]
        );
      }
    }
    if (changed.length) {
      await database.execute(
        'UPDATE admins SET auth_version = auth_version + 1 WHERE id = ?',
        [adminId]
      );
      await deleteAdminSessions(database, adminId);
      await writeAudit(database, actorAdminId, adminId, 'account.permission-overrides.updated', {
        overrides: changed
      });
    }
    return {
      adminId: target.id,
      changed: changed.length > 0,
      ...(await resolvePermissionsForAdmin(target.role, target.id, database))
    };
  }
);

export const removeAccountPermissionOverride = withTransaction(
  async (database, actorAdminId, adminId, moduleId, actionId) => {
    assertKnownModule(moduleId);
    assertKnownAction(actionId);
    const accounts = await lockAndVerifySuperAdmin(database, actorAdminId);
    const target = accounts.find((row) => String(row.id) === String(adminId));
    if (!target) throw new HttpError(404, 'The administrator account was not found.');
    if (target.role === 'Super Admin') {
      throw new HttpError(400, 'Account-specific overrides cannot reduce or alter Super Admin authority.');
    }

    const [deleteResult] = await database.execute(
      `DELETE FROM account_permission_overrides
       WHERE admin_id = ? AND module_id = ? AND action_id = ?`,
      [adminId, moduleId, actionId]
    );
    const changed = deleteResult.affectedRows > 0;
    if (changed) {
      await database.execute(
        'UPDATE admins SET auth_version = auth_version + 1 WHERE id = ?',
        [adminId]
      );
      await deleteAdminSessions(database, adminId);
      await writeAudit(database, actorAdminId, adminId, 'account.permission-override.removed', {
        moduleId,
        actionId
      });
    }
    return {
      adminId: target.id,
      moduleId,
      actionId,
      changed,
      ...(await resolvePermissionsForAdmin(target.role, target.id, database))
    };
  }
);

async function writeAudit(database, actorAdminId, targetAdminId, operation, details) {
  await database.execute(
    `INSERT INTO admin_permission_audit
       (actor_admin_id, target_admin_id, operation, details)
     VALUES (?, ?, ?, ?)`,
    [actorAdminId, targetAdminId, operation, JSON.stringify(details)]
  );
}

export function validatePermissionAction(moduleId, actionId) {
  assertKnownModule(moduleId);
  assertKnownAction(actionId);
}
