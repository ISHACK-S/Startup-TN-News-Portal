import { Router } from 'express';
import {
  categoriesController,
  publicArticleController,
  publicNewsController
} from '../controllers/article.controller.js';
import {
  publicHeroSlidesController,
  publicVideosController,
  publicWebStoriesController,
  publicWebStoryController
} from '../controllers/content-management.controller.js';
import { validate } from '../middleware/validate.js';
import {
  publicArticleParamsSchema,
  publicNewsQuerySchema
} from '../validation/article.schemas.js';
import {
  heroListQuerySchema,
  videoListQuerySchema,
  webStoryListQuerySchema,
  webStorySlugParamsSchema
} from '../validation/content-management.schemas.js';

export const publicRouter = Router();

publicRouter.get('/categories', categoriesController);
publicRouter.get('/hero-slides', validate(heroListQuerySchema, 'query'), publicHeroSlidesController);
publicRouter.get('/videos', validate(videoListQuerySchema, 'query'), publicVideosController);
publicRouter.get('/web-stories', validate(webStoryListQuerySchema, 'query'), publicWebStoriesController);
publicRouter.get('/web-stories/:slug', validate(webStorySlugParamsSchema, 'params'), publicWebStoryController);
publicRouter.get('/news', validate(publicNewsQuerySchema, 'query'), publicNewsController);
publicRouter.get('/news/', validate(publicNewsQuerySchema, 'query'), publicNewsController);
publicRouter.get('/news/:slug', validate(publicArticleParamsSchema, 'params'), publicArticleController);
