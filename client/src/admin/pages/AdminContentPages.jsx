import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import {
  createAdminHeroSlide,
  createAdminVideo,
  createAdminWebStory,
  deleteAdminHeroSlide,
  deleteAdminVideo,
  deleteAdminWebStory,
  getAdminHeroSlides,
  getAdminMediaAssets,
  getAdminVideos,
  getAdminWebStories,
  getAdminWebStory,
  updateAdminHeroSlide,
  updateAdminVideo,
  updateAdminWebStory
} from '../../api/admin.js';
import { uploadMediaImage } from '../../api/client.js';
import { useAdminPermissions } from '../AdminPermissionContext.jsx';
import { AdminEmpty, AdminError, AdminLoading, ConfirmDialog } from '../components/AdminStates.jsx';
import MediaLibraryPicker from '../components/MediaLibraryPicker.jsx';
import { getYouTubeEmbedUrl, getYouTubeThumbnailUrl, getYouTubeVideoId } from '../../utils/youtube.js';

const EMPTY_PAGE = { page: 1, total: 0, totalPages: 0 };

function usePagedList(fetchList, { q, status, format, provider, category, featured, reload }) {
  const [result, setResult] = useState({ data: [], pagination: EMPTY_PAGE, summary: { total: 0, published: 0, drafts: 0, featured: 0 } });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchList({ page, limit: 12, q: q.trim(), status, format, provider, category, featured, signal: controller.signal })
      .then(setResult)
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [fetchList, page, q, status, format, provider, category, featured, reload]);
  return { result, page, setPage, loading, error, setError, setResult };
}

function PageHeader({ eyebrow, title, description, action }) {
  const { t: tI18n } = useTranslation('admin');
  return (
    <header className="admin-page-heading content-page-heading">
      <div><span className="admin-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
      {action}
    </header>
  );
}

function SearchAndFilters({ query, setQuery, status, setStatus, children }) {
  const { t: tI18n } = useTranslation('admin');
  return (
    <div className="content-toolbar">
      <label className="admin-field content-search"><span>{tI18n("Search", { defaultValue: "Search" })}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tI18n("Search titles or details", { defaultValue: "Search titles or details" })} /></label>
      {setStatus && (
        <label className="admin-field"><span>{tI18n("Status", { defaultValue: "Status" })}</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">{tI18n("All statuses", { defaultValue: "All statuses" })}</option><option value="draft">{tI18n("Draft", { defaultValue: "Draft" })}</option><option value="published">{tI18n("Published", { defaultValue: "Published" })}</option>
          </select>
        </label>
      )}
      {children}
    </div>
  );
}

function Pager({ pagination, page, setPage }) {
  const { t: tI18n } = useTranslation('admin');
  if (!pagination?.totalPages || pagination.totalPages < 2) return null;
  return (
    <nav className="content-pager" aria-label={tI18n("Pagination", { defaultValue: "Pagination" })}>
      <button type="button" className="admin-button admin-button--secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{tI18n("Previous", { defaultValue: "Previous" })}</button>
      <span>{tI18n("Page", { defaultValue: "Page" })} {page} {tI18n("of", { defaultValue: "of" })} {pagination.totalPages} {tI18n("·", { defaultValue: "·" })} {pagination.total} {tI18n("items", { defaultValue: "items" })}</span>
      <button type="button" className="admin-button admin-button--secondary" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>{tI18n("Next", { defaultValue: "Next" })}</button>
    </nav>
  );
}

function StatusBadge({ status }) {
  const { t: tI18n } = useTranslation('admin');
  return <span className={`content-status content-status--${status}`}>{status}</span>;
}

function AdminVideoPreview({ video }) {
  const { t: tI18n } = useTranslation('admin');
  const [loaded, setLoaded] = useState(false);
  if (!loaded) {
    return <button type="button" className="admin-video-poster" onClick={() => setLoaded(true)} aria-label={`Load preview for ${video.title}`}>
      {video.thumbnail_url ? <img src={video.thumbnail_url} alt={video.thumbnail_alt || ''} loading="lazy" /> : <span>{tI18n("Load video preview", { defaultValue: "Load video preview" })}</span>}
      {video.embed_url && <span aria-hidden="true">{tI18n("▶", { defaultValue: "▶" })}</span>}
    </button>;
  }
  if (!video.embed_url) return <p className="admin-alert">{tI18n("This older video source is no longer supported. Replace it with a YouTube URL.", { defaultValue: "This older video source is no longer supported. Replace it with a YouTube URL." })}</p>;
  return <iframe title={`Preview: ${video.title}`} src={video.embed_url} loading="lazy" sandbox="allow-scripts allow-same-origin allow-presentation" allow="encrypted-media; picture-in-picture" allowFullScreen />;
}

function ImagePickerField({ label, value, onChange, altLabel, altValue, onAltChange, required = false, altRequired = true }) {
  const { t: tI18n } = useTranslation('admin');
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div className="content-image-field">
      <label className="admin-field"><span>{label}</span><input type="url" required={required} value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder={tI18n("https://…", { defaultValue: "https://…" })} /></label>
      <button type="button" className="admin-button admin-button--secondary" onClick={() => setPickerOpen(true)}>{tI18n("Choose from Media Library", { defaultValue: "Choose from Media Library" })}</button>
      {value && <img className="content-image-preview" src={value} alt="" />}
      {altLabel && <label className="admin-field"><span>{altLabel}</span><input maxLength={255} required={altRequired} value={altValue ?? ''} onChange={(event) => onAltChange(event.target.value)} /></label>}
      {pickerOpen && <MediaLibraryPicker onClose={() => setPickerOpen(false)} onSelect={(asset) => {
        onChange(asset.secure_url);
        setPickerOpen(false);
      }} />}
    </div>
  );
}

