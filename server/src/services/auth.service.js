import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { pool } from '../database/pool.js';
import { HttpError } from '../errors/http-error.js';
import { deleteAdminSessions } from '../database/session-store.js';
import { hashAdminPassword } from './admin-password.service.js';

const DUMMY_PASSWORD_HASH = bcrypt.hash(randomBytes(32).toString('hex'), 12);
export const ADMIN_ROLES = Object.freeze(['Admin', 'Super Admin']);
export { hashAdminPassword };

export async function authenticateAdmin(email, password, database = pool) {
  const [rows] = await database.execute(
    `SELECT id, name, email, password_hash, role, is_active, auth_version
     FROM admins WHERE email = ? LIMIT 1`,
    [email.toLowerCase()]
  );
  const admin = rows[0];
  const hash = admin?.password_hash ?? (await DUMMY_PASSWORD_HASH);
  const passwordMatches = await bcrypt.compare(password, hash);

  if (!admin || !passwordMatches || Number(admin.is_active) !== 1) {
    throw new HttpError(401, 'Invalid email or password.');
  }
  const [roleRows] = await database.execute(
    'SELECT role_key, is_active FROM permission_roles WHERE label = ? LIMIT 1',
    [admin.role]
  );
  if (!roleRows[0] || Number(roleRows[0].is_active) !== 1) {
    throw new HttpError(401, 'Invalid email or password.');
  }

  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    authVersion: Number(admin.auth_version)
  };
}

export async function updateAdminAuthorization(
  database,
  adminId,
  { role, isActive, actorAdminId }
) {
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    throw new TypeError('The administrator active state must be a boolean.');
  }
  if (role === undefined && isActive === undefined) {
    throw new TypeError('An administrator role or active-state change is required.');
  }

  let transactionStarted = false;
  try {
    await database.beginTransaction();
    transactionStarted = true;
    const [rows] = await database.execute(
      `SELECT id, name, email, role, is_active, created_at
       FROM admins ORDER BY id FOR UPDATE`
    );
    const admin = rows.find((row) => String(row.id) === String(adminId));
    if (!admin) {
      throw new HttpError(404, 'The administrator account was not found.');
    }
    if (actorAdminId !== undefined) {
      const actor = rows.find((row) => String(row.id) === String(actorAdminId));
      if (!actor || actor.role !== 'Super Admin' || Number(actor.is_active) !== 1) {
        throw new HttpError(403, 'Super Admin privileges are required.');
      }
    }

    const nextRole = role ?? admin.role;
    const [roleRows] = await database.execute(
      'SELECT role_key, is_active FROM permission_roles WHERE label = ? LIMIT 1 FOR UPDATE',
      [nextRole]
    );
    if (!roleRows[0] || Number(roleRows[0].is_active) !== 1) {
      throw new HttpError(400, 'The administrator role is inactive or not supported.');
    }
    const currentlyActive = Number(admin.is_active) === 1;
    const nextIsActive = isActive ?? currentlyActive;
    const remainsActiveSuperAdmin = nextRole === 'Super Admin' && nextIsActive;

    if (
      actorAdminId !== undefined
      && String(actorAdminId) === String(admin.id)
      && (
        !nextIsActive
        || (admin.role === 'Super Admin' && nextRole !== 'Super Admin')
      )
    ) {
      throw new HttpError(400, 'You cannot deactivate or demote your own account.');
    }

    if (
      admin.role === 'Super Admin'
      && currentlyActive
      && !remainsActiveSuperAdmin
      && rows.filter((row) =>
        row.role === 'Super Admin' && Number(row.is_active) === 1
      ).length <= 1
    ) {
      throw new HttpError(409, 'The last active Super Admin cannot be demoted or deactivated.');
    }

    if (nextRole === admin.role && nextIsActive === currentlyActive) {
      await database.commit();
      transactionStarted = false;
      return {
        changed: false,
        sessionsInvalidated: 0,
        previousRole: admin.role,
        previousIsActive: currentlyActive,
        admin: publicAdmin(admin, nextRole, nextIsActive)
      };
    }

    await database.execute(
      'UPDATE admins SET role = ?, is_active = ?, auth_version = auth_version + 1 WHERE id = ?',
      [nextRole, nextIsActive ? 1 : 0, admin.id]
    );
    const sessionsInvalidated = await deleteAdminSessions(database, admin.id);
    await database.commit();
    transactionStarted = false;
    return {
      changed: true,
      sessionsInvalidated,
      previousRole: admin.role,
      previousIsActive: currentlyActive,
      admin: publicAdmin(admin, nextRole, nextIsActive)
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await database.rollback();
      } catch {
        throw new Error(
          'Administrator authorization update failed and its rollback could not be confirmed.'
        );
      }
    }
    throw error;
  }
}

function publicAdmin(admin, role = admin.role, isActive = Number(admin.is_active) === 1) {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role,
    isActive,
    createdAt: admin.created_at
  };
}
