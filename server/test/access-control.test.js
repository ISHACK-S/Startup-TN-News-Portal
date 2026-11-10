import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { before, describe, it } from 'node:test';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
process.env.MYSQL_HOST = '127.0.0.1';
process.env.MYSQL_PORT = '3306';
process.env.MYSQL_DATABASE = 'startuptn_test';
process.env.MYSQL_USER = 'test';
process.env.MYSQL_PASSWORD = 'test';
process.env.MYSQL_SSL = 'false';

let express;
let adminAccessControlRouter;
let errorHandler;
let updateAdminAuthorization;

before(async () => {
  const [expressModule, routerModule, errorModule, authService] = await Promise.all([
    import('express'),
    import('../src/routes/admin-access-control.routes.js'),
    import('../src/middleware/error-handler.js'),
    import('../src/services/auth.service.js')
  ]);
  express = expressModule.default;
  ({ adminAccessControlRouter } = routerModule);
  ({ errorHandler } = errorModule);
  ({ updateAdminAuthorization } = authService);
});

function account(id, role = 'Admin', isActive = 1) {
  return {
    id: String(id),
    name: `Admin ${id}`,
    username: `admin${id}`,
    email: `admin${id}@example.com`,
    password_hash: `private-hash-${id}`,
    role,
    is_active: isActive,
    auth_version: 0,
    created_at: '2026-01-02T03:04:05.000Z'
  };
}

