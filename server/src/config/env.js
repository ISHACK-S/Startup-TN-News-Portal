import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const rootEnvPath = path.join(projectRoot, '.env');
const serverEnvPath = path.join(projectRoot, 'server', '.env');
dotenv.config({ path: fs.existsSync(rootEnvPath) ? rootEnvPath : serverEnvPath });

const optionalCloudinaryCredential = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().trim().min(1).optional()
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
    SESSION_SECRET: z.string().min(32),
    UPLOAD_MAX_FILE_SIZE_MB: z.coerce.number().int().min(1).max(5).default(5),
    CLOUDINARY_CLOUD_NAME: optionalCloudinaryCredential,
    CLOUDINARY_API_KEY: optionalCloudinaryCredential,
    CLOUDINARY_API_SECRET: optionalCloudinaryCredential,
    MYSQL_HOST: z.string().min(1),
    MYSQL_PORT: z.coerce.number().int().min(1).max(65535),
    MYSQL_DATABASE: z.string().min(1),
    MYSQL_USER: z.string().min(1),
    MYSQL_PASSWORD: z.string().min(1),
    MYSQL_SSL: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
    MYSQL_SSL_CA: z.string().optional()
  })
  .superRefine((config, context) => {
    if (config.MYSQL_SSL && !config.MYSQL_SSL_CA) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MYSQL_SSL_CA'],
        message: 'Set MYSQL_SSL_CA to the path of the Aiven CA certificate when MYSQL_SSL=true.'
      });
    }

    if (config.NODE_ENV === 'production' && !config.MYSQL_SSL) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MYSQL_SSL'],
        message: 'MYSQL_SSL must be true in production when connecting to Aiven MySQL.'
      });
    }

    const cloudinaryValues = [
      config.CLOUDINARY_CLOUD_NAME,
      config.CLOUDINARY_API_KEY,
      config.CLOUDINARY_API_SECRET
    ];
    if (cloudinaryValues.some(Boolean) && !cloudinaryValues.every(Boolean)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CLOUDINARY_CLOUD_NAME'],
        message: 'Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET together.'
      });
    }
  });

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const problems = result.error.issues
    .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid server environment configuration:\n${problems}`);
}

const parsed = result.data;

export const env = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT,
  clientOrigin: new URL(parsed.CLIENT_ORIGIN).origin,
  sessionSecret: parsed.SESSION_SECRET,
  uploadMaxFileSizeBytes: parsed.UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024,
  cloudinary:
    parsed.CLOUDINARY_CLOUD_NAME && parsed.CLOUDINARY_API_KEY && parsed.CLOUDINARY_API_SECRET
      ? {
          cloudName: parsed.CLOUDINARY_CLOUD_NAME,
          apiKey: parsed.CLOUDINARY_API_KEY,
          apiSecret: parsed.CLOUDINARY_API_SECRET
        }
      : undefined,
  mysql: {
    host: parsed.MYSQL_HOST,
    port: parsed.MYSQL_PORT,
    database: parsed.MYSQL_DATABASE,
    user: parsed.MYSQL_USER,
    password: parsed.MYSQL_PASSWORD,
    ssl: parsed.MYSQL_SSL
      ? {
          ca: path.resolve(projectRoot, parsed.MYSQL_SSL_CA),
          rejectUnauthorized: true
        }
      : undefined
  }
};
