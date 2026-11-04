import { z } from 'zod';

const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(200).optional()
};
const httpsUrl = z.string().trim().url().max(2048).refine(
  (value) => new URL(value).protocol === 'https:',
  'URL must use HTTPS.'
);
const storySlug = z.string().trim().min(1).max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens.');
const storySlide = z.object({
  image_url: httpsUrl,
  alt_text: z.string().trim().min(1).max(255),
  caption: z.string().trim().max(500).nullable().optional(),
  link_url: httpsUrl.nullable().optional()
}).strict();

export const contentIdParamsSchema = z.object({
  id: z.coerce.number().int().positive()
}).strict();
export const webStorySlugParamsSchema = z.object({
  slug: storySlug
}).strict();

export const mediaListQuerySchema = z.object({
  ...pageQuery,
  format: z.enum(['jpg', 'jpeg', 'png', 'webp']).optional()
}).strict();

export const webStoryListQuerySchema = z.object({
  ...pageQuery,
  status: z.enum(['draft', 'published']).optional()
}).strict();

export const webStoryCreateSchema = z.object({
  title: z.string().trim().min(1).max(180),
  slug: storySlug,
  description: z.string().trim().max(500).nullable().optional(),
  status: z.enum(['draft', 'published']).default('draft'),
  slides: z.array(storySlide).max(30).default([])
}).strict();

export const webStoryPatchSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  slug: storySlug.optional(),
  description: z.string().trim().max(500).nullable().optional(),
  status: z.enum(['draft', 'published']).optional(),
  slides: z.array(storySlide).max(30).optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Provide at least one field to update.'
});

export const heroListQuerySchema = z.object({
  ...pageQuery,
  status: z.enum(['draft', 'published']).optional()
}).strict();

const heroFields = {
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(1000).nullable().optional(),
  image_url: httpsUrl,
  alt_text: z.string().trim().min(1).max(255),
  destination_url: httpsUrl.nullable().optional(),
  article_id: z.number().int().positive().nullable().optional(),
  display_order: z.number().int().min(0).max(100000),
  status: z.enum(['draft', 'published']).default('draft')
};

function validHeroDestination(value) {
  return !(value.article_id && value.destination_url);
}

export const heroCreateSchema = z.object(heroFields).strict().refine(validHeroDestination, {
  message: 'Choose either a published article or a destination URL, not both.'
});

export const heroPatchSchema = z.object({
  ...Object.fromEntries(Object.entries(heroFields).map(([key, schema]) => [
    key,
    key === 'status' ? schema.optional() : schema.optional()
  ]))
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Provide at least one field to update.'
}).refine((value) => !(value.article_id && value.destination_url), {
  message: 'Choose either a published article or a destination URL, not both.'
});

export const videoListQuerySchema = z.object({
  ...pageQuery,
  status: z.enum(['draft', 'published']).optional(),
  provider: z.enum(['youtube', 'vimeo']).optional()
}).strict();

const videoSource = z.string().trim().url().max(2048).refine((value) => {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase();
  if (host === 'youtu.be') return /^\/[A-Za-z0-9_-]{11}\/?$/.test(parsed.pathname);
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
    const id = parsed.searchParams.get('v');
    return Boolean(
      (id && /^[A-Za-z0-9_-]{11}$/.test(id))
      || /^\/(?:embed|shorts)\/[A-Za-z0-9_-]{11}\/?$/.test(parsed.pathname)
    );
  }
  if (host === 'vimeo.com' || host === 'www.vimeo.com') {
    return /^\/\d{5,12}\/?$/.test(parsed.pathname);
  }
  if (host === 'player.vimeo.com') return /^\/video\/\d{5,12}\/?$/.test(parsed.pathname);
  return false;
}, 'Use a valid HTTPS YouTube or Vimeo video URL.');

const videoFields = {
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10000).nullable().optional(),
  source_url: videoSource,
  thumbnail_url: httpsUrl.nullable().optional(),
  thumbnail_alt: z.string().trim().max(255).nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
  display_order: z.number().int().min(0).max(100000),
  status: z.enum(['draft', 'published']).default('draft')
};

export const videoCreateSchema = z.object(videoFields).strict();
export const videoPatchSchema = z.object({
  ...Object.fromEntries(Object.entries(videoFields).map(([key, schema]) => [key, schema.optional()]))
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Provide at least one field to update.'
});
