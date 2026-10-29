import { app } from './app.js';
import { env } from './config/env.js';
import { pool } from './database/pool.js';

const sessionStore = app.locals.sessionStore;
const server = app.listen(env.port, () => {
  console.info(`StartupTN News API listening on port ${env.port}.`);
});

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.info(`${signal} received; closing the HTTP server and database pool.`);

  server.close(async (error) => {
    if (error) {
      console.error('Failed to close the HTTP server cleanly.', error);
      process.exitCode = 1;
    }

    try {
      sessionStore.close();
      await pool.end();
    } catch (poolError) {
      console.error('Failed to close the database pool cleanly.', poolError);
      process.exitCode = 1;
    }
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
