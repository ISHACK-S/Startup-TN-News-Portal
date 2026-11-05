import { Router } from 'express';
import {
  adminActivityDetailsController,
  exportMonthlyActivityCsvController,
  exportMonthlyActivityPdfController,
  monthlyActivityReportController
} from '../controllers/admin-activity.controller.js';
import { requireSuperAdmin } from '../middleware/require-admin.js';
import { validate } from '../middleware/validate.js';
import {
  activityIdParamsSchema,
  monthlyActivityExportQuerySchema,
  monthlyActivityQuerySchema
} from '../validation/admin-activity.schemas.js';

export const adminActivityRouter = Router();

adminActivityRouter.use(requireSuperAdmin);
adminActivityRouter.get(
  '/',
  validate(monthlyActivityQuerySchema, 'query'),
  monthlyActivityReportController
);
adminActivityRouter.get(
  '/export.csv',
  validate(monthlyActivityExportQuerySchema, 'query'),
  exportMonthlyActivityCsvController
);
adminActivityRouter.get(
  '/export.pdf',
  validate(monthlyActivityExportQuerySchema, 'query'),
  exportMonthlyActivityPdfController
);
adminActivityRouter.get(
  '/:activityId',
  validate(activityIdParamsSchema, 'params'),
  adminActivityDetailsController
);
