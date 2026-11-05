import { pool } from '../database/pool.js';
import { HttpError } from '../errors/http-error.js';
import {
  brandingConfigurationSchema,
  footerConfigurationSchema,
  menuConfigurationSchema
} from '../validation/website-configuration.schemas.js';

export const DEFAULT_WEBSITE_CONFIGURATION = Object.freeze({
  menu: [
    { id: 'home', labelEn: 'Home', labelTa: 'முகப்பு', destinationType: 'internal', destination: '/', parentId: null, displayOrder: 10, isActive: true, isVisible: true, openInNewTab: false },
    { id: 'news', labelEn: 'Latest news', labelTa: 'சமீபத்திய செய்திகள்', destinationType: 'internal', destination: '/news/', parentId: null, displayOrder: 20, isActive: true, isVisible: true, openInNewTab: false },
    { id: 'videos', labelEn: 'Videos', labelTa: 'காணொளிகள்', destinationType: 'internal', destination: '/videos', parentId: null, displayOrder: 25, isActive: true, isVisible: true, openInNewTab: false },
    { id: 'startups', labelEn: 'Startups', labelTa: 'தொடக்க நிறுவனங்கள்', destinationType: 'internal', destination: '/news/?category=startups', parentId: null, displayOrder: 30, isActive: true, isVisible: true, openInNewTab: false },
    { id: 'funding', labelEn: 'Funding', labelTa: 'நிதி', destinationType: 'internal', destination: '/news/?category=funding', parentId: null, displayOrder: 40, isActive: true, isVisible: true, openInNewTab: false },
    { id: 'events', labelEn: 'Events', labelTa: 'நிகழ்வுகள்', destinationType: 'internal', destination: '/news/?category=events', parentId: null, displayOrder: 50, isActive: true, isVisible: true, openInNewTab: false },
    { id: 'policy', labelEn: 'Policy', labelTa: 'கொள்கை', destinationType: 'internal', destination: '/news/?category=policy', parentId: null, displayOrder: 60, isActive: true, isVisible: true, openInNewTab: false },
    { id: 'innovation', labelEn: 'Innovation', labelTa: 'புதுமை', destinationType: 'internal', destination: '/news/?category=innovation', parentId: null, displayOrder: 70, isActive: true, isVisible: true, openInNewTab: false },
    { id: 'ecosystem', labelEn: 'Ecosystem', labelTa: 'சூழல்', destinationType: 'internal', destination: '/news/?category=ecosystem', parentId: null, displayOrder: 80, isActive: true, isVisible: true, openInNewTab: false }
  ],
  footer: {
    logoUrl: '',
    websiteName: 'StartupTN News',
    isVisible: true,
    descriptionEn: 'Independent stories and perspectives from across Tamil Nadu’s startup ecosystem.',
    descriptionTa: 'தமிழ்நாட்டின் தொடக்க நிறுவனச் சூழல் குறித்த சுயாதீனச் செய்திகள் மற்றும் பார்வைகள்.',
    email: '',
    phone: '',
    addressEn: '',
    addressTa: '',
    groups: [{
      id: 'explore',
      headingEn: 'Explore',
      headingTa: 'பார்வையிடுக',
      displayOrder: 10,
      isVisible: true,
      links: [
        { id: 'latest-news', labelEn: 'Latest news', labelTa: 'சமீபத்திய செய்திகள்', url: '/news/', displayOrder: 10, isVisible: true, openInNewTab: false },
        { id: 'startups', labelEn: 'Startups', labelTa: 'தொடக்க நிறுவனங்கள்', url: '/news/?category=startups', displayOrder: 20, isVisible: true, openInNewTab: false },
        { id: 'funding', labelEn: 'Funding', labelTa: 'நிதி', url: '/news/?category=funding', displayOrder: 30, isVisible: true, openInNewTab: false },
        { id: 'events', labelEn: 'Events', labelTa: 'நிகழ்வுகள்', url: '/news/?category=events', displayOrder: 40, isVisible: true, openInNewTab: false }
      ]
    }],
    socialLinks: [],
    copyrightEn: 'Independent editorial project · Not an official StartupTN publication',
    copyrightTa: 'சுயாதீனச் செய்தித் திட்டம் · அதிகாரப்பூர்வ StartupTN வெளியீடு அல்ல',
    dynamicYear: true
  },
  branding: {
    logoUrl: '',
    footerLogoUrl: '',
    faviconUrl: '',
    websiteName: 'StartupTN News',
    tagline: '',
    primaryColor: '#293f80',
    secondaryColor: '#101b3b',
    accentColor: '#ffbe24',
    backgroundColor: '#f8f7f4',
    textColor: '#17283e',
    fontFamily: 'Inter'
  }
});

const CONFIG_KEYS = Object.freeze(['menu', 'footer', 'branding']);
const CONFIG_SCHEMAS = Object.freeze({
  menu: menuConfigurationSchema,
  footer: footerConfigurationSchema,
  branding: brandingConfigurationSchema
});
const DRAFT_STORAGE_ERROR = 'Website configuration drafts are unavailable. Run npm run migrate-admin-authorization to apply pending migrations.';

function isMissingDraftTable(error) {
  return (error?.code === 'ER_NO_SUCH_TABLE' || Number(error?.errno) === 1146)
    && String(error?.message ?? '').includes('site_configuration_drafts');
}

function draftStorageError(error) {
  return isMissingDraftTable(error) ? new HttpError(503, DRAFT_STORAGE_ERROR) : error;
}

function decodeConfig(value, key) {
  if (value === undefined || value === null) return DEFAULT_WEBSITE_CONFIGURATION[key];
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      throw new HttpError(503, 'Website configuration is unavailable.');
    }
  }
  return value;
}

