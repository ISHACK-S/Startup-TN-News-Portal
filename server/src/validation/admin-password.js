import { z } from 'zod';

export const adminPasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters.')
  .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes.')
  .refine(
    (password) =>
      [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length === 4,
    'Password must include lowercase and uppercase letters, a number, and a symbol.'
  );
