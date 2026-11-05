import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  exportAdminMonthlyActivityReport,
  getAdminActivityDetails,
  getAdminMonthlyActivityReport
} from '../../api/admin.js';
import i18n from '../../i18n/index.js';
import { AdminEmpty, AdminError, AdminLoading } from '../components/AdminStates.jsx';

const MODULES = [
  ['news-articles', 'News Articles'],
  ['web-stories', 'Web Stories'],
  ['hero-slider', 'Hero Slider'],
  ['video-media', 'Video & Media'],
  ['media-library', 'Media Library'],
  ['user-management', 'User Management'],
  ['role-builder', 'Role Builder'],
  ['access-control', 'Access Control'],
  ['branding-theme-editor', 'Branding & Theme'],
  ['menu-management', 'Menu Management'],
  ['footer-management', 'Footer Management'],
  ['seo-management', 'SEO Management'],
  ['security', 'Authentication & Security']
];

const ACTIONS = [
  'article.created', 'article.edited', 'article.published', 'article.unpublished', 'article.deleted',
  'account.created', 'account.updated', 'account.role.changed', 'account.activated', 'account.deactivated',
  'account.permissions.updated', 'account.permission-override.removed',
  'menu-management.updated', 'menu-management.published',
  'footer-management.updated', 'footer-management.published',
  'branding-theme-editor.updated', 'branding-theme-editor.published',
  'role.created', 'role.updated', 'role.deleted', 'role.permissions.updated',
  'auth.login.succeeded', 'auth.login.failed', 'auth.logout.succeeded', 'auth.logout.failed',
  'security.authorization.denied', 'security.password.changed'
];

const MODULE_LABELS = new Map(MODULES);
function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(
    i18n.language === 'ta' ? 'ta-IN' : 'en-IN',
    {
    dateStyle: 'medium',
    timeStyle: 'short',
      timeZone: 'Asia/Kolkata'
    }
  ).format(date);
}

function formatNumber(value) {
  return new Intl.NumberFormat(i18n.language === 'ta' ? 'ta-IN' : 'en-IN').format(value);
}

