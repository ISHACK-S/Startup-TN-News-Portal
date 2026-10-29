import { useState } from 'react';

export default function StoryImage({ src, alt, className = '', priority = false }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={`story-image-fallback ${className}`} role="img" aria-label={alt || 'Image unavailable'}>
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
      onError={() => setFailed(true)}
    />
  );
}
