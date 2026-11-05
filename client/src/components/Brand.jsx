import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { usePublicPreferences } from '../contexts/PublicPreferencesContext.jsx';

export default function Brand({ compact = false }) {
  const { t: tI18n } = useTranslation('public');
  const { translate: t, siteConfiguration } = usePublicPreferences();
  const { branding, footer } = siteConfiguration;
  const logoUrl = compact
    ? (footer.logoUrl || branding.footerLogoUrl || branding.logoUrl)
    : branding.logoUrl;
  const name = compact ? (footer.websiteName || branding.websiteName) : branding.websiteName;
  return (
    <Link className={`brand${compact ? ' brand--compact' : ''}`} to="/" aria-label={`${t('Home')} · ${name}`}>
      {logoUrl ? (
        <img className="brand-logo" src={logoUrl} alt={name} />
      ) : (
        <span className="brand-copy">
          <span className="brand-name">
            {name === 'StartupTN News'
              ? <>{tI18n("Startup", { defaultValue: "Startup" })}<span>{tI18n("TN", { defaultValue: "TN" })}</span><i>{tI18n("News", { defaultValue: "News" })}</i></>
              : name}
          </span>
          {!compact && (
            <span className="brand-descriptor">
              {branding.tagline || t('TAMIL NADU’S STARTUP & BUSINESS DESK')}
            </span>
          )}
        </span>
      )}
    </Link>
  );
}
