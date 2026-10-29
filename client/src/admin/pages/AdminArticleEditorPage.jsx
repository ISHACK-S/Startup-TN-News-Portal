import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { createAdminArticle, getAdminArticle, updateAdminArticle } from '../../api/admin.js';
import { uploadImage } from '../../api/client.js';
import ArticleMeta from '../../components/ArticleMeta.jsx';
import StoryImage from '../../components/StoryImage.jsx';
import { AdminError, AdminLoading } from '../components/AdminStates.jsx';
import { getCategories } from '../../api/news.js';

const EMPTY_ARTICLE = {
  title: '',
  slug: '',
  summary: '',
  content: '',
  cover_image_url: null,
  source_url: null,
  category_id: '',
  author_name: '',
  is_featured: false
};
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function slugify(value) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 280);
}

function formatValidationError(error) {
  if (!error.details?.length) return error.message;
  return error.details.map((detail) => `${detail.path || 'Article'}: ${detail.message}`).join(' ');
}

export default function AdminArticleEditorPage() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const [article, setArticle] = useState(EMPTY_ARTICLE);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [slugTouched, setSlugTouched] = useState(isEditing);
  const [localPreview, setLocalPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!localPreview) return undefined;
    return () => URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setNotice(location.state?.notice ?? '');

    Promise.all([
      getCategories({ signal: controller.signal }),
      isEditing ? getAdminArticle(id, { signal: controller.signal }) : Promise.resolve(null)
    ])
      .then(([availableCategories, existingArticle]) => {
        setCategories(availableCategories);
        if (existingArticle) {
          setArticle({
            title: existingArticle.title,
            slug: existingArticle.slug,
            summary: existingArticle.summary,
            content: existingArticle.content,
            cover_image_url: existingArticle.cover_image_url,
            source_url: existingArticle.source_url,
            category_id: existingArticle.category_id,
            author_name: existingArticle.author_name,
            is_featured: Boolean(existingArticle.is_featured),
            status: existingArticle.status
          });
          setSlugTouched(true);
        } else {
          setArticle((current) => ({
            ...EMPTY_ARTICLE,
            category_id: current.category_id || availableCategories[0]?.id || ''
          }));
          setSlugTouched(false);
        }
      })
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setError(loadError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [id, isEditing, attempt]);

  const previewArticle = useMemo(() => ({
    ...article,
    category_name: categories.find((category) => Number(category.id) === Number(article.category_id))?.name,
    published_at: article.status === 'published' ? new Date().toISOString() : null,
    created_at: new Date().toISOString(),
    cover_image_url: localPreview || article.cover_image_url
  }), [article, categories, localPreview]);

  function updateField(field, value) {
    setArticle((current) => ({ ...current, [field]: value }));
    setNotice('');
  }

  async function handleImageChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploadError('');
    setUploadMessage('');
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setUploadError('Choose a JPEG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setUploadError('Images must be 5 MB or smaller.');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setLocalPreview(previewUrl);
    setUploadProgress(0);
    setUploading(true);
    try {
      const uploaded = await uploadImage(file, setUploadProgress);
      updateField('cover_image_url', uploaded.url);
      setUploadMessage('Image uploaded and ready to save with this article.');
    } catch (uploadFailure) {
      setUploadError(uploadFailure.message);
    } finally {
      setUploading(false);
    }
  }

  function removeCoverImage() {
    setLocalPreview('');
    updateField('cover_image_url', null);
    setUploadMessage('');
    setUploadError('');
  }

  async function saveArticle(status) {
    if (!formRef.current?.reportValidity()) return;
    setError('');
    setNotice('');
    setSaving(true);
    const payload = {
      title: article.title.trim(),
      slug: article.slug.trim(),
      summary: article.summary.trim(),
      content: article.content.trim(),
      cover_image_url: article.cover_image_url || null,
      source_url: article.source_url?.trim() || null,
      category_id: Number(article.category_id),
      author_name: article.author_name.trim(),
      is_featured: Boolean(article.is_featured),
      status
    };

    try {
      const saved = isEditing
        ? await updateAdminArticle(id, payload)
        : await createAdminArticle(payload);
      setArticle((current) => ({ ...current, ...payload }));
      setNotice(status === 'published' ? 'Article published successfully.' : 'Draft saved successfully.');
      if (!isEditing) {
        navigate(`/admin/news/${saved.id}/edit`, {
          replace: true,
          state: { notice: status === 'published' ? 'Article published successfully.' : 'Draft saved successfully.' }
        });
      }
    } catch (saveError) {
      setError(formatValidationError(saveError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <AdminLoading label={isEditing ? 'Loading article…' : 'Preparing editor…'} />;

  return (
    <div className="admin-page admin-editor-page">
      <div className="admin-page-heading admin-editor-heading">
        <div>
          <Link className="admin-back-link" to="/admin/news">← Articles</Link>
          <span className="admin-eyebrow">{isEditing ? 'Refine and publish' : 'Create a new story'}</span>
          <h1>{isEditing ? 'Edit article' : 'New article'}</h1>
          <p>Clear reporting starts with a strong headline and reliable source.</p>
        </div>
        <div className="admin-editor-top-actions">
          <button
            type="button"
            className="admin-button admin-button--secondary"
            onClick={() => setPreviewOpen(true)}
            disabled={!article.title.trim()}
          >
            Preview
          </button>
        </div>
      </div>

      {notice && <div className="admin-alert admin-alert--success" role="status">{notice}</div>}
      {error && <AdminError message={error} onRetry={() => setAttempt((value) => value + 1)} />}

      <form ref={formRef} className="admin-editor-form" onSubmit={(event) => event.preventDefault()}>
        <div className="admin-editor-main">
          <section className="admin-panel admin-editor-fields">
            <label className="admin-field">
              <span>Headline <b aria-hidden="true">*</b></span>
              <input
                type="text"
                required
                maxLength={255}
                placeholder="Write a clear, specific headline"
                value={article.title}
                onChange={(event) => {
                  const title = event.target.value;
                  setArticle((current) => ({
                    ...current,
                    title,
                    ...(!slugTouched ? { slug: slugify(title) } : {})
                  }));
                }}
              />
              <small>Keep it concise and focused on the news.</small>
            </label>

            <label className="admin-field">
              <span>Article URL slug <b aria-hidden="true">*</b></span>
              <div className="admin-slug-input">
                <span>/news/</span>
                <input
                  type="text"
                  required
                  maxLength={280}
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  value={article.slug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    updateField('slug', event.target.value);
                  }}
                />
              </div>
              <small>Lowercase letters, numbers and hyphens. Must be unique.</small>
            </label>

            <label className="admin-field">
              <span>Summary <b aria-hidden="true">*</b></span>
              <textarea
                required
                rows={3}
                maxLength={10000}
                placeholder="A short introduction for article cards and search results"
                value={article.summary}
                onChange={(event) => updateField('summary', event.target.value)}
              />
              <small>{article.summary.length} characters</small>
            </label>

            <label className="admin-field">
              <span>Full article <b aria-hidden="true">*</b></span>
              <textarea
                className="admin-content-editor"
                required
                rows={17}
                placeholder="Write the full story. Add context, quotes and verified details."
                value={article.content}
                onChange={(event) => updateField('content', event.target.value)}
              />
              <small>Plain text paragraphs are preserved in the article preview.</small>
            </label>
          </section>
        </div>

        <aside className="admin-editor-sidebar">
          <section className="admin-panel admin-publish-panel">
            <div className="admin-panel-heading">
              <div><span className="admin-eyebrow">Publication</span><h2>Ready to share?</h2></div>
            </div>
            {isEditing && <p className="admin-current-status">Current status: <strong>{article.status === 'published' ? 'Published' : 'Draft'}</strong></p>}
            <button
              type="button"
              className="admin-button admin-button--secondary admin-full-button"
              disabled={saving || uploading}
              onClick={() => saveArticle('draft')}
            >
              {saving ? 'Saving…' : isEditing && article.status === 'published' ? 'Unpublish' : 'Save draft'}
            </button>
            <button
              type="button"
              className="admin-button admin-button--primary admin-full-button"
              disabled={saving || uploading}
              onClick={() => saveArticle('published')}
            >
              {saving ? 'Saving…' : article.status === 'published' ? 'Save & publish' : 'Publish article'}
            </button>
            <p className="admin-publish-note">Publishing makes this article visible on the public news site.</p>
          </section>

          <section className="admin-panel admin-side-fields">
            <div className="admin-panel-heading"><div><span className="admin-eyebrow">Story details</span><h2>Metadata</h2></div></div>
            <label className="admin-field">
              <span>Category <b aria-hidden="true">*</b></span>
              <select
                required
                value={article.category_id}
                onChange={(event) => updateField('category_id', event.target.value)}
              >
                <option value="" disabled>Select a category</option>
                {categories.map((category) => (
                  <option value={category.id} key={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>Author name <b aria-hidden="true">*</b></span>
              <input
                type="text"
                required
                maxLength={150}
                value={article.author_name}
                onChange={(event) => updateField('author_name', event.target.value)}
                placeholder="Byline"
              />
            </label>
            <label className="admin-field">
              <span>Source URL</span>
              <input
                type="url"
                value={article.source_url ?? ''}
                onChange={(event) => updateField('source_url', event.target.value || null)}
                placeholder="https://"
              />
            </label>
            <label className="admin-featured-toggle">
              <input
                type="checkbox"
                checked={article.is_featured}
                onChange={(event) => updateField('is_featured', event.target.checked)}
              />
              <span><strong>Feature this story</strong><small>Give it prominence on the front page.</small></span>
            </label>
          </section>

          <section className="admin-panel admin-cover-panel">
            <div className="admin-panel-heading"><div><span className="admin-eyebrow">Visual</span><h2>Cover image</h2></div></div>
            {(localPreview || article.cover_image_url) && (
              <div className="admin-cover-preview">
                <StoryImage src={localPreview || article.cover_image_url} alt="Cover image preview" />
                <button type="button" className="admin-cover-remove" onClick={removeCoverImage}>Remove image</button>
              </div>
            )}
            <label className="admin-upload-zone">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Choose cover image"
                disabled={uploading}
                onChange={handleImageChange}
              />
              <span className="admin-upload-icon" aria-hidden="true">＋</span>
              <strong>{uploading ? 'Uploading image…' : 'Choose an image'}</strong>
              <small>JPEG, PNG or WebP · up to 5 MB</small>
            </label>
            {uploading && (
              <div className="admin-upload-progress" role="status" aria-live="polite">
                <div><span>Uploading</span><span>{uploadProgress}%</span></div>
                <progress max="100" value={uploadProgress}>{uploadProgress}%</progress>
              </div>
            )}
            {uploadMessage && <p className="admin-upload-success" role="status">{uploadMessage}</p>}
            {uploadError && <p className="admin-form-error" role="alert">{uploadError}</p>}
          </section>
        </aside>
      </form>

      {previewOpen && (
        <ArticlePreview
          article={previewArticle}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}

function ArticlePreview({ article, onClose }) {
  return (
    <div className="admin-dialog-backdrop admin-preview-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="admin-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="preview-title">
        <header className="admin-preview-bar">
          <span><strong>Preview</strong> · unsaved editorial changes</span>
          <button className="admin-button admin-button--secondary" type="button" onClick={onClose}>Close preview</button>
        </header>
        <article className="admin-preview-article">
          <span className="admin-eyebrow">StartupTN News · Preview</span>
          {article.cover_image_url && (
            <StoryImage className="admin-preview-image" src={article.cover_image_url} alt={article.title} />
          )}
          <ArticleMeta article={article} />
          <h1 id="preview-title">{article.title || 'Your headline will appear here'}</h1>
          <p className="admin-preview-summary">{article.summary || 'Your summary will appear here.'}</p>
          <p className="admin-preview-byline">By {article.author_name || 'Author name'}</p>
          <div className="admin-preview-content">{article.content || 'Your article content will appear here.'}</div>
          {article.source_url && <p className="admin-preview-source">Source: {article.source_url}</p>}
        </article>
      </section>
    </div>
  );
}
