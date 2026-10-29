import multer from 'multer';
import { HttpError } from '../errors/http-error.js';
import { env } from '../config/env.js';

const parseImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.uploadMaxFileSizeBytes,
    files: 1,
    fields: 0,
    parts: 1
  }
}).single('image');

export function receiveImage(request, response, next) {
  parseImage(request, response, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(new HttpError(413, `Image exceeds the ${env.uploadMaxFileSizeBytes / 1024 / 1024} MB limit.`));
      return;
    }

    if (error instanceof multer.MulterError) {
      next(new HttpError(400, 'Upload must contain one file in the "image" field.'));
      return;
    }

    next(error);
  });
}
