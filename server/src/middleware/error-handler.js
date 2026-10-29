import { HttpError } from '../errors/http-error.js';

export function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    return next(error);
  }

  const isExpected = error instanceof HttpError;
  const malformedJson = error.type === 'entity.parse.failed';
  const oversizedBody = error.type === 'entity.too.large';
  const statusCode = isExpected ? error.statusCode : malformedJson ? 400 : oversizedBody ? 413 : 500;
  const message = isExpected
    ? error.message
    : malformedJson
      ? 'Request body contains invalid JSON.'
      : oversizedBody
        ? 'Request body exceeds the allowed size.'
        : 'An unexpected server error occurred.';

  if (statusCode >= 500) {
    console.error(error);
  }

  return response.status(statusCode).json({
    error: {
      message,
      ...(isExpected && error.details ? { details: error.details } : {})
    }
  });
}
