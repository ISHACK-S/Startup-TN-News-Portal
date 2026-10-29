import { HttpError } from '../errors/http-error.js';

export function notFound(request, response, next) {
  next(new HttpError(404, `Route not found: ${request.method} ${request.originalUrl}`));
}