function createAccessControlApp({
  admins = [account(1, 'Super Admin'), account(2)],
  customRoles = [],
  failList = false,
  failUpdate = false,
  failCreate = false
} = {}) {
  const state = {
    admins: structuredClone(admins),
    roles: [
      { role_key: 'admin', label: 'Admin', is_active: 1 },
      { role_key: 'super-admin', label: 'Super Admin', is_active: 1 },
      ...structuredClone(customRoles)
    ],
    sessionsInvalidatedFor: [],
    failList,
    failUpdate,
    failCreate,
    rollbacks: 0,
    commits: 0
  };
  let transactionTail = Promise.resolve();
  const database = {
    async execute(sql, values = []) {
      if (sql.includes('FROM admins WHERE id = ? LIMIT 1')) {
        const admin = state.admins.find((row) => row.id === String(values[0]));
        return [[admin ? { ...admin } : undefined].filter(Boolean)];
      }
      if (sql.startsWith('SELECT role_key, is_active FROM permission_roles WHERE label = ?')) {
        const role = state.roles.find(({ label }) => label === values[0]);
        return [[role].filter(Boolean)];
      }
      if (state.failList && sql.startsWith('SELECT COUNT(*) AS total FROM admins')) {
        throw new Error('simulated database failure');
      }
      if (sql.startsWith('SELECT COUNT(*) AS total FROM admins')) {
        const filtered = searchAccounts(state.admins, values[0]);
        return [[{ total: filtered.length }]];
      }
      if (sql.includes('FROM admins ORDER BY id FOR UPDATE')) {
        return [[...state.admins].sort((a, b) => Number(a.id) - Number(b.id)).map((row) => ({ ...row }))];
      }
      if (sql.startsWith('SELECT id FROM admins WHERE username = ? LIMIT 1 FOR UPDATE')) {
        const admin = state.admins.find((row) => row.username === values[0]);
        return [[admin ? { id: admin.id } : undefined].filter(Boolean)];
      }
      if (sql.startsWith('SELECT id FROM admins WHERE email = ? LIMIT 1 FOR UPDATE')) {
        const admin = state.admins.find((row) => row.email === values[0]);
        return [[admin ? { id: admin.id } : undefined].filter(Boolean)];
      }
      if (
        sql.startsWith('SELECT id, name, username, email, role, is_active, created_at')
        && sql.includes('WHERE id = ?')
      ) {
        const admin = state.admins.find((row) => row.id === String(values[0]));
        return [[admin ? { ...admin } : undefined].filter(Boolean)];
      }
      if (sql.startsWith('SELECT id, name, username, email, role, is_active, created_at')) {
        const filtered = searchAccounts(state.admins, values[0]);
        const limit = Number(values.at(-2));
        const offset = Number(values.at(-1));
        return [[...filtered]
          .sort((a, b) => b.created_at.localeCompare(a.created_at) || Number(b.id) - Number(a.id))
          .slice(offset, offset + limit)
          .map(({ id, name, username, email, role, is_active, created_at }) => ({
            id, name, username, email, role, is_active, created_at
          }))];
      }
      if (sql.startsWith('UPDATE admins SET role = ?, is_active = ?, auth_version = auth_version + 1')) {
        if (state.failUpdate) throw new Error('simulated update failure');
        const admin = state.admins.find((row) => row.id === String(values[2]));
        Object.assign(admin, {
          role: values[0],
          is_active: values[1],
          auth_version: admin.auth_version + 1
        });
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('INSERT INTO admins (name, username, email, password_hash, role, is_active)')) {
        if (state.failCreate) throw new Error('simulated insert failure');
        if (state.admins.some((row) => row.username === values[1] || row.email === values[2])) {
          const error = new Error('duplicate key');
          error.code = 'ER_DUP_ENTRY';
          throw error;
        }
        const id = String(Math.max(...state.admins.map((row) => Number(row.id)), 0) + 1);
        state.admins.push({
          id,
          name: values[0],
          username: values[1],
          email: values[2],
          password_hash: values[3],
          role: values[4],
          is_active: values[5],
          auth_version: 0,
          created_at: '2026-01-03T03:04:05.000Z'
        });
        return [{ insertId: Number(id), affectedRows: 1 }];
      }
      if (sql.startsWith('SELECT id, name, username, email, role, is_active, created_at FROM admins WHERE id = ?')) {
        const admin = state.admins.find((row) => row.id === String(values[0]));
        return [[admin ? { ...admin } : undefined].filter(Boolean)];
      }
      if (sql.startsWith('SELECT id, name, username, email, password_hash, role, is_active, auth_version')) {
        const admin = sql.includes('WHERE username = ?')
          ? state.admins.find((row) => row.username === values[0])
          : state.admins.find((row) => row.email === values[0] && row.username == null);
        return [[admin ? { ...admin } : undefined].filter(Boolean)];
      }
      if (sql.startsWith('DELETE FROM admin_sessions')) {
        state.sessionsInvalidatedFor.push(values[0]);
        return [{ affectedRows: 2 }];
      }
      throw new Error(`Unexpected SQL in access-control test: ${sql}`);
    },
    async getConnection() {
      let releaseTransaction;
      let snapshot;
      return {
        execute: (...args) => database.execute(...args),
        async beginTransaction() {
          const previous = transactionTail;
          transactionTail = new Promise((resolve) => { releaseTransaction = resolve; });
          await previous;
          snapshot = structuredClone(state.admins);
        },
        async commit() {
          state.commits += 1;
          releaseTransaction?.();
          releaseTransaction = null;
        },
        async rollback() {
          state.rollbacks += 1;
          state.admins = snapshot;
          releaseTransaction?.();
          releaseTransaction = null;
        },
        release() {}
      };
    }
  };

  const app = express();
  app.locals.database = database;
  app.use(express.json());
  app.use((req, res, next) => {
    const adminId = req.get('x-test-admin-id');
    if (adminId) {
      const current = state.admins.find((admin) => admin.id === adminId);
      req.session = {
        adminId,
        authVersion: current?.auth_version ?? 0,
        destroy(callback) { callback(null); }
      };
    }
    next();
  });
  app.use('/api/admin/access-control', adminAccessControlRouter);
  app.use(errorHandler);
  return { app, state };
}

function searchAccounts(admins, pattern) {
  if (!pattern) return admins;
  const query = pattern.replace(/^%|%$/g, '').replace(/\\([\\%_])/g, '$1').toLowerCase();
  return admins.filter((admin) =>
    admin.name.toLowerCase().includes(query)
      || admin.username.toLowerCase().includes(query)
      || admin.email.toLowerCase().includes(query)
  );
}

