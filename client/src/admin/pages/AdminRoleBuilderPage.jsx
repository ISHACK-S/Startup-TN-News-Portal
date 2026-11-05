import { translateAdminModuleLabel, translatePermissionAction } from '../../i18n/adminLabels.js';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createPermissionRole,
  deletePermissionRole,
  getPermissionRoles,
  getRolePermissions,
  updatePermissionRole,
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

const EMPTY_ROLE_FORM = { label: '', roleKey: '', description: '', isActive: true };

function draftsFrom(modules, clear = false) {
  return Object.fromEntries(modules.map((module) => [
    module.moduleId,
    Object.fromEntries(Object.keys(ACTION_LABELS).map((action) => [
      action,
      clear ? false : Boolean(module.roleActions[action])
    ]))
  ]));
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

function selectedPermissions(modules, drafts) {
  return modules.flatMap((module) => {
    const actions = Object.fromEntries(
      Object.keys(ACTION_LABELS)
        .filter((action) => module.limits?.[action] && drafts[module.moduleId]?.[action])
        .map((action) => [action, true])
    );
    return Object.keys(actions).length ? [{ moduleId: module.moduleId, actions }] : [];
  });
}

function makeRoleKey(label) {
  return label.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
}

export default function AdminRoleBuilderPage() {
  const { t: tI18n } = useTranslation('admin');
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
  const [deletePending, setDeletePending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState(null);
  const [roleForm, setRoleForm] = useState(EMPTY_ROLE_FORM);
  const [roleKeyEdited, setRoleKeyEdited] = useState(false);

  const loadRoles = useCallback(async (signal) => {
    setLoadingRoles(true);
    setError("");
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
    if (!selectedRole || mode === 'create') return undefined;
    const controller = new AbortController();
    setLoadingPermissions(true);
    setError("");
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
  }, [selectedRole, attempt, mode]);

  const role = roles.find((item) => item.roleKey === selectedRole);
  const changes = useMemo(
    () => roleData ? changedPermissions(roleData.modules, drafts) : [],
    [roleData, drafts]
  );
  const selectedCount = useMemo(
    () => roleData?.modules.reduce((count, module) => count + Object.values(drafts[module.moduleId] ?? {})
      .filter(Boolean).length, 0) ?? 0,
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
      const label = translateAdminModuleLabel(
        change.moduleId,
        roleData.modules.find((module) => module.moduleId === change.moduleId)?.label
      );
      const actions = Object.entries(change.actions)
        .map(([action, allowed]) => `${translatePermissionAction(action)} ${tI18n(allowed ? 'allowed' : 'denied', { defaultValue: allowed ? 'allowed' : 'denied' })}`)
        .join(', ');
      return `${label}: ${actions}`;
    }).join('; ')
    : '';

  function updateDraft(moduleId, actionId, value) {
    setDrafts((current) => ({
      ...current,
      [moduleId]: { ...current[moduleId], [actionId]: value }
    }));
    setNotice("");
  }

  function setGroupPermissions(modules, value) {
    setDrafts((current) => {
      const next = { ...current };
      for (const module of modules) {
        next[module.moduleId] = { ...current[module.moduleId] };
        for (const action of Object.keys(ACTION_LABELS)) {
          if (module.limits?.[action]) next[module.moduleId][action] = value;
        }
      }
      return next;
    });
    setNotice("");
  }

  function setAllPermissions(value) {
    for (const [, modules] of groupedModules) setGroupPermissions(modules, value);
  }

  async function beginCreate() {
    setError("");
    setNotice("");
    setLoadingPermissions(true);
    try {
      const template = await getRolePermissions('admin');
      setRoleData(template);
      setDrafts(draftsFrom(template.modules, true));
      setRoleForm(EMPTY_ROLE_FORM);
      setRoleKeyEdited(false);
      setMode('create');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoadingPermissions(false);
    }
  }

  function beginEdit() {
    if (!role || role.isBuiltIn) return;
    setRoleForm({
      label: role.label,
      roleKey: role.roleKey,
      description: role.description ?? '',
      isActive: role.isActive
    });
    setRoleKeyEdited(true);
    setMode('edit');
    setError("");
    setNotice("");
  }

  function cancelRoleForm() {
    if (saving) return;
    setMode(null);
    setError("");
    setRoleKeyEdited(false);
  }

  async function saveRoleForm(event) {
    event.preventDefault();
    if (!roleData || saving) return;
    const permissions = mode === 'create'
      ? selectedPermissions(roleData.modules, drafts)
      : changes;
    const payload = {
      label: roleForm.label.trim(),
      description: roleForm.description.trim(),
      isActive: roleForm.isActive,
      ...(permissions.length ? { permissions } : {})
    };
    if (mode === 'create') payload.roleKey = roleForm.roleKey;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = mode === 'create'
        ? await createPermissionRole(payload)
        : await updatePermissionRole(selectedRole, payload);
      const updatedRoles = await getPermissionRoles();
      setRoles(updatedRoles);
      setSelectedRole(result.roleKey);
      setRoleData(result);
      setDrafts(draftsFrom(result.modules));
      setMode(null);
      setRoleKeyEdited(false);
      setNotice(mode === 'create'
        ? tI18n('Role "{{role}}" was created.', { role: result.label, defaultValue: 'Role "{{role}}" was created.' })
        : tI18n('Role "{{role}}" was updated.', { role: result.label, defaultValue: 'Role "{{role}}" was updated.' }));
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveChanges() {
    if (!role?.isEditable || !changes.length || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await updateRolePermissions(selectedRole, changes);
      setRoleData(result);
      setDrafts(draftsFrom(result.modules));
      setPendingChanges(null);
      setNotice(tI18n('Permissions for {{role}} were saved.', {
        role: role.label,
        defaultValue: 'Permissions for {{role}} were saved.'
      }));
    } catch (saveError) {
      setPendingChanges(null);
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRole() {
    if (!role || role.isBuiltIn || role.assignedCount > 0 || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await deletePermissionRole(role.roleKey);
      const remainingRoles = await getPermissionRoles();
      setRoles(remainingRoles);
      setSelectedRole(remainingRoles[0]?.roleKey ?? '');
      setDeletePending(false);
      setNotice(tI18n('Role "{{role}}" was deleted.', { role: role.label, defaultValue: 'Role "{{role}}" was deleted.' }));
    } catch (deleteError) {
      setDeletePending(false);
      setError(deleteError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-page admin-permission-page">
      <div className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">{tI18n("Central access control", { defaultValue: "Central access control" })}</span>
          <h1>{tI18n("Role Builder", { defaultValue: "Role Builder" })}</h1>
          <p>{tI18n("Configure protected system roles and create custom roles for your newsroom.", { defaultValue: "Configure protected system roles and create custom roles for your newsroom." })}</p>
        </div>
        {!mode && (
          <button
            type="button"
            className="admin-button admin-button--primary"
            disabled={loadingRoles || loadingPermissions}
            onClick={beginCreate}
          >{tI18n("Create New Role", { defaultValue: "Create New Role" })}</button>
        )}
      </div>

      {notice && <div className="admin-alert admin-alert--success" role="status">{notice}</div>}
      {error && <AdminError message={error} onRetry={() => setAttempt((value) => value + 1)} />}
      {loadingRoles && <AdminLoading label={tI18n('Loading system and custom roles…', { defaultValue: 'Loading system and custom roles…' })} />}
      {!loadingRoles && !error && !roles.length && (
        <AdminEmpty title={tI18n("No roles are available.", { defaultValue: "No roles are available." })} message={tI18n('The server did not return any configurable roles.', { defaultValue: 'The server did not return any configurable roles.' })} />
      )}

      {!mode && !loadingRoles && roles.length > 0 && (
        <section className="admin-panel admin-role-controls">
          <div className="admin-panel-heading">
            <div>
              <span className="admin-eyebrow">{tI18n("Role catalogue", { defaultValue: "Role catalogue" })}</span>
              <h2>{tI18n("Permissions matrix", { defaultValue: "Permissions matrix" })}</h2>
            </div>
            <label className="admin-role-select">
              <span>{tI18n("Selected role", { defaultValue: "Selected role" })}</span>
              <select value={selectedRole} onChange={(event) => {
                setSelectedRole(event.target.value);
                setNotice("");
              }}>
                <optgroup label={tI18n('System roles', { defaultValue: 'System roles' })}>
                  {roles.filter((item) => item.isBuiltIn).map((item) => (
                    <option value={item.roleKey} key={item.roleKey}>{item.label}</option>
                  ))}
                </optgroup>
                <optgroup label={tI18n('Custom roles', { defaultValue: 'Custom roles' })}>
                  {roles.filter((item) => !item.isBuiltIn).map((item) => (
                    <option value={item.roleKey} key={item.roleKey}>
                      {item.label}{item.isActive ? '' : ` ${tI18n('(Inactive)', { defaultValue: '(Inactive)' })}`}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
          </div>
          {role && (
            <div className="admin-role-explainer">
              <div>
                <strong>{role.label}</strong>
                <span>{tI18n(role.isBuiltIn ? 'System role' : 'Custom role', { defaultValue: role.isBuiltIn ? 'System role' : 'Custom role' })} {tI18n("·", { defaultValue: "·" })} {tI18n(role.isActive ? 'Active' : 'Inactive', { defaultValue: role.isActive ? 'Active' : 'Inactive' })}</span>
                {role.description && <span>{role.description}</span>}
                {!role.isBuiltIn && (
                  <span>{role.assignedCount} {tI18n("assigned account", { defaultValue: "assigned account" })}{role.assignedCount === 1 ? '' : 's'}</span>
                )}
              </div>
              {!role.isBuiltIn && (
                <div className="admin-role-actions">
                  <button type="button" className="admin-button admin-button--secondary" onClick={beginEdit}>{tI18n("Edit role", { defaultValue: "Edit role" })}</button>
                  <button
                    type="button"
                    className="admin-button admin-button--secondary"
                    disabled={role.assignedCount > 0 || saving}
                    onClick={() => setDeletePending(true)}
                  >{tI18n("Delete role", { defaultValue: "Delete role" })}</button>
                </div>
              )}
              {role.isBuiltIn && (
                <span>
                  {role.roleKey === 'super-admin'
                    ? 'Super Admin authority is protected and cannot be changed.'
                    : 'Built-in Admin grants remain limited by their permission ceilings.'}
                </span>
              )}
              {!role.isBuiltIn && role.assignedCount > 0 && (
                <span>{tI18n("Reassign accounts in", { defaultValue: "Reassign accounts in" })} <Link to="/admin/access-control/users">{tI18n("User Management", { defaultValue: "User Management" })}</Link> {tI18n("before deleting this role.", { defaultValue: "before deleting this role." })} </span>
              )}
            </div>
          )}
        </section>
      )}

      {mode && (
        <form className="admin-panel admin-custom-role-form" onSubmit={saveRoleForm}>
          <div className="admin-panel-heading">
            <div>
              <span className="admin-eyebrow">{mode === 'create' ? 'New custom role' : 'Edit custom role'}</span>
              <h2>{mode === 'create' ? 'Role details and permissions' : `Edit ${role?.label ?? 'role'}`}</h2>
            </div>
            <button type="button" className="admin-button admin-button--secondary" disabled={saving} onClick={cancelRoleForm}>{tI18n("Cancel", { defaultValue: "Cancel" })} </button>
          </div>
          <div className="admin-custom-role-fields">
            <label>
              <span>{tI18n("Role Name", { defaultValue: "Role Name" })} <strong aria-hidden="true">{tI18n("*", { defaultValue: "*" })}</strong></span>
              <input
                required
                minLength={2}
                maxLength={100}
                value={roleForm.label}
                onChange={(event) => {
                  const label = event.target.value;
                  setRoleForm((current) => ({
                    ...current,
                    label,
                    ...(!roleKeyEdited ? { roleKey: makeRoleKey(label) } : {})
                  }));
                }}
              />
            </label>
            <label>
              <span>{tI18n("Role Identifier", { defaultValue: "Role Identifier" })}</span>
              <input
                required
                maxLength={64}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={roleForm.roleKey}
                disabled={mode === 'edit'}
                onChange={(event) => {
                  setRoleKeyEdited(true);
                  setRoleForm((current) => ({ ...current, roleKey: event.target.value }));
                }}
              />
              <small>{tI18n("Lowercase letters, numbers, and single hyphens.", { defaultValue: "Lowercase letters, numbers, and single hyphens." })}</small>
            </label>
            <label>
              <span>{tI18n("Description", { defaultValue: "Description" })}</span>
              <textarea
                rows="3"
                maxLength={500}
                value={roleForm.description}
                onChange={(event) => setRoleForm((current) => ({ ...current, description: event.target.value }))}
              />
            </label>
            <label>
              <span>{tI18n("Role Status", { defaultValue: "Role Status" })}</span>
              <select
                value={roleForm.isActive ? 'active' : 'inactive'}
                onChange={(event) => setRoleForm((current) => ({
                  ...current,
                  isActive: event.target.value === 'active'
                }))}
              >
                <option value="active">{tI18n("Active", { defaultValue: "Active" })}</option>
                <option value="inactive">{tI18n("Inactive", { defaultValue: "Inactive" })}</option>
              </select>
            </label>
          </div>

          <div className="admin-role-permission-toolbar">
            <div>
              <strong>{selectedCount} {tI18n("permissions selected", { defaultValue: "permissions selected" })}</strong>
              <span>{tI18n("Only permissions within the existing Admin role ceiling are selectable.", { defaultValue: "Only permissions within the existing Admin role ceiling are selectable." })}</span>
            </div>
            <div>
              <button type="button" className="admin-button admin-button--secondary" onClick={() => setAllPermissions(true)}>{tI18n("Select All Permissions", { defaultValue: "Select All Permissions" })} </button>
              <button type="button" className="admin-button admin-button--secondary" onClick={() => setAllPermissions(false)}>{tI18n("Clear All Permissions", { defaultValue: "Clear All Permissions" })} </button>
            </div>
          </div>
          {groupedModules.map(([group, modules]) => (
            <section className="admin-panel admin-permission-group" key={group}>
              <div className="admin-panel-heading">
                <div>
                  <span className="admin-eyebrow">{tI18n(group, { defaultValue: group })}</span>
                  <h3>{modules.length} {tI18n("registered modules", { defaultValue: "registered modules" })}</h3>
                </div>
                <div className="admin-role-category-actions">
                  <button type="button" className="admin-button admin-button--secondary" onClick={() => setGroupPermissions(modules, true)}>{tI18n("Select category", { defaultValue: "Select category" })} </button>
                  <button type="button" className="admin-button admin-button--secondary" onClick={() => setGroupPermissions(modules, false)}>{tI18n("Clear category", { defaultValue: "Clear category" })} </button>
                </div>
              </div>
              <div className="admin-permission-table-wrap">
                <table className="admin-permission-table">
                  <thead>
                    <tr>
                      <th scope="col">{tI18n("Module", { defaultValue: "Module" })}</th>
                      {Object.entries(ACTION_LABELS).map(([id, label]) => <th scope="col" key={id}>{tI18n(label, { defaultValue: label })}</th>)}
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
                        {Object.entries(ACTION_LABELS).map(([action, label]) => {
                          const allowed = Boolean(module.limits?.[action]);
                          return (
                            <td key={action}>
                              <label className="admin-permission-check">
                                <input
                                  type="checkbox"
                                  aria-label={`${tI18n(label, { defaultValue: label })} ${translateAdminModuleLabel(module.moduleId, module.label)}`}
                                  checked={Boolean(drafts[module.moduleId]?.[action])}
                                  disabled={!allowed}
                                  onChange={(event) => updateDraft(module.moduleId, action, event.target.checked)}
                                />
                                <span className="sr-only">{tI18n(label, { defaultValue: label })}</span>
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
          <div className="admin-role-form-actions">
            <button type="button" className="admin-button admin-button--secondary" disabled={saving} onClick={cancelRoleForm}>{tI18n("Cancel", { defaultValue: "Cancel" })}</button>
            <button
              type="submit"
              className="admin-button admin-button--primary"
              disabled={saving || !roleForm.label.trim() || !roleForm.roleKey}
            >{saving
              ? tI18n('Saving…', { defaultValue: 'Saving…' })
              : tI18n(mode === 'create' ? 'Create Role' : 'Save Role', { defaultValue: mode === 'create' ? 'Create Role' : 'Save Role' })}</button>
          </div>
        </form>
      )}

      {!mode && loadingPermissions && !error && <AdminLoading label={tI18n('Loading role permissions…', { defaultValue: 'Loading role permissions…' })} />}
      {!mode && !loadingPermissions && roleData && !error && groupedModules.map(([group, modules]) => (
        <section className="admin-panel admin-permission-group" key={group}>
          <div className="admin-panel-heading">
            <div>
              <span className="admin-eyebrow">{tI18n(group, { defaultValue: group })}</span>
              <h2>{modules.length} {tI18n("registered modules", { defaultValue: "registered modules" })}</h2>
            </div>
          </div>
          <div className="admin-permission-table-wrap">
            <table className="admin-permission-table">
              <thead>
                <tr>
                  <th scope="col">{tI18n("Module", { defaultValue: "Module" })}</th>
                  {Object.entries(ACTION_LABELS).map(([id, label]) => <th scope="col" key={id}>{tI18n(label, { defaultValue: label })}</th>)}
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
                    {Object.entries(ACTION_LABELS).map(([action, label]) => {
                      const allowed = Boolean(module.limits?.[action]);
                      return (
                        <td key={action}>
                          <label className="admin-permission-check">
                            <input
                              type="checkbox"
                              aria-label={`${tI18n(label, { defaultValue: label })} ${translateAdminModuleLabel(module.moduleId, module.label)}`}
                              checked={Boolean(drafts[module.moduleId]?.[action])}
                              disabled={!role?.isEditable || !allowed}
                              onChange={(event) => updateDraft(module.moduleId, action, event.target.checked)}
                            />
                            <span className="sr-only">{tI18n(label, { defaultValue: label })}</span>
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

      {!mode && role?.isEditable && changes.length > 0 && (
        <div className="admin-permission-savebar">
          <span>{changes.length} {tI18n("permission group", { defaultValue: "permission group" })}{changes.length === 1 ? '' : 's'} {tI18n("changed.", { defaultValue: "changed." })}</span>
          <div>
            <button
              type="button"
              className="admin-button admin-button--secondary"
              onClick={() => setDrafts(draftsFrom(roleData.modules))}
            >{tI18n("Discard changes", { defaultValue: "Discard changes" })}</button>
            <button
              type="button"
              className="admin-button admin-button--primary"
              onClick={() => setPendingChanges(changes)}
            >{tI18n("Review", { defaultValue: "Review" })} {changes.length} {tI18n("change", { defaultValue: "change" })}{changes.length === 1 ? '' : 's'}</button>
          </div>
        </div>
      )}

      {pendingChanges && (
        <ConfirmDialog
          title={tI18n("Save role permission changes?", { defaultValue: "Save role permission changes?" })}
          message={tI18n('You are changing {{count}} module permission group(s) for {{role}}: {{summary}}{{more}}. The server will validate all grants before saving.', {
            count: pendingChanges.length,
            role: role?.label,
            summary: pendingSummary,
            more: pendingChanges.length > 4 ? `; and ${pendingChanges.length - 4} more` : '',
            defaultValue: 'You are changing {{count}} module permission group(s) for {{role}}: {{summary}}{{more}}. The server will validate all grants before saving.'
          })}
          confirmLabel={tI18n('Save permissions', { defaultValue: 'Save permissions' })}
          busy={saving}
          onCancel={() => setPendingChanges(null)}
          onConfirm={saveChanges}
        />
      )}
      {deletePending && role && (
        <ConfirmDialog
          title={tI18n('Delete {{role}}?', { role: role.label, defaultValue: 'Delete {{role}}?' })}
          message={tI18n('This permanently removes the custom role and its permission assignments. Administrator accounts must be reassigned before deletion.', {
            defaultValue: 'This permanently removes the custom role and its permission assignments. Administrator accounts must be reassigned before deletion.'
          })}
          confirmLabel={tI18n('Delete role', { defaultValue: 'Delete role' })}
          busy={saving}
          onCancel={() => setDeletePending(false)}
          onConfirm={deleteRole}
        />
      )}
    </div>
  );
}
