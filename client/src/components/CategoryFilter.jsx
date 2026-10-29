export default function CategoryFilter({ categories, selected, onChange, disabled = false }) {
  return (
    <div className="category-filter" aria-label="Filter by category">
      <button
        className={`category-chip${selected === '' ? ' category-chip--active' : ''}`}
        type="button"
        aria-pressed={selected === ''}
        disabled={disabled}
        onClick={() => onChange('')}
      >
        All stories
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
          {category.name}
        </button>
      ))}
    </div>
  );
}
