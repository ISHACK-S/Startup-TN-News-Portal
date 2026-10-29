import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loginController, logoutController, meController } from '../controllers/auth.controller.js';
import { requireAdmin } from '../middleware/require-admin.js';
import { validate } from '../middleware/validate.js';
import { loginSchema } from '../validation/auth.schemas.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { message: 'Too many login attempts. Try again later.' } }
});

authRouter.post('/login', loginLimiter, validate(loginSchema), loginController);
authRouter.post('/logout', requireAdmin, logoutController);
authRouter.get('/me', meController);
