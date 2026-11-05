import { pool } from '../database/pool.js';
import { HttpError } from '../errors/http-error.js';

const CONTENT_MODULES = ['news-articles', 'web-stories', 'hero-slider', 'video-media'];
const ACCOUNT_MODULES = ['user-management', 'role-builder', 'access-control'];
const WEBSITE_MODULES = ['branding-theme-editor', 'menu-management', 'footer-management', 'seo-management'];
const MAX_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 10000;
const SAFE_CHANGE_KEYS = new Set([
  'before', 'after', 'role', 'isActive', 'status', 'moduleId', 'actionId',
  'isAllowed', 'displayOrder', 'section', 'isFeatured', 'permissions', 'sessionsInvalidated',
  'overrides', 'actions', 'view', 'create', 'edit', 'publish', 'delete', 'manage', 'configure',
  'title', 'slug', 'categoryId', 'changedFields'
]);
const SENSITIVE_CHANGE_KEY = /password|secret|token|cookie|credential|authorization/i;

function monthRange({ month, year }) {
  const start = `${year}-${String(month).padStart(2, '0')}-01 00:00:00`;
  const next = new Date(Date.UTC(year, month, 1));
  const end = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01 00:00:00`;
  return { start, end };
}

function reportFilters(filters) {
  const { start, end } = monthRange(filters);
  const clauses = ['occurred_at >= ?', 'occurred_at < ?'];
  const values = [start, end];
  if (filters.adminId) {
    clauses.push('actor_admin_id = ?');
    values.push(filters.adminId);
  }
  if (filters.role) {
    clauses.push('actor_role = ?');
    values.push(filters.role);
  }
  if (filters.module) {
    clauses.push('module_id = ?');
    values.push(filters.module);
  }
  if (filters.action) {
    clauses.push('action_type = ?');
    values.push(filters.action);
  }
  if (filters.status) {
    clauses.push('status = ?');
    values.push(filters.status);
  }
  if (filters.q) {
    const escaped = filters.q.replace(/[\\%_]/g, '\\$&');
    const pattern = `%${escaped}%`;
    clauses.push("(description LIKE ? ESCAPE '\\\\' OR actor_name LIKE ? ESCAPE '\\\\' OR actor_email LIKE ? ESCAPE '\\\\' OR action_type LIKE ? ESCAPE '\\\\')");
    values.push(pattern, pattern, pattern, pattern);
  }
  return { where: clauses.join(' AND '), values };
}

function asNumber(value) {
  return Number(value ?? 0);
}

function decodeChanges(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new HttpError(503, 'An activity record contains invalid change details.');
  }
}

function sanitizeChanges(value) {
  if (Array.isArray(value)) return value.map(sanitizeChangeValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => SAFE_CHANGE_KEYS.has(key) && !SENSITIVE_CHANGE_KEY.test(key))
    .map(([key, child]) => [key, sanitizeChangeValue(child)]));
}

function sanitizeChangeValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeChangeValue);
  if (!value || typeof value !== 'object') return value;
  return sanitizeChanges(value);
}

function mapActivity(row) {
  return {
    id: String(row.activity_id),
    administratorId: row.actor_admin_id === null ? null : String(row.actor_admin_id),
    administratorName: row.actor_name ?? 'Unknown administrator',
    email: row.actor_email ?? '',
    role: row.actor_role ?? 'Unknown',
    module: row.module_id,
    action: row.action_type,
    description: row.description,
    recordId: row.record_id,
    occurredAt: row.occurred_at,
    status: row.status,
    changes: decodeChanges(row.changes),
    correlationId: row.correlation_id
  };
}

export async function recordAdminActivity(activity, database = pool) {
  const {
    actor = null,
    action,
    module,
    description,
    recordId = null,
    status = 'success',
    changes = null,
    correlationId = null
  } = activity;
  if (!action || !module || !description || !['success', 'failure'].includes(status)) {
    throw new TypeError('An activity requires an action, module, description, and valid status.');
  }
  await database.execute(
    `INSERT INTO admin_activity_logs
       (actor_admin_id, actor_name, actor_email, actor_role, action_type, module_id,
        description, record_id, status, changes, correlation_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      actor?.id ?? null,
      actor?.name ?? null,
      actor?.email ?? null,
      actor?.role ?? null,
      action,
      module,
      description.slice(0, 255),
      recordId === null || recordId === undefined ? null : String(recordId).slice(0, 128),
      status,
      changes === null ? null : JSON.stringify(sanitizeChanges(changes)),
      correlationId
    ]
  );
}

