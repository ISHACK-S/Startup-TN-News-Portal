import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createAdminUser,
  getAdminUsers,
  getPermissionRoles,
  updateAdminUser
} from '../../api/admin.js';
import { useAdminAuth } from '../AdminAuthContext.jsx';
import { AdminEmpty, AdminError, AdminLoading, ConfirmDialog } from '../components/AdminStates.jsx';

const PAGE_SIZE = 10;

export default function AdminUsersPage() {
  const { t: tI18n } = useTranslation('admin');
  const { admin } = useAdminAuth();
  const [accounts, setAccounts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [roleDrafts, setRoleDrafts] = useState({});
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [pendingChange, setPendingChange] = useState(null);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createRoles, setCreateRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState('');
  const [accountRoles, setAccountRoles] = useState([]);
  const [createValues, setCreateValues] = useState({
    name: '',
    email: '',
    password: '',
    passwordConfirmation: '',
    role: '',
    isActive: true,
    confirmSuperAdmin: false
  });
  const [createErrors, setCreateErrors] = useState({});
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  const nameInputRef = useRef(null);
  const createButtonRef = useRef(null);
  const wasCreateOpenRef = useRef(false);

  const loadAccounts = useCallback(async (signal) => {
    setLoading(true);
    setError("");
    try {
      const result = await getAdminUsers({
        page,
        limit: PAGE_SIZE,
        q: query || undefined,
        signal
      });
      setAccounts(result.data);
      setPagination(result.pagination);
      setRoleDrafts({});
    } catch (loadError) {
      if (loadError.name !== 'AbortError') setError(loadError.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, query]);

  useEffect(() => {
    const controller = new AbortController();
    loadAccounts(controller.signal);
    return () => controller.abort();
  }, [attempt, loadAccounts]);

  useEffect(() => {
    const controller = new AbortController();
    getPermissionRoles({ signal: controller.signal })
      .then((roles) => {
        setAccountRoles(roles);
        setCreateRoles(roles);
        setRolesError('');
      })
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setRolesError(loadError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRolesLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (createOpen) {
      wasCreateOpenRef.current = true;
      if (!rolesLoading && !rolesError) nameInputRef.current?.focus();
    } else if (wasCreateOpenRef.current) {
      wasCreateOpenRef.current = false;
      createButtonRef.current?.focus();
    }
  }, [createOpen, rolesLoading, rolesError]);

  async function openCreateForm() {
    if (rolesLoading || creating) return;
    setCreateOpen(true);
    setRolesLoading(true);
    setRolesError('');
    setCreateError('');
    try {
      const roles = await getPermissionRoles();
      setAccountRoles(roles);
      setCreateRoles(roles.filter((role) => role.isActive));
      setCreateValues((current) => ({
        ...current,
        role: roles.find((role) => role.role === 'Admin' && role.isActive)?.role
          ?? roles.find((role) => role.isActive)?.role
          ?? ''
      }));
    } catch (loadError) {
      setRolesError(loadError.message);
    } finally {
      setRolesLoading(false);
    }
  }

  function closeCreateForm() {
    if (creating) return;
    setCreateOpen(false);
    setCreateErrors({});
    setCreateError('');
  }

  function validateCreateForm() {
    const errors = {};
    const normalizedEmail = createValues.email.trim();
    if (!createValues.name.trim()) errors.name = 'Enter the administrator’s full name.';
    if (!normalizedEmail) errors.email = 'Enter an email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) errors.email = 'Enter a valid email address.';
    if (createValues.password.length < 12) errors.password = 'Password must be at least 12 characters.';
    else if (new TextEncoder().encode(createValues.password).length > 72) {
      errors.password = 'Password must be at most 72 UTF-8 bytes.';
    } else if (
      [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(createValues.password)).length !== 4
    ) {
      errors.password = 'Include lowercase and uppercase letters, a number, and a symbol.';
    }
    if (!createValues.passwordConfirmation) errors.passwordConfirmation = 'Confirm the initial password.';
    else if (createValues.password !== createValues.passwordConfirmation) {
      errors.passwordConfirmation = 'The passwords do not match.';
    }
    if (!createRoles.some((role) => role.role === createValues.role && role.isActive)) {
      errors.role = 'Select an active role.';
    }
    if (createValues.role === 'Super Admin' && !createValues.confirmSuperAdmin) {
      errors.confirmSuperAdmin = 'Confirm the elevated Super Admin role.';
    }
    setCreateErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submitCreateForm(event) {
    event.preventDefault();
    if (creating || !validateCreateForm()) return;
    setCreating(true);
    setCreateError('');
    setNotice("");
    try {
      const created = await createAdminUser({
        name: createValues.name.trim(),
        email: createValues.email.trim(),
        password: createValues.password,
        role: createValues.role,
        isActive: createValues.isActive,
        ...(createValues.role === 'Super Admin'
          ? { confirmSuperAdmin: createValues.confirmSuperAdmin }
          : {})
      });
      setCreateOpen(false);
      setCreateValues({
        name: '',
        email: '',
        password: '',
        passwordConfirmation: '',
        role: '',
        isActive: true,
        confirmSuperAdmin: false
      });
      setSearch('');
      setQuery('');
      setPage(1);
      setAttempt((value) => value + 1);
      setNotice(`${created.name} was created successfully.`);
    } catch (creationError) {
      const details = creationError.details?.details;
      if (Array.isArray(details)) {
        const fieldErrors = Object.fromEntries(details.map(({ path, message }) => [path, message]));
        setCreateErrors(fieldErrors);
        setCreateError('Check the highlighted account details.');
      } else {
        setCreateError(creationError.message);
      }
    } finally {
      setCreating(false);
    }
  }

  function submitSearch(event) {
    event.preventDefault();
    setPage(1);
    setQuery(search.trim());
  }

  function requestRoleChange(account) {
    const role = roleDrafts[account.id] ?? account.role;
    if (role === account.role) return;
    setPendingChange({
      account,
      changes: { role },
      title: 'Change administrator role?',
      message: `Change ${account.name}'s role from ${account.role} to ${role}? Their existing sessions will be signed out.`
    });
  }

  function requestStatusChange(account) {
    const isActive = !account.isActive;
    setPendingChange({
      account,
      changes: { isActive },
      title: `${isActive ? 'Reactivate' : 'Deactivate'} this account?`,
      message: `${isActive ? 'Restore access for' : 'Remove access for'} ${account.name}? Their existing sessions will be signed out.`
    });
  }

  async function confirmChange() {
    if (!pendingChange || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await updateAdminUser(pendingChange.account.id, pendingChange.changes);
      setAccounts((current) => current.map((account) =>
        String(account.id) === String(result.data.id) ? result.data : account
      ));
      setRoleDrafts((current) => {
        const next = { ...current };
        delete next[pendingChange.account.id];
        return next;
      });
      setNotice(`${result.data.name}'s account was updated successfully.`);
      setPendingChange(null);
      setAttempt((value) => value + 1);
    } catch (updateError) {
      setPendingChange(null);
      setError(updateError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-page admin-users-page">
      <div className="admin-page-heading admin-users-heading">
        <div>
          <span className="admin-eyebrow">{tI18n("Privileged workspace", { defaultValue: "Privileged workspace" })}</span>
          <h1>{tI18n("User Management", { defaultValue: "User Management" })}</h1>
          <p>{tI18n("Manage administrator access, roles, and account status.", { defaultValue: "Manage administrator access, roles, and account status." })}</p>
        </div>
        <div className="admin-users-summary">
          <span>{tI18n("Administrator accounts", { defaultValue: "Administrator accounts" })}</span>
          <strong>{pagination.total}</strong>
        </div>
      </div>

      {notice && <div className="admin-alert admin-alert--success" role="status">{notice}</div>}
      {error && <AdminError message={error} onRetry={() => setAttempt((value) => value + 1)} />}

      <section className="admin-panel admin-users-panel">
        <div className="admin-panel-heading admin-users-panel-heading">
          <div>
            <span className="admin-eyebrow">{tI18n("Access control", { defaultValue: "Access control" })}</span>
            <h2>{tI18n("Administrator accounts", { defaultValue: "Administrator accounts" })}</h2>
          </div>
          <div className="admin-users-tools">
            <form className="admin-search-form admin-users-search" role="search" onSubmit={submitSearch}>
              <label className="sr-only" htmlFor="admin-user-search">{tI18n("Search by name or email", { defaultValue: "Search by name or email" })}</label>
              <input
                id="admin-user-search"
                type="search"
                placeholder={tI18n("Search name or email", { defaultValue: "Search name or email" })}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <button type="submit" className="admin-button admin-button--secondary">{tI18n("Search", { defaultValue: "Search" })}</button>
            </form>
            <button
              ref={createButtonRef}
              type="button"
              className="admin-button admin-button--primary"
              disabled={rolesLoading || creating}
              onClick={openCreateForm}
            >{tI18n("Create Account", { defaultValue: "Create Account" })} </button>
          </div>
        </div>

        {loading && <AdminLoading label="Loading administrator accounts…" />}
        {!loading && !error && accounts.length === 0 && (
          <AdminEmpty
            title={query ? 'No matching accounts.' : 'No administrator accounts.'}
            message={query ? 'Try another name or email address.' : 'Accounts provisioned on the server will appear here.'}
          />
        )}
        {!loading && !error && accounts.length > 0 && (
          <>
            <div className="admin-table-wrap admin-users-table-wrap">
              <table className="admin-table admin-users-table">
                <thead>
                  <tr>
                    <th scope="col">{tI18n("Administrator", { defaultValue: "Administrator" })}</th>
                    <th scope="col">{tI18n("Role", { defaultValue: "Role" })}</th>
                    <th scope="col">{tI18n("Status", { defaultValue: "Status" })}</th>
                    <th scope="col">{tI18n("Created", { defaultValue: "Created" })}</th>
                    <th scope="col">{tI18n("Actions", { defaultValue: "Actions" })}</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => {
                    const isSelf = String(account.id) === String(admin?.id);
                    const selectedRole = roleDrafts[account.id] ?? account.role;
                    return (
                      <tr key={account.id}>
                        <td className="admin-user-identity" data-label="Administrator">
                          <strong>{account.name}</strong>
                          <span>{account.email}</span>
                        </td>
                        <td data-label="Role">
                          <span className={`admin-user-badge admin-user-role-badge${account.role === 'Super Admin' ? ' admin-user-role-badge--super' : ''}`}>
                            {account.role}
                          </span>
                        </td>
                        <td data-label="Status">
                          <span className={`admin-user-badge admin-user-status-badge${account.isActive ? ' admin-user-status-badge--active' : ' admin-user-status-badge--inactive'}`}>
                            <span aria-hidden="true" />{account.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="admin-user-created" data-label="Created">{formatCreatedAt(account.createdAt)}</td>
                        <td className="admin-user-actions-cell" data-label="Actions">
                          <div className="admin-user-actions">
                            <div className="admin-user-role-action">
                              <label className="sr-only" htmlFor={`role-${account.id}`}>{tI18n("Role for", { defaultValue: "Role for" })} {account.name}</label>
                              <select
                                id={`role-${account.id}`}
                                value={selectedRole}
                                disabled={isSelf || saving || rolesLoading}
                                onChange={(event) => setRoleDrafts((current) => ({
                                  ...current,
                                  [account.id]: event.target.value
                                }))}
                              >
                                {accountRoles.filter((role) => role.isActive).map((role) => (
                                  <option key={role.roleKey} value={role.role}>{role.label}</option>
                                ))}
                                {accountRoles.some((role) => role.role === account.role && !role.isActive) && (
                                  <option value={account.role} disabled>
                                    {account.role} {tI18n("(Inactive)", { defaultValue: "(Inactive)" })} </option>
                                )}
                              </select>
                              <button
                                type="button"
                                className="admin-user-action-link"
                                disabled={isSelf || saving || selectedRole === account.role}
                                onClick={() => requestRoleChange(account)}
                              >{tI18n("Save role", { defaultValue: "Save role" })} </button>
                            </div>
                            <button
                              type="button"
                              className={`admin-user-status-action${account.isActive ? ' admin-user-status-action--deactivate' : ''}`}
                              disabled={isSelf || saving}
                              onClick={() => requestStatusChange(account)}
                            >
                              {account.isActive ? 'Deactivate' : 'Reactivate'}
                            </button>
                            {isSelf && <span className="admin-user-self-note">{tI18n("Your account", { defaultValue: "Your account" })}</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <nav className="admin-pagination" aria-label={tI18n("Administrator pages", { defaultValue: "Administrator pages" })}>
              <span>{pagination.total} {tI18n("accounts", { defaultValue: "accounts" })}</span>
              <div>
                <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>{tI18n("← Previous", { defaultValue: "← Previous" })}</button>
                <span>{tI18n("Page", { defaultValue: "Page" })} {page} {tI18n("of", { defaultValue: "of" })} {Math.max(pagination.totalPages, 1)}</span>
                <button type="button" disabled={page >= pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)}>{tI18n("Next →", { defaultValue: "Next →" })}</button>
              </div>
            </nav>
          </>
        )}
      </section>

      {pendingChange && (
        <ConfirmDialog
          title={pendingChange.title}
          message={pendingChange.message}
          confirmLabel="Confirm change"
          busy={saving}
          onCancel={() => setPendingChange(null)}
          onConfirm={confirmChange}
        />
      )}
      {createOpen && (
        <div
          className="admin-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCreateForm();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              closeCreateForm();
              return;
            }
            if (event.key === 'Tab') {
              const focusable = [...event.currentTarget.querySelectorAll(
                'button:not(:disabled), input:not(:disabled), select:not(:disabled)'
              )];
              const first = focusable[0];
              const last = focusable.at(-1);
              if (event.shiftKey && event.target === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && event.target === last) {
                event.preventDefault();
                first?.focus();
              }
            }
          }}
        >
          <section
            className="admin-dialog admin-create-account-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-account-title"
          >
            <div className="admin-create-account-heading">
              <div>
                <span className="admin-dialog-kicker">{tI18n("Access control", { defaultValue: "Access control" })}</span>
                <h2 id="create-account-title">{tI18n("Create administrator account", { defaultValue: "Create administrator account" })}</h2>
                <p>{tI18n("New accounts inherit permissions from their assigned role.", { defaultValue: "New accounts inherit permissions from their assigned role." })}</p>
              </div>
              <button
                type="button"
                className="admin-create-account-close"
                aria-label={tI18n("Close create account form", { defaultValue: "Close create account form" })}
                disabled={creating}
                onClick={closeCreateForm}
              >{tI18n("×", { defaultValue: "×" })}</button>
            </div>
            {rolesLoading && <AdminLoading label="Loading available roles…" />}
            {rolesError && (
              <div className="admin-create-account-role-error" role="alert">
                <AdminError message={rolesError} onRetry={openCreateForm} />
              </div>
            )}
            {!rolesLoading && !rolesError && (
              <form className="admin-create-account-form" onSubmit={submitCreateForm} noValidate>
                {createError && <div className="admin-alert admin-alert--error" role="alert">{createError}</div>}
                <label className="admin-create-field">
                  <span>{tI18n("Full Name", { defaultValue: "Full Name" })}</span>
                  <input
                    ref={nameInputRef}
                    autoComplete="name"
                    value={createValues.name}
                    aria-invalid={Boolean(createErrors.name)}
                    aria-describedby={createErrors.name ? 'create-name-error' : undefined}
                    onChange={(event) => setCreateValues((current) => ({ ...current, name: event.target.value }))}
                  />
                  {createErrors.name && <small id="create-name-error" role="alert">{createErrors.name}</small>}
                </label>
                <label className="admin-create-field">
                  <span>{tI18n("Email Address", { defaultValue: "Email Address" })}</span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={createValues.email}
                    aria-invalid={Boolean(createErrors.email)}
                    aria-describedby={createErrors.email ? 'create-email-error' : undefined}
                    onChange={(event) => setCreateValues((current) => ({ ...current, email: event.target.value }))}
                  />
                  {createErrors.email && <small id="create-email-error" role="alert">{createErrors.email}</small>}
                </label>
                <label className="admin-create-field">
                  <span>{tI18n("Initial Password", { defaultValue: "Initial Password" })}</span>
                  <span className="admin-create-password-control">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      aria-label={tI18n("Initial Password", { defaultValue: "Initial Password" })}
                      autoComplete="new-password"
                      value={createValues.password}
                      aria-invalid={Boolean(createErrors.password)}
                      aria-describedby={createErrors.password ? 'create-password-error' : 'create-password-hint'}
                      onChange={(event) => setCreateValues((current) => ({ ...current, password: event.target.value }))}
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide initial password' : 'Show initial password'}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((visible) => !visible)}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </span>
                  <small
                    id={createErrors.password ? 'create-password-error' : 'create-password-hint'}
                    role={createErrors.password ? 'alert' : undefined}
                  >
                    {createErrors.password || '12+ characters with uppercase, lowercase, a number, and a symbol.'}
                  </small>
                </label>
                <label className="admin-create-field">
                  <span>{tI18n("Confirm Password", { defaultValue: "Confirm Password" })}</span>
                  <span className="admin-create-password-control">
                    <input
                      type={showPasswordConfirmation ? 'text' : 'password'}
                      aria-label={tI18n("Confirm Password", { defaultValue: "Confirm Password" })}
                      autoComplete="new-password"
                      value={createValues.passwordConfirmation}
                      aria-invalid={Boolean(createErrors.passwordConfirmation)}
                      aria-describedby={createErrors.passwordConfirmation ? 'create-confirm-error' : undefined}
                      onChange={(event) => setCreateValues((current) => ({
                        ...current,
                        passwordConfirmation: event.target.value
                      }))}
                    />
                    <button
                      type="button"
                      aria-label={showPasswordConfirmation ? 'Hide password confirmation' : 'Show password confirmation'}
                      aria-pressed={showPasswordConfirmation}
                      onClick={() => setShowPasswordConfirmation((visible) => !visible)}
                    >{showPasswordConfirmation ? 'Hide' : 'Show'}</button>
                  </span>
                  {createErrors.passwordConfirmation
                    && <small id="create-confirm-error" role="alert">{createErrors.passwordConfirmation}</small>}
                </label>
                <label className="admin-create-field">
                  <span>{tI18n("Role", { defaultValue: "Role" })}</span>
                  <select
                    value={createValues.role}
                    aria-invalid={Boolean(createErrors.role)}
                    aria-describedby={createErrors.role ? 'create-role-error' : undefined}
                    onChange={(event) => setCreateValues((current) => ({
                      ...current,
                      role: event.target.value,
                      confirmSuperAdmin: false
                    }))}
                  >
                    {createRoles.filter((role) => role.isActive).map((role) => (
                      <option key={role.roleKey} value={role.role}>{role.label}</option>
                    ))}
                  </select>
                  {createRoles.find((role) => role.role === createValues.role)?.description
                    && <small>{createRoles.find((role) => role.role === createValues.role).description}</small>}
                  {createErrors.role && <small id="create-role-error" role="alert">{createErrors.role}</small>}
                </label>
                {createValues.role === 'Super Admin' && (
                  <label className="admin-create-confirm-super">
                    <input
                      type="checkbox"
                      checked={createValues.confirmSuperAdmin}
                      aria-invalid={Boolean(createErrors.confirmSuperAdmin)}
                      onChange={(event) => setCreateValues((current) => ({
                        ...current,
                        confirmSuperAdmin: event.target.checked
                      }))}
                    />
                    <span>{tI18n("Confirm this account should receive unrestricted Super Admin authority.", { defaultValue: "Confirm this account should receive unrestricted Super Admin authority." })}</span>
                    {createErrors.confirmSuperAdmin && <small role="alert">{createErrors.confirmSuperAdmin}</small>}
                  </label>
                )}
                <label className="admin-create-field">
                  <span>{tI18n("Account Status", { defaultValue: "Account Status" })}</span>
                  <select
                    value={createValues.isActive ? 'active' : 'inactive'}
                    onChange={(event) => setCreateValues((current) => ({
                      ...current,
                      isActive: event.target.value === 'active'
                    }))}
                  >
                    <option value="active">{tI18n("Active", { defaultValue: "Active" })}</option>
                    <option value="inactive">{tI18n("Inactive", { defaultValue: "Inactive" })}</option>
                  </select>
                </label>
                <div className="admin-dialog-actions">
                  <button
                    type="button"
                    className="admin-button admin-button--secondary"
                    disabled={creating}
                    onClick={closeCreateForm}
                  >{tI18n("Cancel", { defaultValue: "Cancel" })}</button>
                  <button
                    type="submit"
                    className="admin-button admin-button--primary"
                    disabled={creating}
                  >{creating ? 'Creating account…' : 'Create Account'}</button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function formatCreatedAt(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}
