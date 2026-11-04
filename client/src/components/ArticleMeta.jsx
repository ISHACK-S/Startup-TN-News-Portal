import { usePublicPreferences } from '../contexts/PublicPreferencesContext.jsx';

export function formatDate(value, language = 'en') {
  if (!value) return language === 'ta' ? 'சமீபத்தில் வெளியிடப்பட்டது' : 'Recently published';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return language === 'ta' ? 'சமீபத்தில் வெளியிடப்பட்டது' : 'Recently published';
  return new Intl.DateTimeFormat(language === 'ta' ? 'ta-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date);
}

export default function ArticleMeta({ article, light = false }) {
  const { language, translate: t } = usePublicPreferences();
  return (
    <div className={`article-meta${light ? ' article-meta--light' : ''}`}>
      {article.category_name && <span className="meta-category">{t(article.category_name)}</span>}
      <span>{formatDate(article.published_at || article.created_at, language)}</span>
    </div>
  );
}
