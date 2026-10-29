import fs from 'node:fs';
import { env } from './env.js';

const ssl = env.mysql.ssl
  ? {
      ca: fs.readFileSync(env.mysql.ssl.ca, 'utf8'),
      rejectUnauthorized: env.mysql.ssl.rejectUnauthorized
    }
  : undefined;

export const databaseConfig = {
  host: env.mysql.host,
  port: env.mysql.port,
  database: env.mysql.database,
  user: env.mysql.user,
  password: env.mysql.password,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  ...(ssl ? { ssl } : {})
};
