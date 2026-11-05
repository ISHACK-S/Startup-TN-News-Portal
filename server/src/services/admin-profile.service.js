import bcrypt from 'bcrypt';
import { pool } from '../database/pool.js';
import { deleteOtherAdminSessions } from '../database/session-store.js';
import { HttpError } from '../errors/http-error.js';
import { hashAdminPassword } from './admin-password.service.js';

function publicProfile(admin) {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    isActive: Number(admin.is_active) === 1,
    createdAt: admin.created_at
  };
}

async function lockAdmin(database, adminId, expectedAuthVersion) {
  const [rows] = await database.execute(
    `SELECT id, name, email, password_hash, role, is_active, auth_version, created_at
     FROM admins WHERE id = ? LIMIT 1 FOR UPDATE`,
    [adminId]
  );
  if (!rows[0] || Number(rows[0].is_active) !== 1) {
    throw new HttpError(401, 'Authentication is required.');
  }
  if (Number(rows[0].auth_version) !== Number(expectedAuthVersion)) {
    throw new HttpError(401, 'Authentication is required.');
  }
  return rows[0];
}

async function getCurrentAuthVersion(database, adminId) {
  const [rows] = await database.execute(
    'SELECT auth_version FROM admins WHERE id = ? LIMIT 1',
    [adminId]
  );
  if (!rows[0]) throw new HttpError(404, 'The administrator account was not found.');
  return Number(rows[0].auth_version);
}

async function rollbackAndRethrow(database, error) {
  try {
    await database.rollback();
  } catch {
    throw new Error('The profile update failed and its rollback could not be confirmed.');
  }
  if (error.code === 'ER_DUP_ENTRY') {
    throw new HttpError(409, 'An administrator account already uses this email address.');
  }
  throw error;
}

export async function getAdminProfile(adminId, database = pool) {
  const [rows] = await database.execute(
    `SELECT id, name, email, role, is_active, created_at
     FROM admins WHERE id = ? LIMIT 1`,
    [adminId]
  );
  if (!rows[0] || Number(rows[0].is_active) !== 1) {
    throw new HttpError(404, 'The administrator account was not found.');
  }
  return publicProfile(rows[0]);
}

export async function updateAdminProfile(database, adminId, sessionId, expectedAuthVersion, changes) {
  let transactionStarted = false;
  try {
    await database.beginTransaction();
    transactionStarted = true;
    const admin = await lockAdmin(database, adminId, expectedAuthVersion);
    const emailChanged = admin.email.toLowerCase() !== changes.email;
    const [existing] = await database.execute(
      'SELECT id FROM admins WHERE email = ? AND id <> ? LIMIT 1',
      [changes.email, adminId]
    );
    if (existing.length) {
      throw new HttpError(409, 'An administrator account already uses this email address.');
    }

    await database.execute(
      `UPDATE admins SET name = ?, email = ?, auth_version = auth_version + ?
       WHERE id = ?`,
      [changes.name, changes.email, emailChanged ? 1 : 0, adminId]
    );
    const otherSessionsInvalidated = emailChanged
      ? await deleteOtherAdminSessions(database, adminId, sessionId)
      : 0;
    const authVersion = emailChanged
      ? await getCurrentAuthVersion(database, adminId)
      : Number(admin.auth_version);
    const [updatedRows] = await database.execute(
      `SELECT id, name, email, role, is_active, created_at
       FROM admins WHERE id = ? LIMIT 1`,
      [adminId]
    );
    await database.commit();
    transactionStarted = false;
    return {
      profile: publicProfile(updatedRows[0]),
      emailChanged,
      authVersion,
      otherSessionsInvalidated
    };
  } catch (error) {
    if (transactionStarted) await rollbackAndRethrow(database, error);
    throw error;
  }
}

export async function changeAdminPassword(database, adminId, sessionId, expectedAuthVersion, input) {
  let transactionStarted = false;
  try {
    await database.beginTransaction();
    transactionStarted = true;
    const admin = await lockAdmin(database, adminId, expectedAuthVersion);
    if (!(await bcrypt.compare(input.currentPassword, admin.password_hash))) {
      throw new HttpError(400, 'The current password is incorrect.');
    }

    const passwordHash = await hashAdminPassword(input.newPassword);
    await database.execute(
      'UPDATE admins SET password_hash = ?, auth_version = auth_version + 1 WHERE id = ?',
      [passwordHash, adminId]
    );
    const otherSessionsInvalidated = await deleteOtherAdminSessions(database, adminId, sessionId);
    const authVersion = await getCurrentAuthVersion(database, adminId);
    await database.commit();
    transactionStarted = false;
    return { authVersion, otherSessionsInvalidated };
  } catch (error) {
    if (transactionStarted) await rollbackAndRethrow(database, error);
    throw error;
  }
}
