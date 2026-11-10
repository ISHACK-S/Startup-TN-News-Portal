import { z } from 'zod';
import { adminPasswordSchema } from './admin-password.js';
import { adminUsernameSchema } from './admin-username.js';

const adminIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,19}$/)
  .refine(
    (value) => /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= 18446744073709551615n,
    'Invalid administrator ID.'
  );

export const adminAccountsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  q: z.string().trim().max(200).optional()
}).strict();

export const adminAccountParamsSchema = z.object({
  id: adminIdSchema
}).strict();

export const adminAccountUpdateSchema = z.object({
  role: z.string().trim().min(1).max(100).optional(),
  isActive: z.boolean().optional()
}).strict().refine(
  (update) => update.role !== undefined || update.isActive !== undefined,
  { message: 'Provide a role or active-status change.' }
);

export const adminAccountCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  username: adminUsernameSchema,
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: adminPasswordSchema,
  role: z.string().trim().min(1).max(100),
  isActive: z.boolean().default(true),
  confirmSuperAdmin: z.boolean().optional()
}).strict().refine(
  (account) => account.role !== 'Super Admin' || account.confirmSuperAdmin === true,
  {
    path: ['confirmSuperAdmin'],
    message: 'Explicitly confirm creation of a Super Admin account.'
  }
);
