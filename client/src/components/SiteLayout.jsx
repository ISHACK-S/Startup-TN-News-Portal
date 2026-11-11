import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Brand from './Brand.jsx';
import RevealSection from './RevealSection.jsx';
import LanguageSelector from './LanguageSelector.jsx';
import { usePublicPreferences } from '../contexts/PublicPreferencesContext.jsx';

const HEADER_COMPACT_AFTER = 104;
const HEADER_EXPAND_BEFORE = 12;

function PublicMenuItem({ item, language, onNavigate, activeCategory, activePath }) {
  const { t: tI18n } = useTranslation('public');
  const [expanded, setExpanded] = useState(false);
  const label = language === 'ta' ? item.labelTa : item.labelEn;
  const children = item.children ?? [];
  const isCategoryLink = item.destination.includes('category=');
  const destinationPath = item.destination.split('?')[0].replace(/\/+$/, '') || '/';
  const currentPath = activePath.replace(/\/+$/, '') || '/';
  const active = isCategoryLink
    ? activeCategory === new URLSearchParams(item.destination.split('?')[1]).get('category')
    : destinationPath === '/news' && activeCategory
      ? false
      : destinationPath === '/'
        ? currentPath === '/'
        : currentPath === destinationPath || currentPath.startsWith(`${destinationPath}/`);
  const className = `public-menu-link${active ? ' active' : ''}`;
  const link = item.destinationType === 'external'
    ? (
      <a
        className={className}
        href={item.destination}
        target={item.openInNewTab ? '_blank' : undefined}
        rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
        onClick={onNavigate}
      >
        {label}
      </a>
    )
    : (
      <Link
        className={className}
        to={item.destination}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
      >
        {label}
      </Link>
    );

  return (
    <div className={`nav-menu-entry${children.length ? ' nav-menu-entry--has-children' : ''}`}>
      <div className="nav-menu-primary">
        {link}
        {children.length > 0 && (
          <button
            type="button"
            className="nav-submenu-toggle"
            aria-label={`${expanded ? 'Hide' : 'Show'} ${label} submenu`}
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            <span aria-hidden="true">{expanded ? '−' : '+'}</span>
          </button>
        )}
      </div>
      {children.length > 0 && (
        <div className={`nav-submenu${expanded ? ' nav-submenu--open' : ''}`}>
          {children.map((child) => (
            <PublicMenuItem
              key={child.id}
              item={child}
              language={language}
              onNavigate={onNavigate}
              activeCategory={activeCategory}
              activePath={activePath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function handleBackToTop(event) {
  event.preventDefault();
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: prefersReducedMotion ? 'instant' : 'smooth'
  });
}

export default function SiteLayout() {
  const { t: tI18n } = useTranslation('public');
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const compactRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const {
    fontIndex,
    highContrast,
    theme,
    language,
    changeFontSize,
    toggleContrast,
    toggleTheme,
    translate: t,
    siteConfiguration,
    configurationError
  } = usePublicPreferences();
  const { menu, footer } = siteConfiguration;

  useEffect(() => {
    let frame = 0;
    const updateHeader = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        // Keep enough hysteresis for scroll anchoring while the header resizes.
        if (scrollY > HEADER_COMPACT_AFTER && !compactRef.current) {
          compactRef.current = true;
          setCompact(true);
        } else if (scrollY < HEADER_EXPAND_BEFORE && compactRef.current) {
          compactRef.current = false;
          setCompact(false);
        }
      });
    };
    if (window.scrollY > HEADER_COMPACT_AFTER) {
      compactRef.current = true;
      setCompact(true);
    }
    window.addEventListener('scroll', updateHeader, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', updateHeader);
    };
  }, []);

  useEffect(() => setMenuOpen(false), [location.pathname, location.search]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);
  const activeCategory = location.pathname.replace(/\/+$/, '') === '/news'
    ? new URLSearchParams(location.search).get('category')
    : null;

  function searchNews(event) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    navigate(`/news/${params.size ? `?${params}` : ''}`);
    setMenuOpen(false);
  }

  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={() => document.getElementById('main-content')?.focus()}
      >
        {t('Skip to main content')}
      </a>
      <header className={`site-header${compact ? ' site-header--compact' : ''}`}>
        {configurationError && <p className="public-config-warning" role="status">{configurationError}</p>}
        <div className="utility-bar">
          <div className="site-shell mx-auto utility-inner">
            <span className="utility-tagline">{t('Stories from the Tamil Nadu startup ecosystem')}</span>
            <AccessibilityToolbar
              fontIndex={fontIndex}
              highContrast={highContrast}
              theme={theme}
              onFontSize={changeFontSize}
              onContrast={toggleContrast}
              onTheme={toggleTheme}
              t={t}
            />
            <span className="utility-date">{new Intl.DateTimeFormat(language === 'ta' ? 'ta-IN' : 'en-IN', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            }).format(new Date())}</span>
          </div>
        </div>
        <div className="masthead-band">
          <div className="masthead site-shell mx-auto">
            <Brand />
            <form className="header-search" role="search" onSubmit={searchNews}>
              <label className="sr-only" htmlFor="header-search">{t('Search news')}</label>
              <input
                id="header-search"
                type="search"
                placeholder={t('Search news stories...')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button type="submit" aria-label={t('Search')}>
                <SearchIcon />
              </button>
            </form>
            <button
              type="button"
              className="menu-toggle"
              aria-expanded={menuOpen}
              aria-controls="primary-navigation"
              aria-label={t(menuOpen ? 'Close navigation menu' : 'Open navigation menu')}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MenuIcon open={menuOpen} />
            </button>
          </div>
        </div>
        <nav id="primary-navigation" className={`primary-nav${menuOpen ? ' primary-nav--open' : ''}`} aria-label={t('Main navigation')}>
          <div className="site-shell mx-auto nav-inner">
            {menu.map((item) => (
              <PublicMenuItem
                key={item.id}
                item={item}
                language={language}
                activeCategory={activeCategory}
                activePath={location.pathname}
                onNavigate={() => setMenuOpen(false)}
              />
            ))}
            <span className="nav-note">{t('A closer look at what’s next')}</span>
          </div>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      {footer.isVisible !== false && <footer className="site-footer">
        <RevealSection as="div" className="site-shell mx-auto footer-main">
          <div className="footer-publication">
            <Brand compact />
            {(language === 'ta' ? footer.descriptionTa : footer.descriptionEn) && (
              <p>{language === 'ta' ? footer.descriptionTa : footer.descriptionEn}</p>
            )}
            {(footer.email || footer.phone || (language === 'ta' ? footer.addressTa : footer.addressEn)) && (
              <address className="footer-contact">
                {footer.email && <a href={`mailto:${footer.email}`}>{footer.email}</a>}
                {footer.phone && <a href={`tel:${footer.phone.replace(/[^\d+]/g, '')}`}>{footer.phone}</a>}
                {(language === 'ta' ? footer.addressTa : footer.addressEn) && (
                  <span>{language === 'ta' ? footer.addressTa : footer.addressEn}</span>
                )}
              </address>
            )}
            {footer.socialLinks?.length > 0 && (
              <nav className="footer-social-links" aria-label={tI18n("Social media", { defaultValue: "Social media" })}>
                {footer.socialLinks.map((item) => (
                  <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer">{item.label}</a>
                ))}
              </nav>
            )}
          </div>
          {footer.groups.map((group) => (
            <div className="footer-links" key={group.id}>
              <strong>{language === 'ta' ? group.headingTa : group.headingEn}</strong>
              {group.links.map((item) => (
                item.url.startsWith('/')
                  ? <Link key={item.id} to={item.url}>{language === 'ta' ? item.labelTa : item.labelEn}</Link>
                  : (
                    <a
                      key={item.id}
                      href={item.url}
                      target={item.openInNewTab ? '_blank' : undefined}
                      rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                    >
                      {language === 'ta' ? item.labelTa : item.labelEn}
                    </a>
                  )
              ))}
            </div>
          ))}
        </RevealSection>
        <div className="footer-bottom">
          <div className="site-shell mx-auto">
            <span>{tI18n("©", { defaultValue: "©" })} {footer.dynamicYear ? new Date().getFullYear() : ''}
              {language === 'ta' ? footer.copyrightTa : footer.copyrightEn}
            </span>
            <Link to="/" onClick={handleBackToTop}>
              {t('Back to top')} <span aria-hidden="true">{tI18n("↑", { defaultValue: "↑" })}</span>
            </Link>
          </div>
        </div>
      </footer>}
    </>
  );
}

function AccessibilityToolbar({
  fontIndex,
  highContrast,
  theme,
  onFontSize,
  onContrast,
  onTheme,
  t
}) {
  const { t: tI18n } = useTranslation('public');
  return (
    <div className="accessibility-toolbar" role="group" aria-label={t('Accessibility controls')}>
      <button
        type="button"
        className="accessibility-font-button"
        aria-label={t('Decrease text size')}
        title={t('Decrease text size')}
        disabled={fontIndex === 0}
        onClick={() => onFontSize(-1)}
      >{tI18n("A−", { defaultValue: "A−" })} </button>
      <button
        type="button"
        className="accessibility-font-button accessibility-font-reset"
        aria-label={t('Reset text size')}
        title={t('Reset text size')}
        aria-pressed={fontIndex === 2}
        onClick={() => onFontSize(0)}
      >{tI18n("A", { defaultValue: "A" })} </button>
      <button
        type="button"
        className="accessibility-font-button"
        aria-label={t('Increase text size')}
        title={t('Increase text size')}
        disabled={fontIndex === 6}
        onClick={() => onFontSize(1)}
      >{tI18n("A+", { defaultValue: "A+" })} </button>
      <button
        type="button"
        className="accessibility-contrast-button"
        aria-label={t('High contrast mode')}
        aria-pressed={highContrast}
        title={t('High contrast mode')}
        onClick={onContrast}
      >
        {t('Contrast')}
      </button>
      <button
        type="button"
        className="theme-toggle-button"
        aria-label={theme === 'dark' ? t('Switch to light mode') : t('Switch to dark mode')}
        aria-pressed={theme === 'dark'}
        onClick={onTheme}
      >
        <ThemeIcon theme={theme} />
      </button>
      <LanguageSelector className="accessibility-language-button" />
    </div>
  );
}

function ThemeIcon({ theme }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      {theme === 'dark'
        ? <>
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
        : <path d="M20.2 15.4A8.5 8.5 0 0 1 8.6 3.8 8.6 8.6 0 1 0 20.2 15.4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

function SearchIcon() {
  const { t: tI18n } = useTranslation('public');
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon({ open }) {
  const { t: tI18n } = useTranslation('public');
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      {open
        ? <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        : <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}
