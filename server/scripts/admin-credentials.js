import { z } from 'zod';

const emailSchema = z.string().trim().email().max(254).transform((email) => email.toLowerCase());
const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters.')
  .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes.')
  .refine(
    (password) =>
      [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length === 4,
    'Password must include lowercase and uppercase letters, a number, and a symbol.'
  );

const credentialUpdateSchema = z
  .object({
    currentEmail: emailSchema,
    newEmail: emailSchema,
    newPassword: passwordSchema,
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
      'UPDATE admins SET email = ?, password_hash = ? WHERE id = ?',
      [newEmail, passwordHash, admin.id]
    );
    if (updateResult.affectedRows !== 1) {
      throw new Error('The administrator record was not updated.');
    }

    const [sessionResult] = await connection.execute(
      `DELETE FROM admin_sessions
       WHERE JSON_UNQUOTE(JSON_EXTRACT(session_data, '$.adminId')) = ?`,
      [String(admin.id)]
    );

    await connection.commit();
    transactionStarted = false;
    return { sessionsInvalidated: sessionResult.affectedRows };
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
