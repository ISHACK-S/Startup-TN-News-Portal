import { asyncHandler } from '../middleware/async-handler.js';
import {
  getAccountPermissions,
  getRolePermissions,
  listPermissionModules,
  listPermissionRoles,
  removeAccountPermissionOverride,
  updateAccountPermissionOverrides,
  updateModuleActivation,
  updateRolePermissions
} from '../services/permissions.service.js';

async function withConnection(request, operation) {
  const database = request.app.locals.database;
  if (typeof database.getConnection !== 'function') {
    return operation(database);
  }
  const connection = await database.getConnection();
  try {
    return await operation(connection);
  } finally {
    connection.release();
  }
}

export const listPermissionModulesController = asyncHandler(async (request, response) => {
  response.status(200).json({ data: await listPermissionModules(request.app.locals.database) });
});

export const listPermissionRolesController = asyncHandler(async (request, response) => {
  response.status(200).json({ data: await listPermissionRoles(request.app.locals.database) });
});

export const getCurrentAdminPermissionsController = asyncHandler(async (request, response) => {
  response.status(200).json({
    data: await getAccountPermissions(request.admin.id, request.app.locals.database)
  });
});

export const updatePermissionModuleController = asyncHandler(async (request, response) => {
  const result = await withConnection(request, (connection) => updateModuleActivation(
    connection,
    request.admin.id,
    request.validated.params.moduleId,
    request.validated.body.isActive
  ));
  response.status(200).json({ data: result });
});

export const getRolePermissionsController = asyncHandler(async (request, response) => {
  const result = await getRolePermissions(
    request.validated.params.roleKey,
    request.app.locals.database
  );
  response.status(200).json({ data: result });
});

export const updateRolePermissionsController = asyncHandler(async (request, response) => {
  const result = await withConnection(request, (connection) => updateRolePermissions(
    connection,
    request.admin.id,
    request.validated.params.roleKey,
    request.validated.body.permissions
  ));
  response.status(200).json({ data: result });
});

export const getAccountPermissionsController = asyncHandler(async (request, response) => {
  const result = await getAccountPermissions(
    request.validated.params.adminId,
    request.app.locals.database
  );
  response.status(200).json({ data: result });
});

export const updateAccountPermissionOverridesController = asyncHandler(async (request, response) => {
  const result = await withConnection(request, (connection) => updateAccountPermissionOverrides(
    connection,
    request.admin.id,
    request.validated.params.adminId,
    request.validated.body.overrides
  ));
  response.status(200).json({ data: result });
});

export const removeAccountPermissionOverrideController = asyncHandler(async (request, response) => {
  const { adminId, moduleId, actionId } = request.validated.params;
  const result = await withConnection(request, (connection) => removeAccountPermissionOverride(
    connection,
    request.admin.id,
    adminId,
    moduleId,
    actionId
  ));
  response.status(200).json({ data: result });
});
