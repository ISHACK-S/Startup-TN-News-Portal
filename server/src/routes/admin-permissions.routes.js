import { Router } from 'express';
import {
  getCurrentAdminPermissionsController,
  getAccountPermissionsController,
  getRolePermissionsController,
  listPermissionModulesController,
  listPermissionRolesController,
  removeAccountPermissionOverrideController,
  updateAccountPermissionOverridesController,
  updatePermissionModuleController,
  updateRolePermissionsController
} from '../controllers/permissions.controller.js';
import { requireAdmin, requireSuperAdmin } from '../middleware/require-admin.js';
import { validate } from '../middleware/validate.js';
import {
  accountPermissionOverridesSchema,
  permissionAccountParamsSchema,
  permissionModuleParamsSchema,
  permissionModuleUpdateSchema,
  permissionOverrideParamsSchema,
  permissionRoleParamsSchema,
  rolePermissionUpdateSchema
} from '../validation/permissions.schemas.js';

export const adminPermissionsRouter = Router();

adminPermissionsRouter.get('/me', requireAdmin, getCurrentAdminPermissionsController);
adminPermissionsRouter.use(requireSuperAdmin);
adminPermissionsRouter.get('/modules', listPermissionModulesController);
adminPermissionsRouter.get('/roles', listPermissionRolesController);
adminPermissionsRouter.patch(
  '/modules/:moduleId',
  validate(permissionModuleParamsSchema, 'params'),
  validate(permissionModuleUpdateSchema),
  updatePermissionModuleController
);
adminPermissionsRouter.get(
  '/roles/:roleKey/permissions',
  validate(permissionRoleParamsSchema, 'params'),
  getRolePermissionsController
);
adminPermissionsRouter.patch(
  '/roles/:roleKey/permissions',
  validate(permissionRoleParamsSchema, 'params'),
  validate(rolePermissionUpdateSchema),
  updateRolePermissionsController
);
adminPermissionsRouter.get(
  '/accounts/:adminId/permissions',
  validate(permissionAccountParamsSchema, 'params'),
  getAccountPermissionsController
);
adminPermissionsRouter.put(
  '/accounts/:adminId/overrides',
  validate(permissionAccountParamsSchema, 'params'),
  validate(accountPermissionOverridesSchema),
  updateAccountPermissionOverridesController
);
adminPermissionsRouter.delete(
  '/accounts/:adminId/overrides/:moduleId/:actionId',
  validate(permissionOverrideParamsSchema, 'params'),
  removeAccountPermissionOverrideController
);
