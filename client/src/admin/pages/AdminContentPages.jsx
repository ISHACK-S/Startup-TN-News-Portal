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

const EMPTY_PAGE = { page: 1, total: 0, totalPages: 0 };

function usePagedList(fetchList, { q, status, format, provider, reload }) {
  const [result, setResult] = useState({ data: [], pagination: EMPTY_PAGE });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchList({ page, limit: 12, q: q.trim(), status, format, provider, signal: controller.signal })
      .then(setResult)
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [fetchList, page, q, status, format, provider, reload]);
  return { result, page, setPage, loading, error, setError, setResult };
}

function PageHeader({ eyebrow, title, description, action }) {
  return (
    <header className="admin-page-heading content-page-heading">
      <div><span className="admin-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
      {action}
    </header>
  );
}

function SearchAndFilters({ query, setQuery, status, setStatus, children }) {
  return (
    <div className="content-toolbar">
      <label className="admin-field content-search"><span>Search</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles or details" /></label>
      {setStatus && (
        <label className="admin-field"><span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option><option value="draft">Draft</option><option value="published">Published</option>
          </select>
        </label>
      )}
      {children}
    </div>
  );
}

function Pager({ pagination, page, setPage }) {
  if (!pagination?.totalPages || pagination.totalPages < 2) return null;
  return (
    <nav className="content-pager" aria-label="Pagination">
      <button type="button" className="admin-button admin-button--secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
      <span>Page {page} of {pagination.totalPages} · {pagination.total} items</span>
      <button type="button" className="admin-button admin-button--secondary" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
    </nav>
  );
}

function StatusBadge({ status }) {
  return <span className={`content-status content-status--${status}`}>{status}</span>;
}

function AdminVideoPreview({ video }) {
  const [loaded, setLoaded] = useState(false);
  if (!loaded) {
    return <button type="button" className="admin-video-poster" onClick={() => setLoaded(true)} aria-label={`Load preview for ${video.title}`}>
      {video.thumbnail_url ? <img src={video.thumbnail_url} alt={video.thumbnail_alt || ''} loading="lazy" /> : <span>Load video preview</span>}
      <span aria-hidden="true">▶</span>
    </button>;
  }
  return <iframe title={`Preview: ${video.title}`} src={video.embed_url} loading="lazy" sandbox="allow-scripts allow-same-origin allow-presentation" allow="encrypted-media; picture-in-picture" allowFullScreen />;
}

function ImagePickerField({ label, value, onChange, altLabel, altValue, onAltChange, required = false, altRequired = true }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div className="content-image-field">
      <label className="admin-field"><span>{label}</span><input type="url" required={required} value={value ?? ''} onChange={(event) => onChange(event.target.value)} placeholder="https://…" /></label>
      <button type="button" className="admin-button admin-button--secondary" onClick={() => setPickerOpen(true)}>Choose from Media Library</button>
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
    setNotice('');
    setError('');
    setUploading(true);
    try {
      await uploadMediaImage(file);
      setNotice('Image uploaded and added to the Media Library.');
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
      setNotice('Secure image URL copied.');
    } catch {
      setError('The URL could not be copied. Select and copy it from the asset details.');
      setSelected(asset);
    }
  }

  return (
    <section className="admin-content-management">
      <PageHeader eyebrow="Content & media" title="Media Library" description="Browse and reuse image assets uploaded to the StartupTN News Cloudinary account."
        action={hasPermission('media-library', 'create') && <label className="admin-button admin-button--primary content-upload-button">
          {uploading ? 'Uploading…' : 'Upload image'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={upload} />
        </label>} />
      {notice && <p className="admin-alert admin-alert--success" role="status">{notice}</p>}
      {error && <AdminError message={error} />}
      <SearchAndFilters query={query} setQuery={(value) => { setQuery(value); setPage(1); }}>
        <label className="admin-field"><span>Format</span><select value={format} onChange={(event) => { setFormat(event.target.value); setPage(1); }}>
          <option value="">All formats</option><option value="jpg">JPEG</option><option value="jpeg">JPEG</option><option value="png">PNG</option><option value="webp">WebP</option>
        </select></label>
        <div className="content-view-switch" aria-label="Media view">
          <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>Grid</button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button>
        </div>
      </SearchAndFilters>
      {loading && <AdminLoading label="Loading media assets…" />}
      {!loading && !error && !result.data.length && <AdminEmpty title="No indexed images yet" message="Images uploaded through the existing admin uploader appear here. Historic Cloudinary uploads are not automatically backfilled." />}
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
                  <button type="button" className="admin-button admin-button--secondary" onClick={() => setSelected(asset)}>Details</button>
                  <button type="button" className="admin-button admin-button--secondary" onClick={() => copyUrl(asset)}>Copy URL</button>
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
            <span className="admin-eyebrow">Media asset</span><h2 id="media-details-title">{selected.original_filename || 'Image preview'}</h2>
            <img src={selected.secure_url} alt={selected.original_filename || ''} />
            <dl><dt>Type</dt><dd>{selected.resource_type} / {selected.format || 'unknown'}</dd>
              <dt>Dimensions</dt><dd>{selected.width && selected.height ? `${selected.width} × ${selected.height}px` : 'Not available'}</dd>
              <dt>Size</dt><dd>{selected.bytes ? `${(selected.bytes / 1024).toFixed(1)} KB` : 'Not available'}</dd>
              <dt>URL</dt><dd><input readOnly value={selected.secure_url} aria-label="Secure asset URL" /></dd>
              <dt>Uploaded</dt><dd>{new Date(selected.created_at).toLocaleString()}</dd></dl>
            <div className="admin-dialog-actions"><button type="button" className="admin-button admin-button--secondary" onClick={() => setSelected(null)}>Close</button><button type="button" className="admin-button admin-button--primary" onClick={() => copyUrl(selected)}>Copy URL</button></div>
          </section>
        </div>
      )}
    </section>
  );
}

