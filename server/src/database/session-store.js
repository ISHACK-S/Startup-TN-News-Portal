import session from 'express-session';

const SESSION_TTL_SECONDS = 8 * 60 * 60;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

export class MySqlSessionStore extends session.Store {
  constructor(database) {
    super();
    this.database = database;
    this.cleanupInterval = setInterval(() => {
      this.database
        .execute('DELETE FROM admin_sessions WHERE expires_at <= ?', [Math.floor(Date.now() / 1000)])
        .catch((error) => {
          console.error('Failed to remove expired admin sessions.', error);
        });
    }, CLEANUP_INTERVAL_MS);
    this.cleanupInterval.unref();
  }

  get(sessionId, callback) {
    this.database
      .execute(
        'SELECT session_data, expires_at FROM admin_sessions WHERE session_id = ? LIMIT 1',
        [sessionId]
      )
      .then(async ([rows]) => {
        const row = rows[0];
        if (!row) {
          callback(null, null);
          return;
        }

        if (Number(row.expires_at) <= Math.floor(Date.now() / 1000)) {
          await this.database.execute('DELETE FROM admin_sessions WHERE session_id = ?', [sessionId]);
          callback(null, null);
          return;
        }

        callback(null, JSON.parse(row.session_data));
      })
      .catch(callback);
  }

  set(sessionId, sessionData, callback = () => {}) {
    const expiresAt = sessionData.cookie?.expires
      ? Math.floor(new Date(sessionData.cookie.expires).getTime() / 1000)
      : Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

    this.database
      .execute(
        `INSERT INTO admin_sessions (session_id, expires_at, session_data)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at), session_data = VALUES(session_data)`,
        [sessionId, expiresAt, JSON.stringify(sessionData)]
      )
      .then(() => callback(null))
      .catch(callback);
  }

  touch(sessionId, sessionData, callback = () => {}) {
    const expiresAt = sessionData.cookie?.expires
      ? Math.floor(new Date(sessionData.cookie.expires).getTime() / 1000)
      : Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

    this.database
      .execute('UPDATE admin_sessions SET expires_at = ? WHERE session_id = ?', [expiresAt, sessionId])
      .then(() => callback(null))
      .catch(callback);
  }

  destroy(sessionId, callback = () => {}) {
    this.database
      .execute('DELETE FROM admin_sessions WHERE session_id = ?', [sessionId])
      .then(() => callback(null))
      .catch(callback);
  }

  close() {
    clearInterval(this.cleanupInterval);
  }
}
