import { useEffect, useState } from 'react';
import { usePublicPreferences } from '../contexts/PublicPreferencesContext.jsx';

export default function NewsSearch({ initialValue = '', onSearch }) {
  const { translate: t } = usePublicPreferences();
  const [value, setValue] = useState(initialValue);

  useEffect(() => setValue(initialValue), [initialValue]);

  function submit(event) {
    event.preventDefault();
    onSearch(value.trim());
  }

  return (
    <form className="news-search" role="search" onSubmit={submit}>
      <label className="sr-only" htmlFor="news-search">{t('Search by headline or summary')}</label>
      <input
        id="news-search"
        type="search"
        placeholder={t('Search headlines and summaries')}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button className="button button--dark" type="submit">{t('Search')}</button>
    </form>
  );
}
