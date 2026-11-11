import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App.jsx';
import { DEFAULT_PUBLIC_WEBSITE_CONFIGURATION } from '../config/public-site-defaults.js';

const categoryData = [
  { id: 1, name: 'Startups', slug: 'startups' },
  { id: 2, name: 'Funding', slug: 'funding' }
];
const startupCityData = [
  { id: 1, name: 'Chennai', slug: 'chennai' },
  { id: 2, name: 'Coimbatore', slug: 'coimbatore' },
  { id: 3, name: 'Madurai', slug: 'madurai' },
  { id: 4, name: 'Trichy', slug: 'trichy' },
  { id: 5, name: 'Salem', slug: 'salem' },
  { id: 6, name: 'Erode', slug: 'erode' },
  { id: 7, name: 'Tirunelveli', slug: 'tirunelveli' },
  { id: 8, name: 'Cuddalore', slug: 'cuddalore' },
  { id: 9, name: 'Tanjore', slug: 'tanjore' },
  { id: 10, name: 'Hosur', slug: 'hosur' }
];
let sessionActive;
let storedArticles;
let nextArticleId;
let fetchMock;
let xhrRequest;
let currentAdminRole;
let currentProfile;
let accessUsers;
let accessControlFailureStatus;
let rolePermissionGrants;
let accountPermissionOverrides;
let permissionFailureStatus;
let permissionRoles;
let storedSiteConfiguration;
let storedSiteDrafts;
let siteConfigurationFailureStatus;
let siteConfigurationFailureDetails;

const registeredModuleRows = [
  ['overview', 'Overview', 'Dashboard'],
  ['news-articles', 'News Articles', 'Content Management'],
  ['web-stories', 'Web Stories', 'Content Management'],
  ['hero-slider', 'Hero Slider', 'Content Management'],
  ['video-media', 'Video & Media', 'Media Management'],
  ['media-library', 'Media Library', 'Media Management'],
  ['user-management', 'User Management', 'Administration'],
  ['role-builder', 'Role Builder', 'Administration'],
  ['access-control', 'Access Control', 'Administration'],
  ['branding-theme-editor', 'Branding & Theme', 'Website Management'],
  ['menu-management', 'Menu Management', 'Website Management'],
  ['footer-management', 'Footer Management', 'Website Management'],
  ['seo-management', 'SEO Management', 'Website Management']
];
const permissionActions = ['view', 'create', 'edit', 'publish', 'delete', 'manage', 'configure'];
const privilegedModules = new Set([
  'access-control', 'user-management', 'role-builder', 'branding-theme-editor',
  'menu-management', 'footer-management', 'seo-management'
]);

function moduleAvailability(moduleId) {
  return [
    'overview', 'news-articles', 'access-control', 'user-management', 'role-builder',
    'media-library', 'web-stories', 'hero-slider', 'video-media',
    'branding-theme-editor', 'menu-management', 'footer-management'
  ].includes(moduleId);
}

function permissionMatrix(role, adminId = null) {
  const roleKey = permissionRoles.find((item) => item.role === role)?.roleKey
    ?? (role === 'Super Admin' ? 'super-admin' : 'admin');
  const isCustomRole = permissionRoles.some((item) => item.roleKey === roleKey && !item.isBuiltIn);
  return registeredModuleRows.map(([moduleId, label, navigationGroup]) => {
    const isAvailable = moduleAvailability(moduleId);
    const roleActions = Object.fromEntries(permissionActions.map((action) => {
      const defaultGrant = !isCustomRole && (role === 'Super Admin'
        || (moduleId === 'overview' && action === 'view')
        || (moduleId === 'news-articles' && ['view', 'create', 'edit', 'publish', 'delete', 'manage'].includes(action)));
      return [action, rolePermissionGrants.get(`${roleKey}:${moduleId}:${action}`) ?? defaultGrant];
    }));
    const limits = Object.fromEntries(permissionActions.map((action) => [
      action,
      role === 'Super Admin' || (!privilegedModules.has(moduleId) && action !== 'configure')
    ]));
    const overrides = Object.fromEntries(permissionActions.map((action) => [
      action,
      accountPermissionOverrides.get(`${adminId}:${moduleId}:${action}`) ?? null
    ]));
    const actions = Object.fromEntries(permissionActions.map((action) => [
      action,
      Boolean((overrides[action] ?? roleActions[action]) && limits[action] && isAvailable)
    ]));
    return {
      moduleId,
      label,
      description: `${label} module.`,
      navigationGroup,
      isAvailable,
      isActive: isAvailable,
      implementationStatus: isAvailable ? 'implemented' : 'planned',
      roleActions,
      limits,
      overrides,
      actions,
      isVisible: actions.view
    };
  });
}

function apiResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

