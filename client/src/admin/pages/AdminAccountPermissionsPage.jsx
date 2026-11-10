import { translateAdminModuleLabel, translatePermissionAction } from '../../i18n/adminLabels.js';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getAdminPermissions,
  getAdminUsers,
  updateAdminPermissionOverrides
} from '../../api/admin.js';
import { useAdminAuth } from '../AdminAuthContext.jsx';
import { AdminEmpty, AdminError, AdminLoading, ConfirmDialog } from '../components/AdminStates.jsx';

const ACTIONS = ['view', 'create', 'edit', 'publish', 'delete', 'manage', 'configure'];
const actionLabel = translatePermissionAction;

function overrideDrafts(modules) {
  return Object.fromEntries(modules.flatMap((module) =>
    ACTIONS.filter((action) => module.overrides[action] !== null)
      .map((action) => [`${module.moduleId}:${action}`, module.overrides[action]])
  ));
}

export default function AdminAccountPermissionsPage() {
  const { t: tI18n } = useTranslation('admin');
  const { admin } = useAdminAuth();
  const [accounts, setAccounts] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [accountPermissions, setAccountPermissions] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 0, total: 0 });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [pendingChanges, setPendingChanges] = useState(null);
  const [saving, setSaving] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({ 'Content Management': true });

  const loadAccounts = useCallback(async (signal) => {
    setLoadingAccounts(true);
    setError("");
    try {
      const result = await getAdminUsers({ page, limit: 50, q: query || undefined, signal });
      setAccounts(result.data);
      setPagination(result.pagination);
      setSelectedId((current) => {
        if (result.data.some((account) => String(account.id) === String(current))) return current;
        const firstEditable = result.data.find((account) =>
          account.role !== 'Super Admin' && String(account.id) !== String(admin?.id)
        );
        return firstEditable ? String(firstEditable.id) : '';
      });
    } catch (loadError) {
      if (loadError.name !== 'AbortError') setError(loadError.message);
    } finally {
      if (!signal?.aborted) setLoadingAccounts(false);
    }
  }, [admin?.id, attempt, page, query]);

  useEffect(() => {
    const controller = new AbortController();
    loadAccounts(controller.signal);
    return () => controller.abort();
  }, [loadAccounts]);

  useEffect(() => {
    if (!selectedId) {
      setAccountPermissions(null);
      setDrafts({});
      return undefined;
    }
    const controller = new AbortController();
    setLoadingPermissions(true);
    setError("");
    getAdminPermissions(selectedId, { signal: controller.signal })
      .then((result) => {
        setAccountPermissions(result);
        setDrafts(overrideDrafts(result.modules));
      })
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setError(loadError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingPermissions(false);
      });
    return () => controller.abort();
  }, [selectedId, attempt]);

  const selectedAccount = accounts.find((account) => String(account.id) === String(selectedId));
  const isLockedAccount = !selectedAccount
    || selectedAccount.role === 'Super Admin'
    || String(selectedAccount.id) === String(admin?.id);
  const changes = useMemo(() => {
    if (!accountPermissions) return [];
    return accountPermissions.modules.flatMap((module) => ACTIONS.flatMap((action) => {
      const key = `${module.moduleId}:${action}`;
      const value = Object.prototype.hasOwnProperty.call(drafts, key) ? drafts[key] : null;
      const original = module.overrides[action];
      return value === original ? [] : [{
        moduleId: module.moduleId,
        actionId: action,
        isAllowed: value
      }];
    }));
  }, [accountPermissions, drafts]);

  function changeOverride(moduleId, action, value) {
    const key = `${moduleId}:${action}`;
    setDrafts((current) => {
      const next = { ...current };
      if (value === '') delete next[key];
      else next[key] = value === 'allow';
      return next;
    });
    setNotice("");
  }

  async function saveChanges() {
    if (isLockedAccount || !changes.length || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await updateAdminPermissionOverrides(selectedId, changes);
      setAccountPermissions(result);
      setDrafts(overrideDrafts(result.modules));
      setPendingChanges(null);
      setNotice(tI18n('Permissions for {{account}} were saved. Their existing sessions were invalidated.', {
        account: selectedAccount.name,
        defaultValue: 'Permissions for {{account}} were saved. Their existing sessions were invalidated.'
      }));
    } catch (saveError) {
      setPendingChanges(null);
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  function resetToRoleDefaults() {
    if (isLockedAccount || !accountPermissions) return;
    const overrides = accountPermissions.modules.flatMap((module) =>
      ACTIONS.filter((action) => module.overrides[action] !== null)
        .map((action) => ({ moduleId: module.moduleId, actionId: action, isAllowed: null }))
    );
    if (!overrides.length) return;
    setDrafts({});
    setPendingChanges(overrides);
    setNotice("");
  }

  function submitSearch(event) {
    event.preventDefault();
    setSelectedId('');
    setPage(1);
    setQuery(search.trim());
  }

  const groupedModules = useMemo(() => {
    const groups = new Map();
    for (const module of accountPermissions?.modules ?? []) {
      if (!groups.has(module.navigationGroup)) groups.set(module.navigationGroup, []);
      groups.get(module.navigationGroup).push(module);
    }
    return [...groups.entries()];
  }, [accountPermissions]);
  const pendingSummary = pendingChanges && accountPermissions
    ? pendingChanges.slice(0, 4).map((change) => {
      const label = translateAdminModuleLabel(
        change.moduleId,
        accountPermissions.modules.find((module) => module.moduleId === change.moduleId)?.label
      );
      const outcome = change.isAllowed === null
        ? 'use role default'
        : change.isAllowed
          ? 'allowed'
          : 'denied';
      return `${label} ${actionLabel(change.actionId)}: ${tI18n(outcome, { defaultValue: outcome })}`;
    }).join('; ')
    : '';

  return (
    <div className="admin-page admin-permission-page">
      <div className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">{tI18n("Central access control", { defaultValue: "Central access control" })}</span>
          <h1>{tI18n("Account Permissions", { defaultValue: "Account Permissions" })}</h1>
          <p>{tI18n("Inspect effective access and manage account-specific exceptions to role defaults.", { defaultValue: "Inspect effective access and manage account-specific exceptions to role defaults." })}</p>
        </div>
      </div>

      {notice && <div className="admin-alert admin-alert--success" role="status">{notice}</div>}
      {error && <AdminError message={error} onRetry={() => setAttempt((value) => value + 1)} />}

      <section className="admin-panel admin-account-permission-controls">
        <div className="admin-panel-heading">
          <div>
            <span className="admin-eyebrow">{tI18n("Administrator accounts", { defaultValue: "Administrator accounts" })}</span>
            <h2>{tI18n("Select an account", { defaultValue: "Select an account" })}</h2>
          </div>
          <form className="admin-search-form" role="search" onSubmit={submitSearch}>
            <label className="sr-only" htmlFor="permission-account-search">{tI18n("Search accounts by name or email", { defaultValue: "Search accounts by name or email" })}</label>
            <input
              id="permission-account-search"
              type="search"
              value={search}
              placeholder={tI18n("Search name or email", { defaultValue: "Search name or email" })}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="submit" className="admin-button admin-button--secondary">{tI18n("Search", { defaultValue: "Search" })}</button>
          </form>
        </div>
        <div className="admin-account-permission-toolbar">
          {loadingAccounts ? <AdminLoading label={tI18n('Loading administrator accounts…', { defaultValue: 'Loading administrator accounts…' })} /> : (
            <label className="admin-role-select">
              <span>{tI18n("Account", { defaultValue: "Account" })}</span>
              <select
                value={selectedId}
                onChange={(event) => {
                  setSelectedId(event.target.value);
                  setNotice("");
                }}
              >
                <option value="">{tI18n("Select an administrator", { defaultValue: "Select an administrator" })}</option>
                {accounts.map((account) => (
                  <option value={account.id} key={account.id}>
                    {account.name} {tI18n("·", { defaultValue: "·" })} {account.username || account.email} {tI18n("·", { defaultValue: "·" })} {account.role}
                  </option>
                ))}
              </select>
            </label>
          )}
          {accountPermissions && (
            <div className="admin-account-permission-summary">
              <strong>{accountPermissions.role}</strong>
              <span>{tI18n(accountPermissions.isActive ? 'Active account' : 'Inactive account', {
                defaultValue: accountPermissions.isActive ? 'Active account' : 'Inactive account'
              })}</span>
              {isLockedAccount && <span className="admin-module-status">{tI18n("Built-in or current account cannot be overridden", { defaultValue: "Built-in or current account cannot be overridden" })}</span>}
            </div>
          )}
          <button
            type="button"
            className="admin-button admin-button--secondary"
            disabled={isLockedAccount || !accountPermissions?.modules.some((module) => Object.values(module.overrides).some((value) => value !== null))}
            onClick={resetToRoleDefaults}
          >{tI18n("Reset to role defaults", { defaultValue: "Reset to role defaults" })} </button>
        </div>
        {!loadingAccounts && pagination.totalPages > 0 && (
          <div className="admin-pagination" aria-label={tI18n("Account results pagination", { defaultValue: "Account results pagination" })}>
            <span>
              {pagination.total} {tI18n("accounts · Page", { defaultValue: "accounts · Page" })} {pagination.page} {tI18n("of", { defaultValue: "of" })} {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >{tI18n("← Previous", { defaultValue: "← Previous" })} </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
            >{tI18n("Next →", { defaultValue: "Next →" })} </button>
          </div>
        )}
      </section>

      {loadingPermissions && <AdminLoading label={tI18n('Loading effective permissions…', { defaultValue: 'Loading effective permissions…' })} />}
      {!loadingAccounts && !accounts.length && !error && (
        <AdminEmpty title={tI18n("No matching accounts.", { defaultValue: "No matching accounts." })} message={tI18n('Try another search or provision an administrator through the controlled server workflow.', { defaultValue: 'Try another search or provision an administrator through the controlled server workflow.' })} />
      )}
      {!loadingAccounts && selectedId && !loadingPermissions && !accountPermissions && !error && (
        <AdminEmpty title={tI18n("Permissions unavailable.", { defaultValue: "Permissions unavailable." })} message={tI18n('The selected account permissions could not be loaded.', { defaultValue: 'The selected account permissions could not be loaded.' })} />
      )}
      {!loadingPermissions && accountPermissions && groupedModules.map(([group, modules]) => (
        <section className="admin-panel admin-permission-group" key={group}>
          <div className="admin-panel-heading">
            <button
              type="button"
              className="admin-permission-group-toggle"
              aria-expanded={Boolean(expandedGroups[group])}
              onClick={() => setExpandedGroups((current) => ({ ...current, [group]: !current[group] }))}
            >
              <span className="admin-eyebrow">{tI18n(group, { defaultValue: group })}</span>
              <span>{modules.length} {tI18n("modules", { defaultValue: "modules" })}</span>
              <span aria-hidden="true">{expandedGroups[group] ? '−' : '+'}</span>
            </button>
          </div>
          {expandedGroups[group] && <div className="admin-permission-table-wrap">
            <table className="admin-permission-table admin-account-permission-table">
              <thead>
                <tr>
                  <th scope="col">{tI18n("Module", { defaultValue: "Module" })}</th>
                  {ACTIONS.map((action) => <th scope="col" key={action}>{actionLabel(action)}</th>)}
                </tr>
              </thead>
              <tbody>
                {modules.map((module) => (
                  <tr key={module.moduleId}>
                    <th scope="row">
                      <span className="admin-permission-module-name">{translateAdminModuleLabel(module.moduleId, module.label)}</span>
                      <span className={`admin-module-status${module.isAvailable && module.isActive ? ' admin-module-status--ready' : ''}`}>
                        {module.isAvailable
                          ? (module.isActive
                            ? tI18n('Implemented · active', { defaultValue: 'Implemented · active' })
                            : tI18n('Implemented · inactive', { defaultValue: 'Implemented · inactive' }))
                          : tI18n('Planned · not implemented', { defaultValue: 'Planned · not implemented' })}
                      </span>
                    </th>
                    {ACTIONS.map((action) => {
                      const key = `${module.moduleId}:${action}`;
                      const override = Object.prototype.hasOwnProperty.call(drafts, key)
                        ? drafts[key]
                        : module.overrides[action];
                      const origin = module.overrides[action] !== null
                        ? tI18n(
                          module.overrides[action] ? 'Account override: allowed' : 'Account override: denied',
                          { defaultValue: module.overrides[action] ? 'Account override: allowed' : 'Account override: denied' }
                        )
                        : tI18n(
                          module.roleActions[action] ? 'Role default: allowed' : 'Role default: denied',
                          { defaultValue: module.roleActions[action] ? 'Role default: allowed' : 'Role default: denied' }
                        );
                      return (
                        <td key={action}>
                          <div className="admin-account-permission-cell">
                            <span className={`admin-effective-state${module.actions[action] ? ' admin-effective-state--allowed' : ''}`}>
                              {tI18n(module.actions[action] ? 'Allowed' : 'Denied', {
                                defaultValue: module.actions[action] ? 'Allowed' : 'Denied'
                              })}
                            </span>
                            <label className="sr-only" htmlFor={`override-${module.moduleId}-${action}`}>
                              {actionLabel(action)} {tI18n("override for", { defaultValue: "override for" })} {translateAdminModuleLabel(module.moduleId, module.label)}
                            </label>
                            <select
                              id={`override-${module.moduleId}-${action}`}
                              value={override === null ? '' : override ? 'allow' : 'deny'}
                              disabled={isLockedAccount || !module.limits?.[action]}
                              onChange={(event) => changeOverride(module.moduleId, action, event.target.value)}
                            >
                              <option value="">{tI18n("Use role default", { defaultValue: "Use role default" })}</option>
                              <option value="allow">{tI18n("Allow", { defaultValue: "Allow" })}</option>
                              <option value="deny">{tI18n("Deny", { defaultValue: "Deny" })}</option>
                            </select>
                            <small>{origin}</small>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </section>
      ))}

      {changes.length > 0 && (
        <div className="admin-permission-savebar">
          <span>{changes.length} {tI18n("permission change", { defaultValue: "permission change" })}{changes.length === 1 ? '' : 's'} {tI18n("not saved", { defaultValue: "not saved" })}</span>
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={() => setDrafts(overrideDrafts(accountPermissions.modules))}
          >{tI18n("Discard", { defaultValue: "Discard" })} </button>
          <button
            type="button"
            className="admin-button admin-button--primary"
            disabled={isLockedAccount || saving}
            onClick={() => setPendingChanges(changes)}
          >{tI18n("Review changes", { defaultValue: "Review changes" })} </button>
        </div>
      )}

      {pendingChanges && (
        <ConfirmDialog
          title={tI18n("Save account permission changes?", { defaultValue: "Save account permission changes?" })}
            message={tI18n('This will update {{count}} permission override(s) for {{account}}: {{summary}}{{more}}. The account’s existing sessions will be invalidated.', {
              count: pendingChanges.length,
              account: selectedAccount?.name,
              summary: pendingSummary,
              more: pendingChanges.length > 4 ? `; and ${pendingChanges.length - 4} more` : '',
              defaultValue: 'This will update {{count}} permission override(s) for {{account}}: {{summary}}{{more}}. The account’s existing sessions will be invalidated.'
            })}
            confirmLabel={tI18n('Save overrides', { defaultValue: 'Save overrides' })}
          busy={saving}
          onCancel={() => {
            setPendingChanges(null);
            if (pendingChanges.every((change) => change.isAllowed === null)) {
              setDrafts(overrideDrafts(accountPermissions.modules));
            }
          }}
          onConfirm={saveChanges}
        />
      )}
    </div>
  );
}
