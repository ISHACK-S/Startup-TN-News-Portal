import { z } from 'zod';

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(280)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must contain lowercase letters, numbers, and hyphens.');
const webUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => /^https?:\/\//i.test(value), 'URL must use HTTP or HTTPS.');
const optionalUrlSchema = webUrlSchema.nullable().optional();
const categorySlugSchema = z
  .string()
  .trim()
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const articleCreateSchema = z.object({
  title: z.string().trim().min(1).max(255),
  slug: slugSchema,
  summary: z.string().trim().min(1).max(10000),
  content: z.string().trim().min(1),
  cover_image_url: optionalUrlSchema,
  source_url: optionalUrlSchema,
  category_id: z.number().int().positive(),
  author_name: z.string().trim().min(1).max(150),
  status: z.enum(['draft', 'published']).default('draft'),
  is_featured: z.boolean().default(false)
});

export const articlePatchSchema = z
  .object({
    id: z.number().int().positive(),
    title: z.string().trim().min(1).max(255).optional(),
    slug: slugSchema.optional(),
    summary: z.string().trim().min(1).max(10000).optional(),
    content: z.string().trim().min(1).optional(),
    cover_image_url: optionalUrlSchema,
    source_url: optionalUrlSchema,
    category_id: z.number().int().positive().optional(),
    author_name: z.string().trim().min(1).max(150).optional(),
    status: z.enum(['draft', 'published']).optional(),
    is_featured: z.boolean().optional()
  })
  .refine((article) => Object.keys(article).some((key) => key !== 'id'), {
    message: 'Provide at least one article field to update.'
  });

export const articleDeleteSchema = z.object({
  id: z.number().int().positive()
});

export const articleIdParamsSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const articleListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  q: z.string().trim().max(200).optional(),
  category: categorySlugSchema.optional(),
  status: z.enum(['draft', 'published']).optional()
});

export const publicNewsQuerySchema = articleListQuerySchema.omit({ status: true });

export const publicArticleParamsSchema = z.object({
  slug: slugSchema
});
