import { asyncHandler } from '../middleware/async-handler.js';
import { HttpError } from '../errors/http-error.js';
import {
  createHeroSlide,
  createVideo,
  createWebStory,
  deleteHeroSlide,
  deleteVideo,
  deleteWebStory,
  getAdminWebStory,
  getHeroSlide,
  getMediaAsset,
  getPublicWebStory,
  getVideo,
  listHeroSlides,
  listMediaAssets,
  listVideos,
  listWebStories,
  updateHeroSlide,
  updateVideo,
  updateWebStory
} from '../services/content-management.service.js';
import { registerMediaAsset } from '../services/content-management.service.js';
import { detectSupportedImage, uploadImageToCloudinary } from '../services/image-upload.service.js';

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

function requireRecord(record, label) {
  if (!record) throw new HttpError(404, `${label} not found.`);
  return record;
}

export const listMediaAssetsController = asyncHandler(async (request, response) => {
  response.status(200).json(await listMediaAssets(request.validated.query, request.app.locals.database));
});

export const getMediaAssetController = asyncHandler(async (request, response) => {
  const record = await getMediaAsset(request.validated.params.id, request.app.locals.database);
  response.status(200).json({ data: requireRecord(record, 'Media asset') });
});

export const uploadLibraryImageController = asyncHandler(async (request, response) => {
  if (!request.file) throw new HttpError(400, 'Provide one image in the "image" form field.');
  const buffer = request.file.buffer;
  try {
    const detectedType = await detectSupportedImage(buffer);
    const upload = request.app.locals.imageUploader ?? uploadImageToCloudinary;
    const asset = await upload(buffer, detectedType);
    const record = await registerMediaAsset(
      asset, request.file.originalname, request.admin.id, request.app.locals.database
    );
    response.status(201).json({ data: record });
  } finally {
    buffer.fill(0);
  }
});

export const listWebStoriesController = asyncHandler(async (request, response) => {
  response.status(200).json(await listWebStories(
    request.validated.query, request.app.locals.database
  ));
});

export const getAdminWebStoryController = asyncHandler(async (request, response) => {
  const record = await getAdminWebStory(request.validated.params.id, request.app.locals.database);
  response.status(200).json({ data: requireRecord(record, 'Web story') });
});

export const createWebStoryController = asyncHandler(async (request, response) => {
  const record = await withConnection(request, (connection) => createWebStory(
    request.validated.body, request.admin.id, connection
  ));
  response.status(201).json({ data: record });
});

export const updateWebStoryController = asyncHandler(async (request, response) => {
  const record = await withConnection(request, (connection) => updateWebStory(
    request.validated.params.id, request.validated.body, connection
  ));
  response.status(200).json({ data: record });
});

export const deleteWebStoryController = asyncHandler(async (request, response) => {
  await deleteWebStory(request.validated.params.id, request.app.locals.database);
  response.status(200).json({ data: { deleted: true } });
});

export const publicWebStoriesController = asyncHandler(async (request, response) => {
  response.status(200).json(await listWebStories(
    request.validated.query, request.app.locals.database, { publicOnly: true }
  ));
});

export const publicWebStoryController = asyncHandler(async (request, response) => {
  const record = await getPublicWebStory(request.validated.params.slug, request.app.locals.database);
  response.status(200).json({ data: requireRecord(record, 'Web story') });
});

export const listHeroSlidesController = asyncHandler(async (request, response) => {
  response.status(200).json(await listHeroSlides(
    request.validated.query, request.app.locals.database
  ));
});

export const getHeroSlideController = asyncHandler(async (request, response) => {
  const record = await getHeroSlide(request.validated.params.id, request.app.locals.database);
  response.status(200).json({ data: requireRecord(record, 'Hero slide') });
});

export const createHeroSlideController = asyncHandler(async (request, response) => {
  const record = await createHeroSlide(
    request.validated.body, request.admin.id, request.app.locals.database
  );
  response.status(201).json({ data: record });
});

export const updateHeroSlideController = asyncHandler(async (request, response) => {
  const record = await updateHeroSlide(
    request.validated.params.id, request.validated.body, request.app.locals.database
  );
  response.status(200).json({ data: record });
});

export const deleteHeroSlideController = asyncHandler(async (request, response) => {
  await deleteHeroSlide(request.validated.params.id, request.app.locals.database);
  response.status(200).json({ data: { deleted: true } });
});

export const publicHeroSlidesController = asyncHandler(async (request, response) => {
  response.status(200).json(await listHeroSlides(
    request.validated.query, request.app.locals.database, { publicOnly: true }
  ));
});

export const listVideosController = asyncHandler(async (request, response) => {
  response.status(200).json(await listVideos(
    request.validated.query, request.app.locals.database
  ));
});

export const getVideoController = asyncHandler(async (request, response) => {
  const record = await getVideo(request.validated.params.id, request.app.locals.database);
  response.status(200).json({ data: requireRecord(record, 'Video entry') });
});

export const createVideoController = asyncHandler(async (request, response) => {
  const record = await createVideo(
    request.validated.body, request.admin.id, request.app.locals.database
  );
  response.status(201).json({ data: record });
});

export const updateVideoController = asyncHandler(async (request, response) => {
  const record = await updateVideo(
    request.validated.params.id, request.validated.body, request.app.locals.database
  );
  response.status(200).json({ data: record });
});

export const deleteVideoController = asyncHandler(async (request, response) => {
  await deleteVideo(request.validated.params.id, request.app.locals.database);
  response.status(200).json({ data: { deleted: true } });
});

export const publicVideosController = asyncHandler(async (request, response) => {
  response.status(200).json(await listVideos(
    request.validated.query, request.app.locals.database, { publicOnly: true }
  ));
});
