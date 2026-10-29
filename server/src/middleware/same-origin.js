import { env } from '../config/env.js';
import { HttpError } from '../errors/http-error.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function requireSameOrigin(request, response, next) {
  const origin = request.get('origin');

  if (STATE_CHANGING_METHODS.has(request.method) && origin && origin !== env.clientOrigin) {
    return next(new HttpError(403, 'Cross-origin state changes are not allowed.'));
  }

  return next();
}
