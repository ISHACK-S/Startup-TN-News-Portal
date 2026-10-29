export function formatDate(value) {
  if (!value) return 'Recently published';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently published';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

export default function ArticleMeta({ article, light = false }) {
  return (
    <div className={`article-meta${light ? ' article-meta--light' : ''}`}>
      {article.category_name && <span className="meta-category">{article.category_name}</span>}
      <span>{formatDate(article.published_at || article.created_at)}</span>
    </div>
  );
}