describe('Super Admin access-control API', () => {
  it('requires an authenticated Super Admin for account management endpoints', async () => {
    const { app } = createAccessControlApp();
    assert.equal((await request(app).get('/api/admin/access-control/users')).status, 401);
    assert.equal((await request(app).post('/api/admin/access-control/users').send({})).status, 401);
    assert.equal((await request(app).patch('/api/admin/access-control/users/2').send({ role: 'Super Admin' })).status, 401);

    const createRequest = request(app).post('/api/admin/access-control/users')
      .set('x-test-admin-id', '2').send({});
    const adminRequest = request(app).get('/api/admin/access-control/users').set('x-test-admin-id', '2');
    const updateRequest = request(app).patch('/api/admin/access-control/users/2')
      .set('x-test-admin-id', '2').send({ role: 'Super Admin' });
    assert.equal((await createRequest).status, 403);
    assert.equal((await adminRequest).status, 403);
    assert.equal((await updateRequest).status, 403);
  });

  it('creates a normalized, safely-hashed account that inherits its assigned role', async () => {
    const { app, state } = createAccessControlApp();
    const response = await request(app)
      .post('/api/admin/access-control/users')
      .set('x-test-admin-id', '1')
      .send({
        name: '  New Editor  ',
        username: '  New.Editor ',
        email: '  New.Editor@Example.COM  ',
        password: 'Strong-password-123!',
        role: 'Admin'
      });

    assert.equal(response.status, 201);
    assert.deepEqual(response.body.data, {
      id: '3',
      name: 'New Editor',
      username: 'new.editor',
      email: 'new.editor@example.com',
      role: 'Admin',
      isActive: true,
      createdAt: '2026-01-03T03:04:05.000Z'
    });
    assert.equal(state.admins[2].auth_version, 0);
    assert.notEqual(state.admins[2].password_hash, 'Strong-password-123!');
    assert.equal(await bcrypt.compare('Strong-password-123!', state.admins[2].password_hash), true);
    assert.doesNotMatch(JSON.stringify(response.body), /password|hash|auth_version/);

    const { authenticateAdmin } = await import('../src/services/auth.service.js');
    const loggedIn = await authenticateAdmin('NEW.EDITOR', 'Strong-password-123!', {
      async execute(sql, values = []) {
        if (sql.startsWith('SELECT id, name, username, email, password_hash, role, is_active, auth_version')) {
          const admin = sql.includes('WHERE username = ?')
            ? state.admins.find((row) => row.username === values[0])
            : state.admins.find((row) => row.email === values[0] && row.username == null);
          return [[admin ? { ...admin } : undefined].filter(Boolean)];
        }
        if (sql.startsWith('SELECT role_key, is_active FROM permission_roles WHERE label = ?')) {
          return [[{
            role_key: values[0] === 'Super Admin' ? 'super-admin' : 'admin',
            is_active: 1
          }]];
        }
        throw new Error(`Unexpected authentication SQL in access-control test: ${sql}`);
      }
    });
    assert.equal(String(loggedIn.id), '3');
    assert.equal(loggedIn.role, 'Admin');
    assert.equal(state.admins[2].is_active, 1);
  });

  it('assigns active custom roles and rejects inactive roles for account creation and updates', async () => {
    const { app, state } = createAccessControlApp({
      customRoles: [
        { role_key: 'editorial-reviewer', label: 'Editorial Reviewer', is_active: 1 },
        { role_key: 'inactive-editor', label: 'Inactive Editor', is_active: 0 }
      ]
    });
    const newAccount = {
      name: 'Custom Role User',
      username: 'custom-role',
      email: 'custom-role@example.com',
      password: 'Strong-password-123!',
      role: 'Editorial Reviewer'
    };

    const created = await request(app)
      .post('/api/admin/access-control/users')
      .set('x-test-admin-id', '1')
      .send(newAccount);
    assert.equal(created.status, 201);
    assert.equal(created.body.data.role, 'Editorial Reviewer');

    const inactiveAssignment = await request(app)
      .patch(`/api/admin/access-control/users/${created.body.data.id}`)
      .set('x-test-admin-id', '1')
      .send({ role: 'Inactive Editor' });
    assert.equal(inactiveAssignment.status, 400);
    assert.equal(state.admins.find((row) => row.id === String(created.body.data.id)).role, 'Editorial Reviewer');

    const { authenticateAdmin } = await import('../src/services/auth.service.js');
    const activeLogin = await authenticateAdmin('custom-role', newAccount.password, {
      async execute(sql, values = []) {
        if (sql.startsWith('SELECT id, name, username, email, password_hash, role, is_active, auth_version')) {
          const admin = sql.includes('WHERE username = ?')
            ? state.admins.find((row) => row.username === values[0])
            : state.admins.find((row) => row.email === values[0] && row.username == null);
          return [[admin ? { ...admin } : undefined].filter(Boolean)];
        }
        if (sql.startsWith('SELECT role_key, is_active FROM permission_roles WHERE label = ?')) {
          const role = state.roles.find(({ label }) => label === values[0]);
          return [[role ? { role_key: role.role_key, is_active: role.is_active } : undefined].filter(Boolean)];
        }
        throw new Error(`Unexpected authentication SQL in access-control test: ${sql}`);
      }
    });
    assert.equal(activeLogin.role, 'Editorial Reviewer');
    state.roles.find(({ label }) => label === 'Editorial Reviewer').is_active = 0;
    await assert.rejects(authenticateAdmin('custom-role', newAccount.password, {
      async execute(sql, values = []) {
        if (sql.startsWith('SELECT id, name, username, email, password_hash, role, is_active, auth_version')) {
          const admin = sql.includes('WHERE username = ?')
            ? state.admins.find((row) => row.username === values[0])
            : state.admins.find((row) => row.email === values[0] && row.username == null);
          return [[admin ? { ...admin } : undefined].filter(Boolean)];
        }
        if (sql.startsWith('SELECT role_key, is_active FROM permission_roles WHERE label = ?')) {
          const role = state.roles.find(({ label }) => label === values[0]);
          return [[role ? { role_key: role.role_key, is_active: role.is_active } : undefined].filter(Boolean)];
        }
        throw new Error(`Unexpected authentication SQL in access-control test: ${sql}`);
      }
    }), /Invalid username or password/);
  });

  it('creates inactive and explicitly confirmed Super Admin accounts only when requested', async () => {
    const { app, state } = createAccessControlApp();
    const base = {
      name: 'Elevated Account',
      username: 'elevated',
      email: 'elevated@example.com',
      password: 'Strong-password-123!',
      role: 'Super Admin'
    };
    const unconfirmed = await request(app)
      .post('/api/admin/access-control/users').set('x-test-admin-id', '1').send(base);
    assert.equal(unconfirmed.status, 400);
    assert.equal(state.admins.length, 2);

    const confirmed = await request(app)
      .post('/api/admin/access-control/users')
      .set('x-test-admin-id', '1')
      .send({ ...base, isActive: false, confirmSuperAdmin: true });
    assert.equal(confirmed.status, 201);
    assert.equal(confirmed.body.data.role, 'Super Admin');
    assert.equal(confirmed.body.data.isActive, false);
    assert.equal(state.admins[2].auth_version, 0);

    const { authenticateAdmin } = await import('../src/services/auth.service.js');
    await assert.rejects(authenticateAdmin('elevated', base.password, {
      async execute(sql, values = []) {
        if (sql.startsWith('SELECT id, name, username, email, password_hash, role, is_active, auth_version')) {
          const admin = sql.includes('WHERE username = ?')
            ? state.admins.find((row) => row.username === values[0])
            : state.admins.find((row) => row.email === values[0] && row.username == null);
          return [[admin ? { ...admin } : undefined].filter(Boolean)];
        }
        throw new Error(`Unexpected authentication SQL in access-control test: ${sql}`);
      }
    }), /Invalid username or password/);
  });

  it('rejects duplicate email, invalid fields, weak passwords, and unsupported roles', async () => {
    const { app, state } = createAccessControlApp();
    const endpoint = (body) => request(app).post('/api/admin/access-control/users')
      .set('x-test-admin-id', '1').send(body);
    const base = {
      name: 'New Admin',
      username: 'admin2',
      email: 'admin2@example.com',
      password: 'Strong-password-123!',
      role: 'Admin'
    };
    assert.equal((await endpoint(base)).status, 409);
    assert.equal((await endpoint({ ...base, username: 'Admin2', email: 'new@example.com' })).status, 409);
    assert.equal((await endpoint({ ...base, username: 'bad username', email: 'valid@example.com' })).status, 400);
    assert.equal((await endpoint({ ...base, email: 'not-an-email' })).status, 400);
    assert.equal((await endpoint({ ...base, email: 'valid@example.com', password: 'weak' })).status, 400);
    assert.equal((await endpoint({ ...base, email: 'valid@example.com', role: 'Owner' })).status, 400);
    assert.equal((await endpoint({ ...base, email: 'valid@example.com', password_hash: 'trusted' })).status, 400);
    assert.equal(state.admins.length, 2);
  });

  it('rolls back account creation when persistence fails', async () => {
    const { app, state } = createAccessControlApp({ failCreate: true });
    const response = await request(app)
      .post('/api/admin/access-control/users')
      .set('x-test-admin-id', '1')
      .send({
        name: 'Failed Admin',
        username: 'failed-admin',
        email: 'failed@example.com',
        password: 'Strong-password-123!',
        role: 'Admin'
      });
    assert.equal(response.status, 500);
    assert.equal(state.admins.length, 2);
    assert.equal(state.rollbacks, 1);
    assert.equal(state.commits, 0);
  });

  it('lists safe account fields with pagination and optional search', async () => {
    const { app } = createAccessControlApp();
    const response = await request(app)
      .get('/api/admin/access-control/users?page=1&limit=1&q=Admin%202')
      .set('x-test-admin-id', '1');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, [{
      id: '2',
      name: 'Admin 2',
      username: 'admin2',
      email: 'admin2@example.com',
      role: 'Admin',
      isActive: true,
      createdAt: '2026-01-02T03:04:05.000Z'
    }]);
    assert.deepEqual(response.body.pagination, { page: 1, limit: 1, total: 1, totalPages: 1 });
    assert.doesNotMatch(JSON.stringify(response.body), /password_hash|session_id|auth_version|private-hash/);
  });

  it('promotes, demotes, deactivates, and reactivates accounts while invalidating only affected sessions', async () => {
    const { app, state } = createAccessControlApp();
    const endpoint = (body) => request(app)
      .patch('/api/admin/access-control/users/2')
      .set('x-test-admin-id', '1')
      .send(body);

    const promoted = await endpoint({ role: 'Super Admin' });
    assert.equal(promoted.status, 200);
    assert.equal(promoted.body.data.role, 'Super Admin');
    assert.deepEqual(state.sessionsInvalidatedFor, ['2']);

    const demoted = await endpoint({ role: 'Admin' });
    assert.equal(demoted.status, 200);
    assert.equal(demoted.body.data.role, 'Admin');

    const deactivated = await endpoint({ isActive: false });
    assert.equal(deactivated.status, 200);
    assert.equal(deactivated.body.data.isActive, false);

    const reactivated = await endpoint({ isActive: true });
    assert.equal(reactivated.status, 200);
    assert.equal(reactivated.body.data.isActive, true);
    assert.deepEqual(state.sessionsInvalidatedFor, ['2', '2', '2', '2']);
    assert.equal(state.admins[1].auth_version, 4);
  });

  it('prevents self-demotion and self-deactivation', async () => {
    const { app, state } = createAccessControlApp();
    const demote = await request(app)
      .patch('/api/admin/access-control/users/1')
      .set('x-test-admin-id', '1')
      .send({ role: 'Admin' });
    const deactivate = await request(app)
      .patch('/api/admin/access-control/users/1')
      .set('x-test-admin-id', '1')
      .send({ isActive: false });

    assert.equal(demote.status, 400);
    assert.match(demote.body.error.message, /cannot deactivate or demote your own account/);
    assert.equal(deactivate.status, 400);
    assert.equal(state.admins[0].role, 'Super Admin');
    assert.equal(state.admins[0].is_active, 1);
  });

  it('rejects changes that would leave no active Super Admin', async () => {
    const { state } = createAccessControlApp({ admins: [account(1, 'Super Admin')] });
    const connection = await stateDatabaseConnection(state);
    await assert.rejects(
      updateAdminAuthorization(connection, '1', { isActive: false }),
      /last active Super Admin/
    );
    assert.equal(state.admins[0].is_active, 1);
  });

  it('serializes competing demotions so at least one active Super Admin remains', async () => {
    const { app, state } = createAccessControlApp({
      admins: [account(1, 'Super Admin'), account(2, 'Super Admin')]
    });
    const demote = (actorId, targetId) => request(app)
      .patch(`/api/admin/access-control/users/${targetId}`)
      .set('x-test-admin-id', String(actorId))
      .send({ role: 'Admin' });
    const results = await Promise.all([demote(1, 2), demote(2, 1)]);

    assert.equal(results.filter((result) => result.status === 200).length, 1);
    assert.equal(results.filter((result) => result.status === 403 || result.status === 409).length, 1);
    assert.equal(state.admins.filter((admin) =>
      admin.role === 'Super Admin' && admin.is_active === 1
    ).length, 1);
  });

  it('rejects malformed IDs, unsupported roles, unknown fields, and empty updates', async () => {
    const { app } = createAccessControlApp();
    const send = (path, body) => request(app)
      .patch(path)
      .set('x-test-admin-id', '1')
      .send(body);
    assert.equal((await send('/api/admin/access-control/users/0', { role: 'Admin' })).status, 400);
    assert.equal((await send('/api/admin/access-control/users/abc', { role: 'Admin' })).status, 400);
    assert.equal((await send('/api/admin/access-control/users/2', { role: 'Owner' })).status, 400);
    assert.equal((await send('/api/admin/access-control/users/2', { isActive: 'false' })).status, 400);
    assert.equal((await send('/api/admin/access-control/users/2', { role: 'Admin', id: 1 })).status, 400);
    assert.equal((await send('/api/admin/access-control/users/2', {})).status, 400);
  });

  it('returns a generic server error when account listing fails', async () => {
    const { app } = createAccessControlApp({ failList: true });
    const response = await request(app)
      .get('/api/admin/access-control/users')
      .set('x-test-admin-id', '1');
    assert.equal(response.status, 500);
    assert.equal(response.body.error.message, 'An unexpected server error occurred.');
    assert.doesNotMatch(JSON.stringify(response.body), /simulated database failure/);
  });

  it('rolls back account changes and returns a generic error when an update fails', async () => {
    const { app, state } = createAccessControlApp({ failUpdate: true });
    const response = await request(app)
      .patch('/api/admin/access-control/users/2')
      .set('x-test-admin-id', '1')
      .send({ role: 'Super Admin' });
    assert.equal(response.status, 500);
    assert.equal(response.body.error.message, 'An unexpected server error occurred.');
    assert.equal(state.admins[1].role, 'Admin');
    assert.deepEqual(state.sessionsInvalidatedFor, []);
  });
});

async function stateDatabaseConnection(state) {
  return {
    async beginTransaction() {},
    async execute(sql, values = []) {
      if (sql.includes('FROM admins ORDER BY id FOR UPDATE')) return [[...state.admins]];
      if (sql.startsWith('SELECT role_key, is_active FROM permission_roles WHERE label = ?')) {
        return [[{
          role_key: values[0] === 'Super Admin' ? 'super-admin' : 'admin',
          is_active: 1
        }]];
      }
      if (sql.startsWith('UPDATE admins SET role = ?, is_active = ?, auth_version = auth_version + 1')) {
        const admin = state.admins.find((row) => row.id === String(values[2]));
        Object.assign(admin, {
          role: values[0],
          is_active: values[1],
          auth_version: admin.auth_version + 1
        });
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('DELETE FROM admin_sessions')) return [{ affectedRows: 0 }];
      throw new Error(`Unexpected SQL in access-control test: ${sql}`);
    },
    async commit() {},
    async rollback() {}
  };
}
