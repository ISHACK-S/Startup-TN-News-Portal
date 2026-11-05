import { z } from 'zod';
import { adminPasswordSchema } from './admin-password.js';

export const adminProfileUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Enter your full name.').max(150),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase())
}).strict();

export const adminPasswordChangeSchema = z.object({
  currentPassword: z.string().min(1).refine(
    (password) => Buffer.byteLength(password, 'utf8') <= 72,
    'Password must be at most 72 UTF-8 bytes.'
  ),
  newPassword: adminPasswordSchema,
  passwordConfirmation: z.string().min(1)
}).strict().refine(
  ({ newPassword, passwordConfirmation }) => newPassword === passwordConfirmation,
  { path: ['passwordConfirmation'], message: 'The passwords do not match.' }
);