async function readConfig(database, key) {
  let rows;
  try {
    [rows] = await database.execute(
      'SELECT config_value FROM site_configuration WHERE config_key = ? LIMIT 1',
      [key]
    );
  } catch (error) {
    if (
      (error.code === 'ER_NO_SUCH_TABLE' || Number(error.errno) === 1146)
      && String(error.message).includes('site_configuration')
    ) {
      return { value: DEFAULT_WEBSITE_CONFIGURATION[key], customized: false };
    }
    throw error;
  }
  const value = decodeConfig(rows[0]?.config_value, key);
  if (value === DEFAULT_WEBSITE_CONFIGURATION[key]) return { value, customized: false };
  const parsed = CONFIG_SCHEMAS[key].safeParse(value);
  return parsed.success
    ? { value: parsed.data, customized: true }
    : { value: DEFAULT_WEBSITE_CONFIGURATION[key], customized: false };
}

function isVisible(item) {
  return item.isVisible === true && item.isActive !== false;
}

function publicMenu(items) {
  const allItems = new Map(items.map((item) => [item.id, item]));
  const visible = items.filter((item) => {
    if (!isVisible(item)) return false;
    let parentId = item.parentId;
    while (parentId) {
      const parent = allItems.get(parentId);
      if (!parent || !isVisible(parent)) return false;
      parentId = parent.parentId;
    }
    return true;
  }).map((item) => ({ ...item, children: [] }));
  const byId = new Map(visible.map((item) => [item.id, item]));
  const roots = [];
  for (const item of visible) {
    const parent = item.parentId ? byId.get(item.parentId) : null;
    if (parent) parent.children.push(item);
    else roots.push(item);
  }
  const sort = (nodes) => {
    nodes.sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id));
    nodes.forEach((node) => sort(node.children));
  };
  sort(roots);
  return roots;
}

export async function getPublicWebsiteConfiguration(database = pool) {
  const [menuResult, footerResult, brandingResult] = await Promise.all(
    CONFIG_KEYS.map((key) => readConfig(database, key))
  );
  const menu = menuResult.value;
  const footer = footerResult.value;
  const branding = brandingResult.value;
  return {
    menu: publicMenu(menu),
    footer: {
      ...footer,
      groups: footer.groups
        .filter(isVisible)
        .map((group) => ({
          ...group,
          links: group.links.filter(isVisible)
            .sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id))
        }))
        .filter((group) => group.links.length > 0)
        .sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id)),
      socialLinks: footer.socialLinks
        .filter((link) => link.isVisible)
        .sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id))
    },
    branding,
    brandingCustomized: brandingResult.customized
  };
}

export async function getAdminWebsiteConfiguration(database = pool) {
  const [menu, footer, branding] = await Promise.all(CONFIG_KEYS.map((key) => readConfig(database, key)));
  const drafts = await Promise.all(CONFIG_KEYS.map(async (key) => {
    let rows;
    try {
      [rows] = await database.execute(
        'SELECT config_value FROM site_configuration_drafts WHERE config_key = ? LIMIT 1',
        [key]
      );
    } catch (error) {
      throw draftStorageError(error);
    }
    if (!rows[0]) return [key, null];
    const value = decodeConfig(rows[0].config_value, key);
    const parsed = CONFIG_SCHEMAS[key].safeParse(value);
    return [key, parsed.success ? parsed.data : null];
  }));
  return {
    menu: menu.value,
    footer: footer.value,
    branding: branding.value,
    drafts: Object.fromEntries(drafts)
  };
}

export async function saveWebsiteConfigurationDraft(database, key, configuration, adminId) {
  if (!CONFIG_KEYS.includes(key)) throw new HttpError(404, 'The configuration section was not found.');
  await database.beginTransaction();
  try {
    await database.execute(
      `INSERT INTO site_configuration_drafts (config_key, config_value, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE config_value = VALUES(config_value),
         updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP`,
      [key, JSON.stringify(configuration), adminId]
    );
    const [rows] = await database.execute(
      'SELECT config_value FROM site_configuration_drafts WHERE config_key = ? LIMIT 1',
      [key]
    );
    const saved = CONFIG_SCHEMAS[key].parse(decodeConfig(rows[0]?.config_value, key));
    await database.commit();
    return saved;
  } catch (error) {
    try {
      await database.rollback();
    } catch {
      throw new Error('The website configuration update failed and its rollback could not be confirmed.');
    }
    throw draftStorageError(error);
  }
}

export async function publishWebsiteConfigurationDraft(database, key, adminId) {
  if (!CONFIG_KEYS.includes(key)) throw new HttpError(404, 'The configuration section was not found.');
  await database.beginTransaction();
  try {
    const [rows] = await database.execute(
      'SELECT config_value FROM site_configuration_drafts WHERE config_key = ? LIMIT 1 FOR UPDATE',
      [key]
    );
    if (!rows[0]) throw new HttpError(409, 'Save a draft before publishing this section.');
    const configuration = CONFIG_SCHEMAS[key].parse(decodeConfig(rows[0].config_value, key));
    await database.execute(
      `INSERT INTO site_configuration (config_key, config_value, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE config_value = VALUES(config_value),
         updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP`,
      [key, JSON.stringify(configuration), adminId]
    );
    await database.execute('DELETE FROM site_configuration_drafts WHERE config_key = ?', [key]);
    await database.commit();
    return configuration;
  } catch (error) {
    try {
      await database.rollback();
    } catch {
      throw new Error('The website configuration publish failed and its rollback could not be confirmed.');
    }
    throw draftStorageError(error);
  }
}
