import { asyncHandler } from '../middleware/async-handler.js';
import { HttpError } from '../errors/http-error.js';
import {
  detectSupportedImage,
  uploadImageToCloudinary
} from '../services/image-upload.service.js';
import { registerMediaAsset } from '../services/content-management.service.js';

export const imageUploadController = asyncHandler(async (request, response) => {
  if (!request.file) {
    throw new HttpError(400, 'Provide one image in the "image" form field.');
  }

  const buffer = request.file.buffer;
  try {
    const detectedType = await detectSupportedImage(buffer);
    const upload = request.app.locals.imageUploader ?? uploadImageToCloudinary;
    const result = await upload(buffer, detectedType);
    await registerMediaAsset(
      result,
      request.file.originalname,
      request.admin?.id ?? request.session.adminId,
      request.app.locals.database
    );
    response.status(201).json({ data: result });
  } finally {
    buffer.fill(0);
  }
});
