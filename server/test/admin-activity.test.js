import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { before, describe, it } from 'node:test';
import express from 'express';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret-that-is-long-enough';
process.env.MYSQL_HOST = '127.0.0.1';
process.env.MYSQL_PORT = '3306';
process.env.MYSQL_DATABASE = 'startuptn_test';
process.env.MYSQL_USER = 'test';
process.env.MYSQL_PASSWORD = 'test';
process.env.MYSQL_SSL = 'false';

let activityService;
let activityMiddleware;
let activityController;
let activityRouter;
let errorHandler;

before(async () => {
  [activityService, activityMiddleware, activityController, activityRouter, { errorHandler }] = await Promise.all([
    import('../src/services/admin-activity.service.js'),
    import('../src/middleware/admin-activity.js'),
    import('../src/controllers/admin-activity.controller.js'),
    import('../src/routes/admin-activity.routes.js'),
    import('../src/middleware/error-handler.js')
  ]);
});

function reportDatabase() {
  const calls = [];
  return {
    calls,
    async execute(sql, values = []) {
      calls.push({ sql, values });
      if (sql.includes('COUNT(DISTINCT CASE WHEN admins.is_active = 1')) {
        return [[{
          total: 3,
          administrators: 2,
          content_actions: 1,
          account_actions: 1,
          website_changes: 0,
          security_events: 1
        }]];
      }
      if (sql.includes('GROUP BY DATE(occurred_at)')) {
        return [[{ day: '2026-11-02', total: 2 }]];
      }
      if (sql.includes('GROUP BY module_id')) return [[{ module: 'security', total: 1 }]];
      if (sql.includes('GROUP BY action_type')) return [[{ action: 'auth.login.failed', total: 1 }]];
      if (sql.includes('GROUP BY actor_admin_id')) {
        return [[{
          administratorId: 7,
          administratorName: 'Historical Name',
          email: 'history@example.com',
          role: 'Editor',
          actions: 2,
          mostRecentActivity: '2026-11-02 12:00:00'
        }]];
      }
      if (sql.startsWith('SELECT COUNT(*) AS total')) return [[{ total: 3 }]];
      if (sql.includes('FROM admin_activity_logs WHERE activity_id')) {
        return [[{
          activity_id: 8,
          actor_admin_id: 7,
          actor_name: 'Historical Name',
          actor_email: 'history@example.com',
          actor_role: 'Editor',
          action_type: 'article.published',
          module_id: 'news-articles',
          description: 'Completed article published.',
          record_id: '31',
          occurred_at: '2026-11-02 12:00:00',
          status: 'success',
          changes: '{"before":{"status":"draft"},"after":{"status":"published"}}',
          correlation_id: '34a7c7f5-cc24-44df-b1aa-2fb0dfb774c1'
        }]];
      }
      if (sql.includes('ORDER BY occurred_at DESC')) {
        return [[{
          activity_id: 8,
          actor_admin_id: 7,
          actor_name: 'Historical Name',
          actor_email: 'history@example.com',
          actor_role: 'Editor',
          action_type: 'article.published',
          module_id: 'news-articles',
          description: 'Completed article published.',
          record_id: '31',
          occurred_at: '2026-11-02 12:00:00',
          status: 'success',
          changes: '{"before":{"status":"draft"},"after":{"status":"published"}}',
          correlation_id: '34a7c7f5-cc24-44df-b1aa-2fb0dfb774c1'
        }]];
      }
      if (sql.startsWith('INSERT INTO admin_activity_logs')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected activity test SQL: ${sql}`);
    }
  };
}

describe('administrative activity reporting', () => {
  it('records an actor snapshot and safe changes without passwords or session data', async () => {
    const calls = [];
    const database = {
      async execute(sql, values) {
        calls.push({ sql, values });
        return [{ affectedRows: 1 }];
      }
    };
    await activityService.recordAdminActivity({
      actor: { id: 7, name: 'Historical Name', email: 'history@example.com', role: 'Editor' },
      action: 'account.role.changed',
      module: 'user-management',
      description: 'Completed account role changed.',
      recordId: 9,
      changes: {
        before: { role: 'Admin', password: 'never-record-this' },
        after: { role: 'Editor', sessionToken: 'never-record-this-either' }
      },
      correlationId: '34a7c7f5-cc24-44df-b1aa-2fb0dfb774c1'
    }, database);
    assert.match(calls[0].sql, /INSERT INTO admin_activity_logs/);
    assert.deepEqual(calls[0].values.slice(0, 9), [
      7, 'Historical Name', 'history@example.com', 'Editor',
      'account.role.changed', 'user-management', 'Completed account role changed.', '9', 'success'
    ]);
    assert.match(calls[0].values[9], /Admin/);
    assert.doesNotMatch(calls[0].values[9], /never-record-this|password|sessionToken/);
  });

  it('applies month and administrative filters to every report query and preserves historical role snapshots', async () => {
    const database = reportDatabase();
    const report = await activityService.getMonthlyActivityReport({
      month: 11,
      year: 2026,
      adminId: '7',
      role: 'Editor',
      module: 'news-articles',
      action: 'article.published',
      status: 'success',
      page: 2,
      limit: 10
    }, database);
    assert.deepEqual(report.summary, {
      totalActivities: 3,
      activeAdministrators: 2,
      contentActions: 1,
      accountActions: 1,
      websiteChanges: 0,
      securityEvents: 1
    });
    assert.equal(report.administrators[0].role, 'Editor');
    assert.equal(report.activities.data[0].role, 'Editor');
    assert.deepEqual(report.activities.data[0].changes, {
      before: { status: 'draft' },
      after: { status: 'published' }
    });
    assert.equal(report.activities.pagination.page, 2);
    assert.equal(report.activities.pagination.totalPages, 1);
    for (const call of database.calls) {
      if (!call.sql.includes('FROM admin_activity_logs')) continue;
      assert.match(call.sql, /occurred_at >= \? AND occurred_at < \?/);
      assert.ok(call.sql.includes('actor_admin_id = ?'));
      assert.ok(call.sql.includes('actor_role = ?'));
      assert.ok(call.sql.includes('module_id = ?'));
      assert.ok(call.sql.includes('action_type = ?'));
      assert.ok(call.sql.includes('status = ?'));
      assert.ok(call.values.includes('2026-11-01 00:00:00'));
      assert.ok(call.values.includes('2026-12-01 00:00:00'));
    }
  });

  it('reports a missing activity detail as 404', async () => {
    await assert.rejects(
      activityService.getAdminActivityDetails('404', { async execute() { return [[]]; } }),
      (error) => error.statusCode === 404
    );
  });

  it('creates a CSV-safe report and a valid multi-page PDF document', () => {
    const report = {
      month: 11,
      year: 2026,
      summary: {
        totalActivities: 1, activeAdministrators: 1, contentActions: 1,
        accountActions: 0, websiteChanges: 0, securityEvents: 0
      },
      administrators: [{
        administratorName: '=HYPERLINK("bad")',
        email: 'a@example.com',
        role: 'Editor',
        actions: 1,
        mostRecentActivity: '2026-11-02'
      }],
      modules: [{ module: 'news-articles', total: 1 }],
      actions: [{ action: 'article.published', total: 1 }],
      activities: {
        data: [{
          occurredAt: '2026-11-02',
          administratorName: 'Reporter',
          email: 'reporter@example.com',
          role: 'Editor',
          module: 'news-articles',
          action: 'article.published',
          description: 'Published article.',
          recordId: '3',
          status: 'success',
          changes: null
        }],
        pagination: { truncated: false }
      }
    };
    const csv = activityController.buildCsv(report);
    assert.match(csv, /'=\s*HYPERLINK/);
    assert.match(csv, /Role at time/);
    const pdf = activityController.createPdf(
      activityController.pdfLines({ ...report, activities: { ...report.activities, data: Array(60).fill(report.activities.data[0]) } })
    );
    assert.equal(pdf.subarray(0, 8).toString(), '%PDF-1.4');
    assert.match(pdf.toString('binary'), /\/Count 2/);
    assert.match(pdf.toString('binary'), /%%EOF/);
  });

  it('allows only Super Admins to query reports and keeps them off public routes', async () => {
    const makeApp = (role) => {
      const app = express();
      const database = reportDatabase();
      app.locals.database = database;
      app.use((req, res, next) => {
        if (role) req.session = { adminId: 1, authVersion: 0 };
        next();
      });
      database.execute = async (sql, values = []) => {
        if (sql.includes('FROM admins WHERE id = ? LIMIT 1')) {
          return [[{ id: 1, name: 'Admin One', email: 'one@example.com', role, is_active: 1, auth_version: 0 }]];
        }
        if (sql.startsWith('SELECT role_key, is_active FROM permission_roles')) {
          return [[{ role_key: role === 'Super Admin' ? 'super-admin' : 'admin', is_active: 1 }]];
        }
        return reportDatabase().execute(sql, values);
      };
      app.use('/api/admin/monthly-reports', activityRouter.adminActivityRouter);
      app.use(errorHandler);
      return app;
    };
    assert.equal((await request(makeApp(null)).get('/api/admin/monthly-reports')).status, 401);
    assert.equal((await request(makeApp('Admin')).get('/api/admin/monthly-reports')).status, 403);
    const allowed = await request(makeApp('Super Admin')).get('/api/admin/monthly-reports?month=11&year=2026');
    assert.equal(allowed.status, 200);
    assert.equal((await request(makeApp('Super Admin')).get('/api/monthly-reports')).status, 404);
  });

  it('captures successful and failed login events without retaining submitted credentials', async () => {
    const written = [];
    const database = {
      async execute(sql, values) {
        written.push({ sql, values });
        return [{ affectedRows: 1 }];
      }
    };
    const requestContext = {
      originalUrl: '/api/auth/login',
      method: 'POST',
      correlationId: '34a7c7f5-cc24-44df-b1aa-2fb0dfb774c1',
      app: { locals: { database } },
      body: { email: 'not-retained@example.com', password: 'never-retained' }
    };
    const response = new EventEmitter();
    response.statusCode = 401;
    response.setHeader = () => {};
    response.json = (value) => value;
    activityMiddleware.captureAdminActivity(requestContext, response, () => {});
    response.emit('finish');
    await requestContext.activityWritePromise;
    assert.equal(written[0].values[4], 'auth.login.failed');
    assert.equal(written[0].values[5], 'security');
    assert.equal(written[0].values[0], null);
    assert.doesNotMatch(JSON.stringify(written), /not-retained|never-retained/);
  });
});
