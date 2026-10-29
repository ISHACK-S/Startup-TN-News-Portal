import { Router } from 'express';
import {
  categoriesController,
  publicArticleController,
  publicNewsController
} from '../controllers/article.controller.js';
import { validate } from '../middleware/validate.js';
import {
  publicArticleParamsSchema,
  publicNewsQuerySchema
} from '../validation/article.schemas.js';

export const publicRouter = Router();

publicRouter.get('/categories', categoriesController);
publicRouter.get('/news', validate(publicNewsQuerySchema, 'query'), publicNewsController);
publicRouter.get('/news/', validate(publicNewsQuerySchema, 'query'), publicNewsController);
publicRouter.get('/news/:slug', validate(publicArticleParamsSchema, 'params'), publicArticleController);
