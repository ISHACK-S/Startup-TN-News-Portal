import { asyncHandler } from '../middleware/async-handler.js';
import { authenticateAdmin } from '../services/auth.service.js';
import {
  changeAdminPassword,
  getAdminProfile,
  updateAdminProfile
} from '../services/admin-profile.service.js';

async function withConnection(request, operation) {
  const database = request.app.locals.database;
  if (typeof database.getConnection !== 'function') return operation(database);
  const connection = await database.getConnection();
  try {
    return await operation(connection);
  } finally {
    connection.release();
  }
}

function saveUpdatedSession(request) {
  if (typeof request.session.save !== 'function') return Promise.resolve();
  return new Promise((resolve, reject) => {
    request.session.save((error) => (error ? reject(error) : resolve()));
  });
}

export const loginController = asyncHandler(async (request, response, next) => {
  const { username, password } = request.validated.body;
  const admin = await authenticateAdmin(username, password, request.app.locals.database);
  request.activityAdmin = admin;

  request.session.regenerate((error) => {
    if (error) {
      next(error);
      return;
    }

    request.session.adminId = admin.id;
    request.session.adminName = admin.name;
    request.session.adminUsername = admin.username;
    request.session.adminEmail = admin.email;
    request.session.authVersion = admin.authVersion;
    request.session.save((saveError) => {
      if (saveError) {
        next(saveError);
        return;
      }

      const publicAdmin = {
        id: admin.id,
        name: admin.name,
        username: admin.username,
        email: admin.email,
        role: admin.role
      };
      response.status(200).json({ data: { admin: publicAdmin } });
    });
  });
});

export const logoutController = asyncHandler(async (request, response, next) => {
  if (!request.session) {
    response.status(200).json({ data: { loggedOut: true } });
    return;
  }

  request.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }
    response.clearCookie('startuptn.sid', {
      httpOnly: true,
      secure: request.secure,
      sameSite: 'strict'
    });
    response.status(200).json({ data: { loggedOut: true } });
  });
});

export const meController = asyncHandler(async (request, response) => {
  if (!request.admin) {
    response.status(200).json({ data: { authenticated: false, admin: null } });
    return;
  }

  response.status(200).json({
    data: {
      authenticated: true,
      admin: {
        id: request.admin.id,
        name: request.admin.name,
        username: request.admin.username,
        email: request.admin.email,
        role: request.admin.role
      }
    }
  });
});

export const currentAdminProfileController = asyncHandler(async (request, response) => {
  const profile = await getAdminProfile(request.admin.id, request.app.locals.database);
  response.status(200).json({ data: { profile } });
});

export const updateCurrentAdminProfileController = asyncHandler(async (request, response) => {
  const result = await withConnection(request, (connection) => updateAdminProfile(
    connection,
    request.admin.id,
    request.sessionID,
    request.admin.authVersion,
    request.validated.body
  ));
  request.session.adminName = result.profile.name;
  request.session.adminUsername = result.profile.username;
  request.session.adminEmail = result.profile.email;
  request.activityChanges = {
    after: { sessionsInvalidated: result.otherSessionsInvalidated }
  };
  if (result.emailChanged || result.usernameChanged) request.session.authVersion = result.authVersion;
  if (result.emailChanged || result.usernameChanged) await saveUpdatedSession(request);
  response.status(200).json({
    data: { profile: result.profile },
    meta: {
      emailChanged: result.emailChanged,
      usernameChanged: result.usernameChanged,
      otherSessionsInvalidated: result.otherSessionsInvalidated
    }
  });
});

export const changeCurrentAdminPasswordController = asyncHandler(async (request, response) => {
  const result = await withConnection(request, (connection) => changeAdminPassword(
    connection,
    request.admin.id,
    request.sessionID,
    request.admin.authVersion,
    request.validated.body
  ));
  request.session.authVersion = result.authVersion;
  request.activityChanges = {
    after: { sessionsInvalidated: result.otherSessionsInvalidated }
  };
  await saveUpdatedSession(request);
  response.status(200).json({
    data: { changed: true },
    meta: { otherSessionsInvalidated: result.otherSessionsInvalidated }
  });
});
