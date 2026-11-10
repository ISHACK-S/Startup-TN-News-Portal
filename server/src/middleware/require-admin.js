import { pool } from '../database/pool.js';
import { HttpError } from '../errors/http-error.js';
import { resolvePermissionForAdmin } from '../services/permissions.service.js';

function clearSessionCookie(request, response) {
  response.clearCookie('startuptn.sid', {
    httpOnly: true,
    secure: request.secure,
    sameSite: 'strict'
  });
}

function destroyStaleSession(request, response, next, optional) {
  if (!request.session) {
    request.admin = null;
    return optional ? next() : next(new HttpError(401, 'Authentication is required.'));
  }

  request.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }
    clearSessionCookie(request, response);
    request.admin = null;
    if (optional) {
      next();
      return;
    }
    next(new HttpError(401, 'Authentication is required.'));
  });
}

function loadCurrentAdmin(request, response, next, optional) {
  const session = request.session;
  if (!session?.adminId) {
    request.admin = null;
    if (optional) return next();
    return next(new HttpError(401, 'Authentication is required.'));
  }

  const database = request.app.locals.database ?? pool;
  database.execute(
    `SELECT id, name, username, email, role, is_active, auth_version
     FROM admins WHERE id = ? LIMIT 1`,
    [session.adminId]
  ).then(([rows]) => {
    const account = rows[0];
    const sessionVersion = Number(session.authVersion ?? 0);
    if (
      !account
      || Number(account.is_active) !== 1
      || sessionVersion !== Number(account.auth_version)
    ) {
      destroyStaleSession(request, response, next, optional);
      return;
    }

    database.execute(
      'SELECT role_key, is_active FROM permission_roles WHERE label = ? LIMIT 1',
      [account.role]
    ).then(([roleRows]) => {
      if (!roleRows[0] || Number(roleRows[0].is_active) !== 1) {
        destroyStaleSession(request, response, next, optional);
        return;
      }
      request.admin = {
        id: account.id,
        name: account.name,
        username: account.username,
        email: account.email,
        role: account.role,
        authVersion: Number(account.auth_version)
      };
      next();
    }).catch(next);
  }).catch(next);
}

export function requireAdmin(request, response, next) {
  return loadCurrentAdmin(request, response, next, false);
}

export function optionalAdmin(request, response, next) {
  return loadCurrentAdmin(request, response, next, true);
}

export function requireSuperAdmin(request, response, next) {
  return requireAdmin(request, response, (error) => {
    if (error) return next(error);
    if (request.admin.role !== 'Super Admin') {
      return next(new HttpError(403, 'Super Admin privileges are required.'));
    }
    return next();
  });
}

export function requirePermission(moduleId, actionId) {
  return function requireCurrentPermission(request, response, next) {
    requireAdmin(request, response, (error) => {
      if (error) return next(error);
      const database = request.app.locals.database ?? pool;
      resolvePermissionForAdmin(
        request.admin.role,
        request.admin.id,
        moduleId,
        actionId,
        database
      ).then((allowed) => {
        if (!allowed) {
          next(new HttpError(403, 'You do not have permission to perform this action.'));
          return;
        }
        next();
      }).catch(next);
    });
  };
}
