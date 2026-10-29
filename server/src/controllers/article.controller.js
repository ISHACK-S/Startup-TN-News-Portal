import { asyncHandler } from '../middleware/async-handler.js';
import {
  createArticle,
  deleteArticle,
  getAdminArticle,
  getPublicArticle,
  listAdminArticles,
  listCategories,
  listPublicArticles,
  updateArticle
} from '../services/article.service.js';

export const categoriesController = asyncHandler(async (request, response) => {
  response.status(200).json({ data: await listCategories(request.app.locals.database) });
});

export const publicNewsController = asyncHandler(async (request, response) => {
  const result = await listPublicArticles(request.validated.query, request.app.locals.database);
  response.status(200).json(result);
});

export const publicArticleController = asyncHandler(async (request, response) => {
  const article = await getPublicArticle(request.params.slug, request.app.locals.database);
  if (!article) {
    response.status(404).json({ error: { message: 'Article not found.' } });
    return;
  }
  response.status(200).json({ data: article });
});

export const adminArticlesController = asyncHandler(async (request, response) => {
  const result = await listAdminArticles(request.validated.query, request.app.locals.database);
  response.status(200).json(result);
});

export const adminArticleController = asyncHandler(async (request, response) => {
  const article = await getAdminArticle(Number(request.params.id), request.app.locals.database);
  if (!article) {
    response.status(404).json({ error: { message: 'Article not found.' } });
    return;
  }
  response.status(200).json({ data: article });
});

export const createArticleController = asyncHandler(async (request, response) => {
  const article = await createArticle(
    request.validated.body,
    request.session.adminId,
    request.app.locals.database
  );
  response.status(201).json({ data: article });
});

export const updateArticleController = asyncHandler(async (request, response) => {
  const article = await updateArticle(request.validated.body, request.app.locals.database);
  response.status(200).json({ data: article });
});

export const deleteArticleController = asyncHandler(async (request, response) => {
  await deleteArticle(request.validated.body.id, request.app.locals.database);
  response.status(200).json({ data: { deleted: true } });
});
