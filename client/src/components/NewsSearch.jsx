import { useEffect, useState } from 'react';

export default function NewsSearch({ initialValue = '', onSearch }) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => setValue(initialValue), [initialValue]);

  function submit(event) {
    event.preventDefault();
    onSearch(value.trim());
  }

  return (
    <form className="news-search" role="search" onSubmit={submit}>
      <label className="sr-only" htmlFor="news-search">Search by headline or summary</label>
      <input
        id="news-search"
        type="search"
        placeholder="Search headlines and summaries"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button className="button button--dark" type="submit">Search</button>
    </form>
  );
}
