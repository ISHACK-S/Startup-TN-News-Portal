import { randomUUID } from 'node:crypto';
import { recordAdminActivity } from '../services/admin-activity.service.js';

const MODULES = [
  ['/api/admin/articles', 'news-articles', 'article'],
  ['/api/admin/access-control/users', 'user-management', 'account'],
  ['/api/admin/access-control/permissions', 'access-control', 'permission'],
  ['/api/admin/site-config', null, 'website configuration'],
  ['/api/admin/web-stories', 'web-stories', 'web story'],
  ['/api/admin/hero-slides', 'hero-slider', 'hero slide'],
  ['/api/admin/videos', 'video-media', 'video'],
  ['/api/admin/media', 'media-library', 'media asset'],
  ['/api/admin/uploads', 'media-library', 'article image']
];

const SENSITIVE_KEYS = /password|secret|token|cookie|credential|authorization/i;
const SAFE_CHANGE_KEYS = new Set([
  'before', 'after', 'role', 'isActive', 'status', 'moduleId', 'actionId',
  'isAllowed', 'displayOrder', 'section', 'isFeatured', 'permissions', 'sessionsInvalidated',
  'overrides', 'actions', 'view', 'create', 'edit', 'publish', 'delete', 'manage', 'configure',
  'title', 'slug', 'categoryId', 'changedFields'
]);

function safeValue(value) {
  if (Array.isArray(value)) return value.map(safeValue);
  if (!value || typeof value !== 'object') return value;
  return safeChanges(value);
}

function safeChanges(value) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) return value.map(safeValue);
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => SAFE_CHANGE_KEYS.has(key) && !SENSITIVE_KEYS.test(key))
    .map(([key, child]) => [key, safeValue(child)]));
}

function activityForRequest(request, response) {
  const path = request.originalUrl.split('?')[0];
  const method = request.method.toUpperCase();
  if (request.activityChanged === false) return null;
  const authRoute = path === '/api/auth/login' || path === '/api/auth/logout';
  if (authRoute) {
    const login = path.endsWith('/login');
    const succeeded = response.statusCode < 400;
    return {
      actor: request.activityAdmin ?? request.admin ?? null,
      action: `auth.${login ? 'login' : 'logout'}.${succeeded ? 'succeeded' : 'failed'}`,
      module: 'security',
      description: `${login ? 'Administrator login' : 'Administrator logout'} ${succeeded ? 'succeeded' : 'failed'}.`,
      status: succeeded ? 'success' : 'failure',
      recordId: request.activityAdmin?.id ?? request.admin?.id ?? null
    };
  }
  if (path === '/api/auth/profile' && ['PATCH', 'PUT'].includes(method)) {
    return {
      actor: request.admin ?? null,
      action: 'account.profile.updated',
      module: 'user-management',
      description: 'Administrator account profile updated.',
      recordId: request.admin?.id ?? null,
      status: response.statusCode < 400 ? 'success' : 'failure'
    };
  }
  if (path === '/api/auth/profile/password' && method === 'PATCH') {
    return {
      actor: request.admin ?? null,
      action: 'security.password.changed',
      module: 'security',
      description: `Administrator password change ${response.statusCode < 400 ? 'succeeded' : 'failed'}.`,
      recordId: request.admin?.id ?? null,
      status: response.statusCode < 400 ? 'success' : 'failure'
    };
  }
  if (!path.startsWith('/api/admin/') || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return null;

  const match = MODULES.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  if (!match) return null;
  const [prefix, fixedModule, label] = match;
  const segments = path.slice(prefix.length).split('/').filter(Boolean);
  const body = request.validated?.body ?? {};
  let module = fixedModule ?? (segments[0] === 'branding' ? 'branding-theme-editor'
    : segments[0] === 'footer' ? 'footer-management'
      : 'menu-management');
  let action = method === 'POST' ? `${label}.created`
    : method === 'DELETE' ? `${label}.deleted`
      : `${label}.updated`;

  if (label === 'article' && method === 'PATCH' && Object.hasOwn(body, 'status')) {
    action = body.status === 'published' ? 'article.published' : 'article.unpublished';
  } else if (label === 'account' && method === 'PATCH') {
    action = Object.hasOwn(body, 'role') ? 'account.role.changed'
      : Object.hasOwn(body, 'isActive') ? `account.${body.isActive ? 'activated' : 'deactivated'}`
        : 'account.updated';
  } else if (label === 'permission') {
    if (path.includes('/overrides')) action = method === 'DELETE'
      ? 'account.permission-override.removed'
      : 'account.permissions.updated';
    else if (path.includes('/roles')) action = method === 'POST'
      ? 'role.created'
      : method === 'DELETE' ? 'role.deleted'
        : path.endsWith('/permissions') ? 'role.permissions.updated' : 'role.updated';
    else action = 'permission.module.updated';
  } else if (label === 'website configuration') {
    const section = segments[0] ?? 'menu';
    module = section === 'branding' ? 'branding-theme-editor'
      : section === 'footer' ? 'footer-management'
        : 'menu-management';
    action = path.endsWith('/publish') ? `${module}.published` : `${module}.updated`;
  } else if (['web story', 'hero slide', 'video'].includes(label)
      && Object.hasOwn(body, 'status')) {
    action = body.status === 'published' ? `${label.replace(/ /g, '-')}.published`
      : `${label.replace(/ /g, '-')}.unpublished`;
  }

  if (response.statusCode >= 400) {
    action = response.statusCode === 401 || response.statusCode === 403
      ? 'security.authorization.denied'
      : `attempt.${action}`;
  }
  const targetId = segments.find((segment) => /^[1-9]\d{0,19}$/.test(segment))
    ?? request.activityRecordId
    ?? body.id
    ?? null;
  const succeeded = response.statusCode < 400;
  return {
    actor: request.admin ?? null,
    action,
    module: response.statusCode === 401 || response.statusCode === 403 ? 'security' : module,
    description: `${succeeded ? 'Completed' : 'Failed'} ${action.replace(/[.-]/g, ' ')}.`,
    recordId: targetId,
    status: succeeded ? 'success' : 'failure',
    changes: safeChanges(request.activityChanges ?? (succeeded ? request.validated?.body : null)),
    ...(request.activityAction ? { action: request.activityAction } : {})
  };
}

export function requestCorrelationId(request, response, next) {
  const provided = request.get('x-request-id');
  request.correlationId = provided && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(provided)
    ? provided
    : randomUUID();
  response.setHeader('X-Request-ID', request.correlationId);
  next();
}

export function captureAdminActivity(request, response, next) {
  const originalJson = response.json.bind(response);
  response.json = (payload) => {
    const id = payload?.data?.id ?? payload?.data?.article?.id ?? payload?.data?.admin?.id;
    if (id !== undefined && id !== null) request.activityRecordId = id;
    return originalJson(payload);
  };
  response.once('finish', () => {
    const activity = activityForRequest(request, response);
    if (!activity) return;
    request.activityWritePromise = recordAdminActivity({
      ...activity,
      correlationId: request.correlationId
    }, request.app.locals.database).catch((error) => {
      console.error('Failed to write administrative activity record.', {
        correlationId: request.correlationId,
        action: activity.action,
        error: error.message
      });
    });
  });
  next();
}

export function getActivityForRequest(request, response) {
  return activityForRequest(request, response);
}
