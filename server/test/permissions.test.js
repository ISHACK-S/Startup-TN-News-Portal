import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import request from 'supertest';
import {
  BUILT_IN_ROLES,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  PERMISSION_ROLE_KEYS
} from '../src/permissions/registry.js';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
process.env.MYSQL_HOST = '127.0.0.1';
process.env.MYSQL_PORT = '3306';
process.env.MYSQL_DATABASE = 'startuptn_test';
process.env.MYSQL_USER = 'test';
process.env.MYSQL_PASSWORD = 'test';
process.env.MYSQL_SSL = 'false';

let express;
let requirePermission;
let errorHandler;
let listPermissionModules;
let listPermissionRoles;
let resolvePermissionsForAdmin;
let resolvePermissionForAdmin;
let updateModuleActivation;
let updateRolePermissions;
let createCustomRole;
let updateCustomRole;
let deleteCustomRole;
let getRoleDetails;
let updateAccountPermissionOverrides;
let removeAccountPermissionOverride;
let adminPermissionsRouter;
let adminAccessControlRouter;

const protectedModules = new Set([
  'access-control', 'user-management', 'role-builder', 'branding-theme-editor',
  'menu-management', 'footer-management', 'seo-management'
]);

before(async () => {
  const [expressModule, middleware, errorModule, permissionService, permissionsRouter, accessRouter] = await Promise.all([
    import('express'),
    import('../src/middleware/require-admin.js'),
    import('../src/middleware/error-handler.js'),
    import('../src/services/permissions.service.js'),
    import('../src/routes/admin-permissions.routes.js'),
    import('../src/routes/admin-access-control.routes.js')
  ]);
  express = expressModule.default;
  ({ requirePermission } = middleware);
  ({ errorHandler } = errorModule);
  ({
    listPermissionModules,
    listPermissionRoles,
    resolvePermissionsForAdmin,
    resolvePermissionForAdmin,
    updateModuleActivation,
    updateRolePermissions,
    createCustomRole,
    updateCustomRole,
    deleteCustomRole,
    getRoleDetails,
    updateAccountPermissionOverrides,
    removeAccountPermissionOverride
  } = permissionService);
  ({ adminPermissionsRouter } = permissionsRouter);
  ({ adminAccessControlRouter } = accessRouter);
});

