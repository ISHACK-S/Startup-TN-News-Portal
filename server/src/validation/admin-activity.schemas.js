import { z } from 'zod';

const currentYear = new Date().getFullYear();
const adminIdSchema = z.string()
  .regex(/^[1-9]\d{0,19}$/)
  .refine((value) => BigInt(value) <= 18446744073709551615n);
const reportFilters = {
  month: z.coerce.number().int().min(1).max(12).default(new Date().getMonth() + 1),
  year: z.coerce.number().int().min(2000).max(currentYear + 1).default(currentYear),
  adminId: adminIdSchema.optional(),
  role: z.string().trim().min(1).max(100).optional(),
  module: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/).optional(),
  action: z.string().regex(/^[a-z][a-z0-9.-]{0,63}$/).optional(),
  status: z.enum(['success', 'failure']).optional(),
  q: z.string().trim().max(200).optional()
};

export const monthlyActivityQuerySchema = z.object({
  ...reportFilters,
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
}).strict();

export const monthlyActivityExportQuerySchema = z.object(reportFilters).strict();

export const activityIdParamsSchema = z.object({
  activityId: adminIdSchema
}).strict();