const emptyStory = () => ({ title: '', slug: '', description: '', status: 'draft', slides: [] });

export function AdminWebStoriesPage() {
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
    setLoadingStory(true); setError(''); setNotice('');
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
    setSaving(true); setError(''); setNotice('');
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
      setStory(null); setConfirmation(null); setNotice('Story deleted.'); setReload((value) => value + 1);
    } catch (failure) { setError(failure.message); }
    finally { setSaving(false); }
  }

  function setSlide(index, changes) {
    setStory((current) => ({ ...current, slides: current.slides.map((slide, i) => i === index ? { ...slide, ...changes } : slide) }));
  }

  return (
    <section className="admin-content-management">
      <PageHeader eyebrow="Content & media" title="Web Stories" description="Create visual stories with ordered slides, accessible image descriptions, and optional links."
        action={hasPermission('web-stories', 'create') && <button className="admin-button admin-button--primary" type="button" onClick={() => { setStory(emptyStory()); setError(''); setNotice(''); }}>New story</button>} />
      {notice && <p className="admin-alert admin-alert--success" role="status">{notice}</p>}
      {error && <AdminError message={error} />}
      <SearchAndFilters query={query} setQuery={(value) => { setQuery(value); list.setPage(1); }} status={status} setStatus={(value) => { setStatus(value); list.setPage(1); }} />
      {list.loading && <AdminLoading label="Loading web stories…" />}
      {list.error && <AdminError message={list.error} />}
      {!list.loading && !list.error && !list.result.data.length && <AdminEmpty title="No web stories found" message="Create a story and add its slides to get started." />}
      {!list.loading && list.result.data.length > 0 && <div className="content-table-wrap"><table className="content-table">
        <thead><tr><th>Story</th><th>Slides</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
        <tbody>{list.result.data.map((item) => <tr key={item.id}>
          <td><strong>{item.title}</strong><small>/{item.slug}</small></td><td>Open to manage</td><td><StatusBadge status={item.status} /></td>
          <td>{new Date(item.updated_at).toLocaleDateString()}</td><td><button type="button" className="admin-button admin-button--secondary" disabled={!hasPermission('web-stories', 'edit')} onClick={() => edit(item.id)}>Edit</button>
            {hasPermission('web-stories', 'delete') && <button type="button" className="admin-button admin-button--danger" onClick={() => setConfirmation({ type: 'delete', id: item.id, title: 'Delete this story?', message: 'The story and its slides will be permanently removed.', confirmLabel: 'Delete' })}>Delete</button>}</td>
        </tr>)}</tbody>
      </table></div>}
      <Pager pagination={list.result.pagination} page={list.page} setPage={list.setPage} />
      {loadingStory && <AdminLoading label="Loading story…" />}
      {story && <form className="content-editor-panel" onSubmit={(event) => { event.preventDefault(); persist(); }}>
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">{story.id ? 'Edit story' : 'New story'}</span><h2>{story.title || 'Story details'}</h2></div>
          <button type="button" className="admin-link-button" onClick={() => setStory(null)}>Close editor</button></div>
        <div className="content-form-grid">
          <label className="admin-field"><span>Title</span><input required maxLength={180} value={story.title} onChange={(e) => setStory({ ...story, title: e.target.value })} /></label>
          <label className="admin-field"><span>Slug</span><input required maxLength={200} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={story.slug} onChange={(e) => setStory({ ...story, slug: e.target.value })} /></label>
          <label className="admin-field content-form-wide"><span>Description</span><textarea maxLength={500} value={story.description ?? ''} onChange={(e) => setStory({ ...story, description: e.target.value })} /></label>
          <label className="admin-field"><span>Publication</span><select value={story.status} onChange={(e) => setStory({ ...story, status: e.target.value })}><option value="draft">Draft</option><option value="published">Published</option></select></label>
        </div>
        <div className="admin-panel-heading"><div><span className="admin-eyebrow">Story sequence</span><h3>Slides ({story.slides.length})</h3></div>
          <button type="button" className="admin-button admin-button--secondary" onClick={() => setStory({ ...story, slides: [...story.slides, { image_url: '', alt_text: '', caption: '', link_url: '' }] })}>Add slide</button></div>
        <div className="story-slide-editor">
          {story.slides.map((slide, index) => <article className="story-slide-form" key={`${story.id ?? 'new'}-${index}`}>
            <header><strong>Slide {index + 1}</strong><div className="content-actions">
              <button type="button" className="admin-button admin-button--secondary" disabled={!index} aria-label={`Move slide ${index + 1} up`} onClick={() => {
                const slides = [...story.slides]; [slides[index - 1], slides[index]] = [slides[index], slides[index - 1]]; setStory({ ...story, slides });
              }}>↑</button>
              <button type="button" className="admin-button admin-button--secondary" disabled={index === story.slides.length - 1} aria-label={`Move slide ${index + 1} down`} onClick={() => {
                const slides = [...story.slides]; [slides[index + 1], slides[index]] = [slides[index], slides[index + 1]]; setStory({ ...story, slides });
              }}>↓</button>
              <button type="button" className="admin-button admin-button--danger" onClick={() => setStory({ ...story, slides: story.slides.filter((_, i) => i !== index) })}>Remove</button>
            </div></header>
            <ImagePickerField label="Image URL" required value={slide.image_url} onChange={(value) => setSlide(index, { image_url: value })} altLabel="Alternative text" altValue={slide.alt_text} onAltChange={(value) => setSlide(index, { alt_text: value })} />
            <label className="admin-field"><span>Caption</span><textarea maxLength={500} value={slide.caption ?? ''} onChange={(e) => setSlide(index, { caption: e.target.value })} /></label>
            <label className="admin-field"><span>Optional link URL</span><input type="url" value={slide.link_url ?? ''} onChange={(e) => setSlide(index, { link_url: e.target.value || null })} /></label>
          </article>)}
          {!story.slides.length && <p className="admin-empty">Add at least one slide before publishing.</p>}
        </div>
        <div className="content-form-actions">
          <button type="button" className="admin-button admin-button--secondary" disabled={!story.slides.length} onClick={() => setPreviewOpen(true)}>Preview story</button>
          <button type="button" className="admin-button admin-button--secondary" onClick={() => setStory(null)}>Cancel</button>
          <button type="submit" className="admin-button admin-button--primary" disabled={saving || !hasPermission('web-stories', story.id ? 'edit' : 'create') || (story.status === 'published' && !hasPermission('web-stories', 'publish'))}>{saving ? 'Saving…' : story.status === 'published' ? 'Save & publish' : 'Save draft'}</button>
        </div>
      </form>}
      {previewOpen && story && <StoryPreview story={story} onClose={() => setPreviewOpen(false)} />}
      {confirmation && <ConfirmAction confirmation={confirmation} busy={saving} onCancel={() => setConfirmation(null)} onConfirm={() => confirmation.type === 'delete' ? deleteStory() : persist(true)} />}
    </section>
  );
}

