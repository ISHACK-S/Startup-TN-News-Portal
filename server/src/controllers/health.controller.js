import { asyncHandler } from '../middleware/async-handler.js';
import { getHealth } from '../services/health.service.js';

export const healthController = asyncHandler(async (request, response) => {
  const health = await getHealth(request.app.locals.database);
  response.status(200).json(health);
});
