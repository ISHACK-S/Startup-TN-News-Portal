import { z } from 'zod';

const identifier = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const label = z.string().trim().min(1).max(100);
const optionalText = z.string().trim().max(500);
const displayOrder = z.number().int().min(0).max(10000);
const DEFAULT_BACKGROUND_COLOR = '#f8f7f4';
const DEFAULT_TEXT_COLOR = '#17283e';
const DEFAULT_FONT_FAMILY = 'Inter';
const safeWebUrl = z.string().trim().max(2048).refine((value) => {
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}, 'Use an internal site path or a secure HTTPS URL.');
const safeAssetUrl = z.string().trim().max(2048).refine((value) => {
  if (value === '' || (value.startsWith('/') && !value.startsWith('//'))) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}, 'Use a secure HTTPS image URL or a same-site path.');

const menuItemSchema = z.object({
  id: identifier,
  labelEn: label,
  labelTa: label,
  destinationType: z.enum(['internal', 'external']),
  destination: safeWebUrl,
  parentId: identifier.nullable(),
  displayOrder,
  isActive: z.boolean(),
  isVisible: z.boolean(),
  openInNewTab: z.boolean()
}).strict().superRefine((item, context) => {
  if (item.destinationType === 'external' && !item.destination.toLowerCase().startsWith('https://')) {
    context.addIssue({ code: 'custom', path: ['destination'], message: 'External destinations must use HTTPS.' });
  }
  if (item.destinationType === 'internal' && !item.destination.startsWith('/')) {
    context.addIssue({ code: 'custom', path: ['destination'], message: 'Internal destinations must use a site path.' });
  }
});

export const menuConfigurationSchema = z.array(menuItemSchema).max(100).superRefine((items, context) => {
  const ids = new Set();
  const byId = new Map(items.map((item) => [item.id, item]));
  items.forEach((item, index) => {
    if (ids.has(item.id)) {
      context.addIssue({ code: 'custom', path: [index, 'id'], message: 'Menu item identifiers must be unique.' });
    }
    ids.add(item.id);
    if (item.parentId && !byId.has(item.parentId)) {
      context.addIssue({ code: 'custom', path: [index, 'parentId'], message: 'Choose an existing parent menu item.' });
    }
    if (item.parentId === item.id) {
      context.addIssue({ code: 'custom', path: [index, 'parentId'], message: 'A menu item cannot be its own parent.' });
    }
    if (item.parentId && byId.get(item.parentId)?.parentId) {
      context.addIssue({ code: 'custom', path: [index, 'parentId'], message: 'Menu nesting is limited to two levels.' });
    }
    if (item.openInNewTab && item.destinationType !== 'external') {
      context.addIssue({ code: 'custom', path: [index, 'openInNewTab'], message: 'Only external links can open in a new tab.' });
    }
  });
  for (const item of items) {
    const seen = new Set([item.id]);
    let parentId = item.parentId;
    while (parentId) {
      if (seen.has(parentId)) {
        context.addIssue({ code: 'custom', path: ['parentId'], message: 'Menu hierarchy cannot contain a cycle.' });
        break;
      }
      seen.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }
});

const footerLinkSchema = z.object({
  id: identifier,
  labelEn: label,
  labelTa: label,
  url: safeWebUrl,
  displayOrder,
  isVisible: z.boolean(),
  openInNewTab: z.boolean()
}).strict().superRefine((link, context) => {
  if (link.openInNewTab && link.url.startsWith('/')) {
    context.addIssue({ code: 'custom', path: ['openInNewTab'], message: 'Only external links can open in a new tab.' });
  }
});

const footerGroupSchema = z.object({
  id: identifier,
  headingEn: label,
  headingTa: label,
  displayOrder,
  isVisible: z.boolean(),
  links: z.array(footerLinkSchema).max(30)
}).strict().superRefine((group, context) => {
  const ids = new Set();
  group.links.forEach((link, index) => {
    if (ids.has(link.id)) {
      context.addIssue({ code: 'custom', path: ['links', index, 'id'], message: 'Link identifiers must be unique within a group.' });
    }
    ids.add(link.id);
  });
});

const socialLinkSchema = z.object({
  id: identifier,
  label: label,
  url: z.string().trim().url().max(2048).refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
    } catch {
      return false;
    }
  }, 'Social links must use a secure HTTPS URL.'),
  displayOrder,
  isVisible: z.boolean()
}).strict();

