import { asyncHandler } from '../middleware/async-handler.js';
import {
  createArticle,
  deleteArticle,
  getAdminArticle,
  getPublicArticle,
  listAdminArticles,
  listCategories,
  listPublicArticles,
  listStartupCities,
  updateArticle
} from '../services/article.service.js';

export const categoriesController = asyncHandler(async (request, response) => {
  response.status(200).json({ data: await listCategories(request.app.locals.database) });
});

export const startupCitiesController = asyncHandler(async (request, response) => {
  response.status(200).json({ data: await listStartupCities(request.app.locals.database) });
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
  request.activityChanges = {
    after: {
      status: article.status,
      categoryId: article.category_id,
      startupCityId: article.startup_city_id,
      isFeatured: Number(article.is_featured) === 1
    }
  };
  if (article.status === 'published') request.activityAction = 'article.published';
  response.status(201).json({ data: article });
});

export const updateArticleController = asyncHandler(async (request, response) => {
  const before = await getAdminArticle(request.validated.body.id, request.app.locals.database);
  const article = await updateArticle(request.validated.body, request.app.locals.database);
  const beforeSnapshot = {
    title: before.title,
    slug: before.slug,
    status: before.status,
    categoryId: before.category_id,
    startupCityId: before.startup_city_id,
    isFeatured: Number(before.is_featured) === 1
  };
  const afterSnapshot = {
    title: article.title,
    slug: article.slug,
    status: article.status,
    categoryId: article.category_id,
    startupCityId: article.startup_city_id,
    isFeatured: Number(article.is_featured) === 1
  };
  const updatedFields = Object.keys(request.validated.body).filter((key) => {
    if (key === 'id') return false;
    const previous = before[key];
    const next = request.validated.body[key];
    if (key === 'is_featured') return Boolean(Number(previous)) !== next;
    return String(previous ?? '') !== String(next ?? '');
  });
  if (String(before.startup_city_id ?? '') !== String(article.startup_city_id ?? '')
      && !updatedFields.includes('startup_city_id')) {
    updatedFields.push('startup_city_id');
  }
  request.activityChanged = updatedFields.length > 0;
  if (request.activityChanged) {
    const trackedFields = Object.keys(beforeSnapshot).filter((key) => (
      String(beforeSnapshot[key]) !== String(afterSnapshot[key])
    ));
    request.activityChanges = {
      before: Object.fromEntries(trackedFields.map((key) => [key, beforeSnapshot[key]])),
      after: Object.fromEntries(trackedFields.map((key) => [key, afterSnapshot[key]])),
      changedFields: updatedFields
    };
    if (before.status !== article.status && article.status === 'published') {
      request.activityAction = 'article.published';
    } else if (before.status !== article.status && article.status === 'draft') {
      request.activityAction = 'article.unpublished';
    } else {
      request.activityAction = 'article.edited';
    }
  }
  response.status(200).json({ data: article });
});

export const deleteArticleController = asyncHandler(async (request, response) => {
  const before = await getAdminArticle(request.validated.body.id, request.app.locals.database);
  await deleteArticle(request.validated.body.id, request.app.locals.database);
  request.activityChanges = {
    before: {
      title: before.title,
      slug: before.slug,
      status: before.status,
      categoryId: before.category_id,
      startupCityId: before.startup_city_id,
      isFeatured: Number(before.is_featured) === 1
    }
  };
  response.status(200).json({ data: { deleted: true } });
});
