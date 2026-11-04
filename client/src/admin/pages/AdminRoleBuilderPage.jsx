import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getPermissionRoles,
  getRolePermissions,
  updateRolePermissions
} from '../../api/admin.js';
import { AdminEmpty, AdminError, AdminLoading, ConfirmDialog } from '../components/AdminStates.jsx';

const ACTION_LABELS = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  publish: 'Publish',
  delete: 'Delete',
  manage: 'Manage',
  configure: 'Configure'
};

function draftsFrom(modules) {
  return Object.fromEntries(modules.map((module) => [module.moduleId, { ...module.roleActions }]));
}

function changedPermissions(modules, drafts) {
  return modules.flatMap((module) => {
    const actions = Object.fromEntries(
      Object.keys(ACTION_LABELS)
        .filter((action) => drafts[module.moduleId]?.[action] !== module.roleActions[action])
        .map((action) => [action, drafts[module.moduleId][action]])
    );
    return Object.keys(actions).length ? [{ moduleId: module.moduleId, actions }] : [];
  });
}

export default function AdminRoleBuilderPage() {
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState('admin');
  const [roleData, setRoleData] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [pendingChanges, setPendingChanges] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadRoles = useCallback(async (signal) => {
    setLoadingRoles(true);
    setError('');
    try {
      const availableRoles = await getPermissionRoles({ signal });
      setRoles(availableRoles);
      setSelectedRole((current) => availableRoles.some((role) => role.roleKey === current)
        ? current
        : availableRoles[0]?.roleKey ?? '');
    } catch (loadError) {
      if (loadError.name !== 'AbortError') setError(loadError.message);
    } finally {
      if (!signal?.aborted) setLoadingRoles(false);
    }
  }, [attempt]);

  useEffect(() => {
    const controller = new AbortController();
    loadRoles(controller.signal);
    return () => controller.abort();
  }, [loadRoles]);

  useEffect(() => {
    if (!selectedRole) return undefined;
    const controller = new AbortController();
    setLoadingPermissions(true);
    setError('');
    getRolePermissions(selectedRole, { signal: controller.signal })
      .then((result) => {
        setRoleData(result);
        setDrafts(draftsFrom(result.modules));
      })
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setError(loadError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingPermissions(false);
      });
    return () => controller.abort();
  }, [selectedRole, attempt]);

  const role = roles.find((item) => item.roleKey === selectedRole);
  const changes = useMemo(
    () => roleData ? changedPermissions(roleData.modules, drafts) : [],
    [roleData, drafts]
  );
  const groupedModules = useMemo(() => {
    const groups = new Map();
    for (const module of roleData?.modules ?? []) {
      if (!groups.has(module.navigationGroup)) groups.set(module.navigationGroup, []);
      groups.get(module.navigationGroup).push(module);
    }
    return [...groups.entries()];
  }, [roleData]);
  const pendingSummary = pendingChanges && roleData
    ? pendingChanges.slice(0, 4).map((change) => {
      const label = roleData.modules.find((module) => module.moduleId === change.moduleId)?.label ?? change.moduleId;
      const actions = Object.entries(change.actions)
        .map(([action, allowed]) => `${ACTION_LABELS[action]} ${allowed ? 'allowed' : 'denied'}`)
        .join(', ');
      return `${label}: ${actions}`;
    }).join('; ')
    : '';

  function updateDraft(moduleId, actionId, value) {
    setDrafts((current) => ({
      ...current,
      [moduleId]: { ...current[moduleId], [actionId]: value }
    }));
    setNotice('');
  }

  async function saveChanges() {
    if (!role?.isEditable || !changes.length || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await updateRolePermissions(selectedRole, changes);
      setRoleData(result);
      setDrafts(draftsFrom(result.modules));
      setPendingChanges(null);
      setNotice(`Permissions for ${role.label} were saved.`);
    } catch (saveError) {
      setPendingChanges(null);
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-page admin-permission-page">
      <div className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">Central access control</span>
          <h1>Role Builder</h1>
          <p>Review and configure the actions granted to each built-in system role.</p>
        </div>
        <button
          type="button"
          className="admin-button admin-button--primary"
          disabled={!role?.isEditable || !changes.length || saving}
          onClick={() => setPendingChanges(changes)}
        >
          Review {changes.length ? `${changes.length} change${changes.length === 1 ? '' : 's'}` : 'changes'}
        </button>
      </div>

      {notice && <div className="admin-alert admin-alert--success" role="status">{notice}</div>}
      {error && <AdminError message={error} onRetry={() => setAttempt((value) => value + 1)} />}
      {loadingRoles && <AdminLoading label="Loading system roles…" />}
      {!loadingRoles && !error && !roles.length && (
        <AdminEmpty title="No roles are available." message="The server did not return any configurable system roles." />
      )}

      {!loadingRoles && roles.length > 0 && (
        <section className="admin-panel admin-role-controls">
          <div className="admin-panel-heading">
            <div>
              <span className="admin-eyebrow">System roles</span>
              <h2>Permissions matrix</h2>
            </div>
            <label className="admin-role-select">
              <span>Selected role</span>
              <select value={selectedRole} onChange={(event) => {
                setSelectedRole(event.target.value);
                setNotice('');
              }}>
                {roles.map((item) => (
                  <option value={item.roleKey} key={item.roleKey}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>
          {role && (
            <div className="admin-role-explainer">
              <strong>{role.label}</strong>
              <span>
                {role.isEditable
                  ? 'This role can be configured within its server-defined permission limits.'
                  : 'Built-in Super Admin authority is fixed and cannot be changed here.'}
              </span>
            </div>
          )}
        </section>
      )}

      {loadingPermissions && !error && <AdminLoading label="Loading role permissions…" />}
      {!loadingPermissions && roleData && !error && groupedModules.map(([group, modules]) => (
        <section className="admin-panel admin-permission-group" key={group}>
          <div className="admin-panel-heading">
            <div>
              <span className="admin-eyebrow">{group}</span>
              <h2>{modules.length} registered modules</h2>
            </div>
          </div>
          <div className="admin-permission-table-wrap">
            <table className="admin-permission-table">
              <thead>
                <tr>
                  <th scope="col">Module</th>
                  {Object.entries(ACTION_LABELS).map(([id, label]) => <th scope="col" key={id}>{label}</th>)}
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
                    {Object.entries(ACTION_LABELS).map(([action, label]) => {
                      const allowed = Boolean(module.limits?.[action]);
                      return (
                        <td key={action}>
                          <label className="admin-permission-check">
                            <input
                              type="checkbox"
                              aria-label={`${label} ${module.label}`}
                              checked={Boolean(drafts[module.moduleId]?.[action])}
                              disabled={!role?.isEditable || !allowed}
                              onChange={(event) => updateDraft(module.moduleId, action, event.target.checked)}
                            />
                            <span className="sr-only">{label}</span>
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {pendingChanges && (
        <ConfirmDialog
          title="Save role permission changes?"
          message={`You are changing ${pendingChanges.length} module permission group${pendingChanges.length === 1 ? '' : 's'} for ${role?.label}: ${pendingSummary}${pendingChanges.length > 4 ? `; and ${pendingChanges.length - 4} more` : ''}. The server will validate all grants before saving.`}
          confirmLabel="Save permissions"
          busy={saving}
          onCancel={() => setPendingChanges(null)}
          onConfirm={saveChanges}
        />
      )}
    </div>
  );
}
