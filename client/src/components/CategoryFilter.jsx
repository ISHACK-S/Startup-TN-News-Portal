import { usePublicPreferences } from '../contexts/PublicPreferencesContext.jsx';

export default function CategoryFilter({ categories, selected, onChange, disabled = false }) {
  const { translate: t } = usePublicPreferences();
  return (
    <div className="category-filter" aria-label={t('Filter by category')}>
      <button
        className={`category-chip${selected === '' ? ' category-chip--active' : ''}`}
        type="button"
        aria-pressed={selected === ''}
        disabled={disabled}
        onClick={() => onChange('')}
      >
        {t('All stories')}
      </button>
      {categories.map((category) => (
        <button
          className={`category-chip${selected === category.slug ? ' category-chip--active' : ''}`}
          type="button"
          aria-pressed={selected === category.slug}
          disabled={disabled}
          key={category.id ?? category.slug}
          onClick={() => onChange(category.slug)}
        >
          {t(category.name)}
        </button>
      ))}
    </div>
  );
}
