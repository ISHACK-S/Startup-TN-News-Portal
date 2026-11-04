import { Router } from 'express';
import {
  createHeroSlideController,
  createVideoController,
  createWebStoryController,
  deleteHeroSlideController,
  deleteVideoController,
  deleteWebStoryController,
  getAdminWebStoryController,
  getHeroSlideController,
  getMediaAssetController,
  getVideoController,
  listHeroSlidesController,
  listMediaAssetsController,
  listVideosController,
  listWebStoriesController,
  updateHeroSlideController,
  updateVideoController,
  updateWebStoryController,
  uploadLibraryImageController
} from '../controllers/content-management.controller.js';
import { receiveImage } from '../middleware/image-upload.js';
import { requirePermission } from '../middleware/require-admin.js';
import { validate } from '../middleware/validate.js';
import {
  contentIdParamsSchema,
  heroCreateSchema,
  heroListQuerySchema,
  heroPatchSchema,
  mediaListQuerySchema,
  videoCreateSchema,
  videoListQuerySchema,
  videoPatchSchema,
  webStoryCreateSchema,
  webStoryListQuerySchema,
  webStoryPatchSchema
} from '../validation/content-management.schemas.js';

export const adminMediaRouter = Router();
adminMediaRouter.get('/', validate(mediaListQuerySchema, 'query'), requirePermission('media-library', 'view'), listMediaAssetsController);
adminMediaRouter.post('/uploads', requirePermission('media-library', 'create'), receiveImage, uploadLibraryImageController);
adminMediaRouter.get('/:id', validate(contentIdParamsSchema, 'params'), requirePermission('media-library', 'view'), getMediaAssetController);

export const adminWebStoriesRouter = Router();
const storyCreatePublish = (request, response, next) => request.validated.body.status !== 'published'
  ? next()
  : requirePermission('web-stories', 'publish')(request, response, next);
const storyUpdatePublish = (request, response, next) => request.validated.body.status !== 'published'
  ? next()
  : requirePermission('web-stories', 'publish')(request, response, next);
adminWebStoriesRouter.get('/', validate(webStoryListQuerySchema, 'query'), requirePermission('web-stories', 'view'), listWebStoriesController);
adminWebStoriesRouter.get('/:id', validate(contentIdParamsSchema, 'params'), requirePermission('web-stories', 'view'), getAdminWebStoryController);
adminWebStoriesRouter.post('/', validate(webStoryCreateSchema), requirePermission('web-stories', 'create'), storyCreatePublish, createWebStoryController);
adminWebStoriesRouter.patch('/:id', validate(contentIdParamsSchema, 'params'), validate(webStoryPatchSchema), requirePermission('web-stories', 'edit'), storyUpdatePublish, updateWebStoryController);
adminWebStoriesRouter.delete('/:id', validate(contentIdParamsSchema, 'params'), requirePermission('web-stories', 'delete'), deleteWebStoryController);

export const adminHeroSlidesRouter = Router();
const heroPublish = (request, response, next) => request.validated.body.status !== 'published'
  ? next()
  : requirePermission('hero-slider', 'publish')(request, response, next);
adminHeroSlidesRouter.get('/', validate(heroListQuerySchema, 'query'), requirePermission('hero-slider', 'view'), listHeroSlidesController);
adminHeroSlidesRouter.get('/:id', validate(contentIdParamsSchema, 'params'), requirePermission('hero-slider', 'view'), getHeroSlideController);
adminHeroSlidesRouter.post('/', validate(heroCreateSchema), requirePermission('hero-slider', 'create'), heroPublish, createHeroSlideController);
adminHeroSlidesRouter.patch('/:id', validate(contentIdParamsSchema, 'params'), validate(heroPatchSchema), requirePermission('hero-slider', 'edit'), heroPublish, updateHeroSlideController);
adminHeroSlidesRouter.delete('/:id', validate(contentIdParamsSchema, 'params'), requirePermission('hero-slider', 'delete'), deleteHeroSlideController);

export const adminVideosRouter = Router();
const videoPublish = (request, response, next) => request.validated.body.status !== 'published'
  ? next()
  : requirePermission('video-media', 'publish')(request, response, next);
adminVideosRouter.get('/', validate(videoListQuerySchema, 'query'), requirePermission('video-media', 'view'), listVideosController);
adminVideosRouter.get('/:id', validate(contentIdParamsSchema, 'params'), requirePermission('video-media', 'view'), getVideoController);
adminVideosRouter.post('/', validate(videoCreateSchema), requirePermission('video-media', 'create'), videoPublish, createVideoController);
adminVideosRouter.patch('/:id', validate(contentIdParamsSchema, 'params'), validate(videoPatchSchema), requirePermission('video-media', 'edit'), videoPublish, updateVideoController);
adminVideosRouter.delete('/:id', validate(contentIdParamsSchema, 'params'), requirePermission('video-media', 'delete'), deleteVideoController);
