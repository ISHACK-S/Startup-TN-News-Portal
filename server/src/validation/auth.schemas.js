import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(254),
  password: z
    .string()
    .min(1)
    .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes.')
});
