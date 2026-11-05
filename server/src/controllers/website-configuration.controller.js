import { asyncHandler } from '../middleware/async-handler.js';
import {
  getAdminWebsiteConfiguration,
  getPublicWebsiteConfiguration,
  publishWebsiteConfigurationDraft,
  saveWebsiteConfigurationDraft
} from '../services/website-configuration.service.js';

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

export const publicWebsiteConfigurationController = asyncHandler(async (request, response) => {
  response.set('Cache-Control', 'no-store');
  response.status(200).json({ data: await getPublicWebsiteConfiguration(request.app.locals.database) });
});

export const adminWebsiteConfigurationController = asyncHandler(async (request, response) => {
  response.status(200).json({ data: await getAdminWebsiteConfiguration(request.app.locals.database) });
});

export const saveWebsiteConfigurationController = asyncHandler(async (request, response) => {
  const saved = await withConnection(request, (connection) => saveWebsiteConfigurationDraft(
    connection,
    request.validated.params.section,
    request.validated.body,
    request.admin.id
  ));
  response.status(200).json({ data: { section: request.validated.params.section, configuration: saved } });
});

export const publishWebsiteConfigurationController = asyncHandler(async (request, response) => {
  const published = await withConnection(request, (connection) => publishWebsiteConfigurationDraft(
    connection,
    request.validated.params.section,
    request.admin.id
  ));
  response.status(200).json({
    data: { section: request.validated.params.section, configuration: published }
  });
});
