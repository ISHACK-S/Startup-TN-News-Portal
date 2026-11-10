import { pool } from '../database/pool.js';
import { HttpError } from '../errors/http-error.js';
import { hashAdminPassword } from './admin-password.service.js';

function searchClause(search) {
  if (!search) return { sql: '', values: [] };
  const escaped = search.replace(/[\\%_]/g, '\\$&');
  const pattern = `%${escaped}%`;
  return {
    sql: " WHERE name LIKE ? ESCAPE '\\\\' OR username LIKE ? ESCAPE '\\\\' OR email LIKE ? ESCAPE '\\\\'",
    values: [pattern, pattern, pattern]
  };
}

export async function listAdminAccounts(query, database = pool) {
  const { page, limit, q } = query;
  const { sql, values } = searchClause(q);
  const offset = (page - 1) * limit;
  const [[countRows], [rows]] = await Promise.all([
    database.execute(`SELECT COUNT(*) AS total FROM admins${sql}`, values),
    database.execute(
      `SELECT id, name, username, email, role, is_active, created_at
       FROM admins${sql}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    )
  ]);
  const total = Number(countRows[0]?.total ?? 0);

  return {
    data: rows.map((admin) => ({
      id: admin.id,
      name: admin.name,
      username: admin.username,
      email: admin.email,
      role: admin.role,
      isActive: Number(admin.is_active) === 1,
      createdAt: admin.created_at
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

export async function createAdminAccount(database, input, actorAdminId) {
  if (input.role === 'Super Admin' && input.confirmSuperAdmin !== true) {
    throw new HttpError(400, 'Explicitly confirm creation of a Super Admin account.');
  }

  const passwordHash = await hashAdminPassword(input.password);
  let transactionStarted = false;
  try {
    await database.beginTransaction();
    transactionStarted = true;

    const [admins] = await database.execute(
      'SELECT id, role, is_active FROM admins ORDER BY id FOR UPDATE'
    );
    const actor = admins.find((admin) => String(admin.id) === String(actorAdminId));
    if (!actor || actor.role !== 'Super Admin' || Number(actor.is_active) !== 1) {
      throw new HttpError(403, 'Super Admin privileges are required.');
    }
    const [roleRows] = await database.execute(
      'SELECT role_key, is_active FROM permission_roles WHERE label = ? LIMIT 1 FOR UPDATE',
      [input.role]
    );
    if (!roleRows[0] || Number(roleRows[0].is_active) !== 1) {
      throw new HttpError(400, 'The administrator role is inactive or not supported.');
    }

    const [existing] = await database.execute(
      'SELECT id FROM admins WHERE username = ? LIMIT 1 FOR UPDATE',
      [input.username]
    );
    if (existing.length) {
      throw new HttpError(409, 'An administrator account already uses this username.');
    }

    const [existingEmail] = await database.execute(
      'SELECT id FROM admins WHERE email = ? LIMIT 1 FOR UPDATE',
      [input.email]
    );
    if (existingEmail.length) {
      throw new HttpError(409, 'An administrator account already uses this email address.');
    }

    const [result] = await database.execute(
      `INSERT INTO admins (name, username, email, password_hash, role, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [input.name, input.username, input.email, passwordHash, input.role, input.isActive ? 1 : 0]
    );
    const [createdRows] = await database.execute(
      `SELECT id, name, username, email, role, is_active, created_at
       FROM admins WHERE id = ? LIMIT 1`,
      [result.insertId]
    );
    if (!createdRows[0]) {
      throw new Error('The created administrator account could not be loaded.');
    }

    await database.commit();
    transactionStarted = false;
    const created = createdRows[0];
    return {
      id: created.id,
      name: created.name,
      username: created.username,
      email: created.email,
      role: created.role,
      isActive: Number(created.is_active) === 1,
      createdAt: created.created_at
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await database.rollback();
      } catch {
        throw new Error(
          'Administrator creation failed and the database rollback could not be confirmed.'
        );
      }
    }
    if (error.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'An administrator account already uses this username or email address.');
    }
    throw error;
  }
}
