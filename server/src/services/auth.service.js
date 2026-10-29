import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { pool } from '../database/pool.js';
import { HttpError } from '../errors/http-error.js';

const DUMMY_PASSWORD_HASH = bcrypt.hash(randomBytes(32).toString('hex'), 12);

export async function authenticateAdmin(email, password, database = pool) {
  const [rows] = await database.execute(
    'SELECT id, name, email, password_hash FROM admins WHERE email = ? LIMIT 1',
    [email.toLowerCase()]
  );
  const admin = rows[0];
  const hash = admin?.password_hash ?? (await DUMMY_PASSWORD_HASH);
  const passwordMatches = await bcrypt.compare(password, hash);

  if (!admin || !passwordMatches) {
    throw new HttpError(401, 'Invalid email or password.');
  }

  return {
    id: admin.id,
    name: admin.name,
    email: admin.email
  };
}
