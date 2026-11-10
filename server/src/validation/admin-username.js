import { z } from 'zod';

export const adminUsernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters.')
  .max(64, 'Username must be at most 64 characters.')
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
    'Use only letters, numbers, periods, underscores, and hyphens; start with a letter or number.'
  )
  .transform((username) => username.toLowerCase());
