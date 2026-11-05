import { asyncHandler } from '../middleware/async-handler.js';
import { createAdminAccount, listAdminAccounts } from '../services/access-control.service.js';
import { updateAdminAuthorization } from '../services/auth.service.js';

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

export const listAdminAccountsController = asyncHandler(async (request, response) => {
  const result = await listAdminAccounts(
    request.validated.query,
    request.app.locals.database
  );
  response.status(200).json(result);
});

export const createAdminAccountController = asyncHandler(async (request, response) => {
  const result = await withConnection(request, (connection) => createAdminAccount(
    connection,
    request.validated.body,
    request.admin.id
  ));
  request.activityRecordId = result.id;
  request.activityChanges = {
    after: { role: result.role, isActive: result.isActive }
  };
  response.status(201).json({ data: result });
});

export const updateAdminAccountController = asyncHandler(async (request, response) => {
  const database = request.app.locals.database;
  const connection = typeof database.getConnection === 'function'
    ? await database.getConnection()
    : database;

  try {
    const result = await updateAdminAuthorization(
      connection,
      request.validated.params.id,
      {
        ...request.validated.body,
        actorAdminId: request.admin.id
      }
    );
    request.activityChanged = result.changed;
    if (result.changed) {
      request.activityChanges = {
        before: { role: result.previousRole, isActive: result.previousIsActive },
        after: {
          role: result.admin.role,
          isActive: result.admin.isActive,
          sessionsInvalidated: result.sessionsInvalidated
        }
      };
    }
    response.status(200).json({
      data: result.admin,
      meta: {
        changed: result.changed,
        sessionsInvalidated: result.sessionsInvalidated
      }
    });
  } finally {
    if (connection !== database && typeof connection.release === 'function') {
      connection.release();
    }
  }
});