function createPermissionDatabase() {
  const state = {
    modules: new Map(PERMISSION_MODULES.map((module) => [module.id, {
      module_id: module.id,
      label: module.label,
      description: `${module.label} module.`,
      navigation_group: module.group,
      is_available: module.available || module.id === 'role-builder' ? 1 : 0,
      is_active: module.available || module.id === 'role-builder' ? 1 : 0
    }])),
    admins: [
      { id: 1, name: 'Super Admin', email: 'super@example.com', role: 'Super Admin', is_active: 1, auth_version: 0 },
      { id: 2, name: 'News Admin', email: 'news@example.com', role: 'Admin', is_active: 1, auth_version: 0 },
      { id: 3, name: 'Limited Admin', email: 'limited@example.com', role: 'Admin', is_active: 1, auth_version: 0 }
    ],
    rolePermissions: new Map(),
    overrides: new Map(),
    audits: [],
    sessionsInvalidated: [],
    roleRows: new Set(PERMISSION_ROLE_KEYS),
    roles: new Map([
      ['admin', { role_key: 'admin', label: 'Admin', description: '', is_builtin: 1, is_active: 1 }],
      ['super-admin', { role_key: 'super-admin', label: 'Super Admin', description: '', is_builtin: 1, is_active: 1 }]
    ]),
    failPermissionRead: false
  };
  const roleKey = (role) => BUILT_IN_ROLES[role]
    ?? [...state.roles.values()].find((item) => item.label === role)?.role_key;
  const permissionsFor = (role, moduleId, actionId) => (
    role === 'Super Admin'
    || (moduleId === 'overview' && actionId === 'view')
    || (moduleId === 'news-articles'
      && ['view', 'create', 'edit', 'publish', 'delete', 'manage'].includes(actionId))
  );
  const limitFor = (roleKeyValue, moduleId, actionId) => (
    roleKeyValue === 'super-admin'
    || (!protectedModules.has(moduleId) && actionId !== 'configure')
  );

  const database = {
    async execute(sql, values = []) {
      if (state.failPermissionRead && sql.startsWith('SELECT modules.module_id')) {
        return [[]];
      }
      if (sql.startsWith('SELECT modules.module_id')) {
        const [matrixRoleKey, , adminId] = values;
        const role = state.roles.get(matrixRoleKey)?.label;
        const isBuiltInRole = Boolean(state.roles.get(matrixRoleKey)?.is_builtin);
        const accountOverrides = [...state.overrides.entries()]
          .filter(([key]) => key.startsWith(`${adminId}:`));
        const overrideMap = new Map(accountOverrides.map(([key, isAllowed]) => [
          key.slice(String(adminId).length + 1),
          isAllowed
        ]));
        return [[...state.modules.values()].flatMap((module) => PERMISSION_ACTIONS.map((actionId) => {
          const permissionKey = `${module.module_id}:${actionId}`;
          return {
            ...module,
            action_id: actionId,
            max_allowed: (matrixRoleKey === 'super-admin'
              || (isBuiltInRole && limitFor(matrixRoleKey, module.module_id, actionId))
              || (!isBuiltInRole && !protectedModules.has(module.module_id) && actionId !== 'configure')) ? 1 : 0,
            is_allowed: (state.rolePermissions.get(`${matrixRoleKey}:${module.module_id}:${actionId}`)
              ?? (isBuiltInRole && permissionsFor(role, module.module_id, actionId))) ? 1 : 0,
            override_allowed: overrideMap.has(permissionKey)
              ? (overrideMap.get(permissionKey) ? 1 : 0)
              : null
          };
        }))];
      }
      if (sql.startsWith('SELECT module_id, label, description, navigation_group')) {
        return [[...state.modules.values()]];
      }
      if (sql.startsWith('SELECT roles.role_key, roles.label')) {
        if (sql.includes('WHERE roles.role_key = ?')) {
          const role = state.roles.get(values[0]);
          return [[role ? {
            ...role,
            assigned_count: state.admins.filter((admin) => admin.role === role.label).length
          } : undefined].filter(Boolean)];
        }
        return [[...state.roles.values()].map((role) => ({
          ...role,
          assigned_count: state.admins.filter((admin) => admin.role === role.label).length
        }))];
      }
      if (sql.startsWith('SELECT role_key, label, description, is_builtin, is_active')) {
        const role = state.roles.get(values[0]);
        return [[role ? { ...role } : undefined].filter(Boolean)];
      }
      if (sql.startsWith('SELECT role_key, is_active FROM permission_roles WHERE label = ?')) {
        const role = [...state.roles.values()].find((item) => item.label === values[0]);
        return [[role ? { role_key: role.role_key, is_active: role.is_active } : undefined].filter(Boolean)];
      }
      if (sql.startsWith('SELECT role_key FROM permission_roles WHERE role_key = ? OR label = ?')) {
        return [[...state.roles.values()]
          .filter((role) => role.role_key === values[0] || role.label === values[1])
          .map(({ role_key }) => ({ role_key }))];
      }
      if (sql.startsWith('SELECT role_key FROM permission_roles WHERE label = ? AND role_key <> ?')) {
        return [[...state.roles.values()]
          .filter((role) => role.label === values[0] && role.role_key !== values[1])
          .map(({ role_key }) => ({ role_key }))];
      }
      if (sql.startsWith('SELECT id FROM admins WHERE role = ? ORDER BY id')) {
        return [[...state.admins.filter((admin) => admin.role === values[0]).map(({ id }) => ({ id }))]];
      }
      if (sql.startsWith('SELECT id, role, is_active FROM admins ORDER BY id FOR UPDATE')) {
        return [[...state.admins.map((admin) => ({ ...admin }))]];
      }
      if (sql.startsWith('SELECT id, role, is_active FROM admins WHERE id = ?')) {
        const admin = state.admins.find((row) => String(row.id) === String(values[0]));
        return [[admin ? { ...admin } : undefined].filter(Boolean)];
      }
      if (
        sql.startsWith('SELECT id, name, username, email, role, is_active, auth_version')
        && sql.includes('FROM admins WHERE id = ?')
      ) {
        const admin = state.admins.find((row) => String(row.id) === String(values[0]));
        return [[admin ? { ...admin } : undefined].filter(Boolean)];
      }
      if (sql.startsWith('SELECT role_key FROM permission_roles')) {
        return [[state.roles.has(values[0]) ? { role_key: values[0] } : undefined].filter(Boolean)];
      }
      if (sql.startsWith('SELECT module_id, is_available, is_active')) {
        const module = state.modules.get(values[0]);
        return [[module ? { ...module } : undefined].filter(Boolean)];
      }
      if (sql.startsWith('SELECT max_allowed FROM role_permission_limits')) {
        const [role, moduleId, actionId] = values;
        return [[{ max_allowed: limitFor(role, moduleId, actionId) ? 1 : 0 }]];
      }
      if (
        sql.startsWith('SELECT module_id, action_id, is_allowed')
        && sql.includes('FROM account_permission_overrides WHERE admin_id = ?')
      ) {
        return [[...state.overrides.entries()]
          .filter(([key]) => key.startsWith(`${values[0]}:`))
          .map(([key, isAllowed]) => {
            const [module_id, action_id] = key.slice(String(values[0]).length + 1).split(':');
            return { module_id, action_id, is_allowed: isAllowed ? 1 : 0 };
          })];
      }
      if (sql.startsWith('UPDATE permission_modules SET is_active')) {
        state.modules.get(values[1]).is_active = values[0];
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('INSERT INTO role_module_permissions')) {
        if (sql.includes('SELECT ?, module_id, action_id, 0')) {
          const roleKeyValue = values[0];
          for (const module of state.modules.values()) {
            for (const actionId of PERMISSION_ACTIONS) {
              state.rolePermissions.set(`${roleKeyValue}:${module.module_id}:${actionId}`, false);
            }
          }
          return [{ affectedRows: PERMISSION_MODULES.length * PERMISSION_ACTIONS.length }];
        }
        const [role, moduleId, actionId, isAllowed] = values;
        state.rolePermissions.set(`${role}:${moduleId}:${actionId}`, Boolean(isAllowed));
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('INSERT INTO permission_roles')) {
        const [role_key, label, description, is_active] = values;
        state.roles.set(role_key, {
          role_key, label, description, is_builtin: 0, is_active
        });
        state.roleRows.add(role_key);
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('INSERT INTO role_permission_limits')) {
        return [{ affectedRows: PERMISSION_MODULES.length * PERMISSION_ACTIONS.length }];
      }
      if (sql.startsWith('UPDATE permission_roles SET label = ?, description = ?, is_active = ?')) {
        const [label, description, is_active, role_key] = values;
        Object.assign(state.roles.get(role_key), { label, description, is_active });
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE admins SET role = ?, auth_version = auth_version + 1 WHERE role = ?')) {
        const [newRole, oldRole] = values;
        for (const admin of state.admins.filter((item) => item.role === oldRole)) {
          admin.role = newRole;
          admin.auth_version += 1;
        }
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE admins SET auth_version = auth_version + 1 WHERE role = ?')) {
        for (const admin of state.admins.filter((item) => item.role === values[0])) admin.auth_version += 1;
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('DELETE FROM role_module_permissions WHERE role_key = ?')) {
        for (const key of state.rolePermissions.keys()) {
          if (key.startsWith(`${values[0]}:`)) state.rolePermissions.delete(key);
        }
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('DELETE FROM role_permission_limits WHERE role_key = ?')) {
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('DELETE FROM permission_roles WHERE role_key = ?')) {
        state.roles.delete(values[0]);
        state.roleRows.delete(values[0]);
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('INSERT INTO account_permission_overrides')) {
        const [adminId, moduleId, actionId, isAllowed] = values;
        state.overrides.set(`${adminId}:${moduleId}:${actionId}`, Boolean(isAllowed));
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('DELETE FROM account_permission_overrides')) {
        const [adminId, moduleId, actionId] = values;
        const deleted = state.overrides.delete(`${adminId}:${moduleId}:${actionId}`);
        return [{ affectedRows: deleted ? 1 : 0 }];
      }
      if (sql.startsWith('UPDATE admins SET auth_version = auth_version + 1')) {
        const admin = state.admins.find((row) => String(row.id) === String(values[0]));
        admin.auth_version += 1;
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('DELETE FROM admin_sessions')) {
        state.sessionsInvalidated.push(values[0]);
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('INSERT INTO admin_permission_audit')) {
        state.audits.push({
          actor: values[0],
          target: values[1],
          operation: values[2],
          details: JSON.parse(values[3])
        });
        return [{ insertId: state.audits.length }];
      }
      throw new Error(`Unexpected SQL in permission test: ${sql}`);
    },
    async beginTransaction() {
      state.transactionSnapshot = {
        modules: structuredClone([...state.modules]),
        rolePermissions: structuredClone([...state.rolePermissions]),
        roles: structuredClone([...state.roles]),
        roleRows: structuredClone([...state.roleRows]),
        overrides: structuredClone([...state.overrides]),
        admins: structuredClone(state.admins),
        audits: structuredClone(state.audits),
        sessionsInvalidated: [...state.sessionsInvalidated]
      };
    },
    async commit() {
      state.transactionSnapshot = null;
    },
    async rollback() {
      const snapshot = state.transactionSnapshot;
      if (!snapshot) return;
      state.modules = new Map(snapshot.modules);
      state.rolePermissions = new Map(snapshot.rolePermissions);
      state.roles = new Map(snapshot.roles);
      state.roleRows = new Set(snapshot.roleRows);
      state.overrides = new Map(snapshot.overrides);
      state.admins = snapshot.admins;
      state.audits = snapshot.audits;
      state.sessionsInvalidated = snapshot.sessionsInvalidated;
      state.transactionSnapshot = null;
    }
  };
  database.state = state;
  return { database, state };
}

