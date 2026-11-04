import { useEffect, useState } from 'react';
import { getAdminMediaAssets } from '../../api/admin.js';
import { AdminError, AdminLoading } from './AdminStates.jsx';

export default function MediaLibraryPicker({ onSelect, onClose }) {
  const [assets, setAssets] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getAdminMediaAssets({ page: 1, limit: 12, q: query.trim(), signal: controller.signal })
      .then((result) => setAssets(result.data))
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query]);

  return (
    <div className="admin-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="admin-dialog media-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="media-picker-title">
        <div className="admin-panel-heading">
          <div><span className="admin-eyebrow">Media Library</span><h2 id="media-picker-title">Choose an image</h2></div>
          <button type="button" className="admin-button admin-button--secondary" onClick={onClose}>Close</button>
        </div>
        <label className="admin-field media-picker-search">
          <span>Search by file name</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        {loading && <AdminLoading label="Loading media…" />}
        {error && <AdminError message={error} />}
        {!loading && !error && !assets.length && (
          <p className="admin-empty">No indexed images yet. Upload an image in Media Library first.</p>
        )}
        {!loading && !error && assets.length > 0 && (
          <div className="media-picker-grid">
            {assets.map((asset) => (
              <button
                type="button"
                key={asset.id}
                className="media-picker-item"
                onClick={() => onSelect(asset)}
              >
                <img src={asset.secure_url} alt="" loading="lazy" />
                <span>{asset.original_filename || asset.cloudinary_public_id}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
