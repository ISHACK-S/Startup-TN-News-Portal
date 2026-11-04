import { z } from 'zod';
import { deleteAdminSessions } from '../src/database/session-store.js';
import { adminPasswordSchema } from '../src/validation/admin-password.js';

const emailSchema = z.string().trim().email().max(254).transform((email) => email.toLowerCase());

const credentialUpdateSchema = z
  .object({
    currentEmail: emailSchema,
    newEmail: emailSchema,
    newPassword: adminPasswordSchema,
    passwordConfirmation: z.string()
  })
  .refine((credentials) => credentials.newPassword === credentials.passwordConfirmation, {
    path: ['passwordConfirmation'],
    message: 'The passwords do not match.'
  });

export class CredentialUpdateError extends Error {}

export function parseCredentialUpdate(input) {
  const parsed = credentialUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new CredentialUpdateError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n')
    );
  }
  return parsed.data;
}

export async function updateAdminCredentials(connection, { currentEmail, newEmail, passwordHash }) {
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [adminRows] = await connection.execute(
      'SELECT id FROM admins WHERE email = ? LIMIT 1 FOR UPDATE',
      [currentEmail]
    );
    const admin = adminRows[0];
    if (!admin) {
      throw new CredentialUpdateError('No administrator account matches the current email address.');
    }

    const [matchingAdmins] = await connection.execute(
      'SELECT id FROM admins WHERE email = ? AND id <> ? LIMIT 1 FOR UPDATE',
      [newEmail, admin.id]
    );
    if (matchingAdmins.length > 0) {
      throw new CredentialUpdateError('The new email address is already assigned to another administrator.');
    }

    const [updateResult] = await connection.execute(
      'UPDATE admins SET email = ?, password_hash = ?, auth_version = auth_version + 1 WHERE id = ?',
      [newEmail, passwordHash, admin.id]
    );
    if (updateResult.affectedRows !== 1) {
      throw new Error('The administrator record was not updated.');
    }

    const sessionsInvalidated = await deleteAdminSessions(connection, admin.id);

    await connection.commit();
    transactionStarted = false;
    return { sessionsInvalidated };
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        throw new CredentialUpdateError(
          'Credential update failed and the database rollback could not be confirmed. Check the account before retrying.'
        );
      }
    }
    if (error.code === 'ER_DUP_ENTRY') {
      throw new CredentialUpdateError('The new email address is already assigned to another administrator.');
    }
    throw error;
  }
}
