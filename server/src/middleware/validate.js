import { HttpError } from '../errors/http-error.js';

export function validate(schema, source = 'body') {
  return function validateRequest(request, response, next) {
    const result = schema.safeParse(request[source]);

    if (!result.success) {
      return next(
        new HttpError(400, 'Request validation failed.', {
          details: result.error.issues.map(({ path, message }) => ({
            path: path.join('.'),
            message
          }))
        })
      );
    }

    request.validated = request.validated ?? {};
    request.validated[source] = result.data;
    return next();
  };
}