function installApi() {
  sessionActive = false;
  currentAdminRole = 'Admin';
  currentProfile = {
    id: '4',
    name: 'Editorial Admin',
    username: 'editor',
    email: 'editor@example.com',
    role: 'Admin',
    isActive: true,
    createdAt: '2026-10-28T12:00:00.000Z'
  };
  accessControlFailureStatus = 0;
  permissionFailureStatus = 0;
  permissionRoles = [
    {
      roleKey: 'admin',
      label: 'Admin',
      role: 'Admin',
      description: 'Built-in editorial administrator role.',
      isActive: true,
      isBuiltIn: true,
      isEditable: true,
      assignedCount: 10
    },
    {
      roleKey: 'super-admin',
      label: 'Super Admin',
      role: 'Super Admin',
      description: 'Protected system role.',
      isActive: true,
      isBuiltIn: true,
      isEditable: false,
      assignedCount: 1
    }
  ];
  rolePermissionGrants = new Map();
  accountPermissionOverrides = new Map();
  storedSiteConfiguration = JSON.parse(JSON.stringify(DEFAULT_PUBLIC_WEBSITE_CONFIGURATION));
  storedSiteDrafts = { menu: null, footer: null, branding: null };
  siteConfigurationFailureStatus = 0;
  siteConfigurationFailureDetails = null;
  nextArticleId = 3;
  accessUsers = Array.from({ length: 11 }, (_, index) => {
    const id = index + 4;
    return {
      id: String(id),
      name: id === 4 ? 'Editorial Admin' : `News Admin ${id}`,
      username: id === 4 ? 'editor' : `admin${id}`,
      email: id === 4 ? 'editor@example.com' : `admin${id}@example.com`,
      role: id === 4 ? currentAdminRole : 'Admin',
      isActive: true,
      createdAt: '2026-10-28T12:00:00.000Z'
    };
  });
  storedArticles = [
    {
      id: 1,
      title: 'Published ecosystem update',
      slug: 'published-ecosystem-update',
      summary: 'A current public story.',
      content: 'Published story details.',
      cover_image_url: null,
      source_url: null,
      category_id: 1,
      category_name: 'Startups',
      category_slug: 'startups',
      author_name: 'Editor',
      admin_id: 4,
      status: 'published',
      is_featured: false,
      published_at: '2026-10-28T12:00:00.000Z',
      created_at: '2026-10-28T12:00:00.000Z',
      updated_at: '2026-10-28T12:00:00.000Z'
    },
    {
      id: 2,
      title: 'Unfinished programme announcement',
      slug: 'draft-programme-announcement',
      summary: 'A private draft summary.',
      content: 'Draft details.',
      cover_image_url: null,
      source_url: null,
      category_id: 2,
      category_name: 'Funding',
      category_slug: 'funding',
      author_name: 'Editor',
      admin_id: 4,
      status: 'draft',
      is_featured: false,
      published_at: null,
      created_at: '2026-10-27T12:00:00.000Z',
      updated_at: '2026-10-27T12:00:00.000Z'
    }
  ];

  fetchMock = vi.fn(async (input, options = {}) => {
    const url = new URL(String(input), 'http://localhost');
    const method = options.method ?? 'GET';

    if (url.pathname === '/api/auth/me') {
      return apiResponse({
        data: {
          authenticated: sessionActive,
          admin: sessionActive
            ? {
              id: 4,
              name: currentProfile.name,
              username: currentProfile.username,
              email: currentProfile.email,
              role: currentAdminRole
            }
            : null
        }
      });
    }
    if (url.pathname === '/api/auth/login' && method === 'POST') {
      const credentials = JSON.parse(options.body);
      if (credentials.username !== 'editor' || credentials.password !== 'strong-password') {
        return apiResponse({ error: { message: 'Invalid username or password.' } }, 401);
      }
      sessionActive = true;
      accessUsers[0].role = currentAdminRole;
      return apiResponse({
        data: {
          admin: {
            id: 4,
            name: 'Editorial Admin',
            username: credentials.username,
            email: currentProfile.email,
            role: currentAdminRole
          }
        }
      });
    }
    if (url.pathname === '/api/auth/logout' && method === 'POST') {
      if (!sessionActive) return apiResponse({ error: { message: 'Authentication is required.' } }, 401);
      sessionActive = false;
      return apiResponse({ data: { loggedOut: true } });
    }
    if (url.pathname === '/api/auth/profile' && method === 'GET') {
      if (!sessionActive) return apiResponse({ error: { message: 'Authentication is required.' } }, 401);
      return apiResponse({ data: { profile: { ...currentProfile } } });
    }
    if (url.pathname === '/api/auth/profile' && method === 'PATCH') {
      if (!sessionActive) return apiResponse({ error: { message: 'Authentication is required.' } }, 401);
      const changes = JSON.parse(options.body);
      const emailChanged = changes.email.toLowerCase() !== currentProfile.email;
      const usernameChanged = changes.username.toLowerCase() !== currentProfile.username;
      currentProfile = { ...currentProfile, ...changes, username: changes.username.toLowerCase(), email: changes.email.toLowerCase() };
      return apiResponse({
        data: { profile: { ...currentProfile } },
        meta: { emailChanged, usernameChanged, otherSessionsInvalidated: emailChanged || usernameChanged ? 1 : 0 }
      });
    }
    if (url.pathname === '/api/auth/profile/password' && method === 'PATCH') {
      if (!sessionActive) return apiResponse({ error: { message: 'Authentication is required.' } }, 401);
      return apiResponse({ data: { changed: true }, meta: { otherSessionsInvalidated: 2 } });
    }
    if (url.pathname === '/api/categories') return apiResponse({ data: categoryData });
    if (url.pathname === '/api/startup-cities') return apiResponse({ data: startupCityData });
    if (!sessionActive && url.pathname.startsWith('/api/admin/')) {
      return apiResponse({ error: { message: 'Authentication is required.' } }, 401);
    }
    if (url.pathname.startsWith('/api/admin/access-control/users') && accessControlFailureStatus) {
      return apiResponse({
        error: {
          message: accessControlFailureStatus === 401
            ? 'Authentication is required.'
            : accessControlFailureStatus === 409
              ? 'The last active Super Admin cannot be demoted or deactivated.'
              : 'Super Admin privileges are required.'
        }
      }, accessControlFailureStatus);
    }
    if (url.pathname === '/api/admin/access-control/permissions/me' && method === 'GET') {
      if (permissionFailureStatus) {
        return apiResponse({ error: { message: 'Permission data is unavailable.' } }, permissionFailureStatus);
      }
      return apiResponse({
        data: {
          adminId: 4,
          role: currentAdminRole,
          isActive: true,
          modules: permissionMatrix(currentAdminRole, 4)
        }
      });
    }
    if (url.pathname === '/api/admin/site-config' && method === 'GET') {
      return apiResponse({ data: { ...storedSiteConfiguration, drafts: { ...storedSiteDrafts } } });
    }
    const siteConfigMatch = url.pathname.match(/^\/api\/admin\/site-config\/(menu|footer|branding)$/);
    if ((siteConfigMatch || url.pathname.match(/^\/api\/admin\/site-config\/(menu|footer|branding)\/publish$/))
      && siteConfigurationFailureStatus) {
      return apiResponse({
        error: {
          message: siteConfigurationFailureStatus === 400
            ? 'Request validation failed.'
            : 'Configuration service is temporarily unavailable.',
          ...(siteConfigurationFailureDetails
            ? { details: siteConfigurationFailureDetails }
            : {})
        }
      }, siteConfigurationFailureStatus);
    }
    if (siteConfigMatch && method === 'PUT') {
      const section = siteConfigMatch[1];
      storedSiteDrafts[section] = JSON.parse(options.body);
      return apiResponse({ data: { section, configuration: storedSiteDrafts[section] } });
    }
    const publishSiteConfigMatch = url.pathname.match(/^\/api\/admin\/site-config\/(menu|footer|branding)\/publish$/);
    if (publishSiteConfigMatch && method === 'POST') {
      const section = publishSiteConfigMatch[1];
      if (!storedSiteDrafts[section]) {
        return apiResponse({ error: { message: 'Save a draft before publishing this section.' } }, 409);
      }
      storedSiteConfiguration[section] = storedSiteDrafts[section];
      storedSiteDrafts[section] = null;
      return apiResponse({ data: { section, configuration: storedSiteConfiguration[section] } });
    }
    if (url.pathname === '/api/admin/access-control/permissions/roles' && method === 'GET') {
      return apiResponse({ data: permissionRoles });
    }
    if (url.pathname === '/api/admin/access-control/permissions/roles' && method === 'POST') {
      const payload = JSON.parse(options.body);
      if (permissionRoles.some((role) => role.roleKey === payload.roleKey || role.label === payload.label)) {
        return apiResponse({ error: { message: 'A role with that name or identifier already exists.' } }, 409);
      }
      const created = {
        roleKey: payload.roleKey,
        label: payload.label,
        role: payload.label,
        description: payload.description,
        isActive: payload.isActive,
        isBuiltIn: false,
        isEditable: false,
        assignedCount: 0
      };
      permissionRoles.push(created);
      for (const module of payload.permissions ?? []) {
        for (const [action, allowed] of Object.entries(module.actions)) {
          rolePermissionGrants.set(`${created.roleKey}:${module.moduleId}:${action}`, allowed);
        }
      }
      return apiResponse({
        data: {
          roleKey: created.roleKey,
          role: created.label,
          label: created.label,
          description: created.description,
          isActive: created.isActive,
          isBuiltIn: false,
          modules: permissionMatrix(created.label)
        }
      }, 201);
    }
    const rolePermissionMatch = url.pathname.match(/^\/api\/admin\/access-control\/permissions\/roles\/([^/]+)\/permissions$/);
    if (rolePermissionMatch && method === 'GET') {
      const roleKey = decodeURIComponent(rolePermissionMatch[1]);
      const role = permissionRoles.find((item) => item.roleKey === roleKey)?.role
        ?? (roleKey === 'super-admin' ? 'Super Admin' : 'Admin');
      const roleInfo = permissionRoles.find((item) => item.roleKey === roleKey);
      return apiResponse({
        data: {
          roleKey,
          role,
          label: role,
          description: roleInfo?.description ?? '',
          isActive: roleInfo?.isActive ?? true,
          isBuiltIn: roleInfo?.isBuiltIn ?? false,
          modules: permissionMatrix(role)
        }
      });
    }
    if (rolePermissionMatch && method === 'PATCH') {
      const roleKey = decodeURIComponent(rolePermissionMatch[1]);
      const changes = JSON.parse(options.body);
      for (const module of changes.permissions) {
        for (const [action, allowed] of Object.entries(module.actions)) {
          rolePermissionGrants.set(`${roleKey}:${module.moduleId}:${action}`, allowed);
        }
      }
      const role = permissionRoles.find((item) => item.roleKey === roleKey)?.role
        ?? (roleKey === 'super-admin' ? 'Super Admin' : 'Admin');
      return apiResponse({ data: { roleKey, role, label: role, modules: permissionMatrix(role) } });
    }
    const roleDetailsMatch = url.pathname.match(/^\/api\/admin\/access-control\/permissions\/roles\/([^/]+)$/);
    if (roleDetailsMatch && method === 'PATCH') {
      const roleKey = decodeURIComponent(roleDetailsMatch[1]);
      const role = permissionRoles.find((item) => item.roleKey === roleKey);
      if (!role || role.isBuiltIn) return apiResponse({ error: { message: 'The role was not found.' } }, 404);
      const changes = JSON.parse(options.body);
      Object.assign(role, {
        label: changes.label ?? role.label,
        role: changes.label ?? role.label,
        description: changes.description ?? role.description,
        isActive: changes.isActive ?? role.isActive
      });
      for (const module of changes.permissions ?? []) {
        for (const [action, allowed] of Object.entries(module.actions)) {
          rolePermissionGrants.set(`${roleKey}:${module.moduleId}:${action}`, allowed);
        }
      }
      return apiResponse({
        data: {
          roleKey,
          role: role.label,
          label: role.label,
          description: role.description,
          isActive: role.isActive,
          isBuiltIn: false,
          modules: permissionMatrix(role.label)
        }
      });
    }
    if (roleDetailsMatch && method === 'DELETE') {
      const roleKey = decodeURIComponent(roleDetailsMatch[1]);
      const roleIndex = permissionRoles.findIndex((item) => item.roleKey === roleKey);
      if (roleIndex < 0 || permissionRoles[roleIndex].isBuiltIn) {
        return apiResponse({ error: { message: 'The role was not found.' } }, 404);
      }
      if (permissionRoles[roleIndex].assignedCount > 0) {
        return apiResponse({ error: { message: 'Reassign those accounts in User Management before deleting the role.' } }, 409);
      }
      permissionRoles.splice(roleIndex, 1);
      return apiResponse({ data: { roleKey, deleted: true } });
    }
    const accountPermissionMatch = url.pathname.match(/^\/api\/admin\/access-control\/permissions\/accounts\/([^/]+)\/permissions$/);
    if (accountPermissionMatch && method === 'GET') {
      const account = accessUsers.find((item) => item.id === decodeURIComponent(accountPermissionMatch[1]));
      if (!account) return apiResponse({ error: { message: 'The administrator account was not found.' } }, 404);
      return apiResponse({
        data: {
          adminId: account.id,
          role: account.role,
          isActive: account.isActive,
          modules: permissionMatrix(account.role, account.id)
        }
      });
    }
    const accountOverridesMatch = url.pathname.match(/^\/api\/admin\/access-control\/permissions\/accounts\/([^/]+)\/overrides$/);
    if (accountOverridesMatch && method === 'PUT') {
      const id = decodeURIComponent(accountOverridesMatch[1]);
      const account = accessUsers.find((item) => item.id === id);
      if (!account) return apiResponse({ error: { message: 'The administrator account was not found.' } }, 404);
      for (const override of JSON.parse(options.body).overrides) {
        const key = `${id}:${override.moduleId}:${override.actionId}`;
        if (override.isAllowed === null) accountPermissionOverrides.delete(key);
        else accountPermissionOverrides.set(key, override.isAllowed);
      }
      return apiResponse({
        data: {
          adminId: account.id,
          role: account.role,
          isActive: account.isActive,
          modules: permissionMatrix(account.role, account.id)
        }
      });
    }
    if (url.pathname === '/api/admin/access-control/users' && method === 'POST') {
      const payload = JSON.parse(options.body);
      const created = {
        id: '90',
        name: payload.name,
        username: payload.username.toLowerCase(),
        email: payload.email.toLowerCase(),
        role: payload.role,
        isActive: payload.isActive,
        createdAt: new Date().toISOString()
      };
      accessUsers.unshift(created);
      return apiResponse({ data: created }, 201);
    }
    if (url.pathname === '/api/admin/access-control/users' && method === 'GET') {
      const page = Number(url.searchParams.get('page') ?? 1);
      const limit = Number(url.searchParams.get('limit') ?? 10);
      const query = url.searchParams.get('q')?.toLowerCase();
      const filtered = accessUsers.filter((account) =>
        !query || `${account.name} ${account.username} ${account.email}`.toLowerCase().includes(query)
      );
      return apiResponse({
        data: filtered.slice((page - 1) * limit, page * limit),
        pagination: {
          page,
          limit,
          total: filtered.length,
          totalPages: Math.ceil(filtered.length / limit)
        }
      });
    }
    const userMatch = url.pathname.match(/^\/api\/admin\/access-control\/users\/([^/]+)$/);
    if (userMatch && method === 'PATCH') {
      const changes = JSON.parse(options.body);
      const account = accessUsers.find((item) => item.id === decodeURIComponent(userMatch[1]));
      if (!account) return apiResponse({ error: { message: 'The administrator account was not found.' } }, 404);
      Object.assign(account, changes);
      return apiResponse({ data: { ...account }, meta: { changed: true, sessionsInvalidated: 2 } });
    }
    if (
      method === 'GET'
      && ['/api/admin/media', '/api/admin/web-stories', '/api/admin/hero-slides', '/api/admin/videos']
        .some((path) => url.pathname === path)
    ) {
      return apiResponse({
        data: [],
        pagination: { page: Number(url.searchParams.get('page') ?? 1), limit: 12, total: 0, totalPages: 0 }
      });
    }
    if (url.pathname === '/api/admin/web-stories' && method === 'POST') {
      const story = JSON.parse(options.body);
      return apiResponse({
        data: {
          id: 'story-1',
          ...story,
          published_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          slides: story.slides.map((slide, position) => ({ id: position + 1, position, ...slide }))
        }
      });
    }
    if (url.pathname === '/api/admin/articles' && method === 'GET') {
      let data = [...storedArticles];
      const status = url.searchParams.get('status');
      const query = url.searchParams.get('q')?.toLowerCase();
      if (status) data = data.filter((article) => article.status === status);
      if (query) data = data.filter((article) => `${article.title} ${article.summary}`.toLowerCase().includes(query));
      const page = Number(url.searchParams.get('page') ?? 1);
      const limit = Number(url.searchParams.get('limit') ?? 10);
      return apiResponse({
        data: data.slice((page - 1) * limit, page * limit),
        pagination: { page, limit, total: data.length, totalPages: Math.ceil(data.length / limit) }
      });
    }
    const detailMatch = url.pathname.match(/^\/api\/admin\/articles\/(\d+)$/);
    if (detailMatch && method === 'GET') {
      const article = storedArticles.find((item) => item.id === Number(detailMatch[1]));
      return article
        ? apiResponse({ data: article })
        : apiResponse({ error: { message: 'Article not found.' } }, 404);
    }
    if (url.pathname === '/api/admin/articles' && method === 'POST') {
      const payload = JSON.parse(options.body);
      if (storedArticles.some((article) => article.slug === payload.slug)) {
        return apiResponse({ error: { message: 'An article with this slug already exists.' } }, 409);
      }
      const category = categoryData.find((item) => item.id === payload.category_id);
      const created = {
        ...payload,
        id: nextArticleId++,
        category_name: category.name,
        category_slug: category.slug,
        admin_id: 4,
        published_at: payload.status === 'published' ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      storedArticles.unshift(created);
      return apiResponse({ data: created }, 201);
    }
    if (url.pathname === '/api/admin/articles/' && method === 'PATCH') {
      const { id, ...updates } = JSON.parse(options.body);
      const article = storedArticles.find((item) => item.id === id);
      if (!article) return apiResponse({ error: { message: 'Article not found.' } }, 404);
      Object.assign(article, updates);
      article.category_name = categoryData.find((item) => item.id === article.category_id).name;
      article.category_slug = categoryData.find((item) => item.id === article.category_id).slug;
      if (updates.status === 'draft') article.published_at = null;
      if (updates.status === 'published') article.published_at ??= new Date().toISOString();
      article.updated_at = new Date().toISOString();
      return apiResponse({ data: article });
    }
    if (url.pathname === '/api/admin/articles/' && method === 'DELETE') {
      const { id } = JSON.parse(options.body);
      const index = storedArticles.findIndex((item) => item.id === id);
      if (index < 0) return apiResponse({ error: { message: 'Article not found.' } }, 404);
      storedArticles.splice(index, 1);
      return apiResponse({ data: { deleted: true } });
    }
    return apiResponse({ error: { message: `Unhandled mock route ${method} ${url.pathname}` } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
}

class MockUploadRequest {
  constructor() {
    this.uploadListeners = {};
    this.listeners = {};
    this.upload = {
      addEventListener: (name, handler) => { this.uploadListeners[name] = handler; }
    };
    xhrRequest = this;
  }

  open(method, url) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name, value) {
    this.headers = { ...(this.headers ?? {}), [name]: value };
  }

  addEventListener(name, handler) {
    this.listeners[name] = handler;
  }

  send(formData) {
    this.file = formData.get('image');
    this.uploadListeners.progress({ lengthComputable: true, loaded: this.file.size / 2, total: this.file.size });
    this.status = 201;
    this.responseText = JSON.stringify({
      data: {
        url: 'https://res.cloudinary.com/startuptn/image/upload/startuptn-news/articles/new.png',
        secure_url: 'https://res.cloudinary.com/startuptn/image/upload/startuptn-news/articles/new.png',
        provider_id: 'startuptn-news/articles/new'
      }
    });
    this.uploadListeners.progress({ lengthComputable: true, loaded: this.file.size, total: this.file.size });
    this.listeners.load();
  }
}

function renderApp(path) {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

async function signIn(user) {
  await user.type(await screen.findByLabelText('Username'), 'editor');
  await user.type(screen.getByLabelText('Password'), 'strong-password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => {
  installApi();
  xhrRequest = null;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('admin CMS', () => {
  it('protects routes, verifies the session, logs in, and logs out', async () => {
    const user = userEvent.setup();
    renderApp('/admin/news');

    expect(await screen.findByLabelText('Username')).toHaveAttribute('type', 'text');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({ credentials: 'include' })
    );
    await signIn(user);
    expect(await screen.findByRole('heading', { name: 'Articles' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByLabelText('Username')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ credentials: 'include', method: 'POST' })
    );
  });

  it('shows dashboard draft and published counts from the API', async () => {
    const user = userEvent.setup();
    renderApp('/admin');
    await signIn(user);

    expect(await screen.findByText('Published articles')).toBeInTheDocument();
    expect(screen.getByText('Drafts')).toBeInTheDocument();
    expect(screen.getByText('2', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('Published ecosystem update')).toBeInTheDocument();
  });

  it('shows Access Control to Super Admins and loads the safe account list', async () => {
    currentAdminRole = 'Super Admin';
    const user = userEvent.setup();
    renderApp('/admin');
    await signIn(user);

    const accessLink = await screen.findByRole('link', { name: 'User Management' });
    expect(screen.getByText('Super Admin', { selector: '.admin-account-role' })).toBeInTheDocument();
    await user.click(accessLink);
    expect(await screen.findByRole('heading', { name: 'User Management' })).toBeInTheDocument();
    expect(screen.getByText('News Admin 5')).toBeInTheDocument();
    expect(screen.getByText('admin5@example.com')).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/access-control/users?page=1&limit=10',
      expect.objectContaining({ credentials: 'include' })
    );
    expect(screen.queryByText(/password_hash|session_id|auth_version/)).not.toBeInTheDocument();
  });

  it('creates an Admin account from backend-provided roles and refreshes the account list', async () => {
    currentAdminRole = 'Super Admin';
    const user = userEvent.setup();
    renderApp('/admin/access-control/users');
    await signIn(user);

    await user.click(await screen.findByRole('button', { name: 'Create Account' }));
    expect(await screen.findByRole('dialog', { name: 'Create administrator account' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Full Name'), 'New User');
    await user.type(screen.getByLabelText('Username'), 'New.User');
    await user.type(screen.getByLabelText('Email Address'), 'NEW.USER@example.com');
    await user.type(screen.getByLabelText('Initial Password'), 'Strong-password-123!');
    await user.type(screen.getByLabelText('Confirm Password'), 'Strong-password-123!');
    const createDialog = screen.getByRole('dialog', { name: 'Create administrator account' });
    expect(await within(createDialog).findByRole('combobox', { name: /^Role/ })).toHaveValue('Admin');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create Account' }));

    expect(await screen.findByRole('status')).toHaveTextContent('New User was created successfully.');
    expect(await screen.findByText('new.user')).toBeInTheDocument();
    expect(await screen.findByText('new.user@example.com')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/access-control/permissions/roles',
      expect.objectContaining({ credentials: 'include' })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/access-control/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'New User',
          username: 'new.user',
          email: 'NEW.USER@example.com',
          password: 'Strong-password-123!',
          role: 'Admin',
          isActive: true
        })
      })
    );
  });

  it('requires explicit confirmation before creating a Super Admin account', async () => {
    currentAdminRole = 'Super Admin';
    const user = userEvent.setup();
    renderApp('/admin/access-control/users');
    await signIn(user);
    await user.click(await screen.findByRole('button', { name: 'Create Account' }));
    await screen.findByRole('dialog', { name: 'Create administrator account' });
    await user.type(screen.getByLabelText('Full Name'), 'Elevated User');
    await user.type(screen.getByLabelText('Username'), 'elevated');
    await user.type(screen.getByLabelText('Email Address'), 'elevated@example.com');
    await user.type(screen.getByLabelText('Initial Password'), 'Strong-password-123!');
    await user.type(screen.getByLabelText('Confirm Password'), 'Strong-password-123!');
    const createDialog = screen.getByRole('dialog', { name: 'Create administrator account' });
    await user.selectOptions(await within(createDialog).findByRole('combobox', { name: /^Role/ }), 'Super Admin');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create Account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Confirm the elevated Super Admin role.');
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/admin/access-control/users',
      expect.objectContaining({ method: 'POST' })
    );

    await user.click(screen.getByLabelText(/Confirm this account should receive/));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create Account' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/access-control/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'Elevated User',
          username: 'elevated',
          email: 'elevated@example.com',
          password: 'Strong-password-123!',
          role: 'Super Admin',
          isActive: true,
          confirmSuperAdmin: true
        })
      })
    ));
  });

  it('shows field-level password confirmation validation and does not submit invalid input', async () => {
    currentAdminRole = 'Super Admin';
    const user = userEvent.setup();
    renderApp('/admin/access-control/users');
    await signIn(user);
    await user.click(await screen.findByRole('button', { name: 'Create Account' }));
    await screen.findByRole('dialog', { name: 'Create administrator account' });
    await user.type(screen.getByLabelText('Full Name'), 'New User');
    await user.type(screen.getByLabelText('Username'), 'new-user');
    await user.type(screen.getByLabelText('Email Address'), 'new@example.com');
    await user.type(screen.getByLabelText('Initial Password'), 'Strong-password-123!');
    await user.type(screen.getByLabelText('Confirm Password'), 'Different-password-123!');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create Account' }));

    expect(screen.getByRole('alert')).toHaveTextContent('The passwords do not match.');
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/admin/access-control/users',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('hides Access Control from Admins and denies direct page access', async () => {
    const user = userEvent.setup();
    renderApp('/admin/access-control/users');
    await signIn(user);
    expect(await screen.findByRole('heading', { name: 'You don’t have access to this module.' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Access Control/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'User Management' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/access-control/users'),
      expect.anything()
    );
  });

  it('filters navigation from server permissions and keeps forbidden modules out of Admin routes', async () => {
    const user = userEvent.setup();
    renderApp('/admin');
    await signIn(user);

    expect(await screen.findByRole('link', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'News Articles' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Role Builder' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Access Control/ })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/access-control/permissions/me',
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('opens the implemented content-management modules for Super Admin and denies an Admin direct access', async () => {
    currentAdminRole = 'Super Admin';
    const user = userEvent.setup();
    renderApp('/admin');
    await signIn(user);
    await user.click(await screen.findByRole('link', { name: 'Media Library' }));
    expect(await screen.findByRole('heading', { name: 'Media Library' })).toBeInTheDocument();

    cleanup();
    currentAdminRole = 'Admin';
    sessionActive = false;
    const regularAdminUser = userEvent.setup();
    renderApp('/admin/web-stories');
    await signIn(regularAdminUser);
    expect(await screen.findByRole('heading', { name: 'You don’t have access to this module.' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Web Stories' })).not.toBeInTheDocument();
  });

  it('keeps all public configuration editors Super Admin-only', async () => {
    currentAdminRole = 'Super Admin';
    const editors = [
      ['/admin/menu-management', 'Menu Management'],
      ['/admin/footer-management', 'Footer Editor'],
      ['/admin/branding', 'Branding & Theme Editor']
    ];
    for (const [path, heading] of editors) {
      sessionActive = false;
      const user = userEvent.setup();
      renderApp(path);
      await signIn(user);
      expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
      cleanup();
    }

    currentAdminRole = 'Admin';
    sessionActive = false;
    const regularAdminUser = userEvent.setup();
    renderApp('/admin/menu-management');
    await signIn(regularAdminUser);
    expect(await screen.findByRole('heading', { name: 'You don’t have access to this module.' })).toBeInTheDocument();
  });

  it('saves menu changes as a draft and only updates public configuration after publishing', async () => {
    currentAdminRole = 'Super Admin';
    const user = userEvent.setup();
    renderApp('/admin/menu-management');
    await signIn(user);

    expect(await screen.findByRole('heading', { name: 'Menu Management' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Website Management/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Branding & Theme' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Footer Editor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    await user.clear(screen.getByLabelText('English label'));
    await user.type(screen.getByLabelText('English label'), 'Front page');
    await user.click(screen.getByRole('button', { name: 'Apply to draft' }));
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(storedSiteDrafts.menu?.[0].labelEn).toBe('Front page'));
    expect(screen.getByRole('button', { name: 'Publish', exact: true })).toBeEnabled();
    expect(storedSiteConfiguration.menu[0].labelEn).toBe('Home');
    expect(screen.getByRole('status')).toHaveTextContent('Menu draft saved.');

    await user.click(screen.getByRole('button', { name: 'Publish', exact: true }));
    await waitFor(() => expect(storedSiteDrafts.menu).toBeNull());
    expect(storedSiteConfiguration.menu[0].labelEn).toBe('Front page');
    expect(screen.getByRole('status')).toHaveTextContent('Public navigation published successfully.');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/site-config/menu/publish',
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
  });

  it('enables publishing a footer draft only after changed text is saved', async () => {
    currentAdminRole = 'Super Admin';
    const user = userEvent.setup();
    renderApp('/admin/footer-management');
    await signIn(user);

    expect(await screen.findByRole('heading', { name: 'Footer Editor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
    await user.clear(screen.getByLabelText('Copyright text (English)'));
    await user.type(screen.getByLabelText('Copyright text (English)'), 'Updated copyright');
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(storedSiteDrafts.footer?.copyrightEn).toBe('Updated copyright'));
    expect(screen.getByRole('button', { name: 'Publish', exact: true })).toBeEnabled();
    expect(storedSiteConfiguration.footer.copyrightEn).not.toBe('Updated copyright');
    cleanup();
    renderApp('/admin/footer-management');
    await screen.findByRole('heading', { name: 'Footer Editor' });
    expect(screen.getByLabelText('Copyright text (English)')).toHaveValue('Updated copyright');
    expect(screen.getByRole('button', { name: 'Publish', exact: true })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Publish', exact: true }));
    await waitFor(() => expect(storedSiteConfiguration.footer.copyrightEn).toBe('Updated copyright'));
    expect(screen.getByRole('status')).toHaveTextContent('Public footer published successfully.');
    cleanup();
    renderApp('/admin/footer-management');
    await screen.findByRole('heading', { name: 'Footer Editor' });
    expect(screen.getByLabelText('Copyright text (English)')).toHaveValue('Updated copyright');
    expect(screen.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
  });

  it('enables publishing a branding color only after the changed theme is saved', async () => {
    currentAdminRole = 'Super Admin';
    const user = userEvent.setup();
    renderApp('/admin/branding');
    await signIn(user);

    expect(await screen.findByRole('heading', { name: 'Branding & Theme Editor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
    const colorInput = screen.getByLabelText('Primary colour hex value');
    await user.clear(colorInput);
    await user.type(colorInput, '#243a78');
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(storedSiteDrafts.branding?.primaryColor).toBe('#243a78'));
    expect(screen.getByRole('button', { name: 'Publish', exact: true })).toBeEnabled();
    expect(storedSiteConfiguration.branding.primaryColor).not.toBe('#243a78');
    await user.click(screen.getByRole('button', { name: 'Publish', exact: true }));
    await waitFor(() => expect(storedSiteConfiguration.branding.primaryColor).toBe('#243a78'));
    expect(screen.getByRole('status')).toHaveTextContent('Public website branding published successfully.');
  });

  it('sends the branding schema payload and displays safe backend validation details', async () => {
    currentAdminRole = 'Super Admin';
    const user = userEvent.setup();
    renderApp('/admin/branding');
    await signIn(user);
    await screen.findByRole('heading', { name: 'Branding & Theme Editor' });

    const primaryColor = screen.getByLabelText('Primary colour hex value');
    await user.clear(primaryColor);
    await user.type(primaryColor, '#ffffff');
    siteConfigurationFailureStatus = 400;
    siteConfigurationFailureDetails = [
      {
        path: 'primaryColor',
        message: 'Primary colour needs stronger contrast against white.'
      },
      {
        path: 'accentColor',
        message: 'Accent colour needs stronger contrast against the primary colour.'
      }
    ];
    await user.click(screen.getByRole('button', { name: 'Save Draft' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Request validation failed. primaryColor: Primary colour needs stronger contrast against white. accentColor: Accent colour needs stronger contrast against the primary colour.'
    );
    const [, options] = fetchMock.mock.calls.find(([url, opts]) =>
      url === '/api/admin/site-config/branding' && opts.method === 'PUT'
    );
    expect(JSON.parse(options.body)).toEqual({
      logoUrl: '',
      footerLogoUrl: '',
      faviconUrl: '',
      websiteName: 'StartupTN News',
      tagline: '',
      primaryColor: '#ffffff',
      secondaryColor: '#101b3b',
      accentColor: '#ffbe24',
      backgroundColor: '#f8f7f4',
      textColor: '#17283e',
      fontFamily: 'Inter'
    });
    expect(storedSiteDrafts.branding).toBeNull();
    expect(screen.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
  });

  it('retains failed draft and publish changes and allows retrying both requests', async () => {
    currentAdminRole = 'Super Admin';
    const user = userEvent.setup();
    renderApp('/admin/footer-management');
    await signIn(user);
    await screen.findByRole('heading', { name: 'Footer Editor' });
    const copyright = screen.getByLabelText('Copyright text (English)');
    await user.clear(copyright);
    await user.type(copyright, 'Retryable footer draft');

    siteConfigurationFailureStatus = 503;
    await user.click(screen.getByRole('button', { name: 'Save Draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Configuration service is temporarily unavailable.');
    expect(copyright).toHaveValue('Retryable footer draft');
    expect(storedSiteDrafts.footer).toBeNull();

    siteConfigurationFailureStatus = 0;
    await user.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(storedSiteDrafts.footer?.copyrightEn).toBe('Retryable footer draft'));
    expect(screen.getByRole('button', { name: 'Publish', exact: true })).toBeEnabled();

    siteConfigurationFailureStatus = 503;
    await user.click(screen.getByRole('button', { name: 'Publish', exact: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Configuration service is temporarily unavailable.');
    expect(storedSiteDrafts.footer?.copyrightEn).toBe('Retryable footer draft');
    expect(storedSiteConfiguration.footer.copyrightEn).not.toBe('Retryable footer draft');

    siteConfigurationFailureStatus = 0;
    await user.click(screen.getByRole('button', { name: 'Publish', exact: true }));
    await waitFor(() => expect(storedSiteConfiguration.footer.copyrightEn).toBe('Retryable footer draft'));
  });

  it('manages footer social links through the draft and publish workflow', async () => {
    currentAdminRole = 'Super Admin';
    const user = userEvent.setup();
    renderApp('/admin/footer-management');
    await signIn(user);

    expect(await screen.findByRole('heading', { name: 'Footer Editor' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add social link' }));
    await user.type(screen.getByLabelText('Platform / label'), 'LinkedIn');
    await user.clear(screen.getByLabelText('Secure URL (HTTPS)'));
    await user.type(screen.getByLabelText('Secure URL (HTTPS)'), 'https://www.linkedin.com/company/startuptn');
    await user.click(screen.getByRole('button', { name: 'Save Draft' }));

    await waitFor(() => {
      expect(storedSiteDrafts.footer.socialLinks[0]).toMatchObject({
        label: 'LinkedIn',
        url: 'https://www.linkedin.com/company/startuptn',
        isVisible: true
      });
    });
    expect(storedSiteConfiguration.footer.socialLinks).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Publish', exact: true }));
    await waitFor(() => expect(storedSiteConfiguration.footer.socialLinks).toHaveLength(1));
  });

  it('uploads branding assets through the existing media upload API', async () => {
    currentAdminRole = 'Super Admin';
    vi.stubGlobal('XMLHttpRequest', MockUploadRequest);
    const user = userEvent.setup();
    renderApp('/admin/branding');
    await signIn(user);

    expect(await screen.findByRole('heading', { name: 'Branding & Theme Editor' })).toBeInTheDocument();
    const uploadInput = screen.getAllByLabelText('Upload image')[0];
    await user.upload(uploadInput, new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' }));
    expect(await screen.findByLabelText('Main website logo')).toHaveValue(
      'https://res.cloudinary.com/startuptn/image/upload/startuptn-news/articles/new.png'
    );
    expect(xhrRequest.url).toBe('/api/admin/media/uploads');
    expect(xhrRequest.withCredentials).toBe(true);
  });

  it('saves web story slides using the validated API payload', async () => {
    currentAdminRole = 'Super Admin';
    const user = userEvent.setup();
    renderApp('/admin/web-stories');
    await signIn(user);
    await user.click(await screen.findByRole('button', { name: 'New story' }));
    await user.type(screen.getByLabelText('Title'), 'Founders in Tamil Nadu');
    await user.type(screen.getByLabelText('Slug'), 'founders-in-tamil-nadu');
    await user.click(screen.getByRole('button', { name: 'Add slide' }));
    await user.type(screen.getByLabelText('Image URL'), 'https://res.cloudinary.com/startuptn/image/upload/founders.webp');
    await user.type(screen.getByLabelText('Alternative text'), 'Founders at a meetup');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/web-stories',
        expect.objectContaining({ method: 'POST', credentials: 'include' })
      );
    });
    const [, options] = fetchMock.mock.calls.find(([url, opts]) =>
      url === '/api/admin/web-stories' && opts.method === 'POST'
    );
    expect(JSON.parse(options.body)).toMatchObject({
      title: 'Founders in Tamil Nadu',
      slug: 'founders-in-tamil-nadu',
      status: 'draft',
      slides: [{
        image_url: 'https://res.cloudinary.com/startuptn/image/upload/founders.webp',
        alt_text: 'Founders at a meetup'
      }]
    });
    expect(await screen.findByText('Story saved successfully.')).toBeInTheDocument();
  });

  it('blocks a regular Admin from directly opening Role Builder', async () => {
    const user = userEvent.setup();
    renderApp('/admin/role-builder');
    await signIn(user);

    expect(await screen.findByRole('heading', { name: 'You don’t have access to this module.' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Role Builder' })).not.toBeInTheDocument();
  });

  it('lets Admin and Super Admin manage their own profile without module permissions', async () => {
    const user = userEvent.setup();
    renderApp('/admin/profile');
    await signIn(user);

    expect(await screen.findByRole('heading', { name: 'Profile Settings' })).toBeInTheDocument();
    expect(screen.getByText('Account Information')).toBeInTheDocument();
    expect(screen.getByText('editor', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByText('Admin', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Profile Settings' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/profile',
      expect.objectContaining({ credentials: 'include' })
    );

    await user.clear(screen.getByLabelText('Full name'));
    await user.type(screen.getByLabelText('Full name'), 'Updated Editor');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Your account information was updated.');
    expect(screen.getByText('Updated Editor', { selector: 'dd' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/profile',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Editor', username: 'editor', email: 'editor@example.com' })
      })
    );

    currentAdminRole = 'Super Admin';
    currentProfile.role = currentAdminRole;
    cleanup();
    renderApp('/admin/profile');
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Profile Settings' })).toBeInTheDocument());
    expect(screen.getByText('Super Admin', { selector: 'dd' })).toBeInTheDocument();
  });

  it('keeps Profile Settings reachable when the permission service is unavailable', async () => {
    permissionFailureStatus = 503;
    const user = userEvent.setup();
    renderApp('/admin/profile');
    await signIn(user);

    expect(await screen.findByRole('heading', { name: 'Profile Settings' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Account Information' })).toBeInTheDocument();
    expect(screen.getAllByRole('alert').some((alert) =>
      alert.textContent.includes('Permission data is unavailable.')
    )).toBe(true);
  });

  it('validates password confirmation and exposes password visibility controls', async () => {
    const user = userEvent.setup();
    renderApp('/admin/profile');
    await signIn(user);
    await screen.findByRole('heading', { name: 'Change Password' });

    await user.type(screen.getByLabelText('Current password'), 'current-password');
    await user.type(screen.getByLabelText('New password'), 'StrongPassword123!');
    await user.type(screen.getByLabelText('Confirm new password'), 'DifferentPassword123!');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The passwords do not match.');
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/auth/profile/password',
      expect.anything()
    );

    await user.click(screen.getByRole('button', { name: 'Show current password' }));
    expect(screen.getByLabelText('Current password')).toHaveAttribute('type', 'text');
  });

  it('fails closed and shows a retryable error when effective permissions cannot load', async () => {
    permissionFailureStatus = 503;
    const user = userEvent.setup();
    renderApp('/admin/news');
    await signIn(user);

    await waitFor(() => {
      expect(screen.getAllByRole('alert').some((alert) =>
        alert.textContent.includes('Permission data is unavailable.')
      )).toBe(true);
    });
    expect(screen.queryByRole('link', { name: 'News Articles' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Articles' })).not.toBeInTheDocument();
  });

  it('loads the Role Builder API and confirms permission-matrix updates', async () => {
    currentAdminRole = 'Super Admin';
    const user = userEvent.setup();
    renderApp('/admin/role-builder');
    await signIn(user);

    expect(await screen.findByRole('heading', { name: 'Role Builder' })).toBeInTheDocument();
    const deletePermission = await screen.findByRole('checkbox', { name: 'Delete News Articles' });
    for (const group of [
      'Dashboard', 'Content Management', 'Media Management', 'Administration', 'Website Management'
    ]) {
      expect(screen.getByText(group, { selector: '.admin-eyebrow' })).toBeInTheDocument();
    }
    for (const obsoleteModule of [
      'Citizen Services', 'Police Stations', 'Helplines Registry',
      'Portal Links', 'FAQ Management'
    ]) {
      expect(screen.queryByText(obsoleteModule)).not.toBeInTheDocument();
    }
    expect(screen.getByText('SEO Management')).toBeInTheDocument();
    expect(deletePermission).toBeChecked();
    await user.click(deletePermission);
    await user.click(screen.getByRole('button', { name: 'Review 1 change' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Save role permission changes');
    await user.click(screen.getByRole('button', { name: 'Save permissions' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Permissions for Admin were saved.');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/access-control/permissions/roles/admin/permissions',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          permissions: [{ moduleId: 'news-articles', actions: { delete: false } }]
        })
      })
    );
    expect(screen.getByRole('checkbox', { name: 'Delete News Articles' })).not.toBeChecked();
  });

  it('creates a persisted custom role and exposes active roles in User Management', async () => {
    currentAdminRole = 'Super Admin';
    const user = userEvent.setup();
    renderApp('/admin/role-builder');
    await signIn(user);
    await screen.findByRole('heading', { name: 'Role Builder' });

    await user.click(screen.getByRole('button', { name: 'Create New Role' }));
    await user.type(await screen.findByRole('textbox', { name: /Role Name/ }), 'Copy Editor');
    expect(screen.getByRole('textbox', { name: /Role Identifier/ })).toHaveValue('copy-editor');
    await user.type(screen.getByRole('textbox', { name: 'Description' }), 'Edits newsroom copy.');
    const groups = [...document.querySelectorAll('.admin-custom-role-form .admin-permission-group')];
    const contentGroup = groups.find((group) =>
      group.querySelector('.admin-eyebrow')?.textContent === 'Content Management');
    expect(contentGroup).toBeTruthy();
    await user.click(within(contentGroup).getByRole('button', { name: 'Select category' }));
    expect(screen.getByRole('checkbox', { name: 'Delete News Articles' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'View Overview' })).not.toBeChecked();
    await user.click(within(contentGroup).getByRole('button', { name: 'Clear category' }));
    expect(screen.getByRole('checkbox', { name: 'View Overview' })).not.toBeChecked();
    const viewArticles = screen.getByRole('checkbox', { name: 'View News Articles' });
    await user.click(viewArticles);
    expect(screen.getByText('1 permissions selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create Role' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Role "Copy Editor" was created.');
    expect(permissionRoles.some((role) => role.roleKey === 'copy-editor' && role.isActive)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/access-control/permissions/roles',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"roleKey":"copy-editor"')
      })
    );
    const createPayload = JSON.parse(fetchMock.mock.calls.find(([url, options]) =>
      url === '/api/admin/access-control/permissions/roles' && options?.method === 'POST'
    )[1].body);
    expect(createPayload.permissions).toEqual([
      { moduleId: 'news-articles', actions: { view: true } }
    ]);

    await user.click(screen.getByRole('button', { name: 'Edit role' }));
    await user.click(screen.getByRole('checkbox', { name: 'Edit News Articles' }));
    await user.click(screen.getByRole('button', { name: 'Save Role' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Role "Copy Editor" was updated.');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/access-control/permissions/roles/copy-editor',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"edit":true')
      })
    );

    await user.click(screen.getByRole('link', { name: 'User Management' }));
    const assignRole = await screen.findByRole('combobox', { name: 'Role for News Admin 5' });
    expect(within(assignRole).getByRole('option', { name: 'Copy Editor' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Role Builder' }));
    await screen.findByRole('heading', { name: 'Role Builder' });
    await user.selectOptions(screen.getByLabelText('Selected role'), 'copy-editor');
    await screen.findByText('Copy Editor', { selector: '.admin-role-explainer strong' });
    await user.click(screen.getByRole('button', { name: 'Edit role' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Role Status' }), 'inactive');
    await user.click(screen.getByRole('button', { name: 'Save Role' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Role "Copy Editor" was updated.');

    await user.click(screen.getByRole('link', { name: 'User Management' }));
    await screen.findByRole('combobox', { name: 'Role for News Admin 5' });
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    const accountDialog = await screen.findByRole('dialog', { name: 'Create administrator account' });
    expect(within(accountDialog).queryByRole('option', { name: 'Copy Editor' })).not.toBeInTheDocument();
    await user.click(within(accountDialog).getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('link', { name: 'Role Builder' }));
    await screen.findByRole('heading', { name: 'Role Builder' });
    await user.selectOptions(screen.getByLabelText('Selected role'), 'copy-editor');
    await screen.findByRole('button', { name: 'Delete role' });
    await user.click(screen.getByRole('button', { name: 'Delete role' }));
    const deleteDialog = screen.getByRole('alertdialog');
    await user.click(within(deleteDialog).getByRole('button', { name: 'Delete role' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Role "Copy Editor" was deleted.');
    expect(permissionRoles.some((role) => role.roleKey === 'copy-editor')).toBe(false);
  }, 15000);

  it('sets and resets account permission overrides through the backend contract', async () => {
    currentAdminRole = 'Super Admin';
    const user = userEvent.setup();
    renderApp('/admin/access-control/permissions');
    await signIn(user);

    expect(await screen.findByRole('heading', { name: 'Account Permissions' })).toBeInTheDocument();
    expect(await screen.findByRole('combobox', { name: 'Account' })).toHaveValue('5');
    const publishOverride = await screen.findByLabelText('Publish override for News Articles');
    fireEvent.change(publishOverride, { target: { value: 'deny' } });
    fireEvent.click(document.querySelector('.admin-permission-savebar .admin-button--primary'));
    fireEvent.click(document.querySelector('.admin-dialog-actions .admin-button--danger'));
    expect(await screen.findByRole('status')).toHaveTextContent('Their existing sessions were invalidated.');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/access-control/permissions/accounts/5/overrides',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          overrides: [{ moduleId: 'news-articles', actionId: 'publish', isAllowed: false }]
        })
      })
    );

    fireEvent.click(document.querySelector('.admin-account-permission-toolbar .admin-button'));
    fireEvent.click(document.querySelector('.admin-dialog-actions .admin-button--danger'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/access-control/permissions/accounts/5/overrides',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          overrides: [{ moduleId: 'news-articles', actionId: 'publish', isAllowed: null }]
        })
      })
    );
  });

  it('disables account override controls for the current Super Admin account', async () => {
    currentAdminRole = 'Super Admin';
    const user = userEvent.setup();
    renderApp('/admin/access-control/permissions');
    await signIn(user);

    const accountSelect = await screen.findByRole('combobox', { name: 'Account' });
    await user.selectOptions(accountSelect, '4');
    const overrideControl = await screen.findByLabelText('Publish override for News Articles');
    expect(overrideControl).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset to role defaults' })).toBeDisabled();
  });

  it('searches and paginates using the access-control response contract', async () => {
    currentAdminRole = 'Super Admin';
    const user = userEvent.setup();
    renderApp('/admin/access-control/users');
    await signIn(user);
    await screen.findByText('News Admin 5');

    await user.type(screen.getByRole('searchbox', { name: 'Search by name, username, or email' }), 'News Admin 14');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('News Admin 14')).toBeInTheDocument();
    expect(screen.getByText('1 accounts')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/access-control/users?page=1&limit=10&q=News+Admin+14',
      expect.objectContaining({ credentials: 'include' })
    );

    await user.clear(screen.getByRole('searchbox', { name: 'Search by name, username, or email' }));
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByText('News Admin 5');
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Editorial Admin')).toBeInTheDocument();
  });

  it('confirms role and status changes, sends only supported fields, then reports success', async () => {
    currentAdminRole = 'Super Admin';
    const user = userEvent.setup();
    renderApp('/admin/access-control/users');
    await signIn(user);
    await screen.findByText('News Admin 5');

    const roleSelect = screen.getByLabelText('Role for News Admin 5');
    await user.selectOptions(roleSelect, 'Super Admin');
    await user.click(screen.getAllByRole('button', { name: 'Save role' })[1]);
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Change News Admin 5');
    await user.click(screen.getByRole('button', { name: 'Confirm change' }));
    expect(await screen.findByText("News Admin 5's account was updated successfully.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/access-control/users/5',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ role: 'Super Admin' }) })
    );

    const managedUserRow = screen.getByText('News Admin 5').closest('tr');
    await user.click(within(managedUserRow).getByRole('button', { name: 'Deactivate' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Remove access for News Admin 5');
    await user.click(screen.getByRole('button', { name: 'Confirm change' }));
    await waitFor(() => expect(accessUsers.find((account) => account.id === '5').isActive).toBe(false));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/access-control/users/5',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ isActive: false }) })
    );
  });

  it('shows backend rejection after confirmation without implying the change succeeded', async () => {
    currentAdminRole = 'Super Admin';
    const user = userEvent.setup();
    renderApp('/admin/access-control/users');
    await signIn(user);
    await screen.findByText('News Admin 5');

    await user.selectOptions(screen.getByLabelText('Role for News Admin 5'), 'Super Admin');
    const targetRow = screen.getByText('News Admin 5').closest('tr');
    await user.click(within(targetRow).getByRole('button', { name: 'Save role' }));
    accessControlFailureStatus = 409;
    await user.click(screen.getByRole('button', { name: 'Confirm change' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The last active Super Admin cannot be demoted or deactivated.'
    );
    expect(accessUsers.find((account) => account.id === '5').role).toBe('Admin');
  });

  it('disables self changes and handles 403 and expired-session 401 responses', async () => {
    currentAdminRole = 'Super Admin';
    const user = userEvent.setup();
    renderApp('/admin/access-control/users');
    await signIn(user);
    await screen.findByText('News Admin 5');

    expect(screen.getByLabelText('Role for Editorial Admin')).toBeDisabled();
    const ownRow = screen.getByLabelText('Role for Editorial Admin').closest('tr');
    expect(within(ownRow).getByRole('button', { name: 'Deactivate' })).toBeDisabled();

    accessControlFailureStatus = 403;
    await user.click(screen.getByRole('button', { name: 'Next →' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Super Admin privileges are required.');

    accessControlFailureStatus = 401;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Username')).toBeInTheDocument();
  });

  it('creates a persisted draft, previews current unsaved content, and publishes it', async () => {
    const user = userEvent.setup();
    renderApp('/admin/news/new');
    await signIn(user);

    await user.type(await screen.findByLabelText(/^Headline/), 'A founder builds for Tamil Nadu');
    expect(screen.getByLabelText(/^Article URL slug/)).toHaveValue('a-founder-builds-for-tamil-nadu');
    await user.type(screen.getByLabelText(/^Summary/), 'An editor-approved update for the ecosystem.');
    await user.type(screen.getByLabelText(/^Full article/), 'The full story, including verified details.');
    await user.type(screen.getByLabelText(/^Author name/), 'Editorial Desk');
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByRole('heading', { name: 'A founder builds for Tamil Nadu' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog')).getByText('The full story, including verified details.')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close preview' }));

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Draft saved successfully.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publish article' })).toBeEnabled());
    await waitFor(() => expect(screen.getByLabelText(/^Headline/)).toHaveValue('A founder builds for Tamil Nadu'));
    expect(storedArticles[0]).toMatchObject({
      title: 'A founder builds for Tamil Nadu',
      status: 'draft',
      published_at: null,
      admin_id: 4
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/articles',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: expect.stringContaining('"status":"draft"')
      })
    );

    await user.click(screen.getByRole('button', { name: 'Publish article' }));
    await waitFor(() => expect(storedArticles[0].status).toBe('published'));
    expect(storedArticles[0].published_at).toBeTruthy();
    expect(await screen.findByText('Article published successfully.')).toBeInTheDocument();
  }, 10000);

  it('creates Startup stories with an optional city and clears the city when the category changes', async () => {
    const user = userEvent.setup();
    renderApp('/admin/news/new');
    await signIn(user);

    await user.type(await screen.findByLabelText(/^Headline/), 'Startup city workflow');
    await user.type(screen.getByLabelText(/^Summary/), 'Optional city summary.');
    await user.type(screen.getByLabelText(/^Full article/), 'Verified article text.');
    await user.type(screen.getByLabelText(/^Author name/), 'Editorial Desk');
    const citySelect = screen.getByLabelText('City / Subcategory');
    expect(citySelect).toHaveValue('');
    await user.selectOptions(citySelect, '1');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    await waitFor(() => {
      expect(storedArticles.find((item) => item.slug === 'startup-city-workflow'))
        .toMatchObject({ category_id: 1, startup_city_id: 1 });
    });
  });

  it('loads the saved city when editing an existing Startup article', async () => {
    storedArticles[0].startup_city_id = 2;
    storedArticles[0].startup_city_name = 'Coimbatore';
    storedArticles[0].startup_city_slug = 'coimbatore';
    const user = userEvent.setup();
    renderApp('/admin/news/1/edit');
    await signIn(user);

    expect(await screen.findByLabelText('City / Subcategory')).toHaveValue('2');
    await user.selectOptions(screen.getByLabelText('City / Subcategory'), '1');
    await user.click(screen.getByRole('button', { name: 'Save & publish' }));
    await waitFor(() => expect(storedArticles[0].startup_city_id).toBe(1));

    await user.selectOptions(screen.getByLabelText(/^Category/), '2');
    expect(screen.queryByLabelText('City / Subcategory')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save & publish' }));
    await waitFor(() => expect(storedArticles[0]).toMatchObject({ category_id: 2, startup_city_id: null }));
  });

  it('uploads a validated image with session credentials and progress, then stores the hosted URL', async () => {
    vi.stubGlobal('XMLHttpRequest', MockUploadRequest);
    const NativeURL = globalThis.URL;
    vi.stubGlobal('URL', class MockURL extends NativeURL {
      static createObjectURL = vi.fn(() => 'blob:editor-preview');
      static revokeObjectURL = vi.fn();
    });
    const user = userEvent.setup();
    renderApp('/admin/news/new');
    await signIn(user);
    await screen.findByLabelText(/^Headline/);

    const image = new File([new Uint8Array([1, 2, 3])], 'cover.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Choose cover image'), image);
    expect(await screen.findByText('Image uploaded and ready to save with this article.')).toBeInTheDocument();
    expect(xhrRequest).toMatchObject({
      method: 'POST',
      url: '/api/admin/uploads',
      withCredentials: true
    });
    expect(xhrRequest.file.name).toBe('cover.png');
    expect(screen.getByRole('img', { name: 'Cover image preview' })).toHaveAttribute('src', 'blob:editor-preview');

    await user.type(screen.getByLabelText(/^Headline/), 'Image-backed announcement');
    await user.type(screen.getByLabelText(/^Summary/), 'A summary');
    await user.type(screen.getByLabelText(/^Full article/), 'Article body');
    await user.type(screen.getByLabelText(/^Author name/), 'Editorial Desk');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => {
      expect(storedArticles[0].cover_image_url).toBe(
        'https://res.cloudinary.com/startuptn/image/upload/startuptn-news/articles/new.png'
      );
    });
  });

  it('inserts uploaded images at the selected position and saves the existing story text', async () => {
    vi.stubGlobal('XMLHttpRequest', MockUploadRequest);
    const user = userEvent.setup();
    renderApp('/admin/news/2/edit');
    await signIn(user);

    const editor = await screen.findByLabelText(/^Full article/);
    const originalContent = 'Existing first paragraph.\n\nExisting second paragraph.';
    expect(editor).toHaveValue('Draft details.');
    fireEvent.change(editor, { target: { value: originalContent } });
    const insertionIndex = originalContent.indexOf('Existing second');
    editor.setSelectionRange(insertionIndex, insertionIndex);
    fireEvent.select(editor);

    const image = new File([new Uint8Array([1, 2, 3])], 'inline.png', { type: 'image/png' });
    await user.click(screen.getByRole('button', { name: 'Insert image into story' }));
    await user.upload(screen.getByLabelText('Choose image to insert into story'), image);
    expect(await screen.findByText('Image inserted into the story.')).toBeInTheDocument();

    const insertedContent = editor.value;
    expect(insertedContent).toContain('Existing first paragraph.');
    expect(insertedContent).toContain('Existing second paragraph.');
    expect(insertedContent.indexOf('Existing first paragraph.'))
      .toBeLessThan(insertedContent.indexOf('![Article image]'));
    expect(insertedContent.indexOf('![Article image]'))
      .toBeLessThan(insertedContent.indexOf('Existing second paragraph.'));

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => {
      expect(storedArticles.find((article) => article.id === 2).content).toBe(insertedContent);
    });
  });

  it('appends an inline image when no editor cursor position was retained', async () => {
    vi.stubGlobal('XMLHttpRequest', MockUploadRequest);
    const user = userEvent.setup();
    const originalContent = 'Existing article text.';
    storedArticles.find((article) => article.id === 2).content = originalContent;
    renderApp('/admin/news/2/edit');
    await signIn(user);

    const editor = await screen.findByLabelText(/^Full article/);
    expect(editor).toHaveValue(originalContent);
    await user.click(screen.getByRole('button', { name: 'Insert image into story' }));
    await user.upload(
      screen.getByLabelText('Choose image to insert into story'),
      new File([new Uint8Array([1, 2, 3])], 'inline.png', { type: 'image/png' })
    );

    expect(await screen.findByText('Image inserted into the story.')).toBeInTheDocument();
    expect(editor.value).toBe(
      `${originalContent}\n\n![Article image](https://res.cloudinary.com/startuptn/image/upload/startuptn-news/articles/new.png)`
    );
  });

  it('searches, edits, unpublishes, confirms deletion, and deletes articles through the API', async () => {
    const user = userEvent.setup();
    const originalContent = 'Original paragraph one.\n\nOriginal paragraph two.';
    storedArticles.find((article) => article.id === 2).content = originalContent;
    renderApp('/admin/news');
    await signIn(user);
    expect(await screen.findByText('Published ecosystem update')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: /Search articles/ }), 'programme announcement');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('Unfinished programme announcement')).toBeInTheDocument();
    expect(screen.queryByText('Published ecosystem update')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Unfinished programme announcement' }));
    expect(await screen.findByLabelText(/^Headline/)).toHaveValue('Unfinished programme announcement');
    expect(screen.getByLabelText(/^Full article/)).toHaveValue(originalContent);
    await user.clear(screen.getByLabelText(/^Headline/));
    await user.type(screen.getByLabelText(/^Headline/), 'Programme update revised');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => {
      expect(storedArticles.find((article) => article.id === 2).title).toBe('Programme update revised');
    });
    expect(storedArticles.find((article) => article.id === 2).content).toBe(originalContent);

    await user.click(screen.getByRole('link', { name: 'News Articles' }));
    await screen.findByText('Programme update revised');
    await user.click(
      within(screen.getByRole('row', { name: /Programme update revised/ }))
        .getByRole('button', { name: 'Publish' })
    );
    await waitFor(() => {
      expect(storedArticles.find((article) => article.id === 2).status).toBe('published');
    });
    expect(await screen.findByText('Article published successfully.')).toBeInTheDocument();

    const revisedArticleRow = screen.getByRole('row', { name: /Programme update revised/ });
    await user.click(within(revisedArticleRow).getByRole('button', { name: 'Unpublish' }));
    await waitFor(() => {
      expect(storedArticles.find((article) => article.id === 2).status).toBe('draft');
    });
    expect(storedArticles.find((article) => article.id === 2).published_at).toBeNull();

    await user.click(
      within(screen.getByRole('row', { name: /Programme update revised/ }))
        .getByRole('button', { name: 'Delete' })
    );
    expect(screen.getByRole('alertdialog')).toHaveTextContent('permanently removed');
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete article' }));
    await waitFor(() => expect(storedArticles.some((article) => article.id === 2)).toBe(false));
    expect(await screen.findByText('Article deleted.')).toBeInTheDocument();
  });

  it('shows invalid credentials without granting access', async () => {
    const user = userEvent.setup();
    renderApp('/admin/login');
    await user.type(await screen.findByLabelText('Username'), 'editor@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid username or password.');
    expect(screen.queryByRole('heading', { name: 'Overview' })).not.toBeInTheDocument();
  });
});
