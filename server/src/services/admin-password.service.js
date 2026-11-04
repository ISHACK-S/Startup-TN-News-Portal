import bcrypt from 'bcrypt';

export function hashAdminPassword(password) {
  return bcrypt.hash(password, 12);
}
