import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="site-shell not-found">
      <span className="eyebrow">404 · Story not found</span>
      <h1>This page is off the record.</h1>
      <p>The story may have moved, or the address might be incomplete.</p>
      <Link className="button button--red" to="/">Return to the front page</Link>
    </div>
  );
}
