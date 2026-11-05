import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import {
  getAdminWebsiteConfiguration,
  publishAdminWebsiteConfiguration,
  saveAdminWebsiteConfiguration
} from '../../api/admin.js';
import { uploadMediaImage } from '../../api/client.js';
import { AdminLoading } from '../components/AdminStates.jsx';
import MediaLibraryPicker from '../components/MediaLibraryPicker.jsx';

function configurationKey(value) {
  if (Array.isArray(value)) return `[${value.map(configurationKey).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${configurationKey(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function configurationsMatch(left, right) {
  return configurationKey(left) === configurationKey(right);
}

function configurationErrorMessage(error) {
  const validationDetails = Array.isArray(error.details) ? error.details : error.details?.details;
  if (!Array.isArray(validationDetails) || validationDetails.length === 0) return error.message;
  return [
    error.message,
    ...validationDetails.map(({ path, message }) => `${path || 'Configuration'}: ${message}`)
  ].join(' ');
}

function useConfiguration(section) {
  const [configuration, setConfiguration] = useState(null);
  const [publishedConfiguration, setPublishedConfiguration] = useState(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const saving = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getAdminWebsiteConfiguration({ signal: controller.signal })
      .then((result) => {
        const draft = result.drafts?.[section];
        setPublishedConfiguration(result[section]);
        setConfiguration(draft ?? result[section]);
        setHasDraft(draft !== null && draft !== undefined);
      })
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(configurationErrorMessage(failure));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [section, reloadKey]);

  function retry() {
    setReloadKey((current) => current + 1);
  }

  async function save(nextConfiguration, successMessage) {
    if (saving.current) return false;
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveAdminWebsiteConfiguration(section, nextConfiguration);
      setConfiguration(saved);
      setHasDraft(true);
      setNotice(successMessage);
      return true;
    } catch (failure) {
      setError(configurationErrorMessage(failure));
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function publish(successMessage) {
    if (saving.current || !hasDraft) return false;
    saving.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const published = await publishAdminWebsiteConfiguration(section);
      setConfiguration(published);
      setPublishedConfiguration(published);
      setHasDraft(false);
      setNotice(successMessage);
      window.dispatchEvent(new Event('startuptn:site-config-updated'));
      try {
        window.localStorage.setItem('startuptn:site-config-updated', String(Date.now()));
      } catch {
        // The current tab still receives the event when local storage is unavailable.
      }
      return true;
    } catch (failure) {
      setError(configurationErrorMessage(failure));
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return {
    configuration,
    publishedConfiguration,
    hasDraft,
    loading,
    error,
    notice,
    busy,
    save,
    publish,
    retry,
    setConfiguration,
    setError,
    setNotice
  };
}

function ConfigurationPage({ eyebrow, title, description, children }) {
  const { t: tI18n } = useTranslation('admin');
  return (
    <section className="admin-website-config">
      <header className="admin-page-heading">
        <div>
          <span className="admin-eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

function Feedback({ error, notice }) {
  const { t: tI18n } = useTranslation('admin');
  return (
    <>
      {error && <div className="admin-alert admin-alert--error" role="alert">{error}</div>}
      {notice && <div className="admin-alert admin-alert--success" role="status">{notice}</div>}
    </>
  );
}

function SaveActions({ busy, canSaveDraft, canPublish, onSaveDraft, onPublish, onCancel }) {
  const { t: tI18n } = useTranslation('admin');
  return (
    <div className="admin-website-config-actions">
      <button className="admin-button admin-button--secondary" type="button" onClick={onSaveDraft} disabled={busy || !canSaveDraft}>
        {busy ? 'Saving…' : 'Save Draft'}
      </button>
      <button className="admin-button admin-button--primary" type="button" onClick={onPublish} disabled={busy || !canPublish}>
        {busy ? 'Publishing…' : 'Publish'}
      </button>
      <button className="admin-button admin-button--secondary" type="button" onClick={onCancel} disabled={busy}>{tI18n("Cancel", { defaultValue: "Cancel" })} </button>
    </div>
  );
}

function localized(item, language, enKey = 'labelEn', taKey = 'labelTa') {
  return language === 'ta' ? item[taKey] : item[enKey];
}

function createMenuTree(items) {
  const nodes = items.map((item) => ({ ...item, children: [] }));
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const roots = [];
  nodes.forEach((item) => {
    const parent = item.parentId ? byId.get(item.parentId) : null;
    if (parent) parent.children.push(item);
    else roots.push(item);
  });
  const sort = (itemsToSort) => {
    itemsToSort.sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id));
    itemsToSort.forEach((item) => sort(item.children));
  };
  sort(roots);
  return roots;
}

function filterVisibleMenu(nodes) {
  return nodes
    .filter((item) => item.isActive && item.isVisible)
    .map((item) => ({ ...item, children: filterVisibleMenu(item.children) }));
}

function MenuTree({ nodes, onEdit, onRemove, onAddChild, onMove, depth = 0 }) {
  const { t: tI18n } = useTranslation('admin');
  return (
    <ul className="admin-menu-tree">
      {nodes.map((item) => (
        <li key={item.id}>
          <details open={depth === 0}>
            <summary>
              <span className="admin-menu-tree-label">
                <strong>{item.labelEn}</strong>
                <small>{item.labelTa} {tI18n("·", { defaultValue: "·" })} {item.destination}</small>
              </span>
              <span className={`admin-config-status${item.isVisible && item.isActive ? ' is-active' : ''}`}>
                {item.isVisible && item.isActive ? 'Visible' : 'Hidden'}
              </span>
            </summary>
            <div className="admin-menu-tree-actions">
              <button type="button" className="admin-button admin-button--secondary" onClick={() => onEdit(item)}>{tI18n("Edit", { defaultValue: "Edit" })}</button>
              {depth === 0 && <button type="button" className="admin-button admin-button--secondary" onClick={() => onAddChild(item)}>{tI18n("Add submenu", { defaultValue: "Add submenu" })}</button>}
              <button type="button" className="admin-button admin-button--secondary" onClick={() => onMove(item.id, -1)} aria-label={`Move ${item.labelEn} up`}>{tI18n("Move up", { defaultValue: "Move up" })}</button>
              <button type="button" className="admin-button admin-button--secondary" onClick={() => onMove(item.id, 1)} aria-label={`Move ${item.labelEn} down`}>{tI18n("Move down", { defaultValue: "Move down" })}</button>
              <button type="button" className="admin-button admin-button--danger" onClick={() => onRemove(item)}>{tI18n("Remove", { defaultValue: "Remove" })}</button>
            </div>
            {item.children.length > 0 && (
              <MenuTree
                nodes={item.children}
                onEdit={onEdit}
                onRemove={onRemove}
                onAddChild={onAddChild}
                onMove={onMove}
                depth={depth + 1}
              />
            )}
          </details>
        </li>
      ))}
    </ul>
  );
}

const EMPTY_MENU_ITEM = {
  id: '',
  labelEn: '',
  labelTa: '',
  destinationType: 'internal',
  destination: '/',
  parentId: null,
  displayOrder: 10,
  isActive: true,
  isVisible: true,
  openInNewTab: false
};

function generatedId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}

export function AdminMenuManagementPage() {
  const { t: tI18n } = useTranslation('admin');
  const state = useConfiguration('menu');
  const [editItems, setEditItems] = useState(null);
  const [draft, setDraft] = useState(null);
  const [formError, setFormError] = useState('');
  if (state.loading) return <AdminLoading label="Loading menu configuration…" />;
  if (!state.configuration) {
    return (
      <ConfigurationPage eyebrow="Website configuration" title={tI18n("Menu Management", { defaultValue: "Menu Management" })} description="Configure the live public website navigation.">
        <Feedback error={state.error || 'Menu configuration could not be loaded.'} />
        <button type="button" className="admin-button admin-button--secondary" onClick={state.retry}>{tI18n("Retry loading", { defaultValue: "Retry loading" })}</button>
      </ConfigurationPage>
    );
  }

  const items = editItems ?? state.configuration;
  const tree = createMenuTree(items);
  const previewTree = filterVisibleMenu(tree);
  const parents = items.filter((item) => item.parentId === null && item.id !== draft?.id);

  function beginEdit(item) {
    setFormError('');
    setDraft({ ...item });
  }

  function addItem(parent = null) {
    setFormError('');
    setDraft({
      ...EMPTY_MENU_ITEM,
      id: generatedId('menu'),
      parentId: parent?.id ?? null,
      displayOrder: items.length * 10 + 10
    });
  }

  function removeItem(item) {
    if (!window.confirm(`Remove "${item.labelEn}" and its nested submenu items?`)) return;
    const removed = new Set([item.id]);
    let updated = true;
    while (updated) {
      updated = false;
      for (const candidate of items) {
        if (candidate.parentId && removed.has(candidate.parentId) && !removed.has(candidate.id)) {
          removed.add(candidate.id);
          updated = true;
        }
      }
    }
    setEditItems(items.filter((candidate) => !removed.has(candidate.id)));
    state.setError('');
    state.setNotice('Menu item removed from the unsaved draft.');
  }

  function moveItem(itemId, direction) {
    const currentItem = items.find((item) => item.id === itemId);
    const siblings = items
      .filter((item) => item.parentId === currentItem.parentId)
      .sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id));
    const index = siblings.findIndex((item) => item.id === itemId);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= siblings.length) return;
    [siblings[index], siblings[targetIndex]] = [siblings[targetIndex], siblings[index]];
    const order = new Map(siblings.map((item, position) => [item.id, (position + 1) * 10]));
    setEditItems(items.map((item) => (
      order.has(item.id) ? { ...item, displayOrder: order.get(item.id) } : item
    )));
  }

  function saveItem(event) {
    event.preventDefault();
    const identifier = draft.id.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    if (!identifier || !draft.labelEn.trim() || !draft.labelTa.trim() || !draft.destination.trim()) {
      setFormError('Provide an item identifier, both language labels, and a destination.');
      return;
    }
    if (items.some((item) => item.id === identifier && item.id !== draft.id)) {
      setFormError('That menu identifier is already in use.');
      return;
    }
    const saved = { ...draft, id: identifier, labelEn: draft.labelEn.trim(), labelTa: draft.labelTa.trim() };
    const next = items.some((item) => item.id === draft.id)
      ? items.map((item) => (item.id === draft.id ? saved : item))
      : [...items, saved];
    setEditItems(next);
    state.setError('');
    state.setNotice('');
    setDraft(null);
  }

  const visiblePreview = (nodes) => nodes.map((item) => (
    <li key={item.id}>
      <span>{item.labelEn} <small>{tI18n("(", { defaultValue: "(" })}{item.labelTa}{tI18n(")", { defaultValue: ")" })}</small></span>
      {item.children.length > 0 && <ul>{visiblePreview(item.children)}</ul>}
    </li>
  ));

  return (
    <ConfigurationPage
      eyebrow="Website configuration"
      title={tI18n("Menu Management", { defaultValue: "Menu Management" })}
      description="Edit the public navigation. Saved changes appear in the website header for every visitor."
    >
      <Feedback error={state.error} notice={state.notice} />
      <div className="admin-website-config-grid">
        <section className="admin-website-config-card" aria-labelledby="menu-tree-heading">
          <div className="admin-website-config-card-heading">
            <div><span className="admin-eyebrow">{tI18n("Navigation structure", { defaultValue: "Navigation structure" })}</span><h2 id="menu-tree-heading">{tI18n("Menu items", { defaultValue: "Menu items" })}</h2></div>
            <button type="button" className="admin-button admin-button--primary" onClick={() => addItem()}>{tI18n("Add menu item", { defaultValue: "Add menu item" })}</button>
          </div>
          {tree.length ? (
            <MenuTree
              nodes={tree}
              onEdit={beginEdit}
              onRemove={removeItem}
              onAddChild={addItem}
              onMove={moveItem}
            />
          ) : <p className="admin-config-empty">{tI18n("There are no navigation items. Add a menu item to begin.", { defaultValue: "There are no navigation items. Add a menu item to begin." })}</p>}
          {draft && (
            <form className="admin-config-form" onSubmit={saveItem}>
              <h3>{items.some((item) => item.id === draft.id) ? 'Edit menu item' : 'New menu item'}</h3>
              {formError && <p className="admin-form-error" role="alert">{formError}</p>}
              <div className="admin-config-form-grid">
                <label className="admin-field"><span>{tI18n("Identifier", { defaultValue: "Identifier" })}</span><input required maxLength={64} value={draft.id} onChange={(event) => setDraft((current) => ({ ...current, id: event.target.value }))} /></label>
                <label className="admin-field"><span>{tI18n("Parent menu item", { defaultValue: "Parent menu item" })}</span>
                  <select value={draft.parentId ?? ''} onChange={(event) => setDraft((current) => ({ ...current, parentId: event.target.value || null }))}>
                    <option value="">{tI18n("Top level", { defaultValue: "Top level" })}</option>
                    {parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.labelEn}</option>)}
                  </select>
                </label>
                <label className="admin-field"><span>{tI18n("English label", { defaultValue: "English label" })}</span><input required maxLength={100} value={draft.labelEn} onChange={(event) => setDraft((current) => ({ ...current, labelEn: event.target.value }))} /></label>
                <label className="admin-field"><span>{tI18n("Tamil label", { defaultValue: "Tamil label" })}</span><input required maxLength={100} value={draft.labelTa} onChange={(event) => setDraft((current) => ({ ...current, labelTa: event.target.value }))} /></label>
                <label className="admin-field"><span>{tI18n("Destination type", { defaultValue: "Destination type" })}</span>
                  <select value={draft.destinationType} onChange={(event) => setDraft((current) => ({ ...current, destinationType: event.target.value, openInNewTab: event.target.value === 'external' ? current.openInNewTab : false }))}>
                    <option value="internal">{tI18n("Public site page", { defaultValue: "Public site page" })}</option><option value="external">{tI18n("Secure external URL", { defaultValue: "Secure external URL" })}</option>
                  </select>
                </label>
                <label className="admin-field"><span>{draft.destinationType === 'external' ? 'HTTPS URL' : 'Internal site path'}</span><input required maxLength={2048} value={draft.destination} placeholder={draft.destinationType === 'external' ? 'https://example.org' : '/news/'} onChange={(event) => setDraft((current) => ({ ...current, destination: event.target.value }))} /></label>
                <label className="admin-field"><span>{tI18n("Display order", { defaultValue: "Display order" })}</span><input type="number" min="0" max="10000" value={draft.displayOrder} onChange={(event) => setDraft((current) => ({ ...current, displayOrder: Number(event.target.value) }))} /></label>
              </div>
              <div className="admin-config-checkboxes">
                <label><input type="checkbox" checked={draft.isVisible} onChange={(event) => setDraft((current) => ({ ...current, isVisible: event.target.checked }))} /> {tI18n("Visible on public site", { defaultValue: "Visible on public site" })}</label>
                <label><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))} /> {tI18n("Active", { defaultValue: "Active" })}</label>
                <label><input type="checkbox" checked={draft.openInNewTab} disabled={draft.destinationType !== 'external'} onChange={(event) => setDraft((current) => ({ ...current, openInNewTab: event.target.checked }))} /> {tI18n("Open external link in a new tab", { defaultValue: "Open external link in a new tab" })}</label>
              </div>
              <div className="admin-website-config-actions">
                <button className="admin-button admin-button--primary" type="submit">{tI18n("Apply to draft", { defaultValue: "Apply to draft" })}</button>
                <button className="admin-button admin-button--secondary" type="button" onClick={() => { setDraft(null); setFormError(''); }}>{tI18n("Cancel", { defaultValue: "Cancel" })}</button>
              </div>
            </form>
          )}
        </section>

        <aside className="admin-website-config-card admin-config-preview" aria-label={tI18n("Public navigation preview", { defaultValue: "Public navigation preview" })}>
          <span className="admin-eyebrow">{tI18n("Unsaved preview", { defaultValue: "Unsaved preview" })}</span>
          <h2>{tI18n("Public navigation", { defaultValue: "Public navigation" })}</h2>
          <p>{tI18n("Preview follows English/Tamil labels on the live site.", { defaultValue: "Preview follows English/Tamil labels on the live site." })}</p>
          <ol>{visiblePreview(previewTree)}</ol>
        </aside>
      </div>
      <SaveActions
        busy={state.busy}
        canSaveDraft={editItems !== null && !draft
          && !configurationsMatch(editItems, state.configuration)}
        canPublish={state.hasDraft && !draft && !formError
          && !configurationsMatch(state.configuration, state.publishedConfiguration)}
        onSaveDraft={async () => {
          if (draft) {
            setFormError('Apply or cancel the open menu item before saving the menu.');
            return;
          }
          if (await state.save(items, 'Menu draft saved.')) setEditItems(null);
        }}
        onPublish={() => state.publish('Public navigation published successfully.')}
        onCancel={() => { setEditItems(null); setDraft(null); setFormError(''); state.setError(''); state.setNotice('Unsaved menu changes discarded.'); }}
      />
    </ConfigurationPage>
  );
}

function Field({ label, value, onChange, type = 'text', maxLength, ...attributes }) {
  const { t: tI18n } = useTranslation('admin');
  return (
    <label className="admin-field">
      <span>{label}</span>
      <input
        type={type}
        value={value ?? ''}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        {...attributes}
      />
    </label>
  );
}

function MediaUrlField({ label, value, onChange }) {
  const { t: tI18n } = useTranslation('admin');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const asset = await uploadMediaImage(file);
      onChange(asset.secure_url);
    } catch (failure) {
      setUploadError(failure.message);
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="admin-config-media-field">
      <Field label={label} value={value} onChange={onChange} type="url" maxLength={2048} />
      <button type="button" className="admin-button admin-button--secondary" onClick={() => setPickerOpen(true)}>{tI18n("Choose from Media Library", { defaultValue: "Choose from Media Library" })} </button>
      <label className="admin-button admin-button--secondary admin-config-upload">
        {uploading ? 'Uploading…' : 'Upload image'}
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={upload} />
      </label>
      {uploadError && <p className="admin-alert admin-alert--error" role="alert">{uploadError}</p>}
      {value && <img className="admin-config-image-preview" src={value} alt="" />}
      {pickerOpen && <MediaLibraryPicker onClose={() => setPickerOpen(false)} onSelect={(asset) => {
        onChange(asset.secure_url);
        setPickerOpen(false);
      }} />}
    </div>
  );
}

function newFooterLink(order) {
  return {
    id: generatedId('link'),
    labelEn: '',
    labelTa: '',
    url: '/news/',
    displayOrder: order,
    isVisible: true,
    openInNewTab: false
  };
}

function newSocialLink(order) {
  return {
    id: generatedId('social'),
    label: '',
    url: 'https://',
    displayOrder: order,
    isVisible: true
  };
}

export function AdminFooterManagementPage() {
  const { t: tI18n } = useTranslation('admin');
  const state = useConfiguration('footer');
  const [draft, setDraft] = useState(null);
  if (state.loading) return <AdminLoading label="Loading footer configuration…" />;
  if (!state.configuration) {
    return <ConfigurationPage eyebrow="Website configuration" title={tI18n("Footer Editor", { defaultValue: "Footer Editor" })} description="Configure the footer displayed on the public website."><Feedback error={state.error || 'Footer configuration could not be loaded.'} /><button type="button" className="admin-button admin-button--secondary" onClick={state.retry}>{tI18n("Retry loading", { defaultValue: "Retry loading" })}</button></ConfigurationPage>;
  }

  const footer = draft ?? state.configuration;
  const update = (changes) => setDraft((current) => ({ ...(current ?? state.configuration), ...changes }));
  const updateGroup = (groupId, changes) => update({
    groups: footer.groups.map((group) => group.id === groupId ? { ...group, ...changes } : group)
  });
  const updateLink = (groupId, linkId, changes) => update({
    groups: footer.groups.map((group) => group.id === groupId
      ? { ...group, links: group.links.map((link) => link.id === linkId ? { ...link, ...changes } : link) }
      : group)
  });
  const addGroup = () => update({
    groups: [...footer.groups, {
      id: generatedId('group'),
      headingEn: 'New link group',
      headingTa: 'புதிய இணைப்புக் குழு',
      displayOrder: footer.groups.length * 10 + 10,
      isVisible: true,
      links: []
    }]
  });

  return (
    <ConfigurationPage eyebrow="Website configuration" title={tI18n("Footer Editor", { defaultValue: "Footer Editor" })} description="Edit the content and links shown in the live public website footer.">
      <Feedback error={state.error} notice={state.notice} />
      <div className="admin-website-config-grid admin-footer-config-grid">
        <section className="admin-website-config-card">
          <div className="admin-website-config-card-heading">
            <div><span className="admin-eyebrow">{tI18n("Public footer", { defaultValue: "Public footer" })}</span><h2>{tI18n("Brand and contact", { defaultValue: "Brand and contact" })}</h2></div>
          </div>
          <div className="admin-config-form">
            <label className="admin-config-checkbox"><input type="checkbox" checked={footer.isVisible} onChange={(event) => update({ isVisible: event.target.checked })} /> {tI18n("Show the footer on the public website", { defaultValue: "Show the footer on the public website" })}</label>
            <div className="admin-config-form-grid">
              <MediaUrlField label="Footer logo" value={footer.logoUrl} onChange={(logoUrl) => update({ logoUrl })} />
              <Field label="Project name" value={footer.websiteName} maxLength={100} onChange={(websiteName) => update({ websiteName })} />
              <Field label="Description (English)" value={footer.descriptionEn} maxLength={500} onChange={(descriptionEn) => update({ descriptionEn })} />
              <Field label="Description (Tamil)" value={footer.descriptionTa} maxLength={500} onChange={(descriptionTa) => update({ descriptionTa })} />
              <Field label="Contact email" value={footer.email} type="email" maxLength={254} onChange={(email) => update({ email })} />
              <Field label="Contact phone" value={footer.phone} maxLength={40} onChange={(phone) => update({ phone })} />
              <Field label="Address (English)" value={footer.addressEn} maxLength={500} onChange={(addressEn) => update({ addressEn })} />
              <Field label="Address (Tamil)" value={footer.addressTa} maxLength={500} onChange={(addressTa) => update({ addressTa })} />
              <Field label="Copyright text (English)" value={footer.copyrightEn} maxLength={200} onChange={(copyrightEn) => update({ copyrightEn })} />
              <Field label="Copyright text (Tamil)" value={footer.copyrightTa} maxLength={200} onChange={(copyrightTa) => update({ copyrightTa })} />
            </div>
            <label className="admin-config-checkbox"><input type="checkbox" checked={footer.dynamicYear} onChange={(event) => update({ dynamicYear: event.target.checked })} /> {tI18n("Show the current year automatically", { defaultValue: "Show the current year automatically" })}</label>
          </div>

          <div className="admin-config-groups">
            <div className="admin-website-config-card-heading">
              <div><span className="admin-eyebrow">{tI18n("Social media", { defaultValue: "Social media" })}</span><h2>{tI18n("Social links", { defaultValue: "Social links" })}</h2></div>
              <button type="button" className="admin-button admin-button--secondary" onClick={() => update({ socialLinks: [...footer.socialLinks, newSocialLink(footer.socialLinks.length * 10 + 10)] })}>{tI18n("Add social link", { defaultValue: "Add social link" })}</button>
            </div>
            {footer.socialLinks.map((link, index) => (
              <div className="admin-config-link-row" key={link.id}>
                <div className="admin-config-form-grid">
                  <Field label="Platform / label" value={link.label} maxLength={50} onChange={(label) => update({ socialLinks: footer.socialLinks.map((item) => item.id === link.id ? { ...item, label } : item) })} />
                  <Field label="Secure URL (HTTPS)" value={link.url} type="url" maxLength={2048} onChange={(url) => update({ socialLinks: footer.socialLinks.map((item) => item.id === link.id ? { ...item, url } : item) })} />
                  <label className="admin-config-checkbox"><input type="checkbox" checked={link.isVisible} onChange={(event) => update({ socialLinks: footer.socialLinks.map((item) => item.id === link.id ? { ...item, isVisible: event.target.checked } : item) })} /> {tI18n("Visible", { defaultValue: "Visible" })}</label>
                </div>
                <div className="admin-config-inline-actions">
                  <button type="button" className="admin-button admin-button--secondary" disabled={!index} aria-label={`Move ${link.label || 'social link'} up`} onClick={() => {
                    const socialLinks = [...footer.socialLinks];
                    [socialLinks[index - 1], socialLinks[index]] = [socialLinks[index], socialLinks[index - 1]];
                    update({ socialLinks: socialLinks.map((item, position) => ({ ...item, displayOrder: (position + 1) * 10 })) });
                  }}>{tI18n("↑", { defaultValue: "↑" })}</button>
                  <button type="button" className="admin-button admin-button--secondary" disabled={index === footer.socialLinks.length - 1} aria-label={`Move ${link.label || 'social link'} down`} onClick={() => {
                    const socialLinks = [...footer.socialLinks];
                    [socialLinks[index + 1], socialLinks[index]] = [socialLinks[index], socialLinks[index + 1]];
                    update({ socialLinks: socialLinks.map((item, position) => ({ ...item, displayOrder: (position + 1) * 10 })) });
                  }}>{tI18n("↓", { defaultValue: "↓" })}</button>
                  <button type="button" className="admin-button admin-button--danger" onClick={() => update({ socialLinks: footer.socialLinks.filter((item) => item.id !== link.id) })}>{tI18n("Remove link", { defaultValue: "Remove link" })}</button>
                </div>
              </div>
            ))}
          </div>

          <div className="admin-config-groups">
            <div className="admin-website-config-card-heading">
              <div><span className="admin-eyebrow">{tI18n("Navigation links", { defaultValue: "Navigation links" })}</span><h2>{tI18n("Footer link groups", { defaultValue: "Footer link groups" })}</h2></div>
              <button type="button" className="admin-button admin-button--secondary" onClick={addGroup}>{tI18n("Add link group", { defaultValue: "Add link group" })}</button>
            </div>
            {footer.groups.map((group, groupIndex) => (
              <section className="admin-config-group" key={group.id}>
                <div className="admin-config-group-heading">
                  <strong>{group.headingEn || 'Untitled group'}</strong>
                  <div className="admin-config-inline-actions">
                    <button type="button" className="admin-button admin-button--secondary" aria-label={`Move ${group.headingEn} up`} disabled={groupIndex === 0} onClick={() => {
                      const groups = [...footer.groups];
                      [groups[groupIndex - 1], groups[groupIndex]] = [groups[groupIndex], groups[groupIndex - 1]];
                      update({ groups: groups.map((item, index) => ({ ...item, displayOrder: (index + 1) * 10 })) });
                    }}>{tI18n("↑", { defaultValue: "↑" })}</button>
                    <button type="button" className="admin-button admin-button--secondary" aria-label={`Move ${group.headingEn} down`} disabled={groupIndex === footer.groups.length - 1} onClick={() => {
                      const groups = [...footer.groups];
                      [groups[groupIndex + 1], groups[groupIndex]] = [groups[groupIndex], groups[groupIndex + 1]];
                      update({ groups: groups.map((item, index) => ({ ...item, displayOrder: (index + 1) * 10 })) });
                    }}>{tI18n("↓", { defaultValue: "↓" })}</button>
                    <button type="button" className="admin-button admin-button--danger" onClick={() => {
                      if (window.confirm(`Remove the "${group.headingEn}" link group?`)) {
                        update({ groups: footer.groups.filter((item) => item.id !== group.id) });
                      }
                    }}>{tI18n("Remove group", { defaultValue: "Remove group" })}</button>
                  </div>
                </div>
                <div className="admin-config-form-grid">
                  <Field label="Group heading (English)" value={group.headingEn} maxLength={100} onChange={(headingEn) => updateGroup(group.id, { headingEn })} />
                  <Field label="Group heading (Tamil)" value={group.headingTa} maxLength={100} onChange={(headingTa) => updateGroup(group.id, { headingTa })} />
                </div>
                <label className="admin-config-checkbox"><input type="checkbox" checked={group.isVisible} onChange={(event) => updateGroup(group.id, { isVisible: event.target.checked })} /> {tI18n("Show this group on the public site", { defaultValue: "Show this group on the public site" })}</label>
                <div className="admin-config-footer-links">
                  {group.links.map((link, linkIndex) => (
                    <div className="admin-config-link-row" key={link.id}>
                      <div className="admin-config-form-grid">
                        <Field label="English label" value={link.labelEn} maxLength={100} onChange={(labelEn) => updateLink(group.id, link.id, { labelEn })} />
                        <Field label="Tamil label" value={link.labelTa} maxLength={100} onChange={(labelTa) => updateLink(group.id, link.id, { labelTa })} />
                        <Field label="Destination URL" value={link.url} maxLength={2048} onChange={(url) => updateLink(group.id, link.id, { url })} />
                        <label className="admin-config-checkbox"><input type="checkbox" checked={link.isVisible} onChange={(event) => updateLink(group.id, link.id, { isVisible: event.target.checked })} /> {tI18n("Visible", { defaultValue: "Visible" })}</label>
                        <label className="admin-config-checkbox"><input type="checkbox" checked={link.openInNewTab} disabled={link.url.startsWith('/')} onChange={(event) => updateLink(group.id, link.id, { openInNewTab: event.target.checked })} /> {tI18n("Open in new tab", { defaultValue: "Open in new tab" })}</label>
                      </div>
                      <div className="admin-config-inline-actions">
                        <button type="button" className="admin-button admin-button--secondary" aria-label={`Move ${link.labelEn || 'link'} up`} disabled={linkIndex === 0} onClick={() => {
                          const links = [...group.links];
                          [links[linkIndex - 1], links[linkIndex]] = [links[linkIndex], links[linkIndex - 1]];
                          updateGroup(group.id, { links: links.map((item, index) => ({ ...item, displayOrder: (index + 1) * 10 })) });
                        }}>{tI18n("↑", { defaultValue: "↑" })}</button>
                        <button type="button" className="admin-button admin-button--secondary" aria-label={`Move ${link.labelEn || 'link'} down`} disabled={linkIndex === group.links.length - 1} onClick={() => {
                          const links = [...group.links];
                          [links[linkIndex + 1], links[linkIndex]] = [links[linkIndex], links[linkIndex + 1]];
                          updateGroup(group.id, { links: links.map((item, index) => ({ ...item, displayOrder: (index + 1) * 10 })) });
                        }}>{tI18n("↓", { defaultValue: "↓" })}</button>
                        <button type="button" className="admin-button admin-button--danger" onClick={() => updateGroup(group.id, { links: group.links.filter((item) => item.id !== link.id) })}>{tI18n("Remove link", { defaultValue: "Remove link" })}</button>
                      </div>
                    </div>
                  ))}
                </div>
                <button type="button" className="admin-button admin-button--secondary" onClick={() => updateGroup(group.id, { links: [...group.links, newFooterLink(group.links.length * 10 + 10)] })}>{tI18n("Add footer link", { defaultValue: "Add footer link" })}</button>
              </section>
            ))}
          </div>
        </section>

        <aside className="admin-website-config-card admin-config-preview" aria-label={tI18n("Public footer preview", { defaultValue: "Public footer preview" })}>
          <span className="admin-eyebrow">{tI18n("Unsaved preview", { defaultValue: "Unsaved preview" })}</span>
          <h2>{tI18n("Live public footer", { defaultValue: "Live public footer" })}</h2>
          <div className="admin-config-public-footer-preview">
            {footer.logoUrl && <img src={footer.logoUrl} alt="" />}
            <strong>{footer.websiteName}</strong>
            <p>{footer.descriptionEn}</p>
            {footer.email && <a href={`mailto:${footer.email}`}>{footer.email}</a>}
            {footer.socialLinks.filter((link) => link.isVisible).map((link) => <a href={link.url} key={link.id}>{link.label}</a>)}
            {footer.groups.filter((group) => group.isVisible && group.links.some((link) => link.isVisible)).map((group) => (
              <div key={group.id}>
                <h3>{group.headingEn}</h3>
                {group.links.filter((link) => link.isVisible).map((link) => <span key={link.id}>{link.labelEn}</span>)}
              </div>
            ))}
            <small>{tI18n("©", { defaultValue: "©" })} {footer.dynamicYear ? new Date().getFullYear() : ''} {footer.copyrightEn}</small>
          </div>
        </aside>
      </div>
      <SaveActions
        busy={state.busy}
        hasDraft={state.hasDraft}
        canSaveDraft={draft !== null && !configurationsMatch(footer, state.configuration)}
        canPublish={state.hasDraft
          && !draft
          && !configurationsMatch(state.configuration, state.publishedConfiguration)}
        onSaveDraft={async () => {
          if (await state.save(footer, 'Footer draft saved.')) setDraft(null);
        }}
        onPublish={() => state.publish('Public footer published successfully.')}
        onCancel={() => { setDraft(null); state.setError(''); state.setNotice('Unsaved footer changes discarded.'); }}
      />
    </ConfigurationPage>
  );
}

const COLOR_FIELDS = [
  ['primaryColor', 'Primary colour'],
  ['secondaryColor', 'Secondary colour'],
  ['accentColor', 'Accent colour'],
  ['backgroundColor', 'Background colour'],
  ['textColor', 'Text colour']
];

export function AdminBrandingPage() {
  const { t: tI18n } = useTranslation('admin');
  const state = useConfiguration('branding');
  const [draft, setDraft] = useState(null);
  if (state.loading) return <AdminLoading label="Loading public branding…" />;
  if (!state.configuration) {
    return <ConfigurationPage eyebrow="Website configuration" title={tI18n("Branding & Theme Editor", { defaultValue: "Branding & Theme Editor" })} description="Changes here affect the public website only."><Feedback error={state.error || 'Branding configuration could not be loaded.'} /><button type="button" className="admin-button admin-button--secondary" onClick={state.retry}>{tI18n("Retry loading", { defaultValue: "Retry loading" })}</button></ConfigurationPage>;
  }
  const branding = draft ?? state.configuration;
  const update = (changes) => setDraft((current) => ({ ...(current ?? state.configuration), ...changes }));
  const previewStyle = {
    '--preview-primary': branding.primaryColor,
    '--preview-secondary': branding.secondaryColor,
    '--preview-accent': branding.accentColor,
    '--preview-background': branding.backgroundColor,
    '--preview-text': branding.textColor,
    '--preview-font': branding.fontFamily
  };

  return (
    <ConfigurationPage
      eyebrow="Website configuration"
      title={tI18n("Branding & Theme Editor", { defaultValue: "Branding & Theme Editor" })}
      description="Preview and publish the public site's identity and colours. The admin dashboard theme is not affected."
    >
      <Feedback error={state.error} notice={state.notice} />
      <div className="admin-website-config-grid">
        <section className="admin-website-config-card">
          <div className="admin-website-config-card-heading">
            <div><span className="admin-eyebrow">{tI18n("Public identity", { defaultValue: "Public identity" })}</span><h2>{tI18n("Brand assets", { defaultValue: "Brand assets" })}</h2></div>
          </div>
          <div className="admin-config-form">
            <div className="admin-config-form-grid">
              <MediaUrlField label="Main website logo" value={branding.logoUrl} onChange={(logoUrl) => update({ logoUrl })} />
              <MediaUrlField label="Footer logo (optional)" value={branding.footerLogoUrl} onChange={(footerLogoUrl) => update({ footerLogoUrl })} />
              <MediaUrlField label="Favicon" value={branding.faviconUrl} onChange={(faviconUrl) => update({ faviconUrl })} />
              <Field label="Website name" value={branding.websiteName} maxLength={100} onChange={(websiteName) => update({ websiteName })} />
              <Field label="Optional tagline" value={branding.tagline} maxLength={180} onChange={(tagline) => update({ tagline })} />
            </div>
          </div>
          <div className="admin-website-config-card-heading admin-config-theme-heading">
            <div><span className="admin-eyebrow">{tI18n("Public theme", { defaultValue: "Public theme" })}</span><h2>{tI18n("Theme palette & typography", { defaultValue: "Theme palette & typography" })}</h2></div>
          </div>
          <div className="admin-config-color-list">
            {COLOR_FIELDS.map(([key, label]) => (
              <div className="admin-config-color-row" key={key}>
                <label htmlFor={`branding-${key}`}>{label}</label>
                <input
                  type="color"
                  aria-label={`${label} picker`}
                  value={/^#[0-9a-f]{6}$/i.test(branding[key]) ? branding[key] : '#000000'}
                  onChange={(event) => update({ [key]: event.target.value })}
                />
                <input
                  id={`branding-${key}`}
                  type="text"
                  value={branding[key]}
                  maxLength={7}
                  aria-label={`${label} hex value`}
                  onChange={(event) => update({ [key]: event.target.value })}
                />
              </div>
            ))}
            <label className="admin-field">
              <span>{tI18n("Website typography", { defaultValue: "Website typography" })}</span>
              <select value={branding.fontFamily} onChange={(event) => update({ fontFamily: event.target.value })}>
                <option value="Inter">{tI18n("Inter (original)", { defaultValue: "Inter (original)" })}</option>
                <option value="Georgia">{tI18n("Georgia", { defaultValue: "Georgia" })}</option>
                <option value="Arial">{tI18n("Arial", { defaultValue: "Arial" })}</option>
                <option value="Trebuchet MS">{tI18n("Trebuchet MS", { defaultValue: "Trebuchet MS" })}</option>
              </select>
            </label>
            <p className="admin-profile-password-hint">{tI18n("Use six-digit HEX colours. Text and background contrast is validated before saving.", { defaultValue: "Use six-digit HEX colours. Text and background contrast is validated before saving." })}</p>
          </div>
        </section>

        <aside className="admin-website-config-card admin-config-preview" aria-label={tI18n("Public theme preview", { defaultValue: "Public theme preview" })}>
          <span className="admin-eyebrow">{tI18n("Unsaved preview", { defaultValue: "Unsaved preview" })}</span>
          <h2>{tI18n("Public website", { defaultValue: "Public website" })}</h2>
          <p>{tI18n("This preview uses the current draft. The live public site changes only after publishing.", { defaultValue: "This preview uses the current draft. The live public site changes only after publishing." })}</p>
          <div className="admin-branding-site-preview" style={previewStyle}>
            <header>
              {branding.logoUrl && <img src={branding.logoUrl} alt="" />}
              <strong>{branding.websiteName}</strong>
              {branding.tagline && <small>{branding.tagline}</small>}
            </header>
            <nav aria-label={tI18n("Preview navigation", { defaultValue: "Preview navigation" })}><span>{tI18n("Home", { defaultValue: "Home" })}</span><span>{tI18n("Latest news", { defaultValue: "Latest news" })}</span><span>{tI18n("Stories", { defaultValue: "Stories" })}</span></nav>
            <article>
              <small>{tI18n("FEATURED STORY", { defaultValue: "FEATURED STORY" })}</small>
              <h3>{tI18n("A closer look at what’s next", { defaultValue: "A closer look at what’s next" })}</h3>
              <p>{tI18n("Representative public content with the current draft theme.", { defaultValue: "Representative public content with the current draft theme." })}</p>
              <button type="button">{tI18n("Read the story", { defaultValue: "Read the story" })}</button>
              <a href="#branding-preview">{tI18n("Explore latest news", { defaultValue: "Explore latest news" })}</a>
            </article>
            <footer>
              {branding.footerLogoUrl
                ? <img src={branding.footerLogoUrl} alt="" />
                : <strong>{branding.websiteName}</strong>}
              <span>{tI18n("Public website footer", { defaultValue: "Public website footer" })}</span>
            </footer>
          </div>
        </aside>
      </div>
      <SaveActions
        busy={state.busy}
        hasDraft={state.hasDraft}
        canSaveDraft={draft !== null && !configurationsMatch(branding, state.configuration)}
        canPublish={state.hasDraft
          && !draft
          && !configurationsMatch(state.configuration, state.publishedConfiguration)}
        onSaveDraft={async () => {
          if (await state.save(branding, 'Branding draft saved.')) setDraft(null);
        }}
        onPublish={() => state.publish('Public website branding published successfully.')}
        onCancel={() => { setDraft(null); state.setError(''); state.setNotice('Unsaved branding changes discarded.'); }}
      />
    </ConfigurationPage>
  );
}