function StoryPreview({ story, onClose }) {
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
      <section className="admin-dialog story-preview-dialog" role="dialog" aria-modal="true" aria-label="Web story preview">
        <div className="story-preview-frame"><img src={slide.image_url} alt={slide.alt_text} /><div><strong>{story.title}</strong>{slide.caption && <p>{slide.caption}</p>}</div></div>
        <div className="story-preview-controls"><button type="button" className="admin-button admin-button--secondary" disabled={!index} onClick={() => setIndex((value) => value - 1)}>Previous</button><span>Slide {index + 1} of {story.slides.length}</span><button type="button" className="admin-button admin-button--secondary" disabled={index === story.slides.length - 1} onClick={() => setIndex((value) => value + 1)}>Next</button><button type="button" className="admin-button admin-button--danger" onClick={onClose}>Close</button></div>
      </section>
    </div>
  );
}

const emptyHero = () => ({ title: '', description: '', image_url: '', alt_text: '', destination_url: '', article_id: null, display_order: 0, status: 'draft' });

export function AdminHeroSliderPage() {
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
    setSaving(true); setError(''); setNotice('');
    try {
      const { id, ...payload } = hero;
      payload.description = payload.description || null;
      payload.destination_url = payload.destination_url || null;
      const result = id ? await updateAdminHeroSlide(id, payload) : await createAdminHeroSlide(payload);
      setHero(result); setNotice('Hero slide saved successfully.'); setReload((value) => value + 1);
    } catch (failure) { setError(failure.message); }
    finally { setSaving(false); setConfirmation(null); }
  }
  async function remove() {
    setSaving(true);
    try { await deleteAdminHeroSlide(confirmation.id); setHero(null); setNotice('Hero slide deleted.'); setReload((value) => value + 1); }
    catch (failure) { setError(failure.message); }
    finally { setSaving(false); setConfirmation(null); }
  }

  return <section className="admin-content-management">
    <PageHeader eyebrow="Content & media" title="Hero Slider" description="Manage the ordered, published slides shown in the existing homepage featured area."
      action={hasPermission('hero-slider', 'create') && <button type="button" className="admin-button admin-button--primary" onClick={() => setHero(emptyHero())}>New slide</button>} />
    {notice && <p className="admin-alert admin-alert--success" role="status">{notice}</p>}{error && <AdminError message={error} />}
    <SearchAndFilters query={query} setQuery={(value) => { setQuery(value); list.setPage(1); }} status={status} setStatus={(value) => { setStatus(value); list.setPage(1); }} />
    {list.loading && <AdminLoading label="Loading hero slides…" />}{list.error && <AdminError message={list.error} />}
    {!list.loading && !list.error && !list.result.data.length && <AdminEmpty title="No hero slides" message="Published slides replace the homepage’s article-led featured visual; when none are published, the current featured article remains." />}
    {list.result.data.length > 0 && <div className="content-card-grid">{list.result.data.map((item) => <article className="content-preview-card" key={item.id}>
      <img src={item.image_url} alt={item.alt_text} /><div><StatusBadge status={item.status} /><h2>{item.title}</h2><p>{item.description}</p><small>Order {item.display_order}</small>
        <div className="content-actions"><button className="admin-button admin-button--secondary" type="button" disabled={!hasPermission('hero-slider', 'edit')} onClick={() => setHero(item)}>Edit</button>
          {hasPermission('hero-slider', 'delete') && <button className="admin-button admin-button--danger" type="button" onClick={() => setConfirmation({ type: 'delete', id: item.id, title: 'Delete hero slide?', message: 'This slide will be removed from homepage management.', confirmLabel: 'Delete' })}>Delete</button>}</div></div>
    </article>)}</div>}
    <Pager pagination={list.result.pagination} page={list.page} setPage={list.setPage} />
    {hero && <form className="content-editor-panel" onSubmit={(event) => { event.preventDefault(); save(); }}>
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">{hero.id ? 'Edit slide' : 'New slide'}</span><h2>Slide details</h2></div><button type="button" className="admin-link-button" onClick={() => setHero(null)}>Close editor</button></div>
      <div className="content-form-grid">
        <label className="admin-field"><span>Headline</span><input required maxLength={255} value={hero.title} onChange={(e) => setHero({ ...hero, title: e.target.value })} /></label>
        <label className="admin-field"><span>Display order</span><input type="number" min="0" max="100000" required value={hero.display_order} onChange={(e) => setHero({ ...hero, display_order: Number(e.target.value) })} /></label>
        <label className="admin-field content-form-wide"><span>Short description</span><textarea maxLength={1000} value={hero.description ?? ''} onChange={(e) => setHero({ ...hero, description: e.target.value })} /></label>
        <div className="content-form-wide"><ImagePickerField label="Image URL" required value={hero.image_url} onChange={(value) => setHero({ ...hero, image_url: value })} altLabel="Alternative text" altValue={hero.alt_text} onAltChange={(value) => setHero({ ...hero, alt_text: value })} /></div>
        <label className="admin-field"><span>Destination URL (optional)</span><input type="url" value={hero.destination_url ?? ''} onChange={(e) => setHero({ ...hero, destination_url: e.target.value || null, article_id: null })} /></label>
        <label className="admin-field"><span>Published article ID (optional)</span><input type="number" min="1" value={hero.article_id ?? ''} onChange={(e) => setHero({ ...hero, article_id: e.target.value ? Number(e.target.value) : null, destination_url: null })} /></label>
        <label className="admin-field"><span>Publication</span><select value={hero.status} onChange={(e) => setHero({ ...hero, status: e.target.value })}><option value="draft">Draft</option><option value="published">Published</option></select></label>
      </div>
      <div className="content-form-actions"><button type="button" className="admin-button admin-button--secondary" onClick={() => setHero(null)}>Cancel</button><button className="admin-button admin-button--primary" disabled={saving || !hasPermission('hero-slider', hero.id ? 'edit' : 'create') || (hero.status === 'published' && !hasPermission('hero-slider', 'publish'))}>{saving ? 'Saving…' : hero.status === 'published' ? 'Save & publish' : 'Save draft'}</button></div>
    </form>}
    {confirmation && <ConfirmAction confirmation={confirmation} busy={saving} onCancel={() => setConfirmation(null)} onConfirm={() => confirmation.type === 'delete' ? remove() : save(true)} />}
  </section>;
}

