import cors from 'cors';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { authRouter } from './routes/auth.routes.js';
import { adminArticleRouter } from './routes/admin-articles.routes.js';
import { publicRouter } from './routes/public.routes.js';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { requireSameOrigin } from './middleware/same-origin.js';
import { MySqlSessionStore } from './database/session-store.js';
import { pool } from './database/pool.js';
import { healthRouter } from './routes/health.routes.js';
import { adminUploadRouter } from './routes/admin-uploads.routes.js';
import { adminAccessControlRouter } from './routes/admin-access-control.routes.js';
import { adminPermissionsRouter } from './routes/admin-permissions.routes.js';
import {
  adminHeroSlidesRouter,
  adminMediaRouter,
  adminVideosRouter,
  adminWebStoriesRouter
} from './routes/admin-content.routes.js';

export function createApp({
  database = pool,
  sessionStore = new MySqlSessionStore(database),
  imageUploader
} = {}) {
  const app = express();
  app.locals.database = database;
  app.locals.sessionStore = sessionStore;
  app.locals.imageUploader = imageUploader;

  app.disable('x-powered-by');
  if (env.nodeEnv === 'production') {
    app.set('trust proxy', 1);
  }
  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(requireSameOrigin);
  app.use(
    session({
      name: 'startuptn.sid',
      secret: env.sessionSecret,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: env.nodeEnv === 'production',
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000
      }
    })
  );

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api', publicRouter);
  app.use('/api/admin/uploads', adminUploadRouter);
  app.use('/api/admin/articles', adminArticleRouter);
  app.use('/api/admin/access-control', adminAccessControlRouter);
  app.use('/api/admin/access-control/permissions', adminPermissionsRouter);
  app.use('/api/admin/media', adminMediaRouter);
  app.use('/api/admin/web-stories', adminWebStoriesRouter);
  app.use('/api/admin/hero-slides', adminHeroSlidesRouter);
  app.use('/api/admin/videos', adminVideosRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
