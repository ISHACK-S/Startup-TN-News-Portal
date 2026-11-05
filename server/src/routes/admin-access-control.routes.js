import { Router } from 'express';
import {
  createAdminAccountController,
  listAdminAccountsController,
  updateAdminAccountController
} from '../controllers/access-control.controller.js';
import { requireSuperAdmin } from '../middleware/require-admin.js';
import { validate } from '../middleware/validate.js';
import {
  adminAccountParamsSchema,
  adminAccountsQuerySchema,
  adminAccountCreateSchema,
  adminAccountUpdateSchema
} from '../validation/access-control.schemas.js';

export const adminAccessControlRouter = Router();

adminAccessControlRouter.post(
  '/users',
  requireSuperAdmin,
  validate(adminAccountCreateSchema),
  createAdminAccountController
);
adminAccessControlRouter.get(
  '/users',
  requireSuperAdmin,
  validate(adminAccountsQuerySchema, 'query'),
  listAdminAccountsController
);
adminAccessControlRouter.patch(
  '/users/:id',
  requireSuperAdmin,
  validate(adminAccountParamsSchema, 'params'),
  validate(adminAccountUpdateSchema),
  updateAdminAccountController
);
