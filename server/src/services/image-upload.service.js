import { randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { HttpError } from '../errors/http-error.js';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function detectSupportedImage(buffer) {
  const detectedType = await fileTypeFromBuffer(buffer);
  if (!detectedType || !allowedMimeTypes.has(detectedType.mime)) {
    throw new HttpError(415, 'Only JPEG, PNG, and WebP image content is accepted.');
  }

  return detectedType;
}

export async function uploadImageToCloudinary(buffer, detectedType) {
  try {
    if (!env.cloudinary) {
      throw new HttpError(503, 'Image uploads are not configured.');
    }

    cloudinary.config({
      cloud_name: env.cloudinary.cloudName,
      api_key: env.cloudinary.apiKey,
      api_secret: env.cloudinary.apiSecret,
      secure: true
    });

    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'startuptn-news/articles',
          public_id: randomUUID(),
          resource_type: 'image',
          format: detectedType.ext,
          overwrite: false,
          unique_filename: false,
          allowed_formats: ['jpg', 'png', 'webp']
        },
        (error, uploadedAsset) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(uploadedAsset);
        }
      );

      uploadStream.end(buffer);
    });

    if (
      typeof result?.secure_url !== 'string'
      || new URL(result.secure_url).protocol !== 'https:'
      || typeof result?.public_id !== 'string'
      || !result.public_id
    ) {
      throw new Error('Cloudinary returned an incomplete upload result.');
    }

    return {
      url: result.secure_url,
      provider_id: result.public_id
    };
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(502, 'The image provider could not complete the upload.', { cause: error });
  } finally {
    buffer.fill(0);
  }
}