export const footerConfigurationSchema = z.object({
  logoUrl: safeAssetUrl,
  websiteName: z.string().trim().min(1).max(100),
  isVisible: z.boolean().default(true),
  descriptionEn: optionalText,
  descriptionTa: optionalText,
  email: z.union([z.literal(''), z.string().trim().email().max(254)]),
  phone: z.string().trim().max(40),
  addressEn: optionalText,
  addressTa: optionalText,
  groups: z.array(footerGroupSchema).max(10),
  socialLinks: z.array(socialLinkSchema).max(12).default([]),
  copyrightEn: z.string().trim().max(200),
  copyrightTa: z.string().trim().max(200),
  dynamicYear: z.boolean()
}).strict().superRefine((footer, context) => {
  const ids = new Set();
  footer.groups.forEach((group, index) => {
    if (ids.has(group.id)) {
      context.addIssue({ code: 'custom', path: ['groups', index, 'id'], message: 'Footer group identifiers must be unique.' });
    }
    ids.add(group.id);
  });
  const socialIds = new Set();
  footer.socialLinks.forEach((link, index) => {
    if (socialIds.has(link.id)) {
      context.addIssue({ code: 'custom', path: ['socialLinks', index, 'id'], message: 'Social link identifiers must be unique.' });
    }
    socialIds.add(link.id);
  });
});

function hexLuminance(color) {
  const channels = color.slice(1).match(/.{2}/g).map((channel) => parseInt(channel, 16) / 255);
  const linear = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(left, right) {
  const luminances = [hexLuminance(left), hexLuminance(right)].sort((a, b) => b - a);
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const brandingConfigurationSchema = z.object({
  logoUrl: safeAssetUrl,
  footerLogoUrl: safeAssetUrl,
  faviconUrl: safeAssetUrl,
  websiteName: z.string().trim().min(1).max(100),
  tagline: z.string().trim().max(180),
  primaryColor: color,
  secondaryColor: color,
  accentColor: color,
  backgroundColor: color.default(DEFAULT_BACKGROUND_COLOR),
  textColor: color.default(DEFAULT_TEXT_COLOR),
  fontFamily: z.enum(['Inter', 'Georgia', 'Arial', 'Trebuchet MS']).default(DEFAULT_FONT_FAMILY)
}).strict().superRefine((branding, context) => {
  if (contrastRatio(branding.primaryColor, '#ffffff') < 4.5) {
    context.addIssue({ code: 'custom', path: ['primaryColor'], message: 'Primary colour needs stronger contrast against white.' });
  }
  if (contrastRatio(branding.secondaryColor, '#ffffff') < 4.5) {
    context.addIssue({ code: 'custom', path: ['secondaryColor'], message: 'Secondary colour needs stronger contrast against white.' });
  }
  if (contrastRatio(branding.accentColor, branding.secondaryColor) < 3) {
    context.addIssue({ code: 'custom', path: ['accentColor'], message: 'Accent colour needs stronger contrast against the secondary colour.' });
  }
  if (contrastRatio(branding.accentColor, branding.primaryColor) < 4.5) {
    context.addIssue({ code: 'custom', path: ['accentColor'], message: 'Accent colour needs stronger contrast against the primary colour.' });
  }
  if (contrastRatio(branding.textColor, branding.backgroundColor) < 4.5) {
    context.addIssue({ code: 'custom', path: ['textColor'], message: 'Text colour needs stronger contrast against the background colour.' });
  }
});
