import { HttpError } from '../errors/http-error.js';

export function requireAdmin(request, response, next) {
  if (!request.session?.adminId) {
    return next(new HttpError(401, 'Authentication is required.'));
  }

  return next();
}