function ChartBars({ title, items, labelFor = (item) => item.label, daily = false }) {
  const { t: tI18n } = useTranslation('admin');
  const maximum = Math.max(1, ...items.map((item) => item.total));
  if (!items.length || items.every((item) => !item.total)) {
    return <section className="activity-chart"><h2>{title}</h2><p>{tI18n("No activity recorded for this period.", { defaultValue: "No activity recorded for this period." })}</p></section>;
  }
  return (
    <section className={`activity-chart${daily ? ' activity-chart--daily' : ''}`} aria-label={title}>
      <h2>{title}</h2>
      <div className="activity-chart-bars" role="list">
        {items.map((item, index) => (
          <div
            className="activity-chart-item"
            role="listitem"
            key={`${labelFor(item)}-${index}`}
            title={`${labelFor(item)}: ${item.total}`}
          >
            <span className="activity-chart-value">{formatNumber(item.total)}</span>
            <span className="activity-chart-track">
              <span className="activity-chart-fill" style={{ height: `${Math.max(3, (item.total / maximum) * 100)}%` }} />
            </span>
            <span className="activity-chart-label">{labelFor(item)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function AdminMonthlyReportsPage() {
  const { t: tI18n } = useTranslation('admin');
  const now = new Date();
  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => (
    new Intl.DateTimeFormat(i18n.language === 'ta' ? 'ta-IN' : 'en-IN', { month: 'long' })
      .format(new Date(2000, index, 1))
  )), [i18n.language]);
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [filters, setFilters] = useState({
    adminId: '',
    role: '',
    module: '',
    action: '',
    status: '',
    q: '',
    page: 1,
    limit: 25
  });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [expandedActivity, setExpandedActivity] = useState('');
  const [activityDetails, setActivityDetails] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [exporting, setExporting] = useState('');
  const [exportError, setExportError] = useState('');
  const detailsRequest = useRef(0);

  const query = useMemo(() => ({
    month: Number(month),
    year: Number(year),
    ...filters
  }), [month, year, filters]);

  useEffect(() => {
    detailsRequest.current += 1;
    setExpandedActivity('');
    setActivityDetails(null);
    setDetailError('');
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getAdminMonthlyActivityReport(query, { signal: controller.signal })
      .then(setReport)
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, attempt]);

  const setFilter = (key, value) => {
    detailsRequest.current += 1;
    setFilters((current) => ({ ...current, [key]: value, page: 1 }));
    setExpandedActivity('');
    setActivityDetails(null);
  };

  async function toggleDetails(id) {
    const requestId = ++detailsRequest.current;
    if (expandedActivity === id) {
      setExpandedActivity('');
      setActivityDetails(null);
      setDetailError('');
      return;
    }
    setExpandedActivity(id);
    setActivityDetails(null);
    setDetailError('');
    try {
      const details = await getAdminActivityDetails(id);
      if (requestId === detailsRequest.current) setActivityDetails(details);
    } catch (failure) {
      if (requestId === detailsRequest.current) setDetailError(failure.message);
    }
  }

  async function exportReport(format) {
    setExporting(format);
    setExportError('');
    try {
      const { page: _page, limit: _limit, ...exportFilters } = query;
      const blob = await exportAdminMonthlyActivityReport(format, exportFilters);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `admin-activity-${year}-${String(month).padStart(2, '0')}.${format}`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (failure) {
      setExportError(failure.message);
    } finally {
      setExporting('');
    }
  }

  const dayCount = new Date(Number(year), Number(month), 0).getDate();
  const daily = useMemo(() => {
    const totals = new Map(report?.daily?.map((item) => [
      item.day instanceof Date ? item.day.getDate() : Number(String(item.day).slice(8, 10)),
      item.total
    ]) ?? []);
    return Array.from({ length: dayCount }, (_, index) => ({
      label: String(index + 1),
      total: totals.get(index + 1) ?? 0
    }));
  }, [dayCount, report]);

  return (
    <div className="admin-page admin-monthly-reports">
      <header className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">{tI18n("Administration", { defaultValue: "Administration" })}</span>
          <h1>{tI18n("Monthly Activity Reports", { defaultValue: "Monthly Activity Reports" })}</h1>
          <p>{tI18n("Internal operational and security activity recorded by the administration dashboard.", { defaultValue: "Internal operational and security activity recorded by the administration dashboard." })}</p>
        </div>
        <div className="activity-export-actions">
          <button type="button" className="admin-button admin-button--secondary" disabled={Boolean(exporting)} onClick={() => exportReport('csv')}>
            {exporting === 'csv' ? 'Preparing CSV…' : 'Export CSV'}
          </button>
          <button type="button" className="admin-button admin-button--primary" disabled={Boolean(exporting)} onClick={() => exportReport('pdf')}>
            {exporting === 'pdf' ? 'Preparing PDF…' : 'Export PDF'}
          </button>
        </div>
      </header>

      <section className="admin-panel activity-filter-panel" aria-label={tI18n("Report filters", { defaultValue: "Report filters" })}>
        <label className="admin-field">
          <span>{tI18n("Month", { defaultValue: "Month" })}</span>
          <select aria-label={tI18n("Report month", { defaultValue: "Report month" })} value={month} onChange={(event) => {
            setMonth(event.target.value);
            setFilters((current) => ({ ...current, page: 1 }));
          }}>
            {months.map((name, index) => <option value={index + 1} key={name}>{name}</option>)}
          </select>
        </label>
        <label className="admin-field">
          <span>{tI18n("Year", { defaultValue: "Year" })}</span>
          <input aria-label={tI18n("Report year", { defaultValue: "Report year" })} type="number" min="2000" max={now.getFullYear() + 1} value={year} onChange={(event) => {
            setYear(event.target.value);
            setFilters((current) => ({ ...current, page: 1 }));
          }} />
        </label>
        <label className="admin-field">
          <span>{tI18n("Administrator", { defaultValue: "Administrator" })}</span>
          <select aria-label={tI18n("Filter by administrator", { defaultValue: "Filter by administrator" })} value={filters.adminId} onChange={(event) => setFilter('adminId', event.target.value)}>
            <option value="">{tI18n("All administrators", { defaultValue: "All administrators" })}</option>
            {report?.administrators?.filter((item) => item.administratorId).map((item) => (
              <option value={item.administratorId} key={item.administratorId}>{item.administratorName} {tI18n("·", { defaultValue: "·" })} {item.email}</option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>{tI18n("Historical role", { defaultValue: "Historical role" })}</span>
          <select aria-label={tI18n("Filter by role", { defaultValue: "Filter by role" })} value={filters.role} onChange={(event) => setFilter('role', event.target.value)}>
            <option value="">{tI18n("All roles", { defaultValue: "All roles" })}</option>
            {[...new Set(report?.administrators?.map((item) => item.role) ?? [])].map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>{tI18n("Module", { defaultValue: "Module" })}</span>
          <select aria-label={tI18n("Filter by module", { defaultValue: "Filter by module" })} value={filters.module} onChange={(event) => setFilter('module', event.target.value)}>
            <option value="">{tI18n("All modules", { defaultValue: "All modules" })}</option>
            {MODULES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            {report?.modules?.map(({ module }) => !MODULE_LABELS.has(module)
              ? <option key={module} value={module}>{module}</option>
              : null)}
          </select>
        </label>
        <label className="admin-field">
          <span>{tI18n("Action", { defaultValue: "Action" })}</span>
          <select aria-label={tI18n("Filter by action", { defaultValue: "Filter by action" })} value={filters.action} onChange={(event) => setFilter('action', event.target.value)}>
            <option value="">{tI18n("All actions", { defaultValue: "All actions" })}</option>
            {ACTIONS.map((action) => <option key={action} value={action}>{action}</option>)}
            {report?.actions?.map(({ action }) => !ACTIONS.includes(action)
              ? <option key={action} value={action}>{action}</option>
              : null)}
          </select>
        </label>
        <label className="admin-field">
          <span>{tI18n("Status", { defaultValue: "Status" })}</span>
          <select aria-label={tI18n("Filter by status", { defaultValue: "Filter by status" })} value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>
            <option value="">{tI18n("All statuses", { defaultValue: "All statuses" })}</option>
            <option value="success">{tI18n("Success", { defaultValue: "Success" })}</option>
            <option value="failure">{tI18n("Failure", { defaultValue: "Failure" })}</option>
          </select>
        </label>
        <label className="admin-field activity-search">
          <span>{tI18n("Search activity", { defaultValue: "Search activity" })}</span>
          <input
            type="search"
            aria-label={tI18n("Search activities", { defaultValue: "Search activities" })}
            value={filters.q}
            placeholder={tI18n("Administrator, action or description", { defaultValue: "Administrator, action or description" })}
            onChange={(event) => setFilter('q', event.target.value)}
          />
        </label>
      </section>

      {error && <AdminError message={error} onRetry={() => setAttempt((value) => value + 1)} />}
      {exportError && <p className="admin-alert admin-alert--error" role="alert">{exportError}</p>}
      {loading && <AdminLoading label="Loading administrative activity…" />}
      {!loading && !error && report && (
        <>
          <section className="activity-summary-grid" aria-label={tI18n("Monthly activity summary", { defaultValue: "Monthly activity summary" })}>
            <Summary label="Total activities" value={report.summary.totalActivities} />
            <Summary label="Active administrators" value={report.summary.activeAdministrators} />
            <Summary label="Content actions" value={report.summary.contentActions} />
            <Summary label="Account actions" value={report.summary.accountActions} />
            <Summary label="Website changes" value={report.summary.websiteChanges} />
            <Summary label="Security events" value={report.summary.securityEvents} />
          </section>

          <div className="activity-chart-grid">
            <ChartBars title={tI18n("Daily activity", { defaultValue: "Daily activity" })} items={daily} labelFor={(item) => item.label} daily />
            <ChartBars title={tI18n("Activity by module", { defaultValue: "Activity by module" })} items={report.modules.map((item) => ({
              ...item,
              label: MODULE_LABELS.get(item.module) ?? item.module
            }))} />
            <ChartBars title={tI18n("Activity by action", { defaultValue: "Activity by action" })} items={report.actions.map((item) => ({
              ...item,
              label: item.action
            }))} />
            <ChartBars title={tI18n("Activity by administrator", { defaultValue: "Activity by administrator" })} items={report.administrators.map((item) => ({
              ...item,
              label: item.administratorName
            }))} />
          </div>

          <section className="admin-panel activity-admin-panel">
            <div className="activity-section-heading">
              <div><span className="admin-eyebrow">{tI18n("Administrator-wise activity", { defaultValue: "Administrator-wise activity" })}</span><h2>{tI18n("Activity by administrator", { defaultValue: "Activity by administrator" })}</h2></div>
              {filters.adminId && <button className="admin-link-button" type="button" onClick={() => setFilter('adminId', '')}>{tI18n("Clear administrator filter", { defaultValue: "Clear administrator filter" })}</button>}
            </div>
            {!report.administrators.length
              ? <AdminEmpty title={tI18n("No administrators in this report", { defaultValue: "No administrators in this report" })} message="No matching activity was recorded for the selected period and filters." />
              : <div className="admin-table-wrap"><table className="admin-table">
                <thead><tr><th>{tI18n("Administrator", { defaultValue: "Administrator" })}</th><th>{tI18n("Email", { defaultValue: "Email" })}</th><th>{tI18n("Historical role", { defaultValue: "Historical role" })}</th><th>{tI18n("Actions", { defaultValue: "Actions" })}</th><th>{tI18n("Most recent activity", { defaultValue: "Most recent activity" })}</th><th /></tr></thead>
                <tbody>{report.administrators.map((item, index) => (
                  <tr key={`${item.administratorId ?? 'unknown'}-${item.role}-${index}`}>
                    <td>{item.administratorName}</td>
                    <td>{item.email || '—'}</td>
                    <td>{item.role}</td>
                    <td>{item.actions}</td>
                    <td>{formatDate(item.mostRecentActivity)}</td>
                    <td>{item.administratorId && <button className="admin-link-button" type="button" onClick={() => setFilter('adminId', item.administratorId)}>{tI18n("Inspect history", { defaultValue: "Inspect history" })}</button>}</td>
                  </tr>
                ))}</tbody>
              </table></div>}
          </section>

          <section className="admin-panel activity-timeline-panel">
            <div className="activity-section-heading">
              <div><span className="admin-eyebrow">{tI18n("Searchable timeline", { defaultValue: "Searchable timeline" })}</span><h2>{tI18n("Administrative activity", { defaultValue: "Administrative activity" })}</h2></div>
              <span>{report.activities.pagination.total} {tI18n("records", { defaultValue: "records" })}</span>
            </div>
            {!report.activities.data.length
              ? <AdminEmpty title={tI18n("No matching activity", { defaultValue: "No matching activity" })} message="Try a different month or adjust the selected filters." />
              : <div className="admin-table-wrap"><table className="admin-table activity-table">
                <thead><tr><th>{tI18n("Date and time", { defaultValue: "Date and time" })}</th><th>{tI18n("Administrator", { defaultValue: "Administrator" })}</th><th>{tI18n("Role", { defaultValue: "Role" })}</th><th>{tI18n("Module", { defaultValue: "Module" })}</th><th>{tI18n("Action", { defaultValue: "Action" })}</th><th>{tI18n("Description", { defaultValue: "Description" })}</th><th>{tI18n("Status", { defaultValue: "Status" })}</th><th>{tI18n("Details", { defaultValue: "Details" })}</th></tr></thead>
                <tbody>{report.activities.data.map((item) => (
                  <FragmentActivity
                    key={item.id}
                    item={item}
                    expanded={expandedActivity === item.id}
                    details={expandedActivity === item.id ? activityDetails : null}
                    error={expandedActivity === item.id ? detailError : ''}
                    onToggle={() => toggleDetails(item.id)}
                  />
                ))}</tbody>
              </table></div>}
            {report.activities.pagination.totalPages > 1 && (
              <div className="activity-pagination">
                <button className="admin-button admin-button--secondary" type="button" disabled={filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>{tI18n("Previous", { defaultValue: "Previous" })}</button>
                <span>{tI18n("Page", { defaultValue: "Page" })} {filters.page} {tI18n("of", { defaultValue: "of" })} {report.activities.pagination.totalPages}</span>
                <button className="admin-button admin-button--secondary" type="button" disabled={filters.page >= report.activities.pagination.totalPages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>{tI18n("Next", { defaultValue: "Next" })}</button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Summary({ label, value }) {
  const { t: tI18n } = useTranslation('admin');
  return <article className="activity-summary-card"><span>{label}</span><strong>{value}</strong></article>;
}

function FragmentActivity({ item, expanded, details, error, onToggle }) {
  const { t: tI18n } = useTranslation('admin');
  return (
    <>
      <tr>
        <td>{formatDate(item.occurredAt)}</td>
        <td>{item.administratorName}<small>{item.email}</small></td>
        <td>{item.role}</td>
        <td>{MODULE_LABELS.get(item.module) ?? item.module}</td>
        <td><code>{item.action}</code></td>
        <td>{item.description}</td>
        <td><span className={`activity-status activity-status--${item.status}`}>{item.status}</span></td>
        <td><button className="admin-link-button" type="button" aria-expanded={expanded} onClick={onToggle}>{expanded ? 'Hide' : 'View'}</button></td>
      </tr>
      {expanded && <tr className="activity-detail-row"><td colSpan="8">
        {error ? <p role="alert">{error}</p>
          : !details ? <p role="status">{tI18n("Loading activity details…", { defaultValue: "Loading activity details…" })}</p>
            : <div className="activity-detail-content">
              <strong>{tI18n("Record", { defaultValue: "Record" })} {details.recordId ?? '—'} {tI18n("· Correlation", { defaultValue: "· Correlation" })} {details.correlationId ?? '—'}</strong>
              {details.changes
                ? <pre>{JSON.stringify(details.changes, null, 2)}</pre>
                : <p>{tI18n("No before/after details were recorded for this activity.", { defaultValue: "No before/after details were recorded for this activity." })}</p>}
            </div>}
      </td></tr>}
    </>
  );
}
