import assert from 'node:assert/strict';
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
let requireSuperAdmin;
let updateAdminAuthorization;

before(async () => {
  const [expressModule, middleware, authService] = await Promise.all([
    import('express'),
    import('../src/middleware/require-admin.js'),
    import('../src/services/auth.service.js')
  ]);
  express = expressModule.default;
  ({ requireSuperAdmin } = middleware);
  ({ updateAdminAuthorization } = authService);
});

function createAuthorizationApp(state) {
  const app = express();
  app.locals.database = {
    async execute(sql, values) {
      if (sql.includes('FROM admins WHERE id = ? LIMIT 1')) {
        assert.equal(values[0], state.admin.id);
        return [[{ ...state.admin }]];
      }
      if (sql.startsWith('SELECT role_key, is_active FROM permission_roles WHERE label = ?')) {
        return [[{
          role_key: values[0] === 'Super Admin' ? 'super-admin' : 'admin',
          is_active: 1
        }]];
      }
      throw new Error(`Unexpected SQL in authorization middleware test: ${sql}`);
    }
  };
  app.use((req, res, next) => {
    if (state.session) {
      req.session = {
        ...state.session,
        destroy(callback) {
          state.sessionDestroyed = true;
          callback(null);
        }
      };
    }
    next();
  });
  app.get('/api/admin/accounts', requireSuperAdmin, (req, res) => res.sendStatus(204));
  app.use((error, req, res, next) => {
    res.status(error.statusCode ?? 500).json({ error: { message: error.message } });
  });
  return app;
}

describe('admin role authorization', () => {
  it('returns 401 without a session and denies Admin on Super Admin routes', async () => {
    const state = {
      admin: { id: 17, name: 'Test Admin', email: 'admin@example.com', role: 'Admin', is_active: 1, auth_version: 0 }
    };
    const app = createAuthorizationApp(state);

    const unauthenticated = await request(app).get('/api/admin/accounts');
    assert.equal(unauthenticated.status, 401);

    state.session = { adminId: 17, authVersion: 0 };
    const denied = await request(app).get('/api/admin/accounts');
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.message, 'Super Admin privileges are required.');

    state.admin.role = 'Super Admin';
    const allowed = await request(app).get('/api/admin/accounts');
    assert.equal(allowed.status, 204);
  });

  it('invalidates stale and deactivated sessions using current database authorization state', async () => {
    const state = {
      admin: { id: 17, name: 'Test Admin', email: 'admin@example.com', role: 'Admin', is_active: 1, auth_version: 1 },
      session: { adminId: 17, authVersion: 0 }
    };
    const app = createAuthorizationApp(state);

    const stale = await request(app).get('/api/admin/accounts');
    assert.equal(stale.status, 401);
    assert.equal(state.sessionDestroyed, true);

    state.session = { adminId: 17, authVersion: 1 };
    state.admin.is_active = 0;
    state.sessionDestroyed = false;
    const inactive = await request(app).get('/api/admin/accounts');
    assert.equal(inactive.status, 401);
    assert.equal(state.sessionDestroyed, true);
  });

  it('changes roles or active state transactionally and invalidates only that account sessions', async () => {
    const calls = [];
    const row = { id: 17, role: 'Admin', is_active: 1, auth_version: 0 };
    const otherSuperAdmin = {
      id: 18,
      name: 'Other Admin',
      email: 'other@example.com',
      role: 'Super Admin',
      is_active: 1,
      auth_version: 0,
      created_at: '2026-01-01T00:00:00.000Z'
    };
    Object.assign(row, {
      name: 'Test Admin',
      email: 'admin@example.com',
      created_at: '2026-01-01T00:00:00.000Z'
    });
    const connection = {
      async beginTransaction() { calls.push('begin'); },
      async execute(sql, values = []) {
        calls.push([sql, values]);
        if (sql.includes('FROM admins ORDER BY id FOR UPDATE')) {
          return [[{ ...row }, { ...otherSuperAdmin }]];
        }
        if (sql.startsWith('SELECT role_key, is_active FROM permission_roles WHERE label = ?')) {
          return [[{
            role_key: values[0] === 'Super Admin' ? 'super-admin' : 'admin',
            is_active: 1
          }]];
        }
        if (sql.startsWith('UPDATE admins SET role')) {
          const target = values[2] === row.id ? row : otherSuperAdmin;
          [target.role, target.is_active] = values.slice(0, 2);
          target.auth_version += 1;
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('DELETE FROM admin_sessions')) {
          return [{ affectedRows: 2 }];
        }
        throw new Error(`Unexpected SQL in authorization test: ${sql}`);
      },
      async commit() { calls.push('commit'); },
      async rollback() { calls.push('rollback'); }
    };

    const promoted = await updateAdminAuthorization(connection, 17, { role: 'Super Admin' });
    assert.equal(promoted.changed, true);
    assert.equal(promoted.sessionsInvalidated, 2);
    assert.equal(promoted.admin.role, 'Super Admin');
    assert.equal(row.role, 'Super Admin');
    assert.equal(row.auth_version, 1);
    const invalidation = calls.find((call) => Array.isArray(call) && call[0].startsWith('DELETE FROM admin_sessions'));
    assert.deepEqual(invalidation[1], ['17']);

    calls.length = 0;
    const deactivated = await updateAdminAuthorization(connection, 17, { isActive: false });
    assert.equal(deactivated.changed, true);
    assert.equal(deactivated.sessionsInvalidated, 2);
    assert.equal(deactivated.admin.isActive, false);
    assert.equal(row.is_active, 0);
    assert.equal(row.auth_version, 2);
    assert.equal(calls.at(-1), 'commit');
  });
});