function ConfirmAction({ confirmation, busy, onCancel, onConfirm }) {
  const { t: tI18n } = useTranslation('admin');
  if (!confirmation) return null;
  return <ConfirmDialog
    title={confirmation.title}
    message={confirmation.message}
    confirmLabel={confirmation.confirmLabel}
    busy={busy}
    onCancel={onCancel}
    onConfirm={onConfirm}
  />;
}

export function AdminMediaLibraryPage() {
  const { t: tI18n } = useTranslation('admin');
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState('');
  const [view, setView] = useState('grid');
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(null);
  const [uploading, setUploading] = useState(false);
  const { hasPermission } = useAdminPermissions();
  const fetchList = useCallback((options) => getAdminMediaAssets(options), []);
  const { result, page, setPage, loading, error, setError } = usePagedList(fetchList, { q: query, format, reload });

  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setNotice("");
    setError("");
    setUploading(true);
    try {
      await uploadMediaImage(file);
      setNotice(tI18n("Image uploaded and added to the Media Library.", { defaultValue: "Image uploaded and added to the Media Library." }));
      setReload((value) => value + 1);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setUploading(false);
    }
  }

  async function copyUrl(asset) {
    try {
      await navigator.clipboard.writeText(asset.secure_url);
      setNotice(tI18n("Secure image URL copied.", { defaultValue: "Secure image URL copied." }));
    } catch {
      setError(tI18n("The URL could not be copied. Select and copy it from the asset details.", { defaultValue: "The URL could not be copied. Select and copy it from the asset details." }));
      setSelected(asset);
    }
  }

  return (
    <section className="admin-content-management">
      <PageHeader eyebrow="Content & media" title={tI18n("Media Library", { defaultValue: "Media Library" })} description="Browse and reuse image assets uploaded to the StartupTN News Cloudinary account."
        action={hasPermission('media-library', 'create') && <label className="admin-button admin-button--primary content-upload-button">
          {uploading ? 'Uploading…' : 'Upload image'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={upload} />
        </label>} />
      {notice && <p className="admin-alert admin-alert--success" role="status">{notice}</p>}
      {error && <AdminError message={error} />}
      <SearchAndFilters query={query} setQuery={(value) => { setQuery(value); setPage(1); }}>
        <label className="admin-field"><span>{tI18n("Format", { defaultValue: "Format" })}</span><select value={format} onChange={(event) => { setFormat(event.target.value); setPage(1); }}>
          <option value="">{tI18n("All formats", { defaultValue: "All formats" })}</option><option value="jpg">{tI18n("JPEG", { defaultValue: "JPEG" })}</option><option value="jpeg">{tI18n("JPEG", { defaultValue: "JPEG" })}</option><option value="png">{tI18n("PNG", { defaultValue: "PNG" })}</option><option value="webp">{tI18n("WebP", { defaultValue: "WebP" })}</option>
        </select></label>
        <div className="content-view-switch" aria-label={tI18n("Media view", { defaultValue: "Media view" })}>
          <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>{tI18n("Grid", { defaultValue: "Grid" })}</button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>{tI18n("List", { defaultValue: "List" })}</button>
        </div>
      </SearchAndFilters>
      {loading && <AdminLoading label="Loading media assets…" />}
      {!loading && !error && !result.data.length && <AdminEmpty title={tI18n("No indexed images yet", { defaultValue: "No indexed images yet" })} message="Images uploaded through the existing admin uploader appear here. Historic Cloudinary uploads are not automatically backfilled." />}
      {!loading && result.data.length > 0 && (
        <div className={`media-library-grid${view === 'list' ? ' media-library-grid--list' : ''}`}>
          {result.data.map((asset) => (
            <article className="media-library-card" key={asset.id}>
              <button type="button" className="media-library-thumbnail" onClick={() => setSelected(asset)} aria-label={`Preview ${asset.original_filename || 'image'}`}>
                <img src={asset.secure_url} alt="" loading="lazy" />
              </button>
              <div className="media-library-meta">
                <strong>{asset.original_filename || asset.cloudinary_public_id}</strong>
                <span>{asset.format?.toUpperCase() || 'IMAGE'}{asset.width && asset.height ? ` · ${asset.width} × ${asset.height}` : ''}</span>
                <span>{asset.bytes ? `${(asset.bytes / 1024).toFixed(0)} KB · ` : ''}{new Date(asset.created_at).toLocaleDateString()}</span>
                <div className="content-actions">
                  <button type="button" className="admin-button admin-button--secondary" onClick={() => setSelected(asset)}>{tI18n("Details", { defaultValue: "Details" })}</button>
                  <button type="button" className="admin-button admin-button--secondary" onClick={() => copyUrl(asset)}>{tI18n("Copy URL", { defaultValue: "Copy URL" })}</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <Pager pagination={result.pagination} page={page} setPage={setPage} />
      {selected && (
        <div className="admin-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
          <section className="admin-dialog media-details-dialog" role="dialog" aria-modal="true" aria-labelledby="media-details-title">
            <span className="admin-eyebrow">{tI18n("Media asset", { defaultValue: "Media asset" })}</span><h2 id="media-details-title">{selected.original_filename || 'Image preview'}</h2>
            <img src={selected.secure_url} alt={selected.original_filename || ''} />
            <dl><dt>{tI18n("Type", { defaultValue: "Type" })}</dt><dd>{selected.resource_type} {tI18n("/", { defaultValue: "/" })} {selected.format || 'unknown'}</dd>
              <dt>{tI18n("Dimensions", { defaultValue: "Dimensions" })}</dt><dd>{selected.width && selected.height ? `${selected.width} × ${selected.height}px` : 'Not available'}</dd>
              <dt>{tI18n("Size", { defaultValue: "Size" })}</dt><dd>{selected.bytes ? `${(selected.bytes / 1024).toFixed(1)} KB` : 'Not available'}</dd>
              <dt>{tI18n("URL", { defaultValue: "URL" })}</dt><dd><input readOnly value={selected.secure_url} aria-label={tI18n("Secure asset URL", { defaultValue: "Secure asset URL" })} /></dd>
              <dt>{tI18n("Uploaded", { defaultValue: "Uploaded" })}</dt><dd>{new Date(selected.created_at).toLocaleString()}</dd></dl>
            <div className="admin-dialog-actions"><button type="button" className="admin-button admin-button--secondary" onClick={() => setSelected(null)}>{tI18n("Close", { defaultValue: "Close" })}</button><button type="button" className="admin-button admin-button--primary" onClick={() => copyUrl(selected)}>{tI18n("Copy URL", { defaultValue: "Copy URL" })}</button></div>
          </section>
        </div>
      )}
    </section>
  );
}

const emptyStory = () => ({ title: '', slug: '', description: '', status: 'draft', slides: [] });

export function AdminWebStoriesPage() {
  const { t: tI18n } = useTranslation('admin');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [reload, setReload] = useState(0);
  const [story, setStory] = useState(null);
  const [loadingStory, setLoadingStory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { hasPermission } = useAdminPermissions();
  const fetchList = useCallback((options) => getAdminWebStories(options), []);
  const list = usePagedList(fetchList, { q: query, status, reload });

  async function edit(id) {
    setLoadingStory(true); setError(""); setNotice("");
    try { setStory(await getAdminWebStory(id)); } catch (failure) { setError(failure.message); }
    finally { setLoadingStory(false); }
  }

  async function persist(publishConfirmed = false) {
    if (!story) return;
    const previousStatus = list.result.data.find((item) => item.id === story.id)?.status;
    if ((story.status === 'published' || previousStatus === 'published') && previousStatus !== story.status && !publishConfirmed) {
      const publishing = story.status === 'published';
      setConfirmation({ type: 'save', title: `${publishing ? 'Publish' : 'Unpublish'} this story?`, message: publishing ? 'The story and its slides will become publicly visible.' : 'The story will be removed from public view.', confirmLabel: publishing ? 'Publish' : 'Unpublish' });
      return;
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const { id, ...payload } = story;
      payload.description = payload.description || null;
      payload.slides = payload.slides.map((slide) => ({
        ...slide,
        caption: slide.caption || null,
        link_url: slide.link_url || null
      }));
      const saved = id ? await updateAdminWebStory(id, payload) : await createAdminWebStory(payload);
      setStory(saved); setNotice(`Story ${saved.status === 'published' ? 'published' : 'saved'} successfully.`);
      list.setPage((value) => value);
      setReload((value) => value + 1);
    } catch (failure) { setError(failure.message); }
    finally { setSaving(false); setConfirmation(null); }
  }

  async function deleteStory() {
    setSaving(true);
    try {
      await deleteAdminWebStory(confirmation.id);
      setStory(null); setConfirmation(null); setNotice(tI18n("Story deleted.", { defaultValue: "Story deleted." })); setReload((value) => value + 1);
    } catch (failure) { setError(failure.message); }
    finally { setSaving(false); }
  }

  function setSlide(index, changes) {
    setStory((current) => ({ ...current, slides: current.slides.map((slide, i) => i === index ? { ...slide, ...changes } : slide) }));
  }

  return (
    <section className="admin-content-management">
      <PageHeader eyebrow="Content & media" title={tI18n("Web Stories", { defaultValue: "Web Stories" })} description="Create visual stories with ordered slides, accessible image descriptions, and optional links."
        action={hasPermission('web-stories', 'create') && <button className="admin-button admin-button--primary" type="button" onClick={() => { setStory(emptyStory()); setError(""); setNotice(""); }}>{tI18n("New story", { defaultValue: "New story" })}</button>} />
      {notice && <p className="admin-alert admin-alert--success" role="status">{notice}</p>}
      {error && <AdminError message={error} />}
      <SearchAndFilters query={query} setQuery={(value) => { setQuery(value); list.setPage(1); }} status={status} setStatus={(value) => { setStatus(value); list.setPage(1); }} />
      {list.loading && <AdminLoading label="Loading web stories…" />}
      {list.error && <AdminError message={list.error} />}
      {!list.loading && !list.error && !list.result.data.length && <AdminEmpty title={tI18n("No web stories found", { defaultValue: "No web stories found" })} message="Create a story and add its slides to get started." />}
      {!list.loading && list.result.data.length > 0 && <div className="content-table-wrap"><table className="content-table">
        <thead><tr><th>{tI18n("Story", { defaultValue: "Story" })}</th><th>{tI18n("Slides", { defaultValue: "Slides" })}</th><th>{tI18n("Status", { defaultValue: "Status" })}</th><th>{tI18n("Updated", { defaultValue: "Updated" })}</th><th>{tI18n("Actions", { defaultValue: "Actions" })}</th></tr></thead>
        <tbody>{list.result.data.map((item) => <tr key={item.id}>
          <td><strong>{item.title}</strong><small>{tI18n("/", { defaultValue: "/" })}{item.slug}</small></td><td>{tI18n("Open to manage", { defaultValue: "Open to manage" })}</td><td><StatusBadge status={item.status} /></td>
          <td>{new Date(item.updated_at).toLocaleDateString()}</td><td><button type="button" className="admin-button admin-button--secondary" disabled={!hasPermission('web-stories', 'edit')} onClick={() => edit(item.id)}>{tI18n("Edit", { defaultValue: "Edit" })}</button>
            {hasPermission('web-stories', 'delete') && <button type="button" className="admin-button admin-button--danger" onClick={() => setConfirmation({ type: 'delete', id: item.id, title: 'Delete this story?', message: 'The story and its slides will be permanently removed.', confirmLabel: 'Delete' })}>{tI18n("Delete", { defaultValue: "Delete" })}</button>}</td>
        </tr>)}</tbody>
      </table></div>}
      <Pager pagination={list.result.pagination} page={list.page} setPage={list.setPage} />
      {loadingStory && <AdminLoading label="Loading story…" />}
      {story && <form className="content-editor-panel" onSubmit={(event) => { event.preventDefault(); persist(); }}>
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">{story.id ? 'Edit story' : 'New story'}</span><h2>{story.title || 'Story details'}</h2></div>
          <button type="button" className="admin-link-button" onClick={() => setStory(null)}>{tI18n("Close editor", { defaultValue: "Close editor" })}</button></div>
        <div className="content-form-grid">
          <label className="admin-field"><span>{tI18n("Title", { defaultValue: "Title" })}</span><input required maxLength={180} value={story.title} onChange={(e) => setStory({ ...story, title: e.target.value })} /></label>
          <label className="admin-field"><span>{tI18n("Slug", { defaultValue: "Slug" })}</span><input required maxLength={200} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={story.slug} onChange={(e) => setStory({ ...story, slug: e.target.value })} /></label>
          <label className="admin-field content-form-wide"><span>{tI18n("Description", { defaultValue: "Description" })}</span><textarea maxLength={500} value={story.description ?? ''} onChange={(e) => setStory({ ...story, description: e.target.value })} /></label>
          <label className="admin-field"><span>{tI18n("Publication", { defaultValue: "Publication" })}</span><select value={story.status} onChange={(e) => setStory({ ...story, status: e.target.value })}><option value="draft">{tI18n("Draft", { defaultValue: "Draft" })}</option><option value="published">{tI18n("Published", { defaultValue: "Published" })}</option></select></label>
        </div>
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">{tI18n("Story sequence", { defaultValue: "Story sequence" })}</span><h3>{tI18n("Slides (", { defaultValue: "Slides (" })}{story.slides.length}{tI18n(")", { defaultValue: ")" })}</h3></div>
          <button type="button" className="admin-button admin-button--secondary" onClick={() => setStory({ ...story, slides: [...story.slides, { image_url: '', alt_text: '', caption: '', link_url: '' }] })}>{tI18n("Add slide", { defaultValue: "Add slide" })}</button></div>
        <div className="story-slide-editor">
          {story.slides.map((slide, index) => <article className="story-slide-form" key={`${story.id ?? 'new'}-${index}`}>
            <header><strong>{tI18n("Slide", { defaultValue: "Slide" })} {index + 1}</strong><div className="content-actions">
              <button type="button" className="admin-button admin-button--secondary" disabled={!index} aria-label={`Move slide ${index + 1} up`} onClick={() => {
                const slides = [...story.slides]; [slides[index - 1], slides[index]] = [slides[index], slides[index - 1]]; setStory({ ...story, slides });
              }}>{tI18n("↑", { defaultValue: "↑" })}</button>
              <button type="button" className="admin-button admin-button--secondary" disabled={index === story.slides.length - 1} aria-label={`Move slide ${index + 1} down`} onClick={() => {
                const slides = [...story.slides]; [slides[index + 1], slides[index]] = [slides[index], slides[index + 1]]; setStory({ ...story, slides });
              }}>{tI18n("↓", { defaultValue: "↓" })}</button>
              <button type="button" className="admin-button admin-button--danger" onClick={() => setStory({ ...story, slides: story.slides.filter((_, i) => i !== index) })}>{tI18n("Remove", { defaultValue: "Remove" })}</button>
            </div></header>
            <ImagePickerField label="Image URL" required value={slide.image_url} onChange={(value) => setSlide(index, { image_url: value })} altLabel="Alternative text" altValue={slide.alt_text} onAltChange={(value) => setSlide(index, { alt_text: value })} />
            <label className="admin-field"><span>{tI18n("Caption", { defaultValue: "Caption" })}</span><textarea maxLength={500} value={slide.caption ?? ''} onChange={(e) => setSlide(index, { caption: e.target.value })} /></label>
            <label className="admin-field"><span>{tI18n("Optional link URL", { defaultValue: "Optional link URL" })}</span><input type="url" value={slide.link_url ?? ''} onChange={(e) => setSlide(index, { link_url: e.target.value || null })} /></label>
          </article>)}
          {!story.slides.length && <p className="admin-empty">{tI18n("Add at least one slide before publishing.", { defaultValue: "Add at least one slide before publishing." })}</p>}
        </div>
        <div className="content-form-actions">
          <button type="button" className="admin-button admin-button--secondary" disabled={!story.slides.length} onClick={() => setPreviewOpen(true)}>{tI18n("Preview story", { defaultValue: "Preview story" })}</button>
          <button type="button" className="admin-button admin-button--secondary" onClick={() => setStory(null)}>{tI18n("Cancel", { defaultValue: "Cancel" })}</button>
          <button type="submit" className="admin-button admin-button--primary" disabled={saving || !hasPermission('web-stories', story.id ? 'edit' : 'create') || (story.status === 'published' && !hasPermission('web-stories', 'publish'))}>{saving ? 'Saving…' : story.status === 'published' ? 'Save & publish' : 'Save draft'}</button>
        </div>
      </form>}
      {previewOpen && story && <StoryPreview story={story} onClose={() => setPreviewOpen(false)} />}
      {confirmation && <ConfirmAction confirmation={confirmation} busy={saving} onCancel={() => setConfirmation(null)} onConfirm={() => confirmation.type === 'delete' ? deleteStory() : persist(true)} />}
    </section>
  );
}

function StoryPreview({ story, onClose }) {
  const { t: tI18n } = useTranslation('admin');
  const [index, setIndex] = useState(0);
  const slide = story.slides[index];
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setIndex((current) => Math.min(current + 1, story.slides.length - 1));
      if (event.key === 'ArrowLeft') setIndex((current) => Math.max(current - 1, 0));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [story.slides.length, onClose]);
  return (
    <div className="admin-dialog-backdrop">
      <section className="admin-dialog story-preview-dialog" role="dialog" aria-modal="true" aria-label={tI18n("Web story preview", { defaultValue: "Web story preview" })}>
        <div className="story-preview-frame"><img src={slide.image_url} alt={slide.alt_text} /><div><strong>{story.title}</strong>{slide.caption && <p>{slide.caption}</p>}</div></div>
        <div className="story-preview-controls"><button type="button" className="admin-button admin-button--secondary" disabled={!index} onClick={() => setIndex((value) => value - 1)}>{tI18n("Previous", { defaultValue: "Previous" })}</button><span>{tI18n("Slide", { defaultValue: "Slide" })} {index + 1} {tI18n("of", { defaultValue: "of" })} {story.slides.length}</span><button type="button" className="admin-button admin-button--secondary" disabled={index === story.slides.length - 1} onClick={() => setIndex((value) => value + 1)}>{tI18n("Next", { defaultValue: "Next" })}</button><button type="button" className="admin-button admin-button--danger" onClick={onClose}>{tI18n("Close", { defaultValue: "Close" })}</button></div>
      </section>
    </div>
  );
}

const emptyHero = () => ({ title: '', description: '', image_url: '', alt_text: '', destination_url: '', article_id: null, display_order: 0, status: 'draft' });

export function AdminHeroSliderPage() {
  const { t: tI18n } = useTranslation('admin');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [reload, setReload] = useState(0);
  const [hero, setHero] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const { hasPermission } = useAdminPermissions();
  const fetchList = useCallback((options) => getAdminHeroSlides(options), []);
  const list = usePagedList(fetchList, { q: query, status, reload });

  async function save(confirm = false) {
    if (!hero) return;
    const previousStatus = list.result.data.find((item) => item.id === hero.id)?.status;
    if ((hero.status === 'published' || previousStatus === 'published') && previousStatus !== hero.status && !confirm) {
      const publishing = hero.status === 'published';
      setConfirmation({ type: 'save', title: `${publishing ? 'Publish' : 'Unpublish'} this hero slide?`, message: publishing ? 'The slide will appear in the homepage featured area.' : 'The slide will be removed from the homepage.', confirmLabel: publishing ? 'Publish' : 'Unpublish' }); return;
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const { id, ...payload } = hero;
      payload.description = payload.description || null;
      payload.destination_url = payload.destination_url || null;
      const result = id ? await updateAdminHeroSlide(id, payload) : await createAdminHeroSlide(payload);
      setHero(result); setNotice(tI18n("Hero slide saved successfully.", { defaultValue: "Hero slide saved successfully." })); setReload((value) => value + 1);
    } catch (failure) { setError(failure.message); }
    finally { setSaving(false); setConfirmation(null); }
  }
  async function remove() {
    setSaving(true);
    try { await deleteAdminHeroSlide(confirmation.id); setHero(null); setNotice(tI18n("Hero slide deleted.", { defaultValue: "Hero slide deleted." })); setReload((value) => value + 1); }
    catch (failure) { setError(failure.message); }
    finally { setSaving(false); setConfirmation(null); }
  }

  return <section className="admin-content-management">
    <PageHeader eyebrow="Content & media" title={tI18n("Hero Slider", { defaultValue: "Hero Slider" })} description="Manage the ordered, published slides shown in the existing homepage featured area."
      action={hasPermission('hero-slider', 'create') && <button type="button" className="admin-button admin-button--primary" onClick={() => setHero(emptyHero())}>{tI18n("New slide", { defaultValue: "New slide" })}</button>} />
    {notice && <p className="admin-alert admin-alert--success" role="status">{notice}</p>}{error && <AdminError message={error} />}
    <SearchAndFilters query={query} setQuery={(value) => { setQuery(value); list.setPage(1); }} status={status} setStatus={(value) => { setStatus(value); list.setPage(1); }} />
    {list.loading && <AdminLoading label="Loading hero slides…" />}{list.error && <AdminError message={list.error} />}
    {!list.loading && !list.error && !list.result.data.length && <AdminEmpty title={tI18n("No hero slides", { defaultValue: "No hero slides" })} message="Published slides replace the homepage’s article-led featured visual; when none are published, the current featured article remains." />}
    {list.result.data.length > 0 && <div className="content-card-grid">{list.result.data.map((item) => <article className="content-preview-card" key={item.id}>
      <img src={item.image_url} alt={item.alt_text} /><div><StatusBadge status={item.status} /><h2>{item.title}</h2><p>{item.description}</p><small>{tI18n("Order", { defaultValue: "Order" })} {item.display_order}</small>
        <div className="content-actions"><button className="admin-button admin-button--secondary" type="button" disabled={!hasPermission('hero-slider', 'edit')} onClick={() => setHero(item)}>{tI18n("Edit", { defaultValue: "Edit" })}</button>
          {hasPermission('hero-slider', 'delete') && <button className="admin-button admin-button--danger" type="button" onClick={() => setConfirmation({ type: 'delete', id: item.id, title: 'Delete hero slide?', message: 'This slide will be removed from homepage management.', confirmLabel: 'Delete' })}>{tI18n("Delete", { defaultValue: "Delete" })}</button>}</div></div>
    </article>)}</div>}
    <Pager pagination={list.result.pagination} page={list.page} setPage={list.setPage} />
    {hero && <form className="content-editor-panel" onSubmit={(event) => { event.preventDefault(); save(); }}>
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">{hero.id ? 'Edit slide' : 'New slide'}</span><h2>{tI18n("Slide details", { defaultValue: "Slide details" })}</h2></div><button type="button" className="admin-link-button" onClick={() => setHero(null)}>{tI18n("Close editor", { defaultValue: "Close editor" })}</button></div>
      <div className="content-form-grid">
        <label className="admin-field"><span>{tI18n("Headline", { defaultValue: "Headline" })}</span><input required maxLength={255} value={hero.title} onChange={(e) => setHero({ ...hero, title: e.target.value })} /></label>
        <label className="admin-field"><span>{tI18n("Display order", { defaultValue: "Display order" })}</span><input type="number" min="0" max="100000" required value={hero.display_order} onChange={(e) => setHero({ ...hero, display_order: Number(e.target.value) })} /></label>
        <label className="admin-field content-form-wide"><span>{tI18n("Short description", { defaultValue: "Short description" })}</span><textarea maxLength={1000} value={hero.description ?? ''} onChange={(e) => setHero({ ...hero, description: e.target.value })} /></label>
        <div className="content-form-wide"><ImagePickerField label="Image URL" required value={hero.image_url} onChange={(value) => setHero({ ...hero, image_url: value })} altLabel="Alternative text" altValue={hero.alt_text} onAltChange={(value) => setHero({ ...hero, alt_text: value })} /></div>
        <label className="admin-field"><span>{tI18n("Destination URL (optional)", { defaultValue: "Destination URL (optional)" })}</span><input type="url" value={hero.destination_url ?? ''} onChange={(e) => setHero({ ...hero, destination_url: e.target.value || null, article_id: null })} /></label>
        <label className="admin-field"><span>{tI18n("Published article ID (optional)", { defaultValue: "Published article ID (optional)" })}</span><input type="number" min="1" value={hero.article_id ?? ''} onChange={(e) => setHero({ ...hero, article_id: e.target.value ? Number(e.target.value) : null, destination_url: null })} /></label>
        <label className="admin-field"><span>{tI18n("Publication", { defaultValue: "Publication" })}</span><select value={hero.status} onChange={(e) => setHero({ ...hero, status: e.target.value })}><option value="draft">{tI18n("Draft", { defaultValue: "Draft" })}</option><option value="published">{tI18n("Published", { defaultValue: "Published" })}</option></select></label>
      </div>
      <div className="content-form-actions"><button type="button" className="admin-button admin-button--secondary" onClick={() => setHero(null)}>{tI18n("Cancel", { defaultValue: "Cancel" })}</button><button className="admin-button admin-button--primary" disabled={saving || !hasPermission('hero-slider', hero.id ? 'edit' : 'create') || (hero.status === 'published' && !hasPermission('hero-slider', 'publish'))}>{saving ? 'Saving…' : hero.status === 'published' ? 'Save & publish' : 'Save draft'}</button></div>
    </form>}
    {confirmation && <ConfirmAction confirmation={confirmation} busy={saving} onCancel={() => setConfirmation(null)} onConfirm={() => confirmation.type === 'delete' ? remove() : save(true)} />}
  </section>;
}

const VIDEO_CATEGORIES = ['Events', 'Startup Stories', 'Interviews', 'Founder Stories', 'Industry Insights', 'Innovation', 'Ecosystem Updates'];
const emptyVideo = () => ({ title: '', description: '', source_url: '', thumbnail_url: '', thumbnail_alt: '', thumbnail_is_custom: false, category: VIDEO_CATEGORIES[0], is_featured: false, display_order: 0, status: 'draft' });

export function AdminVideosPage() {
  const { t: tI18n } = useTranslation('admin');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [featured, setFeatured] = useState('');
  const [reload, setReload] = useState(0);
  const [video, setVideo] = useState(null);
  const [previewVideo, setPreviewVideo] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const { hasPermission } = useAdminPermissions();
  const fetchList = useCallback((options) => getAdminVideos(options), []);
  const list = usePagedList(fetchList, {
    q: query,
    status,
    category,
    featured: featured === '' ? undefined : featured === 'true',
    reload
  });

  async function save(confirm = false) {
    if (!video) return;
    const previousStatus = list.result.data.find((item) => item.id === video.id)?.status;
    if ((video.status === 'published' || previousStatus === 'published') && previousStatus !== video.status && !confirm) {
      const publishing = video.status === 'published';
      setConfirmation({
        type: 'save',
        title: `${publishing ? 'Publish' : 'Unpublish'} this video?`,
        message: publishing ? 'The video will be visible on the public Videos page.' : 'The video will be removed from public listings.',
        confirmLabel: publishing ? 'Publish' : 'Unpublish'
      });
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { id } = video;
      const payload = {
        title: video.title,
        description: video.description || null,
        source_url: video.source_url,
        thumbnail_url: video.thumbnail_is_custom ? video.thumbnail_url : null,
        thumbnail_alt: video.thumbnail_is_custom ? video.thumbnail_alt || null : null,
        category: video.category,
        is_featured: Boolean(video.is_featured),
        display_order: video.display_order,
        status: video.status
      };
      const saved = id ? await updateAdminVideo(id, payload) : await createAdminVideo(payload);
      setVideo(saved);
      setNotice(tI18n("Video saved successfully.", { defaultValue: "Video saved successfully." }));
      setReload((value) => value + 1);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
      setConfirmation(null);
    }
  }

  async function changeStatus(targetStatus) {
    setSaving(true);
    setError("");
    try {
      await updateAdminVideo(confirmation.video.id, { status: targetStatus });
      setNotice(targetStatus === 'published' ? 'Video published.' : 'Video unpublished.');
      setReload((value) => value + 1);
      if (video?.id === confirmation.video.id) setVideo((current) => ({ ...current, status: targetStatus }));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
      setConfirmation(null);
    }
  }

  async function remove() {
    setSaving(true);
    setError("");
    try {
      await deleteAdminVideo(confirmation.id);
      if (video?.id === confirmation.id) setVideo(null);
      setNotice(tI18n("Video deleted.", { defaultValue: "Video deleted." }));
      setReload((value) => value + 1);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
      setConfirmation(null);
    }
  }

  function updateSource(sourceUrl) {
    setVideo((current) => ({
      ...current,
      source_url: sourceUrl,
      ...(!current.thumbnail_is_custom
        ? { thumbnail_url: '' }
        : {})
    }));
  }

  const editorPreview = video ? {
    ...video,
    embed_url: getYouTubeEmbedUrl(video.source_url),
    thumbnail_url: video.thumbnail_is_custom
      ? video.thumbnail_url
      : getYouTubeThumbnailUrl(video.source_url)
  } : null;

  return <section className="admin-content-management">
    <PageHeader eyebrow="Content & media" title={tI18n("Video & Media", { defaultValue: "Video & Media" })} description="Manage YouTube videos, editorial details, and public publishing."
      action={hasPermission('video-media', 'create') && <button type="button" className="admin-button admin-button--primary" onClick={() => setVideo(emptyVideo())}>{tI18n("Add video", { defaultValue: "Add video" })}</button>} />
    {notice && <p className="admin-alert admin-alert--success" role="status">{notice}</p>}
    {error && <AdminError message={error} />}
    <div className="video-admin-summary" aria-label={tI18n("Video overview", { defaultValue: "Video overview" })}>
      {[
        ['Total videos', list.result.summary?.total ?? 0],
        ['Published', list.result.summary?.published ?? 0],
        ['Drafts', list.result.summary?.drafts ?? 0],
        ['Featured', list.result.summary?.featured ?? 0]
      ].map(([label, count]) => <div className="video-admin-stat" key={label}><span>{label}</span><strong>{count}</strong></div>)}
    </div>
    <SearchAndFilters query={query} setQuery={(value) => { setQuery(value); list.setPage(1); }} status={status} setStatus={(value) => { setStatus(value); list.setPage(1); }}>
      <label className="admin-field"><span>{tI18n("Category", { defaultValue: "Category" })}</span><select value={category} onChange={(event) => { setCategory(event.target.value); list.setPage(1); }}>
        <option value="">{tI18n("All categories", { defaultValue: "All categories" })}</option>{VIDEO_CATEGORIES.map((name) => <option value={name} key={name}>{name}</option>)}
      </select></label>
      <label className="admin-field"><span>{tI18n("Featured", { defaultValue: "Featured" })}</span><select value={featured} onChange={(event) => { setFeatured(event.target.value); list.setPage(1); }}>
        <option value="">{tI18n("All videos", { defaultValue: "All videos" })}</option><option value="true">{tI18n("Featured only", { defaultValue: "Featured only" })}</option><option value="false">{tI18n("Not featured", { defaultValue: "Not featured" })}</option>
      </select></label>
    </SearchAndFilters>
    {list.loading && <AdminLoading label="Loading videos…" />}
    {list.error && <AdminError message={list.error} />}
    {!list.loading && !list.error && !list.result.data.length && <AdminEmpty title={tI18n("No videos found", { defaultValue: "No videos found" })} message="Add a YouTube video or adjust your search and filters. No sample content is included." />}
    {list.result.data.length > 0 && <div className="content-card-grid">{list.result.data.map((item) => <article className="content-preview-card video-preview-card" key={item.id}>
      <AdminVideoPreview video={item} />
      <div>
        <StatusBadge status={item.status} />
        <h2>{item.title}</h2>
        <p>{item.description}</p>
        <small>{item.category} {tI18n("·", { defaultValue: "·" })} {item.is_featured ? 'Featured · ' : ''}{tI18n("Updated", { defaultValue: "Updated" })} {new Date(item.updated_at).toLocaleDateString()}</small>
        <div className="content-actions">
          <button type="button" className="admin-button admin-button--secondary" disabled={!hasPermission('video-media', 'view')} onClick={() => setPreviewVideo(item)}>{tI18n("Preview", { defaultValue: "Preview" })}</button>
          <button type="button" className="admin-button admin-button--secondary" disabled={!hasPermission('video-media', 'edit')} onClick={() => setVideo(item)}>{tI18n("Edit", { defaultValue: "Edit" })}</button>
          {item.status === 'draft' && hasPermission('video-media', 'publish') && <button type="button" className="admin-button admin-button--primary" onClick={() => setConfirmation({ type: 'status', video: item, title: 'Publish this video?', message: 'The video will appear on the public Videos page.', confirmLabel: 'Publish' })}>{tI18n("Publish", { defaultValue: "Publish" })}</button>}
          {item.status === 'published' && hasPermission('video-media', 'edit') && <button type="button" className="admin-button admin-button--secondary" onClick={() => setConfirmation({ type: 'status', video: item, title: 'Unpublish this video?', message: 'The video will be removed from public listings.', confirmLabel: 'Unpublish' })}>{tI18n("Unpublish", { defaultValue: "Unpublish" })}</button>}
          {hasPermission('video-media', 'delete') && <button type="button" className="admin-button admin-button--danger" onClick={() => setConfirmation({ type: 'delete', id: item.id, title: 'Delete video?', message: 'This video record will be permanently removed.', confirmLabel: 'Delete' })}>{tI18n("Delete", { defaultValue: "Delete" })}</button>}
        </div>
      </div>
    </article>)}</div>}
    <Pager pagination={list.result.pagination} page={list.page} setPage={list.setPage} />
    {video && <form className="content-editor-panel" onSubmit={(event) => { event.preventDefault(); save(); }}>
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">{video.id ? 'Edit video' : 'New video'}</span><h2>{tI18n("Video details", { defaultValue: "Video details" })}</h2></div><button type="button" className="admin-link-button" onClick={() => setVideo(null)}>{tI18n("Close editor", { defaultValue: "Close editor" })}</button></div>
      <div className="content-form-grid">
        <label className="admin-field"><span>{tI18n("Title", { defaultValue: "Title" })}</span><input required maxLength={255} value={video.title} onChange={(event) => setVideo({ ...video, title: event.target.value })} /></label>
        <label className="admin-field"><span>{tI18n("YouTube URL", { defaultValue: "YouTube URL" })}</span><input required type="url" value={video.source_url} onChange={(event) => updateSource(event.target.value)} placeholder={tI18n("https://www.youtube.com/watch?v=…", { defaultValue: "https://www.youtube.com/watch?v=…" })} /></label>
        <label className="admin-field content-form-wide"><span>{tI18n("Description", { defaultValue: "Description" })}</span><textarea maxLength={10000} value={video.description ?? ''} onChange={(event) => setVideo({ ...video, description: event.target.value })} /></label>
        <label className="admin-field"><span>{tI18n("Category", { defaultValue: "Category" })}</span><select required value={video.category ?? ''} onChange={(event) => setVideo({ ...video, category: event.target.value })}>
          <option value="">{tI18n("Choose category", { defaultValue: "Choose category" })}</option>{VIDEO_CATEGORIES.map((name) => <option value={name} key={name}>{name}</option>)}
        </select></label>
        <label className="admin-field"><span>{tI18n("Display order", { defaultValue: "Display order" })}</span><input type="number" min="0" max="100000" required value={video.display_order} onChange={(event) => setVideo({ ...video, display_order: Number(event.target.value) })} /></label>
        <div className="content-form-wide video-thumbnail-field">
          <div className="admin-panel-heading"><div><span className="admin-eyebrow">{tI18n("Thumbnail", { defaultValue: "Thumbnail" })}</span><h3>{video.thumbnail_is_custom ? 'Custom thumbnail selected' : 'YouTube thumbnail will be used'}</h3></div></div>
          <p>{tI18n("Choose an image from the existing Media Library to replace the automatically generated YouTube thumbnail.", { defaultValue: "Choose an image from the existing Media Library to replace the automatically generated YouTube thumbnail." })}</p>
          {editorPreview.thumbnail_url && <img className="content-image-preview" src={editorPreview.thumbnail_url} alt={video.thumbnail_alt || ''} />}
          <div className="content-actions">
            <button type="button" className="admin-button admin-button--secondary" disabled={!hasPermission('media-library', 'view')} onClick={() => setConfirmation({ type: 'thumbnail-picker', title: 'Choose a thumbnail', message: '', confirmLabel: 'Close' })}>{tI18n("Choose from Media Library", { defaultValue: "Choose from Media Library" })}</button>
            {video.thumbnail_is_custom && <button type="button" className="admin-button admin-button--secondary" onClick={() => setVideo({ ...video, thumbnail_url: '', thumbnail_alt: '', thumbnail_is_custom: false })}>{tI18n("Use YouTube thumbnail", { defaultValue: "Use YouTube thumbnail" })}</button>}
          </div>
          {video.thumbnail_is_custom && <label className="admin-field"><span>{tI18n("Thumbnail alternative text", { defaultValue: "Thumbnail alternative text" })}</span><input maxLength={255} value={video.thumbnail_alt ?? ''} onChange={(event) => setVideo({ ...video, thumbnail_alt: event.target.value })} /></label>}
          {video.source_url && !getYouTubeVideoId(video.source_url) && <p className="admin-form-error">{tI18n("Enter a supported HTTPS YouTube URL to preview the video.", { defaultValue: "Enter a supported HTTPS YouTube URL to preview the video." })}</p>}
        </div>
        <label className="admin-field"><span>{tI18n("Publication", { defaultValue: "Publication" })}</span><select value={video.status} onChange={(event) => setVideo({ ...video, status: event.target.value })}><option value="draft">{tI18n("Draft", { defaultValue: "Draft" })}</option><option value="published" disabled={!hasPermission('video-media', 'publish')}>{tI18n("Published", { defaultValue: "Published" })}</option></select></label>
        <label className="admin-toggle-field"><input type="checkbox" checked={Boolean(video.is_featured)} onChange={(event) => setVideo({ ...video, is_featured: event.target.checked })} /><span><strong>{tI18n("Featured video", { defaultValue: "Featured video" })}</strong><small>{tI18n("Include this video in the featured area on the Videos page.", { defaultValue: "Include this video in the featured area on the Videos page." })}</small></span></label>
        {editorPreview.embed_url && <div className="content-form-wide"><h3>{tI18n("Preview", { defaultValue: "Preview" })}</h3><AdminVideoPreview video={editorPreview} /></div>}
      </div>
      <div className="content-form-actions"><button type="button" className="admin-button admin-button--secondary" onClick={() => setVideo(null)}>{tI18n("Cancel", { defaultValue: "Cancel" })}</button><button className="admin-button admin-button--primary" disabled={saving || !hasPermission('video-media', video.id ? 'edit' : 'create') || (video.status === 'published' && !hasPermission('video-media', 'publish'))}>{saving ? 'Saving…' : video.status === 'published' ? 'Save & publish' : 'Save draft'}</button></div>
    </form>}
    {previewVideo && <div className="admin-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewVideo(null); }}>
      <section className="admin-preview-dialog video-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="video-preview-title">
        <header className="admin-preview-bar"><strong id="video-preview-title">{tI18n("Video preview ·", { defaultValue: "Video preview ·" })} {previewVideo.title}</strong><button type="button" className="admin-button admin-button--secondary" onClick={() => setPreviewVideo(null)}>{tI18n("Close preview", { defaultValue: "Close preview" })}</button></header>
        <AdminVideoPreview video={previewVideo} />
      </section>
    </div>}
    {confirmation?.type === 'thumbnail-picker' && <MediaLibraryPicker
      onClose={() => setConfirmation(null)}
      onSelect={(asset) => {
        setVideo((current) => ({ ...current, thumbnail_url: asset.secure_url, thumbnail_alt: current.title, thumbnail_is_custom: true }));
        setConfirmation(null);
      }}
    />}
    {confirmation && confirmation.type !== 'thumbnail-picker' && <ConfirmAction
      confirmation={confirmation}
      busy={saving}
      onCancel={() => setConfirmation(null)}
      onConfirm={() => confirmation.type === 'delete'
        ? remove()
        : confirmation.type === 'status'
          ? changeStatus(confirmation.video.status === 'published' ? 'draft' : 'published')
          : save(true)}
    />}
  </section>;
}
