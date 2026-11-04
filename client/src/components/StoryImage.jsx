import { useState } from 'react';
import { usePublicPreferences } from '../contexts/PublicPreferencesContext.jsx';

const posterArtworkSlugs = new Set(['biobridge']);

export default function StoryImage({
  src,
  alt,
  className = '',
  priority = false,
  articleSlug
}) {
  const { translate: t } = usePublicPreferences();
  const [failed, setFailed] = useState(false);
  const [preserveFullImage, setPreserveFullImage] = useState(false);

  if (!src || failed) {
    return (
      <div className={`story-image-fallback ${className}`} role="img" aria-label={alt || t('Image unavailable')}>
        <span aria-hidden="true">StartupTN</span>
        <small>Stories shaping tomorrow</small>
      </div>
    );
  }

  return (
    <img
      className={className}
      src={src}
      alt={alt || ''}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      data-image-fit={preserveFullImage ? 'contain' : undefined}
      onLoad={(event) => {
        const { naturalWidth, naturalHeight } = event.currentTarget;
        setPreserveFullImage(
          posterArtworkSlugs.has(articleSlug) || naturalWidth / naturalHeight >= 2.05
        );
      }}
      onError={() => setFailed(true)}
    />
  );
}
