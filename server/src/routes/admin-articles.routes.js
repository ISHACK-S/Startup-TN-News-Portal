import { Router } from 'express';
import {
  adminArticlesController,
  adminArticleController,
  createArticleController,
  deleteArticleController,
  updateArticleController
} from '../controllers/article.controller.js';
import { requirePermission } from '../middleware/require-admin.js';
import { validate } from '../middleware/validate.js';
import {
  articleCreateSchema,
  articleDeleteSchema,
  articleIdParamsSchema,
  articleListQuerySchema,
  articlePatchSchema
} from '../validation/article.schemas.js';

export const adminArticleRouter = Router();

const requireArticlePublish = (request, response, next) => {
  if (request.validated.body.status !== 'published') return next();
  return requirePermission('news-articles', 'publish')(request, response, next);
};

adminArticleRouter.get(
  '/',
  validate(articleListQuerySchema, 'query'),
  requirePermission('news-articles', 'view'),
  adminArticlesController
);
adminArticleRouter.get(
  '/:id',
  validate(articleIdParamsSchema, 'params'),
  requirePermission('news-articles', 'view'),
  adminArticleController
);
adminArticleRouter.post(
  '/',
  validate(articleCreateSchema),
  requirePermission('news-articles', 'create'),
  requireArticlePublish,
  createArticleController
);
adminArticleRouter.patch(
  '/',
  validate(articlePatchSchema),
  requirePermission('news-articles', 'edit'),
  requireArticlePublish,
  updateArticleController
);
adminArticleRouter.delete(
  '/',
  validate(articleDeleteSchema),
  requirePermission('news-articles', 'delete'),
  deleteArticleController
);
