import { Link } from 'react-router-dom';
import { usePublicPreferences } from '../contexts/PublicPreferencesContext.jsx';

export default function NotFoundPage() {
  const { translate: t } = usePublicPreferences();
  return (
    <div className="site-shell not-found">
      <span className="eyebrow">{t('404 · Story not found')}</span>
      <h1>{t('This page is off the record.')}</h1>
      <p>{t('The story may have moved, or the address might be incomplete.')}</p>
      <Link className="button button--red" to="/">{t('Return to the front page')}</Link>
    </div>
  );
}
