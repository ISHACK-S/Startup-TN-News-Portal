import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getAdminPermissions,
  getAdminUsers,
  updateAdminPermissionOverrides
} from '../../api/admin.js';
import { useAdminAuth } from '../AdminAuthContext.jsx';
import { AdminEmpty, AdminError, AdminLoading, ConfirmDialog } from '../components/AdminStates.jsx';

const ACTIONS = ['view', 'create', 'edit', 'publish', 'delete', 'manage', 'configure'];
const actionLabel = (action) => action.charAt(0).toUpperCase() + action.slice(1);

function overrideDrafts(modules) {
  return Object.fromEntries(modules.flatMap((module) =>
    ACTIONS.filter((action) => module.overrides[action] !== null)
      .map((action) => [`${module.moduleId}:${action}`, module.overrides[action]])
  ));
}

export default function AdminAccountPermissionsPage() {
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
  const [expandedGroups, setExpandedGroups] = useState({ 'Core dashboard': true });

  const loadAccounts = useCallback(async (signal) => {
    setLoadingAccounts(true);
    setError('');
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
    setError('');
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
    setNotice('');
  }

  async function saveChanges() {
    if (isLockedAccount || !changes.length || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await updateAdminPermissionOverrides(selectedId, changes);
      setAccountPermissions(result);
      setDrafts(overrideDrafts(result.modules));
      setPendingChanges(null);
      setNotice(`Permissions for ${selectedAccount.name} were saved. Their existing sessions were invalidated.`);
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
    setNotice('');
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
      const label = accountPermissions.modules.find((module) => module.moduleId === change.moduleId)?.label
        ?? change.moduleId;
      const outcome = change.isAllowed === null
        ? 'use role default'
        : change.isAllowed
          ? 'allowed'
          : 'denied';
      return `${label} ${actionLabel(change.actionId)}: ${outcome}`;
    }).join('; ')
    : '';

  return (
    <div className="admin-page admin-permission-page">
      <div className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">Central access control</span>
          <h1>Account Permissions</h1>
          <p>Inspect effective access and manage account-specific exceptions to role defaults.</p>
        </div>
      </div>

      {notice && <div className="admin-alert admin-alert--success" role="status">{notice}</div>}
      {error && <AdminError message={error} onRetry={() => setAttempt((value) => value + 1)} />}

      <section className="admin-panel admin-account-permission-controls">
        <div className="admin-panel-heading">
          <div>
            <span className="admin-eyebrow">Administrator accounts</span>
            <h2>Select an account</h2>
          </div>
          <form className="admin-search-form" role="search" onSubmit={submitSearch}>
            <label className="sr-only" htmlFor="permission-account-search">Search accounts by name or email</label>
            <input
              id="permission-account-search"
              type="search"
              value={search}
              placeholder="Search name or email"
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="submit" className="admin-button admin-button--secondary">Search</button>
          </form>
        </div>
        <div className="admin-account-permission-toolbar">
          {loadingAccounts ? <AdminLoading label="Loading administrator accounts…" /> : (
            <label className="admin-role-select">
              <span>Account</span>
              <select
                value={selectedId}
                onChange={(event) => {
                  setSelectedId(event.target.value);
                  setNotice('');
                }}
              >
                <option value="">Select an administrator</option>
                {accounts.map((account) => (
                  <option value={account.id} key={account.id}>
                    {account.name} · {account.email} · {account.role}
                  </option>
                ))}
              </select>
            </label>
          )}
          {accountPermissions && (
            <div className="admin-account-permission-summary">
              <strong>{accountPermissions.role}</strong>
              <span>{accountPermissions.isActive ? 'Active account' : 'Inactive account'}</span>
              {isLockedAccount && <span className="admin-module-status">Built-in or current account cannot be overridden</span>}
            </div>
          )}
          <button
            type="button"
            className="admin-button admin-button--secondary"
            disabled={isLockedAccount || !accountPermissions?.modules.some((module) => Object.values(module.overrides).some((value) => value !== null))}
            onClick={resetToRoleDefaults}
          >
            Reset to role defaults
          </button>
        </div>
        {!loadingAccounts && pagination.totalPages > 0 && (
          <div className="admin-pagination" aria-label="Account results pagination">
            <span>
              {pagination.total} accounts · Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              ← Previous
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
            >
              Next →
            </button>
          </div>
        )}
      </section>

      {loadingPermissions && <AdminLoading label="Loading effective permissions…" />}
      {!loadingAccounts && !accounts.length && !error && (
        <AdminEmpty title="No matching accounts." message="Try another search or provision an administrator through the controlled server workflow." />
      )}
      {!loadingAccounts && selectedId && !loadingPermissions && !accountPermissions && !error && (
        <AdminEmpty title="Permissions unavailable." message="The selected account permissions could not be loaded." />
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
              <span className="admin-eyebrow">{group}</span>
              <span>{modules.length} modules</span>
              <span aria-hidden="true">{expandedGroups[group] ? '−' : '+'}</span>
            </button>
          </div>
          {expandedGroups[group] && <div className="admin-permission-table-wrap">
            <table className="admin-permission-table admin-account-permission-table">
              <thead>
                <tr>
                  <th scope="col">Module</th>
                  {ACTIONS.map((action) => <th scope="col" key={action}>{actionLabel(action)}</th>)}
                </tr>
              </thead>
              <tbody>
                {modules.map((module) => (
                  <tr key={module.moduleId}>
                    <th scope="row">
                      <span className="admin-permission-module-name">{module.label}</span>
                      <span className={`admin-module-status${module.isAvailable && module.isActive ? ' admin-module-status--ready' : ''}`}>
                        {module.isAvailable ? (module.isActive ? 'Implemented · active' : 'Implemented · inactive') : 'Planned · not implemented'}
                      </span>
                    </th>
                    {ACTIONS.map((action) => {
                      const key = `${module.moduleId}:${action}`;
                      const override = Object.prototype.hasOwnProperty.call(drafts, key)
                        ? drafts[key]
                        : module.overrides[action];
                      const origin = module.overrides[action] !== null
                        ? (module.overrides[action] ? 'Account override: allowed' : 'Account override: denied')
                        : (module.roleActions[action] ? 'Role default: allowed' : 'Role default: denied');
                      return (
                        <td key={action}>
                          <div className="admin-account-permission-cell">
                            <span className={`admin-effective-state${module.actions[action] ? ' admin-effective-state--allowed' : ''}`}>
                              {module.actions[action] ? 'Allowed' : 'Denied'}
                            </span>
                            <label className="sr-only" htmlFor={`override-${module.moduleId}-${action}`}>
                              {actionLabel(action)} override for {module.label}
                            </label>
                            <select
                              id={`override-${module.moduleId}-${action}`}
                              value={override === null ? '' : override ? 'allow' : 'deny'}
                              disabled={isLockedAccount || !module.limits?.[action]}
                              onChange={(event) => changeOverride(module.moduleId, action, event.target.value)}
                            >
                              <option value="">Use role default</option>
                              <option value="allow">Allow</option>
                              <option value="deny">Deny</option>
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
          <span>{changes.length} permission change{changes.length === 1 ? '' : 's'} not saved</span>
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={() => setDrafts(overrideDrafts(accountPermissions.modules))}
          >
            Discard
          </button>
          <button
            type="button"
            className="admin-button admin-button--primary"
            disabled={isLockedAccount || saving}
            onClick={() => setPendingChanges(changes)}
          >
            Review changes
          </button>
        </div>
      )}

      {pendingChanges && (
        <ConfirmDialog
          title="Save account permission changes?"
          message={`This will update ${pendingChanges.length} permission override${pendingChanges.length === 1 ? '' : 's'} for ${selectedAccount?.name}: ${pendingSummary}${pendingChanges.length > 4 ? `; and ${pendingChanges.length - 4} more` : ''}. The account’s existing sessions will be invalidated.`}
          confirmLabel="Save overrides"
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
