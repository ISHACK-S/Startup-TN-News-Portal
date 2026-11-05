import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../src/middleware/error-handler.js';
import { adminWebsiteConfigurationRouter } from '../src/routes/admin-website-configuration.routes.js';
import { publicRouter } from '../src/routes/public.routes.js';
import {
  DEFAULT_WEBSITE_CONFIGURATION,
  getAdminWebsiteConfiguration,
  getPublicWebsiteConfiguration,
  publishWebsiteConfigurationDraft,
  saveWebsiteConfigurationDraft
} from '../src/services/website-configuration.service.js';
import {
  brandingConfigurationSchema,
  footerConfigurationSchema,
  menuConfigurationSchema
} from '../src/validation/website-configuration.schemas.js';
import {
  runWebsiteConfigurationDraftsMigration,
  runWebsiteConfigurationMigration
} from '../scripts/migrate-admin-authorization.js';

const moduleIds = ['branding-theme-editor', 'menu-management', 'footer-management'];
const configurationColumns = ['config_key', 'config_value', 'updated_by', 'updated_at'];

function migrationConnection({ partial = false, applied = false } = {}) {
  const state = {
    tables: new Set(partial ? ['site_configuration'] : []),
    columns: new Map(partial ? [['site_configuration', new Set(configurationColumns)]] : []),
    applied,
    modules: new Map(moduleIds.map((module_id) => [module_id, {
      module_id,
      is_available: 0,
      is_active: 0
    }])),
    createdTables: 0,
    migrationInserts: 0,
    releases: 0
  };
  const connection = {
    async execute(sql, values = []) {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('RELEASE_LOCK')) {
        state.releases += 1;
        return [[{ released: 1 }]];
      }
      if (sql.startsWith('SELECT migration_id FROM schema_migrations')) {
        return [[...(state.applied ? [{ migration_id: values[0] }] : [])]];
      }
      if (sql.includes('information_schema.TABLES')) {
        return [[...state.tables].map((table_name) => ({ table_name }))];
      }
      if (sql.includes('information_schema.COLUMNS')) {
        return [[...state.columns].flatMap(([table_name, columns]) =>
          [...columns].map((column_name) => ({ table_name, column_name }))
        )];
      }
      if (sql.includes('SELECT module_id, is_available, is_active FROM permission_modules')) {
        return [[...state.modules.values()]];
      }
      if (sql.startsWith('CREATE TABLE IF NOT EXISTS site_configuration')) {
        if (!state.tables.has('site_configuration')) {
          state.tables.add('site_configuration');
          state.columns.set('site_configuration', new Set(configurationColumns));
          state.createdTables += 1;
        }
        return [{ affectedRows: 0 }];
      }
      if (sql.startsWith('UPDATE permission_modules')) {
        for (const module of state.modules.values()) {
          module.is_available = 1;
          module.is_active = 1;
        }
        return [{ affectedRows: moduleIds.length }];
      }
      if (sql.startsWith('INSERT INTO schema_migrations')) {
        state.applied = true;
        state.migrationInserts += 1;
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected migration SQL: ${sql}`);
    }
  };
  return { connection, state };
}

describe('website configuration validation', () => {
  it('includes Videos after Latest news in the default configurable public navigation', () => {
    const videos = DEFAULT_WEBSITE_CONFIGURATION.menu.find(({ id }) => id === 'videos');
    assert.deepEqual(videos, {
      id: 'videos',
      labelEn: 'Videos',
      labelTa: 'காணொளிகள்',
      destinationType: 'internal',
      destination: '/videos',
      parentId: null,
      displayOrder: 25,
      isActive: true,
      isVisible: true,
      openInNewTab: false
    });
    assert.equal(menuConfigurationSchema.safeParse(DEFAULT_WEBSITE_CONFIGURATION.menu).success, true);
    assert.deepEqual(
      DEFAULT_WEBSITE_CONFIGURATION.menu.toSorted((a, b) => a.displayOrder - b.displayOrder)
        .slice(0, 3).map(({ id }) => id),
      ['home', 'news', 'videos']
    );
  });

  it('accepts supported internal and secure external destinations and rejects unsafe values', () => {
    const item = {
      id: 'updates',
      labelEn: 'Updates',
      labelTa: 'புதுப்பிப்புகள்',
      destinationType: 'internal',
      destination: '/news/',
      parentId: null,
      displayOrder: 10,
      isActive: true,
      isVisible: true,
      openInNewTab: false
    };
    assert.equal(menuConfigurationSchema.safeParse([item]).success, true);
    assert.equal(menuConfigurationSchema.safeParse([{
      ...item,
      destinationType: 'external',
      destination: 'javascript:alert(1)'
    }]).success, false);
    assert.equal(menuConfigurationSchema.safeParse([{
      ...item,
      destinationType: 'external',
      destination: 'https://example.org',
      openInNewTab: true
    }]).success, true);
  });

  it('requires an accent colour with sufficient contrast against the public theme', () => {
    const branding = {
      logoUrl: '',
      footerLogoUrl: '',
      faviconUrl: '',
      websiteName: 'StartupTN News',
      tagline: '',
      primaryColor: '#293f80',
      secondaryColor: '#101b3b',
      accentColor: '#ffbe24'
    };
    assert.equal(brandingConfigurationSchema.safeParse(branding).success, true);
    assert.equal(brandingConfigurationSchema.safeParse({
      ...branding,
      accentColor: '#293f80'
    }).success, false);
    assert.equal(brandingConfigurationSchema.parse(branding).fontFamily, 'Inter');
    assert.equal(brandingConfigurationSchema.safeParse({
      ...branding,
      backgroundColor: '#ffffff',
      textColor: '#eeeeee'
    }).success, false);
  });

  it('accepts only safe HTTPS footer social links and defaults older footer records', () => {
    const footer = DEFAULT_WEBSITE_CONFIGURATION.footer;
    assert.equal(footerConfigurationSchema.parse(footer).socialLinks.length, 0);
    assert.equal(footerConfigurationSchema.safeParse({
      ...footer,
      socialLinks: [{
        id: 'social-site',
        label: 'Official site',
        url: 'https://example.org',
        displayOrder: 10,
        isVisible: true
      }]
    }).success, true);
    assert.equal(footerConfigurationSchema.safeParse({
      ...footer,
      socialLinks: [{
        id: 'social-site',
        label: 'Unsafe',
        url: 'javascript:alert(1)',
        displayOrder: 10,
        isVisible: true
      }]
    }).success, false);
  });
});

describe('website configuration persistence', () => {
  it('returns live settings and separately scoped drafts to the administrator editor', async () => {
    const menuDraft = DEFAULT_WEBSITE_CONFIGURATION.menu.slice(0, 1);
    const database = {
      async execute(sql, [key]) {
        if (sql.includes('site_configuration_drafts')) {
          return [[...(key === 'menu' ? [{ config_value: menuDraft }] : [])]];
        }
        return [[{ config_value: DEFAULT_WEBSITE_CONFIGURATION[key] }]];
      }
    };
    const result = await getAdminWebsiteConfiguration(database);
    assert.deepEqual(result.menu, DEFAULT_WEBSITE_CONFIGURATION.menu);
    assert.deepEqual(result.drafts, {
      menu: menuDraft,
      footer: null,
      branding: null
    });
  });

  it('reports the pending draft-storage migration instead of a generic editor failure', async () => {
    const missingTableError = new Error("Table 'test.site_configuration_drafts' doesn't exist");
    missingTableError.code = 'ER_NO_SUCH_TABLE';
    missingTableError.errno = 1146;
    const database = {
      async execute(sql, values = []) {
        if (sql.includes('site_configuration_drafts')) throw missingTableError;
        const key = sql.includes('config_key = ?') ? values[0] : null;
        return [[{ config_value: DEFAULT_WEBSITE_CONFIGURATION[key] }]];
      }
    };
    await assert.rejects(
      getAdminWebsiteConfiguration(database),
      (error) => error.statusCode === 503 && /npm run migrate-admin-authorization/.test(error.message)
    );
  });

  it('filters hidden menu parents and their descendants from the public navigation', async () => {
    const config = {
      menu: [
        { ...DEFAULT_WEBSITE_CONFIGURATION.menu[0], id: 'hidden', parentId: null, isVisible: false },
        { ...DEFAULT_WEBSITE_CONFIGURATION.menu[1], id: 'child', parentId: 'hidden', isVisible: true },
        { ...DEFAULT_WEBSITE_CONFIGURATION.menu[2], id: 'visible', parentId: null, isVisible: true }
      ],
      footer: DEFAULT_WEBSITE_CONFIGURATION.footer,
      branding: DEFAULT_WEBSITE_CONFIGURATION.branding
    };
    const database = {
      async execute() {
        const key = ['menu', 'footer', 'branding'][this.readIndex++];
        return [[{ config_value: config[key] }]];
      },
      readIndex: 0
    };
    const result = await getPublicWebsiteConfiguration(database);
    assert.deepEqual(result.menu.map(({ id }) => id), ['visible']);
  });

  it('serves only visible social links in their configured order', async () => {
    const footer = {
      ...DEFAULT_WEBSITE_CONFIGURATION.footer,
      socialLinks: [
        { id: 'later', label: 'Later', url: 'https://example.org/later', displayOrder: 20, isVisible: true },
        { id: 'hidden', label: 'Hidden', url: 'https://example.org/hidden', displayOrder: 10, isVisible: false },
        { id: 'first', label: 'First', url: 'https://example.org/first', displayOrder: 10, isVisible: true }
      ]
    };
    const database = {
      async execute(_sql, [key]) {
        return [[{ config_value: key === 'footer' ? footer : DEFAULT_WEBSITE_CONFIGURATION[key] }]];
      }
    };
    const result = await getPublicWebsiteConfiguration(database);
    assert.deepEqual(result.footer.socialLinks.map(({ id }) => id), ['first', 'later']);
  });

  it('saves a draft without publishing it and rolls back a failed write', async () => {
    const state = { committed: 0, rolledBack: 0, fail: false };
    const configuration = DEFAULT_WEBSITE_CONFIGURATION.branding;
    const database = {
      async beginTransaction() {},
      async commit() { state.committed += 1; },
      async rollback() { state.rolledBack += 1; },
      async execute(sql) {
        if (state.fail && sql.startsWith('INSERT INTO site_configuration_drafts')) throw new Error('write failed');
        if (sql.startsWith('SELECT config_value FROM site_configuration_drafts')) return [[{ config_value: configuration }]];
        return [{ affectedRows: 1 }];
      }
    };
    assert.deepEqual(await saveWebsiteConfigurationDraft(database, 'branding', configuration, 7), {
      ...configuration,
      backgroundColor: '#f8f7f4',
      textColor: '#17283e',
      fontFamily: 'Inter'
    });
    assert.equal(state.committed, 1);
    state.fail = true;
    await assert.rejects(saveWebsiteConfigurationDraft(database, 'branding', configuration, 7), /write failed/);
    assert.equal(state.rolledBack, 1);
  });

  it('publishes the saved draft transactionally and removes it only after updating the live value', async () => {
    const state = { committed: 0, rolledBack: 0, live: null, draft: DEFAULT_WEBSITE_CONFIGURATION.menu };
    const database = {
      async beginTransaction() {},
      async commit() { state.committed += 1; },
      async rollback() { state.rolledBack += 1; },
      async execute(sql, values) {
        if (sql.startsWith('SELECT config_value FROM site_configuration_drafts')) {
          return [[...(state.draft ? [{ config_value: state.draft }] : [])]];
        }
        if (sql.startsWith('INSERT INTO site_configuration (')) {
          state.live = JSON.parse(values[1]);
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('DELETE FROM site_configuration_drafts')) {
          state.draft = null;
          return [{ affectedRows: 1 }];
        }
        throw new Error(`Unexpected publish query: ${sql}`);
      }
    };
    const published = await publishWebsiteConfigurationDraft(database, 'menu', 7);
    assert.equal(published.length, DEFAULT_WEBSITE_CONFIGURATION.menu.length);
    assert.deepEqual(state.live, published);
    assert.equal(state.draft, null);
    assert.equal(state.committed, 1);
    await assert.rejects(publishWebsiteConfigurationDraft(database, 'menu', 7), /Save a draft before publishing/);
    assert.equal(state.rolledBack, 1);
  });

  it('falls back to the full legacy menu when a stored menu document is invalid', async () => {
    const invalidMenu = [{ id: 'broken', labelEn: 'Broken' }];
    const database = {
      async execute(sql, values) {
        const key = values[0];
        const config = key === 'menu'
          ? invalidMenu
          : DEFAULT_WEBSITE_CONFIGURATION[key];
        return [[{ config_value: config }]];
      }
    };
    const result = await getPublicWebsiteConfiguration(database);
    assert.deepEqual(result.menu.map(({ id }) => id), DEFAULT_WEBSITE_CONFIGURATION.menu.map(({ id }) => id));
  });
});

describe('website configuration API', () => {
  it('serves the live public configuration without authentication', async () => {
    const app = express();
    app.locals.database = { async execute() { return [[]]; } };
    app.use('/api', publicRouter);
    app.use(errorHandler);
    const response = await request(app).get('/api/site-config');
    assert.equal(response.status, 200);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.body.data.menu[0].destination, '/');
    assert.equal(response.body.data.footer.websiteName, 'StartupTN News');
  });

  it('requires authentication and reserves admin configuration reads to Super Admin', async () => {
    const unauthenticated = express();
    unauthenticated.locals.database = { async execute() { return [[]]; } };
    unauthenticated.use('/api/admin/site-config', adminWebsiteConfigurationRouter);
    unauthenticated.use(errorHandler);
    assert.equal((await request(unauthenticated).get('/api/admin/site-config')).status, 401);

    const adminApp = express();
    adminApp.locals.database = {
      async execute() {
        return [[{
          id: 8,
          name: 'Admin',
          email: 'admin@example.org',
          role: 'Admin',
          is_active: 1,
          auth_version: 0
        }]];
      }
    };
    adminApp.use((req, res, next) => {
      req.session = { adminId: 8, authVersion: 0 };
      next();
    });
    adminApp.use('/api/admin/site-config', adminWebsiteConfigurationRouter);
    adminApp.use(errorHandler);
    assert.equal((await request(adminApp).get('/api/admin/site-config')).status, 403);
    assert.equal((await request(adminApp).put('/api/admin/site-config/menu').send(DEFAULT_WEBSITE_CONFIGURATION.menu)).status, 403);
    assert.equal((await request(adminApp).post('/api/admin/site-config/menu/publish').send({})).status, 403);
  });

  it('saves and publishes menu, footer, and branding drafts through their REST endpoints', async () => {
    const live = new Map();
    const drafts = new Map();
    const database = {
      async beginTransaction() {},
      async commit() {},
      async rollback() {},
      async execute(sql, values = []) {
        if (sql.includes('FROM admins WHERE id = ?')) {
          return [[{
            id: 8,
            name: 'Super Admin',
            email: 'admin@example.org',
            role: 'Super Admin',
            is_active: 1,
            auth_version: 0
          }]];
        }
        if (sql.startsWith('SELECT role_key, is_active FROM permission_roles WHERE label = ?')) {
          return [[{ role_key: 'super-admin', is_active: 1 }]];
        }
        if (sql.startsWith('SELECT config_value FROM site_configuration_drafts')) {
          const value = drafts.get(values[0]);
          return [[...(value ? [{ config_value: value }] : [])]];
        }
        if (sql.startsWith('SELECT config_value FROM site_configuration')) {
          const value = live.get(values[0]);
          return [[...(value ? [{ config_value: value }] : [])]];
        }
        if (sql.startsWith('INSERT INTO site_configuration_drafts')) {
          drafts.set(values[0], JSON.parse(values[1]));
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('INSERT INTO site_configuration (')) {
          live.set(values[0], JSON.parse(values[1]));
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('DELETE FROM site_configuration_drafts')) {
          drafts.delete(values[0]);
          return [{ affectedRows: 1 }];
        }
        throw new Error(`Unexpected configuration API query: ${sql}`);
      }
    };
    const app = express();
    app.use(express.json());
    app.locals.database = database;
    app.use((req, res, next) => {
      req.session = { adminId: 8, authVersion: 0 };
      next();
    });
    app.use('/api/admin/site-config', adminWebsiteConfigurationRouter);
    app.use('/api', publicRouter);
    app.use(errorHandler);

    const initial = await request(app).get('/api/admin/site-config');
    assert.equal(initial.status, 200);
    assert.equal(initial.body.data.drafts.menu, null);

    const invalidBranding = await request(app)
      .put('/api/admin/site-config/branding')
      .send({ ...DEFAULT_WEBSITE_CONFIGURATION.branding, primaryColor: '#ffffff' });
    assert.equal(invalidBranding.status, 400);
    assert.equal(invalidBranding.body.error.message, 'Request validation failed.');
    assert.deepEqual(invalidBranding.body.error.details, [
      {
        path: 'primaryColor',
        message: 'Primary colour needs stronger contrast against white.'
      },
      {
        path: 'accentColor',
        message: 'Accent colour needs stronger contrast against the primary colour.'
      }
    ]);
    assert.equal(drafts.has('branding'), false);

    const invalid = await request(app)
      .put('/api/admin/site-config/menu')
      .send([{ id: 'invalid' }]);
    assert.equal(invalid.status, 400);
    assert.equal(drafts.has('menu'), false);

    const menuDraft = DEFAULT_WEBSITE_CONFIGURATION.menu.map((item, index) => (
      index === 0 ? { ...item, labelEn: 'Front page' } : item
    ));
    const configurations = {
      menu: menuDraft,
      footer: { ...DEFAULT_WEBSITE_CONFIGURATION.footer, copyrightEn: 'Updated public footer' },
      branding: { ...DEFAULT_WEBSITE_CONFIGURATION.branding, primaryColor: '#243a78' }
    };
    for (const [section, configuration] of Object.entries(configurations)) {
      const saved = await request(app)
        .put(`/api/admin/site-config/${section}`)
        .send(configuration);
      assert.equal(saved.status, 200);
      assert.equal(saved.body.data.section, section);
      assert.ok(drafts.has(section));
      assert.equal(live.has(section), false);

      const refreshed = await request(app).get('/api/admin/site-config');
      assert.equal(refreshed.status, 200);
      assert.deepEqual(refreshed.body.data.drafts[section], configuration);

      const published = await request(app).post(`/api/admin/site-config/${section}/publish`).send({});
      assert.equal(published.status, 200);
      assert.equal(drafts.has(section), false);
    }

    const publicResponse = await request(app).get('/api/site-config');
    assert.equal(publicResponse.status, 200);
    assert.equal(publicResponse.body.data.menu[0].labelEn, 'Front page');
    assert.equal(publicResponse.body.data.footer.copyrightEn, 'Updated public footer');
    assert.equal(publicResponse.body.data.branding.primaryColor, '#243a78');
  });

  it('returns original defaults when migration 005 has not created the configuration table', async () => {
    const app = express();
    const missingTableError = new Error("Table 'test.site_configuration' doesn't exist");
    missingTableError.code = 'ER_NO_SUCH_TABLE';
    missingTableError.errno = 1146;
    app.locals.database = { async execute() { throw missingTableError; } };
    app.use('/api', publicRouter);
    app.use(errorHandler);

    const response = await request(app).get('/api/site-config');
    assert.equal(response.status, 200);
    assert.equal(response.body.data.brandingCustomized, false);
    assert.equal(response.body.data.menu.some((item) => item.id === 'startups'), true);
    assert.equal(response.body.data.menu.some((item) => item.id === 'videos'), true);
    assert.equal(response.body.data.menu.some((item) => item.id === 'stories'), false);
    assert.equal(response.body.data.footer.websiteName, 'StartupTN News');
  });

  it('does not convert unrelated database errors into successful defaults', async () => {
    const app = express();
    app.locals.database = { async execute() { throw new Error('connection lost'); } };
    app.use('/api', publicRouter);
    app.use(errorHandler);
    const response = await request(app).get('/api/site-config');
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, {
      error: { message: 'An unexpected server error occurred.' }
    });
  });
});

describe('website configuration migration', () => {
  it('creates and verifies the table and enables modules, then safely reruns', async () => {
    const { connection, state } = migrationConnection();
    assert.deepEqual(await runWebsiteConfigurationMigration(connection), {
      applied: true,
      migrationId: '005_website_configuration'
    });
    assert.equal(state.createdTables, 1);
    assert.equal(state.migrationInserts, 1);
    assert.ok([...state.modules.values()].every((module) => module.is_available === 1 && module.is_active === 1));
    assert.deepEqual(await runWebsiteConfigurationMigration(connection), {
      applied: false,
      migrationId: '005_website_configuration'
    });
    assert.equal(state.createdTables, 1);
    assert.equal(state.migrationInserts, 1);
    assert.equal(state.releases, 2);
  });

  it('creates and verifies the draft table with a rerunnable migration', async () => {
    const state = { tables: new Set(['site_configuration']), columns: new Set(), applied: false, creates: 0, inserts: 0 };
    const connection = {
      async execute(sql, values = []) {
        if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
        if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
        if (sql.startsWith('SELECT migration_id FROM schema_migrations')) {
          return [[...(state.applied ? [{ migration_id: values[0] }] : [])]];
        }
        if (sql.includes("TABLE_NAME = 'site_configuration_drafts'") && sql.includes('information_schema.COLUMNS')) {
          return [[...state.columns].map((column_name) => ({ column_name }))];
        }
        if (sql.includes("TABLE_NAME = 'site_configuration'")) return [[{ table_name: 'site_configuration' }]];
        if (sql.includes("TABLE_NAME = 'site_configuration_drafts'")) {
          return [[...(state.tables.has('site_configuration_drafts') ? [{ table_name: 'site_configuration_drafts' }] : [])]];
        }
        if (sql.startsWith('CREATE TABLE IF NOT EXISTS site_configuration_drafts')) {
          state.tables.add('site_configuration_drafts');
          state.columns = new Set(configurationColumns);
          state.creates += 1;
          return [{ affectedRows: 0 }];
        }
        if (sql.startsWith('INSERT INTO schema_migrations')) {
          state.applied = true;
          state.inserts += 1;
          return [{ affectedRows: 1 }];
        }
        throw new Error(`Unexpected draft migration SQL: ${sql}`);
      }
    };
    assert.deepEqual(await runWebsiteConfigurationDraftsMigration(connection), {
      applied: true,
      migrationId: '006_website_configuration_drafts'
    });
    assert.deepEqual(await runWebsiteConfigurationDraftsMigration(connection), {
      applied: false,
      migrationId: '006_website_configuration_drafts'
    });
    assert.equal(state.creates, 2);
    assert.equal(state.inserts, 1);
  });

  it('resumes when the table already exists without recreating it or marking failed prerequisites applied', async () => {
    const partial = migrationConnection({ partial: true });
    assert.equal((await runWebsiteConfigurationMigration(partial.connection)).applied, true);
    assert.equal(partial.state.createdTables, 0);

    const missingModule = migrationConnection();
    missingModule.state.modules.delete('footer-management');
    await assert.rejects(runWebsiteConfigurationMigration(missingModule.connection), /modules are missing/);
    assert.equal(missingModule.state.migrationInserts, 0);
    assert.equal(missingModule.state.applied, false);
  });

  it('uses non-destructive DDL and only records the migration after verified operations', async () => {
    const migration = await readFile(
      new URL('../../database/migrations/005_website_configuration.sql', import.meta.url),
      'utf8'
    );
    assert.match(migration, /CREATE TABLE IF NOT EXISTS site_configuration/);
    assert.doesNotMatch(migration, /\bDROP\s+TABLE\b|\bDELETE\s+FROM\b/i);
    const { connection, state } = migrationConnection();
    state.modules.get('menu-management').is_active = 1;
    const originalExecute = connection.execute;
    connection.execute = async (sql, values) => {
      if (sql.startsWith('UPDATE permission_modules')) throw new Error('module update failed');
      return originalExecute(sql, values);
    };
    await assert.rejects(runWebsiteConfigurationMigration(connection), /module update failed/);
    assert.equal(state.migrationInserts, 0);
  });
});
