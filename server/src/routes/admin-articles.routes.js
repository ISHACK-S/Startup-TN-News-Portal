import { Router } from 'express';
import {
  adminArticlesController,
  adminArticleController,
  createArticleController,
  deleteArticleController,
  updateArticleController
} from '../controllers/article.controller.js';
import { requireAdmin } from '../middleware/require-admin.js';
import { validate } from '../middleware/validate.js';
import {
  articleCreateSchema,
  articleDeleteSchema,
  articleIdParamsSchema,
  articleListQuerySchema,
  articlePatchSchema
} from '../validation/article.schemas.js';

export const adminArticleRouter = Router();

adminArticleRouter.use(requireAdmin);
adminArticleRouter.get('/', validate(articleListQuerySchema, 'query'), adminArticlesController);
adminArticleRouter.get('/:id', validate(articleIdParamsSchema, 'params'), adminArticleController);
adminArticleRouter.post('/', validate(articleCreateSchema), createArticleController);
adminArticleRouter.patch('/', validate(articlePatchSchema), updateArticleController);
adminArticleRouter.delete('/', validate(articleDeleteSchema), deleteArticleController);
