import { Link } from 'react-router-dom';
import { usePublicPreferences } from '../contexts/PublicPreferencesContext.jsx';

export default function Brand({ compact = false }) {
  const { translate: t } = usePublicPreferences();
  return (
    <Link className={`brand${compact ? ' brand--compact' : ''}`} to="/" aria-label={`${t('Home')} · StartupTN News`}>
      <span className="brand-copy">
        <span className="brand-name">Startup<span>TN</span><i>News</i></span>
        {!compact && <span className="brand-descriptor">{t('TAMIL NADU’S STARTUP & BUSINESS DESK')}</span>}
      </span>
    </Link>
  );
}
