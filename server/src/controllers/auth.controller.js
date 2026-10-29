import { asyncHandler } from '../middleware/async-handler.js';
import { authenticateAdmin } from '../services/auth.service.js';

export const loginController = asyncHandler(async (request, response, next) => {
  const { email, password } = request.validated.body;
  const admin = await authenticateAdmin(email, password, request.app.locals.database);

  request.session.regenerate((error) => {
    if (error) {
      next(error);
      return;
    }

    request.session.adminId = admin.id;
    request.session.adminName = admin.name;
    request.session.adminEmail = admin.email;
    request.session.save((saveError) => {
      if (saveError) {
        next(saveError);
        return;
      }

      response.status(200).json({ data: { admin } });
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
  if (!request.session?.adminId) {
    response.status(200).json({ data: { authenticated: false, admin: null } });
    return;
  }

  response.status(200).json({
    data: {
      authenticated: true,
      admin: {
        id: request.session.adminId,
        name: request.session.adminName,
        email: request.session.adminEmail
      }
    }
  });
});
