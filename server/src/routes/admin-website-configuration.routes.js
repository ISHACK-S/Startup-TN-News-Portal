import { Router } from 'express';
import {
  adminWebsiteConfigurationController,
  publishWebsiteConfigurationController,
  saveWebsiteConfigurationController
} from '../controllers/website-configuration.controller.js';
import { requireSuperAdmin } from '../middleware/require-admin.js';
import {
  brandingConfigurationSchema,
  footerConfigurationSchema,
  menuConfigurationSchema
} from '../validation/website-configuration.schemas.js';
import { z } from 'zod';
import { HttpError } from '../errors/http-error.js';

export const adminWebsiteConfigurationRouter = Router();

adminWebsiteConfigurationRouter.get('/', requireSuperAdmin, adminWebsiteConfigurationController);
adminWebsiteConfigurationRouter.post('/:section/publish', requireSuperAdmin, (request, response, next) => {
  const sectionResult = z.enum(['menu', 'footer', 'branding']).safeParse(request.params.section);
  if (!sectionResult.success) {
    next(new HttpError(404, 'The configuration section was not found.'));
    return;
  }
  request.validated = { params: { section: sectionResult.data } };
  next();
}, publishWebsiteConfigurationController);
adminWebsiteConfigurationRouter.put('/:section', requireSuperAdmin, (request, response, next) => {
  const sectionResult = z.enum(['menu', 'footer', 'branding']).safeParse(request.params.section);
  if (!sectionResult.success) {
    next(new HttpError(404, 'The configuration section was not found.'));
    return;
  }
  const schema = {
    menu: menuConfigurationSchema,
    footer: footerConfigurationSchema,
    branding: brandingConfigurationSchema
  }[sectionResult.data];
  const result = schema.safeParse(request.body);
  if (!result.success) {
    next(new HttpError(400, 'Request validation failed.', {
      details: result.error.issues.map(({ path, message }) => ({
        path: path.join('.'),
        message
      }))
    }));
    return;
  }
  request.validated = {
    params: { section: sectionResult.data },
    body: result.data
  };
  next();
}, saveWebsiteConfigurationController);