function createPermissionApp(database, sessionAdminId) {
  const app = express();
  app.locals.database = database;
  app.use(express.json());
  app.use((request, response, next) => {
    if (sessionAdminId !== undefined) {
      const admin = database.state.admins.find((row) => String(row.id) === String(sessionAdminId));
      request.session = {
        adminId: sessionAdminId,
        authVersion: admin?.auth_version ?? 0,
        destroy(callback) { callback(null); }
      };
    }
    next();
  });
  app.get('/news', requirePermission('news-articles', 'view'), (req, res) => res.sendStatus(204));
  app.get('/stories', requirePermission('web-stories', 'view'), (req, res) => res.sendStatus(204));
  app.get('/planned', requirePermission('web-stories', 'view'), (req, res) => res.sendStatus(204));
  app.use('/access', adminPermissionsRouter);
  app.use('/api/admin/access-control', adminAccessControlRouter);
  app.use('/api/admin/access-control/permissions', adminPermissionsRouter);
  app.use(errorHandler);
  return app;
}

describe('database-backed permission foundation', () => {
  it('registers every required module with stable identifiers and activation/availability state', async () => {
    const { database } = createPermissionDatabase();
    const modules = await listPermissionModules(database);
    assert.deepEqual(PERMISSION_MODULES.map(({ id }) => id), [
      'overview', 'news-articles', 'web-stories', 'hero-slider',
      'video-media', 'media-library', 'user-management', 'role-builder',
      'access-control', 'branding-theme-editor', 'menu-management',
      'footer-management', 'seo-management'
    ]);
    assert.equal(modules.length, 13);
    assert.deepEqual(modules.map((module) => module.moduleId), PERMISSION_MODULES.map(({ id }) => id));
    assert.deepEqual(new Set(modules.map((module) => module.moduleId)), new Set(PERMISSION_MODULES.map(({ id }) => id)));
    assert.deepEqual(new Set(modules.map((module) => module.navigationGroup)), new Set([
      'Dashboard', 'Content Management', 'Media Management', 'Administration', 'Website Management'
    ]));
    assert.equal(modules.some((module) => /citizen|police|helpline|monthly report|portal link|faq/i.test(module.label)), false);
    assert.equal(modules.find((module) => module.moduleId === 'news-articles').implementationStatus, 'implemented');
    assert.equal(modules.find((module) => module.moduleId === 'role-builder').implementationStatus, 'implemented');
    assert.equal(modules.find((module) => module.moduleId === 'web-stories').implementationStatus, 'planned');
    assert.equal(modules.find((module) => module.moduleId === 'web-stories').isActive, false);
  });

  it('grants Admin only existing overview/editorial defaults and preserves full Super Admin defaults', async () => {
    const { database } = createPermissionDatabase();
    const admin = await resolvePermissionsForAdmin('Admin', 2, database);
    const superAdmin = await resolvePermissionsForAdmin('Super Admin', 1, database);
    assert.deepEqual(admin.modules.map((module) => module.moduleId), PERMISSION_MODULES.map(({ id }) => id));
    const article = admin.modules.find((module) => module.moduleId === 'news-articles');
    const future = admin.modules.find((module) => module.moduleId === 'seo-management');
    const superFuture = superAdmin.modules.find((module) => module.moduleId === 'seo-management');

    assert.deepEqual(article.actions, {
      view: true, create: true, edit: true, publish: true, delete: true, manage: true, configure: false
    });
    assert.equal(admin.modules.find((module) => module.moduleId === 'overview').actions.view, true);
    assert.equal(future.roleActions.view, false);
    assert.equal(future.actions.view, false);
    assert.equal(superFuture.roleActions.configure, true);
    assert.equal(superFuture.actions.configure, false);
  });

  it('lists built-in roles and serves current effective permissions to authenticated accounts', async () => {
    const { database } = createPermissionDatabase();
    const roles = await listPermissionRoles(database);
    assert.deepEqual(roles.map((role) => [role.roleKey, role.isEditable]), [
      ['admin', true],
      ['super-admin', false]
    ]);

    const adminApp = createPermissionApp(database, 2);
    const currentPermissions = await request(adminApp).get('/access/me');
    assert.equal(currentPermissions.status, 200);
    assert.equal(currentPermissions.body.data.role, 'Admin');
    assert.equal(
      currentPermissions.body.data.modules.find((module) => module.moduleId === 'news-articles').actions.view,
      true
    );
    assert.equal((await request(createPermissionApp(database)).get('/access/me')).status, 401);
  });

  it('creates custom roles with database-backed permissions, rejects duplicates, and prevents escalation', async () => {
    const { database, state } = createPermissionDatabase();
    const app = createPermissionApp(database, 1);
    const payload = {
      roleKey: 'copy-editor',
      label: 'Copy Editor',
      description: 'Edits newsroom copy.',
      isActive: true,
      permissions: [{ moduleId: 'news-articles', actions: { view: true, edit: true } }]
    };

    const created = await request(app)
      .post('/api/admin/access-control/permissions/roles')
      .send(payload);
    assert.equal(created.status, 201);
    assert.equal(created.body.data.roleKey, 'copy-editor');
    assert.equal(created.body.data.modules.find((module) => module.moduleId === 'news-articles').actions.edit, true);
    assert.equal(created.body.data.modules.find((module) => module.moduleId === 'news-articles').actions.delete, false);
    assert.equal(state.roles.get('copy-editor').is_builtin, 0);
    assert.equal(state.audits[0].operation, 'role.custom.created');

    const duplicate = await request(app)
      .post('/api/admin/access-control/permissions/roles')
      .send({ ...payload, roleKey: 'copy-editor-2' });
    assert.equal(duplicate.status, 409);

    const deniedGrant = await request(app)
      .post('/api/admin/access-control/permissions/roles')
      .send({
        ...payload,
        roleKey: 'access-manager',
        label: 'Access Manager',
        permissions: [{ moduleId: 'access-control', actions: { manage: true } }]
      });
    assert.equal(deniedGrant.status, 403);
    assert.equal(state.roles.has('access-manager'), false);

    const adminCreate = await request(createPermissionApp(database, 2))
      .post('/api/admin/access-control/permissions/roles')
      .send(payload);
    assert.equal(adminCreate.status, 403);
  });

  it('loads and updates custom-role details, invalidates assigned sessions, and blocks assigned or built-in deletion', async () => {
    const { database, state } = createPermissionDatabase();
    await createCustomRole(database, 1, {
      roleKey: 'web-editor',
      label: 'Web Editor',
      description: 'Manages newsroom content.',
      isActive: true,
      permissions: [{ moduleId: 'news-articles', actions: { view: true } }]
    });
    const details = await getRoleDetails('web-editor', database);
    assert.equal(details.description, 'Manages newsroom content.');
    assert.equal(details.assignedCount, 0);

    state.admins[1].role = 'Web Editor';
    const updated = await updateCustomRole(database, 1, 'web-editor', {
      label: 'Senior Web Editor',
      isActive: false
    });
    assert.equal(updated.label, 'Senior Web Editor');
    assert.equal(state.admins[1].role, 'Senior Web Editor');
    assert.equal(state.admins[1].auth_version, 1);
    assert.deepEqual(state.sessionsInvalidated, ['2']);

    await assert.rejects(deleteCustomRole(database, 1, 'web-editor'), /Reassign those accounts in User Management/);
    await assert.rejects(deleteCustomRole(database, 1, 'admin'), /Built-in system roles cannot be deleted/);
    state.admins[1].role = 'Admin';
    assert.deepEqual(await deleteCustomRole(database, 1, 'web-editor'), {
      roleKey: 'web-editor',
      deleted: true
    });
    assert.equal(state.roles.has('web-editor'), false);
  });

  it('rejects custom-role mutations from non-Super Admins and invalid custom role inputs', async () => {
    const { database } = createPermissionDatabase();
    const app = createPermissionApp(database, 2);
    assert.equal((await request(app).post('/api/admin/access-control/permissions/roles').send({
      roleKey: 'reviewer',
      label: 'Reviewer'
    })).status, 403);

    const superAdminApp = createPermissionApp(database, 1);
    assert.equal((await request(superAdminApp).post('/api/admin/access-control/permissions/roles').send({
      roleKey: 'not valid',
      label: 'Reviewer'
    })).status, 400);
  });

  it('allows Admin current-user permission loading through real mounted routers while preserving Super Admin guards', async () => {
    const { database, state } = createPermissionDatabase();
    state.overrides.set('2:overview:create', true);
    const adminApp = createPermissionApp(database, 2);

    const currentPermissions = await request(adminApp)
      .get('/api/admin/access-control/permissions/me');
    assert.equal(currentPermissions.status, 200);
    assert.equal(currentPermissions.body.data.role, 'Admin');
    assert.equal(
      currentPermissions.body.data.modules.find((module) => module.moduleId === 'overview').actions.create,
      true
    );

    assert.equal(
      (await request(adminApp).get('/api/admin/access-control/users')).status,
      403
    );
    assert.equal(
      (await request(adminApp).get('/api/admin/access-control/permissions/roles')).status,
      403
    );

    const superAdminApp = createPermissionApp(database, 1);
    assert.equal(
      (await request(superAdminApp).get('/api/admin/access-control/permissions/me')).status,
      200
    );
    assert.equal(
      (await request(superAdminApp).get('/api/admin/access-control/permissions/roles')).status,
      200
    );
    assert.equal(
      (await request(createPermissionApp(database)).get('/api/admin/access-control/permissions/me')).status,
      401
    );
  });

  it('requires authentication, distinguishes 403, and immediately enforces current permissions', async () => {
    const { database } = createPermissionDatabase();
    const unauthenticated = createPermissionApp(database, undefined);
    const adminApp = createPermissionApp(database, 2);

    assert.equal((await request(unauthenticated).get('/news')).status, 401);
    assert.equal((await request(adminApp).get('/news')).status, 204);
    await updateRolePermissions(database, 1, 'admin', [{
      moduleId: 'news-articles',
      actions: { view: false }
    }]);
    assert.equal((await request(adminApp).get('/news')).status, 403);
    await updateRolePermissions(database, 1, 'admin', [{
      moduleId: 'news-articles',
      actions: { view: true }
    }]);
    assert.equal((await request(adminApp).get('/news')).status, 204);
  });

  it('applies account overrides only within the role ceiling and invalidates target sessions', async () => {
    const { database, state } = createPermissionDatabase();
    const result = await updateAccountPermissionOverrides(database, 1, 2, [{
      moduleId: 'news-articles',
      actionId: 'publish',
      isAllowed: false
    }]);
    assert.equal(result.modules.find((module) => module.moduleId === 'web-stories').actions.view, false);
    assert.equal(result.modules.find((module) => module.moduleId === 'news-articles').actions.publish, false);
    assert.deepEqual(state.sessionsInvalidated, ['2']);
    assert.equal(state.admins[1].auth_version, 1);
    assert.equal(state.audits[0].operation, 'account.permission-overrides.updated');
    await assert.rejects(
      updateAccountPermissionOverrides(database, 1, 2, [{
        moduleId: 'citizen-services',
        actionId: 'configure',
        isAllowed: true
      }]),
      /not supported/
    );
    await removeAccountPermissionOverride(database, 1, 2, 'news-articles', 'publish');
    assert.equal(state.overrides.size, 0);
    assert.deepEqual(state.sessionsInvalidated, ['2', '2']);
  });

  it('rejects role escalation, fixed Super Admin role edits, Super Admin overrides, and invalid identifiers', async () => {
    const { database } = createPermissionDatabase();
    await assert.rejects(
      updateRolePermissions(database, 1, 'admin', [{
        moduleId: 'citizen-services',
        actions: { configure: true }
      }]),
      /not supported/
    );
    await assert.rejects(
      updateRolePermissions(database, 1, 'super-admin', [{
        moduleId: 'news-articles',
        actions: { delete: false }
      }]),
      /fixed to preserve full administrative authority/
    );
    await assert.rejects(
      updateAccountPermissionOverrides(database, 1, 1, [{
        moduleId: 'news-articles',
        actionId: 'delete',
        isAllowed: false
      }]),
      /cannot reduce or alter Super Admin authority/
    );
    await assert.rejects(
      resolvePermissionForAdmin('Owner', 2, 'news-articles', 'view', database),
      /Permission data is unavailable/
    );
    await assert.rejects(
      resolvePermissionForAdmin('Admin', 2, 'unknown-module', 'view', database),
      /module identifier is not supported/
    );
    await assert.rejects(
      resolvePermissionForAdmin('Admin', 2, 'news-articles', 'execute', database),
      /permission action is not supported/
    );
  });

  it('keeps unavailable modules inaccessible and prevents disabling Access Control', async () => {
    const { database, state } = createPermissionDatabase();
    const app = createPermissionApp(database, 1);
    assert.equal((await request(app).get('/planned')).status, 403);
    await assert.rejects(updateModuleActivation(database, 1, 'web-stories', true), /not implemented/);
    await assert.rejects(updateModuleActivation(database, 1, 'access-control', false), /cannot be deactivated/);
    await updateModuleActivation(database, 1, 'news-articles', false);
    assert.equal((await request(app).get('/news')).status, 403);
    assert.ok(state.audits.some((audit) => audit.operation === 'module.activation.updated'));
  });

  it('fails closed when permission data is missing', async () => {
    const { database, state } = createPermissionDatabase();
    state.failPermissionRead = true;
    await assert.rejects(
      resolvePermissionForAdmin('Admin', 2, 'news-articles', 'view', database),
      /Permission data is unavailable/
    );
  });

  it('serves all Super Admin permission endpoints and validates untrusted updates', async () => {
    const { database } = createPermissionDatabase();
    const app = createPermissionApp(database, 1);
    const modules = await request(app).get('/access/modules');
    assert.equal(modules.status, 200);
    assert.equal(modules.body.data.length, 13);

    const rolePermissions = await request(app).get('/access/roles/admin/permissions');
    assert.equal(rolePermissions.status, 200);
    assert.equal(rolePermissions.body.data.roleKey, 'admin');

    const accountPermissions = await request(app).get('/access/accounts/2/permissions');
    assert.equal(accountPermissions.status, 200);
    assert.equal(accountPermissions.body.data.adminId, 2);

    const roles = await request(app).get('/access/roles');
    assert.equal(roles.status, 200);
    assert.deepEqual(roles.body.data.map((role) => role.roleKey), ['admin', 'super-admin']);

    const currentPermissions = await request(app).get('/access/me');
    assert.equal(currentPermissions.status, 200);
    assert.equal(currentPermissions.body.data.role, 'Super Admin');
    assert.equal('authVersion' in currentPermissions.body.data, false);

    const update = await request(app).patch('/access/roles/admin/permissions').send({
      permissions: [{ moduleId: 'news-articles', actions: { delete: false } }]
    });
    assert.equal(update.status, 200);
    assert.equal(update.body.data.modules.find((module) => module.moduleId === 'news-articles').actions.delete, false);

    const override = await request(app).put('/access/accounts/2/overrides').send({
      overrides: [{ moduleId: 'web-stories', actionId: 'view', isAllowed: true }]
    });
    assert.equal(override.status, 200);
    const reset = await request(app).put('/access/accounts/2/overrides').send({
      overrides: [{ moduleId: 'web-stories', actionId: 'view', isAllowed: null }]
    });
    assert.equal(reset.status, 200);
    assert.equal(reset.body.data.modules.find((module) => module.moduleId === 'web-stories').overrides.view, null);
    const removed = await request(app).delete('/access/accounts/2/overrides/web-stories/view');
    assert.equal(removed.status, 200);

    const invalid = await request(app).patch('/access/roles/admin/permissions').send({
      permissions: [{ moduleId: 'future-unknown', actions: { view: true } }]
    });
    assert.equal(invalid.status, 400);
    const unknownField = await request(app).put('/access/accounts/2/overrides').send({
      overrides: [{ moduleId: 'news-articles', actionId: 'view', isAllowed: true, role: 'Super Admin' }]
    });
    assert.equal(unknownField.status, 400);
  });

  it('restricts permission-management endpoints to authenticated Super Admins', async () => {
    const { database } = createPermissionDatabase();
    const unauthenticated = createPermissionApp(database, undefined);
    const admin = createPermissionApp(database, 2);
    assert.equal((await request(unauthenticated).get('/access/modules')).status, 401);
    assert.equal((await request(unauthenticated).get('/access/roles')).status, 401);
    assert.equal((await request(unauthenticated).get('/access/me')).status, 401);
    assert.equal((await request(admin).get('/access/modules')).status, 403);
    assert.equal((await request(admin).get('/access/roles')).status, 403);
    assert.equal((await request(admin).get('/access/me')).status, 200);
    assert.equal((await request(admin).patch('/access/roles/admin/permissions').send({
      permissions: [{ moduleId: 'news-articles', actions: { delete: false } }]
    })).status, 403);
  });
});
