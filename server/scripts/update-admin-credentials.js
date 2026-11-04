import { createInterface } from 'node:readline/promises';
import { pool } from '../src/database/pool.js';
import { hashAdminPassword } from '../src/services/admin-password.service.js';
import { CredentialUpdateError, parseCredentialUpdate, updateAdminCredentials } from './admin-credentials.js';

async function promptText(label) {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await terminal.question(`${label}: `);
  } finally {
    terminal.close();
  }
}

function promptHidden(label) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    return Promise.reject(new Error('Interactive password entry requires a TTY.'));
  }

  return new Promise((resolve, reject) => {
    let value = '';
    const restoreTerminal = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003' || character === '\u0004') {
          restoreTerminal();
          process.stdout.write('\n');
          reject(new CredentialUpdateError('Credential update cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          restoreTerminal();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (character === '\u0008' || character === '\u007f') {
          value = Array.from(value).slice(0, -1).join('');
          continue;
        }
        if (character >= ' ') {
          value += character;
        }
      }
    };

    process.stdout.write(`${label} (input hidden): `);
    process.stdin.setEncoding('utf8');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

async function main() {
  let connection;
  let exitCode = 0;
  try {
    if (!process.stdin.isTTY) {
      throw new CredentialUpdateError('Run this command from an interactive terminal.');
    }

    const credentials = parseCredentialUpdate({
      currentEmail: await promptText('Current admin email'),
      newEmail: await promptText('New admin email'),
      newPassword: await promptHidden('New admin password'),
      passwordConfirmation: await promptHidden('Confirm new admin password')
    });
    const passwordHash = await hashAdminPassword(credentials.newPassword);

    connection = await pool.getConnection();
    const result = await updateAdminCredentials(connection, {
      currentEmail: credentials.currentEmail,
      newEmail: credentials.newEmail,
      passwordHash
    });
    console.info(`Administrator credentials updated. ${result.sessionsInvalidated} existing session(s) invalidated.`);
  } catch (error) {
    exitCode = 1;
    if (error instanceof CredentialUpdateError) {
      console.error(error.message);
    } else {
      console.error('Credential update failed. No sensitive details were logged; check the database configuration and account state.');
    }
  } finally {
    connection?.release();
    try {
      await pool.end();
    } catch {
      if (exitCode === 0) {
        console.error('Credentials were updated, but the database connection did not close cleanly.');
        exitCode = 1;
      }
    }
  }
  process.exitCode = exitCode;
}

main();