const emptyVideo = () => ({ title: '', description: '', source_url: '', thumbnail_url: '', thumbnail_alt: '', category: '', display_order: 0, status: 'draft' });

export function AdminVideosPage() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [provider, setProvider] = useState('');
  const [reload, setReload] = useState(0);
  const [video, setVideo] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const { hasPermission } = useAdminPermissions();
  const fetchList = useCallback((options) => getAdminVideos(options), []);
  const list = usePagedList(fetchList, { q: query, status, provider, reload });
  async function save(confirm = false) {
    if (!video) return;
    const previousStatus = list.result.data.find((item) => item.id === video.id)?.status;
    if ((video.status === 'published' || previousStatus === 'published') && previousStatus !== video.status && !confirm) {
      const publishing = video.status === 'published';
      setConfirmation({ type: 'save', title: `${publishing ? 'Publish' : 'Unpublish'} this video?`, message: publishing ? 'The video will be visible on the public media page.' : 'The video will be removed from the public media page.', confirmLabel: publishing ? 'Publish' : 'Unpublish' }); return;
    }
    setSaving(true); setError(''); setNotice('');
    try {
      const { id, ...payload } = video;
      payload.description = payload.description || null;
      payload.thumbnail_url = payload.thumbnail_url || null;
      payload.thumbnail_alt = payload.thumbnail_alt || null;
      payload.category = payload.category || null;
      const saved = id ? await updateAdminVideo(id, payload) : await createAdminVideo(payload);
      setVideo(saved); setNotice('Video entry saved successfully.'); setReload((value) => value + 1);
    }
    catch (failure) { setError(failure.message); }
    finally { setSaving(false); setConfirmation(null); }
  }
  async function remove() {
    setSaving(true);
    try { await deleteAdminVideo(confirmation.id); setVideo(null); setNotice('Video entry deleted.'); setReload((value) => value + 1); }
    catch (failure) { setError(failure.message); }
    finally { setSaving(false); setConfirmation(null); }
  }
  return <section className="admin-content-management">
    <PageHeader eyebrow="Content & media" title="Video & Media" description="Manage public video entries using validated YouTube or Vimeo URLs and safe provider embeds."
      action={hasPermission('video-media', 'create') && <button type="button" className="admin-button admin-button--primary" onClick={() => setVideo(emptyVideo())}>New video</button>} />
    {notice && <p className="admin-alert admin-alert--success" role="status">{notice}</p>}{error && <AdminError message={error} />}
    <SearchAndFilters query={query} setQuery={(value) => { setQuery(value); list.setPage(1); }} status={status} setStatus={(value) => { setStatus(value); list.setPage(1); }}>
      <label className="admin-field"><span>Provider</span><select value={provider} onChange={(event) => { setProvider(event.target.value); list.setPage(1); }}>
        <option value="">All providers</option><option value="youtube">YouTube</option><option value="vimeo">Vimeo</option>
      </select></label>
    </SearchAndFilters>
    {list.loading && <AdminLoading label="Loading videos…" />}{list.error && <AdminError message={list.error} />}
    {!list.loading && !list.error && !list.result.data.length && <AdminEmpty title="No video entries" message="Add a real video source to publish it. No sample content is included." />}
    {list.result.data.length > 0 && <div className="content-card-grid">{list.result.data.map((item) => <article className="content-preview-card video-preview-card" key={item.id}>
      <AdminVideoPreview video={item} />
      <div><StatusBadge status={item.status} /><h2>{item.title}</h2><p>{item.description}</p><small>{item.provider} · Order {item.display_order}</small>
        <div className="content-actions"><button type="button" className="admin-button admin-button--secondary" disabled={!hasPermission('video-media', 'edit')} onClick={() => setVideo(item)}>Edit</button>
          {hasPermission('video-media', 'delete') && <button type="button" className="admin-button admin-button--danger" onClick={() => setConfirmation({ type: 'delete', id: item.id, title: 'Delete video entry?', message: 'This video record will be permanently removed.', confirmLabel: 'Delete' })}>Delete</button>}</div></div>
    </article>)}</div>}
    <Pager pagination={list.result.pagination} page={list.page} setPage={list.setPage} />
    {video && <form className="content-editor-panel" onSubmit={(event) => { event.preventDefault(); save(); }}>
      <div className="admin-panel-heading"><div><span className="admin-eyebrow">{video.id ? 'Edit video' : 'New video'}</span><h2>Video details</h2></div><button type="button" className="admin-link-button" onClick={() => setVideo(null)}>Close editor</button></div>
      <div className="content-form-grid">
        <label className="admin-field"><span>Title</span><input required maxLength={255} value={video.title} onChange={(e) => setVideo({ ...video, title: e.target.value })} /></label>
        <label className="admin-field"><span>Video source URL</span><input required type="url" value={video.source_url} onChange={(e) => setVideo({ ...video, source_url: e.target.value })} placeholder="https://youtu.be/…" /></label>
        <label className="admin-field content-form-wide"><span>Description</span><textarea maxLength={10000} value={video.description ?? ''} onChange={(e) => setVideo({ ...video, description: e.target.value })} /></label>
        <div className="content-form-wide"><ImagePickerField label="Poster image URL (optional)" value={video.thumbnail_url} onChange={(value) => setVideo({ ...video, thumbnail_url: value || null })} altLabel="Poster alternative text" altValue={video.thumbnail_alt} altRequired={false} onAltChange={(value) => setVideo({ ...video, thumbnail_alt: value || null })} /></div>
        <label className="admin-field"><span>Category (optional)</span><input maxLength={100} value={video.category ?? ''} onChange={(e) => setVideo({ ...video, category: e.target.value || null })} /></label>
        <label className="admin-field"><span>Display order</span><input type="number" min="0" max="100000" required value={video.display_order} onChange={(e) => setVideo({ ...video, display_order: Number(e.target.value) })} /></label>
        <label className="admin-field"><span>Publication</span><select value={video.status} onChange={(e) => setVideo({ ...video, status: e.target.value })}><option value="draft">Draft</option><option value="published">Published</option></select></label>
      </div>
      <div className="content-form-actions"><button type="button" className="admin-button admin-button--secondary" onClick={() => setVideo(null)}>Cancel</button><button className="admin-button admin-button--primary" disabled={saving || !hasPermission('video-media', video.id ? 'edit' : 'create') || (video.status === 'published' && !hasPermission('video-media', 'publish'))}>{saving ? 'Saving…' : video.status === 'published' ? 'Save & publish' : 'Save draft'}</button></div>
    </form>}
    {confirmation && <ConfirmAction confirmation={confirmation} busy={saving} onCancel={() => setConfirmation(null)} onConfirm={() => confirmation.type === 'delete' ? remove() : save(true)} />}
  </section>;
}
