import { Router } from 'express';
import {
  categoriesController,
  publicArticleController,
  publicNewsController
} from '../controllers/article.controller.js';
import {
  publicFeaturedVideoController,
  publicVideoCategoriesController,
  publicVideoController,
  publicHeroSlidesController,
  publicVideosController,
  publicWebStoriesController,
  publicWebStoryController
} from '../controllers/content-management.controller.js';
import { publicWebsiteConfigurationController } from '../controllers/website-configuration.controller.js';
import { validate } from '../middleware/validate.js';
import {
  publicArticleParamsSchema,
  publicNewsQuerySchema
} from '../validation/article.schemas.js';
import {
  contentIdParamsSchema,
  heroListQuerySchema,
  videoListQuerySchema,
  webStoryListQuerySchema,
  webStorySlugParamsSchema
} from '../validation/content-management.schemas.js';

export const publicRouter = Router();

publicRouter.get('/site-config', publicWebsiteConfigurationController);
publicRouter.get('/categories', categoriesController);
publicRouter.get('/hero-slides', validate(heroListQuerySchema, 'query'), publicHeroSlidesController);
publicRouter.get('/videos/categories', publicVideoCategoriesController);
publicRouter.get('/videos/featured', publicFeaturedVideoController);
publicRouter.get('/videos', validate(videoListQuerySchema, 'query'), publicVideosController);
publicRouter.get('/videos/:id', validate(contentIdParamsSchema, 'params'), publicVideoController);
publicRouter.get('/web-stories', validate(webStoryListQuerySchema, 'query'), publicWebStoriesController);
publicRouter.get('/web-stories/:slug', validate(webStorySlugParamsSchema, 'params'), publicWebStoryController);
publicRouter.get('/news', validate(publicNewsQuerySchema, 'query'), publicNewsController);
publicRouter.get('/news/', validate(publicNewsQuerySchema, 'query'), publicNewsController);
publicRouter.get('/news/:slug', validate(publicArticleParamsSchema, 'params'), publicArticleController);