export async function getMonthlyActivityReport(filters, database = pool, { exportLimit } = {}) {
  const { where, values } = reportFilters(filters);
  const page = filters.page ?? 1;
  const limit = exportLimit ?? Math.min(filters.limit ?? 25, MAX_PAGE_SIZE);
  const offset = exportLimit ? 0 : (page - 1) * limit;
  const [
    [summaryRows],
    [dailyRows],
    [moduleRows],
    [actionRows],
    [administratorRows],
    [countRows],
    [activityRows]
  ] = await Promise.all([
    database.execute(
      `SELECT COUNT(*) AS total,
              COUNT(DISTINCT CASE WHEN admins.is_active = 1
                                  THEN admin_activity_logs.actor_admin_id END) AS administrators,
              SUM(module_id IN (${CONTENT_MODULES.map(() => '?').join(',')})) AS content_actions,
              SUM(module_id IN (${ACCOUNT_MODULES.map(() => '?').join(',')})) AS account_actions,
              SUM(module_id IN (${WEBSITE_MODULES.map(() => '?').join(',')})) AS website_changes,
              SUM(module_id = 'security' OR action_type LIKE 'auth.%'
                  OR action_type LIKE 'security.%') AS security_events
       FROM admin_activity_logs
       LEFT JOIN admins ON admins.id = admin_activity_logs.actor_admin_id
       WHERE ${where}`,
      [...CONTENT_MODULES, ...ACCOUNT_MODULES, ...WEBSITE_MODULES, ...values]
    ),
    database.execute(
      `SELECT DATE(occurred_at) AS day, COUNT(*) AS total
       FROM admin_activity_logs WHERE ${where}
       GROUP BY DATE(occurred_at) ORDER BY day`,
      values
    ),
    database.execute(
      `SELECT module_id AS module, COUNT(*) AS total
       FROM admin_activity_logs WHERE ${where}
       GROUP BY module_id ORDER BY total DESC, module_id`,
      values
    ),
    database.execute(
      `SELECT action_type AS action, COUNT(*) AS total
       FROM admin_activity_logs WHERE ${where}
       GROUP BY action_type ORDER BY total DESC, action_type`,
      values
    ),
    database.execute(
      `SELECT actor_admin_id AS administratorId,
              COALESCE(actor_name, 'Unknown administrator') AS administratorName,
              COALESCE(actor_email, '') AS email,
              GROUP_CONCAT(DISTINCT COALESCE(actor_role, 'Unknown')
                           ORDER BY actor_role SEPARATOR ', ') AS role,
              COUNT(*) AS actions,
              MAX(occurred_at) AS mostRecentActivity
       FROM admin_activity_logs WHERE ${where}
       GROUP BY actor_admin_id, actor_name, actor_email
       ORDER BY actions DESC, mostRecentActivity DESC, administratorName`,
      values
    ),
    database.execute(
      `SELECT COUNT(*) AS total FROM admin_activity_logs WHERE ${where}`,
      values
    ),
    database.execute(
      `SELECT activity_id, actor_admin_id, actor_name, actor_email, actor_role,
              action_type, module_id, description, record_id, occurred_at,
              status, changes, correlation_id
       FROM admin_activity_logs WHERE ${where}
       ORDER BY occurred_at DESC, activity_id DESC LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    )
  ]);
  const total = asNumber(countRows[0]?.total);
  const summary = summaryRows[0] ?? {};
  return {
    month: filters.month,
    year: filters.year,
    summary: {
      totalActivities: asNumber(summary.total),
      activeAdministrators: asNumber(summary.administrators),
      contentActions: asNumber(summary.content_actions),
      accountActions: asNumber(summary.account_actions),
      websiteChanges: asNumber(summary.website_changes),
      securityEvents: asNumber(summary.security_events)
    },
    daily: dailyRows.map((row) => ({ day: row.day, total: asNumber(row.total) })),
    modules: moduleRows.map((row) => ({ module: row.module, total: asNumber(row.total) })),
    actions: actionRows.map((row) => ({ action: row.action, total: asNumber(row.total) })),
    administrators: administratorRows.map((row) => ({
      administratorId: row.administratorId === null ? null : String(row.administratorId),
      administratorName: row.administratorName,
      email: row.email,
      role: row.role,
      actions: asNumber(row.actions),
      mostRecentActivity: row.mostRecentActivity
    })),
    activities: {
      data: activityRows.map(mapActivity),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        truncated: Boolean(exportLimit && total > exportLimit)
      }
    }
  };
}

export async function getAdminActivityDetails(activityId, database = pool) {
  const [rows] = await database.execute(
    `SELECT activity_id, actor_admin_id, actor_name, actor_email, actor_role,
            action_type, module_id, description, record_id, occurred_at,
            status, changes, correlation_id
     FROM admin_activity_logs WHERE activity_id = ? LIMIT 1`,
    [activityId]
  );
  if (!rows[0]) throw new HttpError(404, 'The activity record was not found.');
  return mapActivity(rows[0]);
}

export async function getMonthlyActivityExport(filters, database = pool) {
  return getMonthlyActivityReport(
    { ...filters, page: 1, limit: MAX_EXPORT_ROWS },
    database,
    { exportLimit: MAX_EXPORT_ROWS }
  );
}
