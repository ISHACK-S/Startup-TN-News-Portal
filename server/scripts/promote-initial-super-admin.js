import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { updateAdminAuthorization } from '../src/services/auth.service.js';

const emailSchema = z.string().trim().email().max(254).transform((email) => email.toLowerCase());

async function promptText(label) {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await terminal.question(`${label}: `);
  } finally {
    terminal.close();
  }
}

async function promoteInitialSuperAdmin() {
  const { pool } = await import('../src/database/pool.js');
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Initial Super Admin assignment requires an interactive terminal.');
  }

  const emailResult = emailSchema.safeParse(await promptText('Existing admin email'));
  if (!emailResult.success) {
    throw new Error('Enter a valid administrator email address.');
  }
  const email = emailResult.data;
  try {
    const [targetRows] = await pool.execute(
      'SELECT id, name, email, role, is_active FROM admins WHERE email = ? LIMIT 1',
      [email]
    );
    const target = targetRows[0];
    if (!target || Number(target.is_active) !== 1 || target.role !== 'Admin') {
      throw new Error('The active Admin account could not be verified; no changes were made.');
    }

    const confirmationPhrase = `PROMOTE ${email} TO SUPER ADMIN`;
    console.info(`Verified target account: ${target.name} (${email}).`);
    const confirmation = await promptText(`Type "${confirmationPhrase}" to continue`);
    if (confirmation !== confirmationPhrase) {
      throw new Error('Confirmation did not match; no changes were made.');
    }

    const connection = await pool.getConnection();
    let lockAcquired = false;
    try {
      const [lockRows] = await connection.execute(
        "SELECT GET_LOCK('startuptn_news_initial_super_admin', 10) AS acquired"
      );
      if (Number(lockRows[0]?.acquired) !== 1) {
        throw new Error('Could not acquire the initial Super Admin assignment lock.');
      }
      lockAcquired = true;

      const [superAdminRows] = await connection.execute(
        "SELECT id FROM admins WHERE role = 'Super Admin' LIMIT 1"
      );
      if (superAdminRows.length > 0) {
        throw new Error('A Super Admin already exists; initial assignment is only permitted once.');
      }
      const [verifiedRows] = await connection.execute(
        'SELECT id, role, is_active FROM admins WHERE id = ? AND email = ? LIMIT 1 FOR UPDATE',
        [target.id, email]
      );
      if (
        !verifiedRows[0]
        || verifiedRows[0].role !== 'Admin'
        || Number(verifiedRows[0].is_active) !== 1
      ) {
        throw new Error('The target account changed during confirmation; no changes were made.');
      }

      const result = await updateAdminAuthorization(connection, target.id, { role: 'Super Admin' });
      console.info(
        `Initial Super Admin assigned to ${email}; ${result.sessionsInvalidated} existing session(s) invalidated.`
      );
    } finally {
      try {
        if (lockAcquired) {
          await connection.execute("SELECT RELEASE_LOCK('startuptn_news_initial_super_admin')");
        }
      } finally {
        connection.release();
      }
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  promoteInitialSuperAdmin().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
