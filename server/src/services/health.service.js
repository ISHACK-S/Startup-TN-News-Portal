import { pool } from '../database/pool.js';
import { HttpError } from '../errors/http-error.js';

export async function getHealth(database = pool) {
  try {
    await database.execute('SELECT 1');
  } catch (error) {
    throw new HttpError(503, 'The database is unavailable.', { cause: error });
  }

  return {
    status: 'ok',
    database: 'connected'
  };
}
