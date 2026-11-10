import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { useAdminAuth } from '../AdminAuthContext.jsx';
import {
  changeMyAdminPassword,
  getMyAdminProfile,
  updateMyAdminProfile
} from '../../api/admin.js';
import { AdminLoading } from '../components/AdminStates.jsx';

const initialPassword = {
  currentPassword: '',
  newPassword: '',
  passwordConfirmation: ''
};

function fieldErrors(error) {
  const details = error.details?.details;
  return Array.isArray(details)
    ? Object.fromEntries(details.map(({ path, message }) => [path, message]))
    : {};
}

function ProfileFieldError({ id, message }) {
  const { t: tI18n } = useTranslation('admin');
  return message ? <small id={id} className="admin-profile-field-error" role="alert">{message}</small> : null;
}

export default function AdminProfilePage() {
  const { t: tI18n } = useTranslation('admin');
  const { refreshSession } = useAdminAuth();
  const [profile, setProfile] = useState(null);
  const [profileDraft, setProfileDraft] = useState({ name: '', username: '', email: '' });
  const [passwordDraft, setPasswordDraft] = useState(initialPassword);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [profileErrors, setProfileErrors] = useState({});
  const [passwordErrors, setPasswordErrors] = useState({});
  const [profileBusy, setProfileBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    next: false,
    confirmation: false
  });
  const profileSubmitting = useRef(false);
  const passwordSubmitting = useRef(false);

  async function loadProfile(signal) {
    setLoading(true);
    setLoadError("");
    try {
      const current = await getMyAdminProfile({ signal });
      setProfile(current);
      setProfileDraft({ name: current.name, username: current.username ?? '', email: current.email });
    } catch (error) {
      if (error.name !== 'AbortError') setLoadError(error.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    loadProfile(controller.signal);
    return () => controller.abort();
  }, []);

  async function saveProfile(event) {
    event.preventDefault();
    setProfileError('');
    setProfileSuccess('');
    setProfileErrors({});
    const name = profileDraft.name.trim();
    const username = profileDraft.username.trim().toLowerCase();
    const email = profileDraft.email.trim().toLowerCase();
    const errors = {};
    if (!name) errors.name = 'Enter your full name.';
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) {
      errors.username = 'Use 3–64 letters, numbers, periods, underscores, or hyphens; start with a letter or number.';
    }
    if (!email) errors.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
    if (Object.keys(errors).length) {
      setProfileErrors(errors);
      return;
    }

    if (profileSubmitting.current) return;
    profileSubmitting.current = true;
    setProfileBusy(true);
    try {
      const result = await updateMyAdminProfile({ name, username, email });
      setProfile(result.data.profile);
      setProfileDraft({
        name: result.data.profile.name,
        username: result.data.profile.username,
        email: result.data.profile.email
      });
      setProfileSuccess(result.meta?.emailChanged || result.meta?.usernameChanged
        ? 'Your account information was updated. Other sessions were signed out; this session remains active.'
        : 'Your account information was updated.');
      try {
        await refreshSession();
      } catch (refreshError) {
        setProfileError(`Your changes were saved, but the session could not be refreshed: ${refreshError.message}`);
      }
    } catch (error) {
      const errorsFromServer = fieldErrors(error);
      if (error.status === 409) {
        const field = error.message.toLowerCase().includes('username') ? 'username' : 'email';
        errorsFromServer[field] = error.message;
      }
      setProfileErrors(errorsFromServer);
      setProfileError(Object.keys(errorsFromServer).length
        ? 'Check the highlighted information.'
        : error.message);
    } finally {
      profileSubmitting.current = false;
      setProfileBusy(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    setPasswordErrors({});
    const errors = {};
    if (!passwordDraft.currentPassword) errors.currentPassword = 'Enter your current password.';
    if (passwordDraft.newPassword.length < 12) errors.newPassword = 'Password must be at least 12 characters.';
    else if (new TextEncoder().encode(passwordDraft.newPassword).length > 72) {
      errors.newPassword = 'Password must be at most 72 UTF-8 bytes.';
    } else if (![/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].every((pattern) => pattern.test(passwordDraft.newPassword))) {
      errors.newPassword = 'Include lowercase and uppercase letters, a number, and a symbol.';
    }
    if (!passwordDraft.passwordConfirmation) errors.passwordConfirmation = 'Confirm your new password.';
    else if (passwordDraft.passwordConfirmation !== passwordDraft.newPassword) {
      errors.passwordConfirmation = 'The passwords do not match.';
    }
    if (Object.keys(errors).length) {
      setPasswordErrors(errors);
      return;
    }

    if (passwordSubmitting.current) return;
    passwordSubmitting.current = true;
    setPasswordBusy(true);
    try {
      const result = await changeMyAdminPassword(passwordDraft);
      setPasswordDraft(initialPassword);
      setPasswordSuccess(
        `Your password was changed. ${result.meta?.otherSessionsInvalidated ?? 0} other active session(s) were signed out; this session remains active.`
      );
      try {
        await refreshSession();
      } catch (refreshError) {
        setPasswordError(`Your password was changed, but the session could not be refreshed: ${refreshError.message}`);
      }
    } catch (error) {
      const errorsFromServer = fieldErrors(error);
      if (error.message === 'The current password is incorrect.') {
        errorsFromServer.currentPassword = error.message;
      }
      setPasswordErrors(errorsFromServer);
      setPasswordError(Object.keys(errorsFromServer).length
        ? 'Check the highlighted password fields.'
        : error.message);
    } finally {
      passwordSubmitting.current = false;
      setPasswordBusy(false);
    }
  }

  function cancelProfileEdit() {
    setProfileDraft({ name: profile.name, username: profile.username ?? '', email: profile.email });
    setProfileErrors({});
    setProfileError('');
    setProfileSuccess('');
  }

  if (loading) return <AdminLoading label="Loading your profile…" />;
  if (loadError) {
    return (
      <section className="admin-profile-page">
        <div className="admin-alert admin-alert--error" role="alert">{loadError}</div>
        <button className="admin-button admin-button--secondary" type="button" onClick={() => loadProfile()}>{tI18n("Retry", { defaultValue: "Retry" })} </button>
      </section>
    );
  }
  if (!profile) return null;

  return (
    <section className="admin-profile-page">
      <header className="admin-profile-heading">
        <span className="admin-eyebrow">{tI18n("Account", { defaultValue: "Account" })}</span>
        <h1>{tI18n("Profile Settings", { defaultValue: "Profile Settings" })}</h1>
        <p>{tI18n("View and update your own administrator account information.", { defaultValue: "View and update your own administrator account information." })}</p>
      </header>

      <section className="admin-profile-card" aria-labelledby="profile-account-heading">
        <div className="admin-profile-card-heading">
          <div>
            <span className="admin-eyebrow">{tI18n("Your account", { defaultValue: "Your account" })}</span>
            <h2 id="profile-account-heading">{tI18n("Account Information", { defaultValue: "Account Information" })}</h2>
          </div>
        </div>
        <dl className="admin-profile-details">
          <div><dt>{tI18n("Username", { defaultValue: "Username" })}</dt><dd>{profile.username || 'Not assigned'}</dd></div>
          <div><dt>{tI18n("Full name", { defaultValue: "Full name" })}</dt><dd>{profile.name}</dd></div>
          <div><dt>{tI18n("Email address", { defaultValue: "Email address" })}</dt><dd>{profile.email}</dd></div>
          <div><dt>{tI18n("Assigned role", { defaultValue: "Assigned role" })}</dt><dd>{profile.role}</dd></div>
          <div><dt>{tI18n("Account status", { defaultValue: "Account status" })}</dt><dd>{profile.isActive ? 'Active' : 'Inactive'}</dd></div>
          <div><dt>{tI18n("Account created", { defaultValue: "Account created" })}</dt><dd>{profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '—'}</dd></div>
        </dl>
      </section>

      <div className="admin-profile-forms">
        <section className="admin-profile-card" aria-labelledby="profile-edit-heading">
          <div className="admin-profile-card-heading">
            <div>
              <span className="admin-eyebrow">{tI18n("Personal details", { defaultValue: "Personal details" })}</span>
              <h2 id="profile-edit-heading">{tI18n("Edit Profile", { defaultValue: "Edit Profile" })}</h2>
            </div>
          </div>
          <form className="admin-profile-form" onSubmit={saveProfile} noValidate>
            {profileError && <div className="admin-alert admin-alert--error" role="alert">{profileError}</div>}
            {profileSuccess && <div className="admin-alert admin-alert--success" role="status">{profileSuccess}</div>}
            <label htmlFor="profile-name">{tI18n("Full name", { defaultValue: "Full name" })}</label>
            <input
              id="profile-name"
              name="name"
              autoComplete="name"
              required
              maxLength={150}
              value={profileDraft.name}
              onChange={(event) => setProfileDraft((current) => ({ ...current, name: event.target.value }))}
              aria-invalid={Boolean(profileErrors.name)}
              aria-describedby={profileErrors.name ? 'profile-name-error' : undefined}
            />
            <ProfileFieldError id="profile-name-error" message={profileErrors.name} />
            <label htmlFor="profile-username">{tI18n("Username", { defaultValue: "Username" })}</label>
            <input
              id="profile-username"
              name="username"
              type="text"
              autoComplete="username"
              required
              maxLength={64}
              value={profileDraft.username}
              onChange={(event) => setProfileDraft((current) => ({ ...current, username: event.target.value }))}
              aria-invalid={Boolean(profileErrors.username)}
              aria-describedby={profileErrors.username ? 'profile-username-error' : undefined}
            />
            <ProfileFieldError id="profile-username-error" message={profileErrors.username} />
            <label htmlFor="profile-email">{tI18n("Email address", { defaultValue: "Email address" })}</label>
            <input
              id="profile-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={profileDraft.email}
              onChange={(event) => setProfileDraft((current) => ({ ...current, email: event.target.value }))}
              aria-invalid={Boolean(profileErrors.email)}
              aria-describedby={profileErrors.email ? 'profile-email-error' : undefined}
            />
            <ProfileFieldError id="profile-email-error" message={profileErrors.email} />
            <div className="admin-profile-actions">
              <button className="admin-button admin-button--primary" type="submit" disabled={profileBusy}>
                {profileBusy ? 'Saving…' : 'Save changes'}
              </button>
              <button
                className="admin-button admin-button--secondary"
                type="button"
                onClick={cancelProfileEdit}
                disabled={profileBusy}
              >{tI18n("Cancel", { defaultValue: "Cancel" })} </button>
            </div>
          </form>
        </section>

        <section className="admin-profile-card" aria-labelledby="profile-password-heading">
          <div className="admin-profile-card-heading">
            <div>
              <span className="admin-eyebrow">{tI18n("Sign-in security", { defaultValue: "Sign-in security" })}</span>
              <h2 id="profile-password-heading">{tI18n("Change Password", { defaultValue: "Change Password" })}</h2>
            </div>
          </div>
          <form className="admin-profile-form" onSubmit={changePassword} noValidate>
            {passwordError && <div className="admin-alert admin-alert--error" role="alert">{passwordError}</div>}
            {passwordSuccess && <div className="admin-alert admin-alert--success" role="status">{passwordSuccess}</div>}
            {[
              ['currentPassword', 'Current password', 'current-password', 'current'],
              ['newPassword', 'New password', 'new-password', 'next'],
              ['passwordConfirmation', 'Confirm new password', 'new-password', 'confirmation']
            ].map(([field, label, autocomplete, visibilityKey]) => (
              <div className="admin-profile-password-field" key={field}>
                <label htmlFor={`profile-${field}`}>{label}</label>
                <div className="admin-profile-password-input">
                  <input
                    id={`profile-${field}`}
                    name={field}
                    type={showPasswords[visibilityKey] ? 'text' : 'password'}
                    autoComplete={autocomplete}
                    required
                    value={passwordDraft[field]}
                    onChange={(event) => setPasswordDraft((current) => ({ ...current, [field]: event.target.value }))}
                    aria-invalid={Boolean(passwordErrors[field])}
                    aria-describedby={passwordErrors[field] ? `profile-${field}-error` : undefined}
                  />
                  <button
                    className="admin-profile-password-toggle"
                    type="button"
                    aria-label={`${showPasswords[visibilityKey] ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
                    onClick={() => setShowPasswords((current) => ({
                      ...current,
                      [visibilityKey]: !current[visibilityKey]
                    }))}
                  >
                    {showPasswords[visibilityKey] ? 'Hide' : 'Show'}
                  </button>
                </div>
                <ProfileFieldError id={`profile-${field}-error`} message={passwordErrors[field]} />
              </div>
            ))}
            <p className="admin-profile-password-hint">{tI18n("Use at least 12 characters, including lowercase and uppercase letters, a number, and a symbol. Passwords may contain up to 72 UTF-8 bytes.", { defaultValue: "Use at least 12 characters, including lowercase and uppercase letters, a number, and a symbol. Passwords may contain up to 72 UTF-8 bytes." })} </p>
            <div className="admin-profile-actions">
              <button className="admin-button admin-button--primary" type="submit" disabled={passwordBusy}>
                {passwordBusy ? 'Changing…' : 'Change password'}
              </button>
              <button
                className="admin-button admin-button--secondary"
                type="button"
                onClick={() => {
                  setPasswordDraft(initialPassword);
                  setPasswordErrors({});
                  setPasswordError('');
                  setPasswordSuccess('');
                }}
                disabled={passwordBusy}
              >{tI18n("Clear", { defaultValue: "Clear" })} </button>
            </div>
          </form>
        </section>
      </div>
    </section>
  );
}
