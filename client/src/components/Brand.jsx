import { Link } from 'react-router-dom';
import { usePublicPreferences } from '../contexts/PublicPreferencesContext.jsx';

export default function Brand({ compact = false }) {
  const { translate: t, siteConfiguration } = usePublicPreferences();
  const { branding, footer } = siteConfiguration;
  const name = compact ? (footer.websiteName || branding.websiteName) : branding.websiteName;
  const logoUrl = compact
    ? (footer.logoUrl || branding.footerLogoUrl || branding.logoUrl || '/logo.png')
    : '/logo.png';

  return (
    <Link className={`brand${compact ? ' brand--compact' : ''}`} to="/" aria-label={`${t('Home')} · ${name}`}>
      <span className="brand-lockup">
        {logoUrl && (
          <img className={`brand-logo${compact ? ' brand-logo--compact' : ''}`} src={logoUrl} alt={name} />
        )}
        {compact && <span className="brand-news">NEWS</span>}
      </span>
      <span className="brand-tagline">TAMILNADU'S STARTUP AND BUSINESS DESK</span>
    </Link>
  );
}
