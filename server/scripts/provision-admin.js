import bcrypt from 'bcrypt';
import { createInterface } from 'node:readline/promises';
import { z } from 'zod';
import { pool } from '../src/database/pool.js';

const credentialsSchema = z.object({
  ADMIN_NAME: z.string().trim().min(1).max(150),
  ADMIN_EMAIL: z.string().trim().email().max(254),
  ADMIN_PASSWORD: z
    .string()
    .min(1)
    .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes.')
});

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
          reject(new Error('Admin provisioning cancelled.'));
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

async function getCredentials() {
  const credentials = {
    ADMIN_NAME: process.env.ADMIN_NAME,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD
  };
  const missing = Object.entries(credentials)
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length && !process.stdin.isTTY) {
    throw new Error(
      `Set the missing environment variable(s) or run this command in an interactive terminal: ${missing.join(', ')}.`
    );
  }

  if (!credentials.ADMIN_NAME) {
    credentials.ADMIN_NAME = await promptText('Admin name');
  }
  if (!credentials.ADMIN_EMAIL) {
    credentials.ADMIN_EMAIL = await promptText('Admin email');
  }
  if (!credentials.ADMIN_PASSWORD) {
    credentials.ADMIN_PASSWORD = await promptHidden('Admin password');
    const confirmation = await promptHidden('Confirm admin password');
    if (credentials.ADMIN_PASSWORD !== confirmation) {
      throw new Error('The passwords do not match.');
    }
  }

  const parsed = credentialsSchema.safeParse(credentials);
  if (!parsed.success) {
    throw new Error(
      `Invalid admin credentials:\n${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('\n')}`
    );
  }
  return parsed.data;
}

async function provisionAdmin() {
  const credentials = await getCredentials();
  const connection = await pool.getConnection();
  let lockAcquired = false;

  try {
    const [lockRows] = await connection.execute(
      "SELECT GET_LOCK('startuptn_news_admin_provisioning', 10) AS acquired"
    );
    if (Number(lockRows[0].acquired) !== 1) {
      throw new Error('Could not acquire the one-time admin provisioning lock.');
    }
    lockAcquired = true;

    const [adminRows] = await connection.execute('SELECT id FROM admins LIMIT 1');
    if (adminRows.length > 0) {
      throw new Error('An admin already exists. This provisioning command can only be used once.');
    }

    const passwordHash = await bcrypt.hash(credentials.ADMIN_PASSWORD, 12);
    await connection.execute(
      'INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)',
      [credentials.ADMIN_NAME, credentials.ADMIN_EMAIL.toLowerCase(), passwordHash]
    );
    console.info(`Admin account provisioned for ${credentials.ADMIN_EMAIL.toLowerCase()}.`);
  } finally {
    try {
      if (lockAcquired) {
        await connection.execute("SELECT RELEASE_LOCK('startuptn_news_admin_provisioning')");
      }
    } finally {
      connection.release();
      await pool.end();
    }
  }
}

provisionAdmin().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
