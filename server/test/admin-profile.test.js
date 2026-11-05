import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { before, describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
process.env.MYSQL_HOST = '127.0.0.1';
process.env.MYSQL_PORT = '3306';
process.env.MYSQL_DATABASE = 'startuptn_test';
process.env.MYSQL_USER = 'test';
process.env.MYSQL_PASSWORD = 'test';
process.env.MYSQL_SSL = 'false';

let authRouter;
let errorHandler;
let authenticateAdmin;
let database;
let state;
let sessionData;

function createDatabase() {
  state = {
    admins: [
      {
        id: 1,
        name: 'Editorial Admin',
        email: 'admin@example.com',
        password_hash: '',
        role: 'Admin',
        is_active: 1,
        auth_version: 0,
        created_at: new Date('2025-01-02T03:04:05.000Z')
      },
      {
        id: 2,
        name: 'Site Super Admin',
        email: 'super@example.com',
        password_hash: '',
        role: 'Super Admin',
        is_active: 1,
        auth_version: 0,
        created_at: new Date('2025-02-03T03:04:05.000Z')
      },
      {
        id: 3,
        name: 'Other Admin',
        email: 'other@example.com',
        password_hash: '',
        role: 'Admin',
        is_active: 1,
        auth_version: 0,
        created_at: new Date('2025-03-04T03:04:05.000Z')
      }
    ],
    sessions: [
      { session_id: 'current-admin-session', adminId: '1' },
      { session_id: 'old-admin-session', adminId: '1' },
      { session_id: 'other-user-session', adminId: '3' },
      { session_id: 'current-super-session', adminId: '2' }
    ],
    transactionSnapshot: null
  };
  database = {
    async execute(sql, values = []) {
      if (sql.includes('FROM admins WHERE email = ? LIMIT 1')) {
        const admin = state.admins.find((row) => row.email === values[0]);
        return [[admin ? { ...admin } : undefined].filter(Boolean)];
      }
      if (sql.includes('FROM admins WHERE id = ?')) {
        const admin = state.admins.find((row) => String(row.id) === String(values[0]));
        if (!admin) return [[]];
        if (sql.includes('password_hash')) return [[{ ...admin }]];
        if (sql.includes('auth_version')) return [[{ ...admin }]];
        return [[{ ...admin }]];
      }
      if (sql.startsWith('SELECT role_key, is_active FROM permission_roles WHERE label = ?')) {
        return [[{
          role_key: values[0] === 'Super Admin' ? 'super-admin' : 'admin',
          is_active: 1
        }]];
      }
      if (sql.startsWith('SELECT id FROM admins WHERE email = ? AND id <> ?')) {
        const duplicate = state.admins.find(
          (row) => row.email.toLowerCase() === values[0] && String(row.id) !== String(values[1])
        );
        return [[duplicate ? { id: duplicate.id } : undefined].filter(Boolean)];
      }
      if (sql.startsWith('UPDATE admins SET name = ?, email = ?')) {
        const admin = state.admins.find((row) => String(row.id) === String(values[3]));
        admin.name = values[0];
        admin.email = values[1];
        admin.auth_version += Number(values[2]);
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE admins SET password_hash = ?')) {
        const admin = state.admins.find((row) => String(row.id) === String(values[1]));
        admin.password_hash = values[0];
        admin.auth_version += 1;
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('DELETE FROM admin_sessions')) {
        const before = state.sessions.length;
        state.sessions = state.sessions.filter((item) => (
          item.adminId !== values[0] || item.session_id === values[1]
        ));
        return [{ affectedRows: before - state.sessions.length }];
      }
      throw new Error(`Unexpected profile-test SQL: ${sql}`);
    },
    async beginTransaction() {
      state.transactionSnapshot = structuredClone({
        admins: state.admins,
        sessions: state.sessions
      });
    },
    async commit() {
      state.transactionSnapshot = null;
    },
    async rollback() {
      if (!state.transactionSnapshot) return;
      state.admins = state.transactionSnapshot.admins;
      state.sessions = state.transactionSnapshot.sessions;
      state.transactionSnapshot = null;
    },
    async getConnection() {
      return {
        execute: (...args) => database.execute(...args),
        beginTransaction: () => database.beginTransaction(),
        commit: () => database.commit(),
        rollback: () => database.rollback(),
        release() {}
      };
    }
  };
  return database;
}

function createApp() {
  const app = express();
  app.locals.database = database;
  app.use(express.json());
  app.use((req, res, next) => {
    const adminId = req.get('x-test-admin-id');
    const admin = state.admins.find((row) => String(row.id) === String(adminId));
    const sessionId = req.get('x-test-session') ?? `session-${adminId}`;
    if (admin) {
      let storedSession = sessionData.get(sessionId);
      if (!storedSession) {
        storedSession = { adminId: admin.id, authVersion: admin.auth_version };
        sessionData.set(sessionId, storedSession);
      }
      req.sessionID = sessionId;
      req.session = {
        ...storedSession,
        destroy(callback) {
          sessionData.delete(sessionId);
          callback(null);
        }
      };
      Object.defineProperty(req.session, 'authVersion', {
        get: () => storedSession.authVersion,
        set: (value) => { storedSession.authVersion = value; }
      });
    }
    next();
  });
  app.use('/api/auth', authRouter);
  app.use((req, res) => res.status(404).json({ error: { message: 'Not found.' } }));
  app.use(errorHandler);
  return app;
}

before(async () => {
  const [{ authRouter: router }, { errorHandler: handler }, authService] = await Promise.all([
    import('../src/routes/auth.routes.js'),
    import('../src/middleware/error-handler.js'),
    import('../src/services/auth.service.js')
  ]);
  authRouter = router;
  errorHandler = handler;
  ({ authenticateAdmin } = authService);
});

function resetTestState() {
  createDatabase();
  sessionData = new Map();
}

describe('authenticated administrator profile API', () => {
  before(async () => {
    resetTestState();
    const passwordHash = await bcrypt.hash('CurrentPass123!', 4);
    state.admins.forEach((admin) => { admin.password_hash = passwordHash; });
  });

  it('returns the authenticated Admin and Super Admin own profile without sensitive fields', async () => {
    resetTestState();
    const passwordHash = await bcrypt.hash('CurrentPass123!', 4);
    state.admins.forEach((admin) => { admin.password_hash = passwordHash; });
    const app = createApp();

    for (const [id, role, email] of [[1, 'Admin', 'admin@example.com'], [2, 'Super Admin', 'super@example.com']]) {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('x-test-admin-id', String(id));
      assert.equal(response.status, 200);
      assert.equal(response.body.data.profile.role, role);
      assert.equal(response.body.data.profile.email, email);
      assert.equal(response.body.data.profile.isActive, true);
      assert.equal(Object.hasOwn(response.body.data.profile, 'password_hash'), false);
      assert.equal(Object.hasOwn(response.body.data.profile, 'auth_version'), false);
      assert.ok(response.body.data.profile.createdAt);
    }

    assert.equal((await request(app).get('/api/auth/profile')).status, 401);
    state.admins[0].is_active = 0;
    assert.equal(
      (await request(app).get('/api/auth/profile').set('x-test-admin-id', '1')).status,
      401
    );
  });

  it('updates only the current account and normalizes its email', async () => {
    resetTestState();
    const app = createApp();
    const response = await request(app)
      .patch('/api/auth/profile')
      .set('x-test-admin-id', '1')
      .set('x-test-session', 'current-admin-session')
      .send({ name: 'Updated Editor', email: ' NEW.ADMIN@example.com ' });

    assert.equal(response.status, 200);
    assert.equal(response.body.data.profile.name, 'Updated Editor');
    assert.equal(response.body.data.profile.email, 'new.admin@example.com');
    assert.equal(state.admins[0].role, 'Admin');
    assert.equal(state.admins[1].email, 'super@example.com');
    assert.equal(state.admins[0].auth_version, 1);
    assert.equal(state.sessions.some((item) => item.session_id === 'current-admin-session'), true);
    assert.equal(state.sessions.some((item) => item.session_id === 'old-admin-session'), false);
    assert.equal(state.sessions.some((item) => item.session_id === 'other-user-session'), true);
    assert.equal(
      (await request(app).get('/api/auth/profile')
        .set('x-test-admin-id', '1')
        .set('x-test-session', 'current-admin-session')).status,
      200
    );
  });

  it('rejects duplicate or invalid email and account-selector fields', async () => {
    resetTestState();
    const app = createApp();
    const duplicate = await request(app)
      .patch('/api/auth/profile')
      .set('x-test-admin-id', '1')
      .send({ name: 'Editor', email: 'other@example.com' });
    assert.equal(duplicate.status, 409);

    const invalid = await request(app)
      .patch('/api/auth/profile')
      .set('x-test-admin-id', '1')
      .send({ name: '', email: 'not-an-email' });
    assert.equal(invalid.status, 400);

    const accountSelector = await request(app)
      .patch('/api/auth/profile')
      .set('x-test-admin-id', '1')
      .send({ id: 3, role: 'Super Admin', name: 'Someone else', email: 'else@example.com' });
    assert.equal(accountSelector.status, 400);
    assert.equal(state.admins[2].name, 'Other Admin');
  });

  it('requires the current password and existing strong-password policy', async () => {
    resetTestState();
    const currentHash = await bcrypt.hash('CurrentPass123!', 4);
    state.admins[0].password_hash = currentHash;
    const app = createApp();
    const wrongPassword = await request(app)
      .patch('/api/auth/profile/password')
      .set('x-test-admin-id', '1')
      .send({
        currentPassword: 'incorrect',
        newPassword: 'NewStrongPass456!',
        passwordConfirmation: 'NewStrongPass456!'
      });
    assert.equal(wrongPassword.status, 400);
    assert.equal(wrongPassword.body.error.message, 'The current password is incorrect.');

    const weakPassword = await request(app)
      .patch('/api/auth/profile/password')
      .set('x-test-admin-id', '1')
      .send({
        currentPassword: 'CurrentPass123!',
        newPassword: 'weak',
        passwordConfirmation: 'weak'
      });
    assert.equal(weakPassword.status, 400);
    assert.equal(state.admins[0].password_hash, currentHash);
  });

  it('changes the password, retains the current session, invalidates only this account’s other sessions, and permits login with the new password', async () => {
    resetTestState();
    const currentHash = await bcrypt.hash('CurrentPass123!', 4);
    state.admins[0].password_hash = currentHash;
    const app = createApp();
    const response = await request(app)
      .patch('/api/auth/profile/password')
      .set('x-test-admin-id', '1')
      .set('x-test-session', 'current-admin-session')
      .send({
        currentPassword: 'CurrentPass123!',
        newPassword: 'NewStrongPass456!',
        passwordConfirmation: 'NewStrongPass456!'
      });

    assert.equal(response.status, 200);
    assert.equal(state.admins[0].auth_version, 1);
    assert.equal(state.sessions.some((item) => item.session_id === 'current-admin-session'), true);
    assert.equal(state.sessions.some((item) => item.session_id === 'old-admin-session'), false);
    assert.equal(state.sessions.some((item) => item.session_id === 'current-super-session'), true);
    assert.equal(state.sessions.some((item) => item.session_id === 'other-user-session'), true);
    assert.notEqual(state.admins[0].password_hash, 'NewStrongPass456!');
    assert.equal(
      (await authenticateAdmin('admin@example.com', 'NewStrongPass456!', database)).id,
      1
    );
    assert.equal(
      (await request(app).get('/api/auth/profile')
        .set('x-test-admin-id', '1')
        .set('x-test-session', 'current-admin-session')).status,
      200
    );
  });
});
